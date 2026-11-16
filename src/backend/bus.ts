// Bounded single-process in-memory fan-out (stand-in for the authenticated WebSocket endpoint).
// Single-process limitation documented in docs/architecture.md.
import type { StoredMeasurement } from '../domain/types';
import { ApiError, canAccessAstronaut, resolveSession } from './auth';
import { db } from './store';

export type DeliveryMode = 'live' | 'backfill';
interface Sub {
  id: number;
  sid: string;
  astronautIds: Set<string>;
  cursor: number;
  listener: (m: StoredMeasurement, mode: DeliveryMode) => void;
  onClose: (reason: string) => void;
}

const MAX_SUBSCRIBERS = 50;
const subs = new Map<number, Sub>();
let nextId = 1;

/** Authenticated, re-authorized, resumable subscription. Throws 403 for any unauthorized astronaut. */
export function subscribe(sid: string, origin: string, allowedOrigins: string[], astronautIds: string[], sinceCursor: number, listener: Sub['listener'], onClose: Sub['onClose']): { unsubscribe: () => void; cursor: number } {
  if (!allowedOrigins.includes(origin)) throw new ApiError(403, 'bad_origin', 'Origin not allowed.');
  const { user } = resolveSession(sid);
  for (const a of astronautIds) if (!canAccessAstronaut(user, a, 'monitoring')) throw new ApiError(403, 'forbidden', `Not authorized to subscribe to ${a}.`);
  if (subs.size >= MAX_SUBSCRIBERS) throw new ApiError(503, 'too_many_subscribers', 'Subscriber limit reached.');
  const sub: Sub = { id: nextId++, sid, astronautIds: new Set(astronautIds), cursor: sinceCursor, listener, onClose };
  // Resume: deterministic replay in ingest order from cursor.
  if (sinceCursor > 0) {
    for (const m of db.measurements) {
      if (m.ingest_seq > sinceCursor && sub.astronautIds.has(m.astronaut_id)) { listener(m, 'backfill'); sub.cursor = m.ingest_seq; }
    }
  } else sub.cursor = db.ingestSeq;
  subs.set(sub.id, sub);
  return { unsubscribe: () => subs.delete(sub.id), cursor: sub.cursor };
}

export function publish(m: StoredMeasurement) {
  for (const sub of [...subs.values()]) {
    if (!sub.astronautIds.has(m.astronaut_id)) continue;
    try {
      const { user } = resolveSession(sub.sid);
      if (!canAccessAstronaut(user, m.astronaut_id, 'monitoring')) throw new ApiError(403, 'forbidden', 'Access removed');
    } catch (e) {
      subs.delete(sub.id);
      sub.onClose(e instanceof ApiError ? e.message : 'closed');
      continue;
    }
    sub.cursor = m.ingest_seq;
    sub.listener(m, m.backfilled ? 'backfill' : 'live');
  }
}

export function subscriberCount() { return subs.size; }
export function closeAll(reason: string) { for (const s of subs.values()) s.onClose(reason); subs.clear(); }

/* ---------------- Throttled UI invalidation (batched display cadence) ---------------- */
const listeners = new Set<() => void>();
let version = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
export function onChange(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function getVersion() { return version; }
export function emitChange(immediate = false) {
  if (immediate) { if (pending) { clearTimeout(pending); pending = null; } version++; listeners.forEach((l) => l()); return; }
  if (pending) return;
  pending = setTimeout(() => { pending = null; version++; listeners.forEach((l) => l()); }, 1000);
}
