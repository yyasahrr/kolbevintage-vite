import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { actorOf } from "../commerce/auth";
import { recordAudit } from "../commerce/audit";
import { requirePermission } from "../http/rbac";

interface GalleryBody {
  handle?: string;
  email?: string;
  imageUrl?: string;
  caption?: string;
  consent?: boolean;
}

const publicRow = (row: any) => ({
  id: row.id,
  handle: row.customer_handle,
  imageUrl: row.image_url,
  caption: row.caption,
  status: row.moderation_status,
  consentVerified: row.consent_verified,
  submittedAt: row.submitted_at,
  moderatedAt: row.moderated_at,
  moderatedBy: row.moderated_by,
});

export async function galleryRoutes(app: FastifyInstance) {
  app.get("/api/gallery", async () => {
    const rows = await query(
      `select * from gallery_items
        where moderation_status = 'approved' and consent_verified = true
        order by submitted_at desc limit 60`,
    );
    return rows.rows.map(publicRow);
  });

  app.post<{ Body: GalleryBody }>("/api/gallery", async (req, reply) => {
    const handle = String(req.body?.handle ?? "").trim().slice(0, 60);
    const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 180);
    const imageUrl = String(req.body?.imageUrl ?? "").trim();
    const caption = String(req.body?.caption ?? "").trim().slice(0, 500);
    const isInlineImage = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(imageUrl) && imageUrl.length <= 3_000_000;
    const isRemoteImage = /^https:\/\/[^\s]+$/i.test(imageUrl) && imageUrl.length <= 2000;
    const isUploadedImage = /^\/uploads\/[a-z0-9._-]+$/i.test(imageUrl);
    if (!handle || (!isInlineImage && !isRemoteImage && !isUploadedImage)) {
      return reply.code(400).send({ error: "نام نمایشی و یک تصویر معتبر لازم است." });
    }
    if (req.body?.consent !== true) {
      return reply.code(400).send({ error: "برای ارسال تصویر باید رضایت انتشار را تأیید کنی." });
    }
    const id = `gal_${randomUUID()}`;
    await query(
      `insert into gallery_items (id, customer_handle, email, image_url, caption, moderation_status, consent_verified)
       values ($1, $2, $3, $4, $5, 'pending', true)`,
      [id, handle, email || null, imageUrl, caption],
    );
    return reply.code(201).send({ ok: true, id, status: "pending" });
  });

  app.get("/api/admin/gallery", async (req) => {
    await requirePermission(req, "content:view");
    const rows = await query("select * from gallery_items order by submitted_at desc limit 200");
    return rows.rows.map(publicRow);
  });

  app.patch<{ Params: { id: string }; Body: { status?: "approved" | "rejected" | "pending" } }>(
    "/api/admin/gallery/:id",
    async (req, reply) => {
      const session = await requirePermission(req, "content:edit");
      const status = req.body?.status;
      if (!status || !["approved", "rejected", "pending"].includes(status)) {
        return reply.code(400).send({ error: "وضعیت بازبینی نامعتبر است." });
      }
      const result = await query(
        `update gallery_items
            set moderation_status = $2, moderated_at = now(), moderated_by = $3
          where id = $1 returning *`,
        [req.params.id, status, actorOf(session)],
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "تصویر پیدا نشد." });
      await recordAudit({
        actor: actorOf(session),
        action: `gallery.${status}`,
        targetType: "gallery_item",
        targetId: req.params.id,
        after: { status },
        requestId: req.id,
      });
      return { ok: true, item: publicRow(result.rows[0]) };
    },
  );
}
