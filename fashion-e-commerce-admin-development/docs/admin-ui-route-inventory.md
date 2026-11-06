# KolbeVintage V3 — Admin Route & Screen Inventory

| Route | Persian Module Title | Owner | Status |
|---|---|---|---|
| `/` | داشبورد عملیات | Agent 4 | BACKEND INTEGRATED |
| `/products` | فهرست تخصصی محصولات و ردیف‌های بازشونده SKU | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/products/new` | مرحله اول: ایجاد سریع پیش‌نویس محصول | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/products/[id]` | مرحله دوم: ویرایشگر ۷ بخشی محصول، ماتریس رنگ-سایز و رسانه رنگ | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/catalog/categories` | مدیریت درختی دسته‌بندی‌ها | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/catalog/colors` | کتابخانه رنگ‌های استاندارد | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/catalog/sizes` | الگوهای سایز و راهنمای اندازه‌گیری | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/catalog/outfits` | استایل‌ها و ست‌های لباس | Agent 2 + Agent 4 | BACKEND INTEGRATED (Pricing contract noted) |
| `/inventory` | موجودی کالا (SKU-Centered) و هشدارها | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/inventory/operations` | دریافت کالا، شمارش انبار و تایید اصلاح موجودی | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/inventory/ledger` | دفتر کل گردش کالا | Agent 2 + Agent 4 | BACKEND INTEGRATED |
| `/orders` | فهرست سفارش‌ها و پیش‌نمایش سریع | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/orders/[id]` | جزئیات کامل سفارش (ShopZen Hierarchy) | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/orders/manual` | ثبت سفارش دستی ۶ مرحله‌ای | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/orders/fulfillment` | ایستگاه برداشت (اسکن بارکد)، بسته‌بندی و ارسال | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/orders/print` | مرکز چاپ اسناد (برچسب ۱۰۰×۱۵۰mm و برگ بسته‌بندی) | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/returns` | مرجوعی جزئی، کنترل کیفیت و بازپرداخت | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/marketing/campaigns` | کمپین‌ها و جشنواره‌های فروش | Agent 4 | BACKEND INTEGRATED |
| `/marketing/sms` | پیامک مارکتینگ و گزارش تحویل DLR | Agent 4 | BACKEND INTEGRATED (DLR contract) |
| `/crm/customers` | مشتریان، گروه‌بندی و برچسب‌ها | Agent 4 | BACKEND INTEGRATED |
| `/content/blog` | بلاگ متنی و لوک‌بوک ویدیویی | Agent 3 + Agent 4 | BACKEND INTEGRATED |
| `/content/gallery` | گالری مشتریان و صف بازبینی | Agent 3 + Agent 4 | BACKEND INTEGRATED |
| `/appearance/style-packs` | پک‌های ظاهری ویترین (Style Packs) | Agent 3 + Agent 4 | FRONTEND READY (Agent 3 Handoff) |
| `/appearance/studio` | استودیو طراحی (پوسته لایه‌بندی Site Studio) | Agent 3 + Agent 4 | FRONTEND READY (Agent 3 Handoff) |
| `/finance` | نمای مالی، تراکنش‌ها و خروجی حسابداری | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/integrations` | مرکز اتصالات و درگاه‌های BNPL | Agent 1 + Agent 4 | BACKEND INTEGRATED / PENDING CONTRACT |
| `/rules` | قوانین فروش و محدودیت‌ها | Agent 1 + Agent 4 | BACKEND INTEGRATED |
| `/try-on` | مستند تصمیم تجاری پرو مجازی (Try-On) | Agent 4 | DESIGNED (Decision Required) |
| `/settings/staff` | کارکنان و ماتریس دسترسی RBAC | Agent 4 | BACKEND INTEGRATED |
| `/settings/audit` | گزارش فعالیت‌ها (Audit Logs) | Agent 4 | BACKEND INTEGRATED |
| `/settings` | تنظیمات فروشگاه و دفتر تصمیم‌های باز | Agent 4 | BACKEND INTEGRATED |
