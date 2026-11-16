import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import * as api from '../backend/api';
import { useApi } from '../ui/client';
import { EmptyState, ErrorState, Meta, PageHeader, Panel, Pill, SimPill } from '../ui/components';
import { AstronautPicker } from '../ui/Layout';
import { useAstronautParam } from './Analytics';

export default function Wellness() {
  const [id, setId] = useAstronautParam();
  const w = useApi((c) => (id ? api.wellness(c, id) : null), [id]);
  if (!id) return <div><PageHeader title="Sleep & Recovery" /><EmptyState title="No astronaut selected" /></div>;
  if (w.error) return <div><PageHeader title="Sleep & Recovery"><AstronautPicker value={id} onChange={setId} needMedical /></PageHeader><ErrorState error={w.error} /></div>;
  const { sleep, exercise } = w.data!;
  const days = new Map<string, { day: string; treadmill: number; cycle_ergometer: number; resistive_device: number }>();
  exercise.forEach((e) => { const d = e.start.slice(5, 10); const r = days.get(d) ?? { day: d, treadmill: 0, cycle_ergometer: 0, resistive_device: 0 }; r[e.modality] += e.duration_min; days.set(d, r); });
  const sleepData = sleep.map((s) => ({ night: s.start.slice(5, 10), hours: +(s.duration_min / 60).toFixed(2) }));
  const nights = sleep.length ? Math.round((Date.parse(sleep[sleep.length - 1].start) - Date.parse(sleep[0].start)) / 86400e3) + 1 : 0;
  return (
    <div>
      <PageHeader title="Sleep & Recovery" subtitle="Available records only. No health conclusion is drawn from indirect data."><AstronautPicker value={id} onChange={setId} needMedical /></PageHeader>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Sleep duration (estimated)" subtitle="Wrist actigraphy estimate (simulated). Status: estimated, not measured." action={<SimPill />}>
          <div className="mb-2 flex flex-wrap gap-1.5"><Pill tone="neutral">{sleep.length} nights recorded</Pill><Pill tone={nights - sleep.length > 0 ? 'warn' : 'neutral'}>{Math.max(0, nights - sleep.length)} night(s) with no record</Pill><Pill tone="neutral">Sleep stages: not configured</Pill></div>
          <div className="h-64" role="img" aria-label="Bar chart of estimated nightly sleep duration in hours; missing nights have no bar">
            <ResponsiveContainer><BarChart data={sleepData}><CartesianGrid vertical={false} stroke="#EEF2F6" /><XAxis dataKey="night" tick={{ fontSize: 10, fill: '#526171' }} /><YAxis tick={{ fontSize: 11, fill: '#526171' }} unit=" h" width={40} /><Tooltip formatter={(v) => [`${v} h (estimated)`, 'Sleep']} /><Bar dataKey="hours" fill="#167A52" radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Exercise sessions (device log)" subtitle="Duration per day by modality. Workload units differ by device and are never combined." action={<SimPill />}>
          <div className="h-64" role="img" aria-label="Stacked bar chart of exercise minutes per day by modality">
            <ResponsiveContainer><BarChart data={[...days.values()]}><CartesianGrid vertical={false} stroke="#EEF2F6" /><XAxis dataKey="day" tick={{ fontSize: 10, fill: '#526171' }} /><YAxis tick={{ fontSize: 11, fill: '#526171' }} unit=" m" width={44} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="treadmill" stackId="a" fill="#167A52" isAnimationActive={false} /><Bar dataKey="cycle_ergometer" stackId="a" fill="#5BAE87" isAnimationActive={false} /><Bar dataKey="resistive_device" stackId="a" fill="#1A548F" isAnimationActive={false} /></BarChart></ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Recovery indicator" className="xl:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <Meta label="Status">Unconfigured</Meta>
            <Meta label="Reason">No reviewed derivation formula has been supplied</Meta>
            <Meta label="Shown instead">Raw sleep and exercise records only</Meta>
          </div>
        </Panel>
        <Panel title="Recent exercise records" className="xl:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs"><thead><tr className="text-[10px] uppercase text-[#526171]"><th className="py-1">Start (UTC)</th><th>Modality</th><th>Duration</th><th>Workload</th><th>Status</th><th>Method</th></tr></thead>
              <tbody className="divide-y divide-[#EEF2F6]">{exercise.slice(-10).reverse().map((e) => <tr key={e.id}><td className="py-1.5 font-mono">{e.start.slice(0, 16).replace('T', ' ')}</td><td>{e.modality.replace('_', ' ')}</td><td>{e.duration_min} min</td><td>{e.workload_value} {e.workload_unit}</td><td>{e.status}</td><td>{e.method}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
