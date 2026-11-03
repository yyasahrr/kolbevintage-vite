/* =====================================================================
   Remote persistence bridge.

   The admin/ops stores stay synchronous for the whole UI; commit() hands the
   new snapshot to whatever remote handler is registered. That keeps the demo
   working offline (no handler = localStorage only) while the real backend can
   be plugged in by importing `state/sync` at boot.
   ===================================================================== */

export type RemoteKind = "admin" | "ops";

type Pusher = (value: unknown) => void;

const pushers = new Map<RemoteKind, Pusher>();

export function registerRemote(kind: RemoteKind, fn: Pusher) {
  pushers.set(kind, fn);
}

export function pushRemote(kind: RemoteKind, value: unknown) {
  pushers.get(kind)?.(value);
}
