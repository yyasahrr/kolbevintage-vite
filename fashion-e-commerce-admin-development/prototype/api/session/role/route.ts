import { NextRequest, NextResponse } from "next/server";
import { getActiveRole, ROLE_COOKIE_NAME } from "@/lib/server-auth";
import { isValidRoleKey, ROLE_DEFINITIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const activeRole = await getActiveRole(req);
  return NextResponse.json({
    activeRole,
    definition: ROLE_DEFINITIONS[activeRole],
    allRoles: Object.values(ROLE_DEFINITIONS),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const role = body?.role;
    if (!isValidRoleKey(role)) {
      return NextResponse.json(
        { error: "نقش انتخاب‌شده معتبر نیست" },
        { status: 400 }
      );
    }
    const res = NextResponse.json({
      ok: true,
      activeRole: role,
      definition: ROLE_DEFINITIONS[role],
    });
    res.cookies.set(ROLE_COOKIE_NAME, role, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "درخواست نامعتبر است" },
      { status: 400 }
    );
  }
}
