"""Bundle a new daily LSTM inference run into the app permanently (so it works on every computer).

Usage (from the AQUA-STRAT folder):
    python tools/update_daily_data.py path/to/aquastrat_daily_predictions_YYYYMMDD.zip
Requires: python 3.9+, numpy, pandas.  Rewrites data/lstm.js (and data/fdi.js if FDI files are in the zip).
"""
import sys, os, json, re, zipfile, base64
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load_js(name, var):
    t = open(os.path.join(ROOT, "data", name), encoding="utf8").read()
    return json.loads(t[len(f"window.{var}="):].rstrip().rstrip(";"))

def main(zp):
    grid = load_js("grid.js", "AQ_GRID"); lstm = load_js("lstm.js", "AQ_LSTM")
    ids = {g: i for i, g in enumerate(grid["id"])}; n = grid["n"]
    z = zipfile.ZipFile(zp); names = z.namelist()
    pr = pd.read_csv(z.open([x for x in names if re.search(r"predictions.*\.csv$", x)][0]))
    meta = pd.read_csv(z.open([x for x in names if "meta" in x][0])).iloc[0].to_dict() if any("meta" in x for x in names) else {}
    pr = pr[pr.grid_id.isin(ids)]; dates = sorted(pr.date.unique()); di = {d: k for k, d in enumerate(dates)}
    M = np.full((len(dates), n), np.nan, np.float32)
    M[pr.date.map(di).to_numpy(), pr.grid_id.map(ids).to_numpy()] = pr.predicted_density.to_numpy(np.float32)
    u = np.clip(np.round(np.nan_to_num(M, nan=-1) * 60000), -1, 65534).astype(np.int32); u[u < 0] = 65535
    phys = pr.groupby("date").physics.first().reindex(dates).fillna("analysis").tolist() if "physics" in pr else ["analysis"] * len(dates)
    lstm["daily"] = {"dates": dates, "physics": phys, "data": base64.b64encode(u.astype("<u2").tobytes()).decode(), "run": {k: str(v) for k, v in meta.items()}}
    open(os.path.join(ROOT, "data", "lstm.js"), "w", encoding="utf8").write("window.AQ_LSTM=" + json.dumps(lstm, separators=(",", ":")) + ";\n")
    fv = [x for x in names if x.endswith("fdi_density_validation.csv")]
    if fv:
        f = pd.read_csv(z.open(fv[0])); f = f[f.grid_id.isin(ids)]
        fdi = {"idx": [ids[x] for x in f.grid_id], "fdi_mean": [round(float(x), 6) for x in f.fdi_mean],
               "fdi_p95": [round(float(x), 6) for x in (f.fdi_p95 if "fdi_p95" in f else f.fdi_mean)], "n_tiles": [int(x) for x in (f.fdi_n_tiles if "fdi_n_tiles" in f else [1] * len(f))]}
        open(os.path.join(ROOT, "data", "fdi.js"), "w", encoding="utf8").write("window.AQ_FDI=" + json.dumps(fdi, separators=(",", ":")) + ";\n")
        print("FDI cells:", len(f))
    print(f"Bundled {len(dates)} dates: {dates[0]} -> {dates[-1]}")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1])
