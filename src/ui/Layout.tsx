import {
  Activity, Bell, BedDouble, FileText, FolderHeart, LayoutDashboard, LineChart, LogOut, Menu, Radiation, Search, Settings, Users, X, PersonStanding, FlaskConical, FilePlus2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as api from '../backend/api';
import { AlertDetailHost, AlertRow } from './Alerts';
import { useApi, useAuth } from './client';
import { Avatar, EmptyState, LinkPill, Select } from './components';
import { cn } from '../utils/cn';

/* ---------- Selected astronaut (UI convenience only; access always checked server-side) ---------- */
const SelCtx = createContext<{ sel: string | null; setSel: (id: string) => void; openAlert: (id: string) => void }>({ sel: null, setSel: () => {}, openAlert: () => {} });
export const useSelection = () => useContext(SelCtx);

export function useMonitoredCrew() {
  return useApi((c) => api.listCrew(c, { pageSize: 50 }).items.filter((a) => a.monitoring_access), []);
}

export function AstronautPicker({ value, onChange, needMedical = false }: { value: string; onChange: (id: string) => void; needMedical?: boolean }) {
  const crew = useMonitoredCrew();
  const items = (crew.data ?? []).filter((a) => !needMedical || a.medical_access);
  return <Select label="Astronaut" value={value} onChange={onChange} options={items.map((a) => ({ value: a.id, label: `${a.display_name} · ${a.id}` }))} className="min-w-[220px]" />;
}

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}

const NAV = [
  { to: '/mission', label: 'Mission Overview', icon: LayoutDashboard, show: () => true },
  { to: '/crew', label: 'Crew Monitoring', icon: Users, show: () => true },
  { to: '/anatomy', label: 'Anatomical Monitor', icon: PersonStanding, show: (p: string[]) => p.some((x) => ['medical.view_assigned', 'monitoring.view_assigned', 'profile.view_own'].includes(x)) },
  { to: '/vitals', label: 'Vital Signs', icon: Activity, show: (p: string[]) => p.some((x) => ['medical.view_assigned', 'monitoring.view_assigned', 'profile.view_own'].includes(x)) },
  { to: '/analytics', label: 'Health Analytics', icon: LineChart, show: (p: string[]) => p.some((x) => ['medical.view_assigned', 'monitoring.view_assigned', 'profile.view_own'].includes(x)) },
  { to: '/wellness', label: 'Sleep & Recovery', icon: BedDouble, show: (p: string[]) => p.some((x) => ['medical.view_assigned', 'profile.view_own'].includes(x)) },
  { to: '/radiation', label: 'Radiation Exposure', icon: Radiation, show: (p: string[]) => p.some((x) => ['medical.view_assigned', 'monitoring.view_assigned', 'profile.view_own'].includes(x)) },
  { to: '/records', label: 'Medical Records', icon: FolderHeart, show: (p: string[]) => p.some((x) => ['medical.view_assigned', 'note.operational.create', 'profile.view_own'].includes(x)) },
  { to: '/reports', label: 'Reports', icon: FileText, show: (p: string[]) => p.some((x) => ['report.medical', 'report.own', 'report.ops'].includes(x)) },
  { to: '/settings', label: 'Settings', icon: Settings, show: () => true },
];
export const navAllowed = (path: string, perms: string[]) => NAV.find((n) => path.startsWith(n.to))?.show(perms) ?? true;

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { me, logout } = useAuth();
  const { sel } = useSelection();
  const perms = me?.permissions ?? [];
  const loc = useLocation();
  return (
    <nav aria-label="Primary" className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-6 pt-1">
        <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="9" fill="#167A52" /><path d="M16 6 L19 13 L26 16 L19 19 L16 26 L13 19 L6 16 L13 13 Z" fill="#fff" /><circle cx="16" cy="16" r="2.4" fill="#34C77B" /></svg>
        <div>
          <p className="text-[15px] font-bold tracking-tight text-[#17212B]">ASTRAHEALTH</p>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#617080]">Demo prototype</p>
        </div>
      </div>
      <ul className="space-y-0.5">
        {NAV.filter((n) => n.show(perms)).map((n) => {
          const to = (n.to === '/anatomy' || n.to === '/vitals') && sel ? `/crew/${sel}${n.to === '/anatomy' ? '/anatomy' : '/vitals'}` : n.to;
          const active = n.to === '/anatomy' ? loc.pathname.endsWith('/anatomy') : n.to === '/vitals' ? loc.pathname.endsWith('/vitals') : n.to === '/crew' ? loc.pathname.startsWith('/crew') && !/\/(anatomy|vitals)$/.test(loc.pathname) : loc.pathname.startsWith(n.to);
          return (
            <li key={n.to}>
              <NavLink to={to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn('relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13px] font-medium transition-colors duration-150', active ? 'bg-[#E6F4EC] text-[#145F41]' : 'text-[#46525F] hover:bg-[#F4F7FA] hover:text-[#17212B]')}>
                {active && <motion.span layoutId="nav-ind" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#167A52]" transition={{ duration: 0.2, ease: 'easeOut' }} />}
                <n.icon size={17} aria-hidden />
                {n.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto space-y-3 pt-6">
        <div className="rounded-[14px] border border-[#D6CCF7] bg-[#F0ECFF] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#4E3699]"><FlaskConical size={13} aria-hidden /> Simulation mode</p>
          <p className="mt-1 text-[11px] leading-snug text-[#4E3699]">All telemetry is synthetic. Rules are demo-only and not clinically validated.</p>
        </div>
        <div className="flex items-center gap-2 rounded-[14px] p-2">
          <Avatar initials={(me?.display_name ?? '?').split(' ').map((p) => p[0]).slice(-2).join('')} hue={160} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#17212B]">{me?.display_name}</p>
            <p className="truncate text-[11px] text-[#526171]">{me?.role_label}</p>
          </div>
          <button onClick={logout} className="rounded-[10px] p-2 text-[#526171] hover:bg-[#F4F7FA] hover:text-[#17212B]" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </nav>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(1); }, 200); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const res = useApi((c) => api.search(c, debounced, 1, page * 6), [debounced, page]);
  return (
    <div ref={ref} className="relative w-full max-w-md">
      <label className="flex items-center gap-2 rounded-full border border-[#E2E8EE] bg-white px-4 py-2.5 focus-within:border-[#167A52]">
        <Search size={16} className="text-[#617080]" aria-hidden />
        <span className="sr-only">Search astronauts, missions, sensors</span>
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={(e) => e.key === 'Escape' && setOpen(false)} placeholder="Search crew, mission, sensor ID…" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[#7A8794]" aria-controls={open && debounced.trim().length >= 2 ? 'search-results' : undefined} aria-expanded={open && debounced.trim().length >= 2} role="combobox" aria-autocomplete="list" />
      </label>
      {open && debounced.trim().length >= 2 && (
        <div id="search-results" role="listbox" className="absolute left-0 right-0 top-12 z-40 rounded-[16px] border border-[#E2E8EE] bg-white p-2 shadow-xl">
          {res.error ? <p className="p-3 text-xs text-[#9E1C27]">{res.error.message}</p> : !res.data?.items.length ? <p className="p-3 text-xs text-[#526171]">No accessible matches. Search covers names, IDs, missions and sensor IDs you are authorized to see — never note content.</p> : (
            <>
              {res.data.items.map((i) => (
                <button key={i.kind + i.id} role="option" aria-selected={false} onClick={() => { nav(i.href); setOpen(false); setQ(''); }} className="flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-[#F4F7FA]">
                  <span><span className="block text-[13px] font-semibold">{i.label}</span><span className="block text-[11px] text-[#526171]">{i.sub}</span></span>
                  <span className="text-[10px] font-semibold uppercase text-[#617080]">{i.kind}</span>
                </button>
              ))}
              {res.data.total > res.data.items.length && <button onClick={() => setPage(page + 1)} className="w-full rounded-[10px] px-3 py-2 text-xs font-semibold text-[#167A52] hover:bg-[#F4F7FA]">Show more ({res.data.total - res.data.items.length} remaining)</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Header({ onMenu, onBell }: { onMenu: () => void; onBell: () => void }) {
  const { can } = useAuth();
  const nav = useNavigate();
  const now = useNow();
  const link = useApi((c) => (can('ops.view') ? api.linkStatus(c) : null), []);
  const alerts = useApi((c) => api.listAlerts(c, { status: 'open' }), []);
  const unack = (alerts.data ?? []).filter((a) => a.status === 'active_unacknowledged' || a.status === 'reopened').length;
  return (
    <header className="flex flex-wrap items-center gap-3 pb-4">
      <button className="rounded-[10px] border border-[#E2E8EE] bg-white p-2.5 lg:hidden" onClick={onMenu} aria-label="Open navigation"><Menu size={18} /></button>
      <GlobalSearch />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {link.data && <span className="hidden items-center gap-1.5 sm:flex"><LinkPill s={link.data.state} />{link.data.queued > 0 && <span className="text-[11px] font-semibold text-[#6E4900]">{link.data.queued} queued</span>}</span>}
        <span className="hidden rounded-full border border-[#E2E8EE] bg-white px-3 py-2 font-mono text-[12px] text-[#17212B] md:block" aria-label="Current UTC time">{new Date(now).toISOString().slice(0, 19).replace('T', ' ')} UTC</span>
        <button onClick={onBell} className="relative rounded-full border border-[#E2E8EE] bg-white p-2.5 hover:bg-[#F4F7FA]" aria-label={`Alerts: ${unack} unacknowledged`}>
          <Bell size={17} />
          {unack > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#B4232F] px-1 text-[10px] font-bold text-white">{unack}</span>}
        </button>
        {(can('report.medical') || can('report.own') || can('report.ops')) && (
          <button onClick={() => nav('/reports')} className="hidden items-center gap-2 rounded-full bg-[#167A52] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#126645] sm:flex"><FilePlus2 size={16} aria-hidden /> Generate report</button>
        )}
      </div>
    </header>
  );
}

function AlertsDrawer({ open, onClose, onOpenAlert }: { open: boolean; onClose: () => void; onOpenAlert: (id: string) => void }) {
  const alerts = useApi((c) => api.listAlerts(c, { status: 'open' }), []);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 bg-[#17212B]/25" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.aside role="dialog" aria-label="Open alerts" className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col bg-[#F4F7FA] p-4 shadow-2xl" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Open alerts &amp; events</h2><button onClick={onClose} className="rounded-[10px] p-2 hover:bg-white" aria-label="Close alerts"><X size={16} /></button></div>
            <p className="mb-3 text-[11px] text-[#526171]">Deterministic DEMO rules only. No automatic escalation or outbound notification exists.</p>
            <div className="flex-1 space-y-2 overflow-y-auto">
              {alerts.error ? <p className="text-xs">{alerts.error.message}</p> : !alerts.data?.length ? <EmptyState title="No open alerts visible to your role" /> : alerts.data.slice(0, 60).map((a) => <AlertRow key={a.id} a={a} onOpen={() => onOpenAlert(a.id)} />)}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [alertId, setAlertId] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const crew = useMonitoredCrew();
  useEffect(() => { if (!sel && crew.data?.length) setSel(crew.data[0].id); }, [crew.data, sel]);
  const loc = useLocation();
  useEffect(() => { const m = loc.pathname.match(/^\/crew\/(AST-\d+)/); if (m && crew.data?.some((a) => a.id === m[1])) setSel(m[1]); }, [loc.pathname, crew.data]);
  return (
    <SelCtx.Provider value={{ sel, setSel, openAlert: setAlertId }}>
      <div className="min-h-screen bg-[#E9EEF2] p-0 lg:p-3">
        <div role="note" className="sticky top-0 z-30 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 bg-[#17212B] px-3 py-1.5 text-center text-[11px] font-bold tracking-wide text-white lg:rounded-t-[22px]">
          <span>DEMONSTRATION PROTOTYPE — NOT FOR CLINICAL USE</span><span className="text-[#C9B8FF]">SIMULATED DATA — NOT REAL ASTRONAUT TELEMETRY</span>
        </div>
        <div className="flex min-h-[calc(100vh-24px)] bg-[#F4F7FA] lg:rounded-b-[22px]">
          <aside className="sticky top-7 hidden h-[calc(100vh-52px)] w-[220px] shrink-0 overflow-y-auto border-r border-[#E2E8EE] bg-white p-3 lg:block lg:rounded-bl-[22px]"><Sidebar /></aside>
          <AnimatePresence>
            {menu && (
              <motion.div className="fixed inset-0 z-50 bg-[#17212B]/30 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && setMenu(false)}>
                <motion.aside className="h-full w-[260px] overflow-y-auto bg-white p-3" initial={{ x: -30 }} animate={{ x: 0 }} exit={{ x: -30 }} transition={{ duration: 0.2 }}>
                  <button onClick={() => setMenu(false)} className="mb-2 ml-auto block rounded-[10px] p-2 hover:bg-[#F4F7FA]" aria-label="Close navigation"><X size={16} /></button>
                  <Sidebar onNavigate={() => setMenu(false)} />
                </motion.aside>
              </motion.div>
            )}
          </AnimatePresence>
          <main className="min-w-0 flex-1 p-4 sm:p-6">
            <Header onMenu={() => setMenu(true)} onBell={() => setBell(true)} />
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>{children}</motion.div>
          </main>
        </div>
      </div>
      <AlertsDrawer open={bell} onClose={() => setBell(false)} onOpenAlert={(id) => setAlertId(id)} />
      <AlertDetailHost id={alertId} onClose={() => setAlertId(null)} />
    </SelCtx.Provider>
  );
}
