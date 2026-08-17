import { useEffect } from "react";

interface CockpitEvent {
  type: string;
  payload: { conversationId: string };
}

export function useConversationSocket(onEvent: (event: CockpitEvent) => void): void {
  useEffect(() => {
    const url = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000";
    const socket = new WebSocket(url);
    socket.onmessage = (e) => {
      onEvent(JSON.parse(e.data) as CockpitEvent);
    };
    return () => socket.close();
  }, [onEvent]);
}
