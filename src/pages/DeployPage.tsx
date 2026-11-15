import { useEffect, useState } from 'react';
import { Compass, Database, Download, FileText, RefreshCw, Server, Upload } from 'lucide-react';
import type { BackendStatus, DatasetInventory, TelemetrySnapshot } from '../types';

interface DeployPageProps {
  snapshot: TelemetrySnapshot;
  onSnapshotUpdate: (next: TelemetrySnapshot) => void;
}

type UploadTarget = 'radiation' | 'osd195' | 'mimic_events' | 'mimic_items' | 'feed_csv';

export function DeployPage({ snapshot, onSnapshotUpdate }: DeployPageProps) {
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [inventory, setInventory] = useState<DatasetInventory | null>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget>('radiation');
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const loadDiagnostics = async () => {
    try {
      const [statusRes, dsRes] = await Promise.all([
        fetch('/api/backend-status'),
        fetch('/api/datasets/status'),
      ]);
      if (statusRes.ok) {
        setBackendStatus((await statusRes.json()) as BackendStatus);
      }
      if (dsRes.ok) {
        setInventory((await dsRes.json()) as DatasetInventory);
      }
    } catch {
      // Ignore transient error
    }
  };

  useEffect(() => {
    void loadDiagnostics();
  }, []);

  const handleReprocess = async () => {
    setBusy(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/datasets/reprocess', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setStatusMessage({ ok: false, text: data.error || 'Dataset cleaning failed.' });
        return;
      }
      if (data.inventory) setInventory(data.inventory);
      if (data.snapshot) onSnapshotUpdate(data.snapshot);
      setStatusMessage({
        ok: true,
        text: `Cleaned & merged ${data.summary?.aligned_rows ?? 0} synchronized ticks (OSD-195 baseline ${data.summary?.genetic_atrophy_baseline ?? 1.25}x). Live stream reloaded.`,
      });
      await loadDiagnostics();
    } catch {
      setStatusMessage({ ok: false, text: 'Unable to reach dataset processing engine.' });
    } finally {
      setBusy(false);
    }
  };

  const handleDatasetFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatusMessage(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const content = typeof reader.result === 'string' ? reader.result : '';
        const res = await fetch('/api/datasets/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: uploadTarget,
            filename: file.name,
            content,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatusMessage({ ok: false, text: data.error || 'Failed to ingest uploaded dataset.' });
          return;
        }
        if (data.inventory) setInventory(data.inventory);
        if (data.snapshot) onSnapshotUpdate(data.snapshot);
        setStatusMessage({
          ok: true,
          text: `Ingested "${file.name}" -> rebuilt ${data.summary?.aligned_rows ?? 0} synchronized ticks into live telemetry.`,
        });
        await loadDiagnostics();
      } catch {
        setStatusMessage({ ok: false, text: 'Dataset upload failed.' });
      } finally {
        setBusy(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Row: Live Mission Engine Status & Store-and-Forward Downlink */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h1 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <Server className="w-4 h-4 text-[#93c5fd]" />
              <span>Autonomous Edge Runtime &amp; SQLite EHR Storage</span>
            </h1>
            <span className="text-[11px] font-mono text-[#86efac]">
              ■ {backendStatus?.status ?? 'Online'}
            </span>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono">
              <div className="sx-cell p-2.5">
                <div className="text-[10px] text-[#475569]">Engine Runtime</div>
                <div className="font-semibold text-[#0f172a] mt-0.5">
                  Python v{backendStatus?.python_version ?? '3.10'}
                </div>
              </div>
              <div className="sx-cell p-2.5">
                <div className="text-[10px] text-[#475569]">Clinical Exams</div>
                <div className="font-semibold text-[#0f172a] mt-0.5">
                  {backendStatus?.sqlite?.exam_records_count ?? 0} saved
                </div>
              </div>
              <div className="sx-cell p-2.5">
                <div className="text-[10px] text-[#475569]">Crew Logs</div>
                <div className="font-semibold text-[#0f172a] mt-0.5">
                  {backendStatus?.sqlite?.crew_logs_count ?? 0} entries
                </div>
              </div>
              <div className="sx-cell p-2.5">
                <div className="text-[10px] text-[#475569]">Feed Ticks</div>
                <div className="font-semibold text-[#0f172a] mt-0.5">
                  {inventory?.feed_rows ?? backendStatus?.feed_rows ?? 36} rows
                </div>
              </div>
            </div>

            <div className="sx-cell p-3 text-[11px] font-mono text-[#334155]">
              <div className="font-semibold text-[#0b3d91] mb-1">Active Flight-Deck Modules:</div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {(backendStatus?.algorithms ?? []).map((alg) => (
                  <li key={alg}>■ {alg}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="sx-panel overflow-hidden">
          <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-[#93c5fd]" />
              <span>NASA HRP 5 Spaceflight Hazards &amp; Ground Downlink</span>
            </h2>
            <span className="text-[11px] font-mono text-[#dbeafe]">
              Lag: {snapshot.environment_profile.comm_delay}
            </span>
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#334155]">
              <div className="sx-cell p-2.5">
                <strong className="text-[#0b3d91]">1. Space Radiation:</strong> P01 flux slope &amp; 250 mSv BFO budget.
              </div>
              <div className="sx-cell p-2.5">
                <strong className="text-[#0b3d91]">2. Isolation &amp; Confinement:</strong> Sleep, mood, AI &amp; 4-7-8 pacer.
              </div>
              <div className="sx-cell p-2.5">
                <strong className="text-[#0b3d91]">3. Distance from Earth:</strong> Zero-cloud SQLite + store-and-forward report.
              </div>
              <div className="sx-cell p-2.5">
                <strong className="text-[#0b3d91]">4. Altered Gravity:</strong> OSD-195 ({snapshot.genetic_atrophy_baseline.toFixed(2)}x) atrophy + cuff BP tracking.
              </div>
              <div className="sx-cell p-2.5 sm:col-span-2">
                <strong className="text-[#0b3d91]">5. Hostile Closed Environments:</strong> EMA SpO2 (&lt;90% hypoxia), ppO2, blood sugar &amp; fever checks.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <a
                href="/api/docs/support-document"
                download="AstroHealth_Supporting_Document.md"
                className="sx-btn px-3 py-2 text-xs font-semibold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-[#0b3d91]" />
                <span>Download Mission Brief (MD)</span>
              </a>
              <a
                href="/api/report/export"
                download="astrohealth_downlink_report.json"
                className="sx-btn-primary px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Flight Surgeon JSON</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Mission Dataset Calibration & Real-Data Ingestion Panel */}
      <div className="sx-panel overflow-hidden">
        <div className="sx-panel-header px-4 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold tracking-wide text-white flex items-center gap-1.5">
            <Database className="w-4 h-4 text-[#93c5fd]" />
            <span>Mission Dataset Calibration &amp; Multi-Source Ingestion</span>
          </h2>
          <button
            type="button"
            onClick={() => void handleReprocess()}
            disabled={busy}
            className="sx-btn px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3 h-3 text-[#0b3d91]" />
            <span>Re-Clean &amp; Sync Local Datasets</span>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4 text-xs">
          <p className="text-[#334155] leading-relaxed">
            AstroHealth natively ingests raw <strong className="text-[#0f172a]">NASA ICARTT Radiation (.ict/.csv)</strong>,{' '}
            <strong className="text-[#0f172a]">NASA GeneLab OSD-195 RNA-Seq (.txt/.tsv)</strong>,{' '}
            <strong className="text-[#0f172a]">MIMIC-III ICU Labs (LABEVENTS.csv + D_LABITEMS.csv)</strong>, or a pre-merged{' '}
            <strong className="text-[#0f172a]">simulation_feed.csv</strong>. Sentinel missing values (<code className="font-mono bg-[#dce5f0] px-1 text-[#0b3d91]">-9999</code> / <code className="font-mono bg-[#dce5f0] px-1 text-[#0b3d91]">NaN</code>) are automatically cleaned via forward/backward imputation and synced onto monotonic <code className="font-mono bg-[#dce5f0] px-1 text-[#0b3d91]">sim_tick</code> intervals.
          </p>

          {/* Active Dataset Inventory Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 font-mono text-[11px]">
            <div className="sx-cell p-3">
              <div className="text-[#0b3d91] font-semibold mb-1">Radiation Telemetry</div>
              {(inventory?.radiation_files ?? []).length === 0 ? (
                <div className="text-[#475569]">No .ict/.csv loaded</div>
              ) : (
                (inventory?.radiation_files ?? []).map((f) => (
                  <div key={f.name} className="text-[#0f172a] truncate">
                    ■ {f.name} ({(f.bytes / 1024).toFixed(1)} KB)
                  </div>
                ))
              )}
            </div>

            <div className="sx-cell p-3">
              <div className="text-[#0b3d91] font-semibold mb-1">OSD-195 Genomics</div>
              {(inventory?.osd195_files ?? []).length === 0 ? (
                <div className="text-[#475569]">No .txt/.tsv loaded</div>
              ) : (
                (inventory?.osd195_files ?? []).map((f) => (
                  <div key={f.name} className="text-[#0f172a] truncate">
                    ■ {f.name} ({(f.bytes / 1024).toFixed(1)} KB)
                  </div>
                ))
              )}
              <div className="text-[#475569] mt-1">
                Baseline: {(inventory?.genetic_atrophy_baseline ?? snapshot.genetic_atrophy_baseline).toFixed(4)}x
              </div>
            </div>

            <div className="sx-cell p-3">
              <div className="text-[#0b3d91] font-semibold mb-1">MIMIC-III Clinical Labs</div>
              {(inventory?.mimic_files ?? []).length === 0 ? (
                <div className="text-[#475569]">No CSV files loaded</div>
              ) : (
                (inventory?.mimic_files ?? []).map((f) => (
                  <div key={f.name} className="text-[#0f172a] truncate">
                    ■ {f.name} ({(f.bytes / 1024).toFixed(1)} KB)
                  </div>
                ))
              )}
            </div>

            <div className="sx-cell p-3">
              <div className="text-[#15803d] font-semibold mb-1">Synchronized Feed</div>
              <div className="text-[#0f172a] font-semibold">
                {inventory?.feed_rows ?? snapshot.simulator.total_rows} aligned ticks
              </div>
              <div className="text-[#475569] mt-1">
                Current Tick: {snapshot.simulator.current_row} / {snapshot.simulator.total_rows}
              </div>
            </div>
          </div>

          {/* Direct Dataset Uploader */}
          <div className="sx-cell p-3.5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Dataset Stream Target</span>
                <select
                  value={uploadTarget}
                  onChange={(e) => setUploadTarget(e.target.value as UploadTarget)}
                  className="sx-input px-2.5 py-2 text-xs"
                >
                  <option value="radiation">NASA Radiation Archive (.ict / .csv)</option>
                  <option value="osd195">NASA GeneLab OSD-195 Expression (.txt / .tsv)</option>
                  <option value="mimic_events">MIMIC-III Lab Events (LABEVENTS.csv / vital CSV)</option>
                  <option value="mimic_items">MIMIC-III Item Dictionary (D_LABITEMS.csv)</option>
                  <option value="feed_csv">Pre-Merged Telemetry Feed (simulation_feed.csv)</option>
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-semibold text-[#1e293b]">Upload Dataset File for Live Processing</span>
                <label className="sx-btn-primary px-3 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{busy ? 'Processing Dataset...' : 'Select & Ingest Dataset File'}</span>
                  <input
                    type="file"
                    accept=".ict,.txt,.tsv,.csv"
                    disabled={busy}
                    onChange={handleDatasetFileUpload}
                    className="hidden"
                  />
                </label>
              </label>
            </div>

            <div className="text-[11px] font-mono text-[#475569]">
              Updates live playback immediately
            </div>
          </div>

          {statusMessage && (
            <div
              className={`p-2.5 border font-mono text-[11px] ${
                statusMessage.ok
                  ? 'bg-[#ecfdf5] border-[#16a34a] text-[#15803d]'
                  : 'bg-[#fef2f2] border-[#dc2626] text-[#dc2626]'
              }`}
            >
              {statusMessage.ok ? '■ ' : '✖ '}
              {statusMessage.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
