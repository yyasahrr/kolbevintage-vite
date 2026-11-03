import hero from "@/assets/editorial/hero.jpg";
import atelier from "@/assets/editorial/atelier.jpg";
import campaign from "@/assets/editorial/campaign.jpg";
import look1 from "@/assets/models/look-1.webp";
import look2 from "@/assets/models/look-2.webp";
import look3 from "@/assets/models/look-3.webp";
import look4 from "@/assets/models/look-4.webp";
import look5 from "@/assets/models/look-5.webp";
import look6 from "@/assets/models/look-6.webp";

/**
 * Built-in library images. Documents only store the `stock:<id>` token so a page
 * never carries the (large, inlined) image bytes in localStorage.
 */
export const STOCK_IMAGES: { id: string; label: string; url: string }[] = [
  { id: "hero", label: "کمپین — گالری", url: hero },
  { id: "atelier", label: "آتلیه", url: atelier },
  { id: "campaign", label: "کمپین — کشمیر", url: campaign },
  { id: "look1", label: "مدل ۱ (شفاف)", url: look1 },
  { id: "look2", label: "مدل ۲ (شفاف)", url: look2 },
  { id: "look3", label: "مدل ۳ (شفاف)", url: look3 },
  { id: "look4", label: "مدل ۴ (شفاف)", url: look4 },
  { id: "look5", label: "مدل ۵ (شفاف)", url: look5 },
  { id: "look6", label: "مدل ۶ (شفاف)", url: look6 },
];

const map = new Map(STOCK_IMAGES.map((s) => [`stock:${s.id}`, s.url]));

export const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='520' viewBox='0 0 800 520'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#e9e0d4'/><stop offset='1' stop-color='#d4c6b4'/></linearGradient></defs><rect width='800' height='520' fill='url(#g)'/><g fill='none' stroke='#9c8c78' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'><rect x='300' y='190' width='200' height='140' rx='14'/><circle cx='360' cy='235' r='16'/><path d='M310 322l60-58 44 40 36-30 54 48'/></g></svg>`,
  );

/** token → real URL (data: and http(s) URLs pass through unchanged) */
export function resolveImg(u?: string): string {
  if (!u) return "";
  return map.get(u) ?? u;
}
