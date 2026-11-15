import { useState } from 'react';
import type { BodyPartId, TelemetrySnapshot } from '../types';

interface DigitalTwinBodyMapProps {
  snapshot: TelemetrySnapshot;
}

function SegmentedFlightMeter({
  label,
  valueText,
  percent,
  tone,
}: {
  label: string;
  valueText: string;
  percent: number;
  tone: 'green' | 'amber' | 'red' | 'cyan';
}) {
  const segments = 12;
  const activeCount = Math.max(1, Math.min(segments, Math.round((percent / 100) * segments)));
  const activeColor =
    tone === 'red'
      ? 'bg-[#dc2626]'
      : tone === 'amber'
      ? 'bg-[#d97706]'
      : tone === 'cyan'
      ? 'bg-[#0b3d91]'
      : 'bg-[#15803d]';

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[#334155] font-medium">{label}</span>
        <span className="font-mono font-bold text-[#0f172a]">{valueText}</span>
      </div>
      <div
        className="grid grid-cols-12 gap-1 p-1 bg-[#dce5f0] border border-[#9cb0c9]"
        aria-hidden="true"
      >
        {Array.from({ length: segments }).map((_, idx) => (
          <div
            key={idx}
            className={`h-2 transition-colors duration-150 ${
              idx < activeCount ? activeColor : 'bg-[#cbd5e1]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function DigitalTwinBodyMap({ snapshot }: DigitalTwinBodyMapProps) {
  const [selectedPart, setSelectedPart] = useState<BodyPartId>('lungs');

  const isHypoxia = snapshot.smoothed_spo2 < 90;
  const isSpeWarning = snapshot.radiation_slope > 1.5;
  const isMentalAlert =
    snapshot.smoothed_heart_rate > 110 ||
    snapshot.mental_stress_index >= 55 ||
    snapshot.mental_checkin.cognitive_fatigue ||
    snapshot.mental_checkin.isolation_stress;

  const { systolic_bp, diastolic_bp, blood_sugar_mg_dl, body_temp_c } =
    snapshot.self_assessment;

  const isBpAlert = systolic_bp >= 140 || diastolic_bp >= 90 || systolic_bp < 90;
  const isMetabolicAlert =
    blood_sugar_mg_dl < 70 ||
    blood_sugar_mg_dl > 180 ||
    body_temp_c >= 38.0 ||
    body_temp_c < 35.5;

  const lungsFill = isHypoxia ? '#dc2626' : '#15803d';
  const brainFill = isMentalAlert || isSpeWarning ? '#d97706' : '#15803d';
  const heartFill =
    systolic_bp < 90 ? '#dc2626' : isBpAlert || snapshot.smoothed_heart_rate > 110 ? '#d97706' : '#15803d';
  const metabolicFill = isMetabolicAlert ? '#d97706' : '#0b3d91';
  const musclesFill = snapshot.muscle_atrophy_risk > 1.35 ? '#d97706' : '#0b3d91';

  const cabinPpO2kPa = Number(((snapshot.smoothed_spo2 / 98.0) * 21.3).toFixed(1));
  const o2MarginPct = Math.max(5, Math.min(100, ((snapshot.smoothed_spo2 - 78) / 22) * 100));
  const radShieldPct = Math.max(8, Math.min(100, 100 - snapshot.radiation_flux * 4.8));
  const mentalReservePct = Math.max(5, Math.min(100, 100 - snapshot.mental_stress_index));
  const muscleCapacityPct = Math.max(
    15,
    Math.min(100, 100 - (snapshot.muscle_atrophy_risk - 1.0) * 42)
  );

  const partGuides: Record<
    BodyPartId,
    {
      title: string;
      statusText: string;
      statusTone: string;
      functionDesc: string;
      hrpHazard: string;
      howToMeasure: string;
      escalation: string;
    }
  > = {
    brain: {
      title: 'Neurocognitive & Behavioral Health',
      statusText: isMentalAlert ? '▲ Strained' : '■ Nominal',
      statusTone: isMentalAlert ? 'text-[#b45309]' : 'text-[#15803d]',
      functionDesc:
        'Governs executive decision-making, circadian sleep regulation, mood stability, and autonomic balance.',
      hrpHazard: 'Isolation & Confinement · Distance from Earth · CNS Radiation',
      howToMeasure:
        'Record daily sleep hours (target 7.5–8.0h), mood rating, and resting heart rate variability.',
      escalation:
        'Escalate if mental stress reaches >= 55/100, sleep < 6.0h for 2+ nights, or persistent disorientation occurs.',
    },
    lungs: {
      title: 'Pulmonary & Cabin Gas Exchange',
      statusText: isHypoxia ? '✖ Hypoxia (<90%)' : '■ Nominal (>=90%)',
      statusTone: isHypoxia ? 'text-[#dc2626]' : 'text-[#15803d]',
      functionDesc:
        'Maintains alveolar oxygen delivery and CO2 washout inside sealed spacecraft life support.',
      hrpHazard: 'Hostile Closed Environments (ppO2 drop, CO2 scrubber fault)',
      howToMeasure:
        'Clip pulse oximeter for 20 seconds seated. Verify cabin oxygen partial pressure stays near 21.3 kPa.',
      escalation:
        'Immediate Critical crew drill if EMA SpO2 drops below 90.0% — isolate primary scrubber and don O2 mask.',
    },
    heart: {
      title: 'Cardiovascular & Arterial Perfusion',
      statusText: isBpAlert ? '▲ BP Deviation' : '■ Nominal',
      statusTone: isBpAlert ? 'text-[#b45309]' : 'text-[#15803d]',
      functionDesc:
        'Sustains arterial pressure and cerebral blood flow against cephalad fluid shifts in altered gravity.',
      hrpHazard: 'Altered Gravity Fields (orthostatic intolerance)',
      howToMeasure:
        'Measure upper-arm cuff at heart level after 5 minutes of quiet rest. Record Systolic/Diastolic mmHg.',
      escalation:
        'Alert crew if Systolic < 90 mmHg, BP >= 140/90 mmHg, or resting HR exceeds 110 bpm.',
    },
    metabolic: {
      title: 'Metabolic, Glucose & Immune System',
      statusText: isMetabolicAlert ? '▲ Metabolic Alert' : '■ Nominal',
      statusTone: isMetabolicAlert ? 'text-[#b45309]' : 'text-[#15803d]',
      functionDesc:
        'Balances blood glucose energy reserves, core thermoregulation (36.5–37.4 °C), and immune surveillance.',
      hrpHazard: 'Inadequate Nutrition · Closed-Loop Immune Reactivation',
      howToMeasure:
        'Perform capillary glucometer check (mg/dL) and tympanic infrared thermometer scan (°C).',
      escalation:
        'Act immediately if glucose < 70 mg/dL (consume 15g carb gel), glucose > 180 mg/dL, or temp >= 38.0 °C.',
    },
    muscles: {
      title: 'Musculoskeletal & Bone Integrity',
      statusText: `■ ${snapshot.muscle_atrophy_risk.toFixed(3)}x Load`,
      statusTone: 'text-[#0b3d91]',
      functionDesc:
        'Preserves posture, EVA strength, and skeletal mineral density during prolonged unloading.',
      hrpHazard: `Altered Gravity (${snapshot.environment_profile.gravity_g.toFixed(2)}g) · Bone Loss & Atrophy`,
      howToMeasure:
        `Log daily ARED resistive and cardio exercise minutes alongside OSD-195 atrophy multiplier (${snapshot.genetic_atrophy_baseline.toFixed(2)}x baseline).`,
      escalation:
        'Increase daily ARED loading if atrophy index rises above 1.35x or crew reports persistent soreness.',
    },
  };

  const activeGuide = partGuides[selectedPart];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 xl:grid-cols-[248px_1fr] gap-4 items-stretch">
        {/* Interactive Crew Biometric Schematic — Zero Circles */}
        <div className="sx-cell p-3.5 flex flex-col items-center justify-between gap-2">
          <div className="w-full flex items-center justify-between text-[11px] font-mono text-[#475569] border-b border-[#b6c6d8] pb-1.5">
            <span>Select Region</span>
            <span>EMA α=0.30</span>
          </div>

          <svg
            width="184"
            height="278"
            viewBox="0 0 190 310"
            role="img"
            aria-label="Interactive Crew Biometric Schematic"
            className="select-none bg-white border border-[#b6c6d8]"
          >
            {/* Telemetry Axes */}
            <line x1="95" y1="6" x2="95" y2="304" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
            <line x1="12" y1="110" x2="178" y2="110" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />

            {/* Angular Suit / Body Silhouette */}
            <polygon
              points="76,12 114,12 124,24 124,54 114,66 76,66 66,54 66,24"
              fill="#e2e8f0"
              stroke="#475569"
              strokeWidth="1.5"
            />
            <rect x="50" y="72" width="90" height="126" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
            <rect x="24" y="76" width="20" height="96" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
            <rect x="146" y="76" width="20" height="96" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
            <rect x="56" y="204" width="32" height="94" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />
            <rect x="102" y="204" width="32" height="94" fill="#e2e8f0" stroke="#475569" strokeWidth="1.5" />

            <g
              onClick={() => setSelectedPart('brain')}
              className="cursor-pointer"
              role="button"
              aria-label="Inspect Brain and Behavioral Health"
            >
              <rect
                id="brain"
                x="72"
                y="22"
                width="46"
                height="28"
                fill={brainFill}
                stroke={selectedPart === 'brain' ? '#fc3d21' : '#0f172a'}
                strokeWidth={selectedPart === 'brain' ? '2.5' : '1.2'}
              />
              <text x="95" y="39" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700" className="font-mono">
                BRAIN
              </text>
            </g>

            <g
              onClick={() => setSelectedPart('lungs')}
              className="cursor-pointer"
              role="button"
              aria-label="Inspect Lungs and Blood Oxygen"
            >
              <rect
                id="lungs"
                x="58"
                y="80"
                width="74"
                height="34"
                fill={lungsFill}
                stroke={selectedPart === 'lungs' ? '#fc3d21' : '#0f172a'}
                strokeWidth={selectedPart === 'lungs' ? '2.5' : '1.2'}
              />
              <text x="95" y="100" textAnchor="middle" fill="#ffffff" fontSize="9.5" fontWeight="700" className="font-mono">
                LUNGS
              </text>
            </g>

            <g
              onClick={() => setSelectedPart('heart')}
              className="cursor-pointer"
              role="button"
              aria-label="Inspect Heart and Blood Pressure"
            >
              <rect
                id="heart"
                x="58"
                y="118"
                width="35"
                height="30"
                fill={heartFill}
                stroke={selectedPart === 'heart' ? '#fc3d21' : '#0f172a'}
                strokeWidth={selectedPart === 'heart' ? '2.5' : '1.2'}
              />
              <text x="75.5" y="136" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="700" className="font-mono">
                HEART
              </text>
            </g>

            <g
              onClick={() => setSelectedPart('metabolic')}
              className="cursor-pointer"
              role="button"
              aria-label="Inspect Metabolic Glucose and Temperature"
            >
              <rect
                id="metabolic"
                x="97"
                y="118"
                width="35"
                height="30"
                fill={metabolicFill}
                stroke={selectedPart === 'metabolic' ? '#fc3d21' : '#0f172a'}
                strokeWidth={selectedPart === 'metabolic' ? '2.5' : '1.2'}
              />
              <text x="114.5" y="136" textAnchor="middle" fill="#ffffff" fontSize="7.5" fontWeight="700" className="font-mono">
                METAB
              </text>
            </g>

            <g
              onClick={() => setSelectedPart('muscles')}
              className="cursor-pointer"
              role="button"
              aria-label="Inspect Muscles and Bone Density"
            >
              <rect
                id="muscles"
                x="58"
                y="154"
                width="74"
                height="34"
                fill={musclesFill}
                stroke={selectedPart === 'muscles' ? '#fc3d21' : '#0f172a'}
                strokeWidth={selectedPart === 'muscles' ? '2.5' : '1.2'}
              />
              <text x="95" y="174" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="700" className="font-mono">
                MUSCLE/BONE
              </text>
            </g>
          </svg>

          <div className="w-full pt-2 border-t border-[#b6c6d8] text-[11px] font-mono flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[#475569]">Active Node</span>
              <span className="text-[#0b3d91] font-bold uppercase">{selectedPart}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#475569]">Gravity Vector</span>
              <span className="text-[#0f172a] font-semibold">
                {snapshot.environment_profile.gravity_g.toFixed(2)} g
              </span>
            </div>
          </div>
        </div>

        {/* High-Contrast Flight Telemetry Readouts + Segmented Bars */}
        <div className="flex flex-col justify-between gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div className="sx-cell p-3">
              <div className="text-[11px] text-[#475569] flex items-center justify-between">
                <span>Blood Oxygen (SpO2)</span>
                <span className={`font-mono font-bold ${isHypoxia ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>
                  {isHypoxia ? '✖ <90%' : '■ Safe'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className={`text-2xl font-mono font-bold ${isHypoxia ? 'text-[#dc2626]' : 'text-[#0f172a]'}`}>
                  {snapshot.smoothed_spo2.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-[#64748b] ml-1">%</span>
                <span className="text-[11px] font-mono text-[#475569] ml-auto">
                  {cabinPpO2kPa} kPa
                </span>
              </div>
            </div>

            <div className="sx-cell p-3">
              <div className="text-[11px] text-[#475569] flex items-center justify-between">
                <span>Heart Rate &amp; BP</span>
                <span className={`font-mono font-bold ${isBpAlert ? 'text-[#b45309]' : 'text-[#15803d]'}`}>
                  {isBpAlert ? '▲ Check' : '■ Safe'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-2xl font-mono font-bold text-[#0f172a]">
                  {snapshot.smoothed_heart_rate.toFixed(0)}
                </span>
                <span className="text-xs font-mono text-[#64748b] ml-1">bpm</span>
                <span className="text-[11px] font-mono text-[#475569] ml-auto">
                  {systolic_bp}/{diastolic_bp}
                </span>
              </div>
            </div>

            <div className="sx-cell p-3">
              <div className="text-[11px] text-[#475569] flex items-center justify-between">
                <span>Proton Flux (P01)</span>
                <span className={`font-mono font-bold ${isSpeWarning ? 'text-[#b45309]' : 'text-[#15803d]'}`}>
                  {isSpeWarning ? '▲ SPE' : '■ Quiet'}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span className="text-2xl font-mono font-bold text-[#0b3d91]">
                  {snapshot.radiation_flux.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-[#64748b] ml-1">pfu</span>
                <span className="text-[11px] font-mono text-[#475569] ml-auto">
                  {snapshot.radiation_slope.toFixed(2)}/s
                </span>
              </div>
            </div>

            <div className="sx-cell p-3">
              <div className="text-[11px] text-[#475569] flex items-center justify-between">
                <span>Blood Glucose</span>
                <span className="text-[11px] font-mono text-[#64748b]">70–140</span>
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span
                  className={`text-2xl font-mono font-bold ${
                    blood_sugar_mg_dl < 70 || blood_sugar_mg_dl > 180 ? 'text-[#b45309]' : 'text-[#0f172a]'
                  }`}
                >
                  {blood_sugar_mg_dl}
                </span>
                <span className="text-xs font-mono text-[#64748b] ml-1">mg/dL</span>
              </div>
            </div>

            <div className="sx-cell p-3">
              <div className="text-[11px] text-[#475569] flex items-center justify-between">
                <span>Core Temperature</span>
                <span className="text-[11px] font-mono text-[#64748b]">36.5–37.4</span>
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span
                  className={`text-2xl font-mono font-bold ${
                    body_temp_c >= 38.0 || body_temp_c < 35.5 ? 'text-[#b45309]' : 'text-[#0f172a]'
                  }`}
                >
                  {body_temp_c.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-[#64748b] ml-1">°C</span>
              </div>
            </div>

            <div className="sx-cell p-3">
              <div className="text-[11px] text-[#475569] flex items-center justify-between">
                <span>Behavioral Load</span>
                <span className="text-[11px] font-mono text-[#64748b]">
                  {snapshot.mental_checkin.sleep_hours.toFixed(1)}h sleep
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline">
                <span
                  className={`text-2xl font-mono font-bold ${
                    isMentalAlert ? 'text-[#b45309]' : 'text-[#15803d]'
                  }`}
                >
                  {snapshot.mental_stress_index.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-[#64748b] ml-1">/100</span>
              </div>
            </div>
          </div>

          <div className="sx-cell p-3.5 flex flex-col gap-3">
            <div className="text-xs font-semibold text-[#0f2942] flex items-center justify-between border-b border-[#b6c6d8] pb-1.5">
              <span>Systems Readiness Margins</span>
              <span className="text-[11px] font-mono text-[#475569]">{snapshot.environment_profile.label}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
              <SegmentedFlightMeter
                label="Oxygen Saturation Margin"
                valueText={`${Math.round(o2MarginPct)}%`}
                percent={o2MarginPct}
                tone={isHypoxia ? 'red' : 'green'}
              />
              <SegmentedFlightMeter
                label="Radiation Shielding Margin"
                valueText={`${Math.round(radShieldPct)}%`}
                percent={radShieldPct}
                tone={isSpeWarning ? 'amber' : 'cyan'}
              />
              <SegmentedFlightMeter
                label="Cognitive & Sleep Reserve"
                valueText={`${Math.round(mentalReservePct)}%`}
                percent={mentalReservePct}
                tone={isMentalAlert ? 'amber' : 'green'}
              />
              <SegmentedFlightMeter
                label="Musculoskeletal Integrity"
                valueText={`${Math.round(muscleCapacityPct)}%`}
                percent={muscleCapacityPct}
                tone="cyan"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Selected System Inspection Guide */}
      <div className="sx-cell p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#b6c6d8] pb-2 mb-2.5">
          <span className="text-xs font-bold text-[#0f2942]">
            {activeGuide.title}
          </span>
          <span className={`text-xs font-mono font-bold ${activeGuide.statusTone}`}>
            {activeGuide.statusText}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-[#334155]">
          <div>
            <div className="font-bold text-[#0b3d91]">Physiological Function</div>
            <p className="mt-0.5 leading-relaxed">{activeGuide.functionDesc}</p>
            <div className="font-bold text-[#0b3d91] mt-2">NASA HRP Hazard Link</div>
            <p className="mt-0.5 leading-relaxed">{activeGuide.hrpHazard}</p>
          </div>
          <div>
            <div className="font-bold text-[#0b3d91]">How to Self-Measure</div>
            <p className="mt-0.5 leading-relaxed">{activeGuide.howToMeasure}</p>
            <div className="font-bold text-[#0b3d91] mt-2">Escalation Threshold</div>
            <p className="mt-0.5 leading-relaxed">{activeGuide.escalation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
