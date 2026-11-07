import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  categories,
  colorLibrary,
  sizeTemplates,
  products,
  productVariants,
  auditLogs,
} from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { slugifyPersianOrLatin } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "view");
  if (!auth.authorized) return auth.response;

  const [allCats, allColors, allTemplates, allProds, allVars] =
    await Promise.all([
      db.select().from(categories).orderBy(asc(categories.sortOrder)),
      db.select().from(colorLibrary).orderBy(asc(colorLibrary.sortOrder)),
      db.select().from(sizeTemplates),
      db.select().from(products),
      db.select().from(productVariants),
    ]);

  const prodCountByCat = new Map<number, number>();
  for (const p of allProds) {
    if (p.categoryId) {
      prodCountByCat.set(
        p.categoryId,
        (prodCountByCat.get(p.categoryId) ?? 0) + 1
      );
    }
  }

  const varCountByColor = new Map<number, number>();
  for (const v of allVars) {
    varCountByColor.set(v.colorId, (varCountByColor.get(v.colorId) ?? 0) + 1);
  }

  return NextResponse.json({
    categories: allCats.map((c) => ({
      ...c,
      productCount: prodCountByCat.get(c.id) ?? 0,
    })),
    colors: allColors.map((c) => ({
      ...c,
      usageCount: varCountByColor.get(c.id) ?? 0,
    })),
    sizeTemplates: allTemplates,
  });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const kind = body?.kind;

    if (kind === "category") {
      const name = String(body?.name ?? "").trim();
      const parentId = body?.parentId ? Number(body.parentId) : null;
      const description = String(body?.description ?? "").trim();
      if (!name) {
        return NextResponse.json(
          { error: "نام دسته‌بندی الزامی است." },
          { status: 400 }
        );
      }
      const slug = `${slugifyPersianOrLatin(name)}-${Date.now().toString().slice(-3)}`;
      const [created] = await db
        .insert(categories)
        .values({
          name,
          slug,
          parentId,
          sortOrder: Number(body?.sortOrder ?? 10),
          isVisible: body?.isVisible !== false,
          description,
        })
        .returning();

      await db.insert(auditLogs).values({
        actorName: auth.actorName,
        actorRole: auth.role,
        module: "کاتالوگ",
        action: `ایجاد دسته‌بندی جدید: ${created.name}`,
        entityRef: created.slug,
        result: "success",
        referenceCode: `AUD-${Date.now().toString().slice(-6)}`,
      });
      return NextResponse.json({ category: created }, { status: 201 });
    }

    if (kind === "color") {
      const name = String(body?.name ?? "").trim();
      const hex = String(body?.hex ?? "#1813FB").trim();
      const family = String(body?.family ?? "خنثی").trim();
      if (!name || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        return NextResponse.json(
          { error: "نام رنگ و کد HEX معتبر ۶ رقمی الزامی است." },
          { status: 400 }
        );
      }
      const [created] = await db
        .insert(colorLibrary)
        .values({
          name,
          hex: hex.toUpperCase(),
          family,
          isActive: true,
          sortOrder: Number(body?.sortOrder ?? 20),
        })
        .returning();
      return NextResponse.json({ color: created }, { status: 201 });
    }

    if (kind === "size_template") {
      const name = String(body?.name ?? "").trim();
      const categoryType = ["clothing", "shoes", "accessories"].includes(
        body?.categoryType
      )
        ? body.categoryType
        : "clothing";
      const sizesJson = Array.isArray(body?.sizesJson)
        ? body.sizesJson.map((s: unknown) => String(s).trim()).filter(Boolean)
        : [];
      const measurementSchemaJson = Array.isArray(body?.measurementSchemaJson)
        ? body.measurementSchemaJson
            .map((m: unknown) => String(m).trim())
            .filter(Boolean)
        : [];
      if (!name || sizesJson.length === 0) {
        return NextResponse.json(
          { error: "نام الگو و حداقل یک سایز الزامی است." },
          { status: 400 }
        );
      }
      const [created] = await db
        .insert(sizeTemplates)
        .values({
          name,
          categoryType,
          sizesJson,
          measurementSchemaJson,
          guideNotes: String(body?.guideNotes ?? "").trim(),
        })
        .returning();
      return NextResponse.json({ sizeTemplate: created }, { status: 201 });
    }

    return NextResponse.json({ error: "نوع عملیات نامعتبر است" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ثبت اطلاعات پایه کاتالوگ", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "edit");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const kind = body?.kind;

    if (kind === "category") {
      const id = Number(body?.id);
      const parentId =
        body?.parentId !== undefined
          ? body.parentId
            ? Number(body.parentId)
            : null
          : undefined;

      // Prevent invalid hierarchy operations (self-parent or circular cycle)
      if (parentId !== undefined && parentId !== null) {
        if (parentId === id) {
          return NextResponse.json(
            { error: "یک دسته‌بندی نمی‌تواند والد خودش باشد." },
            { status: 400 }
          );
        }
        const allCats = await db.select().from(categories);
        const parentMap = new Map(allCats.map((c) => [c.id, c.parentId]));
        let curr: number | null | undefined = parentId;
        const visited = new Set<number>([id]);
        while (curr) {
          if (visited.has(curr)) {
            return NextResponse.json(
              { error: "ساختار درختی حلقوی مجاز نیست." },
              { status: 400 }
            );
          }
          visited.add(curr);
          curr = parentMap.get(curr);
        }
      }

      const [existing] = await db
        .select()
        .from(categories)
        .where(eq(categories.id, id));
      if (!existing) {
        return NextResponse.json({ error: "دسته‌بندی یافت نشد" }, { status: 404 });
      }

      const [updated] = await db
        .update(categories)
        .set({
          name:
            typeof body?.name === "string" && body.name.trim()
              ? body.name.trim()
              : existing.name,
          parentId: parentId !== undefined ? parentId : existing.parentId,
          sortOrder:
            body?.sortOrder !== undefined
              ? Number(body.sortOrder)
              : existing.sortOrder,
          isVisible:
            body?.isVisible !== undefined
              ? Boolean(body.isVisible)
              : existing.isVisible,
        })
        .where(eq(categories.id, id))
        .returning();

      return NextResponse.json({ category: updated });
    }

    if (kind === "color") {
      const id = Number(body?.id);
      const [existing] = await db
        .select()
        .from(colorLibrary)
        .where(eq(colorLibrary.id, id));
      if (!existing) {
        return NextResponse.json({ error: "رنگ یافت نشد" }, { status: 404 });
      }
      const [updated] = await db
        .update(colorLibrary)
        .set({
          name:
            typeof body?.name === "string" && body.name.trim()
              ? body.name.trim()
              : existing.name,
          hex:
            typeof body?.hex === "string" &&
            /^#[0-9A-Fa-f]{6}$/.test(body.hex.trim())
              ? body.hex.trim().toUpperCase()
              : existing.hex,
          isActive:
            body?.isActive !== undefined
              ? Boolean(body.isActive)
              : existing.isActive,
        })
        .where(eq(colorLibrary.id, id))
        .returning();

      return NextResponse.json({ color: updated });
    }

    return NextResponse.json({ error: "نوع ویرایش نامعتبر است" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ویرایش اطلاعات کاتالوگ", detail: String(err) },
      { status: 500 }
    );
  }
}
