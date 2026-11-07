import { randomUUID } from "node:crypto";
import { skuFor, variantIdFor, sizeModeOf } from "../commerce/variants";
import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { actorOf } from "../commerce/auth";
import { prepareProductImage } from "../image-upload";
import { validation, notFound, conflict } from "../commerce/errors";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  garment: string;
  price: string;
  compare_at: string | null;
  description: string | null;
  material: string | null;
  care: string | null;
  fit: string | null;
  origin: string | null;
  badge: string | null;
  look_id: string | null;
  look_name: string | null;
  look_slug: string | null;
  look_order: number;
  crop: unknown;
  colors: unknown[];
  sizes: unknown[];
  stock: Record<string, number>;
  active: boolean;
  featured: boolean;
  is_base: boolean;
}

const toProduct = (row: ProductRow, images: unknown[], complements: string[]) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  garment: row.garment,
  price: Number(row.price),
  compareAt: row.compare_at === null ? null : Number(row.compare_at),
  description: row.description,
  material: row.material,
  care: row.care,
  fit: row.fit,
  origin: row.origin,
  badge: row.badge,
  lookId: row.look_id,
  lookName: row.look_name,
  lookSlug: row.look_slug,
  lookOrder: row.look_order,
  crop: row.crop,
  colors: row.colors,
  sizes: row.sizes,
  stock: row.stock,
  active: row.active,
  featured: row.featured,
  isBase: row.is_base,
  images,
  complements,
});

/** Sellable stock is derived from the ledger, less quarantined and live holds.
 * The old products.stock JSON is merely a stale catalogue projection. */
async function sellableStocks(productIds: string[]) {
  const stocks = new Map<string,Record<string,number>>();
  if (!productIds.length) return stocks;
  const result=await query<{product_id:string;color_id:string;size_id:string;active:boolean;available:number}>(
    `select v.product_id,v.color_id,v.size_id,(v.active and v.sale_enabled) as active,
       greatest(0,v.on_hand-v.quarantined-coalesce((select sum(r.quantity) from stock_reservations r where r.variant_id=v.id and r.status='active' and r.expires_at>now()),0))::int as available
       from product_variants v where v.product_id=any($1::text[])`,[productIds]);
  for(const row of result.rows){const stock=stocks.get(row.product_id) ?? {};stock[`${row.color_id}:${row.size_id}`]=row.active ? row.available : 0;stocks.set(row.product_id,stock);}
  return stocks;
}

export async function catalogRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { all?: string; q?: string; category?: string } }>("/api/products", async (req) => {
    const all = req.query.all === "1";
    if (all) await requirePermission(req, "catalog:view");
    const params: unknown[] = [];
    const where: string[] = [];
    if (!all) where.push("active = true");
    if (req.query.category) {
      params.push(req.query.category);
      where.push(`category = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`name ilike $${params.length}`);
    }
    const sql = `select * from products ${where.length ? `where ${where.join(" and ")}` : ""} order by look_order desc, created_at desc`;

    const rows = await query<ProductRow>(sql, params);
    const images = await query<{ product_id: string; id: string; url: string; color_id: string; role: string; position: number }>(
      "select product_id, id, url, color_id, role, position from product_images order by position",
    );
    const complements = await query<{ product_id: string; complement_id: string }>(
      "select product_id, complement_id from product_complements order by position",
    );

    const imagesBy = new Map<string, unknown[]>();
    for (const img of images.rows) {
      const list = imagesBy.get(img.product_id) ?? [];
      list.push({ id: img.id, url: img.url, colorId: img.color_id, role: img.role });
      imagesBy.set(img.product_id, list);
    }
    const compBy = new Map<string, string[]>();
    for (const c of complements.rows) {
      compBy.set(c.product_id, [...(compBy.get(c.product_id) ?? []), c.complement_id]);
    }

    const stocks=await sellableStocks(rows.rows.map(row=>row.id));
    return rows.rows.map((row) => toProduct({...row,stock:stocks.get(row.id) ?? {}}, imagesBy.get(row.id) ?? [], compBy.get(row.id) ?? []));
  });

  /** Create an unpublished product with zero opening stock. Stock must enter
   * through the two-person inventory workflow, not a catalogue form. */
  app.post<{ Body: { name?: string; category?: string; garment?: string; description?: string; price?: number; colorName?: string; colorHex?: string; sizes?: string[]; imageUrl?: string; imageData?: string; compareAt?:number|null; material?:string|null; care?:string|null; fit?:string|null; origin?:string|null } }>("/api/admin/products", async (req, reply) => {
    const session = await requirePermission(req, "catalog:edit");
    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const colorName = typeof body.colorName === "string" ? body.colorName.trim() : "";
    const colorHex = typeof body.colorHex === "string" ? body.colorHex.trim() : "";
    let imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const imageData = body.imageData;
    const description = typeof body.description === "string" ? body.description.trim() : "";
    for (const key of ["material", "care", "fit", "origin"] as const) {
      if (body[key] !== undefined && body[key] !== null && (typeof body[key] !== "string" || body[key]!.length > 2000)) throw validation("مشخصات محصول معتبر نیست.");
    }
    const optionalText = (value:string|null|undefined) => value?.trim() || null;
    const material=optionalText(body.material), care=optionalText(body.care), fit=optionalText(body.fit), origin=optionalText(body.origin);
    const compareAt=body.compareAt ?? null;
    if (compareAt !== null && (typeof compareAt !== "number" || !Number.isFinite(compareAt) || compareAt > 99999999 || Number(compareAt.toFixed(2)) !== compareAt || typeof body.price !== "number" || compareAt <= body.price)) throw validation("قیمت مقایسه‌ای باید بیش از قیمت فروش و حداکثر با دو رقم اعشار باشد.");
    const garments = ["coat", "jacket", "knit", "tee", "dress", "skirt", "trousers", "bag", "loafer", "heel", "boot", "sneaker", "accessory"];
    const sizes = Array.isArray(body.sizes) ? body.sizes.map(s => typeof s === "string" ? s.trim() : "") : [];
    if (!name || name.length > 160 || !category || category.length > 160 || !colorName || colorName.length > 80 || description.length > 5000 || !/^#[0-9a-f]{6}$/i.test(colorHex) || !garments.includes(body.garment ?? "") || typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0 || body.price > 99999999 || Number(body.price.toFixed(2)) !== body.price || !sizes.length || sizes.length > 30 || sizes.some(s => !s || s.length > 40) || new Set(sizes.map(s => s.toLowerCase())).size !== sizes.length || (imageData !== undefined && !!imageUrl) || (imageData === undefined && (!(/^https:\/\/[^\s]+$/i.test(imageUrl) || /^\/uploads\/[a-z0-9._-]+$/i.test(imageUrl)) || imageUrl.length > 2000))) {
      throw validation("نام، دسته، نوع کالا، قیمت، رنگ، سایزهای یکتا و نشانی معتبر تصویر لازم است.");
    }
    const uploaded = imageData !== undefined ? await prepareProductImage(imageData) : null;
    if (uploaded) imageUrl = uploaded.url;
    const id = `cp-${randomUUID()}`;
    const colors = [{ id: "c1", name: colorName, hex: colorHex }];
    const sizeRows = sizes.map((value, index) => ({ id: `size-${index + 1}`, label: value }));
    const crop = { cx: 0.5, cy: 0.5, zoom: 1 };
    const image = { id: `img-${randomUUID()}`, url: imageUrl, colorId: "*", role: "main" };
    const product = { id, name, category, garment: body.garment!, price: body.price, compareAt, description, material, care, fit, origin, colors, sizes: sizeRows, stock: {}, active: false, featured: false, lookId: "look-01", crop, createdAt: Date.now() };
    try { await withTransaction(async client => {
      await client.query("select pg_advisory_xact_lock(hashtext('kv-commerce-catalog-sync'))");
      const docs = await client.query<{ key: string; value: Record<string, any> }>("select key, value from state_documents where key in ('admin','ops') order by key for update");
      const admin = docs.rows.find(row => row.key === "admin")?.value;
      const ops = docs.rows.find(row => row.key === "ops")?.value;
      if (!admin || !ops) throw notFound("سند فروشگاه پیدا نشد.");
      if (!Array.isArray(ops.categories) || !ops.categories.some((c:any)=>c.name === category && c.active === true)) throw validation("دسته فعال انتخاب‌شده پیدا نشد.");
      admin.customProducts = [...(Array.isArray(admin.customProducts) ? admin.customProducts : []), product];
      ops.productImages = { ...(ops.productImages ?? {}), [id]: [image] };
      await client.query("update state_documents set value=$2::jsonb, updated_at=now() where key=$1", ["admin", JSON.stringify(admin)]);
      await client.query("update state_documents set value=$2::jsonb, updated_at=now() where key=$1", ["ops", JSON.stringify(ops)]);
      await client.query(`insert into products (id,name,category,garment,price,description,colors,sizes,stock,active,featured,is_base,look_id,crop,compare_at,material,care,fit,origin)
        values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'{}'::jsonb,false,false,false,'look-01',$9::jsonb,$10,$11,$12,$13,$14)`,
        [id,name,category,body.garment,body.price,description,JSON.stringify(colors),JSON.stringify(sizeRows),JSON.stringify(crop),compareAt,material,care,fit,origin]);
      await client.query("insert into product_images (id,product_id,url,color_id,role,position) values ($1,$2,$3,'*','main',0)", [image.id,id,imageUrl]);
      for (const size of sizeRows) {
        await client.query(`insert into product_variants (id,product_id,color_id,size_id,sku,size_mode,on_hand,last_catalog_qty,active)
          values ($1,$2,'c1',$3,$4,$5,0,0,false)`, [variantIdFor(id,"c1",size.id),id,size.id,skuFor(id,"c1",size.id),sizeModeOf(sizeRows)]);
      }
      await recordAudit({ actor: session.subject, action: "catalog.product_created", targetType: "product", targetId: id,
        after: { name, category, price: body.price, active: false, variants: sizeRows.length }, requestId: req.id }, client);
    }); } catch (error) { if (uploaded) await uploaded.discard(); throw error; }
    return reply.code(201).send({ ok: true, id });
  });

  /** Add options or correct their labels without replacing variant IDs or stock.
   * Removing options is intentionally unavailable: orders, reservations and
   * warehouse records may already reference any combination. */
  app.post<{Params:{id:string}; Body:{action?:string; id?:string; name?:string; hex?:string; label?:string; expected?:{name?:string;hex?:string;label?:string}}}>("/api/admin/products/:id/options", async req => {
    const session=await requirePermission(req,"catalog:edit");
    const body=req.body ?? {};
    if (Object.keys(body).some(key=>!["action","id","name","hex","label","expected"].includes(key)) || !["add_color","update_color","add_size","update_size"].includes(body.action ?? "")) throw validation("عملیات تنوع معتبر نیست.");
    const colorAction=body.action === "add_color" || body.action === "update_color";
    const update=body.action === "update_color" || body.action === "update_size";
    const allowed = colorAction ? ["action","name","hex",...(update ? ["id","expected"] : [])] : ["action","label",...(update ? ["id","expected"] : [])];
    if (Object.keys(body).some(key=>!allowed.includes(key))) throw validation("فیلدهای تنوع معتبر نیستند.");
    const name=typeof body.name === "string" ? body.name.trim() : "";
    const hex=typeof body.hex === "string" ? body.hex.trim() : "";
    const label=typeof body.label === "string" ? body.label.trim() : "";
    if ((colorAction && (!name || name.length>80 || !/^#[0-9a-f]{6}$/i.test(hex))) || (!colorAction && (!label || label.length>40)) || (update && (typeof body.id !== "string" || !body.id || !body.expected || typeof body.expected !== "object"))) throw validation("نام رنگ، کد رنگ یا سایز معتبر نیست.");
    const normalize=(value:string)=>value.normalize("NFKC").trim().toLocaleLowerCase("fa");
    return withTransaction(async client=>{
      await client.query("select pg_advisory_xact_lock(hashtext('kv-commerce-catalog-sync'))");
      const docs=await client.query<{value:Record<string,any>}>("select value from state_documents where key='admin' for update");
      const doc=docs.rows[0]?.value;if (!doc) throw notFound("سند کاتالوگ پیدا نشد.");
      const result=await client.query<{id:string; colors:{id:string;name:string;hex:string}[];sizes:{id:string;label:string}[];active:boolean;is_base:boolean}>("select id,colors,sizes,active,is_base from products where id=$1 for update",[req.params.id]);
      const product=result.rows[0];if (!product) throw notFound("محصول پیدا نشد.");
      const colors=product.colors.map(c=>({...c})), sizes=product.sizes.map(size=>({...size}));
      if (!colors.length || !sizes.length) throw conflict("تنوع محصول ناقص است؛ ابتدا ساختار محصول را بررسی کنید.");
      const before={colors:structuredClone(colors),sizes:structuredClone(sizes)};
      let optionId=update ? body.id! : "";
      if (update) {
        // A label change must never reinterpret an SKU that has been used for
        // stock, a hold, an order or an inventory request. Lock variants in the
        // same order as the inventory workflow before checking that history.
        const affected=await client.query<{id:string;on_hand:number;quarantined:number}>(
          `select id,on_hand,quarantined from product_variants where product_id=$1 and ${colorAction ? "color_id" : "size_id"}=$2 order by id for update`,[product.id,optionId]);
        const ids=affected.rows.map(row=>row.id);
        if (affected.rows.some(row=>row.on_hand>0 || row.quarantined>0)) throw conflict("این تنوع سابقه یا موجودی دارد؛ برای حفظ هویت کالا قابل تغییر نیست.","option_in_use");
        if(ids.length) {
          const used=await client.query<{used:boolean}>(`select
            exists(select 1 from stock_reservations where variant_id=any($1::text[])) or
            exists(select 1 from inventory_movements where variant_id=any($1::text[])) or
            exists(select 1 from inventory_adjustments where variant_id=any($1::text[])) or
            exists(select 1 from order_lines where variant_id=any($1::text[])) as used`,[ids]);
          if(used.rows[0].used) throw conflict("این تنوع سابقه یا موجودی دارد؛ برای حفظ هویت کالا قابل تغییر نیست.","option_in_use");
          await client.query("update product_variants set updated_at=now() where id=any($1::text[])",[ids]);
        }
      }
      if (colorAction) {
        if (colors.some(c=>c.id!==optionId && normalize(c.name)===normalize(name))) throw conflict("این نام رنگ قبلاً برای محصول ثبت شده است.","duplicate_option");
        if (update) {
          const current=colors.find(c=>c.id===optionId);if(!current) throw notFound("رنگ پیدا نشد.");
          if (current.name!==body.expected?.name || current.hex!==body.expected?.hex) throw conflict("رنگ هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید.","option_stale");
          current.name=name; current.hex=hex;
        } else {
          if(colors.length>=30) throw validation("حداکثر ۳۰ رنگ مجاز است.");
          optionId=`color-${randomUUID()}`;colors.push({id:optionId,name,hex});
        }
      } else {
        if (sizes.some(size=>size.id!==optionId && normalize(size.label)===normalize(label))) throw conflict("این سایز قبلاً برای محصول ثبت شده است.","duplicate_option");
        if (update) {
          const current=sizes.find(size=>size.id===optionId);if(!current) throw notFound("سایز پیدا نشد.");
          if(current.label!==body.expected?.label) throw conflict("سایز هم‌زمان تغییر کرده است؛ اطلاعات را تازه‌سازی کنید.","option_stale");
          current.label=label;
        } else {
          if(sizes.length>=30) throw validation("حداکثر ۳۰ سایز مجاز است.");
          optionId=`size-${randomUUID()}`;sizes.push({id:optionId,label});
        }
      }
      if(product.is_base) {
        doc.productEdits ??= {};doc.productEdits[product.id]={...(doc.productEdits[product.id] ?? {}),colors,sizes};
      } else {
        if(!Array.isArray(doc.customProducts) || !doc.customProducts.some((p:any)=>p.id===product.id)) throw notFound("محصول در سند کاتالوگ پیدا نشد.");
        doc.customProducts=doc.customProducts.map((p:any)=>p.id===product.id ? {...p,colors,sizes}:p);
      }
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='admin'",[JSON.stringify(doc)]);
      await client.query("update products set colors=$2::jsonb,sizes=$3::jsonb,updated_at=now() where id=$1",[product.id,JSON.stringify(colors),JSON.stringify(sizes)]);
      if(!update) {
        // Only the newly introduced combinations are inserted; existing rows,
        // balances, reservations, SKUs and movement history are never changed.
        const combinations=colorAction ? sizes.map(size=>({color:optionId,size:size.id})) : colors.map(color=>({color:color.id,size:optionId}));
        for(const combination of combinations) await client.query(`insert into product_variants (id,product_id,color_id,size_id,sku,size_mode,on_hand,last_catalog_qty,active) values ($1,$2,$3,$4,$5,$6,0,0,$7)`,[variantIdFor(product.id,combination.color,combination.size),product.id,combination.color,combination.size,skuFor(product.id,combination.color,combination.size),sizeModeOf(sizes),product.active]);
      }
      await recordAudit({actor:session.subject,action:`catalog.option_${body.action}`,targetType:"product",targetId:product.id,before,after:{colors,sizes},requestId:req.id},client);
      return {ok:true,colors,sizes};
    });
  });

  /** Per-SKU sale switch is independent from the product publication state.
   * Existing holds are not cancelled; reservation takes the same variant lock. */
  app.get<{Params:{id:string}}>("/api/admin/products/:id/variant-sales",async (req,reply)=>{
    await requirePermission(req,"catalog:view");reply.header("cache-control","no-store");
    const rows=await query<{id:string;sku:string;color_id:string;size_id:string;sale_enabled:boolean;sale_version:number;variant_active:boolean;product_active:boolean;colors:{id:string;name:string}[];sizes:{id:string;label:string}[]}>(`select v.id,v.sku,v.color_id,v.size_id,v.sale_enabled,v.sale_version,v.active as variant_active,p.active as product_active,p.colors,p.sizes
      from products p join product_variants v on v.product_id=p.id where p.id=$1 order by v.color_id,v.size_id,v.id`,[req.params.id]);
    if(!rows.rows.length && !(await query("select 1 from products where id=$1",[req.params.id])).rowCount) throw notFound("محصول پیدا نشد.");
    return rows.rows.map(row=>({id:row.id,sku:row.sku,colorName:row.colors.find(c=>c.id===row.color_id)?.name ?? row.color_id,sizeLabel:row.sizes.find(z=>z.id===row.size_id)?.label ?? row.size_id,saleEnabled:row.sale_enabled,version:row.sale_version,variantActive:row.variant_active,productActive:row.product_active}));
  });
  app.patch<{Params:{id:string;variantId:string};Body:{saleEnabled?:unknown;expectedEnabled?:unknown;expectedVersion?:unknown}}>("/api/admin/products/:id/variant-sales/:variantId",async req=>{
    const session=await requirePermission(req,"catalog:edit");await requirePermission(req,"catalog:publish");
    const body=req.body ?? {};
    if(Object.keys(body).some(k=>k!=="saleEnabled" && k!=="expectedEnabled" && k!=="expectedVersion") || typeof body.saleEnabled!=="boolean" || typeof body.expectedEnabled!=="boolean" || !Number.isInteger(body.expectedVersion) || Number(body.expectedVersion)<0 || Number(body.expectedVersion)>=2147483647) throw validation("وضعیت یا نسخه فروش تنوع معتبر نیست.");
    return withTransaction(async client=>{
      const rows=await client.query<{sale_enabled:boolean;sale_version:number}>("select sale_enabled,sale_version from product_variants where id=$1 and product_id=$2 for update",[req.params.variantId,req.params.id]);
      const row=rows.rows[0];if(!row)throw notFound("تنوع محصول پیدا نشد.");
      if(row.sale_enabled!==body.expectedEnabled || row.sale_version!==body.expectedVersion)throw conflict("وضعیت فروش تنوع تغییر کرده است؛ فهرست را تازه کنید.","variant_sale_stale");
      if(row.sale_enabled!==body.saleEnabled){
        await client.query("update product_variants set sale_enabled=$2,sale_version=sale_version+1,updated_at=now() where id=$1",[req.params.variantId,body.saleEnabled]);
        await recordAudit({actor:session.subject,action:"catalog.variant_sale",targetType:"variant",targetId:req.params.variantId,before:{saleEnabled:row.sale_enabled},after:{saleEnabled:body.saleEnabled,productId:req.params.id},requestId:req.id},client);
      }
      return {ok:true,saleEnabled:body.saleEnabled,version:row.sale_version+(row.sale_enabled===body.saleEnabled?0:1)};
    });
  });

  /** Targeted catalogue edit: the storefront document and relational price
   * change atomically. Never accept stock, variants or unrelated document keys. */
  app.patch<{ Params: { id: string }; Body: { name?: string; category?: string; description?: string; price?: number; compareAt?: number|null; material?: string|null; care?: string|null; fit?: string|null; origin?: string|null; active?: boolean; expected?: Record<string,unknown> } }>("/api/admin/products/:id", async (req) => {
    const session = await requirePermission(req, "catalog:edit");
    const body = req.body ?? {};
    const keys = Object.keys(body);
    if (!keys.length || keys.some((key) => !["name", "category", "description", "price", "compareAt", "material", "care", "fit", "origin", "active", "expected"].includes(key))) {
      throw validation("فیلدهای ویرایش محصول معتبر نیستند.");
    }
    for (const key of ["name", "category", "description"] as const) {
      if (body[key] !== undefined && (typeof body[key] !== "string" || body[key]!.length > (key === "description" ? 5000 : 160) || (key !== "description" && !body[key]!.trim()))) {
        throw validation("نام، دسته یا توضیح محصول معتبر نیست.");
      }
    }
    if (body.price !== undefined && (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price < 0 || body.price > 99999999 || Number(body.price.toFixed(2)) !== body.price)) throw validation("قیمت محصول معتبر نیست (حداکثر دو رقم اعشار).");
    for (const key of ["material", "care", "fit", "origin"] as const) {
      if (body[key] !== undefined && body[key] !== null && (typeof body[key] !== "string" || body[key]!.length > 2000)) throw validation("مشخصات محصول معتبر نیست.");
    }
    if (body.compareAt !== undefined && body.compareAt !== null && (typeof body.compareAt !== "number" || !Number.isFinite(body.compareAt) || body.compareAt < 0 || body.compareAt > 99999999 || Number(body.compareAt.toFixed(2)) !== body.compareAt)) throw validation("قیمت مقایسه‌ای معتبر نیست (حداکثر دو رقم اعشار).");
    const expectedKeys=["name","category","description","price","compareAt","material","care","fit","origin","active"];
    if (body.expected !== undefined && (!body.expected || typeof body.expected !== "object" || Array.isArray(body.expected) || Object.keys(body.expected).length!==expectedKeys.length || expectedKeys.some(key=>!Object.hasOwn(body.expected!,key)))) throw validation("نسخه محصول معتبر نیست.");
    if (keys.every(key=>key==="expected")) throw validation("تغییری برای ذخیره وجود ندارد.");
    if (body.active !== undefined && typeof body.active !== "boolean") throw validation("وضعیت محصول معتبر نیست.");
    if (body.active !== undefined) await requirePermission(req, "catalog:publish");
    const id = req.params.id;
    await withTransaction(async (client) => {
      await client.query("select pg_advisory_xact_lock(hashtext('kv-commerce-catalog-sync'))");
      // This document is the storefront's source of catalogue overrides. A
      // row lock prevents two targeted edits from clobbering one another.
      const docs = await client.query<{ value: Record<string, any> }>("select value from state_documents where key = 'admin' for update");
      const doc = docs.rows[0]?.value;
      if (!doc) throw notFound("سند کاتالوگ پیدا نشد.");
      const found = await client.query<ProductRow>("select * from products where id = $1 for update", [id]);
      const previous = found.rows[0];
      if (!previous) throw notFound("محصول پیدا نشد.");
      const before={name:previous.name,category:previous.category,description:previous.description,price:Number(previous.price),compareAt:previous.compare_at===null?null:Number(previous.compare_at),material:previous.material,care:previous.care,fit:previous.fit,origin:previous.origin,active:previous.active};
      if(body.expected && expectedKeys.some(key=>body.expected![key]!==before[key as keyof typeof before])) throw conflict("محصول هم‌زمان تغییر کرده است؛ فرم را ببندید، فهرست را تازه کنید و دوباره بررسی کنید.","product_stale");
      if (body.category !== undefined && body.category.trim() !== previous.category) {
        const ops = await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
        if (!Array.isArray(ops.rows[0]?.value?.categories) || !ops.rows[0].value.categories.some((c:any)=>c.name===body.category!.trim() && c.active===true)) throw validation("دسته فعال انتخاب‌شده پیدا نشد.");
      }
      const update: Record<string, unknown> = {};
      for (const key of ["name", "category", "description", "price", "compareAt", "material", "care", "fit", "origin"] as const) {
        if (body[key] !== undefined) update[key] = typeof body[key] === "string" ? body[key].trim() : body[key];
      }
      if (previous.is_base) {
        doc.productEdits ??= {};
        doc.productEdits[id] = { ...(doc.productEdits[id] ?? {}), ...update };
      } else {
        if (!Array.isArray(doc.customProducts) || !doc.customProducts.some((item: any) => item.id === id)) throw notFound("محصول در سند کاتالوگ پیدا نشد.");
        doc.customProducts = doc.customProducts.map((item: any) => item.id === id ? { ...item, ...update, ...(body.active === undefined ? {} : { active: body.active }) } : item);
      }
      if (body.active !== undefined) {
        const hidden = Array.isArray(doc.hidden) ? doc.hidden.filter((item: unknown) => item !== id) : [];
        doc.hidden = body.active ? hidden : [...hidden, id];
      }
      const next = {
        name: update.name ?? previous.name,
        category: update.category ?? previous.category,
        description: update.description ?? previous.description,
        price: update.price ?? Number(previous.price),
        compareAt: Object.hasOwn(update,"compareAt") ? update.compareAt : before.compareAt,
        material: Object.hasOwn(update,"material") ? update.material : previous.material,
        care: Object.hasOwn(update,"care") ? update.care : previous.care,
        fit: Object.hasOwn(update,"fit") ? update.fit : previous.fit,
        origin: Object.hasOwn(update,"origin") ? update.origin : previous.origin,
        active: body.active ?? previous.active,
      };
      if(next.compareAt !== null && Number(next.compareAt) <= Number(next.price) && (body.compareAt !== undefined || body.price !== undefined)) throw validation("قیمت مقایسه‌ای باید بیشتر از قیمت فروش باشد؛ در غیر این صورت آن را خالی کنید.");
      await client.query("update state_documents set value = $2::jsonb, updated_at = now() where key = $1", ["admin", JSON.stringify(doc)]);
      await client.query("update products set name=$2, category=$3, description=$4, price=$5, active=$6, compare_at=$7, material=$8, care=$9, fit=$10, origin=$11, updated_at=now() where id=$1", [id, next.name, next.category, next.description, next.price, next.active, next.compareAt, next.material, next.care, next.fit, next.origin]);
      if (body.active !== undefined) await client.query("update product_variants set active=$2, updated_at=now() where product_id=$1", [id, body.active]);
      if (Number(previous.price) !== Number(next.price)) await client.query("insert into price_history(product_id,old_price,new_price,actor,source) values($1,$2,$3,$4,'admin_panel')", [id, previous.price, next.price, session.subject]);
      await recordAudit({ actor: session.subject, action: "catalog.product_updated", targetType: "product", targetId: id, before, after: next, requestId: req.id }, client);
    });
    return { ok: true, id };
  });

  /** Manage images without overwriting other product or inventory fields. */
  app.post<{ Params:{id:string}; Body:{action?:string;imageId?:string;url?:string;imageData?:string;role?:string;colorId?:string;direction?:string;expected?:unknown} }>("/api/admin/products/:id/images", async req => {
    const session = await requirePermission(req,"catalog:edit");
    const {action,imageId} = req.body ?? {}; const id = req.params.id;
    if (!["add","remove","update","move"].includes(action ?? "")) throw validation("عملیات تصویر معتبر نیست.");
    let url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const imageData = req.body?.imageData;
    const role = req.body?.role ?? "gallery", colorId = req.body?.colorId ?? "*";
    if (action === "add" && ((!imageData && (url.length > 2000 || !(/^https:\/\/[^\s]+$/i.test(url) || /^\/uploads\/[a-z0-9._-]+$/i.test(url)))) || (imageData !== undefined && !!url) || !["main","gallery","hover","detail","cutout"].includes(role))) throw validation("نشانی یا نقش تصویر معتبر نیست.");
    if (action === "update" && (!req.body?.role || !["main","gallery","hover","detail","cutout"].includes(role) || typeof colorId !== "string" || !colorId)) throw validation("نقش یا رنگ تصویر معتبر نیست.");
    if (action === "move" && !["earlier","later"].includes(req.body?.direction ?? "")) throw validation("جهت جابه‌جایی تصویر معتبر نیست.");
    const expected=req.body?.expected;
    if ((action === "update" || action === "move") && expected === undefined) throw validation("نسخه فهرست تصاویر لازم است.");
    if (expected !== undefined && (!Array.isArray(expected) || expected.length>30 || !expected.every(i=>i && typeof i==="object" && !Array.isArray(i) && Object.keys(i).length===4 && ["id","url","role","colorId"].every(k=>typeof i[k]==="string")))) throw validation("نسخه فهرست تصاویر معتبر نیست.");
    if (action === "add" && role === "cutout" && !imageData) throw validation("تصویر بوم باید به‌صورت فایل شفاف بارگذاری شود؛ نشانی خارجی پذیرفته نیست.");
    const uploaded = action === "add" && imageData !== undefined ? await prepareProductImage(imageData, role === "cutout") : null;
    if (uploaded) url = uploaded.url;
    try { return await withTransaction(async client => {
      const docResult = await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
      const doc = docResult.rows[0]?.value; if (!doc) throw notFound("سند تصاویر پیدا نشد.");
      const products = await client.query<{colors:{id:string}[]}>("select colors from products where id=$1 for update",[id]);
      const product = products.rows[0]; if (!product) throw notFound("محصول پیدا نشد.");
      if ((action === "add" || action === "update") && colorId !== "*" && !product.colors.some(c=>c.id===colorId)) throw validation("رنگ تصویر معتبر نیست.");
      const found = await client.query<{id:string;url:string;color_id:string;role:string;position:number}>("select id,url,color_id,role,position from product_images where product_id=$1 order by position,id",[id]);
      let images = found.rows.map(i=>({id:i.id,url:i.url,colorId:i.color_id,role:i.role}));
      const auditImages=(items:typeof images)=>items.map(({id,role,colorId})=>({id,role,colorId}));
      const beforeImages=auditImages(images);
      if (expected !== undefined && (expected.length!==images.length || expected.some((item:any,index:number)=>["id","url","role","colorId"].some(key=>item[key]!==images[index][key as keyof typeof images[number]])))) throw conflict("تصاویر هم‌زمان تغییر کرده‌اند؛ فرم را ببندید و فهرست را تازه کنید.","product_images_stale");
      if (action === "add") {
        if(images.length >= 30) throw validation("حداکثر ۳۰ تصویر مجاز است.");
        if (role === "main") images = images.map(i=>i.role === "main" ? {...i,role:"gallery"} : i);
        images.push({id:`img-${randomUUID()}`,url,colorId,role});
      } else {
        const index=images.findIndex(i=>i.id===imageId);
        if (index<0) throw notFound("تصویر پیدا نشد.");
        if(action === "remove") {
          if (images.length === 1) throw validation("دست‌کم یک تصویر باید باقی بماند.");
          images = images.filter(i=>i.id!==imageId);
        } else if(action === "update") {
          if(role === "cutout" && images[index].role !== "cutout") throw validation("برای اطمینان از شفافیت، تصویر بوم را به‌صورت فایل جدید بارگذاری کنید.");
          if(role === "main") images=images.map(i=>i.role==="main" && i.id!==imageId ? {...i,role:"gallery"} : i);
          images[index]={...images[index],role,colorId};
        } else {
          const target=index+(req.body!.direction==="earlier" ? -1 : 1);
          if(target<0 || target>=images.length) throw validation("تصویر در ابتدای یا انتهای فهرست است.");
          [images[index],images[target]]=[images[target],images[index]];
        }
      }
      await client.query("delete from product_images where product_id=$1",[id]);
      for (let position=0;position<images.length;position++) { const image=images[position]; await client.query("insert into product_images(id,product_id,url,color_id,role,position) values($1,$2,$3,$4,$5,$6)",[image.id,id,image.url,image.colorId,image.role,position]); }
      doc.productImages = {...(doc.productImages ?? {}),[id]:images};
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);
      await recordAudit({actor:session.subject,action:`catalog.image_${action}`,targetType:"product",targetId:id,before:{images:beforeImages},after:{action,imageId:action === "add" ? images[images.length-1].id : imageId,images:auditImages(images)},requestId:req.id},client);
      return {ok:true,images};
    }); } catch (error) { if (uploaded) await uploaded.discard(); throw error; }
  });

  app.get<{ Params: { id: string } }>("/api/products/:id", async (req, reply) => {
    const row = await query<ProductRow>("select * from products where id = $1", [req.params.id]);
    if (!row.rows[0]) return reply.code(404).send({ error: "محصول پیدا نشد." });
    if (!row.rows[0].active) await requirePermission(req, "catalog:view");
    const images = await query("select id, url, color_id, role, position from product_images where product_id = $1 order by position", [
      req.params.id,
    ]);
    const complements = await query("select complement_id from product_complements where product_id = $1 order by position", [
      req.params.id,
    ]);
    const stocks = await sellableStocks([req.params.id]);
    return toProduct(
      {...row.rows[0],stock:stocks.get(req.params.id) ?? {}},
      images.rows.map((i: any) => ({ id: i.id, url: i.url, colorId: i.color_id, role: i.role })),
      complements.rows.map((c: any) => c.complement_id),
    );
  });

  app.get("/api/orders", async (req) => {
    await requirePermission(req, "orders:view");
    const rows = await query<{ data: unknown }>("select data from orders order by created_at desc limit 200");
    return rows.rows.map((r) => r.data);
  });

  /**
   * Legacy manual order entry. The storefront must never call this: an order
   * that did not come from the commerce checkout has no payment attempt, no
   * reservation and no lines, so it can never be paid or fulfilled correctly.
   * It stays available to an authenticated admin (phone orders) and every row
   * it creates is written to the audit trail.
   */
  app.post<{
    Body: {
      id?: string;
      at?: number;
      customer?: string;
      email?: string;
      status?: string;
      total?: number;
      lines?: unknown[];
    };
  }>("/api/orders", async (req, reply) => {
    // a real admin session, not the optional dev guard: this endpoint must never
    // be reachable by the storefront
    const session = await requirePermission(req, "orders:edit");
    const body = req.body ?? {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) return reply.code(400).send({ error: "سبد خرید خالی است." });
    const id = String(body.id ?? `VL-${Date.now()}`);
    const at = Number(body.at) || Date.now();
    const record = { ...body, id, at, lines };
    await query(
      `insert into orders (id, created_at, customer, email, status, total, data)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         customer = excluded.customer, email = excluded.email, status = excluded.status,
         total = excluded.total, data = excluded.data`,
      [id, new Date(at), body.customer ?? null, body.email ?? null, body.status ?? "pending", Number(body.total) || 0, JSON.stringify(record)],
    );
    await recordAudit({
      actor: actorOf(session),
      action: "order.legacy_create",
      targetType: "order",
      targetId: id,
      after: { status: body.status ?? "pending", total: Number(body.total) || 0, lines: lines.length },
      reason: "manual order entry outside the checkout flow",
    });
    return { ok: true, id };
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>("/api/orders/:id", async (req, reply) => {
    const session = await requirePermission(req, "orders:edit");
    const status = String(req.body?.status ?? "").trim();
    if (!status) return reply.code(400).send({ error: "وضعیت لازم است." });

    // commerce orders move through the payment/fulfilment state machine only;
    // a free-text status write here would bypass stock, audit and shipping rules
    const commerce = await query<{ id: string }>(
      "select order_id as id from order_lines where order_id = $1 limit 1",
      [req.params.id],
    );
    if (commerce.rowCount) {
      return reply.code(409).send({
        error: "این سفارش از مسیر تجارت ثبت شده؛ وضعیتش را فقط از مسیر پرداخت/انبار تغییر بده.",
        code: "commerce_order_status_locked",
      });
    }
    const res = await query<{ data: unknown }>(
      "update orders set status = $1, data = jsonb_set(data, '{status}', to_jsonb($1::text)) where id = $2 returning data",
      [status, req.params.id],
    );
    if (!res.rows[0]) return reply.code(404).send({ error: "سفارش پیدا نشد." });
    await recordAudit({
      actor: actorOf(session),
      action: "order.legacy_status_change",
      targetType: "order",
      targetId: req.params.id,
      after: { status },
    });
    return { ok: true, order: res.rows[0].data };
  });

  app.get("/api/customers", async (req) => {
    await requirePermission(req, "customers:view");
    const rows = await query(
      "select email, name, phone, size, addresses, two_factor, created_at from customers order by created_at desc",
    );
    return rows.rows;
  });

  app.get("/api/health", async () => {
    // Public liveness must not disclose customer or order volumes.
    await query("select 1");
    return {
      ok: true,
      db: "postgres",
      // when the panel lives on its own host the browser is told where to go (decision 86)
      adminUrl: process.env.ADMIN_BASE_URL ?? null,
      time: new Date().toISOString(),
    };
  });
}
