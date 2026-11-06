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
import { Check, Sparkles, RotateCcw, Eye, ShieldCheck } from "lucide-react";

interface StylePackRow {
  id: number;
  key: string;
  name: string;
  persianName: string;
  aestheticCategory: string;
  description: string;
  primaryColor: string;
  surfaceColor: string;
  accentColor: string;
  fontPairing: string;
  compatibleTemplatesJson: string[];
  isActive: boolean;
  version: string;
}

export default function StylePacksPage() {
  const { can } = useRole();
  const [packs, setPacks] = useState<StylePackRow[]>([]);
  const [previewPack, setPreviewPack] = useState<StylePackRow | null>(null);
  const [previousPackId, setPreviousPackId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishToast, setPublishToast] = useState<string | null>(null);

  const loadPacks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/appearance", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list: StylePackRow[] = data.stylePacks || [];
        setPacks(list);
        const active = list.find((p) => p.isActive) || list[0];
        if (active) setPreviewPack(active);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPacks();
  }, [loadPacks]);

  if (!can("appearance", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="پک‌های ظاهری ویترین (Style Packs)" />
      </AdminShell>
    );
  }

  const activePack = packs.find((p) => p.isActive);

  const handleActivate = async (targetId: number) => {
    if (activePack && activePack.id !== targetId) {
      setPreviousPackId(activePack.id);
    }
    setPublishToast(null);
    const res = await fetch("/api/appearance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: targetId }),
    });
    const data = await res.json();
    if (res.ok) {
      setPublishToast(
        `پک ظاهری «${data.activatedPack.persianName}» با موفقیت از طریق قرارداد انتشار Agent 3 روی ویترین فروشگاه فعال شد.`
      );
      loadPacks();
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="گالری پک‌های ظاهری ویترین فروشگاه (Storefront Style Packs)"
        description="تغییر یکپارچه هویت بصری ویترین مشتریان با پیش‌نمایش، بررسی سازگاری قالب‌ها و قابلیت بازگشت به نسخه قبلی"
        secondaryActions={
          previousPackId ? (
            <button
              type="button"
              onClick={() => handleActivate(previousPackId)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#080707] hover:bg-[#F7F7FB]"
            >
              <RotateCcw className="h-4 w-4 text-[#1813FB]" />
              <span>بازگشت به نسخه قبلی (Rollback)</span>
            </button>
          ) : undefined
        }
      />

      {/* Architectural Boundary Notice */}
      <div className="mb-5 rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF]/60 p-4 text-xs text-[#344054] flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-[#1813FB] shrink-0 mt-0.5" />
        <span>
          <strong>تفکیک معماری ویترین و پنل مدیریت:</strong> پک‌های ظاهری زیر
          (شامل Soft UI، Glassmorphism، Liquid Glass، Editorial، Bento، Swiss
          Design و...) فقط توکن‌های ظاهری ویترین مشتریان را تنظیم می‌کنند؛ پوسته
          عملیاتی پنل ادمین برای حفظ تمرکز و خوانایی همکاران ثابت باقی می‌ماند.
        </span>
      </div>

      {publishToast && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {publishToast}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Style Pack Cards Gallery */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:col-span-8">
            {packs.map((pack) => {
              const isSelected = previewPack?.id === pack.id;
              return (
                <div
                  key={pack.id}
                  onClick={() => setPreviewPack(pack)}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all flex flex-col justify-between space-y-3 ${
                    pack.isActive
                      ? "border-[#1813FB] bg-white ring-2 ring-[#1813FB]/15"
                      : isSelected
                      ? "border-[#A9A4E7] bg-white"
                      : "border-[#E5E7EB] bg-white hover:border-[#C1BCF2]"
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Swatch Mini Preview Banner */}
                    <div
                      className="flex h-16 items-center justify-between rounded-xl border border-black/10 px-4"
                      style={{ backgroundColor: pack.surfaceColor }}
                    >
                      <span
                        className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                        style={{
                          backgroundColor: pack.accentColor,
                          color: pack.primaryColor,
                        }}
                      >
                        {pack.aestheticCategory}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-4 w-4 rounded-full border border-black/15"
                          style={{ backgroundColor: pack.primaryColor }}
                        />
                        <span
                          className="h-4 w-4 rounded-full border border-black/15"
                          style={{ backgroundColor: pack.accentColor }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[#080707]">
                          {pack.persianName}
                        </h3>
                        <span className="font-mono text-[11px] text-[#626775]">
                          <bdi dir="ltr">
                            {pack.name} • v{pack.version}
                          </bdi>
                        </span>
                      </div>
                      {pack.isActive && (
                        <StatusBadge label="فعال در ویترین" tone="success" />
                      )}
                    </div>

                    <p className="text-xs text-[#626775] leading-relaxed">
                      {pack.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-[#EFEFF5] pt-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewPack(pack);
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#344054]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>بررسی سازگاری</span>
                    </button>

                    {pack.isActive ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#127A4B]">
                        <Check className="h-4 w-4" />
                        <span>منتشرشده</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!can("appearance", "publish")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActivate(pack.id);
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#1813FB] px-3 text-xs font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>اعتبارسنجی و انتشار</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 4 Cols: Compatibility & Token Inspector */}
          {previewPack && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit space-y-4">
              <div className="border-b border-[#EFEFF5] pb-3">
                <span className="text-[11px] font-semibold text-[#1813FB]">
                  بازرس توکن و سازگاری قالب (Agent 3 Contract)
                </span>
                <h3 className="mt-0.5 text-base font-bold text-[#080707]">
                  {previewPack.persianName}
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#626775]">سبک زیبایی‌شناختی:</span>
                  <span className="font-semibold">
                    <bdi dir="ltr">{previewPack.aestheticCategory}</bdi>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#626775]">تایپوگرافی پیشنهادی:</span>
                  <span className="font-medium">{previewPack.fontPairing}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#626775]">رنگ اصلی کنش:</span>
                  <span className="font-mono">
                    <bdi dir="ltr">{previewPack.primaryColor}</bdi>
                  </span>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#080707] mb-1.5">
                  قالب‌های تاییدشده سازگار:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {previewPack.compatibleTemplatesJson.map((tpl) => (
                    <StatusBadge key={tpl} label={tpl} tone="indigo" />
                  ))}
                </div>
              </div>

              {!previewPack.isActive && (
                <button
                  type="button"
                  disabled={!can("appearance", "publish")}
                  onClick={() => handleActivate(previewPack.id)}
                  className="h-10 w-full rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
                >
                  تایید نهایی و انتشار در ویترین فروشگاه
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
