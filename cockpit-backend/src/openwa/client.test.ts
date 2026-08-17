import { describe, it, expect, vi, afterEach } from "vitest";
import { sendWaMessage } from "./client.js";

describe("sendWaMessage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("posts to the session's send endpoint with the API key header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "wamid.123" }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendWaMessage(
      { baseUrl: "http://openwa.local", apiKey: "key-1", sessionId: "sess-1" },
      "1234567890@c.us",
      "Hello!"
    );

    expect(result).toEqual({ waMessageId: "wamid.123" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://openwa.local/api/sessions/sess-1/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-API-Key": "key-1" }),
        body: JSON.stringify({ chatId: "1234567890@c.us", text: "Hello!" })
      })
    );
  });

  it("throws if OpenWA responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => "gateway down" }));
    await expect(
      sendWaMessage({ baseUrl: "http://openwa.local", apiKey: "key-1", sessionId: "sess-1" }, "chat", "hi")
    ).rejects.toThrow(/openwa/i);
  });
});
