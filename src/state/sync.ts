import { useSyncExternalStore } from "react";
import { api, apiIsOnline, markApiOnline, type ServerBootstrap } from "@/lib/api";
import { hydrateAdmin, getAdmin } from "./admin";
import { hydrateOps, getOps } from "./ops";
import { registerRemote, type RemoteKind as Kind } from "./persist";

/* =====================================================================
   Server sync: hydrate the local stores from PostgreSQL on boot and push
   every admin/ops change back (debounced) through /api/state/:kind.
   ===================================================================== */

export type SyncState = "connecting" | "online" | "offline";

interface SyncStatus {
  state: SyncState;
  lastSaved: number | null;
  error: string | null;
}

let status: SyncStatus = { state: "connecting", lastSaved: null, error: null };
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getSyncStatus = () => status;
export const useSyncStatus = () => useSyncExternalStore(subscribe, getSyncStatus, getSyncStatus);

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  emit();
}

const DEBOUNCE = 700;
let hydrated = false;
const pending = new Map<Kind, unknown>();
const timers = new Map<Kind, number>();
const saving = new Map<Kind, boolean>();

function queue(kind: Kind, value: unknown) {
  pending.set(kind, value);
  // never overwrite the server with pre-hydration local state
  if (!hydrated) return;
  const existing = timers.get(kind);
  if (existing) window.clearTimeout(existing);
  timers.set(
    kind,
    window.setTimeout(() => void flush(kind), DEBOUNCE),
  );
}

async function flush(kind: Kind) {
  timers.delete(kind);
  if (saving.get(kind)) return;
  const value = pending.get(kind);
  if (value === undefined) return;
  pending.delete(kind);
  saving.set(kind, true);
  try {
    await api.put(`/api/state/${kind}`, value);
    markApiOnline(true);
    setStatus({ state: "online", lastSaved: Date.now(), error: null });
  } catch (error) {
    markApiOnline(false);
    pending.set(kind, value);
    setStatus({ state: "offline", error: error instanceof Error ? error.message : "اتصال به سرور برقرار نشد" });
    // retry later with the latest snapshot
    window.setTimeout(() => void flush(kind), 4000);
  } finally {
    saving.delete(kind);
    if (pending.has(kind)) {
      const latest = pending.get(kind);
      if (latest !== undefined && !timers.has(kind)) {
        timers.set(kind, window.setTimeout(() => void flush(kind), DEBOUNCE));
      }
    }
  }
}

registerRemote("admin", (value) => queue("admin", value));
registerRemote("ops", (value) => queue("ops", value));

let hydrating = false;

export async function hydrateFromServer(attempt = 0): Promise<boolean> {
  if (hydrating) return false;
  hydrating = true;
  try {
    const boot = await api.get<ServerBootstrap>("/api/bootstrap");
    if (boot.admin && Object.keys(boot.admin).length) hydrateAdmin(boot.admin);
    if (boot.ops && Object.keys(boot.ops).length) hydrateOps(boot.ops);
    markApiOnline(true);
    hydrated = true;
    setStatus({ state: "online", error: null });
    for (const queued of pending.keys()) void flush(queued);
    return true;
  } catch (error) {
    markApiOnline(false);
    setStatus({
      state: attempt === 0 ? "connecting" : "offline",
      error: error instanceof Error ? error.message : "سرور در دسترس نیست",
    });
    if (attempt < 8) window.setTimeout(() => void hydrateFromServer(attempt + 1), 3000);
    return false;
  } finally {
    hydrating = false;
  }
}

export function flushNow() {
  if (!hydrated) return;
  for (const kind of ["admin", "ops"] as Kind[]) {
    const timer = timers.get(kind);
    if (timer) window.clearTimeout(timer);
    void flush(kind);
  }
}

let started = false;

/** call once from main.tsx */
export function startSync() {
  if (started) return;
  started = true;

  // hydrate after first paint so the prototype shows instantly
  window.setTimeout(() => void hydrateFromServer(), 0);
  const retry = window.setInterval(() => {
    if (!apiIsOnline()) void hydrateFromServer(3);
    else window.clearInterval(retry);
  }, 8000);

  window.addEventListener("online", () => {
    setStatus({ state: "connecting" });
    void hydrateFromServer(1);
    flushNow();
  });
  window.addEventListener("offline", () => setStatus({ state: "offline" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);
}

/** helper for pages that want to show something meaningful before hydration finishes */
export const currentSnapshotSize = () => JSON.stringify({ admin: getAdmin(), ops: getOps() }).length;
