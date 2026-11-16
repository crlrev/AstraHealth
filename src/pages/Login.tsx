import { FlaskConical, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../backend/auth';
import { ROLE_LABEL } from '../domain/config';
import { BodyMap } from '../ui/BodyMap';
import { useAuth } from '../ui/client';
import { ANATOMY_REGIONS } from '../domain/config';

export default function Login() {
  const { login, notice } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await login(u, p); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-[#E9EEF2] p-3">
      <div className="rounded-t-[22px] bg-[#17212B] px-3 py-1.5 text-center text-[11px] font-bold tracking-wide text-white">DEMONSTRATION PROTOTYPE — NOT FOR CLINICAL USE · <span className="text-[#C9B8FF]">SIMULATED DATA — NOT REAL ASTRONAUT TELEMETRY</span></div>
      <div className="grid min-h-[calc(100vh-48px)] overflow-hidden rounded-b-[22px] bg-[#F4F7FA] lg:grid-cols-[1.1fr_1fr]">
        <div className="relative hidden flex-col justify-between bg-white p-10 lg:flex">
          <div className="flex items-center gap-2">
            <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="9" fill="#167A52" /><path d="M16 6 L19 13 L26 16 L19 19 L16 26 L13 19 L6 16 L13 13 Z" fill="#fff" /><circle cx="16" cy="16" r="2.4" fill="#34C77B" /></svg>
            <span className="text-lg font-bold tracking-tight">ASTRAHEALTH</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-center gap-6">
            <div>
              <h1 className="text-[40px] font-semibold leading-[1.05] tracking-tight text-[#17212B]">Astronaut health<br />monitoring, <span className="text-[#167A52]">prototyped.</span></h1>
              <p className="mt-4 max-w-sm text-sm text-[#526171]">An engineering demonstration of telemetry provenance, freshness, store-and-forward replay and auditable alert workflows. It does not diagnose, triage or recommend treatment.</p>
            </div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
              <BodyMap interactive={false} height={380} selected="chest_cardiovascular" regions={ANATOMY_REGIONS.map((r) => ({ id: r.id, label: r.label, mappedCount: r.mapping.length, attention: false }))} />
            </motion.div>
          </div>
          <p className="flex items-center gap-2 text-xs text-[#4E3699]"><FlaskConical size={14} aria-hidden /> All crew, missions and measurements are fictional and simulated.</p>
        </div>
        <div className="flex items-center justify-center p-6">
          <form onSubmit={submit} className="w-full max-w-sm rounded-[22px] border border-[#E2E8EE] bg-white p-7 shadow-sm" aria-labelledby="signin-h">
            <h2 id="signin-h" className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-xs text-[#526171]">Access is role-based and scoped to assigned crew.</p>
            {notice && <p role="status" className="mt-4 rounded-[10px] bg-[#FFF4D6] px-3 py-2 text-xs font-medium text-[#6E4900]">{notice}</p>}
            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wide text-[#526171]" htmlFor="u">Username</label>
            <input id="u" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} className="mt-1 w-full rounded-[10px] border border-[#D3DBE3] px-3 py-2.5 text-sm outline-none focus:border-[#167A52]" required />
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-[#526171]" htmlFor="p">Password</label>
            <input id="p" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} className="mt-1 w-full rounded-[10px] border border-[#D3DBE3] px-3 py-2.5 text-sm outline-none focus:border-[#167A52]" required />
            {err && <p role="alert" className="mt-3 rounded-[10px] bg-[#FDECEE] px-3 py-2 text-xs font-medium text-[#9E1C27]">{err}</p>}
            <button disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-[12px] bg-[#167A52] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#126645] disabled:opacity-60"><Lock size={15} aria-hidden />{busy ? 'Verifying…' : 'Sign in'}</button>
            <div className="mt-6 border-t border-[#EEF2F6] pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#526171]">Development-only demo accounts</p>
              <p className="mt-1 text-[11px] text-[#526171]">Password for all: <code className="rounded bg-[#EEF2F6] px-1">{DEMO_PASSWORD}</code>. Disabled outside demo mode.</p>
              <ul className="mt-2 space-y-1">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.username}>
                    <button type="button" onClick={() => { setU(a.username); setP(DEMO_PASSWORD); }} className="flex w-full items-center justify-between rounded-[10px] px-2 py-1.5 text-left text-xs hover:bg-[#F4F7FA]">
                      <span className="font-mono font-semibold text-[#17212B]">{a.username}</span><span className="text-[#526171]">{ROLE_LABEL[a.role]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
