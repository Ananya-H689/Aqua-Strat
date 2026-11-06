/* AQUA-STRAT core: real model outputs per date + the project's own formulas (no synthetic values). */
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmtN = (x, d = 0) => Number(x).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch (e) { return false } },
  del(k) { try { localStorage.removeItem(k) } catch (e) { } }
};
const SS = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)) } catch (e) { } },
  del(k) { try { sessionStorage.removeItem(k) } catch (e) { } }
};
function toast(msg, ms) { const t = $("#toast"); t.innerHTML = msg; t.classList.remove("hidden"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), ms || 3800) }
function haversine(a, b, c, d) { const R = 6371, r = Math.PI / 180, p1 = a * r, p2 = c * r, dp = (c - a) * r, dl = (d - b) * r, x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)) }

const G = window.AQ_GRID, N = G.n, REG = G.regions;
const REGN = { AS: "Arabian Sea", BOB: "Bay of Bengal", IO: "Indian Ocean", ALL: "All regions" };
const TIER = ["Low", "Medium", "High"], TIERC = ["#16846b", "#d98b27", "#d64545"];

/* ---------- region indexes + O(1) cell lookup ---------- */
const IDX = { ALL: [...Array(N).keys()] };
REG.forEach((r, k) => IDX[r] = IDX.ALL.filter(i => G.r[i] === k));
const LOOK = REG.map((r, k) => { const ix = IDX[r], la0 = Math.min(...ix.map(i => G.lat[i])), lo0 = Math.min(...ix.map(i => G.lon[i])), [dn, dl] = G.spacing[r], m = new Map(); ix.forEach(i => m.set(Math.round((G.lat[i] - la0) / dn) * 8192 + Math.round((G.lon[i] - lo0) / dl), i)); return { la0, lo0, dn, dl, m } });
function cellAt(lat, lon) {
  let best = -1, bd = 1e9;
  LOOK.forEach(L => { const a = Math.round((lat - L.la0) / L.dn), b = Math.round((lon - L.lo0) / L.dl); for (let p = -1; p <= 1; p++)for (let q = -1; q <= 1; q++) { const i = L.m.get((a + p) * 8192 + b + q); if (i !== undefined) { const d = Math.hypot((G.lat[i] - lat) / L.dn, (G.lon[i] - lon) / L.dl); if (d < bd && d <= .75) { bd = d; best = i } } } });
  return best
}
const BUCK = new Map(); for (let i = 0; i < N; i++) { const k = Math.floor(G.lat[i]) * 1000 + Math.floor(G.lon[i]); if (!BUCK.has(k)) BUCK.set(k, []); BUCK.get(k).push(i) }
function nearestCell(lat, lon, scope) {
  const want = scope && scope !== "ALL" ? REG.indexOf(scope) : -1, la = Math.floor(lat), lo = Math.floor(lon); let b = -1, bd = 1e9;
  for (let r = 0; r <= 60; r++) {
    for (let p = -r; p <= r; p++)for (let q = -r; q <= r; q++) { if (Math.max(Math.abs(p), Math.abs(q)) !== r) continue; const L_ = BUCK.get((la + p) * 1000 + lo + q); if (!L_) continue; for (const i of L_) { if (want >= 0 && G.r[i] !== want) continue; const d = haversine(lat, lon, G.lat[i], G.lon[i]); if (d < bd) { bd = d; b = i } } }
    if (b >= 0 && bd < (r - .5) * 100) break
  }
  return [b, bd]
}
function cellsWithin(lat, lon, km) { const o = [], dl = Math.ceil(km / 111 / Math.max(.2, Math.cos(lat * Math.PI / 180))) + 1, la = Math.floor(lat), lo = Math.floor(lon); for (let p = -dl; p <= dl; p++)for (let q = -dl; q <= dl; q++) { const L_ = BUCK.get((la + p) * 1000 + lo + q); if (L_) for (const i of L_) if (haversine(lat, lon, G.lat[i], G.lon[i]) <= km) o.push(i) } return o }

/* ---------- model runs / dates (real LSTM outputs only) ---------- */
const TODAYKEY = (() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") })();
const DATA = { dates: [], src: "", run: {}, mat: null, cache: new Map() };
function b64ToU16(b) { const bin = atob(b), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++)u8[i] = bin.charCodeAt(i); return new Uint16Array(u8.buffer) }
function loadDaily(d, origin) {
  const u = b64ToU16(d.data), nd = d.dates.length;
  DATA.mat = u; DATA.dates = d.dates.map((k, j) => ({ key: k, j, physics: d.physics[j] || "analysis" }));
  DATA.src = origin || "bundled"; DATA.run = d.run || {}; DATA.cache.clear(); DATA.daily = true;
  if (u.length !== nd * N) throw new Error("Daily file does not match the grid");
}
function initData() {
  const up = LS.get("aq_daily_upload", null);
  // Use a browser-uploaded run only if it is at least as recent as the deployed (automatically refreshed) run.
  const bun = AQ_LSTM.daily, lastOf = d => (d && d.dates && d.dates.length) ? d.dates[d.dates.length - 1] : "";
  const useUp = up && up.data && (!bun || lastOf(up) >= lastOf(bun));
  try { if (useUp) loadDaily(up, "uploaded"); else if (bun) loadDaily(bun, "bundled") } catch (e) { console.warn(e); DATA.daily = false }
  if (!DATA.daily) { DATA.dates = [{ key: "v5", j: -1, physics: "baseline" }]; DATA.src = "v5"; DATA.daily = false }
}
function dateLabel(k, long) {
  if (k === "v5") return AQ_LSTM.base.label;
  const [y, m, d] = k.split("-").map(Number), dt = new Date(y, m - 1, d), s = dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: long ? "numeric" : undefined });
  return s + (k === TODAYKEY ? " (today)" : "")
}
function defaultDate() {
  if (!DATA.daily) return "v5";
  const ks = DATA.dates.map(d => d.key);
  if (ks.includes(TODAYKEY)) return TODAYKEY;
  const past = ks.filter(k => k <= TODAYKEY); return past.length ? past[past.length - 1] : ks[0]
}
function dateInfo(k) { return DATA.dates.find(d => d.key === k) || DATA.dates[0] }
function prevKey(k) { const i = DATA.dates.findIndex(d => d.key === k); return i > 0 ? DATA.dates[i - 1].key : null }

function quantile(sorted, q) { const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo) }
function median(a) { const s = Float64Array.from(a).sort(); return s.length ? quantile(s, .5) : 0 }
/* Everything for one date, computed exactly like the notebooks:
   - hotspot tier: tertiles of predicted_density over all cells (LSTM v5 notebook, Step 10)
   - P×H, P×W, combined = 0.5·P×H + 0.5·P×W; tiers: 0 → Low, non-zero split at median (Objective-4 v6) */
function day(k) {
  if (DATA.cache.has(k)) return DATA.cache.get(k);
  const P = new Float32Array(N), info = dateInfo(k);
  if (k === "v5" || !DATA.daily) { const v = AQ_LSTM.base.values; for (let i = 0; i < N; i++)P[i] = v[i] }
  else { const off = info.j * N; for (let i = 0; i < N; i++) { const x = DATA.mat[off + i]; P[i] = x === 65535 ? NaN : x / 60000 } }
  // cells without a value that day (rare) keep the bundled v5 value so the grid stays complete
  let miss = 0; for (let i = 0; i < N; i++)if (!(P[i] === P[i])) { P[i] = AQ_LSTM.base.values[i]; miss++ }
  const s = Float64Array.from(P).sort(), q1 = quantile(s, 1 / 3), q2 = quantile(s, 2 / 3);
  const tier = new Uint8Array(N), rh = new Float32Array(N), rw = new Float32Array(N), rc = new Float32Array(N);
  for (let i = 0; i < N; i++) { tier[i] = P[i] <= q1 ? 0 : P[i] <= q2 ? 1 : 2; rh[i] = P[i] * G.H[i]; rw[i] = P[i] * G.W[i]; rc[i] = .5 * rh[i] + .5 * rw[i] }
  const rtier = riskTier(rc), ht = riskTier(rh), wt = riskTier(rw);
  const o = { key: k, info, P, q1, q2, tier, rh, rw, rc, rtier, ht, wt, miss, pmin: s[0], pmax: s[s.length - 1] };
  DATA.cache.set(k, o); if (DATA.cache.size > 12) DATA.cache.delete(DATA.cache.keys().next().value);
  return o
}
function riskTier(a) { const nz = []; for (const x of a) if (x > 0) nz.push(x); const m = median(nz), t = new Uint8Array(a.length); for (let i = 0; i < a.length; i++)t[i] = a[i] > 0 ? (a[i] <= m ? 1 : 2) : 0; return t }
function regionStats(D, reg) {
  const ix = IDX[reg]; let sum = 0, hi = 0, med = 0, rhi = 0, rmed = 0;
  for (const i of ix) { sum += D.P[i]; if (D.tier[i] === 2) hi++; else if (D.tier[i] === 1) med++; if (D.rtier[i] === 2) rhi++; else if (D.rtier[i] === 1) rmed++ }
  return { n: ix.length, mean: sum / ix.length, hi, med, rhi, rmed, master: G.master_cells[reg] }
}
/* Hotspot clusters: top-density cells that are spatially separated (for labelling only) */
function hotspotList(D, reg, k, sepKm) {
  const ix = IDX[reg].slice().sort((a, b) => D.P[b] - D.P[a]), out = [];
  for (const i of ix) { if (out.length >= (k || 10)) break; if (out.every(j => haversine(G.lat[i], G.lon[i], G.lat[j], G.lon[j]) > (sepKm || 150))) out.push(i) }
  return out
}
function levelOf(D, cells) { // relative accumulation level for an area, using that date's tertile cut-points
  if (!cells.length) return null; let s = 0; for (const i of cells) s += D.P[i]; const m = s / cells.length;
  return { mean: m, tier: m <= D.q1 ? 0 : m <= D.q2 ? 1 : 2 }
}
/* Coastal status: an area's mean density compared with the tertiles of all COASTAL cells (within 30 km of a coastal town/beach)
   of the same sea on the same date — a fair comparison for beaches (open-ocean cells are excluded). */
let COAST = null;
function coastIdx() { if (COAST) return COAST; const s = new Set(); for (const p of PLACES) for (const i of cellsWithin(p.lat, p.lon, 30)) s.add(i); COAST = { ALL: [...s] }; REG.forEach((r, k) => COAST[r] = COAST.ALL.filter(i => G.r[i] === k)); return COAST }
function coastCuts(D, reg) { D.cc = D.cc || {}; if (D.cc[reg]) return D.cc[reg]; const ix = coastIdx()[reg].length ? coastIdx()[reg] : IDX[reg], v = Float64Array.from(ix.map(i => D.P[i])).sort(); return D.cc[reg] = [quantile(v, 1 / 3), quantile(v, 2 / 3)] }
function coastLevel(D, cells) { if (!cells.length) return null; const cnt = [0, 0, 0]; let s = 0; for (const i of cells) { s += D.P[i]; cnt[G.r[i]]++ } const reg = REG[cnt.indexOf(Math.max(...cnt))], m = s / cells.length, [a, b] = coastCuts(D, reg); return { mean: m, tier: m <= a ? 0 : m <= b ? 1 : 2, reg } }
const STATUS = ["Safe", "Caution", "Avoid"], STATUSC = ["st-safe", "st-caution", "st-avoid"];
