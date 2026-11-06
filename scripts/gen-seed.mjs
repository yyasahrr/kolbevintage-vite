/**
 * Generates server/seed/state.json from the frontend demo store.
 * Run with: node scripts/gen-seed.mjs
 */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "server/seed/.frontend-bundle.mjs");

await build({
  stdin: {
    contents: `
      const admin = await import("./src/state/admin.ts");
      const ops = await import("./src/state/ops.ts");
      const catalog = await import("./src/data/catalog.ts");
      globalThis.__SEED__ = { admin: admin.getAdmin(), ops: ops.getOps(), catalog: catalog.CATALOG };
    `,
    resolveDir: root,
    sourcefile: "seed-entry.ts",
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  tsconfig: path.join(root, "tsconfig.json"),
  logLevel: "error",
  plugins: [
    {
      name: "asset-stub",
      setup(b) {
        b.onResolve({ filter: /\.(webp|png|jpe?g|gif)$/ }, (args) => ({ path: args.path, namespace: "asset-stub" }));
        b.onLoad({ filter: /.*/, namespace: "asset-stub" }, () => ({ contents: `export default "";`, loader: "js" }));
      },
    },
  ],
});

globalThis.window = undefined;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

await import(outfile);
const { admin, ops, catalog } = globalThis.__SEED__;

const baseProducts = catalog.map((p) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  garment: p.garment,
  price: p.price,
  compareAt: p.compareAt ?? null,
  description: p.description,
  material: p.material,
  care: p.care,
  fit: p.fit,
  origin: p.origin,
  badge: p.badge ?? null,
  lookId: p.lookId,
  lookName: p.lookName,
  lookSlug: p.lookSlug,
  lookOrder: p.lookOrder,
  crop: p.crop,
  colors: p.colors,
  sizes: p.sizes,
  stock: p.stock,
}));

const seed = {
  generatedAt: new Date().toISOString(),
  baseProducts,
  admin,
  ops,
};

fs.mkdirSync(path.join(root, "server/seed"), { recursive: true });
fs.writeFileSync(path.join(root, "server/seed/state.json"), JSON.stringify(seed, null, 1));
fs.unlinkSync(outfile);
console.log(`seed written: ${baseProducts.length} base products, ${JSON.stringify(seed).length} bytes`);
