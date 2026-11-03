import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/utils/cn";
import { fileToDataUrl } from "@/builder/ControlsUI";
import { resolveImg } from "@/builder/stock";
import { IMAGE_ROLE_HINT, IMAGE_ROLE_LABEL } from "@/state/ops";
import type { ColorOption, ProductImage, ProductImageRole } from "@/types";

const ALL_COLORS = "*";

const uid = () => Math.random().toString(36).slice(2, 9);

interface Props {
  images: ProductImage[];
  colors: ColorOption[];
  onChange: (images: ProductImage[]) => void;
  /** disabled while the product has no colours yet */
  emptyHint?: string;
}

/**
 * The single image workspace used by the product form and the media panel.
 * No cropping, no per-colour tabs: drop photos into one box and give each of
 * them a colour and a role ("تصویر شاخص"، "گالری"، "هاور"، "جزئیات").
 */
export function ProductMediaEditor({ images, colors, onChange, emptyHint }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const defaultColor = colors[0]?.id ?? ALL_COLORS;

  const addFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files).filter((f) => f.type.startsWith("image/")) : [];
    if (!list.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of list) urls.push(await fileToDataUrl(f, 1200));
      const hasCover = images.some((i) => i.role !== "hover");
      const next: ProductImage[] = urls.map((url, i) => ({
        id: `img-${uid()}`,
        url,
        colorId: defaultColor,
        role: !hasCover && i === 0 ? "main" : "gallery",
      }));
      onChange([...images, ...next]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const patch = (id: string, p: Partial<ProductImage>) =>
    onChange(images.map((i) => (i.id === id ? { ...i, ...p } : i)));

  const remove = (id: string) => onChange(images.filter((i) => i.id !== id));

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="ad-media-editor">
      <div
        className={cn("ad-drop", dragging && "is-over", busy && "is-busy")}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="افزودن تصویر به گالری"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <span className="ad-drop-icon">{busy ? <Loader2 className="animate-spin" width={20} height={20} /> : <ImagePlus width={20} height={20} />}</span>
        <b>{busy ? "در حال افزودن تصاویر…" : "تصاویر را اینجا رها کن یا کلیک کن"}</b>
        <span className="ad-hint">
          {emptyHint ?? "یک باکس برای همهٔ تصاویر محصول؛ رنگ و نقش هر عکس را زیر خودش تعیین می‌کنی."}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />
      </div>

      <div className="ad-upload-row">
        <button type="button" className="ad-btn is-sm is-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Upload width={13} height={13} /> افزودن تصویر
        </button>
        <span className="ad-hint">{images.length.toLocaleString("fa-IR")} تصویر در گالری</span>
      </div>

      {images.length === 0 ? (
        <p className="ad-hint">هنوز تصویری اضافه نشده؛ تا وقتی عکس آپلود نکنی، برش عکس رانوی به‌عنوان تصویر محصول استفاده می‌شود.</p>
      ) : (
        <div className="ad-gallery-grid">
          {images.map((img, i) => {
            const color = colors.find((c) => c.id === img.colorId);
            return (
              <figure key={img.id} className="ad-gallery-card">
                <div className="ad-gallery-thumb">
                  <img src={resolveImg(img.url)} alt="" />
                  <span className={cn("ad-gallery-role", `is-${img.role}`)}>{IMAGE_ROLE_LABEL[img.role]}</span>
                  <div className="ad-gallery-tools">
                    <button type="button" className="ad-img-x" aria-label="جابه‌جایی به راست" disabled={i === 0} onClick={() => move(i, -1)}>›</button>
                    <button type="button" className="ad-img-x" aria-label="جابه‌جایی به چپ" disabled={i === images.length - 1} onClick={() => move(i, 1)}>‹</button>
                    <button type="button" className="ad-img-x is-danger" aria-label="حذف تصویر" onClick={() => remove(img.id)}>
                      <Trash2 width={12} height={12} />
                    </button>
                  </div>
                </div>
                <div className="ad-gallery-fields">
                  <label className="ad-gallery-field">
                    <span>رنگ</span>
                    <select
                      className="ad-select"
                      value={img.colorId}
                      onChange={(e) => patch(img.id, { colorId: e.target.value })}
                      aria-label="رنگ تصویر"
                    >
                      <option value={ALL_COLORS}>همهٔ رنگ‌ها</option>
                      {colors.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <i
                      className="ad-gallery-dot"
                      style={{ background: color?.hex ?? "#c9c3bc" }}
                      aria-hidden
                    />
                  </label>
                  <label className="ad-gallery-field" title={IMAGE_ROLE_HINT[img.role]}>
                    <span>نقش</span>
                    <select
                      className="ad-select"
                      value={img.role}
                      onChange={(e) => patch(img.id, { role: e.target.value as ProductImageRole })}
                      aria-label="نقش تصویر"
                    >
                      {(Object.keys(IMAGE_ROLE_LABEL) as ProductImageRole[]).map((r) => (
                        <option key={r} value={r}>{IMAGE_ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                  </label>
                  <small className="ad-gallery-hint">{IMAGE_ROLE_HINT[img.role]}</small>
                </div>
              </figure>
            );
          })}
        </div>
      )}
    </div>
  );
}
