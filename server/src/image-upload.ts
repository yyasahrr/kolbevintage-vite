import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "./config";
import { validation } from "./commerce/errors";

/** Decode and re-encode user-supplied pixels; never publish active SVG/HTML or metadata. */
export async function prepareProductImage(data: unknown): Promise<{ url: string; discard: () => Promise<void> }> {
  if (typeof data !== "string") throw validation("فایل تصویر معتبر نیست.");
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match || match[2].length > 11_184_812) throw validation("فایل باید JPEG، PNG یا WebP حداکثر ۸ مگابایت باشد.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw validation("حجم تصویر معتبر نیست.");
  let processed: Buffer;
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
    const meta = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format ?? "")) throw new Error("invalid image");
    processed = await image.rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch {
    throw validation("فایل تصویر قابل خواندن نیست.");
  }
  await fs.mkdir(config.uploadsDir, { recursive: true });
  const filename = `product-${randomUUID()}.webp`;
  const file = path.join(config.uploadsDir, filename);
  await fs.writeFile(file, processed, { flag: "wx" });
  return { url: `/uploads/${filename}`, discard: async () => { await fs.unlink(file).catch(() => undefined); } };
}
