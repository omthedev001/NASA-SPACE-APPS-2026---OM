"""
AstroHealth Edge OS — Deliverable 1: Data Cleaning & Synchronization Pipeline
===========================================================================
Ingests three disparate offline datasets from local folders:
  1. NASA Space Radiation (.ict ICARTT files)
  2. NASA Space Biology OSD-195 (.txt RMA gene expression files)
  3. MIMIC-III ICU Labs (LABEVENTS.csv + D_LABITEMS.csv)

Cleans, imputes, aligns on an integer `sim_tick` sequence, appends the static
`genetic_atrophy_baseline` multiplier, and exports `simulation_feed.csv`.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("astrohealth.pipeline")


def resolve_data_dir() -> Path:
    """Resolve the local data directory whether executed from root or deliverables/."""
    candidates = [
        Path.cwd() / "data",
        Path(__file__).resolve().parent / "data",
        Path(__file__).resolve().parent.parent / "data",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    raise FileNotFoundError(
        "Unable to locate local 'data/' directory containing radiation, osd195, and mimic folders."
    )


def clean_nasa_radiation(radiation_dir: Path) -> pd.DataFrame:
    """
    Parse ICARTT (.ict) radiation telemetry files.
    - Dynamically reads the first line to determine header length.
    - Extracts Julian_date, P01 (Proton Flux), and ARML3dr (Ambient Dose).
    - Replaces -9999 sentinels with NaN and imputes using .ffill() and .bfill().
    - Sorts chronologically by Julian_date.
    """
    ict_files = sorted(radiation_dir.glob("*.ict"))
    if not ict_files:
        raise FileNotFoundError(f"No .ict files found in {radiation_dir}")

    frames: list[pd.DataFrame] = []
    for ict_path in ict_files:
        with ict_path.open("r", encoding="utf-8") as handle:
            first_line = handle.readline().strip()

        if not first_line:
            raise ValueError(f"Empty ICARTT header in {ict_path}")

        try:
            header_lines = int(first_line.split(",")[0].strip())
        except ValueError as exc:
            raise ValueError(
                f"Invalid ICARTT first line '{first_line}' in {ict_path}"
            ) from exc

        # ICARTT header_lines includes the column-name row at line index (header_lines - 1)
        skip_count = max(0, header_lines - 1)
        df = pd.read_csv(ict_path, skiprows=skip_count)
        df.columns = [col.strip() for col in df.columns]

        required_cols = {"Julian_date", "P01", "ARML3dr"}
        missing = required_cols - set(df.columns)
        if missing:
            raise KeyError(
                f"Missing required radiation columns {missing} in {ict_path}"
            )

        subset = df[["Julian_date", "P01", "ARML3dr"]].copy()
        for col in ["Julian_date", "P01", "ARML3dr"]:
            subset[col] = pd.to_numeric(subset[col], errors="coerce")

        # Replace standard NASA missing-value sentinel (-9999) with NaN
        subset = subset.replace([-9999, -9999.0], np.nan)
        subset = subset.sort_values("Julian_date", kind="mergesort")
        subset = subset.ffill().bfill()
        frames.append(subset)

    merged_rad = pd.concat(frames, ignore_index=True)
    merged_rad = merged_rad.sort_values("Julian_date", kind="mergesort").reset_index(
        drop=True
    )
    merged_rad = merged_rad.rename(
        columns={
            "Julian_date": "julian_date",
            "P01": "proton_flux",
            "ARML3dr": "ambient_dose",
        }
    )
    logger.info("Cleaned %d radiation telemetry rows.", len(merged_rad))
    return merged_rad


def compute_genomic_baseline(osd_dir: Path) -> float:
    """
    Parse NASA Space Biology OSD-195 tab-separated files, ignoring '#' comment lines.
    Returns the overall mean of the VALUE column (RMA gene expression) across subjects
    as a static `genetic_atrophy_baseline` multiplier.
    """
    txt_files = sorted(osd_dir.glob("*.txt"))
    if not txt_files:
        raise FileNotFoundError(f"No OSD-195 .txt files found in {osd_dir}")

    values: list[pd.Series] = []
    for txt_path in txt_files:
        df = pd.read_csv(txt_path, sep="\t", comment="#")
        df.columns = [col.strip().upper() for col in df.columns]
        if "VALUE" not in df.columns:
            raise KeyError(f"Column 'VALUE' not found in {txt_path}")

        numeric_vals = pd.to_numeric(df["VALUE"], errors="coerce").dropna()
        if not numeric_vals.empty:
            values.append(numeric_vals)

    if not values:
        raise ValueError("No valid numeric RMA expression values found in OSD-195 files.")

    combined = pd.concat(values, ignore_index=True)
    baseline = round(float(combined.mean()), 4)
    logger.info("Computed genetic_atrophy_baseline = %.4f", baseline)
    return baseline


def clean_mimic_labs(
    mimic_dir: Path, target_subject_id: Optional[int] = None
) -> pd.DataFrame:
    """
    Ingest MIMIC-III LABEVENTS.csv and D_LABITEMS.csv:
    - Merge on ITEMID to attach human-readable lab LABELs.
    - Isolate a single subject_id.
    - Drop rows missing numeric VALUENUM.
    - Pivot so CHARTTIME timestamps are rows and lab tests are columns.
    - Fill gaps with .ffill() and .bfill().
    """
    labevents_path = mimic_dir / "LABEVENTS.csv"
    d_labitems_path = mimic_dir / "D_LABITEMS.csv"
    if not labevents_path.exists() or not d_labitems_path.exists():
        raise FileNotFoundError(
            f"Expected LABEVENTS.csv and D_LABITEMS.csv in {mimic_dir}"
        )

    events = pd.read_csv(labevents_path)
    items = pd.read_csv(d_labitems_path)

    events.columns = [c.strip().lower() for c in events.columns]
    items.columns = [c.strip().lower() for c in items.columns]

    merged = events.merge(
        items[["itemid", "label"]].drop_duplicates(),
        on="itemid",
        how="inner",
    )

    if target_subject_id is None:
        target_subject_id = int(merged["subject_id"].iloc[0])

    subject_df = merged[merged["subject_id"] == target_subject_id].copy()
    if subject_df.empty:
        raise ValueError(f"No lab records found for subject_id={target_subject_id}")

    subject_df["valuenum"] = pd.to_numeric(subject_df["valuenum"], errors="coerce")
    subject_df = subject_df.dropna(subset=["valuenum"])

    pivoted = subject_df.pivot_table(
        index="charttime",
        columns="label",
        values="valuenum",
        aggfunc="mean",
    ).sort_index()

    pivoted = pivoted.ffill().bfill().reset_index()

    # Standardize vital column names for downstream edge ingestion
    column_map = {
        "Heart Rate": "heart_rate",
        "Oxygen Saturation": "spo2",
        "Lactate": "lactate",
    }
    pivoted = pivoted.rename(columns=column_map)
    for required in ("heart_rate", "spo2"):
        if required not in pivoted.columns:
            raise KeyError(
                f"Expected pivoted lab column '{required}' from MIMIC-III labs."
            )

    if "lactate" not in pivoted.columns:
        pivoted["lactate"] = 1.2

    logger.info(
        "Cleaned %d pivoted MIMIC-III timestamps for subject_id=%s.",
        len(pivoted),
        target_subject_id,
    )
    return pivoted[["heart_rate", "spo2", "lactate"]]


def build_simulation_feed(
    data_dir: Optional[Path] = None,
    output_path: Optional[Path] = None,
    subject_id: Optional[int] = None,
) -> pd.DataFrame:
    """Run the full offline cleaning pipeline and write simulation_feed.csv."""
    root_data = data_dir or resolve_data_dir()
    out_file = output_path or (root_data / "simulation_feed.csv")

    rad_df = clean_nasa_radiation(root_data / "radiation")
    baseline = compute_genomic_baseline(root_data / "osd195")
    icu_df = clean_mimic_labs(root_data / "mimic", target_subject_id=subject_id)

    # Align both time-series streams on a synchronized integer sim_tick sequence
    aligned_len = min(len(rad_df), len(icu_df))
    if aligned_len == 0:
        raise ValueError("Cannot build simulation_feed.csv from empty dataset stream.")

    rad_aligned = rad_df.iloc[:aligned_len].reset_index(drop=True)
    icu_aligned = icu_df.iloc[:aligned_len].reset_index(drop=True)

    feed = pd.DataFrame({"sim_tick": np.arange(aligned_len, dtype=int)})
    feed["julian_date"] = rad_aligned["julian_date"].round(5)
    feed["proton_flux"] = rad_aligned["proton_flux"].round(2)
    feed["ambient_dose"] = rad_aligned["ambient_dose"].round(2)
    feed["heart_rate"] = icu_aligned["heart_rate"].round(1)
    feed["spo2"] = icu_aligned["spo2"].round(1)
    feed["lactate"] = icu_aligned["lactate"].round(2)
    feed["genetic_atrophy_baseline"] = baseline

    feed.to_csv(out_file, index=False)
    logger.info("Exported %d synchronized rows to %s", len(feed), out_file)
    return feed


if __name__ == "__main__":
    build_simulation_feed()
