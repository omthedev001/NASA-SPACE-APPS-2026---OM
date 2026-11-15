"""
Automated Unit & Algorithm Verification Suite for AstroHealth Python Edge Backend.
Run with: python3 python_engine/test_edge_backend.py
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from edge_backend import (
    DATA_DIR,
    EMA_ALPHA,
    MissionDatabase,
    PythonAstroHealthEngine,
    load_simulation_feed,
    rebuild_simulation_feed_from_raw,
)


class TestAstroHealthPythonAlgorithms(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = MissionDatabase(Path(self.tmp.name) / "test_mission.db")
        self.engine = PythonAstroHealthEngine(db=self.db)
        self.engine.reset()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_ema_alpha_0_30_convergence_and_hypoxia_trigger(self) -> None:
        # Force clean steady state at 98.0%
        self.engine.ema_spo2 = 98.0
        self.engine.ingest_vitals("CREW-BIOMETRIC-01", 10.0, 74.0, 82.0)
        expected = (EMA_ALPHA * 82.0) + ((1.0 - EMA_ALPHA) * 98.0)
        self.assertAlmostEqual(self.engine.ema_spo2, expected, places=4)

        # Single drop yields 93.2 -> not yet hypoxic (<90), rejecting transient glitch
        self.assertFalse(any(p["id"] == "hypoxia" for p in self.engine.evaluate_protocols()))

        # Sustained drops push EMA < 90% and trigger CRITICAL Hypoxia
        for idx in range(3):
            self.engine.ingest_vitals("CREW-BIOMETRIC-01", 11.0 + idx, 108.0, 82.0)
        self.assertLess(self.engine.ema_spo2, 90.0)
        protocols = self.engine.evaluate_protocols()
        hypoxia = [p for p in protocols if p["id"] == "hypoxia"]
        self.assertEqual(len(hypoxia), 1)
        self.assertEqual(hypoxia[0]["severity"], "CRITICAL")

    def test_ols_five_sample_radiation_slope(self) -> None:
        self.engine.set_environment("spacecraft")  # shielding_factor = 1.0
        self.engine.radiation_window.clear()
        # Inject ramp with slope 3.0 pfu/s -> [2, 5, 8, 11, 14] across t=1..5
        for t, flux in ((1.0, 2.0), (2.0, 5.0), (3.0, 8.0), (4.0, 11.0), (5.0, 14.0)):
            self.engine.ingest_radiation("RAD-1", t, flux, 0.8)

        self.assertAlmostEqual(self.engine.radiation_slope, 3.0, places=3)
        spe = [p for p in self.engine.evaluate_protocols() if p["id"] == "spe"]
        self.assertEqual(len(spe), 1)
        self.assertEqual(spe[0]["severity"], "WARNING")

    def test_news2_clinical_score_and_sqlite_persistence(self) -> None:
        self.engine.set_self_assessment(
            {
                "systolic_bp": 152,
                "diastolic_bp": 96,
                "blood_sugar_mg_dl": 62,
                "body_temp_c": 38.4,
            },
            notes="Post-EVA orthostatic and febrile test",
        )
        snap = self.engine.get_snapshot()
        self.assertGreaterEqual(snap["news2"]["total_score"], 5)
        self.assertIn(snap["news2"]["acuity_tier"], ("URGENT", "EMERGENCY"))

        exams = self.db.get_exam_history(5)
        self.assertGreaterEqual(len(exams), 1)
        self.assertEqual(exams[0]["systolic_bp"], 152)

    def test_crew_diet_exercise_and_mental_logs(self) -> None:
        base_risk = self.engine.get_snapshot()["muscle_atrophy_risk"]

        diet_res = self.engine.log_diet(
            {
                "meal_type": "Breakfast",
                "description": "Oatmeal, Freeze-dried Egg & Vitamin D",
                "calories_kcal": 620,
                "protein_g": 32,
                "water_ml": 500,
                "vitamin_d_iu": 800,
            }
        )
        self.assertGreater(diet_res["entry_id"], 0)
        self.assertEqual(diet_res["snapshot"]["daily_logs_summary"]["total_calories_kcal"], 620)

        ex_res = self.engine.log_exercise(
            {
                "modality": "ARED Resistive Squat/Deadlift",
                "duration_min": 60,
                "intensity": "HIGH",
                "resistance_load_pct": 85,
                "notes": "Completed 4x8 squats + calf raises",
            }
        )
        self.assertGreater(ex_res["entry_id"], 0)
        self.assertEqual(ex_res["snapshot"]["daily_logs_summary"]["total_exercise_min"], 60)
        self.assertLess(ex_res["snapshot"]["muscle_atrophy_risk"], base_risk)

        mental_res = self.engine.log_mental_entry(
            {
                "mood_score": 2,
                "stress_level": 8,
                "sleep_hours": 5.0,
                "triggers": "Isolation & Earth Comm Lag",
                "journal_entry": "Felt isolated after missed ground link; ran 4-7-8 breathing.",
            }
        )
        self.assertGreater(mental_res["entry_id"], 0)
        self.assertTrue(mental_res["snapshot"]["mental_checkin"]["isolation_stress"])
        self.assertEqual(mental_res["snapshot"]["daily_logs_summary"]["mental_logs_count"], 1)

    def test_dataset_cleaning_and_merging_with_sentinels(self) -> None:
        # Run pure-Python ETL against a temporary copy of real sample datasets
        tmp_data = Path(self.tmp.name) / "data"
        for sub in ("radiation", "osd195", "mimic"):
            (tmp_data / sub).mkdir(parents=True, exist_ok=True)
            for src_file in (DATA_DIR / sub).iterdir():
                if src_file.is_file():
                    (tmp_data / sub / src_file.name).write_text(
                        src_file.read_text(encoding="utf-8"), encoding="utf-8"
                    )

        summary = rebuild_simulation_feed_from_raw(tmp_data)
        self.assertGreaterEqual(summary["aligned_rows"], 30)
        self.assertAlmostEqual(summary["genetic_atrophy_baseline"], 1.25, places=3)
        feed_file = tmp_data / "simulation_feed.csv"
        self.assertTrue(feed_file.exists())
        text = feed_file.read_text(encoding="utf-8")
        self.assertNotIn("-9999", text)

    def test_real_88col_merged_feed_ingestion(self) -> None:
        feed = load_simulation_feed()
        self.assertEqual(len(feed), 156)
        first = feed[0]
        self.assertAlmostEqual(first["proton_flux"], 2.0, places=2)
        self.assertAlmostEqual(first["genetic_atrophy_baseline"], 2.6954, places=3)
        self.assertEqual(first["glucose"], 126.0)
        self.assertEqual(first["temperature"], 38.7)
        # pO2 = 94.0 mmHg -> Severinghaus SpO2 ~ 97.27%
        self.assertGreater(first["spo2"], 96.5)
        self.assertLess(first["spo2"], 98.5)

        snap = self.engine.get_snapshot()
        self.assertEqual(snap["simulator"]["total_rows"], 156)
        self.assertAlmostEqual(snap["genetic_atrophy_baseline"], 2.6954, places=3)
        self.assertAlmostEqual(snap["self_assessment"]["body_temp_c"], 38.7, places=1)
        self.assertIsNotNone(snap["live_labs"]["lactate"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
