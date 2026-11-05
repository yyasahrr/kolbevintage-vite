import { useEffect, useRef, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";

/* ---------------------------------------------------------------------
   Local drafts (decision 50).

   A form that takes more than a few seconds to fill keeps a copy in
   localStorage, so a closed tab or a dead connection does not cost the work.
   The copy never leaves the browser: nothing here talks to the server, and
   saving for real clears it.

   Used by the product form, the journal editor, the coupon form, the CRM note
   and the SMS composer.
   --------------------------------------------------------------------- */

const stamp = (v: unknown) => ({ at: Date.now(), v });

export interface LocalDraft {
  /** a draft exists and the form has not taken it yet */
  found: boolean;
  /** how many minutes old the draft is */
  ageMinutes: number | null;
  restore: () => void;
  discard: () => void;
  /** call after a real save */
  clear: () => void;
}

export function useLocalDraft<T>(key: string, snapshot: T, apply: (value: T) => void, enabled = true): LocalDraft {
  const [found, setFound] = useState(false);
  const [ageMinutes, setAgeMinutes] = useState<number | null>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  // look for an older copy whenever the key changes
  useEffect(() => {
    setFound(false);
    setAgeMinutes(null);
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { at?: number; v?: unknown };
      if (!parsed || typeof parsed.at !== "number" || parsed.v === undefined) return;
      setFound(true);
      setAgeMinutes(Math.max(0, Math.round((Date.now() - parsed.at) / 60000)));
    } catch {
      /* private mode or a corrupt draft — behave as if there is none */
    }
  }, [key, enabled]);

  // write, debounced; `enabled` is off while the banner is still asking
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(stamp(latest.current)));
      } catch {
        /* quota or private mode */
      }
    }, 450);
    return () => clearTimeout(t);
  }, [key, enabled, snapshot]);

  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setFound(false);
    setAgeMinutes(null);
  };

  return {
    found,
    ageMinutes,
    restore: () => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { v?: T };
        if (parsed.v !== undefined) apply(parsed.v);
      } catch {
        /* ignore */
      }
      setFound(false);
    },
    discard: clear,
    clear,
  };
}

export function DraftBanner({ draft, what }: { draft: LocalDraft; what: string }) {
  if (!draft.found) return null;
  const age = draft.ageMinutes;
  const when = age === null || age === 0 ? "همین حالا" : age < 60 ? `${age} دقیقه پیش` : `${Math.round(age / 60)} ساعت پیش`;
  return (
    <div className="ad-draft-banner" role="status">
      <span>
        پیش‌نویس {what} از {when} در همین مرورگر مانده — هنوز ذخیره نشده.
      </span>
      <button type="button" className="ad-btn is-sm" onClick={draft.restore}>
        <Undo2 width={13} height={13} /> بازیابی
      </button>
      <button type="button" className="ad-btn is-sm" onClick={draft.discard}>
        <Trash2 width={13} height={13} /> دور انداختن
      </button>
    </div>
  );
}
