"""
AstroHealth Edge OS — Deliverable 5: Asynchronous Hardware Stream Simulator
===========================================================================
Reads `simulation_feed.csv` line-by-line and streams radiation and vital payloads
to the local FastAPI edge server at a 1-second cadence using httpx + asyncio.
"""

from __future__ import annotations

import asyncio
import csv
import logging
from pathlib import Path
from typing import Optional

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("astrohealth.simulator")

BASE_URL = "http://localhost:8000"


def resolve_feed_path() -> Path:
    """Locate simulation_feed.csv across standard local relative directories."""
    candidates = [
        Path.cwd() / "simulation_feed.csv",
        Path.cwd() / "data" / "simulation_feed.csv",
        Path(__file__).resolve().parent / "simulation_feed.csv",
        Path(__file__).resolve().parent.parent / "data" / "simulation_feed.csv",
    ]
    for path in candidates:
        if path.exists() and path.is_file():
            return path
    raise FileNotFoundError(
        "Could not locate simulation_feed.csv. Run clean_and_merge.py first."
    )


async def stream_simulation(
    feed_path: Optional[Path] = None,
    base_url: str = BASE_URL,
    interval_seconds: float = 1.0,
) -> None:
    """Iterate through simulation_feed.csv and POST telemetry every 1 second."""
    csv_path = feed_path or resolve_feed_path()
    logger.info("Starting 1 Hz local hardware telemetry stream from %s", csv_path)

    async with httpx.AsyncClient(base_url=base_url, timeout=5.0) as client:
        with csv_path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                try:
                    tick = float(row["sim_tick"])
                    radiation_payload = {
                        "sensor_id": "RAD-DOSIMETER-BAY1",
                        "timestamp": tick,
                        "proton_flux": float(row["proton_flux"]),
                    }
                    vitals_payload = {
                        "sensor_id": "CREW-BIOMETRIC-01",
                        "timestamp": tick,
                        "heart_rate": float(row["heart_rate"]),
                        "spo2": float(row["spo2"]),
                    }

                    rad_resp, vit_resp = await asyncio.gather(
                        client.post("/ingest/radiation", json=radiation_payload),
                        client.post("/ingest/vitals", json=vitals_payload),
                    )
                    rad_resp.raise_for_status()
                    vit_resp.raise_for_status()

                    logger.info(
                        "Tick %02d | SpO2=%.1f%% | HR=%.1f bpm | Flux=%.2f pfu",
                        int(tick),
                        vitals_payload["spo2"],
                        vitals_payload["heart_rate"],
                        radiation_payload["proton_flux"],
                    )
                except httpx.RequestError as exc:
                    logger.error("Local server unreachable at %s: %s", base_url, exc)
                except (KeyError, ValueError) as exc:
                    logger.warning("Skipping malformed CSV row: %s", exc)

                await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    try:
        asyncio.run(stream_simulation())
    except KeyboardInterrupt:
        logger.info("Hardware stream simulator stopped by crew.")
