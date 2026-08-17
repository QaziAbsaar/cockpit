// src/ws/hub.test.ts
import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import WebSocket from "ws";
import { createWsHub } from "./hub.js";

let server: http.Server;

afterEach(() => {
  server?.close();
});

describe("createWsHub", () => {
  it("broadcasts events to all connected clients", async () => {
    server = http.createServer();
    const hub = createWsHub(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    const client = new WebSocket(`ws://localhost:${port}`);
    await new Promise((resolve) => client.on("open", resolve));

    const received = new Promise((resolve) => {
      client.on("message", (data) => resolve(JSON.parse(data.toString())));
    });

    hub.broadcast({ type: "new_message", payload: { conversationId: "abc" } });

    const message = await received;
    expect(message).toEqual({ type: "new_message", payload: { conversationId: "abc" } });
    client.close();
  });
});
