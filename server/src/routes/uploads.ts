import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { config } from "../config";
import { requireAdmin } from "../sessions";

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
    await requireAdmin(req);
    const part = await req.file({ limits: { fileSize: 8 * 1024 * 1024 } });
    if (!part) return reply.code(400).send({ error: "فایلی ارسال نشد." });

    const byName = path.extname(part.filename ?? "").replace(".", "").toLowerCase();
    const allowedByName = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"]);
    const ext = EXT[part.mimetype] ?? (allowedByName.has(byName) ? byName : null);
    if (!part.mimetype.startsWith("image/") && !ext) {
      await part.file.resume();
      return reply.code(415).send({ error: "فقط فایل تصویری مجاز است." });
    }

    fs.mkdirSync(config.uploadsDir, { recursive: true });
    const filename = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext ?? "bin"}`;
    const target = path.join(config.uploadsDir, filename);
    await pipeline(part.file, fs.createWriteStream(target));

    if (part.file.truncated) {
      fs.unlink(target, () => undefined);
      return reply.code(413).send({ error: "حجم تصویر بیشتر از ۸ مگابایت است." });
    }

    return { url: `/uploads/${filename}`, size: fs.statSync(target).size, mime: part.mimetype };
  });
}
