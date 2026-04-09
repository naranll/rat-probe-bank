import { createContext, useState, useContext, useCallback } from "react";

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const isAuthenticated = !!user;

  const login = useCallback((userData) => {
    // userData = { id, username } from backend (we strip password)
    const safe = { id: userData.id, username: userData.username };
    localStorage.setItem("user", JSON.stringify(safe));
    setUser(safe);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setUser(null);
  }, []);

  /**
   * Authenticated fetch wrapper.
   * We don't have JWT yet — backend allows all requests — so this is
   * a thin wrapper that keeps consistent fetch usage across the app.
   */
  const api = useCallback(async (url, options = {}) => {
    const headers = { "Content-Type": "application/json", ...options.headers };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      // Try to parse error body from GlobalExceptionHandler
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.error || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res;
  }, []);

  const value = { user, isAuthenticated, login, logout, api };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
