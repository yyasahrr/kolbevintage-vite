"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatNumberFa } from "@/lib/formatters";
import { Plus, Search } from "lucide-react";

interface ColorItem {
  id: number;
  name: string;
  hex: string;
  family: string;
  isActive: boolean;
  usageCount: number;
}

export default function ColorLibraryPage() {
  const { can } = useRole();
  const [colors, setColors] = useState<ColorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#7B2632");
  const [family, setFamily] = useState("گرم");
  const [warningNote, setWarningNote] = useState<string | null>(null);

  const loadColors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/meta", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setColors(data.colors || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadColors();
  }, [loadColors]);

  if (!can("catalog", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="کتابخانه رنگ‌ها" />
      </AdminShell>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/catalog/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "color", name, hex, family }),
    });
    if (res.ok) {
      setName("");
      loadColors();
    }
  };

  const handleToggleActive = async (c: ColorItem) => {
    setWarningNote(null);
    if (c.isActive && c.usageCount > 0) {
      setWarningNote(
        `توجه: رنگ «${c.name}» در ${formatNumberFa(c.usageCount)} کد تنوع فعال یا تاریخی استفاده شده است؛ غیرفعال‌سازی ایمن از انتخاب آن در محصولات جدید جلوگیری می‌کند بدون آنکه سفارش‌های قبلی آسیب ببینند.`
      );
    }
    await fetch("/api/catalog/meta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "color", id: c.id, isActive: !c.isActive }),
    });
    loadColors();
  };

  const filtered = colors.filter(
    (c) =>
      c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      c.family.toLowerCase().includes(search.trim().toLowerCase()) ||
      c.hex.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <AdminShell>
      <PageHeader
        title="کتابخانه رنگ‌های استاندارد مد و پوشاک"
        description="تعریف رنگ‌های قابل استفاده مجدد با کد HEX، خانواده رنگ، تعداد استفاده در SKUها و غیرفعال‌سازی ایمن"
      />

      {warningNote && (
        <div className="mb-4 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-2.5 text-xs text-[#7A4905]">
          {warningNote}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:col-span-8 space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی رنگ، کد HEX یا خانواده..."
              className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs"
            />
          </div>

          {loading ? (
            <LoadingState />
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-9 w-9 rounded-xl border border-black/15 shrink-0 shadow-2xs"
                      style={{ backgroundColor: c.hex }}
                    />
                    <div>
                      <div className="text-xs font-semibold text-[#080707]">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-[#626775]">
                        خانواده {c.family} •{" "}
                        <span className="font-mono">
                          <bdi dir="ltr">{c.hex}</bdi>
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#1813FB]">
                        استفاده در {formatNumberFa(c.usageCount)} کد SKU
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5">
                    <StatusBadge
                      label={c.isActive ? "فعال" : "غیرفعال ایمن"}
                      tone={c.isActive ? "success" : "neutral"}
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleActive(c)}
                      className="text-[11px] font-medium text-[#4B505E] underline hover:text-[#1813FB]"
                    >
                      {c.isActive ? "غیرفعال‌سازی" : "فعال‌سازی مجدد"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit">
          <h2 className="text-sm font-semibold text-[#080707] mb-3">
            افزودن رنگ جدید به کتابخانه
          </h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                نام فارسی رنگ
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: بژ شنی"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                خانواده رنگ
              </label>
              <select
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
              >
                <option value="خنثی">خنثی</option>
                <option value="گرم">گرم</option>
                <option value="سرد">سرد</option>
                <option value="خاکی">خاکی</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                کد رنگ HEX
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-xl border border-[#E5E7EB] p-0.5"
                />
                <input
                  type="text"
                  dir="ltr"
                  value={hex}
                  onChange={(e) => setHex(e.target.value)}
                  className="h-10 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!can("catalog", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Plus className="h-4 w-4" />
              <span>ذخیره در کتابخانه رنگ‌ها</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
