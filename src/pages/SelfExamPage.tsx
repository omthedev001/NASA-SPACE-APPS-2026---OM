import { useEffect, useState } from 'react';
import { Camera, ClipboardCheck, Database, FileText, Upload } from 'lucide-react';
import type { AlertEvent, ExamRecord, SelfAssessment, TelemetrySnapshot } from '../types';

interface SelfExamPageProps {
  snapshot: TelemetrySnapshot;
  onSnapshotUpdate: (next: TelemetrySnapshot) => void;
}

const EXAM_INSTRUCTIONS = [
  {
    title: '1. Arterial Blood Pressure (mmHg)',
    why: 'Detects microgravity fluid shifts, orthostatic intolerance before landing/EVA, and cardiovascular strain.',
    how: 'Wrap upper-arm cuff flush at heart level after sitting quietly for 5 minutes. Keep legs uncrossed.',
    target: 'Safe: 95–135 / 60–85 mmHg',
  },
  {
    title: '2. Capillary Blood Glucose (mg/dL)',
    why: 'Monitors EVA energy expenditure, inadequate nutrition, and spaceflight insulin resistance.',
    how: 'Wash fingertip, lancet side of finger pad, apply droplet to test strip and enter mg/dL reading.',
    target: 'Safe: 70–140 mg/dL (Alert <70 or >180)',
  },
  {
    title: '3. Core Body Temperature (°C)',
    why: 'Closed spacecraft habitats amplify latent immune activation, infection fever, or EVA suit chill.',
    how: 'Position tympanic infrared probe cleanly inside ear canal toward eardrum; take mean of 2 scans.',
    target: 'Safe: 36.5–37.4 °C (Alert >=38.0 or <35.5)',
  },
  {
    title: '4. Visual / Ultrasound Capture',
    why: 'Satisfies inflight dermatology, ocular (SANS), wound healing, and portable ultrasound screening.',
    how: 'Attach photo or ultrasound frame below with body region notes for local SQLite archival & triage.',
    target: 'Stored offline + AI uplink optional',
  },
];

export function SelfExamPage({ snapshot, onSnapshotUpdate }: SelfExamPageProps) {
  const [form, setForm] = useState<SelfAssessment>(snapshot.self_assessment);
  const [notes, setNotes] = useState('');
  const [savingVitals, setSavingVitals] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  // Visual / Ultrasound Image Exam state
  const [bodyRegion, setBodyRegion] = useState('Skin / Forearm');
  const [visualNotes, setVisualNotes] = useState('');
  const [imageName, setImageName] = useState('');
  const [imageMime, setImageMime] = useState('image/png');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [visualBusy, setVisualBusy] = useState(false);
  const [visualResult, setVisualResult] = useState<{ mode: string; analysis: string } | null>(null);

  // SQLite History from Python Backend
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/exams/history');
      if (res.ok) {
        const data = await res.json();
        setExams(Array.isArray(data.exams) ? data.exams : []);
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      }
    } catch {
      // Ignore transient load error
    }
  };

  useEffect(() => {
    setForm(snapshot.self_assessment);
  }, [snapshot.self_assessment]);

  useEffect(() => {
    void loadHistory();
  }, []);

  const submitMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVitals(true);
    setSaveBanner(null);
    try {
      const res = await fetch('/api/self-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, notes }),
      });
      if (res.ok) {
        const next = (await res.json()) as TelemetrySnapshot;
        onSnapshotUpdate(next);
        setNotes('');
        setSaveBanner(
          `Logged to Python SQLite EHR (NEWS2 Score: ${next.news2?.total_score ?? 0} — ${next.news2?.acuity_tier ?? 'NOMINAL'}).`
        );
        await loadHistory();
      }
    } finally {
      setSavingVitals(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageName(file.name);
    setImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const submitVisualExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setVisualBusy(true);
    setVisualResult(null);
    try {
      const res = await fetch('/api/visual-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_region: bodyRegion,
          notes: visualNotes,
          image_name: imageName || 'crew-manual-observation',
          image_base64: imageDataUrl,
          mime_type: imageMime,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.snapshot) {
          onSnapshotUpdate(data.snapshot as TelemetrySnapshot);
        }
        setVisualResult({
          mode: data.mode || 'offline-edge',
          analysis: data.image_analysis || 'Recorded into SQLite mission EHR.',
        });
        await loadHistory();
      }
    } finally {
      setVisualBusy(false);
    }
  };

  const mapMmhg =
    snapshot.self_assessment.map_mmhg ??
    Math.round(form.diastolic_bp + (form.systolic_bp - form.diastolic_bp) / 3);

  return (
    <div className="flex flex-col gap-4">
      {/* Guided Crew Self-Exam Protocol Reference Cards */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h1 className="text-xs font-semibold tracking-wide text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#93c5fd]" />
            <span>Crew Self-Examination Guide (NASA HRP Medical Kit)</span>
          </h1>
          <span className="text-[11px] font-mono text-[#dbeafe]">Step-by-Step Protocol</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {EXAM_INSTRUCTIONS.map((card) => (
            <div key={card.title} className="sx-cell p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="font-semibold text-[#0f172a]">{card.title}</div>
                <p className="text-[11px] text-[#334155] mt-1.5 leading-relaxed">
                  <strong className="text-[#0b3d91]">Why:</strong> {card.why}
                </p>
                <p className="text-[11px] text-[#475569] mt-1 leading-relaxed">
                  <strong className="text-[#1e293b]">How:</strong> {card.how}
                </p>
              </div>
              <div className="text-[11px] font-mono font-semibold text-[#15803d] pt-2 border-t border-[#cbd5e1]">
                {card.target}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive Forms Grid: Left = Vitals/Metabolic Entry, Right = Camera/Ultrasound Visual Exam */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <ClipboardCheck className="w-4 h-4 text-[#93c5fd]" />
              <span>Log Physical &amp; Metabolic Self-Measurements</span>
            </h2>
            <span className="text-[11px] font-mono text-[#dbeafe]">MAP: {mapMmhg} mmHg</span>
          </div>

          <form onSubmit={submitMeasurement} className="p-4 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Systolic BP (mmHg)</span>
                <input
                  type="number"
                  min={60}
                  max={220}
                  value={form.systolic_bp}
                  onChange={(e) => setForm({ ...form, systolic_bp: Number(e.target.value) })}
                  className="sx-input px-2.5 py-2 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Diastolic BP (mmHg)</span>
                <input
                  type="number"
                  min={40}
                  max={140}
                  value={form.diastolic_bp}
                  onChange={(e) => setForm({ ...form, diastolic_bp: Number(e.target.value) })}
                  className="sx-input px-2.5 py-2 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Blood Sugar (mg/dL)</span>
                <input
                  type="number"
                  min={30}
                  max={400}
                  value={form.blood_sugar_mg_dl}
                  onChange={(e) => setForm({ ...form, blood_sugar_mg_dl: Number(e.target.value) })}
                  className="sx-input px-2.5 py-2 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Body Temp (°C)</span>
                <input
                  type="number"
                  step="0.1"
                  min={33}
                  max={42}
                  value={form.body_temp_c}
                  onChange={(e) => setForm({ ...form, body_temp_c: Number(e.target.value) })}
                  className="sx-input px-2.5 py-2 font-mono text-xs"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#1e293b]">Clinical Symptom Note (Optional)</span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Post-ARED resistive workout, mild headache..."
                className="sx-input px-2.5 py-2 text-xs"
              />
            </label>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingVitals}
                className="sx-btn-primary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {savingVitals ? 'Recording in Python SQLite...' : 'Save Exam & Score NEWS2'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({
                    systolic_bp: 148,
                    diastolic_bp: 94,
                    blood_sugar_mg_dl: 64,
                    body_temp_c: 38.3,
                  })
                }
                className="sx-btn px-3 py-2 text-xs font-medium cursor-pointer"
              >
                Load Abnormal Test Case
              </button>
            </div>

            {saveBanner && (
              <div className="p-2.5 bg-[#ecfdf5] border border-[#16a34a] text-[#15803d] font-mono text-[11px]">
                ■ {saveBanner}
              </div>
            )}
          </form>
        </div>

        {/* Camera / Ultrasound / Clinical Photo Inspection */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#93c5fd]" />
              <span>Visual Symptom &amp; Ultrasound Inspection</span>
            </h2>
            <span className="text-[11px] font-mono text-[#dbeafe]">Multimodal + Offline Rubric</span>
          </div>

          <form onSubmit={submitVisualExam} className="p-4 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Anatomical Region / Modality</span>
                <select
                  value={bodyRegion}
                  onChange={(e) => setBodyRegion(e.target.value)}
                  className="sx-input px-2.5 py-2 text-xs"
                >
                  <option value="Skin / Forearm">Skin / Rash / Lesion</option>
                  <option value="Ocular / Fundus (SANS)">Ocular / Eye Irritation (SANS)</option>
                  <option value="Ultrasound Scan (FAST/Optic)">Portable Ultrasound Frame</option>
                  <option value="Throat / Oral Cavity">Throat / Oral Cavity</option>
                  <option value="Hardware / Sensor Readout">Medical Device / Gauge Photo</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Attach Camera / Ultrasound Image</span>
                <label className="sx-btn px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[#0b3d91]" />
                  <span className="truncate">{imageName || 'Select Image File...'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </label>
            </div>

            {imageDataUrl && (
              <div className="sx-cell p-2 flex items-center gap-3">
                <img
                  src={imageDataUrl}
                  alt="Uploaded crew medical inspection preview"
                  className="w-20 h-20 object-cover border border-[#0b3d91]"
                />
                <div className="text-[11px] font-mono text-[#475569]">
                  <div className="font-semibold text-[#0f172a]">{imageName}</div>
                  <div>Ready for Flight Surgeon visual triage &amp; local SQLite archival.</div>
                </div>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#1e293b]">Visual Symptoms &amp; Crew Observations</span>
              <textarea
                rows={2}
                value={visualNotes}
                onChange={(e) => setVisualNotes(e.target.value)}
                placeholder="Describe onset, discomfort, rash borders, glare/vision changes, or scan landmark..."
                className="sx-input px-2.5 py-2 text-xs"
              />
            </label>

            <button
              type="submit"
              disabled={visualBusy || (!visualNotes.trim() && !imageDataUrl)}
              className="sx-btn-primary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {visualBusy ? 'Evaluating Visual Exam...' : 'Run Inspection & Archive in Python EHR'}
            </button>

            {visualResult && (
              <div className="sx-cell p-3 border-[#0b3d91] bg-[#eff6ff] flex flex-col gap-1">
                <div className="text-[10px] font-mono font-semibold text-[#0b3d91] flex justify-between">
                  <span>Inspection Guidance</span>
                  <span>{visualResult.mode === 'uplink-ai' ? 'Multimodal Uplink AI' : 'Offline Edge Rubric'}</span>
                </div>
                <p className="text-xs text-[#1e293b] leading-relaxed">{visualResult.analysis}</p>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Persistent Python SQLite Medical EHR & Alert Audit Log */}
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[#93c5fd]" />
              <span>Persistent Crew Exam Log (Python SQLite EHR)</span>
            </h2>
            <span className="text-[11px] font-mono text-[#dbeafe]">{exams.length} Records</span>
          </div>
          <div className="overflow-x-auto max-h-72">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#dce5f0] border-b border-[#9cb0c9] text-[#0f2942]">
                  <th className="py-1.5 px-3">UTC Time</th>
                  <th className="py-1.5 px-3">Type</th>
                  <th className="py-1.5 px-3">BP</th>
                  <th className="py-1.5 px-3">Glu / Temp</th>
                  <th className="py-1.5 px-3">NEWS2</th>
                  <th className="py-1.5 px-3">Notes / Finding</th>
                </tr>
              </thead>
              <tbody>
                {exams.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-4 px-3 text-center text-[#475569]">
                      No saved crew exams yet. Log a measurement or visual exam above to persist to SQLite.
                    </td>
                  </tr>
                ) : (
                  exams.map((row) => (
                    <tr key={row.id} className="border-b border-[#cbd5e1] bg-white hover:bg-[#eff6ff] align-top">
                      <td className="py-1.5 px-3 whitespace-nowrap text-[#475569]">
                        {row.created_utc.replace('T', ' ').replace('Z', '')}
                      </td>
                      <td className="py-1.5 px-3 text-[#0b3d91] font-semibold">
                        {row.exam_type === 'VISUAL_IMAGING_EXAM' ? `IMG: ${row.body_region}` : 'VITALS'}
                      </td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.systolic_bp}/{row.diastolic_bp}</td>
                      <td className="py-1.5 px-3 text-[#0f172a]">{row.blood_sugar_mg_dl} · {row.body_temp_c}°C</td>
                      <td className="py-1.5 px-3 font-semibold text-[#0f172a]">
                        {row.news2_score} ({row.acuity_tier})
                      </td>
                      <td className="py-1.5 px-3 font-sans text-[#334155] max-w-xs">
                        {row.image_analysis || row.notes}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-white">Hazard Transition Audit Log</h2>
            <span className="text-[11px] font-mono text-[#dbeafe]">{alerts.length} Events</span>
          </div>
          <div className="overflow-y-auto max-h-72 p-3 flex flex-col gap-2 text-xs">
            {alerts.length === 0 ? (
              <div className="sx-cell p-3 text-[#475569] font-mono text-[11px]">
                No threshold crossings recorded yet. Run a drill on Telemetry or Overview to inspect audit logging.
              </div>
            ) : (
              alerts.map((ev) => (
                <div key={ev.id} className="sx-cell p-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono text-[10px] text-[#475569]">
                      {ev.created_utc} · MET T+{ev.met_seconds}s
                    </div>
                    <div className="font-semibold text-[#0f172a]">{ev.hazard}</div>
                  </div>
                  <span
                    className={`font-mono text-[11px] font-semibold whitespace-nowrap ${
                      ev.severity === 'CRITICAL'
                        ? 'text-[#dc2626]'
                        : ev.severity === 'WARNING'
                        ? 'text-[#b45309]'
                        : 'text-[#15803d]'
                    }`}
                  >
                    {ev.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
