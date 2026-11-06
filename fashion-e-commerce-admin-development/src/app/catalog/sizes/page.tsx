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
import { Plus, Ruler } from "lucide-react";

interface SizeTemplateRow {
  id: number;
  name: string;
  categoryType: string;
  sizesJson: string[];
  measurementSchemaJson: string[];
  guideNotes: string;
}

export default function SizeTemplatesPage() {
  const { can } = useRole();
  const [templates, setTemplates] = useState<SizeTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [categoryType, setCategoryType] = useState("clothing");
  const [sizesCsv, setSizesCsv] = useState("XS, S, M, L, XL");
  const [fieldsCsv, setFieldsCsv] = useState(
    "دور کمر (سانتی‌متر), دور باسن (سانتی‌متر), قد دامن (سانتی‌متر)"
  );
  const [guideNotes, setGuideNotes] = useState("");

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/catalog/meta", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.sizeTemplates || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  if (!can("catalog", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="الگوهای سایز و اندازه‌گیری" />
      </AdminShell>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/catalog/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "size_template",
        name: name.trim(),
        categoryType,
        sizesJson: sizesCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        measurementSchemaJson: fieldsCsv
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean),
        guideNotes: guideNotes.trim(),
      }),
    });
    if (res.ok) {
      setName("");
      setGuideNotes("");
      loadTemplates();
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="الگوهای سایز و راهنمای اندازه‌گیری تخصصی"
        description="جداکردن فیلدهای اندازه‌گیری پوشاک، کفش و اکسسوری به جای تحمیل یک جدول یکسان به همه محصولات"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-8">
          {loading ? (
            <LoadingState />
          ) : (
            templates.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0EEFF] text-[#1813FB]">
                      <Ruler className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#080707]">
                        {t.name}
                      </h3>
                      <span className="text-[11px] text-[#626775]">
                        گروه ساختاری:{" "}
                        {t.categoryType === "shoes"
                          ? "کفش و بوت"
                          : t.categoryType === "accessories"
                          ? "کیف و اکسسوری"
                          : "پوشاک و بالاپوش"}
                      </span>
                    </div>
                  </div>
                  <StatusBadge label="الگوی فعال" tone="indigo" />
                </div>

                <div>
                  <div className="text-[11px] font-medium text-[#626775] mb-1">
                    ترتیب سایزهای مجاز الگو:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.sizesJson.map((sz) => (
                      <span
                        key={sz}
                        className="rounded-lg border border-[#E5E7EB] bg-[#FAFAFE] px-2.5 py-1 text-xs font-semibold text-[#080707]"
                      >
                        {sz}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-medium text-[#626775] mb-1">
                    فیلدهای اندازه‌گیری تخصصی این الگو:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.measurementSchemaJson.map((m) => (
                      <span
                        key={m}
                        className="rounded-lg bg-[#F0EEFF] px-2.5 py-1 text-[11px] font-medium text-[#1813FB]"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {t.guideNotes && (
                  <p className="text-xs text-[#626775] bg-[#FAFAFE] rounded-xl p-2.5">
                    {t.guideNotes}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit">
          <h2 className="text-sm font-semibold text-[#080707] mb-3">
            ساخت الگوی سایز جدید
          </h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                نام الگو
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: الگوی شلوار و دامن زنانه"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                نوع دسته کالا
              </label>
              <select
                value={categoryType}
                onChange={(e) => setCategoryType(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
              >
                <option value="clothing">پوشاک (Clothing)</option>
                <option value="shoes">کفش و بوت (Shoes)</option>
                <option value="accessories">اکسسوری و کیف (Accessories)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                لیست سایزها (با کامای انگلیسی جدا کنید)
              </label>
              <input
                type="text"
                dir="ltr"
                value={sizesCsv}
                onChange={(e) => setSizesCsv(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                ستون‌های اندازه‌گیری (با کاما جدا کنید)
              </label>
              <textarea
                rows={3}
                value={fieldsCsv}
                onChange={(e) => setFieldsCsv(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                راهنمای اندازه‌گیری برای مشتری
              </label>
              <input
                type="text"
                value={guideNotes}
                onChange={(e) => setGuideNotes(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!can("catalog", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Plus className="h-4 w-4" />
              <span>ذخیره الگوی سایز</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
