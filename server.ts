import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const PY_PORT = Number(process.env.ASTROHEALTH_PY_PORT ?? 8001);
const PY_BASE_URL = `http://127.0.0.1:${PY_PORT}`;

let pythonProcess: ChildProcess | null = null;

function startPythonBackend(): ChildProcess {
  const scriptPath = path.join(__dirname, 'python_engine', 'edge_backend.py');
  const child = spawn('python3', [scriptPath], {
    cwd: __dirname,
    env: {
      ...process.env,
      ASTROHEALTH_PY_PORT: String(PY_PORT),
      PYTHONUNBUFFERED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[python-edge] ${chunk}`);
  });
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[python-edge:err] ${chunk}`);
  });
  child.on('exit', (code, signal) => {
    console.warn(`[python-edge] exited with code=${code} signal=${signal}`);
  });
  return child;
}

async function waitForPythonReady(maxAttempts = 40): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const resp = await fetch(`${PY_BASE_URL}/health`);
      if (resp.ok) {
        return;
      }
    } catch {
      // Wait for Python HTTP server socket
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Python backend failed to start on ${PY_BASE_URL}`);
}

async function fetchPythonJson<T = Record<string, unknown>>(
  endpoint: string,
  init?: RequestInit
): Promise<{ status: number; data: T }> {
  const resp = await fetch(`${PY_BASE_URL}${endpoint}`, init);
  const data = (await resp.json()) as T;
  return { status: resp.status, data };
}

function buildOfflineCompanionReply(message: string, snap: Record<string, any>): string {
  const lower = message.toLowerCase();
  const activeHazards: string[] = Array.isArray(snap.protocols)
    ? snap.protocols.map((p: any) => String(p.hazard))
    : [];
  const envLabel = snap.environment_profile?.label ?? 'Spacecraft';
  const commDelay = snap.environment_profile?.comm_delay ?? '14.2 min';
  const news2 = snap.news2 ?? { total_score: 0, acuity_tier: 'NOMINAL' };

  if (
    lower.includes('anxi') ||
    lower.includes('isolat') ||
    lower.includes('stress') ||
    lower.includes('mental') ||
    lower.includes('mood')
  ) {
    return (
      `I am tracking your behavioral state locally in Python (Mental Stress Index: ${snap.mental_stress_index}/100, Sleep: ${Number(snap.mental_checkin?.sleep_hours ?? 7.5).toFixed(1)}h). ` +
      `Deep-space confinement and Earth comm lag (${commDelay}) naturally amplify autonomic vigilance. ` +
      `Use the 4-7-8 Vagal Breathing Pacer on the Wellness page for 3 cycles to lower heart rate (${snap.smoothed_heart_rate} bpm), switch cabin lights to warm circadian spectrum, and schedule a peer check-in.`
    );
  }

  if (lower.includes('breath') || lower.includes('calm') || lower.includes('panic')) {
    return (
      `Start the 4-7-8 Vagal Breathing Pacer on the Behavioral Wellness page: inhale smoothly for 4s, hold 7s, exhale 8s. ` +
      `Current Python-filtered Heart Rate is ${snap.smoothed_heart_rate} bpm and SpO2 is ${snap.smoothed_spo2}%. Repeat 4 cycles while seated.`
    );
  }

  if (lower.includes('pressure') || lower.includes('bp') || lower.includes('heart') || lower.includes('gravity')) {
    return (
      `In ${envLabel} (${Number(snap.environment_profile?.gravity_g ?? 0).toFixed(2)}g), altered gravity shifts fluid cephalad toward your chest and head. ` +
      `Logged BP is ${snap.self_assessment?.systolic_bp}/${snap.self_assessment?.diastolic_bp} mmHg (MAP ${snap.self_assessment?.map_mmhg ?? 90} mmHg) and EMA HR is ${snap.smoothed_heart_rate} bpm. ` +
      `Keep systolic BP between 95–135 mmHg, hydrate 500 mL electrolytes before standing or EVA, and repeat seated after 5 minutes of rest.`
    );
  }

  const hazardSummary =
    activeHazards.length > 0
      ? `Active alerts requiring attention: ${activeHazards.join('; ')}.`
      : 'All physical, radiation, metabolic, and behavioral parameters are currently nominal.';

  return (
    `Flight Surgeon Offline Assessment (${envLabel} | NEWS2 Score: ${news2.total_score} [${news2.acuity_tier}]): ` +
    `EMA SpO2 ${snap.smoothed_spo2}%, HR ${snap.smoothed_heart_rate} bpm, BP ${snap.self_assessment?.systolic_bp}/${snap.self_assessment?.diastolic_bp} mmHg, ` +
    `Glucose ${snap.self_assessment?.blood_sugar_mg_dl} mg/dL, Temp ${snap.self_assessment?.body_temp_c}°C, Proton Flux ${snap.radiation_flux} pfu (Cumulative ${snap.cumulative_dose_msv} mSv). ` +
    `${hazardSummary}`
  );
}

function buildOfflineVisualAnalysis(region: string, notes: string, snap: Record<string, any>): string {
  const news2 = snap.news2 ?? { total_score: 0, acuity_tier: 'NOMINAL' };
  const temp = snap.self_assessment?.body_temp_c ?? 36.8;
  return (
    `OFFLINE EDGE VISUAL RUBRIC (${region}): Image archived locally into SQLite mission EHR. ` +
    `Inspect for symmetry, erythema/swelling borders, capillary refill, or mucosal pallor alongside live NEWS2 Score ${news2.total_score} (${news2.acuity_tier}) and core temp ${temp}°C. ` +
    (notes ? `Crew notes recorded: "${notes}". ` : '') +
    `If warmth spreads > 2 cm, fever reaches >= 38.0°C, or vision/pain worsens, attach this record to the Store-and-Forward Flight Surgeon downlink.`
  );
}

async function startServer() {
  pythonProcess = startPythonBackend();
  await waitForPythonReady();

  const cleanup = () => {
    if (pythonProcess && !pythonProcess.killed) {
      pythonProcess.kill('SIGTERM');
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  const app = express();
  app.use(express.json({ limit: '25mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/dashboard' });

  let lastPayloadStr = '';

  async function broadcastState(force = false) {
    try {
      const { data } = await fetchPythonJson('/api/state');
      const payload = JSON.stringify(data);
      if (!force && payload === lastPayloadStr && wss.clients.size === 0) {
        return;
      }
      lastPayloadStr = payload;
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    } catch {
      // Python restarting or momentarily busy
    }
  }

  wss.on('connection', async (ws) => {
    try {
      const { data } = await fetchPythonJson('/api/state');
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    } catch {
      // Ignore transient initial error
    }
  });

  setInterval(() => {
    if (wss.clients.size > 0) {
      void broadcastState(true);
    }
  }, 1000);

  // Proxy helper forwarding directly to Python Edge Backend
  async function proxyPost(pyPath: string, req: Request, res: Response, shouldBroadcast = true) {
    try {
      const { status, data } = await fetchPythonJson(pyPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body ?? {}),
      });
      res.status(status).json(data);
      if (shouldBroadcast && status < 400) {
        void broadcastState(true);
      }
    } catch (err) {
      res.status(502).json({ error: 'Python edge backend unavailable', detail: String(err) });
    }
  }

  async function proxyGet(pyPath: string, _req: Request, res: Response) {
    try {
      const { status, data } = await fetchPythonJson(pyPath);
      res.status(status).json(data);
    } catch (err) {
      res.status(502).json({ error: 'Python edge backend unavailable', detail: String(err) });
    }
  }

  // Python-backed telemetry & algorithmic endpoints
  app.post('/ingest/vitals', (req, res) => void proxyPost('/ingest/vitals', req, res));
  app.post('/ingest/radiation', (req, res) => void proxyPost('/ingest/radiation', req, res));
  app.post('/api/mental-checkin', (req, res) => void proxyPost('/api/mental-checkin', req, res));
  app.post('/api/self-assessment', (req, res) => void proxyPost('/api/self-assessment', req, res));
  app.post('/api/environment', (req, res) => void proxyPost('/api/environment', req, res));
  app.post('/api/routine/toggle', (req, res) => void proxyPost('/api/routine/toggle', req, res));
  app.post('/api/simulator/control', (req, res) => void proxyPost('/api/simulator/control', req, res));

  app.get('/api/state', (req, res) => void proxyGet('/api/state', req, res));
  app.get('/api/algorithms/explain', (req, res) => void proxyGet('/api/algorithms/explain', req, res));
  app.get('/api/exams/history', (req, res) => void proxyGet('/api/exams/history', req, res));
  app.get('/api/backend-status', (req, res) => void proxyGet('/api/backend-status', req, res));
  app.get('/api/crew-logs', (req, res) => void proxyGet('/api/crew-logs', req, res));
  app.post('/api/crew-logs/diet', (req, res) => void proxyPost('/api/crew-logs/diet', req, res));
  app.post('/api/crew-logs/exercise', (req, res) => void proxyPost('/api/crew-logs/exercise', req, res));
  app.post('/api/crew-logs/mental', (req, res) => void proxyPost('/api/crew-logs/mental', req, res));
  app.get('/api/datasets/status', (req, res) => void proxyGet('/api/datasets/status', req, res));
  app.post('/api/datasets/reprocess', (req, res) => void proxyPost('/api/datasets/reprocess', req, res));
  app.post('/api/datasets/upload', (req, res) => void proxyPost('/api/datasets/upload', req, res));

  app.get('/api/report/export', async (_req, res) => {
    try {
      const resp = await fetch(`${PY_BASE_URL}/api/report/export`);
      const text = await resp.text();
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="astrohealth_downlink_report.json"'
      );
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(resp.status).send(text);
    } catch (err) {
      res.status(502).json({ error: 'Python report generator unavailable', detail: String(err) });
    }
  });

  // Multimodal Visual Self-Exam (skin, eye, ultrasound, gauge image) -> Gemini + Python SQLite log
  app.post('/api/visual-exam', async (req, res) => {
    const bodyRegion = String(req.body?.body_region ?? 'General').trim() || 'General';
    const notes = String(req.body?.notes ?? '').trim();
    const imageName = String(req.body?.image_name ?? 'exam-capture').trim();
    const imageBase64 = typeof req.body?.image_base64 === 'string' ? req.body.image_base64 : '';
    const mimeType = typeof req.body?.mime_type === 'string' ? req.body.mime_type : 'image/png';

    let snap: Record<string, any> = {};
    try {
      snap = (await fetchPythonJson('/api/state')).data;
    } catch {
      snap = {};
    }

    let analysis = '';
    let mode: 'uplink-ai' | 'offline-edge' = 'offline-edge';
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const parts: Array<Record<string, any>> = [
          {
            text: `You are AstroHealth Flight Surgeon assisting an astronaut in orbit with a self-conducted visual/ultrasound exam.\nRegion: ${bodyRegion}\nCrew Notes: ${notes || 'None provided'}\nLive Telemetry: SpO2 ${snap.smoothed_spo2}%, HR ${snap.smoothed_heart_rate} bpm, Temp ${snap.self_assessment?.body_temp_c}°C, NEWS2 ${snap.news2?.total_score} (${snap.news2?.acuity_tier}).\nProvide a concise 3-4 sentence non-diagnostic clinical inspection observation, red flags to watch for, and next self-care check step.`,
          },
        ];

        if (imageBase64) {
          const cleanBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
          parts.push({
            inlineData: {
              data: cleanBase64,
              mimeType,
            },
          });
        }

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: [{ role: 'user', parts }],
        });

        const text = (response.text ?? '').trim();
        if (text) {
          analysis = text;
          mode = 'uplink-ai';
        }
      } catch (err) {
        console.warn('Multimodal visual exam uplink unavailable, falling back offline:', err);
      }
    }

    if (!analysis) {
      analysis = buildOfflineVisualAnalysis(bodyRegion, notes, snap);
    }

    try {
      const saved = await fetchPythonJson('/api/visual-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body_region: bodyRegion,
          notes,
          image_name: imageName,
          image_analysis: analysis,
        }),
      });
      res.json({
        mode,
        image_analysis: analysis,
        ...saved.data,
      });
      void broadcastState(true);
    } catch (err) {
      res.status(502).json({ error: 'Failed to archive exam into Python SQLite', detail: String(err) });
    }
  });

  // Server-side AI Flight Surgeon & Behavioral Wellness Companion (grounded in Python telemetry)
  app.post('/api/companion/chat', async (req, res) => {
    const userMessage = String(req.body?.message ?? '').trim();
    if (!userMessage) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    let snap: Record<string, any> = {};
    try {
      snap = (await fetchPythonJson('/api/state')).data;
    } catch {
      snap = {};
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const telemetrySummary = JSON.stringify({
          environment: snap.environment_profile?.label,
          gravity_g: snap.environment_profile?.gravity_g,
          ema_spo2_pct: snap.smoothed_spo2,
          ema_heart_rate_bpm: snap.smoothed_heart_rate,
          blood_pressure_mmhg: `${snap.self_assessment?.systolic_bp}/${snap.self_assessment?.diastolic_bp}`,
          blood_glucose_mg_dl: snap.self_assessment?.blood_sugar_mg_dl,
          body_temp_c: snap.self_assessment?.body_temp_c,
          news2_score: snap.news2?.total_score,
          news2_tier: snap.news2?.acuity_tier,
          proton_flux_pfu: snap.radiation_flux,
          radiation_slope_pfu_s: snap.radiation_slope,
          cumulative_dose_msv: snap.cumulative_dose_msv,
          sleep_hours: snap.mental_checkin?.sleep_hours,
          mental_stress_index: snap.mental_stress_index,
          daily_diet_and_exercise: snap.daily_logs_summary,
          active_hazards: Array.isArray(snap.protocols)
            ? snap.protocols.map((p: any) => `${p.severity}: ${p.hazard}`)
            : [],
        });

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Live Astronaut Telemetry (Python Edge Engine):\n${telemetrySummary}\n\nAstronaut Message:\n${userMessage}`,
          config: {
            systemInstruction:
              'You are the onboard AstroHealth Flight Surgeon & Behavioral Wellness Companion supporting an astronaut on a long-duration space mission. Be calm, scientifically accurate, empathetic, and concise (3-5 sentences). Ground advice in their exact live telemetry values and NASA Human Research Program hazards (radiation, isolation, distance from Earth, altered gravity, closed habitat). Give concrete self-care or clinical steps.',
          },
        });

        const reply = (response.text ?? '').trim();
        if (reply) {
          res.json({ reply, mode: 'uplink-ai' });
          return;
        }
      } catch (err) {
        console.warn('Gemini uplink unavailable, switching to offline edge companion:', err);
      }
    }

    const offlineReply = buildOfflineCompanionReply(userMessage, snap);
    res.json({ reply: offlineReply, mode: 'offline-edge' });
  });

  app.get('/api/docs/support-document', (_req, res) => {
    const docPath = path.join(__dirname, 'SUBMISSION_SUPPORT_DOCUMENT.md');
    if (!fs.existsSync(docPath)) {
      res.status(404).json({ error: 'Supporting document not found' });
      return;
    }
    res.download(docPath, 'AstroHealth_Supporting_Document.md');
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `AstroHealth Edge OS running at http://localhost:${PORT} (proxying Python engine at ${PY_BASE_URL})`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to boot AstroHealth Edge OS:', err);
  process.exit(1);
});
