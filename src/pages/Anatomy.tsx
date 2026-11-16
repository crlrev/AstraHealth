import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../backend/api';
import type { RegionId } from '../domain/config';
import { BodyMap } from '../ui/BodyMap';
import { useApi } from '../ui/client';
import { EmptyState, ErrorState, PageHeader, Panel, Segmented } from '../ui/components';
import { AstronautPicker } from '../ui/Layout';
import { MeasurementCardView } from '../ui/MeasurementCard';
import { cn } from '../utils/cn';

export default function Anatomy() {
  const { astronautId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const selected = (sp.get('region') as RegionId | null) ?? 'chest_cardiovascular';
  const [layer, setLayer] = useState<'none' | 'muscular' | 'skeletal'>('none');
  const map = useApi((c) => api.anatomyMap(c, astronautId), [astronautId]);
  const astro = useApi((c) => api.getAstronaut(c, astronautId), [astronautId]);
  const select = (r: RegionId) => setSp({ region: r }, { replace: true });
  if (map.error) return <div><PageHeader title="Anatomical Monitor" /><ErrorState error={map.error} /></div>;
  const regions = map.data!;
  const region = regions.find((r) => r.id === selected) ?? regions[0];
  return (
    <div>
      <PageHeader title="Anatomical Monitor" subtitle={`${astro.data?.display_name ?? ''} · ${astronautId} — 2D region map. Highlights indicate configured sensor mappings, not organ measurements.`}>
        <AstronautPicker value={astronautId} onChange={(id) => nav(`/crew/${id}/anatomy?region=${selected}`)} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel className="relative" title="Body regions" action={<Segmented label="Optional visual layer" value={layer} onChange={setLayer} options={[{ value: 'none', label: 'Regions' }, { value: 'muscular', label: 'Muscular' }, { value: 'skeletal', label: 'Skeletal' }]} />}>
          <div className="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
            <ul aria-label="Region list" className="order-2 space-y-1 md:order-1">
              {regions.map((r) => (
                <li key={r.id}>
                  <button onClick={() => select(r.id)} aria-pressed={r.id === selected} className={cn('flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors duration-150', r.id === selected ? 'bg-[#E6F4EC] font-semibold text-[#145F41]' : 'hover:bg-[#F4F7FA]')}>
                    <span>{r.label}</span><span className="text-[11px] text-[#526171]">{r.cards.length || '—'}</span>
                  </button>
                </li>
              ))}
              <li className="pt-2 text-[11px] text-[#526171]">Layers are decorative overlays and are not selectable. Viewer's left is the astronaut's right.</li>
            </ul>
            <div className="order-1 md:order-2">
              <BodyMap height={560} selected={region.id} onSelect={select} layers={{ muscular: layer === 'muscular', skeletal: layer === 'skeletal' }}
                regions={regions.map((r) => ({ id: r.id, label: r.label, mappedCount: r.cards.length, attention: r.cards.some((x) => (x.card.freshness !== 'fresh' && x.card.freshness !== 'unconfigured') || x.card.ruleState === 'configured_rule_match') }))} />
            </div>
          </div>
        </Panel>
        <AnimatePresence mode="wait">
          <motion.div key={region.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="space-y-3" aria-live="polite">
            <Panel title={region.label} subtitle={`Region ID: ${region.id}`}>
              {!region.cards.length ? <EmptyState title="No mapped sensor data">No measurement is configured for this region. Nothing is inferred from the highlight.</EmptyState> : <p className="text-xs text-[#526171]">{region.cards.length} mapped measurement(s). Mapping is configured in one module and shown with its basis.</p>}
            </Panel>
            {region.cards.map(({ basis, card }) => (
              <div key={card.type}>
                <p className="mb-1 px-1 text-[11px] font-semibold text-[#526171]">Mapping basis: {basis}</p>
                <MeasurementCardView c={card} />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
