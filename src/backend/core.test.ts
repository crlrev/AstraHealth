import { beforeAll, describe, expect, it } from 'vitest';
import { checkComparability, csvEscape, evaluateFreshness, toChartSeries } from '../domain/logic';
import type { TelemetryEnvelope } from '../domain/types';
import * as api from './api';
import { DEMO_PASSWORD, initUsers, login, logout } from './auth';
import { subscribe } from './bus';
import { gateway } from './edge';
import { ingestBatch } from './ingest';
import { createReport, downloadReport } from './reports';
import { clock, db, seed, seriesInRange } from './store';

const ORIGIN = 'http://localhost';
async function as(username: string): Promise<api.Ctx> { const s = await login(username, DEMO_PASSWORD); return { sid: s.sid, csrf: s.csrf }; }
function env(over: Partial<TelemetryEnvelope> = {}): TelemetryEnvelope {
  const now = clock.now();
  return gateway.adapter.envelope('AST-001', 'heart_rate', 66, now - 1000, over);
}
const expectErr = (fn: () => unknown, status: number) => { try { fn(); } catch (e) { expect((e as { status: number }).status).toBe(status); return; } throw new Error(`expected ${status}`); };

beforeAll(async () => { seed(); await initUsers(); });

describe('seed & provenance', () => {
  it('seeds >45k simulated measurements, all with scenario provenance', () => {
    expect(db.measurements.length).toBeGreaterThan(45_000);
    expect(db.measurements.every((m) => m.data_origin === 'simulated' && !!m.simulation_scenario_id)).toBe(true);
  });
});

describe('ingestion integrity', () => {
  it('accepts valid, ignores identical replay, quarantines conflicting duplicate without overwrite', () => {
    const e = env();
    expect(ingestBatch([e]).accepted).toBe(1);
    const n = db.measurements.length;
    const r2 = ingestBatch([{ ...e }], 'replay');
    expect(r2.duplicates).toBe(1);
    expect(db.measurements.length).toBe(n);
    const r3 = ingestBatch([{ ...e, raw_value: 99 }]);
    expect(r3.quarantined).toBe(1);
    expect(db.byEventId.get(e.event_id)!.raw_value).toBe(66);
    expect(db.integrity[0].kind).toBe('conflict_quarantined');
  });
  it('same (stream, seq) with a new event_id and different payload is a conflict', () => {
    const e = env();
    ingestBatch([e]);
    const r = ingestBatch([{ ...e, event_id: 'other-id', raw_value: 70 }]);
    expect(r.quarantined).toBe(1);
  });
  it('rejects / quarantines invalid input', () => {
    expect(ingestBatch([{ ...env(), raw_unit: 'beats/hr' }]).quarantined).toBe(1);
    expect(ingestBatch([{ ...env(), raw_value: 'x' as unknown as number }]).rejected).toBe(1);
    expect(ingestBatch([{ ...env(), schema_version: '9.9' }]).rejected).toBe(1);
    expect(ingestBatch([{ ...env(), simulation_scenario_id: null }]).rejected).toBe(1);
    expect(ingestBatch([{ ...env(), measured_at: new Date(clock.now() + 600_000).toISOString() }]).quarantined).toBe(1);
    expect(ingestBatch([null, 'garbage', 42]).rejected).toBe(3);
  });
  it('flags out-of-order events and stores them in measurement-time order; records gaps', () => {
    const a = env(); const b = env(); const c = env();
    ingestBatch([c]);
    const r = ingestBatch([a]);
    expect(r.accepted).toBe(1);
    expect(db.byEventId.get(a.event_id)!.out_of_order).toBe(true);
    expect(db.integrity.some((i) => i.kind === 'sequence_gap' && i.stream_id === c.stream_id)).toBe(true);
    void b;
    const series = seriesInRange('AST-001', 'heart_rate', 0, clock.now() + 1);
    for (let i = 1; i < series.length; i++) expect(Date.parse(series[i].measured_at)).toBeGreaterThanOrEqual(Date.parse(series[i - 1].measured_at));
  });
  it('applies only the explicit °F→°C conversion and keeps raw values', () => {
    const e = gateway.adapter.envelope('AST-001', 'skin_temperature', 95, clock.now() - 500, { raw_unit: '°F' });
    ingestBatch([e]);
    const s = db.byEventId.get(e.event_id)!;
    expect(s.raw_value).toBe(95); expect(s.raw_unit).toBe('°F');
    expect(s.normalized_value).toBeCloseTo(35, 5); expect(s.conversion_version).toBe('conv-temp-f-c-v1');
  });
});

describe('rules & alerts', () => {
  it('demo event creates one alert; identical replay creates no duplicate', () => {
    const before = db.alerts.length;
    const e = gateway.adapter.envelope('AST-003', 'demo_marker', 1, clock.now() - 100);
    ingestBatch([e]); ingestBatch([{ ...e }], 'replay');
    expect(db.alerts.length).toBe(before + 1);
    expect(db.alerts[0].occurrences).toBe(1);
    expect(db.alerts[0].simulation_only).toBe(true);
  });
  it('poor-quality data creates a data-quality event, never a clinical alert', () => {
    const e = env({ raw_value: 150, quality_state: 'poor', validity_state: 'questionable' });
    ingestBatch([e]);
    const a = db.alerts.find((x) => x.source_event_id === e.event_id)!;
    expect(a.category).toBe('data_quality');
    expect(db.alerts.some((x) => x.rule_id === 'DEMO-RANGE-HR-001' && x.source_event_id === e.event_id)).toBe(false);
  });
  it('acknowledge does not resolve; resolve requires note; stale version -> 409', async () => {
    const ctx = await as('dr.okafor');
    const e = gateway.adapter.envelope('AST-001', 'demo_marker', 1, clock.now() - 100);
    ingestBatch([e]);
    const alert = db.alerts.find((x) => x.source_event_id === e.event_id)!;
    const v = alert.version;
    api.ackAlert(ctx, alert.id, v);
    expect(alert.status).toBe('acknowledged');
    expectErr(() => api.ackAlert(ctx, alert.id, v), 409);
    expectErr(() => api.resolveAlert(ctx, alert.id, '', alert.version), 400);
    api.resolveAlert(ctx, alert.id, 'Demo workflow complete', alert.version);
    expect(alert.status).toBe('resolved');
  });
  it('specialist cannot resolve clinical demo alerts; ops cannot see them', async () => {
    const spec = await as('spec.lindqvist'); const ops = await as('ops.tanaka');
    const a = db.alerts.find((x) => x.category === 'clinical_demo' && x.status !== 'resolved')!;
    expect(api.listAlerts(ops).some((x) => x.category === 'clinical_demo')).toBe(false);
    expectErr(() => api.resolveAlert(spec, a.id, 'x', a.version), 404);
  });
  it('clinical approval is blocked without permission', async () => {
    const ctx = await as('dr.okafor');
    expectErr(() => api.approveRule(ctx, 'DEMO-RANGE-HR-001', 'evidence'), 403);
  });
});

describe('authentication & authorization', () => {
  it('rejects bad credentials and locks out after repeated failures', async () => {
    await expect(login('admin.reyes', 'nope')).rejects.toMatchObject({ status: 401 });
    for (let i = 0; i < 4; i++) await login('admin.reyes', 'nope').catch(() => null);
    await expect(login('admin.reyes', DEMO_PASSWORD)).rejects.toMatchObject({ status: 429 });
    db.users.get('u-admin')!.locked_until = 0;
  });
  it('stores only hashed passwords', () => { for (const u of db.users.values()) expect(u.password_hash).not.toContain(DEMO_PASSWORD); });
  it('enforces object-level access (IDOR)', async () => {
    const astro = await as('astro.vega'); const ops = await as('ops.tanaka'); const admin = await as('admin.reyes'); const surg = await as('dr.okafor');
    expect(api.crewSummary(astro, 'AST-001').cards.length).toBeGreaterThan(0);
    expectErr(() => api.crewSummary(astro, 'AST-002'), 404);
    expectErr(() => api.getAstronaut(astro, 'AST-002'), 404);
    expectErr(() => api.crewSummary(ops, 'AST-001'), 404);
    expectErr(() => api.crewSummary(admin, 'AST-001'), 404);
    expectErr(() => api.wellness(surg, 'AST-005'), 404);
    expectErr(() => api.history(surg, 'AST-006', 'heart_rate', '1h'), 404);
    expect(api.listCrew(astro).items.map((x) => x.id)).toEqual(['AST-001']);
    expect(api.listNotes(astro).every((n) => n.astronaut_id === 'AST-001' && n.shared_with_astronaut)).toBe(true);
  });
  it('requires CSRF token for mutations', async () => {
    const surg = await as('dr.okafor');
    expectErr(() => api.createNote({ sid: surg.sid, csrf: null }, { kind: 'clinical', astronaut_id: 'AST-001', title: 't', body: 'b', shared_with_astronaut: false }), 403);
  });
  it('logout and disablement revoke access', async () => {
    const c = await as('dr.mbeki');
    logout(c.sid!);
    expectErr(() => api.me(c), 401);
    const c2 = await as('dr.mbeki'); const admin = await as('admin.reyes');
    api.setUserDisabled(admin, 'u-surg2', true);
    expectErr(() => api.me(c2), 401);
    api.setUserDisabled(admin, 'u-surg2', false);
  });
  it('session idle expiry', async () => {
    const c = await as('dr.okafor');
    clock.fixed = Date.now() + 31 * 60_000;
    expectErr(() => api.me(c), 401);
    clock.fixed = null;
  });
  it('search is scoped', async () => {
    const astro = await as('astro.vega');
    expect(api.search(astro, 'kale').total).toBe(0);
    expect(api.search(astro, 'vega').total).toBe(1);
    const surg = await as('dr.okafor');
    expect(api.search(surg, 'AST-00').items.every((i) => i.kind !== 'Astronaut' || ['AST-001', 'AST-002', 'AST-003', 'AST-004'].includes(i.id))).toBe(true);
  });
  it('subscription enforces origin and per-astronaut authorization; resumes from cursor', async () => {
    const astro = await as('astro.vega');
    expectErr(() => subscribe(astro.sid!, 'http://evil', [ORIGIN], ['AST-001'], 0, () => {}, () => {}), 403);
    expectErr(() => subscribe(astro.sid!, ORIGIN, [ORIGIN], ['AST-002'], 0, () => {}, () => {}), 403);
    const cursor = db.ingestSeq;
    ingestBatch([env()]);
    const got: string[] = [];
    const s = subscribe(astro.sid!, ORIGIN, [ORIGIN], ['AST-001'], cursor, (_m, mode) => got.push(mode), () => {});
    expect(got).toEqual(['backfill']);
    s.unsubscribe();
  });
});

describe('notes concurrency', () => {
  it('second stale correction gets 409 and does not overwrite; history preserved', async () => {
    const c = await as('dr.okafor');
    const n = api.createNote(c, { kind: 'clinical', astronaut_id: 'AST-002', title: 'Demo', body: 'v1', shared_with_astronaut: false });
    api.editNote(c, n.id, 'v2', 'typo', 1);
    expectErr(() => api.editNote(c, n.id, 'v2-other', 'race', 1), 409);
    expect(n.body).toBe('v2');
    expect(n.revisions[0].body).toBe('v1');
  });
});

describe('freshness, comparability, charts, csv', () => {
  it('freshness is per-type and unconfigured when no policy', () => {
    const now = Date.now();
    expect(evaluateFreshness('spo2', new Date(now).toISOString(), now)).toBe('unconfigured');
    expect(evaluateFreshness('heart_rate', new Date(now - 10_000).toISOString(), now)).toBe('fresh');
    expect(evaluateFreshness('heart_rate', new Date(now - 120_000).toISOString(), now)).toBe('delayed');
    expect(evaluateFreshness('heart_rate', new Date(now - 3_600_000).toISOString(), now)).toBe('stale');
    expect(evaluateFreshness('heart_rate', null, now)).toBe('unavailable');
  });
  it('pre-flight baseline is not comparable; first in-flight week is', async () => {
    const c = await as('dr.okafor');
    expect(api.baselineCompare(c, 'AST-001', 'heart_rate', 'pre_flight').comparable).toBe(false);
    const fw = api.baselineCompare(c, 'AST-001', 'heart_rate', 'first_week');
    expect(fw.comparable).toBe(true);
    expect(api.baselineCompare(c, 'AST-001', 'body_mass', 'pre_flight').baselineMean).toBeNull();
    expect(checkComparability('heart_rate', [], []).comparable).toBe(false);
  });
  it('chart series bounded and gaps preserved', () => {
    const recs = seriesInRange('AST-003', 'heart_rate', 0, Date.now());
    const s = toChartSeries(recs, 65 * 60e3, 600);
    expect(s.length).toBeLessThanOrEqual(600);
    expect(s.some((p) => p.gap)).toBe(true);
    expect(recs.length).toBeGreaterThan(600); // raw retained
  });
  it('neutralises CSV formula injection', () => {
    expect(csvEscape('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvEscape('+1')).toBe("'+1");
    expect(csvEscape('-2')).toBe("'-2");
    expect(csvEscape('@SUM')).toBe("'@SUM");
    expect(csvEscape('ok')).toBe('ok');
  });
});

describe('reports', () => {
  it('authorizes generation and download; CSV carries banners', async () => {
    const astro = await as('astro.vega'); const ops = await as('ops.tanaka'); const surg = await as('dr.okafor');
    const now = Date.now();
    expectErr(() => createReport(astro, { type: 'measurement_history', astronaut_id: 'AST-002', mission_id: 'MSN-HEL-07', format: 'csv', from: now - 3600e3, to: now }), 403);
    expectErr(() => createReport(ops, { type: 'measurement_history', astronaut_id: 'AST-001', mission_id: 'MSN-HEL-07', format: 'csv', from: now - 3600e3, to: now }), 403);
    const r = createReport(surg, { type: 'measurement_history', astronaut_id: 'AST-001', mission_id: 'MSN-HEL-07', format: 'csv', from: now - 3600e3, to: now });
    const { blob } = downloadReport(surg, r.id);
    const text = await blob.text();
    expect(text).toContain('SIMULATED DATA — NOT REAL ASTRONAUT TELEMETRY');
    expect(text).toContain('NOT FOR CLINICAL USE');
    expectErr(() => downloadReport(astro, r.id), 404);
    expectErr(() => downloadReport(ops, r.id), 404);
    const m = createReport(ops, { type: 'mission_overview', astronaut_id: null, mission_id: 'MSN-HEL-07', format: 'pdf', from: now - 86400e3, to: now });
    expect(m.row_count).toBeGreaterThan(0);
  });
});

describe('edge gateway store-and-forward', () => {
  it('queues while disconnected, replays as backfill on reconnect, dedups after restart, surfaces malformed spool', () => {
    gateway.adapter.start();
    gateway.setLink('disconnected');
    const t0 = Date.now();
    for (let i = 0; i < 10; i++) gateway.tick(t0 - 60_000 + i * 4000);
    const queued = gateway.outbox.length;
    expect(queued).toBeGreaterThan(0);
    const before = db.measurements.length;
    gateway.setLink('connected');
    gateway.flush(t0, 10_000);
    expect(gateway.outbox.length).toBe(0);
    const added = db.measurements.slice(before);
    expect(added.length).toBe(queued);
    expect(added.every((m) => m.backfilled)).toBe(true);
    const n = db.measurements.length;
    gateway.restart(true);
    gateway.flush(t0, 10_000);
    expect(db.measurements.length).toBe(n); // re-sent batch deduplicated
    expect(db.integrity.some((i) => i.kind === 'outbox_malformed_record')).toBe(true);
    gateway.adapter.stop();
  });
  it('outbox overflow halts generation without discarding queued events', () => {
    gateway.setLink('disconnected');
    gateway.adapter.start();
    const fake = JSON.stringify(env());
    gateway.enqueue(Array.from({ length: 2000 }, () => fake));
    expect(gateway.outbox.length).toBe(1500);
    expect(gateway.halted).toBe(true);
    expect(db.integrity.some((i) => i.kind === 'outbox_full')).toBe(true);
    gateway.outbox = []; gateway.halted = false; gateway.setLink('connected');
  });
});
