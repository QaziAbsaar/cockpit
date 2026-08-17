// src/webhooks/openwaWebhook.ts
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import type { OpenWaInboundWebhook } from "./types.js";
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

export function createOpenwaWebhookRouter(broadcast: (e: WsEvent) => void, webhookSecret: string): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const headerSecret = req.header("X-Webhook-Secret");
    if (!webhookSecret || headerSecret !== webhookSecret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const payload = req.body as OpenWaInboundWebhook;

    if (!payload.chatId || !payload.messageId) {
      return res.status(400).json({ error: "chatId and messageId are required" });
    }

    if (payload.fromMe) {
      return res.status(200).json({ ignored: true });
    }

    // Redelivery guard: OpenWA (or any webhook sender) may retry the same event.
    // If we've already recorded this waMessageId, this is a no-op redelivery.
    const existing = await prisma.message.findUnique({ where: { waMessageId: payload.messageId } });
    if (existing) {
      return res.status(200).json({ deduped: true });
    }

    let conversation;
    try {
      conversation = await prisma.conversation.upsert({
        where: { waChatId: payload.chatId },
        create: { waChatId: payload.chatId },
        update: {}
      });

      const body = payload.type === "chat" ? payload.body : "[unsupported attachment]";

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "in",
          sender: "customer",
          body,
          waMessageId: payload.messageId
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
  });

  return router;
}
