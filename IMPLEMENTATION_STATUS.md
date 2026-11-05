# وضعیت پیاده‌سازی — ۲۰۲۶-۱۱-۰۵

مبنای ممیزی: `33d6d891713ad385e324439ac2005ddd2791b20b`؛ مخزن `yyasahrr/kolbevintage-vite`. این سند ادعای آمادگی انتشار نیست. ممیزی قبلی `docs/commerce-coverage-audit.md` و `docs/core-deficiencies.md` قدیمی‌تر از کد فعلی‌اند؛ مثلاً اکنون `server/src/http/rbac.ts` و `server/src/commerce/audit.ts` و تست‌های مربوط وجود دارند. برای هر قابلیت باید مسیر end-to-end جداگانه تأیید شود.

## نقشه و قرارداد

- کلاینت: React 19، TypeScript، Vite 7، Tailwind 4؛ `src/App.tsx` از HashRouter استفاده می‌کند. پنل موجود `src/pages/AdminPage.tsx` و `src/styles/admin.css`؛ قرارداد طراحی `docs/DESIGN.md`.
- سرور: Fastify 5، PostgreSQL، `server/src/schema.sql`؛ شروع محلی با PostgreSQL تعبیه‌شده، seed در `server/seed/state.json`؛ schema در startup اعمال می‌شود، سامانه migration نسخه‌دار جداگانه در این بررسی شناسایی نشد.
- نمودار وابستگی: UI ← `src/state/admin.ts`, `ops.ts`, `sync.ts` ← `/api/bootstrap`, `/api/state/:kind` ← state_documents و projection (`server/src/projection.ts`) ← جداول رابطه‌ای. checkout ← `/api/commerce/*` ← `server/src/commerce/` ← variant، inventory ledger، checkout، payment و order tables. هر دو مسیر نوشتن باید پیش از انتشار از نظر مرجعیت و race بررسی شوند.
- API و سیاست موجود: `README.md`، `docs/commerce-core.md`، `server/src/routes/` و `server/src/commerce/routes.ts`. اسناد state و projection همچنان مسیر قدیمی مهمی هستند؛ نباید فرض کرد تمام UI از API تجارت استفاده می‌کند.
- تست: `server/test/commerce.test.ts`، `server/test/rbac.test.ts`، اسکریپت‌های `scripts/`، Playwright در `tests/visual/`؛ CI در `.github/workflows/ci.yml`.

## وضعیت ماژول‌ها

| محدوده | شاهد موجود | فاصله تا پذیرش |
| --- | --- | --- |
| Gate 1 داشبورد/محصول/سفارش | پنل RTL، توکن، ناوبری و صفحات در `AdminPage.tsx`؛ فیلتر و انتخاب سمت کلاینت | تطبیق بصری با مراجع، مرورگر و screenshot و دسترس‌پذیری تأیید نشده؛ جدول‌ها server-side نیستند؛ KPI فروش وصول‌شده نیست |
| کاتالوگ/واریانت/موجودی | `commerce/variants.ts`, `inventory.ts` و UI محصول | ماتریس و تمام مسیرهای UI→API و import/export و مرجعیت ذخیره نیازمند تأیید؛ receiving و stocktake کامل ثابت نشده |
| سفارش/پرداخت/مرجوعی | `commerce/orders.ts`, `payments.ts`, `refunds.ts` و تست integration | درگاه mock و بازپرداخت واقعی fail-closed؛ حمل، چاپ، reconciliation و گردش کامل نیازمند تأیید |
| مشتری/پشتیبانی/بازاریابی | صفحات و مدل‌های موجود در `AdminOps.tsx`, `admin.ts`, promotions | مجوزهای ریزدانه، حریم خصوصی، قابلیت‌های سروری و جریان کامل باید تک‌به‌تک بررسی شوند |
| محتوا/Studio/Style | `src/builder/`, `src/components/Style*`, registry | نمونه اولیه؛ صرف وجود ویجت تکمیل واقعی بیش از ۱۰۰ خانواده، publish اتمیک، rollback و امنیت را ثابت نمی‌کند |
| نقش/امنیت/تنظیمات | `server/src/http/rbac.ts`, `security.ts`, تست RBAC و audit | بررسی جامع IDOR و دسترسی همه endpoints، XSS، upload و تنظیمات production باقی است |
| گزارش و مالی | `server/src/routes/analytics.ts`, صفحات گزارش | تعریف مالی، واحد پول و reconciliation و منبع متریک باید برای انتشار تأیید شوند |

## ADR کوتاه: توسعه تدریجی روی معماری موجود

تصمیم: React/Vite و Fastify/PostgreSQL حفظ شوند؛ از پنل و کامپوننت‌های موجود استفاده شود. مزیت: حفظ قراردادها و کاهش ریسک checkout؛ هزینه: مدیریت بدهی فایل بزرگ AdminPage و مسیرهای دوگانه document/projection. خطر: تغییر ظاهری بدون شناسایی منبع داده و مجوزها می‌تواند عملیات حساس را غلط نمایش دهد. جداسازی UI و endpointهای اختصاصی تنها در برش‌های تست‌پذیر و بدون migration مخرب انجام شود.

## پایه و شواهد این جلسه

- `npm ci` از lockfile: موفق؛ ۵ آسیب‌پذیری گزارش شد (۱ low، ۳ moderate، ۱ high). `npm audit --omit=dev`: سه moderate در زنجیره `@fastify/static`/`glob`/`minimatch`. به‌روزرسانی خودکار انجام نشد.
- پیش از اصلاح: `npm run typecheck` و `npm run build` به علت export ناموجود `useDialogFocus` شکست خوردند. `npm test`: ۵۴ commerce و ۱۳ RBAC موفق. `npm run audit`: موفق، اما ۲۲ هشدار احتمالی clipping، نه آزمون واقعی صفحه.
- بعد از اصلاح hook: `npm run typecheck`, `npm run build`, `npm run audit` موفق؛ bundle شامل ۷۱ ویجت registry مورد ممیزی است، نه مدرک تکمیل ۱۰۰ خانواده Studio.
- `npm run goldens`: شکست با پیام `goldens: no browser found.` بنابراین قبل/بعد، ابعاد ۳۲۰، ۳۹۰، ۷۶۸، ۱۰۲۴، ۱۴۴۰، interactionهای مرورگر، axe و screenshot آزمون نشده‌اند؛ تحلیل CSS جایگزین آنها نیست. منابع Dribbble در محیط محدود شبکه قابل بررسی مستقیم نبودند؛ مشخصات متنی کاربر مبناست.
- پیش‌نمایش توسعه با `VITE_DEMO_MODE=1`، پایگاه‌داده مستقل آزمایشی و `REQUIRE_ADMIN_AUTH=1`؛ `GET /api/health` از پروکسی: ۲۰۰، ۲۸ محصول و صفر سفارش. داده seed فروشگاه واقعی نیست. مسیرها: `/#/admin`, `/#/admin/stock/products`, `/#/admin/sales/orders`. رمز seed طبق README فقط برای محیط آزمایشی `1234` است.
- تغییرات: hook فوکوس مودال خرید سریع برای رفع build، نشان صریح Demo هنگام تنظیم متغیر، و اصلاح نام متریک و نمودار سفارش تا فروش وصول‌شده وانمود نشود. این تغییر به معنی تکمیل Gate 1 یا تأیید بصری نیست. Migration ندارد.

## تصمیم‌های باز و برنامه

۱. **P0:** ممیزی مرجعیت سفارش، موجودی و قیمت میان state document و commerce و مجوز هر mutation؛ جلوگیری از oversell و دور زدن audit. ۲. تعیین واحد پول و تبدیل gateway، زمان hold و پرداخت، سیاست ارسال/مرجوعی/مالیات، کارمزد و loyalty با مالک و provider؛ تنظیمات فعلی به‌خودی‌خود تأیید سیاست نیستند. ۳. اجرای Gate 1 با مرورگر واقعی و screenshot و اصلاحات؛ بررسی تمرکز و تعامل‌های جدول و فیلتر. ۴. Gate 2 کاتالوگ/واریانت/ledger؛ Gate 3 پرداخت/fulfilment/RMA؛ Gate 4 مشتری/بازاریابی؛ Gate 5 CMS/Studio/Style به برش‌های کوچک با ماتریس پوشش؛ Gate 6 hardening، backup/restore و پذیرش. پرداخت، stock، RBAC و publish پرریسک و نیازمند integration/security test هستند.

Rollback این patch: بازگرداندن فایل‌های تغییر یافته به commit پایه؛ schema یا داده دستکاری نشده است. هرگز دیتابیس آزمایشی را به production وصل نکنید.
