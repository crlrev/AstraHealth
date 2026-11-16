import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as api from '../backend/api';
import { useApi } from '../ui/client';
import { EmptyState, ErrorState, Meta, PageHeader, Panel, Pill, SimPill } from '../ui/components';
import { AstronautPicker } from '../ui/Layout';
import { useAstronautParam } from './Analytics';

export default function Radiation() {
  const [id, setId] = useAstronautParam();
  const r = useApi((c) => (id ? api.radiation(c, id) : null), [id]);
  if (!id) return <div><PageHeader title="Radiation Exposure" /><EmptyState title="No astronaut selected" /></div>;
  if (r.error) return <div><PageHeader title="Radiation Exposure" /><ErrorState error={r.error} /></div>;
  const d = r.data!;
  const launch = Date.parse(d.mission.launch_at);
  const personalByDay = Array.from({ length: d.coverage.expectedIntervals }, (_, i) => {
    const rec = d.personal.find((p) => Math.round((Date.parse(p.interval_start) - launch) / 86400e3) === i);
    return { day: `D${i + 1}`, value: rec ? rec.value : null, missing: !rec };
  });
  const areaLocs = [...new Set(d.area.map((a) => a.location))];
  return (
    <div>
      <PageHeader title="Radiation Exposure" subtitle="Recorded quantities shown separately by type, unit and detector. No reference limits are applied."><AstronautPicker value={id} onChange={setId} /></PageHeader>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Panel title="Personal dosimeter — absorbed dose" subtitle={`Quantity: absorbed dose · unit mGy · per 24 h integration interval · ${d.personal[0]?.detector_class ?? ''} ${d.personal[0]?.detector_id ?? ''} · measured`} action={<SimPill />}>
            <div className="h-60" role="img" aria-label="Absorbed dose per mission day; missing intervals marked">
              <ResponsiveContainer><BarChart data={personalByDay.map((p) => ({ ...p, plot: p.value ?? 0 }))}><CartesianGrid vertical={false} stroke="#EEF2F6" /><XAxis dataKey="day" tick={{ fontSize: 10, fill: '#526171' }} interval={2} /><YAxis tick={{ fontSize: 11, fill: '#526171' }} unit=" mGy" width={60} />
                <Tooltip formatter={(_v, _n, item) => { const p = item.payload as { value: number | null }; return [p.value === null ? 'NO RECORD (gap)' : `${p.value} mGy`, 'Absorbed dose']; }} />
                <Bar dataKey="plot" radius={[3, 3, 0, 0]} isAnimationActive={false}>{personalByDay.map((p) => <Cell key={p.day} fill={p.missing ? '#F1D58C' : '#167A52'} />)}</Bar>
              </BarChart></ResponsiveContainer>
            </div>
            {d.coverage.missingMissionDays.length > 0 && <p className="mt-2 text-xs font-medium text-[#6E4900]">Missing intervals on mission day(s) {d.coverage.missingMissionDays.join(', ')} — shown as amber zero-height markers, never filled.</p>}
          </Panel>
          {areaLocs.map((loc) => {
            const rows = d.area.filter((a) => a.location === loc);
            return (
              <Panel key={loc} title={`Area monitor — dose equivalent · ${loc}`} subtitle={`Quantity: dose equivalent · unit mSv · ${rows[0]?.detector_class} ${rows[0]?.detector_id} · area (not personal) — never combined with absorbed dose`} action={<SimPill />}>
                <div className="h-44" role="img" aria-label={`Area dose equivalent per day at ${loc}`}>
                  <ResponsiveContainer><BarChart data={rows.map((x, i) => ({ day: `D${i + 1}`, v: x.value }))}><CartesianGrid vertical={false} stroke="#EEF2F6" /><XAxis dataKey="day" tick={{ fontSize: 10, fill: '#526171' }} interval={2} /><YAxis tick={{ fontSize: 11, fill: '#526171' }} unit=" mSv" width={60} /><Tooltip formatter={(v) => [`${v} mSv`, 'Dose equivalent (area)']} /><Bar dataKey="v" fill="#1A548F" radius={[3, 3, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>
                </div>
              </Panel>
            );
          })}
        </div>
        <div className="space-y-4">
          <Panel title="Coverage">
            <dl className="grid grid-cols-2 gap-3">
              <Meta label="Expected intervals">{d.coverage.expectedIntervals}</Meta>
              <Meta label="Recorded intervals">{d.coverage.recorded}</Meta>
            </dl>
            <div className="mt-3">{d.coverage.recorded < d.coverage.expectedIntervals ? <Pill tone="warn">Incomplete coverage</Pill> : <Pill tone="neutral">All expected intervals recorded</Pill>}</div>
          </Panel>
          <Panel title="Cumulative dose">
            <Pill tone="neutral">Cumulative calculation not configured</Pill>
            <p className="mt-2 text-xs text-[#526171]">{d.cumulative.reason}</p>
          </Panel>
          <Panel title="Reference limits"><p className="text-xs text-[#526171]">None configured. Dose quantities, cumulative methods and any limits must be defined by qualified radiation specialists.</p></Panel>
        </div>
      </div>
    </div>
  );
}
