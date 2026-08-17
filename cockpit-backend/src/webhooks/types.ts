// src/webhooks/types.ts
export interface OpenWaInboundWebhook {
  sessionId: string;
  chatId: string;
  messageId: string;
  fromMe: boolean;
  type: string;
  body: string;
  timestamp: number;
}
