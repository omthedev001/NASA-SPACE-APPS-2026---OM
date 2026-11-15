"""
AstroHealth Edge OS — Real-Time Python 3 Standard-Library Edge Backend & EHR Engine
===================================================================================
Executes 100% locally in Python with zero third-party dependencies so it runs
natively in constrained spacecraft edge environments (and inside this workspace).

Provides:
  - Physiological EMA Engine (alpha = 0.30) on SpO2 and Heart Rate
  - Space Weather 5-Sample OLS Slope Engine (dPhi/dt > 1.5 pfu/s -> SPE WARNING)
  - Genomic OSD-195 Muscle/Bone Atrophy Multiplier (1.25x baseline + gravity/stress)
  - Spaceflight Modified NEWS2 Clinical Acuity Scorer (0-16 points)
  - Behavioral Mental Stress Index Engine (autonomic + sleep + mood + isolation)
  - Persistent SQLite Electronic Health Record (EHR) & Alert Audit Log
  - Live mathematical trace endpoint (/api/algorithms/explain)
"""

from __future__ import annotations

import csv
import json
import math
import os
import sqlite3
import sys
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional, Tuple
from urllib.parse import urlparse

PORT = int(os.environ.get("ASTROHEALTH_PY_PORT", "8001"))
EMA_ALPHA = 0.30
GENETIC_ATROPHY_BASELINE = 1.25
NASA_30DAY_BFO_LIMIT_MSV = 250.0

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FEED_CSV_PATH = DATA_DIR / "simulation_feed.csv"
DB_PATH = DATA_DIR / "astrohealth_mission.db"

ENVIRONMENT_PROFILES: Dict[str, Dict[str, Any]] = {
    "spacecraft": {
        "label": "Deep-Space Transit Spacecraft",
        "gravity_g": 0.0,
        "shielding_factor": 1.0,
        "comm_delay": "14.2 min one-way",
    },
    "station": {
        "label": "Orbital Space Station",
        "gravity_g": 0.0,
        "shielding_factor": 0.72,
        "comm_delay": "1.8 sec relay",
    },
    "rover": {
        "label": "Pressurized Surface Rover",
        "gravity_g": 0.38,
        "shielding_factor": 1.35,
        "comm_delay": "14.2 min + dust EVA",
    },
    "base": {
        "label": "Lunar / Mars Surface Base",
        "gravity_g": 0.16,
        "shielding_factor": 0.82,
        "comm_delay": "14.2 min regolith bay",
    },
}


def _safe_float(raw: Any, sentinels: Tuple[float, ...] = (-9999.0, -999999.0, -999.0)) -> Optional[float]:
    if raw is None:
        return None
    txt = str(raw).strip()
    if not txt or txt.lower() in ("nan", "na", "null", "none", "-"):
        return None
    try:
        val = float(txt)
    except ValueError:
        return None
    if not math.isfinite(val):
        return None
    for sentinel in sentinels:
        if abs(val - sentinel) < 1e-6:
            return None
    return val


def _ffill_bfill(values: List[Optional[float]], default: float) -> List[float]:
    if not values:
        return []
    out: List[Optional[float]] = list(values)
    last_val: Optional[float] = None
    for idx, val in enumerate(out):
        if val is not None:
            last_val = val
        elif last_val is not None:
            out[idx] = last_val
    next_val: Optional[float] = None
    for idx in range(len(out) - 1, -1, -1):
        val = out[idx]
        if val is not None:
            next_val = val
        elif next_val is not None:
            out[idx] = next_val
    return [float(v) if v is not None else default for v in out]


def _pick_col(headers: List[str], candidates: Tuple[str, ...]) -> Optional[str]:
    lower_map = {h.strip().lower(): h for h in headers}
    for cand in candidates:
        if cand.lower() in lower_map:
            return lower_map[cand.lower()]
    return None


def parse_radiation_datasets(radiation_dir: Path) -> List[Dict[str, float]]:
    if not radiation_dir.exists():
        return []
    files = sorted(list(radiation_dir.glob("*.ict")) + list(radiation_dir.glob("*.csv")))
    raw_rows: List[Tuple[float, Optional[float], Optional[float]]] = []

    for fpath in files:
        with fpath.open("r", encoding="utf-8", errors="replace") as handle:
            lines = handle.read().splitlines()
        if not lines:
            continue

        skip_rows = 0
        if fpath.suffix.lower() == ".ict":
            first_token = lines[0].split(",")[0].strip()
            try:
                header_lines = int(first_token)
                skip_rows = max(0, header_lines - 1)
            except ValueError:
                skip_rows = 0

        data_lines = lines[skip_rows:]
        if len(data_lines) < 2:
            continue
        reader = csv.DictReader(data_lines)
        if not reader.fieldnames:
            continue
        col_time = _pick_col(
            reader.fieldnames,
            ("Julian_date", "julian_date", "Start_UTC", "time_utc", "timestamp", "sim_tick"),
        )
        col_flux = _pick_col(
            reader.fieldnames,
            ("P01", "proton_flux", "Proton_Flux", "flux", "p_flux"),
        )
        col_dose = _pick_col(
            reader.fieldnames,
            ("ARML3dr", "ambient_dose", "Ambient_Dose", "dose_rate", "dose"),
        )
        if not col_flux:
            continue

        for idx, row in enumerate(reader):
            t_val = _safe_float(row.get(col_time)) if col_time else None
            if t_val is None:
                t_val = 2461359.5 + (idx * 0.00001)
            f_val = _safe_float(row.get(col_flux))
            d_val = _safe_float(row.get(col_dose)) if col_dose else None
            raw_rows.append((t_val, f_val, d_val))

    if not raw_rows:
        return []
    raw_rows.sort(key=lambda r: r[0])
    fluxes = _ffill_bfill([r[1] for r in raw_rows], 1.24)
    doses = _ffill_bfill([r[2] for r in raw_rows], 0.41)
    return [
        {
            "julian_date": round(raw_rows[i][0], 5),
            "proton_flux": round(max(0.0, fluxes[i]), 2),
            "ambient_dose": round(max(0.0, doses[i]), 2),
        }
        for i in range(len(raw_rows))
    ]


def parse_osd195_datasets(osd_dir: Path) -> Tuple[float, Dict[str, float]]:
    if not osd_dir.exists():
        return GENETIC_ATROPHY_BASELINE, {}
    files = sorted(
        list(osd_dir.glob("*.txt")) + list(osd_dir.glob("*.tsv")) + list(osd_dir.glob("*.csv"))
    )
    all_values: List[float] = []
    gene_buckets: Dict[str, List[float]] = {}

    for fpath in files:
        with fpath.open("r", encoding="utf-8", errors="replace") as handle:
            lines = [ln for ln in handle.read().splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
        if len(lines) < 2:
            continue
        delimiter = "\t" if "\t" in lines[0] else ","
        reader = csv.DictReader(lines, delimiter=delimiter)
        if not reader.fieldnames:
            continue
        col_val = _pick_col(reader.fieldnames, ("VALUE", "value", "rma", "expression", "log2fc"))
        col_gene = _pick_col(reader.fieldnames, ("GENE_SYMBOL", "gene_symbol", "SYMBOL", "gene", "probe_id"))
        numeric_cols = [
            c
            for c in reader.fieldnames
            if c.strip().upper() not in ("PROBE_ID", "SUBJECT_ID", "GENE_SYMBOL", "SYMBOL", "GENE", "ID_REF")
        ]

        for row in reader:
            row_vals: List[float] = []
            if col_val:
                v = _safe_float(row.get(col_val), sentinels=(-9999.0,))
                if v is not None:
                    row_vals.append(v)
            else:
                for c in numeric_cols:
                    v = _safe_float(row.get(c), sentinels=(-9999.0,))
                    if v is not None:
                        row_vals.append(v)
            if not row_vals:
                continue
            mean_row = sum(row_vals) / len(row_vals)
            all_values.append(mean_row)
            if col_gene:
                sym = str(row.get(col_gene, "")).strip().upper()
                if sym:
                    gene_buckets.setdefault(sym, []).append(mean_row)

    baseline = round(sum(all_values) / len(all_values), 4) if all_values else GENETIC_ATROPHY_BASELINE
    gene_means = {
        sym: round(sum(vals) / len(vals), 3)
        for sym, vals in gene_buckets.items()
        if vals
    }
    return baseline, gene_means


def parse_mimic_datasets(mimic_dir: Path, max_rows: int = 500) -> List[Dict[str, float]]:
    if not mimic_dir.exists():
        return []

    labevents_path = mimic_dir / "LABEVENTS.csv"
    d_labitems_path = mimic_dir / "D_LABITEMS.csv"
    if not labevents_path.exists():
        csvs = sorted(p for p in mimic_dir.glob("*.csv") if p.name.upper() != "D_LABITEMS.CSV")
        if not csvs:
            return []
        direct_rows: List[Dict[str, float]] = []
        with csvs[0].open("r", encoding="utf-8", errors="replace", newline="") as handle:
            reader = csv.DictReader(handle)
            if not reader.fieldnames:
                return []
            col_hr = _pick_col(reader.fieldnames, ("heart_rate", "hr", "pulse"))
            col_spo2 = _pick_col(reader.fieldnames, ("spo2", "oxygen_saturation", "o2sat"))
            col_lac = _pick_col(reader.fieldnames, ("lactate",))
            for idx, row in enumerate(reader):
                if idx >= max_rows:
                    break
                hr_v = _safe_float(row.get(col_hr)) if col_hr else None
                sp_v = _safe_float(row.get(col_spo2)) if col_spo2 else None
                lac_v = _safe_float(row.get(col_lac)) if col_lac else None
                direct_rows.append(
                    {
                        "heart_rate": hr_v if hr_v is not None else 72.0,
                        "spo2": sp_v if sp_v is not None else 98.0,
                        "lactate": lac_v if lac_v is not None else 1.1,
                    }
                )
        return direct_rows

    item_labels: Dict[str, str] = {}
    if d_labitems_path.exists():
        with d_labitems_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames:
                col_id = _pick_col(reader.fieldnames, ("itemid", "ITEMID"))
                col_lbl = _pick_col(reader.fieldnames, ("label", "LABEL"))
                if col_id and col_lbl:
                    for row in reader:
                        iid = str(row.get(col_id, "")).strip()
                        lbl = str(row.get(col_lbl, "")).strip().lower()
                        if "heart rate" in lbl or lbl in ("hr", "pulse"):
                            item_labels[iid] = "heart_rate"
                        elif "oxygen saturation" in lbl or "spo2" in lbl or "o2 sat" in lbl:
                            item_labels[iid] = "spo2"
                        elif "lactate" in lbl:
                            item_labels[iid] = "lactate"

    if not item_labels:
        item_labels = {
            "50818": "heart_rate",
            "50821": "spo2",
            "50813": "lactate",
            "220045": "heart_rate",
            "220277": "spo2",
        }

    target_subject: Optional[str] = None
    pivoted: Dict[str, Dict[str, List[float]]] = {}
    with labevents_path.open("r", encoding="utf-8", errors="replace", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            return []
        col_subj = _pick_col(reader.fieldnames, ("subject_id", "SUBJECT_ID"))
        col_item = _pick_col(reader.fieldnames, ("itemid", "ITEMID"))
        col_time = _pick_col(reader.fieldnames, ("charttime", "CHARTTIME", "timestamp"))
        col_val = _pick_col(reader.fieldnames, ("valuenum", "VALUENUM", "value", "VALUE"))
        if not (col_item and col_time and col_val):
            return []

        for row in reader:
            iid = str(row.get(col_item, "")).strip()
            metric = item_labels.get(iid)
            if not metric:
                continue
            subj = str(row.get(col_subj, "0")).strip() if col_subj else "0"
            if target_subject is None:
                target_subject = subj
            if subj != target_subject:
                continue
            val = _safe_float(row.get(col_val))
            if val is None:
                continue
            ctime = str(row.get(col_time, "")).strip()
            if not ctime:
                continue
            if ctime not in pivoted and len(pivoted) >= max_rows:
                continue
            bucket = pivoted.setdefault(ctime, {})
            bucket.setdefault(metric, []).append(val)

    if not pivoted:
        return []
    sorted_times = sorted(pivoted.keys())[:max_rows]
    hr_series: List[Optional[float]] = []
    sp_series: List[Optional[float]] = []
    lac_series: List[Optional[float]] = []
    for ts in sorted_times:
        cell = pivoted[ts]
        hr_series.append(sum(cell["heart_rate"]) / len(cell["heart_rate"]) if "heart_rate" in cell else None)
        sp_series.append(sum(cell["spo2"]) / len(cell["spo2"]) if "spo2" in cell else None)
        lac_series.append(sum(cell["lactate"]) / len(cell["lactate"]) if "lactate" in cell else None)

    hr_clean = _ffill_bfill(hr_series, 72.0)
    sp_clean = _ffill_bfill(sp_series, 98.0)
    lac_clean = _ffill_bfill(lac_series, 1.1)
    return [
        {
            "heart_rate": round(hr_clean[i], 1),
            "spo2": round(min(100.0, max(0.0, sp_clean[i])), 1),
            "lactate": round(lac_clean[i], 2),
        }
        for i in range(len(sorted_times))
    ]


def rebuild_simulation_feed_from_raw(data_dir: Path = DATA_DIR) -> Dict[str, Any]:
    """Pure-Python ETL pipeline: cleans radiation, OSD-195, and MIMIC-III into simulation_feed.csv."""
    rad_rows = parse_radiation_datasets(data_dir / "radiation")
    baseline, gene_means = parse_osd195_datasets(data_dir / "osd195")
    icu_rows = parse_mimic_datasets(data_dir / "mimic")

    if not rad_rows and not icu_rows:
        raise ValueError("No valid radiation (.ict/.csv) or MIMIC-III clinical records found in data/.")

    if not rad_rows:
        rad_rows = [
            {"julian_date": 2461359.5 + (i * 0.00001), "proton_flux": 1.24, "ambient_dose": 0.41}
            for i in range(len(icu_rows))
        ]
    if not icu_rows:
        icu_rows = [
            {"heart_rate": 72.0, "spo2": 98.2, "lactate": 1.1}
            for _ in range(len(rad_rows))
        ]

    aligned_len = min(len(rad_rows), len(icu_rows))
    out_path = data_dir / "simulation_feed.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "sim_tick",
                "julian_date",
                "proton_flux",
                "ambient_dose",
                "heart_rate",
                "spo2",
                "lactate",
                "genetic_atrophy_baseline",
            ]
        )
        for idx in range(aligned_len):
            writer.writerow(
                [
                    idx,
                    rad_rows[idx]["julian_date"],
                    rad_rows[idx]["proton_flux"],
                    rad_rows[idx]["ambient_dose"],
                    icu_rows[idx]["heart_rate"],
                    icu_rows[idx]["spo2"],
                    icu_rows[idx]["lactate"],
                    baseline,
                ]
            )

    return {
        "aligned_rows": aligned_len,
        "radiation_rows": len(rad_rows),
        "mimic_rows": len(icu_rows),
        "genetic_atrophy_baseline": baseline,
        "osd_genes": gene_means,
        "output_file": "simulation_feed.csv",
    }


def get_dataset_inventory(data_dir: Path = DATA_DIR) -> Dict[str, Any]:
    def list_folder(sub: str) -> List[Dict[str, Any]]:
        folder = data_dir / sub
        if not folder.exists():
            return []
        items: List[Dict[str, Any]] = []
        for p in sorted(folder.iterdir()):
            if p.is_file():
                items.append({"name": p.name, "bytes": p.stat().st_size})
        return items

    feed_rows = load_simulation_feed()
    baseline = feed_rows[0]["genetic_atrophy_baseline"] if feed_rows else GENETIC_ATROPHY_BASELINE
    return {
        "radiation_files": list_folder("radiation"),
        "osd195_files": list_folder("osd195"),
        "mimic_files": list_folder("mimic"),
        "feed_exists": FEED_CSV_PATH.exists(),
        "feed_rows": len(feed_rows),
        "feed_bytes": FEED_CSV_PATH.stat().st_size if FEED_CSV_PATH.exists() else 0,
        "genetic_atrophy_baseline": baseline,
    }


def _row_num(lower_row: Dict[str, Any], *keys: str) -> Optional[float]:
    for key in keys:
        val = _safe_float(lower_row.get(key.lower()))
        if val is not None:
            return val
    return None


def _po2_to_spo2_severinghaus(po2_mmhg: float) -> float:
    """Severinghaus (1979) arterial O2-hemoglobin dissociation conversion."""
    p = max(10.0, po2_mmhg)
    sat = 100.0 / (1.0 + (23400.0 / ((p ** 3) + (150.0 * p))))
    return round(min(100.0, max(50.0, sat)), 2)


def load_simulation_feed() -> List[Dict[str, Any]]:
    if not FEED_CSV_PATH.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with FEED_CSV_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for idx, row in enumerate(reader):
            lower_row = {
                str(k).strip().lower(): v
                for k, v in row.items()
                if k is not None
            }
            sim_tick = _row_num(lower_row, "sim_tick", "tick")
            if sim_tick is None:
                sim_tick = float(idx)
            julian_date = _row_num(lower_row, "julian_date", "start_utc")
            if julian_date is None:
                julian_date = round(2461359.5 + (sim_tick * 0.00001), 5)

            proton_flux = _row_num(lower_row, "proton_flux", "p01", "flux")
            if proton_flux is None:
                proton_flux = 1.24

            ambient_dose = _row_num(lower_row, "ambient_dose", "arml3dr", "dose_rate")
            if ambient_dose is None:
                ambient_dose = 0.41

            po2 = _row_num(lower_row, "po2")
            pco2 = _row_num(lower_row, "pco2")
            ph_val = _row_num(lower_row, "ph")
            lactate = _row_num(lower_row, "lactate")
            if lactate is None:
                lactate = 1.1

            glucose = _row_num(lower_row, "glucose", "blood_sugar_mg_dl")
            temperature = _row_num(lower_row, "temperature", "body_temp_c")
            cortisol = _row_num(lower_row, "cortisol")
            crp = _row_num(lower_row, "c-reactive protein", "crp")
            hemoglobin = _row_num(lower_row, "hemoglobin")
            wbc = _row_num(lower_row, "white blood cells", "wbc")
            sodium = _row_num(lower_row, "sodium")
            potassium = _row_num(lower_row, "potassium")

            spo2 = _row_num(lower_row, "spo2", "oxygen saturation", "o2sat")
            if spo2 is None:
                if po2 is not None and po2 > 0:
                    spo2 = _po2_to_spo2_severinghaus(po2)
                else:
                    spo2 = 98.0

            heart_rate = _row_num(lower_row, "heart_rate", "heart rate", "hr", "pulse")
            if heart_rate is None:
                temp_c = temperature if temperature is not None else 37.0
                cort_v = cortisol if cortisol is not None else 18.0
                derived_hr = (
                    70.0
                    + max(0.0, temp_c - 37.0) * 10.0
                    + max(0.0, lactate - 1.5) * 4.5
                    + max(0.0, cort_v - 20.0) * 0.15
                )
                heart_rate = round(min(145.0, max(55.0, derived_hr)), 1)

            baseline = _row_num(lower_row, "genetic_atrophy_baseline")
            if baseline is None or baseline <= 0:
                baseline = GENETIC_ATROPHY_BASELINE

            rows.append(
                {
                    "sim_tick": float(sim_tick),
                    "julian_date": float(julian_date),
                    "proton_flux": round(max(0.0, float(proton_flux)), 3),
                    "ambient_dose": round(max(0.0, float(ambient_dose)), 3),
                    "heart_rate": round(float(heart_rate), 1),
                    "spo2": round(min(100.0, max(50.0, float(spo2))), 2),
                    "lactate": round(float(lactate), 2),
                    "glucose": round(float(glucose), 1) if glucose is not None else None,
                    "temperature": round(float(temperature), 1) if temperature is not None else None,
                    "cortisol": round(float(cortisol), 1) if cortisol is not None else None,
                    "crp": round(float(crp), 2) if crp is not None else None,
                    "hemoglobin": round(float(hemoglobin), 1) if hemoglobin is not None else None,
                    "wbc": round(float(wbc), 1) if wbc is not None else None,
                    "po2": round(float(po2), 1) if po2 is not None else None,
                    "pco2": round(float(pco2), 1) if pco2 is not None else None,
                    "ph": round(float(ph_val), 2) if ph_val is not None else None,
                    "sodium": round(float(sodium), 1) if sodium is not None else None,
                    "potassium": round(float(potassium), 2) if potassium is not None else None,
                    "genetic_atrophy_baseline": round(float(baseline), 4),
                }
            )
    return rows


class MissionDatabase:
    """Thread-safe SQLite Medical EHR & Alert Log for offline survivability."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._lock, self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS crew_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    environment TEXT NOT NULL,
                    completed_routines TEXT NOT NULL,
                    mental_checkin TEXT NOT NULL,
                    self_assessment TEXT NOT NULL,
                    updated_utc TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS exam_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_utc TEXT NOT NULL,
                    met_seconds REAL NOT NULL,
                    exam_type TEXT NOT NULL,
                    environment TEXT NOT NULL,
                    systolic_bp INTEGER,
                    diastolic_bp INTEGER,
                    blood_sugar_mg_dl INTEGER,
                    body_temp_c REAL,
                    spo2_pct REAL,
                    heart_rate_bpm REAL,
                    news2_score INTEGER NOT NULL,
                    acuity_tier TEXT NOT NULL,
                    notes TEXT NOT NULL,
                    body_region TEXT DEFAULT '',
                    image_name TEXT DEFAULT '',
                    image_analysis TEXT DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS alert_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_utc TEXT NOT NULL,
                    met_seconds REAL NOT NULL,
                    protocol_id TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    hazard TEXT NOT NULL,
                    status TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS diet_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_utc TEXT NOT NULL,
                    met_seconds REAL NOT NULL,
                    meal_type TEXT NOT NULL,
                    description TEXT NOT NULL,
                    calories_kcal INTEGER NOT NULL,
                    protein_g INTEGER NOT NULL,
                    water_ml INTEGER NOT NULL,
                    vitamin_d_iu INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS exercise_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_utc TEXT NOT NULL,
                    met_seconds REAL NOT NULL,
                    modality TEXT NOT NULL,
                    duration_min INTEGER NOT NULL,
                    intensity TEXT NOT NULL,
                    resistance_load_pct INTEGER NOT NULL,
                    calories_burned INTEGER NOT NULL,
                    notes TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS mental_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    created_utc TEXT NOT NULL,
                    met_seconds REAL NOT NULL,
                    mood_score INTEGER NOT NULL,
                    stress_level INTEGER NOT NULL,
                    sleep_hours REAL NOT NULL,
                    triggers TEXT NOT NULL,
                    journal_entry TEXT NOT NULL
                );
                """
            )
            conn.commit()

    def load_preferences(self) -> Optional[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT * FROM crew_state WHERE id = 1").fetchone()
            if not row:
                return None
            return {
                "environment": row["environment"],
                "completed_routines": json.loads(row["completed_routines"]),
                "mental_checkin": json.loads(row["mental_checkin"]),
                "self_assessment": json.loads(row["self_assessment"]),
            }

    def save_preferences(
        self,
        environment: str,
        completed_routines: List[str],
        mental_checkin: Dict[str, Any],
        self_assessment: Dict[str, Any],
    ) -> None:
        now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO crew_state (id, environment, completed_routines, mental_checkin, self_assessment, updated_utc)
                VALUES (1, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    environment = excluded.environment,
                    completed_routines = excluded.completed_routines,
                    mental_checkin = excluded.mental_checkin,
                    self_assessment = excluded.self_assessment,
                    updated_utc = excluded.updated_utc
                """,
                (
                    environment,
                    json.dumps(completed_routines),
                    json.dumps(mental_checkin),
                    json.dumps(self_assessment),
                    now_utc,
                ),
            )
            conn.commit()

    def insert_exam_record(self, record: Dict[str, Any]) -> int:
        now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO exam_records (
                    created_utc, met_seconds, exam_type, environment,
                    systolic_bp, diastolic_bp, blood_sugar_mg_dl, body_temp_c,
                    spo2_pct, heart_rate_bpm, news2_score, acuity_tier,
                    notes, body_region, image_name, image_analysis
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now_utc,
                    record["met_seconds"],
                    record["exam_type"],
                    record["environment"],
                    record.get("systolic_bp"),
                    record.get("diastolic_bp"),
                    record.get("blood_sugar_mg_dl"),
                    record.get("body_temp_c"),
                    record.get("spo2_pct"),
                    record.get("heart_rate_bpm"),
                    record["news2_score"],
                    record["acuity_tier"],
                    record.get("notes", ""),
                    record.get("body_region", ""),
                    record.get("image_name", ""),
                    record.get("image_analysis", ""),
                ),
            )
            conn.commit()
            return int(cur.lastrowid or 0)

    def insert_alert_event(
        self, met_seconds: float, protocol_id: str, severity: str, hazard: str, status: str
    ) -> None:
        now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO alert_events (created_utc, met_seconds, protocol_id, severity, hazard, status)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (now_utc, met_seconds, protocol_id, severity, hazard, status),
            )
            conn.commit()

    def get_exam_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM exam_records ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def get_alert_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM alert_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
            return [dict(r) for r in rows]

    def insert_diet_log(self, entry: Dict[str, Any]) -> int:
        now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO diet_logs (
                    created_utc, met_seconds, meal_type, description,
                    calories_kcal, protein_g, water_ml, vitamin_d_iu
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now_utc,
                    entry["met_seconds"],
                    entry["meal_type"],
                    entry["description"],
                    entry["calories_kcal"],
                    entry["protein_g"],
                    entry["water_ml"],
                    entry["vitamin_d_iu"],
                ),
            )
            conn.commit()
            return int(cur.lastrowid or 0)

    def insert_exercise_log(self, entry: Dict[str, Any]) -> int:
        now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO exercise_logs (
                    created_utc, met_seconds, modality, duration_min,
                    intensity, resistance_load_pct, calories_burned, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now_utc,
                    entry["met_seconds"],
                    entry["modality"],
                    entry["duration_min"],
                    entry["intensity"],
                    entry["resistance_load_pct"],
                    entry["calories_burned"],
                    entry["notes"],
                ),
            )
            conn.commit()
            return int(cur.lastrowid or 0)

    def insert_mental_log(self, entry: Dict[str, Any]) -> int:
        now_utc = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                """
                INSERT INTO mental_logs (
                    created_utc, met_seconds, mood_score, stress_level,
                    sleep_hours, triggers, journal_entry
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    now_utc,
                    entry["met_seconds"],
                    entry["mood_score"],
                    entry["stress_level"],
                    entry["sleep_hours"],
                    entry["triggers"],
                    entry["journal_entry"],
                ),
            )
            conn.commit()
            return int(cur.lastrowid or 0)

    def get_diet_logs(self, limit: int = 30) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM diet_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def get_exercise_logs(self, limit: int = 30) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM exercise_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def get_mental_logs(self, limit: int = 30) -> List[Dict[str, Any]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT * FROM mental_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def get_daily_logs_summary(self) -> Dict[str, Any]:
        with self._lock, self._connect() as conn:
            d = conn.execute(
                "SELECT COUNT(*) AS c, COALESCE(SUM(calories_kcal), 0) AS kcal, "
                "COALESCE(SUM(protein_g), 0) AS protein, COALESCE(SUM(water_ml), 0) AS water, "
                "COALESCE(SUM(vitamin_d_iu), 0) AS vit_d FROM diet_logs"
            ).fetchone()
            ex = conn.execute(
                "SELECT COUNT(*) AS c, COALESCE(SUM(duration_min), 0) AS mins, "
                "COALESCE(SUM(calories_burned), 0) AS burned FROM exercise_logs"
            ).fetchone()
            mn = conn.execute("SELECT COUNT(*) AS c FROM mental_logs").fetchone()
        return {
            "diet_logs_count": int(d["c"]),
            "total_calories_kcal": int(d["kcal"]),
            "total_protein_g": int(d["protein"]),
            "total_water_ml": int(d["water"]),
            "total_vitamin_d_iu": int(d["vit_d"]),
            "exercise_logs_count": int(ex["c"]),
            "total_exercise_min": int(ex["mins"]),
            "total_calories_burned": int(ex["burned"]),
            "mental_logs_count": int(mn["c"]),
        }

    def get_stats(self) -> Dict[str, Any]:
        with self._lock, self._connect() as conn:
            exam_count = conn.execute("SELECT COUNT(*) AS c FROM exam_records").fetchone()["c"]
            alert_count = conn.execute("SELECT COUNT(*) AS c FROM alert_events").fetchone()["c"]
            diet_count = conn.execute("SELECT COUNT(*) AS c FROM diet_logs").fetchone()["c"]
            exercise_count = conn.execute("SELECT COUNT(*) AS c FROM exercise_logs").fetchone()["c"]
            mental_count = conn.execute("SELECT COUNT(*) AS c FROM mental_logs").fetchone()["c"]
        db_bytes = self.db_path.stat().st_size if self.db_path.exists() else 0
        return {
            "db_path": str(self.db_path.name),
            "db_bytes": db_bytes,
            "exam_records_count": int(exam_count),
            "alert_events_count": int(alert_count),
            "crew_logs_count": int(diet_count + exercise_count + mental_count),
        }


class PythonAstroHealthEngine:
    """Authoritative Python algorithmic telemetry, clinical acuity, and countermeasure engine."""

    def __init__(self, db: Optional[MissionDatabase] = None) -> None:
        self.lock = threading.RLock()
        self.db = db
        self.feed_rows = load_simulation_feed()
        self.sim_index = 0
        self.sim_playing = True
        self.started_at = time.time()

        self.ema_spo2: Optional[float] = None
        self.prev_ema_spo2: Optional[float] = None
        self.ema_heart_rate: Optional[float] = None
        self.prev_ema_heart_rate: Optional[float] = None
        self.raw_spo2: float = 98.2
        self.raw_heart_rate: float = 72.0
        self.latest_proton_flux: float = 1.24
        self.latest_ambient_dose: float = 0.41
        self.cumulative_dose_msv: float = 14.8
        self.radiation_slope: float = 0.0
        self.radiation_window: Deque[Dict[str, float]] = deque(maxlen=5)
        self.genetic_atrophy_baseline: float = GENETIC_ATROPHY_BASELINE
        self.last_timestamp: float = 0.0
        self.tick_counter: int = 0
        self.history: Deque[Dict[str, Any]] = deque(maxlen=48)
        self._active_alert_ids: set[str] = set()

        self.environment: str = "spacecraft"
        self.completed_routines: set[str] = set()
        self.mental_checkin: Dict[str, Any] = {
            "mood_score": 4,
            "sleep_hours": 7.5,
            "cognitive_fatigue": False,
            "isolation_stress": False,
        }
        self.self_assessment: Dict[str, Any] = {
            "systolic_bp": 118,
            "diastolic_bp": 76,
            "blood_sugar_mg_dl": 94,
            "body_temp_c": 36.8,
        }
        self.manual_vitals_override: bool = False
        self.live_labs: Dict[str, Optional[float]] = {
            "lactate": 1.1,
            "cortisol": None,
            "crp": None,
            "hemoglobin": None,
            "wbc": None,
            "po2": None,
            "pco2": None,
            "ph": None,
            "sodium": None,
            "potassium": None,
        }

        if self.db is not None:
            saved = self.db.load_preferences()
            if saved:
                if saved["environment"] in ENVIRONMENT_PROFILES:
                    self.environment = saved["environment"]
                self.completed_routines = set(saved["completed_routines"])
                self.mental_checkin.update(saved["mental_checkin"])
                self.self_assessment.update(saved["self_assessment"])

        # Seed initial 5 frames from simulation_feed.csv
        for _ in range(min(5, len(self.feed_rows))):
            self.step_feed_row()

    def _persist_prefs(self) -> None:
        if self.db is not None:
            self.db.save_preferences(
                self.environment,
                sorted(self.completed_routines),
                self.mental_checkin,
                self.self_assessment,
            )

    def ingest_vitals(
        self, sensor_id: str, timestamp: float, heart_rate: float, spo2: float, record_history: bool = True
    ) -> None:
        with self.lock:
            self.last_timestamp = float(timestamp)
            self.raw_spo2 = float(spo2)
            self.raw_heart_rate = float(heart_rate)

            self.prev_ema_spo2 = self.ema_spo2
            if self.ema_spo2 is None:
                self.ema_spo2 = self.raw_spo2
            else:
                self.ema_spo2 = (EMA_ALPHA * self.raw_spo2) + (
                    (1.0 - EMA_ALPHA) * self.ema_spo2
                )

            self.prev_ema_heart_rate = self.ema_heart_rate
            if self.ema_heart_rate is None:
                self.ema_heart_rate = self.raw_heart_rate
            else:
                self.ema_heart_rate = (EMA_ALPHA * self.raw_heart_rate) + (
                    (1.0 - EMA_ALPHA) * self.ema_heart_rate
                )

            if record_history:
                self._append_history_point()
                self._audit_protocol_transitions()

    def ingest_radiation(
        self,
        sensor_id: str,
        timestamp: float,
        proton_flux: float,
        ambient_dose: Optional[float] = None,
        record_history: bool = False,
    ) -> None:
        with self.lock:
            self.last_timestamp = float(timestamp)
            shielding = float(ENVIRONMENT_PROFILES[self.environment]["shielding_factor"])
            self.latest_proton_flux = float(proton_flux) * shielding
            if ambient_dose is not None:
                self.latest_ambient_dose = float(ambient_dose) * shielding
            self.cumulative_dose_msv = round(
                self.cumulative_dose_msv + (self.latest_ambient_dose / 24.0), 3
            )

            self.radiation_window.append(
                {"timestamp": float(timestamp), "proton_flux": self.latest_proton_flux}
            )

            points = list(self.radiation_window)
            if len(points) < 2:
                self.radiation_slope = 0.0
            else:
                t0 = points[0]["timestamp"]
                xs = [p["timestamp"] - t0 for p in points]
                ys = [p["proton_flux"] for p in points]
                mean_x = sum(xs) / len(xs)
                mean_y = sum(ys) / len(ys)
                denom = sum((x - mean_x) ** 2 for x in xs)
                if denom <= 1e-9:
                    self.radiation_slope = ys[-1] - ys[-2]
                else:
                    numer = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
                    self.radiation_slope = numer / denom

            if record_history:
                self._append_history_point()
                self._audit_protocol_transitions()

    def compute_mental_stress_breakdown(self) -> Dict[str, Any]:
        ema_hr = self.ema_heart_rate if self.ema_heart_rate is not None else 72.0
        autonomic_load = max(0.0, (ema_hr - 65.0) * 1.25)
        radiation_anxiety = max(0.0, self.radiation_slope) * 6.5
        sleep_deficit = max(0.0, 7.0 - float(self.mental_checkin["sleep_hours"])) * 7.5
        mood_strain = max(0.0, 4.0 - float(self.mental_checkin["mood_score"])) * 9.0
        flag_penalty = (18.0 if self.mental_checkin["cognitive_fatigue"] else 0.0) + (
            18.0 if self.mental_checkin["isolation_stress"] else 0.0
        )
        raw_total = autonomic_load + radiation_anxiety + sleep_deficit + mood_strain + flag_penalty
        score = round(min(100.0, max(4.0, raw_total)), 1)
        return {
            "score": score,
            "autonomic_load": round(autonomic_load, 2),
            "radiation_anxiety": round(radiation_anxiety, 2),
            "sleep_deficit": round(sleep_deficit, 2),
            "mood_strain": round(mood_strain, 2),
            "flag_penalty": round(flag_penalty, 2),
        }

    def compute_news2_clinical_score(self) -> Dict[str, Any]:
        """
        Spaceflight-Adapted NEWS2 (National Early Warning Score 2) Acuity Evaluator.
        Scores SpO2, Heart Rate, Systolic BP, Core Temperature, Blood Glucose, and Behavioral Load.
        """
        ema_spo2 = self.ema_spo2 if self.ema_spo2 is not None else 98.0
        ema_hr = self.ema_heart_rate if self.ema_heart_rate is not None else 72.0
        sys_bp = int(self.self_assessment["systolic_bp"])
        glu = int(self.self_assessment["blood_sugar_mg_dl"])
        temp = float(self.self_assessment["body_temp_c"])
        mental_score = float(self.compute_mental_stress_breakdown()["score"])

        # SpO2 points
        if ema_spo2 < 90.0:
            spo2_pts = 3
        elif ema_spo2 <= 93.0:
            spo2_pts = 2
        elif ema_spo2 <= 95.0:
            spo2_pts = 1
        else:
            spo2_pts = 0

        # Heart Rate points
        if ema_hr <= 40 or ema_hr >= 131:
            hr_pts = 3
        elif ema_hr >= 111:
            hr_pts = 2
        elif ema_hr <= 50 or ema_hr >= 91:
            hr_pts = 1
        else:
            hr_pts = 0

        # Systolic BP points
        if sys_bp <= 90 or sys_bp >= 220:
            bp_pts = 3
        elif sys_bp <= 100 or sys_bp >= 160:
            bp_pts = 2
        elif sys_bp <= 110 or sys_bp >= 140:
            bp_pts = 1
        else:
            bp_pts = 0

        # Core Temp points
        if temp <= 35.0 or temp >= 39.1:
            temp_pts = 3
        elif temp >= 38.1:
            temp_pts = 2
        elif temp <= 36.0:
            temp_pts = 1
        else:
            temp_pts = 0

        # Blood Glucose points (Spaceflight Metabolic Extension)
        if glu < 60 or glu > 250:
            glu_pts = 3
        elif glu < 70 or glu > 180:
            glu_pts = 2
        else:
            glu_pts = 0

        # Radiation / Behavioral Load points
        rad_pts = 2 if self.radiation_slope > 1.5 else 0
        mental_pts = 2 if mental_score >= 70 else (1 if mental_score >= 55 else 0)

        total = spo2_pts + hr_pts + bp_pts + temp_pts + glu_pts + rad_pts + mental_pts
        has_red_param = max(spo2_pts, hr_pts, bp_pts, temp_pts, glu_pts) >= 3

        if total >= 7 or spo2_pts >= 3:
            tier = "EMERGENCY"
        elif total >= 5 or has_red_param:
            tier = "URGENT"
        elif total >= 2:
            tier = "MONITOR"
        else:
            tier = "NOMINAL"

        return {
            "total_score": total,
            "acuity_tier": tier,
            "breakdown": [
                {"parameter": "EMA SpO2", "value": f"{ema_spo2:.1f}%", "points": spo2_pts, "max_points": 3},
                {"parameter": "EMA Heart Rate", "value": f"{ema_hr:.0f} bpm", "points": hr_pts, "max_points": 3},
                {"parameter": "Systolic BP", "value": f"{sys_bp} mmHg", "points": bp_pts, "max_points": 3},
                {"parameter": "Core Temp", "value": f"{temp:.1f} °C", "points": temp_pts, "max_points": 3},
                {"parameter": "Blood Glucose", "value": f"{glu} mg/dL", "points": glu_pts, "max_points": 3},
                {"parameter": "SPE Slope + Stress", "value": f"{self.radiation_slope:.2f} pfu/s", "points": rad_pts + mental_pts, "max_points": 4},
            ],
        }

    def evaluate_protocols(self) -> List[Dict[str, Any]]:
        protocols: List[Dict[str, Any]] = []
        ema_spo2 = self.ema_spo2 if self.ema_spo2 is not None else 98.0
        ema_hr = self.ema_heart_rate if self.ema_heart_rate is not None else 72.0
        mental_index = float(self.compute_mental_stress_breakdown()["score"])
        sys_bp = int(self.self_assessment["systolic_bp"])
        dia_bp = int(self.self_assessment["diastolic_bp"])
        glu = int(self.self_assessment["blood_sugar_mg_dl"])
        temp = float(self.self_assessment["body_temp_c"])

        if ema_spo2 < 90.0:
            protocols.append(
                {
                    "id": "hypoxia",
                    "category": "physical",
                    "hazard": "Hypoxia — Blood Oxygen Critical (< 90%)",
                    "hrp_factor": "Hostile Closed Environment",
                    "severity": "CRITICAL",
                    "guidance": "Low alveolar O2 impairs cognition within 90 seconds. Immediate cabin scrubber isolation required.",
                    "checklist": [
                        "Isolate Primary Scrubber",
                        "Switch to Backup O2 Loop & Don Crew Oxygen Mask",
                        "Verify Cabin Partial Pressure (ppO2 >= 19.5 kPa)",
                    ],
                }
            )

        if self.radiation_slope > 1.5:
            protocols.append(
                {
                    "id": "spe",
                    "category": "radiation",
                    "hazard": "Incoming Solar Particle Event (dΦ/dt > 1.5 pfu/s)",
                    "hrp_factor": "Space Radiation",
                    "severity": "WARNING",
                    "guidance": "Rapid proton flux onset precedes acute radiation sickness and CNS oxidative stress.",
                    "checklist": [
                        "Suspend External EVA & Seal Airlock Bulkhead",
                        "Move Crew to Water-Wall Storm Shelter Bay",
                        "Power Down Non-Essential Unshielded Avionics",
                    ],
                }
            )

        if sys_bp >= 140 or dia_bp >= 90 or sys_bp < 90:
            protocols.append(
                {
                    "id": "blood-pressure",
                    "category": "physical",
                    "hazard": (
                        "Orthostatic Hypotension Risk (BP < 90 mmHg)"
                        if sys_bp < 90
                        else "Elevated Arterial Pressure (>= 140/90 mmHg)"
                    ),
                    "hrp_factor": "Altered Gravity Fields",
                    "severity": "CRITICAL" if sys_bp < 90 else "WARNING",
                    "guidance": "Microgravity cephalad fluid shift alters baroreceptor gain and vascular tone.",
                    "checklist": [
                        "Perform Seated Repeat Cuff Reading After 5 Min Rest",
                        "Administer 500 mL Electrolyte Fluid Bolus & Compression Cuff"
                        if sys_bp < 90
                        else "Reduce Sodium Ration & Log Flight Surgeon Ground Note",
                        "Complete Lower-Body Negative Pressure (LBNP) Screening",
                    ],
                }
            )

        if glu < 70 or glu > 180:
            protocols.append(
                {
                    "id": "glucose",
                    "category": "metabolic",
                    "hazard": (
                        "Hypoglycemia — Low Blood Sugar (< 70 mg/dL)"
                        if glu < 70
                        else "Hyperglycemia — Elevated Blood Sugar (> 180 mg/dL)"
                    ),
                    "hrp_factor": "Inadequate Nutrition / Metabolic Shift",
                    "severity": "CRITICAL" if glu < 60 else "WARNING",
                    "guidance": "Spaceflight insulin resistance and EVA caloric deficit can rapidly destabilize glucose.",
                    "checklist": [
                        "Consume 15g Fast-Acting Carbohydrate Gel Immediately"
                        if glu < 70
                        else "Hydrate 500 mL Water & Review Meal Macronutrient Log",
                        "Re-Test Capillary Glucometer After 15 Minutes",
                        "Defer High-Load EVA Until Glucose Stabilizes (80–140 mg/dL)",
                    ],
                }
            )

        if temp >= 38.0 or temp < 35.5:
            protocols.append(
                {
                    "id": "temperature",
                    "category": "metabolic",
                    "hazard": (
                        "Febrile Immune Response (>= 38.0 °C)"
                        if temp >= 38.0
                        else "Hypothermic Core Drift (< 35.5 °C)"
                    ),
                    "hrp_factor": "Immune Changes & Closed Environment",
                    "severity": "CRITICAL" if temp >= 39.0 else "WARNING",
                    "guidance": "Closed-loop habitats amplify latent viral reactivation and thermal suit strain.",
                    "checklist": [
                        "Repeat Tympanic Core Temperature & Inspect Throat/Skin",
                        "Initiate Cabin Air Filtration Boost & Antipyretic Protocol"
                        if temp >= 38.0
                        else "Engage Thermal Garment Warming & Hot Hydration",
                        "Run Rapid Immune Blood Count Cartridge if Available",
                    ],
                }
            )

        if (
            ema_hr > 110.0
            or mental_index >= 55.0
            or bool(self.mental_checkin["cognitive_fatigue"])
            or bool(self.mental_checkin["isolation_stress"])
        ):
            protocols.append(
                {
                    "id": "mental-stress",
                    "category": "mental",
                    "hazard": "Autonomic Stress & Behavioral Fatigue",
                    "hrp_factor": "Isolation, Confinement & Distance from Earth",
                    "severity": "WARNING",
                    "guidance": "Prolonged confinement and communication lag elevate cortisol and degrade decision accuracy.",
                    "checklist": [
                        "Initiate 4-7-8 Paced Vagal Breathing (3 Minutes)",
                        "Engage Circadian Cabin Lighting & Reduce Non-Urgent Alerts",
                        "Perform Crew Peer Check-In & Schedule Protected Sleep Block",
                    ],
                }
            )

        return protocols

    def _audit_protocol_transitions(self) -> None:
        if self.db is None:
            return
        current = {p["id"]: p for p in self.evaluate_protocols()}
        for pid, proto in current.items():
            if pid not in self._active_alert_ids:
                self.db.insert_alert_event(
                    round(self.last_timestamp, 1),
                    pid,
                    proto["severity"],
                    proto["hazard"],
                    "TRIGGERED",
                )
        for pid in list(self._active_alert_ids):
            if pid not in current:
                self.db.insert_alert_event(
                    round(self.last_timestamp, 1),
                    pid,
                    "NOMINAL",
                    f"Resolved: {pid}",
                    "CLEARED",
                )
        self._active_alert_ids = set(current.keys())

    def _append_history_point(self) -> None:
        self.tick_counter += 1
        sys_bp = int(self.self_assessment["systolic_bp"])
        dia_bp = int(self.self_assessment["diastolic_bp"])
        map_mmhg = round(dia_bp + ((sys_bp - dia_bp) / 3.0), 1)
        mental_score = float(self.compute_mental_stress_breakdown()["score"])

        self.history.append(
            {
                "tick": self.tick_counter,
                "timestamp": round(self.last_timestamp, 1),
                "raw_spo2": round(self.raw_spo2, 2),
                "ema_spo2": round(self.ema_spo2 if self.ema_spo2 is not None else 98.0, 2),
                "raw_hr": round(self.raw_heart_rate, 1),
                "ema_hr": round(
                    self.ema_heart_rate if self.ema_heart_rate is not None else 72.0, 1
                ),
                "proton_flux": round(self.latest_proton_flux, 2),
                "radiation_slope": round(self.radiation_slope, 3),
                "ambient_dose": round(self.latest_ambient_dose, 2),
                "mental_stress_index": mental_score,
                "blood_sugar_mg_dl": int(self.self_assessment["blood_sugar_mg_dl"]),
                "body_temp_c": float(self.self_assessment["body_temp_c"]),
                "systolic_bp": sys_bp,
                "diastolic_bp": dia_bp,
                "map_mmhg": map_mmhg,
            }
        )

    def step_feed_row(self) -> None:
        with self.lock:
            if not self.feed_rows:
                return
            row = self.feed_rows[self.sim_index % len(self.feed_rows)]
            if row["genetic_atrophy_baseline"] > 0:
                self.genetic_atrophy_baseline = row["genetic_atrophy_baseline"]
            for lab_key in (
                "lactate",
                "cortisol",
                "crp",
                "hemoglobin",
                "wbc",
                "po2",
                "pco2",
                "ph",
                "sodium",
                "potassium",
            ):
                self.live_labs[lab_key] = row.get(lab_key)
            if not self.manual_vitals_override:
                if row.get("glucose") is not None:
                    self.self_assessment["blood_sugar_mg_dl"] = int(round(float(row["glucose"])))
                if row.get("temperature") is not None:
                    self.self_assessment["body_temp_c"] = round(float(row["temperature"]), 1)
            self.ingest_radiation(
                sensor_id="RAD-DOSIMETER-BAY1",
                timestamp=row["sim_tick"],
                proton_flux=row["proton_flux"],
                ambient_dose=row["ambient_dose"],
                record_history=False,
            )
            self.ingest_vitals(
                sensor_id="CREW-BIOMETRIC-01",
                timestamp=row["sim_tick"],
                heart_rate=row["heart_rate"],
                spo2=row["spo2"],
                record_history=True,
            )
            self.sim_index = (self.sim_index + 1) % len(self.feed_rows)

    def set_environment(self, env: str) -> None:
        with self.lock:
            if env in ENVIRONMENT_PROFILES:
                self.environment = env
                self._persist_prefs()

    def toggle_routine(self, routine_id: str) -> None:
        with self.lock:
            rid = routine_id.strip()
            if not rid:
                return
            if rid in self.completed_routines:
                self.completed_routines.remove(rid)
            else:
                self.completed_routines.add(rid)
            self._persist_prefs()

    def set_self_assessment(self, data: Dict[str, Any], notes: str = "") -> Dict[str, Any]:
        with self.lock:
            self.manual_vitals_override = True
            for key, lo, hi, cast in (
                ("systolic_bp", 60, 220, int),
                ("diastolic_bp", 40, 140, int),
                ("blood_sugar_mg_dl", 30, 400, int),
                ("body_temp_c", 33.0, 42.0, float),
            ):
                if key in data:
                    try:
                        val = float(data[key])
                        if lo <= val <= hi and math.isfinite(val):
                            self.self_assessment[key] = round(val, 1) if cast is float else int(round(val))
                    except (TypeError, ValueError):
                        pass

            self.completed_routines.add("routine-metabolic")
            self.completed_routines.add("routine-cardio")
            self._append_history_point()
            self._audit_protocol_transitions()
            self._persist_prefs()

            news2 = self.compute_news2_clinical_score()
            if self.db is not None:
                self.db.insert_exam_record(
                    {
                        "met_seconds": round(self.last_timestamp, 1),
                        "exam_type": "VITALS_METABOLIC_EXAM",
                        "environment": self.environment,
                        "systolic_bp": self.self_assessment["systolic_bp"],
                        "diastolic_bp": self.self_assessment["diastolic_bp"],
                        "blood_sugar_mg_dl": self.self_assessment["blood_sugar_mg_dl"],
                        "body_temp_c": self.self_assessment["body_temp_c"],
                        "spo2_pct": round(self.ema_spo2 if self.ema_spo2 is not None else 98.0, 1),
                        "heart_rate_bpm": round(
                            self.ema_heart_rate if self.ema_heart_rate is not None else 72.0, 1
                        ),
                        "news2_score": news2["total_score"],
                        "acuity_tier": news2["acuity_tier"],
                        "notes": notes or "Crew cuff BP, glucometer & core temperature self-check logged.",
                    }
                )
            return self.get_snapshot()

    def set_mental_checkin(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            mood = int(round(float(data.get("mood_score", self.mental_checkin["mood_score"]))))
            sleep = float(data.get("sleep_hours", self.mental_checkin["sleep_hours"]))
            self.mental_checkin = {
                "mood_score": max(1, min(5, mood)),
                "sleep_hours": round(max(0.0, min(12.0, sleep)), 1),
                "cognitive_fatigue": bool(data.get("cognitive_fatigue", False)),
                "isolation_stress": bool(data.get("isolation_stress", False)),
            }
            self.completed_routines.add("routine-behavioral")
            self._audit_protocol_transitions()
            self._persist_prefs()
            return self.get_snapshot()

    def log_visual_exam(
        self,
        body_region: str,
        notes: str,
        image_name: str,
        image_analysis: str,
    ) -> Dict[str, Any]:
        with self.lock:
            news2 = self.compute_news2_clinical_score()
            record_id = 0
            if self.db is not None:
                record_id = self.db.insert_exam_record(
                    {
                        "met_seconds": round(self.last_timestamp, 1),
                        "exam_type": "VISUAL_IMAGING_EXAM",
                        "environment": self.environment,
                        "systolic_bp": self.self_assessment["systolic_bp"],
                        "diastolic_bp": self.self_assessment["diastolic_bp"],
                        "blood_sugar_mg_dl": self.self_assessment["blood_sugar_mg_dl"],
                        "body_temp_c": self.self_assessment["body_temp_c"],
                        "spo2_pct": round(self.ema_spo2 if self.ema_spo2 is not None else 98.0, 1),
                        "heart_rate_bpm": round(
                            self.ema_heart_rate if self.ema_heart_rate is not None else 72.0, 1
                        ),
                        "news2_score": news2["total_score"],
                        "acuity_tier": news2["acuity_tier"],
                        "notes": notes,
                        "body_region": body_region,
                        "image_name": image_name,
                        "image_analysis": image_analysis,
                    }
                )
            return {"record_id": record_id, "snapshot": self.get_snapshot()}

    def log_diet(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            meal_type = str(data.get("meal_type", "Meal")).strip() or "Meal"
            description = str(data.get("description", "")).strip() or "Standard space ration"
            calories = max(0, min(4000, int(round(float(data.get("calories_kcal", 450))))))
            protein = max(0, min(250, int(round(float(data.get("protein_g", 25))))))
            water = max(0, min(4000, int(round(float(data.get("water_ml", 350))))))
            vit_d = max(0, min(10000, int(round(float(data.get("vitamin_d_iu", 400))))))
            entry_id = 0
            if self.db is not None:
                entry_id = self.db.insert_diet_log(
                    {
                        "met_seconds": round(self.last_timestamp, 1),
                        "meal_type": meal_type,
                        "description": description,
                        "calories_kcal": calories,
                        "protein_g": protein,
                        "water_ml": water,
                        "vitamin_d_iu": vit_d,
                    }
                )
            self.completed_routines.add("routine-nutrition")
            self._persist_prefs()
            return {"entry_id": entry_id, "snapshot": self.get_snapshot()}

    def log_exercise(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            modality = str(data.get("modality", "ARED Resistive")).strip() or "ARED Resistive"
            duration = max(1, min(300, int(round(float(data.get("duration_min", 45))))))
            intensity = str(data.get("intensity", "MODERATE")).upper()
            if intensity not in ("LOW", "MODERATE", "HIGH"):
                intensity = "MODERATE"
            load_pct = max(0, min(100, int(round(float(data.get("resistance_load_pct", 75))))))
            rate = 5 if intensity == "LOW" else (8 if intensity == "MODERATE" else 11)
            burned = max(0, min(3000, int(round(float(data.get("calories_burned", duration * rate))))))
            notes = str(data.get("notes", "")).strip()
            entry_id = 0
            if self.db is not None:
                entry_id = self.db.insert_exercise_log(
                    {
                        "met_seconds": round(self.last_timestamp, 1),
                        "modality": modality,
                        "duration_min": duration,
                        "intensity": intensity,
                        "resistance_load_pct": load_pct,
                        "calories_burned": burned,
                        "notes": notes,
                    }
                )
            self.completed_routines.add("routine-exercise")
            self._persist_prefs()
            return {"entry_id": entry_id, "snapshot": self.get_snapshot()}

    def log_mental_entry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        with self.lock:
            mood = max(1, min(5, int(round(float(data.get("mood_score", 4))))))
            stress_lvl = max(1, min(10, int(round(float(data.get("stress_level", 4))))))
            sleep_hrs = round(max(0.0, min(12.0, float(data.get("sleep_hours", 7.5)))), 1)
            triggers = str(data.get("triggers", "Nominal / Calm")).strip() or "Nominal / Calm"
            journal = str(data.get("journal_entry", "")).strip() or "Routine psychological log."
            entry_id = 0
            if self.db is not None:
                entry_id = self.db.insert_mental_log(
                    {
                        "met_seconds": round(self.last_timestamp, 1),
                        "mood_score": mood,
                        "stress_level": stress_lvl,
                        "sleep_hours": sleep_hrs,
                        "triggers": triggers,
                        "journal_entry": journal,
                    }
                )
            # Synchronize live behavioral check-in state with the logged mental entry
            self.mental_checkin = {
                "mood_score": mood,
                "sleep_hours": sleep_hrs,
                "cognitive_fatigue": bool(stress_lvl >= 7 or "fatigue" in triggers.lower()),
                "isolation_stress": bool(stress_lvl >= 7 or "isolat" in triggers.lower()),
            }
            self.completed_routines.add("routine-behavioral")
            self._audit_protocol_transitions()
            self._persist_prefs()
            return {"entry_id": entry_id, "snapshot": self.get_snapshot()}

    def reset(self) -> None:
        with self.lock:
            self.ema_spo2 = None
            self.prev_ema_spo2 = None
            self.ema_heart_rate = None
            self.prev_ema_heart_rate = None
            self.raw_spo2 = 98.2
            self.raw_heart_rate = 72.0
            self.latest_proton_flux = 1.24
            self.latest_ambient_dose = 0.41
            self.cumulative_dose_msv = 14.8
            self.radiation_slope = 0.0
            self.radiation_window.clear()
            self.genetic_atrophy_baseline = GENETIC_ATROPHY_BASELINE
            self.last_timestamp = 0.0
            self.tick_counter = 0
            self.history.clear()
            self._active_alert_ids.clear()
            self.sim_index = 0
            self.sim_playing = False
            self.completed_routines.clear()
            self.mental_checkin = {
                "mood_score": 4,
                "sleep_hours": 7.5,
                "cognitive_fatigue": False,
                "isolation_stress": False,
            }
            self.self_assessment = {
                "systolic_bp": 118,
                "diastolic_bp": 76,
                "blood_sugar_mg_dl": 94,
                "body_temp_c": 36.8,
            }
            self.manual_vitals_override = False
            self._persist_prefs()
            for _ in range(min(5, len(self.feed_rows))):
                self.step_feed_row()

    def control_simulator(self, action: str) -> Dict[str, Any]:
        with self.lock:
            if action == "play":
                self.sim_playing = True
            elif action == "pause":
                self.sim_playing = False
            elif action == "step":
                self.sim_playing = False
                self.step_feed_row()
            elif action == "reset":
                self.reset()
            elif action == "fault_hypoxia":
                self.sim_playing = False
                base_ts = self.last_timestamp
                for idx, spo2_val in enumerate((87.5, 85.2, 83.8, 82.4)):
                    self.ingest_vitals(
                        "CREW-BIOMETRIC-01", base_ts + idx + 1, 108 + idx * 3, spo2_val, True
                    )
            elif action == "fault_spe":
                self.sim_playing = False
                base_ts = self.last_timestamp
                for idx, flux_val in enumerate((2.1, 4.4, 7.2, 10.6, 14.3)):
                    self.ingest_radiation(
                        "RAD-DOSIMETER-BAY1",
                        base_ts + idx + 1,
                        flux_val,
                        round(0.5 + idx * 0.35, 2),
                        True,
                    )
            elif action == "fault_stress":
                self.sim_playing = False
                base_ts = self.last_timestamp
                self.set_mental_checkin(
                    {
                        "mood_score": 2,
                        "sleep_hours": 4.5,
                        "cognitive_fatigue": True,
                        "isolation_stress": True,
                    }
                )
                for idx, hr_val in enumerate((104, 112, 118, 121)):
                    self.ingest_vitals(
                        "CREW-BIOMETRIC-01", base_ts + idx + 1, hr_val, 96.4, True
                    )
            elif action == "restore_nominal":
                self.sim_playing = False
                self.manual_vitals_override = True
                base_ts = self.last_timestamp
                self.set_mental_checkin(
                    {
                        "mood_score": 4,
                        "sleep_hours": 7.5,
                        "cognitive_fatigue": False,
                        "isolation_stress": False,
                    }
                )
                self.self_assessment = {
                    "systolic_bp": 118,
                    "diastolic_bp": 76,
                    "blood_sugar_mg_dl": 94,
                    "body_temp_c": 36.8,
                }
                self._persist_prefs()
                for idx in range(5):
                    self.ingest_radiation(
                        "RAD-DOSIMETER-BAY1", base_ts + idx + 1, 1.32, 0.42, False
                    )
                    self.ingest_vitals(
                        "CREW-BIOMETRIC-01", base_ts + idx + 1, 72.0, 98.2, True
                    )
            return self.get_snapshot()

    def reload_feed_from_disk(self) -> Dict[str, Any]:
        with self.lock:
            self.feed_rows = load_simulation_feed()
            self.sim_index = 0
            self.manual_vitals_override = False
            self.ema_spo2 = None
            self.prev_ema_spo2 = None
            self.ema_heart_rate = None
            self.prev_ema_heart_rate = None
            self.radiation_window.clear()
            self.history.clear()
            self.tick_counter = 0
            self.last_timestamp = 0.0
            for _ in range(min(5, len(self.feed_rows))):
                self.step_feed_row()
            return self.get_snapshot()

    def reprocess_raw_datasets(self) -> Dict[str, Any]:
        with self.lock:
            summary = rebuild_simulation_feed_from_raw(DATA_DIR)
            snap = self.reload_feed_from_disk()
            return {
                "summary": summary,
                "inventory": get_dataset_inventory(DATA_DIR),
                "snapshot": snap,
            }

    def save_and_reprocess_dataset(self, target: str, filename: str, content: str) -> Dict[str, Any]:
        clean_name = Path(filename.strip()).name or "dataset.csv"
        if target == "radiation":
            dest = DATA_DIR / "radiation" / clean_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")
            return self.reprocess_raw_datasets()
        if target == "osd195":
            dest = DATA_DIR / "osd195" / clean_name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")
            return self.reprocess_raw_datasets()
        if target == "mimic_events":
            dest = DATA_DIR / "mimic" / "LABEVENTS.csv"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")
            return self.reprocess_raw_datasets()
        if target == "mimic_items":
            dest = DATA_DIR / "mimic" / "D_LABITEMS.csv"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content, encoding="utf-8")
            return self.reprocess_raw_datasets()
        if target == "feed_csv":
            FEED_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
            FEED_CSV_PATH.write_text(content, encoding="utf-8")
            snap = self.reload_feed_from_disk()
            return {
                "summary": {"aligned_rows": len(self.feed_rows), "output_file": "simulation_feed.csv"},
                "inventory": get_dataset_inventory(DATA_DIR),
                "snapshot": snap,
            }
        raise ValueError(f"Unsupported dataset target '{target}'.")

    def get_algorithm_explanation(self) -> Dict[str, Any]:
        """Return exact formulas and live step-by-step Python mathematical trace."""
        with self.lock:
            ema_spo2 = self.ema_spo2 if self.ema_spo2 is not None else 98.0
            prev_spo2 = self.prev_ema_spo2 if self.prev_ema_spo2 is not None else ema_spo2
            ema_hr = self.ema_heart_rate if self.ema_heart_rate is not None else 72.0
            prev_hr = self.prev_ema_heart_rate if self.prev_ema_heart_rate is not None else ema_hr

            points = list(self.radiation_window)
            t0 = points[0]["timestamp"] if points else 0.0
            xs = [round(p["timestamp"] - t0, 2) for p in points]
            ys = [round(p["proton_flux"], 3) for p in points]
            mean_x = round(sum(xs) / len(xs), 3) if xs else 0.0
            mean_y = round(sum(ys) / len(ys), 3) if ys else 0.0
            denom = round(sum((x - mean_x) ** 2 for x in xs), 4) if xs else 0.0
            numer = round(sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)), 4) if xs else 0.0

            env_profile = ENVIRONMENT_PROFILES[self.environment]
            gravity_penalty = 0.06 if float(env_profile["gravity_g"]) == 0.0 else 0.0
            hypoxia_penalty = 0.14 if ema_spo2 < 90.0 else 0.0
            stress_breakdown = self.compute_mental_stress_breakdown()
            stress_penalty = 0.08 if float(stress_breakdown["score"]) >= 55.0 else 0.0
            daily_summary = self.db.get_daily_logs_summary() if self.db is not None else {"total_exercise_min": 0}
            exercise_credit = min(0.10, (float(daily_summary["total_exercise_min"]) / 90.0) * 0.10)
            atrophy_risk = round(
                max(
                    0.95,
                    self.genetic_atrophy_baseline
                    * (1.0 + gravity_penalty + hypoxia_penalty + stress_penalty - exercise_credit),
                ),
                3,
            )
            remaining_dose = max(0.0, NASA_30DAY_BFO_LIMIT_MSV - self.cumulative_dose_msv)
            days_to_limit = (
                round(remaining_dose / max(0.01, self.latest_ambient_dose), 1)
                if self.latest_ambient_dose > 0
                else 9999.0
            )

            return {
                "python_runtime": sys.version.split()[0],
                "ema": {
                    "alpha": EMA_ALPHA,
                    "formula": "S_t = alpha * X_t + (1 - alpha) * S_{t-1}",
                    "spo2_raw": round(self.raw_spo2, 2),
                    "spo2_prev_ema": round(prev_spo2, 2),
                    "spo2_ema": round(ema_spo2, 2),
                    "hr_raw": round(self.raw_heart_rate, 1),
                    "hr_prev_ema": round(prev_hr, 1),
                    "hr_ema": round(ema_hr, 1),
                    "hypoxia_threshold": 90.0,
                },
                "ols_radiation_slope": {
                    "formula": "dPhi/dt = sum((t_i - t_bar)*(Phi_i - Phi_bar)) / sum((t_i - t_bar)^2)",
                    "window_size": len(points),
                    "window_points": [
                        {"timestamp": round(p["timestamp"], 1), "proton_flux": round(p["proton_flux"], 3)}
                        for p in points
                    ],
                    "mean_dt": mean_x,
                    "mean_flux": mean_y,
                    "numerator": numer,
                    "denominator": denom,
                    "slope_pfu_s": round(self.radiation_slope, 4),
                    "spe_threshold": 1.5,
                    "shielding_factor": env_profile["shielding_factor"],
                    "days_to_30d_bfo_limit": days_to_limit,
                },
                "genomic_atrophy": {
                    "formula": "Risk = OSD195_Mean * (1 + g_penalty + hypoxia_penalty + cortisol_penalty)",
                    "baseline": self.genetic_atrophy_baseline,
                    "gravity_penalty": gravity_penalty,
                    "hypoxia_penalty": hypoxia_penalty,
                    "stress_penalty": stress_penalty,
                    "computed_risk": atrophy_risk,
                },
                "mental_stress": stress_breakdown,
                "news2": self.compute_news2_clinical_score(),
            }

    def get_snapshot(self) -> Dict[str, Any]:
        with self.lock:
            ema_spo2 = round(self.ema_spo2 if self.ema_spo2 is not None else 98.0, 2)
            ema_hr = round(self.ema_heart_rate if self.ema_heart_rate is not None else 72.0, 1)
            slope = round(self.radiation_slope, 3)
            mental_breakdown = self.compute_mental_stress_breakdown()
            mental_stress = float(mental_breakdown["score"])
            env_profile = ENVIRONMENT_PROFILES[self.environment]
            gravity_penalty = 0.06 if float(env_profile["gravity_g"]) == 0.0 else 0.0
            daily_summary = (
                self.db.get_daily_logs_summary()
                if self.db is not None
                else {
                    "diet_logs_count": 0,
                    "total_calories_kcal": 0,
                    "total_protein_g": 0,
                    "total_water_ml": 0,
                    "total_vitamin_d_iu": 0,
                    "exercise_logs_count": 0,
                    "total_exercise_min": 0,
                    "total_calories_burned": 0,
                    "mental_logs_count": 0,
                }
            )
            # Exercise countermeasure protection: up to -0.10 protective offset for 90+ min training
            exercise_credit = min(0.10, (float(daily_summary["total_exercise_min"]) / 90.0) * 0.10)
            muscle_atrophy_risk = round(
                max(
                    0.95,
                    self.genetic_atrophy_baseline
                    * (
                        1.0
                        + gravity_penalty
                        + (0.14 if ema_spo2 < 90.0 else 0.0)
                        + (0.08 if mental_stress >= 55.0 else 0.0)
                        - exercise_credit
                    ),
                ),
                3,
            )
            news2 = self.compute_news2_clinical_score()
            sys_bp = int(self.self_assessment["systolic_bp"])
            dia_bp = int(self.self_assessment["diastolic_bp"])
            map_mmhg = round(dia_bp + ((sys_bp - dia_bp) / 3.0), 1)

            return {
                "timestamp": round(self.last_timestamp, 1),
                "smoothed_spo2": ema_spo2,
                "raw_spo2": round(self.raw_spo2, 1),
                "smoothed_heart_rate": ema_hr,
                "raw_heart_rate": round(self.raw_heart_rate, 1),
                "radiation_flux": round(self.latest_proton_flux, 2),
                "ambient_dose": round(self.latest_ambient_dose, 2),
                "cumulative_dose_msv": round(self.cumulative_dose_msv, 2),
                "radiation_slope": slope,
                "genetic_atrophy_baseline": self.genetic_atrophy_baseline,
                "muscle_atrophy_risk": muscle_atrophy_risk,
                "mental_stress_index": mental_stress,
                "mental_checkin": dict(self.mental_checkin),
                "self_assessment": {**self.self_assessment, "map_mmhg": map_mmhg},
                "live_labs": dict(self.live_labs),
                "news2": news2,
                "daily_logs_summary": daily_summary,
                "environment": self.environment,
                "environment_profile": env_profile,
                "completed_routines": sorted(self.completed_routines),
                "protocols": self.evaluate_protocols(),
                "history": list(self.history),
                "backend_engine": {
                    "runtime": f"Python {sys.version.split()[0]}",
                    "port": PORT,
                    "uptime_s": round(time.time() - self.started_at, 1),
                },
                "simulator": {
                    "playing": self.sim_playing,
                    "current_row": self.sim_index,
                    "total_rows": len(self.feed_rows),
                },
            }

    def build_downlink_report(self) -> Dict[str, Any]:
        with self.lock:
            snap = self.get_snapshot()
            exams = self.db.get_exam_history(10) if self.db else []
            alerts = self.db.get_alert_history(15) if self.db else []
            return {
                "report_type": "ASTROHEALTH_STORE_AND_FORWARD_DOWNLINK",
                "generated_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "backend_runtime": snap["backend_engine"]["runtime"],
                "crew_id": "CDR-01 (CREW-BIOMETRIC-01)",
                "mission_environment": snap["environment_profile"],
                "clinical_acuity_news2": snap["news2"],
                "current_vitals": {
                    "mission_elapsed_tick_s": snap["timestamp"],
                    "smoothed_spo2_pct": snap["smoothed_spo2"],
                    "smoothed_heart_rate_bpm": snap["smoothed_heart_rate"],
                    "systolic_bp_mmhg": snap["self_assessment"]["systolic_bp"],
                    "diastolic_bp_mmhg": snap["self_assessment"]["diastolic_bp"],
                    "mean_arterial_pressure_mmhg": snap["self_assessment"]["map_mmhg"],
                    "blood_glucose_mg_dl": snap["self_assessment"]["blood_sugar_mg_dl"],
                    "body_temp_c": snap["self_assessment"]["body_temp_c"],
                },
                "radiation_and_genomics": {
                    "proton_flux_pfu": snap["radiation_flux"],
                    "flux_slope_pfu_s": snap["radiation_slope"],
                    "ambient_dose_msv_day": snap["ambient_dose"],
                    "cumulative_mission_dose_msv": snap["cumulative_dose_msv"],
                    "nasa_30day_bfo_limit_msv": NASA_30DAY_BFO_LIMIT_MSV,
                    "osd195_atrophy_baseline": snap["genetic_atrophy_baseline"],
                    "muscle_atrophy_risk_index": snap["muscle_atrophy_risk"],
                },
                "clinical_icu_labs": snap["live_labs"],
                "behavioral_health": {
                    "mental_stress_index": snap["mental_stress_index"],
                    "sleep_hours": snap["mental_checkin"]["sleep_hours"],
                    "mood_score": snap["mental_checkin"]["mood_score"],
                    "cognitive_fatigue": snap["mental_checkin"]["cognitive_fatigue"],
                    "isolation_stress": snap["mental_checkin"]["isolation_stress"],
                },
                "completed_daily_routines": snap["completed_routines"],
                "daily_logs_summary": snap["daily_logs_summary"],
                "recent_diet_logs": self.db.get_diet_logs(10) if self.db else [],
                "recent_exercise_logs": self.db.get_exercise_logs(10) if self.db else [],
                "recent_mental_logs": self.db.get_mental_logs(10) if self.db else [],
                "active_protocols": snap["protocols"],
                "recent_exam_records": exams,
                "recent_alert_events": alerts,
                "recent_telemetry_samples": snap["history"][-12:],
            }


def make_handler(engine: PythonAstroHealthEngine) -> type[BaseHTTPRequestHandler]:
    class EdgeRequestHandler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            # Suppress noisy access logs while keeping errors visible
            return

        def _send_json(self, status: int, payload: Any) -> None:
            raw = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

        def _read_json(self) -> Dict[str, Any]:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0:
                return {}
            body = self.rfile.read(length)
            try:
                parsed = json.loads(body.decode("utf-8"))
                return parsed if isinstance(parsed, dict) else {}
            except Exception:
                return {}

        def do_GET(self) -> None:
            path = urlparse(self.path).path
            if path == "/health":
                self._send_json(
                    200,
                    {
                        "status": "ok",
                        "runtime": f"Python {sys.version.split()[0]}",
                        "port": PORT,
                    },
                )
                return

            if path == "/api/state":
                self._send_json(200, engine.get_snapshot())
                return

            if path == "/api/algorithms/explain":
                self._send_json(200, engine.get_algorithm_explanation())
                return

            if path == "/api/exams/history":
                exams = engine.db.get_exam_history(25) if engine.db else []
                alerts = engine.db.get_alert_history(25) if engine.db else []
                self._send_json(200, {"exams": exams, "alerts": alerts})
                return

            if path == "/api/crew-logs":
                self._send_json(
                    200,
                    {
                        "diet_logs": engine.db.get_diet_logs(30) if engine.db else [],
                        "exercise_logs": engine.db.get_exercise_logs(30) if engine.db else [],
                        "mental_logs": engine.db.get_mental_logs(30) if engine.db else [],
                        "summary": engine.db.get_daily_logs_summary() if engine.db else {},
                    },
                )
                return

            if path == "/api/backend-status":
                db_stats = engine.db.get_stats() if engine.db else {}
                snap = engine.get_snapshot()
                self._send_json(
                    200,
                    {
                        "status": "ONLINE",
                        "engine": "AstroHealth Python Edge Telemetry Daemon",
                        "python_version": sys.version.split()[0],
                        "port": PORT,
                        "uptime_seconds": snap["backend_engine"]["uptime_s"],
                        "sqlite": db_stats,
                        "feed_rows": len(engine.feed_rows),
                        "algorithms": [
                            "EMA Physiological Filter (alpha=0.30)",
                            "OLS 5-Sample Solar Proton Slope",
                            "OSD-195 Genomic Muscle Atrophy Risk",
                            "Spaceflight Modified NEWS2 Acuity Scorer",
                            "Autonomic & Sleep Mental Stress Index",
                        ],
                    },
                )
                return

            if path == "/api/datasets/status":
                self._send_json(200, get_dataset_inventory(DATA_DIR))
                return

            if path == "/api/report/export":
                report = engine.build_downlink_report()
                raw = json.dumps(report, indent=2).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header(
                    "Content-Disposition",
                    'attachment; filename="astrohealth_downlink_report.json"',
                )
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
                return

            self._send_json(404, {"error": f"Unknown route {path}"})

        def do_POST(self) -> None:
            path = urlparse(self.path).path
            body = self._read_json()

            if path == "/ingest/vitals":
                sensor_id = body.get("sensor_id")
                ts = body.get("timestamp")
                hr = body.get("heart_rate")
                spo2 = body.get("spo2")
                if (
                    not isinstance(sensor_id, str)
                    or not sensor_id.strip()
                    or not isinstance(ts, (int, float))
                    or not isinstance(hr, (int, float))
                    or not (0 <= hr <= 250)
                    or not isinstance(spo2, (int, float))
                    or not (0 <= spo2 <= 100)
                ):
                    self._send_json(422, {"error": "Invalid VitalTelemetry payload"})
                    return
                engine.ingest_vitals(sensor_id, float(ts), float(hr), float(spo2), True)
                self._send_json(200, {"status": "accepted", "snapshot": engine.get_snapshot()})
                return

            if path == "/ingest/radiation":
                sensor_id = body.get("sensor_id")
                ts = body.get("timestamp")
                flux = body.get("proton_flux")
                dose = body.get("ambient_dose")
                if (
                    not isinstance(sensor_id, str)
                    or not sensor_id.strip()
                    or not isinstance(ts, (int, float))
                    or not isinstance(flux, (int, float))
                    or flux < 0
                ):
                    self._send_json(422, {"error": "Invalid RadiationTelemetry payload"})
                    return
                engine.ingest_radiation(
                    sensor_id,
                    float(ts),
                    float(flux),
                    float(dose) if isinstance(dose, (int, float)) else None,
                    False,
                )
                self._send_json(200, {"status": "accepted", "snapshot": engine.get_snapshot()})
                return

            if path == "/api/mental-checkin":
                snap = engine.set_mental_checkin(body)
                self._send_json(200, snap)
                return

            if path == "/api/self-assessment":
                notes = str(body.get("notes", ""))
                snap = engine.set_self_assessment(body, notes=notes)
                self._send_json(200, snap)
                return

            if path == "/api/visual-exam":
                region = str(body.get("body_region", "General")).strip() or "General"
                notes = str(body.get("notes", "")).strip()
                img_name = str(body.get("image_name", "manual-entry")).strip()
                analysis = str(body.get("image_analysis", "")).strip()
                result = engine.log_visual_exam(region, notes, img_name, analysis)
                self._send_json(200, result)
                return

            if path == "/api/environment":
                engine.set_environment(str(body.get("environment", "")))
                self._send_json(200, engine.get_snapshot())
                return

            if path == "/api/routine/toggle":
                engine.toggle_routine(str(body.get("routine_id", "")))
                self._send_json(200, engine.get_snapshot())
                return

            if path == "/api/simulator/control":
                action = str(body.get("action", ""))
                snap = engine.control_simulator(action)
                self._send_json(200, snap)
                return

            if path == "/api/crew-logs/diet":
                result = engine.log_diet(body)
                self._send_json(200, result)
                return

            if path == "/api/crew-logs/exercise":
                result = engine.log_exercise(body)
                self._send_json(200, result)
                return

            if path == "/api/crew-logs/mental":
                result = engine.log_mental_entry(body)
                self._send_json(200, result)
                return

            if path == "/api/datasets/reprocess":
                try:
                    result = engine.reprocess_raw_datasets()
                    self._send_json(200, result)
                except Exception as exc:
                    self._send_json(400, {"error": str(exc)})
                return

            if path == "/api/datasets/upload":
                target = str(body.get("target", "")).strip()
                filename = str(body.get("filename", "dataset.csv")).strip()
                content = str(body.get("content", ""))
                if not content.strip():
                    self._send_json(400, {"error": "Uploaded dataset file is empty."})
                    return
                try:
                    result = engine.save_and_reprocess_dataset(target, filename, content)
                    self._send_json(200, result)
                except Exception as exc:
                    self._send_json(400, {"error": str(exc)})
                return

            self._send_json(404, {"error": f"Unknown route {path}"})

    return EdgeRequestHandler


def run_simulator_loop(engine: PythonAstroHealthEngine, stop_event: threading.Event) -> None:
    while not stop_event.is_set():
        time.sleep(1.0)
        if engine.sim_playing and engine.feed_rows:
            engine.step_feed_row()


def main() -> None:
    db = MissionDatabase(DB_PATH)
    engine = PythonAstroHealthEngine(db=db)
    stop_event = threading.Event()
    sim_thread = threading.Thread(
        target=run_simulator_loop, args=(engine, stop_event), daemon=True
    )
    sim_thread.start()

    server = ThreadingHTTPServer(("127.0.0.1", PORT), make_handler(engine))
    print(
        f"AstroHealth Python Edge Backend running on http://127.0.0.1:{PORT} (Python {sys.version.split()[0]})",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        stop_event.set()
        server.server_close()


if __name__ == "__main__":
    main()
