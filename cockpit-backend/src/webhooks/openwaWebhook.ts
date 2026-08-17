// src/webhooks/openwaWebhook.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import type { OpenWaInboundWebhook } from "./types.js";
import { handleAutoReply } from "../ai/autoReply.js";
import { resolveProvider } from "../llm/registry.js";
import { createDeepSeekProvider } from "../llm/providers/deepseek.js";
import { createClaudeProvider } from "../llm/providers/claude.js";
import { createOpenAIProvider } from "../llm/providers/openai.js";
import { createGoogleProvider } from "../llm/providers/google.js";
import type { WsEvent } from "../ws/hub.js";

export function createOpenwaWebhookRouter(broadcast: (e: WsEvent) => void): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const payload = req.body as OpenWaInboundWebhook;

    if (!payload.chatId || !payload.messageId) {
      return res.status(400).json({ error: "chatId and messageId are required" });
    }

    if (payload.fromMe) {
      return res.status(200).json({ ignored: true });
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
      console.error(err);
      return res.status(500).json({ error: "internal server error" });
    }

    broadcast({ type: "new_message", payload: { conversationId: conversation.id } });

    if (conversation.mode === "ai") {
      try {
        const settings = await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
        const provider = resolveProvider(settings, {
          deepseek: createDeepSeekProvider,
          claude: createClaudeProvider,
          openai: createOpenAIProvider,
          google: createGoogleProvider
        });
        await handleAutoReply(conversation.id, provider, settings.personaPrompt, {
          baseUrl: process.env.OPENWA_BASE_URL ?? "",
          apiKey: process.env.OPENWA_API_KEY ?? "",
          sessionId: process.env.OPENWA_SESSION_ID ?? ""
        });
      } catch (err) {
        // Anything here (e.g. resolveProvider throwing with no API key configured) must not
        // crash the webhook or drop the customer's already-logged message — hand off to a human.
        console.error("auto-reply setup failed, handing off to human:", err);
        await prisma.conversation
          .update({ where: { id: conversation.id }, data: { mode: "human", needsAttention: true } })
          .catch((updateErr) => console.error("failed to hand off conversation to human:", updateErr));
      }
      broadcast({ type: "conversation_updated", payload: { conversationId: conversation.id } });
    }

    res.status(200).json({ conversationId: conversation.id, mode: conversation.mode });
  });

  return router;
}
