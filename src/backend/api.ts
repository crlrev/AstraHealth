// Logical equivalent of /api/v1/*. Every call resolves the session and authorizes server-side.
// NOTE: in this static build the "server" runs in the browser — see docs/decisions/0001.
import { ANATOMY_REGIONS, DEMO_RULES, ESCALATION_PROCEDURE, FRESHNESS_POLICIES, MAX_CHART_POINTS, MEASUREMENTS, ROLE_LABEL } from '../domain/config';
import { aggregateMonitoringState, checkComparability, evaluateFreshness, freshnessToMonitoring, randomId, toChartSeries } from '../domain/logic';
import type { Alert, Freshness, MeasurementType, MonitoringState, Note, Permission, StoredMeasurement, User } from '../domain/types';
import { ApiError, audit, can, canAccessAstronaut, permissionsOf, rateLimit, requireAstronaut, requirePerm, resolveSession, revokeUserSessions, visibleAstronauts } from './auth';
import { emitChange } from './bus';
import { gateway, type ScenarioId } from './edge';
import { activeRules } from './rules';
import { clock, db, latestOf, seriesInRange } from './store';
import type { LinkState } from '../domain/types';

export interface Ctx { sid: string | null; csrf: string | null }
const read = (ctx: Ctx) => resolveSession(ctx.sid).user;
const mutate = (ctx: Ctx) => resolveSession(ctx.sid, ctx.csrf, true).user;

export const CARD_TYPES: MeasurementType[] = ['heart_rate', 'hrv_rmssd', 'respiratory_rate', 'spo2', 'skin_temperature', 'bp_systolic', 'bp_diastolic', 'body_mass'];

/* ---------------- Auth/me ---------------- */
export function me(ctx: Ctx) {
  const u = read(ctx);
  return { id: u.id, username: u.username, display_name: u.display_name, role: u.role, role_label: ROLE_LABEL[u.role], self_astronaut_id: u.self_astronaut_id, permissions: [...permissionsOf(u)] as Permission[] };
}

/* ---------------- Missions & crew ---------------- */
export function listMissions(ctx: Ctx) {
  const u = read(ctx);
  const ids = new Set(visibleAstronauts(u, 'roster').map((a) => a.mission_id));
  return db.missions.filter((m) => (can(u, 'roster.view') ? true : ids.has(m.id)));
}

export function listCrew(ctx: Ctx, opts: { q?: string; mission?: string; page?: number; pageSize?: number } = {}) {
  const u = read(ctx);
  const q = (opts.q ?? '').trim().toLowerCase();
  let rows = visibleAstronauts(u, 'roster').filter((a) => (!opts.mission || a.mission_id === opts.mission) && (!q || [a.display_name, a.id, a.callsign].some((f) => f.toLowerCase().includes(q))));
  rows = rows.sort((a, b) => a.id.localeCompare(b.id));
  const page = Math.max(1, opts.page ?? 1), size = Math.min(50, opts.pageSize ?? 20);
  return {
    total: rows.length, page, pageSize: size,
    items: rows.slice((page - 1) * size, page * size).map((a) => ({
      ...a, mission_name: db.missions.find((m) => m.id === a.mission_id)?.name ?? a.mission_id,
      surgeon_name: db.users.get(a.assigned_surgeon)?.display_name ?? '—',
      monitoring_access: canAccessAstronaut(u, a.id, 'monitoring'), medical_access: canAccessAstronaut(u, a.id, 'medical'),
      monitoring_state: canAccessAstronaut(u, a.id, 'monitoring') ? monitoringStateFor(a.id).state : null,
    })),
  };
}

export function getAstronaut(ctx: Ctx, id: string) {
  const u = read(ctx);
  requireAstronaut(u, id, 'roster');
  const a = db.astronauts.find((x) => x.id === id)!;
  audit(u.id, 'crew.view', 'astronaut', id, 'allowed', undefined, true);
  return {
    ...a, mission: db.missions.find((m) => m.id === a.mission_id)!, surgeon_name: db.users.get(a.assigned_surgeon)?.display_name ?? '—',
    monitoring_access: canAccessAstronaut(u, id, 'monitoring'), medical_access: canAccessAstronaut(u, id, 'medical'),
    devices: can(u, 'device.view') && canAccessAstronaut(u, id, 'monitoring') ? db.devices.filter((d) => d.astronaut_id === id) : [],
  };
}

/* ---------------- Measurements ---------------- */
export type RuleState = 'rules_not_configured' | 'demo_rule_no_match' | 'configured_rule_match' | 'not_evaluated';
export interface MeasurementCard {
  type: MeasurementType; label: string; unit: string; acquisition_mode: string; method: string;
  latest: StoredMeasurement | null; freshness: Freshness; ageMs: number | null; policySource: string | null;
  ruleState: RuleState; ruleIds: string[]; spark: ReturnType<typeof toChartSeries>;
}

function cardFor(astronautId: string, type: MeasurementType, now: number): MeasurementCard {
  const def = MEASUREMENTS[type];
  const latest = latestOf(astronautId, type);
  const freshness = latest ? evaluateFreshness(type, latest.measured_at, now) : (FRESHNESS_POLICIES[type] ? 'unavailable' : 'unconfigured');
  const rules = activeRules().filter((r) => r.measurement_type === type && r.type === 'range_check');
  const match = db.alerts.some((a) => a.astronaut_id === astronautId && rules.some((r) => r.id === a.rule_id) && a.status !== 'resolved');
  const ruleState: RuleState = !rules.length ? 'rules_not_configured' : !latest || latest.validity_state !== 'valid' || latest.quality_state !== 'good' ? 'not_evaluated' : match ? 'configured_rule_match' : 'demo_rule_no_match';
  const window = def.acquisition_mode === 'continuous' ? 3600e3 : def.acquisition_mode === 'periodic' && type !== 'body_mass' ? 24 * 3600e3 : 30 * 86400e3;
  const recs = seriesInRange(astronautId, type, now - window, now);
  const gap = (FRESHNESS_POLICIES[type]?.expected_interval_s ?? 3600) * 1000 * 6;
  return {
    type, label: def.label, unit: def.unit, acquisition_mode: def.acquisition_mode, method: def.method, latest, freshness,
    ageMs: latest ? now - Date.parse(latest.measured_at) : null, policySource: FRESHNESS_POLICIES[type]?.source ?? null,
    ruleState, ruleIds: rules.map((r) => `${r.id} v${r.version}`), spark: toChartSeries(recs, Math.max(gap, 5 * 60e3), 80),
  };
}

export function monitoringStateFor(astronautId: string) {
  const now = clock.now();
  const comps: { source: string; state: MonitoringState }[] = CARD_TYPES.map((t) => {
    const l = latestOf(astronautId, t);
    const f = l ? evaluateFreshness(t, l.measured_at, now) : (FRESHNESS_POLICIES[t] ? 'unavailable' : 'unconfigured');
    return { source: MEASUREMENTS[t].label, state: freshnessToMonitoring(f) };
  });
  const rulesExist = activeRules().some((r) => r.category === 'clinical_demo');
  comps.push({ source: 'Rule evaluation', state: rulesExist ? (db.alerts.some((a) => a.astronaut_id === astronautId && a.category === 'clinical_demo' && a.status !== 'resolved') ? 'configured_rule_match' : 'data_available') : 'rules_not_configured' });
  const ls = gateway.state;
  comps.push({ source: 'Edge link', state: ls === 'connected' ? 'data_available' : ls === 'delayed' ? 'delayed' : 'degraded' });
  return { state: aggregateMonitoringState(comps.map((c) => c.state)), components: comps };
}

export function crewSummary(ctx: Ctx, id: string) {
  const u = read(ctx);
  requireAstronaut(u, id, 'monitoring');
  audit(u.id, 'measurements.view_latest', 'astronaut', id, 'allowed', undefined, true);
  const now = clock.now();
  return { cards: CARD_TYPES.map((t) => cardFor(id, t, now)), monitoring: monitoringStateFor(id) };
}

export const WINDOWS = { '15m': 15 * 60e3, '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3, mission: -1 } as const;
export type WindowKey = keyof typeof WINDOWS;

export function history(ctx: Ctx, id: string, type: MeasurementType, win: WindowKey, phase: 'in_flight' | 'pre_flight' | 'all' = 'in_flight') {
  const u = read(ctx);
  requireAstronaut(u, id, 'monitoring');
  if (!MEASUREMENTS[type]) throw new ApiError(400, 'bad_request', 'Unknown measurement type');
  audit(u.id, 'measurements.history', 'astronaut', id, 'allowed', type, true);
  const now = clock.now();
  const a = db.astronauts.find((x) => x.id === id)!;
  const launch = Date.parse(db.missions.find((m) => m.id === a.mission_id)!.launch_at);
  const from = WINDOWS[win] < 0 ? (phase === 'in_flight' ? launch : 0) : now - WINDOWS[win];
  let recs = seriesInRange(id, type, from, now);
  if (phase !== 'all') recs = recs.filter((r) => r.mission_phase === phase);
  const expected = (FRESHNESS_POLICIES[type]?.expected_interval_s ?? 3600) * 1000;
  const gapMs = Math.max(expected * 8, win === '15m' || win === '1h' ? 90e3 : win === '24h' ? 11 * 60e3 : 65 * 60e3, MEASUREMENTS[type].acquisition_mode !== 'continuous' ? 3 * 86400e3 : 0);
  const series = toChartSeries(recs, gapMs, MAX_CHART_POINTS);
  return {
    from, to: now, rawCount: recs.length, displayCount: series.length, downsampled: recs.length > MAX_CHART_POINTS, series,
    gaps: series.filter((p) => p.gap).length, backfilled: recs.filter((r) => r.backfilled).length,
    questionable: recs.filter((r) => r.quality_state !== 'good' || r.validity_state !== 'valid').length,
    recent: recs.slice(-12).reverse(),
  };
}

export function anatomyMap(ctx: Ctx, id: string) {
  const u = read(ctx);
  requireAstronaut(u, id, 'monitoring');
  const now = clock.now();
  return ANATOMY_REGIONS.map((r) => ({ ...r, cards: r.mapping.map((m) => ({ basis: m.basis, card: cardFor(id, m.type, now) })) }));
}

export function baselineCompare(ctx: Ctx, id: string, type: MeasurementType, baseline: 'pre_flight' | 'first_week') {
  const u = read(ctx);
  requireAstronaut(u, id, 'monitoring');
  const a = db.astronauts.find((x) => x.id === id)!;
  const launch = Date.parse(db.missions.find((m) => m.id === a.mission_id)!.launch_at);
  const now = clock.now();
  const current = seriesInRange(id, type, now - 7 * 86400e3, now).filter((r) => r.validity_state === 'valid' && r.mission_phase === 'in_flight');
  const base = baseline === 'pre_flight'
    ? seriesInRange(id, type, 0, launch).filter((r) => r.validity_state === 'valid' && r.mission_phase === 'pre_flight')
    : seriesInRange(id, type, launch, launch + 7 * 86400e3).filter((r) => r.validity_state === 'valid' && r.mission_phase === 'in_flight');
  const cmp = checkComparability(type, base, current);
  const mean = (x: StoredMeasurement[]) => x.reduce((s, r) => s + (r.normalized_value ?? 0), 0) / x.length;
  return {
    ...cmp, baselineLabel: baseline === 'pre_flight' ? 'Pre-flight baseline sessions' : 'First 7 days in flight', currentLabel: 'Last 7 days in flight',
    baselineN: base.length, currentN: current.length,
    baselineMean: cmp.comparable ? mean(base) : null, currentMean: cmp.comparable ? mean(current) : null, unit: MEASUREMENTS[type].unit,
  };
}

/* ---------------- Operations ---------------- */
export function linkStatus(ctx: Ctx) {
  const u = read(ctx);
  requirePerm(u, 'ops.view');
  return { ...gateway.status(), log: gateway.linkLog.slice(0, 10), replayedTotal: gateway.replayedTotal, backendDown: gateway.backendDown, generatorRunning: gateway.adapter.running, adapter: { id: gateway.adapter.id, version: gateway.adapter.version, ...gateway.adapter.describe(), ...gateway.adapter.diagnostics() } };
}

export function streamStatus(ctx: Ctx, streamId: string) {
  const u = read(ctx);
  const s = db.streams.get(streamId);
  if (!s) throw new ApiError(404, 'not_found', 'Stream not found');
  requireAstronaut(u, s.astronaut_id, 'monitoring');
  return s;
}

export function integrityEvents(ctx: Ctx, limit = 50) {
  const u = read(ctx);
  return db.integrity.filter((e) => (e.astronaut_id && db.astronauts.some((a) => a.id === e.astronaut_id) ? canAccessAstronaut(u, e.astronaut_id, 'monitoring') : can(u, 'ops.view') && u.role !== 'astronaut')).slice(0, limit).map(({ quarantined_payload: _q, ...rest }) => rest);
}

/* ---------------- Alerts ---------------- */
function alertVisible(u: User, a: Alert) {
  if (a.category === 'system') return can(u, 'ops.view') && u.role !== 'astronaut';
  if (!a.astronaut_id) return can(u, 'monitoring.view_assigned') || can(u, 'ops.view') && u.role !== 'astronaut';
  if (a.category === 'clinical_demo') return canAccessAstronaut(u, a.astronaut_id, 'medical') && u.role !== 'astronaut';
  return canAccessAstronaut(u, a.astronaut_id, 'monitoring') && u.role !== 'astronaut';
}

export function listAlerts(ctx: Ctx, opts: { status?: 'open' | 'all'; astronautId?: string } = {}) {
  const u = read(ctx);
  return db.alerts.filter((a) => alertVisible(u, a) && (opts.status !== 'open' || a.status !== 'resolved') && (!opts.astronautId || a.astronaut_id === opts.astronautId));
}

export function alertCapabilities(ctx: Ctx, a: Alert) {
  const u = read(ctx);
  const ack = a.category === 'clinical_demo' ? can(u, 'alert.ack.clinical') : a.category === 'data_quality' ? can(u, 'alert.ack.data_quality') : can(u, 'alert.ack.system');
  const resolve = a.category === 'clinical_demo' ? can(u, 'alert.resolve.clinical') : can(u, 'alert.resolve.operational') || (a.category === 'system' && can(u, 'alert.ack.system'));
  return { ack, assign: can(u, 'alert.assign'), resolve, escalate: false, escalationReason: ESCALATION_PROCEDURE ? '' : 'No approved escalation procedure configured' };
}

function loadAlert(u: User, id: string, version: number) {
  const a = db.alerts.find((x) => x.id === id);
  if (!a || !alertVisible(u, a)) throw new ApiError(404, 'not_found', 'Alert not found or not accessible.');
  if (a.version !== version) throw new ApiError(409, 'conflict', 'This alert was changed by someone else. Reload to see the latest version.', { current: a });
  return a;
}

export function ackAlert(ctx: Ctx, id: string, version: number) {
  const u = mutate(ctx);
  const a = loadAlert(u, id, version);
  if (!alertCapabilities(ctx, a).ack) { audit(u.id, 'alert.ack', 'alert', id, 'denied'); throw new ApiError(403, 'forbidden', 'Not permitted to acknowledge this alert.'); }
  if (a.status === 'resolved') throw new ApiError(400, 'invalid_transition', 'Resolved alerts cannot be acknowledged.');
  if (a.status === 'active_unacknowledged' || a.status === 'reopened') a.status = 'acknowledged';
  a.history.push({ at: clock.iso(), by: u.id, action: 'acknowledged' });
  a.version++; a.updated_at = clock.iso();
  audit(u.id, 'alert.ack', 'alert', id, 'allowed');
  emitChange(true);
  return a;
}

export function assignAlert(ctx: Ctx, id: string, assigneeId: string, version: number) {
  const u = mutate(ctx);
  const a = loadAlert(u, id, version);
  if (!can(u, 'alert.assign')) { audit(u.id, 'alert.assign', 'alert', id, 'denied'); throw new ApiError(403, 'forbidden', 'Not permitted to assign alerts.'); }
  const assignee = db.users.get(assigneeId);
  if (!assignee || !alertVisible(assignee, a)) throw new ApiError(400, 'bad_assignee', 'Assignee cannot access this alert.');
  if (a.status === 'resolved') throw new ApiError(400, 'invalid_transition', 'Resolved alerts cannot be assigned.');
  a.status = 'assigned'; a.assignee = assigneeId;
  a.history.push({ at: clock.iso(), by: u.id, action: 'assigned', note: `to ${assignee.display_name}` });
  a.version++; a.updated_at = clock.iso();
  audit(u.id, 'alert.assign', 'alert', id, 'allowed');
  emitChange(true);
  return a;
}

export function resolveAlert(ctx: Ctx, id: string, note: string, version: number) {
  const u = mutate(ctx);
  const a = loadAlert(u, id, version);
  if (!alertCapabilities(ctx, a).resolve) { audit(u.id, 'alert.resolve', 'alert', id, 'denied'); throw new ApiError(403, 'forbidden', 'Not permitted to resolve this alert.'); }
  if (!note.trim()) throw new ApiError(400, 'note_required', 'A resolution note is required.');
  if (a.status === 'resolved') throw new ApiError(400, 'invalid_transition', 'Already resolved.');
  a.status = 'resolved';
  a.history.push({ at: clock.iso(), by: u.id, action: 'resolved', note: note.slice(0, 500) });
  a.version++; a.updated_at = clock.iso();
  audit(u.id, 'alert.resolve', 'alert', id, 'allowed');
  emitChange(true);
  return a;
}

export function listRules(ctx: Ctx) {
  const u = read(ctx);
  requirePerm(u, 'rule.view');
  return { rules: DEMO_RULES, active: activeRules().map((r) => r.id), canApprove: can(u, 'clinical_rule_approve') };
}

/** Clinical approval is blocked: requires explicit permission AND externally supplied evidence. */
export function approveRule(ctx: Ctx, ruleId: string, evidence: string) {
  const u = mutate(ctx);
  requirePerm(u, 'clinical_rule_approve', 'rule');
  if (!evidence.trim()) throw new ApiError(400, 'evidence_required', 'External approval evidence is required.');
  throw new ApiError(423, 'blocked', `Rule ${ruleId} cannot be clinically approved in this prototype (no external approval process integrated).`);
}

/* ---------------- Notes ---------------- */
function noteVisible(u: User, n: Note) {
  if (n.kind === 'clinical') return canAccessAstronaut(u, n.astronaut_id, 'medical') && (u.role !== 'astronaut' || n.shared_with_astronaut);
  return canAccessAstronaut(u, n.astronaut_id, 'monitoring') && u.role !== 'astronaut';
}

export function listNotes(ctx: Ctx, astronautId?: string) {
  const u = read(ctx);
  if (astronautId) requireAstronaut(u, astronautId, 'monitoring');
  const notes = db.notes.filter((n) => noteVisible(u, n) && (!astronautId || n.astronaut_id === astronautId)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  audit(u.id, 'notes.list', 'astronaut', astronautId ?? '*', 'allowed', `${notes.length} notes`, true);
  return notes.map((n) => ({ ...n, author_name: db.users.get(n.author_id)?.display_name ?? n.author_id, can_edit: n.author_id === u.id }));
}

export function createNote(ctx: Ctx, input: { kind: 'clinical' | 'operational'; astronaut_id: string; title: string; body: string; shared_with_astronaut: boolean }) {
  const u = mutate(ctx);
  requirePerm(u, input.kind === 'clinical' ? 'note.clinical.create' : 'note.operational.create', 'note');
  requireAstronaut(u, input.astronaut_id, input.kind === 'clinical' ? 'medical' : 'monitoring');
  if (!input.title.trim() || !input.body.trim()) throw new ApiError(400, 'validation', 'Title and body are required.');
  const a = db.astronauts.find((x) => x.id === input.astronaut_id)!;
  // Explicit field mapping (no mass assignment).
  const n: Note = { id: `NOTE-${randomId().slice(0, 6)}`, kind: input.kind, astronaut_id: a.id, mission_id: a.mission_id, author_id: u.id, created_at: clock.iso(), title: input.title.slice(0, 160), body: input.body.slice(0, 5000), version: 1, shared_with_astronaut: input.kind === 'clinical' && !!input.shared_with_astronaut, revisions: [] };
  db.notes.push(n);
  audit(u.id, 'note.create', 'note', n.id, 'allowed', n.kind);
  emitChange(true);
  return n;
}

/** Correction with optimistic concurrency. Prior text preserved in revision history. */
export function editNote(ctx: Ctx, id: string, body: string, reason: string, expectedVersion: number) {
  const u = mutate(ctx);
  const n = db.notes.find((x) => x.id === id);
  if (!n || !noteVisible(u, n)) throw new ApiError(404, 'not_found', 'Note not found or not accessible.');
  if (n.author_id !== u.id) { audit(u.id, 'note.edit', 'note', id, 'denied'); throw new ApiError(403, 'forbidden', 'Only the author may issue a correction.'); }
  if (n.version !== expectedVersion) throw new ApiError(409, 'conflict', 'Note changed since you opened it. Reload and re-apply your correction.', { current: n });
  if (!reason.trim()) throw new ApiError(400, 'validation', 'A correction reason is required.');
  n.revisions.push({ version: n.version, body: n.body, edited_at: clock.iso(), edited_by: u.id, reason: reason.slice(0, 300) });
  n.body = body.slice(0, 5000);
  n.version++;
  audit(u.id, 'note.correct', 'note', id, 'allowed');
  emitChange(true);
  return n;
}

/* ---------------- Wellness & radiation ---------------- */
export function wellness(ctx: Ctx, id: string) {
  const u = read(ctx);
  requireAstronaut(u, id, 'medical');
  audit(u.id, 'wellness.view', 'astronaut', id, 'allowed', undefined, true);
  return { sleep: db.sleep.filter((s) => s.astronaut_id === id), exercise: db.exercise.filter((e) => e.astronaut_id === id) };
}

export function radiation(ctx: Ctx, astronautId: string) {
  const u = read(ctx);
  requireAstronaut(u, astronautId, 'monitoring');
  const a = db.astronauts.find((x) => x.id === astronautId)!;
  const mission = db.missions.find((m) => m.id === a.mission_id)!;
  const launch = Date.parse(mission.launch_at);
  const personal = db.radiation.filter((r) => r.astronaut_id === astronautId).sort((x, y) => x.interval_start.localeCompare(y.interval_start));
  const area = db.radiation.filter((r) => r.scope === 'area' && r.mission_id === a.mission_id);
  const expectedIntervals = Math.floor((clock.now() - launch) / 86400e3);
  const recordedDays = new Set(personal.map((p) => Math.round((Date.parse(p.interval_start) - launch) / 86400e3)));
  const missing: number[] = [];
  for (let d = 0; d < expectedIntervals; d++) if (!recordedDays.has(d)) missing.push(d + 1);
  audit(u.id, 'radiation.view', 'astronaut', astronautId, 'allowed', undefined, true);
  return { mission, personal, area, coverage: { expectedIntervals, recorded: recordedDays.size, missingMissionDays: missing }, cumulative: { configured: false, reason: 'No reviewed cumulative-dose algorithm is configured. Recorded intervals are shown individually; no sum is presented.' } };
}

/* ---------------- Search (scoped, paginated, no note content) ---------------- */
export function search(ctx: Ctx, q: string, page = 1, pageSize = 8) {
  const u = read(ctx);
  rateLimit(`search:${u.id}`, 60, 60_000);
  const term = q.trim().toLowerCase();
  if (term.length < 2) return { total: 0, page, items: [] as { kind: string; id: string; label: string; sub: string; href: string }[] };
  if (term.length > 64) throw new ApiError(400, 'bad_query', 'Query too long.');
  const items: { kind: string; id: string; label: string; sub: string; href: string }[] = [];
  for (const a of visibleAstronauts(u, 'roster')) if ([a.display_name, a.id, a.callsign].some((f) => f.toLowerCase().includes(term))) items.push({ kind: 'Astronaut', id: a.id, label: a.display_name, sub: `${a.id} · ${a.crew_role}`, href: `/crew/${a.id}` });
  for (const m of listMissions(ctx)) if ([m.name, m.id].some((f) => f.toLowerCase().includes(term))) items.push({ kind: 'Mission', id: m.id, label: m.name, sub: m.vehicle, href: `/mission?m=${m.id}` });
  if (can(u, 'device.view')) for (const d of db.devices) if (canAccessAstronaut(u, d.astronaut_id, 'monitoring') && d.id.toLowerCase().includes(term)) items.push({ kind: 'Sensor', id: d.id, label: d.id, sub: `${d.model} · ${d.astronaut_id}`, href: `/crew/${d.astronaut_id}` });
  items.sort((x, y) => x.kind.localeCompare(y.kind) || x.id.localeCompare(y.id));
  return { total: items.length, page, items: items.slice((page - 1) * pageSize, page * pageSize) };
}

/* ---------------- Admin ---------------- */
export function listUsers(ctx: Ctx) {
  const u = read(ctx);
  requirePerm(u, 'users.manage');
  return [...db.users.values()].map((x) => ({ id: x.id, username: x.username, display_name: x.display_name, role: x.role, role_label: ROLE_LABEL[x.role], disabled: x.disabled, assigned: x.assigned_astronauts, self: x.self_astronaut_id, sessions: [...db.sessions.values()].filter((s) => s.user_id === x.id).length }));
}
export function setUserDisabled(ctx: Ctx, userId: string, disabled: boolean) {
  const u = mutate(ctx);
  requirePerm(u, 'users.manage');
  if (userId === u.id) throw new ApiError(400, 'self', 'You cannot disable your own account.');
  const t = db.users.get(userId);
  if (!t) throw new ApiError(404, 'not_found', 'User not found');
  t.disabled = disabled;
  if (disabled) revokeUserSessions(userId);
  audit(u.id, disabled ? 'user.disable' : 'user.enable', 'user', userId, 'allowed');
  emitChange(true);
}
export function listAudit(ctx: Ctx, limit = 100) {
  const u = read(ctx);
  requirePerm(u, 'audit.view');
  return db.audit.slice(-limit).reverse();
}
export function listAssignableUsers(ctx: Ctx, alertId: string) {
  const u = read(ctx);
  const a = db.alerts.find((x) => x.id === alertId);
  if (!a || !alertVisible(u, a)) return [];
  return [...db.users.values()].filter((x) => !x.disabled && alertVisible(x, a) && x.role !== 'astronaut').map((x) => ({ id: x.id, name: x.display_name, role: ROLE_LABEL[x.role] }));
}
export function userName(id: string | null) { return id ? db.users.get(id)?.display_name ?? id : '—'; }

/* ---------------- Simulator control ---------------- */
export function simSetLink(ctx: Ctx, s: LinkState) { const u = mutate(ctx); requirePerm(u, 'sim.control'); gateway.setLink(s); audit(u.id, 'sim.link', 'gateway', s, 'allowed'); }
export function simInject(ctx: Ctx, id: ScenarioId, astronautId: string) { const u = mutate(ctx); requirePerm(u, 'sim.control'); gateway.inject(id, astronautId); audit(u.id, 'sim.inject', 'scenario', id, 'allowed', astronautId); }
export function simRestart(ctx: Ctx, corrupt: boolean) { const u = mutate(ctx); requirePerm(u, 'sim.control'); gateway.restart(corrupt); audit(u.id, 'sim.restart', 'gateway', null, 'allowed'); }
export function simBackend(ctx: Ctx, down: boolean) { const u = mutate(ctx); requirePerm(u, 'sim.control'); gateway.backendDown = down; emitChange(true); }
export function simGenerator(ctx: Ctx, run: boolean) { const u = mutate(ctx); requirePerm(u, 'sim.control'); if (run) gateway.adapter.start(); else gateway.adapter.stop(); emitChange(true); }
