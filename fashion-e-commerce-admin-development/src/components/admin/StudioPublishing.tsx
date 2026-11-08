"use client";
import { useCallback, useEffect, useState } from "react";
type Snapshot = {
  revision: number;
  draftId: string;
  draftVersion: number;
  title: string;
  publishedAt: string;
};
type Page = {
  slug: string;
  revision: number;
  active: boolean;
  current: Snapshot;
  history: Snapshot[];
};
type API = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: object): Promise<T>;
};
export function StudioPublishing({
  api,
  can,
  draft,
  dirty,
}: {
  api: API;
  can: (p: string) => boolean;
  draft: {
    id: string;
    title: string;
    version: number;
    blocks: unknown[];
    visual?: unknown;
    archived?: boolean;
  } | null;
  dirty: boolean;
}) {
  const [pages, setPages] = useState<Page[] | null>(null),
    [slug, setSlug] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const result = await api.get<Page[]>("/api/admin/studio/pages");
    setPages(result);
  }, [api]);
  useEffect(() => {
    let mounted = true;
    api
      .get<Page[]>("/api/admin/studio/pages")
      .then((v) => {
        if (mounted) setPages(v);
      })
      .catch((e) => {
        if (mounted)
          setError(
            e instanceof Error ? e.message : "دریافت صفحه‌ها ناموفق بود.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [api]);
  const pagesReady = pages !== null;
  useEffect(() => {
    if (!draft) return;
    const own = pages?.find((p) => p.current.draftId === draft.id);
    setSlug(own?.slug ?? `page-${draft.id.slice(6, 14)}`);
  }, [draft?.id, pagesReady]);
  const page = pages?.find((p) => p.slug === slug);
  const allowed = can("design:edit") && can("content:publish");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      await load();
      setNotice("وضعیت انتشار تازه شد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت وضعیت ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!draft || !pages || dirty) return;
    if (
      !window.confirm(
        `نسخه ذخیره‌شده در نشانی /#/studio/${slug} منتشر شود؟ انتشار طراحی هیچ کمپین یا تخفیفی را فعال نمی‌کند.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.post<Page>("/api/admin/studio/pages/publish", {
        slug,
        draftId: draft.id,
        expectedDraftVersion: draft.version,
        expectedPageRevision: page?.revision ?? 0,
      });
      setPages((old) => [
        ...(old ?? []).filter((p) => p.slug !== next.slug),
        next,
      ]);
      setNotice("صفحه منتشر شد. برای دیدن آن پیوند عمومی را باز کنید.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "انتشار ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function action(
    kind: "restore" | "unpublish" | "clear-history",
    revision?: number,
  ) {
    if (!page) return;
    if (
      !window.confirm(
        kind === "restore"
          ? `نسخه ${revision} دوباره منتشر شود؟`
          : kind === "clear-history"
            ? "تاریخچهٔ قدیمی برای همیشه حذف شود؟ فقط نسخهٔ فعلی باقی می‌ماند."
            : "صفحه از دسترس عمومی خارج شود؟",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body =
        kind === "restore"
          ? { expectedPageRevision: page.revision, restoreRevision: revision }
          : { expectedPageRevision: page.revision };
      const next = await api.post<Page>(
        `/api/admin/studio/pages/${encodeURIComponent(page.slug)}/${kind}`,
        body,
      );
      setPages(
        (old) => old?.map((p) => (p.slug === next.slug ? next : p)) ?? null,
      );
      setNotice(
        kind === "restore"
          ? "نسخهٔ انتخابی منتشر شد."
          : kind === "clear-history"
            ? "تاریخچهٔ قدیمی حذف شد."
            : "صفحه از انتشار خارج شد.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "عملیات ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4"
      aria-label="انتشار صفحه استودیو"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">انتشار مستقل صفحه</h3>
        <button
          type="button"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
          disabled={busy}
          onClick={() => void refresh()}
        >
          تازه‌سازی وضعیت انتشار
        </button>
      </div>
      <p className="text-xs leading-6 text-slate-700">
        صفحه در مسیر مستقل منتشر می‌شود و جایگزین صفحهٔ اصلی یا تنظیمات مالی
        فروشگاه نمی‌شود. فقط نسخهٔ ذخیره‌شده منتشر می‌شود؛ ۲۰ نسخهٔ آخر برای
        بازگشت نگه داشته می‌شود.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error} در صورت قطع ارتباط، پیش از تلاش دوباره وضعیت را تازه کنید.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-indigo-900">
          {notice}
        </p>
      )}
      {!draft ? (
        <p className="text-sm">ابتدا یک پیش‌نویس انتخاب کنید.</p>
      ) : (
        <>
          <label className="block text-sm">
            نام نشانی انگلیسی
            <input
              dir="ltr"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              value={slug}
              maxLength={64}
              onChange={(e) => setSlug(e.target.value)}
              disabled={busy || !allowed || !pages}
            />
          </label>
          <p className="break-all text-xs" dir="ltr">
            /#/studio/{slug || "..."}
          </p>
          {page && (
            <p className="text-xs">
              وضعیت: {page.active ? "منتشرشده" : "خارج از انتشار"} · نسخهٔ
              انتشار {page.revision} · پیش‌نویس نسخهٔ{" "}
              {page.current.draftVersion}
              {page.current.draftId !== draft.id
                ? " · این نشانی متعلق به پیش‌نویس دیگری است."
                : ""}
            </p>
          )}
          {draft.archived && (
            <p className="text-xs text-amber-800">
              برای انتشار جدید ابتدا پیش‌نویس را از بایگانی بازگردانید.
            </p>
          )}
          {dirty && (
            <p className="text-xs text-amber-800">
              ابتدا تغییرات پیش‌نویس را ذخیره کنید.
            </p>
          )}
          {!allowed && (
            <p className="text-xs">
              برای انتشار، مجوز ویرایش طراحی و انتشار محتوا لازم است.
            </p>
          )}
          {allowed && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                disabled={
                  busy ||
                  !pages ||
                  dirty ||
                  !!draft.archived ||
                  !(draft.visual && typeof draft.visual === 'object' && 'content' in draft.visual && Array.isArray(draft.visual.content) ? draft.visual.content.length : draft.blocks.length) ||
                  !slug ||
                  (!!page && page.current.draftId !== draft.id)
                }
                onClick={() => void publish()}
              >
                انتشار نسخهٔ ذخیره‌شده
              </button>
              {page?.active && page.current.draftId === draft.id && (
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void action("unpublish")}
                >
                  خارج کردن از انتشار
                </button>
              )}
            </div>
          )}
          {page?.active && (
            <a
              className="inline-block text-sm text-indigo-800 underline"
              href={`/#/studio/${encodeURIComponent(page.slug)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              مشاهده صفحهٔ عمومی
            </a>
          )}
          {page && page.current.draftId === draft.id && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold">تاریخچهٔ انتشار</h4>
              {allowed && page.history.length > 1 && (
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void action("clear-history")}
                >
                  حذف تاریخچهٔ قدیمی
                </button>
              )}
              <ul className="space-y-1">
                {[...page.history].reverse().map((v) => (
                  <li
                    key={v.revision}
                    className="flex flex-wrap items-center gap-2 text-xs"
                  >
                    <span>
                      نسخه {v.revision} · {v.title} ·{" "}
                      {new Date(v.publishedAt).toLocaleString("fa-IR")}
                    </span>
                    {allowed && (
                      <button
                        type="button"
                        className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-50"
                        disabled={busy}
                        onClick={() => void action("restore", v.revision)}
                      >
                        بازگردانی و انتشار
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
