# AQUA-STRAT

**Ecosystem-Aware Decision Support System for Marine Plastic Intervention Planning**

AQUA-STRAT detects marine plastic, forecasts where it will accumulate, scores the ecological risk to habitats and wildlife, and plans cleanup sites and vessel routes, for the Arabian Sea, the Bay of Bengal and the Indian Ocean. The forecast refreshes **automatically every morning** from real Copernicus ocean data.

**Live application:** https://aqua-strat-marine-plastic.vercel.app/

> Final-year B.E. capstone project, Department of Computer Science & Engineering, MITE Moodabidri (2026-27).
> Decision-support output, not an official government order.

---

## Contents

1. [What it does](#what-it-does)
2. [How it works](#how-it-works)
3. [Automatic daily forecast](#automatic-daily-forecast)
4. [Results](#results)
5. [The application](#the-application)
6. [Architecture: is it an app? where is the backend?](#architecture-is-it-an-app-where-is-the-backend)
7. [Repository layout](#repository-layout)
8. [Setup: GitHub + Vercel + daily automation](#setup-github--vercel--daily-automation)
9. [Running it locally](#running-it-locally)
10. [Testing](#testing)
11. [Limitations and roadmap](#limitations-and-roadmap)
12. [Data sources and credits](#data-sources-and-credits)

---

## What it does

| Stage | Method | Output |
|---|---|---|
| **1. Grid & data** | 15,976-cell grid over AS / BOB / IO, joined on `grid_id` | 14,777 scored ocean cells with ocean physics, habitat (H) and wildlife (W) values |
| **2. Plastic detection** | YOLOv8m fine-tuned on 11,373 images (TrashCan 1.0, Trash-ICRA19, SeaClear, own photos) | Bounding boxes + confidence; runs **inside the browser** (ONNX Runtime Web, int8) |
| **2b. Satellite check** | Floating Debris Index (FDI) from 60 Sentinel-2 tiles | FDI per grid cell, compared with the forecast |
| **3. Forecasting** | Region-balanced LSTM (96→48 units), 14-day window, 20 features/day | Next-day plastic-accumulation density for every cell, **refreshed daily** |
| **4. Ecological risk** | R_H = P×H, R_W = P×W, combined = ½R_H + ½R_W | Low / Medium / High risk tiers |
| **5. Optimisation** | Genetic Algorithm (300 candidates, 150 generations, seed 42) + nearest-port route planner (13 Indian ports) | Cleanup sites, vessel trips, km, cost, schedule |
| **6. Decision support** | Role-based web application (Public / Researcher / Government) | Maps, alerts, beach safety, advisories, sighting verification, reports |

**What is new:** the four stages share one grid, so a cleanup plan comes straight from the latest forecast; one region-balanced LSTM serves three very different seas; and ecological risk is *inside* the optimiser's objective, not checked afterwards.

---

## How it works

```
 Copernicus Marine (daily ocean physics)     Sentinel-2      coral/reef habitat     OBIS wildlife
                 │                               │                  │                    │
                 └──────────────────────┬────────┴──────────────────┴────────────────────┘
                                        ▼
                          Shared spatial grid  (grid_id)
                                        │
   YOLOv8 detection ──► LSTM forecast ──► Ecological risk (P×H, P×W) ──► GA + vessel routes
                                        │
                                        ▼
                   Web application: Public · Researcher · Government
```

The LSTM is **trained once** (on a full year of 2025 Copernicus physics). Every day only the *inputs* change: the latest observed ocean state plus Copernicus's own 10-day ocean forecast. The model turns them into a plastic-accumulation forecast for every cell.

---

## Automatic daily forecast

```
Every morning 06:00 IST  (GitHub Actions, free)
   └─ pipeline/daily_forecast.py
        1. loads the trained LSTM  models/aqua_strat_lstm_v5.keras    (no retraining)
        2. loads the exact 2025 training normalisation   pipeline/model_inputs.json
        3. VERIFIES: re-predicts reference cells and compares with the trained v5 output
                     (stops and publishes nothing if they differ)
        4. logs in to Copernicus Marine   (password stored as a GitHub Secret, never in code)
        5. downloads the latest surface physics: temperature, salinity, currents u/v, sea level
           (≈24 past days of analysis + ≈9-10 days of Copernicus forecast)
        6. predicts next-day density for all 14,777 cells, for every date
        7. writes data/lstm.js and commits it
   └─ Vercel sees the commit and redeploys the website (~1 minute)

Users open the link → the app loads the newest forecast by itself.
```

- **Manual refresh:** GitHub → *Actions* → *Daily LSTM forecast* → **Run workflow**.
- **Safety:** if Copernicus is down, the login fails or verification fails, the job stops **without** touching `data/lstm.js`, so the site keeps the last verified run.
- **Rolling window:** each run covers about 24 observed days and 9 forecast days, so the site always shows the coming week.
- **Backup (no GitHub needed):** run `notebooks/AQUA_STRAT_Daily_LSTM_Inference.ipynb` in Colab and either upload the zip on the *Data & Model Runs* page or run `python tools/update_daily_data.py <zip>`.
- A run uploaded in a browser is used only if it is at least as recent as the deployed run, so automatic updates are never hidden by an old upload.

---

## Results

| Component | Metric | Result |
|---|---|---|
| YOLOv8m detector | Precision / Recall / mAP@50 / mAP@50-95 | **0.785 / 0.659 / 0.750 / 0.450** (2,118 validation objects) |
| Detector in browser | Confidence vs PyTorch on the same image | 0.84 vs 0.828; ≈3.6 s per photo, offline |
| LSTM forecaster | R² (test, 812,735 sequences) | **0.744 overall**; AS 0.732, BOB 0.714, IO 0.481 |
| | MAE / RMSE (pooled) | 0.0206 / 0.0278 |
| Daily pipeline | Reproduction of trained output | mean \|diff\| = 0, correlation = 1.0 |
| Hotspots | Accumulation tiers (equal thirds) | Low 4,926 · Medium 4,925 · High 4,926 cells |
| Ecological risk | Combined risk tiers | Low 13,401 · Medium 688 · High 688 cells |
| GA (baseline) | Sites / plastic removed / cost / disturbance | 28 sites · 7.851 · 14,288.9 · 6.132 |
| Dynamic planner (28 Oct 2026, all regions) | Sites / trips / route distance | 44 sites · 13 trips · 5,995 km vs 12,080 km (≈50% shorter) · ≈0.2 s |
| FDI cross-check | Spearman ρ (255 cells) | −0.222 (p = 0.0004): sparse single-date coverage |
| Testing | Automated tests | **80 / 80 passed** (Playwright in real Chrome) |

The forecasting target is a physics- and ecology-informed density field, so values are a **relative ranking** of where accumulation is likely, not counts of plastic items.

---

## The application

| Role | Access | Pages |
|---|---|---|
| **Public** | no login | Overview, Area Search, Beach Safety, Alerts, Report Sighting, Hotspots, Ecological Risk (7) |
| **Researcher** | academic e-mail (.ac.in / .edu / .res.in) + ORCID iD (ISO 7064 MOD 11-2 checksum) or VTU USN | + LSTM Forecast, FDI Analysis, Plastic Detector, Data & Model Runs (9) |
| **Government** | official e-mail (@…gov.in / @nic.in) + ID from the authorised-officer registry | + Cleanup Planner, Alerts & Advisories, Public Sightings review, Reports (12) |

Demo accounts (evaluation only):

| Role | E-mail | ID | Password |
|---|---|---|---|
| Government | officer.fisheries@karnataka.gov.in | GOV-KA-FIS-1001 | Aqua@2026 |
| Researcher | researcher@mite.ac.in | 0000-0002-1825-0097 | Aqua@2026 |

Every number on screen comes from the model run of the selected date. Picking a different date recomputes hotspots, risk tiers, alerts, beach status and the cleanup plan.

---

## Architecture: is it an app? where is the backend?

**AQUA-STRAT is a web application** (a browser-based app). It opens from a link, or from `index.html` with no installation, and works offline once loaded.

It is built in a **"static front end + scheduled compute"** design, which is common for data products:

| Part | Where it runs | What it does |
|---|---|---|
| **Heavy compute** (the "backend job") | GitHub Actions, daily | Downloads Copernicus data, runs the LSTM, verifies, publishes `data/lstm.js` |
| **Hosting** | Vercel (global CDN) | Serves the app and the latest forecast file over HTTPS |
| **Application logic** | the user's browser | Risk tiers, GA optimisation, routes, search, the YOLOv8 detector (ONNX/WebAssembly) |
| **Accounts, sightings, uploads** | the user's browser (`localStorage`) | See below |

### Where do registered users' details go?

In this version, **accounts are stored in the browser of the device where they were created** (`localStorage`):

- **Register:** the e-mail domain, ORCID checksum / USN format and the government registry ID are checked. The password is hashed with **SHA-256** (Web Crypto), and the account is saved in that browser.
- **Login:** the typed password is hashed and compared with the stored hash. After **5 wrong attempts** the account locks.
- Plain-text passwords are never stored, and nothing is sent to any server.
- **Consequence:** an account made on one laptop does not exist on another device. That suits a prototype or demo, but **not** a multi-user national service.

### Moving to a shared backend (roadmap)

To share accounts, sightings and plans across devices, add a hosted database with authentication, without changing the forecasting pipeline:

- **Supabase / Firebase**, or a small FastAPI/Node API with PostgreSQL;
- tables for users (role, verified ID), sightings (photo, location, status), and plans and advisories;
- the registry check and role permissions enforced on the server (row-level security), plus admin approval of new officers;
- e-mail / SMS alerts when a beach or port turns High.

---

## Repository layout

```
index.html                     application entry point
assets/                        styles, images, Leaflet, application code
  js/core.js                   data loading, tiers, risk, spatial index, daily-run selection
  js/auth.js                   registration / login, ID checks, SHA-256, lockout
  js/planner.js                Objective-4 Genetic Algorithm + vessel route planner
  js/detector.js               YOLOv8m in the browser (ONNX Runtime Web)
  js/search.js, map.js, pages.js, app.js
data/
  lstm.js                      ◄ daily forecast (rewritten automatically every morning)
  grid.js, meta.js, fdi.js, places.js, land.js
models/
  aq_yolov8m_int8.js, aq_engine.js, ort.wasm.min.js   browser detector
  aqua_strat_best_v7.pt        trained YOLOv8m (PyTorch)
  aqua_strat_lstm_v5.keras     trained LSTM (used by the daily job)
pipeline/
  daily_forecast.py            automatic daily inference (GitHub Actions)
  requirements.txt
  model_inputs.json            ◄ exported ONCE from Colab (training normalisation + grid + check sample)
.github/workflows/daily-forecast.yml   06:00 IST schedule + manual "Run workflow"
notebooks/                     CNN training, FDI, LSTM v5, Objective-4 risk + GA, daily inference
tools/update_daily_data.py     bundle a Colab run into data/lstm.js by hand
.vercelignore                  keeps automation/training files out of the website deployment
```

---

## Setup: GitHub + Vercel + daily automation

### 1. Put the project on GitHub
Use **GitHub Desktop** or `git`. The GitHub website's drag-and-drop upload is limited to 25 MB per file, and some model and notebook files are larger.
```
git init
git add .
git commit -m "AQUA-STRAT final application with automatic daily forecast"
git branch -M main
git remote add origin https://github.com/<your-username>/aqua-strat.git
git push -u origin main
```

### 2. Connect Vercel to the repository
Vercel → your project → **Settings → Git → Connect Git Repository** → choose the repo, production branch `main`. (Or create a new project with **Add New → Project → Import**.) Framework preset: **Other**, no build command, output directory: root. From now on, every push, including the automatic daily commit, redeploys the site.

### 3. Export the training inputs once (Colab)
Run `notebooks/AQUA_STRAT_Daily_LSTM_Inference.ipynb` in Colab once, with **Step 8: `EXPORT_FOR_GITHUB = True`**. It downloads `model_inputs.json`. Put it in `pipeline/` and push. The file contains no credentials.

### 4. Add the Copernicus login as GitHub Secrets
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `CMEMS_USERNAME`: your Copernicus Marine e-mail or username
- `CMEMS_PASSWORD`: your Copernicus Marine password

### 5. Test it
GitHub → **Actions → Daily LSTM forecast → Run workflow**. In about 10–15 minutes you should see a commit "Daily forecast YYYY-MM-DD", then a new Vercel deployment, and the site's date strip moves forward. After that it runs by itself every morning at 06:00 IST.

---

## Running it locally

- **Just open it:** double-click `index.html` (Chrome or Edge). No server or installation.
- **Run the daily job on your PC:**
  ```
  pip install -r pipeline/requirements.txt
  set COPERNICUSMARINE_SERVICE_USERNAME=you@example.com
  set COPERNICUSMARINE_SERVICE_PASSWORD=********
  python pipeline/daily_forecast.py
  ```

---

## Testing

80 automated tests, all passing:

| Suite | Tests | What is checked |
|---|---|---|
| Baseline | 24 | risk formula, tiers, haversine, GA fitness, labels in the notebooks |
| Final data | 12 | app values = model output (within 6.7 × 10⁻⁶); tiers identical to the notebook; each date a distinct run |
| Final application | 38 | every page and role in real Chrome (Playwright); security (fake IDs, bad ORCID, personal e-mails rejected); offline; 44 rapid page switches, 0 errors |
| Acceptance | 6 | NFR targets: detector P ≥ 0.75 and mAP@50 ≥ 0.70, R² ≥ 0.70, page < 3 s, plan < 5 s |

12 defects were found and fixed during testing (D-B01–04, D-F01–08).

---

## Limitations and roadmap

- **Forecast target:** a physics- and ecology-informed density (a relative ranking). Next: train on observed data (beach surveys, cleanup records, multi-date satellite composites, MARIDA labels).
- **Detector recall 0.659:** mostly underwater and shoreline training images. Next: fine-tune on drone and satellite imagery of floating plastic.
- **FDI coverage** is sparse (0.1–7.4% of cells). Next: multi-date composites.
- **Accounts and sightings are per-browser.** Next: a shared backend (see above) and SMS / e-mail alerts.
- **Operations model:** add vessel capacity, fuel and weather windows; pilot with a fisheries department or NGO; extend to microplastic estimation.

---

## Data sources and credits

- E.U. Copernicus Marine Service: *Global Ocean Physics Analysis and Forecast* (GLOBAL_ANALYSISFORECAST_PHY_001_024)
- ESA Copernicus Sentinel-2 Level-2A imagery
- OBIS (Ocean Biodiversity Information System) occurrence records; coral and reef habitat layers
- TrashCan 1.0, Trash-ICRA19 and SeaClear marine-debris datasets
- Ultralytics YOLOv8, TensorFlow/Keras, ONNX Runtime Web, Leaflet, Esri basemaps

Research output: the paper *"AQUA-STRAT: An Ecosystem-Aware Decision Support System for Marine Plastic Intervention Planning"* is under review at five international conferences, and a provisional patent specification has been submitted through the institute.
