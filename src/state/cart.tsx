import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CartLine, ColorOption, Product, SizeOption } from "@/types";
import { stockOf, variantKey } from "@/data/looks";

export interface AddPayload {
  product: Product;
  color: ColorOption;
  size: SizeOption;
  lookName: string;
}

type Action =
  | { type: "hydrate"; lines: CartLine[] }
  | { type: "add"; items: AddPayload[] }
  | { type: "remove"; key: string }
  | { type: "qty"; key: string; delta: number }
  | { type: "clear" };

const BAG_KEY = "velours.bag.v1";
const WISH_KEY = "velours.wishlist.v1";

const lineKey = (p: AddPayload) => `${p.product.id}:${variantKey(p.color.id, p.size.id)}`;

function reducer(state: CartLine[], action: Action): CartLine[] {
  switch (action.type) {
    case "hydrate":
      return action.lines;
    case "add": {
      const next = [...state];
      for (const item of action.items) {
        const key = lineKey(item);
        const max = stockOf(item.product, item.color.id, item.size.id);
        if (max <= 0) continue;
        const existing = next.findIndex((l) => l.key === key);
        if (existing >= 0) {
          next[existing] = { ...next[existing], qty: Math.min(max, next[existing].qty + 1) };
        } else {
          next.push({
            key,
            productId: item.product.id,
            name: item.product.name,
            category: item.product.category,
            garment: item.product.garment,
            price: item.product.price,
            colorName: item.color.name,
            colorHex: item.color.hex,
            sizeLabel: item.size.label,
            colorId: item.color.id,
            sizeId: item.size.id,
            lookName: item.lookName,
            qty: 1,
          });
        }
      }
      return next;
    }
    case "remove":
      return state.filter((l) => l.key !== action.key);
    case "qty":
      return state
        .map((l) => (l.key === action.key ? { ...l, qty: Math.max(0, l.qty + action.delta) } : l))
        .filter((l) => l.qty > 0);
    case "clear":
      return [];
    default:
      return state;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export interface Toast {
  id: number;
  title: string;
  detail?: string;
}

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (items: AddPayload[], toast?: { title: string; detail?: string }) => void;
  remove: (key: string) => void;
  setQty: (key: string, delta: number) => void;
  clear: () => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  notify: (title: string, detail?: string) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  wishlist: string[];
  toggleWish: (id: string) => void;
  isWished: (id: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, dispatch] = useReducer(reducer, [] as CartLine[]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlist, setWishlist] = useState<string[]>(() => readStorage<string[]>(WISH_KEY, []));
  const seq = useRef(0);
  const hydrated = useRef(false);

  useEffect(() => {
    const saved = readStorage<CartLine[]>(BAG_KEY, []);
    if (saved.length) dispatch({ type: "hydrate", lines: saved });
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(BAG_KEY, JSON.stringify(lines));
    } catch {
      /* storage might be unavailable — the bag still works in-memory */
    }
  }, [lines]);

  useEffect(() => {
    try {
      localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
    } catch {
      /* ignore */
    }
  }, [wishlist]);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (title: string, detail?: string) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, title, detail }]);
      window.setTimeout(() => dismissToast(id), 3400);
    },
    [dismissToast],
  );

  const add = useCallback<CartContextValue["add"]>(
    (items, toast) => {
      const valid = items.filter((i) => stockOf(i.product, i.color.id, i.size.id) > 0);
      if (!valid.length) return;
      dispatch({ type: "add", items: valid });
      if (toast) notify(toast.title, toast.detail);
    },
    [notify],
  );

  const toggleWish = useCallback(
    (id: string) => {
      setWishlist((prev) => {
        const has = prev.includes(id);
        notify(has ? "از علاقه‌مندی‌ها حذف شد" : "به علاقه‌مندی‌ها اضافه شد", has ? undefined : "برای دیدن فهرست، آیکن قلب در هدر.");
        return has ? prev.filter((x) => x !== id) : [...prev, id];
      });
    },
    [notify],
  );

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = lines.reduce((n, l) => n + l.qty * l.price, 0);
    return {
      lines,
      count,
      subtotal,
      add,
      remove: (key) => dispatch({ type: "remove", key }),
      setQty: (key, delta) => dispatch({ type: "qty", key, delta }),
      clear: () => dispatch({ type: "clear" }),
      toasts,
      dismissToast,
      notify,
      cartOpen,
      setCartOpen,
      wishlist,
      toggleWish,
      isWished: (id: string) => wishlist.includes(id),
    };
  }, [lines, toasts, add, dismissToast, notify, cartOpen, wishlist, toggleWish]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
