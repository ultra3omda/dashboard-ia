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

// Base URL is configurable through an env var so the frontend can point at a
// different backend in production without a rebuild. Falls back to localhost.
const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000") as string;
export const API_BASE = RAW_BASE.replace(/\/$/, "");

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
  const url = new URL(API_BASE + (path.startsWith("/") ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== null && v !== undefined && v !== "") {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url.toString();
}

async function refreshOnce(): Promise<boolean> {
  try {
    const res = await fetch(buildUrl("/api/auth/refresh"), {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
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

  const headers: Record<string, string> = {};
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
    const refreshed = await refreshOnce();
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

  me: () => api<AuthResponse>("/api/auth/me"),

  refresh: () => api<void>("/api/auth/refresh", { method: "POST" }),
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
