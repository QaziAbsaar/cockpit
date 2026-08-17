// src/ai/autoReply.test.ts
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { prisma } from "../db/client.js";
import { handleAutoReply } from "./autoReply.js";
import type { LLMProvider } from "../llm/types.js";

const waConfig = { baseUrl: "http://openwa.local", apiKey: "key", sessionId: "sess-1" };

afterEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("handleAutoReply", () => {
  it("sends the AI reply via OpenWA and logs it on success", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "1@c.us", mode: "ai" } });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: "in", sender: "customer", body: "What are your hours?" }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.out.1" }) })
    );

    const provider: LLMProvider = { name: "fake", reply: vi.fn().mockResolvedValue("We're open 9-5, Mon-Fri.") };

    await handleAutoReply(convo.id, provider, "You are a helpful assistant.", waConfig);

    const messages = await prisma.message.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: "asc" } });
    expect(messages).toHaveLength(2);
    expect(messages[1].sender).toBe("ai");
    expect(messages[1].body).toBe("We're open 9-5, Mon-Fri.");

    const updated = await prisma.conversation.findUnique({ where: { id: convo.id } });
    expect(updated?.mode).toBe("ai");
    expect(updated?.needsAttention).toBe(false);
  });

  it("flips the conversation to human and flags needsAttention when the provider throws", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "2@c.us", mode: "ai" } });
    await prisma.message.create({
      data: { conversationId: convo.id, direction: "in", sender: "customer", body: "Hello?" }
    });

    const provider: LLMProvider = { name: "fake", reply: vi.fn().mockRejectedValue(new Error("timeout")) };

    await handleAutoReply(convo.id, provider, "You are a helpful assistant.", waConfig);

    const updated = await prisma.conversation.findUnique({ where: { id: convo.id } });
    expect(updated?.mode).toBe("human");
    expect(updated?.needsAttention).toBe(true);

    const messages = await prisma.message.findMany({ where: { conversationId: convo.id } });
    expect(messages).toHaveLength(1);
  });
});
