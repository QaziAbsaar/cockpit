// OpenWA v0.20 webhook contract (docs/06-api-specification.md):
//
// Webhooks are registered per-session on the OpenWA side
// (`POST /api/sessions/:sessionId/webhooks` with `{ url, events, secret, ... }`).
// Every delivery is a POST with a fixed envelope — the actual message lives in
// `data`. Signatures use HMAC-SHA256 over the raw request body in the
// `X-OpenWA-Signature: sha256=<hex>` header (secret is the webhook's `secret`,
// min 16 chars). `X-OpenWA-Idempotency-Key` is stable per occurrence and can be
// used to dedupe retries.
export interface OpenWaWebhookEnvelope {
  event: string; // e.g. "message.received"
  timestamp: string; // ISO-8601 delivery time
  sessionId: string; // the session UUID (same identifier used in `:sessionId` API paths, e.g. OPENWA_SESSION_ID)
  idempotencyKey: string;
  deliveryId: string;
  data: OpenWaMessageData;
}

// message.received / message.sent payload. Message ids are engine-specific
// (whatsapp-web.js: `true_<chat>@<domain>_<hash>`, Baileys: raw key) — treat as
// an opaque string. `timestamp` is epoch SECONDS (only status.received uses ms).
export interface OpenWaMessageData {
  id: string; // engine-specific message id — unique across the conversation, stable across
              // webhook retries of the same occurrence (it seeds the content-derived idempotencyKey)
  from: string; // chat JID, e.g. "628123456789@c.us" (groups: "...@g.us"). For an inbound
                // (fromMe: false) message this equals the chat to reply to — engine-side, chatId
                // is derived as `fromMe ? to : from`, so `from` and `chatId` coincide here.
  to: string;
  body: string;
  type: string; // "text" for text messages
  fromMe: boolean;
  timestamp: number; // epoch seconds
  isGroup: boolean;
  hasMedia: boolean;
  [key: string]: unknown; // engine-specific extras (contact, media, quoted, ...)
}
