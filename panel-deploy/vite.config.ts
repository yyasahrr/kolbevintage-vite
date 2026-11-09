import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root:here,base:'/panel-assets/',plugins:[react(),tailwindcss()],
  resolve:{alias:[{find:'next/dynamic',replacement:path.join(here,'next-dynamic.tsx')},{find:'@',replacement:path.join(here,'../fashion-e-commerce-admin-development/src')}],dedupe:['react','react-dom','@puckeditor/core','lucide-react','react-date-object','react-multi-date-picker','qrcode','bwip-js']},
  build:{outDir:path.join(here,'../panel-output'),emptyOutDir:true},
});
