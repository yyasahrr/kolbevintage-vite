/* =====================================================================
   Thin API client for the KolbeVintage backend.
   All URLs are relative so the same build works behind the Vite proxy
   (dev) and behind Fastify in production.
   ===================================================================== */

const BASE = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  status: number;
  /** machine-readable failure code from the commerce core (e.g. quote_stale) */
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const isRequestCancellation = (error: unknown) =>
  error instanceof ApiError && error.code === "request_cancelled";

function transportError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if ((error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError")) {
    return new ApiError("درخواست لغو شد.", 0, "request_cancelled", error);
  }
  return new ApiError("اتصال به سرور برقرار نشد.", 0, "network_error", error);
}

/** A fetch-compatible adapter must still honour the native Response contract. */
function assertResponse(value: unknown): asserts value is Response {
  const candidate = value as Partial<Response> | null | undefined;
  if (
    !candidate ||
    typeof candidate.ok !== "boolean" ||
    typeof candidate.status !== "number" ||
    typeof candidate.text !== "function" ||
    typeof candidate.clone !== "function"
  ) {
    throw new ApiError("آداپتور شبکه پاسخ معتبری برنگرداند.", 0, "invalid_response", value);
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
    const res: unknown = await fetch(`${BASE}/api/csrf`, { credentials: "include", cache: "no-store" });
    assertResponse(res);
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

  const send = async (token: string): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
    if (token && isWrite) headers.set("x-csrf-token", token);
    if (sessionToken) headers.set("x-session-token", sessionToken);
    const response: unknown = await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
    assertResponse(response);
    return response;
  };

  let res: Response;
  try {
    const token = isWrite ? await ensureCsrfToken() : "";
    res = await send(token);

    // a stale token (server restarted, cookie rotated) is worth exactly one retry
    if (isWrite && res.status === 403) {
      const peek = await res.clone().text();
      if (peek.includes("csrf_token_invalid")) {
        memToken = "";
        const freshToken = await fetchCsrfToken();
        if (freshToken) res = await send(freshToken);
      }
    }
  } catch (error) {
    throw transportError(error);
  }

  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    throw transportError(error);
  }
  const parsed = parseJson(text);
  const data = parsed.data;

  // the server includes `sessionToken` only for cross-site logins; keep it
  const issued = typeof data === "object" && data !== null ? (data as { sessionToken?: unknown }).sessionToken : undefined;
  if (typeof issued === "string" && issued) setSessionToken(issued);
  // and a logout must not leave a usable header behind
  if (path.endsWith("/logout")) setSessionToken(null);

  if (!res.ok) {
    const payload = typeof data === "object" && data !== null
      ? data as { error?: unknown; message?: unknown; code?: unknown; details?: unknown }
      : null;
    const fallback = typeof data === "string" && data ? data : `خطای سرور (${res.status})`;
    const message = typeof payload?.message === "string" ? payload.message : typeof payload?.error === "string" ? payload.error : fallback;
    throw new ApiError(message, res.status, typeof payload?.code === "string" ? payload.code : undefined, payload?.details);
  }
  if (text && !parsed.ok) {
    throw new ApiError("پاسخ سرور JSON معتبری ندارد.", res.status, "malformed_response", text.slice(0, 500));
  }
  // 204 and other empty successful responses intentionally remain null. Each
  // endpoint validator decides whether null is meaningful or a missing payload.
  return data as T;
}

function parseJson(text: string): { ok: boolean; data: unknown } {
  if (!text) return { ok: true, data: null };
  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, data: text };
  }
}

export const api = {
  get: <T>(path: string, init: RequestInit = {}) => request<T>(path, { ...init, method: "GET" }),
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
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("no url");
    markApiOnline(true);
    return data.url;
  } catch {
    // offline / static build — keep the image inline as before. The image
    // editor is loaded only on this fallback, not with every API consumer.
    const { fileToDataUrl } = await import("@/builder/ControlsUI");
    return fileToDataUrl(file, 1200);
  }
}

export async function adminLogin(passcode: string) {
  return api.post<{ ok: boolean; message: string }>("/api/admin/login", { passcode });
}

export async function adminLogout() {
  return api.post<{ ok: boolean }>("/api/admin/logout").catch(() => ({ ok: false }));
}
