import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { AlgorithmsPage } from './pages/AlgorithmsPage';
import { CrewLogsPage } from './pages/CrewLogsPage';
import { DeployPage } from './pages/DeployPage';
import { OverviewPage } from './pages/OverviewPage';
import { SelfExamPage } from './pages/SelfExamPage';
import { TelemetryPage } from './pages/TelemetryPage';
import { WellnessPage } from './pages/WellnessPage';
import type { AppPageId, MissionEnvironment, TelemetrySnapshot } from './types';

const INITIAL_SNAPSHOT: TelemetrySnapshot = {
  timestamp: 0,
  smoothed_spo2: 98.0,
  raw_spo2: 98.0,
  smoothed_heart_rate: 72.0,
  raw_heart_rate: 72.0,
  radiation_flux: 1.24,
  ambient_dose: 0.41,
  cumulative_dose_msv: 14.8,
  radiation_slope: 0.0,
  genetic_atrophy_baseline: 1.25,
  muscle_atrophy_risk: 1.25,
  mental_stress_index: 12.0,
  mental_checkin: {
    mood_score: 4,
    sleep_hours: 7.5,
    cognitive_fatigue: false,
    isolation_stress: false,
  },
  self_assessment: {
    systolic_bp: 118,
    diastolic_bp: 76,
    blood_sugar_mg_dl: 94,
    body_temp_c: 36.8,
    map_mmhg: 90,
  },
  news2: {
    total_score: 0,
    acuity_tier: 'NOMINAL',
    breakdown: [],
  },
  environment: 'spacecraft',
  environment_profile: {
    label: 'Deep-Space Transit Spacecraft',
    gravity_g: 0.0,
    shielding_factor: 1.0,
    comm_delay: '14.2 min one-way',
  },
  completed_routines: [],
  protocols: [],
  history: [],
  backend_engine: {
    runtime: 'Python 3.10',
    port: 8001,
    uptime_s: 0,
  },
  simulator: {
    playing: true,
    current_row: 0,
    total_rows: 36,
  },
};

const NAV_PAGES: { id: AppPageId; label: string }[] = [
  { id: 'overview', label: 'Digital Twin' },
  { id: 'exam', label: 'Self-Exam' },
  { id: 'logs', label: 'Crew Logs' },
  { id: 'telemetry', label: 'Telemetry' },
  { id: 'algorithms', label: 'Algorithms' },
  { id: 'wellness', label: 'Wellness & AI' },
  { id: 'deploy', label: 'Mission Data' },
];

function parseHashPage(): AppPageId {
  const raw = window.location.hash.replace('#', '').trim() as AppPageId;
  return NAV_PAGES.some((p) => p.id === raw) ? raw : 'overview';
}

export default function App() {
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot>(INITIAL_SNAPSHOT);
  const [wsConnected, setWsConnected] = useState(false);
  const [activePage, setActivePage] = useState<AppPageId>(() => parseHashPage());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const navigate = (page: AppPageId) => {
    setActivePage(page);
    if (window.location.hash !== `#${page}`) {
      window.location.hash = page;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    const onHashChange = () => {
      setActivePage(parseHashPage());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;

    fetch('/api/state')
      .then((res) => res.json())
      .then((data: TelemetrySnapshot) => {
        if (active && data && typeof data.smoothed_spo2 === 'number') {
          setSnapshot(data);
        }
      })
      .catch(() => {});

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/dashboard`);

      socket.addEventListener('open', () => {
        if (active) setWsConnected(true);
      });

      socket.addEventListener('close', () => {
        if (!active) return;
        setWsConnected(false);
        reconnectTimer.current = window.setTimeout(connect, 1500);
      });

      socket.addEventListener('message', (evt) => {
        if (!active) return;
        try {
          const next = JSON.parse(evt.data) as TelemetrySnapshot;
          if (next && typeof next.smoothed_spo2 === 'number') {
            setSnapshot(next);
          }
        } catch {
          // Ignore malformed frame
        }
      });
    }

    connect();

    return () => {
      active = false;
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
      }
      socket?.close();
    };
  }, []);

  const sendControl = async (action: string) => {
    setBusyAction(action);
    try {
      const res = await fetch('/api/simulator/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const next = (await res.json()) as TelemetrySnapshot;
        setSnapshot(next);
      }
    } finally {
      setBusyAction(null);
    }
  };

  const switchEnvironment = async (environment: MissionEnvironment) => {
    const res = await fetch('/api/environment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    });
    if (res.ok) {
      const next = (await res.json()) as TelemetrySnapshot;
      setSnapshot(next);
    }
  };

  const toggleRoutine = async (routine_id: string) => {
    const res = await fetch('/api/routine/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routine_id }),
    });
    if (res.ok) {
      const next = (await res.json()) as TelemetrySnapshot;
      setSnapshot(next);
    }
  };

  const news2 = snapshot.news2 ?? { total_score: 0, acuity_tier: 'NOMINAL' };

  return (
    <div className="min-h-screen bg-[#06080d] text-[#e2e8f0] flex flex-col">
      {/* SpaceX Flight-Deck Top Bar — Single Row 3-Zone Operational Contract */}
      <header className="sticky top-0 z-30 bg-[#090c12] border-b border-[#1d2636] px-6 py-2.5 flex items-center justify-between gap-6">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate('overview');
          }}
          className="text-base font-semibold tracking-wider text-[#f8fafc] whitespace-nowrap shrink-0 flex items-center gap-2"
        >
          <span className="inline-block w-2 h-2 bg-[#38bdf8]" aria-hidden="true" />
          <span>AstroHealth</span>
        </a>

        <nav className="hidden lg:flex items-center gap-5 text-xs font-medium">
          {NAV_PAGES.map((page) => {
            const active = activePage === page.id;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => navigate(page.id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-[#38bdf8] text-[#f8fafc] font-semibold'
                    : 'border-transparent text-[#94a3b8] hover:text-[#f8fafc]'
                }`}
              >
                {page.label}
              </button>
            );
          })}
        </nav>

        <a
          href="/api/report/export"
          download="astrohealth_downlink_report.json"
          className="sx-btn flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#38bdf8]" />
          <span>Export Report</span>
        </a>
      </header>

      {/* Compact Mobile/Tablet Page Switcher (< lg) */}
      <div className="lg:hidden bg-[#0c1017] border-b border-[#1d2636] px-4 py-1.5 flex overflow-x-auto gap-1.5">
        {NAV_PAGES.map((page) => {
          const active = activePage === page.id;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => navigate(page.id)}
              className={`px-2.5 py-1 text-xs whitespace-nowrap shrink-0 border cursor-pointer ${
                active
                  ? 'bg-[#0a1c2e] text-[#38bdf8] border-[#38bdf8] font-semibold'
                  : 'bg-[#080b11] text-[#94a3b8] border-[#1d2636]'
              }`}
            >
              {page.label}
            </button>
          );
        })}
      </div>

      {/* Mission Telemetry, Python Engine & Downlink Status Bar */}
      <div className="bg-[#080b11] border-b border-[#1d2636] px-6 py-1.5 text-xs font-mono text-[#94a3b8] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={wsConnected ? 'text-[#34d399] font-semibold' : 'text-[#f59e0b] font-semibold'}>
            {wsConnected
              ? `■ ${snapshot.backend_engine?.runtime ?? 'Python'} Link Active`
              : '▲ Reconnecting Link'}
          </span>
          <span aria-hidden="true" className="text-[#334155]">·</span>
          <span className="text-[#cbd5e1]">{snapshot.environment_profile.label}</span>
          <span aria-hidden="true" className="text-[#334155]">·</span>
          <span>MET T+{snapshot.timestamp.toFixed(0)}s</span>
          <span aria-hidden="true" className="text-[#334155]">·</span>
          <span>Dose {snapshot.cumulative_dose_msv.toFixed(2)} / 250 mSv</span>
          <span aria-hidden="true" className="text-[#334155]">·</span>
          <span
            className={
              news2.acuity_tier === 'EMERGENCY'
                ? 'text-[#ef4444] font-semibold'
                : news2.acuity_tier === 'URGENT'
                ? 'text-[#f59e0b] font-semibold'
                : 'text-[#34d399] font-semibold'
            }
          >
            NEWS2 {news2.total_score} ({news2.acuity_tier})
          </span>
        </div>

        <span className="text-[11px] text-[#64748b]">
          CDR-01 · Comm Lag {snapshot.environment_profile.comm_delay}
        </span>
      </div>

      {/* Active Page Workspace */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-5 py-4">
        {activePage === 'overview' && (
          <OverviewPage
            snapshot={snapshot}
            onSwitchEnvironment={(env) => void switchEnvironment(env)}
            onToggleRoutine={(id) => void toggleRoutine(id)}
            onSendControl={(act) => void sendControl(act)}
            onNavigate={navigate}
            busyAction={busyAction}
          />
        )}

        {activePage === 'exam' && (
          <SelfExamPage snapshot={snapshot} onSnapshotUpdate={setSnapshot} />
        )}

        {activePage === 'logs' && (
          <CrewLogsPage snapshot={snapshot} onSnapshotUpdate={setSnapshot} />
        )}

        {activePage === 'telemetry' && (
          <TelemetryPage
            snapshot={snapshot}
            onSendControl={(act) => void sendControl(act)}
            onSnapshotUpdate={setSnapshot}
            busyAction={busyAction}
          />
        )}

        {activePage === 'algorithms' && <AlgorithmsPage snapshot={snapshot} />}

        {activePage === 'wellness' && (
          <WellnessPage snapshot={snapshot} onSnapshotUpdate={setSnapshot} />
        )}

        {activePage === 'deploy' && (
          <DeployPage snapshot={snapshot} onSnapshotUpdate={setSnapshot} />
        )}
      </main>
    </div>
  );
}
