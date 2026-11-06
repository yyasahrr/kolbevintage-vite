import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  ActionKey,
  hasPermission,
  isValidRoleKey,
  ModuleKey,
  ROLE_DEFINITIONS,
  RoleKey,
} from "./permissions";

export const ROLE_COOKIE_NAME = "kv_active_role";

export async function getActiveRole(req?: NextRequest): Promise<RoleKey> {
  if (req) {
    const headerRole = req.headers.get("x-kv-role");
    if (isValidRoleKey(headerRole)) return headerRole;
    const cookieRole = req.cookies.get(ROLE_COOKIE_NAME)?.value;
    if (isValidRoleKey(cookieRole)) return cookieRole;
  }
  try {
    const cookieStore = await cookies();
    const val = cookieStore.get(ROLE_COOKIE_NAME)?.value;
    if (isValidRoleKey(val)) return val;
  } catch {
    // Fallback when called outside request context
  }
  return "super_admin";
}

export async function requireApiPermission(
  req: NextRequest,
  module: ModuleKey,
  action: ActionKey = "view"
): Promise<
  | { authorized: true; role: RoleKey; actorName: string }
  | { authorized: false; response: NextResponse }
> {
  const role = await getActiveRole(req);
  const def = ROLE_DEFINITIONS[role];
  if (!hasPermission(role, module, action)) {
    return {
      authorized: false,
      response: NextResponse.json(
        {
          error: "دسترسی غیرمجاز برای نقش فعلی",
          code: "FORBIDDEN_ROLE_ACTION",
          requiredModule: module,
          requiredAction: action,
          activeRole: role,
        },
        { status: 403 }
      ),
    };
  }
  return {
    authorized: true,
    role,
    actorName: def.actorName,
  };
}
