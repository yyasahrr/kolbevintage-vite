/** Calendar days are Gregorian ISO dates, not instants. ICU supplies Persian leap years. */
const partsFormatter = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { timeZone: "UTC", year:"numeric", month:"numeric", day:"numeric" });
const labelFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone:"UTC", year:"numeric", month:"long", day:"numeric" });
const monthFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { timeZone:"UTC", year:"numeric", month:"long" });
const isoFormatter = new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Tehran", year:"numeric", month:"2-digit", day:"2-digit" });
export const todayTehran = (now = new Date()) => isoFormatter.format(now);
export const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0,10); };
export function persianParts(iso: string) { const p = partsFormatter.formatToParts(new Date(`${iso}T12:00:00Z`)); const get = (type: string) => Number(p.find(x => x.type === type)?.value); return { year:get("year"), month:get("month"), day:get("day") }; }
export const persianDate = (iso: string) => labelFormatter.format(new Date(`${iso}T12:00:00Z`));
export const persianMonth = (iso: string) => monthFormatter.format(new Date(`${iso}T12:00:00Z`));
export const monthStart = (iso: string) => addDays(iso, 1 - persianParts(iso).day);
export function monthDays(iso: string) { const start = monthStart(iso); const m = persianParts(start).month; const days: string[] = []; let d = start; while (persianParts(d).month === m && days.length < 32) { days.push(d); d = addDays(d, 1); } return days; }
export const saturdayOffset = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 1) % 7;
