// src/server.ts
import "dotenv/config";
import http from "node:http";
import { buildApp } from "./app.js";
import { createWsHub } from "./ws/hub.js";

const server = http.createServer();
const hub = createWsHub(server);

const app = buildApp({
  waConfig: {
    baseUrl: process.env.OPENWA_BASE_URL ?? "",
    apiKey: process.env.OPENWA_API_KEY ?? "",
    sessionId: process.env.OPENWA_SESSION_ID ?? ""
  },
  broadcast: (event) => hub.broadcast(event)
});

server.on("request", app);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => console.log(`cockpit-backend listening on :${port}`));
