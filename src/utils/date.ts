/* ------------------------------------------------------------------ */
/* Persian (Jalali) calendar helpers — no extra dependency needed:     */
/* the platform ships the persian calendar inside Intl.                 */
/* ------------------------------------------------------------------ */

const JALALI_DATE = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "long",
  day: "numeric",
  numberingSystem: "latn",
});

const JALALI_SHORT = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  numberingSystem: "arabext",
});

const JALALI_TIME = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  numberingSystem: "arabext",
});

const WEEKDAY = new Intl.DateTimeFormat("fa-IR", { weekday: "long" });

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));

/** «۱۲ آبان ۱۴۰۵» — the date format used across the shop and the panel */
export function formatJalali(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return JALALI_DATE.format(date).replace(/\u200f/g, "");
}

/** «۱۴۰۵/۰۸/۱۲» */
export function formatJalaliShort(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return JALALI_SHORT.format(date).replace(/\u200f/g, "");
}

/** «۱۲ آبان ۱۴۰۵ · ۱۴:۳۰» */
export function formatJalaliDateTime(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${formatJalali(date)} · ${JALALI_TIME.format(date).replace(/\u200f/g, "")}`;
}

export function weekdayName(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";
  return WEEKDAY.format(date);
}

/** «۳ روز پیش» — coarse but friendly, used in lists */
export function relativeJalali(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const day = 86_400_000;
  if (diff < 60_000) return "همین حالا";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000).toLocaleString("fa-IR")} دقیقه پیش`;
  if (diff < day) return `${Math.floor(diff / 3_600_000).toLocaleString("fa-IR")} ساعت پیش`;
  if (diff < 7 * day) return `${Math.floor(diff / day).toLocaleString("fa-IR")} روز پیش`;
  return formatJalali(date);
}

/** days left until a deadline, already phrased in Persian */
export function daysLeftLabel(value: string | number | Date): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "امروز آخرین روز";
  return `${days.toLocaleString("fa-IR")} روز مانده`;
}
