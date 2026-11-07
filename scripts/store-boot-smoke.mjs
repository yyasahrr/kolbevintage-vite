import assert from 'node:assert/strict';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://store.test/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
let online=false;
globalThis.fetch=async url=>{
  if (String(url)==='/api/bootstrap') {
    if(!online) throw new Error('offline');
    return new Response(JSON.stringify({admin:{settings:{name:'فروشگاه تازه'},customProducts:[],reviews:[],campaigns:[]},ops:{brand:{name:'فروشگاه تازه'},siteUnderSetup:true,homeSections:[{id:'hero',label:'hero',active:false}]}}),{status:200});
  }
  return new Response('{}',{status:200});
};
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true},appType:'custom'});
try {
  const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');
  const {StoreBootGate}=await vite.ssrLoadModule('/src/components/StoreBootGate.tsx');
  const {hydrateFromServer}=await vite.ssrLoadModule('/src/state/sync.ts');
  const {hydrateOps}=await vite.ssrLoadModule('/src/state/ops.ts');
  const root=createRoot(document.getElementById('root'));
  await act(async()=>root.render(React.createElement(StoreBootGate,null,React.createElement('p',null,'DEMO CONTENT'))));
  assert.match(document.body.textContent,/در حال دریافت/);assert.doesNotMatch(document.body.textContent,/DEMO CONTENT/);
  await act(async()=>{await hydrateFromServer(1)});
  assert.match(document.body.textContent,/اتصال به فروشگاه برقرار نیست/);assert.doesNotMatch(document.body.textContent,/DEMO CONTENT/);
  online=true;await act(async()=>{await hydrateFromServer(1)});
  assert.match(document.body.textContent,/فروشگاه تازه/);assert.match(document.body.textContent,/در حال آماده‌سازی/);assert.doesNotMatch(document.body.textContent,/DEMO CONTENT/);
  assert.match(document.title,/فروشگاه تازه/);assert.equal(document.querySelector('meta[name="robots"]')?.content,'noindex, nofollow');
  await act(async()=>hydrateOps({brand:{name:'فروشگاه فعال'},siteUnderSetup:false}));
  assert.match(document.body.textContent,/DEMO CONTENT/);assert.equal(document.querySelector('meta[name="robots"]'),null);
  await act(async()=>root.unmount());console.log('Store boot gate: no prototype flash, offline fail-closed, setup gate and normal shop passed');
} finally {await vite.close();dom.window.close();}
