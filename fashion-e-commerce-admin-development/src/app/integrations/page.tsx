"use client";

import React, { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatJalaliDateTime } from "@/lib/formatters";
import { PlugZap, Lock, AlertTriangle, CheckCircle2 } from "lucide-react";

interface IntegrationRow {
  id: number;
  key: string;
  name: string;
  category: string;
  connectionState: string;
  environment: string;
  lastSuccessAt: string | null;
  recentError: string;
  configSummary: string;
  isAuthoritativeSource: boolean;
}

export default function IntegrationsPage() {
  const { can } = useRole();
  const [list, setList] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/system?domain=integrations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.integrations) setList(d.integrations);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!can("integrations", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مرکز اتصالات و درگاه‌های پرداخت" />
      </AdminShell>
    );
  }

  const getStateBadge = (st: string) => {
    switch (st) {
      case "connected":
        return { label: "متصل و عملیاتی", tone: "success" as const };
      case "pending_contract":
        return {
          label: "در انتظار قرارداد و تایید فنی (Pending)",
          tone: "warning" as const,
        };
      case "error":
        return { label: "دارای خطای اتصال", tone: "danger" as const };
      default:
        return { label: "غیرفعال / آزمایشی", tone: "neutral" as const };
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="مرکز اتصالات، درگاه‌های پرداخت و سرویس‌های اعتباری (BNPL)"
        description="وضعیت واقعی اتصال به درگاه‌های بانکی، پیامک، پست، دیجی‌پی، اسنپ‌پی و انبار خارجی بدون نمایش کلیدهای محرمانه"
      />

      {/* Security & BNPL Readiness Notice */}
      <div className="mb-5 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-xs text-[#7A4905] space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-[#9A5B04]">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            شفافیت وضعیت درگاه‌های اقساطی (Digipay / SnappPay) و امنیت کلیدها:
          </span>
        </div>
        <p>
          ۱. درگاه‌های پرداخت اعتباری <strong>دیجی‌پی (Digipay)</strong> و{" "}
          <strong>اسنپ‌پی (SnappPay)</strong> تا زمان امضای قرارداد تجاری و
          دریافت مستندات رسمی وب‌سرویس در وضعیت{" "}
          <strong>در انتظار قرارداد (Pending)</strong> قرار دارند و به صورت
          جعلی فعال نمی‌شوند. ۲. کلیدهای محرمانه API هرگز در رابط کاربری نمایش
          داده نمی‌شوند و فقط در متغیرهای امن سمت سرور نگهداری می‌گردند.
        </p>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((item) => {
            const badge = getStateBadge(item.connectionState);
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-5 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F0EEFF] text-[#1813FB]">
                        <PlugZap className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-[#080707]">
                          {item.name}
                        </h3>
                        <span className="font-mono text-[11px] text-[#626775]">
                          <bdi dir="ltr">
                            {item.category.toUpperCase()} • {item.environment}
                          </bdi>
                        </span>
                      </div>
                    </div>

                    <StatusBadge label={badge.label} tone={badge.tone} />
                  </div>

                  <p className="text-xs text-[#344054] leading-relaxed">
                    {item.configSummary}
                  </p>

                  {item.recentError && (
                    <div className="rounded-xl bg-[#FEF3F2] border border-[#FECDCA] p-2.5 text-[11px] text-[#8A3427] flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#B44F40] shrink-0 mt-0.5" />
                      <span>{item.recentError}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEFF5] pt-3 text-[11px] text-[#626775]">
                  <span>
                    آخرین تراکنش موفق:{" "}
                    {item.lastSuccessAt
                      ? formatJalaliDateTime(item.lastSuccessAt)
                      : "ثبت‌نشده"}
                  </span>

                  {item.isAuthoritativeSource ? (
                    <span className="inline-flex items-center gap-1 text-[#127A4B] font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>متصل به هسته عملیاتی</span>
                    </span>
                  ) : (
                    <span className="text-[#9A5B04] font-medium">
                      غیرمرجع / نیازمند تایید قرارداد
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
