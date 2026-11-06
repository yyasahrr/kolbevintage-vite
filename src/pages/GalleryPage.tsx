import { useCallback, useEffect, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, ShieldCheck, Upload } from "lucide-react";
import { api } from "@/lib/api";

interface GalleryItem {
  id: string;
  handle: string;
  imageUrl: string;
  caption: string;
  submittedAt: string;
}

async function imageData(file: File): Promise<string> {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) throw new Error("فرمت تصویر باید JPG، PNG یا WebP باشد.");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم تصویر باید کمتر از ۵ مگابایت باشد.");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("خواندن تصویر ناموفق بود."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("تصویر قابل پردازش نیست."));
    element.src = source;
  });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.84);
}

export function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const [caption, setCaption] = useState("");
  const [image, setImage] = useState("");
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setItems(await api.get<GalleryItem[]>("/api/gallery")); } catch { /* the submission form remains available */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try { setImage(await imageData(file)); }
    catch (error) { setImage(""); setMessage({ ok: false, text: error instanceof Error ? error.message : "تصویر خوانده نشد." }); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!handle.trim() || !image || !consent) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/api/gallery", { handle, email, caption, imageUrl: image, consent });
      setHandle(""); setEmail(""); setCaption(""); setImage(""); setConsent(false);
      setMessage({ ok: true, text: "تصویرت رسید؛ بعد از تأیید تیم محتوا در همین گالری منتشر می‌شود." });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "ارسال تصویر ناموفق بود." }); }
    finally { setBusy(false); }
  };

  return (
    <main className="bg-cream text-ink">
      <section className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-bold tracking-[0.18em] text-burgundy">استایل واقعی، آدم‌های واقعی</p>
          <h1 className="font-display text-4xl font-bold sm:text-5xl">گالری استایل مشتریان کلبه</h1>
          <p className="mt-5 leading-8 text-ink-soft">عکس خودت را با لباس‌های کلبه بفرست. هر اثر پیش از انتشار بازبینی می‌شود و بدون تأیید رضایت انتشار، عمومی نمی‌شود.</p>
        </div>

        {items.length > 0 ? (
          <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3">
            {items.map((item) => (
              <figure key={item.id} className="mb-5 break-inside-avoid overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-soft">
                <img src={item.imageUrl} alt={item.caption || `استایل ${item.handle}`} className="w-full object-cover" loading="lazy" />
                <figcaption className="p-4"><b>{item.handle}</b>{item.caption && <p className="mt-2 text-sm leading-7 text-ink-soft">{item.caption}</p>}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-2xl border border-dashed border-burgundy/25 bg-white/60 px-6 py-14 text-center">
            <Camera className="mx-auto text-burgundy" width={32} height={32} />
            <h2 className="mt-4 font-display text-2xl font-bold">اولین قاب این گالری می‌تواند از تو باشد</h2>
            <p className="mt-2 text-sm text-ink-soft">هنوز تصویر تأییدشده‌ای منتشر نشده است.</p>
          </div>
        )}
      </section>

      <section className="border-t border-black/[0.06] bg-white/60">
        <div className="mx-auto grid max-w-[1000px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_1.25fr]">
          <div>
            <ImagePlus className="text-burgundy" width={28} height={28} />
            <h2 className="mt-4 font-display text-3xl font-bold">استایلت را بفرست</h2>
            <p className="mt-4 text-sm leading-7 text-ink-soft">یک تصویر واضح تا ۵ مگابایت انتخاب کن. نام نمایشی و توضیح کوتاه کافی است؛ ایمیل اجباری نیست و در گالری نمایش داده نمی‌شود.</p>
            <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-ink-soft"><ShieldCheck className="mt-1 shrink-0 text-forest" width={16} height={16} /> تصویر تا زمان تأیید مدیر فقط در صف بازبینی است.</p>
          </div>
          <form onSubmit={(event) => void submit(event)} className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-soft sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">نام نمایشی<input required maxLength={60} value={handle} onChange={(event) => setHandle(event.target.value)} className="rounded-lg border border-black/10 bg-cream px-3 py-3 font-normal outline-none focus:border-burgundy" /></label>
              <label className="grid gap-2 text-sm font-semibold">ایمیل (اختیاری)<input type="email" dir="ltr" value={email} onChange={(event) => setEmail(event.target.value)} className="rounded-lg border border-black/10 bg-cream px-3 py-3 font-normal outline-none focus:border-burgundy" /></label>
            </div>
            <label className="mt-4 grid gap-2 text-sm font-semibold">دربارهٔ استایلت<textarea rows={3} maxLength={500} value={caption} onChange={(event) => setCaption(event.target.value)} className="rounded-lg border border-black/10 bg-cream px-3 py-3 font-normal outline-none focus:border-burgundy" /></label>
            <label className="mt-4 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-burgundy/30 bg-cream p-4 text-center text-sm">
              {image ? <img src={image} alt="پیش‌نمایش تصویر ارسالی" className="max-h-56 rounded-lg object-contain" /> : <><Upload className="mb-2 text-burgundy" width={24} height={24} /><span>انتخاب تصویر JPG، PNG یا WebP</span></>}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void choose(event.target.files?.[0])} />
            </label>
            <label className="mt-4 flex items-start gap-3 text-xs leading-6"><input required type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />رضایت می‌دهم این تصویر و متن پس از بازبینی در گالری عمومی کلبه وینتیج منتشر شود.</label>
            {message && <p role="status" className={`mt-4 rounded-lg px-3 py-3 text-sm ${message.ok ? "bg-forest/10 text-forest" : "bg-burgundy/10 text-burgundy"}`}>{message.text}</p>}
            <button type="submit" disabled={busy || !handle.trim() || !image || !consent} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-burgundy px-5 py-3 text-sm font-bold text-white transition hover:bg-burgundy-deep disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 width={17} height={17} />{busy ? "در حال ارسال…" : "ارسال برای بازبینی"}</button>
          </form>
        </div>
      </section>
    </main>
  );
}
