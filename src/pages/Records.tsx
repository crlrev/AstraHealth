import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../backend/api';
import { useApi, useAuth, useMutation } from '../ui/client';
import { Btn, EmptyState, ErrorState, PageHeader, Panel, Pill, Select, utc } from '../ui/components';
import { useMonitoredCrew } from '../ui/Layout';

type NoteView = ReturnType<typeof api.listNotes>[number];

function NoteItem({ n }: { n: NoteView }) {
  const run = useMutation();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(n.body);
  const [reason, setReason] = useState('');
  const [baseVersion, setBaseVersion] = useState(n.version);
  const [msg, setMsg] = useState<string | null>(null);
  const save = () => {
    const r = run((c) => api.editNote(c, n.id, body, reason, baseVersion));
    if (r.ok) { setEditing(false); setMsg('Correction saved; prior version preserved.'); setReason(''); }
    else setMsg(r.error.status === 409 ? `${r.error.message} (you edited v${baseVersion}; current is v${n.version})` : r.error.message);
  };
  return (
    <li className="rounded-[14px] border border-[#EEF2F6] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={n.kind === 'clinical' ? 'info' : 'neutral'}>{n.kind === 'clinical' ? 'Clinical note' : 'Operational note'}</Pill>
        {n.shared_with_astronaut && <Pill tone="ok">Shared with astronaut</Pill>}
        <span className="text-[13px] font-semibold">{n.title}</span>
      </div>
      <p className="mt-1 text-[11px] text-[#526171]">{n.astronaut_id} · {n.author_name} · created {utc(n.created_at)} · version {n.version}</p>
      {!editing ? <p className="mt-2 whitespace-pre-wrap text-sm text-[#33414F]">{n.body}</p> : (
        <div className="mt-2 space-y-2">
          <label className="sr-only" htmlFor={`b-${n.id}`}>Corrected text</label>
          <textarea id={`b-${n.id}`} value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full rounded-[10px] border border-[#D3DBE3] p-2 text-sm" />
          <input aria-label="Correction reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Correction reason (required)" className="w-full rounded-[10px] border border-[#D3DBE3] px-3 py-2 text-sm" />
          <div className="flex gap-2"><Btn variant="primary" onClick={save} disabled={!reason.trim()}>Save correction</Btn><Btn onClick={() => { setEditing(false); setBody(n.body); }}>Cancel</Btn></div>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {n.can_edit && !editing && <Btn variant="ghost" onClick={() => { setEditing(true); setBody(n.body); setBaseVersion(n.version); setMsg(null); }}>Issue correction</Btn>}
        {msg && <span role="status" className="text-xs font-medium text-[#33414F]">{msg}</span>}
        {msg?.includes('changed') && <Btn variant="ghost" onClick={() => { setBody(n.body); setBaseVersion(n.version); setMsg('Reloaded latest version. Re-apply your correction.'); }}>Reload latest</Btn>}
      </div>
      {n.revisions.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer text-xs font-semibold text-[#167A52]">Revision history ({n.revisions.length})</summary>
          <ol className="mt-1 space-y-1">{n.revisions.map((r) => <li key={r.version} className="text-xs text-[#526171]">v{r.version} · {utc(r.edited_at)} · reason: {r.reason}<br /><span className="text-[#33414F]">“{r.body}”</span></li>)}</ol>
        </details>
      )}
    </li>
  );
}

export default function Records() {
  const [sp, setSp] = useSearchParams();
  const filter = sp.get('a') ?? '';
  const { can } = useAuth();
  const crew = useMonitoredCrew();
  const notes = useApi((c) => api.listNotes(c, filter || undefined), [filter]);
  const run = useMutation();
  const kinds = [can('note.clinical.create') && 'clinical', can('note.operational.create') && 'operational'].filter(Boolean) as ('clinical' | 'operational')[];
  const [kind, setKind] = useState<'clinical' | 'operational'>(kinds[0] ?? 'clinical');
  const [astro, setAstro] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [shared, setShared] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const eligible = (crew.data ?? []).filter((a) => (kind === 'clinical' ? a.medical_access : a.monitoring_access));
  const target = astro || eligible[0]?.id || '';
  const submit = () => {
    const r = run((c) => api.createNote(c, { kind, astronaut_id: target, title, body, shared_with_astronaut: shared }));
    setMsg(r.ok ? { ok: true, text: `Saved ${r.value.id}.` } : { ok: false, text: r.error.message });
    if (r.ok) { setTitle(''); setBody(''); }
  };
  return (
    <div>
      <PageHeader title="Medical Records" subtitle="Structured, versioned notes. Not a messaging or chat service. All access is audited.">
        <Select label="Astronaut" value={filter} onChange={(v) => setSp(v ? { a: v } : {})} options={[{ value: '', label: 'All accessible' }, ...(crew.data ?? []).map((a) => ({ value: a.id, label: `${a.display_name} · ${a.id}` }))]} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="Record summaries & notes">
          {notes.error ? <ErrorState error={notes.error} /> : !notes.data?.length ? <EmptyState title="No notes visible to you" /> : <ul className="space-y-3">{notes.data.map((n) => <NoteItem key={n.id} n={n} />)}</ul>}
        </Panel>
        {kinds.length > 0 ? (
          <Panel title="New note" subtitle="Fictional demo content only.">
            <div className="space-y-3">
              {kinds.length > 1 && <Select label="Type" value={kind} onChange={(v) => setKind(v as 'clinical' | 'operational')} options={kinds.map((k) => ({ value: k, label: k }))} />}
              <Select label="Astronaut" value={target} onChange={setAstro} options={eligible.map((a) => ({ value: a.id, label: `${a.display_name} · ${a.id}` }))} />
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Title<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} className="mt-1 w-full rounded-[10px] border border-[#D3DBE3] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#17212B]" /></label>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Body<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="mt-1 w-full rounded-[10px] border border-[#D3DBE3] p-2 text-sm font-normal normal-case tracking-normal text-[#17212B]" /></label>
              {kind === 'clinical' && <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with astronaut (self-view)</label>}
              <Btn variant="primary" disabled={!title.trim() || !body.trim() || !target} onClick={submit}>Save {kind} note</Btn>
              {msg && <p role="status" className={`text-xs font-medium ${msg.ok ? 'text-[#145F41]' : 'text-[#9E1C27]'}`}>{msg.text}</p>}
            </div>
          </Panel>
        ) : <Panel title="New note"><p className="text-xs text-[#526171]">Your role cannot create notes.</p></Panel>}
      </div>
    </div>
  );
}
