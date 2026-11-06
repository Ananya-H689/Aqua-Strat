"""AQUA-STRAT automatic daily forecast (runs in GitHub Actions every morning).

What it does - the same steps as notebooks/AQUA_STRAT_Daily_LSTM_Inference.ipynb, without Colab or Google Drive:
  1. loads the trained LSTM (models/aqua_strat_lstm_v5.keras) - NO retraining
  2. loads the exact 2025 training normalisation + grid cells (pipeline/model_inputs.json, exported once from Colab)
  3. VERIFIES the pipeline: re-predicts reference cells from the 2025 data and compares with predicted_hotspots_v5.csv
  4. logs in to Copernicus Marine (credentials come from GitHub Secrets, never from code)
  5. downloads the latest real ocean physics (analysis for past days + Copernicus forecast for the next days)
  6. predicts the next-day plastic density for every grid cell and every date
  7. writes data/lstm.js (the file the web app reads) - only if every check passed

Usage:  python pipeline/daily_forecast.py
Env:    COPERNICUSMARINE_SERVICE_USERNAME, COPERNICUSMARINE_SERVICE_PASSWORD
"""
import os, sys, json, zipfile, tempfile, datetime as dt
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUTS = os.path.join(ROOT, "pipeline", "model_inputs.json")
MODEL = os.path.join(ROOT, "models", "aqua_strat_lstm_v5.keras")

WINDOW, HORIZON = 14, 1
PAST_DAYS, FUTURE_DAYS = 36, 10
DYNAMIC_VARS = ["thetao", "so", "uo", "vo", "zos"]
REGIONS = ["AS", "BOB", "IO"]
BASE_FEATURES = ["thetao", "so", "uo", "vo", "zos", "wildlife_exposure", "habitat_sensitivity",
                 "lat_center", "lon_center", "sin_doy", "cos_doy", "current_mag"]
DATASETS = {
    "thetao": "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m",
    "so": "cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m",
    "uo": "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m",
    "vo": "cmems_mod_glo_phy-cur_anfc_0.083deg_P1D-m",
    "zos": "cmems_mod_glo_phy_anfc_0.083deg_P1D-m",
}
PHYSICS_SOURCE = "Copernicus GLOBAL_ANALYSISFORECAST_PHY_001_024 (daily, 1/12 deg, surface)"


def fail(msg):
    print("ERROR:", msg)
    print("data/lstm.js was NOT changed - the app keeps showing the previous verified run.")
    sys.exit(1)


# ---------------------------------------------------------------- 1-2. model + training inputs
def load_inputs():
    if not os.path.exists(INPUTS):
        fail("pipeline/model_inputs.json is missing. Run the daily notebook once in Colab with "
             "EXPORT_FOR_GITHUB = True (last step) and add the downloaded model_inputs.json to the pipeline/ folder.")
    J = json.load(open(INPUTS, encoding="utf8"))
    stats = {r: (np.array(J["stats"][r]["mu"], np.float64), np.array(J["stats"][r]["sd"], np.float64)) for r in REGIONS}
    present = {r: [bool(x) for x in J["present"][r]] for r in REGIONS}
    if not all(all(v) for v in present.values()):
        fail("this script expects all 5 ocean variables to have been present in training (as in LSTM v5).")
    cells = {r: pd.DataFrame(J["cells"][r]) for r in REGIONS}
    if any(len(cells[r]) == 0 for r in REGIONS):
        fail("model_inputs.json has a region with no grid cells.")
    return J, stats, present, cells


def make_raw_features(g, dyn, doy):
    n, t = dyn["uo"].shape
    f = np.zeros((n, t, len(BASE_FEATURES)), dtype=np.float32)
    for j, v in enumerate(DYNAMIC_VARS):
        f[:, :, j] = dyn[v]
    f[:, :, 5] = g["wildlife_exposure"].to_numpy(np.float32)[:, None]
    f[:, :, 6] = g["habitat_sensitivity"].to_numpy(np.float32)[:, None]
    f[:, :, 7] = g["lat_center"].to_numpy(np.float32)[:, None]
    f[:, :, 8] = g["lon_center"].to_numpy(np.float32)[:, None]
    f[:, :, 9] = np.sin(2 * np.pi * doy / 365.25).astype(np.float32)[None, :]
    f[:, :, 10] = np.cos(2 * np.pi * doy / 365.25).astype(np.float32)[None, :]
    f[:, :, 11] = np.sqrt(f[:, :, 2] ** 2 + f[:, :, 3] ** 2)
    return f


def to_model_input(feats_raw, region, stats, present):
    mu, sd = stats[region]
    x = ((feats_raw - mu) / (sd + 1e-8)).astype(np.float32)
    masks = np.broadcast_to(np.array(present[region], np.float32), x.shape[:-1] + (len(DYNAMIC_VARS),))
    oh = np.broadcast_to(np.eye(len(REGIONS), dtype=np.float32)[REGIONS.index(region)], x.shape[:-1] + (len(REGIONS),))
    return np.concatenate([x, masks, oh], axis=-1)


# ---------------------------------------------------------------- 3. verification
def verify(model, J, stats, present):
    errs = []
    for r in REGIONS:
        ref = J["reference"][r]
        raw = np.array(ref["raw"], np.float32)              # (cells, 14, 12) - last 14 days of 2025 training data
        p = model.predict(to_model_input(raw, r, stats, present), batch_size=4096, verbose=0).reshape(-1)
        errs.append(np.abs(p - np.array(ref["v5"], np.float32)))
    e = np.concatenate(errs)
    print(f"VERIFICATION vs predicted_hotspots_v5.csv: reference cells={len(e)}  mean|diff|={e.mean():.6f}  max|diff|={e.max():.6f}")
    if e.mean() >= 1e-3:
        fail("the pipeline does not reproduce the trained model output - nothing published.")
    return True


# ---------------------------------------------------------------- 4-5. Copernicus
def fetch_all(cells, start, end):
    import copernicusmarine as cm
    import xarray as xr
    user = os.environ.get("COPERNICUSMARINE_SERVICE_USERNAME", "").strip()
    pwd = os.environ.get("COPERNICUSMARINE_SERVICE_PASSWORD", "")
    if not user or not pwd:
        fail("Copernicus Marine login not set. Add the GitHub secrets CMEMS_USERNAME and CMEMS_PASSWORD.")
    new = {}
    for r in REGIONS:
        g = cells[r]
        got = {}
        for v in DYNAMIC_VARS:
            last = None
            for attempt in range(3):
                try:
                    ds = cm.open_dataset(
                        dataset_id=DATASETS[v], variables=[v], username=user, password=pwd,
                        minimum_longitude=float(g.lon_center.min()) - 0.3, maximum_longitude=float(g.lon_center.max()) + 0.3,
                        minimum_latitude=float(g.lat_center.min()) - 0.3, maximum_latitude=float(g.lat_center.max()) + 0.3,
                        start_datetime=start, end_datetime=end,
                        **({} if v == "zos" else {"minimum_depth": 0, "maximum_depth": 1}),
                    )
                    if "depth" in ds[v].dims:
                        ds = ds.isel(depth=0)
                    lat = xr.DataArray(g.lat_center.values, dims="cell")
                    lon = xr.DataArray(g.lon_center.values, dims="cell")
                    da = ds[v].sel(latitude=lat, longitude=lon, method="nearest").load()
                    t = pd.to_datetime(da.time.values).normalize()
                    got[v] = pd.DataFrame(np.asarray(da.values, np.float32).T, columns=t)
                    print(f"  {r} {v}: {len(t)} days ({t.min().date()} -> {t.max().date()})")
                    break
                except Exception as e:  # network hiccups: retry
                    last = e
                    print(f"  {r} {v}: attempt {attempt + 1} failed: {str(e)[:200]}")
            else:
                fail(f"could not download {v} for {r}: {last}")
        common = sorted(set.intersection(*[set(df.columns) for df in got.values()]))
        if len(common) <= WINDOW:
            fail(f"{r}: only {len(common)} common days downloaded - need more than {WINDOW}.")
        dyn = {}
        for v in DYNAMIC_VARS:
            a = got[v][common].to_numpy(np.float32)
            a = pd.DataFrame(a.T).interpolate(limit_direction="both").to_numpy(np.float32).T   # same gap-fill as training
            a = np.where(np.isnan(a), np.nanmean(a), a)
            dyn[v] = a
        new[r] = {"dates": pd.DatetimeIndex(common), "dyn": dyn}
    return new


# ---------------------------------------------------------------- 6. predict
def predict_all(model, cells, new, stats, present, today):
    out = []
    for r in REGIONS:
        g, D = cells[r], new[r]
        dates = D["dates"]
        x_all = to_model_input(make_raw_features(g, D["dyn"], dates.dayofyear.to_numpy(np.float32)), r, stats, present)
        for e in range(WINDOW - 1, len(dates)):
            target = dates[e] + pd.Timedelta(days=HORIZON)
            p = model.predict(x_all[:, e - WINDOW + 1:e + 1, :], batch_size=4096, verbose=0).reshape(-1)
            out.append(pd.DataFrame({"date": target.strftime("%Y-%m-%d"), "grid_id": g.grid_id.values, "region": r,
                                     "predicted_density": np.round(p, 5),
                                     "physics": "analysis" if dates[e] <= today else "forecast"}))
        print(f"{r}: predicted {len(dates) - WINDOW + 1} days for {len(g)} cells")
    pred = pd.concat(out, ignore_index=True)
    if not np.isfinite(pred.predicted_density).all():
        fail("non-finite predictions.")
    return pred


# ---------------------------------------------------------------- 7. publish
def publish(pred, today, verified):
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import update_daily_data
    stamp = today.strftime("%Y%m%d")
    meta = pd.DataFrame([{"run_date": today.date(), "model": "aqua_strat_lstm_v5.keras", "verified_vs_v5": verified,
                          "first_date": pred.date.min(), "last_date": pred.date.max(), "cells": pred.grid_id.nunique(),
                          "physics_source": PHYSICS_SOURCE, "run_by": "GitHub Actions (automatic daily run)"}])
    with tempfile.TemporaryDirectory() as td:
        zp = os.path.join(td, f"aquastrat_daily_predictions_{stamp}.zip")
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(f"aquastrat_daily_predictions_{stamp}.csv", pred.to_csv(index=False))
            z.writestr(f"aquastrat_daily_meta_{stamp}.csv", meta.to_csv(index=False))
        update_daily_data.main(zp)          # rewrites data/lstm.js (same tool as the manual workflow)
    summary = pred.pivot_table(index="date", columns="region", values="predicted_density", aggfunc="mean").round(4)
    print(summary.tail(12).to_string())


def main():
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    today = pd.Timestamp(dt.datetime.now(dt.timezone(dt.timedelta(hours=5, minutes=30))).date())   # India date
    J, stats, present, cells = load_inputs()
    print("Run date (IST):", today.date(), "| cells:", {r: len(cells[r]) for r in REGIONS})
    import tensorflow as tf
    model = tf.keras.models.load_model(MODEL)
    print("Model input:", model.input_shape)
    verified = verify(model, J, stats, present)
    start = (today - pd.Timedelta(days=PAST_DAYS)).strftime("%Y-%m-%d")
    end = (today + pd.Timedelta(days=FUTURE_DAYS)).strftime("%Y-%m-%d")
    print(f"Downloading Copernicus physics {start} -> {end}")
    new = fetch_all(cells, start, end)
    pred = predict_all(model, cells, new, stats, present, today)
    publish(pred, today, verified)
    print("Done: data/lstm.js updated.")


if __name__ == "__main__":
    main()
