// src/middleware/requireAuth.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { requireAuth } from "./requireAuth.js";
import { signAgentToken } from "../auth/jwt.js";

const app = express();
app.get("/protected", requireAuth(["admin"]), (req, res) => {
  res.json({ agentId: req.agent?.agentId });
});
app.get("/protected-any-role", requireAuth(), (req, res) => {
  res.json({ agentId: req.agent?.agentId, role: req.agent?.role });
});

describe("requireAuth", () => {
  it("returns 401 when the Authorization header is missing", async () => {
    const res = await request(app).get("/protected");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the header is malformed (no Bearer prefix)", async () => {
    const token = signAgentToken({ agentId: "agent-1", role: "admin" });
    const res = await request(app).get("/protected").set("Authorization", token);
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid/garbage token", async () => {
    const res = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns 403 for a valid token with the wrong role", async () => {
    const token = signAgentToken({ agentId: "agent-1", role: "agent" });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("calls next() and sets req.agent for a valid token with a matching role", async () => {
    const token = signAgentToken({ agentId: "agent-1", role: "admin" });
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe("agent-1");
  });

  it("allows any role when no roles list is provided", async () => {
    const token = signAgentToken({ agentId: "agent-2", role: "agent" });
    const res = await request(app)
      .get("/protected-any-role")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.agentId).toBe("agent-2");
    expect(res.body.role).toBe("agent");
  });
});
