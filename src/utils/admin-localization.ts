import { toLatinDigits } from "./date";
export { toLatinDigits };
export const faNumber = (n: number) => n.toLocaleString("fa-IR");
export function formatRecordedMoney(value: string | null, currency: string | null) {
  if (value == null) return "نامشخص";
  const unit: Record<string,string> = { IRT:"تومان", IRR:"ریال", EUR:"یورو", USD:"دلار" };
  const [integer, fraction] = value.split(".");
  const number = integer.replace(/\B(?=(\d{3})+(?!\d))/g, "٬") + (fraction && Number(fraction) !== 0 ? `٫${fraction}` : "");
  return `${number.replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])} ${currency ? unit[currency] ?? currency : "ارز نامشخص"}`;
}
export const orderStatusLabel = (s: string | null) => { const labels: Record<string,string> = { pending_payment:"در انتظار پرداخت", paid:"پرداخت‌شده", preparing:"آماده‌سازی", shipped:"ارسال‌شده", delivered:"تحویل‌شده", cancelled:"لغوشده", exception:"نیازمند بررسی", pending:"در انتظار", processing:"در حال پردازش", done:"تکمیل‌شده", settled:"تسویه‌شده", unpaid:"پرداخت‌نشده", unfulfilled:"انجام‌نشده", picking:"برداشت", packed:"بسته‌بندی‌شده" }; return s ? labels[s] ?? "نامشخص" : "نامشخص"; };
