import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://store.test/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
let published='glassmorphism'; const calls=[];
globalThis.fetch=async (url,init={})=>{
  calls.push({url:String(url),method:init.method||'GET',body:init.body});
  if(String(url)==='/api/public/store-theme') return new Response(JSON.stringify({theme:published}),{status:200});
  if(String(url)==='/api/csrf') return new Response(JSON.stringify({token:'csrf'}),{status:200});
  if(String(url)==='/api/admin/style-packs' && init.method==='PATCH') {const body=JSON.parse(init.body);assert.equal(body.expectedTheme,published);published=body.theme;return new Response(JSON.stringify({active:published}),{status:200});}
  return new Response('{}',{status:401});
};
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true},appType:'custom'});
try {
  const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
  const {ThemeProvider,useTheme}=await vite.ssrLoadModule('/src/theme/ThemeProvider.tsx');
  const {THEMES}=await vite.ssrLoadModule('/src/theme/themes.ts');
  assert.ok(THEMES.length>=10);assert.equal(new Set(THEMES.map(t=>t.id)).size,THEMES.length);
  for(const theme of THEMES) assert.ok(theme.tokens['--color-ink'] && theme.tokens['--color-bone'] && theme.tokens['--card-shadow']);
  let state;function Probe(){state=useTheme();return React.createElement('p',null,state.theme.label);}
  const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(ThemeProvider,null,React.createElement(Probe))));
  assert.equal(document.documentElement.dataset.theme,'glassmorphism');
  assert.equal(document.documentElement.style.getPropertyValue('--color-bone'),THEMES.find(t=>t.id==='glassmorphism').tokens['--color-bone']);
  published='bento';await act(async()=>window.dispatchEvent(new dom.window.Event('focus')));
  assert.equal(document.documentElement.dataset.theme,'bento');
  await act(async()=>{await state.setTheme('soft')});assert.equal(published,'soft');assert.equal(document.documentElement.dataset.theme,'soft');
  await act(async()=>root.unmount());
  window.history.replaceState({},'', '/?themePreview=liquid-glass#/products');
  const reads=calls.filter(c=>c.url==='/api/public/store-theme').length;
  const preview=createRoot(document.getElementById('root'));
  await act(async()=>preview.render(React.createElement(ThemeProvider,null,React.createElement(Probe))));
  assert.equal(document.documentElement.dataset.theme,'liquid-glass');assert.equal(published,'soft');
  assert.equal(calls.filter(c=>c.url==='/api/public/store-theme').length,reads,'preview is isolated from publication');
  await assert.rejects(()=>state.setTheme('bento'));
  assert.equal(published,'soft');await act(async()=>preview.unmount());
  console.log('Store theme smoke: tokens, live refresh, publish and isolated preview passed');
} finally {await vite.close();dom.window.close();}
