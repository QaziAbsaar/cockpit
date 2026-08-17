import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AgentRole = "admin" | "agent";

interface AuthValue {
  token: string | null;
  role: AgentRole | null;
  login(token: string): void;
  logout(): void;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

// Decodes the JWT payload client-side WITHOUT verifying the signature. This is only
// used to decide what to show in the UI (e.g. whether to render the admin nav links);
// the backend independently verifies and enforces the token's signature and role on
// every request, so a tampered token can't grant real access here — worst case, a
// user sees (but can't use) a nav link, and the API call behind it 403s.
function decodeRole(token: string): AgentRole | null {
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    const payload = JSON.parse(json) as { role?: unknown };
    return payload.role === "admin" || payload.role === "agent" ? payload.role : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("cockpit_token"));
  const role = useMemo(() => (token ? decodeRole(token) : null), [token]);

  function login(newToken: string) {
    localStorage.setItem("cockpit_token", newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem("cockpit_token");
    setToken(null);
  }

  return <AuthContext.Provider value={{ token, role, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
