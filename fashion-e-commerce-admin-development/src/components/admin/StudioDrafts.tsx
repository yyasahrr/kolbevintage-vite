"use client";
import { useCallback, useEffect, useState } from "react";
import { StudioPublishing } from "./StudioPublishing";

type Block = {
  id: string;
  type: "hero" | "banner" | "text" | "video" | "products" | "campaign";
  heading: string;
  text: string;
  buttonText: string;
  href: string;
  image: string;
  video?: string;
  campaignId?: string;
};
type Draft = {
  id: string;
  title: string;
  version: number;
  blocks: Block[];
  updatedAt: string;
  archived?: boolean;
  visual?: unknown;
};
type API = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: object): Promise<T>;
  patch<T>(path: string, body: object): Promise<T>;
};
const input =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-500";
const button =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs disabled:opacity-50";
function safeImage(value: string) {
  if (/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value)) return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !/[\u0000-\u0020\\]/.test(value)
      ? value
      : "";
  } catch {
    return "";
  }
}
const names = {
  hero: "هیرو تصویری",
  banner: "بنر تبلیغاتی",
  text: "بخش متن",
  video: "ویدیوی تمام‌صفحه",
  products: "محصولات پویا",
  campaign: "بنر کمپین",
};
export function StudioDrafts({
  api,
  can,
  onDirtyChange,
}: {
  api: API;
  can: (p: string) => boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<Draft[] | null>(null),
    [draft, setDraft] = useState<Draft | null>(null),
    [original, setOriginal] = useState<Draft | null>(null),
    [newTitle, setNewTitle] = useState("");
  const [campaigns, setCampaigns] = useState<
      | {
          id: string;
          name: string;
          active: boolean;
          audience: unknown;
          earlyAccess: unknown;
          restrictedDraft: boolean;
        }[]
      | null
    >(null),
    [campaignError, setCampaignError] = useState("");
  const canViewCampaigns = can("campaigns:view");
  useEffect(() => {
    if (!canViewCampaigns) return;
    let mounted = true;
    api
      .get<{
        rules: {
          id: string;
          name: string;
          active: boolean;
          audience: unknown;
          earlyAccess: unknown;
          restrictedDraft: boolean;
        }[];
      }>("/api/admin/marketing")
      .then((r) => {
        if (mounted)
          setCampaigns(r.rules.filter((v) => v.id.startsWith("cmp-")));
      })
      .catch(() => {
        if (mounted) setCampaignError("فهرست کمپین‌ها در دسترس نیست.");
      });
    return () => {
      mounted = false;
    };
  }, [api, canViewCampaigns]);
  const [undoStack, setUndoStack] = useState<Draft[]>([]),
    [redoStack, setRedoStack] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop"),
    [drag, setDrag] = useState<string | null>(null);
  const dirty =
    !!draft &&
    !!original &&
    (draft.title !== original.title ||
      JSON.stringify(draft.blocks) !== JSON.stringify(original.blocks));
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);
  const load = useCallback(async () => {
    const list = await api.get<Draft[]>("/api/admin/studio/drafts");
    const legacy = list.filter(d => !d.visual);
    setRows(legacy);
    return legacy;
  }, [api]);
  useEffect(() => {
    let mounted = true;
    api
      .get<Draft[]>("/api/admin/studio/drafts")
      .then((r) => {
        if (mounted) setRows(r.filter(d => !d.visual));
      })
      .catch((e) => {
        if (mounted)
          setError(
            e instanceof Error ? e.message : "دریافت پیش‌نویس ناموفق بود.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [api]);
  function resetHistory() {
    setUndoStack([]);
    setRedoStack([]);
  }
  function update(next: Draft) {
    if (!draft) return;
    setUndoStack((old) => [...old.slice(-49), draft]);
    setRedoStack([]);
    setDraft(next);
  }
  function undo() {
    if (!draft || !undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((old) => old.slice(0, -1));
    setRedoStack((old) => [...old.slice(-49), draft]);
    setDraft(previous);
  }
  function redo() {
    if (!draft || !redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((old) => old.slice(0, -1));
    setUndoStack((old) => [...old.slice(-49), draft]);
    setDraft(next);
  }
  function replace(next: Draft | null) {
    if (dirty && !window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"))
      return;
    setDraft(next);
    setOriginal(next);
    resetHistory();
    setError("");
    setNotice("");
  }
  async function refresh() {
    if (
      dirty &&
      !window.confirm("تغییرات ذخیره‌نشده کنار گذاشته و فهرست تازه شود؟")
    )
      return;
    setBusy(true);
    setError("");
    try {
      const list = await load();
      const next = draft ? (list.find((d) => d.id === draft.id) ?? null) : null;
      setDraft(next);
      setOriginal(next);
      resetHistory();
      setNotice("فهرست تازه شد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت پیش‌نویس ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (dirty && !window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"))
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.post<Draft>("/api/admin/studio/drafts", {
        title: newTitle,
      });
      setRows((old) => [...(old ?? []), next]);
      setDraft(next);
      setOriginal(next);
      resetHistory();
      setNewTitle("");
      setNotice("پیش‌نویس ساخته شد؛ در سایت منتشر نشده است.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ساخت پیش‌نویس ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft || !original) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.patch<Draft>(
        `/api/admin/studio/drafts/${encodeURIComponent(draft.id)}`,
        {
          title: draft.title,
          blocks: draft.blocks,
          expectedVersion: original.version,
        },
      );
      setRows((old) => old?.map((d) => (d.id === next.id ? next : d)) ?? null);
      setDraft(next);
      setOriginal(next);
      resetHistory();
      setNotice("پیش‌نویس ذخیره شد؛ سایت عمومی تغییر نکرد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ذخیره ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!draft || !original) return;
    if (
      !window.confirm(
        `${draft.archived ? "پیش‌نویس از بایگانی بازگردانده" : "پیش‌نویس بایگانی"} شود؟${dirty ? " تغییرات ذخیره‌نشده کنار گذاشته می‌شوند." : ""} صفحهٔ منتشرشده تغییر نمی‌کند.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await api.post<Draft>(
        `/api/admin/studio/drafts/${encodeURIComponent(draft.id)}/archive`,
        { archived: !draft.archived, expectedVersion: original.version },
      );
      setRows((old) => old?.map((d) => (d.id === next.id ? next : d)) ?? null);
      setDraft(next);
      setOriginal(next);
      resetHistory();
      setNotice(
        next.archived ? "پیش‌نویس بایگانی شد." : "پیش‌نویس بازگردانده شد.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "بایگانی ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!draft || !original || !draft.archived) return;
    if (
      !window.confirm(
        "پیش‌نویس بایگانی‌شده برای همیشه حذف شود؟ در صورت وابستگی به صفحه یا تاریخچه، سرور حذف را رد می‌کند.",
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api.post(
        `/api/admin/studio/drafts/${encodeURIComponent(draft.id)}/delete`,
        { expectedVersion: original.version },
      );
      setRows((old) => old?.filter((d) => d.id !== draft.id) ?? null);
      setDraft(null);
      setOriginal(null);
      resetHistory();
      setNotice("پیش‌نویس بدون وابستگی حذف شد.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حذف ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }
  function add(type: Block["type"]) {
    if (!draft || draft.blocks.length >= 30) return;
    const id = `b_${crypto.randomUUID().replaceAll("-", "")}`;
    const block: Block = {
      id,
      type,
      heading:
        type === "hero"
          ? "عنوان هیرو"
          : type === "banner"
            ? "عنوان بنر"
            : type === "video"
              ? "عنوان ویدیو"
              : type === "products"
                ? "محصولات منتخب"
                : type === "campaign"
                  ? "کمپین ویژه"
                  : "عنوان بخش",
      text: "",
      buttonText: "",
      href: "",
      image: "",
      ...(type === "video" ? { video: "" } : {}),
      ...(type === "campaign" ? { campaignId: "" } : {}),
    };
    update({ ...draft, blocks: [...draft.blocks, block] });
  }
  function preset(kind: "editorial" | "promotion") {
    if (!draft || draft.blocks.length > 28) return;
    const make = (
      type: Block["type"],
      heading: string,
      text: string,
    ): Block => ({
      id: `b_${crypto.randomUUID().replaceAll("-", "")}`,
      type,
      heading,
      text,
      buttonText: "",
      href: "",
      image: "",
    });
    update({
      ...draft,
      blocks: [
        ...draft.blocks,
        kind === "editorial"
          ? make(
              "hero",
              "کلکسیون تازه",
              "عنوان و تصویر دلخواه را اینجا تنظیم کنید.",
            )
          : make("banner", "پیشنهاد ویژه", "پیام تبلیغاتی خود را بنویسید."),
        make(
          "products",
          "محصولات فروشگاه",
          "قیمت نهایی هنگام خرید محاسبه می‌شود.",
        ),
      ],
    });
  }
  function patchBlock(id: string, values: Partial<Block>) {
    if (draft)
      update({
        ...draft,
        blocks: draft.blocks.map((b) =>
          b.id === id ? { ...b, ...values } : b,
        ),
      });
  }
  function move(from: number, to: number) {
    if (
      !draft ||
      from < 0 ||
      to < 0 ||
      from >= draft.blocks.length ||
      to >= draft.blocks.length ||
      from === to
    )
      return;
    const blocks = [...draft.blocks];
    const [item] = blocks.splice(from, 1);
    blocks.splice(to, 0, item);
    update({ ...draft, blocks });
  }
  return (
    <section
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4"
      aria-label="استودیو پیش‌نویس"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">آزمایشگاه صفحه‌ساز · پیش‌نویس</h2>
          <p className="mt-1 text-xs leading-6 text-slate-600">
            بلوک‌ها را بچینید و پیش‌نویس را در سرور ذخیره کنید. پیش‌نمایش محلی
            است؛ انتشار صفحهٔ مستقل به تأیید جداگانه نیاز دارد.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          className={button}
          onClick={() => void refresh()}
        >
          تازه‌سازی پیش‌نویس‌ها
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error} اگر اتصال قطع شد، پیش از تلاش دوباره فهرست را تازه و نتیجه را
          بررسی کنید.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block text-sm">
            پیش‌نویس‌های ذخیره‌شده
            <select
              aria-label="انتخاب پیش‌نویس استودیو"
              disabled={busy || !rows}
              className={input}
              value={draft?.id ?? ""}
              onChange={(e) =>
                replace(rows?.find((d) => d.id === e.target.value) ?? null)
              }
            >
              <option value="">انتخاب کنید…</option>
              {rows?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} · نسخه {d.version}
                  {d.archived ? " · بایگانی" : ""}
                </option>
              ))}
            </select>
          </label>
          {can("design:edit") && (
            <form
              onSubmit={(e) => void create(e)}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="min-w-0 flex-1 text-sm">
                عنوان پیش‌نویس جدید
                <input
                  className={input}
                  required
                  maxLength={120}
                  value={newTitle}
                  disabled={busy || !rows}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </label>
              <button className={button} disabled={busy || !rows}>
                ساخت پیش‌نویس
              </button>
            </form>
          )}
          {draft && (
            <>
              <label className="block text-sm">
                عنوان صفحه
                <input
                  className={input}
                  maxLength={120}
                  disabled={busy || !can("design:edit") || draft.archived}
                  value={draft.title}
                  onChange={(e) => update({ ...draft, title: e.target.value })}
                />
              </label>
              {can("design:edit") && !draft.archived && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={busy || !undoStack.length}
                    onClick={undo}
                  >
                    واگرد
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || !redoStack.length}
                    onClick={redo}
                  >
                    بازانجام
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length >= 30}
                    onClick={() => add("hero")}
                  >
                    افزودن هیرو
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length >= 30}
                    onClick={() => add("banner")}
                  >
                    افزودن بنر
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length >= 30}
                    onClick={() => add("text")}
                  >
                    افزودن متن
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length >= 30}
                    onClick={() => add("video")}
                  >
                    افزودن ویدیوی تمام‌صفحه
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length >= 30}
                    onClick={() => add("products")}
                  >
                    افزودن محصولات پویا
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={
                      busy || draft.blocks.length >= 30 || !canViewCampaigns
                    }
                    onClick={() => add("campaign")}
                  >
                    افزودن بنر کمپین
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length > 28}
                    onClick={() => preset("editorial")}
                  >
                    قالب آماده: هیرو و محصولات
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={busy || draft.blocks.length > 28}
                    onClick={() => preset("promotion")}
                  >
                    قالب آماده: بنر و محصولات
                  </button>
                </div>
              )}
              {draft.blocks.length === 0 && (
                <p className="text-sm text-slate-600">
                  هنوز بلوکی افزوده نشده است.
                </p>
              )}
              {draft.blocks.map((b, i) => (
                <article
                  key={b.id}
                  className="space-y-2 rounded-xl border border-slate-200 p-3"
                  onDragOver={(e) => {
                    if (drag) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag) {
                      move(
                        draft.blocks.findIndex((x) => x.id === drag),
                        i,
                      );
                      setDrag(null);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="flex-1 text-sm">
                      {names[b.type]} · {i + 1}
                    </strong>
                    {can("design:edit") && !draft.archived && (
                      <>
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          draggable
                          onDragStart={(e) => {
                            setDrag(b.id);
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", b.id);
                          }}
                          onDragEnd={() => setDrag(null)}
                          aria-label={`کشیدن ${names[b.type]} ${i + 1}`}
                        >
                          جابه‌جایی ↕
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy || i === 0}
                          onClick={() => move(i, i - 1)}
                          aria-label={`بردن ${names[b.type]} ${i + 1} به بالا`}
                        >
                          بالا
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy || i === draft.blocks.length - 1}
                          onClick={() => move(i, i + 1)}
                          aria-label={`بردن ${names[b.type]} ${i + 1} به پایین`}
                        >
                          پایین
                        </button>
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            update({
                              ...draft,
                              blocks: draft.blocks.filter(
                                (item) => item.id !== b.id,
                              ),
                            })
                          }
                          aria-label={`حذف ${names[b.type]} ${i + 1}`}
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </div>
                  {b.type === "campaign" && (
                    <>
                      <label className="block text-xs">
                        کمپین عمومی
                        <select
                          className={input}
                          disabled={
                            busy ||
                            !can("design:edit") ||
                            !!draft.archived ||
                            !campaigns
                          }
                          value={b.campaignId ?? ""}
                          onChange={(e) =>
                            patchBlock(b.id, { campaignId: e.target.value })
                          }
                        >
                          <option value="">انتخاب کنید…</option>
                          {campaigns?.map((c) => (
                            <option
                              key={c.id}
                              value={c.id}
                              disabled={
                                !!c.audience ||
                                !!c.earlyAccess ||
                                c.restrictedDraft
                              }
                            >
                              {c.name} ·{" "}
                              {c.audience || c.earlyAccess || c.restrictedDraft
                                ? "مخاطب محدود — پشتیبانی نمی‌شود"
                                : c.active
                                  ? "فعال"
                                  : "غیرفعال"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-xs text-slate-600">
                        این بنر فقط هنگام فعال بودن کمپین عمومی و در بازهٔ زمانی
                        آن نمایش داده می‌شود. انتشار طراحی کمپین را فعال
                        نمی‌کند. کمپین‌های مخاطب‌دار نمایش عمومی ندارند.
                      </p>
                      {!canViewCampaigns && (
                        <p className="text-xs text-red-700">
                          برای انتخاب کمپین مجوز مشاهدهٔ کمپین لازم است.
                        </p>
                      )}
                      {campaignError && (
                        <p className="text-xs text-red-700">{campaignError}</p>
                      )}
                    </>
                  )}
                  {(
                    [
                      ["heading", "عنوان", 160],
                      ["text", "متن", 2000],
                      ["buttonText", "متن دکمه", 80],
                      ["href", "نشانی دکمه", 2000],
                      ["image", "نشانی تصویر HTTPS یا فایل فروشگاه", 2000],
                      ["video", "نشانی ویدیو HTTPS یا فایل فروشگاه", 2000],
                    ] as const
                  )
                    .filter(([k]) => k !== "video" || b.type === "video")
                    .filter(
                      ([k]) =>
                        !["text", "products"].includes(b.type) ||
                        (k !== "image" && k !== "href" && k !== "buttonText"),
                    )
                    .map(([k, label, max]) => (
                      <label key={k} className="block text-xs">
                        {label}
                        <input
                          className={input}
                          maxLength={max}
                          disabled={
                            busy || !can("design:edit") || draft.archived
                          }
                          value={b[k] ?? ""}
                          onChange={(e) =>
                            patchBlock(b.id, { [k]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                </article>
              ))}
              {can("design:edit") && !draft.archived && (
                <button
                  type="button"
                  disabled={busy || !dirty || !draft.title.trim()}
                  onClick={() => void save()}
                  className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  ذخیره پیش‌نویس
                </button>
              )}
              {can("design:edit") && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => void archive()}
                  >
                    {draft.archived
                      ? "بازگرداندن پیش‌نویس"
                      : "بایگانی پیش‌نویس"}
                  </button>
                  {draft.archived && can("content:publish") && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => void remove()}
                    >
                      حذف دائمی پیش‌نویس
                    </button>
                  )}
                </div>
              )}
              {dirty && (
                <p className="text-xs text-amber-800">
                  تغییرات ذخیره‌نشده دارید؛ پیش از خروج از این بخش آن‌ها را
                  ذخیره کنید.
                </p>
              )}
            </>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="ml-auto text-sm font-bold">
              پیش‌نمایش لحظه‌ای بلوک‌ها
            </h3>
            {(["desktop", "tablet", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={device === d}
                className={button}
                onClick={() => setDevice(d)}
              >
                {d === "desktop"
                  ? "دسکتاپ"
                  : d === "tablet"
                    ? "تبلت"
                    : "موبایل"}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-600">
            این پیش‌نمایش طراحی اولیه است، نه رندر نهایی سایت؛ دکمه‌ها عملیاتی
            نیستند.
          </p>
          <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-2">
            <div
              className="mx-auto min-h-40 bg-white"
              style={{
                width:
                  device === "mobile"
                    ? 320
                    : device === "tablet"
                      ? 768
                      : "100%",
                maxWidth: device === "desktop" ? "100%" : undefined,
              }}
            >
              {draft?.blocks.map((b) => (
                <div
                  key={b.id}
                  className={`relative overflow-hidden ${b.type === "hero" || b.type === "video" ? "min-h-56 bg-slate-900 text-white" : b.type === "banner" || b.type === "campaign" ? "bg-indigo-100 text-indigo-950" : "bg-white text-slate-900"} p-5`}
                >
                  {safeImage(b.image) && (
                    <img
                      src={safeImage(b.image)}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover opacity-40"
                    />
                  )}
                  {b.type === "video" && (
                    <span className="relative text-xs">
                      پیش‌نمایش جلد ویدیو؛ پخش در صفحهٔ عمومی
                    </span>
                  )}
                  {b.type === "products" && (
                    <span className="relative text-xs">
                      فهرست محصولات فعال هنگام مشاهدهٔ صفحه از کاتالوگ دریافت
                      می‌شود.
                    </span>
                  )}
                  <div className="relative">
                    <h4 className="text-xl font-bold">
                      {b.heading || "بدون عنوان"}
                    </h4>
                    <p className="mt-2 whitespace-pre-wrap text-sm">{b.text}</p>
                    {b.buttonText && (
                      <span className="mt-3 inline-block rounded-lg bg-white px-3 py-2 text-xs text-slate-900 shadow">
                        {b.buttonText}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <StudioPublishing api={api} can={can} draft={draft} dirty={dirty} />
    </section>
  );
}
