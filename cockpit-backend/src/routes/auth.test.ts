// src/routes/auth.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../db/client.js";
import { hashPassword } from "../auth/password.js";
import { authRouter } from "./auth.js";

const app = express();
app.use(express.json());
app.use("/auth", authRouter);

beforeAll(async () => {
  await prisma.agent.create({
    data: {
      name: "Test Admin",
      email: "admin@test.com",
      passwordHash: await hashPassword("secret123"),
      role: "admin"
    }
  });
});

afterAll(async () => {
  await prisma.agent.deleteMany();
  await prisma.$disconnect();
});

describe("POST /auth/login", () => {
  it("returns a token for valid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "admin@test.com", password: "secret123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "admin@test.com", password: "wrong" });
    expect(res.status).toBe(401);
  });
});
