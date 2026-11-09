// Parse connection info without displaying any part of the supplied string.
// Credentials and SSL-related query parameters from it are intentionally not used.
export const PROJECT_REF = 'fpeixxuiidllpebixeif';
export function parseDemoUri(input) {
  let text = input.trim();
  text = text.replace(/^(?:psql\s+|(?:export\s+)?DATABASE_URL\s*=\s*)/, '');
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) text = text.slice(1, -1);
  let url;
  try { url = new URL(text); } catch { throw new Error('invalid_uri'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('invalid_uri');
  const host = url.hostname.toLowerCase();
  const direct = host === `db.${PROJECT_REF}.supabase.co`;
  const pooler = host.endsWith('.pooler.supabase.com');
  if (!(direct || pooler)) throw new Error('wrong_host');
  let user;
  try { user = decodeURIComponent(url.username); } catch { throw new Error('invalid_uri'); }
  if ((direct && user !== 'postgres') || (pooler && user !== `postgres.${PROJECT_REF}`)) throw new Error('wrong_user');
  if (Number(url.port || 5432) !== 5432) throw new Error('wrong_port');
  if (url.pathname !== '/postgres') throw new Error('wrong_database');
  return { host, port: 5432, user };
}
