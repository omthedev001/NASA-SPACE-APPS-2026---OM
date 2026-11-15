import { useEffect, useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import type { ActionableProtocol } from '../types';

interface ProtocolChecklistProps {
  protocols: ActionableProtocol[];
  completedRoutines: string[];
  onToggleRoutine: (routineId: string) => void;
}

const DAILY_ROUTINES = [
  {
    id: 'routine-pulmonary',
    title: '01. Resting Oximetry & Scrubber Check',
    why: 'Detects closed-cabin O2 drops before hypoxia impairs cognition.',
  },
  {
    id: 'routine-cardio',
    title: '02. Cuff Blood Pressure & Resting HR',
    why: 'Monitors microgravity fluid shifts and orthostatic intolerance.',
  },
  {
    id: 'routine-metabolic',
    title: '03. Glucose (mg/dL) & Core Temp (°C)',
    why: 'Flags metabolic drift, nutrition gaps, or latent immune fever.',
  },
  {
    id: 'routine-behavioral',
    title: '04. Sleep Log & Behavioral Check-In',
    why: 'Protects crew mood, alertness, and isolation resilience.',
  },
  {
    id: 'routine-nutrition',
    title: '05. Nutrition, Calories & Hydration Log',
    why: 'Tracks 2,800 kcal target, protein, Vitamin D & fluid balance.',
  },
  {
    id: 'routine-exercise',
    title: '06. ARED Resistive / Cardio Exercise',
    why: '90-min daily loading offsets microgravity bone & muscle atrophy.',
  },
];

export function ProtocolChecklist({
  protocols,
  completedRoutines,
  onToggleRoutine,
}: ProtocolChecklistProps) {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (protocols.length === 0) {
      setCompleted({});
      return;
    }
    const activeKeys = new Set<string>();
    protocols.forEach((p) => {
      p.checklist.forEach((step) => {
        activeKeys.add(`${p.id}::${step}`);
      });
    });
    setCompleted((prev) => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((k) => {
        if (activeKeys.has(k) && prev[k]) {
          next[k] = true;
        }
      });
      return next;
    });
  }, [protocols]);

  const toggleStep = (key: string) => {
    setCompleted((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const totalSteps = protocols.reduce((acc, p) => acc + p.checklist.length, 0);
  const doneSteps = protocols.reduce(
    (acc, p) =>
      acc + p.checklist.filter((step) => completed[`${p.id}::${step}`]).length,
    0
  );
  const completionPct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 100;

  const routineDoneCount = DAILY_ROUTINES.filter((r) =>
    completedRoutines.includes(r.id)
  ).length;
  const routinePct = Math.round((routineDoneCount / DAILY_ROUTINES.length) * 100);

  const categoryLabel = (cat: ActionableProtocol['category']) => {
    if (cat === 'physical') return 'Physical Medical';
    if (cat === 'radiation') return 'Radiation Shielding';
    if (cat === 'metabolic') return 'Metabolic & Immune';
    return 'Behavioral Wellness';
  };

  return (
    <aside className="flex flex-col gap-4 h-full">
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold">Daily Crew Routine</h2>
          <span className="text-[11px] font-mono text-[#94a3b8]">
            {routineDoneCount}/{DAILY_ROUTINES.length} Complete
          </span>
        </div>
        <div className="p-3.5 flex flex-col gap-2.5">
          <div className="sx-cell p-2.5 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
              <span>Routine Compliance</span>
              <span className="font-semibold text-[#38bdf8]">{routinePct}%</span>
            </div>
            <div className="h-2 w-full bg-[#06080d] border border-[#1a2333]">
              <div
                className="h-full bg-[#38bdf8] transition-all duration-150"
                style={{ width: `${routinePct}%` }}
              />
            </div>
          </div>

          <ul className="flex flex-col gap-1.5">
            {DAILY_ROUTINES.map((item) => {
              const checked = completedRoutines.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onToggleRoutine(item.id)}
                    className={`w-full text-left flex items-start gap-2.5 px-2.5 py-2 border text-xs transition-colors cursor-pointer ${
                      checked
                        ? 'bg-[#091b14] border-[#166534]'
                        : 'bg-[#080b11] border-[#1a2333] hover:border-[#38bdf8]'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-[#34d399] shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-[#64748b] shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className={checked ? 'line-through text-[#64748b] font-semibold' : 'text-[#e2e8f0] font-semibold'}>
                        {item.title}
                      </div>
                      <div className="text-[11px] text-[#94a3b8] mt-0.5">{item.why}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="sx-panel overflow-hidden flex flex-col flex-1">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold">
            Active Countermeasure Checklist
          </h2>
          <span className="text-[11px] font-mono text-[#94a3b8]">
            {protocols.length === 0 ? 'Standby' : `${doneSteps}/${totalSteps} Cleared`}
          </span>
        </div>

        <div className="p-3.5 flex flex-col gap-3 flex-1">
          {totalSteps > 0 && (
            <div className="sx-cell p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#94a3b8]">
                <span>Checklist Progress</span>
                <span className="font-semibold text-[#34d399]">{completionPct}%</span>
              </div>
              <div className="h-2 w-full bg-[#06080d] border border-[#1a2333]">
                <div
                  className="h-full bg-[#22c55e] transition-all duration-150"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          )}

          {protocols.length === 0 ? (
            <div className="sx-cell flex-1 min-h-[180px] p-5 flex flex-col items-center justify-center text-center gap-2">
              <div className="text-sm font-mono font-semibold text-[#34d399]">
                ■ All Systems Nominal
              </div>
              <p className="text-xs text-[#94a3b8] max-w-[30ch] leading-relaxed">
                Streamed vitals, radiation slope, self-measurements, and behavioral stress indicators are within flight limits.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 overflow-y-auto">
              {protocols.map((proto) => {
                const isCritical = proto.severity === 'CRITICAL';
                return (
                  <div
                    key={proto.id}
                    className={`sx-cell p-3 flex flex-col gap-2 ${
                      isCritical ? 'border-[#dc2626]' : 'border-[#d97706]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-[#1a2333] pb-2">
                      <div>
                        <div className="text-[11px] text-[#94a3b8]">
                          {categoryLabel(proto.category)} · {proto.hrp_factor}
                        </div>
                        <h3 className="text-xs font-semibold text-[#f8fafc] mt-0.5">
                          {proto.hazard}
                        </h3>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 ${
                          isCritical ? 'text-[#ef4444]' : 'text-[#f59e0b]'
                        }`}
                      >
                        {isCritical ? '✖ CRITICAL' : '▲ WARNING'}
                      </span>
                    </div>

                    <p className="text-[11px] text-[#94a3b8] leading-snug">
                      {proto.guidance}
                    </p>

                    <ul className="flex flex-col gap-1.5">
                      {proto.checklist.map((step) => {
                        const key = `${proto.id}::${step}`;
                        const checked = Boolean(completed[key]);
                        return (
                          <li key={key}>
                            <button
                              type="button"
                              onClick={() => toggleStep(key)}
                              className={`w-full text-left flex items-start gap-2 px-2.5 py-2 border text-xs transition-colors duration-150 cursor-pointer ${
                                checked
                                  ? 'bg-[#091b14] border-[#166534]'
                                  : 'bg-[#0c111a] border-[#1e293b] hover:border-[#38bdf8]'
                              }`}
                            >
                              {checked ? (
                                <CheckSquare className="w-4 h-4 text-[#34d399] shrink-0 mt-0.5" />
                              ) : (
                                <Square className="w-4 h-4 text-[#64748b] shrink-0 mt-0.5" />
                              )}
                              <span
                                className={`leading-snug ${
                                  checked ? 'line-through text-[#64748b]' : 'text-[#e2e8f0]'
                                }`}
                              >
                                {step}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
