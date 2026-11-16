import { Activity, Droplets, HeartPulse, Scale, Thermometer, Wind } from 'lucide-react';
import { motion } from 'motion/react';
import type { MeasurementCard as Card } from '../backend/api';
import { MEASUREMENTS } from '../domain/config';
import { formatAge } from '../domain/logic';
import { cn } from '../utils/cn';
import { FreshnessPill, Meta, Pill, QualityPill, SimPill, Spark, ValidityPill, utc } from './components';

const ICON = { heart_rate: HeartPulse, hrv_rmssd: Activity, respiratory_rate: Wind, spo2: Droplets, skin_temperature: Thermometer, bp_systolic: HeartPulse, bp_diastolic: HeartPulse, body_mass: Scale, demo_marker: Activity };

export function RuleStatePill({ c }: { c: Card }) {
  if (c.ruleState === 'rules_not_configured') return <Pill tone="neutral">Rules not configured</Pill>;
  if (c.ruleState === 'not_evaluated') return <Pill tone="neutral">Rule not evaluated (data quality)</Pill>;
  if (c.ruleState === 'configured_rule_match') return <Pill tone="crit" title={c.ruleIds.join(', ')}>DEMO rule matched · {c.ruleIds[0]}</Pill>;
  return <Pill tone="neutral" title={c.ruleIds.join(', ')}>DEMO rule: no match</Pill>;
}

export function ValueDisplay({ c, big = false }: { c: Card; big?: boolean }) {
  const def = MEASUREMENTS[c.type];
  const l = c.latest;
  if (!l) return <p className={cn('font-semibold text-[#526171]', big ? 'text-2xl' : 'text-lg')}>No data</p>;
  if (l.normalized_value === null) return <p className={cn('font-semibold text-[#526171]', big ? 'text-2xl' : 'text-lg')}>No value <span className="text-xs font-medium">({l.validity_state.replace('_', ' ')})</span></p>;
  const current = c.freshness === 'fresh';
  return (
    <div>
      <p className={cn('font-semibold tabular-nums tracking-tight', big ? 'text-[34px] leading-none' : 'text-[26px] leading-none', current ? 'text-[#17212B]' : 'text-[#5E6B78]')}>
        {l.normalized_value.toFixed(def.decimals)}
        <span className="ml-1 text-sm font-medium text-[#526171]">{c.unit}</span>
      </p>
      {!current && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[#6E4900]">Last known value · {formatAge(c.ageMs ?? 0)}</p>}
    </div>
  );
}

export function MeasurementCardView({ c, compact = false, onOpen }: { c: Card; compact?: boolean; onOpen?: () => void }) {
  const Icon = ICON[c.type];
  const l = c.latest;
  const recvDiff = l ? Date.parse(l.received_at_ground) - Date.parse(l.measured_at) : 0;
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-[#E6F4EC] text-[#167A52]"><Icon size={15} aria-hidden /></span>
          <div>
            <h3 className="text-[13px] font-semibold leading-tight text-[#17212B]">{c.label}</h3>
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#617080]">{c.acquisition_mode}</p>
          </div>
        </div>
        <FreshnessPill f={c.freshness} />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <ValueDisplay c={c} />
        <p className="text-right text-[11px] text-[#526171]">{l ? formatAge(c.ageMs ?? 0) : '—'}</p>
      </div>
      <div className="mt-2"><Spark points={c.spark} height={compact ? 36 : 48} /></div>
      <div className="mt-2 flex flex-wrap gap-1">
        <SimPill />
        {l && <ValidityPill v={l.validity_state} />}
        {l && <QualityPill q={l.quality_state} />}
        {l?.backfilled && <Pill tone="warn">Backfilled</Pill>}
        {!compact && <RuleStatePill c={c} />}
      </div>
      {!compact && l && (
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[#EEF2F6] pt-3">
          <Meta label="Measured">{utc(l.measured_at)}</Meta>
          <Meta label="Received (ground)">{recvDiff > 5000 ? utc(l.received_at_ground) : 'same as measured (±5 s)'}</Meta>
          <Meta label="Source">{l.sensor_id} · {l.device_class}</Meta>
          <Meta label="Method">{l.measurement_method}</Meta>
          {l.conversion_version && <Meta label="Unit conversion">{l.raw_value} {l.raw_unit} → {c.unit} ({l.conversion_version})</Meta>}
        </dl>
      )}
    </>
  );
  const cls = 'block w-full rounded-[18px] border border-[#E2E8EE] bg-white p-4 text-left shadow-[0_1px_2px_rgba(23,33,43,0.04)]';
  if (onOpen) {
    return (
      <motion.button whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(23,33,43,0.08)' }} transition={{ duration: 0.15, ease: 'easeOut' }} onClick={onOpen} className={cls} aria-label={`${c.label}: open details`}>
        {body}
      </motion.button>
    );
  }
  return <div className={cls}>{body}</div>;
}
