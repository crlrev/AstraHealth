import { MotionConfig } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { initBackend } from './backend';
import Analytics from './pages/Analytics';
import Anatomy from './pages/Anatomy';
import { CrewList, CrewProfile } from './pages/Crew';
import Login from './pages/Login';
import MissionOverview from './pages/Mission';
import Radiation from './pages/Radiation';
import Records from './pages/Records';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Vitals from './pages/Vitals';
import Wellness from './pages/Wellness';
import { AuthProvider, useAuth } from './ui/client';
import { EmptyState } from './ui/components';
import { Layout, navAllowed, useSelection } from './ui/Layout';

function Guard({ path, children }: { path: string; children: ReactNode }) {
  const { me } = useAuth();
  if (!navAllowed(path, me?.permissions ?? [])) return <EmptyState title="This area is not available to your role">Access is enforced server-side; navigation is hidden for routes you cannot use.</EmptyState>;
  return <>{children}</>;
}

function SelectRedirect({ suffix }: { suffix: 'anatomy' | 'vitals' }) {
  const { sel } = useSelection();
  if (!sel) return <EmptyState title="No astronaut selected">Choose an astronaut from Crew Monitoring first.</EmptyState>;
  return <Navigate to={`/crew/${sel}/${suffix}`} replace />;
}

function Shell() {
  const { me } = useAuth();
  if (!me) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/mission" replace />} />
        <Route path="/mission" element={<MissionOverview />} />
        <Route path="/crew" element={<CrewList />} />
        <Route path="/crew/:astronautId" element={<CrewProfile />} />
        <Route path="/crew/:astronautId/anatomy" element={<Guard path="/anatomy"><Anatomy /></Guard>} />
        <Route path="/crew/:astronautId/vitals" element={<Guard path="/vitals"><Vitals /></Guard>} />
        <Route path="/anatomy" element={<Guard path="/anatomy"><SelectRedirect suffix="anatomy" /></Guard>} />
        <Route path="/vitals" element={<Guard path="/vitals"><SelectRedirect suffix="vitals" /></Guard>} />
        <Route path="/analytics" element={<Guard path="/analytics"><Analytics /></Guard>} />
        <Route path="/wellness" element={<Guard path="/wellness"><Wellness /></Guard>} />
        <Route path="/radiation" element={<Guard path="/radiation"><Radiation /></Guard>} />
        <Route path="/records" element={<Guard path="/records"><Records /></Guard>} />
        <Route path="/reports" element={<Guard path="/reports"><Reports /></Guard>} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<EmptyState title="Page not found">Use the navigation to continue.</EmptyState>} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { initBackend().then(() => setReady(true)).catch((e) => setErr(String(e))); }, []);
  if (err) return <div role="alert" className="p-8 text-sm text-[#9E1C27]">Failed to start: {err}</div>;
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#F4F7FA]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#BFE3CF] border-t-[#167A52]" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[#17212B]">Seeding deterministic simulated dataset…</p>
          <p className="text-xs text-[#526171]">SIMULATED DATA — NOT REAL ASTRONAUT TELEMETRY</p>
        </div>
      </div>
    );
  }
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <HashRouter>
          <Shell />
        </HashRouter>
      </AuthProvider>
    </MotionConfig>
  );
}
