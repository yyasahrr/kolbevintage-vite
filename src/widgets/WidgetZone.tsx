import { useEffect, useState } from "react";
import { widgetDef, widgetsForZone } from "./registry";
import { useOps } from "@/state/ops";
import type { WidgetZone as Zone } from "./types";

/* Renders the widgets the owner installed into one zone, in the order the
   panel gave them. A widget whose data is missing renders nothing, so an
   empty shop never shows placeholder content. */

export function WidgetZone({ zone, productId, articleSlug }: { zone: Zone; productId?: string; articleSlug?: string }) {
  const ops = useOps();
  // the browser-only widgets read localStorage; re-read after mount so the
  // first paint and the hydrated paint agree
  const [, force] = useState(0);
  useEffect(() => {
    force((n) => n + 1);
  }, []);

  const installed = widgetsForZone(ops.widgets ?? [], zone);
  if (!installed.length) return null;

  return (
    <>
      {installed.map((instance) => {
        const def = widgetDef(instance.kind);
        if (!def) return null;
        const { Component } = def;
        return (
          <div key={instance.id} data-widget={instance.kind}>
            <Component
              title={instance.title?.trim() || def.defaultTitle}
              options={{ ...Object.fromEntries(def.options?.map((o) => [o.key, o.default]) ?? []), ...instance.options }}
              productId={productId}
              articleSlug={articleSlug}
            />
          </div>
        );
      })}
    </>
  );
}
