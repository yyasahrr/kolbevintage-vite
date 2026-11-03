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
- انتخاب کمپین: **بالاترین `priority` → قدیمی‌ترین → شناسهٔ پایدار**. عمداً
  «بیشترین تخفیف» معیار نیست.
- تخفیف‌ها به‌صورت پیش‌فرض ترکیب نمی‌شوند. اگر کمپینی اعمال شده باشد، کوپن با
  خطای `409 coupon_not_combinable` رد می‌شود مگر `discountStacking = explicit`
  و هر دو طرف `stackable/combinable` باشند.
- کوپن فقط در Checkout پذیرفته می‌شود (`application only at checkout`).
- Quote شامل نسخهٔ هش‌شده (`quoteVersion`) است. هنگام `pay` قیمت‌ها دوباره خوانده
  می‌شوند؛ اگر چیزی عوض شده باشد مبلغ به‌روز می‌شود و پاسخ
  `409 quote_stale` با Quote جدید برمی‌گردد.

### ارسال رایگان

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
- Provider پیش‌فرض `mock` (و `mock-bnpl4`) است؛ همان قرارداد آداپتور برای
  اتصال درگاه واقعی وجود دارد. کنترل‌های شبیه‌سازی فقط وقتی
  `NODE_ENV !== production` است فعال‌اند.
- **قانون جدید BNPL (جایگزین OWN-05):** درگاه چهارقسطی در سطح **کل فروشگاه**
  فعال/غیرفعال می‌شود، نه در سطح دسته/محصول/واریانت. وقتی روشن است گزینه برای
  همهٔ محصولات و **کل سفارش** ارائه می‌شود؛ برچسب «اقساطی/غیراقساطی» قدیمی
  محصولات هیچ تأثیری ندارد. سفارش به چند تراکنش یا چند مرسوله تقسیم نمی‌شود.
  تصمیم نهایی با Provider است و در صورت رد شدن، پرداخت آنلاین عادی باقی
  می‌ماند (`bnpl_rejected`).
  - کلید: `commerce_settings.bnpl4Enabled`، با `PUT /api/commerce/admin/settings`.
  - مبلغ هر قسط = مبلغ کل / تعداد اقساط (بدون کارمزد).

## ۵. سفارش، انبار، مرجوعی

- چرخه: `paid → preparing → shipped → delivered`؛ مسیرهای `exception` و
  `cancelled` جدا هستند.
- Snapshot مالی در `order_lines` می‌ماند: تغییر قیمت محصول در آینده فاکتور را
  عوض نمی‌کند (`GET /api/commerce/orders/:id/invoice`).
- Picking با اسکن SKU اجباری است؛ SKU نادرست → `409 sku_mismatch` و ثبت رویداد
  ردشده. Packing تأیید دستی می‌خواهد. ارسال/تحویل idempotent هستند.
- مرجوعی جزئی در سطح ردیف سفارش مدیریت می‌شود و تعداد درخواست‌شده (حتی
  تأییدنشده) از باقی‌مانده کم می‌شود.
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

## ۱۰. ممیزی، سقف کوپن و وضعیت Exception (PR-1)

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

## ۱۱. تصمیم‌های باز (مالک پروژه باید تعیین کند)

این موارد عمداً به‌عنوان «تصمیم محصول» سخت‌کد نشده‌اند:

1. Provider قطعی پرداخت و BNPL و کلیدهایشان (فعلاً `mock`).
2. ماتریس دقیق ترکیب کوپن × کمپین (فعلاً Fail-closed: بدون ترکیب).
3. **خرج‌کردن** کش‌بک و انقضای آن (کش‌بک فقط «کسب» و «برگشت پس از
   بازپرداخت» پیاده شده؛ خرج‌کردن موجودی کیف پول، سیاست انقضا و سقف‌های
   کمپینی هنوز تصمیم مالک پروژه را می‌خواهد).
4. قواعد `second` و `bundle` در `discountRules` (در قیمت‌گذاری نادیده گرفته
   می‌شوند تا قرارداد مستقل خودشان تصویب شود).
5. مهلت دقیق هر Provider واقعی (مقدارها تنظیمات‌اند، نه ثابت).
6. Freeze نهایی Schema قراردادهای C-01..C-08.
