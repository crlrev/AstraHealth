import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import * as api from '../backend/api';
import { MEASUREMENTS, UNCONFIGURED_FAMILIES } from '../domain/config';
import type { MeasurementType } from '../domain/types';
import { useApi } from '../ui/client';
import { EmptyState, ErrorState, PageHeader, Panel, Pill, QualityPill, Segmented, SimPill, TrendChart, ValidityPill, utc } from '../ui/components';
import { AstronautPicker } from '../ui/Layout';
import { MeasurementCardView } from '../ui/MeasurementCard';

export const WINDOW_OPTS: { value: api.WindowKey; label: string }[] = [
  { value: '15m', label: '15 min' }, { value: '1h', label: '1 h' }, { value: '24h', label: '24 h' }, { value: '7d', label: '7 d' }, { value: '30d', label: '30 d' }, { value: 'mission', label: 'Mission' },
];

export function HistoryPanel({ astronautId, type, initial = '1h' }: { astronautId: string; type: MeasurementType; initial?: api.WindowKey }) {
  const [win, setWin] = useState<api.WindowKey>(initial);
  const h = useApi((c) => api.history(c, astronautId, type, win), [astronautId, type, win]);
  const def = MEASUREMENTS[type];
  return (
    <Panel title={`${def.label} — history`} subtitle={`${def.method} · unit ${def.unit} · ${def.acquisition_mode}`} action={<Segmented label="Time window" value={win} onChange={setWin} options={WINDOW_OPTS} />}>
      {h.error ? <ErrorState error={h.error} /> : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
            <Pill tone="neutral">{h.data!.rawCount} stored records</Pill>
            <Pill tone="neutral">{h.data!.displayCount} display points{h.data!.downsampled ? ' (bucket-averaged; raw retained)' : ''}</Pill>
            <Pill tone={h.data!.gaps ? 'warn' : 'neutral'}>{h.data!.gaps} gap/invalid break(s)</Pill>
            <Pill tone={h.data!.backfilled ? 'warn' : 'neutral'}>{h.data!.backfilled} backfilled</Pill>
            <Pill tone={h.data!.questionable ? 'warn' : 'neutral'}>{h.data!.questionable} low-quality/invalid</Pill>
          </div>
          <TrendChart points={h.data!.series} unit={def.unit} spanMs={h.data!.to - h.data!.from} />
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-[#167A52]">Most recent records (provenance)</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead><tr className="text-[10px] uppercase text-[#526171]"><th className="py-1">Measured</th><th>Value</th><th>Validity</th><th>Quality</th><th>Origin</th><th>Seq</th><th>Delivery</th></tr></thead>
                <tbody className="divide-y divide-[#EEF2F6]">
                  {h.data!.recent.map((r) => (
                    <tr key={r.event_id}><td className="py-1.5 font-mono">{utc(r.measured_at)}</td><td>{r.normalized_value === null ? 'NO VALUE' : `${r.normalized_value.toFixed(def.decimals)} ${def.unit}`}{r.conversion_version ? ` (raw ${r.raw_value} ${r.raw_unit})` : ''}</td><td><ValidityPill v={r.validity_state} /></td><td><QualityPill q={r.quality_state} /></td><td><SimPill /></td><td className="font-mono">{r.sequence_number}{r.out_of_order ? ' ↺' : ''}</td><td>{r.backfilled ? <Pill tone="warn">Backfilled</Pill> : 'Live'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </Panel>
  );
}

export default function Vitals() {
  const { astronautId = '' } = useParams();
  const loc = useLocation();
  const nav = useNavigate();
  const [type, setType] = useState<MeasurementType>((loc.hash.slice(1) as MeasurementType) || 'heart_rate');
  useEffect(() => { if (loc.hash && MEASUREMENTS[loc.hash.slice(1) as MeasurementType]) setType(loc.hash.slice(1) as MeasurementType); }, [loc.hash]);
  const s = useApi((c) => api.crewSummary(c, astronautId), [astronautId]);
  const astro = useApi((c) => api.getAstronaut(c, astronautId), [astronautId]);
  if (s.error) return <div><PageHeader title="Vital Signs" /><ErrorState error={s.error} /></div>;
  return (
    <div>
      <PageHeader title="Vital Signs" subtitle={`${astro.data?.display_name ?? ''} · ${astronautId}. Values update at a batched 1 Hz display cadence; ingestion is not throttled.`}>
        <AstronautPicker value={astronautId} onChange={(id) => nav(`/crew/${id}/vitals#${type}`)} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {s.data!.cards.map((c) => (
            <div key={c.type} className={c.type === type ? 'rounded-[20px] ring-2 ring-[#167A52] ring-offset-2 ring-offset-[#F4F7FA]' : ''}>
              <MeasurementCardView c={c} onOpen={() => { setType(c.type); nav(`#${c.type}`, { replace: true }); }} />
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <HistoryPanel key={`${astronautId}-${type}`} astronautId={astronautId} type={type} initial={MEASUREMENTS[type].acquisition_mode === 'continuous' ? '1h' : '30d'} />
          <Panel title="Not configured" subtitle="Requested families with no qualified acquisition method. Never filled with estimated values.">
            <ul className="space-y-2">{UNCONFIGURED_FAMILIES.map((f) => <li key={f.label} className="rounded-[12px] bg-[#F8FAFC] p-3"><p className="text-[13px] font-semibold">{f.label}</p><p className="text-xs text-[#526171]">{f.reason}</p></li>)}</ul>
          </Panel>
          {!s.data!.cards.length && <EmptyState title="No measurements configured" />}
        </div>
      </div>
    </div>
  );
}
