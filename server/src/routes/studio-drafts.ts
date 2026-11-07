import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { conflict, notFound, validation } from "../commerce/errors";
import { hasUnsupportedCampaignRestrictions } from "../commerce/promotions";

type Block = {
  id: string;
  type: "hero" | "banner" | "text" | "video" | "products" | "campaign";
  heading: string;
  text: string;
  buttonText: string;
  href: string;
  image: string;
  video?: string;
  campaignId?: string;
};
type Draft = {
  id: string;
  title: string;
  version: number;
  blocks: Block[];
  updatedAt: string;
  archived?: boolean;
};
const obj = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const string = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
function safeUrl(value: string, image: boolean) {
  if (!value) return true;
  if (/[\u0000-\u0020\\]/.test(value)) return false;
  if (value.startsWith("/"))
    return (
      !value.startsWith("//") &&
      (!image || /^\/uploads\/[a-zA-Z0-9._-]+$/.test(value))
    );
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
function checkedBlocks(value: unknown): Block[] {
  if (!Array.isArray(value) || value.length > 30)
    throw validation("حداکثر ۳۰ بلوک معتبر مجاز است.");
  const result: Block[] = value.map((v) => {
    if (
      !obj(v) ||
      Object.keys(v).some(
        (k) =>
          ![
            "id",
            "type",
            "heading",
            "text",
            "buttonText",
            "href",
            "image",
            "video",
            "campaignId",
          ].includes(k),
      ) ||
      !string(v.id, 80) ||
      !v.id ||
      !/^[a-zA-Z0-9_-]+$/.test(v.id as string) ||
      typeof v.type !== "string" ||
      !["hero", "banner", "text", "video", "products", "campaign"].includes(
        v.type,
      ) ||
      !string(v.heading, 160) ||
      !string(v.text, 2000) ||
      !string(v.buttonText, 80) ||
      !string(v.href, 2000) ||
      !string(v.image, 2000) ||
      !safeUrl(v.href as string, false) ||
      !safeUrl(v.image as string, true) ||
      (v.video !== undefined &&
        (!string(v.video, 2000) || !safeUrl(v.video as string, true))) ||
      (v.type === "video" && (!v.video || !string(v.video, 2000))) ||
      (v.campaignId !== undefined &&
        (typeof v.campaignId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(v.campaignId))) ||
      (v.type === "campaign" && !v.campaignId)
    )
      throw validation("اطلاعات یا نشانی بلوک معتبر نیست.");
    return {
      id: v.id as string,
      type: v.type as Block["type"],
      heading: v.heading as string,
      text: v.text as string,
      buttonText: v.buttonText as string,
      href: v.href as string,
      image: v.image as string,
      ...(v.video !== undefined ? { video: v.video as string } : {}),
      ...(v.campaignId !== undefined
        ? { campaignId: v.campaignId as string }
        : {}),
    };
  });
  if (new Set(result.map((b) => b.id)).size !== result.length)
    throw validation("شناسهٔ بلوک‌ها باید یکتا باشد.");
  return result;
}
function title(value: unknown) {
  if (!string(value, 120) || !(value as string).trim())
    throw validation("عنوان پیش‌نویس لازم است.");
  return (value as string).trim();
}
function data(raw: unknown): Draft[] {
  if (!obj(raw) || !Array.isArray(raw.drafts))
    throw conflict(
      "ساختار پیش‌نویس‌ها معتبر نیست؛ ابتدا داده بررسی شود.",
      "studio_data_invalid",
    );
  return raw.drafts as Draft[];
}
export async function studioDraftRoutes(app: FastifyInstance) {
  app.get("/api/admin/studio/drafts", async (req, reply) => {
    await requirePermission(req, "design:view");
    reply.header("cache-control", "private, no-store");
    const res = await query<{ value: unknown }>(
      "select value from state_documents where key='studio_drafts'",
    );
    return res.rows.length ? data(res.rows[0].value) : [];
  });
  app.post<{ Body: unknown }>(
    "/api/admin/studio/drafts",
    async (req, reply) => {
      const actor = await requirePermission(req, "design:edit");
      const body = req.body;
      if (!obj(body) || Object.keys(body).join(",") !== "title")
        throw validation("درخواست معتبر نیست.");
      const name = title(body.title);
      const result = await withTransaction(async (client) => {
        await client.query(
          "insert into state_documents(key,value) values('studio_drafts','{\"drafts\":[]}'::jsonb) on conflict(key) do nothing",
        );
        const locked = await client.query<{ value: unknown }>(
          "select value from state_documents where key='studio_drafts' for update",
        );
        const drafts = data(locked.rows[0].value);
        if (drafts.length >= 100)
          throw conflict("حداکثر ۱۰۰ پیش‌نویس مجاز است.", "studio_draft_limit");
        const draft: Draft = {
          id: `draft-${randomUUID()}`,
          title: name,
          version: 0,
          blocks: [],
          updatedAt: new Date().toISOString(),
        };
        drafts.push(draft);
        await client.query(
          "update state_documents set value=$1::jsonb,updated_at=now() where key='studio_drafts'",
          [JSON.stringify({ drafts })],
        );
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_draft_created",
            targetType: "studio_draft",
            targetId: draft.id,
            after: { version: 0 },
            requestId: req.id,
          },
          client,
        );
        return draft;
      });
      return reply.code(201).send(result);
    },
  );
  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/api/admin/studio/drafts/:id",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      const body = req.body;
      if (
        !obj(body) ||
        Object.keys(body).sort().join(",") !== "blocks,expectedVersion,title" ||
        !Number.isInteger(body.expectedVersion) ||
        Number(body.expectedVersion) < 0
      )
        throw validation("نسخه و اطلاعات پیش‌نویس لازم است.");
      const name = title(body.title),
        blocks = checkedBlocks(body.blocks);
      return withTransaction(async (client) => {
        const locked = await client.query<{ value: unknown }>(
          "select value from state_documents where key='studio_drafts' for update",
        );
        if (!locked.rows.length) throw notFound("پیش‌نویس پیدا نشد.");
        const drafts = data(locked.rows[0].value),
          index = drafts.findIndex((d) => d.id === req.params.id);
        if (index < 0) throw notFound("پیش‌نویس پیدا نشد.");
        const old = drafts[index];
        if (old.archived)
          throw conflict(
            "پیش‌نویس بایگانی شده است؛ ابتدا آن را بازگردانید.",
            "studio_draft_archived",
          );
        if (old.version !== body.expectedVersion)
          throw conflict(
            "پیش‌نویس هم‌زمان تغییر کرده است؛ ابتدا فهرست را تازه و تغییرات را بررسی کنید.",
            "studio_draft_stale",
          );
        if (old.version >= 2147483647)
          throw conflict(
            "نسخه بیش از حد مجاز است.",
            "studio_version_exhausted",
          );
        const next: Draft = {
          ...old,
          title: name,
          blocks,
          version: old.version + 1,
          updatedAt: new Date().toISOString(),
        };
        drafts[index] = next;
        await client.query(
          "update state_documents set value=$1::jsonb,updated_at=now() where key='studio_drafts'",
          [JSON.stringify({ drafts })],
        );
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_draft_updated",
            targetType: "studio_draft",
            targetId: next.id,
            before: { version: old.version },
            after: { version: next.version, blocks: blocks.length },
            requestId: req.id,
          },
          client,
        );
        return next;
      });
    },
  );
}

// A dedicated namespace never replaces an existing store page. Published
// snapshots are separate from mutable drafts and can only be changed with a
// second, explicit permission and optimistic revision check.
type Snapshot = {
  revision: number;
  draftId: string;
  draftVersion: number;
  title: string;
  blocks: Block[];
  publishedAt: string;
};
type Page = {
  slug: string;
  revision: number;
  active: boolean;
  current: Snapshot;
  history: Snapshot[];
};
function pagesData(raw: unknown): Page[] {
  if (!obj(raw) || !Array.isArray(raw.pages))
    throw conflict("ساختار صفحات منتشرشده معتبر نیست.", "studio_pages_invalid");
  return raw.pages as Page[];
}
function slugValue(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
    value.length > 64
  )
    throw validation("نشانی باید شامل حروف کوچک انگلیسی، عدد و خط تیره باشد.");
  return value;
}
function expected(value: unknown) {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 0 ||
    Number(value) >= 2147483647
  )
    throw validation("نسخهٔ انتشار معتبر نیست.");
  return Number(value);
}
async function lockedPages(client: import("pg").PoolClient) {
  await client.query(
    "insert into state_documents(key,value) values('studio_pages','{\"pages\":[]}'::jsonb) on conflict(key) do nothing",
  );
  return pagesData(
    (
      await client.query<{ value: unknown }>(
        "select value from state_documents where key='studio_pages' for update",
      )
    ).rows[0].value,
  );
}
async function writePages(
  client: import("pg").PoolClient,
  pages: Page[],
  limited = true,
) {
  if (
    limited &&
    Buffer.byteLength(JSON.stringify({ pages }), "utf8") > 4_000_000
  )
    throw conflict(
      "حجم تاریخچهٔ صفحه‌ها به سقف رسیده است؛ انتشار متوقف شد.",
      "studio_storage_limit",
    );
  await client.query(
    "update state_documents set value=$1::jsonb,updated_at=now() where key='studio_pages'",
    [JSON.stringify({ pages })],
  );
}
export async function studioLifecycleRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/admin/studio/drafts/:id/archive",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      const body = req.body;
      if (
        !obj(body) ||
        Object.keys(body).sort().join(",") !== "archived,expectedVersion" ||
        typeof body.archived !== "boolean"
      )
        throw validation("وضعیت بایگانی معتبر نیست.");
      const version = expected(body.expectedVersion);
      return withTransaction(async (client) => {
        const row = await client.query<{ value: unknown }>(
          "select value from state_documents where key='studio_drafts' for update",
        );
        const drafts = row.rows.length ? data(row.rows[0].value) : [];
        const index = drafts.findIndex((d) => d.id === req.params.id),
          old = drafts[index];
        if (!old) throw notFound("پیش‌نویس پیدا نشد.");
        if (old.version !== version)
          throw conflict(
            "پیش‌نویس هم‌زمان تغییر کرده است.",
            "studio_draft_stale",
          );
        if (!!old.archived === body.archived)
          throw conflict(
            "وضعیت بایگانی تغییری نکرده است.",
            "studio_archive_unchanged",
          );
        const next = {
          ...old,
          archived: body.archived as boolean,
          version: version + 1,
          updatedAt: new Date().toISOString(),
        };
        drafts[index] = next;
        await client.query(
          "update state_documents set value=$1::jsonb,updated_at=now() where key='studio_drafts'",
          [JSON.stringify({ drafts })],
        );
        await recordAudit(
          {
            actor: actor.subject,
            action: next.archived
              ? "design.studio_draft_archived"
              : "design.studio_draft_unarchived",
            targetType: "studio_draft",
            targetId: old.id,
            before: { version },
            after: { version: next.version },
            requestId: req.id,
          },
          client,
        );
        return next;
      });
    },
  );
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/admin/studio/drafts/:id/delete",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      await requirePermission(req, "content:publish");
      const body = req.body;
      if (!obj(body) || Object.keys(body).join(",") !== "expectedVersion")
        throw validation("نسخهٔ پیش‌نویس لازم است.");
      const version = expected(body.expectedVersion);
      return withTransaction(async (client) => {
        const row = await client.query<{ value: unknown }>(
          "select value from state_documents where key='studio_drafts' for update",
        );
        const drafts = row.rows.length ? data(row.rows[0].value) : [];
        const index = drafts.findIndex((d) => d.id === req.params.id),
          old = drafts[index];
        if (!old) throw notFound("پیش‌نویس پیدا نشد.");
        if (old.version !== version)
          throw conflict(
            "پیش‌نویس هم‌زمان تغییر کرده است.",
            "studio_draft_stale",
          );
        if (!old.archived)
          throw conflict(
            "ابتدا پیش‌نویس را بایگانی کنید.",
            "studio_not_archived",
          );
        const pages = await lockedPages(client);
        if (
          pages.some(
            (p) =>
              p.current.draftId === old.id ||
              p.history.some((v) => v.draftId === old.id),
          )
        )
          throw conflict(
            "این پیش‌نویس به صفحه یا تاریخچهٔ انتشار وابسته است و حذف نمی‌شود.",
            "studio_draft_in_use",
          );
        drafts.splice(index, 1);
        await client.query(
          "update state_documents set value=$1::jsonb,updated_at=now() where key='studio_drafts'",
          [JSON.stringify({ drafts })],
        );
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_draft_deleted",
            targetType: "studio_draft",
            targetId: old.id,
            before: { version },
            requestId: req.id,
          },
          client,
        );
        return { ok: true };
      });
    },
  );
}
export async function studioPageRoutes(app: FastifyInstance) {
  app.get("/api/studio/pages/:slug", async (req, reply) => {
    const slug = slugValue((req.params as { slug: string }).slug);
    const result = await query<{ value: unknown }>(
      "select value from state_documents where key='studio_pages'",
    );
    const page = result.rows.length
      ? pagesData(result.rows[0].value).find((p) => p.slug === slug && p.active)
      : undefined;
    if (!page) throw notFound("صفحه منتشر نشده است.");
    reply.header("cache-control", "no-store");
    const ids = [
      ...new Set(
        page.current.blocks
          .filter((b) => b.type === "campaign" && b.campaignId)
          .map((b) => b.campaignId!),
      ),
    ];
    let eligible = new Set<string>();
    if (ids.length) {
      const rules = await query<{ id: string; campaigns: unknown }>(
        `select r.id,d.value->'campaigns' as campaigns from price_rules r join state_documents d on d.key='admin' where r.id=any($1::text[]) and r.active and r.audience is null and r.early_access is null and (r.starts_at is null or r.starts_at<=now()) and (r.ends_at is null or r.ends_at>=now())`,
        [ids],
      );
      eligible = new Set(
        rules.rows
          .filter(
            (row) =>
              Array.isArray(row.campaigns) &&
              row.campaigns.some(
                (c: unknown) =>
                  obj(c) &&
                  c.id === row.id &&
                  c.active === true &&
                  c.audience == null &&
                  c.earlyAccess == null &&
                  !hasUnsupportedCampaignRestrictions(c),
              ),
          )
          .map((row) => row.id),
      );
    }
    return {
      slug: page.slug,
      revision: page.revision,
      title: page.current.title,
      blocks: page.current.blocks.filter(
        (b) =>
          b.type !== "campaign" ||
          (!!b.campaignId && eligible.has(b.campaignId)),
      ),
      publishedAt: page.current.publishedAt,
    };
  });
  app.get("/api/admin/studio/pages", async (req, reply) => {
    await requirePermission(req, "design:view");
    reply.header("cache-control", "private, no-store");
    const res = await query<{ value: unknown }>(
      "select value from state_documents where key='studio_pages'",
    );
    return res.rows.length ? pagesData(res.rows[0].value) : [];
  });
  app.post<{ Body: unknown }>(
    "/api/admin/studio/pages/publish",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      await requirePermission(req, "content:publish");
      const body = req.body;
      if (
        !obj(body) ||
        Object.keys(body).sort().join(",") !==
          "draftId,expectedDraftVersion,expectedPageRevision,slug" ||
        typeof body.draftId !== "string"
      )
        throw validation("اطلاعات انتشار معتبر نیست.");
      const slug = slugValue(body.slug),
        draftVersion = expected(body.expectedDraftVersion),
        pageVersion = expected(body.expectedPageRevision);
      return withTransaction(async (client) => {
        const row = await client.query<{ value: unknown }>(
          "select value from state_documents where key='studio_drafts' for update",
        );
        const draft = row.rows.length
          ? data(row.rows[0].value).find((d) => d.id === body.draftId)
          : undefined;
        if (!draft) throw notFound("پیش‌نویس پیدا نشد.");
        if (draft.version !== draftVersion)
          throw conflict(
            "پیش‌نویس تغییر کرده است؛ ابتدا آن را تازه کنید.",
            "studio_draft_stale",
          );
        if (draft.archived)
          throw conflict("پیش‌نویس بایگانی شده است.", "studio_draft_archived");
        const blocks = checkedBlocks(draft.blocks);
        if (!blocks.length)
          throw validation("برای انتشار دست‌کم یک بلوک لازم است.");
        const pages = await lockedPages(client),
          index = pages.findIndex((p) => p.slug === slug),
          old = pages[index];
        if ((old?.revision ?? 0) !== pageVersion)
          throw conflict(
            "انتشار هم‌زمان تغییر کرده است؛ ابتدا فهرست را تازه کنید.",
            "studio_page_stale",
          );
        if (old && old.current.draftId !== draft.id)
          throw conflict(
            "این نشانی متعلق به پیش‌نویس دیگری است.",
            "studio_slug_taken",
          );
        if (!old && pages.length >= 100)
          throw conflict("سقف صفحات منتشرشده پر است.", "studio_page_limit");
        const revision = pageVersion + 1;
        const snapshot: Snapshot = {
          revision,
          draftId: draft.id,
          draftVersion: draft.version,
          title: title(draft.title),
          blocks,
          publishedAt: new Date().toISOString(),
        };
        const page: Page = {
          slug,
          revision,
          active: true,
          current: snapshot,
          history: [...(old?.history ?? []), snapshot].slice(-20),
        };
        if (index < 0) pages.push(page);
        else pages[index] = page;
        await writePages(client, pages);
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_published",
            targetType: "studio_page",
            targetId: slug,
            before: { revision: pageVersion },
            after: { revision, draftVersion: draft.version },
            requestId: req.id,
          },
          client,
        );
        return page;
      });
    },
  );
  app.post<{ Params: { slug: string }; Body: unknown }>(
    "/api/admin/studio/pages/:slug/unpublish",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      await requirePermission(req, "content:publish");
      const slug = slugValue(req.params.slug),
        body = req.body;
      if (!obj(body) || Object.keys(body).join(",") !== "expectedPageRevision")
        throw validation("نسخهٔ انتشار لازم است.");
      const version = expected(body.expectedPageRevision);
      return withTransaction(async (client) => {
        const pages = await lockedPages(client),
          index = pages.findIndex((p) => p.slug === slug),
          page = pages[index];
        if (!page) throw notFound("صفحه پیدا نشد.");
        if (page.revision !== version)
          throw conflict("انتشار هم‌زمان تغییر کرده است.", "studio_page_stale");
        if (!page.active)
          throw conflict(
            "صفحه قبلاً از انتشار خارج شده است.",
            "studio_page_inactive",
          );
        const next = { ...page, active: false, revision: version + 1 };
        pages[index] = next;
        await writePages(client, pages, false);
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_unpublished",
            targetType: "studio_page",
            targetId: slug,
            before: { revision: version },
            after: { revision: next.revision },
            requestId: req.id,
          },
          client,
        );
        return next;
      });
    },
  );
  app.post<{ Params: { slug: string }; Body: unknown }>(
    "/api/admin/studio/pages/:slug/clear-history",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      await requirePermission(req, "content:publish");
      const slug = slugValue(req.params.slug),
        body = req.body;
      if (!obj(body) || Object.keys(body).join(",") !== "expectedPageRevision")
        throw validation("نسخهٔ انتشار لازم است.");
      const version = expected(body.expectedPageRevision);
      return withTransaction(async (client) => {
        const pages = await lockedPages(client),
          index = pages.findIndex((p) => p.slug === slug),
          page = pages[index];
        if (!page) throw notFound("صفحه پیدا نشد.");
        if (page.revision !== version)
          throw conflict("انتشار هم‌زمان تغییر کرده است.", "studio_page_stale");
        if (page.history.length <= 1)
          throw conflict(
            "تاریخچهٔ قدیمی برای حذف وجود ندارد.",
            "studio_no_history",
          );
        const next = {
          ...page,
          revision: version + 1,
          history: [page.current],
        };
        pages[index] = next;
        await writePages(client, pages, false);
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_history_cleared",
            targetType: "studio_page",
            targetId: slug,
            before: { revision: version, versions: page.history.length },
            after: { revision: next.revision, versions: 1 },
            requestId: req.id,
          },
          client,
        );
        return next;
      });
    },
  );
  app.post<{ Params: { slug: string }; Body: unknown }>(
    "/api/admin/studio/pages/:slug/restore",
    async (req) => {
      const actor = await requirePermission(req, "design:edit");
      await requirePermission(req, "content:publish");
      const slug = slugValue(req.params.slug),
        body = req.body;
      if (
        !obj(body) ||
        Object.keys(body).sort().join(",") !==
          "expectedPageRevision,restoreRevision"
      )
        throw validation("نسخه‌ها لازم است.");
      const version = expected(body.expectedPageRevision),
        restoreVersion = expected(body.restoreRevision);
      return withTransaction(async (client) => {
        const pages = await lockedPages(client),
          index = pages.findIndex((p) => p.slug === slug),
          page = pages[index];
        if (!page) throw notFound("صفحه پیدا نشد.");
        if (page.revision !== version)
          throw conflict("انتشار هم‌زمان تغییر کرده است.", "studio_page_stale");
        const previous = page.history.find(
          (v) => v.revision === restoreVersion,
        );
        if (!previous) throw notFound("نسخه در تاریخچه پیدا نشد.");
        const snapshot: Snapshot = {
          ...previous,
          blocks: checkedBlocks(previous.blocks),
          title: title(previous.title),
          revision: version + 1,
          publishedAt: new Date().toISOString(),
        };
        const next = {
          ...page,
          active: true,
          revision: version + 1,
          current: snapshot,
          history: [...page.history, snapshot].slice(-20),
        };
        pages[index] = next;
        await writePages(client, pages);
        await recordAudit(
          {
            actor: actor.subject,
            action: "design.studio_restored",
            targetType: "studio_page",
            targetId: slug,
            before: { revision: version },
            after: { revision: next.revision, restoreRevision: restoreVersion },
            requestId: req.id,
          },
          client,
        );
        return next;
      });
    },
  );
}
