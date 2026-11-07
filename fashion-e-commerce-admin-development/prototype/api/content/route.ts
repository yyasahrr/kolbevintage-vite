import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import { blogPosts, galleryItems } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { slugifyPersianOrLatin } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "content", "view");
  if (!auth.authorized) return auth.response;

  const [posts, gallery] = await Promise.all([
    db.select().from(blogPosts).orderBy(desc(blogPosts.updatedAt)),
    db.select().from(galleryItems).orderBy(desc(galleryItems.submittedAt)),
  ]);

  return NextResponse.json({ posts, gallery });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "content", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    const contentType =
      body?.contentType === "video_lookbook" ? "video_lookbook" : "article";
    const category = String(body?.category ?? "استایل و ترند").trim();
    const excerpt = String(body?.excerpt ?? "").trim();
    const contentBody = String(body?.body ?? "").trim();
    const videoUrl = String(body?.videoUrl ?? "").trim();
    const featuredImage =
      String(body?.featuredImage ?? "").trim() ||
      "/images/products/outfit-autumn.jpg";

    if (!title) {
      return NextResponse.json(
        { error: "عنوان مطلب یا ویدیو الزامی است." },
        { status: 400 }
      );
    }

    const slug = `${slugifyPersianOrLatin(title)}-${Date.now().toString().slice(-4)}`;
    const [created] = await db
      .insert(blogPosts)
      .values({
        title,
        slug,
        contentType,
        category,
        authorName: auth.actorName,
        status: "draft",
        featuredImage,
        videoUrl,
        excerpt,
        body: contentBody,
        seoTitle: title,
      })
      .returning();

    return NextResponse.json({ post: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ثبت محتوای جدید", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "content", "edit");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    if (body?.kind === "gallery_moderation") {
      const id = Number(body?.id);
      const status = ["approved", "rejected", "pending"].includes(body?.status)
        ? body.status
        : "pending";
      const [updated] = await db
        .update(galleryItems)
        .set({ moderationStatus: status })
        .where(eq(galleryItems.id, id))
        .returning();
      return NextResponse.json({ galleryItem: updated });
    }

    const id = Number(body?.id);
    const [existing] = await db
      .select()
      .from(blogPosts)
      .where(eq(blogPosts.id, id));
    if (!existing) {
      return NextResponse.json({ error: "مطلب یافت نشد" }, { status: 404 });
    }

    const [updated] = await db
      .update(blogPosts)
      .set({
        status: body?.status ?? existing.status,
        title: body?.title ?? existing.title,
        body: body?.body ?? existing.body,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id))
      .returning();

    return NextResponse.json({ post: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ویرایش محتوا", detail: String(err) },
      { status: 500 }
    );
  }
}
