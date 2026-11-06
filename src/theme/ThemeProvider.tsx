import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { THEMES, getTheme, type ThemeDef, type ThemeId } from "./themes";
import { getOps, patchOps, useOps } from "@/state/ops";

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
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const ops = useOps();
  const theme = getTheme(ops.siteTheme);
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

  const setTheme = useCallback((next: ThemeId) => {
    if (getOps().siteTheme !== next) patchOps({ siteTheme: next });
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, themes: THEMES, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
