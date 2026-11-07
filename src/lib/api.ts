/* =====================================================================
   Thin API client for the KolbeVintage backend.
   All URLs are relative so the same build works behind the Vite proxy
   (dev) and behind Fastify in production.
   ===================================================================== */

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  /** machine-readable failure code from the commerce core (e.g. quote_stale) */
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function csrfToken(): string {
  // the server sets a readable `kv_csrf` cookie; we echo it in a header
  const match = document.cookie.match(/(?:^|;\s*)kv_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * A token for the next write.
 *
 * The cookie alone was not enough: on the very first page load the browser has
 * not received it yet, and inside the framed preview the cookie is dropped
 * entirely, so `document.cookie` stays empty and every POST came back as
 * «توکن امنیتی معتبر نیست» — login, sign-up and the visit beacon alike. The
 * server now hands the same token out as JSON from /api/csrf, and accepts its
 * signature without any cookie, so one write always works.
 */
let memToken = "";
let tokenPending: Promise<string> | null = null;

/**
 * The session, when the browser will not keep our cookie.
 *
 * A framed preview on another origin can drop `kv_session` entirely: the login
 * then answers 200 while every later call is a stranger's. In that case the
 * server hands the token back in the body (only for cross-site requests) and
 * the client sends it as `x-session-token`. It lives in this tab only — never
 * in localStorage — and is thrown away on logout.
 */
const SESSION_KEY = "kv_session_token";
let sessionToken = (() => {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? "";
  } catch {
    return "";
  }
})();

export function setSessionToken(token: string | null) {
  sessionToken = token ?? "";
  try {
    if (sessionToken) sessionStorage.setItem(SESSION_KEY, sessionToken);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode — the in-memory copy is still used */
  }
}

export const hasSessionToken = () => Boolean(sessionToken);

async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch(`${BASE}/api/csrf`, { credentials: "include", cache: "no-store" });
    if (!res.ok) return "";
    const data = (await res.json()) as { token?: string };
    memToken = typeof data?.token === "string" ? data.token : "";
  } catch {
    memToken = "";
  }
  return memToken;
}

async function ensureCsrfToken(): Promise<string> {
  const fromCookie = csrfToken();
  if (fromCookie) return fromCookie;
  if (memToken) return memToken;
  if (!tokenPending) {
    tokenPending = fetchCsrfToken().finally(() => {
      tokenPending = null;
    });
  }
  return tokenPending;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isWrite = method !== "GET" && method !== "HEAD";

  const send = async (token: string) => {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
    if (token && isWrite) headers.set("x-csrf-token", token);
    if (sessionToken) headers.set("x-session-token", sessionToken);
    return fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  };

  let token = isWrite ? await ensureCsrfToken() : "";
  let res = await send(token);

  // a stale token (server restarted, cookie rotated) is worth exactly one retry
  if (isWrite && res.status === 403) {
    const peek = await res.clone().text();
    if (peek.includes("csrf_token_invalid")) {
      memToken = "";
      token = await fetchCsrfToken();
      if (token) res = await send(token);
    }
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;

  // the server includes `sessionToken` only for cross-site logins; keep it
  const issued = (data as { sessionToken?: unknown } | null)?.sessionToken;
  if (typeof issued === "string" && issued) setSessionToken(issued);
  // and a logout must not leave a usable header behind
  if (path.endsWith("/logout") && res.ok) setSessionToken(null);

  if (!res.ok) {
    const payload = data as { error?: string; message?: string; code?: string; details?: unknown } | null;
    const message = payload?.message ?? payload?.error ?? `خطای سرور (${res.status})`;
    throw new ApiError(message, res.status, payload?.code, payload?.details);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export interface ServerBootstrap {
  admin: Record<string, unknown> | null;
  ops: Record<string, unknown> | null;
  auth: { admin: boolean; customer: Record<string, unknown> | null };
  updatedAt: Record<string, string>;
  server: { version: number; time: string };
}

/** true when the API answered recently (used to decide whether to persist remotely) */
let online = false;
export const apiIsOnline = () => online;
export const markApiOnline = (value: boolean) => {
  online = value;
};

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  try {
    const token = await ensureCsrfToken();
    const res = await fetch(`${BASE}/api/uploads`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: {
        ...(token ? { "x-csrf-token": token } : {}),
        ...(sessionToken ? { "x-session-token": sessionToken } : {}),
      },
    });
    if (!res.ok) {
      const details = await res.json().catch(() => ({}));
      throw new Error(details.error || "بارگذاری تصویر ناموفق بود.");
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("no url");
    markApiOnline(true);
    return data.url;
  } catch (error) {
    throw error instanceof Error ? error : new Error("بارگذاری فایل ناموفق بود.");
  }
}

export async function adminLogin(passcode: string) {
  return api.post<{ ok: boolean; message: string }>("/api/admin/login", { passcode });
}

export async function adminLogout() {
  return api.post<{ ok: boolean }>("/api/admin/logout").catch(() => ({ ok: false }));
}
