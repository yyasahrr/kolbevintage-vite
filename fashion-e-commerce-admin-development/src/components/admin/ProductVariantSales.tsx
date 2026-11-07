"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Variant = {
  id: string;
  sku: string;
  colorName: string;
  sizeLabel: string;
  saleEnabled: boolean;
  version: number;
  variantActive: boolean;
  productActive: boolean;
};
type API = {
  get<T>(path: string): Promise<T>;
  patch<T>(path: string, body: object): Promise<T>;
};
const button =
  "rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:opacity-50";

export function ProductVariantSales({
  api,
  productId,
  canEdit,
  onChange,
  onBusy,
  refreshKey,
}: {
  api: API;
  productId: string;
  canEdit: boolean;
  onChange: () => Promise<void>;
  onBusy: (busy: boolean) => void;
  refreshKey: number;
}) {
  const [rows, setRows] = useState<Variant[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<{ name: string; result: string }[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const path = `/api/admin/products/${encodeURIComponent(productId)}/variant-sales`;
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const n = ++requestVersion.current;
    setError("");
    try {
      const result = await api.get<Variant[]>(path);
      if (n !== requestVersion.current) return false;
      setRows(result);
      setSelected([]);
      return true;
    } catch (e) {
      if (n === requestVersion.current) {
        setRows(null);
        setError(e instanceof Error ? e.message : "تنوع‌ها دریافت نشدند.");
      }
      return false;
    }
  }, [api, path]);
  useEffect(() => {
    void load();
    return () => {
      requestVersion.current++;
    };
  }, [load, refreshKey]);
  async function toggle(row: Variant) {
    setBusy(true);
    onBusy(true);
    setError("");
    setSuccess("");
    try {
      await api.patch(`${path}/${encodeURIComponent(row.id)}`, {
        saleEnabled: !row.saleEnabled,
        expectedEnabled: row.saleEnabled,
        expectedVersion: row.version,
      });
      const loaded = await load();
      await onChange();
      setSuccess(
        loaded
          ? "وضعیت فروش تنوع ثبت شد."
          : "وضعیت ثبت شد؛ برای دیدن اطلاعات تازه، دوباره تلاش کنید.",
      );
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "ثبت وضعیت ناموفق بود."} اگر اتصال قطع شده، نتیجه را پیش از تلاش مجدد تازه‌سازی و بررسی کنید.`,
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function bulk(target: boolean) {
    const chosen = (rows ?? []).filter((row) => selected.includes(row.id));
    const changed = chosen.filter((row) => row.saleEnabled !== target);
    if (
      !changed.length ||
      !window.confirm(
        `${changed.length} تنوع ${target ? "فعال" : "متوقف"} شود؟ درخواست‌ها جداگانه ثبت می‌شوند؛ ممکن است نتیجه جزئی باشد.`,
      )
    )
      return;
    setBusy(true);
    onBusy(true);
    setError("");
    setSuccess("");
    setResults([]);
    const report: { name: string; result: string }[] = [];
    try {
      for (let i = 0; i < changed.length; i++) {
        const row = changed[i],
          name = `${row.colorName} · ${row.sizeLabel} (${row.sku})`;
        try {
          await api.patch(`${path}/${encodeURIComponent(row.id)}`, {
            saleEnabled: target,
            expectedEnabled: row.saleEnabled,
            expectedVersion: row.version,
          });
          report.push({ name, result: "ثبت شد" });
        } catch (e) {
          const status = (e as { status?: number })?.status;
          const known =
            typeof status === "number" && status >= 400 && status < 500;
          report.push({
            name,
            result: known
              ? `ثبت نشد: ${e instanceof Error ? e.message : "خطا"}`
              : "نتیجه نامعلوم؛ قبل از تلاش مجدد بررسی کنید",
          });
          if (!known) {
            for (const rest of changed.slice(i + 1))
              report.push({
                name: `${rest.colorName} · ${rest.sizeLabel} (${rest.sku})`,
                result: "ارسال نشد",
              });
            break;
          }
        }
      }
      for (const row of chosen.filter((row) => row.saleEnabled === target))
        report.push({
          name: `${row.colorName} · ${row.sizeLabel} (${row.sku})`,
          result: "بدون تغییر",
        });
      setResults(report);
      const loaded = await load();
      try {
        await onChange();
      } catch {
        setError("فهرست محصول تازه نشد؛ پیش از اقدام مجدد آن را تازه کنید.");
      }
      setSuccess(
        loaded
          ? "عملیات گروهی پایان یافت؛ نتیجه هر تنوع را بررسی کنید."
          : "عملیات پایان یافت؛ دریافت وضعیت تازه ناموفق بود.",
      );
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-slate-200 p-3"
      aria-label="وضعیت فروش تنوع‌ها"
    >
      <h3 className="font-bold">فروش هر رنگ و سایز</h3>
      <p className="text-xs leading-6 text-slate-500">
        توقف فروش فقط مانع سفارش و رزرو جدید این ترکیب می‌شود؛ موجودی، SKU و
        سفارش‌ها تغییر نمی‌کنند. رزروهای قبلی لغو نمی‌شوند و ممکن است پرداخت و
        تکمیل شوند. اگر کل محصول غیرفعال باشد، تنوع فعال هم قابل فروش نیست.
      </p>
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={() => void load()}
      >
        تازه‌سازی تنوع‌ها
      </button>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {success && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-sm text-green-800"
        >
          {success}
        </p>
      )}
      {canEdit && rows && rows.length > 0 && (
        <div className="space-y-2 rounded-xl bg-indigo-50 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={busy}
              checked={selected.length === rows.length}
              onChange={(e) =>
                setSelected(e.target.checked ? rows.map((r) => r.id) : [])
              }
            />
            انتخاب همهٔ تنوع‌های این محصول
          </label>
          <p className="text-xs">
            {selected.length} تنوع انتخاب شده؛ فعال‌سازی{" "}
            {
              rows.filter((r) => selected.includes(r.id) && !r.saleEnabled)
                .length
            }
            ، توقف{" "}
            {
              rows.filter((r) => selected.includes(r.id) && r.saleEnabled)
                .length
            }
            . این کار موجودی یا رزروهای قبلی را تغییر نمی‌دهد.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={
                busy ||
                !selected.some((id) =>
                  rows.some((r) => r.id === id && !r.saleEnabled),
                )
              }
              onClick={() => void bulk(true)}
            >
              فعال‌سازی گروهی فروش
            </button>
            <button
              type="button"
              className={button}
              disabled={
                busy ||
                !selected.some((id) =>
                  rows.some((r) => r.id === id && r.saleEnabled),
                )
              }
              onClick={() => void bulk(false)}
            >
              توقف گروهی فروش
            </button>
          </div>
        </div>
      )}
      {results.length > 0 && (
        <div
          className="rounded-xl border border-slate-200 p-3"
          aria-label="نتیجه عملیات گروهی"
        >
          <h4 className="text-sm font-bold">گزارش هر تنوع</h4>
          <ul>
            {results.map((r) => (
              <li key={r.name} className="break-words text-xs leading-6">
                {r.name}: {r.result}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows === null ? (
        <p className="text-sm">فهرست تنوع‌ها دریافت نشده است.</p>
      ) : !rows.length ? (
        <p className="text-sm">تنوعی ثبت نشده است.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"
            >
              <div className="min-w-0">
                {canEdit && (
                  <label className="mr-1 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={selected.includes(row.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked
                            ? [...old, row.id]
                            : old.filter((id) => id !== row.id),
                        )
                      }
                    />
                    <span className="sr-only">
                      انتخاب {row.colorName} {row.sizeLabel} برای عملیات گروهی
                    </span>
                  </label>
                )}
                <b>
                  {row.colorName} · {row.sizeLabel}
                </b>
                <div className="break-all text-xs text-slate-500">
                  <bdi dir="ltr">{row.sku}</bdi>
                </div>
                <div className="mt-1 text-xs">
                  {row.saleEnabled
                    ? !row.productActive
                      ? "تنوع فعال، محصول غیرفعال"
                      : row.variantActive
                        ? "فروش تنوع فعال"
                        : "تنوع در کاتالوگ غیرفعال است"
                    : "فروش تنوع متوقف"}
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() => void toggle(row)}
                >
                  {row.saleEnabled
                    ? `توقف فروش ${row.colorName} ${row.sizeLabel}`
                    : `فعال کردن فروش ${row.colorName} ${row.sizeLabel}`}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
