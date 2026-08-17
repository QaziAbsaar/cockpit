import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { Login } from "./Login.js";

function TokenProbe() {
  const { token } = useAuth();
  return <div data-testid="token">{token ?? "none"}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Login page", () => {
  it("logs in and stores the token on successful submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "jwt-abc" }) })
    );

    render(
      <AuthProvider>
        <Login />
        <TokenProbe />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByTestId("token").textContent).toBe("jwt-abc"));
  });

  it("shows an error message on invalid credentials", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid credentials" }) }));

    render(
      <AuthProvider>
        <Login />
      </AuthProvider>
    );

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });
});
