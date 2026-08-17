// src/pages/ChatDetail.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ChatDetail } from "./ChatDetail.js";

afterEach(() => vi.restoreAllMocks());

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/chats/${id}`]}>
      <Routes>
        <Route path="/chats/:id" element={<ChatDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ChatDetail", () => {
  it("disables the reply box while mode is ai and shows history", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "1",
          waChatId: "111@c.us",
          mode: "ai",
          needsAttention: false,
          messages: [{ id: "m1", direction: "in", sender: "customer", body: "Hi there", createdAt: "2026-08-17T00:00:00Z" }]
        })
      })
    );

    renderAt("1");

    await waitFor(() => expect(screen.getByText("Hi there")).toBeInTheDocument());
    expect(screen.getByRole("textbox", { name: /reply/i })).toBeDisabled();
  });

  it("sends a reply when mode is human", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/messages")) {
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ id: "m2", body: "On it!" }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          id: "2",
          waChatId: "222@c.us",
          mode: "human",
          needsAttention: false,
          messages: []
        })
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderAt("2");

    const textbox = await screen.findByRole("textbox", { name: /reply/i });
    expect(textbox).toBeEnabled();

    fireEvent.change(textbox, { target: { value: "On it!" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/conversations/2/messages"),
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
