import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "../auth/AuthContext.js";
import { Login } from "./Login.js";

function TokenProbe() {
  const { token } = useAuth();
  return <div data-testid="token">{token ?? "none"}</div>;
}

function renderLogin() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              <>
                <Login />
                <TokenProbe />
              </>
            }
          />
          <Route path="/" element={<div data-testid="home">Home page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("Login page", () => {
  it("logs in, stores the token, and navigates to / on successful submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: "jwt-abc" }) })
    );

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(screen.getByTestId("home")).toBeInTheDocument());
  });

  it("shows an error message on invalid credentials and does not navigate away", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "invalid credentials" }) }));

    renderLogin();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
  });
});
