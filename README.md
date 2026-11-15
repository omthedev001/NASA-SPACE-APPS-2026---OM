# AstroHealth Edge OS — Autonomous Digital Flight Surgeon

**AstroHealth Edge OS** is a 100% offline-capable astronaut medical monitoring, clinical triage, and behavioral wellness workstation built for long-duration space missions beyond Low Earth Orbit (Artemis Lunar Flyby, Orbital Stations, Surface Rovers, and Mars Transit).

Designed for environments where communication latency to Earth Flight Surgeons exceeds **14+ minutes**, it executes signal filtering, clinical acuity scoring, dataset cleaning, self-exam logging, and behavioral support locally inside an autonomous **Python 3 Edge Backend** with persistent **SQLite EHR** storage and a SpaceX Flight-Deck dark workstation UI.

> **Supporting Documentation:** See [`SUBMISSION_SUPPORT_DOCUMENT.md`](./SUBMISSION_SUPPORT_DOCUMENT.md) for the complete technical, clinical, dataset-calibration, and challenge-alignment specification.

---

## Key Capabilities

1. **Interactive Digital Twin (`#overview`)**:
   - Clickable 5-system anatomical schematic (**Brain, Lungs, Heart, Metabolic/Immune, Muscle/Bone**) with plain-language self-measurement instructions, NASA HRP hazard mappings, and escalation triggers.
   - Real-time **Environment Switcher** (`Spacecraft 0.00g`, `Space Station 0.00g`, `Surface Rover 0.38g`, `Lunar/Mars Base 0.16g`) dynamically scaling shielding and gravity load.
   - Live **Spaceflight Modified NEWS2 Acuity** evaluator and actionable countermeasure checklists.
2. **Guided Crew Self-Exam & Visual Inspection (`#exam`)**:
   - Blood Pressure (`mmHg`) & Mean Arterial Pressure (`MAP`), Capillary Blood Sugar (`mg/dL`), and Core Body Temperature (`°C`).
   - Camera / Portable Ultrasound visual exam archival with multimodal uplink guidance or deterministic offline edge triage.
   - Persistent SQLite Exam Log & Hazard Transition Audit Timeline (`data/astrohealth_mission.db`).
3. **Crew Daily Countermeasure Logbook (`#logs`)**:
   - **Diet & Hydration Log** (`kcal`, protein, water `mL`, Vitamin D) with ISS meal presets.
   - **Exercise & ARED/T2/CEVIS Log** (duration, intensity, load %) that dynamically lowers the live OSD-195 muscle atrophy risk score.
   - **Mental Health Journal** tracking mood, sleep duration, stress triggers, and reflections.
4. **7 Live Scientific Telemetry Plots (`#telemetry`)**:
   - EMA SpO2 & Heart Rate ($\alpha = 0.30$), Solar Proton Flux & 5-Sample OLS Slope ($d\Phi/dt$), 5-Axis Readiness Radar, OSD-195 Gene Expression Bars, Glucose/Core Temp, Mental Stress & Radiation Dose Budget (`250 mSv`), and Arterial BP/MAP.
   - Direct sensor packet injector (`POST /ingest/vitals`, `POST /ingest/radiation`) and emergency fault drills.
5. **Transparent Mathematical Algorithms (`#algorithms`)**:
   - Live step-by-step Python substitutions for EMA, 5-sample OLS deque regression, genomic muscle atrophy, mental stress index, and NEWS2 point breakdown.
6. **Behavioral Wellness & Flight Surgeon (`#wellness`)**:
   - Sleep/mood/fatigue check-in, rectangular **4-7-8 Vagal Breathing Pacer**, circadian light hygiene protocols, and telemetry-grounded Behavioral Companion.
7. **Real Dataset Ingestion & Store-and-Forward Downlink (`#deploy`)**:
   - Native pure-Python ingestion & upload support for **NASA ICARTT Radiation (`.ict`)**, **NASA GeneLab OSD-195 (`.txt`)**, **MIMIC-III ICU Labs (`LABEVENTS.csv` + `D_LABITEMS.csv`)**, and merged `simulation_feed.csv` feeds.
   - One-click **Store-and-Forward Flight Surgeon Report** (`astrohealth_downlink_report.json`) export.

---

## Working With Your Own Datasets

The workstation ships pre-loaded with the **156-tick synchronized real dataset** (`data/simulation_feed.csv`, 88 channels combining NASA ICARTT `P01`/`ARML3dr`, NASA OSD-195 `genetic_atrophy_baseline = 2.6954x`, and MIMIC-III blood gas & metabolic ICU labs including `pO2`, `Glucose`, `Temperature`, `Lactate`, `Cortisol`, `CRP`, `Hemoglobin`, and `WBC`).

1. **Via the Workstation UI**: Open the **Mission Data** tab (`#deploy`), select the dataset type (`NASA Radiation`, `OSD-195`, `MIMIC-III LABEVENTS.csv`, `D_LABITEMS.csv`, or `simulation_feed.csv`), and upload your file. The Python backend cleans sentinels (`-9999` / `NaN`), runs forward/backward imputation, converts arterial `pO2` to `SpO2` via the Severinghaus curve when needed, rebuilds the synchronized feed, and streams your data live.
2. **Via Local Folders**: Place your files into `data/radiation/`, `data/osd195/`, and `data/mimic/`, then click **Re-Clean & Sync Local Datasets** in the app (or run `python deliverables/clean_and_merge.py` if Pandas is installed).

---

## Quick Start & Verification

### 1. Run Locally (Python Engine + Workstation UI)
```bash
npm install
npm run dev
# Workstation runs at http://localhost:3000 (Python backend automatically boots on 127.0.0.1:8001)
```

### 2. Run Unit & Dataset Tests
```bash
python3 python_engine/test_edge_backend.py
npm run lint
npm run build
```

### 3. Deploy via Docker (Spacecraft / Habitat Server)
```bash
docker compose up --build -d
# Persists ./data/astrohealth_mission.db and uploaded datasets across container restarts
```
