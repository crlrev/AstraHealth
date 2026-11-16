import { Plug, PlugZap, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as api from '../backend/api';
import { subscribe, subscriberCount } from '../backend/bus';
import { LINK_PRESETS, SCENARIOS } from '../backend/edge';
import { db } from '../backend/store';
import { DEMO_MODE, ROLE_LABEL, ROLE_PERMISSIONS, SIM_SEED, SIMULATOR_VERSION } from '../domain/config';
import type { Role } from '../domain/types';
import { useApi, useAuth, useMutation } from '../ui/client';
import { Btn, LinkPill, Meta, PageHeader, Panel, Pill, Select, utc } from '../ui/components';
import { useMonitoredCrew } from '../ui/Layout';

function SimControl() {
  const run = useMutation();
  const link = useApi((c) => api.linkStatus(c), []);
  const crew = useApi((c) => api.listCrew(c, { pageSize: 50 }).items, []);
  const [target, setTarget] = useState('AST-001');
  const [msg, setMsg] = useState<string | null>(null);
  const exec = (fn: (c: api.Ctx) => unknown, ok: string) => { const r = run(fn); setMsg(r.ok ? ok : r.error.message); };
  const l = link.data;
  return (
    <Panel title="Simulator & edge gateway control" subtitle={`Deterministic seed ${SIM_SEED} · ${SIMULATOR_VERSION}. Scenarios are conspicuously simulated.`} action={l && <LinkPill s={l.state} />}>
      {l && <dl className="mb-4 grid grid-cols-2 gap-3 rounded-[14px] bg-[#F8FAFC] p-3 sm:grid-cols-5"><Meta label="Queued">{`${l.queued}/${l.outbox_capacity}`}</Meta><Meta label="Last contact">{utc(l.last_contact)}</Meta><Meta label="Acked cursor">{l.last_acked_cursor}</Meta><Meta label="Generator">{l.generatorRunning ? 'running' : l.generator_halted ? 'SAFE-STOPPED (outbox full)' : 'paused'}</Meta><Meta label="Ground API">{l.backendDown ? 'unavailable (sim)' : 'available'}</Meta></dl>}
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Link state</p>
      <div className="flex flex-wrap gap-2">{LINK_PRESETS.map((p) => <Btn key={p.state} variant={l?.state === p.state ? 'primary' : 'secondary'} onClick={() => exec((c) => api.simSetLink(c, p.state), `Link set to ${p.state}.`)}>{p.label}</Btn>)}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn onClick={() => exec((c) => api.simBackend(c, !l?.backendDown), l?.backendDown ? 'Ground API restored.' : 'Ground API outage simulated.')}>{l?.backendDown ? 'Restore ground API' : 'Simulate ground API outage'}</Btn>
        <Btn onClick={() => exec((c) => api.simGenerator(c, !l?.generatorRunning), 'Generator toggled.')}>{l?.generatorRunning ? 'Pause generator' : 'Resume generator'}</Btn>
        <Btn onClick={() => exec((c) => api.simRestart(c, false), 'Gateway restarted; last batch re-sent (should dedupe).')}><RotateCcw size={14} />Restart gateway</Btn>
        <Btn onClick={() => exec((c) => api.simRestart(c, true), 'Restarted with a truncated spool line (partial write).')}>Restart + corrupt spool line</Btn>
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Inject scenario event</p>
        <Select label="Target astronaut" value={target} onChange={setTarget} options={(crew.data ?? []).map((a) => ({ value: a.id, label: `${a.display_name} · ${a.id}` }))} />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {SCENARIOS.map((s) => (
          <button key={s.id} onClick={() => exec((c) => api.simInject(c, s.id, target), `Injected "${s.label}" → expected: ${s.expect}`)} className="rounded-[12px] border border-[#E2E8EE] bg-white p-3 text-left transition-colors hover:border-[#167A52] hover:bg-[#F8FAFC]">
            <span className="block text-[13px] font-semibold">{s.label}</span><span className="block text-[11px] text-[#526171]">Expect: {s.expect}</span>
          </button>
        ))}
      </div>
      {msg && <p role="status" className="mt-3 rounded-[10px] bg-[#F0ECFF] px-3 py-2 text-xs font-medium text-[#4E3699]">{msg}</p>}
    </Panel>
  );
}

function SubscriptionDemo() {
  const { ctx } = useAuth();
  const crew = useMonitoredCrew();
  const [astro, setAstro] = useState('');
  const target = astro || crew.data?.[0]?.id || '';
  const [state, setState] = useState<'connected' | 'dropped' | 'idle'>('idle');
  const [counts, setCounts] = useState({ live: 0, backfill: 0 });
  const [err, setErr] = useState<string | null>(null);
  const cursor = useRef(0);
  const unsub = useRef<null | (() => void)>(null);
  const connect = () => {
    setErr(null);
    try {
      const s = subscribe(ctx.sid ?? '', window.location.origin, [window.location.origin], [target], cursor.current, (m, mode) => { cursor.current = m.ingest_seq; setCounts((c) => ({ ...c, [mode]: c[mode] + 1 })); }, (reason) => { setState('dropped'); setErr(`Closed by server: ${reason}`); });
      cursor.current = s.cursor; unsub.current = s.unsubscribe; setState('connected');
    } catch (e) { setErr((e as Error).message); }
  };
  const drop = () => { unsub.current?.(); unsub.current = null; setState('dropped'); };
  useEffect(() => () => unsub.current?.(), []);
  if (!crew.data?.length) return null;
  return (
    <Panel title="Live subscription (WebSocket stand-in)" subtitle="Authenticated, origin-checked, per-astronaut authorized, resumable from cursor. Backfilled events are labelled, never shown as live.">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Stream astronaut" value={target} onChange={(v) => { drop(); cursor.current = 0; setCounts({ live: 0, backfill: 0 }); setAstro(v); setState('idle'); }} options={crew.data.map((a) => ({ value: a.id, label: a.id }))} />
        {state !== 'connected' ? <Btn variant="primary" onClick={connect}><PlugZap size={14} />{state === 'dropped' ? 'Resume from cursor' : 'Connect'}</Btn> : <Btn onClick={drop}><Plug size={14} />Drop connection</Btn>}
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-3"><Meta label="State">{state}</Meta><Meta label="Cursor">{cursor.current}</Meta><Meta label="Live events">{counts.live}</Meta><Meta label="Backfilled on resume">{counts.backfill}</Meta></dl>
      {err && <p className="mt-2 text-xs text-[#9E1C27]">{err}</p>}
    </Panel>
  );
}

function IntegrityLog() {
  const ev = useApi((c) => api.integrityEvents(c, 30), []);
  if (!ev.data?.length) return <Panel title="Telemetry integrity log"><p className="text-xs text-[#526171]">No integrity events visible to your role yet. Inject a scenario to see quarantine/dedupe behaviour.</p></Panel>;
  return (
    <Panel title="Telemetry integrity log" subtitle="Quarantined, rejected, out-of-order and gap events. Conflicting payloads are never overwritten.">
      <ul className="max-h-80 space-y-1.5 overflow-y-auto">{ev.data.map((e) => <li key={e.id} className="text-xs"><Pill tone={['conflict_quarantined', 'schema_invalid', 'unknown_unit', 'outbox_full', 'future_timestamp', 'unsupported_schema'].includes(e.kind) ? 'crit' : 'warn'}>{e.kind}</Pill> <span className="font-mono text-[#526171]">{utc(e.at)}</span> · {e.detail}</li>)}</ul>
    </Panel>
  );
}

function Rules() {
  const r = useApi((c) => api.listRules(c), []);
  if (!r.data) return null;
  return (
    <Panel title="Alert rules" subtitle="Deterministic, versioned, stored outside business logic. DEMO ONLY — NOT CLINICALLY VALIDATED. Disabled when demo mode is off.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs"><thead><tr className="text-[10px] uppercase text-[#526171]"><th className="py-1">Rule</th><th>Type</th><th>Condition</th><th>Status</th><th>Approval</th><th /></tr></thead>
          <tbody className="divide-y divide-[#EEF2F6]">{r.data.rules.map((x) => <tr key={x.id}><td className="py-2 font-semibold">{x.id} v{x.version}</td><td>{x.type}</td><td className="max-w-xs">{x.condition}{Object.keys(x.params).length ? ` (${JSON.stringify(x.params)})` : ''}</td><td><Pill tone="sim">{x.status}</Pill></td><td>{x.approval_evidence ?? 'none'}</td><td><Btn variant="ghost" disabled title="Requires clinical_rule_approve and external approval evidence; not available in this prototype">Approve (unavailable)</Btn></td></tr>)}</tbody>
        </table>
      </div>
    </Panel>
  );
}

function Users() {
  const run = useMutation();
  const users = useApi((c) => api.listUsers(c), []);
  const [msg, setMsg] = useState<string | null>(null);
  if (!users.data) return null;
  return (
    <Panel title="Users & roles" subtitle="Disabling a user revokes all sessions and live subscriptions immediately. Administrators have no implicit medical access.">
      <ul className="divide-y divide-[#EEF2F6]">{users.data.map((u) => <li key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-xs"><div className="flex-1"><p className="text-[13px] font-semibold">{u.display_name} <span className="font-mono font-normal text-[#526171]">{u.username}</span></p><p className="text-[#526171]">{u.role_label} · scope: {u.self ? `self ${u.self}` : u.assigned.join(', ') || 'none'} · {u.sessions} session(s)</p></div>{u.disabled && <Pill tone="crit">Disabled</Pill>}<Btn onClick={() => { const r = run((c) => api.setUserDisabled(c, u.id, !u.disabled)); setMsg(r.ok ? 'Updated.' : r.error.message); }}>{u.disabled ? 'Enable' : 'Disable'}</Btn></li>)}</ul>
      {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
    </Panel>
  );
}

function Audit() {
  const a = useApi((c) => api.listAudit(c, 80), []);
  if (!a.data) return null;
  return (
    <Panel title="Audit log" subtitle="Append-only in application behaviour. Contains no medical values, passwords or tokens.">
      <ul className="max-h-80 space-y-1 overflow-y-auto font-mono text-[11px]">{a.data.map((e) => <li key={e.id}><span className="text-[#526171]">{e.at.slice(11, 19)}</span> {e.user_id ?? 'anon'} <b>{e.action}</b> {e.target_type}:{e.target_id ?? '-'} <span className={e.outcome === 'denied' ? 'text-[#9E1C27]' : 'text-[#145F41]'}>{e.outcome}</span>{e.context ? ` (${e.context})` : ''}</li>)}</ul>
    </Panel>
  );
}

export default function Settings() {
  const { me, can, logout } = useAuth();
  const v = useApi(() => ({ measurements: db.measurements.length, alerts: db.alerts.length, integrity: db.integrity.length, subs: subscriberCount(), audit: db.audit.length }), []);
  return (
    <div>
      <PageHeader title="Settings" subtitle="Only implemented controls are shown; sections depend on your permissions." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Account">
          <dl className="grid grid-cols-2 gap-3"><Meta label="Name">{me?.display_name}</Meta><Meta label="Role">{me?.role_label}</Meta><Meta label="Username">{me?.username}</Meta><Meta label="Session">In-memory, 30 min idle expiry</Meta></dl>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Effective permissions</p>
          <div className="mt-1 flex flex-wrap gap-1">{me?.permissions.map((p) => <Pill key={p} tone="neutral">{p}</Pill>)}</div>
          <div className="mt-3"><Btn onClick={logout}>Sign out</Btn></div>
        </Panel>
        <Panel title="System status (in-browser stand-in backend)">
          <dl className="grid grid-cols-3 gap-3"><Meta label="health/live">ok</Meta><Meta label="health/ready">ok</Meta><Meta label="Demo mode">{DEMO_MODE ? 'ON' : 'off'}</Meta><Meta label="Measurements stored">{v.data?.measurements}</Meta><Meta label="Alerts">{v.data?.alerts}</Meta><Meta label="Integrity events">{v.data?.integrity}</Meta><Meta label="Live subscribers">{v.data?.subs}</Meta><Meta label="Audit events">{v.data?.audit}</Meta><Meta label="Persistence">Volatile (reseeded on reload)</Meta></dl>
        </Panel>
        {can('sim.control') && <div className="xl:col-span-2"><SimControl /></div>}
        <SubscriptionDemo />
        <IntegrityLog />
        {can('rule.view') && <div className="xl:col-span-2"><Rules /></div>}
        {can('users.manage') && <Users />}
        {can('audit.view') && <Audit />}
        <Panel title="Permission matrix (server-side, default deny)" className="xl:col-span-2">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-[11px]"><thead><tr className="uppercase text-[#526171]"><th className="py-1">Role</th><th>Permissions</th></tr></thead><tbody className="divide-y divide-[#EEF2F6]">{(Object.keys(ROLE_PERMISSIONS) as Role[]).map((r) => <tr key={r}><td className="py-2 pr-3 font-semibold">{ROLE_LABEL[r]}</td><td className="py-2 font-mono">{ROLE_PERMISSIONS[r].join(' · ')}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </div>
  );
}
