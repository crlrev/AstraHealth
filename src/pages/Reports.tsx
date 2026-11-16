import { Download, Eye, FileText } from 'lucide-react';
import { useState } from 'react';
import * as api from '../backend/api';
import { canReport, createReport, downloadReport, listReports, REPORT_TYPES } from '../backend/reports';
import { resolveSession } from '../backend/auth';
import type { ReportType } from '../domain/types';
import { useApi, useAuth, useMutation } from '../ui/client';
import { Btn, EmptyState, ErrorState, PageHeader, Panel, Pill, Segmented, Select, utc } from '../ui/components';
import { useSelection } from '../ui/Layout';

const RANGES = { '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3 } as const;

export default function Reports() {
  const { ctx } = useAuth();
  const { sel } = useSelection();
  const run = useMutation();
  const crew = useApi((c) => api.listCrew(c, { pageSize: 50 }).items, []);
  const missions = useApi((c) => api.listMissions(c), []);
  const allowedTypes = useApi((c) => { const { user } = resolveSession(c.sid); return REPORT_TYPES.filter((t) => (crew.data ?? []).some((a) => canReport(user, t.id, a.id, a.mission_id))); }, [crew.data]);
  const reports = useApi((c) => listReports(c), []);
  const [type, setType] = useState<ReportType | ''>('');
  const t = type || allowedTypes.data?.[0]?.id || '';
  const def = REPORT_TYPES.find((r) => r.id === t);
  const [astro, setAstro] = useState('');
  const [mission, setMission] = useState('');
  const [range, setRange] = useState<keyof typeof RANGES>('24h');
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; text: string } | null>(null);
  const eligible = (crew.data ?? []).filter((a) => { try { const { user } = resolveSession(ctx.sid); return t ? canReport(user, t as ReportType, a.id, a.mission_id) : false; } catch { return false; } });
  const astroId = astro || (eligible.some((a) => a.id === sel) ? sel! : eligible[0]?.id) || '';
  const missionId = def?.medical ? (crew.data ?? []).find((a) => a.id === astroId)?.mission_id ?? '' : mission || missions.data?.[0]?.id || '';
  const effectiveRange = t === 'daily_summary' ? '24h' : t === 'weekly_summary' ? '7d' : range;

  const generate = () => {
    const now = Date.now();
    const r = run((c) => createReport(c, { type: t as ReportType, astronaut_id: def?.medical ? astroId : null, mission_id: missionId, format, from: now - RANGES[effectiveRange], to: now }));
    setMsg(r.ok ? { ok: true, text: `Generated ${r.value.id} (${r.value.row_count} rows).` } : { ok: false, text: r.error.message });
  };
  const download = (id: string) => {
    const r = run((c) => downloadReport(c, id));
    if (!r.ok) { setMsg({ ok: false, text: r.error.message }); return; }
    const url = URL.createObjectURL(r.value.blob);
    const a = document.createElement('a'); a.href = url; a.download = r.value.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const showPreview = async (id: string) => {
    const r = run((c) => downloadReport(c, id));
    if (!r.ok) { setMsg({ ok: false, text: r.error.message }); return; }
    if (r.value.filename.endsWith('.pdf')) { window.open(URL.createObjectURL(r.value.blob), '_blank', 'noopener'); return; }
    setPreview({ id, text: (await r.value.blob.text()).split('\r\n').slice(0, 40).join('\n') });
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="Authorized at generation AND at download. Every report carries simulation and non-clinical banners, provenance, units and gap indicators." />
      <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Panel title="Create report">
          {!allowedTypes.data?.length ? <EmptyState title="No report types available to your role" /> : (
            <div className="space-y-3">
              <Select label="Report type" value={t} onChange={(v) => setType(v as ReportType)} options={allowedTypes.data.map((r) => ({ value: r.id, label: r.label }))} />
              {def?.medical ? <Select label="Astronaut" value={astroId} onChange={setAstro} options={eligible.map((a) => ({ value: a.id, label: `${a.display_name} · ${a.id}` }))} /> : <Select label="Mission" value={missionId} onChange={setMission} options={(missions.data ?? []).map((m) => ({ value: m.id, label: m.name }))} />}
              <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Interval</p>{t === 'daily_summary' || t === 'weekly_summary' ? <Pill tone="neutral">Fixed: last {effectiveRange}</Pill> : <Segmented label="Interval" value={range} onChange={setRange} options={[{ value: '24h', label: '24 h' }, { value: '7d', label: '7 d' }, { value: '30d', label: '30 d' }]} />}</div>
              <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Format</p><Segmented label="Format" value={format} onChange={setFormat} options={[{ value: 'pdf', label: 'PDF' }, { value: 'csv', label: 'CSV' }]} /></div>
              <Btn variant="primary" onClick={generate} disabled={!t || !missionId || (def?.medical && !astroId)}><FileText size={15} />Generate</Btn>
              {msg && <p role="status" className={`text-xs font-medium ${msg.ok ? 'text-[#145F41]' : 'text-[#9E1C27]'}`}>{msg.text}</p>}
            </div>
          )}
        </Panel>
        <div className="space-y-4">
          <Panel title="Generated reports" subtitle="Session-scoped (in-browser store).">
            {reports.error ? <ErrorState error={reports.error} /> : !reports.data?.length ? <EmptyState title="No reports yet">Generate one on the left.</EmptyState> : (
              <ul className="divide-y divide-[#EEF2F6]">
                {reports.data.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{REPORT_TYPES.find((x) => x.id === r.type)?.label} <span className="font-normal text-[#526171]">· {r.format.toUpperCase()}</span></p><p className="text-[11px] text-[#526171]">{r.id} · {r.astronaut_id ?? r.mission_id} · {utc(r.interval_start)} → {utc(r.interval_end)} · by {r.generated_by_name} · {r.row_count} rows</p></div>
                    <Btn variant="ghost" onClick={() => showPreview(r.id)}><Eye size={14} />Preview</Btn>
                    <Btn onClick={() => download(r.id)}><Download size={14} />Download</Btn>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {preview && <Panel title={`Preview · ${preview.id}`} subtitle="First 40 lines (CSV). Formula-prefixed cells are neutralised with a leading apostrophe." action={<Btn variant="ghost" onClick={() => setPreview(null)}>Close</Btn>}><pre className="max-h-96 overflow-auto rounded-[12px] bg-[#F4F7FA] p-3 text-[11px] leading-relaxed">{preview.text}</pre></Panel>}
        </div>
      </div>
    </div>
  );
}
