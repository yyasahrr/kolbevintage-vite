/* Recently viewed products, kept in this browser only (used by the
   «بازدیدهای اخیر» widget). Nothing here is uploaded. */

const KEY = "kv_recent_products";
const MAX = 12;

export function rememberView(productId: string) {
  if (!productId) return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = [productId, ...list.filter((id) => id !== productId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — the widget simply stays empty */
  }
}

export function recentViews(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}
