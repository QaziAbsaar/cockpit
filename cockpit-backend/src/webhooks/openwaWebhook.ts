// src/webhooks/openwaWebhook.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import type { OpenWaInboundWebhook } from "./types.js";

export const openwaWebhookRouter = Router();

openwaWebhookRouter.post("/", async (req, res) => {
  const payload = req.body as OpenWaInboundWebhook;

  if (payload.fromMe) {
    return res.status(200).json({ ignored: true });
  }

  const conversation = await prisma.conversation.upsert({
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

  res.status(200).json({ conversationId: conversation.id, mode: conversation.mode });
});
