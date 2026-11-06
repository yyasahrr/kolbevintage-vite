"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { UnauthorizedState } from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import {
  Layers,
  Monitor,
  Tablet,
  Smartphone,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Lock,
  Sparkles,
  Code2,
} from "lucide-react";

interface StudioSection {
  id: string;
  type: string;
  title: string;
  visible: boolean;
  paddingY: string;
  background: string;
  headingText: string;
  scopedCss: string;
}

const INITIAL_SECTIONS: StudioSection[] = [
  {
    id: "sec-header",
    type: "GlobalHeader",
    title: "هدر سراسری فروشگاه (Global Header)",
    visible: true,
    paddingY: "16px",
    background: "#FFFFFF",
    headingText: "کلبه وینتیج — فروشگاه تخصصی مد و پوشاک اصیل",
    scopedCss: ".kv-header { border-bottom: 1px solid #EFEFF5; }",
  },
  {
    id: "sec-hero",
    type: "EditorialHeroBanner",
    title: "بنر اصلی کالکشن پاییز و زمستان",
    visible: true,
    paddingY: "48px",
    background: "#F7F7FB",
    headingText: "کالکشن ترنچ‌کت‌های پشمی و چرم طبیعی دست‌دوز",
    scopedCss: ".kv-hero-title { letter-spacing: -0.02em; }",
  },
  {
    id: "sec-outfit",
    type: "CuratedOutfitShowcase",
    title: "بخش استایل کامل (Shop the Look)",
    visible: true,
    paddingY: "36px",
    background: "#FFFFFF",
    headingText: "استایل پاییزی پاریسی در تهران — خرید ست یا تک‌قلم",
    scopedCss: ".kv-outfit-card { border-radius: 16px; }",
  },
  {
    id: "sec-products",
    type: "ProductCarouselGrid",
    title: "شبکه محصولات منتخب با سوئیچ رنگ زنده",
    visible: true,
    paddingY: "32px",
    background: "#FAFAFE",
    headingText: "جدیدترین محصولات اضافه شده به کاتالوگ",
    scopedCss: ".kv-swatch-btn { transition: transform 150ms ease; }",
  },
  {
    id: "sec-footer",
    type: "GlobalFooter",
    title: "فوتر سراسری و نمادهای اعتماد",
    visible: true,
    paddingY: "32px",
    background: "#080707",
    headingText: "تمامی حقوق متعلق به فروشگاه اینترنتی کلبه وینتیج است.",
    scopedCss: ".kv-footer { color: #F7F7FB; }",
  },
];

export default function SiteStudioShellPage() {
  const { can } = useRole();
  const [sections, setSections] = useState<StudioSection[]>(INITIAL_SECTIONS);
  const [selectedId, setSelectedId] = useState<string>("sec-hero");
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">(
    "desktop"
  );
  const [templateScope, setTemplateScope] = useState("صفحه اصلی (Homepage)");
  const [draftSavedMsg, setDraftSavedMsg] = useState<string | null>(null);

  if (!can("appearance", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="استودیو طراحی (Site Studio)" />
      </AdminShell>
    );
  }

  const selectedSection =
    sections.find((s) => s.id === selectedId) || sections[0];

  const updateSelected = (patch: Partial<StudioSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.id === selectedSection.id ? { ...s, ...patch } : s))
    );
  };

  const moveSection = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= sections.length) return;
    const copy = [...sections];
    const [removed] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, removed);
    setSections(copy);
  };

  return (
    <AdminShell fullWidth>
      <div className="p-3 sm:p-5 space-y-4">
        <PageHeader
          title="استودیو طراحی بصری صفحات (Site Studio Shell — قرارداد Agent 3)"
          description="پوسته لایه‌بندی و کنترل ویژگی‌های بصری متصل به موتور رندر و انتشار Agent 3"
          badge={
            <StatusBadge
              label="پوسته مشترک Agent 4 • موتور انتشار Agent 3"
              tone="indigo"
            />
          }
          secondaryActions={
            <div className="flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white p-1">
              <button
                type="button"
                onClick={() => setViewport("desktop")}
                title="نمایش دسکتاپ"
                className={`rounded-lg p-1.5 ${
                  viewport === "desktop"
                    ? "bg-[#1813FB] text-white"
                    : "text-[#626775]"
                }`}
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewport("tablet")}
                title="نمایش تبلت"
                className={`rounded-lg p-1.5 ${
                  viewport === "tablet"
                    ? "bg-[#1813FB] text-white"
                    : "text-[#626775]"
                }`}
              >
                <Tablet className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewport("mobile")}
                title="نمایش موبایل"
                className={`rounded-lg p-1.5 ${
                  viewport === "mobile"
                    ? "bg-[#1813FB] text-white"
                    : "text-[#626775]"
                }`}
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
          }
          primaryAction={
            <button
              type="button"
              onClick={() =>
                setDraftSavedMsg(
                  `پیکربندی پیش‌نویس قالب «${templateScope}» آماده ارسال به سرویس نسخه‌بندی Agent 3 ثبت شد.`
                )
              }
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Sparkles className="h-4 w-4" />
              <span>ذخیره پیش‌نویس در قرارداد Agent 3</span>
            </button>
          }
        />

        {draftSavedMsg && (
          <div className="rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
            {draftSavedMsg}
          </div>
        )}

        {/* 3-Pane Layer Panel + Canvas + Contextual Inspector (Divya Mishra Reference) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Pane 1: Hierarchical Section & Layer Tree */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3.5 lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between border-b border-[#EFEFF5] pb-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#080707]">
                <Layers className="h-4 w-4 text-[#1813FB]" />
                <span>درخت لایه‌ها و بخش‌ها</span>
              </div>
              <select
                value={templateScope}
                onChange={(e) => setTemplateScope(e.target.value)}
                aria-label="انتخاب قالب صفحه"
                className="h-7 rounded-lg border border-[#E5E7EB] bg-[#FAFAFE] px-2 text-[11px]"
              >
                <option value="صفحه اصلی (Homepage)">صفحه اصلی</option>
                <option value="صفحه دسته‌بندی">دسته‌بندی</option>
                <option value="صفحه محصول (PDP)">صفحه محصول</option>
                <option value="صفحه کمپین">لندینگ کمپین</option>
              </select>
            </div>

            <div className="space-y-1.5">
              {sections.map((sec, idx) => {
                const active = sec.id === selectedSection.id;
                return (
                  <div
                    key={sec.id}
                    onClick={() => setSelectedId(sec.id)}
                    className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs cursor-pointer transition-colors ${
                      active
                        ? "border-[#1813FB] bg-[#F0EEFF] font-semibold text-[#1813FB]"
                        : "border-[#EFEFF5] bg-[#FAFAFE] text-[#344054] hover:border-[#C1BCF2]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate">{sec.title}</div>
                      <div className="font-mono text-[10px] text-[#626775]">
                        <bdi dir="ltr">{sec.type}</bdi>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSection(idx, -1);
                        }}
                        className="rounded p-1 hover:bg-white"
                        title="بالا"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSection(idx, 1);
                        }}
                        className="rounded p-1 hover:bg-white"
                        title="پایین"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSections((prev) =>
                            prev.map((s) =>
                              s.id === sec.id
                                ? { ...s, visible: !s.visible }
                                : s
                            )
                          );
                        }}
                        className="rounded p-1 hover:bg-white"
                        title={sec.visible ? "مخفی کردن" : "نمایش"}
                      >
                        {sec.visible ? (
                          <Eye className="h-3.5 w-3.5" />
                        ) : (
                          <EyeOff className="h-3.5 w-3.5 text-[#98A2B3]" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl bg-[#FFFAEB] border border-[#FEDF89] p-2.5 text-[11px] text-[#7A4905] flex items-start gap-1.5">
              <Lock className="h-3.5 w-3.5 text-[#9A5B04] shrink-0 mt-0.5" />
              <span>
                صفحات تسویه‌حساب، پرداخت بانکی و احراز هویت به دلایل امنیتی از
                ویرایش بصری خارج هستند.
              </span>
            </div>
          </div>

          {/* Pane 2: Responsive Live Canvas */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-[#EFEFF6] p-4 lg:col-span-6 flex justify-center overflow-x-auto">
            <div
              className={`rounded-2xl border border-[#D0D5DD] bg-white shadow-sm overflow-hidden transition-all ${
                viewport === "mobile"
                  ? "w-[360px]"
                  : viewport === "tablet"
                  ? "w-[640px]"
                  : "w-full"
              }`}
            >
              <div className="bg-[#FAFAFE] border-b border-[#EFEFF5] px-4 py-2 text-[11px] text-[#626775] flex justify-between">
                <span>پیش‌نمایش زنده: {templateScope}</span>
                <span className="font-mono uppercase">{viewport}</span>
              </div>

              <div className="divide-y divide-[#EFEFF5]">
                {sections
                  .filter((s) => s.visible)
                  .map((sec) => {
                    const isSel = sec.id === selectedSection.id;
                    const isDark = sec.background === "#080707";
                    return (
                      <div
                        key={sec.id}
                        onClick={() => setSelectedId(sec.id)}
                        style={{
                          backgroundColor: sec.background,
                          paddingTop: sec.paddingY,
                          paddingBottom: sec.paddingY,
                        }}
                        className={`px-5 cursor-pointer transition-all ${
                          isSel ? "ring-2 ring-inset ring-[#1813FB]" : ""
                        } ${isDark ? "text-white" : "text-[#080707]"}`}
                      >
                        <div className="flex items-center justify-between text-[10px] opacity-70 mb-1">
                          <span>{sec.title}</span>
                          <span className="font-mono">
                            <bdi dir="ltr">{sec.type}</bdi>
                          </span>
                        </div>
                        <div className="text-sm font-bold leading-snug">
                          {sec.headingText}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Pane 3: Contextual Property Inspector & Scoped CSS */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:col-span-3 space-y-4 h-fit">
            <div className="border-b border-[#EFEFF5] pb-2.5">
              <span className="text-[11px] font-semibold text-[#1813FB]">
                تنظیمات بخش انتخاب‌شده
              </span>
              <h3 className="mt-0.5 text-sm font-bold text-[#080707]">
                {selectedSection.title}
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#344054] mb-1">
                  تیتر / متن نمایشی بخش
                </label>
                <input
                  type="text"
                  value={selectedSection.headingText}
                  onChange={(e) =>
                    updateSelected({ headingText: e.target.value })
                  }
                  className="h-9 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-[#344054] mb-1">
                    فاصله عمودی (Padding)
                  </label>
                  <select
                    value={selectedSection.paddingY}
                    onChange={(e) =>
                      updateSelected({ paddingY: e.target.value })
                    }
                    className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs"
                  >
                    <option value="16px">فشرده (16px)</option>
                    <option value="32px">استاندارد (32px)</option>
                    <option value="48px">گسترده (48px)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-[#344054] mb-1">
                    پس‌زمینه بخش
                  </label>
                  <select
                    value={selectedSection.background}
                    onChange={(e) =>
                      updateSelected({ background: e.target.value })
                    }
                    className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2 text-xs"
                  >
                    <option value="#FFFFFF">سفید خالص</option>
                    <option value="#F7F7FB">خاکستری روشن</option>
                    <option value="#F0EEFF">یاسی ملایم</option>
                    <option value="#080707">مشکی تیره</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 font-medium text-[#344054] mb-1">
                  <Code2 className="h-3.5 w-3.5 text-[#1813FB]" />
                  <span>CSS محدود به همین بخش (Scoped CSS)</span>
                </div>
                <textarea
                  rows={3}
                  dir="ltr"
                  value={selectedSection.scopedCss}
                  onChange={(e) =>
                    updateSelected({ scopedCss: e.target.value })
                  }
                  className="w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] p-2.5 text-left font-mono text-[11px]"
                />
                <span className="mt-1 block text-[10px] text-[#626775]">
                  تزریق اسکریپت یا کد سراسری غیرمجاز مسدود است؛ استایل فقط با
                  شناسه یکتای بخش ایزوله می‌شود.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
