#!/usr/bin/env node
// Historical implementation truncated *all* commerce data, not just demos,
// and could destroy real orders. Retired fail-closed; do not reconnect it to
// production. Provision a new isolated empty database instead.
console.error("این دستور متوقف شده است: حذف کلی می‌تواند سفارش‌ها و محصولات واقعی را پاک کند. هیچ تغییری اعمال نشد.");
console.error("برای فروشگاه تازه از پایگاه مستقل و دستور provision:store استفاده کنید؛ برای داده موجود، پاک‌سازی و مهاجرت باید جداگانه طراحی و تأیید شود.");
process.exitCode = 1;
