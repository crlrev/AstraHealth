import { Activity, ChevronLeft, ChevronRight, PersonStanding } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as api from '../backend/api';
import { listReports } from '../backend/reports';
import { MEASUREMENTS } from '../domain/config';
import { AlertRow } from '../ui/Alerts';
import { useApi } from '../ui/client';
import { Avatar, Btn, EmptyState, ErrorState, Meta, MonitoringPill, PageHeader, Panel, Pill, Select, SimPill, utc } from '../ui/components';
import { useSelection } from '../ui/Layout';
import { MeasurementCardView } from '../ui/MeasurementCard';

export function CrewList() {
  const [q, setQ] = useState('');
  const [mission, setMission] = useState('');
  const [page, setPage] = useState(1);
  const nav = useNavigate();
  const missions = useApi((c) => api.listMissions(c), []);
  const crew = useApi((c) => api.listCrew(c, { q, mission: mission || undefined, page, pageSize: 5 }), [q, mission, page]);
  const pages = crew.data ? Math.max(1, Math.ceil(crew.data.total / crew.data.pageSize)) : 1;
  return (
    <div>
      <PageHeader title="Crew Monitoring" subtitle="Only crew within your authorized scope are listed. Fictional demo profiles." />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Filter
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, ID or callsign" className="rounded-[10px] border border-[#D3DBE3] px-3 py-2 text-[13px] font-medium normal-case tracking-normal" />
          </label>
          <Select label="Mission" value={mission} onChange={(v) => { setMission(v); setPage(1); }} options={[{ value: '', label: 'All accessible missions' }, ...(missions.data ?? []).map((m) => ({ value: m.id, label: m.name }))]} />
        </div>
        {crew.error ? <ErrorState error={crew.error} /> : !crew.data?.items.length ? <EmptyState title="No crew match">Try a different filter. Results are limited to your access scope.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead><tr className="text-[11px] uppercase tracking-wide text-[#526171]"><th className="pb-2 font-semibold">Astronaut</th><th className="pb-2 font-semibold">Role</th><th className="pb-2 font-semibold">Mission</th><th className="pb-2 font-semibold">Flight surgeon</th><th className="pb-2 font-semibold">Data / monitoring state</th><th /></tr></thead>
              <tbody className="divide-y divide-[#EEF2F6]">
                {crew.data.items.map((a) => (
                  <tr key={a.id} className="cursor-pointer transition-colors hover:bg-[#F8FAFC]" onClick={() => nav(`/crew/${a.id}`)}>
                    <td className="py-3"><div className="flex items-center gap-3"><Avatar initials={a.initials} hue={a.hue} size={34} /><div><Link to={`/crew/${a.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{a.display_name}</Link><p className="text-[11px] text-[#526171]">{a.id} · {a.callsign}</p></div></div></td>
                    <td className="py-3">{a.crew_role}</td>
                    <td className="py-3">{a.mission_name}</td>
                    <td className="py-3">{a.surgeon_name}</td>
                    <td className="py-3">{a.monitoring_state ? <MonitoringPill s={a.monitoring_state} /> : <Pill tone="neutral">Not in your monitoring scope</Pill>}</td>
                    <td className="py-3 text-right"><ChevronRight size={16} className="inline text-[#617080]" aria-hidden /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-[#526171]">
          <span>{crew.data?.total ?? 0} result(s) · page {page} of {pages}</span>
          <div className="flex gap-2"><Btn disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></Btn><Btn disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></Btn></div>
        </div>
      </Panel>
    </div>
  );
}

export function CrewProfile() {
  const { astronautId = '' } = useParams();
  const nav = useNavigate();
  const { openAlert } = useSelection();
  const astro = useApi((c) => api.getAstronaut(c, astronautId), [astronautId]);
  const summary = useApi((c) => (astro.data?.monitoring_access ? api.crewSummary(c, astronautId) : null), [astronautId, astro.data?.monitoring_access]);
  const notes = useApi((c) => (astro.data?.monitoring_access ? api.listNotes(c, astronautId) : []), [astronautId, astro.data?.monitoring_access]);
  const alerts = useApi((c) => (astro.data?.monitoring_access ? api.listAlerts(c, { astronautId }) : []), [astronautId, astro.data?.monitoring_access]);
  const reports = useApi((c) => listReports(c).filter((r) => r.astronaut_id === astronautId), [astronautId]);
  const base = useApi((c) => (astro.data?.monitoring_access ? (['heart_rate', 'respiratory_rate', 'hrv_rmssd', 'body_mass'] as const).map((t) => ({ t, h: api.history(c, astronautId, t, 'mission', 'pre_flight') })) : []), [astronautId, astro.data?.monitoring_access]);
  if (astro.error) return <div><PageHeader title="Crew profile" /><ErrorState error={astro.error} /><div className="mt-4"><Btn onClick={() => nav('/crew')}>Back to crew list</Btn></div></div>;
  const a = astro.data!;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Avatar initials={a.initials} hue={a.hue} size={64} />
        <div className="flex-1">
          <p className="text-xs text-[#526171]"><Link to="/crew" className="hover:underline">Crew</Link> / {a.id}</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{a.display_name}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5"><SimPill label="FICTIONAL DEMO PROFILE" /><Pill tone="neutral">{a.crew_role}</Pill><Pill tone="neutral">{a.mission.name} · {a.mission.phase.replace('_', '-')}</Pill>{summary.data && <MonitoringPill s={summary.data.monitoring.state} />}</div>
        </div>
        {a.monitoring_access && <div className="flex gap-2"><Btn onClick={() => nav(`/crew/${a.id}/anatomy`)}><PersonStanding size={15} />Anatomy</Btn><Btn variant="primary" onClick={() => nav(`/crew/${a.id}/vitals`)}><Activity size={15} />Vital signs</Btn></div>}
      </div>
      {!a.monitoring_access ? (
        <Panel title="Operational profile"><dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Meta label="ID">{a.id}</Meta><Meta label="Callsign">{a.callsign}</Meta><Meta label="Mission">{a.mission.name}</Meta><Meta label="Vehicle">{a.mission.vehicle}</Meta></dl><p className="mt-4 text-xs text-[#526171]">Medical information is not available to your role.</p></Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Panel title="Latest measurement summaries">
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">{summary.data?.cards.map((c) => <MeasurementCardView key={c.type} c={c} compact onOpen={() => nav(`/crew/${a.id}/vitals#${c.type}`)} />)}</div>
            </Panel>
            <Panel title="Pre-flight baseline records" subtitle="Recorded in 1 g with different posture/method. Comparison with in-flight data is governed by the comparability policy (see Health Analytics).">
              <table className="w-full text-left text-[13px]"><thead><tr className="text-[11px] uppercase text-[#526171]"><th className="pb-2">Measurement</th><th className="pb-2">Records</th><th className="pb-2">Method / context</th></tr></thead>
                <tbody className="divide-y divide-[#EEF2F6]">{(base.data ?? []).map(({ t, h }) => <tr key={t}><td className="py-2">{MEASUREMENTS[t].label}</td><td className="py-2">{h.rawCount}</td><td className="py-2 text-xs text-[#526171]">{h.recent[0] ? `${h.recent[0].measurement_method} · ${Object.values(h.recent[0].measurement_context).join(', ')}` : 'No pre-flight records'}</td></tr>)}</tbody>
              </table>
            </Panel>
            <Panel title="Authorized notes">
              {!notes.data?.length ? <EmptyState title="No notes visible to you" /> : <ul className="space-y-2">{notes.data.map((n) => <li key={n.id} className="rounded-[12px] bg-[#F8FAFC] p-3"><div className="flex flex-wrap items-center gap-2"><Pill tone={n.kind === 'clinical' ? 'info' : 'neutral'}>{n.kind}</Pill><span className="text-[13px] font-semibold">{n.title}</span><span className="text-[11px] text-[#526171]">v{n.version} · {n.author_name} · {utc(n.created_at)}</span></div><p className="mt-1 text-xs text-[#33414F]">{n.body}</p></li>)}</ul>}
              <div className="mt-3"><Link className="text-xs font-semibold text-[#167A52] hover:underline" to={`/records?a=${a.id}`}>Open medical records →</Link></div>
            </Panel>
          </div>
          <div className="space-y-4">
            <Panel title="Devices (simulated)">
              {!a.devices.length ? <EmptyState title="Device inventory not available to your role" /> : <ul className="space-y-2">{a.devices.map((d) => <li key={d.id} className="text-xs"><p className="font-semibold text-[#17212B]">{d.id} · {d.model}</p><p className="text-[#526171]">{d.body_site} · fw {d.firmware} · {d.calibration_ref}</p></li>)}</ul>}
            </Panel>
            <Panel title="Alerts for this astronaut">
              <div className="space-y-2">{!alerts.data?.length ? <EmptyState title="No alerts visible to you" /> : alerts.data.slice(0, 6).map((x) => <AlertRow key={x.id} a={x} onOpen={() => openAlert(x.id)} />)}</div>
            </Panel>
            <Panel title="Report history">
              {!reports.data?.length ? <EmptyState title="No reports generated yet"><Link to="/reports" className="font-semibold text-[#167A52]">Create a report</Link></EmptyState> : <ul className="space-y-1 text-xs">{reports.data.map((r) => <li key={r.id}>{r.id} · {r.type} · {r.format.toUpperCase()} · {utc(r.generated_at)}</li>)}</ul>}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
