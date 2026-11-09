// Vercel serves public static assets from dist and bundles only the panel HTML
// into the API function. The HTML route checks the configured entry path.
import {cp,mkdir,copyFile,rm} from 'node:fs/promises';
await rm('dist/panel-assets',{recursive:true,force:true});
await mkdir('dist/panel-assets',{recursive:true});
await cp('panel-output/assets','dist/panel-assets/assets',{recursive:true});
await mkdir('server/panel-static',{recursive:true});
await copyFile('panel-output/index.html','server/panel-static/index.html');
