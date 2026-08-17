// src/webhooks/openwaWebhook.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { openwaWebhookRouter } from "./openwaWebhook.js";

const app = express();
app.use(express.json());
app.use("/webhooks/openwa", openwaWebhookRouter);

afterEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /webhooks/openwa", () => {
  it("creates a new conversation in AI mode and logs the inbound text message", async () => {
    const res = await request(app).post("/webhooks/openwa").send({
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

    const res = await request(app).post("/webhooks/openwa").send({
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
    const res = await request(app).post("/webhooks/openwa").send({
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
    const res = await request(app).post("/webhooks/openwa").send({
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
    const res = await request(app).post("/webhooks/openwa").send({
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
});
