// src/routes/settings.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { settingsRouter } from "./settings.js";

const app = express();
app.use(express.json());
app.use("/settings", requireAuth(["admin"]), settingsRouter);

let adminToken: string;

beforeAll(async () => {
  await prisma.settings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  adminToken = signAgentToken({ agentId: "admin-1", role: "admin" });
});

afterAll(async () => {
  await prisma.settings.deleteMany();
  await prisma.$disconnect();
});

describe("settings routes", () => {
  it("gets settings with API keys redacted to booleans", async () => {
    const res = await request(app).get("/settings").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.activeProvider).toBe("deepseek");
    expect(res.body.deepseekApiKey).toBeUndefined();
    expect(res.body.hasDeepseekKey).toBe(false);
  });

  it("updates the active provider and persona prompt", async () => {
    const put = await request(app)
      .put("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ activeProvider: "claude", claudeApiKey: "sk-ant-xyz", personaPrompt: "You are Acme's support bot." });
    expect(put.status).toBe(200);
    expect(put.body.activeProvider).toBe("claude");
    expect(put.body.hasClaudeKey).toBe(true);

    const stored = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(stored?.claudeApiKey).toBe("sk-ant-xyz");
    expect(stored?.personaPrompt).toBe("You are Acme's support bot.");
  });

  it("does not clobber an existing API key on a partial update", async () => {
    const first = await request(app)
      .put("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ claudeApiKey: "sk-ant-first" });
    expect(first.status).toBe(200);
    expect(first.body.hasClaudeKey).toBe(true);

    const second = await request(app)
      .put("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ personaPrompt: "updated persona only" });
    expect(second.status).toBe(200);
    expect(second.body.hasClaudeKey).toBe(true);

    const stored = await prisma.settings.findUnique({ where: { id: 1 } });
    expect(stored?.claudeApiKey).toBe("sk-ant-first");
    expect(stored?.personaPrompt).toBe("updated persona only");
  });

  it("rejects an invalid activeProvider", async () => {
    const res = await request(app)
      .put("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ activeProvider: "not-a-real-provider" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/activeProvider must be one of/);
  });
});
