# Commerce Core (V3) — پیاده‌سازی در بک‌اند Fastify

این سند توضیح می‌دهد چه چیزی از بخش سوم PRD (Commerce Core) در همین ریپو
پیاده شده، چه تصمیم‌هایی گرفته شده، و چه چیزهایی هنوز تصمیم مالک پروژه را
می‌خواهد. هر جا تصمیم PRD قطعی بوده، همان اجرا شده؛ هر جا باز بوده، مقدار در
`commerce_settings` ذخیره شده و در پنل ادمین قابل تغییر است — نه سخت‌کدشده در
مرورگر.

> یادداشت معماری: PRD هسته را Django/DRF می‌خواهد. طبق انتخاب صریح مالک
> پروژه در این نشست، پیاده‌سازی روی بک‌اند موجود (**Fastify + PostgreSQL**)
> انجام شده است. قراردادهای دامنه (Variant، Quote، Reservation، PaymentAttempt،
> Order snapshot، Outbox) از قراردادهای PRD تبعیت می‌کنند تا مهاجرت بعدی به
> Django بازنویسی منطق نباشد.

## ۱. مدل داده

| جدول | نقش |
| --- | --- |
| `product_variants` | هر ترکیب رنگ × سایز با `id` پایدار، `sku` یکتا، `on_hand`، `quarantined`، `size_mode` |
| `inventory_movements` | دفتر Append-only تغییرات موجودی (`opening_stock`, `catalog_sync`, `sale`, `cancellation`, `refund_return`, `adjustment`) با `dedupe_key` |
| `stock_reservations` | Holdهای واقعی موجودی، فقط هنگام ورود به Checkout؛ `active / consumed / released / expired` |
| `inventory_adjustments` | اصلاح دستی موجودی با تأیید دو نفره |
| `carts` / `cart_lines` | سبد مهمان (کوکی امن) و سبد حساب؛ ادغام هنگام ورود |
| `price_rules` | کمپین‌ها و قوانین تخفیف (آینهٔ `admin.campaigns` / `discountRules`) |
| `coupons` | کدهای تخفیف؛ محل وارد شدن فقط Checkout |
| `checkout_sessions` | Quote فریزشده + نسخهٔ آن + مهلت رزرو |
| `payment_attempts` | هر تلاش پرداخت با `idempotency_key`، وضعیت و پاسخ Provider |
| `orders` + `order_lines` | سفارش با Snapshot مالی تغییرناپذیر |
| `refunds` | سند اصلاحی بازپرداخت/مرجوعی (فاکتور اصلی دست نمی‌خورد) |
| `fulfillment_events` | اسکن SKU، بسته‌بندی، ارسال |
| `outbox_events` | Transactional Outbox |

`size_mode` هر محصول از کاتالوگ مشتق می‌شود: `standard_sizes` (S/M/L/XL یا
شمارهٔ کفش)، `custom_sizes` (اندازه‌های اختصاصی) و `no_size` (بدون پرسش سایز؛
یک واریانت تک‌سایز).

## ۲. موجودی و رزرو

```
available = on_hand − quarantined − Σ(active reservations, expires_at > now())
```

- افزودن به سبد **هیچ** موجودی را رزرو نمی‌کند.
- ورود به Checkout همهٔ خطوط را **اتمیک** رزرو می‌کند؛ اگر یک خط کم بیاید کل
  رزرو رد می‌شود و پاسخ `409 insufficient_stock` همراه با `details.shortages`
  برمی‌گردد. دو Checkout هم‌زمان برای آخرین عدد → فقط یکی موفق می‌شود.
- آزادسازی و انقضا فقط روی رکوردهای `active` اثر می‌گذارند، پس اجرای دوبارهٔ
  Worker موجودی را دو بار برنمی‌گرداند (Idempotent).
- پرداخت دیرهنگام (بعد از انقضای Hold) موجودی را **دوباره رزرو نمی‌کند**؛
  سفارش با `status = exception` و `payment_status = settled` ثبت می‌شود و
  ارسال خودکار انجام نمی‌شود.
- اصلاح دستی موجودی دو مرحله‌ای است: درخواست‌دهنده و تأییدکننده باید دو
  شخص متفاوت باشند (`two_person_rule`).

### مدت Hold

پیش‌فرض **۱۰ دقیقه** (`reservationHoldMinutes`) با پنجرهٔ پرداخت ۱۵ دقیقه
(`paymentWindowMinutes`) و اعتبار Quote ۱۰ دقیقه — همان الگویی که فروشگاه‌های
بزرگ استفاده می‌کنند: سبد چیزی را نگه نمی‌دارد، رزرو فقط در «شروع پرداخت»
ساخته می‌شود و تایمر کوتاه است تا آخرین موجودی قفل نشود.

- Shopify: موجودی فقط پس از پرداخت کم می‌شود و هنگام شروع پرداخت چند دقیقه
  رزرو می‌شود؛ تایمرهای رایج حدود ۱۰ دقیقه است.
  <https://www.hellointerview.com/learn/system-design/in-the-wild/shopify-inventory-reservations>
- اپ‌های رزرو سبد در Shopify هم تایمر ثابت ۱۰ دقیقه‌ای دارند.
  <https://apps.shopify.com/cart-reserve>

هر دو مقدار در پنل ادمین (تب «تجارت و پرداخت») قابل تغییرند.

## ۳. قیمت‌گذاری

- قیمت هر خط از کاتالوگ سرور خوانده می‌شود؛ عدد مرورگر هرگز مبنای سفارش نیست.
- هر کمپین مالی واجد شرایط روی اقلام دامنهٔ خود در کل سبد محاسبه می‌شود؛ سقف کمپین یک‌بار برای کل سبد است. مبلغ ثابت کمپین نیز در سطح کل اقلام واجد شرایط کسر می‌شود.
- فقط بیشترین تخفیف مالی از میان کمپین‌ها و کد تخفیف انتخاب می‌شود؛ در تساوی کمپین بر کد و سپس `priority`، قدمت و شناسه تعیین‌کننده‌اند. تخفیف‌ها روی هم جمع نمی‌شوند؛ `discountStacking` و پرچم‌های قدیمی ترکیب دیگر اجازهٔ جمع‌شدن نمی‌دهند. ارسال رایگان جداگانه بررسی می‌شود.
- تخفیف منتخب به نسبت قیمت اقلام واجد شرایط با دقت واحد صدم بین خط‌ها توزیع می‌شود تا مبنای مرجوعی همان مبلغ پس از تخفیف باشد. کد معتبر ولی بازنده در سفارش مصرف نمی‌شود.
- کوپن فقط در Checkout پذیرفته می‌شود (`application only at checkout`).
- هر تلاش پرداخت علاوه بر مبلغ، نسخهٔ کامل صورتحساب همان تلاش را نگه می‌دارد؛ تغییر بعدی تسویه یا کوپن، صورتحساب پرداخت قبلی را عوض نمی‌کند. تلاش‌های قدیمی که این snapshot را ندارند یا مبلغشان با آن هم‌خوان نیست، پس از تأیید پرداخت فقط به صف بررسی مالی می‌روند و سفارش عادی قابل ارسال نمی‌سازند.
- Quote شامل نسخهٔ هش‌شده (`quoteVersion`) است. هنگام `pay` قیمت‌ها دوباره خوانده
  می‌شوند؛ اگر چیزی عوض شده باشد مبلغ به‌روز می‌شود و پاسخ
  `409 quote_stale` با Quote جدید برمی‌گردد.

### ارسال رایگان

یک کمپین مالی می‌تواند مستقل از تخفیف خود مزیت ارسال رایگان نیز داشته باشد؛ این مزیت حتی اگر یک کوپن یا کمپین مالی دیگر برنده شود، در صورت احراز شرایط دامنه و حداقل خرید اعمال می‌شود. کمپین فقط ارسال رایگان نیز جداگانه قابل تعریف است. انتخاب مخاطب بر اساس برچسب و محدودیت دسترسی زودهنگام فقط به‌عنوان پیش‌نویس قابل ثبت‌اند؛ فعال‌سازی آن‌ها تا اجرای کنترل‌های سمت سرور و بررسی افشای عمومی مسدود است و در عمل هیچ محدودیتی ایجاد نمی‌کنند.

آستانه روی **جمع پس از تخفیف و پیش از ارسال/مالیات** سنجیده می‌شود
(`shippingThresholdBasis = after_discount`)، چون اکثر فروشگاه‌های بزرگ همین
قاعده را دارند و نوار پیشرفت سبد و مبلغ Checkout یک عدد را نشان می‌دهند:

- Barnes & Noble: حداقل $۶۰ پس از همهٔ تخفیف‌ها و بدون ارسال/مالیات.
  <https://help.barnesandnoble.com/hc/en-us/articles/5335188103323-Free-Shipping-Requirements>
- eBay: آستانه پیش از ارسال و پس از کوپن/تخفیف محاسبه می‌شود.
  <https://www.reddit.com/r/eBaySellerAdvice/comments/1jjult7/>
- راهنماهای CRO هم «subtotal after discounts, before tax and shipping» را
  استاندارد می‌دانند. <https://eyecaptain.io/blog/free-shipping-threshold-how-to-set>

هر سفارش یک مرسوله و یک کرایه دارد؛ سبد به دو مرسوله تقسیم نمی‌شود.

## ۴. پرداخت و BNPL

وضعیت‌ها: `initiated → pending_verification → settled | failed | exception`.

- **Callback به‌تنهایی اثبات پرداخت نیست.** بک‌اند با `verify` سمت Provider
  تأیید می‌کند. پاسخ نامشخص (Timeout) سفارش را Paid نمی‌کند و در
  `pending_verification` می‌ماند تا `reconcile`.
- Provider پیش‌فرض `mock` (و `mock-bnpl4`) است. آداپتور درگاه واقعی هم پیاده شده است
  (`commerce/gateway.ts`، شناسهٔ `gateway`) و همان قرارداد `initiate`/`verify` را دارد:
  - بدون `PAYMENT_GATEWAY_URL` انتخاب نمی‌شود: `503 provider_not_configured` و
    `providers.gateway=false` در `/api/commerce/config` — هیچ برگشتی به mock نیست.
  - کال‌بک حتی با امضای معتبر فقط `verify` سمت سرور را راه می‌اندازد؛ مبلغ اعلامی درگاه باید تا
    ریال با سفارش بخواند وگرنه `exception`. خطای شبکه → `pending_verification`.
  - `capabilities.refund` برای درگاه واقعی خاموش است؛ تا پیاده‌سازی و تأیید ارتباط بازپرداخت، درخواست به بررسی دستی می‌رود و هیچ پرچم محیطی پرداخت واقعی را شبیه‌سازی نمی‌کند.
  - صفحهٔ بازگشت خریدار: `#/payment/:attemptId` (وضعیت واقعی از `GET /api/commerce/payments/:id`).
- کنترل‌های شبیه‌سازی فقط وقتی `NODE_ENV !== production` است فعال‌اند.
- **قانون جدید BNPL (جایگزین OWN-05):** درگاه چهارقسطی در سطح **کل فروشگاه**
  فعال/غیرفعال می‌شود، نه در سطح دسته/محصول/واریانت. وقتی روشن است گزینه برای
  همهٔ محصولات و **کل سفارش** ارائه می‌شود؛ برچسب «اقساطی/غیراقساطی» قدیمی
  محصولات هیچ تأثیری ندارد. سفارش به چند تراکنش یا چند مرسوله تقسیم نمی‌شود.
  تصمیم نهایی با Provider است و در صورت رد شدن، پرداخت آنلاین عادی باقی
  می‌ماند (`bnpl_rejected`).
  - کلید: `commerce_settings.bnpl4Enabled`، با `PUT /api/commerce/admin/settings`.
  - مبلغ هر قسط = مبلغ کل / تعداد اقساط (بدون کارمزد).
  - **سه وضعیت جدا (۲۰۲۶-۱۱-۰۴):** `GET /api/commerce/config` مقدار
    `bnpl4 = {enabled, providerReady, availableForCheckout, installments, provider, scope}`
    برمی‌گرداند. `availableForCheckout` فقط وقتی `true` است که هم سوئیچ فروشگاه
    روشن باشد، هم `bnpl4ProviderReady` (تأیید Provider)، و هم آداپتور آن Provider
    قابلیت `bnpl4` را اعلام کرده باشد. یعنی «قابل انتخاب بودن» ≠ «تأیید Provider».
  - فعال‌کردن سوئیچ بدون `bnpl4ProviderReady` → `409 bnpl_provider_not_ready`؛
    لغو آمادگی، سوئیچ را در همان نوشتن خاموش می‌کند؛ شروع پرداخت با Provider بدون
    قابلیت → `409 bnpl_provider_unsupported`؛ سوئیچ خاموش → `403 bnpl_disabled`.

### قابلیت‌های Provider و امضای Callback

هر Provider یک `ProviderCapabilities` اعلام می‌کند: `bnpl4`، `refund`،
`partialRefund`، `signedCallbacks`. موک = همه true جز `bnpl4`؛ موک چهارقسطی =
`bnpl4` تنها. اگر Provider قابلیت بازگشت پول را اعلام نکند، تسویهٔ مرجوعی به‌جای
«انجام‌شده» در وضعیت `manual_review` می‌ماند تا انسان تصمیم بگیرد (تست:
`an installment refund the provider cannot reverse is parked for a human`).

Callback ها با HMAC-SHA256 روی `attemptId:JSON(body)` امضا می‌شوند
(`signCallbackPayload` / `verifyCallbackSignature`، مقایسهٔ `timingSafeEqual`).
`requireCallbackSignature` پیش‌فرض روشن است؛ Callback بدون امضا →
`401 invalid_callback_signature` و هیچ تغییری در پرداخت/سفارش/موجودی.
مسیر `/simulate` هم فقط برای صاحب همان Checkout (کوکی `kv_checkout`) یا ادمین
مجاز است و در Production کاملاً بسته است.

## ۵. سفارش، انبار، مرجوعی

- چرخه: `paid → preparing → shipped → delivered`؛ مسیرهای `exception` و
  `cancelled` جدا هستند.
- Snapshot مالی در `order_lines` می‌ماند: تغییر قیمت محصول در آینده فاکتور را
  عوض نمی‌کند (`GET /api/commerce/orders/:id/invoice`).
- Picking با اسکن SKU اجباری است؛ SKU نادرست → `409 sku_mismatch` و ثبت رویداد
  ردشده. Packing تأیید دستی می‌خواهد. ارسال/تحویل idempotent هستند.
- مرجوعی جزئی در سطح ردیف سفارش مدیریت می‌شود و تعداد درخواست‌شده (حتی
  تأییدنشده) از باقی‌مانده کم می‌شود.
- **مرجوعی مرحله‌ای (RMA) — ۲۰۲۶-۱۱-۰۴:** وضعیت‌ها
  `requested → approved → received → qc_passed | qc_failed → settled | manual_review`
  (و `rejected`). «تأیید» فقط یک تصمیم است: هیچ پول و هیچ موجودی جابه‌جا نمی‌شود.
  - `POST /api/commerce/admin/refunds/:id/receive` — کالا به انبار برگشته است.
  - `POST /api/commerce/admin/refunds/:id/qc` با `{result: "saleable" | "defective"}` —
    تنها جایی که واحد برگشتی می‌تواند دوباره قابل‌فروش شود. `saleable` →
    `on_hand += qty` با `inventory_movements.reason = 'refund_return'`؛
    `defective` → `quarantined += qty` و ثبت `qc_rejected` (هرگز قابل‌فروش نمی‌شود).
  - `POST /api/commerce/admin/refunds/:id/settle` — فقط Superadmin + `liveRefundsEnabled`.
    قبل از دریافت/QC → `409 qc_required`؛ تعویضِ گران‌تر بدون پرداخت اختلاف →
    `409 exchange_difference_unpaid`.
  - **تعویض (Exchange):** `kind = "exchange"` با `target_variant_id`؛ اختلاف قیمت
    در `refunds.difference_amount` snapshot می‌شود. اختلاف مثبت → یک لینک پرداخت
    یک‌بارمصرف `exchange_payments` (۴۸ ساعت) و `POST /api/commerce/exchange/:token/pay`.
    اختلاف منفی → در تسویه به کیف پول همان مشتری برمی‌گردد (`refund_credit` با
    `ref_id = "<refund>:diff"`).
  - هر مرحله در `audit_events` ثبت می‌شود و فاکتور تاریخی دست‌نخورده می‌ماند.
- **Refund فقط با Superadmin محافظت‌شده** و تنها وقتی `liveRefundsEnabled`
  روشن است؛ در غیر این صورت پاسخ `403 live_refunds_blocked` و درخواست در صف
  می‌ماند. نشست ادمین معمولی (پسکد `1234`) Superadmin نیست؛ ارتقا با
  `SUPERADMIN_PASSCODE` و `POST /api/commerce/admin/elevate` انجام می‌شود.
- بازپرداخت/تعویض سند اصلاحی جدا می‌سازد و فاکتور تاریخی را بازنویسی نمی‌کند.

## ۶. رویدادها (Transactional Outbox)

`order.paid`، `order.exception`، `order.cancelled` و `refund.settled` در همان
تراکنش سفارش نوشته می‌شوند و Worker جداگانه (هر ۲ ثانیه، `SKIP LOCKED`) به
SMS/حسابداری/Webhook تحویل می‌دهد. تحویل **حداقل یک‌بار** است؛ گیرنده باید با
`dedupe_key` تکرار را تشخیص دهد. قطع سرویس پیامک سفارش را باطل نمی‌کند
(تست `a broken SMS provider never invalidates a paid order`).

## ۷. API

| متد و مسیر | کار |
| --- | --- |
| `GET /api/commerce/config` | وضعیت سراسری BNPL، کرایه، مهلت رزرو |
| `GET /api/products/:id/variants` | واریانت‌ها + موجودی قابل فروش |
| `GET/POST/PATCH/DELETE /api/commerce/cart*` | سبد مهمان/حساب (بدون رزرو) |
| `POST /api/commerce/quote` | پیش‌فاکتور سروری (بدون رزرو) |
| `POST /api/commerce/checkout` | شروع تسویه + رزرو اتمیک + Quote فریز |
| `POST /api/commerce/checkout/:id/quote` | اعمال کوپن/روش ارسال |
| `POST /api/commerce/checkout/:id/pay` | ساخت PaymentAttempt (idempotent) |
| `POST /api/commerce/payments/:id/callback` | Callback درگاه → verify → settle |
| `POST /api/commerce/payments/:id/simulate` | شبیه‌سازی نتیجه (فقط غیر production) |
| `POST /api/commerce/payments/:id/reconcile` | استعلام دوباره (ادمین) |
| `GET /api/commerce/orders[/:id]` | سفارش‌های مشتری (Object-level authz) |
| `GET /api/commerce/orders/:id/invoice` | فاکتور Snapshot + اسناد اصلاحی |
| `POST /api/commerce/orders/:id/{picking,packing,ship,deliver}` | انبار |
| `POST /api/commerce/orders/:id/returns` | درخواست مرجوعی/بازپرداخت |
| `GET/PUT /api/commerce/admin/settings` | تنظیمات تجارت |
| `POST /api/commerce/admin/inventory/adjustments[/:id]` | اصلاح دو نفره |
| `GET /api/commerce/admin/{refunds,payments,reservations,outbox}` | مانیتورینگ |
| `POST /api/commerce/admin/tick` | اجرای دستی sweeper + outbox |

## ۸. تست‌ها

```bash
npm run test:commerce   # ۱۸ تست Integration روی PostgreSQL واقعی
```

پوشش: عدم رزرو در سبد، رقابت دو Checkout برای آخرین موجودی، انقضای Hold
(یک‌بار)، آزادسازی تکراری، تغییر قیمت میان Quote و پرداخت، عدم ترکیب کوپن و
کمپین، Callback تکراری، Timeout در Verify، پرداخت دیرهنگام → EXCEPTION،
BNPL سراسری برای سبد مختلط، محدودیت Refund به Superadmin + Fail-closed،
مرجوعی جزئی، تأیید دو نفرهٔ موجودی، قطع SMS، اسکن SKU و چرخهٔ انبار،
Idempotency سفارش و تغییرناپذیری فاکتور.

## ۹. کش‌بک پله‌ای

نرخ کش‌بک **ثابت نیست**؛ به مبلغ سبد بستگی دارد. مثال خواسته‌شده: تا یک
میلیون → ۵٪، تا سه میلیون → ۳٪ و به همین ترتیب.

- تنظیمات در `commerce_settings`: `cashbackEnabled`، `cashbackTiers`
  (هر پله: `min`, `max`, `percent`؛ `max = null` یعنی «به بالا»)،
  `cashbackMode`، `cashbackBase`، `cashbackMaxAmount`.
- دو روش محاسبه:
  - `tier_rate` (پیش‌فرض): پله‌ای که مبلغ سبد در آن است، نرخ خود را روی
    **کل سبد** اعمال می‌کند — همان قانون «تا ۱ میلیون ۵٪، تا ۳ میلیون ۳٪».
  - `marginal`: هر نرخ فقط روی سهم خودش (مثل پله‌های مالیات).
- مبنا به‌صورت پیش‌فرض **مبلغ کالاها پس از تخفیف و بدون هزینهٔ ارسال** است
  (`cashbackBase = merchandise`)؛ در صورت تمایل می‌توان روی مبلغ نهایی سفارش
  گذاشت.
- پله‌ها در پنل ادمین (تب «تجارت و پرداخت») با ردیف‌های قابل ویرایش‌اند؛ عدد
  پیش‌فرضِ نصب با مقیاس قیمت‌های همین فروشگاه تنظیم شده (۰–۱٬۰۰۰ → ۵٪،
  ۱٬۰۰۰–۳٬۰۰۰ → ۳٪، بالاتر → ۱٪) و با یک کلیک می‌شود همان ۱ و ۳ میلیون را
  وارد کرد.
- Quote هم کش‌‌بک را برمی‌گرداند (`quote.cashback`) تا مشتری **قبل از پرداخت**
  مبلغ و درصد را ببیند؛ عدد صرفاً محاسبهٔ سرور است.
- کش‌بک فقط برای سفارش **پرداخت‌شده** و فقط برای مشتری وارد‌شده ثبت می‌شود
  (سفارش مهمان رکورد کش‌بک ندارد). ثبت در `cashback_ledger` با
  `unique(order_id) where kind='earn'` است، پس Callback تکراری کش‌بک دوباره
  نمی‌دهد.
- سفارش `exception` (پرداخت دیرهنگام) کش‌بک نمی‌گیرد.
- بازپرداخت/مرجوعی، سهم همان مبلغ را به‌صورت سطر `reversal` منفی برمی‌گرداند؛
  رکورد اصلی `earn` دست نمی‌خورد.
- API: `GET /api/commerce/cashback` (کیف پول مشتری)،
  `GET /api/commerce/admin/cashback` (خلاصه و آخرین تراکنش‌ها).
  پله‌ها در `PUT /api/commerce/admin/settings` هم قابل تغییرند.

## ۱۰. سیاست مالی کش‌بک (تصویب مالک — ۲۰۲۶-۱۱-۰۴)

| موضوع | قاعدهٔ تصویب‌شده | تنظیم ادمین |
| --- | --- | --- |
| قابلیت برداشت | **غیرقابل برداشت نقدی**. کش‌بک فقط اعتبار خرید در همین فروشگاه است؛ هیچ مسیر Cash-out در API وجود ندارد | — |
| دامنهٔ مصرف | فقط سفارش‌های **بعدی همان مشتری**؛ کش‌بکِ یک سفارش هرگز روی خودش خرج نمی‌شود و کیف پول هر حساب فقط با نشست همان حساب قابل استفاده است | — |
| زمان آزادسازی | پیش‌فرض «پس از تحویل + مهلت مرجوعی»؛ دو گزینهٔ دیگر: پس از تحویل، همان لحظهٔ پرداخت | `cashbackCreditTiming`, `cashbackHoldDays` (۷ روز) |
| انقضا | ۱۲ ماه از زمان آزادسازی | `cashbackExpiryMonths` |
| سهم هر سفارش | حداکثر ۵۰٪ مبلغ کالا (پس از تخفیف) | `cashbackRedeemMaxPercent` |
| ترکیب با کوپن/کمپین | مجاز (کش‌بک روش پرداخت است، نه تخفیف) | `cashbackCombineWithDiscounts` |
| فعال/غیرفعال | روشن، با کلید مستقل | `cashbackRedeemEnabled` |

اجرا در کد:

- کیف پول دو عدد دارد: `available` (قابل خرج) و `pending` (در انتظار آزادسازی).
  سوییپ `releasePendingCashback` هنگام تحویل (+ روزهای هولد) آن را آزاد و
  `expires_at` را تنظیم می‌کند.
- کسر در **همان تراکنش تسویه** انجام می‌شود: مبلغ درگاه = مبلغ سفارش − کیف پول؛
  مبلغ فاکتور تغییر نمی‌کند و `walletApplied` در سفارش ثبت می‌شود.
- اگر کسر در لحظهٔ تسویه شکست بخورد (موجودی جابه‌جا شده باشد) سفارش
  `exception` می‌شود: پول ثبت شده، تصمیم با اپراتور مالی.
- بازپرداخت: سهمی که از کیف پول پرداخت شده بود به‌صورت `refund_credit` به کیف پول
  برمی‌گردد (نقدی که فروشگاه نگرفته، به درگاه برنمی‌گردد).
- بازپرداخت روی سفارشِ در انتظار، پول قابل خرج نمی‌سازد؛ `reversal` همیشه از
  سبد همان سفارش کم می‌شود.

## ۱۱. ممیزی، سقف کوپن و وضعیت Exception (PR-1)

- **Audit Trail**: هر تغییر حساس یک سطر در `audit_events` می‌نویسد
  (کاربر، عمل، هدف، مقدار قبل/بعد، دلیل). جدول Append-only است و
  Trigger جلوی `UPDATE`/`DELETE` را می‌گیرد. مسیر خواندن:
  `GET /api/commerce/admin/audit?targetType=&limit=`، و در پنل «تجارت و پرداخت»
  بخش «ردپای تغییرات». کلید سراسری BNPL اکشن جداگانهٔ `settings.bnpl_toggle`
  دارد تا در گزارش مالی قابل ردیابی باشد.
- **تاریخچهٔ قیمت**: `price_history` برای هر تغییر قیمت کاتالوگ یک ردیف
  نگه می‌دارد؛ Snapshot سفارش همچنان تغییرناپذیر است.
- **سهمیهٔ کوپن** در همان تراکنش تسویه مصرف می‌شود
  (`update coupons … where used_count < usage_limit`). اگر ظرفیت بین ثبت
  سفارش و تأیید پرداخت تمام شود، سفارش `exception` می‌شود (پول ثبت شده،
  تصمیم انسانی) نه یک تخفیف بی‌بودجه.
- **سقف تخفیف**: `coupons.max_discount` سقف مبلغ کوپن درصدی است و تخفیف
  هرگز از مبلغ قابل پرداخت بیشتر نمی‌شود. حداقل خرید و تخفیف روی یک مبنا
  (بعد از کمپین) سنجیده می‌شوند.
- **وضعیت `exception`** دیگر به `pending` نگاشت نمی‌شود؛ فیلتر مستقل در پنل
  سفارش‌ها دارد و دلیل استثنا در همان ردیف دیده می‌شود.
- **مسیر نوشتن سفارش**: `POST /api/orders` فقط با نشست واقعی ادمین و با ثبت
  Audit، و `PATCH /api/orders/:id` برای سفارش‌های تجارت مسدود (۴۰۹) است.
  Checkout در قطعی شبکه Fail-closed است: سفارش محلی/جعلی ساخته نمی‌شود.

## ۱۲. تصمیم‌های باز (مالک پروژه باید تعیین کند)

این موارد عمداً به‌عنوان «تصمیم محصول» سخت‌کد نشده‌اند:

1. Provider قطعی پرداخت و BNPL و کلیدهایشان (فعلاً `mock`).
2. ماتریس دقیق ترکیب کوپن × کمپین (فعلاً Fail-closed: بدون ترکیب).
3. ~~خرج‌کردن کش‌بک و انقضای آن~~ — **تصویب و پیاده شد** (بخش ۱۰).
4. قواعد `second` و `bundle` در `discountRules` (در قیمت‌گذاری نادیده گرفته
   می‌شوند تا قرارداد مستقل خودشان تصویب شود).
5. مهلت دقیق هر Provider واقعی (مقدارها تنظیمات‌اند، نه ثابت).
6. Freeze نهایی Schema قراردادهای C-01..C-08.

## ۱۳. امنیت لبه (۲۰۲۶-۱۱-۰۴)

`server/src/http/security.ts` روی همهٔ مسیرها اجرا می‌شود:

- **Rate limit** پنجرهٔ ثابت بر اساس IP: `auth 40`، `admin_login 20`، `checkout 60`،
  `payment 60`، `returns 30`، `upload 20`، `write 120` در دقیقه → `429 rate_limited`
  با هدر `retry-after`. در تست‌ها با `resetRateLimits()` پاک می‌شود.
- **CSRF دوگانه (double submit):** کوکی `kv_csrf` + هدر `x-csrf-token` برای هر
  درخواست غیر-GET → `403 csrf_token_invalid`. Callback های Provider از این قاعده
  مستثنا هستند چون امضای HMAC دارند. کلاینت (`src/lib/api.ts`) توکن را خودکار
  می‌فرستد.
- **هدرهای امنیتی:** `x-content-type-options: nosniff`، `referrer-policy: no-referrer`،
  `x-frame-options: DENY`، `same-site` و `cache-control: no-store` روی مسیرهای
  حساس (auth / admin / cashback).
- **CORS:** بازتاب Origin دلخواه حذف شد؛ فقط same-host و `CORS_ALLOWED_ORIGINS`
  مجاز است و Preflight هدرهای `x-csrf-token` و `x-provider-signature` را می‌پذیرد.
- **Bootstrap بدون راز:** `/api/bootstrap` برای مهمان سند `admin` را بدون
  `passcode`/`orders`/`customers`/`security` و با `integrations` محدود به
  `enabled/mode/provider` می‌دهد؛ برای ادمین هر کلید حساس (`passcode`، `key`،
  `apiKey`، `secret`، `token` …) به `***` تبدیل می‌شود و `ops.security.passcode`
  هم پاک می‌شود. نوشتن روی `PUT /api/state/:key` فقط با نشست ادمین ممکن است.
  کلیدهای Provider در سند باقی می‌مانند ولی هیچ‌وقت از API بیرون نمی‌آیند (A15).

## ۱۴. تست‌های امنیت، BNPL و مرجوعی (۲۰۲۶-۱۱-۰۴)

`node --import tsx --test server/test/commerce.test.ts` → **۳۹/۳۹ سبز**، شامل:
سه وضعیت BNPL، Callback بدون امضا، CSRF و Rate limit، نشت Bootstrap، مرجوعی
مرحله‌ای (معیوب → قرنطینه، سالم → موجودی، بدون QC → ۴۰۹)، تعویض گران‌تر با
اختلاف پرداخت‌نشده، و مرجوعی BNPL که به `manual_review` می‌رود.
