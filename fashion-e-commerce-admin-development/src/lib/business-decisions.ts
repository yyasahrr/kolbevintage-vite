export interface TryOnModelSpec {
  id: string;
  title: string;
  subtitle: string;
  approvalStatus: "pending_business_decision";
  userJourney: string;
  customerEligibility: string;
  adminControls: string;
  packageDefinition: string;
  usageCounting: string;
  expirationPolicy: string;
  paymentAndRefund: string;
  operationalWorkflow: string;
  privacyImplications: string;
  integrationDependencies: string;
}

export const TRY_ON_MODELS: TryOnModelSpec[] = [
  {
    id: "virtual_ai_fitting",
    title: "مدل ۱: پرو مجازی هوش مصنوعی (تصویر مشتری + تن‌خور دیجیتال)",
    subtitle: "Virtual Fitting via Image Processing / AI",
    approvalStatus: "pending_business_decision",
    userJourney:
      "مشتری در صفحه محصول روی «پرو مجازی روی تصویر من» کلیک می‌کند، یک تصویر قدی بارگذاری کرده و خروجی ترکیبی لباس روی بدن خود را مشاهده می‌کند.",
    customerEligibility:
      "مشتریان احرازشده دارای بسته فعال پرو یا سهمیه رایگان خوش‌آمدگویی؛ محدود به دسته‌های بالاپوش و پیراهن.",
    adminControls:
      "تنظیم سهمیه روزانه پردازش GPU، فعال‌سازی روی محصولات دارای تصویر استاندارد روبه‌رو، مشاهده لاگ خطای پردازش.",
    packageDefinition:
      "بسته ۵ بار مصرف (مثال: ۱۴۹,۰۰۰ تومان) یا بسته ۱۵ بار مصرف ماهانه؛ غیرقابل انتقال به غیر.",
    usageCounting:
      "کسر اعتبار فقط پس از تولید موفق تصویر خروجی (Success Callback)؛ خطای سرور اعتبار کسر نمی‌کند.",
    expirationPolicy:
      "اعتبار ۹۰ روز از تاریخ خرید بسته با هشدار پیامکی ۷ روز پیش از انقضا.",
    paymentAndRefund:
      "پرداخت آنلاین مجزا یا همراه سبد خرید؛ بازپرداخت فقط برای اعتبارهای مصرف‌نشده ظرف ۷ روز مطابق قانون تجارت الکترونیک.",
    operationalWorkflow:
      "کاملاً خودکار بدون درگیری انبار فیزیکی؛ نیازمند تایید کیفیت تصاویر مرجع توسط تیم کاتالوگ.",
    privacyImplications:
      "حساسیت بسیار بالا: حذف خودکار تصویر خام کاربر پس از ۲۴ ساعت، رمزنگاری در حالت سکون، دریافت رضایت صریح پیش از آپلود.",
    integrationDependencies:
      "سرویس پردازش تصویر (VTON Engine)، ذخیره‌ساز امن موقت، درگاه پرداخت، سرویس سهمیه‌سنجی حساب کاربری.",
  },
  {
    id: "at_home_trial",
    title: "مدل ۲: پرو فیزیکی در منزل پیش از خرید قطعی",
    subtitle: "At-Home Physical Garment Trial",
    approvalStatus: "pending_business_decision",
    userJourney:
      "مشتری حداکثر ۳ قلم کالا را برای پرو در منزل سفارش می‌دهد، پیک منتظر می‌ماند یا ۲۴ ساعت مهلت بازگشت دارد و فقط هزینه اقلام تاییدشده نهایی می‌شود.",
    customerEligibility:
      "فقط مشتریان سطح VIP یا دارای حداقل ۲ سفارش موفق قبلی در شهر تهران و کرج.",
    adminControls:
      "تعیین سقف تعداد کالا در بسته پرو، مبلغ ودیعه/مسدودسازی اعتبار، تایید بازگشت سالم کالا در انبار.",
    packageDefinition:
      "بسته اشتراک فصلی ۵ نوبت ارسال رایگان پرو در منزل بدون کارمزد پیک.",
    usageCounting:
      "ثبت مصرف به محض تحویل بسته پرو به مشتری توسط سفیر ارسال.",
    expirationPolicy:
      "اعتبار ۶ ماهه فصلی؛ تمدید خودکار فقط با تایید کاربر.",
    paymentAndRefund:
      "پیش‌تایید اعتبار (Pre-authorization) یا ودیعه امانی؛ تسویه نهایی پس از ثبت نتیجه پرو توسط سفیر.",
    operationalWorkflow:
      "پیچیدگی بالای انبار: رزرو موقت موجودی، پلمب امنیتی اتیکت، کنترل کیفیت فوری پس از بازگشت کالا و بازگرداندن به موجودی قابل فروش.",
    privacyImplications:
      "نیاز به احراز هویت کد ملی و آدرس دقیق تاییدشده برای جلوگیری از ریسک مفقودی کالا.",
    integrationDependencies:
      "ماژول رزرو موقت انبار (Agent 2)، ناوگان پیک اختصاصی (Agent 1)، درگاه بانکی با قابلیت مسدودسازی وجه.",
  },
  {
    id: "appointment_fitting",
    title: "مدل ۳: رزرو وقت پرو حضوری در شوروم کلبه وینتیج",
    subtitle: "Appointment-Based Showroom Fitting",
    approvalStatus: "pending_business_decision",
    userJourney:
      "مشتری کالاهای مورد نظر را انتخاب کرده، بازه زمانی ۶۰ دقیقه‌ای در شوروم رزرو می‌کند و هنگام مراجعه کالاها آماده پرو هستند.",
    customerEligibility:
      "کلیه کاربران ثبت‌نام‌شده با شماره موبایل تاییدشده و پرداخت بیعانه رزرو وقت.",
    adminControls:
      "مدیریت تقویم ظرفیت اتاق پرو، تخصیص استایلیست، آماده کردن کالاها از انبار به شوروم.",
    packageDefinition:
      "بسته ۵ جلسه استایلینگ و پرو اختصاصی با مشاور مد.",
    usageCounting:
      "ثبت حضور (Check-in) توسط اپراتور شوروم یا عدم حضور بدون لغو ۲۴ ساعته (No-show).",
    expirationPolicy:
      "اعتبار ۱۲۰ روزه از زمان فعال‌سازی بسته.",
    paymentAndRefund:
      "بیعانه رزرو قابل کسر از فاکتور خرید حضوری؛ بازگشت وجه در صورت لغو بیش از ۲۴ ساعت قبل از نوبت.",
    operationalWorkflow:
      "حواله انتقال موقت بین انبار مرکزی و قفسه رزرو شوروم؛ ثبت خرید حضوری در صندوق متصل به OMS.",
    privacyImplications:
      "ذخیره ترجیحات سایز و یادداشت استایلیست با دسترسی محدود به نقش پشتیبانی و طراح.",
    integrationDependencies:
      "تقویم رزرواسیون، انتقال بین‌انباری، پیامک یادآور نوبت.",
  },
  {
    id: "prepaid_digital_service",
    title: "مدل ۴: بسته خدمات مشاوره سایز و استایل دیجیتال (پیش‌پرداخت)",
    subtitle: "Prepaid Usage-Limited Digital Styling & Size Service",
    approvalStatus: "pending_business_decision",
    userJourney:
      "مشتری فرم اندازه‌های بدن و عکس استایل فعلی را ارسال می‌کند و استایلیست کلبه وینتیج سایز دقیق و ترکیب ست پیشنهادی را تایید می‌کند.",
    customerEligibility:
      "تمامی مشتریان فروشگاه بدون محدودیت جغرافیایی.",
    adminControls:
      "صف درخواست‌های مشاوره سایز، تخصیص به کارشناس مد، ثبت نتیجه سایز تاییدشده در پروفایل CRM مشتری.",
    packageDefinition:
      "بسته ۵ درخواست مشاوره تخصصی سایز و ست‌بندی (۲۹۰,۰۰۰ تومان).",
    usageCounting:
      "کسر یک واحد پس از ثبت پاسخ تاییدشده کارشناس و ارسال به مشتری.",
    expirationPolicy:
      "بدون انقضا تا پایان سال مالی یا ۱۸۰ روز از زمان خرید.",
    paymentAndRefund:
      "پرداخت آنلاین استاندارد؛ غیرقابل بازگشت پس از ارائه مشاوره مکتوب.",
    operationalWorkflow:
      "کارتابل بررسی انسانی در پنل ادمین بدون درگیری انبار یا پردازشگر AI پرهزینه.",
    privacyImplications:
      "نگهداری امن اندازه‌های بدن در پروفایل CRM با امکان حذف درخواست‌شده توسط کاربر.",
    integrationDependencies:
      "پروفایل سایز مشتری در CRM، سیستم تیکت/کارتابل داخلی و اطلاع‌رسانی پیامکی.",
  },
];

export interface BusinessDecisionItem {
  id: string;
  domain: string;
  title: string;
  status: "pending_approval" | "contract_defined" | "blocked_external";
  owner: string;
  summary: string;
  guardrailInUi: string;
}

export const BUSINESS_DECISION_REGISTER: BusinessDecisionItem[] = [
  {
    id: "BD-01",
    domain: "پرو مجازی (Try-On)",
    title: "انتخاب مدل تجاری نهایی بین پرو هوش مصنوعی، پرو در منزل، شوروم یا مشاوره دیجیتال",
    status: "pending_approval",
    owner: "مدیریت محصول و تیم تجاری",
    summary:
      "مدل عملیاتی، هزینه پردازش/لجستیک، سیاست بازپرداخت بسته ۵ مصرفی و حریم خصوصی تصاویر هنوز تصویب نشده است.",
    guardrailInUi:
      "ماژول Try-On به صورت مستند تصمیم و پیش‌نمایش غیرعملیاتی نمایش داده می‌شود و هیچ پردازشگر جعلی اجرا نمی‌گردد.",
  },
  {
    id: "BD-02",
    domain: "ست‌ها و استایل‌ها (Outfits)",
    title: "قواعد قیمت‌گذاری خرید جزئی ست و بازگشت تک‌قلم",
    status: "pending_approval",
    owner: "Agent 2 (کاتالوگ) و تیم مالی",
    summary:
      "تعیین اینکه آیا قیمت ثابت ست فقط در خرید کامل اقلام اجباری اعمال می‌شود یا تخفیف درصدی روی اقلام مجزا سرشکن می‌گردد.",
    guardrailInUi:
      "موجودی ست مستقل ساخته نمی‌شود و رزرو انبار دقیقاً از SKUهای زیرمجموعه انجام می‌پذیرد.",
  },
  {
    id: "BD-03",
    domain: "جشنواره‌ها و تخفیف‌ها",
    title: "قانون تجمیع (Stacking) تخفیف مستقیم SKU با کد تخفیف جشنواره",
    status: "pending_approval",
    owner: "Agent 1 (OMS) و مدیر بازاریابی",
    summary:
      "تعیین اولویت اعمال بین تخفیف صریح سطح SKU (tri-state) و تخفیف سبد خرید جشنواره.",
    guardrailInUi:
      "در ویرایشگر کمپین، هشدار صریح عدم تجمیع و محدودیت ظرفیت سمت سرور نمایش داده می‌شود.",
  },
  {
    id: "BD-04",
    domain: "پرداخت اعتباری (BNPL)",
    title: "اتصال رسمی درگاه‌های دیجی‌پی (Digipay) و اسنپ‌پی (SnappPay)",
    status: "blocked_external",
    owner: "Agent 1 (پرداخت) و واحد مالی",
    summary:
      "قرارداد تجاری، کلیدهای محیط عملیاتی و مستندات وب‌سرویس تسویه اقساطی در انتظار تایید نهایی است.",
    guardrailInUi:
      "وضعیت این درگاه‌ها به صورت شفاف «در انتظار قرارداد و تایید فنی» نمایش داده می‌شود و دکمه فعال‌سازی جعلی ندارد.",
  },
  {
    id: "BD-05",
    domain: "واحد پول تاریخی (IRR / IRT)",
    title: "تفکیک مبالغ ریال (IRR) و تومان (IRT) در سفارش‌های قدیمی مهاجرت‌یافته",
    status: "contract_defined",
    owner: "واحد مالی و مهندسی داده",
    summary:
      "تمامی سفارش‌های جدید با واحد صریح IRT (تومان) ثبت می‌شوند و تبدیل خودکار روی رکوردهای تاریخی بدون برچسب واحد ممنوع است.",
    guardrailInUi:
      "در داشبورد مالی و جزئیات سفارش، برچسب واحد پول تاییدشده و تفکیک «ارزش سفارش ثبت‌شده» از «پرداخت تاییدشده بانکی» رعایت شده است.",
  },
  {
    id: "BD-06",
    domain: "استودیو طراحی و پک‌های ظاهری (Style Packs)",
    title: "تضمین سازگاری پک‌های ظاهری فروشگاه با ویجت‌های Agent 3",
    status: "contract_defined",
    owner: "Agent 3 (Site Studio) و Agent 4 (طراحی)",
    summary:
      "پک‌های ظاهری (Soft UI، Glassmorphism، Editorial، Bento و...) فقط توکن‌های ویترین فروشگاه را تغییر می‌دهند و پوسته عملیاتی پنل ادمین ثابت می‌ماند.",
    guardrailInUi:
      "پیش‌نمایش، بررسی سازگاری قالب‌ها و بازگشت به نسخه قبلی (Rollback) از طریق قرارداد انتشار Agent 3 طراحی شده است.",
  },
];
