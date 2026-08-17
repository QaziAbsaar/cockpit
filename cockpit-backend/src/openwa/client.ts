export interface OpenWaConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

// Sends an outbound WhatsApp message via OpenWA's REST API.
//
// Real OpenWA contract (v0.20, docs/06-api-specification.md): text sends go to
// `POST /api/sessions/:sessionId/messages/send-text` with an OPERATOR (or ADMIN)
// API key in `X-API-Key`, body `{ chatId, text }`, and the response carries the
// engine message id in `messageId` (201 = accepted, not necessarily delivered —
// delivery is tracked via message.ack webhooks).
export async function sendWaMessage(
  config: OpenWaConfig,
  chatId: string,
  text: string
): Promise<{ waMessageId: string }> {
  const res = await fetch(`${config.baseUrl}/api/sessions/${config.sessionId}/messages/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": config.apiKey
    },
    body: JSON.stringify({ chatId, text })
  });
  if (!res.ok) {
    throw new Error(`openwa send failed with status ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { messageId: string };
  return { waMessageId: data.messageId };
}
