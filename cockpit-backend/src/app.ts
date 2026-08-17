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
}

export function buildApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/auth", authRouter);
  app.use("/agents", requireAuth(["admin"]), agentsRouter);
  app.use("/settings", requireAuth(["admin"]), settingsRouter);
  app.use("/conversations", requireAuth(), conversationsRouter);
  app.use("/conversations", requireAuth(), createMessagesRouter(deps.waConfig, deps.broadcast));
  app.use("/webhooks/openwa", createOpenwaWebhookRouter(deps.broadcast));

  return app;
}
