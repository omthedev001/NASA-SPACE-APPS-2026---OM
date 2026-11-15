import { useState } from 'react';
import type { HistoryPoint, TelemetrySnapshot } from '../types';

interface TelemetryChartsProps {
  snapshot: TelemetrySnapshot;
}

const OSD195_GENES = [
  { symbol: 'TRIM63', value: 1.17 },
  { symbol: 'FBXO32', value: 1.34 },
  { symbol: 'MSTN', value: 1.21 },
  { symbol: 'FOXO3', value: 1.29 },
  { symbol: 'ACTA1', value: 1.24 },
  { symbol: 'MYH7', value: 1.26 },
];

function buildPolyline(
  points: HistoryPoint[],
  accessor: (p: HistoryPoint) => number,
  minVal: number,
  maxVal: number,
  width: number,
  height: number,
  padX: number,
  padY: number
): string {
  if (points.length === 0) return '';
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const span = Math.max(1e-6, maxVal - minVal);

  return points
    .map((p, idx) => {
      const x =
        points.length === 1
          ? padX + innerW / 2
          : padX + (idx / (points.length - 1)) * innerW;
      const clamped = Math.min(maxVal, Math.max(minVal, accessor(p)));
      const y = padY + innerH - ((clamped - minVal) / span) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function CrewRadarChart({ snapshot }: { snapshot: TelemetrySnapshot }) {
  const cx = 135;
  const cy = 104;
  const radius = 68;

  const o2Score = Math.max(0.1, Math.min(1, (snapshot.smoothed_spo2 - 78) / 22));
  const radScore = Math.max(0.1, Math.min(1, 1 - snapshot.radiation_flux / 20));
  const slopeScore = Math.max(0.1, Math.min(1, 1 - Math.max(0, snapshot.radiation_slope) / 4));
  const mentalScore = Math.max(0.1, Math.min(1, (100 - snapshot.mental_stress_index) / 100));
  const muscleScore = Math.max(0.1, Math.min(1, 1 - (snapshot.muscle_atrophy_risk - 1.0) / 0.6));

  const axes = [
    { label: 'SpO2', val: o2Score },
    { label: 'FLUX', val: radScore },
    { label: 'dΦ/dt', val: slopeScore },
    { label: 'MIND', val: mentalScore },
    { label: 'MUSCLE', val: muscleScore },
  ];

  const polygonPoints = (scaleFn: (idx: number) => number) =>
    axes
      .map((_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
        const r = radius * scaleFn(i);
        return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
      })
      .join(' ');

  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[#1a2333] pb-1.5">
        <h3 className="text-xs font-semibold text-[#f1f5f9]">
          Fig 3. Multi-System Readiness Radar
        </h3>
        <span className="text-[11px] font-mono text-[#64748b]">5-Axis Normalized</span>
      </div>

      <svg viewBox="0 0 270 208" className="w-full h-44" role="img" aria-label="Crew Multi-System Radar Chart">
        {[0.33, 0.66, 1].map((ring) => (
          <polygon
            key={ring}
            points={polygonPoints(() => ring)}
            fill="none"
            stroke="#1e293b"
            strokeWidth="1"
          />
        ))}
        {axes.map((ax, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / axes.length;
          const x2 = cx + radius * Math.cos(angle);
          const y2 = cy + radius * Math.sin(angle);
          const lx = cx + (radius + 20) * Math.cos(angle);
          const ly = cy + (radius + 16) * Math.sin(angle);
          return (
            <g key={ax.label}>
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#1e293b" strokeWidth="1" />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
                fontWeight="700"
                className="font-mono"
              >
                {ax.label}
              </text>
            </g>
          );
        })}

        <polygon
          points={polygonPoints((i) => axes[i].val)}
          fill="rgba(56, 189, 248, 0.18)"
          stroke="#38bdf8"
          strokeWidth="2"
        />
      </svg>

      <div className="text-[11px] font-mono text-[#64748b] flex justify-between">
        <span>Outer = Optimal</span>
        <span>Inner = Degraded</span>
      </div>
    </div>
  );
}

function GenomicExpressionChart({ baseline }: { baseline: number }) {
  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[#1a2333] pb-1.5">
        <h3 className="text-xs font-semibold text-[#f1f5f9]">
          Fig 4. OSD-195 RMA Gene Expression
        </h3>
        <span className="text-[11px] font-mono text-[#64748b]">Mean = {baseline.toFixed(2)}x</span>
      </div>

      <svg viewBox="0 0 280 176" className="w-full h-44" role="img" aria-label="OSD-195 Gene Expression Bar Chart">
        {[1.0, 1.25, 1.5].map((tick) => {
          const y = 140 - ((tick - 0.8) / 0.8) * 110;
          return (
            <g key={tick}>
              <line x1="36" y1={y} x2="266" y2={y} stroke={tick === 1.25 ? '#f59e0b' : '#1e293b'} strokeDasharray={tick === 1.25 ? '4 3' : undefined} />
              <text x="30" y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8" className="font-mono">
                {tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        {OSD195_GENES.map((g, i) => {
          const barW = 24;
          const x = 48 + i * 36;
          const h = ((g.value - 0.8) / 0.8) * 110;
          const y = 140 - h;
          return (
            <g key={g.symbol}>
              <rect x={x} y={y} width={barW} height={h} fill={g.value >= baseline ? '#38bdf8' : '#475569'} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="8" fill="#e2e8f0" className="font-mono">
                {g.value.toFixed(2)}
              </text>
              <text x={x + barW / 2} y="156" textAnchor="middle" fontSize="8.5" fill="#94a3b8" className="font-mono">
                {g.symbol}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="text-[11px] font-mono text-[#64748b] flex justify-between">
        <span className="text-[#38bdf8]">■ Above Cohort Mean</span>
        <span className="text-[#f59e0b]">--- Baseline {baseline.toFixed(2)}x</span>
      </div>
    </div>
  );
}

function MetabolicThermalChart({ history }: { history: HistoryPoint[] }) {
  const width = 460;
  const height = 152;
  const padX = 38;
  const padY = 16;
  const innerH = height - padY * 2;
  const latest = history[history.length - 1];

  const gluLowY = padY + innerH - ((70 - 40) / 180) * innerH;
  const gluHighY = padY + innerH - ((180 - 40) / 180) * innerH;

  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[#1a2333] pb-1.5">
        <h3 className="text-xs font-semibold text-[#f1f5f9]">
          Fig 5. Metabolic Glucose &amp; Core Temp
        </h3>
        {latest && (
          <span className="text-[11px] font-mono text-[#94a3b8]">
            {latest.blood_sugar_mg_dl} mg/dL · {latest.body_temp_c.toFixed(1)} °C
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-[#06080d] border border-[#1a2333]"
        role="img"
        aria-label="Blood Glucose and Core Temperature History"
      >
        {[70, 120, 180].map((val) => {
          const y = padY + innerH - ((val - 40) / 180) * innerH;
          return (
            <g key={val}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#172030" strokeWidth="1" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" className="font-mono">
                {val}
              </text>
            </g>
          );
        })}

        <line x1={padX} y1={gluLowY} x2={width - padX} y2={gluLowY} stroke="#f59e0b" strokeDasharray="4 3" />
        <line x1={padX} y1={gluHighY} x2={width - padX} y2={gluHighY} stroke="#ef4444" strokeDasharray="4 3" />

        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.1"
          points={buildPolyline(history, (p) => p.blood_sugar_mg_dl, 40, 220, width, height, padX, padY)}
        />

        <polyline
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.8"
          points={buildPolyline(
            history,
            (p) => 40 + ((p.body_temp_c - 34) / 7) * 180,
            40,
            220,
            width,
            height,
            padX,
            padY
          )}
        />
      </svg>

      <div className="flex items-center gap-4 text-[11px] font-mono text-[#64748b]">
        <span className="text-[#38bdf8]">— Glucose (mg/dL)</span>
        <span className="text-[#ef4444]">— Temp (°C scaled)</span>
        <span className="ml-auto">Range: 70–180</span>
      </div>
    </div>
  );
}

function MentalAndDoseChart({
  history,
  cumulativeDose,
}: {
  history: HistoryPoint[];
  cumulativeDose: number;
}) {
  const width = 460;
  const height = 152;
  const padX = 38;
  const padY = 16;
  const innerH = height - padY * 2;
  const latest = history[history.length - 1];
  const stressLimitY = padY + innerH - (55 / 100) * innerH;

  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[#1a2333] pb-1.5">
        <h3 className="text-xs font-semibold text-[#f1f5f9]">
          Fig 6. Behavioral Stress &amp; Dose Rate
        </h3>
        <span className="text-[11px] font-mono text-[#94a3b8]">
          {cumulativeDose.toFixed(2)} / 250 mSv
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-[#06080d] border border-[#1a2333]"
        role="img"
        aria-label="Mental Stress Load and Ambient Dose Rate Chart"
      >
        {[0, 50, 100].map((val) => {
          const y = padY + innerH - (val / 100) * innerH;
          return (
            <g key={val}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#172030" strokeWidth="1" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" className="font-mono">
                {val}
              </text>
            </g>
          );
        })}

        <line x1={padX} y1={stressLimitY} x2={width - padX} y2={stressLimitY} stroke="#f59e0b" strokeDasharray="4 3" />

        <polyline
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.1"
          points={buildPolyline(history, (p) => p.mental_stress_index, 0, 100, width, height, padX, padY)}
        />

        <polyline
          fill="none"
          stroke="#34d399"
          strokeWidth="1.8"
          points={buildPolyline(
            history,
            (p) => (p.ambient_dose / 3.0) * 100,
            0,
            100,
            width,
            height,
            padX,
            padY
          )}
        />
      </svg>

      <div className="flex items-center gap-4 text-[11px] font-mono text-[#64748b]">
        <span className="text-[#f59e0b]">— Stress (/100)</span>
        <span className="text-[#34d399]">— Dose (mSv/d)</span>
        {latest && <span className="ml-auto">Now: {latest.mental_stress_index.toFixed(1)}</span>}
      </div>
    </div>
  );
}

function BloodPressureMapChart({ history }: { history: HistoryPoint[] }) {
  const width = 460;
  const height = 152;
  const padX = 38;
  const padY = 16;
  const innerH = height - padY * 2;
  const latest = history[history.length - 1];
  const highBpY = padY + innerH - ((140 - 40) / 140) * innerH;
  const lowBpY = padY + innerH - ((90 - 40) / 140) * innerH;

  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2 lg:col-span-2">
      <div className="flex items-center justify-between border-b border-[#1a2333] pb-1.5">
        <h3 className="text-xs font-semibold text-[#f1f5f9]">
          Fig 7. Arterial Blood Pressure &amp; Mean Arterial Pressure (MAP)
        </h3>
        {latest && (
          <span className="text-[11px] font-mono text-[#94a3b8]">
            {latest.systolic_bp ?? 118}/{latest.diastolic_bp ?? 76} mmHg · MAP {(latest.map_mmhg ?? 90).toFixed(1)} mmHg
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-[#06080d] border border-[#1a2333]"
        role="img"
        aria-label="Arterial Systolic, Diastolic, and Mean Arterial Pressure Chart"
      >
        {[60, 90, 120, 140, 160].map((val) => {
          const y = padY + innerH - ((val - 40) / 140) * innerH;
          return (
            <g key={val}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#172030" strokeWidth="1" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" className="font-mono">
                {val}
              </text>
            </g>
          );
        })}

        <line x1={padX} y1={highBpY} x2={width - padX} y2={highBpY} stroke="#ef4444" strokeDasharray="4 3" />
        <line x1={padX} y1={lowBpY} x2={width - padX} y2={lowBpY} stroke="#f59e0b" strokeDasharray="4 3" />

        <polyline
          fill="none"
          stroke="#ef4444"
          strokeWidth="2.0"
          points={buildPolyline(history, (p) => p.systolic_bp ?? 118, 40, 180, width, height, padX, padY)}
        />
        <polyline
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.0"
          points={buildPolyline(history, (p) => p.map_mmhg ?? 90, 40, 180, width, height, padX, padY)}
        />
        <polyline
          fill="none"
          stroke="#34d399"
          strokeWidth="1.8"
          points={buildPolyline(history, (p) => p.diastolic_bp ?? 76, 40, 180, width, height, padX, padY)}
        />
      </svg>

      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-[#64748b]">
        <span className="text-[#ef4444]">— Systolic BP</span>
        <span className="text-[#38bdf8]">— MAP (DBP + ⅓·PP)</span>
        <span className="text-[#34d399]">— Diastolic BP</span>
        <span className="ml-auto">Limits: Sys &gt;= 140 or &lt; 90</span>
      </div>
    </div>
  );
}

export function TelemetryCharts({ snapshot }: TelemetryChartsProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const history = snapshot.history;

  const width = 460;
  const height = 160;
  const padX = 38;
  const padY = 16;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const activePoint =
    hoverIdx !== null && history[hoverIdx]
      ? history[hoverIdx]
      : history[history.length - 1];

  const handleMouseMove = (evt: React.MouseEvent<SVGSVGElement>) => {
    if (history.length === 0) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const relX = ((evt.clientX - rect.left) / rect.width) * width;
    const norm = Math.max(0, Math.min(1, (relX - padX) / innerW));
    const idx = Math.round(norm * (history.length - 1));
    setHoverIdx(idx);
  };

  const spo2Min = 78;
  const spo2Max = 102;
  const spo2ThresholdY =
    padY + innerH - ((90 - spo2Min) / (spo2Max - spo2Min)) * innerH;

  const fluxMax = Math.max(
    6,
    ...history.map((h) => Math.max(h.proton_flux, Math.abs(h.radiation_slope) * 2))
  );
  const slopeThresholdY =
    padY + innerH - (Math.min(fluxMax, 3.0) / fluxMax) * innerH;

  const crosshairX =
    hoverIdx !== null && history.length > 1
      ? padX + (hoverIdx / (history.length - 1)) * innerW
      : null;

  const recentRows = [...history].slice(-8).reverse();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="sx-cell p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 border-b border-[#1a2333] pb-1.5">
            <h3 className="text-xs font-semibold text-[#f1f5f9]">
              Fig 1. Physiological EMA (SpO2 &amp; HR)
            </h3>
            {activePoint && (
              <span className="text-[11px] font-mono text-[#94a3b8]">
                T+{activePoint.timestamp.toFixed(0)}s · {activePoint.ema_spo2.toFixed(1)}% · {activePoint.ema_hr.toFixed(0)} bpm
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-36 cursor-crosshair overflow-visible bg-[#06080d] border border-[#1a2333]"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            role="img"
            aria-label="Physiological EMA SpO2 and Heart Rate Time-Series"
          >
            {[80, 90, 100].map((val) => {
              const y = padY + innerH - ((val - spo2Min) / (spo2Max - spo2Min)) * innerH;
              return (
                <g key={val}>
                  <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#172030" strokeWidth="1" />
                  <text x={padX - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" className="font-mono">
                    {val}%
                  </text>
                </g>
              );
            })}

            <line
              x1={padX}
              y1={spo2ThresholdY}
              x2={width - padX}
              y2={spo2ThresholdY}
              stroke="#ef4444"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            <polyline
              fill="none"
              stroke="#64748b"
              strokeWidth="1.3"
              strokeDasharray="3 3"
              points={buildPolyline(history, (p) => p.raw_spo2, spo2Min, spo2Max, width, height, padX, padY)}
            />

            <polyline
              fill="none"
              stroke="#34d399"
              strokeWidth="2.2"
              points={buildPolyline(history, (p) => p.ema_spo2, spo2Min, spo2Max, width, height, padX, padY)}
            />

            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.6"
              points={buildPolyline(
                history,
                (p) => 78 + ((p.ema_hr - 55) / 85) * 24,
                spo2Min,
                spo2Max,
                width,
                height,
                padX,
                padY
              )}
            />

            {crosshairX !== null && (
              <line
                x1={crosshairX}
                y1={padY}
                x2={crosshairX}
                y2={height - padY}
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>

          <div className="flex items-center gap-4 text-[11px] font-mono text-[#64748b]">
            <span className="text-[#34d399]">— EMA SpO2</span>
            <span className="text-[#94a3b8]">--- Raw SpO2</span>
            <span className="text-[#f59e0b]">— EMA HR</span>
            <span className="text-[#ef4444] ml-auto">Hypoxia &lt;90%</span>
          </div>
        </div>

        <div className="sx-cell p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 border-b border-[#1a2333] pb-1.5">
            <h3 className="text-xs font-semibold text-[#f1f5f9]">
              Fig 2. Solar Proton Flux &amp; dΦ/dt Slope
            </h3>
            {activePoint && (
              <span className="text-[11px] font-mono text-[#94a3b8]">
                {activePoint.proton_flux.toFixed(2)} pfu · {activePoint.radiation_slope.toFixed(2)} pfu/s
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-36 cursor-crosshair overflow-visible bg-[#06080d] border border-[#1a2333]"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            role="img"
            aria-label="Space Weather Proton Flux and Slope Time-Series"
          >
            {[0, fluxMax / 2, fluxMax].map((val, i) => {
              const y = padY + innerH - (val / fluxMax) * innerH;
              return (
                <g key={i}>
                  <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#172030" strokeWidth="1" />
                  <text x={padX - 6} y={y + 3} textAnchor="end" fill="#64748b" fontSize="9" className="font-mono">
                    {val.toFixed(0)}
                  </text>
                </g>
              );
            })}

            <line
              x1={padX}
              y1={slopeThresholdY}
              x2={width - padX}
              y2={slopeThresholdY}
              stroke="#f59e0b"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.2"
              points={buildPolyline(history, (p) => p.proton_flux, 0, fluxMax, width, height, padX, padY)}
            />

            <polyline
              fill="none"
              stroke="#f59e0b"
              strokeWidth="1.8"
              points={buildPolyline(
                history,
                (p) => Math.max(0, p.radiation_slope * 2),
                0,
                fluxMax,
                width,
                height,
                padX,
                padY
              )}
            />

            {crosshairX !== null && (
              <line
                x1={crosshairX}
                y1={padY}
                x2={crosshairX}
                y2={height - padY}
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>

          <div className="flex items-center gap-4 text-[11px] font-mono text-[#64748b]">
            <span className="text-[#38bdf8]">— Proton Flux (P01)</span>
            <span className="text-[#f59e0b]">— 5-Pt Slope (×2)</span>
            <span className="text-[#f59e0b] ml-auto">SPE &gt; 1.5 pfu/s</span>
          </div>
        </div>

        <CrewRadarChart snapshot={snapshot} />
        <GenomicExpressionChart baseline={snapshot.genetic_atrophy_baseline} />
        <MetabolicThermalChart history={history} />
        <MentalAndDoseChart history={history} cumulativeDose={snapshot.cumulative_dose_msv} />
        <BloodPressureMapChart history={history} />
      </div>

      {/* Flight Telemetry Sample Log Table */}
      <div className="sx-cell overflow-hidden">
        <div className="px-3.5 py-2 bg-[#101621] border-b border-[#1d2636] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#f1f5f9]">
            Synchronized Telemetry Sample Log (Latest 8 Frames)
          </h3>
          <span className="text-[11px] font-mono text-[#64748b]">
            MIMIC-III · GOES/CRaTER · OSD-195
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-[#0b1018] border-b border-[#1d2636] text-[#94a3b8]">
                <th className="py-2 px-3">MET (s)</th>
                <th className="py-2 px-3">EMA SpO2</th>
                <th className="py-2 px-3">EMA HR</th>
                <th className="py-2 px-3">BP (mmHg)</th>
                <th className="py-2 px-3">Flux (pfu)</th>
                <th className="py-2 px-3">Slope (pfu/s)</th>
                <th className="py-2 px-3">Glucose</th>
                <th className="py-2 px-3">Temp</th>
                <th className="py-2 px-3">Stress</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row) => (
                <tr key={row.tick} className="border-b border-[#141c28] hover:bg-[#111824]">
                  <td className="py-1.5 px-3 text-[#f8fafc]">T+{row.timestamp.toFixed(0)}</td>
                  <td className={`py-1.5 px-3 font-semibold ${row.ema_spo2 < 90 ? 'text-[#ef4444]' : 'text-[#34d399]'}`}>
                    {row.ema_spo2.toFixed(1)}%
                  </td>
                  <td className="py-1.5 px-3 text-[#e2e8f0]">{row.ema_hr.toFixed(1)}</td>
                  <td className="py-1.5 px-3 text-[#94a3b8]">
                    {row.systolic_bp ?? 118}/{row.diastolic_bp ?? 76}
                  </td>
                  <td className="py-1.5 px-3 text-[#38bdf8]">{row.proton_flux.toFixed(2)}</td>
                  <td className={`py-1.5 px-3 ${row.radiation_slope > 1.5 ? 'text-[#f59e0b] font-semibold' : 'text-[#94a3b8]'}`}>
                    {row.radiation_slope.toFixed(3)}
                  </td>
                  <td className="py-1.5 px-3 text-[#94a3b8]">{row.blood_sugar_mg_dl}</td>
                  <td className="py-1.5 px-3 text-[#94a3b8]">{row.body_temp_c.toFixed(1)}°C</td>
                  <td className="py-1.5 px-3 text-[#94a3b8]">{row.mental_stress_index.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
