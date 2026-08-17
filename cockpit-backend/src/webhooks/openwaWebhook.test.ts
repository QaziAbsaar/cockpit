import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { createOpenwaWebhookRouter } from "./openwaWebhook.js";
import type { OpenWaWebhookEnvelope } from "./types.js";
import type { WsEvent } from "../ws/hub.js";

// OpenWA requires webhook secrets to be at least 16 chars.
const SECRET = "test-webhook-secret";

function buildTestApp(broadcast: (e: WsEvent) => void = () => {}) {
  const app = express();
  app.use("/webhooks/openwa", createOpenwaWebhookRouter(broadcast, SECRET));
  return app;
}

const app = buildTestApp();

// The signature covers the exact raw body bytes, so we must stringify once and
// use those same bytes as the request body.
function signedPost(secret: string, payload: OpenWaWebhookEnvelope | Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return request(app).post("/webhooks/openwa").set("Content-Type", "application/json")
    .set("X-OpenWA-Signature", `sha256=${sig}`).send(body);
}

let msgSeq = 0;
function envelope(overrides: Partial<OpenWaWebhookEnvelope["data"]> = {}): OpenWaWebhookEnvelope {
  msgSeq += 1;
  return {
    event: "message.received",
    timestamp: "2026-08-18T00:00:00.000Z",
    sessionId: "sess-1",
    idempotencyKey: `msg_${msgSeq}`,
    deliveryId: `dlv_${msgSeq}`,
    data: {
      id: `true_${msgSeq}@c.us_${msgSeq}`,
      from: "1234@c.us",
      to: "me@c.us",
      body: "Hi, is this Acme Bikes?",
      type: "text",
      fromMe: false,
      timestamp: 1700000000,
      isGroup: false,
      hasMedia: false,
      ...overrides
    }
  };
}

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
    const res = await signedPost(SECRET, envelope());

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("ai");

    const convo = await prisma.conversation.findUnique({ where: { waChatId: "1234@c.us" }, include: { messages: true } });
    expect(convo?.messages).toHaveLength(1);
    expect(convo?.messages[0].body).toBe("Hi, is this Acme Bikes?");
    expect(convo?.messages[0].sender).toBe("customer");
  });

  it("reuses an existing conversation and preserves its current mode", async () => {
    await prisma.conversation.create({ data: { waChatId: "5555@c.us", mode: "human" } });

    const res = await signedPost(SECRET, envelope({ from: "5555@c.us", body: "Following up on my order" }));

    expect(res.body.mode).toBe("human");
  });

  it("stores non-text messages as an unsupported-attachment placeholder", async () => {
    const res = await signedPost(SECRET, envelope({ from: "7777@c.us", type: "image", body: "" }));

    const convo = await prisma.conversation.findUnique({ where: { waChatId: "7777@c.us" }, include: { messages: true } });
    expect(convo?.messages[0].body).toBe("[unsupported attachment]");
    expect(res.status).toBe(200);
  });

  it("ignores fromMe echoes", async () => {
    const res = await signedPost(SECRET, envelope({ from: "9999@c.us", fromMe: true }));

    expect(res.status).toBe(200);
    const convo = await prisma.conversation.findUnique({ where: { waChatId: "9999@c.us" } });
    expect(convo).toBeNull();
  });

  it("returns 400 and creates nothing when the envelope is missing data.from or data.id", async () => {
    const noFrom = envelope();
    delete (noFrom.data as Partial<OpenWaWebhookEnvelope["data"]>).from;
    const res = await signedPost(SECRET, noFrom);
    expect(res.status).toBe(400);

    const noId = envelope();
    delete (noId.data as Partial<OpenWaWebhookEnvelope["data"]>).id;
    expect((await signedPost(SECRET, noId)).status).toBe(400);

    const conversations = await prisma.conversation.findMany();
    expect(conversations).toHaveLength(0);
    const messages = await prisma.message.findMany();
    expect(messages).toHaveLength(0);
  });

  it("returns 401 and creates nothing when the signature is missing or wrong", async () => {
    const missing = await request(app).post("/webhooks/openwa")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(envelope()));
    expect(missing.status).toBe(401);
    expect(missing.body.error).toBeTypeOf("string");

    const wrong = await signedPost("some-other-secret", envelope());
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
        return { ok: true, json: async () => ({ messageId: "wamid.out.detached" }) };
      })
    );

    const events: WsEvent[] = [];
    const localApp = buildTestApp((e) => events.push(e));

    const body = JSON.stringify(envelope({ from: "detached@c.us" }));
    const sig = crypto.createHmac("sha256", SECRET).update(body).digest("hex");

    const res = await request(localApp).post("/webhooks/openwa")
      .set("Content-Type", "application/json")
      .set("X-OpenWA-Signature", `sha256=${sig}`)
      .send(body);

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

  it("dedupes a redelivered webhook: same message id posted twice is a no-op the second time", async () => {
    await prisma.conversation.create({ data: { waChatId: "dedup@c.us", mode: "human" } });

    const payload = envelope({ from: "dedup@c.us", body: "Do you deliver?" });

    const first = await signedPost(SECRET, payload);
    expect(first.status).toBe(200);

    const second = await signedPost(SECRET, payload);
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);

    const messages = await prisma.message.findMany({ where: { waMessageId: payload.data.id } });
    expect(messages).toHaveLength(1);
  });
});
