import { formatJalali } from "@/utils/date";
import { createContext, useContext, useEffect, useState } from "react";
import type { Device, Settings } from "./core";

/** In the editor the canvas simulates a device; on the live site we follow the real window width. */
export const DeviceCtx = createContext<Device | null>(null);

export function useDevice(): Device {
  const forced = useContext(DeviceCtx);
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const f = () => setW(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  if (forced) return forced;
  return w <= 767 ? "mobile" : w <= 1024 ? "tablet" : "desktop";
}

export const suffixOf = (d: Device) => (d === "tablet" ? "Tablet" : d === "mobile" ? "Mobile" : "");

/** responsive value with cascade: mobile → tablet → desktop */
export function rv<T = any>(s: Settings, key: string, device: Device, fallback?: T): T {
  const keys = device === "mobile" ? [`${key}Mobile`, `${key}Tablet`, key] : device === "tablet" ? [`${key}Tablet`, key] : [key];
  for (const k of keys) {
    const v = s[k];
    if (v !== undefined && v !== "" && v !== null) return v as T;
  }
  return fallback as T;
}

/** absolute path → hash route so links work inside the HashRouter */
export const href = (u?: string) => (u ? (u.startsWith("/") ? `#${u}` : u) : undefined);

export function dyn(text: unknown): string {
  const t = String(text ?? "");
  if (!t.includes("{{")) return t;
  return t
    .replace(/\{\{\s*site-title\s*\}\}/g, "ولور")
    .replace(/\{\{\s*year\s*\}\}/g, new Date().getFullYear().toLocaleString("fa-IR", { useGrouping: false }))
    .replace(/\{\{\s*date\s*\}\}/g, formatJalali(new Date()))
    .replace(/\{\{\s*page-title\s*\}\}/g, typeof document !== "undefined" ? document.title : "");
}
