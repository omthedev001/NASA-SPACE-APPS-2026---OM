import { useEffect, useState } from 'react';
import { Brain, HeartHandshake, Moon } from 'lucide-react';
import { MissionCompanion } from '../components/MissionCompanion';
import type { MentalCheckin, TelemetrySnapshot } from '../types';

interface WellnessPageProps {
  snapshot: TelemetrySnapshot;
  onSnapshotUpdate: (next: TelemetrySnapshot) => void;
}

export function WellnessPage({ snapshot, onSnapshotUpdate }: WellnessPageProps) {
  const [checkin, setCheckin] = useState<MentalCheckin>(snapshot.mental_checkin);
  const [saving, setSaving] = useState(false);
  const [journalNote, setJournalNote] = useState('');
  const [journalSaved, setJournalSaved] = useState<string | null>(null);

  useEffect(() => {
    setCheckin(snapshot.mental_checkin);
  }, [snapshot.mental_checkin]);

  const submitCheckin = async (next: MentalCheckin) => {
    setCheckin(next);
    setSaving(true);
    try {
      const res = await fetch('/api/mental-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const updated = (await res.json()) as TelemetrySnapshot;
        onSnapshotUpdate(updated);
      }
    } finally {
      setSaving(false);
    }
  };

  const preset =
    checkin.cognitive_fatigue && checkin.isolation_stress
      ? 'strained'
      : checkin.cognitive_fatigue || checkin.sleep_hours < 6.5
      ? 'fatigued'
      : 'rested';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 items-start">
      {/* Left Column: Detailed Behavioral & Sleep Assessment */}
      <section className="flex flex-col gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h1 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-[#93c5fd]" />
              <span>Behavioral &amp; Isolation Check-In</span>
            </h1>
            <span className="text-[11px] font-mono text-[#dbeafe]">
              Stress {snapshot.mental_stress_index.toFixed(1)}/100
            </span>
          </div>

          <div className="p-4 flex flex-col gap-3.5 text-xs">
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'rested', label: 'Rested' },
                  { id: 'fatigued', label: 'Fatigued' },
                  { id: 'strained', label: 'Strained' },
                ] as const
              ).map((opt) => {
                const selected = preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={saving}
                    onClick={() => {
                      if (opt.id === 'rested') {
                        void submitCheckin({
                          mood_score: 5,
                          sleep_hours: 8.0,
                          cognitive_fatigue: false,
                          isolation_stress: false,
                        });
                      } else if (opt.id === 'fatigued') {
                        void submitCheckin({
                          mood_score: 3,
                          sleep_hours: 5.5,
                          cognitive_fatigue: true,
                          isolation_stress: false,
                        });
                      } else {
                        void submitCheckin({
                          mood_score: 1,
                          sleep_hours: 4.0,
                          cognitive_fatigue: true,
                          isolation_stress: true,
                        });
                      }
                    }}
                    className={`py-1.5 font-semibold border cursor-pointer ${
                      selected
                        ? opt.id === 'rested'
                          ? 'bg-[#ecfdf5] border-[#16a34a] text-[#15803d]'
                          : 'bg-[#fffbeb] border-[#d97706] text-[#b45309]'
                        : 'sx-btn'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="wellness-sleep" className="font-mono text-[11px] flex justify-between text-[#475569]">
                <span>Daily Sleep Hours</span>
                <span className="font-semibold text-[#0f172a]">{checkin.sleep_hours.toFixed(1)} / 8.0 hrs</span>
              </label>
              <input
                id="wellness-sleep"
                type="range"
                min="3"
                max="10"
                step="0.5"
                value={checkin.sleep_hours}
                onChange={(e) =>
                  void submitCheckin({ ...checkin, sleep_hours: Number(e.target.value) })
                }
                className="w-full square-slider"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="wellness-mood" className="font-mono text-[11px] flex justify-between text-[#475569]">
                <span>Crew Mood Rating (1=Low, 5=Optimal)</span>
                <span className="font-semibold text-[#0f172a]">{checkin.mood_score} / 5</span>
              </label>
              <input
                id="wellness-mood"
                type="range"
                min="1"
                max="5"
                step="1"
                value={checkin.mood_score}
                onChange={(e) =>
                  void submitCheckin({ ...checkin, mood_score: Number(e.target.value) })
                }
                className="w-full square-slider"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-[#cbd5e1]">
              <label className="sx-cell p-2.5 flex items-center justify-between cursor-pointer">
                <span className="font-medium text-[#1e293b]">Cognitive / Attention Fatigue</span>
                <input
                  type="checkbox"
                  checked={checkin.cognitive_fatigue}
                  onChange={(e) =>
                    void submitCheckin({ ...checkin, cognitive_fatigue: e.target.checked })
                  }
                />
              </label>
              <label className="sx-cell p-2.5 flex items-center justify-between cursor-pointer">
                <span className="font-medium text-[#1e293b]">Isolation &amp; Confinement Strain</span>
                <input
                  type="checkbox"
                  checked={checkin.isolation_stress}
                  onChange={(e) =>
                    void submitCheckin({ ...checkin, isolation_stress: e.target.checked })
                  }
                />
              </label>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!journalNote.trim()) return;
                setSaving(true);
                setJournalSaved(null);
                try {
                  const res = await fetch('/api/crew-logs/mental', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      mood_score: checkin.mood_score,
                      stress_level: Math.max(1, Math.min(10, Math.round(snapshot.mental_stress_index / 10))),
                      sleep_hours: checkin.sleep_hours,
                      triggers: checkin.isolation_stress
                        ? 'Isolation & Confinement'
                        : checkin.cognitive_fatigue
                        ? 'Cognitive Fatigue'
                        : 'Nominal / Calm',
                      journal_entry: journalNote.trim(),
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    if (data.snapshot) onSnapshotUpdate(data.snapshot);
                    setJournalNote('');
                    setJournalSaved('Saved journal entry to Python SQLite Crew Logs.');
                  }
                } finally {
                  setSaving(false);
                }
              }}
              className="flex flex-col gap-2 pt-2 border-t border-[#cbd5e1]"
            >
              <label className="font-semibold text-[#1e293b]">Save Mental Health Journal Entry</label>
              <textarea
                rows={2}
                value={journalNote}
                onChange={(e) => setJournalNote(e.target.value)}
                placeholder="Write a brief mood, sleep, or stress reflection for your mission log..."
                className="sx-input px-2.5 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={saving || !journalNote.trim()}
                className="sx-btn-primary py-1.5 px-3 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Save Journal Entry to SQLite
              </button>
              {journalSaved && (
                <div className="text-[11px] font-mono text-[#15803d]">■ {journalSaved}</div>
              )}
            </form>
          </div>
        </div>

        {/* Evidence-Based Spaceflight Countermeasures */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center gap-1.5">
            <Moon className="w-4 h-4 text-[#93c5fd]" />
            <h2 className="text-xs font-semibold tracking-wide text-white">NASA HRP Behavioral Countermeasures</h2>
          </div>
          <div className="p-3.5 flex flex-col gap-2.5 text-xs text-[#334155]">
            <div className="sx-cell p-2.5">
              <div className="font-semibold text-[#0b3d91] flex items-center gap-1.5">
                <HeartHandshake className="w-3.5 h-3.5" />
                <span>Circadian Light Hygiene (480nm / 2700K)</span>
              </div>
              <p className="mt-1 text-[11px] text-[#475569]">
                Without 24h Earth sunrise cycles, shift cabin LEDs to blue-enriched white during wake blocks and warm amber 90 min before sleep.
              </p>
            </div>
            <div className="sx-cell p-2.5">
              <div className="font-semibold text-[#0b3d91]">Earth-Out-of-View Isolation Mitigation</div>
              <p className="mt-1 text-[11px] text-[#475569]">
                One-way delay ({snapshot.environment_profile.comm_delay}) prevents live phone calls. Record asynchronous video letters &amp; preserve protected crew social meals.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Right Column: Interactive 4-7-8 Breathing Pacer & Behavioral Flight Surgeon Chat */}
      <MissionCompanion />
    </div>
  );
}
