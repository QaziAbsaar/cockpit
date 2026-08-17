import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { Login } from "./pages/Login.js";
import { ChatList } from "./pages/ChatList.js";

function RequireToken({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireToken>
                <ChatList />
              </RequireToken>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
