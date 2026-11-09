import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { storeMedia } from "../media-storage";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { prepareProductImage } from "../image-upload";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

/** The old MIME/extension fallback accepted arbitrary files and active SVG on
 * the store origin. Images are now decoded/re-encoded; videos require a known
 * media signature and are served with nosniff. */
export async function uploadRoutes(app: FastifyInstance) {
  async function upload(req:FastifyRequest, reply:FastifyReply, permission:"catalog:edit"|"design:edit"|"content:edit", videoOnly:boolean) {
    const session = await requirePermission(req, permission);
    const part = await req.file({ limits: { fileSize: MAX_VIDEO_BYTES } });
    if (!part) return reply.code(400).send({ error: "فایلی ارسال نشد." });
    const mime = part.mimetype.toLowerCase();
    const imageType = mime === "image/jpg" ? "image/jpeg" : mime;
    const images = ["image/jpeg", "image/png", "image/webp"];
    const videoExt: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };
    if ((videoOnly && !Object.hasOwn(videoExt,mime)) || (!videoOnly && !images.includes(imageType) && !Object.hasOwn(videoExt, mime))) {
      part.file.resume();
      return reply.code(415).send({ error: videoOnly ? "فقط ویدیوی MP4، WebM و MOV مجاز است." : "فقط JPEG، PNG، WebP یا ویدیوی MP4، WebM و MOV مجاز است." });
    }
    let bytes: Buffer;
    try { bytes = await part.toBuffer(); }
    catch { return reply.code(413).send({ error: "حجم فایل بیش از حد مجاز است." }); }
    if (part.file.truncated || !bytes.length || bytes.length > (images.includes(imageType) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
      return reply.code(413).send({ error: "حجم فایل بیش از حد مجاز است." });
    }
    let url: string;
    let discard: () => Promise<void>;
    if (images.includes(imageType)) {
      const uploaded = await prepareProductImage(`data:${imageType};base64,${bytes.toString("base64")}`);
      url = uploaded.url;
      discard = uploaded.discard;
    } else {
      const isWebm = bytes.length >= 4 && bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
      const isMp4 = bytes.length >= 12 && bytes.toString("ascii",4,8) === "ftyp";
      if ((mime === "video/webm" && !isWebm) || (mime !== "video/webm" && !isMp4)) {
        return reply.code(415).send({ error: "محتوای ویدیو با نوع فایل مطابقت ندارد." });
      }
      const filename = `${Date.now()}-${randomUUID()}.${videoExt[mime]}`;
      const uploaded=await storeMedia(filename,bytes,mime);
      url=uploaded.url;discard=uploaded.discard;
    }
    try {
      await recordAudit({ actor: session.subject, action: "media.upload", targetType: "upload", targetId: url,
        after: { kind: images.includes(imageType) ? "image" : "video", size: bytes.length }, requestId: req.id });
    } catch (error) { await discard(); throw error; }
    return { url, size: bytes.length, mime: images.includes(imageType) ? "image/webp" : mime, kind: images.includes(imageType) ? "image" : "video" };
  }
  app.post("/api/uploads", (req,reply) => upload(req,reply,"catalog:edit",false));
  app.post("/api/admin/studio/video", (req,reply) => upload(req,reply,"design:edit",true));
  app.post("/api/admin/journal/video", (req,reply) => upload(req,reply,"content:edit",true));
}
