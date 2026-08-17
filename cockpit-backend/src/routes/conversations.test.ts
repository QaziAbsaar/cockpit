// src/routes/conversations.test.ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { conversationsRouter } from "./conversations.js";

const app = express();
app.use(express.json());
app.use("/conversations", requireAuth(), conversationsRouter);

const token = signAgentToken({ agentId: "agent-1", role: "agent" });

beforeEach(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
});

afterAll(async () => {
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.$disconnect();
});

describe("conversations routes", () => {
  it("lists conversations newest-updated first", async () => {
    const older = await prisma.conversation.create({ data: { waChatId: "old@c.us" } });
    await new Promise((r) => setTimeout(r, 5));
    await prisma.conversation.create({ data: { waChatId: "new@c.us" } });

    const res = await request(app).get("/conversations").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].waChatId).toBe("new@c.us");
    expect(res.body[1].waChatId).toBe("old@c.us");
    void older;
  });

  it("returns conversation detail with messages", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "detail@c.us" } });
    await prisma.message.create({ data: { conversationId: convo.id, direction: "in", sender: "customer", body: "hi" } });

    const res = await request(app).get(`/conversations/${convo.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it("returns 404 for a conversation that does not exist", async () => {
    const res = await request(app)
      .get("/conversations/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("toggles mode via PATCH", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "toggle@c.us", mode: "ai" } });

    const res = await request(app)
      .patch(`/conversations/${convo.id}/mode`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "human" });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("human");

    const updated = await prisma.conversation.findUnique({ where: { id: convo.id } });
    expect(updated?.mode).toBe("human");
  });

  it("clears needsAttention explicitly via PATCH", async () => {
    const convo = await prisma.conversation.create({
      data: { waChatId: "attention@c.us", mode: "human", needsAttention: true }
    });

    const res = await request(app)
      .patch(`/conversations/${convo.id}/mode`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "human", needsAttention: false });

    expect(res.status).toBe(200);
    expect(res.body.needsAttention).toBe(false);
  });

  it("rejects an invalid mode value", async () => {
    const convo = await prisma.conversation.create({ data: { waChatId: "invalidmode@c.us" } });

    const res = await request(app)
      .patch(`/conversations/${convo.id}/mode`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "robot" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when toggling mode on a nonexistent conversation", async () => {
    const res = await request(app)
      .patch("/conversations/00000000-0000-0000-0000-000000000000/mode")
      .set("Authorization", `Bearer ${token}`)
      .send({ mode: "human" });

    expect(res.status).toBe(404);
  });
});
