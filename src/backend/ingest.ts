import { FUTURE_SKEW_TOLERANCE_MS, MEASUREMENTS, SCHEMA_VERSIONS_SUPPORTED } from '../domain/config';
import { convertUnit, payloadHash, randomId } from '../domain/logic';
import type { IntegrityEvent, IntegrityKind, MeasurementType, StoredMeasurement, TelemetryEnvelope } from '../domain/types';
import { publish, emitChange } from './bus';
import { evaluateIntegrity, evaluateMeasurement } from './rules';
import { clock, db, hashOf, indexMeasurement } from './store';

export type IngestOutcome = 'accepted' | 'duplicate' | 'quarantined' | 'rejected';
export interface IngestResult { event_id: string | null; outcome: IngestOutcome; reason?: IntegrityKind; ingest_seq?: number }

const ORIGINS = ['simulated', 'device', 'manual', 'imported', 'derived'];
const MODES = ['continuous', 'periodic', 'event_based', 'manual', 'derived', 'imported'];
const VALIDITY = ['valid', 'questionable', 'invalid', 'missing_value', 'sensor_fault', 'unknown'];
const QUALITY = ['good', 'questionable', 'poor', 'unknown'];

export function recordIntegrity(kind: IntegrityKind, detail: string, e: Partial<TelemetryEnvelope> | null, payload?: unknown): IntegrityEvent {
  const evt: IntegrityEvent = { id: randomId(), kind, at: clock.iso(), stream_id: (e?.stream_id as string) ?? null, astronaut_id: (e?.astronaut_id as string) ?? null, event_id: (e?.event_id as string) ?? null, detail, quarantined_payload: payload };
  db.integrity.unshift(evt);
  if (db.integrity.length > 2000) db.integrity.length = 2000;
  evaluateIntegrity(evt);
  return evt;
}

/** Structural validation of the wire envelope (stand-in for the Pydantic model). */
export function validateEnvelope(x: unknown): string[] {
  const errs: string[] = [];
  if (!x || typeof x !== 'object') return ['payload is not an object'];
  const e = x as Record<string, unknown>;
  const str = (k: string) => { if (typeof e[k] !== 'string' || !(e[k] as string).length) errs.push(`${k} must be a non-empty string`); };
  ['event_id', 'schema_version', 'astronaut_id', 'sensor_id', 'stream_id', 'measurement_type', 'measured_at', 'measurement_method', 'device_class'].forEach(str);
  if (e.sequence_number !== null && !(Number.isInteger(e.sequence_number) && (e.sequence_number as number) >= 0)) errs.push('sequence_number must be a non-negative integer or null');
  if (e.raw_value !== null && typeof e.raw_value !== 'number') errs.push('raw_value must be number or null');
  if (typeof e.raw_value === 'number' && !Number.isFinite(e.raw_value)) errs.push('raw_value must be finite');
  if (e.raw_unit !== null && typeof e.raw_unit !== 'string') errs.push('raw_unit must be string or null');
  if (!ORIGINS.includes(e.data_origin as string)) errs.push('data_origin invalid');
  if (!MODES.includes(e.acquisition_mode as string)) errs.push('acquisition_mode invalid');
  if (!VALIDITY.includes(e.validity_state as string)) errs.push('validity_state invalid');
  if (!QUALITY.includes(e.quality_state as string)) errs.push('quality_state invalid');
  if (typeof e.measured_at === 'string' && Number.isNaN(Date.parse(e.measured_at))) errs.push('measured_at not a valid timestamp');
  if (!e.measurement_context || typeof e.measurement_context !== 'object') errs.push('measurement_context required');
  if (!['pre_flight', 'in_flight', 'post_flight'].includes(e.mission_phase as string)) errs.push('mission_phase invalid');
  return errs;
}

export function ingestOne(raw: unknown, via: 'live' | 'replay'): IngestResult {
  const errs = validateEnvelope(raw);
  const partial = (raw && typeof raw === 'object' ? raw : {}) as Partial<TelemetryEnvelope>;
  if (errs.length) { recordIntegrity('schema_invalid', `Rejected: ${errs.slice(0, 3).join('; ')}`, partial, raw); return { event_id: partial.event_id ?? null, outcome: 'rejected', reason: 'schema_invalid' }; }
  const e = raw as TelemetryEnvelope;
  if (!SCHEMA_VERSIONS_SUPPORTED.includes(e.schema_version)) { recordIntegrity('unsupported_schema', `Schema ${e.schema_version} unsupported`, e, raw); return { event_id: e.event_id, outcome: 'rejected', reason: 'unsupported_schema' }; }
  if (e.data_origin === 'simulated' && !e.simulation_scenario_id) { recordIntegrity('provenance_invalid', 'Simulated record without simulation_scenario_id', e, raw); return { event_id: e.event_id, outcome: 'rejected', reason: 'provenance_invalid' }; }
  if (!db.astronauts.some((a) => a.id === e.astronaut_id)) { recordIntegrity('schema_invalid', `Unknown astronaut_id`, e, raw); return { event_id: e.event_id, outcome: 'rejected', reason: 'schema_invalid' }; }
  const def = MEASUREMENTS[e.measurement_type as MeasurementType];
  if (!def) { recordIntegrity('unknown_measurement_type', `Unknown measurement type "${e.measurement_type}"`, e, raw); return { event_id: e.event_id, outcome: 'quarantined', reason: 'unknown_measurement_type' }; }
  if (e.raw_value !== null && (e.raw_unit === null || !def.allowedUnits.includes(e.raw_unit))) { recordIntegrity('unknown_unit', `Unit "${e.raw_unit}" not registered for ${e.measurement_type}. Quarantined; no conversion inferred.`, e, raw); return { event_id: e.event_id, outcome: 'quarantined', reason: 'unknown_unit' }; }
  const now = clock.now();
  if (Date.parse(e.measured_at) - now > FUTURE_SKEW_TOLERANCE_MS) { recordIntegrity('future_timestamp', `measured_at ${e.measured_at} exceeds skew tolerance (${FUTURE_SKEW_TOLERANCE_MS} ms). Original timestamp preserved in quarantine.`, e, raw); return { event_id: e.event_id, outcome: 'quarantined', reason: 'future_timestamp' }; }

  // Idempotency: event_id and (stream_id, sequence_number)
  const hash = payloadHash(e as unknown as Record<string, unknown>);
  const byId = db.byEventId.get(e.event_id);
  const byKey = e.sequence_number !== null ? db.byStreamSeq.get(`${e.stream_id}#${e.sequence_number}`) : undefined;
  const existing = byId ?? byKey;
  if (existing) {
    if (hashOf(existing) === hash && (!byId || !byKey || byId === byKey)) {
      return { event_id: e.event_id, outcome: 'duplicate', reason: 'duplicate_ignored', ingest_seq: existing.ingest_seq };
    }
    recordIntegrity('conflict_quarantined', `Idempotency key collision with different payload (stream ${e.stream_id} seq ${e.sequence_number}). Neither record overwritten.`, e, raw);
    return { event_id: e.event_id, outcome: 'quarantined', reason: 'conflict_quarantined' };
  }

  const stream = db.streams.get(e.stream_id);
  let outOfOrder = false;
  if (stream && e.sequence_number !== null) {
    if (e.sequence_number < stream.max_seq) { outOfOrder = true; db.integrity.unshift({ id: randomId(), kind: 'out_of_order', at: clock.iso(), stream_id: e.stream_id, astronaut_id: e.astronaut_id, event_id: e.event_id, detail: `seq ${e.sequence_number} arrived after ${stream.max_seq}; stored in measurement-time order.` }); }
    else if (e.sequence_number > stream.max_seq + 1 && stream.max_seq >= 0) db.integrity.unshift({ id: randomId(), kind: 'sequence_gap', at: clock.iso(), stream_id: e.stream_id, astronaut_id: e.astronaut_id, event_id: e.event_id, detail: `Missing seq ${stream.max_seq + 1}–${e.sequence_number - 1} (may arrive late).` });
  }
  const conv = convertUnit(def.type, e.raw_value, e.raw_unit);
  const receivedGround = clock.iso();
  const lag = now - Date.parse(e.measured_at);
  const stored: StoredMeasurement = {
    ...e, measurement_context: { ...e.measurement_context }, received_at_ground: receivedGround, ingest_seq: ++db.ingestSeq,
    backfilled: (via === 'replay' && lag > 5_000) || lag > 30_000, out_of_order: outOfOrder, payload_hash: hash, ...conv,
  };
  indexMeasurement(stored);
  publish(stored);
  evaluateMeasurement(stored);
  return { event_id: e.event_id, outcome: 'accepted', ingest_seq: stored.ingest_seq };
}

/** POST /api/v1/telemetry/ingest-batches equivalent (gateway-authenticated in a real deployment). */
export function ingestBatch(events: unknown[], via: 'live' | 'replay' = 'live') {
  const results = events.map((ev) => ingestOne(ev, via));
  emitChange();
  return {
    results,
    accepted: results.filter((r) => r.outcome === 'accepted').length,
    duplicates: results.filter((r) => r.outcome === 'duplicate').length,
    quarantined: results.filter((r) => r.outcome === 'quarantined').length,
    rejected: results.filter((r) => r.outcome === 'rejected').length,
  };
}
