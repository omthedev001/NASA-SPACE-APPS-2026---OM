# AstroHealth Edge OS — Local Offline Python Runbook

Run all five deliverables locally with zero cloud or internet dependencies:

1. Install Python dependencies once (or inside an offline wheelhouse):
   pip install -r deliverables/requirements.txt

2. Clean & merge the local NASA/MIMIC-III datasets into `data/simulation_feed.csv`:
   python deliverables/clean_and_merge.py

3. Start the offline FastAPI Edge Server & Digital Twin UI on port 8000:
   uvicorn main:app --app-dir deliverables --host 127.0.0.1 --port 8000

4. In a second terminal, launch the 1 Hz hardware stream simulator:
   python deliverables/simulator.py

5. Open http://127.0.0.1:8000 in any local browser.
