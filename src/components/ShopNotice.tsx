import { useAdmin } from "@/state/admin";
import { X, Megaphone } from "lucide-react";
import { useState } from "react";

/**
 * The shop-floor announcement (decision 63).
 *
 * Deliberately separate from maintenance mode: maintenance means "the shop is
 * closed", a notice means "something you should know while shopping". It reads
 * the same settings the panel writes, so turning it on is one click and the
 * text is exactly what the owner typed — nothing is composed here.
 */
export function ShopNotice() {
  const notice = useAdmin().settings.notice ?? { on: false, text: "", href: "", tone: "info" as const };
  const [closed, setClosed] = useState(false);
  if (!notice.on || !notice.text.trim() || closed) return null;

  const body = (
    <span className="shop-notice-text">
      <Megaphone className="h-3.5 w-3.5 shrink-0" />
      <span>{notice.text}</span>
      {notice.href && <span className="shop-notice-link">مشاهده</span>}
    </span>
  );

  return (
    <div className={notice.tone === "warn" ? "shop-notice is-warn" : "shop-notice"} role="status">
      {notice.href ? (
        <a href={notice.href} className="shop-notice-inner">
          {body}
        </a>
      ) : (
        <span className="shop-notice-inner">{body}</span>
      )}
      <button type="button" onClick={() => setClosed(true)} aria-label="بستن اطلاعیه" className="shop-notice-close">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
