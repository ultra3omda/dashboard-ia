import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { authApi, type UserPublic, type OrgLight } from "@/lib/api";

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
    try {
      const data = await authApi.me();
      setState({ user: data.user, org: data.org, loading: false, error: null });
    } catch {
      // Not logged in is an expected state, don't surface it as an error
      setState({ user: null, org: null, loading: false, error: null });
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await authApi.login(email, password);
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
