// src/ws/hub.ts
import type http from "node:http";
import { WebSocketServer } from "ws";

export interface WsEvent {
  type: string;
  payload: unknown;
}

export function createWsHub(server: http.Server): { broadcast(event: WsEvent): void } {
  const wss = new WebSocketServer({ server });

  return {
    broadcast(event: WsEvent) {
      const data = JSON.stringify(event);
      for (const client of wss.clients) {
        if (client.readyState === client.OPEN) {
          client.send(data);
        }
      }
    }
  };
}
