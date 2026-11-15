# AstroHealth Edge OS — Supporting Technical & Clinical Submission Document

**Mission Profile:** Autonomous Crew Medical Workstation & Behavioral Health Decision-Support System  
**Applicable Spaceflight Regimes:** Deep-Space Transit Spacecraft · Orbital Space Station · Pressurized Surface Rover · Lunar/Mars Surface Base  
**Target Users:** Astronauts & Flight Crew Operating Under High Communication Latency (1.8 sec to 22+ min one-way)

---

## 1. Challenge Alignment & Operational Problem Statement

As NASA's Artemis missions and commercial deep-space programs transition from Low Earth Orbit (LEO) to lunar orbit and multi-year Mars transit, crews face five documented spaceflight hazards mapped by the **NASA Human Research Program (HRP)**:

1. **Space Radiation** — Galactic Cosmic Rays (GCR) and sudden Solar Particle Events (SPE) elevate acute radiation sickness risk and count against the NASA **250 mSv** 30-day Blood-Forming Organ (BFO) career/mission dose budget.
2. **Isolation & Confinement** — Prolonged habitat confinement, monotonous schedules, and loss of 24-hour solar circadian cues contribute to sleep restriction, anxiety, mood deterioration, and cognitive fatigue.
3. **Distance from Earth** — Deep-space signal latency (14+ minutes one-way to Mars) makes real-time Earth flight surgeon tele-guidance impossible during acute emergencies.
4. **Altered Gravity Fields** — Microgravity (`0.00g`) and partial gravity (`0.16g` Lunar / `0.38g` Martian) trigger cephalad fluid shifts, orthostatic intolerance, bone demineralization, and skeletal muscle atrophy.
5. **Hostile Closed Environments** — Sealed spacecraft atmospheres amplify CO₂ retention, hypoxic scrubber failures, elevated particulate exposure, and latent immune activation.

**AstroHealth Edge OS** solves the autonomous crew medical gap by executing **100% locally in Python 3 + SQLite** with zero internet dependency, turning raw spacecraft/wearable/ICU data and crew self-exams into immediate plain-language action checklists, clinical triage scores, and store-and-forward Ground Flight Surgeon telemetry packets.

---

## 2. System Architecture & Offline Survivability

| Layer | Technology | Responsibility |
| :--- | :--- | :--- |
| **Autonomous Edge Engine** | Python 3 Standard Library (`http.server`, `sqlite3`, `csv`, `threading`) | Runs 1 Hz sensor stream processing, EMA noise filtering, 5-sample OLS slope estimation, NEWS2 clinical acuity scoring, OSD-195 genomic weighting, and SQLite EHR persistence. |
| **Gateway & Telemetry Bus** | Node.js / Express + WebSocket (`/ws/dashboard`) | Supervises the Python edge daemon, streams real-time state frames at 1 Hz, serves the workstation UI, and optionally bridges Earth-uplink multimodal AI when `GEMINI_API_KEY` is configured (with instant deterministic offline fallback). |
| **Flight-Deck Workstation UI** | React + TypeScript + SVG Scientific Telemetry | 7-page aerospace workstation styled for high-contrast readability under dim cabin lighting, with zero circular gauge metaphors (`0` circles across all plots and indicators). |
| **Persistent Medical EHR** | SQLite (`data/astrohealth_mission.db`) | Survives power cycles and reboots, storing `crew_state`, `exam_records`, `alert_events`, `diet_logs`, `exercise_logs`, and `mental_logs`. |

---

## 3. Multi-Dataset Ingestion & Calibration Specification

AstroHealth Edge OS is engineered to work seamlessly with real NASA and clinical datasets, both at boot via `data/` and dynamically via the **Mission Data** page (`#deploy`):

### A. Supported Source Datasets

1. **NASA Space Radiation Telemetry (`data/radiation/*.ict` or `.csv`)**
   - Supports **ICARTT (`.ict`)** format: dynamically reads line 1 (`header_lines, format_index`) to skip variable-length metadata headers.
   - Extracts time (`Julian_date` / `Start_UTC`), proton flux (`P01` / `proton_flux` in `pfu`), and ambient dose rate (`ARML3dr` / `ambient_dose` in `mSv/day`).
   - Replaces NASA missing-value sentinels (`-9999`, `-9999.0`, `-999999`, `NaN`) and executes chronological forward-fill + backward-fill imputation.

2. **NASA Open Science Data Repository (`data/osd195/*.txt` or `.tsv` / `.csv`)**
   - Parses tab- or comma-separated RMA gene expression files while ignoring `#` metadata comment lines.
   - Computes cohort mean expression (`genetic_atrophy_baseline`, default `1.2500x`) and tracks key atrophy markers (`TRIM63`, `FBXO32`, `MSTN`, `FOXO3`, `ACTA1`, `MYH7`).

3. **MIMIC-III Clinical ICU Labs (`data/mimic/LABEVENTS.csv` + `D_LABITEMS.csv`)**
   - Joins `LABEVENTS.csv` with `D_LABITEMS.csv` on `ITEMID` (case-insensitive).
   - Isolates the target subject cohort, removes non-numeric records, pivots `CHARTTIME` chronologically, maps physiological channels (`Heart Rate`, `Oxygen Saturation`, `Lactate`), and imputes missing intervals via `.ffill().bfill()`.
   - Also accepts direct Vital CSV files containing `heart_rate`, `spo2`, and `lactate` columns.

4. **Synchronized Playback Feed (`data/simulation_feed.csv` — 156 Real Merged Ticks)**
   - Pre-loaded with the real merged **156-tick MIMIC-III + ICARTT Radiation + NASA OSD-195** telemetry dataset (88 clinical lab & space weather channels).
   - Maps `P01` (2.00–5.13 pfu), `ARML3dr`, `genetic_atrophy_baseline` (`2.6954x`), `Glucose` (40–355 mg/dL), `Temperature` (38.7 °C), `Lactate` (1.3–5.6 mmol/L), `Cortisol`, `C-Reactive Protein`, `Hemoglobin`, `WBC`, and arterial blood gases (`pO2`, `pCO2`, `pH`).
   - Automatically converts arterial `pO2` (mmHg) to `SpO2` (%) via the **Severinghaus oxygen-hemoglobin dissociation curve** and derives autonomic heart rate from temperature, lactate, and cortisol stress load when direct pulse-oximeter columns are omitted.

### B. Using Your Own Datasets
- **Via UI:** Navigate to **Mission Data** (`#deploy`), select the stream target (`NASA Radiation`, `OSD-195`, `MIMIC-III LABEVENTS.csv`, `D_LABITEMS.csv`, or `simulation_feed.csv`), and upload your file. Python automatically cleans, merges, and begins streaming your dataset immediately.
- **Via Filesystem:** Place your raw files inside `data/radiation/`, `data/osd195/`, and `data/mimic/`, then click **Re-Clean & Sync Local Datasets** (or run `python deliverables/clean_and_merge.py` in a Pandas environment).

---

## 4. Scientific & Clinical Algorithms

### 4.1 Physiological Exponential Moving Average (EMA)
Suppresses transient motion/EVA artifacts without masking genuine cabin hypoxia:
$$S_t = \alpha \cdot X_t + (1 - \alpha) \cdot S_{t-1}, \quad \alpha = 0.30$$
- **Hypoxia Escalation:** Triggered when smoothed `EMA SpO2 < 90.0%` (`CRITICAL`).

### 4.2 Space Weather 5-Sample OLS Slope ($d\Phi/dt$)
Detects the rising edge of Solar Particle Events minutes before peak radiation dose arrives:
$$\frac{d\Phi}{dt} = \frac{\sum_{i=1}^{5}(t_i - \bar{t})(\Phi_i - \bar{\Phi})}{\sum_{i=1}^{5}(t_i - \bar{t})^2}$$
- Scaled by habitat shielding factor (`1.00x` Spacecraft, `0.72x` Station, `1.35x` Surface Rover, `0.82x` Regolith Base).
- **SPE Shelter Trigger:** `dPhi/dt > 1.50 pfu/s` (`WARNING`).

### 4.3 OSD-195 Muscle Atrophy Risk & Exercise Offset
$$\text{Atrophy Risk} = \text{OSD195\_Mean} \times \left(1 + P_{\text{gravity}} + P_{\text{hypoxia}} + P_{\text{cortisol}} - C_{\text{exercise}}\right)$$
- $P_{\text{gravity}} = 0.06$ at `0.00g` microgravity; $P_{\text{hypoxia}} = 0.14$ if `SpO2 < 90%`; $P_{\text{cortisol}} = 0.08$ if `Mental Stress >= 55`.
- **Countermeasure Offset:** Logged ARED/T2/CEVIS workouts credit up to `-0.10` risk reduction for 90+ minutes of daily exercise.

### 4.4 Behavioral & Autonomic Stress Index ($4\text{–}100$)
$$\text{Stress} = \text{clamp}_{4}^{100}\Big(\max(0, \text{HR}_{\text{ema}} - 65)\times 1.25 + \max(0, d\Phi/dt)\times 6.5 + \max(0, 7 - \text{Sleep})\times 7.5 + \max(0, 4 - \text{Mood})\times 9 + \text{Flags}\Big)$$

### 4.5 Spaceflight-Adapted NEWS2 Clinical Acuity Matrix
Combines `EMA SpO2`, `EMA Heart Rate`, `Systolic BP`, `Core Temperature`, `Capillary Blood Glucose`, `Radiation Slope`, and `Mental Load` into an objective **0–19 point triage score** across four tiers:
- **0–1 (`NOMINAL`)** · **2–4 (`MONITOR`)** · **5–6 or single red parameter (`URGENT`)** · **≥ 7 or SpO2 < 90% (`EMERGENCY`)**

---

## 5. Astronaut Self-Care & Workstation Modules

1. **Digital Twin (`#overview`)**: Interactive 5-region body schematic (Brain, Lungs, Heart, Metabolic/Immune, Muscle/Bone) with plain-language measurement instructions, environment switcher, NEWS2 acuity summary, fault drills, and daily protocol checklist.
2. **Self-Exam & EHR (`#exam`)**: Blood pressure + MAP calculator, blood glucose, tympanic core temperature, and camera/ultrasound image inspection archived in SQLite alongside a hazard audit timeline.
3. **Crew Logs (`#logs`)**: Persistent Nutrition & Hydration tracker (kcal, protein, mL water, Vitamin D), Exercise & ARED/T2/CEVIS countermeasure log (dynamically reducing atrophy risk), and Mental Health Journal.
4. **Telemetry (`#telemetry`)**: 7 live scientific plots (EMA SpO2/HR, Proton Flux + OLS Slope, 5-Axis Readiness Radar, OSD-195 Gene Bars, Glucose/Temp, Stress/Dose Budget, Arterial BP/MAP) + direct sensor packet injection.
5. **Algorithms (`#algorithms`)**: Transparent live formula inspection showing exact numerical Python substitutions for the current frame.
6. **Wellness & AI (`#wellness`)**: Sleep/mood/fatigue check-in, rectangular **4-7-8 Vagal Breathing Pacer**, circadian light hygiene protocols, and telemetry-grounded Behavioral Flight Surgeon companion.
7. **Mission Data (`#deploy`)**: Runtime health metrics, multi-dataset ingestion/upload console, Supporting Document download, and one-click **Store-and-Forward Flight Surgeon JSON** report export.

---

## 6. Verification & Deployment Checklist

- **Unit Tests:** `python3 python_engine/test_edge_backend.py` validates EMA filtering, 5-sample OLS slope math, NEWS2 scoring, SQLite persistence, crew logs, and pure-Python dataset cleaning.
- **Production Build:** `npm run build` compiles the workstation bundle into `dist/`; `npm start` runs the Node gateway + Python engine together.
- **Containerized Flight Deployment:** `docker compose up --build -d` launches a self-contained spacecraft/habitat node persisting `./data/astrohealth_mission.db` across restarts.
