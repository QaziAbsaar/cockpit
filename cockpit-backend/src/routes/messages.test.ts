// src/routes/messages.test.ts
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createMessagesRouter } from "./messages.js";

const waConfig = { baseUrl: "http://openwa.local", apiKey: "key", sessionId: "sess-1" };
const app = express();
app.use(express.json());
app.use("/conversations", requireAuth(), createMessagesRouter(waConfig, () => {}));

const token = signAgentToken({ agentId: "agent-42", role: "agent" });

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /conversations/:id/messages", () => {
  it("sends and logs an agent reply when mode is human", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "hm@c.us", mode: "human" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.agent.1" }) }));

    const res = await request(app)
      .post(`/conversations/${convo.id}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Sure, let me check that for you." });

    expect(res.status).toBe(201);
    expect(res.body.sender).toBe("agent:agent-42");

    const messages = await prisma.message.findMany({ where: { conversationId: convo.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].sender).toBe("agent:agent-42");
  });

  it("rejects sending when mode is ai", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "ai@c.us", mode: "ai" } });

    const res = await request(app)
      .post(`/conversations/${convo.id}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Should be blocked" });

    expect(res.status).toBe(409);
  });
});
