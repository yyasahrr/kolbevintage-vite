// Never return raw database errors: they can contain usernames, hosts, or URLs.
export function describeDemoConnectionError(error) {
  const code=typeof error?.code==='string'?error.code:'';
  const message=typeof error?.message==='string'?error.message:'';
  if (code==='28P01' || /password authentication failed/i.test(message)) return 'احراز هویت ناموفق بود؛ رمز اختصاصی demo_password را بررسی کنید.';
  if (/tenant or user not found/i.test(message)) return 'Supabase نقش دمو یا پروژه را در pooler پیدا نکرد؛ URI پیش‌فرض همان پروژه را بررسی کنید.';
  if (['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','ECONNRESET'].includes(code) || /connection timeout|timeout expired|terminated due to connection timeout/i.test(message)) return 'ارتباط شبکه با پایگاه برقرار نشد؛ اینترنت، DNS یا دسترسی شبکه را بررسی کنید.';
  if (/CERT|TLS|SSL|SELF_SIGNED|VERIFY_LEAF/i.test(code) || /certificate verify failed|self.signed certificate|unable to verify the first certificate/i.test(message)) return 'اعتبارسنجی گواهی TLS ناموفق بود؛ تنظیمات گواهی سیستم را بررسی کنید.';
  if(code==='42501')return 'نقش دمو مجوز لازم برای بررسی را ندارد.';
  return 'علت اتصال مشخص نشد؛ داده‌ها در این بررسی تغییر نکردند.';
}
