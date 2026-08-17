import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { Login } from "./pages/Login.js";
import { ChatList } from "./pages/ChatList.js";
import { ChatDetail } from "./pages/ChatDetail.js";
import { Settings } from "./pages/Settings.js";
import { Agents } from "./pages/Agents.js";

function RequireToken({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { token, role } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return role === "admin" ? <>{children}</> : <Navigate to="/" replace />;
}

function LoginRoute() {
  const { token } = useAuth();
  return token ? <Navigate to="/" replace /> : <Login />;
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  const active = window.location.pathname === to;
  return (
    <Link
      to={to}
      className={
        "block rounded-lg px-3 py-2 text-sm font-medium transition-colors " +
        (active ? "bg-brand-soft text-brand" : "text-ink-soft hover:bg-black/5 hover:text-ink")
      }
    >
      {children}
    </Link>
  );
}

function NavBar() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-surface p-4">
      <span className="font-display mb-6 px-3 text-lg font-extrabold tracking-tight text-ink">Cockpit</span>
      <div className="flex flex-1 flex-col gap-1">
        <NavLink to="/">Chats</NavLink>
        {role === "admin" && (
          <>
            <NavLink to="/settings">Settings</NavLink>
            <NavLink to="/agents">Agents</NavLink>
          </>
        )}
      </div>
      <button
        onClick={handleLogout}
        className="rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-soft transition-colors hover:bg-black/5 hover:text-ink"
      >
        Log out
      </button>
    </nav>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-bg">
      <NavBar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/"
            element={
              <RequireToken>
                <Shell>
                  <ChatList />
                </Shell>
              </RequireToken>
            }
          />
          <Route
            path="/chats/:id"
            element={
              <RequireToken>
                <Shell>
                  <ChatDetail />
                </Shell>
              </RequireToken>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAdmin>
                <Shell>
                  <Settings />
                </Shell>
              </RequireAdmin>
            }
          />
          <Route
            path="/agents"
            element={
              <RequireAdmin>
                <Shell>
                  <Agents />
                </Shell>
              </RequireAdmin>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
