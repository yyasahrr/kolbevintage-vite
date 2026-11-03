import { useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Image as ImageIcon,
  Layers,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Undo2,
  Upload,
  Users,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { liveCatalog, liveGetProduct } from "@/data/catalog";
import { LOOKS, formatPrice } from "@/data/looks";
import { ProductThumb } from "@/components/ProductThumb";
import { ProductMediaEditor } from "@/components/ProductMediaEditor";
import { fileToDataUrl } from "@/builder/ControlsUI";
import { resolveImg } from "@/builder/stock";
import { timeAgo } from "@/builder/util";
import {
  addLog,
  blockIp,
  grantTryon,
  lookProductIds,
  patchBrand,
  patchFormField,
  patchSecurity,
  removeCategory,
  removeLabel,
  removeMegaMenu,
  removeSizeSet,
  removeSmsTemplate,
  removeTryonPackage,
  saveCategory,
  saveLabel,
  saveMegaMenu,
  saveSizeSet,
  saveSmsTemplate,
  saveTryonPackage,
  productImagesOf,
  setProductImages,
  setLookProducts,
  setLookImage,
  setReturnStatus,
  setTicketStatus,
  addTicketMessage,
  unblockIp,
  useOps,
  type CategoryDef,
  type CustomerLabel,
  type MegaMenuDef,
  type SizeSet,
  type SmsTemplate,
  type TryOnPackage,
} from "@/state/ops";
import { useAdmin, setStockUnified, restock } from "@/state/admin";
import { useAuth } from "@/state/auth";

/* =====================================================================
   Admin → operations panels. Rendered from AdminPage.
   Mobile-first; every list collapses to stacked cards under ~640px.
   ===================================================================== */

const fa = (n: number) => n.toLocaleString("fa-IR");

function PanelHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <header className="ad-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action && <div className="ad-head-actions">{action}</div>}
    </header>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ad-card">
      <header className="ad-card-head">
        <h3>{title}</h3>
        {action}
      </header>
      <div className="ad-card-body">{children}</div>
    </section>
  );
}

/* =====================================================================
   brand & logo
   ===================================================================== */

export function BrandPanel() {
  const ops = useOps();
  const brand = ops.brand;
  const logoRef = useRef<HTMLInputElement>(null);
  const favRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (f: File | undefined, key: "logoImage" | "favicon") => {
    if (!f) return;
    setBusy(true);
    try {
      patchBrand({ [key]: await fileToDataUrl(f, 480) } as never);
      addLog({ actor: "مدیر", action: "بارگذاری تصویر برند", target: key === "favicon" ? "فاوآیکن" : "لوگو" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PanelHead title="برند و لوگو" sub="لوگو، فاوآیکن، نام و متن اعلان هدر از اینجا کنترل می‌شود." />
      <div className="ad-grid-2">
        <Panel title="لوگو" action={<span className="ad-hint">{busy ? "در حال آپلود…" : "PNG شفاف بهترین نتیجه را می‌دهد"}</span>}>
          <div className="ad-logo-box">
            {brand.logoImage ? <img src={resolveImg(brand.logoImage)} alt="لوگوی سایت" /> : <span className="latin-track">{brand.logoText}</span>}
          </div>
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={() => logoRef.current?.click()}>
              <Upload width={13} height={13} /> آپلود لوگو
            </button>
            {brand.logoImage && (
              <button type="button" className="ad-btn is-sm is-danger" onClick={() => patchBrand({ logoImage: "" })}>
                <Trash2 width={13} height={13} /> حذف
              </button>
            )}
            <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0], "logoImage")} />
          </div>
          <label className="ad-field" style={{ marginTop: 10 }}>
            متن لوگو (اگر تصویر نباشد)
            <input className="ad-input" value={brand.logoText} onChange={(e) => patchBrand({ logoText: e.target.value })} dir="ltr" />
          </label>
        </Panel>

        <Panel title="فاوآیکن">
          <div className="ad-fav-row">
            <div className="ad-fav">{brand.favicon ? <img src={resolveImg(brand.favicon)} alt="فاوآیکن" /> : <Sparkles width={18} height={18} />}</div>
            <button type="button" className="ad-btn is-sm" onClick={() => favRef.current?.click()}>
              <Upload width={13} height={13} /> آپلود
            </button>
            {brand.favicon && (
              <button type="button" className="ad-icon is-danger" aria-label="حذف فاوآیکن" onClick={() => patchBrand({ favicon: "" })}>
                <Trash2 width={13} height={13} />
              </button>
            )}
            <input ref={favRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0], "favicon")} />
          </div>
        </Panel>
      </div>

      <Panel title="هویت و متن‌ها">
        <div className="ad-two">
          <label className="ad-field">نام برند<input className="ad-input" value={brand.name} onChange={(e) => patchBrand({ name: e.target.value })} /></label>
          <label className="ad-field">شعار<input className="ad-input" value={brand.tagline} onChange={(e) => patchBrand({ tagline: e.target.value })} /></label>
        </div>
        <label className="ad-field">متن نوار اعلان بالای سایت<input className="ad-input" value={brand.announcement} onChange={(e) => patchBrand({ announcement: e.target.value })} /></label>
        <label className="ad-check"><input type="checkbox" checked={brand.announcementActive} onChange={(e) => patchBrand({ announcementActive: e.target.checked })} /> نمایش نوار اعلان</label>
        <label className="ad-field">یادداشت فوتر<textarea className="ad-input" rows={2} value={brand.footerNote} onChange={(e) => patchBrand({ footerNote: e.target.value })} /></label>
      </Panel>
    </>
  );
}

/* =====================================================================
   categories & size sets
   ===================================================================== */

export function CategoriesPanel() {
  const ops = useOps();
  const [draft, setDraft] = useState<CategoryDef | null>(null);
  const [sizeDraft, setSizeDraft] = useState<SizeSet | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const blank = (): CategoryDef => ({ id: `cat-${Date.now().toString(36)}`, name: "", slug: "", garments: [], thumbnail: "", sizeSetId: ops.sizeSets[0]?.id ?? "", active: true, order: ops.categories.length + 1 });
  const blankSize = (): SizeSet => ({ id: `ss-${Date.now().toString(36)}`, name: "", sizes: [] });

  const upload = async (f: File | undefined) => {
    if (!f || !draft) return;
    setDraft({ ...draft, thumbnail: await fileToDataUrl(f, 700) });
  };

  return (
    <>
      <PanelHead
        title="دسته‌بندی‌ها و سایزها"
        sub="هر دسته تصویر بندانگشتی و مجموعهٔ سایز مخصوص خودش را دارد؛ محصولات همان دسته از این سایزها استفاده می‌کنند."
        action={
          <>
            <button type="button" className="ad-btn is-sm is-primary" onClick={() => setDraft(blank())}><Plus width={13} height={13} /> دستهٔ جدید</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setSizeDraft(blankSize())}><Tag width={13} height={13} /> سایز جدید</button>
          </>
        }
      />

      <Panel title="دسته‌بندی‌ها">
        <div className="ad-cat-grid">
          {ops.categories.map((c) => (
            <article key={c.id} className={cn("ad-cat", !c.active && "is-off")}>
              <div className="ad-cat-thumb">
                {c.thumbnail ? <img src={resolveImg(c.thumbnail)} alt={c.name} /> : <ImageIcon width={20} height={20} />}
              </div>
              <div className="ad-cat-main">
                <b>{c.name || "بدون نام"}</b>
                <small>
                  {c.garments.length.toLocaleString("fa-IR")} نوع قطعه · سایز: {ops.sizeSets.find((s) => s.id === c.sizeSetId)?.name ?? "—"}
                </small>
                <small className="ad-reset">{c.garments.join(" · ") || "بدون نوع"}</small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className={cn("ad-icon", c.active && "is-on")} title="فعال/غیرفعال" aria-pressed={c.active} onClick={() => saveCategory({ ...c, active: !c.active })}>
                  <CheckCircle2 width={14} height={14} />
                </button>
                <button type="button" className="ad-icon" title="ویرایش" aria-label="ویرایش" onClick={() => setDraft(c)}><Pencil width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" title="حذف" aria-label="حذف" onClick={() => removeCategory(c.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="مجموعه‌های سایز">
        <div className="ad-cards">
          {ops.sizeSets.map((ss) => (
            <article key={ss.id} className="ad-card-inline">
              <div className="ad-card-inline-main">
                <b>{ss.name}</b>
                <small className="ad-reset">{ss.sizes.join(" · ")}</small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className="ad-icon" aria-label="ویرایش" onClick={() => setSizeDraft(ss)}><Pencil width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" aria-label="حذف" onClick={() => removeSizeSet(ss.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      {draft && (
        <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div className="ad-modal" role="dialog" aria-modal="true" aria-label="دسته‌بندی">
            <header className="ad-modal-head"><h3>{ops.categories.some((c) => c.id === draft.id) ? "ویرایش دسته" : "دستهٔ جدید"}</h3><button type="button" className="ad-icon" aria-label="بستن" onClick={() => setDraft(null)}><X width={16} height={16} /></button></header>
            <div className="ad-modal-body">
              <div className="ad-two">
                <label className="ad-field">نام<input className="ad-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: e.target.value.trim().replace(/\s+/g, "-") })} /></label>
                <label className="ad-field">اسلاگ<input className="ad-input" dir="ltr" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} /></label>
              </div>
              <label className="ad-field">مجموعهٔ سایز
                <select className="ad-select" value={draft.sizeSetId} onChange={(e) => setDraft({ ...draft, sizeSetId: e.target.value })}>
                  {ops.sizeSets.map((ss) => <option key={ss.id} value={ss.id}>{ss.name} — {ss.sizes.join(" · ")}</option>)}
                </select>
              </label>
              <p className="ad-field-label">تصویر بندانگشتی</p>
              <div className="ad-thumb-edit">
                <div className="ad-thumb-preview">{draft.thumbnail ? <img src={resolveImg(draft.thumbnail)} alt="" /> : <ImageIcon width={20} height={20} />}</div>
                <div className="ad-actions">
                  <button type="button" className="ad-btn is-sm" onClick={() => fileRef.current?.click()}><Upload width={13} height={13} /> آپلود</button>
                  {draft.thumbnail && <button type="button" className="ad-btn is-sm is-danger" onClick={() => setDraft({ ...draft, thumbnail: "" })}>حذف</button>}
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
                </div>
              </div>
              <p className="ad-field-label">نوع قطعه‌های این دسته</p>
              <div className="ad-size-pool">
                {(["coat", "jacket", "knit", "tee", "dress", "skirt", "trousers", "bag", "loafer", "heel", "boot", "sneaker", "accessory"] as const).map((g) => {
                  const has = draft.garments.includes(g);
                  return (
                    <button key={g} type="button" className={cn("ad-chip", has && "is-on")} onClick={() => setDraft({ ...draft, garments: has ? draft.garments.filter((x) => x !== g) : [...draft.garments, g] })}>
                      {g}
                    </button>
                  );
                })}
              </div>
              <label className="ad-check"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> فعال باشد</label>
            </div>
            <footer className="ad-modal-foot">
              <div className="ad-actions-spacer" />
              <button type="button" className="ad-btn" onClick={() => setDraft(null)}>انصراف</button>
              <button type="button" className="ad-btn is-primary" disabled={!draft.name.trim()} onClick={() => { saveCategory(draft); setDraft(null); }}><Save width={13} height={13} /> ذخیره</button>
            </footer>
          </div>
        </div>
      )}

      {sizeDraft && (
        <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setSizeDraft(null)}>
          <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="مجموعهٔ سایز">
            <header className="ad-modal-head"><h3>مجموعهٔ سایز</h3><button type="button" className="ad-icon" aria-label="بستن" onClick={() => setSizeDraft(null)}><X width={16} height={16} /></button></header>
            <div className="ad-modal-body">
              <label className="ad-field">نام<input className="ad-input" value={sizeDraft.name} onChange={(e) => setSizeDraft({ ...sizeDraft, name: e.target.value })} placeholder="مثلاً کفش زنانه" /></label>
              <label className="ad-field">سایزها (با ویرگول)<input className="ad-input" dir="ltr" value={sizeDraft.sizes.join(", ")} onChange={(e) => setSizeDraft({ ...sizeDraft, sizes: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="S, M, L, XL" /></label>
              <p className="ad-hint">این سایزها هنگام افزودن کالا و در راهنمای سایز هوشمند استفاده می‌شوند.</p>
            </div>
            <footer className="ad-modal-foot">
              <div className="ad-actions-spacer" />
              <button type="button" className="ad-btn" onClick={() => setSizeDraft(null)}>انصراف</button>
              <button type="button" className="ad-btn is-primary" disabled={!sizeDraft.name.trim() || !sizeDraft.sizes.length} onClick={() => { saveSizeSet(sizeDraft); setSizeDraft(null); }}><Save width={13} height={13} /> ذخیره</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/* =====================================================================
   per-colour media + hover media
   ===================================================================== */

export function MediaPanel() {
  const ops = useOps();
  const catalog = liveCatalog();
  const [q, setQ] = useState("");
  const [openProduct, setOpenProduct] = useState<string | null>(null);

  const list = useMemo(() => {
    const s = q.trim();
    return catalog.filter((p) => !s || p.name.includes(s)).slice(0, 40);
  }, [catalog, q]);

  const product = openProduct ? liveGetProduct(openProduct) : null;
  const images = product ? productImagesOf(product.id) : [];

  return (
    <>
      <PanelHead
        title="تصاویر محصول"
        sub="یک گالری برای هر محصول؛ تصاویر را داخل باکس بریز و زیر هر عکس رنگ و نقشش را انتخاب کن — شاخص، گالری، هاور یا جزئیات."
      />

      <div className="ad-toolbar">
        <input className="ad-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی محصول…" aria-label="جست‌وجوی محصول" />
      </div>

      <div className="ad-media-grid">
        {list.map((p) => {
          const imgs = ops.productImages[p.id] ?? [];
          const hovered = imgs.some((i) => i.role === "hover");
          return (
            <button key={p.id} type="button" className={cn("ad-media-card", openProduct === p.id && "is-on")} onClick={() => setOpenProduct(openProduct === p.id ? null : p.id)}>
              <ProductThumb product={p} className="w-full" />
              <span className="ad-media-name">{p.name}</span>
              <span className="ad-media-badges">
                <em className={imgs.length ? "is-done" : ""}>{imgs.length.toLocaleString("fa-IR")} تصویر</em>
                {hovered && <em className="is-done">هاور</em>}
              </span>
            </button>
          );
        })}
      </div>

      {product && (
        <Panel title={`تصاویر ${product.name}`} action={<button type="button" className="ad-btn is-sm" onClick={() => setOpenProduct(null)}><X width={13} height={13} /> بستن</button>}>
          <ProductMediaEditor
            images={images}
            colors={product.colors}
            onChange={(next) => {
              setProductImages(product.id, next);
              addLog({ actor: "مدیر", action: "ویرایش گالری تصاویر", target: product.name, meta: `${next.length} تصویر` });
            }}
          />
          <p className="ad-hint">ترتیب تصاویر مهم است: «تصویر شاخص» اول گالری می‌آید، عکس «هاور» فقط وقتی نشانگر روی کارت محصول می‌رود دیده می‌شود و «جزئیات» برای نمای نزدیک پارچه است.</p>
        </Panel>
      )}
    </>
  );
}

/* =====================================================================
   looks: assign products to each runway look
   ===================================================================== */

export function LooksPanel() {
  const ops = useOps();
  const [open, setOpen] = useState<string | null>(LOOKS[0]?.id ?? null);
  const [q, setQ] = useState("");
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const lookImgRef = useRef<HTMLInputElement>(null);
  const catalog = liveCatalog();

  const uploadLook = async (f: File | undefined) => {
    if (!f || !uploadFor) return;
    setLookImage(uploadFor, await fileToDataUrl(f, 1200));
    addLog({ actor: "مدیر", action: "آپلود تصویر استایل", target: uploadFor });
    setUploadFor(null);
  };

  const assigned = (lookId: string) => {
    const explicit = lookProductIds(lookId);
    if (explicit.length) return explicit.map((id) => liveGetProduct(id)).filter(Boolean);
    return LOOKS.find((l) => l.id === lookId)?.products.map((p) => liveGetProduct(p.id)).filter(Boolean) ?? [];
  };

  return (
    <>
      <input ref={lookImgRef} type="file" accept="image/*" hidden onChange={(e) => void uploadLook(e.target.files?.[0])} />
      <PanelHead title="استایل‌های رانوی" sub="تصویر هر استایل و قطعه‌های پوشیده‌شده در آن را اینجا لینک کن. مشتری با کلیک روی استایل، فهرست همین قطعه‌ها را می‌بیند." />
      <div className="ad-looks-list">
        {LOOKS.map((l) => {
          const ids = assigned(l.id).map((p) => p!.id);
          const isOpen = open === l.id;
          return (
            <article key={l.id} className={cn("ad-look-edit", isOpen && "is-open")}>
              <button type="button" className="ad-look-edit-head" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
                <img src={ops.lookImages[l.id] ?? l.image} alt={l.name} />
                <span className="ad-look-edit-main">
                  <b>{l.name}</b>
                  <small>{l.tagline}</small>
                  <small className="ad-reset">{ids.length.toLocaleString("fa-IR")} قطعه لینک‌شده</small>
                </span>
                <span className="ad-look-edit-toggle">{isOpen ? "بستن" : "ویرایش قطعه‌ها"}</span>
              </button>

              {isOpen && (
                <div className="ad-look-edit-body">
                  <div className="ad-look-upload">
                    <p className="ad-field-label">تصویر این استایل</p>
                    <div className="ad-look-upload-row">
                      <div className="ad-look-upload-prev"><img src={ops.lookImages[l.id] ?? l.image} alt={l.name} /></div>
                      <div className="ad-actions">
                        <button type="button" className="ad-btn is-sm" onClick={() => { setUploadFor(l.id); lookImgRef.current?.click(); }}><Upload width={13} height={13} /> آپلود تصویر</button>
                        {ops.lookImages[l.id] && <button type="button" className="ad-btn is-sm is-danger" onClick={() => setLookImage(l.id, "")}><Trash2 width={13} height={13} /> حذف</button>}
                        <p className="ad-hint">اگر تصویر جدید آپلود نکنی، عکس رانوی همین استایل استفاده می‌شود.</p>
                      </div>
                    </div>
                  </div>
                  <div className="ad-look-assigned">
                    <p className="ad-field-label">قطعه‌های این استایل</p>
                    {ids.length === 0 && <p className="ad-hint">هنوز قطعه‌ای لینک نشده.</p>}
                    <ul>
                      {assigned(l.id).map((p) => p && (
                        <li key={p.id}>
                          <ProductThumb product={p} className="w-[42px]" />
                          <span>{p.name}</span>
                          <b>{formatPrice(p.price)}</b>
                          <button type="button" className="ad-icon is-danger" aria-label={`حذف ${p.name}`} onClick={() => setLookProducts(l.id, ids.filter((x) => x !== p.id))}>
                            <X width={12} height={12} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="ad-look-picker">
                    <p className="ad-field-label">افزودن قطعه</p>
                    <div className="ad-tray-search" style={{ maxWidth: "100%" }}>
                      <Search width={13} height={13} />
                      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی محصول…" aria-label="جست‌وجوی محصول برای استایل" />
                    </div>
                    <div className="ad-look-pick-list">
                      {catalog
                        .filter((p) => !q.trim() || p.name.includes(q.trim()))
                        .slice(0, 30)
                        .map((p) => {
                          const on = ids.includes(p.id);
                          return (
                            <button key={p.id} type="button" className={cn("ad-look-pick", on && "is-on")} onClick={() => setLookProducts(l.id, on ? ids.filter((x) => x !== p.id) : [...ids, p.id])}>
                              <ProductThumb product={p} className="w-[38px]" />
                              <span>{p.name}</span>
                              {on ? <Check width={13} height={13} /> : <Plus width={13} height={13} />}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

/* =====================================================================
   CRM: labels, segmentation, SMS marketing
   ===================================================================== */

export function CrmPanel() {
  const ops = useOps();
  const admin = useAdmin();
  const auth = useAuth();
  const [labelDraft, setLabelDraft] = useState<CustomerLabel | null>(null);
  const [template, setTemplate] = useState<SmsTemplate | null>(null);
  const [body, setBody] = useState(ops.smsTemplates[0]?.body ?? "");
  const [audience, setAudience] = useState("all");
  const [sent, setSent] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBody, setBulkBody] = useState("");
  const togglePick = (k: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const customers = useMemo(() => {
    const map = new Map<string, { email: string; name: string; orders: number; spend: number; last: number; idle: number }>();
    for (const o of admin.orders) {
      const key = o.email.toLowerCase() || o.customer;
      const cur = map.get(key) ?? { email: o.email, name: o.customer, orders: 0, spend: 0, last: 0, idle: 0 };
      cur.orders += 1;
      cur.spend += o.total;
      cur.last = Math.max(cur.last, o.at);
      map.set(key, cur);
    }
    return [...map.values()].map((c) => ({ ...c, idle: Math.floor((Date.now() - c.last) / 86400000) }));
  }, [admin.orders]);

  const labelsOf = (c: { orders: number; spend: number; idle: number }) =>
    ops.labels.filter((l) =>
      l.rule.type === "orders" ? c.orders >= l.rule.value : l.rule.type === "spend" ? c.spend >= l.rule.value : l.rule.type === "idle" ? c.orders > 0 && c.idle >= l.rule.value : false,
    );

  const audienceList = customers.filter((c) => {
    if (audience === "all") return true;
    const labels = labelsOf(c);
    return labels.some((l) => l.id === audience);
  });

  const send = () => {
    if (!body.trim()) return;
    const rows = audienceList.length;
    setSent(`پیامک برای ${fa(rows)} مشتری در صف ارسال قرار گرفت (نمایشی).`);
    addLog({ actor: "مدیر", action: "ارسال پیامک گروهی", target: audience === "all" ? "همهٔ مشتریان" : "بخش انتخاب‌شده", meta: `${fa(rows)} گیرنده` });
  };

  return (
    <>
      <PanelHead
        title="CRM و بازاریابی پیامکی"
        sub="مشتریان را برچسب بزن، بخش‌بندی کن و برای هر گروه پیامک اختصاصی بفرست."
        action={<button type="button" className="ad-btn is-sm is-primary" onClick={() => setLabelDraft({ id: `lbl-${Date.now().toString(36)}`, name: "", color: "#2f6f4e", rule: { type: "orders", value: 1 } })}><Plus width={13} height={13} /> برچسب جدید</button>}
      />

      <Panel title="برچسب‌های خودکار">
        <div className="ad-cards">
          {ops.labels.map((l) => (
            <article key={l.id} className="ad-card-inline">
              <span className="ad-dot" style={{ background: l.color }} />
              <div className="ad-card-inline-main">
                <b>{l.name}</b>
                <small>
                  {l.rule.type === "orders" ? `حداقل ${fa(l.rule.value)} سفارش` : l.rule.type === "spend" ? `خرید بالای ${formatPrice(l.rule.value)}` : l.rule.type === "idle" ? `${fa(l.rule.value)} روز بی‌خرید` : "دستی"}
                  {" · "}{fa(customers.filter((c) => labelsOf(c).some((x) => x.id === l.id)).length)} مشتری
                </small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className="ad-icon" aria-label="ویرایش" onClick={() => setLabelDraft(l)}><Pencil width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" aria-label="حذف" onClick={() => removeLabel(l.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel title="مشتریان و بخش‌بندی">
        {customers.length === 0 ? (
          <p className="ad-empty">هنوز مشتری‌ای از سفارش‌ها ساخته نشده.</p>
        ) : (
          <>
            <div className="ad-filters">
              <button type="button" className={cn("ad-chip", audience === "all" && "is-on")} onClick={() => setAudience("all")}>همه · {fa(customers.length)}</button>
              {ops.labels.map((l) => (
                <button key={l.id} type="button" className={cn("ad-chip", audience === l.id && "is-on")} onClick={() => setAudience(l.id)}>{l.name}</button>
              ))}
            </div>
            <div className="ad-table-wrap" style={{ marginTop: 10 }}>
              <table className="ad-table">
                <thead><tr><th><input type="checkbox" className="ad-checkbox" aria-label="انتخاب همهٔ مشتریان" onChange={(e) => setPicked(e.target.checked ? new Set(customers.map((c) => c.email || c.name)) : new Set())} /></th><th>مشتری</th><th>سفارش</th><th>خرید</th><th>آخرین</th><th>برچسب‌ها</th><th>پیامک</th></tr></thead>
                <tbody>
                  {customers.filter((c) => audience === "all" || labelsOf(c).some((l) => l.id === audience)).map((c) => (
                    <tr key={c.email || c.name}>
                      <td><input type="checkbox" className="ad-checkbox" checked={picked.has(c.email || c.name)} onChange={() => togglePick(c.email || c.name)} aria-label={`انتخاب ${c.name}`} /></td>
                      <td>{c.name}<small dir="ltr">{c.email || "—"}</small></td>
                      <td>{fa(c.orders)}</td>
                      <td className="ad-money">{formatPrice(c.spend)}</td>
                      <td>{fa(c.idle)} روز پیش</td>
                      <td><span className="ad-tags">{labelsOf(c).map((l) => <em key={l.id} style={{ background: `${l.color}1f`, color: l.color }}>{l.name}</em>)}</span></td>
                      <td>
                        <button type="button" className="ad-icon" aria-label={`پیامک به ${c.name}`} onClick={() => setBody(`{{name}}`.replace("{{name}}", c.name) + " — پیام اختصاصی از ولور")}>
                          <Send width={13} height={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {picked.size > 0 && (
        <div className="ad-bulkbar" role="region" aria-label="پیامک گروهی به انتخاب‌شده‌ها">
          <b>{fa(picked.size)} مشتری انتخاب‌شده</b>
          <input className="ad-input" style={{ maxWidth: 320 }} value={bulkBody} onChange={(e) => setBulkBody(e.target.value)} placeholder="متن پیامک برای انتخاب‌شده‌ها…" aria-label="متن پیامک گروهی" />
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" disabled={!bulkBody.trim()} onClick={() => { setSent(`پیامک به ${fa(picked.size)} مشتری انتخاب‌شده ارسال شد (نمایشی).`); addLog({ actor: "مدیر", action: "پیامک به انتخاب‌شده‌ها", target: `${fa(picked.size)} مشتری` }); setPicked(new Set()); setBulkBody(""); }}><Send width={12} height={12} /> ارسال</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setPicked(new Set())}>لغو انتخاب</button>
          </div>
        </div>
      )}
      <Panel title="ارسال پیامک گروهی" action={<span className="ad-hint">{fa(audienceList.length)} گیرنده</span>}>
        <label className="ad-field">مخاطب
          <select className="ad-select" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option value="all">همهٔ مشتریان</option>
            {ops.labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="ad-field">متن پیامک
          <textarea className="ad-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="{{name}} عزیز، …" />
        </label>
        <div className="ad-actions">
          <button type="button" className="ad-btn is-primary is-sm" onClick={send} disabled={!body.trim()}><Send width={13} height={13} /> ارسال</button>
          <span className="ad-hint">می‌توانی از قالب‌های آماده استفاده کنی:</span>
          {ops.smsTemplates.map((t) => (
            <button key={t.id} type="button" className="ad-chip" onClick={() => setBody(t.body)}>{t.name}</button>
          ))}
        </div>
        {sent && <p className="ad-hint" style={{ color: "#2f6f4e", marginTop: 8 }}>{sent}</p>}
      </Panel>

      <Panel title="قالب‌های پیامک" action={<button type="button" className="ad-btn is-sm" onClick={() => setTemplate({ id: `t-${Date.now().toString(36)}`, name: "", body: "" })}><Plus width={13} height={13} /> قالب جدید</button>}>
        <div className="ad-cards">
          {ops.smsTemplates.map((t) => (
            <article key={t.id} className="ad-card-inline">
              <div className="ad-card-inline-main">
                <b>{t.name}</b>
                <small>{t.body}</small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className="ad-icon" aria-label="ویرایش" onClick={() => setTemplate(t)}><Pencil width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" aria-label="حذف" onClick={() => removeSmsTemplate(t.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      {labelDraft && (
        <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setLabelDraft(null)}>
          <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="برچسب">
            <header className="ad-modal-head"><h3>برچسب مشتری</h3><button type="button" className="ad-icon" aria-label="بستن" onClick={() => setLabelDraft(null)}><X width={16} height={16} /></button></header>
            <div className="ad-modal-body">
              <label className="ad-field">نام<input className="ad-input" value={labelDraft.name} onChange={(e) => setLabelDraft({ ...labelDraft, name: e.target.value })} /></label>
              <div className="ad-two">
                <label className="ad-field">قاعده
                  <select className="ad-select" value={labelDraft.rule.type} onChange={(e) => setLabelDraft({ ...labelDraft, rule: { ...labelDraft.rule, type: e.target.value as CustomerLabel["rule"]["type"] } })}>
                    <option value="orders">تعداد سفارش</option><option value="spend">مبلغ خرید</option><option value="idle">روز بی‌خرید</option><option value="manual">دستی</option>
                  </select>
                </label>
                <label className="ad-field">مقدار<input className="ad-input" type="number" min={1} value={labelDraft.rule.value} onChange={(e) => setLabelDraft({ ...labelDraft, rule: { ...labelDraft.rule, value: Number(e.target.value) || 1 } })} /></label>
              </div>
              <label className="ad-field">رنگ<input type="color" className="ad-input" value={labelDraft.color} onChange={(e) => setLabelDraft({ ...labelDraft, color: e.target.value })} /></label>
            </div>
            <footer className="ad-modal-foot">
              <div className="ad-actions-spacer" />
              <button type="button" className="ad-btn" onClick={() => setLabelDraft(null)}>انصراف</button>
              <button type="button" className="ad-btn is-primary" disabled={!labelDraft.name.trim()} onClick={() => { saveLabel(labelDraft); setLabelDraft(null); }}>ذخیره</button>
            </footer>
          </div>
        </div>
      )}

      {template && (
        <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setTemplate(null)}>
          <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="قالب پیامک">
            <header className="ad-modal-head"><h3>قالب پیامک</h3><button type="button" className="ad-icon" aria-label="بستن" onClick={() => setTemplate(null)}><X width={16} height={16} /></button></header>
            <div className="ad-modal-body">
              <label className="ad-field">نام<input className="ad-input" value={template.name} onChange={(e) => setTemplate({ ...template, name: e.target.value })} /></label>
              <label className="ad-field">متن<textarea className="ad-input" rows={4} value={template.body} onChange={(e) => setTemplate({ ...template, body: e.target.value })} /></label>
            </div>
            <footer className="ad-modal-foot">
              <div className="ad-actions-spacer" />
              <button type="button" className="ad-btn" onClick={() => setTemplate(null)}>انصراف</button>
              <button type="button" className="ad-btn is-primary" disabled={!template.name.trim()} onClick={() => { saveSmsTemplate(template); setTemplate(null); }}>ذخیره</button>
            </footer>
          </div>
        </div>
      )}
      <p className="ad-hint" style={{ paddingInline: 4 }}>حساب متصل: {auth.account ? auth.account.email : "مشتری وارد نشده"}</p>
    </>
  );
}

/* =====================================================================
   tickets & returns
   ===================================================================== */

export function TicketsPanel() {
  const ops = useOps();
  const [open, setOpen] = useState<string | null>(ops.tickets[0]?.id ?? null);
  const [reply, setReply] = useState("");
  const [filter, setFilter] = useState("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const list = ops.tickets.filter((t) => filter === "all" || t.status === filter);

  return (
    <>
      <PanelHead title="تیکت‌های پشتیبانی" sub="پاسخ بده، وضعیت را عوض کن و اولویت را مدیریت کن." />
      <div className="ad-filters">
        {[["all", "همه"], ["open", "باز"], ["pending", "منتظر پاسخ"], ["closed", "بسته"]].map(([id, l]) => (
          <button key={id} type="button" className={cn("ad-chip", filter === id && "is-on")} onClick={() => setFilter(id)}>{l}</button>
        ))}
      </div>
      {picked.size > 0 && (
        <div className="ad-bulkbar" role="region" aria-label="عملیات گروهی تیکت">
          <b>{fa(picked.size)} تیکت</b>
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={() => { picked.forEach((id) => setTicketStatus(id, "closed")); setPicked(new Set()); }}>بستن همه</button>
            <button type="button" className="ad-btn is-sm" onClick={() => { picked.forEach((id) => setTicketStatus(id, "pending")); setPicked(new Set()); }}>منتظر پاسخ</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setPicked(new Set())}>لغو</button>
          </div>
        </div>
      )}
      {list.length === 0 ? (
        <p className="ad-empty">تیکتی با این فیلتر نیست.</p>
      ) : (
        <div className="ad-ticket-list">
          {list.map((t) => (
            <article key={t.id} className={cn("ad-ticket", open === t.id && "is-open")}>
              <button type="button" className="ad-ticket-head" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                <input type="checkbox" className="ad-checkbox" checked={picked.has(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => togglePick(t.id)} aria-label={`انتخاب تیکت ${t.id}`} />
                <span className="ad-ticket-id" dir="ltr">{t.id}</span>
                <span className="ad-ticket-main">
                  <b>{t.subject}</b>
                  <small>{t.email} · {timeAgo(t.at)}</small>
                </span>
                <span className={cn("ad-pill", t.status === "open" ? "is-pending" : t.status === "pending" ? "is-shipped" : "is-done")}>
                  {t.status === "open" ? "باز" : t.status === "pending" ? "منتظر پاسخ" : "بسته"}
                </span>
                <span className={cn("ad-pill", t.priority === "high" ? "is-cancelled" : "")}>{t.priority === "high" ? "فوری" : t.priority === "normal" ? "عادی" : "کم"}</span>
              </button>
              {open === t.id && (
                <div className="ad-ticket-body">
                  <ul>
                    {t.messages.map((m) => (
                      <li key={m.id} className={m.from === "staff" ? "is-staff" : "is-customer"}>
                        <p>{m.body}</p>
                        <small>{m.author} · {timeAgo(m.at)}</small>
                      </li>
                    ))}
                  </ul>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!reply.trim()) return;
                      addTicketMessage(t.id, { from: "staff", author: "پشتیبانی", body: reply.trim() });
                      setReply("");
                    }}
                    className="ad-ticket-reply"
                  >
                    <input className="ad-input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="پاسخ شما…" aria-label="پاسخ" />
                    <button type="submit" className="ad-btn is-primary is-sm"><Send width={13} height={13} /> ارسال</button>
                  </form>
                  <div className="ad-actions">
                    <button type="button" className="ad-btn is-sm" onClick={() => setTicketStatus(t.id, "closed")}><CheckCircle2 width={13} height={13} /> بستن تیکت</button>
                    <button type="button" className="ad-btn is-sm" onClick={() => setTicketStatus(t.id, "pending")}>منتظر پاسخ</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

export function ReturnsPanel() {
  const ops = useOps();
  const statuses = ["requested", "approved", "received", "refunded", "rejected"] as const;
  const labels: Record<string, string> = { requested: "ثبت شده", approved: "تأیید", received: "دریافت شد", refunded: "بازپرداخت", rejected: "رد شد" };
  return (
    <>
      <PanelHead title="مرجوعی‌ها" sub="درخواست‌های مرجوعی مشتریان را بررسی و وضعیت را به‌روز کن." />
      {ops.returns.length === 0 ? (
        <p className="ad-empty">درخواست مرجوعی‌ای ثبت نشده.</p>
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>شناسه</th><th>سفارش</th><th>مشتری</th><th>اقلام</th><th>مبلغ</th><th>وضعیت</th><th /></tr></thead>
            <tbody>
              {ops.returns.map((r) => (
                <tr key={r.id}>
                  <td dir="ltr">{r.id}</td>
                  <td dir="ltr">{r.orderId}</td>
                  <td>{r.email}<small>{timeAgo(r.at)}</small></td>
                  <td>{r.items.map((i) => i.name).join("، ")}</td>
                  <td className="ad-money">{formatPrice(r.refund)}</td>
                  <td>
                    <select className="ad-select" value={r.status} aria-label="وضعیت مرجوعی" onChange={(e) => setReturnStatus(r.id, e.target.value as never)}>
                      {statuses.map((s) => <option key={s} value={s}>{labels[s]}</option>)}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="ad-icon" aria-label="چاپ برچسب" onClick={() => addLog({ actor: "مدیر", action: "چاپ لیبل مرجوعی", target: r.id })}><ClipboardList width={13} height={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* =====================================================================
   logs + security + forms
   ===================================================================== */

export function LogsPanel() {
  const ops = useOps();
  const [q, setQ] = useState("");
  const [exported, setExported] = useState(false);
  const list = ops.logs.filter((l) => !q.trim() || `${l.actor} ${l.action} ${l.target}`.includes(q.trim()));
  const exportCsv = async () => {
    const { download } = await import("@/builder/util");
    download("logs.csv", "\uFEFF" + [["زمان", "کاربر", "عملیات", "هدف", "جزئیات"], ...ops.logs.map((l) => [new Date(l.at).toLocaleString("fa-IR"), l.actor, l.action, l.target, l.meta ?? ""])].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    setExported(true);
  };
  return (
    <>
      <PanelHead title="گزارش فعالیت (Log)" sub="هر تغییر در محصولات، تخفیف‌ها، تیکت‌ها و ورودها اینجا ثبت می‌شود." action={<><button type="button" className="ad-btn is-sm" onClick={exportCsv}><Save width={13} height={13} /> خروجی CSV</button>{exported && <span className="ad-hint">دانلود شد</span>}</>} />
      <input className="ad-input ad-input-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو در لاگ…" aria-label="جست‌وجو در لاگ" />
      {list.length === 0 ? (
        <p className="ad-empty">هنوز رویدادی ثبت نشده.</p>
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>زمان</th><th>کاربر</th><th>عملیات</th><th>هدف</th><th>جزئیات</th></tr></thead>
            <tbody>
              {list.slice(0, 200).map((l) => (
                <tr key={l.id}>
                  <td>{timeAgo(l.at)}</td>
                  <td dir="ltr">{l.actor}</td>
                  <td>{l.action}</td>
                  <td>{l.target}</td>
                  <td>{l.meta ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function SecurityPanel() {
  const ops = useOps();
  const sec = ops.security;
  return (
    <>
      <PanelHead title="امنیت" sub="رمز پنل، ورود دومرحله‌ای مشتریان، شمارش تلاش‌های ناموفق و بلاک IP." />
      <div className="ad-grid-2">
        <Panel title="دسترسی مدیر">
          <label className="ad-field">رمز پنل<input className="ad-input" dir="ltr" value={sec.passcode} onChange={(e) => patchSecurity({ passcode: e.target.value })} /></label>
          <label className="ad-field">مدت نشست (دقیقه)<input className="ad-input" type="number" min={5} max={240} value={sec.sessionMinutes} onChange={(e) => patchSecurity({ sessionMinutes: Number(e.target.value) || 30 })} /></label>
          <label className="ad-check"><input type="checkbox" checked={sec.twoFactor} onChange={(e) => patchSecurity({ twoFactor: e.target.checked })} /> ورود دومرحله‌ای مدیر (نمایشی)</label>
          <p className="ad-hint">برای امنیت بیشتر از رمز ترکیبی (حرف + عدد + نماد) و طول حداقل ۱۲ کاراکتر استفاده کن.</p>
        </Panel>
        <Panel title="ورود مشتری">
          <label className="ad-check"><input type="checkbox" checked={sec.allowCustomerSignup} onChange={(e) => patchSecurity({ allowCustomerSignup: e.target.checked })} /> ثبت‌نام مشتری باز باشد</label>
          <label className="ad-check"><input type="checkbox" checked={sec.otpChannels.sms} onChange={(e) => patchSecurity({ otpChannels: { ...sec.otpChannels, sms: e.target.checked } })} /> کد یکبار مصرف پیامکی</label>
          <label className="ad-check"><input type="checkbox" checked={sec.otpChannels.email} onChange={(e) => patchSecurity({ otpChannels: { ...sec.otpChannels, email: e.target.checked } })} /> کد یکبار مصرف ایمیلی</label>
        </Panel>
      </div>

      <Panel title="تلاش‌های ورود و IP‌های بلاک‌شده">
        {sec.failedAttempts.length === 0 ? <p className="ad-hint">تلاش ناموفقی ثبت نشده.</p> : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>زمان</th><th>IP</th><th /></tr></thead>
              <tbody>
                {sec.failedAttempts.map((f, i) => (
                  <tr key={i}><td>{timeAgo(f.at)}</td><td dir="ltr">{f.ip}</td><td><button type="button" className="ad-btn is-sm is-danger" onClick={() => blockIp(f.ip)}>بلاک</button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {sec.blocked.length > 0 && (
          <div className="ad-tags" style={{ marginTop: 10 }}>
            {sec.blocked.map((ip) => (
              <em key={ip} dir="ltr">{ip}<button type="button" onClick={() => unblockIp(ip)} aria-label={`رفع بلاک ${ip}`}><X width={10} height={10} /></button></em>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}

export function FormsPanel() {
  const ops = useOps();
  return (
    <>
      <PanelHead title="مدیریت فرم‌ها" sub="هر فیلد را می‌توانی اجباری/اختیاری یا کلاً پنهان کنی؛ همین قاعده در صفحهٔ تسویه حساب و فرم‌ها اعمال می‌شود." />
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>فرم</th><th>فیلد</th><th>برچسب</th><th>اجباری</th><th>نمایش</th><th>راهنما</th></tr></thead>
          <tbody>
            {ops.formFields.map((f) => (
              <tr key={f.key}>
                <td>{f.form}</td>
                <td dir="ltr">{f.key}</td>
                <td>{f.label}</td>
                <td><button type="button" className={cn("ad-switch", f.required && "is-on")} role="switch" aria-checked={f.required} aria-label={`اجباری ${f.label}`} onClick={() => patchFormField(f.key, { required: !f.required })} /></td>
                <td><button type="button" className={cn("ad-switch", f.visible && "is-on")} role="switch" aria-checked={f.visible} aria-label={`نمایش ${f.label}`} onClick={() => patchFormField(f.key, { visible: !f.visible })} /></td>
                <td><input className="ad-input" defaultValue={f.placeholder ?? ""} placeholder="اختیاری" aria-label={`راهنما ${f.label}`} onBlur={(e) => patchFormField(f.key, { placeholder: e.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ad-hint">این تنظیمات فوراً اعمال می‌شوند: فیلد پنهان در فرم نمایش داده نمی‌شود و فیلد اختیاری ستارهٔ الزام ندارد.</p>
    </>
  );
}

/* =====================================================================
   try-on packages & cashback
   ===================================================================== */

export function TryOnPanel() {
  const ops = useOps();
  const auth = useAuth();
  const [draft, setDraft] = useState<TryOnPackage | null>(null);
  const [creditEmail, setCreditEmail] = useState("");
  const [creditCount, setCreditCount] = useState(5);

  return (
    <>
      <PanelHead
        title="پرو آنلاین و کش‌بک"
        sub="بسته‌های پرو را تعریف کن، اعتبار به مشتری بده و نرخ کش‌بک هر خرید را تعیین کن."
        action={<button type="button" className="ad-btn is-sm is-primary" onClick={() => setDraft({ id: `tp-${Date.now().toString(36)}`, name: "", credits: 10, price: 100000 })}><Plus width={13} height={13} /> بستهٔ جدید</button>}
      />
      <Panel title="بسته‌های پرو آنلاین">
        <div className="ad-cards">
          {ops.tryonPackages.map((p) => (
            <article key={p.id} className="ad-card-inline">
              <div className="ad-card-inline-main">
                <b>{p.name} {p.popular && <span className="ad-pill is-done">پیشنهاد</span>}</b>
                <small>{fa(p.credits)} پرو · {p.price.toLocaleString("fa-IR")} تومان</small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className="ad-icon" aria-label="ویرایش" onClick={() => setDraft(p)}><Pencil width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" aria-label="حذف" onClick={() => removeTryonPackage(p.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <div className="ad-grid-2">
        <Panel title="اعتبار دستی به مشتری">
          <label className="ad-field">ایمیل مشتری<input className="ad-input" dir="ltr" value={creditEmail} onChange={(e) => setCreditEmail(e.target.value)} placeholder="customer@example.com" /></label>
          <label className="ad-field">تعداد پرو<input className="ad-input" type="number" min={1} value={creditCount} onChange={(e) => setCreditCount(Number(e.target.value) || 1)} /></label>
          <button type="button" className="ad-btn is-primary is-sm" disabled={!creditEmail.trim()} onClick={() => { grantTryon(creditEmail.trim().toLowerCase(), creditCount); addLog({ actor: "مدیر", action: "اعتبار پرو", target: creditEmail }); setCreditEmail(""); }}>
            <Sparkles width={13} height={13} /> افزودن اعتبار
          </button>
          {auth.account && <p className="ad-hint" style={{ marginTop: 8 }}>اعتبار حساب فعلی: {fa(ops.tryonCredits[auth.account.email] ?? 0)} پرو</p>}
        </Panel>
        <Panel title="نرخ کش‌بک">
          <label className="ad-field">درصد کش‌بک هر خرید
            <input className="ad-input" type="number" min={0} max={30} value={ops.cashbackRate} onChange={(e) => { const v = Number(e.target.value) || 0; import("@/state/ops").then((m) => m.setCashbackRate(v)); }} />
          </label>
          <p className="ad-hint">مشتری با هر خرید این درصد را در کیف پول حسابش می‌گیرد.</p>
          <div className="ad-tags" style={{ marginTop: 8 }}>
            {ops.cashbackTxns.slice(0, 8).map((t) => (
              <em key={t.id}>{t.email} · {fa(t.amount)}</em>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="درخواست‌های پرو آنلاین">
        {ops.tryonRequests.length === 0 ? <p className="ad-hint">درخواستی ثبت نشده.</p> : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>شناسه</th><th>مشتری</th><th>محصول</th><th>وضعیت</th><th /></tr></thead>
              <tbody>
                {ops.tryonRequests.map((r) => (
                  <tr key={r.id}>
                    <td dir="ltr">{r.id}</td>
                    <td>{r.email}</td>
                    <td>{r.productName}</td>
                    <td>
                      <select className="ad-select" value={r.status} aria-label="وضعیت پرو" onChange={async (e) => { const m = await import("@/state/ops"); m.setTryonStatus(r.id, e.target.value as never); }}>
                        <option value="queued">در صف</option><option value="ready">آماده</option><option value="rejected">رد</option>
                      </select>
                    </td>
                    <td>{new Date(r.at).toLocaleDateString("fa-IR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {draft && (
        <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="بستهٔ پرو">
            <header className="ad-modal-head"><h3>بستهٔ پرو</h3><button type="button" className="ad-icon" aria-label="بستن" onClick={() => setDraft(null)}><X width={16} height={16} /></button></header>
            <div className="ad-modal-body">
              <label className="ad-field">نام<input className="ad-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <div className="ad-two">
                <label className="ad-field">تعداد پرو<input className="ad-input" type="number" min={1} value={draft.credits} onChange={(e) => setDraft({ ...draft, credits: Number(e.target.value) || 1 })} /></label>
                <label className="ad-field">قیمت (تومان)<input className="ad-input" type="number" min={0} value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) || 0 })} /></label>
              </div>
              <label className="ad-check"><input type="checkbox" checked={!!draft.popular} onChange={(e) => setDraft({ ...draft, popular: e.target.checked })} /> پیشنهاد ویژه</label>
            </div>
            <footer className="ad-modal-foot">
              <div className="ad-actions-spacer" />
              <button type="button" className="ad-btn" onClick={() => setDraft(null)}>انصراف</button>
              <button type="button" className="ad-btn is-primary" disabled={!draft.name.trim()} onClick={() => { saveTryonPackage(draft); setDraft(null); }}>ذخیره</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/* =====================================================================
   mega menu builder
   ===================================================================== */

export function MegaMenuPanel() {
  const ops = useOps();
  const [draft, setDraft] = useState<MegaMenuDef | null>(null);
  const blank = (): MegaMenuDef => ({ id: `mm-${Date.now().toString(36)}`, label: "", active: true, columns: [{ title: "", links: [{ label: "", href: "" }] }], cta: { title: "", text: "", href: "/style", image: "" } });

  return (
    <>
      <PanelHead
        title="مگا منو"
        sub="ستون‌ها، لینک‌ها و کارت ویژهٔ منوی فروشگاه را بساز. این ساختار در صفحه‌ساز هم قابل استفاده است."
        action={<button type="button" className="ad-btn is-sm is-primary" onClick={() => setDraft(blank())}><Plus width={13} height={13} /> مگا منوی جدید</button>}
      />
      <div className="ad-cards">
        {ops.megaMenus.map((m) => (
          <article key={m.id} className={cn("ad-card-inline", !m.active && "is-off")}>
            <div className="ad-card-inline-main">
              <b>{m.label}</b>
              <small>{fa(m.columns.length)} ستون · {fa(m.columns.reduce((n, c) => n + c.links.length, 0))} لینک · کارت: {m.cta.title}</small>
            </div>
            <div className="ad-product-actions">
              <button type="button" className={cn("ad-icon", m.active && "is-on")} aria-pressed={m.active} aria-label="فعال" onClick={() => saveMegaMenu({ ...m, active: !m.active })}><CheckCircle2 width={14} height={14} /></button>
              <button type="button" className="ad-icon" aria-label="ویرایش" onClick={() => setDraft(JSON.parse(JSON.stringify(m)))}><Pencil width={14} height={14} /></button>
              <button type="button" className="ad-icon is-danger" aria-label="حذف" onClick={() => removeMegaMenu(m.id)}><Trash2 width={14} height={14} /></button>
            </div>
          </article>
        ))}
      </div>

      {draft && (
        <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div className="ad-modal" role="dialog" aria-modal="true" aria-label="مگا منو">
            <header className="ad-modal-head"><h3>ساخت مگا منو</h3><button type="button" className="ad-icon" aria-label="بستن" onClick={() => setDraft(null)}><X width={16} height={16} /></button></header>
            <div className="ad-modal-body">
              <label className="ad-field">عنوان منو<input className="ad-input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
              {draft.columns.map((col, ci) => (
                <div key={ci} className="ad-mm-col">
                  <div className="ad-mm-col-head">
                    <input className="ad-input" value={col.title} placeholder="عنوان ستون" aria-label="عنوان ستون" onChange={(e) => setDraft({ ...draft, columns: draft.columns.map((c, i) => (i === ci ? { ...c, title: e.target.value } : c)) })} />
                    <button type="button" className="ad-icon is-danger" aria-label="حذف ستون" onClick={() => setDraft({ ...draft, columns: draft.columns.filter((_, i) => i !== ci) })}><Trash2 width={13} height={13} /></button>
                  </div>
                  {col.links.map((link, li) => (
                    <div key={li} className="ad-mm-link">
                      <input className="ad-input" value={link.label} placeholder="برچسب" aria-label="برچسب" onChange={(e) => setDraft({ ...draft, columns: draft.columns.map((c, i) => (i === ci ? { ...c, links: c.links.map((l, j) => (j === li ? { ...l, label: e.target.value } : l)) } : c)) })} />
                      <input className="ad-input" dir="ltr" value={link.href} placeholder="/products" aria-label="لینک" onChange={(e) => setDraft({ ...draft, columns: draft.columns.map((c, i) => (i === ci ? { ...c, links: c.links.map((l, j) => (j === li ? { ...l, href: e.target.value } : l)) } : c)) })} />
                      <button type="button" className="ad-icon is-danger" aria-label="حذف لینک" onClick={() => setDraft({ ...draft, columns: draft.columns.map((c, i) => (i === ci ? { ...c, links: c.links.filter((_, j) => j !== li) } : c)) })}><X width={12} height={12} /></button>
                    </div>
                  ))}
                  <button type="button" className="ad-btn is-sm" onClick={() => setDraft({ ...draft, columns: draft.columns.map((c, i) => (i === ci ? { ...c, links: [...c.links, { label: "", href: "" }] } : c)) })}><Plus width={12} height={12} /> لینک</button>
                </div>
              ))}
              <button type="button" className="ad-btn is-sm" onClick={() => setDraft({ ...draft, columns: [...draft.columns, { title: "", links: [{ label: "", href: "" }] }] })}><Plus width={12} height={12} /> ستون</button>

              <p className="ad-field-label" style={{ marginTop: 14 }}>کارت ویژه</p>
              <div className="ad-two">
                <label className="ad-field">عنوان<input className="ad-input" value={draft.cta.title} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, title: e.target.value } })} /></label>
                <label className="ad-field">لینک<input className="ad-input" dir="ltr" value={draft.cta.href} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, href: e.target.value } })} /></label>
              </div>
              <label className="ad-field">متن<input className="ad-input" value={draft.cta.text} onChange={(e) => setDraft({ ...draft, cta: { ...draft.cta, text: e.target.value } })} /></label>
            </div>
            <footer className="ad-modal-foot">
              <div className="ad-actions-spacer" />
              <button type="button" className="ad-btn" onClick={() => setDraft(null)}>انصراف</button>
              <button type="button" className="ad-btn is-primary" disabled={!draft.label.trim()} onClick={() => { saveMegaMenu(draft); setDraft(null); }}>ذخیره</button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

/* =====================================================================
   inventory with expandable variant rows
   ===================================================================== */

export function InventoryPanel() {
  const admin = useAdmin();
  const catalog = liveCatalog();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [bulkQty, setBulkQty] = useState(5);

  const totalStock = (p: { id: string; colors: { id: string }[]; sizes: { id: string }[] }) => {
    const product = liveGetProduct(p.id);
    if (!product) return 0;
    let n = 0;
    for (const c of product.colors) for (const s of product.sizes) n += require_stock(product, c.id, s.id);
    return n;
  };

  const list = catalog.filter((p) => !q.trim() || p.name.includes(q.trim()));

  return (
    <>
      <PanelHead title="انبارداری" sub="روی هر محصول بزن تا واریانت‌هایش باز شود و بتوانی موجودی هر رنگ/سایز یا کل کالا را تغییر دهی." />
      <div className="ad-kpis">
        <div className="ad-kpi ad-kpi-static"><b>{fa(catalog.length)}</b><span className="ad-kpi-label">کالا</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(catalog.reduce((n, p) => n + totalStock(p), 0))}</b><span className="ad-kpi-label">واحد در انبار</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(catalog.filter((p) => totalStock(p) === 0).length)}</b><span className="ad-kpi-label">ناموجود</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(catalog.filter((p) => { const s = totalStock(p); return s > 0 && s <= 12; }).length)}</b><span className="ad-kpi-label">کم‌موجود</span></div>
      </div>

      <div className="ad-toolbar">
        <input className="ad-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی کالا…" aria-label="جست‌وجوی کالا" />
        <label className="ad-field ad-inline" style={{ flexDirection: "row", alignItems: "center", gap: 8, margin: 0 }}>
          شارژ سریع همه:
          <input className="ad-input" type="number" min={1} max={99} value={bulkQty} onChange={(e) => setBulkQty(Math.max(1, Number(e.target.value) || 1))} style={{ width: 70 }} aria-label="مقدار شارژ سریع" />
        </label>
      </div>

      <div className="ad-cards">
        {list.map((p) => {
          const isOpen = open === p.id;
          const total = totalStock(p);
          return (
            <article key={p.id} className={cn("ad-inv", isOpen && "is-open")}>
              <button type="button" className="ad-inv-head" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}>
                <ProductThumb product={p} className="w-[46px]" />
                <span className="ad-inv-main">
                  <b>{p.name}</b>
                  <small>{p.colors.length.toLocaleString("fa-IR")} رنگ · {p.sizes.length.toLocaleString("fa-IR")} سایز</small>
                </span>
                <span className={cn("ad-pill", total === 0 ? "is-cancelled" : total <= 12 ? "is-pending" : "is-done")}>{total === 0 ? "ناموجود" : `${fa(total)} عدد`}</span>
                <span className="ad-inv-toggle">{isOpen ? "بستن" : "واریانت‌ها"}</span>
              </button>

              {isOpen && (
                <div className="ad-inv-body">
                  <div className="ad-actions" style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      className="ad-btn is-sm is-primary"
                      onClick={() => {
                        for (const c of p.colors) for (const s of p.sizes) restock(p.id, p.name, c.id, s.id, bulkQty);
                        addLog({ actor: "مدیر", action: "شارژ کل کالا", target: p.name, meta: `+${fa(bulkQty)}` });
                      }}
                    >
                      <Plus width={12} height={12} /> شارژ همهٔ واریانت‌ها (+{fa(bulkQty)})
                    </button>
                    <button type="button" className="ad-btn is-sm" onClick={() => { for (const c of p.colors) for (const s of p.sizes) setStockUnified(p.id, c.id, s.id, 0); addLog({ actor: "مدیر", action: "صفر کردن موجودی", target: p.name }); }}>
                      <XCircle width={12} height={12} /> صفر کردن
                    </button>
                  </div>

                  {p.colors.map((c) => (
                    <div key={c.id} className="ad-inv-variant-row">
                      <span className="ad-stock-color" style={{ margin: 0 }}><i style={{ background: c.hex }} /> {c.name}</span>
                      <div className="ad-inv-cells">
                        {p.sizes.map((s) => (
                          <label key={s.id} className="ad-inv-cell">
                            <span>{s.label}</span>
                            <input
                              type="number"
                              min={0}
                              max={999}
                              defaultValue={require_stock(p, c.id, s.id)}
                              aria-label={`موجودی ${p.name} ${c.name} ${s.label}`}
                              onBlur={(e) => setStockUnified(p.id, c.id, s.id, Math.max(0, Number(e.target.value) || 0))}
                            />
                            <button type="button" className="ad-inv-plus" aria-label={`افزودن ${fa(bulkQty)} به ${s.label}`} onClick={() => restock(p.id, p.name, c.id, s.id, bulkQty)}>+</button>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {admin.movements.length > 0 && (
        <Panel title="آخرین تحرکات">
          <ul className="ad-mini-list">
            {admin.movements.slice(0, 8).map((m) => (
              <li key={m.id}>
                <b className={m.delta < 0 ? "text-ember" : undefined}>{m.delta > 0 ? `+${fa(m.delta)}` : fa(m.delta)}</b>
                <span>{m.name}</span>
                <em>{m.reason === "sale" ? "فروش" : m.reason === "restock" ? "شارژ" : m.reason === "create" ? "ایجاد" : "ویرایش"}</em>
                <small>{timeAgo(m.at)}</small>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}

/* local helper to avoid an extra import cycle */
import { stockOf as stockOfBase } from "@/data/looks";
function require_stock(p: Parameters<typeof stockOfBase>[0], colorId: string, sizeId: string) {
  return stockOfBase(p, colorId, sizeId);
}

export const _unusedOps = { Bot, BadgePercent, Copy, Mail, Megaphone, MessageSquare, RotateCcw, ShieldCheck, Undo2, Users, Wallet, Layers };
