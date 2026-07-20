import { createContext, useContext, useState, useEffect, useCallback } from "react";
import api, { setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const login = useCallback(async (username, password) => {
    const res = await api.auth.login(username, password);
    setUser(res.data);
    return res.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // 即使后端失败也清除本地状态
    }
    setUser(null);
  }, []);

  useEffect(() => {
    // 会话过期时自动登出
    setUnauthorizedHandler(() => setUser(null));
    // 启动时校验当前会话
    api.auth
      .me()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
