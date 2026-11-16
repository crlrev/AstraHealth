// Deterministic, inspectable rules only. No AI, no diagnosis, no external escalation.
import { DEMO_MODE, DEMO_RULES } from '../domain/config';
import { randomId } from '../domain/logic';
import type { Alert, AlertRule, IntegrityEvent, LinkState, StoredMeasurement } from '../domain/types';
import { clock, db } from './store';

export function activeRules(): AlertRule[] {
  return DEMO_RULES.filter((r) => r.status === 'clinically_approved' || (DEMO_MODE && r.status === 'demo_active'));
}
const rule = (id: string) => activeRules().find((r) => r.id === id);

const WINDOW_MS = 15 * 60_000;

export function raiseAlert(r: AlertRule, p: { astronaut_id: string | null; mission_id: string | null; stream_id: string | null; event_id: string | null; title: string; detail: string; at: string; windowKey?: string }): Alert {
  const bucket = p.windowKey ?? String(Math.floor(Date.parse(p.at) / WINDOW_MS));
  const fingerprint = [p.astronaut_id ?? '-', r.id, r.version, p.stream_id ?? '-', bucket].join('|');
  const now = clock.iso();
  const existing = db.alerts.find((a) => a.fingerprint === fingerprint);
  if (existing) {
    existing.occurrences++;
    existing.updated_at = now;
    if (existing.status === 'resolved') {
      existing.status = 'reopened';
      existing.history.push({ at: now, by: 'system', action: 'reopened', note: 'Recurrence within same rule window (recurrence policy: reopen).' });
      existing.version++;
    }
    return existing;
  }
  const alert: Alert = {
    id: `ALR-${randomId().slice(0, 8).toUpperCase()}`, fingerprint, rule_id: r.id, rule_version: r.version, category: r.category,
    astronaut_id: p.astronaut_id, mission_id: p.mission_id, stream_id: p.stream_id, source_event_id: p.event_id,
    severity_label: r.severity_label, title: p.title, detail: p.detail, status: 'active_unacknowledged', assignee: null,
    created_at: now, updated_at: now, occurrences: 1, version: 1, history: [{ at: now, by: 'system', action: 'created' }],
    simulation_only: r.simulation_only,
  };
  db.alerts.unshift(alert);
  return alert;
}

export function evaluateMeasurement(m: StoredMeasurement) {
  const base = { astronaut_id: m.astronaut_id, mission_id: m.mission_id, stream_id: m.stream_id, event_id: m.event_id, at: m.measured_at };
  const notGood = m.quality_state === 'questionable' || m.quality_state === 'poor' || ['questionable', 'invalid', 'sensor_fault', 'missing_value'].includes(m.validity_state);
  if (notGood) {
    const r = rule('DQ-QUAL-001');
    if (r) raiseAlert(r, { ...base, title: `Data quality: ${m.measurement_type} (${m.validity_state}/${m.quality_state})`, detail: `Stream ${m.stream_id} reported validity=${m.validity_state}, quality=${m.quality_state}. Not a clinical finding.` });
    return; // never evaluate clinical/demo range rules on low-quality data
  }
  if (m.measurement_type === 'demo_marker') {
    const r = rule('DEMO-EVT-001');
    if (r) raiseAlert(r, { ...base, title: 'DEMO alert injected by simulator', detail: 'Demonstration event to exercise acknowledge / assign / resolve workflow. NOT CLINICALLY VALIDATED.' });
    return;
  }
  if (m.measurement_type === 'heart_rate' && m.normalized_value !== null) {
    const r = rule('DEMO-RANGE-HR-001');
    if (r && m.normalized_value > Number(r.params.upper)) {
      raiseAlert(r, { ...base, title: `DEMO rule matched: ${r.id} v${r.version}`, detail: `Configured DEMO rule condition "${r.condition}" (arbitrary parameter upper=${r.params.upper} bpm) matched. Software rule result — not a diagnosis.` });
    }
  }
}

export function evaluateIntegrity(e: IntegrityEvent) {
  if (!['conflict_quarantined', 'unknown_unit', 'schema_invalid', 'unsupported_schema', 'future_timestamp', 'outbox_full', 'provenance_invalid', 'unknown_measurement_type'].includes(e.kind)) return;
  const r = rule('INT-001');
  if (!r) return;
  const astro = e.astronaut_id && db.astronauts.find((a) => a.id === e.astronaut_id) ? e.astronaut_id : null;
  raiseAlert(r, { astronaut_id: astro, mission_id: null, stream_id: e.stream_id, event_id: e.event_id, at: e.at, title: `Integrity: ${e.kind.replace(/_/g, ' ')}`, detail: e.detail, windowKey: `${e.kind}|${Math.floor(Date.parse(e.at) / WINDOW_MS)}` });
}

export function evaluateLink(state: LinkState) {
  if (state !== 'disconnected' && state !== 'degraded') return;
  const r = rule('LINK-001');
  if (r) raiseAlert(r, { astronaut_id: null, mission_id: null, stream_id: 'edge-link', event_id: null, at: clock.iso(), title: `Link ${state}`, detail: `Simulated ground/edge link entered "${state}". Events are queued in the edge outbox. Not a clinical condition.` });
}
