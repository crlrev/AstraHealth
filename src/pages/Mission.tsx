import { ChevronRight, Layers, Orbit, Satellite, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as api from '../backend/api';
import { formatAge } from '../domain/logic';
import { AlertRow } from '../ui/Alerts';
import { BodyMap } from '../ui/BodyMap';
import { useApi, useAuth } from '../ui/client';
import { Avatar, EmptyState, ErrorState, LinkPill, Meta, MonitoringPill, PageHeader, Panel, Pill, SimPill, utc } from '../ui/components';
import { AstronautPicker, useNow, useSelection } from '../ui/Layout';
import { MeasurementCardView, ValueDisplay } from '../ui/MeasurementCard';

function MissionFacts() {
  const now = useNow();
  const missions = useApi((c) => api.listMissions(c), []);
  const crew = useApi((c) => api.listCrew(c, { pageSize: 50 }), []);
  const { can } = useAuth();
  const link = useApi((c) => (can('ops.view') ? api.linkStatus(c) : null), []);
  if (missions.error) return <ErrorState error={missions.error} />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(missions.data ?? []).map((m) => {
        const met = now - Date.parse(m.launch_at);
        const d = Math.floor(met / 86400e3), h = Math.floor((met % 86400e3) / 3600e3), mi = Math.floor((met % 3600e3) / 60e3);
        return (
          <Panel key={m.id} className="relative overflow-hidden">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#E6F4EC]" aria-hidden />
            <div className="relative">
              <div className="flex items-center gap-2 text-[#167A52]"><Orbit size={16} aria-hidden /><span className="text-[11px] font-bold uppercase tracking-wide">{m.id}</span></div>
              <h2 className="mt-1 text-lg font-semibold">{m.name}</h2>
              <p className="text-xs text-[#526171]">{m.vehicle}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <Meta label="Phase">{m.phase.replace('_', '-')}</Meta>
                <Meta label="Mission elapsed">{`${d}d ${String(h).padStart(2, '0')}h ${String(mi).padStart(2, '0')}m`}</Meta>
                <Meta label="Crew visible">{(crew.data?.items ?? []).filter((a) => a.mission_id === m.id).length}</Meta>
              </dl>
            </div>
          </Panel>
        );
      })}
      {link.data && (
        <Panel className="md:col-span-2" title={<span className="flex items-center gap-2"><Satellite size={16} aria-hidden /> Ground / edge link (simulated)</span>} action={<LinkPill s={link.data.state} />}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Meta label="Last sync">{link.data.last_contact ? formatAge(now - Date.parse(link.data.last_contact)) : 'never'}</Meta>
            <Meta label="Observed latency">{link.data.observed_latency_ms === null ? 'n/a' : `${link.data.observed_latency_ms} ms`}</Meta>
            <Meta label="Queued in outbox">{`${link.data.queued} / ${link.data.outbox_capacity}`}</Meta>
            <Meta label="Last acked cursor">{link.data.last_acked_cursor}</Meta>
            <Meta label="Replayed total">{link.data.replayedTotal}</Meta>
          </dl>
          {link.data.last_error && <p className="mt-2 text-xs font-medium text-[#6E4900]">{link.data.last_error}</p>}
          {link.data.generator_halted && <p className="mt-2 text-xs font-semibold text-[#9E1C27]">Outbox full — generator safe-stopped. No events discarded.</p>}
        </Panel>
      )}
    </div>
  );
}

function CrewSnapshot({ id }: { id: string }) {
  const nav = useNavigate();
  const astro = useApi((c) => api.getAstronaut(c, id), [id]);
  const summary = useApi((c) => api.crewSummary(c, id), [id]);
  const map = useApi((c) => api.anatomyMap(c, id), [id]);
  const alerts = useApi((c) => api.listAlerts(c, { status: 'open', astronautId: id }), [id]);
  const { openAlert } = useSelection();
  if (astro.error) return <ErrorState error={astro.error} />;
  if (summary.error) return <ErrorState error={summary.error} />;
  const a = astro.data!, s = summary.data!;
  const pick = (t: string) => s.cards.find((c) => c.type === t)!;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel className="relative overflow-hidden md:min-h-[560px]">
          <div className="relative z-10 grid grid-cols-2 gap-4 md:absolute md:left-5 md:top-5 md:block md:max-w-[200px] md:space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Crew snapshot</p>
              <h2 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">{a.display_name}</h2>
              <p className="text-xs text-[#526171]">{a.id} · {a.crew_role}</p>
            </div>
            <div><ValueDisplay c={pick('heart_rate')} big /><p className="mt-1 text-xs text-[#526171]">Heart rate · {pick('heart_rate').acquisition_mode}</p></div>
            <div><ValueDisplay c={pick('respiratory_rate')} /><p className="mt-1 text-xs text-[#526171]">Respiratory rate</p></div>
            <div className="space-y-1"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Data / monitoring state</p><MonitoringPill s={s.monitoring.state} /></div>
          </div>
          <div className="pt-4 md:pl-32">
            {map.data && <BodyMap height={500} selected={null} onSelect={(r) => nav(`/crew/${id}/anatomy?region=${r}`)} regions={map.data.map((r) => ({ id: r.id, label: r.label, mappedCount: r.cards.length, attention: r.cards.some((x) => x.card.freshness !== 'fresh' && x.card.freshness !== 'unconfigured' || x.card.ruleState === 'configured_rule_match') }))} />}
          </div>
          <div className="absolute bottom-5 right-5 flex flex-col gap-2">
            <button onClick={() => nav(`/crew/${id}/anatomy`)} className="grid h-10 w-10 place-items-center rounded-full border border-[#E2E8EE] bg-white shadow-sm hover:bg-[#F4F7FA]" aria-label="Open anatomical monitor"><Layers size={16} /></button>
            <button onClick={() => nav(`/crew/${id}`)} className="grid h-10 w-10 place-items-center rounded-full border border-[#E2E8EE] bg-white shadow-sm hover:bg-[#F4F7FA]" aria-label="Open crew profile"><Users size={16} /></button>
          </div>
          <p className="mt-2 max-w-[240px] text-[11px] text-[#526171] md:absolute md:bottom-5 md:left-5 md:mt-0">Select a region to inspect mapped measurements. Regions are not organ measurements. <span className="font-semibold">!</span> = data needs attention.</p>
        </Panel>
        <Panel title="Monitoring state breakdown" subtitle="Highest-priority state is shown above; each underlying source is listed. This describes DATA availability — never medical condition. No overall health score is computed.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {s.monitoring.components.map((c) => <li key={c.source} className="flex items-center justify-between gap-2 rounded-[12px] bg-[#F8FAFC] px-3 py-2"><span className="text-[13px] font-medium">{c.source}</span><MonitoringPill s={c.state} /></li>)}
          </ul>
        </Panel>
      </div>
      <div className="space-y-4">
        <Panel>
          <div className="flex gap-3">
            <Avatar initials={a.initials} hue={a.hue} size={64} />
            <dl className="grid flex-1 grid-cols-2 gap-2">
              <Meta label="Name">{a.display_name}</Meta>
              <Meta label="Callsign">{a.callsign}</Meta>
              <Meta label="Mission">{a.mission.name}</Meta>
              <Meta label="Flight surgeon">{a.surgeon_name}</Meta>
            </dl>
          </div>
          <div className="mt-3 flex flex-wrap gap-1"><SimPill label="FICTIONAL DEMO PROFILE" /><Pill tone="neutral">{a.mission.phase.replace('_', '-')}</Pill></div>
        </Panel>
        <div className="grid grid-cols-2 gap-3">
          {['heart_rate', 'hrv_rmssd', 'spo2', 'skin_temperature'].map((t) => <MeasurementCardView key={t} c={pick(t)} compact onOpen={() => nav(`/crew/${id}/vitals#${t}`)} />)}
        </div>
        <Panel title="Active alerts & events" action={<span className="text-[11px] text-[#526171]">{alerts.data?.length ?? 0} open</span>}>
          <div className="space-y-2">
            {!alerts.data?.length ? <EmptyState title="No open alerts visible to you">This does not imply anything about health status.</EmptyState> : alerts.data.slice(0, 4).map((x) => <AlertRow key={x.id} a={x} onOpen={() => openAlert(x.id)} />)}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function OpsCrewTable() {
  const crew = useApi((c) => api.listCrew(c, { pageSize: 50 }), []);
  const alerts = useApi((c) => api.listAlerts(c, { status: 'open' }), []);
  const { openAlert } = useSelection();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel title="Crew roster" subtitle="Your role has operational access only. Individual medical records and physiological values are not available to you.">
        <ul className="divide-y divide-[#EEF2F6]">
          {(crew.data?.items ?? []).map((a) => <li key={a.id} className="flex items-center gap-3 py-2.5"><Avatar initials={a.initials} hue={a.hue} size={34} /><div className="flex-1"><p className="text-[13px] font-semibold">{a.display_name}</p><p className="text-[11px] text-[#526171]">{a.id} · {a.crew_role} · {a.mission_name}</p></div><Pill tone="neutral">Medical data hidden for your role</Pill></li>)}
        </ul>
      </Panel>
      <Panel title="System & integrity events">
        <div className="space-y-2">{!alerts.data?.length ? <EmptyState title="No open system events" /> : alerts.data.slice(0, 6).map((x) => <AlertRow key={x.id} a={x} onOpen={() => openAlert(x.id)} />)}</div>
      </Panel>
    </div>
  );
}

export default function MissionOverview() {
  const { sel, setSel } = useSelection();
  const now = useNow();
  const crewMon = useApi((c) => api.listCrew(c, { pageSize: 50 }).items.filter((a) => a.monitoring_access), []);
  const hasMonitoring = (crewMon.data ?? []).length > 0;
  return (
    <div>
      <PageHeader title="Mission Overview" subtitle={<>Current UTC {utc(new Date(now).toISOString())} · <span className="inline-flex align-middle"><SimPill label="SIMULATION MODE" /></span></>}>
        {hasMonitoring && sel && <AstronautPicker value={sel} onChange={setSel} />}
      </PageHeader>
      <div className="space-y-4">
        <MissionFacts />
        {hasMonitoring ? (sel ? <CrewSnapshot id={sel} /> : <EmptyState title="No astronaut selected" />) : <OpsCrewTable />}
        <p className="flex items-center gap-1 text-[11px] text-[#526171]"><ChevronRight size={12} aria-hidden />Displayed values are synthetic. Freshness policies and rules are DEMO configuration, unapproved.</p>
      </div>
    </div>
  );
}
