import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { webcrypto } from "node:crypto";

async function main() {
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://store.test/panel" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, FileReader: dom.window.FileReader, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const requests: { path: string; method: string; body?: any }[] = [];
const permissions = ["dashboard:view", "catalog:view", "catalog:edit", "catalog:publish", "inventory:view", "inventory:adjust", "inventory:approve", "orders:view", "orders:edit", "customers:view", "content:view", "content:edit", "content:publish", "staff:manage", "security:view", "campaigns:view", "campaigns:edit", "design:view", "design:edit", "settings:view", "settings:edit", "finance:view"];
const variant = { id: "v-1", productId: "p-1", name: "پالتو", sku: "SKU-1", colorName: "آبی", sizeLabel: "M", sellable: 5, onHand: 6, stockVersion: "2026-01-01 00:00:00+00", active: true, price: 100, reserved: 1, quarantined: 0, lowStock: true, outOfStock: false };
const productFixture = { id:"p-1", name:"پالتو", category:"پوشاک", price:100, active:true, images:[], colors:[{id:"c1",name:"مشکی",hex:"#111111"}], sizes:[{id:"s1",label:"M"}] };
let activeTheme="soft", previousTheme:string|null=null;
const packs=[{id:"soft",label:"سافت UI",tagline:"Soft UI",description:"سطوح نرم",category:"روشن",tokens:{"--color-bone":"#eee","--color-paper":"#fff","--color-ink":"#111","--color-ink-45":"#555","--color-ember":"#a33","--card-shadow":"none"}},{id:"glassmorphism",label:"گلس‌مورفیسم",tagline:"Glass",description:"سطوح شیشه‌ای",category:"تجربی",tokens:{"--color-bone":"#def","--color-paper":"#fff","--color-ink":"#111","--color-ink-45":"#555","--color-ember":"#75a","--card-shadow":"none"}}];
const printOrder={id:"VL-1",customer:"مشتری",phone:"09120000000",city:"تهران",address:"نشانی ثبت‌شده",status:"paid",paymentStatus:"settled",paymentKind:"simulated",fulfillmentStatus:"unfulfilled",createdAt:"2026-01-01T00:00:00.000Z",tracking:"TRACK-1",carrier:"پست",subtotal:120,discountTotal:20,shippingTotal:0,total:100,currency:"تومان",manual:true,lines:[{id:"l-1",sku:"SKU-1",name:"پالتو",colorName:"آبی",sizeLabel:"M",quantity:1,unitPrice:120,lineTotal:100}]};
const printFixture={order:printOrder,adjustments:[{id:"refund-1",amount:30,quantity:1,status:"requested",at:"2026-01-02T00:00:00Z"}],issuedAt:printOrder.createdAt};
const fixtures: Record<string, unknown> = {
  "/api/commerce/orders/VL-1/invoice": printFixture,
  "/api/admin/me": { authenticated: true, subject: "admin", permissions, openAccess: false },
  "/api/admin/categories": [{id:"outerwear",name:"پالتو",slug:"outerwear",thumbnail:"stock:hero",active:true,order:1,sizeSetId:"set-1"}],
  "/api/admin/size-sets": [{id:"set-1",name:"سایز پوشاک",sizes:["M","L"]}],
  "/api/products?all=1": [productFixture],
  "/api/commerce/admin/inventory": [variant],
  "/api/commerce/orders?all=1&limit=200": [{id:"VL-1",customer:"مشتری",phone:"",city:"",address:"",status:"paid",paymentStatus:"settled",fulfillmentStatus:"unfulfilled",createdAt:new Date().toISOString(),tracking:"",carrier:"Post",total:100,currency:"تومان",lines:[{id:"l-1",sku:"SKU-1",name:"پالتو",colorName:"آبی",sizeLabel:"M",quantity:1,unitPrice:100,lineTotal:100}]}],
  "/api/commerce/admin/inventory/adjustments": [{ id: "adj-1", variantId: "v-1", delta: 2, reason: "شمارش", requestedBy: "warehouse", status: "pending", approvedBy: null, note: "", createdAt: new Date().toISOString() }],
  "/api/commerce/admin/inventory/movements?limit=200": [],
  "/api/admin/journal": {enabled:false,items:[]},
  "/api/admin/gallery": [{ id: "gal-1", handle: "کاربر", imageUrl: "/uploads/test.jpg", caption: "تصویر", status: "pending", consentVerified: true, submittedAt: new Date().toISOString() }],
  "/api/admin/customer-labels": {labels:[],customers:[{ email:"customer@example.test", name:"مشتری",phone:null,createdAt:new Date().toISOString(),deliveredOrders:0,manualLabels:[],automaticLabels:[],labels:[] }]},
  "/api/admin/staff": { staff: [], roles: [] },
  "/api/admin/roles": { groups: [] },
  "/api/commerce/admin/audit?limit=200": [],
  "/api/commerce/admin/refunds": [{ id: "rfd-1", orderId: "KV-1", orderLineId: "line-1", quantity: 1, amount: 100, kind: "return", status: "received", reason: "سایز", requestedBy: "admin", note: "", createdAt: new Date().toISOString() }],
  "/api/admin/marketing": { rules: [], coupons: [] },
  "/api/admin/store-brand": { name:"نام فروشگاه", logoText:"لوگو", tagline:"شعار", announcement:"اعلان", announcementActive:true, footerNote:"فوتر" },
  "/api/commerce/admin/settings": {shippingFlat:10,shippingExpress:20,freeShippingThreshold:100,reservationHoldMinutes:10,paymentWindowMinutes:10,quoteTtlMinutes:10,currency:"EUR"},
  "/api/admin/finance/summary": { groups: [], note:"مبالغ ثبت‌شده" },
  "/api/commerce/admin/payments?status=exception": [],
  "/api/admin/analytics?days=14": {days:14,totals:{views:0,visits:0,orders:0},top:[],sampleTooSmall:true},
  "/api/csrf": { token: "csrf" },
};
globalThis.fetch = async (request, init) => {
  const path = String(request); const method = init?.method || "GET"; const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  requests.push({ path, method, body });
  if (method === "GET" && path === "/api/admin/style-packs") return new Response(JSON.stringify({active:activeTheme,previous:previousTheme,packs}),{status:200});
  if (method === "PATCH" && path === "/api/admin/style-packs") { if(body.expectedTheme!==activeTheme) return new Response(JSON.stringify({error:"ظاهر تغییر کرده است"}),{status:409}); previousTheme=activeTheme;activeTheme=body.theme;return new Response(JSON.stringify({ok:true,active:activeTheme,previous:previousTheme}),{status:200}); }
  if (method === "POST" && path === "/api/admin/products/p-1/options") {
    if(body.action === "add_color") productFixture.colors.push({id:"c2",name:body.name,hex:body.hex});
    if(body.action === "add_size") productFixture.sizes.push({id:"s2",label:body.label});
    if(body.action === "update_color") {const color=productFixture.colors.find(c=>c.id===body.id)!; color.name=body.name;color.hex=body.hex;}
    return new Response(JSON.stringify({ok:true,colors:productFixture.colors,sizes:productFixture.sizes}),{status:200});
  }
  if (method === "PATCH" && path === "/api/admin/journal-settings") { (fixtures["/api/admin/journal"] as any).enabled=body.enabled; return new Response(JSON.stringify({enabled:body.enabled})); }
  if (method === "POST" && path === "/api/admin/journal") { const article={id:"article-test",...body,status:"draft",coverUrl:"",publishedAt:null,version:1,updatedAt:new Date().toISOString()};(fixtures["/api/admin/journal"] as any).items=[article];return new Response(JSON.stringify(article),{status:201}); }
  if (method === "PATCH" && path === "/api/admin/journal/article-test") {const current=(fixtures["/api/admin/journal"] as any).items[0];const article={...current,...body,version:current.version+1,publishedAt:body.publishedAt || new Date().toISOString()};(fixtures["/api/admin/journal"] as any).items=[article];return new Response(JSON.stringify(article)); }
  if (method === "POST" && path === "/api/admin/size-sets") {const sizeSet={id:"set-2",...body};(fixtures["/api/admin/size-sets"] as any[]).push(sizeSet);return new Response(JSON.stringify({sizeSet}),{status:201})}
  if (method === "PATCH" && path === "/api/admin/size-sets/set-2") {const items=fixtures["/api/admin/size-sets"] as any[];const sizeSet={id:"set-2",name:body.name,sizes:body.sizes};items[items.findIndex(s=>s.id==="set-2")]=sizeSet;return new Response(JSON.stringify({sizeSet}))}
  if (method === "PATCH" && path === "/api/admin/size-sets/set-2/measurements") {const items=fixtures["/api/admin/size-sets"] as any[];const i=items.findIndex(s=>s.id==="set-2");items[i]={...items[i],measurements:body.measurements,measurementBasis:body.basis};return new Response(JSON.stringify({sizeSet:items[i]}))}
  if (method === "POST" && path === "/api/admin/size-sets/set-2/delete") {const items=fixtures["/api/admin/size-sets"] as any[];items.splice(items.findIndex(s=>s.id==="set-2"),1);return new Response(JSON.stringify({ok:true}))}
  if (method === "POST" && path === "/api/admin/categories") return new Response(JSON.stringify({ok:true,category:{id:"cat-test",...body,thumbnail:"",order:2}}),{status:201,headers:{"content-type":"application/json"}});
  if (method !== "GET") return new Response(JSON.stringify({ ok: true, refund: {status: "qc_failed"} }), { status: 200, headers: { "content-type": "application/json" } });
  if (!(path in fixtures)) return new Response(JSON.stringify({ error: `unexpected ${path}` }), { status: 500 });
  return new Response(JSON.stringify(fixtures[path]), { status: 200, headers: { "content-type": "application/json" } });
};
const React = await import("react");
const { act } = React;
const { createRoot } = await import("react-dom/client");
const { default: Dashboard } = await import("../src/app/page");
const root = createRoot(document.getElementById("root")!);
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); }); };
async function click(text: string) {
  const btn = [...document.querySelectorAll("button")].find(b => !b.disabled && (b.textContent?.trim() === text || b.textContent?.trim() === `${text}بخشی متصل`));
  assert.ok(btn, `button not found: ${text}`);
  await act(async () => { btn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}
await act(async () => root.render(React.createElement(Dashboard)));
await settle();
assert.match(document.body.textContent || "", /داشبورد عملیات کلبه وینتیج/);
assert.match(document.body.textContent || "", /کاتالوگ و محصولات/);
assert.doesNotMatch(document.body.textContent || "", /سارا محمدی/);
for (const group of ["انبار و موجودی کالا", "سفارش‌ها و مرجوعی", "بازاریابی و مشتریان", "محتوا و ظاهر سایت", "مالی، اتصالات و تنظیمات"]) await click(group);
const unconnected = [...document.querySelectorAll("button")].find(b=>b.textContent?.trim()==="پرو مجازی (مستند تصمیم)متصل نشده");
assert.ok(unconnected?.disabled, "unmigrated prototype must remain disabled");
for (const [button, expected] of [
  ["محصولات", "پالتو"], ["دسته‌بندی‌ها", "تصویر بندانگشتی"], ["موجودی کالا و هشدارها", "قابل فروش"], ["دریافت، شمارش و اصلاح", "درخواست‌های اصلاح موجودی"],
  ["سفارش‌ها", "مدیریت سفارش‌ها و عملیات پردازش"], ["سفارش دستی", "مرجع پرداخت خارجی"], ["برداشت، بسته‌بندی و ارسال", "انتخاب سفارش"], ["مرجوعی و کنترل کیفیت", "درخواست‌های ثبت‌شده"], ["مشتریان و گروه‌بندی CRM", "customer@example.test"],
  ["کمپین‌ها و تخفیف‌ها", "پیش‌نویس کمپین"], ["استودیو طراحی (Site Studio)", "نام فروشگاه"], ["تنظیمات و مستندات تحویل", "هزینه ارسال عادی"], ["نمای مالی و تراکنش‌ها", "سفارشی ثبت نشده"], ["آمار بازدید فروشگاه", "حجم داده کم"],
  ["گالری مشتریان و نظرات", "تصویر"], ["کارکنان و ماتریس دسترسی", "افزودن کارمند"], ["گزارش فعالیت‌ها (Audit Log)", "رویدادهای مدیریتی"],
] as const) {
  await click(button);
  assert.ok(document.body.textContent?.includes(expected), `${button}: missing ${expected}`);
  console.log(`OK ${button}`);
}
await click("بلاگ و محتوای ویدیویی");
assert.ok(document.body.textContent?.includes("هنوز مقاله‌ای ثبت نشده است"));
await click("فعال کردن ژورنال");
assert.ok(requests.some(r=>r.path==="/api/admin/journal-settings" && r.method==="PATCH" && r.body.enabled===true && r.body.expectedEnabled===false));
await click("مقاله جدید");
const journalInput=(label:string)=>{const el=[...document.querySelectorAll("label")].find(l=>l.textContent?.startsWith(label))?.querySelector("input,textarea");assert.ok(el,label);return el;};
for(const [label,value] of [["عنوان","مقاله آزمون"],["شناسهٔ لاتین","test-journal"],["دسته","استایل"],["متن مقاله","متن واقعی"]] as const){const el=journalInput(label);await act(async()=>{const proto=el.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});}
await click("ذخیره پیش‌نویس");
assert.ok(requests.some(r=>r.path==="/api/admin/journal" && r.method==="POST" && r.body.slug==="test-journal" && r.body.body==="متن واقعی"));
await click("انتشار / ذخیره منتشرشده");
assert.ok(requests.some(r=>r.path==="/api/admin/journal/article-test" && r.method==="PATCH" && r.body.status==="published" && r.body.expectedVersion===1));
const journalCursor="article-00000000-0000-4000-8000-000000000001";
(fixtures["/api/admin/journal"] as any).nextCursor=journalCursor;
fixtures[`/api/admin/journal?before=${journalCursor}`]={enabled:true,items:[{id:"old-article",slug:"old-article",title:"مقاله قدیمی",excerpt:"",category:"استایل",body:"",seoTitle:"",seoDescription:"",status:"draft",coverUrl:"",publishedAt:null,version:1,updatedAt:new Date().toISOString()}],nextCursor:null};
await click("تازه‌سازی");await click("مقالات قدیمی‌تر");assert.match(document.body.textContent||"",/مقاله قدیمی/);
assert.ok(requests.some(r=>r.path===`/api/admin/journal?before=${journalCursor}`));
await click("پک‌های ظاهری (Style Packs)");
assert.ok(document.body.textContent?.includes("سافت UI"));
const beforeThemeWrites=requests.filter(r=>r.path==="/api/admin/style-packs" && r.method==="PATCH").length;
const glassPreview=document.querySelector<HTMLButtonElement>('button[aria-label="پیش‌نمایش گلس‌مورفیسم"]');assert.ok(glassPreview);
await act(async()=>glassPreview.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));await settle();
assert.ok(document.querySelector('iframe[title="پیش‌نمایش گلس‌مورفیسم"]')?.getAttribute("src")?.includes("themePreview=glassmorphism"));
assert.equal(requests.filter(r=>r.path==="/api/admin/style-packs" && r.method==="PATCH").length,beforeThemeWrites,"preview must not publish");
await click("انتشار");assert.ok(requests.some(r=>r.path==="/api/admin/style-packs" && r.body?.theme==="glassmorphism" && r.body?.expectedTheme==="soft"));
await click("بازگشت به سافت UI");assert.ok(requests.some(r=>r.path==="/api/admin/style-packs" && r.body?.theme==="soft" && r.body?.expectedTheme==="glassmorphism"));
await click("الگوهای سایز و اندازه‌گیری");
assert.match(document.body.textContent||"",/سایز پوشاک/);await click("الگوی جدید");
const sizeForm=document.querySelector<HTMLFormElement>('form[aria-label="افزودن الگوی سایز"]');assert.ok(sizeForm);
const sizeName=sizeForm.querySelector("input")!,sizeText=sizeForm.querySelector("textarea")!;
for(const [el,value] of [[sizeName,"سایز آزمون"],[sizeText,"XS، S، M"]] as const)await act(async()=>{const proto=el.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}))});
await click("ذخیره الگو");assert.ok(requests.some(r=>r.path==="/api/admin/size-sets"&&r.method==="POST"&&r.body.sizes.join(",")==="XS,S,M"));
const sizeCard=[...document.querySelectorAll("article")].find(a=>a.textContent?.includes("سایز آزمون"));assert.ok(sizeCard);const editSize=sizeCard.querySelector("button")!;await act(async()=>editSize.dispatchEvent(new dom.window.MouseEvent("click",{bubbles:true})));await settle();
const editForm=document.querySelector<HTMLFormElement>('form[aria-label="ویرایش الگوی سایز"]');assert.ok(editForm);const editText=editForm.querySelector("textarea")!;await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,"value")!.set!.call(editText,"XS، S، M، L");editText.dispatchEvent(new dom.window.Event("input",{bubbles:true}))});await click("ذخیره الگو");assert.ok(requests.some(r=>r.path==="/api/admin/size-sets/set-2"&&r.body.expected.sizes.length===3&&r.body.sizes.length===4));
const cardForMeasurements=[...document.querySelectorAll("article")].find(a=>a.textContent?.includes("سایز آزمون"))!;
await act(async()=>[...cardForMeasurements.querySelectorAll("button")].find(b=>b.textContent?.includes("جدول اندازه‌گیری"))!.click());
const measureForm=document.querySelector<HTMLFormElement>('form[aria-label="جدول اندازه‌گیری"]')!;assert.ok(measureForm);
const basis=measureForm.querySelector<HTMLSelectElement>('select[aria-label="مبنای اندازه‌گیری"]')!;
await act(async()=>{basis.value="body";basis.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
const chest=measureForm.querySelector<HTMLInputElement>('input[aria-label="دور سینه XS"]')!;
await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(chest,"۹۲٫۵");chest.dispatchEvent(new dom.window.Event("input",{bubbles:true}))});
await click("ذخیره جدول");assert.ok(requests.some(r=>r.path==="/api/admin/size-sets/set-2/measurements"&&r.body.measurements.XS.chest===92.5&&r.body.basis==="body"));
dom.window.confirm=()=>true;
const deleteButton=document.querySelector<HTMLButtonElement>('button[aria-label="حذف سایز آزمون"]')!;await act(async()=>deleteButton.click());await settle();
assert.ok(requests.some(r=>r.path==="/api/admin/size-sets/set-2/delete"&&r.body.expected.measurements.XS.chest===92.5));
await click("دسته‌بندی‌ها");
await click("افزودن دسته‌بندی");
const categoryForm=document.querySelector<HTMLFormElement>('form[aria-label="افزودن دسته‌بندی"]'); assert.ok(categoryForm);
const inputs=categoryForm.querySelectorAll<HTMLInputElement>('input:not([type="checkbox"])');
for(const [index,value] of [[0,"کیف جدید"],[1,"new-bags"],[2,"7"]] as const) await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(inputs[index],value);inputs[index].dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
const categorySize=categoryForm.querySelector<HTMLSelectElement>('select[aria-label="الگوی پیشنهادی سایز"]');assert.ok(categorySize);await act(async()=>{categorySize.value="set-1";categorySize.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
await click("ذخیره دسته‌بندی");
assert.ok(requests.some(r=>r.path==="/api/admin/categories" && r.method==="POST" && r.body.name==="کیف جدید" && r.body.slug==="new-bags" && r.body.order===7 && r.body.sizeSetId==="set-1"));
assert.ok(document.body.textContent?.includes("کیف جدید"));

await click("مرکز چاپ اسناد");
const printSelect=document.querySelector<HTMLSelectElement>('select[aria-label="انتخاب سفارش برای چاپ"]');assert.ok(printSelect);
await act(async()=>{printSelect.value="VL-1";printSelect.dispatchEvent(new dom.window.Event("change",{bubbles:true}))});
await click("دریافت پیش‌نمایش");
assert.match(document.body.textContent || "",/نشانی ثبت‌شده/);assert.match(document.body.textContent || "",/سند آزمایشی است/);assert.doesNotMatch(document.body.textContent || "",/خیابان ولیعصر/);
await click("صورت‌حساب سفارش");await click("دریافت پیش‌نمایش");
assert.match(document.body.textContent||"",/refund-1/);assert.match(document.body.textContent||"",/فاکتور رسمی یا تأیید تسویه بانکی نیست/);
let printed="";let prints=0;dom.window.print=()=>{assert.ok(document.body.classList.contains("kv-printing"));prints++;printed=document.querySelector("#kv-print-document")?.textContent||"";dom.window.dispatchEvent(new dom.window.Event("afterprint"));};
const reads=requests.filter(r=>r.path==="/api/commerce/orders/VL-1/invoice").length;
await click("بررسی مجدد و چاپ");assert.equal(prints,1);assert.ok(!document.body.classList.contains("kv-printing"));assert.match(printed,/نشانی ثبت‌شده/);assert.match(printed,/refund-1/);assert.equal(requests.filter(r=>r.path==="/api/commerce/orders/VL-1/invoice").length,reads+1);
printOrder.status="exception";await click("بررسی مجدد و چاپ");assert.equal(prints,1,"a status change after preview must stop printing");assert.match(document.body.textContent||"",/نیازمند بررسی است/);assert.ok([...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="بررسی مجدد و چاپ"&&b.disabled));assert.equal(prints,1);printOrder.status="paid";
await click("سفارش‌ها");
const trackingInput=document.querySelector<HTMLInputElement>('input[aria-label="کد رهگیری VL-1"]');
assert.ok(trackingInput,"quick tracking field is in order row");
await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(trackingInput,"POST123");trackingInput.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
await click("ذخیره");
assert.ok(requests.some(r=>r.path==="/api/commerce/admin/orders/VL-1/shipment" && r.body?.tracking==="POST123" && !("carrier" in r.body)),"tracking save preserves carrier on server");
const skuInput=document.querySelector<HTMLInputElement>('input[aria-label="SKU برداشت VL-1"]');assert.ok(skuInput);
await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(skuInput,"SKU-1");skuInput.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});
await click("ثبت یک واحد");
assert.ok(requests.some(r=>r.path==="/api/commerce/orders/VL-1/picking"&&r.body?.sku==="SKU-1"));
await click("دریافت، شمارش و اصلاح");
await click("۲. شمارش انبار (Stocktaking)");
const skuSelect=[...document.querySelectorAll("select")].find(s=>s.textContent?.includes("SKU-1"));assert.ok(skuSelect);
await act(async()=>{skuSelect.value="v-1";skuSelect.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
function field(label:string){const el=[...document.querySelectorAll("label")].find(l=>l.textContent?.includes(label))?.querySelector("input");assert.ok(el, label);return el;}
for(const [label,value] of [["تعداد فیزیکی شمارش‌شده","5"],["مرجع شمارش","COUNT-001"]] as const){const el=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});}
await click("ثبت درخواست");
assert.ok(requests.some(r=>r.path==="/api/commerce/admin/inventory/operations" && r.body?.operation==="stocktake" && r.body?.countedQty===5 && r.body?.expectedOnHand===6 && r.body?.expectedVersion),"stocktake sends snapshot and count");
await click("۱. دریافت محموله کالا (Receiving)");
const receivingSku=[...document.querySelectorAll("select")].find(s=>s.textContent?.includes("SKU-1"));assert.ok(receivingSku);
await act(async()=>{receivingSku.value="v-1";receivingSku.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
for(const [label,value] of [["تعداد پذیرفته‌شده","3"],["مرجع رسید","RECEIVE-001"]] as const){const el=field(label);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});}
await click("ثبت درخواست");
assert.ok(requests.some(r=>r.path==="/api/commerce/admin/inventory/operations" && r.body?.operation==="receive" && r.body?.expectedVersion && r.body?.acceptedQty===3),"receipt sends selected inventory version");
await click("محصولات");
await click("ایجاد محصول جدید");
const productDialog=document.querySelector<HTMLElement>('[role="dialog"][aria-label="افزودن محصول"]');assert.ok(productDialog);
const labeled=(text:string)=>{const label=[...productDialog.querySelectorAll("label")].find(l=>l.textContent?.trim().startsWith(text));assert.ok(label,text);const input=label.querySelector<HTMLInputElement>("input");assert.ok(input,text);return input;};
for (const [name,value] of [["نام","محصول آزمون"],["قیمت پایه","100"],["نام رنگ","آبی"]] as const){const input=labeled(name);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});}
const categorySelect=[...productDialog.querySelectorAll("select")].find(s=>s.textContent?.includes("انتخاب دسته فعال"));assert.ok(categorySelect);
await act(async()=>{categorySelect.value="پالتو";categorySelect.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
const productSize=productDialog.querySelector<HTMLSelectElement>('select[aria-label="انتخاب الگوی سایز محصول"]');assert.equal(productSize?.value,"set-1");await click("اعمال سایزهای الگو");assert.equal(labeled("سایزها").value,"M، L");
const imageInput=productDialog.querySelector<HTMLInputElement>('input[type="file"]');assert.ok(imageInput);
const image=new dom.window.File([new Uint8Array([1,2,3])],"item.png",{type:"image/png"});
await act(async()=>{Object.defineProperty(imageInput,"files",{value:[image],configurable:true});imageInput.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});await settle();
await click("ثبت پیش‌نویس");
assert.ok(requests.some(r=>r.path==="/api/admin/products" && r.method==="POST" && r.body.category==="پالتو" && r.body.sizes.join(",")==="M,L" && r.body.imageData?.startsWith("data:image/png;base64,")),"product draft sends selected category and actual image bytes");
await click("ویرایش");
const optionsDialog=document.querySelector<HTMLElement>('[role="dialog"][aria-label="ویرایش محصول"]');assert.ok(optionsDialog);
const changeInput=async (aria:string,value:string)=>{const el=optionsDialog.querySelector<HTMLInputElement>(`input[aria-label="${aria}"]`);assert.ok(el,aria);await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});};
await changeInput("نام رنگ جدید","آبی");await click("افزودن رنگ");
assert.ok(requests.some(r=>r.path==="/api/admin/products/p-1/options"&&r.body?.action==="add_color"&&r.body?.name==="آبی"));
assert.ok(optionsDialog.querySelector('input[aria-label="نام رنگ آبی"]'));
await changeInput("سایز جدید","L");await click("افزودن سایز");
assert.ok(requests.some(r=>r.body?.action==="add_size"&&r.body?.label==="L"));
await changeInput("نام رنگ آبی","آبی تیره");await click("ذخیره رنگ");
assert.ok(requests.some(r=>r.body?.action==="update_color"&&r.body?.expected?.name==="آبی"));
assert.ok([...optionsDialog.querySelectorAll('option')].some(option=>option.textContent==="آبی تیره"),"new color appears in the image selector");
const editField=async (label:string,value:string)=>{const el=[...optionsDialog.querySelectorAll("label")].find(l=>l.textContent?.startsWith(label))?.querySelector("input,textarea");assert.ok(el,label);await act(async()=>{const proto=el.tagName==="TEXTAREA"?dom.window.HTMLTextAreaElement.prototype:dom.window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value")!.set!.call(el,value);el.dispatchEvent(new dom.window.Event("input",{bubbles:true}));});};
await editField("قیمت مقایسه‌ای","150");await editField("جنس و پارچه","پشم");await editField("راهنمای نگهداری","خشکشویی");await editField("فرم و فیت","آزاد");await editField("محل ساخت","ایران");
await click("ذخیره تغییرات");assert.ok(requests.some(r=>r.path==="/api/admin/products/p-1"&&r.method==="PATCH"&&r.body.material==="پشم"&&r.body.care==="خشکشویی"&&r.body.fit==="آزاد"&&r.body.origin==="ایران"&&r.body.compareAt===150&&r.body.expected.price===100&&r.body.expected.material===null));
await click("دریافت، شمارش و اصلاح");
await click("تأیید");
assert.ok(requests.some(r => r.path === "/api/commerce/admin/inventory/adjustments/adj-1" && r.method === "POST" && r.body?.decision === "approve"));
await click("مرجوعی و کنترل کیفیت");
await click("کنترل کیفیت: قرنطینه");
assert.ok(requests.some(r => r.path === "/api/commerce/admin/refunds/rfd-1/qc" && r.body?.result === "defective"));
await click("گالری مشتریان و نظرات");
await click("تأیید انتشار");
assert.ok(requests.some(r => r.path === "/api/admin/gallery/gal-1" && r.method === "PATCH" && r.body?.status === "approved"));
console.log("OK inventory approval and gallery moderation requests (mock transport)");
await act(async () => root.unmount());
fixtures["/api/admin/me"] = { authenticated:true, subject:"review-owner", permissions, openAccess:true };
fixtures["/api/commerce/admin/refunds"] = [{ id:"rfd-preview", orderId:"KV-2", orderLineId:"line-2", quantity:1, amount:100, kind:"return", status:"requested", reason:"سایز", requestedBy:"customer", note:"", createdAt:new Date().toISOString() }];
const secondRoot = createRoot(document.getElementById("root")!);
await act(async () => secondRoot.render(React.createElement(Dashboard))); await settle();
await click("سفارش‌ها و مرجوعی"); await click("مرجوعی و کنترل کیفیت");
assert.ok([...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="تأیید درخواست"), "review owner sees protected decision");
assert.ok(!document.body.textContent?.includes("رمز مدیر محافظت‌شده"));
await act(async () => secondRoot.unmount());
dom.window.close();

}
main().catch(err => { console.error(err); process.exitCode = 1; });
