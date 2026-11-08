import {query} from './db';
export const DEFAULT_PANEL_PATH='/panel';
// Isolated namespace: never collides with the API, uploads or storefront assets.
export const validPanelPath=(v:unknown):v is string=>typeof v==='string' && (v===DEFAULT_PANEL_PATH || /^\/manage\/[a-z0-9][a-z0-9-]{3,39}$/.test(v));
export async function panelPath():Promise<string>{
  const row=(await query<{value:unknown}>("select value from state_documents where key='panel_entry'")).rows[0];
  if(!row)return DEFAULT_PANEL_PATH;
  const value=row.value as {path?:unknown}|null;
  if(!value || !validPanelPath(value.path))throw new Error('Invalid panel entry configuration.');
  return value.path;
}
