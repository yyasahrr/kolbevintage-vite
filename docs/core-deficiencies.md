# نواقص هستهٔ تجارت — ممیزی کد (۲۰۲۶-۱۱-۰۴)

مبنا: `0232a8f` · شاخهٔ `arena/4972519d-kolbevintage-vite`
قلمرو: فقط همین مخزن (Fastify + PostgreSQL + React). **تصمیم مالک: معماری همین می‌ماند؛ مهاجرت به Django/DRF منتفی است** — بنابراین `COM-C00-004` از «BLOCKED» به «انحراف پذیرفته‌شده (ADR لازم)» تبدیل می‌شود.

این سند فقط چیزهایی است که در کد **اشکال دارد یا نیست**؛ فهرست کامل ۲۴+۲ گروه در
`docs/commerce-coverage-audit.md` است.

---

## الف) باگ/رفتار غلط فعلی (کد هست، ولی کار را اشتباه انجام می‌دهد)

| # | نقص | شاهد در کد | اثر تجاری | وضعیت |
| --- | --- | --- | --- | --- |
| A1 | **سهمیهٔ کوپن هیچ‌وقت شمارش نمی‌شود.** `used_count` فقط خوانده می‌شود؛ در سراسر `server/src` هیچ `update coupons ... used_count` وجود ندارد. | `commerce/pricing.ts:197` (فقط مقایسه) | کد تخفیف بی‌نهایت بار قابل استفاده است؛ «ظرفیت» بی‌معنا | ✅ **رفع شد (PR-1)** — مصرف سهمیه در همان تراکنش تسویه، با `update … where used_count < usage_limit`. |
| A2 | **درصد کوپن سقف ندارد.** `value` درصد روی `subtotal − campaignDiscount` اعمال می‌شود بدون `max_discount`. | `commerce/pricing.ts:219` | کوپن ۱۰۰٪ = سفارش صفر تومان | ✅ **رفع شد (PR-1)** — ستون `coupons.max_discount` + clamp به مبلغ قابل پرداخت. |
| A3 | **شرط حداقل خرید روی مبلغ قبل از کمپین سنجیده می‌شود** ولی تخفیف روی مبلغ بعد از کمپین محاسبه می‌شود. | `pricing.ts:202` vs `:219` | ناسازگاری قابل سوءاستفاده در کمپین هم‌زمان | ✅ **رفع شد (PR-1)** — حداقل خرید روی `subtotal − campaignDiscount` سنجیده می‌شود. |
| A4 | **مرجوعی مستقیماً به موجودی قابل‌فروش برمی‌گردد.** بدون مرحلهٔ دریافت/QC. | `commerce/refunds.ts:183` (`on_hand = on_hand + qty`) | کالای معیوب/اشتباه دوباره فروخته می‌شود | ✅ **رفع شد (PR-4)** — مرجوعی مرحله‌ای: تأیید پول/موجودی را جابه‌جا نمی‌کند؛ `received` → `qc` (سالم → موجودی، معیوب → قرنطینه) → `settle`. |
| A5 | **سفارش EXCEPTION در پنل ادمین مثل «pending» دیده می‌شود.** | `commerce/orders.ts:26` (`exception: "pending"`) | سفارش دارای اختلاف پرداخت در صف عادی انبار گم می‌شود | ✅ **رفع شد (PR-1)** — `exception` دیگر به `pending` نگاشت نمی‌شود و فیلتر خودش را دارد. |
| A6 | **مسیر سفارش‌سازی قدیمی هنوز فعال است** و CheckoutPage بعد از پرداخت موفق آن را هم صدا می‌زند. | `src/pages/CheckoutPage.tsx:166` → `POST /api/orders` (`server/src/routes/catalog.ts:130`) | سفارش تکراری؛ ردیفی که نه پرداخت دارد نه رزرو/خط سفارش | ✅ **رفع شد (PR-1)** — فراخوانی قدیمی از CheckoutPage حذف شد؛ `POST /api/orders` نشست ادمین واقعی می‌خواهد و در Audit ثبت می‌شود؛ Fallback محلی هم Fail-closed شد. |
| A7 | **سفارش‌های `pending_payment` رهاشده پاک نمی‌شوند.** فقط Reservation و Attempt منقضی می‌شوند. | `server/src/index.ts:113` (sweeper فقط دو تابع) | انباشت سفارش‌های مرده در پنل و گزارش فروش | ✅ **باطل شد** — سفارش فقط در لحظهٔ تسویه ساخته می‌شود؛ سفارش `pending_payment` رهاشده وجود ندارد (باگ واقعی، مسیر نوشتن آزاد A6 بود). |
| A8 | **بازپرداخت، پول را جابه‌جا نمی‌کند.** رکورد `settled` می‌شود، موجودی و کش‌بک اصلاح می‌شود، ولی هیچ فراخوانی Provider/درگاه نیست؛ برای BNPL هم همین‌طور. | `commerce/refunds.ts:120-215` | «بازپرداخت‌شده» بدون بازپرداخت واقعی | ◑ **نیمه‌رفع (PR-4)** — تسویه بر اساس `ProviderCapabilities.refund/partialRefund` انجام می‌شود؛ Provider بدون قابلیت → `manual_review` (بدون ادعای بازپرداخت) و ردیف سفارش بسته نمی‌شود. آداپتور واقعی درگاه هنوز موضوع تصمیم مالک است. |
| A9 | **تغییر رنگ، سایز را ریست نمی‌کند** (فقط وقتی سایز جدید ناموجود باشد عوض می‌شود). | `src/pages/ProductPage.tsx:84-90` | کاربر سایز رنگ قبلی را ناخواسته اضافه می‌کند | — باز |
| A10 | **تاریخچهٔ قیمت وجود ندارد.** ستون قیمت روی `products` است و هر تغییر فقط همان‌جا نوشته می‌شود؛ جدول/نسخه‌ای برای قیمت قبلی نیست. | `server/src/schema.sql:25`، بدون `price_history` | نمی‌توان «قیمت در زمان سفارش» را در سطح کاتالوگ اثبات کرد (فقط Snapshot سفارش هست) | ✅ **رفع شد (PR-1)** — جدول `price_history` + `audit_events` روی هر تغییر قیمت کاتالوگ. |
| A11 | **Callback پرداخت بدون امضا/راز مشترک** پردازش می‌شود؛ فقط شناسهٔ Attempt در URL و نتیجه در Body. | `commerce/payments.ts` (`handleCallback`), `routes.ts:203` | با واقعی‌شدن درگاه، امکان جعل Callback | ✅ **رفع شد (PR-4)** — HMAC-SHA256 روی `attemptId:JSON(body)` + `timingSafeEqual`؛ `requireCallbackSignature` پیش‌فرض روشن؛ بدون امضا → `401 invalid_callback_signature`. |
| A12 | **`/simulate` بدون نشست** قابل فراخوانی است؛ فقط با دو شرط `allowMockControls` و `!isProd` بسته می‌شود. | `commerce/payments.ts:511`, `routes.ts:199` | یک Flag اشتباه در محیط غیرProd = پرداخت جعلی | ✅ **رفع شد (PR-4)** — علاوه بر `allowMockControls`/غیرProd، فقط صاحب همان Checkout (کوکی `kv_checkout`) یا ادمین مجاز است → `403 simulate_forbidden`. |
| A13 | ~~کش‌بک فقط جمع می‌شود و خرج نمی‌شود~~ | `commerce/cashback.ts` | بدهی انباشته بدون راه تسویه | ✅ **رفع شد (PR-2)** — `redeemCashback` + سقف ۵۰٪ مبلغ کالا + غیرقابل برداشت |
| A14 | ~~کش‌بک در لحظهٔ پرداخت واریز می‌شود~~ | `commerce/payments.ts` | واریز + مرجوعی → ماندهٔ منفی | ✅ **رفع شد (PR-2)** — آزادسازی پس از تحویل + مهلت مرجوعی (`available_at`/`pending`) |
| A15 | **کلیدهای Provider داخل JSONB سند `admin.integrations`** ذخیره و به پنل برگردانده می‌شوند. | `src/state/admin.ts` + `routes/catalog.ts` | لو رفتن Secret از طریق پنل/Export | ◑ **نیمه‌رفع (PR-4)** — هیچ مسیر API کلید را برنمی‌گرداند: Bootstrap مهمان `integrations` را به `enabled/mode/provider` محدود می‌کند، ادمین هر کلید حساس را `***` می‌بیند، `ops.security.passcode` پاک می‌شود و `PUT /api/state/:key` نشست ادمین می‌خواهد. خودِ سند JSONB هنوز محل نگهداری راز است (انتقال به Secret Store = تصمیم باز مالک). |
| A16 | **هیچ UI برای Picking / Packing / Ship / Deliver / Refund نیست** — Endpointها هست، دکمه‌ای در ادمین نیست. | grep در `src/` برای picking / ship / deliver → خالی | Supervisor نمی‌تواند از پنل سفارش را جلو ببرد | ✅ **رفع شد (PR-1)** — پنل «سفارش‌های سرور» با برداشت/بسته‌بندی/ارسال/تحویل/لغو + «ردپای تغییرات». |

## ب) چیزهایی که برای «هسته» وجود ندارند (نه باگ، بلکه نبود)

| # | نقص | کنترل |
| --- | --- | --- |
| B1 | **Audit Log** (Actor + Before/After + Reason + RequestId) برای Toggle BNPL، قیمت، Refund، Adjustment، تنظیمات | C06-017/018, C17-013 |
| B2 | **BNPL سه‌حالته + Gate آمادگی Provider**؛ الان فقط یک Boolean سراسری است | C06-008/009/015 |
| B3 | **Exchange و لینک پرداخت اختلاف قیمت** | C14-008/009/010 |
| B4 | **Rate Limit / CSRF / CSP / Security Headers** و محدودیت تلاش OTP | C16-009, C20-005/006/012 |
| B5 | **RBAC چندنقشی**؛ فقط دو سطح: ادمین و Superadmin | C17-001/006 |
| B6 | **Carrier، کد رهگیری، لینک رهگیری، برآورد تحویل** | C13-001…004 |
| B7 | **فاکتور/لیبل/لیست برداشت به‌صورت PDF و بارکد**؛ فعلاً فقط JSON و یک فایل متنی کلاینتی | C13-011/012/013 |
| B8 | **Receiving، Quarantine Management، Stocktake، Low-stock Alert** | C09-006/007/009/010 |
| B9 | **وضعیت انتشار محصول** (Draft/Published/Archived) | C01-002 |
| B10 | **واحد پول و تومان**؛ `currency: "EUR"` و اعداد یورویی دمو | C00-003, C04-003 |
| B11 | **Tax/Fee/Rounding Policy و مرز زمانی کمپین با Timezone مشخص** | C04-014/016 |
| B12 | **ارسال بر اساس وزن/مقصد/روش‌ها**؛ فقط نرخ ثابت + Express | C13-002, C01-011 |
| B13 | **Metric/Alert** برای Unknown Payment، Oversell، Negative Stock، 5xx | C21-006 |
| B14 | **CI واقعی + E2E مرورگر**؛ تست‌ها دستی روی دیتابیس محلی | C25-006/009 |
| B15 | **Backup/Restore و Rehearsal** | C21-011/012/013 |
| B16 | **Product/SKU Import/Export و Bulk Edit** | C01-013/014 |

## ب-۲) اقلام تازه‌ای که الحاقیه نشان داد در فهرست نبود

| # | نقص | شاهد | کنترل |
| --- | --- | --- | --- |
| A17 | ~~کش‌بک فعال است بدون سیاست مالی~~ | `settings.cashbackEnabled = true` | C15 |

> **A17 بسته شد:** سیاست مالی در ۲۰۲۶-۱۱-۰۴ تصویب شد (بخش ۱۰ `docs/commerce-core.md`): غیرقابل برداشت، فقط سفارش‌های بعدی همان مشتری، آزادسازی پس از تحویل + ۷ روز، انقضا ۱۲ ماه، سقف ۵۰٪ مبلغ کالا. |
| A18 | **سند ادمین (State Doc) هنوز می‌تواند قیمت و موجودی را بنویسد** — حرکت موجودی در دفتر ثبت می‌شود و قیمت تاریخچه دارد، ولی مسیر نوشتن خارج از سرویس تجارت است. | `projection.ts` (`on conflict … update`) | C00-006, C17-010 |
| B17 | **موجودیت «مرسوله» (Shipment/Parcel) وجود ندارد** — «یک سفارش = یک مرسوله» فعلاً فقط با یک `shipping_total` تقریب زده می‌شود؛ شمارش پارسل و کد رهگیری در مدل داده نیست. | `orders.ts` (بدون جدول shipment) | C13-002/003/005 |
| B18 | **آزمون قطع Worker وسط Retry** نداریم (Outbox dedupe تست شده، اما Retry نیمه‌کاره نه). | `outbox.ts` | C21-002 |
| B19 | **پذیرش «ON کردن BNPL = تأیید اعتبار مشتری نیست»** فقط مستند است؛ هیچ ثبت `provider_ready`/`credit_check` نداریم. | `payments.ts` | C06-008/009 |

## ج) سیاست‌های باز (نباید خودسر تثبیت شود)

Hold ۱۰ دقیقه / پرداخت ۱۵ / Quote ۱۰ · بازهٔ کش‌بک (پس از پرداخت یا پس از پنجرهٔ مرجوعی) · Expiry/Redeem کش‌بک · ماتریس کوپن×کمپین · کارمزد و شرایط اقساط · واحد پول و گرد کردن · مهلت مرجوعی و هزینهٔ مرجوعی · RPO/RTO.

---

## ترتیب پیشنهادی رفع

**P0 — درست‌بودن پول و موجودی**
A1+A2+A3 (کوپن) · A4 (QC) · A6 (حذف مسیر سفارش قدیمی) · A8 (بازپرداخت واقعی/Provider یا `manual_review`) · A13+A14 (کش‌بک: خرج + زمان واریز) · A5+A7 (EXCEPTION و سفارش رهاشده) · B1 (Audit) · B2 (Gate) · A11+A12+A15 (امنیت پرداخت و Secret).

**P1 — عملیات و اثبات**
A16 (UI انبار/مرجوعی) · A9 · A10 · B4 · B5 · B6 · B7 · B8 · B13 · B14.

**P2 — تکمیل**
B9 … B12 · B15 · B16 · سیاست‌های بخش ج.

هر مورد پس از انجام باید در `docs/commerce-coverage-audit.md` با مسیر فایل + نام تست + نتیجهٔ CI ثبت شود.

---

## الحاقیهٔ ۲۰۲۶-۱۱-۰۴ (BNPL-GLOBAL-001) — تطبیق بندبه‌بند با کد

| بند الحاقیه | وضعیت | شاهد / کار باقی‌مانده |
| --- | --- | --- |
| BNPL سراسری، بدون استثنای دسته/محصول/رنگ/سایز | ✅ پیاده | فقط `settings.bnpl4Enabled`؛ هیچ Flag محصولی در `schema.sql` نیست؛ تست «installment gateway is store-wide» |
| سبد مختلط (۱ اقساطی + ۵ غیراقساطی) = یک پرداخت چهارقسطی برای کل سفارش | ✅ پیاده | همان تست + `startPayment` روی `checkout.total` |
| OFF ⇒ شروع پرداخت جدید در Backend ممنوع، حتی با کش قدیمی فرانت | ✅ پیاده و تست‌شده | `403 bnpl_disabled` در `POST /checkout/:id/pay` |
| ON ≠ تأیید Provider/اعتبار مشتری | ⚠️ ناقص | هیچ وضعیت `provider_ready`/`credit_check` وجود ندارد (B2، B19) |
| جایگزینی OWN-05 / C-05 / استثناهای PRD | ⚠️ نیمه | در `docs/commerce-core.md` ثبت شده؛ دفتر تصمیم رسمی در مخزن PRD باید توسط مالک به‌روزرسانی شود |
| مرجعیت سروری قیمت/موجودی/رزرو/سفارش/پرداخت/بازپرداخت | ⚠️ تقریباً | تنها مسیر باقی‌مانده: سند ادمین (A18) که اکنون Audit + `price_history` دارد |
| Variant ID معتبر + سه حالت سایزبندی | ✅ پیاده | `variants.ts` (`size_mode`), تست‌های Checkout |
| Priority/Tie-breaker کمپین و منع ترکیب بی‌سیاست | ✅ پیاده (Tie-break تست ندارد) | `pricing.ts` (`order by priority desc, created_at asc, id asc`) |
| کوپن فقط در Checkout | ✅ پیاده | `POST /api/commerce/checkout/:id/quote` تنها مسیر؛ PDP/PLP کوپن نمی‌گیرند |
| افزودن به سبد رزرو نمی‌کند؛ Hold فقط در ورود به Checkout | ✅ پیاده و تست‌شده | تست «adding to the cart does not reserve stock» |
| مهلت Hold و Attempt مستقل و بدون مقدار خودسر | ⚠️ منتظر مالک | دو تنظیم مستقل هست (`reservationHoldMinutes`, `paymentWindowMinutes`)؛ عدد نهایی COM-DEC-001 |
| Callback به‌تنهایی پرداخت موفق نیست | ⚠️ ناقص | Verify پیاده است، اما Callback امضا ندارد (A11) |
| پرداخت تأییدشده پس از آزادسازی Hold ⇒ Exception، بدون ارسال خودکار | ✅ پیاده و تست‌شده | `order.exception` + تست late payment |
| هر سفارش R1 یک مرسوله و یک هزینهٔ ارسال | ⚠️ نیمه | هزینه یکتاست؛ مدل Shipment وجود ندارد (B17) |
| اسکن SKU اجباری + اصلاح موجودی با فرد دوم | ✅ پیاده و تست‌شده | `advanceOrder` + `decideAdjustment` (two_person_rule) |
| Refund فقط Superadmin محافظت‌شده | ✅ پیاده و تست‌شده | `decideRefund` + `liveRefundsEnabled` fail-closed |
| بازنویسی‌نشدن فاکتور/تراکنش/تاریخچه | ✅ پیاده (PR-1 تقویت شد) | Snapshot + Adjustment؛ سند ادمین دیگر سفارش موجود را بازنویسی نمی‌کند |
| Cashback جدا از Refund و فعال‌نشدن قبل از تصویب سیاست | ⚠️ نیاز تصمیم | جداسازی و Clawback پیاده است، ولی **کش‌بک اکنون فعال است** (A17) |
| سرویس خارجی/AI/Studio/افزونه نتواند هسته را دور بزند | ⚠️ ناقص | نقطهٔ اعمال واحد وجود ندارد؛ مسیر State Doc باز است (A18) |
| خرابی Provider/Worker/Queue/شبکه ⇒ بدون پرداخت/سفارش/موجودی تکراری | ✅ پیاده (بجز B18) | idempotency، `consumeReservations` یک‌بار، Outbox dedupe |
| مهاجرت V2 با حفظ تاریخچه و بازیابی | ❌ انجام نشده | V2 در این مخزن نیست؛ Backup/Restore و Rehearsal صفر است |

## PR-1 — چه چیزی در این دور واقعاً ساخته و تست شد

`docs/commerce-coverage-audit.md` و این سند با `27/27` تست Integration به‌روزرسانی شدند:

1. `audit_events` (append-only با Trigger) + `recordAudit`/`listAudit` + `GET /api/commerce/admin/audit`؛ ثبت روی تغییر تنظیمات (با Before/After و اکشن جدا برای کلید BNPL)، تصمیم بازپرداخت، تصمیم اصلاح موجودی، تغییر قیمت کاتالوگ و مسیر سفارش دستی.
2. `price_history` + ثبت خودکار در هر تغییر قیمت کاتالوگ.
3. کوپن: مصرف اتمیک سهمیه در تسویه، `max_discount`، هم‌مبنا شدن حداقل خرید؛ اگر ظرفیت بین ثبت و پرداخت تمام شود ⇒ سفارش `exception` (پول ثبت، تصمیم انسانی).
4. حذف مسیر سفارش‌سازی کلاینتی: `POST /api/orders` نشست ادمین واقعی می‌خواهد و Audit می‌شود؛ `PATCH` روی سفارش‌های تجاری ۴۰۹ می‌دهد؛ Checkout در قطعی شبکه Fail-closed است (سفارش جعلی ساخته نمی‌شود).
5. `exception` از `pending` جدا شد (پنل فیلتر مستقل دارد) و سند ادمین دیگر سفارش موجود را بازنویسی نمی‌کند.
6. پنل تجارت: «سفارش‌های سرور» با برداشت (اسکن SKU)، بسته‌بندی، ارسال، تحویل، لغو + «ردپای تغییرات».

## PR-4 (۲۰۲۶-۱۱-۰۴) — امنیت لبه، آمادگی BNPL، و مرجوعی مرحله‌ای

این دور «پروندهٔ هسته» را از نظر P0 می‌بندد. ۳۹/۳۹ تست Integration سبز
(`node --import tsx --test server/test/commerce.test.ts`)، `tsc` سرور و کلاینت پاک،
`npm run build` موفق.

**امنیت (`server/src/http/security.ts`)**
1. Rate limit پنجرهٔ ثابت روی `auth`/`admin_login`/`checkout`/`payment`/`returns`/`upload`/`write` → `429 rate_limited`.
2. CSRF دوگانه (`kv_csrf` + `x-csrf-token`) روی همهٔ نوشتن‌ها؛ Callback های امضاشده مستثنا.
3. هدرهای `nosniff` / `no-referrer` / `DENY` / `no-store` روی مسیرهای حساس.
4. CORS دیگر Origin دلخواه را بازتاب نمی‌دهد (same-host + `CORS_ALLOWED_ORIGINS`).
5. `/api/bootstrap` دیگر راز پخش نمی‌کند (A15 نیمه‌رفع) و `PUT /api/state/:key` نشست ادمین می‌خواهد (A18 همچنان باز برای نوشتنِ ادمین).
6. `/simulate` به صاحب Checkout/ادمین محدود شد (A12 رفع).

**آمادگی BNPL (BNPL-GLOBAL-001)**
7. `bnpl4 = {enabled, providerReady, availableForCheckout}`؛ فعال‌سازی بدون آمادگی Provider → `409 bnpl_provider_not_ready`؛ لغو آمادگی سوئیچ را خاموش می‌کند؛ Provider بدون قابلیت → `409 bnpl_provider_unsupported`.
8. Callback با HMAC (A11 رفع) و `requireCallbackSignature` پیش‌فرض روشن.

**مرجوعی / تعویض**
9. RMA مرحله‌ای (`approved → received → qc → settled`) — A4 رفع؛ واحد معیوب به قرنطینه می‌رود و هرگز قابل‌فروش نمی‌شود.
10. تسویه بر اساس `ProviderCapabilities` — Provider بدون قابلیت بازگشت → `manual_review` (A8 نیمه‌رفع؛ آداپتور واقعی تصمیم مالک است).
11. تعویض با `difference_amount`: اختلاف مثبت لینک پرداخت یک‌بارمصرف، اختلاف منفی اعتبار کیف پول همان مشتری.

**همچنان باز (P1/P2) و آگاهانه تصمیم‌گیری‌نشده)**
12. A18 — نوشتن State Doc توسط ادمین هنوز از سرویس تجارت عبور می‌کند (باید به Command محدود شود).
13. B17 — مدل Shipment (یک مرسوله/یک هزینه) هنوز به‌صورت جدول مستقل وجود ندارد.
14. مهاجرت V2 و Backup/Restore rehearsal — انجام نشده.
15. تصمیم‌های باز مالک: Provider واقعی، TTL ها، ماتریس کوپن×کمپین، Secret Store.
