import { useSyncExternalStore } from "react";
import { uid } from "@/builder/tree";

/* ------------------------------------------------------------------ */
/* an item placed on the style canvas                                  */
/* ------------------------------------------------------------------ */

export interface CanvasItem {
  id: string;
  productId: string;
  /** percentage coordinates inside the board */
  x: number;
  y: number;
  /** relative scale, 1 = natural */
  scale: number;
  rotate: number;
  flip: boolean;
  colorId: string;
  sizeId: string;
  z: number;
  /** which wizard slot it came from, if any */
  slot?: string;
}

export interface SavedOutfit {
  id: string;
  name: string;
  at: number;
  items: CanvasItem[];
}

export interface OutfitState {
  items: CanvasItem[];
  saved: SavedOutfit[];
  board: "studio" | "floor" | "dark" | "grid";
  snap: boolean;
  zoom: number;
}

const KEY = "velours.outfit.v1";

const DEFAULT: OutfitState = { items: [], saved: [], board: "studio", snap: true, zoom: 1 };

function read(): OutfitState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<OutfitState>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let cache: OutfitState = typeof window === "undefined" ? DEFAULT : read();
const listeners = new Set<() => void>();

function commit(next: OutfitState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export const useOutfit = () => useSyncExternalStore(subscribe, getOutfit, getOutfit);
export const getOutfit = () => cache;
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const nextZ = (items: CanvasItem[]) => (items.length ? Math.max(...items.map((i) => i.z)) + 1 : 1);

export function addItem(productId: string, colorId: string, sizeId: string, at?: { x: number; y: number }, slot?: string) {
  const items = cache.items;
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    // same product twice = just bring it forward and bump the colour/size
    commit({ ...cache, items: items.map((i) => (i.id === existing.id ? { ...i, colorId, sizeId, z: nextZ(items) } : i)) });
    return existing.id;
  }
  const id = uid();
  const count = items.length;
  const item: CanvasItem = {
    id,
    productId,
    x: at?.x ?? 18 + ((count * 13) % 56),
    y: at?.y ?? 16 + ((count * 9) % 52),
    scale: 1,
    rotate: 0,
    flip: false,
    colorId,
    sizeId,
    z: nextZ(items),
    slot,
  };
  commit({ ...cache, items: [...items, item] });
  return id;
}

export function patchItem(id: string, patch: Partial<CanvasItem>) {
  commit({ ...cache, items: cache.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
}

export function removeItem(id: string) {
  commit({ ...cache, items: cache.items.filter((i) => i.id !== id) });
}

export function bringToFront(id: string) {
  patchItem(id, { z: nextZ(cache.items) });
}

export function sendToBack(id: string) {
  const min = cache.items.length ? Math.min(...cache.items.map((i) => i.z)) - 1 : 0;
  patchItem(id, { z: min });
}

export function duplicateItem(id: string) {
  const src = cache.items.find((i) => i.id === id);
  if (!src) return;
  commit({
    ...cache,
    items: [...cache.items, { ...src, id: uid(), x: Math.min(88, src.x + 7), y: Math.min(84, src.y + 6), z: nextZ(cache.items) }],
  });
}

export function clearBoard() {
  commit({ ...cache, items: [] });
}

export function setItems(items: CanvasItem[]) {
  commit({ ...cache, items });
}

export function setBoard(board: OutfitState["board"]) {
  commit({ ...cache, board });
}
export function setSnap(snap: boolean) {
  commit({ ...cache, snap });
}
export function setZoom(zoom: number) {
  commit({ ...cache, zoom });
}

export function saveOutfit(name: string) {
  const outfit: SavedOutfit = { id: uid(), name, at: Date.now(), items: JSON.parse(JSON.stringify(cache.items)) };
  commit({ ...cache, saved: [outfit, ...cache.saved].slice(0, 24) });
  return outfit;
}
export function loadOutfit(id: string) {
  const o = cache.saved.find((x) => x.id === id);
  if (o) commit({ ...cache, items: JSON.parse(JSON.stringify(o.items)) });
}
export function removeOutfit(id: string) {
  commit({ ...cache, saved: cache.saved.filter((o) => o.id !== id) });
}
