import { useEffect, useState } from 'react';
import { Brain, ClipboardList, Dumbbell, Utensils } from 'lucide-react';
import type {
  DailyLogsSummary,
  DietLogEntry,
  ExerciseLogEntry,
  MentalLogEntry,
  TelemetrySnapshot,
} from '../types';

interface CrewLogsPageProps {
  snapshot: TelemetrySnapshot;
  onSnapshotUpdate: (next: TelemetrySnapshot) => void;
}

type LogTab = 'diet' | 'exercise' | 'mental';

function RectangularMeter({
  label,
  valueText,
  percent,
  colorClass,
}: {
  label: string;
  valueText: string;
  percent: number;
  colorClass: string;
}) {
  const blocks = 10;
  const active = Math.max(0, Math.min(blocks, Math.round((percent / 100) * blocks)));
  return (
    <div className="sx-cell p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[#1e293b]">{label}</span>
        <span className="font-mono font-semibold text-[#0f172a]">{valueText}</span>
      </div>
      <div className="grid grid-cols-10 gap-1 p-1 bg-[#dce5f0] border border-[#9cb0c9]">
        {Array.from({ length: blocks }).map((_, i) => (
          <div
            key={i}
            className={`h-2.5 ${i < active ? colorClass : 'bg-[#cbd5e1]'}`}
          />
        ))}
      </div>
    </div>
  );
}

export function CrewLogsPage({ snapshot, onSnapshotUpdate }: CrewLogsPageProps) {
  const [activeTab, setActiveTab] = useState<LogTab>('diet');
  const [dietLogs, setDietLogs] = useState<DietLogEntry[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLogEntry[]>([]);
  const [mentalLogs, setMentalLogs] = useState<MentalLogEntry[]>([]);
  const [summary, setSummary] = useState<DailyLogsSummary>(
    snapshot.daily_logs_summary ?? {
      diet_logs_count: 0,
      total_calories_kcal: 0,
      total_protein_g: 0,
      total_water_ml: 0,
      total_vitamin_d_iu: 0,
      exercise_logs_count: 0,
      total_exercise_min: 0,
      total_calories_burned: 0,
      mental_logs_count: 0,
    }
  );
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Diet form state
  const [mealType, setMealType] = useState('Lunch');
  const [foodDesc, setFoodDesc] = useState('Thermostabilized Salmon, Quinoa & Tortilla');
  const [caloriesKcal, setCaloriesKcal] = useState(640);
  const [proteinG, setProteinG] = useState(38);
  const [waterMl, setWaterMl] = useState(450);
  const [vitDIu, setVitDIu] = useState(800);

  // Exercise form state
  const [modality, setModality] = useState('ARED Resistive Squat/Deadlift');
  const [durationMin, setDurationMin] = useState(45);
  const [intensity, setIntensity] = useState<'LOW' | 'MODERATE' | 'HIGH'>('HIGH');
  const [loadPct, setLoadPct] = useState(80);
  const [exNotes, setExNotes] = useState('4x8 squats + heel raises to protect bone density');

  // Mental journal form state
  const [moodScore, setMoodScore] = useState(snapshot.mental_checkin.mood_score);
  const [stressLevel, setStressLevel] = useState(3);
  const [sleepHours, setSleepHours] = useState(snapshot.mental_checkin.sleep_hours);
  const [triggers, setTriggers] = useState('Nominal / Calm');
  const [journalEntry, setJournalEntry] = useState('');

  const refreshLogs = async () => {
    try {
      const res = await fetch('/api/crew-logs');
      if (res.ok) {
        const data = await res.json();
        setDietLogs(Array.isArray(data.diet_logs) ? data.diet_logs : []);
        setExerciseLogs(Array.isArray(data.exercise_logs) ? data.exercise_logs : []);
        setMentalLogs(Array.isArray(data.mental_logs) ? data.mental_logs : []);
        if (data.summary) setSummary(data.summary);
      }
    } catch {
      // Ignore transient network error
    }
  };

  useEffect(() => {
    void refreshLogs();
  }, []);

  useEffect(() => {
    if (snapshot.daily_logs_summary) {
      setSummary(snapshot.daily_logs_summary);
    }
  }, [snapshot.daily_logs_summary]);

  const submitDiet = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/crew-logs/diet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meal_type: mealType,
          description: foodDesc,
          calories_kcal: caloriesKcal,
          protein_g: proteinG,
          water_ml: waterMl,
          vitamin_d_iu: vitDIu,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) onSnapshotUpdate(data.snapshot);
        setStatusMsg(`■ Logged ${mealType} (${caloriesKcal} kcal, ${waterMl} mL) to Python SQLite.`);
        await refreshLogs();
      }
    } finally {
      setBusy(false);
    }
  };

  const submitExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/crew-logs/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modality,
          duration_min: durationMin,
          intensity,
          resistance_load_pct: loadPct,
          notes: exNotes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) onSnapshotUpdate(data.snapshot);
        setStatusMsg(
          `■ Logged ${durationMin}m ${modality} -> Muscle Atrophy Risk updated to ${data.snapshot?.muscle_atrophy_risk?.toFixed(3)}x.`
        );
        await refreshLogs();
      }
    } finally {
      setBusy(false);
    }
  };

  const submitMental = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/crew-logs/mental', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood_score: moodScore,
          stress_level: stressLevel,
          sleep_hours: sleepHours,
          triggers,
          journal_entry: journalEntry || 'Completed daily behavioral reflection.',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) onSnapshotUpdate(data.snapshot);
        setJournalEntry('');
        setStatusMsg(
          `■ Logged Mental Journal entry -> Mental Stress Index recalculated at ${data.snapshot?.mental_stress_index}/100.`
        );
        await refreshLogs();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Daily Targets Summary Bar */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h1 className="text-xs font-semibold tracking-wide text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-[#93c5fd]" />
            <span>Crew Daily Countermeasure Logbook: Diet, Exercise &amp; Mental Health</span>
          </h1>
          <span className="text-[11px] font-mono text-[#dbeafe]">
            SQLite Persistent · Atrophy Risk {snapshot.muscle_atrophy_risk.toFixed(3)}x
          </span>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <RectangularMeter
            label="Daily Energy Intake"
            valueText={`${summary.total_calories_kcal} / 2800 kcal`}
            percent={(summary.total_calories_kcal / 2800) * 100}
            colorClass="bg-[#0b3d91]"
          />
          <RectangularMeter
            label="Fluid Hydration"
            valueText={`${summary.total_water_ml} / 2500 mL`}
            percent={(summary.total_water_ml / 2500) * 100}
            colorClass="bg-[#1d4ed8]"
          />
          <RectangularMeter
            label="NASA Exercise Target"
            valueText={`${summary.total_exercise_min} / 90 min`}
            percent={(summary.total_exercise_min / 90) * 100}
            colorClass="bg-[#15803d]"
          />
          <RectangularMeter
            label="Protein & Behavioral"
            valueText={`${summary.total_protein_g}g · ${summary.mental_logs_count} logs`}
            percent={(summary.total_protein_g / 110) * 100}
            colorClass="bg-[#d97706]"
          />
        </div>
      </div>

      {/* Category Switcher Tabs + Entry Form */}
      <div className="sx-panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5 border-b border-[#b6c6d8] bg-[#dce5f0]">
          <button
            type="button"
            onClick={() => setActiveTab('diet')}
            className={`px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'diet'
                ? 'bg-[#0b3d91] text-white border-[#fc3d21]'
                : 'sx-btn'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
            <span>1. Diet &amp; Hydration Log ({dietLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('exercise')}
            className={`px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'exercise'
                ? 'bg-[#0b3d91] text-white border-[#fc3d21]'
                : 'sx-btn'
            }`}
          >
            <Dumbbell className="w-3.5 h-3.5" />
            <span>2. Exercise &amp; ARED Log ({exerciseLogs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('mental')}
            className={`px-3 py-1.5 text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'mental'
                ? 'bg-[#0b3d91] text-white border-[#fc3d21]'
                : 'sx-btn'
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            <span>3. Mental Health Journal ({mentalLogs.length})</span>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 text-xs">
          {statusMsg && (
            <div className="p-2.5 bg-[#ecfdf5] border border-[#16a34a] text-[#15803d] font-mono text-[11px]">
              {statusMsg}
            </div>
          )}

          {activeTab === 'diet' && (
            <form onSubmit={submitDiet} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[11px] text-[#475569] mr-1">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() => {
                    setMealType('Breakfast');
                    setFoodDesc('Scrambled Eggs, Oatmeal, Berry Pouch & Coffee');
                    setCaloriesKcal(560);
                    setProteinG(28);
                    setWaterMl(400);
                    setVitDIu(1000);
                  }}
                  className="sx-btn px-2.5 py-1 text-[11px] cursor-pointer"
                >
                  ISS Breakfast
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMealType('Dinner');
                    setFoodDesc('Beef Brisket, Irradiated Rice, Spinach & Calcium');
                    setCaloriesKcal(780);
                    setProteinG(46);
                    setWaterMl(500);
                    setVitDIu(800);
                  }}
                  className="sx-btn px-2.5 py-1 text-[11px] cursor-pointer"
                >
                  High-Protein Dinner
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMealType('Hydration Bolus');
                    setFoodDesc('Electrolyte Recovery Drink + 15g Carb Gel');
                    setCaloriesKcal(90);
                    setProteinG(0);
                    setWaterMl(600);
                    setVitDIu(0);
                  }}
                  className="sx-btn px-2.5 py-1 text-[11px] cursor-pointer"
                >
                  Post-EVA Hydration
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Meal / Intake Category</span>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value)}
                    className="sx-input px-2.5 py-2 text-xs"
                  >
                    <option value="Breakfast">Breakfast</option>
                    <option value="Lunch">Lunch</option>
                    <option value="Dinner">Dinner</option>
                    <option value="EVA Ration / Snack">EVA Ration / Snack</option>
                    <option value="Hydration Bolus">Hydration Bolus</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-semibold text-[#1e293b]">Ration Description &amp; Supplements</span>
                  <input
                    type="text"
                    value={foodDesc}
                    onChange={(e) => setFoodDesc(e.target.value)}
                    className="sx-input px-2.5 py-2 text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Energy (kcal)</span>
                  <input
                    type="number"
                    min={0}
                    max={4000}
                    value={caloriesKcal}
                    onChange={(e) => setCaloriesKcal(Number(e.target.value))}
                    className="sx-input px-2.5 py-2 font-mono text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Protein (g)</span>
                  <input
                    type="number"
                    min={0}
                    max={250}
                    value={proteinG}
                    onChange={(e) => setProteinG(Number(e.target.value))}
                    className="sx-input px-2.5 py-2 font-mono text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Water (mL)</span>
                  <input
                    type="number"
                    min={0}
                    max={4000}
                    value={waterMl}
                    onChange={(e) => setWaterMl(Number(e.target.value))}
                    className="sx-input px-2.5 py-2 font-mono text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Vitamin D (IU)</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={vitDIu}
                    onChange={(e) => setVitDIu(Number(e.target.value))}
                    className="sx-input px-2.5 py-2 font-mono text-xs"
                  />
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="sx-btn-primary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Save Diet &amp; Hydration Entry
                </button>
              </div>
            </form>
          )}

          {activeTab === 'exercise' && (
            <form onSubmit={submitExercise} className="flex flex-col gap-3">
              <p className="text-[#334155] sx-cell p-2.5">
                <strong className="text-[#0b3d91]">NASA Bone &amp; Muscle Countermeasure:</strong> Astronauts perform resistive loading (ARED) and aerobic exercise daily to offset microgravity muscle atrophy (OSD-195 baseline {snapshot.genetic_atrophy_baseline.toFixed(2)}x). Logging exercise dynamically reduces your live atrophy risk score in Python.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Hardware Modality</span>
                  <select
                    value={modality}
                    onChange={(e) => setModality(e.target.value)}
                    className="sx-input px-2.5 py-2 text-xs"
                  >
                    <option value="ARED Resistive Squat/Deadlift">ARED Resistive Squat/Deadlift</option>
                    <option value="T2 Treadmill (Harnessed)">T2 Treadmill (Harnessed)</option>
                    <option value="CEVIS Cycle Ergometer">CEVIS Cycle Ergometer</option>
                    <option value="Core & Mobility Protocol">Core &amp; Mobility Protocol</option>
                    <option value="EVA Surface Walk">EVA Surface Walk</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Duration (minutes)</span>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="sx-input px-2.5 py-2 font-mono text-xs"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Intensity Tier</span>
                  <select
                    value={intensity}
                    onChange={(e) => setIntensity(e.target.value as 'LOW' | 'MODERATE' | 'HIGH')}
                    className="sx-input px-2.5 py-2 text-xs"
                  >
                    <option value="LOW">LOW (Recovery / Mobility)</option>
                    <option value="MODERATE">MODERATE (Aerobic Zone 2-3)</option>
                    <option value="HIGH">HIGH (Bone-Loading / HIIT)</option>
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">ARED / Resistance Load ({loadPct}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={loadPct}
                    onChange={(e) => setLoadPct(Number(e.target.value))}
                    className="w-full square-slider mt-2"
                  />
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-semibold text-[#1e293b]">Session Notes / Joint Feedback</span>
                  <input
                    type="text"
                    value={exNotes}
                    onChange={(e) => setExNotes(e.target.value)}
                    placeholder="e.g., Knee alignment clean, harness load 75% BW"
                    className="sx-input px-2.5 py-2 text-xs"
                  />
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="sx-btn-primary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Log Exercise Session to Python EHR
                </button>
              </div>
            </form>
          )}

          {activeTab === 'mental' && (
            <form onSubmit={submitMental} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Mood Score ({moodScore} / 5)</span>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={moodScore}
                    onChange={(e) => setMoodScore(Number(e.target.value))}
                    className="w-full square-slider mt-2"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Perceived Stress ({stressLevel} / 10)</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={stressLevel}
                    onChange={(e) => setStressLevel(Number(e.target.value))}
                    className="w-full square-slider mt-2"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Last Sleep Duration (hrs)</span>
                  <input
                    type="number"
                    min={0}
                    max={12}
                    step={0.5}
                    value={sleepHours}
                    onChange={(e) => setSleepHours(Number(e.target.value))}
                    className="sx-input px-2.5 py-2 font-mono text-xs"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-semibold text-[#1e293b]">Primary Behavioral Context / Stressor</span>
                  <select
                    value={triggers}
                    onChange={(e) => setTriggers(e.target.value)}
                    className="sx-input px-2.5 py-2 text-xs"
                  >
                    <option value="Nominal / Calm">Nominal / Calm</option>
                    <option value="Isolation & Confinement">Isolation &amp; Confinement</option>
                    <option value="Earth Comm Delay Strain">Earth Comm Delay Strain</option>
                    <option value="Cognitive / Workload Fatigue">Cognitive / Workload Fatigue</option>
                    <option value="Circadian / Sleep Disruption">Circadian / Sleep Disruption</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="font-semibold text-[#1e293b]">Crew Mental Health Journal Reflection</span>
                  <textarea
                    rows={2}
                    value={journalEntry}
                    onChange={(e) => setJournalEntry(e.target.value)}
                    placeholder="Record mood shifts, homesickness, peer dynamics, sleep quality, or coping steps..."
                    className="sx-input px-2.5 py-2 text-xs"
                  />
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={busy}
                  className="sx-btn-primary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  Save Mental Health Journal Entry
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Persistent History Table for Selected Logbook Tab */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-white">
            {activeTab === 'diet'
              ? 'Recorded Diet & Hydration Entries (SQLite)'
              : activeTab === 'exercise'
              ? 'Recorded Exercise & Countermeasure Sessions (SQLite)'
              : 'Recorded Mental Health Journal Entries (SQLite)'}
          </h2>
          <span className="text-[11px] font-mono text-[#dbeafe]">Persisted Offline</span>
        </div>

        <div className="overflow-x-auto max-h-72">
          {activeTab === 'diet' && (
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#dce5f0] border-b border-[#9cb0c9] text-[#0f2942]">
                  <th className="py-1.5 px-3">UTC Time</th>
                  <th className="py-1.5 px-3">Meal</th>
                  <th className="py-1.5 px-3">Description</th>
                  <th className="py-1.5 px-3">kcal</th>
                  <th className="py-1.5 px-3">Protein</th>
                  <th className="py-1.5 px-3">Water</th>
                  <th className="py-1.5 px-3">Vit D</th>
                </tr>
              </thead>
              <tbody>
                {dietLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 px-3 text-center text-[#475569]">
                      No meals or hydration logged yet. Add an entry above.
                    </td>
                  </tr>
                ) : (
                  dietLogs.map((row) => (
                    <tr key={row.id} className="border-b border-[#cbd5e1] bg-white hover:bg-[#eff6ff]">
                      <td className="py-1.5 px-3 whitespace-nowrap text-[#475569]">
                        {row.created_utc.replace('T', ' ').replace('Z', '')}
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-[#0b3d91]">{row.meal_type}</td>
                      <td className="py-1.5 px-3 font-sans text-[#0f172a]">{row.description}</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.calories_kcal}</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.protein_g}g</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.water_ml} mL</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.vitamin_d_iu} IU</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'exercise' && (
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#dce5f0] border-b border-[#9cb0c9] text-[#0f2942]">
                  <th className="py-1.5 px-3">UTC Time</th>
                  <th className="py-1.5 px-3">Modality</th>
                  <th className="py-1.5 px-3">Duration</th>
                  <th className="py-1.5 px-3">Intensity</th>
                  <th className="py-1.5 px-3">Load %</th>
                  <th className="py-1.5 px-3">Burned</th>
                  <th className="py-1.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {exerciseLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 px-3 text-center text-[#475569]">
                      No exercise sessions logged yet. Add an ARED, T2, or CEVIS session above.
                    </td>
                  </tr>
                ) : (
                  exerciseLogs.map((row) => (
                    <tr key={row.id} className="border-b border-[#cbd5e1] bg-white hover:bg-[#eff6ff]">
                      <td className="py-1.5 px-3 whitespace-nowrap text-[#475569]">
                        {row.created_utc.replace('T', ' ').replace('Z', '')}
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-[#0b3d91] font-sans">{row.modality}</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.duration_min} min</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.intensity}</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.resistance_load_pct}%</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.calories_burned} kcal</td>
                      <td className="py-1.5 px-3 font-sans text-[#334155]">{row.notes}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {activeTab === 'mental' && (
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#dce5f0] border-b border-[#9cb0c9] text-[#0f2942]">
                  <th className="py-1.5 px-3">UTC Time</th>
                  <th className="py-1.5 px-3">Mood</th>
                  <th className="py-1.5 px-3">Stress</th>
                  <th className="py-1.5 px-3">Sleep</th>
                  <th className="py-1.5 px-3">Context / Stressor</th>
                  <th className="py-1.5 px-3">Journal Reflection</th>
                </tr>
              </thead>
              <tbody>
                {mentalLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 px-3 text-center text-[#475569]">
                      No mental health journal entries yet. Log your first behavioral check above.
                    </td>
                  </tr>
                ) : (
                  mentalLogs.map((row) => (
                    <tr key={row.id} className="border-b border-[#cbd5e1] bg-white hover:bg-[#eff6ff] align-top">
                      <td className="py-1.5 px-3 whitespace-nowrap text-[#475569]">
                        {row.created_utc.replace('T', ' ').replace('Z', '')}
                      </td>
                      <td className="py-1.5 px-3 font-semibold text-[#0f172a]">{row.mood_score}/5</td>
                      <td className={`py-1.5 px-3 font-semibold ${row.stress_level >= 7 ? 'text-[#b45309]' : 'text-[#15803d]'}`}>
                        {row.stress_level}/10
                      </td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.sleep_hours.toFixed(1)}h</td>
                      <td className="py-1.5 px-3 font-sans text-[#334155]">{row.triggers}</td>
                      <td className="py-1.5 px-3 font-sans text-[#0f172a] max-w-md">{row.journal_entry}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
