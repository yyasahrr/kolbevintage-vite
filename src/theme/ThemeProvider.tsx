import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { THEMES, getTheme, isThemeId, DEFAULT_THEME, type ThemeDef, type ThemeId } from "./themes";
import { useOps } from "@/state/ops";
import { api } from "@/lib/api";

/*
  The visual theme is a store-level decision, not a visitor preference: it lives
  in the synced ops document, so the admin's choice reaches every shopper and an
  ordinary visitor has no way to switch it.
*/

const SWITCH_CLASS = "theme-switching";

/** Writes the theme's tokens as CSS variables and marks <html> with its id. */
function applyTheme(def: ThemeDef) {
  const root = document.documentElement;
  root.dataset.theme = def.id;
  for (const [name, value] of Object.entries(def.tokens)) {
    root.style.setProperty(name, value);
  }
}

interface ThemeContextValue {
  theme: ThemeDef;
  themes: ThemeDef[];
  /** admin-only: persists the store-wide theme through the ops document */
  setTheme: (id: ThemeId) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const ops = useOps();
  const [published,setPublished] = useState<ThemeId | null>(null);
  const publicationRevision = useRef(0);
  const preview = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("themePreview");
    return isThemeId(requested) ? requested : null;
  }, []);
  const theme = getTheme(preview ?? published ?? (isThemeId(ops.siteTheme) ? ops.siteTheme : DEFAULT_THEME));

  useEffect(() => {
    if (preview) return;
    let live = true, pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const revision = publicationRevision.current;
      try {
        const res = await fetch("/api/public/store-theme", {cache:"no-store",credentials:"same-origin"});
        if (!res.ok) return;
        const data: {theme?:unknown} = await res.json();
        if (live && revision === publicationRevision.current && isThemeId(data.theme)) setPublished(data.theme);
      } catch { /* keep the last published appearance if offline */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus",refresh);window.addEventListener("online",refresh);document.addEventListener("visibilitychange",visible);
    return () => { live=false;window.clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);document.removeEventListener("visibilitychange",visible); };
  }, [preview]);
  const mounted = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    applyTheme(theme);

    // Briefly enable colour/shadow transitions so the switch feels like a
    // material change rather than a hard cut. Skipped on first paint.
    const root = document.documentElement;
    if (mounted.current) {
      root.classList.add(SWITCH_CLASS);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => root.classList.remove(SWITCH_CLASS), 650);
    }
    mounted.current = true;
  }, [theme]);

  useLayoutEffect(() => () => window.clearTimeout(timer.current), []);

  const setTheme = useCallback(async (next: ThemeId) => {
    if (preview || published === null) throw new Error("ابتدا ظاهر منتشرشده را از سرور دریافت کنید.");
    if (published === next) return;
    publicationRevision.current++;
    try {
      const result = await api.patch<{active:ThemeId}>("/api/admin/style-packs",{theme:next,expectedTheme:published});
      publicationRevision.current++;
      setPublished(result.active);
    } catch (error) {
      publicationRevision.current++;
      throw error;
    }
  }, [preview,published]);

  const value = useMemo<ThemeContextValue>(() => ({ theme, themes: THEMES, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
