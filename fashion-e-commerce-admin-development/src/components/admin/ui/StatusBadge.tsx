import React from "react";

export type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "indigo"
  | "neutral";

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: "bg-[#ECFDF3] text-[#127A4B] border-[#A6F4C5]",
  warning: "bg-[#FFFAEB] text-[#9A5B04] border-[#FEDF89]",
  danger: "bg-[#FEF3F2] text-[#B44F40] border-[#FECDCA]",
  indigo: "bg-[#F0EEFF] text-[#1813FB] border-[#C1BCF2]",
  neutral: "bg-[#F4F5F8] text-[#4B505E] border-[#E5E7EB]",
};

export function StatusBadge({
  label,
  tone = "neutral",
  dot = true,
  className = "",
}: {
  label: string;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current shrink-0"
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </span>
  );
}

export function getPublicationBadge(status: string): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case "published":
      return { label: "منتشر شده", tone: "success" };
    case "draft":
      return { label: "پیش‌نویس", tone: "neutral" };
    case "needs_review":
      return { label: "نیازمند بازبینی", tone: "warning" };
    case "archived":
      return { label: "بایگانی", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function getPaymentBadge(status: string): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case "verified_paid":
      return { label: "پرداخت تاییدشده", tone: "success" };
    case "pending_verification":
      return { label: "در انتظار استعلام", tone: "warning" };
    case "unpaid":
      return { label: "پرداخت‌نشده", tone: "neutral" };
    case "partially_refunded":
      return { label: "بازپرداخت جزئی", tone: "indigo" };
    case "refunded":
      return { label: "بازپرداخت کامل", tone: "neutral" };
    case "failed":
      return { label: "ناموفق", tone: "danger" };
    default:
      return { label: status, tone: "neutral" };
  }
}

export function getOrderStatusBadge(status: string): {
  label: string;
  tone: BadgeTone;
} {
  switch (status) {
    case "new":
      return { label: "سفارش جدید", tone: "indigo" };
    case "awaiting_prep":
      return { label: "در انتظار آماده‌سازی", tone: "warning" };
    case "picking":
      return { label: "در حال برداشت کالا", tone: "indigo" };
    case "packing":
      return { label: "در حال بسته‌بندی", tone: "indigo" };
    case "ready_to_ship":
      return { label: "آماده ارسال", tone: "success" };
    case "shipped":
      return { label: "تحویل به حمل‌ونقل", tone: "success" };
    case "delivered":
      return { label: "تحویل نهایی به مشتری", tone: "success" };
    case "exception":
      return { label: "مغایرت / نیازمند بررسی", tone: "danger" };
    case "cancelled":
      return { label: "لغوشده", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}
