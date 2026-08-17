// src/app.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import { buildApp } from "./app.js";

describe("buildApp", () => {
  it("exposes a health check", async () => {
    const app = buildApp({
      waConfig: { baseUrl: "http://openwa.local", apiKey: "k", sessionId: "s" },
      broadcast: () => {},
      webhookSecret: "test-webhook-secret"
    });
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
