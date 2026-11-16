// SIMULATED edge gateway + scenario simulator. Not spacecraft software. Not a real device integration.
import { MEASUREMENTS, OUTBOX_CAPACITY, SIM_SEED, SIMULATOR_VERSION } from '../domain/config';
import { mulberry32, prngUuid } from '../domain/logic';
import type { LinkState, LinkStatus, MeasurementType, TelemetryEnvelope } from '../domain/types';
import { emitChange } from './bus';
import { ingestBatch, recordIntegrity } from './ingest';
import { evaluateLink } from './rules';
import { clock, db } from './store';

/* ---------------- Sensor adapter contract ---------------- */
export interface AdapterCapability { measurement_type: MeasurementType; unit: string; acquisition_mode: string; expected_cadence_s: number | null }
export interface SensorAdapter {
  readonly id: string;
  readonly version: string;
  describe(): { device_classes: string[]; capabilities: AdapterCapability[] };
  linkState(): LinkState;
  start(): void;
  stop(): void;
  poll(nowMs: number): TelemetryEnvelope[];
  validate(e: TelemetryEnvelope): string[];
  diagnostics(): { running: boolean; errors: string[]; emitted: number };
}

const LIVE_STREAMS: { type: MeasurementType; sensor: string; cadenceMs: number }[] = [
  { type: 'heart_rate', sensor: 'PATCH', cadenceMs: 4000 },
  { type: 'respiratory_rate', sensor: 'PATCH', cadenceMs: 4000 },
  { type: 'skin_temperature', sensor: 'BAND', cadenceMs: 8000 },
  { type: 'hrv_rmssd', sensor: 'PATCH', cadenceMs: 60000 },
];

export class SimulatorAdapter implements SensorAdapter {
  readonly id = 'sim-adapter';
  readonly version = SIMULATOR_VERSION;
  private rand = mulberry32(SIM_SEED + 7);
  private seq = new Map<string, number>();
  private lastEmit = new Map<string, number>();
  running = false;
  emitted = 0;
  scenario = 'live_normal_flow';
  skip = new Map<string, number>(); // stream -> events to drop (gap scenario)

  describe() {
    return { device_classes: ['wearable_ecg_patch', 'wrist_band', 'simulator'], capabilities: LIVE_STREAMS.map((s) => ({ measurement_type: s.type, unit: MEASUREMENTS[s.type].unit, acquisition_mode: MEASUREMENTS[s.type].acquisition_mode, expected_cadence_s: s.cadenceMs / 1000 })) };
  }
  linkState(): LinkState { return 'connected'; }
  start() { this.running = true; }
  stop() { this.running = false; }
  validate(e: TelemetryEnvelope) { return e.data_origin === 'simulated' && e.simulation_scenario_id ? [] : ['simulated provenance missing']; }
  diagnostics() { return { running: this.running, errors: [], emitted: this.emitted }; }

  nextSeq(stream: string): number {
    if (!this.seq.has(stream)) this.seq.set(stream, (db.streams.get(stream)?.max_seq ?? -1) + 1);
    const s = this.seq.get(stream)!;
    this.seq.set(stream, s + 1);
    return s;
  }

  envelope(astronautId: string, type: MeasurementType, value: number | null, t: number, over: Partial<TelemetryEnvelope> = {}): TelemetryEnvelope {
    const def = MEASUREMENTS[type];
    const n = astronautId.slice(-3);
    const sensor = type === 'demo_marker' ? `SIM-${n}` : `${type === 'skin_temperature' ? 'BAND' : type === 'spo2' ? 'OXI' : 'PATCH'}-${n}`;
    const stream = `${astronautId}:${type}:${sensor}`;
    const mission = db.astronauts.find((a) => a.id === astronautId)?.mission_id ?? null;
    return {
      event_id: prngUuid(this.rand), schema_version: '1.0', astronaut_id: astronautId, mission_id: mission, sensor_id: sensor, stream_id: stream,
      sequence_number: this.nextSeq(stream), measurement_type: type, acquisition_mode: def.acquisition_mode, raw_value: value, raw_unit: def.unit,
      measured_at: new Date(t).toISOString(), received_at_edge: new Date(t + 150).toISOString(), timestamp_source: 'sensor_clock', clock_uncertainty_ms: 50,
      data_origin: 'simulated', simulation_scenario_id: this.scenario, simulator_version: SIMULATOR_VERSION, seed: SIM_SEED,
      validity_state: 'valid', quality_state: 'good', measurement_method: def.method, device_class: def.device_class,
      measurement_context: type === 'skin_temperature' ? { body_site: 'left_wrist' } : { posture: 'microgravity_free_float', protocol: 'routine_monitoring' },
      mission_phase: 'in_flight', ...over,
    };
  }

  value(astronautId: string, type: MeasurementType, t: number): number {
    const last = db.bySeries.get(`${astronautId}|${type}`);
    const prev = last?.length ? last[last.length - 1].normalized_value ?? 60 : 60;
    const circ = Math.sin(((t / 3600e3) % 24) / 24 * Math.PI * 2);
    const def = MEASUREMENTS[type];
    const jitter = (this.rand() - 0.5);
    const v = type === 'heart_rate' ? Math.min(Math.max(prev + jitter * 4 + circ * 0.2, 50), 95) : type === 'respiratory_rate' ? Math.min(Math.max(prev + jitter * 1.2, 10), 19) : type === 'skin_temperature' ? Math.min(Math.max(prev + jitter * 0.12, 32.5), 35) : Math.min(Math.max(prev + jitter * 6, 25), 85);
    return +v.toFixed(def.decimals);
  }

  poll(nowMs: number): TelemetryEnvelope[] {
    if (!this.running) return [];
    const out: TelemetryEnvelope[] = [];
    for (const a of db.astronauts) {
      for (const s of LIVE_STREAMS) {
        const key = `${a.id}|${s.type}`;
        const last = this.lastEmit.get(key) ?? 0;
        if (nowMs - last < s.cadenceMs) continue;
        this.lastEmit.set(key, nowMs);
        const env = this.envelope(a.id, s.type, this.value(a.id, s.type, nowMs), nowMs);
        const drop = this.skip.get(env.stream_id) ?? 0;
        if (drop > 0) { this.skip.set(env.stream_id, drop - 1); continue; } // consumed seq, never sent → gap
        out.push(env);
      }
    }
    this.emitted += out.length;
    return out;
  }
}

/* ---------------- Edge gateway with bounded outbox (JSONL spool semantics) ---------------- */
export type ScenarioId =
  | 'invalid_payload' | 'unknown_unit' | 'poor_quality' | 'missing_value' | 'gap' | 'duplicate' | 'out_of_order'
  | 'conflict' | 'demo_alert' | 'future_timestamp' | 'unsupported_schema' | 'fahrenheit_conversion' | 'demo_rule_match';

export const SCENARIOS: { id: ScenarioId; label: string; expect: string }[] = [
  { id: 'demo_alert', label: 'Inject demo alert event', expect: 'DEMO-EVT-001 alert created (demo only)' },
  { id: 'demo_rule_match', label: 'Demo rule match (HR)', expect: 'DEMO-RANGE-HR-001 alert; arbitrary parameter' },
  { id: 'poor_quality', label: 'Poor-quality event', expect: 'Stored; data-quality event; no clinical alert' },
  { id: 'missing_value', label: 'Missing value record', expect: 'Stored as missing_value; never shown as a number' },
  { id: 'gap', label: 'Stream gap (drop 10)', expect: 'Sequence gap recorded; chart shows break' },
  { id: 'duplicate', label: 'Duplicate event', expect: 'Ignored idempotently; no duplicate alert' },
  { id: 'conflict', label: 'Conflicting duplicate', expect: 'Quarantined; integrity alert; nothing overwritten' },
  { id: 'out_of_order', label: 'Out-of-order pair', expect: 'Both stored in measurement order; flagged' },
  { id: 'unknown_unit', label: 'Unknown unit', expect: 'Quarantined; no unit inferred' },
  { id: 'fahrenheit_conversion', label: '°F skin temperature', expect: 'Explicit conv-temp-f-c-v1 applied; raw kept' },
  { id: 'invalid_payload', label: 'Malformed payload', expect: 'Rejected at schema validation' },
  { id: 'unsupported_schema', label: 'Unsupported schema', expect: 'Rejected (schema 9.9)' },
  { id: 'future_timestamp', label: 'Future timestamp', expect: 'Quarantined (exceeds skew tolerance)' },
];

export const LINK_PRESETS: { state: LinkState; label: string }[] = [
  { state: 'connected', label: 'Connected / reconnect' },
  { state: 'delayed', label: 'Delayed (45 s hold)' },
  { state: 'degraded', label: 'Degraded (lossy sends)' },
  { state: 'disconnected', label: 'Disconnected' },
];

class EdgeGateway {
  adapter = new SimulatorAdapter();
  outbox: string[] = []; // JSONL lines
  state: LinkState = 'connected';
  backendDown = false;
  lastContact: string | null = null;
  latency: number | null = 120;
  lastAcked = 0;
  lastError: string | null = null;
  halted = false;
  private lastSentBatch: string[] = [];
  private rand = mulberry32(SIM_SEED + 99);
  private timer: ReturnType<typeof setInterval> | null = null;
  lastSent: TelemetryEnvelope | null = null;
  replayedTotal = 0;
  linkLog: { at: string; state: LinkState; queued: number }[] = [];

  status(): LinkStatus {
    return { state: this.state, last_contact: this.lastContact, observed_latency_ms: this.state === 'disconnected' ? null : this.latency, queued: this.outbox.length, outbox_capacity: OUTBOX_CAPACITY, last_acked_cursor: this.lastAcked, last_error: this.lastError, generator_halted: this.halted };
  }

  start(intervalMs = 2000) {
    this.adapter.start();
    if (!this.timer && typeof window !== 'undefined') this.timer = setInterval(() => this.tick(clock.now()), intervalMs);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.adapter.stop(); }

  setLink(state: LinkState) {
    this.state = state;
    this.latency = state === 'connected' ? 120 : state === 'degraded' ? 900 : state === 'delayed' ? 45000 : null;
    this.linkLog.unshift({ at: clock.iso(), state, queued: this.outbox.length });
    evaluateLink(state);
    emitChange(true);
  }

  enqueue(envs: TelemetryEnvelope[] | string[]) {
    for (const e of envs) {
      if (this.outbox.length >= OUTBOX_CAPACITY) {
        if (!this.halted) { this.halted = true; recordIntegrity('outbox_full', `Edge outbox reached capacity (${OUTBOX_CAPACITY}). Safe-stop: generator halted; NO events discarded.`, null); }
        this.adapter.stop();
        return;
      }
      this.outbox.push(typeof e === 'string' ? e : JSON.stringify(e));
    }
  }

  /** Parses spool lines; malformed lines are surfaced, not silently dropped. */
  private parse(lines: string[]): { ok: unknown[]; bad: number } {
    const ok: unknown[] = []; let bad = 0;
    for (const l of lines) { try { ok.push(JSON.parse(l)); } catch { bad++; recordIntegrity('outbox_malformed_record', `Malformed spool record skipped and retained for diagnostics: ${l.slice(0, 60)}…`, null, l); } }
    return { ok, bad };
  }

  flush(nowMs: number, max = 300) {
    if (!this.outbox.length || this.state === 'disconnected') return;
    let lines: string[];
    if (this.state === 'delayed') {
      const ready: string[] = [];
      const keep: string[] = [];
      for (const l of this.outbox) {
        let t = 0; try { t = Date.parse(JSON.parse(l).measured_at); } catch { /* malformed -> send to surface */ }
        if (nowMs - t >= 45_000 && ready.length < max) ready.push(l); else keep.push(l);
      }
      if (!ready.length) return;
      lines = ready; this.outbox = keep;
    } else {
      if (this.state === 'degraded' && this.rand() < 0.4) { this.lastError = 'Degraded link: send attempt failed (simulated loss); events retained in outbox'; return; }
      lines = this.outbox.slice(0, max);
      this.outbox = this.outbox.slice(lines.length);
    }
    if (this.backendDown) {
      this.outbox = [...lines, ...this.outbox];
      if (this.lastError !== 'Ground ingestion API unavailable (simulated); retrying') recordIntegrity('backend_unavailable', 'Ground ingestion unavailable; events retained in edge outbox.', null);
      this.lastError = 'Ground ingestion API unavailable (simulated); retrying';
      return;
    }
    const { ok } = this.parse(lines);
    const wasQueued = ok.some((e) => nowMs - Date.parse((e as { measured_at?: string })?.measured_at ?? '') > 10_000);
    const res = ingestBatch(ok, wasQueued ? 'replay' : 'live');
    if (wasQueued) this.replayedTotal += lines.length;
    const accepted = res.results.filter((r) => r.ingest_seq).map((r) => r.ingest_seq!);
    if (accepted.length) this.lastAcked = Math.max(this.lastAcked, ...accepted);
    this.lastSentBatch = lines;
    this.lastContact = clock.iso();
    this.lastError = null;
    if (this.halted && this.outbox.length < OUTBOX_CAPACITY * 0.8) { this.halted = false; this.adapter.start(); }
  }

  tick(nowMs: number) {
    const envs = this.adapter.poll(nowMs);
    if (envs.length) this.lastSent = envs[envs.length - 1];
    this.enqueue(envs);
    this.flush(nowMs);
    emitChange();
  }

  /** Simulates a gateway process restart: spool is serialized, memory cleared, spool re-read.
   *  The last sent batch is re-sent (ack unknown after restart) -> must be deduplicated by ground. */
  restart(corruptOneLine = false) {
    const spool = this.outbox.join('\n');
    this.outbox = [];
    const lines = spool ? spool.split('\n') : [];
    if (corruptOneLine) lines.push('{"event_id": "partial-write-trunc');
    this.outbox = [...this.lastSentBatch, ...lines];
    emitChange(true);
  }

  inject(id: ScenarioId, astronautId: string) {
    const a = this.adapter;
    const prevScenario = a.scenario;
    a.scenario = `inject_${id}`;
    const now = clock.now();
    const hr = () => a.envelope(astronautId, 'heart_rate', a.value(astronautId, 'heart_rate', now), now);
    let envs: (TelemetryEnvelope | Record<string, unknown>)[] = [];
    switch (id) {
      case 'demo_alert': envs = [a.envelope(astronautId, 'demo_marker', 1, now)]; break;
      case 'demo_rule_match': envs = [a.envelope(astronautId, 'heart_rate', 145, now)]; break;
      case 'poor_quality': envs = [{ ...hr(), quality_state: 'poor', validity_state: 'questionable' }]; break;
      case 'missing_value': envs = [{ ...hr(), raw_value: null, validity_state: 'missing_value', quality_state: 'unknown' }]; break;
      case 'gap': a.skip.set(`${astronautId}:heart_rate:PATCH-${astronautId.slice(-3)}`, 10); break;
      case 'duplicate': { const base = hr(); envs = [base, { ...base }]; break; }
      case 'conflict': { const base = hr(); envs = [base, { ...base, raw_value: (base.raw_value ?? 60) + 9 }]; break; }
      case 'out_of_order': { const e1 = a.envelope(astronautId, 'heart_rate', a.value(astronautId, 'heart_rate', now - 2000), now - 2000); const e2 = hr(); envs = [e2, e1]; break; }
      case 'unknown_unit': envs = [{ ...hr(), raw_unit: 'beats/hr' }]; break;
      case 'fahrenheit_conversion': envs = [{ ...a.envelope(astronautId, 'skin_temperature', 92.3, now), raw_unit: '°F' }]; break;
      case 'invalid_payload': envs = [{ ...hr(), raw_value: 'seventy' as unknown as number, measured_at: 'not-a-date' }]; break;
      case 'unsupported_schema': envs = [{ ...hr(), schema_version: '9.9' }]; break;
      case 'future_timestamp': envs = [{ ...hr(), measured_at: new Date(now + 10 * 60_000).toISOString() }]; break;
    }
    a.scenario = prevScenario;
    this.enqueue(envs.map((e) => JSON.stringify(e)));
    this.flush(now);
    emitChange(true);
  }
}

export const gateway = new EdgeGateway();
