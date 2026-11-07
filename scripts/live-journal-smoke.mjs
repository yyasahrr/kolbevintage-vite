import assert from 'node:assert/strict';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';

const dom=new JSDOM('<!doctype html><html><head><meta name="description" content="فروشگاه"></head><body><div id="root"></div></body></html>',{url:'http://store.test/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});window.scrollTo=()=>{};
class Observer{observe(){} unobserve(){} disconnect(){}}Object.assign(globalThis,{IntersectionObserver:Observer,ResizeObserver:Observer});
const row={slug:'real',title:'مقاله واقعی',excerpt:'خلاصه واقعی',category:'راهنما',body:'متن واقعی\n\n<script>bad()</script>',coverUrl:'',publishedAt:'2026-01-01T00:00:00.000Z',seoTitle:'عنوان اختصاصی',seoDescription:'توضیح اختصاصی'};
let mode='empty';
globalThis.fetch=async url=>{
 const p=String(url);
 if(p.startsWith('/api/public/journal')){
   if(mode==='offline')throw new Error('offline');
   if(p.endsWith('/real'))return mode==='published'?new Response(JSON.stringify(row)):new Response('{}',{status:404});
   return new Response(JSON.stringify({enabled:mode!=='disabled',items:mode==='published'?[row]:[]}));
 }
 return new Response('{}',{status:401});
};
const vite=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true},appType:'custom'});
try{
 const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {MemoryRouter,Routes,Route}=await import('react-router-dom');
 const {JournalPage}=await vite.ssrLoadModule('/src/pages/JournalPage.tsx');const {ArticlePage}=await vite.ssrLoadModule('/src/pages/ArticlePage.tsx');const {CartProvider}=await vite.ssrLoadModule('/src/state/cart.tsx');const {AuthProvider}=await vite.ssrLoadModule('/src/state/auth.tsx');const journal=await vite.ssrLoadModule('/src/data/journal.ts');
 const {hydrateOps}=await vite.ssrLoadModule('/src/state/ops.ts');hydrateOps({features:{journal:false,tryon:true,reviews:true,wishlist:true}});
 const root=createRoot(document.getElementById('root'));
 function renderPage(route,element){return React.createElement(MemoryRouter,{key:route,initialEntries:[route]},React.createElement(AuthProvider,null,React.createElement(CartProvider,null,React.createElement(Routes,null,React.createElement(Route,{path:route==='/journal'?'/journal':'/journal/:slug',element:React.createElement(element)})))))}
 await act(async()=>root.render(renderPage('/journal',JournalPage)));
 assert.match(document.body.textContent,/در حال بارگذاری/);assert.doesNotMatch(document.body.textContent,/شعرِ پالتوی بلند/);
 await act(async()=>{await journal.refreshJournal()});assert.match(document.body.textContent,/هنوز مقاله‌ای منتشر نشده/);
 mode='published';await act(async()=>{await journal.refreshJournal()});assert.match(document.body.textContent,/مقاله واقعی/);assert.match(document.body.textContent,/راهنما/);
 await act(async()=>{root.render(renderPage('/journal/real',ArticlePage));await new Promise(r=>setTimeout(r,30))});
 assert.match(document.body.textContent,/متن واقعی/);assert.match(document.body.textContent,/<script>bad\(\)<\/script>/);assert.equal(document.querySelector('article script'),null);assert.equal(document.title,'عنوان اختصاصی');
 mode='disabled';await act(async()=>{await journal.refreshJournal();await new Promise(r=>setTimeout(r,30))});assert.doesNotMatch(document.body.textContent,/متن واقعی/);assert.equal(journal.POSTS.length,0);
 mode='offline';await act(async()=>{await journal.refreshJournal();await new Promise(r=>setTimeout(r,30))});assert.match(document.body.textContent,/ارتباط با ژورنال برقرار نشد/);
 await act(async()=>root.unmount());console.log('Live journal smoke: loading, empty, published list/detail, escaped text, disabled and offline passed');
}finally{await vite.close();dom.window.close()}
