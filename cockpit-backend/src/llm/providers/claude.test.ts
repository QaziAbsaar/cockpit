import { describe, it, expect, vi, afterEach } from "vitest";
import { createClaudeProvider } from "./claude.js";

describe("createClaudeProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the Anthropic Messages API and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "text", text: "Hi from Claude" }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createClaudeProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hi from Claude");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "test-key", "anthropic-version": "2023-06-01" })
      })
    );
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" }));
    const provider = createClaudeProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/claude/i);
  });
});
