/* AQUA-STRAT cleanup planner
   1) Genetic Algorithm — exact port of AQUA_STRAT_Objective4_Risk_GA_v6_FINAL (candidates, cost, fitness, operators, parameters)
   2) Route sequencing — GA-selected sites grouped by port, split into vessel trips, each trip ordered as the shortest tour */
"use strict";
const NB_PORTS = { AS: { name: "Kochi", lat: 10.00, lon: 76.28 }, BOB: { name: "Visakhapatnam", lat: 17.68, lon: 83.22 }, IO: { name: "Thoothukudi", lat: 8.80, lon: 78.15 } }; // notebook (one per region)
const OPS_PORTS = [ // major / operational Indian ports for route planning
  { name: "Kandla", lat: 23.03, lon: 70.22 }, { name: "Mumbai", lat: 18.95, lon: 72.84 }, { name: "Mormugao (Goa)", lat: 15.41, lon: 73.80 }, { name: "Karwar", lat: 14.80, lon: 74.11 },
  { name: "New Mangalore", lat: 12.92, lon: 74.81 }, { name: "Kochi", lat: 9.97, lon: 76.26 }, { name: "Kavaratti", lat: 10.57, lon: 72.64 }, { name: "Thoothukudi", lat: 8.76, lon: 78.18 },
  { name: "Chennai", lat: 13.10, lon: 80.30 }, { name: "Visakhapatnam", lat: 17.69, lon: 83.29 }, { name: "Paradip", lat: 20.26, lon: 86.67 }, { name: "Haldia", lat: 22.03, lon: 88.06 }, { name: "Port Blair", lat: 11.67, lon: 92.73 }];
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
function portFor(i, mode) {
  if (mode === "notebook") { const p = NB_PORTS[REG[G.r[i]]]; return [p, haversine(p.lat, p.lon, G.lat[i], G.lon[i])] }
  let b = null, bd = 1e9; for (const p of OPS_PORTS) { const d = haversine(p.lat, p.lon, G.lat[i], G.lon[i]); if (d < bd) { bd = d; b = p } } return [b, bd]
}
const PLAN_DEFAULT = { scope: "ALL", maxSites: 40, wP: 100, wC: .15, wR: 40, gens: 150, pop: 80, mut: .03, ports: "nearest", vessels: 4, stops: 4, speed: 360 };
function runPlan(D, prm) {
  prm = Object.assign({}, PLAN_DEFAULT, prm); const t0 = performance.now(), rnd = mulberry(42);
  const regs = prm.scope === "ALL" ? REG : [prm.scope], cand = [];
  regs.forEach(r => { IDX[r].slice().sort((a, b) => D.P[b] - D.P[a]).slice(0, 100).forEach(i => cand.push(i)) }); // N_CANDIDATES_PER_REGION = 100
  const n = cand.length, pol = cand.map(i => D.P[i]), pc = cand.map(i => portFor(i, prm.ports)), cost = pc.map(([, km]) => km * 1.0 + 50), rh = cand.map(i => D.rh[i]), rw = cand.map(i => D.rw[i]);
  const fit = c => { let ns = 0, P = 0, C = 0, R = 0; for (let k = 0; k < n; k++)if (c[k]) { ns++; P += pol[k]; C += cost[k]; R += rh[k] + rw[k] } if (!ns) return -1e6; let s = prm.wP * P - prm.wC * C - prm.wR * R; if (ns > prm.maxSites) s -= 8 * (ns - prm.maxSites); return s };
  let pop = []; for (let q = 0; q < prm.pop; q++) { const c = new Uint8Array(n), ni = Math.min(n, Math.max(1, prm.maxSites - 10) + Math.floor(rnd() * (21))), pool = [...Array(n).keys()]; for (let s = 0; s < ni; s++) { const j = s + Math.floor(rnd() * (n - s));[pool[s], pool[j]] = [pool[j], pool[s]]; c[pool[s]] = 1 } pop.push(c) }
  let best = null, bestF = -1e18; const hist = [], avg = [];
  for (let g = 0; g < prm.gens; g++) {
    const f = pop.map(fit); let gi = 0; for (let q = 1; q < f.length; q++)if (f[q] > f[gi]) gi = q;
    if (f[gi] > bestF) { bestF = f[gi]; best = pop[gi].slice() } hist.push(f[gi]); avg.push(f.reduce((a, b) => a + b, 0) / f.length);
    const rank = [...f.keys()].sort((a, b) => f[b] - f[a]), nx = rank.slice(0, 4).map(q => pop[q].slice()); // elitism = 4
    const tour = () => { let b = -1; for (let t = 0; t < 4; t++) { const q = Math.floor(rnd() * pop.length); if (b < 0 || f[q] > f[b]) b = q } return pop[b] }; // tournament size 4
    while (nx.length < prm.pop) {
      const p1 = tour(), p2 = tour(), pt = 1 + Math.floor(rnd() * (n - 1)), c1 = new Uint8Array(n), c2 = new Uint8Array(n);
      for (let k = 0; k < n; k++) { c1[k] = k < pt ? p1[k] : p2[k]; c2[k] = k < pt ? p2[k] : p1[k] }
      for (const c of [c1, c2]) for (let k = 0; k < n; k++)if (rnd() < prm.mut) c[k] = 1 - c[k];
      nx.push(c1); if (nx.length < prm.pop) nx.push(c2)
    }
    pop = nx
  }
  const sel = []; for (let k = 0; k < n; k++)if (best[k]) sel.push({ i: cand[k], p: pol[k], port: pc[k][0], km: pc[k][1], cost: cost[k], rh: rh[k], rw: rw[k], region: REG[G.r[cand[k]]] });
  sel.sort((a, b) => b.p - a.p);
  const tot = { sites: sel.length, removed: sel.reduce((a, s) => a + s.p, 0), cost: sel.reduce((a, s) => a + s.cost, 0), dist: sel.reduce((a, s) => a + s.rh + s.rw, 0) };
  const rt = routePlan(sel, prm);
  return { prm, key: D.key, cand, sel, tot, fitness: bestF, hist, avg, ms: Math.round(performance.now() - t0), ...rt }
}
function perms(a) { if (a.length < 2) return [a]; const o = []; a.forEach((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(p => o.push([x, ...p]))); return o }
function tourKm(port, stops) { let k = 0, la = port.lat, lo = port.lon; for (const s of stops) { k += haversine(la, lo, G.lat[s.i], G.lon[s.i]); la = G.lat[s.i]; lo = G.lon[s.i] } return k + haversine(la, lo, port.lat, port.lon) }
function routePlan(sel, prm) {
  const by = new Map(); sel.forEach(s => { if (!by.has(s.port.name)) by.set(s.port.name, []); by.get(s.port.name).push(s) }); const trips = [];
  for (const arr of by.values()) {
    const p = arr[0].port, cl = Math.cos(p.lat * Math.PI / 180); arr.forEach(s => s.ang = Math.atan2(G.lat[s.i] - p.lat, (G.lon[s.i] - p.lon) * cl)); arr.sort((a, b) => a.ang - b.ang);
    let gi = 0, gm = -1; for (let k = 0; k < arr.length; k++) { const a = arr[k].ang, b = k + 1 < arr.length ? arr[k + 1].ang : arr[0].ang + 2 * Math.PI; if (b - a > gm) { gm = b - a; gi = (k + 1) % arr.length } }
    const ord = arr.slice(gi).concat(arr.slice(0, gi));
    for (let k = 0; k < ord.length; k += prm.stops) { const grp = ord.slice(k, k + prm.stops); let best = grp, bk = 1e18; for (const pm of perms(grp)) { const km = tourKm(p, pm); if (km < bk) { bk = km; best = pm } } trips.push({ port: p, stops: best, km: bk }) }
  }
  trips.forEach(t => { t.days = t.km / prm.speed + .5 * t.stops.length; t.removed = t.stops.reduce((a, s) => a + s.p, 0) });
  trips.sort((a, b) => b.days - a.days); const vs = Array.from({ length: prm.vessels }, () => ({ d: 0, trips: [] }));
  trips.forEach(t => { let v = 0; vs.forEach((x, j) => { if (x.d < vs[v].d) v = j }); t.v = v; t.start = vs[v].d; vs[v].d += t.days; vs[v].trips.push(t) });
  trips.sort((a, b) => a.v - b.v || a.start - b.start); trips.forEach((t, k) => { t.name = "T" + (k + 1); t.col = TRIPC[k % TRIPC.length] });
  const direct = sel.reduce((a, s) => a + 2 * s.km, 0), routed = trips.reduce((a, t) => a + t.km, 0);
  return { trips, vessels: vs, routedKm: routed, directKm: direct, days: Math.max(0, ...vs.map(v => v.d)) }
}
