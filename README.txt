AQUA-STRAT — Ecosystem-Aware Decision Support System for Marine Plastic Intervention Planning
Final integrated application · Dept. of CS&E, MITE Moodabidri · 2025-26
==========================================================================================

HOW TO OPEN
-----------
1. Unzip the folder (keep all sub-folders together).
2. Double-click  index.html  -> it opens in Google Chrome / Microsoft Edge.
   No installation, no Python, no server, no security prompts.
   Internet is only used for the detailed map background tiles (an offline coastline map is built in).

ACCESS
------
Public      : no login (status, area search, beach safety, alerts, validated sighting reports, hotspots, risk)
Researcher  : institutional e-mail (.ac.in / .edu / .res.in) + ORCID iD (checksum verified) or VTU seat number (USN)
Government  : official e-mail (@<dept>.gov.in / @nic.in) + employee ID from the authorised officer registry

Demo accounts (type them in, or copy-paste):
  Government : officer.fisheries@karnataka.gov.in   ID: GOV-KA-FIS-1001        Password: Aqua@2026
  Researcher : researcher@mite.ac.in                ID: 0000-0002-1825-0097    Password: Aqua@2026

Authorised government employee IDs that can REGISTER (format GOV-<state>-<dept>-<number>):
  GOV-KA-FIS-1002  GOV-KA-ENV-1101  GOV-KL-FIS-2001  GOV-KL-ENV-2101  GOV-AP-ENV-3001
  GOV-TN-FIS-4001  GOV-OD-ENV-5001  GOV-WB-ENV-6001  GOV-GJ-FIS-7001  GOV-MH-CZM-8001
  GOV-GA-ENV-8101  GOV-AN-ENV-8201  GOV-IN-MOE-9001  GOV-IN-CGD-9101
  (any other ID, a non-government e-mail, or a reused ID is rejected)
Passwords: 8+ characters with upper-case, lower-case and a digit. Passwords are stored only as SHA-256 hashes.

WHAT IS REAL (no synthetic values)
----------------------------------
* Grid               : grid_master_full.csv (15,976 cells; 14,777 scored)
* Forecast           : output of the trained LSTM v5 (aqua_strat_lstm_v5.keras). BUNDLED RUN: 06 Nov 2026 inference (refreshed automatically every morning, see README.md),
                       33 daily dates 15 Oct -> 16 Nov 2026 (24 on Copernicus analysis physics, 9 on forecast physics),
                       pipeline verified: reproduces predicted_hotspots_v5.csv exactly (mean |diff| = 0.000000, corr = 1.0).
                       Daily dates come from notebooks/AQUA_STRAT_Daily_LSTM_Inference.ipynb, which runs the trained
                       model on the latest Copernicus ocean physics (analysis for past days, Copernicus forecast physics
                       for the coming days). Without that file the app shows predicted_hotspots_v5.csv.
* Hotspot tiers      : tertiles of predicted density (as in the LSTM notebook)
* Ecological risk    : P×H, P×W, combined = ½P×H + ½P×W, tiers as in Objective-4 v6
* Cleanup planner    : the Objective-4 Genetic Algorithm (same candidates, cost, fitness, operators, parameters)
                       + vessel route sequencing of the selected sites (shortest tour per trip, trips balanced across vessels)
* Plastic detector   : the trained YOLOv8m checkpoint aqua_strat_best_v7 running in the browser
                       (int8 weights; same predictions as PyTorch within ±0.01 confidence)
* FDI                : results of AQUA_STRAT_FDI_Final.ipynb (60 Sentinel-2 tiles, 255 validated grid cells with FDI values,
                       Spearman rho = -0.222) — shown as a map layer and table on the FDI Analysis page
* Beach status       : mean predicted density within 30 km vs the tertiles of all coastal waters of the same sea that day

DAILY UPDATE
------------
Automatic (product setup): GitHub Actions runs pipeline/daily_forecast.py every day at 06:00 IST,
          commits the new data/lstm.js and Vercel redeploys the site. Setup steps: README.md.
Option A (any computer, no coding): run the Colab notebook, then in the app open
          "Data & Model Runs" -> choose the downloaded aquastrat_daily_predictions_*.zip
Option B (bundle permanently):       python tools/update_daily_data.py aquastrat_daily_predictions_*.zip

FOLDER
------
index.html            application entry point
assets/               styles, application code (core, auth, map, search, planner, detector, pages), images, Leaflet
data/                 grid, LSTM outputs, metadata, FDI, offline coastline, coastal gazetteer (2,400+ towns & beaches)
models/               aqua_strat_best_v7.pt (YOLOv8m), aqua_strat_lstm_v5.keras, browser detector engine + weights
notebooks/            CNN training, FDI, LSTM v5, Objective-4 risk+GA, daily LSTM inference
tools/                update_daily_data.py

Decision-support output — not an official government order.
