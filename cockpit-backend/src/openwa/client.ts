export interface OpenWaConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

export async function sendWaMessage(
  config: OpenWaConfig,
  chatId: string,
  text: string
): Promise<{ waMessageId: string }> {
  const res = await fetch(`${config.baseUrl}/api/sessions/${config.sessionId}/messages/send`, {
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
  const data = (await res.json()) as { id: string };
  return { waMessageId: data.id };
}
