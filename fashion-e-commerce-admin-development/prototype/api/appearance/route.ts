import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import { stylePacks, auditLogs } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "appearance", "view");
  if (!auth.authorized) return auth.response;

  const packs = await db
    .select()
    .from(stylePacks)
    .orderBy(asc(stylePacks.id));

  return NextResponse.json({ stylePacks: packs });
}

// Style Pack Activation & Rollback via Agent 3 Publication Contract
export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "appearance", "publish");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const packId = Number(body?.packId);
    const [target] = await db
      .select()
      .from(stylePacks)
      .where(eq(stylePacks.id, packId));

    if (!target) {
      return NextResponse.json(
        { error: "پک ظاهری انتخاب‌شده یافت نشد" },
        { status: 404 }
      );
    }

    // Deactivate all others and activate target (storefront tokens only; admin UI remains stable!)
    await db.update(stylePacks).set({ isActive: false });
    const [activated] = await db
      .update(stylePacks)
      .set({ isActive: true })
      .where(eq(stylePacks.id, packId))
      .returning();

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "استودیو و ظاهر سایت",
      action: `انتشار پک ظاهری ویترین فروشگاه: ${activated.persianName} (نسخه ${activated.version})`,
      entityRef: activated.key,
      result: "success",
      referenceCode: `PACK-${activated.id}`,
    });

    return NextResponse.json({
      ok: true,
      activatedPack: activated,
      handoffNote:
        "توکن‌های ظاهری به موتور انتشار Agent 3 ارسال شد؛ رابط مدیریتی پنل ادمین بدون تغییر پایدار باقی می‌ماند.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در تغییر پک ظاهری", detail: String(err) },
      { status: 500 }
    );
  }
}
