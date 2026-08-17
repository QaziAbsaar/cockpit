// src/webhooks/openwaWebhook.ts
import crypto from "node:crypto";
import express, { Router, type Request } from "express";
import { Prisma } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { prisma } from "../db/client.js";
import type { OpenWaWebhookEnvelope } from "./types.js";
import { handleAutoReply } from "../ai/autoReply.js";
import { resolveProvider } from "../llm/registry.js";
import { createDeepSeekProvider } from "../llm/providers/deepseek.js";
import { createClaudeProvider } from "../llm/providers/claude.js";
import { createOpenAIProvider } from "../llm/providers/openai.js";
import { createGoogleProvider } from "../llm/providers/google.js";
import type { WsEvent } from "../ws/hub.js";

// Runs the AI auto-reply flow detached from the HTTP response cycle. The caller
// (the webhook handler below) fires this without awaiting it so a slow/blocked LLM
// call never holds open the OpenWA webhook request. All Prisma/LLM calls inside are
// still awaited for correctness (message ordering, hand-off-to-human on failure) —
// only the HTTP response is decoupled from it.
async function runAutoReply(conversationId: string, broadcast: (e: WsEvent) => void): Promise<void> {
  try {
    const settings = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
    const provider = resolveProvider(settings, {
      deepseek: createDeepSeekProvider,
      claude: createClaudeProvider,
      openai: createOpenAIProvider,
      google: createGoogleProvider
    });
    await handleAutoReply(conversationId, provider, settings.personaPrompt, {
      baseUrl: process.env.OPENWA_BASE_URL ?? "",
      apiKey: process.env.OPENWA_API_KEY ?? "",
      sessionId: process.env.OPENWA_SESSION_ID ?? ""
    });
  } catch (err) {
    // Anything here (e.g. resolveProvider throwing with no API key configured) must not
    // crash the process or drop the customer's already-logged message — hand off to a human.
    console.error("auto-reply setup failed, handing off to human:", err);
    await prisma.conversation
      .update({ where: { id: conversationId }, data: { mode: "human", needsAttention: true } })
      .catch((updateErr) => console.error("failed to hand off conversation to human:", updateErr));
  }
  broadcast({ type: "conversation_updated", payload: { conversationId } });
}

// Raw request body captured by the json parser's verify hook below. The HMAC
// signature from OpenWA covers the exact bytes sent, so re-stringifying the
// parsed body would break verification — we must keep the original buffer.
type RawBodyRequest = Request & { rawBody?: Buffer };

// Verifies the `X-OpenWA-Signature: sha256=<hex>` header: HMAC-SHA256 of the raw
// request body keyed with the webhook secret, compared in constant time.
function hasValidSignature(secret: string, header: string | undefined, rawBody: Buffer | undefined): boolean {
  if (!header || !rawBody || !secret) return false;
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header);
  if (!match) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const provided = Buffer.from(match[1], "hex");
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

export function createOpenwaWebhookRouter(broadcast: (e: WsEvent) => void, webhookSecret: string): Router {
  const router = Router();

  // Parse JSON here (scoped to this route) rather than relying on the app-wide
  // parser so the `verify` hook can capture the raw body for signature checking.
  router.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as RawBodyRequest).rawBody = buf;
      }
    })
  );

  router.post("/", asyncHandler(async (req, res) => {
    const rawBody = (req as RawBodyRequest).rawBody;
    if (!hasValidSignature(webhookSecret, req.header("X-OpenWA-Signature"), rawBody)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const envelope = req.body as OpenWaWebhookEnvelope;
    const data = envelope?.data;

    // We only consume inbound text/attachment messages. Anything else the
    // customer registers for (acks, status, session events) is not our concern.
    if (!envelope || envelope.event !== "message.received" || !data?.id || !data.from) {
      return res.status(400).json({ error: "a message.received envelope with data.id and data.from is required" });
    }

    // Defensive, not redundant: OpenWA's own inbound projector (MessageProjector.handleInboundMessage)
    // has no fromMe gate of its own — it relies entirely on the engine only invoking it from the
    // inbound-only onMessage callback. Nothing stops a fromMe payload from reaching this webhook if
    // that contract is ever violated (a plugin's `message:received` hook mutating the field, a future
    // engine bug, etc.), so this check is load-bearing, not just belt-and-suspenders.
    if (data.fromMe) {
      return res.status(200).json({ ignored: true });
    }

    // Redelivery guard: OpenWA retries failed deliveries (default 3 attempts,
    // exponential backoff), so the same waMessageId can arrive again. If we've
    // already recorded it, this is a no-op redelivery.
    const existing = await prisma.message.findUnique({ where: { waMessageId: data.id } });
    if (existing) {
      return res.status(200).json({ deduped: true });
    }

    let conversation;
    try {
      conversation = await prisma.conversation.upsert({
        where: { waChatId: data.from },
        create: { waChatId: data.from },
        update: {}
      });

      const body = data.type === "text" ? data.body : "[unsupported attachment]";

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "in",
          sender: "customer",
          body,
          waMessageId: data.id
        }
      });
    } catch (err) {
      // A concurrent redelivery can race the findUnique check above and trip the
      // waMessageId unique constraint here instead — treat that the same as the
      // pre-check above rather than surfacing a 500 for a harmless retry.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(200).json({ deduped: true });
      }
      console.error(err);
      return res.status(500).json({ error: "internal server error" });
    }

    broadcast({ type: "new_message", payload: { conversationId: conversation.id } });

    // Respond immediately once the inbound message is durably persisted. The AI
    // auto-reply (which calls out to an LLM and to OpenWA) runs afterward, detached
    // from this request, so a slow provider never blocks the webhook response.
    res.status(200).json({ conversationId: conversation.id, mode: conversation.mode });

    if (conversation.mode === "ai") {
      runAutoReply(conversation.id, broadcast).catch((err) => console.error("auto-reply failed:", err));
    }
  }));

  return router;
}
