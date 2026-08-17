import { describe, it, expect, vi, afterEach } from "vitest";
import { createDeepSeekProvider } from "./deepseek.js";

describe("createDeepSeekProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the DeepSeek chat completions endpoint and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hello there!" } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createDeepSeekProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hello there!");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" })
      })
    );
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }));
    const provider = createDeepSeekProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/deepseek/i);
  });
});
