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

  it("does not reconnect when a new onEvent reference is passed on re-render", () => {
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    const onEventA = vi.fn();
    const onEventB = vi.fn();

    const { rerender } = renderHook(({ onEvent }) => useConversationSocket(onEvent), {
      initialProps: { onEvent: onEventA },
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];
    expect(socket.closed).toBe(false);

    // Re-render with a brand-new inline closure, as call sites like ChatList/ChatDetail do.
    rerender({ onEvent: onEventB });

    // Still the same single socket — no reconnect happened.
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.closed).toBe(false);

    // The latest onEvent is the one invoked, proving the ref was updated.
    socket.emit({ type: "new_message", payload: { conversationId: "xyz" } });
    expect(onEventB).toHaveBeenCalledWith({ type: "new_message", payload: { conversationId: "xyz" } });
    expect(onEventA).not.toHaveBeenCalled();
  });
});
