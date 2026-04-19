import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import {
  authApi,
  api,
  refreshSession,
  persistSessionTokens,
  clearSessionTokens,
  type UserPublic,
  type OrgLight,
  type AuthResponse,
} from "@/lib/api";

export type UserRole = UserPublic["role"];

interface AuthState {
  user: UserPublic | null;
  org: OrgLight | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  registerOrg: (payload: {
    org_name: string;
    org_slug: string;
    email: string;
    password: string;
    full_name: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    org: null,
    loading: true,
    error: null,
  });

  const loadMe = useCallback(async () => {
    const apply = (data: AuthResponse) =>
      setState({ user: data.user, org: data.org, loading: false, error: null });
    const clear = () => setState({ user: null, org: null, loading: false, error: null });

    try {
      apply(await api<AuthResponse>("/api/auth/me", { skipRefresh: true }));
      return;
    } catch {
      // No access cookie (or expired): try refresh once, then /me again — avoids chaining refresh inside api() for guests
    }
    if (await refreshSession()) {
      try {
        apply(await api<AuthResponse>("/api/auth/me", { skipRefresh: true }));
        return;
      } catch {
        /* session still invalid */
      }
    }
    clear();
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await authApi.login(email, password);
      if (data.access_token && data.refresh_token) {
        persistSessionTokens(data.access_token, data.refresh_token);
      }
      setState({ user: data.user, org: data.org, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setState(s => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const registerOrg = useCallback(async (payload: Parameters<typeof authApi.registerOrg>[0]) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await authApi.registerOrg(payload);
      if (data.access_token && data.refresh_token) {
        persistSessionTokens(data.access_token, data.refresh_token);
      }
      setState({ user: data.user, org: data.org, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setState(s => ({ ...s, loading: false, error: msg }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore network errors on logout — clear local state anyway
    }
    clearSessionTokens();
    setState({ user: null, org: null, loading: false, error: null });
  }, []);

  const hasRole = useCallback(
    (roles: UserRole[]) => {
      if (!state.user) return false;
      if (state.user.role === "super_admin") return true;
      return roles.includes(state.user.role);
    },
    [state.user]
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        registerOrg,
        logout,
        refresh: loadMe,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
