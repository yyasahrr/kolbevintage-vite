/* =====================================================================
   Widgets (decision 75).

   A widget is a small, self-contained block the owner drops into a zone of
   the storefront. Every widget here reads real shop data — products, orders,
   reviews, settings — and renders nothing when it has nothing true to say.
   There is no placeholder content and no "sample" row anywhere in this file.

   Adding a widget is deliberately cheap: one entry in `registry.tsx` with a
   title, the zones it accepts, its options and a component.
   ===================================================================== */

export type WidgetZone = "home-top" | "home-middle" | "home-bottom" | "product-side" | "article-side";

export const ZONE_LABEL: Record<WidgetZone, string> = {
  "home-top": "صفحهٔ اصلی — بالای همه",
  "home-middle": "صفحهٔ اصلی — میان بخش‌ها",
  "home-bottom": "صفحهٔ اصلی — پایین، پیش از فوتر",
  "product-side": "صفحهٔ محصول — زیر اطلاعات",
  "article-side": "صفحهٔ مقاله — پایان متن",
};

export interface WidgetInstance {
  id: string;
  /** which definition in the registry this instance runs */
  kind: string;
  zone: WidgetZone;
  /** the owner's own heading; empty means the widget's default title */
  title: string;
  active: boolean;
  options: Record<string, string | number | boolean>;
}

export type OptionType = "text" | "number" | "select" | "toggle";

export interface WidgetOption {
  key: string;
  label: string;
  type: OptionType;
  /** fixed choices from the code (a look id, a colour) */
  choices?: { value: string; label: string }[];
  /** or choices the store owns: the panel fills these from the live documents */
  choicesSource?: "categories" | "looks";
  default: string | number | boolean;
  hint?: string;
}

export interface WidgetContext {
  /** set on the product page */
  productId?: string;
  /** set on an article page */
  articleSlug?: string;
}
