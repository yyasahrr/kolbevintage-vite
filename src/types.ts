export type GarmentKind =
  | "coat"
  | "jacket"
  | "knit"
  | "tee"
  | "dress"
  | "skirt"
  | "trousers"
  | "bag"
  | "loafer"
  | "heel"
  | "boot"
  | "sneaker"
  | "accessory";

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
}

export interface SizeOption {
  id: string;
  label: string;
}

/** stock is keyed `${colorId}:${sizeId}` */
export type StockMap = Record<string, number>;

/** Normalised crop window into the look image, used for product thumbnails. */
export interface Crop {
  cx: number;
  cy: number;
  /** visible fraction of the image width (1 = full width) */
  zoom: number;
}

/**
 * One uploaded product image. Every image carries a colour and a role, so the
 * same gallery can feed the product page, the card hover state and the
 * editorial close-ups without any cropping UI.
 */
export type ProductImageRole = "main" | "gallery" | "hover" | "detail" | "cutout";

export interface ProductImage {
  id: string;
  url: string;
  /** a colour id of the product, or "*" for every colour */
  colorId: string;
  role: ProductImageRole;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  garment: GarmentKind;
  price: number;
  compareAt?: number;
  colors: ColorOption[];
  sizes: SizeOption[];
  stock: StockMap;
  crop: Crop;
  /** injected from the parent look */
  image: string;
  aspect: number;
}

export interface Look {
  id: string;
  order: number;
  name: string;
  tagline: string;
  season: string;
  /** Transparent full-length cut-out (webp with alpha) */
  image: string;
  /** Natural aspect ratio (w / h) of the cut-out, used to avoid layout shift */
  aspect: number;
  accent: string;
  products: Product[];
}

export interface VariantSelection {
  colorId: string;
  sizeId: string;
  included: boolean;
}

export type SelectionMap = Record<string, VariantSelection>;

export interface CartLine {
  key: string;
  productId: string;
  name: string;
  category: string;
  garment: GarmentKind;
  price: number;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  colorId: string;
  sizeId: string;
  lookName: string;
  qty: number;
}

export type TransitionMode = "ring" | "catwalk" | "queue";

export interface SceneSettings {
  mode: TransitionMode;
  /** animation speed multiplier, 0.5 (slow) → 2 (fast) */
  speed: number;
  blur: boolean;
  shadows: boolean;
  /** horizontal spread multiplier */
  spacing: number;
  backdrop: string;
}
