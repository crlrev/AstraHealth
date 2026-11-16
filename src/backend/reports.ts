import { jsPDF } from 'jspdf';
import { DEMO_RULES, MEASUREMENTS } from '../domain/config';
import { csvEscape, evaluateFreshness, randomId } from '../domain/logic';
import type { ReportRecord, ReportType, User } from '../domain/types';
import { CARD_TYPES, type Ctx, monitoringStateFor, userName } from './api';
import { ApiError, audit, can, canAccessAstronaut, rateLimit, resolveSession } from './auth';
import { gateway } from './edge';
import { clock, db, latestOf, seriesInRange } from './store';

export const REPORT_TYPES: { id: ReportType; label: string; medical: boolean }[] = [
  { id: 'daily_summary', label: 'Daily monitoring summary', medical: true },
  { id: 'weekly_summary', label: 'Weekly monitoring summary', medical: true },
  { id: 'measurement_history', label: 'Physiological measurement history', medical: true },
  { id: 'alert_history', label: 'Alert history', medical: true },
  { id: 'sleep_exercise', label: 'Sleep / exercise summary', medical: true },
  { id: 'radiation_summary', label: 'Radiation record summary', medical: true },
  { id: 'mission_overview', label: 'Mission overview (operational, no medical values)', medical: false },
];

const BANNERS = ['DEMONSTRATION PROTOTYPE — NOT FOR CLINICAL USE', 'SIMULATED DATA — NOT REAL ASTRONAUT TELEMETRY'];

export function canReport(u: User, type: ReportType, astronautId: string | null, missionId: string, existing?: ReportRecord): boolean {
  const def = REPORT_TYPES.find((r) => r.id === type);
  if (!def) return false;
  if (!def.medical) {
    if (can(u, 'report.ops')) return true;
    return can(u, 'report.medical') && db.astronauts.some((a) => a.mission_id === missionId && canAccessAstronaut(u, a.id, 'medical'));
  }
  if (!astronautId) return false;
  if (can(u, 'report.medical') && canAccessAstronaut(u, astronautId, 'medical')) return true;
  // Own shared report only: astronauts may access reports they generated for themselves (no sharing workflow yet).
  return can(u, 'report.own') && u.self_astronaut_id === astronautId && canAccessAstronaut(u, astronautId, 'medical') && (!existing || existing.generated_by === u.id);
}

type Table = { title: string; columns: string[]; rows: (string | number | null)[][]; note?: string };

function build(type: ReportType, astronautId: string | null, missionId: string, from: number, to: number): { meta: [string, string][]; tables: Table[] } {
  const astro = astronautId ? db.astronauts.find((a) => a.id === astronautId)! : null;
  const mission = db.missions.find((m) => m.id === missionId)!;
  const meta: [string, string][] = [
    ['Report', REPORT_TYPES.find((r) => r.id === type)!.label],
    ['Mission', `${mission.name} (${mission.id}) — ${mission.vehicle}`],
    ['Astronaut', astro ? `${astro.display_name} (${astro.id}, fictional)` : 'n/a — mission-level'],
    ['Interval (UTC)', `${new Date(from).toISOString()} → ${new Date(to).toISOString()}`],
    ['Generated (UTC)', clock.iso()],
    ['Data provenance', 'simulated (all records in this prototype)'],
  ];
  const tables: Table[] = [];
  const fmt = (v: number | null, d: number) => (v === null ? 'NO VALUE' : v.toFixed(d));
  if ((type === 'daily_summary' || type === 'weekly_summary') && astro) {
    tables.push({
      title: 'Measurement summary (valid records only in statistics)',
      columns: ['Measurement', 'Unit', 'Mode', 'Records', 'Valid', 'Low-quality/invalid', 'Backfilled', 'Min', 'Mean', 'Max', 'Latest measured (UTC)', 'Freshness now'],
      rows: CARD_TYPES.map((t) => {
        const recs = seriesInRange(astro.id, t, from, to).filter((r) => r.mission_phase === 'in_flight');
        const valid = recs.filter((r) => r.validity_state === 'valid' && r.normalized_value !== null);
        const vals = valid.map((r) => r.normalized_value as number);
        const d = MEASUREMENTS[t].decimals;
        const l = latestOf(astro.id, t);
        return [MEASUREMENTS[t].label, MEASUREMENTS[t].unit, MEASUREMENTS[t].acquisition_mode, recs.length, valid.length, recs.length - valid.length, recs.filter((r) => r.backfilled).length,
          vals.length ? fmt(Math.min(...vals), d) : 'NO DATA', vals.length ? fmt(vals.reduce((a, b) => a + b, 0) / vals.length, d) : 'NO DATA', vals.length ? fmt(Math.max(...vals), d) : 'NO DATA',
          l?.measured_at ?? 'NO DATA', evaluateFreshness(t, l?.measured_at ?? null, clock.now())];
      }),
      note: 'Statistics are descriptive only. No clinical interpretation. Monitoring state: ' + monitoringStateFor(astro.id).state,
    });
  }
  if ((type === 'measurement_history' || type === 'daily_summary') && astro) {
    const recs = CARD_TYPES.flatMap((t) => seriesInRange(astro.id, t, from, to)).sort((a, b) => a.measured_at.localeCompare(b.measured_at));
    const gaps = db.integrity.filter((e) => e.astronaut_id === astro.id && e.kind === 'sequence_gap');
    tables.push({
      title: 'Measurement records', columns: ['measured_at', 'received_at_ground', 'type', 'raw_value', 'raw_unit', 'normalized_value', 'normalized_unit', 'conversion', 'validity', 'quality', 'mode', 'method', 'device_class', 'sensor_id', 'origin', 'scenario', 'phase', 'backfilled', 'out_of_order'],
      rows: recs.map((r) => [r.measured_at, r.received_at_ground, r.measurement_type, r.raw_value === null ? 'NO VALUE' : r.raw_value, r.raw_unit, r.normalized_value, r.normalized_unit, r.conversion_version ?? '', r.validity_state, r.quality_state, r.acquisition_mode, r.measurement_method, r.device_class, r.sensor_id, r.data_origin.toUpperCase(), r.simulation_scenario_id, r.mission_phase, r.backfilled ? 'yes' : 'no', r.out_of_order ? 'yes' : 'no']),
      note: `Detected sequence gaps for this astronaut (all time): ${gaps.length}. Gaps are never interpolated.`,
    });
  }
  if ((type === 'alert_history' || type === 'daily_summary' || type === 'weekly_summary') && astro) {
    const alerts = db.alerts.filter((a) => a.astronaut_id === astro.id && Date.parse(a.created_at) >= from && Date.parse(a.created_at) <= to);
    tables.push({
      title: 'Alerts', columns: ['Alert', 'Created (UTC)', 'Rule', 'Rule status / approval', 'Category', 'Status', 'Assignee', 'Occurrences', 'Title'],
      rows: alerts.map((a) => { const r = DEMO_RULES.find((x) => x.id === a.rule_id); return [a.id, a.created_at, `${a.rule_id} v${a.rule_version}`, `${r?.status ?? '?'} / ${r?.approval_evidence ? 'approved' : 'NOT CLINICALLY VALIDATED'}`, a.category, a.status, userName(a.assignee), a.occurrences, a.title]; }),
      note: 'Alerts originate from deterministic DEMO rules only. A rule match is a software result, not a diagnosis.',
    });
  }
  if (type === 'sleep_exercise' && astro) {
    tables.push({ title: 'Sleep records (estimated)', columns: ['Start (UTC)', 'End (UTC)', 'Duration (min)', 'Status', 'Method', 'Origin'], rows: db.sleep.filter((s) => s.astronaut_id === astro.id && Date.parse(s.start) >= from && Date.parse(s.start) <= to).map((s) => [s.start, s.end, s.duration_min, s.status, s.method, s.data_origin.toUpperCase()]), note: 'Sleep stages: not configured. Recovery indicator: not configured (no reviewed formula).' });
    tables.push({ title: 'Exercise records (device log)', columns: ['Start (UTC)', 'Modality', 'Duration (min)', 'Workload', 'Unit', 'Status', 'Origin'], rows: db.exercise.filter((e) => e.astronaut_id === astro.id && Date.parse(e.start) >= from && Date.parse(e.start) <= to).map((e) => [e.start, e.modality, e.duration_min, e.workload_value, e.workload_unit, e.status, e.data_origin.toUpperCase()]) });
  }
  if (type === 'radiation_summary' && astro) {
    const inRange = (r: { interval_start: string }) => Date.parse(r.interval_start) >= from && Date.parse(r.interval_start) <= to;
    tables.push({ title: 'Personal dosimeter — ABSORBED DOSE (mGy)', columns: ['Interval start', 'Interval end', 'Value', 'Unit', 'Quantity', 'Detector', 'Status', 'Origin'], rows: db.radiation.filter((r) => r.astronaut_id === astro.id && inRange(r)).map((r) => [r.interval_start, r.interval_end, r.value, r.unit, r.quantity, `${r.detector_class} ${r.detector_id}`, r.status, r.data_origin.toUpperCase()]), note: 'Cumulative dose: NOT CONFIGURED (no reviewed algorithm). Missing intervals are not filled. No reference limits are applied.' });
    tables.push({ title: 'Area monitors — DOSE EQUIVALENT (mSv) — separate quantity, never combined', columns: ['Interval start', 'Location', 'Value', 'Unit', 'Detector', 'Status', 'Origin'], rows: db.radiation.filter((r) => r.scope === 'area' && r.mission_id === missionId && inRange(r)).map((r) => [r.interval_start, r.location, r.value, r.unit, `${r.detector_class} ${r.detector_id}`, r.status, r.data_origin.toUpperCase()]) });
  }
  if (type === 'mission_overview') {
    const ls = gateway.status();
    tables.push({ title: 'Crew roster & monitoring (data) state', columns: ['Astronaut', 'ID', 'Role', 'Monitoring data state'], rows: db.astronauts.filter((a) => a.mission_id === missionId).map((a) => [a.display_name, a.id, a.crew_role, monitoringStateFor(a.id).state]), note: 'Monitoring state describes data availability/freshness only — never medical condition.' });
    tables.push({ title: 'Link status', columns: ['State', 'Last contact', 'Queued events', 'Last acked cursor', 'Last error'], rows: [[ls.state, ls.last_contact ?? 'never', ls.queued, ls.last_acked_cursor, ls.last_error ?? '']] });
    tables.push({ title: 'System / integrity alerts in interval', columns: ['Alert', 'Created', 'Rule', 'Status', 'Title'], rows: db.alerts.filter((a) => a.category !== 'clinical_demo' && (!a.astronaut_id || db.astronauts.find((x) => x.id === a.astronaut_id)?.mission_id === missionId) && Date.parse(a.created_at) >= from).map((a) => [a.id, a.created_at, `${a.rule_id} v${a.rule_version}`, a.status, a.title]) });
  }
  return { meta, tables };
}

function toCsv(meta: [string, string][], tables: Table[]): string {
  const lines: string[] = BANNERS.map((b) => `# ${b}`);
  meta.forEach(([k, v]) => lines.push(`# ${csvEscape(k)}: ${csvEscape(v)}`));
  for (const t of tables) {
    lines.push('', `# ${csvEscape(t.title)}`);
    if (t.note) lines.push(`# ${csvEscape(t.note)}`);
    lines.push(t.columns.map(csvEscape).join(','));
    t.rows.forEach((r) => lines.push(r.map(csvEscape).join(',')));
    if (!t.rows.length) lines.push('# NO RECORDS IN INTERVAL');
  }
  return lines.join('\r\n');
}

const PDF_ROW_LIMIT = 300;
function toPdf(meta: [string, string][], tables: Table[]): Uint8Array {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = 0;
  const header = () => {
    doc.setFillColor(180, 35, 47); doc.rect(0, 0, W, 30, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(`${BANNERS[0]}   ·   ${BANNERS[1]}`, 24, 19);
    doc.setTextColor(23, 33, 43); y = 52;
  };
  const ensure = (h: number) => { if (y + h > H - 30) { doc.addPage(); header(); } };
  header();
  doc.setFontSize(18); doc.text('ASTRAHEALTH report', 24, y); y += 20;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  meta.forEach(([k, v]) => { doc.text(`${k}: ${v}`, 24, y); y += 13; });
  for (const t of tables) {
    y += 10; ensure(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(t.title, 24, y); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    if (t.note) { doc.splitTextToSize(t.note, W - 48).forEach((l: string) => { ensure(10); doc.text(l, 24, y); y += 10; }); }
    const colW = (W - 48) / t.columns.length;
    doc.setFont('helvetica', 'bold');
    t.columns.forEach((c, i) => doc.text(doc.splitTextToSize(c, colW - 4)[0], 24 + i * colW, y)); y += 11;
    doc.setFont('helvetica', 'normal');
    const rows = t.rows.slice(0, PDF_ROW_LIMIT);
    if (!rows.length) { doc.text('NO RECORDS IN INTERVAL', 24, y); y += 10; }
    rows.forEach((r) => { ensure(10); r.forEach((c, i) => doc.text(doc.splitTextToSize(String(c ?? ''), colW - 4)[0] ?? '', 24 + i * colW, y)); y += 10; });
    if (t.rows.length > PDF_ROW_LIMIT) { ensure(12); doc.setFont('helvetica', 'bold'); doc.text(`PDF shows first ${PDF_ROW_LIMIT} of ${t.rows.length} rows. Generate the CSV format for the complete record set.`, 24, y); y += 12; doc.setFont('helvetica', 'normal'); }
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

export function createReport(ctx: Ctx, input: { type: ReportType; astronaut_id: string | null; mission_id: string; format: 'pdf' | 'csv'; from: number; to: number }) {
  const { user } = resolveSession(ctx.sid, ctx.csrf, true);
  rateLimit(`report:${user.id}`, 10, 60_000);
  if (!canReport(user, input.type, input.astronaut_id, input.mission_id)) { audit(user.id, 'report.generate', 'report', input.type, 'denied', input.astronaut_id ?? input.mission_id); throw new ApiError(403, 'forbidden', 'Not authorized to generate this report.'); }
  if (!(input.from < input.to)) throw new ApiError(400, 'validation', 'Invalid interval.');
  const { meta, tables } = build(input.type, REPORT_TYPES.find((r) => r.id === input.type)!.medical ? input.astronaut_id : null, input.mission_id, input.from, input.to);
  const content = input.format === 'csv' ? toCsv(meta, tables) : toPdf(meta, tables);
  const id = `RPT-${randomId().slice(0, 8).toUpperCase()}`;
  const rec: ReportRecord = { id, type: input.type, format: input.format, astronaut_id: REPORT_TYPES.find((r) => r.id === input.type)!.medical ? input.astronaut_id : null, mission_id: input.mission_id, interval_start: new Date(input.from).toISOString(), interval_end: new Date(input.to).toISOString(), generated_at: clock.iso(), generated_by: user.id, filename: `astrahealth_${input.type}_${id}.${input.format}`.replace(/[^a-zA-Z0-9_.-]/g, ''), row_count: tables.reduce((s, t) => s + t.rows.length, 0), content };
  db.reports.unshift(rec);
  audit(user.id, 'report.generate', 'report', id, 'allowed', input.type);
  return { ...rec, content: undefined };
}

export function listReports(ctx: Ctx) {
  const { user } = resolveSession(ctx.sid);
  return db.reports.filter((r) => canReport(user, r.type, r.astronaut_id, r.mission_id, r)).map((r) => ({ ...r, content: undefined, generated_by_name: userName(r.generated_by) }));
}

/** Download re-checks authorization at download time. */
export function downloadReport(ctx: Ctx, id: string): { blob: Blob; filename: string } {
  const { user } = resolveSession(ctx.sid);
  const r = db.reports.find((x) => x.id === id);
  if (!r || !canReport(user, r.type, r.astronaut_id, r.mission_id, r)) { audit(user.id, 'report.download', 'report', id, 'denied'); throw new ApiError(404, 'not_found', 'Report not found or not accessible.'); }
  audit(user.id, 'report.download', 'report', id, 'allowed');
  const blob = typeof r.content === 'string' ? new Blob([r.content], { type: 'text/csv;charset=utf-8' }) : new Blob([r.content as BlobPart], { type: 'application/pdf' });
  return { blob, filename: r.filename };
}
