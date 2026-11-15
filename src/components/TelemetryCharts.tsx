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
  const muscleScore = Math.max(0.1, Math.min(1, 1 - (snapshot.muscle_atrophy_risk - 1.0) / 2.2));

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
      <div className="flex items-center justify-between border-b border-[#b6c6d8] pb-1.5">
        <h3 className="text-xs font-bold text-[#0f2942]">
          Fig 3. Multi-System Readiness Radar
        </h3>
        <span className="text-[11px] font-mono text-[#475569]">5-Axis Normalized</span>
      </div>

      <svg viewBox="0 0 270 208" className="w-full h-44 bg-white border border-[#b6c6d8]" role="img" aria-label="Crew Multi-System Radar Chart">
        {[0.33, 0.66, 1].map((ring) => (
          <polygon
            key={ring}
            points={polygonPoints(() => ring)}
            fill="none"
            stroke="#cbd5e1"
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
              <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="#cbd5e1" strokeWidth="1" />
              <text
                x={lx}
                y={ly + 3}
                textAnchor="middle"
                fill="#0f2942"
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
          fill="rgba(11, 61, 145, 0.2)"
          stroke="#0b3d91"
          strokeWidth="2"
        />
      </svg>

      <div className="text-[11px] font-mono text-[#475569] flex justify-between">
        <span>Outer = Optimal</span>
        <span>Inner = Degraded</span>
      </div>
    </div>
  );
}

function GenomicExpressionChart({ baseline }: { baseline: number }) {
  const scaleFactor = baseline > 0 ? baseline / 1.25 : 1.0;
  const scaledGenes = OSD195_GENES.map((g) => ({
    symbol: g.symbol,
    value: Number((g.value * scaleFactor).toFixed(2)),
  }));
  const yMin = 0.8;
  const yMax = Math.max(1.6, Number((Math.max(baseline, ...scaledGenes.map((g) => g.value)) * 1.12).toFixed(2)));
  const ySpan = Math.max(0.4, yMax - yMin);
  const midTick = Number((yMin + ySpan * 0.5).toFixed(2));
  const baselineY = 140 - ((Math.min(yMax, Math.max(yMin, baseline)) - yMin) / ySpan) * 110;

  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[#b6c6d8] pb-1.5">
        <h3 className="text-xs font-bold text-[#0f2942]">
          Fig 4. OSD-195 RMA Gene Expression
        </h3>
        <span className="text-[11px] font-mono text-[#475569]">Mean = {baseline.toFixed(2)}x</span>
      </div>

      <svg viewBox="0 0 280 176" className="w-full h-44 bg-white border border-[#b6c6d8]" role="img" aria-label="OSD-195 Gene Expression Bar Chart">
        {[yMin, midTick, yMax].map((tick) => {
          const y = 140 - ((tick - yMin) / ySpan) * 110;
          return (
            <g key={tick}>
              <line x1="36" y1={y} x2="266" y2={y} stroke="#e2e8f0" />
              <text x="30" y={y + 3} textAnchor="end" fontSize="9" fill="#475569" className="font-mono">
                {tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        <line
          x1="36"
          y1={baselineY}
          x2="266"
          y2={baselineY}
          stroke="#fc3d21"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {scaledGenes.map((g, i) => {
          const barW = 24;
          const x = 48 + i * 36;
          const clampedVal = Math.min(yMax, Math.max(yMin, g.value));
          const h = ((clampedVal - yMin) / ySpan) * 110;
          const y = 140 - h;
          return (
            <g key={g.symbol}>
              <rect x={x} y={y} width={barW} height={h} fill={g.value >= baseline ? '#0b3d91' : '#64748b'} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="8" fill="#0f172a" className="font-mono font-bold">
                {g.value.toFixed(2)}
              </text>
              <text x={x + barW / 2} y="156" textAnchor="middle" fontSize="8.5" fill="#334155" className="font-mono">
                {g.symbol}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="text-[11px] font-mono text-[#475569] flex justify-between">
        <span className="text-[#0b3d91] font-semibold">■ Above Cohort Mean</span>
        <span className="text-[#fc3d21] font-semibold">--- Baseline {baseline.toFixed(2)}x</span>
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

  const gluMin = 30;
  const gluMax = Math.max(220, ...history.map((h) => h.blood_sugar_mg_dl + 20));
  const gluSpan = Math.max(100, gluMax - gluMin);

  const gluLowY = padY + innerH - ((70 - gluMin) / gluSpan) * innerH;
  const gluHighY = padY + innerH - ((180 - gluMin) / gluSpan) * innerH;
  const midTick = Math.round(gluMin + gluSpan * 0.5);

  return (
    <div className="sx-cell p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between border-b border-[#b6c6d8] pb-1.5">
        <h3 className="text-xs font-bold text-[#0f2942]">
          Fig 5. Metabolic Glucose &amp; Core Temp
        </h3>
        {latest && (
          <span className="text-[11px] font-mono text-[#334155] font-semibold">
            {latest.blood_sugar_mg_dl} mg/dL · {latest.body_temp_c.toFixed(1)} °C
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-white border border-[#b6c6d8]"
        role="img"
        aria-label="Blood Glucose and Core Temperature History"
      >
        {[70, midTick, Math.round(gluMax)].map((val) => {
          const y = padY + innerH - ((val - gluMin) / gluSpan) * innerH;
          return (
            <g key={val}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" className="font-mono">
                {val}
              </text>
            </g>
          );
        })}

        <line x1={padX} y1={gluLowY} x2={width - padX} y2={gluLowY} stroke="#d97706" strokeDasharray="4 3" />
        <line x1={padX} y1={gluHighY} x2={width - padX} y2={gluHighY} stroke="#fc3d21" strokeDasharray="4 3" />

        <polyline
          fill="none"
          stroke="#0b3d91"
          strokeWidth="2.1"
          points={buildPolyline(history, (p) => p.blood_sugar_mg_dl, gluMin, gluMax, width, height, padX, padY)}
        />

        <polyline
          fill="none"
          stroke="#fc3d21"
          strokeWidth="1.8"
          points={buildPolyline(
            history,
            (p) => gluMin + ((p.body_temp_c - 34) / 7) * gluSpan,
            gluMin,
            gluMax,
            width,
            height,
            padX,
            padY
          )}
        />
      </svg>

      <div className="flex items-center gap-4 text-[11px] font-mono text-[#475569]">
        <span className="text-[#0b3d91] font-semibold">— Glucose (mg/dL)</span>
        <span className="text-[#fc3d21] font-semibold">— Temp (°C scaled)</span>
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
      <div className="flex items-center justify-between border-b border-[#b6c6d8] pb-1.5">
        <h3 className="text-xs font-bold text-[#0f2942]">
          Fig 6. Behavioral Stress &amp; Dose Rate
        </h3>
        <span className="text-[11px] font-mono text-[#334155] font-semibold">
          {cumulativeDose.toFixed(2)} / 250 mSv
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-white border border-[#b6c6d8]"
        role="img"
        aria-label="Mental Stress Load and Ambient Dose Rate Chart"
      >
        {[0, 50, 100].map((val) => {
          const y = padY + innerH - (val / 100) * innerH;
          return (
            <g key={val}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" className="font-mono">
                {val}
              </text>
            </g>
          );
        })}

        <line x1={padX} y1={stressLimitY} x2={width - padX} y2={stressLimitY} stroke="#d97706" strokeDasharray="4 3" />

        <polyline
          fill="none"
          stroke="#d97706"
          strokeWidth="2.1"
          points={buildPolyline(history, (p) => p.mental_stress_index, 0, 100, width, height, padX, padY)}
        />

        <polyline
          fill="none"
          stroke="#15803d"
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

      <div className="flex items-center gap-4 text-[11px] font-mono text-[#475569]">
        <span className="text-[#b45309] font-semibold">— Stress (/100)</span>
        <span className="text-[#15803d] font-semibold">— Dose (mSv/d)</span>
        {latest && <span className="ml-auto font-semibold">Now: {latest.mental_stress_index.toFixed(1)}</span>}
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
      <div className="flex items-center justify-between border-b border-[#b6c6d8] pb-1.5">
        <h3 className="text-xs font-bold text-[#0f2942]">
          Fig 7. Arterial Blood Pressure &amp; Mean Arterial Pressure (MAP)
        </h3>
        {latest && (
          <span className="text-[11px] font-mono text-[#334155] font-semibold">
            {latest.systolic_bp ?? 118}/{latest.diastolic_bp ?? 76} mmHg · MAP {(latest.map_mmhg ?? 90).toFixed(1)} mmHg
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-36 bg-white border border-[#b6c6d8]"
        role="img"
        aria-label="Arterial Systolic, Diastolic, and Mean Arterial Pressure Chart"
      >
        {[60, 90, 120, 140, 160].map((val) => {
          const y = padY + innerH - ((val - 40) / 140) * innerH;
          return (
            <g key={val}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padX - 6} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" className="font-mono">
                {val}
              </text>
            </g>
          );
        })}

        <line x1={padX} y1={highBpY} x2={width - padX} y2={highBpY} stroke="#fc3d21" strokeDasharray="4 3" />
        <line x1={padX} y1={lowBpY} x2={width - padX} y2={lowBpY} stroke="#d97706" strokeDasharray="4 3" />

        <polyline
          fill="none"
          stroke="#fc3d21"
          strokeWidth="2.0"
          points={buildPolyline(history, (p) => p.systolic_bp ?? 118, 40, 180, width, height, padX, padY)}
        />
        <polyline
          fill="none"
          stroke="#0b3d91"
          strokeWidth="2.0"
          points={buildPolyline(history, (p) => p.map_mmhg ?? 90, 40, 180, width, height, padX, padY)}
        />
        <polyline
          fill="none"
          stroke="#15803d"
          strokeWidth="1.8"
          points={buildPolyline(history, (p) => p.diastolic_bp ?? 76, 40, 180, width, height, padX, padY)}
        />
      </svg>

      <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-[#475569]">
        <span className="text-[#dc2626] font-semibold">— Systolic BP</span>
        <span className="text-[#0b3d91] font-semibold">— MAP (DBP + ⅓·PP)</span>
        <span className="text-[#15803d] font-semibold">— Diastolic BP</span>
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
          <div className="flex items-center justify-between gap-2 border-b border-[#b6c6d8] pb-1.5">
            <h3 className="text-xs font-bold text-[#0f2942]">
              Fig 1. Physiological EMA (SpO2 &amp; HR)
            </h3>
            {activePoint && (
              <span className="text-[11px] font-mono text-[#334155] font-semibold">
                T+{activePoint.timestamp.toFixed(0)}s · {activePoint.ema_spo2.toFixed(1)}% · {activePoint.ema_hr.toFixed(0)} bpm
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-36 cursor-crosshair overflow-visible bg-white border border-[#b6c6d8]"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            role="img"
            aria-label="Physiological EMA SpO2 and Heart Rate Time-Series"
          >
            {[80, 90, 100].map((val) => {
              const y = padY + innerH - ((val - spo2Min) / (spo2Max - spo2Min)) * innerH;
              return (
                <g key={val}>
                  <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={padX - 6} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" className="font-mono">
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
              stroke="#fc3d21"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            <polyline
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.3"
              strokeDasharray="3 3"
              points={buildPolyline(history, (p) => p.raw_spo2, spo2Min, spo2Max, width, height, padX, padY)}
            />

            <polyline
              fill="none"
              stroke="#15803d"
              strokeWidth="2.2"
              points={buildPolyline(history, (p) => p.ema_spo2, spo2Min, spo2Max, width, height, padX, padY)}
            />

            <polyline
              fill="none"
              stroke="#d97706"
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
                stroke="#0b3d91"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>

          <div className="flex items-center gap-4 text-[11px] font-mono text-[#475569]">
            <span className="text-[#15803d] font-semibold">— EMA SpO2</span>
            <span className="text-[#64748b]">--- Raw SpO2</span>
            <span className="text-[#b45309] font-semibold">— EMA HR</span>
            <span className="text-[#dc2626] font-semibold ml-auto">Hypoxia &lt;90%</span>
          </div>
        </div>

        <div className="sx-cell p-3.5 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 border-b border-[#b6c6d8] pb-1.5">
            <h3 className="text-xs font-bold text-[#0f2942]">
              Fig 2. Solar Proton Flux &amp; dΦ/dt Slope
            </h3>
            {activePoint && (
              <span className="text-[11px] font-mono text-[#334155] font-semibold">
                {activePoint.proton_flux.toFixed(2)} pfu · {activePoint.radiation_slope.toFixed(2)} pfu/s
              </span>
            )}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-36 cursor-crosshair overflow-visible bg-white border border-[#b6c6d8]"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
            role="img"
            aria-label="Space Weather Proton Flux and Slope Time-Series"
          >
            {[0, fluxMax / 2, fluxMax].map((val, i) => {
              const y = padY + innerH - (val / fluxMax) * innerH;
              return (
                <g key={i}>
                  <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                  <text x={padX - 6} y={y + 3} textAnchor="end" fill="#475569" fontSize="9" className="font-mono">
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
              stroke="#fc3d21"
              strokeWidth="1.2"
              strokeDasharray="4 3"
            />

            <polyline
              fill="none"
              stroke="#0b3d91"
              strokeWidth="2.2"
              points={buildPolyline(history, (p) => p.proton_flux, 0, fluxMax, width, height, padX, padY)}
            />

            <polyline
              fill="none"
              stroke="#d97706"
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
                stroke="#0b3d91"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>

          <div className="flex items-center gap-4 text-[11px] font-mono text-[#475569]">
            <span className="text-[#0b3d91] font-semibold">— Proton Flux (P01)</span>
            <span className="text-[#b45309] font-semibold">— 5-Pt Slope (×2)</span>
            <span className="text-[#dc2626] font-semibold ml-auto">SPE &gt; 1.5 pfu/s</span>
          </div>
        </div>

        <CrewRadarChart snapshot={snapshot} />
        <GenomicExpressionChart baseline={snapshot.genetic_atrophy_baseline} />
        <MetabolicThermalChart history={history} />
        <MentalAndDoseChart history={history} cumulativeDose={snapshot.cumulative_dose_msv} />
        <BloodPressureMapChart history={history} />
      </div>

      {/* Live MIMIC-III ICU Lab Biomarkers Strip (when present in dataset) */}
      {snapshot.live_labs && snapshot.live_labs.lactate !== null && (
        <div className="sx-cell p-3.5">
          <div className="flex items-center justify-between border-b border-[#b6c6d8] pb-1.5 mb-2.5">
            <h3 className="text-xs font-bold text-[#0f2942]">
              Synchronized Blood Gas &amp; ICU Biomarker Panel (MIMIC-III Feed)
            </h3>
            <span className="text-[11px] font-mono text-[#0b3d91] font-semibold">
              Severinghaus SpO2 · Autonomic HR Model
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 font-mono text-[11px]">
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">Lactate</div>
              <div className="text-[#0f172a] font-bold">{snapshot.live_labs.lactate?.toFixed(1) ?? '--'} mmol/L</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">Arterial pO2</div>
              <div className="text-[#15803d] font-bold">{snapshot.live_labs.po2?.toFixed(0) ?? '--'} mmHg</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">Arterial pCO2</div>
              <div className="text-[#0f172a] font-bold">{snapshot.live_labs.pco2?.toFixed(0) ?? '--'} mmHg</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">Arterial pH</div>
              <div className="text-[#0f172a] font-bold">{snapshot.live_labs.ph?.toFixed(2) ?? '--'}</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">Cortisol</div>
              <div className="text-[#b45309] font-bold">{snapshot.live_labs.cortisol?.toFixed(1) ?? '--'} ug/dL</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">CRP</div>
              <div className="text-[#0f172a] font-bold">{snapshot.live_labs.crp?.toFixed(1) ?? '--'} mg/L</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">Hemoglobin</div>
              <div className="text-[#0f172a] font-bold">{snapshot.live_labs.hemoglobin?.toFixed(1) ?? '--'} g/dL</div>
            </div>
            <div className="p-2 bg-white border border-[#b6c6d8]">
              <div className="text-[#475569]">WBC</div>
              <div className="text-[#0b3d91] font-bold">{snapshot.live_labs.wbc?.toFixed(1) ?? '--'} K/uL</div>
            </div>
          </div>
        </div>
      )}

      {/* Flight Telemetry Sample Log Table */}
      <div className="sx-cell overflow-hidden">
        <div className="px-3.5 py-2 bg-[#0b3d91] border-b-2 border-[#fc3d21] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">
            Synchronized Telemetry Sample Log (Latest 8 Frames)
          </h3>
          <span className="text-[11px] font-mono text-[#dbeafe]">
            MIMIC-III · GOES/CRaTER · OSD-195
          </span>
        </div>
        <div className="overflow-x-auto bg-white">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-[#dce5f0] border-b border-[#9cb0c9] text-[#0f2942]">
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
                <tr key={row.tick} className="border-b border-[#cbd5e1] hover:bg-[#eff6ff]">
                  <td className="py-1.5 px-3 text-[#0f172a] font-semibold">T+{row.timestamp.toFixed(0)}</td>
                  <td className={`py-1.5 px-3 font-bold ${row.ema_spo2 < 90 ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>
                    {row.ema_spo2.toFixed(1)}%
                  </td>
                  <td className="py-1.5 px-3 text-[#0f172a]">{row.ema_hr.toFixed(1)}</td>
                  <td className="py-1.5 px-3 text-[#475569]">
                    {row.systolic_bp ?? 118}/{row.diastolic_bp ?? 76}
                  </td>
                  <td className="py-1.5 px-3 text-[#0b3d91] font-semibold">{row.proton_flux.toFixed(2)}</td>
                  <td className={`py-1.5 px-3 ${row.radiation_slope > 1.5 ? 'text-[#b45309] font-bold' : 'text-[#475569]'}`}>
                    {row.radiation_slope.toFixed(3)}
                  </td>
                  <td className="py-1.5 px-3 text-[#334155]">{row.blood_sugar_mg_dl}</td>
                  <td className="py-1.5 px-3 text-[#334155]">{row.body_temp_c.toFixed(1)}°C</td>
                  <td className="py-1.5 px-3 text-[#334155]">{row.mental_stress_index.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
