import assert from 'node:assert/strict';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url:'http://store.test/' });
Object.assign(globalThis, {window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
class Observer {observe(){} unobserve(){} disconnect(){}}
Object.assign(globalThis,{IntersectionObserver:Observer,ResizeObserver:Observer});
window.scrollTo=()=>{}; window.HTMLElement.prototype.scrollTo=()=>{};
const row={id:'real-one',name:'محصول واقعی',category:'پالتو',garment:'coat',price:975,compareAt:null,description:'مشخصات واقعی',material:null,care:null,fit:null,origin:null,badge:null,lookId:null,lookName:null,lookSlug:null,lookOrder:0,crop:null,colors:[{id:'c',name:'آبی',hex:'#112233'}],sizes:[{id:'m',label:'M'}],stock:{'c:m':3},active:true,featured:false,images:[{id:'img',url:'/uploads/real.webp',colorId:'*',role:'main'}],complements:[]};
let mode='good';
globalThis.fetch=async (url)=>{
  if (String(url)==='/api/products') {
    if(mode==='offline') throw new Error('network');
    if(mode==='invalid') return new Response(JSON.stringify([{...row,stock:'bad'}]),{status:200});
    if(mode==='multi') return new Response(JSON.stringify([
      {...row,id:'blue-l',name:'کالای آبی بزرگ',colors:[{id:'c1',name:'آبی',hex:'#112233'}],sizes:[{id:'m',label:'M'},{id:'l',label:'L'}],stock:{'c1:m':0,'c1:l':2}},
      {...row,id:'red-m',name:'کالای قرمز',colors:[{id:'c1',name:'قرمز',hex:'#ff0000'}],sizes:[{id:'m',label:'M'}],stock:{'c1:m':3}},
      {...row,id:'blue-m',name:'کالای آبی متوسط',colors:[{id:'other',name:'آبی',hex:'#112233'}],sizes:[{id:'m',label:'M'}],stock:{'other:m':2}},
    ]),{status:200});
    return new Response(JSON.stringify([row]),{status:200});
  }
  return new Response('{}',{status:401});
};
const vite=await createServer({configFile:false,plugins:[react()],resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true},appType:'custom'});
try {
  const React=await import('react'); const {act}=React; const {createRoot}=await import('react-dom/client');
  const {MemoryRouter,Routes,Route}=await import('react-router-dom');
  const {ProductPage}=await vite.ssrLoadModule('/src/pages/ProductPage.tsx');
  const {CartProvider,useCart}=await vite.ssrLoadModule('/src/state/cart.tsx');
  const {ProductsPage}=await vite.ssrLoadModule('/src/pages/ProductsPage.tsx');
  const {AuthProvider}=await vite.ssrLoadModule('/src/state/auth.tsx');
  const catalog=await vite.ssrLoadModule('/src/state/live-catalog.ts');
  const root=createRoot(document.getElementById('root'));
  let bag; function Probe(){bag=useCart();return null;}
  await act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/product/real-one']},React.createElement(AuthProvider,null,React.createElement(CartProvider,null,React.createElement(Probe),React.createElement(Routes,null,React.createElement(Route,{path:'/product/:productId',element:React.createElement(ProductPage)})))))));
  assert.match(document.body.textContent,/در حال دریافت محصول/);
  await act(async()=>{await catalog.refreshLiveCatalog()});
  assert.match(document.body.textContent,/محصول واقعی/);
  assert.match(document.body.textContent,/مشخصات واقعی/);
  assert.equal(catalog.sellableStock('real-one','c','m'),3);
  assert.ok(document.querySelector('img[src="/uploads/real.webp"]'));
  const add=[...document.querySelectorAll('button')].find(button=>button.textContent.includes('خرید آنلاین — افزودن به سبد'));
  assert.ok(add && !add.disabled);
  await act(async()=>add.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));
  assert.equal(bag.lines.length,1); assert.equal(bag.lines[0].qty,1);
  await act(async()=>bag.setQty(bag.lines[0].key,4));
  assert.equal(bag.lines[0].qty,1, 'quantity cannot exceed sellable stock');
  row.price=1200; row.colors[0].name='آبی تیره'; row.sizes[0].label='L'; await act(async()=>{await catalog.refreshLiveCatalog()});
  assert.equal(bag.lines[0].price,1200, 'cart uses current catalogue price');
  assert.equal(bag.lines[0].colorName,'آبی تیره'); assert.equal(bag.lines[0].sizeLabel,'L');
  mode='offline'; await act(async()=>{await catalog.refreshLiveCatalog()});
  assert.equal(catalog.sellableStock('real-one','c','m'),0);
  assert.match(document.body.textContent,/موجودی قابل تأیید نیست/);
  assert.match(document.body.textContent,/محصول واقعی/);
  mode='good'; await act(async()=>{await catalog.refreshLiveCatalog()});
  assert.equal(catalog.sellableStock('real-one','c','m'),3);
  mode='invalid'; await act(async()=>{await catalog.refreshLiveCatalog()});
  assert.equal(catalog.getLiveCatalog().status,'offline');
  assert.equal(catalog.sellableStock('real-one','c','m'),0);
  assert.equal(catalog.getLiveCatalog().products[0].name,'محصول واقعی');
  mode='good'; await act(async()=>{await catalog.refreshLiveCatalog()});
  await act(async()=>root.render(React.createElement(MemoryRouter,{key:'products',initialEntries:['/products']},React.createElement(AuthProvider,null,React.createElement(CartProvider,null,React.createElement(Routes,null,React.createElement(Route,{path:'/products',element:React.createElement(ProductsPage)})))))));
  assert.match(document.body.textContent,/محصول واقعی/);
  row.name='محصول ویرایش‌شده'; await act(async()=>{await catalog.refreshLiveCatalog()});
  assert.match(document.body.textContent,/محصول ویرایش‌شده/, 'product list reflects updated catalogue');
  mode='multi';await act(async()=>{await catalog.refreshLiveCatalog()});
  const shop=await vite.ssrLoadModule('/src/data/catalog.ts');
  const blue=shop.colorFilterKey({name:'آبی',hex:'#112233'}),red=shop.colorFilterKey({name:'قرمز',hex:'#ff0000'});
  const ids=filters=>shop.filterProducts(filters).map(p=>p.id).sort();
  assert.deepEqual(ids({color:blue}),['blue-l','blue-m']);assert.deepEqual(ids({color:red}),['red-m']);
  assert.deepEqual(ids({color:blue,size:'M'}),['blue-m'],'selected size and color must be available in the same variant');
  assert.deepEqual(ids({color:blue,size:'L'}),['blue-l']);
  assert.ok(document.querySelector('button[aria-label="فیلتر رنگ آبی"]'));assert.ok(document.querySelector('button[aria-label="فیلتر رنگ قرمز"]'),'duplicate local color IDs do not hide swatches');
  const now=Date.now; Date.now=()=>now()+91_000;
  assert.equal(catalog.sellableStock('blue-m','other','m'),0,'expired snapshots cannot be purchased');
  Date.now=now;
  await act(async()=>root.unmount());
  console.log('Live catalogue smoke: async product/list, images, cart pricing and stock, network failure, recovery and malformed response passed');
} finally {await vite.close(); dom.window.close();}
