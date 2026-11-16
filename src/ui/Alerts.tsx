import { BellOff, ShieldAlert, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import * as api from '../backend/api';
import { DEMO_RULES } from '../domain/config';
import { formatAge } from '../domain/logic';
import type { Alert } from '../domain/types';
import { useApi, useMutation } from './client';
import { AlertStatusPill, Btn, EmptyState, Meta, Pill, SimPill, utc } from './components';

export function AlertRow({ a, onOpen }: { a: Alert; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex w-full items-start gap-3 rounded-[12px] border border-[#EEF2F6] bg-white p-3 text-left transition-colors duration-150 hover:border-[#D3DBE3] hover:bg-[#F8FAFC]">
      <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] ${a.category === 'clinical_demo' ? 'bg-[#FDECEE] text-[#9E1C27]' : a.category === 'system' ? 'bg-[#E8F0FB] text-[#1A548F]' : 'bg-[#FFF4D6] text-[#6E4900]'}`}><ShieldAlert size={14} aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[#17212B]">{a.title}</span>
        <span className="mt-0.5 block text-[11px] text-[#526171]">{a.astronaut_id ?? 'System'} · {a.rule_id} v{a.rule_version} · {formatAge(Date.now() - Date.parse(a.created_at))}{a.occurrences > 1 ? ` · ×${a.occurrences}` : ''}</span>
        <span className="mt-1.5 flex flex-wrap gap-1"><AlertStatusPill s={a.status} />{a.simulation_only && <Pill tone="sim">DEMO ONLY</Pill>}</span>
      </span>
    </button>
  );
}

export function AlertDetail({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const q = useApi((c) => api.listAlerts(c).find((a) => a.id === alertId) ?? null, [alertId]);
  const assignees = useApi((c) => api.listAssignableUsers(c, alertId), [alertId]);
  const caps = useApi((c) => (q.data ? api.alertCapabilities(c, q.data) : null), [q.data, q.data?.version]);
  const run = useMutation();
  const [msg, setMsg] = useState<{ tone: 'crit' | 'ok'; text: string } | null>(null);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const a = q.data;
  const rule = a ? DEMO_RULES.find((r) => r.id === a.rule_id) : null;
  const act = (fn: (c: api.Ctx) => unknown, ok: string) => { const r = run(fn); setMsg(r.ok ? { tone: 'ok', text: ok } : { tone: 'crit', text: r.error.message }); if (r.ok) setNote(''); };
  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17212B]/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="alert-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[22px] bg-white p-6 shadow-2xl outline-none" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#526171]">{a?.id} · {a?.category.replace('_', ' ')}</p>
            <h2 id="alert-title" className="mt-1 text-xl font-semibold text-[#17212B]">{a?.title ?? 'Alert not available'}</h2>
          </div>
          <Btn variant="ghost" onClick={onClose} aria-label="Close dialog"><X size={16} /></Btn>
        </div>
        {!a ? <EmptyState icon={BellOff} title="Alert no longer accessible" /> : (
          <>
            <div className="mt-3 flex flex-wrap gap-1.5"><AlertStatusPill s={a.status} /><SimPill /><Pill tone="sim">DEMO ONLY — NOT CLINICALLY VALIDATED</Pill></div>
            <p className="mt-3 text-sm text-[#33414F]">{a.detail}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-[14px] bg-[#F4F7FA] p-3 sm:grid-cols-3">
              <Meta label="Rule">{a.rule_id} v{a.rule_version}</Meta>
              <Meta label="Rule status">{rule?.status}</Meta>
              <Meta label="Approval">{rule?.approval_evidence ?? 'None — not clinically approved'}</Meta>
              <Meta label="Astronaut">{a.astronaut_id ?? '—'}</Meta>
              <Meta label="Stream">{a.stream_id ?? '—'}</Meta>
              <Meta label="Source event">{a.source_event_id?.slice(0, 18) ?? '—'}</Meta>
              <Meta label="Created">{utc(a.created_at)}</Meta>
              <Meta label="Occurrences">{a.occurrences}</Meta>
              <Meta label="Assignee">{api.userName(a.assignee)}</Meta>
            </dl>
            {rule && <p className="mt-2 text-xs text-[#526171]"><b>Condition:</b> {rule.condition} · <b>Quality policy:</b> {rule.quality_policy}</p>}
            <div className="mt-5 space-y-3 border-t border-[#EEF2F6] pt-4">
              <div className="flex flex-wrap gap-2">
                <Btn disabled={!caps.data?.ack || a.status === 'resolved' || a.status === 'acknowledged'} onClick={() => act((c) => api.ackAlert(c, a.id, a.version), 'Acknowledged. (Acknowledging does not resolve.)')} title={caps.data?.ack ? '' : 'Your role cannot acknowledge this alert'}>Acknowledge</Btn>
                <Btn variant="ghost" disabled title={caps.data?.escalationReason}>Escalate — {caps.data?.escalationReason}</Btn>
              </div>
              {caps.data?.assign && a.status !== 'resolved' && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Assign to
                    <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="rounded-[10px] border border-[#D3DBE3] px-3 py-2 text-[13px] normal-case text-[#17212B]">
                      <option value="">Select authorized user…</option>
                      {(assignees.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name} — {u.role}</option>)}
                    </select>
                  </label>
                  <Btn disabled={!assignee} onClick={() => act((c) => api.assignAlert(c, a.id, assignee, a.version), 'Assigned. (Assignment is not approval.)')}>Assign</Btn>
                </div>
              )}
              {caps.data?.resolve && a.status !== 'resolved' && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="res-note" className="text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Resolution note (required)</label>
                  <textarea id="res-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="rounded-[10px] border border-[#D3DBE3] p-2 text-sm" placeholder="Describe the human action taken (demo)…" />
                  <div><Btn variant="primary" disabled={!note.trim()} onClick={() => act((c) => api.resolveAlert(c, a.id, note, a.version), 'Resolved by authorized human action.')}>Resolve</Btn></div>
                </div>
              )}
              {!caps.data?.ack && !caps.data?.resolve && <p className="text-xs text-[#526171]">Your role has read-only access to this alert.</p>}
              {msg && <p role="status" className={`rounded-[10px] px-3 py-2 text-xs font-medium ${msg.tone === 'ok' ? 'bg-[#E6F4EC] text-[#145F41]' : 'bg-[#FDECEE] text-[#9E1C27]'}`}>{msg.text}</p>}
            </div>
            <div className="mt-5">
              <h3 className="text-[13px] font-semibold">Audit trail</h3>
              <ol className="mt-2 space-y-1.5">
                {a.history.map((h, i) => <li key={i} className="text-xs text-[#33414F]"><span className="font-mono text-[#526171]">{utc(h.at)}</span> · <b>{h.action}</b> by {h.by === 'system' ? 'system' : api.userName(h.by)}{h.note ? ` — ${h.note}` : ''}</li>)}
              </ol>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export function AlertDetailHost({ id, onClose }: { id: string | null; onClose: () => void }) {
  return <AnimatePresence>{id && <AlertDetail key={id} alertId={id} onClose={onClose} />}</AnimatePresence>;
}
