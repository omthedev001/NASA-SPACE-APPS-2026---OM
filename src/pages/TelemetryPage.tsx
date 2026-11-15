import { useState } from 'react';
import { Activity, Pause, Play, Radio, RotateCcw, ShieldAlert, StepForward } from 'lucide-react';
import { TelemetryCharts } from '../components/TelemetryCharts';
import type { TelemetrySnapshot } from '../types';

interface TelemetryPageProps {
  snapshot: TelemetrySnapshot;
  onSendControl: (action: string) => void;
  onSnapshotUpdate: (next: TelemetrySnapshot) => void;
  busyAction: string | null;
}

export function TelemetryPage({
  snapshot,
  onSendControl,
  onSnapshotUpdate,
  busyAction,
}: TelemetryPageProps) {
  const [spo2Input, setSpo2Input] = useState('97.5');
  const [hrInput, setHrInput] = useState('74');
  const [fluxInput, setFluxInput] = useState('1.4');
  const [injectStatus, setInjectStatus] = useState<string | null>(null);

  const injectSensorPacket = async (e: React.FormEvent) => {
    e.preventDefault();
    setInjectStatus(null);
    const nextTs = Number((snapshot.timestamp + 1).toFixed(1));
    const hrVal = Number(hrInput);
    const spo2Val = Number(spo2Input);
    const fluxVal = Number(fluxInput);

    try {
      await fetch('/ingest/radiation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sensor_id: 'RAD-DOSIMETER-BAY1',
          timestamp: nextTs,
          proton_flux: fluxVal,
          ambient_dose: Number((0.35 + fluxVal * 0.08).toFixed(2)),
        }),
      });
      const vitRes = await fetch('/ingest/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sensor_id: 'CREW-BIOMETRIC-01',
          timestamp: nextTs,
          heart_rate: hrVal,
          spo2: spo2Val,
        }),
      });
      if (vitRes.ok) {
        const data = await vitRes.json();
        if (data.snapshot) {
          onSnapshotUpdate(data.snapshot as TelemetrySnapshot);
        }
        setInjectStatus(
          `Injected packet at T+${nextTs}s -> Python EMA SpO2=${data.snapshot?.smoothed_spo2}%, Slope=${data.snapshot?.radiation_slope} pfu/s`
        );
      }
    } catch {
      setInjectStatus('Failed to send packet to Python ingestion endpoints.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hardware Simulator Control + Custom Packet Injection Bar */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h1 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-[#fde68a]" />
              <span>Hardware Stream Transport &amp; Fault Drills</span>
            </h1>
            <span className="text-[11px] font-mono text-[#dbeafe]">
              Row {snapshot.simulator.current_row}/{snapshot.simulator.total_rows} · {snapshot.simulator.playing ? 'Playing' : 'Hold'}
            </span>
          </div>

          <div className="p-3.5 flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onSendControl(snapshot.simulator.playing ? 'pause' : 'play')}
                disabled={busyAction !== null}
                className="sx-btn-primary flex items-center justify-center gap-1.5 py-2 text-xs font-semibold cursor-pointer"
              >
                {snapshot.simulator.playing ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Stream</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Play Stream</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => onSendControl('step')}
                disabled={busyAction !== null}
                className="sx-btn flex items-center justify-center gap-1.5 py-2 text-xs font-semibold cursor-pointer"
              >
                <StepForward className="w-3.5 h-3.5" />
                <span>Step 1 Tick</span>
              </button>
              <button
                type="button"
                onClick={() => onSendControl('reset')}
                disabled={busyAction !== null}
                className="sx-btn flex items-center justify-center gap-1.5 py-2 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Feed</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#cbd5e1]">
              <button
                type="button"
                onClick={() => onSendControl('fault_hypoxia')}
                className="px-2 py-1.5 text-xs font-semibold bg-[#fef2f2] border border-[#dc2626] text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer"
              >
                Inject Hypoxia
              </button>
              <button
                type="button"
                onClick={() => onSendControl('fault_spe')}
                className="px-2 py-1.5 text-xs font-semibold bg-[#fffbeb] border border-[#d97706] text-[#b45309] hover:bg-[#fef3c7] cursor-pointer"
              >
                Inject Solar SPE
              </button>
              <button
                type="button"
                onClick={() => onSendControl('fault_stress')}
                className="px-2 py-1.5 text-xs font-semibold bg-[#fffbeb] border border-[#d97706] text-[#b45309] hover:bg-[#fef3c7] cursor-pointer"
              >
                Inject Stress
              </button>
              <button
                type="button"
                onClick={() => onSendControl('restore_nominal')}
                className="px-2 py-1.5 text-xs font-semibold bg-[#ecfdf5] border border-[#16a34a] text-[#15803d] hover:bg-[#d1fae5] cursor-pointer"
              >
                Restore Nominal
              </button>
            </div>
          </div>
        </div>

        {/* Manual Hardware Telemetry Packet Injector */}
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-[#93c5fd]" />
              <span>Direct Sensor Packet Injector (POST /ingest/vitals &amp; /ingest/radiation)</span>
            </h2>
            <span className="text-[11px] font-mono text-[#dbeafe]">Python Validation</span>
          </div>
          <form onSubmit={injectSensorPacket} className="p-3.5 flex flex-col gap-2.5 text-xs">
            <div className="grid grid-cols-3 gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Raw SpO2 (%)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={spo2Input}
                  onChange={(e) => setSpo2Input(e.target.value)}
                  className="sx-input px-2 py-1.5 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Raw HR (bpm)</span>
                <input
                  type="number"
                  step="1"
                  min={0}
                  max={250}
                  value={hrInput}
                  onChange={(e) => setHrInput(e.target.value)}
                  className="sx-input px-2 py-1.5 font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Proton Flux (pfu)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={fluxInput}
                  onChange={(e) => setFluxInput(e.target.value)}
                  className="sx-input px-2 py-1.5 font-mono text-xs"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="sx-btn-primary px-4 py-1.5 text-xs font-semibold cursor-pointer">
                Transmit Packet to Python Engine
              </button>
              {injectStatus && (
                <span className="text-[11px] font-mono text-[#15803d]">{injectStatus}</span>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* All 7 Scientific Charts + Sample Table */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-[#93c5fd]" />
            <span>Scientific Telemetry Plots (7 Live Figures) &amp; Synchronized Log</span>
          </h2>
          <span className="text-[11px] font-mono text-[#dbeafe]">Hover Fig 1 or Fig 2 to inspect samples</span>
        </div>
        <div className="p-4">
          <TelemetryCharts snapshot={snapshot} />
        </div>
      </div>
    </div>
  );
}
