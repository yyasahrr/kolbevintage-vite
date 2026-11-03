import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DEFAULT_THEME, THEMES, getTheme, type ThemeDef, type ThemeId } from "./themes";

const STORAGE_KEY = "velours.theme.v1";
const SWITCH_CLASS = "theme-switching";

function readStored(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value && THEMES.some((t) => t.id === value)) return value as ThemeId;
  } catch {
    /* storage unavailable — fall back to default */
  }
  return DEFAULT_THEME;
}

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
  setTheme: (id: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<ThemeId>(readStored);
  const theme = getTheme(id);
  const mounted = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme.id);
    } catch {
      /* ignore */
    }

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

  const setTheme = useCallback((next: ThemeId) => setId(next), []);

  const value = useMemo<ThemeContextValue>(() => ({ theme, themes: THEMES, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
