import {
  AlertOctagon, AlertTriangle, Ban, CircleDashed, CircleHelp, Clock3, FlaskConical, History, Info, Link2Off, Radio, Settings2,
  ShieldAlert, Signal, SignalLow, Unplug, Wifi, WifiOff, type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ApiError } from '../backend/auth';
import type { ChartPoint } from '../domain/logic';
import type { AlertStatus, Freshness, LinkState, MonitoringState, Quality, Validity } from '../domain/types';
import { cn } from '../utils/cn';

type Tone = 'ok' | 'warn' | 'crit' | 'neutral' | 'info' | 'sim';
export const TONE: Record<Tone, string> = {
  ok: 'text-[#145F41] bg-[#E6F4EC] border-[#BFE3CF]',
  warn: 'text-[#6E4900] bg-[#FFF4D6] border-[#F1D58C]',
  crit: 'text-[#9E1C27] bg-[#FDECEE] border-[#F3BDC3]',
  neutral: 'text-[#46525F] bg-[#EEF2F6] border-[#DCE3EA]',
  info: 'text-[#1A548F] bg-[#E8F0FB] border-[#C3D6F0]',
  sim: 'text-[#4E3699] bg-[#F0ECFF] border-[#D6CCF7]',
};

export function Pill({ tone, icon: Icon, children, title, className }: { tone: Tone; icon?: LucideIcon; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap', TONE[tone], className)}>
      {Icon && <Icon aria-hidden size={12} strokeWidth={2.4} />}
      {children}
    </span>
  );
}

const FRESH: Record<Freshness, [Tone, LucideIcon, string]> = {
  fresh: ['ok', Radio, 'Fresh data'],
  delayed: ['warn', Clock3, 'Delayed data'],
  stale: ['warn', History, 'Stale — last known value'],
  unavailable: ['neutral', Ban, 'No data'],
  unconfigured: ['neutral', Settings2, 'Freshness policy not configured'],
};
export const FreshnessPill = ({ f }: { f: Freshness }) => { const [t, i, l] = FRESH[f]; return <Pill tone={t} icon={i}>{l}</Pill>; };

const VALID: Record<Validity, [Tone, LucideIcon, string]> = {
  valid: ['neutral', Signal, 'Valid'],
  questionable: ['warn', AlertTriangle, 'Questionable'],
  invalid: ['crit', AlertOctagon, 'Invalid'],
  missing_value: ['neutral', CircleDashed, 'Missing value'],
  sensor_fault: ['crit', Unplug, 'Sensor fault'],
  unknown: ['neutral', CircleHelp, 'Validity unknown'],
};
export const ValidityPill = ({ v }: { v: Validity }) => { const [t, i, l] = VALID[v]; return <Pill tone={t} icon={i}>{l}</Pill>; };

const QUAL: Record<Quality, [Tone, LucideIcon, string]> = {
  good: ['neutral', Signal, 'Signal good'],
  questionable: ['warn', SignalLow, 'Signal questionable'],
  poor: ['crit', SignalLow, 'Signal poor'],
  unknown: ['neutral', CircleHelp, 'Signal unknown'],
};
export const QualityPill = ({ q }: { q: Quality }) => { const [t, i, l] = QUAL[q]; return <Pill tone={t} icon={i}>{l}</Pill>; };

export const SimPill = ({ label = 'SIMULATED' }: { label?: string }) => <Pill tone="sim" icon={FlaskConical} title="data_origin = simulated">{label}</Pill>;

export const MON: Record<MonitoringState, [Tone, LucideIcon, string]> = {
  unavailable: ['crit', Ban, 'Data unavailable'],
  configured_rule_match: ['crit', ShieldAlert, 'Configured rule matched'],
  degraded: ['warn', Link2Off, 'System/connection degraded'],
  stale: ['warn', History, 'Stale data'],
  delayed: ['warn', Clock3, 'Delayed data'],
  rules_not_configured: ['neutral', Settings2, 'Rules not configured'],
  not_evaluated: ['neutral', CircleDashed, 'Not evaluated'],
  data_available: ['ok', Radio, 'Fresh data available'],
};
export const MonitoringPill = ({ s }: { s: MonitoringState }) => { const [t, i, l] = MON[s]; return <Pill tone={t} icon={i}>{l}</Pill>; };

const LINK: Record<LinkState, [Tone, LucideIcon, string]> = {
  connected: ['ok', Wifi, 'Link connected'],
  degraded: ['warn', SignalLow, 'Link degraded'],
  delayed: ['warn', Clock3, 'Link delayed'],
  disconnected: ['crit', WifiOff, 'Link disconnected'],
  unknown: ['neutral', CircleHelp, 'Link unknown'],
};
export const LinkPill = ({ s }: { s: LinkState }) => { const [t, i, l] = LINK[s]; return <Pill tone={t} icon={i}>{l}</Pill>; };

const AST: Record<AlertStatus, [Tone, string]> = {
  active_unacknowledged: ['crit', 'Active · unacknowledged'],
  acknowledged: ['warn', 'Acknowledged'],
  assigned: ['info', 'Assigned'],
  resolved: ['neutral', 'Resolved'],
  reopened: ['crit', 'Reopened'],
};
export const AlertStatusPill = ({ s }: { s: AlertStatus }) => { const [t, l] = AST[s]; return <Pill tone={t} icon={s === 'resolved' ? Info : AlertTriangle}>{l}</Pill>; };

export function Panel({ children, className, title, action, subtitle }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn('rounded-[18px] border border-[#E2E8EE] bg-white p-4 shadow-[0_1px_2px_rgba(23,33,43,0.04)]', className)}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-[#17212B]">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-[#526171]">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[#17212B]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[#526171]">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Avatar({ initials, hue, size = 40 }: { initials: string; hue: number; size?: number }) {
  return (
    <div aria-hidden className="grid shrink-0 place-items-center rounded-[14px] font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, hsl(${hue} 45% 42%), hsl(${(hue + 40) % 360} 50% 30%))` }}>
      {initials}
    </div>
  );
}

export function EmptyState({ icon: Icon = CircleDashed, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-[#D3DBE3] bg-[#F8FAFC] px-4 py-8 text-center">
      <Icon aria-hidden className="mb-2 text-[#7A8794]" size={22} />
      <p className="text-sm font-semibold text-[#17212B]">{title}</p>
      {children && <div className="mt-1 max-w-md text-xs text-[#526171]">{children}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: ApiError }) {
  return (
    <div role="alert" className="rounded-[14px] border border-[#F3BDC3] bg-[#FDECEE] p-4 text-sm text-[#9E1C27]">
      <p className="font-semibold">{error.status === 404 ? 'Not found or not accessible' : error.status === 403 ? 'Access denied' : 'Something went wrong'}</p>
      <p className="mt-1 text-xs">{error.message} <span className="opacity-70">(HTTP {error.status} · {error.code})</span></p>
    </div>
  );
}

export function Btn({ children, variant = 'secondary', className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-[13px] font-semibold transition-[background,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-[#167A52] text-white shadow-sm hover:bg-[#126645]',
        variant === 'secondary' && 'border border-[#D3DBE3] bg-white text-[#17212B] hover:bg-[#F4F7FA]',
        variant === 'ghost' && 'text-[#33414F] hover:bg-[#EEF2F6]',
        variant === 'danger' && 'border border-[#F3BDC3] bg-[#FDECEE] text-[#9E1C27] hover:bg-[#FAD9DD]',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Select({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#526171]', className)}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-[10px] border border-[#D3DBE3] bg-white px-3 py-2 text-[13px] font-medium normal-case tracking-normal text-[#17212B]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[12px] border border-[#E2E8EE] bg-[#F4F7FA] p-1">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)} className={cn('rounded-[9px] px-3 py-1.5 text-xs font-semibold transition-colors duration-150', value === o.value ? 'bg-white text-[#145F41] shadow-sm' : 'text-[#526171] hover:text-[#17212B]')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function split(points: ChartPoint[]) {
  // live = points received live; back = backfilled points (joined to adjacent points at boundaries).
  return points.map((p, i) => {
    const near = p.backfilled || points[i + 1]?.backfilled || points[i - 1]?.backfilled;
    return { t: p.t, live: p.backfilled ? null : p.v, back: near ? p.v : null };
  });
}

export function Spark({ points, height = 44, color = '#167A52' }: { points: ChartPoint[]; height?: number; color?: string }) {
  if (!points.some((p) => p.v !== null)) return <div style={{ height }} className="grid place-items-center rounded-lg bg-[#F4F7FA] text-[10px] font-medium text-[#526171]">No trend data</div>;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={split(points)} margin={{ top: 4, bottom: 2, left: 0, right: 0 }}>
          <YAxis hide domain={['dataMin - 2', 'dataMax + 2']} />
          <Line type="monotone" dataKey="live" stroke={color} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line type="monotone" dataKey="back" stroke="#B26B00" strokeWidth={1.8} strokeDasharray="3 3" dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({ points, unit, height = 260, spanMs }: { points: ChartPoint[]; unit: string; height?: number; spanMs: number }) {
  const fmt = (t: number) => { const d = new Date(t); return spanMs > 2 * 86400e3 ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  if (!points.some((p) => p.v !== null)) return <EmptyState title="No records in this window">Nothing was received for this interval. Gaps are never filled with estimated values.</EmptyState>;
  return (
    <div>
      <div style={{ height }} role="img" aria-label={`Trend chart, ${points.length} display points, unit ${unit}. Solid line live, dashed amber backfilled, breaks are gaps.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={split(points)} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="#EEF2F6" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmt} tick={{ fontSize: 11, fill: '#526171' }} stroke="#D3DBE3" scale="time" />
            <YAxis tick={{ fontSize: 11, fill: '#526171' }} stroke="#D3DBE3" domain={['auto', 'auto']} width={48} />
            <Tooltip labelFormatter={(t) => `${new Date(Number(t)).toISOString().replace('T', ' ').slice(0, 19)} UTC`} formatter={(v, n) => [v === null ? '—' : `${Number(v).toFixed(1)} ${unit}`, n === 'back' ? 'Backfilled (delayed delivery)' : 'Received live']} contentStyle={{ borderRadius: 12, border: '1px solid #E2E8EE', fontSize: 12 }} />
            <Line type="monotone" dataKey="live" stroke="#167A52" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line type="monotone" dataKey="back" stroke="#B26B00" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend />
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-[#526171]">
      <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[#167A52]" /> Received live</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-[#B26B00]" /> Backfilled (delayed delivery)</span>
      <span className="inline-flex items-center gap-1.5"><span className="flex w-5 justify-between"><span className="h-0.5 w-1.5 bg-[#526171]" /><span className="h-0.5 w-1.5 bg-[#526171]" /></span> Break = gap / invalid (not interpolated)</span>
      <span className="inline-flex items-center gap-1.5"><FlaskConical size={11} /> All values simulated</span>
    </div>
  );
}

export function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#617080]">{label}</dt>
      <dd className="truncate text-xs font-medium text-[#17212B]">{children}</dd>
    </div>
  );
}

export const utc = (iso: string | null | undefined) => (iso ? `${iso.replace('T', ' ').slice(0, 19)} UTC` : '—');
