import { useEffect, type ReactNode } from "react";
import { useOps } from "@/state/ops";
import { useSyncStatus } from "@/state/sync";

/** Do not render local prototype defaults before the real store is loaded. */
export function StoreBootGate({children}:{children:ReactNode}) {
  const sync=useSyncStatus();
  const ops=useOps();
  useEffect(() => {
    if (!sync.lastLoaded || ops.siteUnderSetup !== true) return;
    document.title = `${ops.brand.name} — در حال آماده‌سازی`;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = "فروشگاه در حال آماده‌سازی است.";
    const robots=document.createElement("meta");robots.name="robots";robots.content="noindex, nofollow";document.head.appendChild(robots);
    return () => robots.remove();
  },[sync.lastLoaded,ops.siteUnderSetup,ops.brand.name]);
  if (!sync.lastLoaded) {
    return <main className="flex min-h-screen items-center justify-center bg-bone p-6 text-center text-ink" role="status">
      <p>{sync.state === "offline" ? "اتصال به فروشگاه برقرار نیست؛ لطفاً بعداً دوباره تلاش کنید." : "در حال دریافت اطلاعات فروشگاه…"}</p>
    </main>;
  }
  if (ops.siteUnderSetup === true) {
    return <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bone p-6 text-center text-ink">
      <h1 className="text-xl font-semibold">{ops.brand.name}</h1>
      <p>فروشگاه در حال آماده‌سازی است.</p>
      <a className="text-sm underline underline-offset-4" href="/panel">ورود مدیریت</a>
    </main>;
  }
  return <>{children}</>;
}
