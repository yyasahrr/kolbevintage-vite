#!/usr/bin/env node
/* =====================================================================
   Restore a logical backup into the configured database.

     npm run restore -- server/.backups/kv-manual-2026-11-04-1200.json.gz

   It stops on any error, prints what it replaced, and refuses to run without
   --yes so a shell history mishap cannot wipe a live shop.
   ===================================================================== */
const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error("راهنما: npm run restore -- <file.json.gz> --yes");
  process.exit(1);
}
const args=process.argv.slice(3);
if (args.some(arg=>arg!=="--yes" && arg!=="--allow-empty-journal") || new Set(args).size!==args.length) {
  console.error("گزینهٔ ناشناخته یا تکراری است؛ هیچ بازیابی انجام نشد.");
  process.exit(1);
}
const allowEmptyJournal=args.includes("--allow-empty-journal");
if (!args.includes("--yes")) {
  console.error(`این کار همهٔ داده‌های فعلی پایگاه ${process.env.DATABASE_URL ? "مشخص‌شده در DATABASE_URL" : (process.env.PGDATABASE ?? "kolbevintage")} را با فایل پشتیبان عوض می‌کند.`);
  console.error("برای انجام، همان دستور را با --yes اجرا کن.");
  process.exit(1);
}

if (allowEmptyJournal) console.error("هشدار: اگر پشتیبان جدول ژورنال نداشته باشد، همهٔ مقاله‌های پایگاه هدف حذف و ژورنال خالی بازیابی می‌شود. فقط پس از بررسی، روی پایگاه مستقل تمرین کنید.");

const { initDb, closeDb } = await import("../server/src/db.ts");
const { restoreBackup } = await import("../server/src/backup.ts");

await initDb();
try {
  const result = await restoreBackup(file, {allowEmptyJournalFromOlderBackup:allowEmptyJournal});
  console.log(`بازیابی تمام شد — ${result.tables} جدول، ${result.rows} ردیف.`);
  console.log("سرور را دوباره راه‌اندازی کن تا پروجکشن‌ها از نو ساخته شوند.");
} catch (error) {
  console.error("بازیابی ناموفق بود:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
