import { describe, it, expect } from "vitest";
import { signAgentToken, verifyAgentToken } from "./jwt.js";

describe("jwt", () => {
  it("round-trips agent claims", () => {
    const token = signAgentToken({ agentId: "abc-123", role: "agent" });
    const decoded = verifyAgentToken(token);
    expect(decoded.agentId).toBe("abc-123");
    expect(decoded.role).toBe("agent");
  });

  it("throws on an invalid token", () => {
    expect(() => verifyAgentToken("not-a-real-token")).toThrow();
  });
});
