/**
 * Central API client for CashFlow Pilot.
 * - Uses httpOnly cookies for JWT auth (sent automatically via credentials: include)
 * - Auto-refreshes the access token on 401 by calling /api/auth/refresh once per request
 * - Throws typed ApiError on non-2xx responses
 */

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

// Dev: always same-origin `/api` (Vite proxy → backend). If VITE_API_BASE_URL points at
// :8000 while the page is on :3000, browsers do not send httpOnly cookies → "No refresh token".
// Production: set VITE_API_BASE_URL when the API is on another origin.
const raw = import.meta.env.DEV
  ? ""
  : ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "");
export const API_BASE = raw.replace(/\/$/, "");

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Disable the automatic refresh-retry (used internally to avoid loops). */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const origin =
    API_BASE ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const url = new URL(pathname, origin.endsWith("/") ? origin : `${origin}/`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

/** Fallback when httpOnly cookies are not stored (embedded browsers). */
const SS_ACCESS = "cfp_access_token";
const SS_REFRESH = "cfp_refresh_token";

export function persistSessionTokens(access: string, refresh: string) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(SS_ACCESS, access);
  sessionStorage.setItem(SS_REFRESH, refresh);
}

export function clearSessionTokens() {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(SS_ACCESS);
  sessionStorage.removeItem(SS_REFRESH);
}

function getAuthHeaders(): Record<string, string> {
  if (typeof sessionStorage === "undefined") return {};
  const a = sessionStorage.getItem(SS_ACCESS);
  if (a) return { Authorization: `Bearer ${a}` };
  return {};
}

/** Exchange refresh token (cookie or sessionStorage body) for new tokens. */
export async function refreshSession(): Promise<boolean> {
  try {
    const storedRefresh =
      typeof sessionStorage !== "undefined" ? sessionStorage.getItem(SS_REFRESH) : null;
    const headers: Record<string, string> = { ...getAuthHeaders() };
    if (storedRefresh) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(buildUrl("/api/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers,
      body: storedRefresh ? JSON.stringify({ refresh_token: storedRefresh }) : undefined,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token?: string; refresh_token?: string };
    if (data.access_token && data.refresh_token) {
      persistSessionTokens(data.access_token, data.refresh_token);
    }
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const {
    method = "GET",
    body,
    formData,
    query,
    signal,
    skipRefresh = false,
  } = opts;

  const headers: Record<string, string> = { ...getAuthHeaders() };
  let payload: BodyInit | undefined;

  if (formData) {
    payload = formData;
    // Let the browser set the multipart Content-Type with boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const doFetch = () =>
    fetch(buildUrl(path, query), {
      method,
      headers,
      body: payload,
      credentials: "include",
      signal,
    });

  let response = await doFetch();

  // If access token expired, try refreshing once and replay the request
  if (response.status === 401 && !skipRefresh && path !== "/api/auth/login" && path !== "/api/auth/refresh") {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await doFetch();
    }
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  let data: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === "object" && "detail" in data && typeof (data as any).detail === "string"
        ? (data as any).detail
        : `HTTP ${response.status}`) || `HTTP ${response.status}`;
    throw new ApiError(response.status, message, data);
  }

  return data as T;
}

// ───────────────────────────────────────────────────────────────────
// Typed endpoints — keep these thin, they just delegate to api()
// ───────────────────────────────────────────────────────────────────

export interface UserPublic {
  id: string;
  org_id: string;
  email: string;
  full_name: string;
  role: "super_admin" | "admin" | "ceo" | "cfo" | "chef_dep" | "chef_projet" | "agent";
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface OrgLight {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResponse {
  user: UserPublic;
  org: OrgLight;
  access_token?: string;
  refresh_token?: string;
}

export const authApi = {
  registerOrg: (payload: {
    org_name: string;
    org_slug: string;
    email: string;
    password: string;
    full_name: string;
  }) => api<AuthResponse>("/api/auth/register-org", { method: "POST", body: payload }),

  login: (email: string, password: string) =>
    api<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password } }),

  logout: () => api<void>("/api/auth/logout", { method: "POST" }),

  /** Uses skipRefresh — call refreshSession() first if you need to recover an expired access token. */
  me: () => api<AuthResponse>("/api/auth/me", { skipRefresh: true }),

  refresh: () =>
    api<{ access_token: string; refresh_token: string }>("/api/auth/refresh", { method: "POST" }),
};

export const importsApi = {
  uploadSolde: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api<{ created: number; updated: number; total: number }>(
      "/api/imports/solde",
      { method: "POST", formData: fd }
    );
  },
  uploadFactures: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api<{ created: number; updated: number; total: number }>(
      "/api/imports/factures",
      { method: "POST", formData: fd }
    );
  },
  history: () => api<ImportLog[]>("/api/imports/history"),
};

export interface ImportLog {
  kind: "solde" | "factures";
  filename: string;
  rows_parsed: number;
  created: number;
  updated: number;
  created_at: string;
  user_id: string;
}

export const healthApi = {
  check: () => api<{ status: string; ai_enabled: boolean; email_enabled: boolean }>("/api/health"),
};
