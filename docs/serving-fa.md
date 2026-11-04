# راهنمای اجرا و پیش‌نمایش (فارسی)

این سند حالت‌های اجرای پروژه را روشن می‌کند تا دیگر لازم نباشد دو سرور جدا روی
پورت‌های ۴۰۰۰ و ۴۱۷۳ بالا بیاید.

## ۱) حالت توسعه (HMR)

```bash
npm run dev
```

- سایت: `http://0.0.0.0:5173` (Vite با HMR)
- API: `http://0.0.0.0:4000` (Fastify + PostgreSQL روی پورت ۵۵۴۳۲)
- Vite درخواست‌های `/api` و `/uploads` را به ۴۰۰۰ پروکسی می‌کند
  (`vite.config.ts` → `server.proxy`).

## ۲) پیش‌نمایش کامل روی پورت ۴۰۰۰ (یک پروسه)

```bash
npm run preview
```

معادل: `npm run build && SERVE_STATIC=1 tsx server/src/index.ts`

- یک پروسهٔ Fastify هم `dist/` را سرو می‌کند و هم API را.
- ریشهٔ سایت: `/` → `dist/index.html`
- API: `/api/*`
- مسیرهای SPA: هر مسیر ناشناختهٔ غیر-API به `index.html` برمی‌گردد
  (`setNotFoundHandler` در `server/src/index.ts`).
- `/uploads/*` از دیسک سرو می‌شود.

این همان حالتی است که پیش‌نمایش زنده (۴۰۰۰) استفاده می‌کند: آدرس صفحه و API
هر دو هم‌مبدأ هستند، پس فراخوانی‌های نسبی `/api/...` بدون تنظیم CORS کار می‌کنند.

## ۳) سرو استاتیک تنها (اختیاری)

```bash
npm run preview:static   # vite preview روی 4173
```

این حالت فقط `dist/` را سرو می‌کند و برای کار کردن به یک API جدا روی ۴۰۰۰ نیاز
دارد؛ به همین دلیل همان پروکسی `/api` و `/uploads` برای آن هم تنظیم شده است.

## ۴) تولید

```bash
npm start
```

`SERVE_STATIC=1 REQUIRE_ADMIN_AUTH=1 NODE_ENV=production tsx server/src/index.ts`

تفاوت‌های حالت تولید:

- `REQUIRE_ADMIN_AUTH=1` → نوشتن‌های پنل مدیر به کوکی نشست نیاز دارد.
- `NODE_ENV=production` → هدر `x-frame-options: DENY` فعال می‌شود.

## نکتهٔ اصلاح‌شده: هدر `x-frame-options` و پیش‌نمایش

پیش‌تر `x-frame-options: DENY` روی **همهٔ** پاسخ‌ها (از جمله HTML ریشه) ارسال
می‌شد. این هدر در محیط پیش‌نمایش که سایت داخل یک iframe از مبدأی دیگر نمایش داده
می‌شود، رندر را می‌شکست (پیش‌نمایش سفید می‌ماند) در حالی که هیچ محافظتی لازم
نبود. اکنون:

```ts
// server/src/http/security.ts
if (config.isProd) reply.header("x-frame-options", "DENY");
```

- تولید: محافظت clickjacking حفظ می‌شود.
- توسعه/پیش‌نمایش: هدر ارسال نمی‌شود تا iframe پیش‌نمایش کار کند.

## متغیرهای محیطی سرور

| متغیر | پیش‌فرض | کاربرد |
| --- | --- | --- |
| `PORT` | ۴۰۰۰ | پورت سرور |
| `HOST` | `0.0.0.0` | آدرس bind |
| `SERVE_STATIC` | خاموش | با `1` سرو `dist/` |
| `NODE_ENV` | — | `production` → هدرها/حالت تولید |
| `REQUIRE_ADMIN_AUTH` | خاموش | با `1` اجبار نشست مدیر |
| `SUPERADMIN_PASSCODE` | خالی | تأیید بازپرداخت (fail-closed) |

## بررسی سلامت

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/            # 200 (HTML)
curl -s http://127.0.0.1:4000/api/health                                   # {"ok":true,...}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/bootstrap
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/p/anything   # 200 (SPA fallback)
```

## دام‌های شناخته‌شده

- پورت ۴۱۷۳ اگر هم‌زمان با اجرای `preview:static` و یک سرور قدیمی اشغال شود،
  `strictPort` باعث خطای راه‌اندازی می‌شود. پیش از اجرا با `ss -ltnp` بررسی کنید.
- `npm run preview` قبل از سرو، `dist/` را دوباره می‌سازد؛ اگر بیلد قدیمی دارید،
  همین دستور کافی است.
- اجرای `PORT=4000` بدون `SERVE_STATIC=1` فقط API را بالا می‌آورد و ریشهٔ `/`
  ۴۰۴ می‌دهد؛ برای پیش‌نمایش از `npm run preview` استفاده کنید.
