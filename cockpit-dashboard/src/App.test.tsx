import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { App } from "./App.js";

function fakeToken(role: "admin" | "agent"): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ agentId: "a-1", role }));
  return `${header}.${payload}.sig`;
}

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("App", () => {
  it("redirects an unauthenticated visitor to /login, and after a successful login shows the chat list", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith("/auth/login")) {
        return Promise.resolve({ ok: true, json: async () => ({ token: fakeToken("agent") }) });
      }
      if (String(url).includes("/conversations")) {
        return Promise.resolve({
          ok: true,
          json: async () => [{ id: "1", waChatId: "111@c.us", mode: "ai", needsAttention: false, updatedAt: "2026-08-17T00:00:00Z" }]
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    // Unauthenticated, so visiting "/" lands on the login form.
    expect(await screen.findByRole("button", { name: /log in/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "agent@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    // End-to-end: after login, the chat list route renders with real conversation data.
    await waitFor(() => expect(screen.getByText("111@c.us")).toBeInTheDocument());
  });

  it("does not render the Settings/Agents nav links for a non-admin agent", async () => {
    localStorage.setItem("cockpit_token", fakeToken("agent"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );

    render(<App />);

    await screen.findByText("Chats");
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
  });

  it("shows the Settings/Agents nav links for an admin", async () => {
    localStorage.setItem("cockpit_token", fakeToken("admin"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );

    render(<App />);

    await screen.findByText("Chats");
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
  });

  it("redirects a non-admin agent away from /settings back to /", async () => {
    localStorage.setItem("cockpit_token", fakeToken("agent"));
    window.history.pushState({}, "", "/settings");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    );

    render(<App />);

    // Bounced to the chat list instead of the admin-only Settings page.
    await screen.findByText("Chats");
    expect(screen.queryByLabelText(/active provider/i)).not.toBeInTheDocument();
  });
});
