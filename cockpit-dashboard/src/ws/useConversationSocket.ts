import { useEffect, useRef } from "react";

interface CockpitEvent {
  type: string;
  payload: { conversationId: string };
}

export function useConversationSocket(onEvent: (event: CockpitEvent) => void): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const url = import.meta.env.VITE_WS_URL ?? "ws://localhost:4000";
    const socket = new WebSocket(url);
    socket.onmessage = (e) => {
      onEventRef.current(JSON.parse(e.data) as CockpitEvent);
    };
    return () => socket.close();
  }, []);
}
