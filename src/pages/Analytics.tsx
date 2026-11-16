import { Scale } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../backend/api';
import { COMPARABILITY_POLICIES, MEASUREMENTS } from '../domain/config';
import type { MeasurementType } from '../domain/types';
import { useApi } from '../ui/client';
import { EmptyState, ErrorState, Meta, PageHeader, Panel, Pill, Segmented, Select, TrendChart } from '../ui/components';
import { AstronautPicker, useSelection } from '../ui/Layout';
import { WINDOW_OPTS } from './Vitals';

export function useAstronautParam() {
  const [sp, setSp] = useSearchParams();
  const { sel, setSel } = useSelection();
  const id = sp.get('a') ?? sel ?? '';
  return [id, (v: string) => { setSel(v); setSp({ a: v }, { replace: true }); }] as const;
}

export default function Analytics() {
  const [id, setId] = useAstronautParam();
  const [type, setType] = useState<MeasurementType>('heart_rate');
  const [win, setWin] = useState<api.WindowKey>('7d');
  const [phase, setPhase] = useState<'in_flight' | 'pre_flight'>('in_flight');
  const [baseline, setBaseline] = useState<'pre_flight' | 'first_week'>('pre_flight');
  const h = useApi((c) => (id ? api.history(c, id, type, phase === 'pre_flight' ? 'mission' : win, phase) : null), [id, type, win, phase]);
  const cmp = useApi((c) => (id ? api.baselineCompare(c, id, type, baseline) : null), [id, type, baseline]);
  const def = MEASUREMENTS[type];
  if (!id) return <div><PageHeader title="Health Analytics" /><EmptyState title="No astronaut in your monitoring scope" /></div>;
  return (
    <div>
      <PageHeader title="Health Analytics" subtitle="Historical trends from stored records. Mission phases are never merged into one continuous timeline.">
        <div className="flex flex-wrap items-end gap-3">
          <AstronautPicker value={id} onChange={setId} />
          <Select label="Measurement" value={type} onChange={(v) => setType(v as MeasurementType)} options={api.CARD_TYPES.map((t) => ({ value: t, label: MEASUREMENTS[t].label }))} />
        </div>
      </PageHeader>
      <div className="space-y-4">
        <Panel title={`${def.label} (${def.unit})`} subtitle={`${def.method} · ${def.acquisition_mode}`} action={
          <div className="flex flex-wrap gap-2">
            <Segmented label="Mission phase" value={phase} onChange={setPhase} options={[{ value: 'in_flight', label: 'In-flight' }, { value: 'pre_flight', label: 'Pre-flight' }]} />
            {phase === 'in_flight' && <Segmented label="Time window" value={win} onChange={setWin} options={WINDOW_OPTS} />}
          </div>
        }>
          {h.error ? <ErrorState error={h.error} /> : h.data && (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                <Pill tone="neutral">{h.data.rawCount} records</Pill>
                <Pill tone="neutral">{h.data.displayCount} display pts{h.data.downsampled ? ' · downsampled' : ''}</Pill>
                <Pill tone={h.data.gaps ? 'warn' : 'neutral'}>{h.data.gaps} gap(s)</Pill>
                <Pill tone={h.data.backfilled ? 'warn' : 'neutral'}>{h.data.backfilled} backfilled</Pill>
                <Pill tone="sim">SIMULATED</Pill>
              </div>
              <TrendChart points={h.data.series} unit={def.unit} height={300} spanMs={h.data.to - h.data.from} />
            </>
          )}
        </Panel>
        <Panel title={<span className="flex items-center gap-2"><Scale size={16} aria-hidden /> Baseline comparison</span>} subtitle={`Policy: ${COMPARABILITY_POLICIES[type]?.source ?? 'none configured'} · requires matching ${COMPARABILITY_POLICIES[type]?.keys.join(', ') ?? '—'}`} action={<Segmented label="Baseline" value={baseline} onChange={setBaseline} options={[{ value: 'pre_flight', label: 'Pre-flight' }, { value: 'first_week', label: 'First in-flight week' }]} />}>
          {cmp.error ? <ErrorState error={cmp.error} /> : cmp.data && (cmp.data.comparable ? (
            <div className="grid gap-3 sm:grid-cols-4">
              <Meta label={`${cmp.data.baselineLabel} (n=${cmp.data.baselineN})`}>{cmp.data.baselineMean!.toFixed(def.decimals + 1)} {cmp.data.unit} mean</Meta>
              <Meta label={`${cmp.data.currentLabel} (n=${cmp.data.currentN})`}>{cmp.data.currentMean!.toFixed(def.decimals + 1)} {cmp.data.unit} mean</Meta>
              <Meta label="Absolute difference">{(cmp.data.currentMean! - cmp.data.baselineMean!).toFixed(def.decimals + 1)} {cmp.data.unit}</Meta>
              <Meta label="Interpretation">None — descriptive only</Meta>
            </div>
          ) : (
            <div className="rounded-[14px] border border-[#F1D58C] bg-[#FFF4D6] p-4">
              <p className="text-sm font-semibold text-[#6E4900]">Not comparable — measurement context differs or is incomplete</p>
              <ul className="mt-2 list-disc pl-5 text-xs text-[#6E4900]">{cmp.data.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              <p className="mt-2 text-xs text-[#6E4900]">No difference or percentage change is calculated.</p>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
