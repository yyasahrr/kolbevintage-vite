import { fileToDataUrl } from "@/builder/ControlsUI";

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  const token = csrfToken();
  const method = (init.method ?? "GET").toUpperCase();
  if (token && method !== "GET" && method !== "HEAD") headers.set("x-csrf-token", token);
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
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
    const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form, credentials: "include" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("no url");
    markApiOnline(true);
    return data.url;
  } catch {
    // offline / static build — keep the image inline as before
    return fileToDataUrl(file, 1200);
  }
}

export async function adminLogin(passcode: string) {
  return api.post<{ ok: boolean; message: string }>("/api/admin/login", { passcode });
}

export async function adminLogout() {
  return api.post<{ ok: boolean }>("/api/admin/logout").catch(() => ({ ok: false }));
}
