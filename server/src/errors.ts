/* =====================================================================
   Server error ring — the health screen needs "what broke lately".

   A full log stack is the deployment's job; what the owner can act on is a
   short, in-process list of the last failures. Only 5xx land here, the ring
   is bounded, and nothing is written to disk.
   ===================================================================== */

export interface ServerErrorRow {
  at: string;
  method: string;
  url: string;
  status: number;
  message: string;
  code: string | null;
}

const LIMIT = 50;
const ring: ServerErrorRow[] = [];

export function recordServerError(row: Omit<ServerErrorRow, "at">) {
  ring.unshift({ ...row, at: new Date().toISOString() });
  if (ring.length > LIMIT) ring.length = LIMIT;
}

export function recentServerErrors(limit = LIMIT): ServerErrorRow[] {
  return ring.slice(0, Math.min(LIMIT, Math.max(1, Math.trunc(limit))));
}
