import { useEffect, useState } from 'react';
import { Calculator, Cpu, RefreshCw } from 'lucide-react';
import type { AlgorithmExplanation, TelemetrySnapshot } from '../types';

interface AlgorithmsPageProps {
  snapshot: TelemetrySnapshot;
}

export function AlgorithmsPage({ snapshot }: AlgorithmsPageProps) {
  const [trace, setTrace] = useState<AlgorithmExplanation | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchTrace = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/algorithms/explain');
      if (res.ok) {
        const data = (await res.json()) as AlgorithmExplanation;
        setTrace(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTrace();
  }, [snapshot.timestamp, snapshot.self_assessment.systolic_bp, snapshot.mental_stress_index]);

  const emaSpo2Calc = trace
    ? `${trace.ema.alpha} × ${trace.ema.spo2_raw.toFixed(1)} + ${(1 - trace.ema.alpha).toFixed(2)} × ${trace.ema.spo2_prev_ema.toFixed(2)} = ${trace.ema.spo2_ema.toFixed(2)}%`
    : 'Loading Python trace...';

  const emaHrCalc = trace
    ? `${trace.ema.alpha} × ${trace.ema.hr_raw.toFixed(1)} + ${(1 - trace.ema.alpha).toFixed(2)} × ${trace.ema.hr_prev_ema.toFixed(1)} = ${trace.ema.hr_ema.toFixed(1)} bpm`
    : 'Loading Python trace...';

  return (
    <div className="flex flex-col gap-4">
      {/* Header Summary Banner */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h1 className="text-xs font-semibold tracking-wide text-[#f8fafc] flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#38bdf8]" />
            <span>Python Autonomous Clinical &amp; Signal Processing Algorithms</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-[#94a3b8]">
              Python {trace?.python_runtime ?? '3.10'} · Live Trace @ MET T+{snapshot.timestamp.toFixed(0)}s
            </span>
            <button
              type="button"
              onClick={() => void fetchTrace()}
              disabled={loading}
              className="sx-btn px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-[#38bdf8]" />
              <span>Refresh Trace</span>
            </button>
          </div>
        </div>

        <div className="p-4 text-xs text-[#cbd5e1] leading-relaxed">
          All sensor denoising, solar particle storm prediction, genomic atrophy weighting, mental stress decomposition, and clinical acuity scoring execute inside the autonomous onboard Python telemetry engine. Every calculation below shows the exact formula alongside the live numerical substitution from your current mission state.
        </div>
      </div>

      {/* 2x2 Grid of Core Mathematical Engines */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Algorithm 1: Physiological EMA */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc]">
              1. Physiological EMA Noise Filter (α = 0.30)
            </h2>
            <span className="text-[11px] font-mono text-[#38bdf8]">O(1) Memory</span>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="sx-cell p-3 font-mono bg-[#06080d]">
              <div className="text-[#38bdf8] font-semibold">Recurrence Equation:</div>
              <div className="mt-1 text-sm text-[#f8fafc]">
                S<sub>t</sub> = α · X<sub>t</sub> + (1 − α) · S<sub>t−1</sub> &nbsp; where α = 0.30
              </div>
            </div>
            <p className="text-[#cbd5e1] leading-relaxed">
              <strong className="text-[#f1f5f9]">Why it is needed in spaceflight:</strong> Motion artifacts during EVA or resistive exercise cause momentary single-sample pulse-oximeter drops. An Exponential Moving Average with smoothing factor α = 0.30 gives 30% weight to the newest sample and 70% to prior steady-state history—suppressing single-frame glitches while still catching true cabin O<sub>2</sub> hypoxia within 3–4 seconds.
            </p>
            <div className="sx-cell p-3 font-mono text-[11px] flex flex-col gap-1.5">
              <div className="font-semibold text-[#38bdf8]">Live Python Calculation (Current Frame):</div>
              <div className="text-[#e2e8f0]">SpO<sub>2</sub> Filter: {emaSpo2Calc}</div>
              <div className="text-[#e2e8f0]">HR Filter:&nbsp;&nbsp; {emaHrCalc}</div>
              <div className="text-[#ef4444] font-semibold">
                Trigger Rule: EMA SpO<sub>2</sub> &lt; 90.0% → CRITICAL Hypoxia Checklist
              </div>
            </div>
          </div>
        </div>

        {/* Algorithm 2: Space Weather 5-Sample OLS Slope */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc]">
              2. Space Weather 5-Sample OLS Flux Slope (dΦ/dt)
            </h2>
            <span className="text-[11px] font-mono text-[#f59e0b]">Solar Flare Predictor</span>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="sx-cell p-3 font-mono bg-[#06080d]">
              <div className="text-[#38bdf8] font-semibold">Ordinary Least Squares Regression:</div>
              <div className="mt-1 text-xs text-[#f8fafc]">
                dΦ/dt = Σ[(t<sub>i</sub> − t̄)(Φ<sub>i</sub> − Φ̄)] / Σ[(t<sub>i</sub> − t̄)²]
              </div>
            </div>
            <p className="text-[#cbd5e1] leading-relaxed">
              <strong className="text-[#f1f5f9]">Why it is needed in spaceflight:</strong> Waiting for total radiation flux to reach lethal saturation leaves zero time to abort an EVA. Fitting linear slope dΦ/dt across the rolling 5-sample deque detects the steep rising front of a Solar Particle Event minutes before peak dose hits, scaled by habitat shielding factor ({trace?.ols_radiation_slope.shielding_factor ?? 1.0}x).
            </p>

            {trace && (
              <div className="sx-cell p-3 font-mono text-[11px] flex flex-col gap-2">
                <div className="font-semibold text-[#38bdf8]">Live 5-Point Rolling Buffer (Python Deque):</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#1d2636] text-[#94a3b8]">
                        <th className="py-1 pr-2">Sample</th>
                        <th className="py-1 pr-2">t (s)</th>
                        <th className="py-1">Flux Φ (pfu)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trace.ols_radiation_slope.window_points.map((pt, idx) => (
                        <tr key={idx} className="border-b border-[#141c28] text-[#e2e8f0]">
                          <td className="py-0.5 pr-2 text-[#94a3b8]">#{idx + 1}</td>
                          <td className="py-0.5 pr-2">{pt.timestamp.toFixed(1)}</td>
                          <td className="py-0.5">{pt.proton_flux.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[#cbd5e1]">
                  Slope = {trace.ols_radiation_slope.numerator} / {trace.ols_radiation_slope.denominator} ={' '}
                  <strong className={trace.ols_radiation_slope.slope_pfu_s > 1.5 ? 'text-[#f59e0b]' : 'text-[#34d399]'}>
                    {trace.ols_radiation_slope.slope_pfu_s.toFixed(4)} pfu/s
                  </strong>{' '}
                  (Threshold &gt; 1.500 pfu/s · {trace.ols_radiation_slope.days_to_30d_bfo_limit} days to 250 mSv BFO limit)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Algorithm 3: OSD-195 Genomic Muscle Atrophy & Mental Stress */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc]">
              3. OSD-195 Genomic Atrophy &amp; Mental Stress Models
            </h2>
            <span className="text-[11px] font-mono text-[#94a3b8]">Biomarkers</span>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="sx-cell p-3 font-mono text-[11px] bg-[#06080d] flex flex-col gap-1">
              <div className="text-[#38bdf8] font-semibold">Genomic Muscle Atrophy Equation:</div>
              <div className="text-[#cbd5e1]">
                Risk = OSD195_Mean × (1 + g_penalty + hypoxia_penalty + cortisol_penalty)
              </div>
              {trace && (
                <div className="text-[#f8fafc] mt-1">
                  = {trace.genomic_atrophy.baseline.toFixed(2)} × (1 + {trace.genomic_atrophy.gravity_penalty} +{' '}
                  {trace.genomic_atrophy.hypoxia_penalty} + {trace.genomic_atrophy.stress_penalty}) ={' '}
                  <strong className="text-[#38bdf8]">{trace.genomic_atrophy.computed_risk.toFixed(3)}x</strong>
                </div>
              )}
            </div>

            <div className="sx-cell p-3 font-mono text-[11px] bg-[#06080d] flex flex-col gap-1">
              <div className="text-[#38bdf8] font-semibold">Behavioral &amp; Autonomic Stress Index (4–100):</div>
              <div className="text-[#cbd5e1]">
                Stress = clamp(4, 100, (HR − 65)×1.25 + dΦ/dt×6.5 + (7 − Sleep)×7.5 + (4 − Mood)×9 + Flags)
              </div>
              {trace && (
                <div className="text-[#f8fafc] mt-1">
                  = {trace.mental_stress.autonomic_load} (HR) + {trace.mental_stress.radiation_anxiety} (SPE) +{' '}
                  {trace.mental_stress.sleep_deficit} (Sleep) + {trace.mental_stress.mood_strain} (Mood) +{' '}
                  {trace.mental_stress.flag_penalty} (Flags) ={' '}
                  <strong className="text-[#38bdf8]">{trace.mental_stress.score} / 100</strong>
                </div>
              )}
            </div>

            <p className="text-[#cbd5e1] leading-relaxed">
              Microgravity unloading upregulates atrophy genes (<em>TRIM63</em>, <em>FBXO32</em>, <em>MSTN</em>, <em>FOXO3</em>), while hypoxia and sustained cortisol accelerate proteolysis. Both indices update in real time as environment gravity or sleep hours change.
            </p>
          </div>
        </div>

        {/* Algorithm 4: Spaceflight Modified NEWS2 Clinical Acuity Scorer */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc]">
              4. Spaceflight Modified NEWS2 Acuity Matrix
            </h2>
            <span className="text-[11px] font-mono text-[#38bdf8]">
              Total: {trace?.news2.total_score ?? 0} ({trace?.news2.acuity_tier ?? 'NOMINAL'})
            </span>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs">
            <p className="text-[#cbd5e1] leading-relaxed">
              Adapted from the clinical <strong className="text-[#f1f5f9]">National Early Warning Score 2 (NEWS2)</strong> to give astronauts an objective single triage score when Earth flight surgeons are unreachable across 14+ minute signal latency.
            </p>
            <div className="sx-cell overflow-hidden">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-[#0b1018] border-b border-[#1d2636] text-[#94a3b8]">
                    <th className="py-1.5 px-3">Parameter</th>
                    <th className="py-1.5 px-3">Live Value</th>
                    <th className="py-1.5 px-3">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(trace?.news2.breakdown ?? []).map((item) => (
                    <tr key={item.parameter} className="border-b border-[#141c28]">
                      <td className="py-1.5 px-3 text-[#cbd5e1]">{item.parameter}</td>
                      <td className="py-1.5 px-3 text-[#f8fafc]">{item.value}</td>
                      <td
                        className={`py-1.5 px-3 font-semibold ${
                          item.points >= 3
                            ? 'text-[#ef4444]'
                            : item.points > 0
                            ? 'text-[#f59e0b]'
                            : 'text-[#34d399]'
                        }`}
                      >
                        {item.points} / {item.max_points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] font-mono text-[#94a3b8]">
              Tiers: 0–1 NOMINAL · 2–4 MONITOR · 5–6 URGENT · &gt;=7 or SpO2 &lt;90% EMERGENCY
            </div>
          </div>
        </div>
      </div>

      {/* Offline Data Cleaning Pipeline Architecture */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-[#f8fafc] flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-[#38bdf8]" />
            <span>5. Multi-Dataset Cleaning &amp; Synchronization Pipeline</span>
          </h2>
          <span className="text-[11px] font-mono text-[#94a3b8]">ETL → Synchronized Feed</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="sx-cell p-3">
            <div className="font-semibold text-[#38bdf8]">Step A: ICARTT (.ict)</div>
            <p className="text-[#94a3b8] mt-1 leading-relaxed">
              Reads line 1 dynamically to skip variable metadata headers, extracts <code className="font-mono text-[#e2e8f0]">P01</code> &amp; <code className="font-mono text-[#e2e8f0]">ARML3dr</code>, replaces <code className="font-mono text-[#e2e8f0]">-9999</code> with <code className="font-mono text-[#e2e8f0]">NaN</code>, sorts by <code className="font-mono text-[#e2e8f0]">Julian_date</code>, and imputes via <code className="font-mono text-[#e2e8f0]">.ffill().bfill()</code>.
            </p>
          </div>
          <div className="sx-cell p-3">
            <div className="font-semibold text-[#38bdf8]">Step B: OSD-195 (.txt)</div>
            <p className="text-[#94a3b8] mt-1 leading-relaxed">
              Parses tab-separated gene expression files skipping <code className="font-mono text-[#e2e8f0]">#</code> comment lines, averaging RMA <code className="font-mono text-[#e2e8f0]">VALUE</code> across subjects to derive <code className="font-mono text-[#e2e8f0]">genetic_atrophy_baseline = 1.2500</code>.
            </p>
          </div>
          <div className="sx-cell p-3">
            <div className="font-semibold text-[#38bdf8]">Step C: MIMIC-III (.csv)</div>
            <p className="text-[#94a3b8] mt-1 leading-relaxed">
              Joins <code className="font-mono text-[#e2e8f0]">LABEVENTS</code> with <code className="font-mono text-[#e2e8f0]">D_LABITEMS</code> on <code className="font-mono text-[#e2e8f0]">itemid</code>, isolates subject cohort, drops NaN values, pivots chart timestamps, and fills gaps with <code className="font-mono text-[#e2e8f0]">.ffill().bfill()</code>.
            </p>
          </div>
          <div className="sx-cell p-3">
            <div className="font-semibold text-[#38bdf8]">Step D: Tick Sync Export</div>
            <p className="text-[#94a3b8] mt-1 leading-relaxed">
              Aligns radiation and ICU vitals along monotonic integer <code className="font-mono text-[#e2e8f0]">sim_tick</code> rows and writes <code className="font-mono text-[#e2e8f0]">data/simulation_feed.csv</code> for 1 Hz offline streaming.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
