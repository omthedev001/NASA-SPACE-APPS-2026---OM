import { Activity, ClipboardCheck, ShieldAlert } from 'lucide-react';
import { DigitalTwinBodyMap } from '../components/DigitalTwinBodyMap';
import { ProtocolChecklist } from '../components/ProtocolChecklist';
import type { AppPageId, MissionEnvironment, TelemetrySnapshot } from '../types';

interface OverviewPageProps {
  snapshot: TelemetrySnapshot;
  onSwitchEnvironment: (env: MissionEnvironment) => void;
  onToggleRoutine: (routineId: string) => void;
  onSendControl: (action: string) => void;
  onNavigate: (page: AppPageId) => void;
  busyAction: string | null;
}

const ENVIRONMENTS: { id: MissionEnvironment; label: string }[] = [
  { id: 'spacecraft', label: 'Spacecraft' },
  { id: 'station', label: 'Space Station' },
  { id: 'rover', label: 'Surface Rover' },
  { id: 'base', label: 'Moon/Mars Base' },
];

export function OverviewPage({
  snapshot,
  onSwitchEnvironment,
  onToggleRoutine,
  onSendControl,
  onNavigate,
  busyAction,
}: OverviewPageProps) {
  const news2 = snapshot.news2 ?? {
    total_score: 0,
    acuity_tier: 'NOMINAL' as const,
    breakdown: [],
  };

  const tierStyle =
    news2.acuity_tier === 'EMERGENCY'
      ? 'bg-[#240a0c] border-[#b91c1c] text-[#ef4444]'
      : news2.acuity_tier === 'URGENT'
      ? 'bg-[#1f1606] border-[#b45309] text-[#f59e0b]'
      : news2.acuity_tier === 'MONITOR'
      ? 'bg-[#0a1c2e] border-[#38bdf8] text-[#38bdf8]'
      : 'bg-[#071f14] border-[#15803d] text-[#34d399]';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_325px] gap-4 items-start">
      {/* Left Rail: Mission Environment, Clinical Acuity Summary, Quick Emergency Drills */}
      <section className="flex flex-col gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-3.5 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc]">Mission Environment</h2>
            <span className="text-[11px] font-mono text-[#38bdf8]">
              {snapshot.environment_profile.gravity_g.toFixed(2)}g
            </span>
          </div>
          <div className="p-3 grid grid-cols-2 gap-1.5">
            {ENVIRONMENTS.map((env) => {
              const active = snapshot.environment === env.id;
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => onSwitchEnvironment(env.id)}
                  className={`px-2 py-1.5 text-xs font-semibold border cursor-pointer ${
                    active ? 'bg-[#0a1c2e] border-[#38bdf8] text-[#38bdf8]' : 'sx-btn'
                  }`}
                >
                  {env.label}
                </button>
              );
            })}
          </div>
          <div className="px-3 pb-3 text-[11px] font-mono text-[#94a3b8] flex flex-col gap-0.5">
            <div>Shielding: {snapshot.environment_profile.shielding_factor.toFixed(2)}x flux</div>
            <div>Earth Lag: {snapshot.environment_profile.comm_delay}</div>
          </div>
        </div>

        {/* Spaceflight Modified NEWS2 Acuity Card */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-3.5 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc] flex items-center gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>NEWS2 Clinical Acuity</span>
            </h2>
            <span className="text-[11px] font-mono text-[#94a3b8]">Python EHR</span>
          </div>
          <div className="p-3.5 flex flex-col gap-2.5 text-xs">
            <div className={`p-2.5 border flex items-center justify-between font-mono font-semibold ${tierStyle}`}>
              <span>Tier: {news2.acuity_tier}</span>
              <span>Score {news2.total_score}</span>
            </div>
            <p className="text-[11px] text-[#94a3b8] leading-relaxed">
              Computed continuously in Python across EMA SpO2, HR, Cuff BP, Core Temp, Glucose, Radiation Slope &amp; Mental Load.
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onNavigate('exam')}
                className="sx-btn-primary py-1.5 px-2 text-xs font-semibold cursor-pointer"
              >
                Open Self-Exam
              </button>
              <button
                type="button"
                onClick={() => onNavigate('algorithms')}
                className="sx-btn py-1.5 px-2 text-xs font-semibold cursor-pointer"
              >
                Scoring Math
              </button>
            </div>
          </div>
        </div>

        {/* Quick Emergency Fault Drills */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-3.5 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc] flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-[#f59e0b]" />
              <span>Simulation Drills</span>
            </h2>
            <span className="text-[11px] font-mono text-[#94a3b8]">
              {snapshot.simulator.playing ? 'Streaming' : 'Paused'}
            </span>
          </div>
          <div className="p-3 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => onSendControl('fault_hypoxia')}
              className="px-2 py-1.5 text-xs font-semibold bg-[#240a0c] border border-[#b91c1c] text-[#ef4444] hover:bg-[#381014] cursor-pointer"
            >
              Hypoxia Drill
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => onSendControl('fault_spe')}
              className="px-2 py-1.5 text-xs font-semibold bg-[#1f1606] border border-[#b45309] text-[#f59e0b] hover:bg-[#302109] cursor-pointer"
            >
              Solar Flare
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => onSendControl('fault_stress')}
              className="px-2 py-1.5 text-xs font-semibold bg-[#1f1606] border border-[#b45309] text-[#f59e0b] hover:bg-[#302109] cursor-pointer"
            >
              Stress Drill
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => onSendControl('restore_nominal')}
              className="px-2 py-1.5 text-xs font-semibold bg-[#071f14] border border-[#15803d] text-[#34d399] hover:bg-[#0b2e1e] cursor-pointer"
            >
              Nominal
            </button>
          </div>
        </div>
      </section>

      {/* Center: Interactive Digital Twin Body Map & Organ Clinical Guide */}
      <section className="flex flex-col gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#38bdf8]" />
              <h1 className="text-sm font-semibold tracking-wide text-[#f8fafc]">
                Crew Digital Twin
              </h1>
            </div>
            <span className="text-[11px] font-mono text-[#94a3b8]">Select region to inspect</span>
          </div>
          <div className="p-4">
            <DigitalTwinBodyMap snapshot={snapshot} />
          </div>
        </div>

        {/* Multi-Page Navigation Shortcuts */}
        <div className="sx-panel p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <button
            type="button"
            onClick={() => onNavigate('logs')}
            className="sx-cell p-3 text-left hover:border-[#38bdf8] transition-colors cursor-pointer"
          >
            <div className="font-semibold text-[#f1f5f9] flex items-center justify-between">
              <span>Crew Logs (Diet · Exercise · Mind)</span>
              <span className="font-mono text-[10px] text-[#34d399]">
                {snapshot.daily_logs_summary?.total_calories_kcal ?? 0} kcal · {snapshot.daily_logs_summary?.total_exercise_min ?? 0}m
              </span>
            </div>
            <div className="text-[11px] text-[#94a3b8] mt-1">
              Log nutrition &amp; hydration, ARED/T2 exercise sessions, and mental health journal entries.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('telemetry')}
            className="sx-cell p-3 text-left hover:border-[#38bdf8] transition-colors cursor-pointer"
          >
            <div className="font-semibold text-[#f1f5f9]">Telemetry &amp; 7 Live Plots</div>
            <div className="text-[11px] text-[#94a3b8] mt-1">
              Inspect live EMA SpO2, Proton Flux slope, MAP BP, and OSD-195 plots.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('wellness')}
            className="sx-cell p-3 text-left hover:border-[#38bdf8] transition-colors cursor-pointer"
          >
            <div className="font-semibold text-[#f1f5f9]">Behavioral &amp; Flight Surgeon</div>
            <div className="text-[11px] text-[#94a3b8] mt-1">
              Log sleep/mood, run 4-7-8 breathing pacer, or consult the AI companion.
            </div>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('deploy')}
            className="sx-cell p-3 text-left hover:border-[#38bdf8] transition-colors cursor-pointer"
          >
            <div className="font-semibold text-[#f1f5f9]">Mission Data &amp; Downlink</div>
            <div className="text-[11px] text-[#94a3b8] mt-1">
              Inspect SQLite status, upload NASA/MIMIC datasets, or export downlink JSON.
            </div>
          </button>
        </div>
      </section>

      {/* Right Rail: Daily Crew Routine & Actionable Countermeasures */}
      <div className="h-full">
        <ProtocolChecklist
          protocols={snapshot.protocols}
          completedRoutines={snapshot.completed_routines}
          onToggleRoutine={onToggleRoutine}
        />
      </div>
    </div>
  );
}
