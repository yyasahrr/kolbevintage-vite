import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PERMISSIONS, type Permission } from "@/admin/rbac";

/* =====================================================================
   Who am I, and what may I do — read once from the server.

   `GET /api/admin/me` is the single source of truth for the panel's
   sidebar. When the API cannot answer (static preview, offline) we say so
   instead of pretending: the panel then runs in local mode, where the
   server's permission checks are simply not in play.
   ===================================================================== */

export interface AdminStaff {
  id: string;
  name: string;
  roleId: string;
  roleName: string;
}

export interface AdminMe {
  authenticated: boolean;
  subject: string | null;
  staff: AdminStaff | null;
  role: string | null;
  permissions: Permission[];
  /** "offline" = the API never answered; permissions are local-only */
  mode: "server" | "offline";
  error?: string;
}

const ALL: Permission[] = [...PERMISSIONS];

export const OFFLINE_ME: AdminMe = {
  authenticated: false,
  subject: null,
  staff: null,
  role: null,
  permissions: ALL,
  mode: "offline",
};

let cache: AdminMe | null = null;
let inflight: Promise<AdminMe> | null = null;

export const invalidateAdminMe = () => {
  cache = null;
  inflight = null;
};

export async function loadAdminMe(force = false): Promise<AdminMe> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;
  inflight = api
    .get<Omit<AdminMe, "mode">>("/api/admin/me")
    .then((me) => {
      const next: AdminMe = { ...me, permissions: me.permissions ?? [], mode: "server" };
      cache = next;
      return next;
    })
    .catch((err: unknown) => {
      const next: AdminMe = {
        ...OFFLINE_ME,
        error: err instanceof Error ? err.message : "ارتباط با سرور برقرار نشد.",
      };
      cache = next;
      return next;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAdminMe() {
  const [me, setMe] = useState<AdminMe | null>(cache);
  const [loading, setLoading] = useState(!cache);

  const reload = useCallback(() => {
    setLoading(true);
    invalidateAdminMe();
    void loadAdminMe(true).then((next) => {
      setMe(next);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let alive = true;
    if (cache) {
      setMe(cache);
      setLoading(false);
      return;
    }
    void loadAdminMe().then((next) => {
      if (!alive) return;
      setMe(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  /** local mode: no server to ask, so the panel must not claim a role */
  const offline = me?.mode === "offline";
  return {
    me,
    loading,
    offline,
    error: me?.error ?? null,
    permissions: me?.permissions ?? [],
    /** while loading we show nothing rather than everything */
    ready: !loading && me !== null,
    reload,
  };
}
