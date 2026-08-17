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

function NavBar() {
  const { role, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <nav>
      <Link to="/">Chats</Link>
      {role === "admin" && (
        <>
          {" | "}
          <Link to="/settings">Settings</Link>
          {" | "}
          <Link to="/agents">Agents</Link>
        </>
      )}
      {" | "}
      <button onClick={handleLogout}>Log out</button>
    </nav>
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
                <NavBar />
                <ChatList />
              </RequireToken>
            }
          />
          <Route
            path="/chats/:id"
            element={
              <RequireToken>
                <NavBar />
                <ChatDetail />
              </RequireToken>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAdmin>
                <NavBar />
                <Settings />
              </RequireAdmin>
            }
          />
          <Route
            path="/agents"
            element={
              <RequireAdmin>
                <NavBar />
                <Agents />
              </RequireAdmin>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
