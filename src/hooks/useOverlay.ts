import { useEffect } from "react";

/**
 * Escape closes an overlay.
 * Every dialog in the shop should honour the same key, otherwise keyboard users
 * get stuck inside a sheet with no way back.
 */
export function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
}

/** Reference-counted so switching between overlays cannot unlock the page early. */
let scrollLocks = 0;
let overflowBeforeLock = "";

export function useScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    if (scrollLocks === 0) overflowBeforeLock = document.body.style.overflow;
    scrollLocks += 1;
    document.body.style.overflow = "hidden";
    return () => {
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.body.style.overflow = overflowBeforeLock;
    };
  }, [open]);
}

/** Keep keyboard focus in a modal and return it to the invoking control on close. */
export function useDialogFocus(open: boolean, ref: import("react").RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((el) =>
      el.tabIndex >= 0 && !el.closest("[inert]") && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden",
    );
    (focusable()[0] ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); if (previous?.isConnected) previous.focus(); };
  }, [open, ref]);
}
