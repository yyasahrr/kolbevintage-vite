import { useEffect, useState } from "react";

/* A tiny read-only loader for widget data that lives on the server (a shopper's
   browser has no orders, so "best sellers" and view counts must come from the
   backend). It reports three honest states: loading, loaded, failed — a widget
   shows nothing rather than a made-up number when the request fails. */

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  failed: boolean;
}

export function useApiGet<T>(path: string | null): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: Boolean(path), failed: false });

  useEffect(() => {
    if (!path) {
      setState({ data: null, loading: false, failed: false });
      return;
    }
    let alive = true;
    setState({ data: null, loading: true, failed: false });
    void (async () => {
      try {
        const { api } = await import("@/lib/api");
        const data = await api.get<T>(path);
        if (alive) setState({ data, loading: false, failed: false });
      } catch {
        if (alive) setState({ data: null, loading: false, failed: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  return state;
}
