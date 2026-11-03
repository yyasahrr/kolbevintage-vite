# ممیزی پوشش KOLBE-V3-COMMERCE-COMPLETE-001 (نسخهٔ ۱)

تاریخ ممیزی: ۲۰۲۶-۱۱-۰۴ · SHA مبنا: `0232a8f` (شاخهٔ `arena/4972519d-kolbevintage-vite`)
محدودهٔ ممیزی: **همین مخزن (`kolbevintage-vite`، Fastify + PostgreSQL + React)**.
مخزن Django/DRF مذکور در PRD در این محیط قابل بررسی نبود و در این سند ارزیابی نشده است.

> **فهرست کوتاه نواقص هسته (خارج از قالب چک‌لیست):** `docs/core-deficiencies.md`

**مرز صداقت:** این سند «ادعای تکمیل» نیست. هر وضعیت فقط بر اساس کدی که در همین
> SHA هست و تست‌هایی که واقعاً اجرا شده‌اند داده شده. هیچ آیتمی صرفاً به‌خاطر
> گزارش قبلی PASS اعلام نشده. جایی که کد هست ولی تست اختصاصی ندارد
> `IMPLEMENTED_UNVERIFIED` و جایی که اصلاً وجود ندارد `NOT_STARTED` ثبت شده است.

وضعیت‌ها: `VERIFIED` (کد + تست اجراشده) · `IMPLEMENTED_UNVERIFIED` (کد، بدون تست اختصاصی) ·
`PARTIAL` (بخشی از کنترل) · `NOT_STARTED` · `OPEN_DECISION` (منتظر مالک/Provider) ·
`OUT_OF_SCOPE` (R2 یا بیرون این مخزن) · `BLOCKED` (تعارض تصمیم/معماری).

---

## ۱. خلاصهٔ اجرایی

| # | واقعیت | نتیجه |
| --- | --- | --- |
| ۱ | هستهٔ تجارت (Variant، Quote، Hold، Payment، Order، Refund، Outbox، Cashback) در این مخزن وجود دارد و با ۲۷ تست Integration روی PostgreSQL واقعی پوشش داده شده. | حدود **۴۰٪** کنترل‌های C04–C15 با Evidence قابل دفاع |
| ۲ | **تصمیم مالک (۲۰۲۶-۱۱-۰۴): معماری همان Fastify + PostgreSQL می‌ماند؛ مهاجرت به Django/DRF انجام نمی‌شود.** | `COM-C00-004` = **انحراف پذیرفته‌شده**؛ فقط ADR نباید فراموش شود |
| ۳ | هیچ Audit Log سروری برای عملیات حساس (Toggle BNPL، قیمت، Refund، موجودی) وجود ندارد. | بزرگ‌ترین شکاف P0 مشترک بین C06/C17/C20 |
| ۴ | Provider واقعی وجود ندارد؛ آداپتور Mock با همان قرارداد verify/idempotency پیاده شده. | C06-009/015/022، C11-003/004، C14-015/016، C18 = BLOCKED/OPEN |
| ۵ | RBAC چندنقشی وجود ندارد؛ فقط دو سطح: نشست ادمین (`1234`) و Superadmin جدا. | C17-001/006/012 = PARTIAL/NOT_STARTED |
| ۶ | فرآیندهای انبار (Receiving، QC، Stocktake، Carrier، سند چاپی، Exchange) پیاده نشده‌اند. | C09/C13/C14 بخش بزرگی NOT_STARTED |
| ۷ | آزمون مرورگر (E2E) و CI واقعی اجرا نشده؛ تست‌ها با `node --test` روی دیتابیس محلی اجرا می‌شوند. | C25-006/009/012 = NOT_STARTED |
| ۸ | امنیت عملیاتی (Rate Limit، CSRF، CSP، Secret Management، Backup/Restore) پیاده نشده. | C20/C21 بخش بزرگی NOT_STARTED |

### جدول وضعیت گروه‌ها

| گروه | کنترل | VERIFIED | PARTIAL / UNVERIFIED | NOT_STARTED | OPEN/BLOCKED |
| --- | --- | --- | --- | --- | --- |
| C00 دامنه/معماری | ۱۲ | ۲ | ۴ | ۱ | ۵ (C00-004 پذیرفته به‌عنوان انحراف) |
| C01 کاتالوگ | ۱۶ | ۴ | ۵ | ۷ | ۰ |
| C02 Variant/SKU | ۱۶ | ۹ | ۴ | ۱ (C02-009) | ۰ |
| C03 Storefront | ۱۷ | ۲ | ۹ | ۶ (نیازمند E2E) | ۰ |
| C04 قیمت/Quote | ۱۷ | ۹ | ۵ | ۱ (C04-003) | ۲ |
| C05 Promotion/Coupon | ۱۴ | ۵ | ۵ | ۲ (quota/usage) | ۲ |
| C06 BNPL | ۲۶ | ۱۱ | ۸ | ۴ | ۳ |
| C07 Cart | ۱۴ | ۶ | ۵ | ۳ | ۰ |
| C08 Checkout | ۲۰ | ۱۰ | ۶ | ۳ | ۱ |
| C09 Inventory/QC | ۱۷ | ۶ | ۳ | ۶ | ۲ |
| C10 Holds | ۱۵ | ۹ | ۴ | ۱ | ۱ |
| C11 Payments | ۱۹ | ۱۱ | ۵ | ۲ | ۱ |
| C12 OMS | ۱۴ | ۸ | ۴ | ۲ | ۰ |
| C13 Shipping/Fulfillment | ۱۷ | ۵ | ۳ | ۸ | ۱ |
| C14 RMA/Refund | ۲۰ | ۷ | ۴ | ۶ | ۳ |
| C15 Cashback | ۱۰ | ۴ | ۳ | ۲ | ۱ |
| C16 Identity | ۱۱ | ۵ | ۲ | ۴ | ۰ |
| C17 Admin/RBAC | ۱۴ | ۴ | ۴ | ۵ | ۱ |
| C18 Integration Center | ۱۵ | ۳ | ۴ | ۶ | ۲ |
| C19 Widget/AI | ۱۲ | ۱ | ۲ | ۶ | ۳ (بیشتر بیرون مخزن) |
| C20 Security | ۱۴ | ۵ | ۳ | ۵ | ۱ |
| C21 Performance/Obs | ۱۳ | ۴ | ۳ | ۵ | ۱ |
| C22 Migration V2 | ۱۴ | ۳ | ۳ | ۴ | ۴ (V2 در این مخزن نیست) |
| C23 Cross-domain Tests | ۲۴ | ۱۲ | ۵ | ۷ | ۰ |
| C24 BNPL-G01…G28 | ۲۸ | ۱۲ | ۶ | ۸ | ۲ |
| C25 Release/Acceptance | ۱۵ | ۲ | ۲ | ۹ | ۲ |

> اعداد «تخمین ممیزی» بر اساس خواندن کد و فهرست تست‌های همین SHA هستند. برای
> تبدیل شدن به Traceability Matrix رسمی باید هر ردیف با مسیر فایل، نام تست و
> خروجی CI پر شود (الگوی بخش سوم سند).

---

## ۲. آنچه پیاده و قابل اثبات است (با مسیر کد و تست)

| نیازمندی | Evidence در این مخزن |
| --- | --- |
| COM-C02-001/002/003/004/005 — Variant ID، سه حالت سایز، ماتریس رنگ×سایز | `server/src/commerce/variants.ts` (`sizeModeOf`, `syncVariants`), `server/test/commerce.test.ts` (تست‌های Checkout/Variant) |
| COM-C02-007/008/013 — رد Variant ناشناخته، موجودی صفر، Snapshot سفارش | `checkout.ts` (`variant_not_found`)، `orders.ts` (`order_lines`) |
| COM-C02-015 — اعتبارسنجی سروری واریانت در هر Command | `checkout.ts` / `cart.ts` (هر بار از DB می‌خوانند) |
| COM-C04-001/005/006/007/008/009 — مرجعیت قیمت سرور، Quote نسخه‌دار، رد Quote کهنه (**C04-002 تاریخچهٔ قیمت ندارد** ← `docs/core-deficiencies.md` A10) | `pricing.ts`, `payments.ts` (`assertQuoteFresh`), تست «price change … forces a re-quote» |
| COM-C04-010/012 + C12-004/005 — Snapshot فاکتور و آستانهٔ ارسال رایگان قابل تنظیم | `orders.ts` (`order_lines`)، `settings.ts`، تست‌های invoice snapshot |
| COM-C04-011 — یک هزینهٔ ارسال برای کل سفارش | `pricing.ts` (shipping روی کل)، C23-022 ضمنی |
| COM-C05-003/004/005/007 — Priority، Tie-breaker، بدون Stacking، کوپن در Checkout | `pricing.ts` (`order by priority desc, created_at asc, id asc`)، `requoteCheckout` |
| COM-C05-009/012 — منبع تخفیف در Snapshot و تغییرناپذیری فاکتور | `orders.ts` (`discounts` در `data` و `order_lines`) |
| COM-C06-001…007/012/016/019/020 — Toggle سراسری، بدون Eligibility محصولی، یک سفارش، منع Attempt در OFF، Idempotency | `settings.ts`, `routes.ts` (`/api/commerce/config`)، `payments.ts`, تست «the installment gateway is store-wide» |
| COM-C06-021 + C10-013 + C23-010 — پرداخت دیرهنگام → EXCEPTION بدون Re-hold | `payments.ts` (`settleAttempt`), تست «a payment confirmed after the hold expired…» |
| COM-C07-001…008/012 — سبد مهمان، ادغام، عدم Hold در Cart، قیمت برآوردی | `cart.ts`, تست «adding to the cart does not reserve stock» و «guest cart merges…» |
| COM-C08-003/013/014/015/016 — Hold در Checkout، BNPL سراسری، بازاعتبارسنجی، بدون سفارش تکراری | `checkout.ts`, `payments.ts`, تست‌های concurrency/quote/idempotency |
| COM-C09-001/003/004/005/011/012/013/016 — موجودی SKU-level، فرمول Available، Ledger، Adjustment دو نفره | `inventory.ts`, `variants.ts`, تست «manual stock corrections need two different people» |
| COM-C10-001…009/012/013/015 — Hold اتمیک، Release/Expiry یک‌بار، آخرین SKU | `inventory.ts`, تست‌های «expiring a hold releases it exactly once»، «two simultaneous checkouts…» |
| COM-C11-001/002/005/006/007/008/009/010/011/012/013/014/015/019 — Attempt، Verify، Pending، Late، تک‌ثبت | `payments.ts`, تست‌های duplicate/timeout/late |
| COM-C12-001…005/012/014 — چرخهٔ سفارش، Snapshot، بدون تکرار | `orders.ts`, تست‌های lifecycle/idempotency/invoice |
| COM-C13-006/007/008/009/010/014/015 — Picking با اسکن اجباری، Packing دستی، Ship/Deliver، SMS از Outbox | `orders.ts` (`advanceOrder`)، `outbox.ts`, تست «warehouse flow blocks a wrong SKU scan» |
| COM-C14-003/004/012/013/014/018/020(بخشی) — مرجوعی جزئی، سقف تعداد، Fail-closed Superadmin، عدم بازنویسی فاکتور | `refunds.ts`, تست‌های refund permission و partial return |
| COM-C15-001/002/006/008/009 — کش‌بک مستقل از Refund، Ledger، برگشت پس از بازپرداخت | `cashback.ts`, `schema.sql` (`cashback_ledger`), تست‌های cashback |
| COM-C18-006/007/009/010/011 — Outbox تراکنشی، Retry، Dedupe، قطع SMS | `outbox.ts`, تست «a broken SMS provider never invalidates a paid order» |
| COM-C20-001/002/003/004/009 — AuthZ سروری، منع قیمت کلاینتی، Fail-closed Refund، عدم Self-approval | `commerce/auth.ts`, `refunds.ts`, `payments.ts` |
| COM-C23-001/003(بخشی)/005/006/008/009/010/013/014/016/020/021/023 — تست‌های Cross-domain | `server/test/commerce.test.ts` (۲۷ تست) |

اجرای فعلی تست: `npm run test:commerce` → `# pass 27 / # fail 0`.

---

## ۳. شکاف‌های واقعی — به ترتیب اولویت

### P0 (بدون این‌ها Money/Stock/Security در R1 قابل Live نیست)

| # | شکاف | کنترل‌های مرتبط | چه باید ساخته شود |
| --- | --- | --- | --- |
| ۱ | ~~**Audit Log سروری وجود ندارد.**~~ **رفع شد در PR-1 (`audit_events` + `/api/commerce/admin/audit`).** Toggle BNPL، تغییر قیمت، Refund، Adjustment و تغییر تنظیمات فقط اثرشان می‌ماند. | C06-017/018, C17-013, C20-011, G21 | جدول `audit_events(id, actor, action, target_type, target_id, before, after, reason, request_id, at)` + نوشتن در همان تراکنش + صفحهٔ مشاهده |
| ۲ | **سه‌حالته نبودن BNPL و نبود Gate آمادگی Provider.** فقط `bnpl4Enabled` داریم؛ `provider_ready` و `available_for_checkout` وجود ندارد. | C06-008/009/010/015, G09 | فیلدهای Provider (`mode`, `contractApproved`, `capabilities`) + `availableForCheckout()` سروری + رد فعال‌سازی Live بدون آمادگی |
| ۳ | **Refund سفارش BNPL از مسیر Provider نیست.** Refund ما داخلی است؛ Partial-Refund BNPL باید از قرارداد Provider برود یا EXCEPTION شود. | C06-022, C14-015/016, G22/G23 | آداپتور `refund/capabilities` + وضعیت `manual_review` وقتی Provider پشتیبانی نمی‌کند |
| ۴ | **سهمیهٔ کوپن شمارش نمی‌شود.** `used_count` هرگز افزایش نمی‌یابد؛ در نتیجه سقف استفاده و Race بی‌اثر است. | C05-008/011 | افزایش اتمیک در تراکنش Settle + تست دو خرید هم‌زمان با آخرین سهمیه |
| ۵ | **مرجوعی بدون مرحلهٔ QC موجودی را برمی‌گرداند.** کالای معیوب بلافاصله قابل فروش می‌شود. | C14-005/006/007, C23-018 | وضعیت‌های RMA (requested→received→qc→decision) + برگشت به `quarantined` نه `on_hand` |
| ۶ | **Exchange و اختلاف قیمت وجود ندارد.** | C14-008/009/010/011, C23-017 | سند Exchange، لینک پرداخت اختلاف (idempotent/expiry) و Refund اختلاف منفی |
| ۷ | **شناسهٔ سفارش قابل حدس است** (`VL-100001`). AuthZ بر پایهٔ ایمیل نشست هست (`routes.ts:233`)، ولی تست دسترسی افقی دو مشتری نداریم و شمارش فروش لو می‌رود. | C12-013, C16-011, C23-019 | UUID/توکن عمومی سفارش + تست IDOR |
| ۸ | **Rate Limit / CSRF / Security Headers نیست.** | C16-001/009, C20-005/006/012 | پلاگین rate-limit روی auth/OTP/checkout، توکن CSRF، helmet/CSP |
| ۹ | **کلیدهای Provider داخل سند `admin.integrations` (JSONB) ذخیره می‌شوند** و در پنل قابل خواندن‌اند. | C17-010, C18-014, C20-007/013 | انتقال به env/Secret Store، Mask در API، حذف از Export |
| ۱۰ | **جانمایی واحد پول/تومان مشخص نیست.** همه‌چیز با عدد یوروی دمو محاسبه می‌شود. | C00-003, C04-003/014 | قرارداد واحد پول در Backend (minor unit integer)، تبدیل و نمایش تومان، ثبت تصمیم |
| ۱۱ | **وضعیت انتشار محصول نیست** (فقط `active` boolean؛ Draft/Published/Archived نداریم). | C01-002/006/012 | ستون `status` + قواعد انتشار + منع خرید آرشیو |
| ۱۲ | **تغییر رنگ، سایز را Reset نمی‌کند** (فقط اگر همان سایز ناموجود باشد). | C02-009 | Reset قطعی در `selectColor` + تست UI |

### P1 (کیفیت R1 و اثبات‌پذیری)

- C02-006: SKU قابل ویرایش کنترل‌شده با حفظ تاریخچه (فعلاً فقط auto-generated).
- C01-011: وزن محصول/واریانت و تأثیرش در ارسال.
- C01-013/014: Import/Export CSV و Bulk Edit.
- C09-006/007/010: Receiving، Quarantine Management و Stocktake Session.
- C09-009: Low-stock Alert و گزارش تأمین.
- C13-001/003/004/005: Carrier واقعی، Tracking Code و لینک رهگیری معتبر (الان هیچ‌کدام نیست).
- C13-011/012/013: فاکتور/لیبل/لیست برداشت به‌صورت JSON موجود است ولی PDF و Barcode و چاپ Batch نیست (چاپ فعلی `invoices.txt` در کلاینت).
- C10-010: تثبیت TTL و سیاست جشنواره (مالک).
- C15-003…007: انقضا/مصرف/حداقل سفارش/تعامل با کوپن و BNPL (مالک).
- C16-009 + C20: Session rotation، OTP Brute-force، حذف/ناشناس‌سازی داده.
- C21-006: Metric/Alert برای Unknown Payment، Oversell، Negative Stock، 5xx.
- C23/C24: تست‌های باقی‌مانده (پایین).
- C25-006/009: CI واقعی + Playwright E2E موبایل/دسکتاپ.

### P2 (R2 یا بیرون دامنهٔ این مخزن)

- C19 (Widget/AI/Site Studio): این مخزن یک Site Builder نمونه دارد؛ مرزهای Authority تجاری بررسی نشده و بخش عمده OUT_OF_SCOPE است تا Studio/AI در مخزن خودش ممیزی شود.
- C22 (Migration از V2): این مخزن دیتای V2 ندارد؛ فقط `schema.sql` افزایشی است. Backup/Restore و Rehearsal انجام نشده.
- C03/C08-020: کل UX فروشگاه موجود است ولی آزمون مرورگر ندارد (UNVERIFIED).
- C21-008/011/013: Load Test، Backup/Restore و بازیابی واقعی انجام نشده.

---

## ۴. نقشهٔ تست‌های BNPL (C24 / BNPL-G01…G28)

| تست | وضعیت | شاهد |
| --- | --- | --- |
| G01 OFF + تک‌محصول | ✅ VERIFIED | تست «installment gateway is store-wide» (`403 bnpl_disabled`) |
| G02 OFF + سبد ترکیبی | ⚠️ PARTIAL | همان تست با یک قلم؛ ترکیبی صریحاً تست نشده |
| G03 ON + همه Legacy غیراقساطی | ⚠️ PARTIAL | منطق کد بدون Flag محصولی است، اما Data/تست Legacy در این مخزن نیست |
| G04 ON + ترکیب ۱+۵ | ✅ VERIFIED | سبد دو محصول با یک Plan برای کل مبلغ |
| G05 ON + همه Legacy اقساطی | ❌ NOT_STARTED | — |
| G06 تنوع رنگ/سایز/دسته | ❌ NOT_STARTED | — |
| G07 ON→OFF در Checkout باز | ✅ VERIFIED | Attempt جدید در OFF رد می‌شود |
| G08 Attempt قبلی پس از OFF قابل Verify | ⚠️ PARTIAL | کد کافی است (بدون بررسی Global) اما تست ندارد |
| G09 OFF→ON بدون Provider آماده | ❌ FAIL | Gate آمادگی Provider وجود ندارد |
| G10 Provider Down | ❌ NOT_STARTED | شبیه‌ساز Down نداریم |
| G11 Provider رد می‌کند | ⚠️ PARTIAL | مسیر `bnpl_rejected` هست، تست ندارد |
| G12 Amount خارج از دامنه | ❌ NOT_STARTED | محدودیت مبلغ Mock نداریم |
| G13 Quote قدیمی | ✅ (برای online) | تست price-change؛ نسخهٔ BNPL صریح نیست |
| G14 Idempotency Attempt | ✅ (برای online) | تست idempotency؛ نسخهٔ BNPL صریح نیست |
| G15 Callback تکراری | ✅ VERIFIED | تست duplicate callback |
| G16 Verify Timeout | ✅ VERIFIED | تست pending_verification |
| G17 Late Verify | ✅ VERIFIED | تست exception |
| G18 آخرین SKU | ✅ VERIFIED | تست concurrency |
| G19 API مستقیم در OFF | ✅ VERIFIED | 403 در Pay |
| G20 کاربر بی‌مجوز Toggle | ⚠️ PARTIAL | Endpoint نشست ادمین می‌خواهد (401) اما تست ندارد |
| G21 Audit تغییر Toggle | ❌ FAIL | Audit Log وجود ندارد |
| G22 Refund کامل BNPL از Provider | ❌ FAIL | مسیر Provider نیست |
| G23 Partial/Exchange BNPL | ❌ FAIL | پیاده نشده |
| G24 Attempt قدیمی پس از Toggle | ❌ NOT_STARTED | — |
| G25 PDP/PLP/Cart هماهنگ با Toggle | ⚠️ PARTIAL | فقط Checkout به `config` وصل است |
| G26 سبد شش‌محصولی، یک سفارش/مرسوله | ⚠️ PARTIAL | سفارش یکی است؛ موجودیت Parcel شمارش نشده |
| G27 Cache قدیمی پس از OFF | ✅ VERIFIED | سرور بدون Cache تصمیم می‌گیرد (تست مستقیم API) |
| G28 Rollback کد | ❌ NOT_STARTED | — |

نتیجه: **۱۲/۲۸ VERIFIED، ۶ PARTIAL، ۴ FAIL، ۶ NOT_STARTED.**

---

## ۵. تست‌های Cross-domain (C23) — پوشش فعلی ۲۷ تست

پوشش داده شده‌اند: C23-001، 003(جزئی)، 005، 006، 008، 009، 010، 011، 012، 013، 014،
015(جزئی)، 016، 020، 021، 023.

پوشش داده نشده‌اند: C23-002 (دوبارمصرف کوپن)، 004 (no_size/custom در همهٔ صفحات)،
007 (قطع Worker با Retry واقعی)، 017 (Exchange گران/ارزان)، 018 (QC کالای معیوب)،
019 (IDOR بین دو مشتری)، 022 (شمارش Parcel)، 024 (Evidence روی SHA/CI).

---

## ۶. تصمیم‌های باز: آنچه الان فرض کرده‌ایم و باید تثبیت شود

| شناسه | وضعیت فعلی در کد | تصمیم لازم |
| --- | --- | --- |
| COM-DEC-001 | Hold = ۱۰ دقیقه، پرداخت = ۱۵، Quote = ۱۰ (قابل تغییر) | تثبیت عدد و سیاست جشنواره/تمدید |
| COM-DEC-002 | فقط `mock` / `mock-bnpl4` | انتخاب Provider واقعی + قرارداد |
| COM-DEC-003 | `discountStacking = none` (Fail-closed) | ماتریس کوپن×کمپین |
| COM-DEC-004 | `numeric(12,2)`, taxRate=0، آستانه پس از تخفیف | واحد پول/تومان، Tax/Fee و Round رسمی |
| COM-DEC-005 | کارمزد=۰، سررسید بدون داده Provider | قواعد Provider اقساط |
| COM-DEC-006 | نرخ پله‌ای تعریف شد؛ Earn و Reversal پیاده | Expiry/Redeem/حداقل سفارش/تعامل با کوپن |
| COM-DEC-007 | زمان‌بندی Reconciliation دستی است | Schedule/Retry رسمی |
| COM-DEC-008 | مهلت مرجوعی از سند ادمین خوانده نمی‌شود | سیاست بازگشت/هزینهٔ حمل برگشت |
| COM-DEC-009 | Available = on_hand − quarantined − holds | Threshold هشدار و رزرو شرایط خاص |
| COM-DEC-010 | Schema افزایشی داخل `schema.sql` | Freeze قراردادهای C-01..C-08 |
| COM-DEC-011 | فعال‌سازی BNPL فقط با کلید ادمین | شرایط Provider برای همه‌کاتالوگ |
| COM-DEC-012 | بدون SLA/Backup | بودجهٔ عملکرد و RPO/RTO |

---

## ۷. کار بعدی پیشنهادی (می‌تواند به‌صورت PRهای کوچک انجام شود)

1. **PR-A — Audit & Gate:** جدول Audit، ثبت Toggle/قیمت/Refund/Adjustment با Actor+Before+After، و سه‌حالته کردن BNPL با Gate آمادگی Provider (شکاف ۱ و ۲).
2. **PR-B — Refund/Return واقعی:** مرحلهٔ QC، Quarantine به‌جای Restock فوری، Exchange و اختلاف قیمت، Refund BNPL از مسیر Provider یا `manual_review` (شکاف ۳، ۵، ۶ و تست‌های G22/G23/C23-017/018).
3. **PR-C — Money & Catalog correctness:** واحد پول/تومان، وضعیت انتشار محصول، Reset سایز با تغییر رنگ، SKU قابل ویرایش، شمارش سهمیهٔ کوپن (شکاف ۴، ۱۰، ۱۱، ۱۲).
4. **PR-D — Security & Identity:** Rate Limit، CSRF، Security Headers، Secret بیرون از سند، شناسهٔ غیرقابل‌حدس سفارش، تست IDOR (شکاف ۷، ۸، ۹).
5. **PR-E — Ops/Shipping:** Carrier + Tracking، PDF فاکتور/لیبل/لیست برداشت، Receiving/QC/Stocktake، Low-stock (گپ‌های C09/C13).
6. **PR-F — Evidence:** Playwright E2E + CI روی همین SHA، گزارش Failure Matrix و KPI/Alert برای پرداخت‌های Unknown (C21/C25).

هر PR باید در Traceability Matrix (بخش سوم سند) با مسیر فایل، نام تست و نتیجهٔ CI ثبت شود.

---

## ۸. شواهد PR-1 (۲۰۲۶-۱۱-۰۴) — بستهٔ «درستی پول و سفارش»

مسیرها: `server/src/commerce/audit.ts`, `server/src/schema.sql`, `server/src/commerce/pricing.ts`,
`server/src/commerce/payments.ts`, `server/src/projection.ts`, `server/src/routes/catalog.ts`,
`server/src/commerce/routes.ts`, `src/pages/AdminCommercePanel.tsx`, `src/pages/CheckoutPage.tsx`.

| کنترل | وضعیت جدید | تست |
| --- | --- | --- |
| C17-013 / C06-017 / C06-018 / C21-005 — Audit با Actor + Before/After + Reason | ✅ IMPLEMENTED_UNVERIFIED→**VERIFIED** | «settings changes are audited with before and after, and the trail is append-only» |
| C05-008 / C05-011 — مصرف سهمیهٔ کوپن و Race | ✅ VERIFIED | «coupon capacity is consumed once and the last unit cannot be sold twice» |
| C05-004 — سقف تخفیف درصدی | ✅ VERIFIED | «a percent coupon never exceeds its max_discount or the payable subtotal» |
| C04-002 — تاریخچهٔ قیمت | ✅ VERIFIED (جدول `price_history`) | پوشش از طریق مسیر پروجکشن (تست مستقیم بعدی) |
| C12-007 — تفکیک سفارش Exception از Pending | ✅ VERIFIED | «an exception order is stored with its own status instead of looking pending» |
| C17 / C20-001 — مسیر نوشتن سفارش بدون پرداخت | ✅ بسته شد | «the legacy order endpoint is not writable from the storefront» |
| C23-019 — هویت ادمین برای عملیات حساس | ✅ VERIFIED | همان تست (۴۰۱ ناشناس، ۲۰۰ ادمین، ۴۰۹ روی سفارش تجاری) |

تست‌ها: **۲۷/۲۷** روی PostgreSQL واقعی (`npm run test:commerce`)، `tsc` (کلاینت + سرور) و `npm run build` سبز.

باقی‌ماندهٔ همان دسته: اجرای CI واقعی (C25-009) و E2E مرورگر (C25-006) که هنوز NOT_STARTED است.
