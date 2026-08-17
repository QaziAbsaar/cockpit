// src/webhooks/openwaWebhook.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { createOpenwaWebhookRouter } from "./openwaWebhook.js";
import type { WsEvent } from "../ws/hub.js";

const SECRET = "test-webhook-secret";

function buildTestApp(broadcast: (e: WsEvent) => void = () => {}) {
  const app = express();
  app.use(express.json());
  app.use("/webhooks/openwa", createOpenwaWebhookRouter(broadcast, SECRET));
  return app;
}

const app = buildTestApp();

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.settings.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /webhooks/openwa", () => {
  it("creates a new conversation in AI mode and logs the inbound text message", async () => {
    const res = await request(app)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", SECRET)
      .send({
        sessionId: "sess-1",
        chatId: "1234@c.us",
        messageId: "wamid.1",
        fromMe: false,
        type: "chat",
        body: "Hi, is this Acme Bikes?",
        timestamp: 1700000000
      });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("ai");

    const convo = await prisma.conversation.findUnique({ where: { waChatId: "1234@c.us" }, include: { messages: true } });
    expect(convo?.messages).toHaveLength(1);
    expect(convo?.messages[0].body).toBe("Hi, is this Acme Bikes?");
    expect(convo?.messages[0].sender).toBe("customer");
  });

  it("reuses an existing conversation and preserves its current mode", async () => {
    await prisma.conversation.create({ data: { waChatId: "5555@c.us", mode: "human" } });

    const res = await request(app)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", SECRET)
      .send({
        sessionId: "sess-1",
        chatId: "5555@c.us",
        messageId: "wamid.2",
        fromMe: false,
        type: "chat",
        body: "Following up on my order",
        timestamp: 1700000100
      });

    expect(res.body.mode).toBe("human");
  });

  it("stores non-text messages as an unsupported-attachment placeholder", async () => {
    const res = await request(app)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", SECRET)
      .send({
        sessionId: "sess-1",
        chatId: "7777@c.us",
        messageId: "wamid.3",
        fromMe: false,
        type: "image",
        body: "",
        timestamp: 1700000200
      });

    const convo = await prisma.conversation.findUnique({ where: { waChatId: "7777@c.us" }, include: { messages: true } });
    expect(convo?.messages[0].body).toBe("[unsupported attachment]");
    expect(res.status).toBe(200);
  });

  it("ignores fromMe echoes", async () => {
    const res = await request(app)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", SECRET)
      .send({
        sessionId: "sess-1",
        chatId: "9999@c.us",
        messageId: "wamid.4",
        fromMe: true,
        type: "chat",
        body: "This was sent by us",
        timestamp: 1700000300
      });

    expect(res.status).toBe(200);
    const convo = await prisma.conversation.findUnique({ where: { waChatId: "9999@c.us" } });
    expect(convo).toBeNull();
  });

  it("returns 400 and creates nothing when chatId is missing", async () => {
    const res = await request(app)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", SECRET)
      .send({
        sessionId: "sess-1",
        messageId: "wamid.5",
        fromMe: false,
        type: "chat",
        body: "Missing chatId",
        timestamp: 1700000400
      });

    expect(res.status).toBe(400);

    const conversations = await prisma.conversation.findMany();
    expect(conversations).toHaveLength(0);
    const messages = await prisma.message.findMany();
    expect(messages).toHaveLength(0);
  });

  it("returns 401 and creates nothing when the webhook secret is missing or wrong", async () => {
    const missing = await request(app).post("/webhooks/openwa").send({
      sessionId: "sess-1",
      chatId: "unauth-1@c.us",
      messageId: "wamid.unauth.1",
      fromMe: false,
      type: "chat",
      body: "Should be rejected",
      timestamp: 1700000500
    });
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBeTypeOf("string");

    const wrong = await request(app)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", "wrong-secret")
      .send({
        sessionId: "sess-1",
        chatId: "unauth-2@c.us",
        messageId: "wamid.unauth.2",
        fromMe: false,
        type: "chat",
        body: "Should also be rejected",
        timestamp: 1700000600
      });
    expect(wrong.status).toBe(401);

    const conversations = await prisma.conversation.findMany();
    expect(conversations).toHaveLength(0);
    const messages = await prisma.message.findMany();
    expect(messages).toHaveLength(0);
  });

  it("responds before the AI auto-reply completes, then triggers it detached", async () => {
    await prisma.settings.upsert({
      where: { id: 1 },
      create: { id: 1, activeProvider: "deepseek", deepseekApiKey: "test-key" },
      update: { activeProvider: "deepseek", deepseekApiKey: "test-key" }
    });

    // A slow LLM/OpenWA round trip must not hold the HTTP response open. We simulate
    // "slow" by gating every outbound fetch (the LLM call and the OpenWA send call)
    // behind a promise we control, and assert the webhook still answers promptly,
    // then separately observe the detached auto-reply finishing via the
    // conversation_updated broadcast.
    let resolveSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        await sendGate;
        if (String(url).includes("deepseek.com")) {
          return { ok: true, json: async () => ({ choices: [{ message: { content: "We're open until 6pm." } }] }) };
        }
        return { ok: true, json: async () => ({ id: "wamid.out.detached" }) };
      })
    );

    const events: WsEvent[] = [];
    const localApp = buildTestApp((e) => events.push(e));

    const res = await request(localApp)
      .post("/webhooks/openwa")
      .set("X-Webhook-Secret", SECRET)
      .send({
        sessionId: "sess-1",
        chatId: "detached@c.us",
        messageId: "wamid.detached.1",
        fromMe: false,
        type: "chat",
        body: "Are you open today?",
        timestamp: 1700000700
      });

    expect(res.status).toBe(200);
    // Only the inbound-message broadcast has happened by the time the response returns;
    // the AI's provider call is still gated on sendGate.
    expect(events.some((e) => e.type === "conversation_updated")).toBe(false);

    resolveSend?.();

    await vi.waitFor(
      () => {
        expect(events.some((e) => e.type === "conversation_updated")).toBe(true);
      },
      { timeout: 10000, interval: 100 }
    );
  });

  it("dedupes a redelivered webhook: same waMessageId posted twice is a no-op the second time", async () => {
    await prisma.conversation.create({ data: { waChatId: "dedup@c.us", mode: "human" } });

    const payload = {
      sessionId: "sess-1",
      chatId: "dedup@c.us",
      messageId: "wamid.dedup.1",
      fromMe: false,
      type: "chat",
      body: "Do you deliver?",
      timestamp: 1700000800
    };

    const first = await request(app).post("/webhooks/openwa").set("X-Webhook-Secret", SECRET).send(payload);
    expect(first.status).toBe(200);

    const second = await request(app).post("/webhooks/openwa").set("X-Webhook-Secret", SECRET).send(payload);
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);

    const messages = await prisma.message.findMany({ where: { waMessageId: "wamid.dedup.1" } });
    expect(messages).toHaveLength(1);
  });
});
