import { describe, it, expect, vi, afterEach } from "vitest";
import { createOpenAIProvider } from "./openai.js";

describe("createOpenAIProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the OpenAI chat completions endpoint and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hi from GPT" } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hi from GPT");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" })
      })
    );
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "rate limited" }));
    const provider = createOpenAIProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/openai/i);
  });
});
