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

  it("sends the LLM the most recent 20 messages (not the oldest 20) in chronological order", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "3@c.us", mode: "ai" } });

    // Create 25 messages, spaced 1s apart so createdAt ordering is unambiguous. The
    // oldest 5 ("msg 0".."msg 4") must be dropped from the 20-message window sent to
    // the LLM; the most recent 20 ("msg 5".."msg 24") must be included, oldest-first.
    const base = Date.now() - 25_000;
    for (let i = 0; i < 25; i++) {
      await prisma.message.create({
        data: {
          conversationId: convo.id,
          direction: i % 2 === 0 ? "in" : "out",
          sender: i % 2 === 0 ? "customer" : "ai",
          body: `msg ${i}`,
          createdAt: new Date(base + i * 1000)
        }
      });
    }

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.out.recent" }) }));

    const provider: LLMProvider = { name: "fake", reply: vi.fn().mockResolvedValue("Sure thing.") };

    await handleAutoReply(convo.id, provider, "You are a helpful assistant.", waConfig);

    expect(provider.reply).toHaveBeenCalledTimes(1);
    const historyArg = (provider.reply as ReturnType<typeof vi.fn>).mock.calls[0][0] as { content: string }[];
    expect(historyArg).toHaveLength(20);
    expect(historyArg[0].content).toBe("msg 5");
    expect(historyArg[19].content).toBe("msg 24");
    expect(historyArg.some((m) => m.content === "msg 0")).toBe(false);
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
