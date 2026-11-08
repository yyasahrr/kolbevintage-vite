/** Safe direct video references: no executable schemes, credentials or paths outside uploads. */
export function isSafeVideoUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u0020\\]/.test(value)) return false;
  if (/^\/uploads\/[a-zA-Z0-9._-]+\.(mp4|webm|mov)$/i.test(value)) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
