import React from "react";

export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  badge,
}: {
  title: string;
  description?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-[#080707]">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-xs sm:text-sm text-[#626775] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {(primaryAction || secondaryActions) && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
