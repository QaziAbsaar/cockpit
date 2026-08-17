import { describe, it, expect, vi, afterEach } from "vitest";
import { createGoogleProvider } from "./google.js";

describe("createGoogleProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls the Gemini generateContent endpoint and returns the reply text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: "Hi from Gemini" }] } }] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGoogleProvider("test-key");
    const reply = await provider.reply([{ role: "user", content: "hi" }], "Be helpful.");

    expect(reply).toBe("Hi from Gemini");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("key=test-key");
  });

  it("throws if the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "forbidden" }));
    const provider = createGoogleProvider("test-key");
    await expect(provider.reply([], "sys")).rejects.toThrow(/google/i);
  });
});
