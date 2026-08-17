import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ChatList } from "./ChatList.js";

afterEach(() => vi.restoreAllMocks());

describe("ChatList", () => {
  it("renders conversations with mode badges and attention flags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "1", waChatId: "111@c.us", mode: "ai", needsAttention: false, updatedAt: "2026-08-17T00:00:00Z" },
          { id: "2", waChatId: "222@c.us", mode: "human", needsAttention: true, updatedAt: "2026-08-17T00:01:00Z" }
        ]
      })
    );

    render(
      <MemoryRouter>
        <ChatList />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("111@c.us")).toBeInTheDocument());
    expect(screen.getByText("222@c.us")).toBeInTheDocument();
    expect(screen.getAllByText(/needs attention/i)).toHaveLength(1);
  });
});
