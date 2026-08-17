// src/ai/autoReply.ts
import { prisma } from "../db/client.js";
import type { LLMProvider, ChatMessage } from "../llm/types.js";
import { sendWaMessage, type OpenWaConfig } from "../openwa/client.js";

export async function handleAutoReply(
  conversationId: string,
  provider: LLMProvider,
  personaPrompt: string,
  waConfig: OpenWaConfig
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    const priorMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 20
    });

    const history: ChatMessage[] = priorMessages.map((m) => ({
      role: m.direction === "in" ? "user" : "assistant",
      content: m.body
    }));

    const replyText = await provider.reply(history, personaPrompt);
    const sent = await sendWaMessage(waConfig, conversation.waChatId, replyText);
    await prisma.message.create({
      data: {
        conversationId,
        direction: "out",
        sender: "ai",
        body: replyText,
        waMessageId: sent.waMessageId
      }
    });
  } catch (err) {
    console.error("handleAutoReply failed, handing off to human:", err);
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { mode: "human", needsAttention: true }
      });
    } catch (updateErr) {
      console.error("handleAutoReply: failed to hand off conversation to human:", updateErr);
    }
  }
}
