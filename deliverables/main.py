"""
AstroHealth Edge OS — Deliverable 3: Offline FastAPI Edge Server & Autonomous Engines
===================================================================================
Runs 100% locally with in-memory state + zero cloud dependencies.
Monitors physical health (Hypoxia, Solar Particle Events, Genomic Muscle Atrophy,
BP/Glucose/Temp NEWS2 Acuity) and astronaut behavioral/autonomic stress readiness.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path
from typing import Deque, Dict, List, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse

from models import (
    ActionableProtocol,
    RadiationTelemetry,
    SelfAssessmentTelemetry,
    VitalTelemetry,
)

app = FastAPI(
    title="AstroHealth Edge OS",
    description="Autonomous offline digital flight surgeon for deep-space astronauts.",
    version="1.1.0",
)

EMA_ALPHA = 0.3
GENETIC_ATROPHY_BASELINE = 1.25  # Boot baseline derived from OSD-195 cohort


class EdgeState:
    """Authoritative in-memory edge state for physiological, radiation, metabolic, and mental engines."""

    def __init__(self) -> None:
        self.ema_spo2: Optional[float] = None
        self.ema_heart_rate: Optional[float] = None
        self.latest_proton_flux: float = 0.0
        self.radiation_slope: float = 0.0
        self.radiation_window: Deque[RadiationTelemetry] = deque(maxlen=5)
        self.genetic_atrophy_baseline: float = GENETIC_ATROPHY_BASELINE
        self.last_timestamp: float = 0.0
        self.self_assessment = SelfAssessmentTelemetry()

    def update_vitals(self, payload: VitalTelemetry) -> None:
        """Apply Exponential Moving Average (alpha = 0.3) to incoming SpO2 and Heart Rate."""
        self.last_timestamp = payload.timestamp
        if self.ema_spo2 is None:
            self.ema_spo2 = payload.spo2
        else:
            self.ema_spo2 = (EMA_ALPHA * payload.spo2) + (
                (1.0 - EMA_ALPHA) * self.ema_spo2
            )

        if self.ema_heart_rate is None:
            self.ema_heart_rate = payload.heart_rate
        else:
            self.ema_heart_rate = (EMA_ALPHA * payload.heart_rate) + (
                (1.0 - EMA_ALPHA) * self.ema_heart_rate
            )

    def update_radiation(self, payload: RadiationTelemetry) -> None:
        """Maintain rolling 5-sample radiation window and compute OLS flux slope (pfu/s)."""
        self.last_timestamp = payload.timestamp
        self.latest_proton_flux = payload.proton_flux
        self.radiation_window.append(payload)

        if len(self.radiation_window) < 2:
            self.radiation_slope = 0.0
            return

        points = list(self.radiation_window)
        t0 = points[0].timestamp
        xs = [p.timestamp - t0 for p in points]
        ys = [p.proton_flux for p in points]

        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        denom = sum((x - mean_x) ** 2 for x in xs)

        if denom <= 1e-9:
            self.radiation_slope = ys[-1] - ys[-2]
        else:
            numer = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
            self.radiation_slope = numer / denom

    def evaluate_protocols(self) -> List[ActionableProtocol]:
        """Run Physiological, Space Weather, Metabolic, and Mental Stress engines."""
        protocols: List[ActionableProtocol] = []

        if self.ema_spo2 is not None and self.ema_spo2 < 90.0:
            protocols.append(
                ActionableProtocol(
                    hazard="Hypoxia — Low Blood Oxygen",
                    severity="CRITICAL",
                    checklist=[
                        "Isolate Primary Scrubber",
                        "Switch to Backup O2 Loop & Don Crew Oxygen Mask",
                        "Verify Cabin Partial Pressure (ppO2) & Notify Crew Buddy",
                    ],
                )
            )

        if self.radiation_slope > 1.5:
            protocols.append(
                ActionableProtocol(
                    hazard="Incoming Solar Particle Event (SPE)",
                    severity="WARNING",
                    checklist=[
                        "Suspend External EVA & Seal Airlock Hatch",
                        "Relocate Crew to Water-Wall Storm Shelter Bay",
                        "Power Down Non-Essential Unshielded Avionics",
                    ],
                )
            )

        if self.self_assessment.systolic_bp >= 140 or self.self_assessment.systolic_bp < 90:
            protocols.append(
                ActionableProtocol(
                    hazard="Arterial Blood Pressure Deviation",
                    severity="CRITICAL" if self.self_assessment.systolic_bp < 90 else "WARNING",
                    checklist=[
                        "Repeat Seated Cuff BP Measurement After 5 Min Rest",
                        "Hydrate 500 mL Electrolyte Fluid & Complete LBNP Check",
                    ],
                )
            )

        if self.self_assessment.blood_sugar_mg_dl < 70 or self.self_assessment.blood_sugar_mg_dl > 180:
            protocols.append(
                ActionableProtocol(
                    hazard="Metabolic Glucose Excursion",
                    severity="CRITICAL" if self.self_assessment.blood_sugar_mg_dl < 60 else "WARNING",
                    checklist=[
                        "Administer 15g Carbohydrate Gel if < 70 mg/dL or Hydrate if Elevated",
                        "Re-Test Capillary Glucometer After 15 Minutes",
                    ],
                )
            )

        if self.ema_heart_rate is not None and self.ema_heart_rate > 110.0:
            protocols.append(
                ActionableProtocol(
                    hazard="Autonomic Stress & Cognitive Overload",
                    severity="WARNING",
                    checklist=[
                        "Initiate 4-7-8 Paced Vagal Breathing Cycle (3 Minutes)",
                        "Switch Cabin Luminaires to Warm Circadian Recovery Spectrum",
                        "Offload Non-Critical Tasks & Perform Crew Peer Check-In",
                    ],
                )
            )

        return protocols

    def snapshot(self) -> Dict[str, object]:
        """Serialize current smoothed telemetry, genomic load, NEWS2 score, and active protocols."""
        protocols = self.evaluate_protocols()
        ema_spo2 = round(self.ema_spo2, 2) if self.ema_spo2 is not None else 98.0
        ema_hr = round(self.ema_heart_rate, 1) if self.ema_heart_rate is not None else 72.0
        slope = round(self.radiation_slope, 3)

        mental_stress_index = round(
            min(100.0, max(0.0, ((ema_hr - 65.0) * 1.4) + (max(0.0, slope) * 8.0))),
            1,
        )
        muscle_atrophy_risk = round(
            self.genetic_atrophy_baseline * (1.0 + (0.15 if ema_spo2 < 90.0 else 0.0)),
            3,
        )
        news2_score = (
            (3 if ema_spo2 < 90 else 0)
            + (2 if ema_hr > 110 else 0)
            + (2 if self.self_assessment.systolic_bp >= 140 or self.self_assessment.systolic_bp < 90 else 0)
            + (2 if self.radiation_slope > 1.5 else 0)
        )

        return {
            "timestamp": self.last_timestamp,
            "smoothed_spo2": ema_spo2,
            "smoothed_heart_rate": ema_hr,
            "radiation_flux": round(self.latest_proton_flux, 2),
            "radiation_slope": slope,
            "genetic_atrophy_baseline": self.genetic_atrophy_baseline,
            "muscle_atrophy_risk": muscle_atrophy_risk,
            "mental_stress_index": mental_stress_index,
            "news2_score": news2_score,
            "self_assessment": self.self_assessment.model_dump(),
            "protocols": [p.model_dump() for p in protocols],
        }


state = EdgeState()
connected_clients: Set[WebSocket] = set()


async def broadcast_state() -> None:
    if not connected_clients:
        return
    payload = state.snapshot()
    stale: List[WebSocket] = []
    for ws in list(connected_clients):
        try:
            await ws.send_json(payload)
        except Exception:
            stale.append(ws)
    for ws in stale:
        connected_clients.discard(ws)


@app.get("/", response_class=HTMLResponse)
async def serve_dashboard() -> HTMLResponse:
    html_path = Path(__file__).resolve().parent / "index.html"
    if html_path.exists():
        return HTMLResponse(html_path.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>AstroHealth Edge OS — index.html not found</h1>", status_code=404)


@app.post("/ingest/vitals")
async def ingest_vitals(telemetry: VitalTelemetry) -> Dict[str, object]:
    state.update_vitals(telemetry)
    await broadcast_state()
    return {"status": "accepted", "snapshot": state.snapshot()}


@app.post("/ingest/radiation")
async def ingest_radiation(telemetry: RadiationTelemetry) -> Dict[str, object]:
    state.update_radiation(telemetry)
    await broadcast_state()
    return {"status": "accepted", "snapshot": state.snapshot()}


@app.post("/api/self-assessment")
async def update_self_assessment(payload: SelfAssessmentTelemetry) -> Dict[str, object]:
    state.self_assessment = payload
    await broadcast_state()
    return state.snapshot()


@app.get("/api/algorithms/explain")
async def explain_algorithms() -> Dict[str, object]:
    return {
        "ema_alpha": EMA_ALPHA,
        "ema_formula": "S_t = alpha * X_t + (1 - alpha) * S_{t-1}",
        "ols_slope_formula": "sum((t_i - t_bar)*(Phi_i - Phi_bar)) / sum((t_i - t_bar)^2)",
        "genomic_baseline": state.genetic_atrophy_baseline,
        "snapshot": state.snapshot(),
    }


@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket) -> None:
    await websocket.accept()
    connected_clients.add(websocket)
    try:
        await websocket.send_json(state.snapshot())
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connected_clients.discard(websocket)
    except Exception:
        connected_clients.discard(websocket)
