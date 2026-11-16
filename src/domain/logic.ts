import { COMPARABILITY_POLICIES, FRESHNESS_POLICIES, MEASUREMENTS, UNIT_CONVERSIONS } from './config';
import type { Freshness, MeasurementType, MonitoringState, StoredMeasurement } from './types';

/* ---------------- Deterministic PRNG ---------------- */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prngUuid(rand: () => number): string {
  const h = () => Math.floor(rand() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}

export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return prngUuid(Math.random);
}

/* ---------------- Payload hashing (idempotency comparison) ---------------- */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export function fnv1a(str: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/** Hash of the source-defined payload only (excludes ground-side fields like received_at_edge). */
export function payloadHash(e: { [k: string]: unknown }): string {
  const { received_at_edge: _a, received_at_ground: _b, ingest_seq: _c, backfilled: _d, out_of_order: _e, payload_hash: _f, normalized_value: _g, normalized_unit: _h, conversion_version: _i, ...src } = e;
  return fnv1a(stableStringify(src));
}

/* ---------------- Units ---------------- */
export function convertUnit(type: MeasurementType, value: number | null, unit: string | null) {
  const def = MEASUREMENTS[type];
  if (value === null || unit === null) return { normalized_value: null, normalized_unit: null, conversion_version: null };
  if (unit === def.unit) return { normalized_value: value, normalized_unit: unit, conversion_version: null };
  const conv = UNIT_CONVERSIONS.find((c) => c.from === unit && c.to === def.unit);
  if (!conv) throw new Error(`No explicit conversion ${unit} → ${def.unit}`);
  return { normalized_value: conv.fn(value), normalized_unit: def.unit, conversion_version: conv.version };
}

/* ---------------- Freshness ---------------- */
export function evaluateFreshness(type: MeasurementType, measuredAt: string | null, nowMs: number): Freshness {
  const policy = FRESHNESS_POLICIES[type];
  if (!policy) return 'unconfigured';
  if (!measuredAt) return 'unavailable';
  const age = (nowMs - Date.parse(measuredAt)) / 1000;
  if (age <= policy.fresh_until_s) return 'fresh';
  if (age <= policy.delayed_until_s) return 'delayed';
  return 'stale';
}

export function formatAge(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/* ---------------- Comparability ---------------- */
function keyValue(m: StoredMeasurement, key: string): string | undefined {
  if (key.startsWith('context.')) return m.measurement_context[key.slice(8)];
  return String((m as unknown as Record<string, unknown>)[key] ?? '');
}

export function checkComparability(type: MeasurementType, a: StoredMeasurement[], b: StoredMeasurement[]): { comparable: boolean; reasons: string[]; policy: string | null } {
  const policy = COMPARABILITY_POLICIES[type];
  if (!policy) return { comparable: false, reasons: ['No comparability policy configured for this measurement type'], policy: null };
  if (!a.length || !b.length) return { comparable: false, reasons: ['Insufficient records in one or both periods'], policy: policy.source };
  const reasons: string[] = [];
  for (const key of policy.keys) {
    const va = new Set(a.map((m) => keyValue(m, key)));
    const vb = new Set(b.map((m) => keyValue(m, key)));
    if (va.has(undefined) || vb.has(undefined)) reasons.push(`${key} incomplete`);
    else if (va.size !== 1 || vb.size !== 1 || [...va][0] !== [...vb][0]) reasons.push(`${key} differs (${[...va].join('/')} vs ${[...vb].join('/')})`);
  }
  return { comparable: reasons.length === 0, reasons, policy: policy.source };
}

/* ---------------- CSV safety ---------------- */
export function csvEscape(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula prefixes
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/* ---------------- Chart downsampling (display only; raw data retained) ---------------- */
export interface ChartPoint {
  t: number;
  v: number | null;
  backfilled: boolean;
  gap?: boolean;
}

/** Inserts explicit null points across gaps larger than gapMs, then bucket-averages to ≤ max points. */
export function toChartSeries(records: StoredMeasurement[], gapMs: number, max: number): ChartPoint[] {
  const sorted = [...records].sort((x, y) => Date.parse(x.measured_at) - Date.parse(y.measured_at));
  const pts: ChartPoint[] = [];
  let prev: number | null = null;
  for (const r of sorted) {
    const t = Date.parse(r.measured_at);
    if (prev !== null && t - prev > gapMs) pts.push({ t: prev + 1, v: null, backfilled: false, gap: true });
    const usable = r.validity_state === 'valid' || r.validity_state === 'questionable';
    pts.push({ t, v: usable ? r.normalized_value : null, backfilled: r.backfilled, gap: !usable });
    prev = t;
  }
  if (pts.length <= max) return pts;
  const bucket = Math.ceil(pts.length / max);
  const out: ChartPoint[] = [];
  for (let i = 0; i < pts.length; i += bucket) {
    const slice = pts.slice(i, i + bucket);
    if (slice.some((p) => p.gap)) {
      out.push({ t: slice[0].t, v: null, backfilled: false, gap: true });
      continue;
    }
    const vals = slice.map((p) => p.v as number);
    out.push({ t: slice[0].t, v: vals.reduce((a, b) => a + b, 0) / vals.length, backfilled: slice.some((p) => p.backfilled) });
  }
  return out;
}

/* ---------------- Monitoring state aggregation ----------------
 * Deterministic priority order (highest first). Describes DATA/MONITORING state only —
 * never the astronaut's medical condition.
 */
export const MONITORING_PRIORITY: MonitoringState[] = ['unavailable', 'configured_rule_match', 'degraded', 'stale', 'delayed', 'rules_not_configured', 'not_evaluated', 'data_available'];

export function aggregateMonitoringState(states: MonitoringState[]): MonitoringState {
  if (!states.length) return 'unavailable';
  return [...states].sort((a, b) => MONITORING_PRIORITY.indexOf(a) - MONITORING_PRIORITY.indexOf(b))[0];
}

export function freshnessToMonitoring(f: Freshness): MonitoringState {
  switch (f) {
    case 'fresh': return 'data_available';
    case 'delayed': return 'delayed';
    case 'stale': return 'stale';
    case 'unavailable': return 'unavailable';
    case 'unconfigured': return 'not_evaluated';
  }
}
