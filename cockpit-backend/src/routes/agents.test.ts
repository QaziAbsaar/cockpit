// src/routes/agents.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";
import { signAgentToken } from "../auth/jwt.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { agentsRouter } from "./agents.js";

const app = express();
app.use(express.json());
app.use("/agents", requireAuth(["admin"]), agentsRouter);

let adminToken: string;

beforeAll(async () => {
  const admin = await prisma.agent.create({
    data: {
      name: "Admin",
      email: "admin2@test.com",
      passwordHash: await hashPassword("secret123"),
      role: "admin"
    }
  });
  adminToken = signAgentToken({ agentId: admin.id, role: "admin" });
});

afterAll(async () => {
  await prisma.agent.deleteMany();
  await prisma.$disconnect();
});

describe("agents routes", () => {
  it("creates and lists an agent", async () => {
    const create = await request(app)
      .post("/agents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Agent Smith", email: "smith@test.com", password: "pw123456", role: "agent" });
    expect(create.status).toBe(201);
    expect(create.body.email).toBe("smith@test.com");
    expect(create.body.passwordHash).toBeUndefined();

    const list = await request(app).get("/agents").set("Authorization", `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects requests without a token", async () => {
    const res = await request(app).get("/agents");
    expect(res.status).toBe(401);
  });

  it("returns 409 when creating an agent with a duplicate email", async () => {
    const first = await request(app)
      .post("/agents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dup One", email: "dup@test.com", password: "pw123456", role: "agent" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/agents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Dup Two", email: "dup@test.com", password: "pw123456", role: "agent" });
    expect(second.status).toBe(409);
    expect(second.body.error).toBeTypeOf("string");
  });

  it("returns 404 when deleting a nonexistent agent id", async () => {
    const res = await request(app)
      .delete("/agents/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 when creating an agent with an invalid role", async () => {
    const res = await request(app)
      .post("/agents")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bad Role", email: "badrole@test.com", password: "pw123456", role: "superadmin" });
    expect(res.status).toBe(400);
  });
});
