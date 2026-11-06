declare module "*.webp" {
  const src: string;
  export default src;
}

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** public URL of the separate Next.js admin V3 */
  readonly VITE_ADMIN_PANEL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
