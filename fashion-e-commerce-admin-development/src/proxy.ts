import { NextRequest, NextResponse } from "next/server";

// The archived prototype's routes and API use an unrelated demo database and
// a user-selectable role. Keep them inaccessible until individually migrated.
export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname.replace(/^\/panel(?=\/|$)/, "") || "/";
  if (path === "/" || path.startsWith("/_next/") || path === "/favicon.ico") return NextResponse.next();
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "این قابلیت هنوز به داده‌های فروشگاه متصل نشده است." }, { status: 503 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.search = path === "/catalog/outfits" ? "?view=custom-looks" : path === "/catalog/colors" ? "?view=color-library" : path === "/appearance/studio" ? "?view=studio" : "?unavailable=1";
  return NextResponse.redirect(url);
}

export const config = { matcher: "/:path*" };
