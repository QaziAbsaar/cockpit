// src/app.ts
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { agentsRouter } from "./routes/agents.js";
import { settingsRouter } from "./routes/settings.js";
import { conversationsRouter } from "./routes/conversations.js";
import { createMessagesRouter } from "./routes/messages.js";
import { createOpenwaWebhookRouter } from "./webhooks/openwaWebhook.js";
import { requireAuth } from "./middleware/requireAuth.js";
import type { OpenWaConfig } from "./openwa/client.js";
import type { WsEvent } from "./ws/hub.js";

export interface AppDeps {
  waConfig: OpenWaConfig;
  broadcast: (e: WsEvent) => void;
  webhookSecret: string;
}

export function buildApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors());

  // Mounted before the app-wide json parser: the webhook router parses its own
  // body via a `verify` hook that captures the raw bytes, needed to validate the
  // OpenWA HMAC signature. If the global parser ran first, the raw buffer would
  // be gone and every signature check would fail.
  app.use("/webhooks/openwa", createOpenwaWebhookRouter(deps.broadcast, deps.webhookSecret));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/agents", requireAuth(["admin"]), agentsRouter);
  app.use("/settings", requireAuth(["admin"]), settingsRouter);
  app.use("/conversations", requireAuth(), conversationsRouter);
  app.use("/conversations", requireAuth(), createMessagesRouter(deps.waConfig, deps.broadcast));

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: "internal server error" });
    }
  });

  return app;
}
