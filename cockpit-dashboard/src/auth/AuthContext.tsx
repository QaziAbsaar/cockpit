import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthValue {
  token: string | null;
  login(token: string): void;
  logout(): void;
}

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("cockpit_token"));

  function login(newToken: string) {
    localStorage.setItem("cockpit_token", newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem("cockpit_token");
    setToken(null);
  }

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
