import { useSyncExternalStore } from "react";
import type { ColorOption, Crop, GarmentKind, ProductImage, SizeOption, StockMap } from "@/types";

/** Public, server-authoritative catalogue. The stock map is sellable stock,
 * not physical stock, and is only a snapshot; checkout validates again. */
export interface LiveProduct {
  id: string; name: string; category: string; garment: GarmentKind;
  price: number; compareAt: number | null; description: string | null;
  material: string | null; care: string | null; fit: string | null; origin: string | null;
  badge: string | null; lookId: string | null; lookName: string | null; lookSlug: string | null;
  lookOrder: number; crop: Crop | null; colors: ColorOption[]; sizes: SizeOption[];
  stock: StockMap; active: boolean; featured: boolean; images: ProductImage[]; complements: string[];
}
type Status = "loading" | "online" | "offline";
export interface CatalogSnapshot { status: Status; products: LiveProduct[]; loadedAt: number | null }
let snapshot: CatalogSnapshot = { status: "loading", products: [], loadedAt: null };
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getLiveCatalog = () => snapshot;
export const useLiveCatalog = () => useSyncExternalStore(subscribe, getLiveCatalog, getLiveCatalog);
const publish = (next: CatalogSnapshot) => { snapshot = next; listeners.forEach(fn => fn()); };

export function sellableStock(productId: string, colorId: string, sizeId: string): number {
  if (snapshot.status !== "online" || !snapshot.loadedAt || Date.now() - snapshot.loadedAt > 90_000) return 0;
  const product = snapshot.products.find(item => item.id === productId);
  const value = product?.stock?.[`${colorId}:${sizeId}`];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function validProduct(value: unknown): value is LiveProduct {
  if (!value || typeof value !== "object") return false;
  const p = value as LiveProduct;
  const text = (v: unknown) => typeof v === "string" && v.length > 0;
  return text(p.id) && text(p.name) && text(p.category) && text(p.garment) &&
    typeof p.price === "number" && Number.isFinite(p.price) && p.price >= 0 && p.active === true &&
    Array.isArray(p.colors) && p.colors.length > 0 && p.colors.every(c => c && text(c.id) && text(c.name) && text(c.hex)) &&
    Array.isArray(p.sizes) && p.sizes.length > 0 && p.sizes.every(z => z && text(z.id) && text(z.label)) &&
    !!p.stock && typeof p.stock === "object" && !Array.isArray(p.stock) &&
    Object.values(p.stock).every(v => typeof v === "number" && Number.isFinite(v) && v >= 0) &&
    Array.isArray(p.images) && p.images.every(i => i && text(i.id) && text(i.url) && text(i.colorId) && ["main","gallery","detail","hover"].includes(i.role)) &&
    Array.isArray(p.complements) && p.complements.every(text) &&
    (p.crop === null || (!!p.crop && Number.isFinite(p.crop.cx) && Number.isFinite(p.crop.cy) && Number.isFinite(p.crop.zoom) && p.crop.zoom > 0));
}

let pending: Promise<void> | null = null;
export function refreshLiveCatalog(): Promise<void> {
  if (pending) return pending;
  if (snapshot.loadedAt && Date.now() - snapshot.loadedAt > 90_000) publish({ ...snapshot, status: "offline" });
  pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch("/api/products", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("catalog unavailable");
      const data: unknown = await response.json();
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      if (!Array.isArray(data)) throw new Error("invalid catalog");
      if (!data.every(validProduct) || new Set(data.map(p => p.id)).size !== data.length) throw new Error("invalid product");
      const products = data as LiveProduct[];
      publish({ status: "online", products, loadedAt: Date.now() });
    } catch {
      // Keep the last catalogue visible, but disallow buying with stale stock.
      publish({ ...snapshot, status: "offline" });
    } finally { clearTimeout(timer); }
  })().finally(() => { pending = null; });
  return pending;
}

let started = false;
export function startLiveCatalog() {
  if (started) return;
  started = true;
  void refreshLiveCatalog();
  window.setInterval(() => { if (document.visibilityState === "visible") void refreshLiveCatalog(); }, 30_000);
  window.addEventListener("online", () => void refreshLiveCatalog());
  window.addEventListener("offline", () => publish({ ...snapshot, status: "offline" }));
  window.addEventListener("focus", () => void refreshLiveCatalog());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refreshLiveCatalog(); });
}
