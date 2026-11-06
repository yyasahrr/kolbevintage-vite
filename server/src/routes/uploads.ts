import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { config } from "../config";
import { requirePermission } from "../http/rbac";

const VIDEO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/** images stay cheap, one short product video may be heavier (owner decision 25) */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/api/uploads", async (req, reply) => {
    await requirePermission(req, "catalog:edit");
    const part = await req.file({ limits: { fileSize: MAX_VIDEO_BYTES } });
    if (!part) return reply.code(400).send({ error: "فایلی ارسال نشد." });

    const isVideo = part.mimetype.startsWith("video/");
    const byName = path.extname(part.filename ?? "").replace(".", "").toLowerCase();
    const allowedByName = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]);
    const allowedVideoByName = new Set(["mp4", "webm", "mov"]);
    const ext = isVideo
      ? (VIDEO_EXT[part.mimetype] ?? (allowedVideoByName.has(byName) ? byName : null))
      : (EXT[part.mimetype] ?? (allowedByName.has(byName) ? byName : null));
    if (!ext) {
      await part.file.resume();
      return reply.code(415).send({ error: "فقط تصویر یا ویدیوی mp4/webm مجاز است." });
    }

    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext ?? "bin"}`;
    const target = path.join(config.uploadsDir, filename);
    await pipeline(part.file, fs.createWriteStream(target));

    if (part.file.truncated) {
      fs.unlink(target, () => undefined);
      return reply
        .code(413)
        .send({ error: isVideo ? "حجم ویدیو بیشتر از ۲۰ مگابایت است." : "حجم تصویر بیشتر از ۸ مگابایت است." });
    }
    // the multipart limit is shared, so the ceiling is enforced per kind here
    const size = fs.statSync(target).size;
    if ((isVideo && size > MAX_VIDEO_BYTES) || (!isVideo && size > MAX_IMAGE_BYTES)) {
      fs.unlink(target, () => undefined);
      return reply
        .code(413)
        .send({ error: isVideo ? "حجم ویدیو بیشتر از ۲۰ مگابایت است." : "حجم تصویر بیشتر از ۸ مگابایت است." });
    }

    return { url: `/uploads/${filename}`, size, mime: part.mimetype, kind: isVideo ? "video" : "image" };
  });
}
