"use client";

import React from "react";
import { AlertTriangle, Inbox, Lock, RefreshCw } from "lucide-react";
import { useRole } from "../RoleContext";

export function LoadingState({ label = "در حال بارگذاری اطلاعات..." }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8">
      <div className="flex items-center gap-3 text-sm text-[#626775]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1813FB] border-t-transparent" />
        <span>{label}</span>
      </div>
      <div className="mt-5 space-y-3">
        <div className="h-10 w-full animate-pulse rounded-xl bg-[#F4F5F8]" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-[#F7F7FB]" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-[#F7F7FB]" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D5D7E2] bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F0EEFF] text-[#1813FB]">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-[#080707]">{title}</h3>
      <p className="mt-1 max-w-md text-xs sm:text-sm text-[#626775] leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#FECDCA] bg-[#FEF3F2] p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-[#B44F40] shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-[#8A3427]">
            خطا در دریافت یا پردازش اطلاعات
          </h3>
          <p className="mt-1 text-xs sm:text-sm text-[#B44F40]">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[#FECDCA] bg-white px-3 py-1.5 text-xs font-medium text-[#8A3427] hover:bg-[#FFF5F5]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>تلاش مجدد</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function UnauthorizedState({
  moduleTitle,
}: {
  moduleTitle: string;
}) {
  const { definition, switchRole } = useRole();
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FEF3F2] text-[#B44F40]">
        <Lock className="h-6 w-6" />
      </div>
      <h2 className="mt-3 text-base font-semibold text-[#080707]">
        دسترسی به بخش «{moduleTitle}» برای نقش فعلی مجاز نیست
      </h2>
      <p className="mt-1.5 mx-auto max-w-lg text-xs sm:text-sm text-[#626775] leading-relaxed">
        شما هم‌اکنون با نقش{" "}
        <strong className="text-[#080707]">{definition.persianTitle}</strong>{" "}
        وارد شده‌اید. مطابق ماتریس کنترل دسترسی (RBAC)، مشاهده یا ویرایش این
        ماژول نیازمند نقش مجاز است.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => switchRole("super_admin")}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
        >
          <span>تغییر به نقش مالک فروشگاه (سوپر ادمین)</span>
        </button>
      </div>
    </div>
  );
}
