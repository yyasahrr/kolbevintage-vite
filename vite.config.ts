import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** logs preview requests (host + status) so proxy/edge problems are visible */
function requestLogger() {
  return {
    name: "kv-request-logger",
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers?.host ?? "-";
        res.on("finish", () => {
          if (req.url && !req.url.startsWith("/@") && !req.url.startsWith("/src/") && !req.url.startsWith("/node_modules/")) {
            console.log(`[web] ${req.method} ${req.url} host=${host} -> ${res.statusCode}`);
          }
        });
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), requestLogger()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:4000", changeOrigin: false },
      "/uploads": { target: "http://127.0.0.1:4000", changeOrigin: false },
    },
  },
  preview: { host: "0.0.0.0", port: 4173, strictPort: true, allowedHosts: true },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
