// src/routes/messages.ts
import { Router } from "express";
import { prisma } from "../db/client.js";
import { sendWaMessage, type OpenWaConfig } from "../openwa/client.js";

export function createMessagesRouter(waConfig: OpenWaConfig): Router {
  const router = Router();

  router.post("/:id/messages", async (req, res) => {
    const { body } = req.body as { body?: string };
    if (!body) return res.status(400).json({ error: "body is required" });

    const conversation = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conversation) return res.status(404).json({ error: "not found" });
    if (conversation.mode !== "human") {
      return res.status(409).json({ error: "conversation is not in human mode" });
    }

    try {
      const sent = await sendWaMessage(waConfig, conversation.waChatId, body);
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "out",
          sender: `agent:${req.agent!.agentId}`,
          body,
          waMessageId: sent.waMessageId
        }
      });
      res.status(201).json(message);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal server error" });
    }
  });

  return router;
}
