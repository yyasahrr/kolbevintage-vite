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
import { formatJalaliDateTime } from "@/lib/formatters";
import { Check, X, ShieldCheck } from "lucide-react";

interface GalleryRow {
  id: number;
  customerHandle: string;
  imageUrl: string;
  caption: string;
  moderationStatus: string;
  consentVerified: boolean;
  submittedAt: string;
}

export default function CustomerGalleryPage() {
  const { can } = useRole();
  const [items, setItems] = useState<GalleryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/content", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setItems(data.gallery || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  if (!can("content", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="گالری مشتریان و نظرات" />
      </AdminShell>
    );
  }

  const handleModerate = async (
    id: number,
    status: "approved" | "rejected"
  ) => {
    await fetch("/api/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "gallery_moderation",
        id,
        status,
      }),
    });
    loadGallery();
  };

  return (
    <AdminShell>
      <PageHeader
        title="صف بازبینی گالری استایل مشتریان (Customer Gallery Moderation)"
        description="نمایش الهام‌بخش تصاویر ارسالی مشتریان با تایید رضایت انتشار و کنترل حریم خصوصی (بدون اجبار تگ مستقیم محصول)"
      />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-[4/3] bg-[#F7F7FB]">
                  <img
                    src={item.imageUrl}
                    alt={item.caption}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute top-2.5 right-2.5">
                    <StatusBadge
                      label={
                        item.moderationStatus === "approved"
                          ? "تاییدشده برای نمایش"
                          : item.moderationStatus === "rejected"
                          ? "رد شده"
                          : "در صف بازبینی"
                      }
                      tone={
                        item.moderationStatus === "approved"
                          ? "success"
                          : item.moderationStatus === "rejected"
                          ? "danger"
                          : "warning"
                      }
                    />
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#1813FB]">
                      <bdi dir="ltr">{item.customerHandle}</bdi>
                    </span>
                    <span className="text-[11px] text-[#626775]">
                      {formatJalaliDateTime(item.submittedAt)}
                    </span>
                  </div>

                  <p className="text-xs text-[#344054] leading-relaxed">
                    {item.caption}
                  </p>

                  {item.consentVerified && (
                    <div className="inline-flex items-center gap-1 text-[11px] text-[#127A4B]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>رضایت انتشار تصویر توسط مشتری تایید شده است</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-[#EFEFF5] p-3 bg-[#FAFAFE]">
                <button
                  type="button"
                  onClick={() => handleModerate(item.id, "approved")}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-[#127A4B] text-xs font-medium text-white hover:bg-[#0E603B]"
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>تایید انتشار</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModerate(item.id, "rejected")}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-[#FECDCA] bg-white text-xs font-medium text-[#B44F40]"
                >
                  <X className="h-3.5 w-3.5" />
                  <span>رد تصویر</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
