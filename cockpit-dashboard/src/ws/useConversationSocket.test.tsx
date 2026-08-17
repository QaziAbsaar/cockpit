import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useConversationSocket } from "./useConversationSocket.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  vi.unstubAllGlobals();
});

describe("useConversationSocket", () => {
  it("invokes onEvent for incoming messages and closes on unmount", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const onEvent = vi.fn();

    const { unmount } = renderHook(() => useConversationSocket(onEvent));
    const socket = FakeWebSocket.instances[0];
    socket.emit({ type: "new_message", payload: { conversationId: "abc" } });

    expect(onEvent).toHaveBeenCalledWith({ type: "new_message", payload: { conversationId: "abc" } });

    unmount();
    expect(socket.closed).toBe(true);
  });
});
