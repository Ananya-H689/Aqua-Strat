/* AQUA-STRAT pages */
"use strict";
const LABELS = { overview: "Overview", area: "Area Search", beach: "Beach Safety", alerts: "Alerts", sighting: "Report Sighting", hotspots: "Hotspots", forecast: "LSTM Forecast", risk: "Ecological Risk", fdi: "FDI Analysis", detector: "Plastic Detector", ga: "Cleanup Planner", advisories: "Alerts & Advisories", sightings: "Public Sightings", data: "Data & Model Runs", reports: "Reports" };
const NAVS = {
  PUBLIC: ["overview", "area", "beach", "alerts", "sighting", "hotspots", "risk"],
  RESEARCHER: ["overview", "area", "hotspots", "forecast", "risk", "fdi", "detector", "data", "reports"],
  GOVERNMENT: ["overview", "area", "hotspots", "forecast", "risk", "fdi", "detector", "ga", "advisories", "sightings", "data", "reports"]
};
const card = (title, body, cls) => `<div class="card ${cls || ""}">${title ? `<h3>${title}</h3>` : ""}${body}</div>`;
const kpi = (label, value, delta) => `<div class="card kpi"><div class="label">${label}</div><div class="value">${value}</div>${delta || ""}</div>`;
const deltaTxt = (now, prev, invert) => { if (prev == null) return ""; const d = now - prev; if (!d) return `<div class="delta muted">no change vs previous run</div>`; const up = d > 0; return `<div class="delta ${(up ^ !!invert) ? "up" : "down"}">${up ? "▲" : "▼"} ${fmtN(Math.abs(d))} vs ${dateLabel(prevKey(APP.date))}</div>` };
const srcLine = D => DATA.daily ? `${D.info.physics === "forecast" ? "🔮 LSTM v5 prediction on Copernicus <b>forecast</b> ocean physics" : "🛰️ LSTM v5 prediction on Copernicus <b>analysis</b> ocean physics"} · ${dateLabel(D.key, true)}` : `LSTM v5 model output (${esc(AQ_LSTM.base.label)}). Run the daily inference notebook to load the latest dates.`;

/* ---------- shared: date strip (real model runs; no animation) ---------- */
const MEANS = new Map();
function dateMeans(reg) {
  const key = reg + "|" + DATA.src + "|" + DATA.dates.length; if (MEANS.has(key)) return MEANS.get(key);
  const ix = IDX[reg], out = DATA.dates.map(d => { if (d.j < 0) { let s = 0; for (const i of ix) s += AQ_LSTM.base.values[i]; return s / ix.length } let s = 0, n = 0; const off = d.j * N; for (const i of ix) { const x = DATA.mat[off + i]; if (x !== 65535) { s += x / 60000; n++ } } return n ? s / n : NaN });
  MEANS.set(key, out); return out
}
function dayStrip() {
  if (!DATA.daily) return `<div class="notice">Showing the saved LSTM v5 output. When the daily inference notebook output is loaded, every available date appears here.</div>`;
  const m = dateMeans(APP.region), ok = m.filter(x => x === x), lo = Math.min(...ok), hi = Math.max(...ok);
  return `<div class="legend-inline" style="margin-bottom:6px"><span style="--c:#0f8b8d">Analysis physics (observed)</span><span style="--c:#7aa7c7">Copernicus forecast physics</span><span style="--c:#d98b27">Today</span></div><div class="daystrip" id="daystrip">${DATA.dates.map((d, k) => { const h = m[k] === m[k] ? 6 + 24 * (m[k] - lo) / ((hi - lo) || 1) : 2, [y, mo, dd] = d.key.split("-"); const dt = new Date(+y, mo - 1, +dd); return `<div class="day ${d.physics === "forecast" ? "fc" : ""} ${d.key === APP.date ? "sel" : ""} ${d.key === TODAYKEY ? "today" : ""}" data-k="${d.key}" title="${dateLabel(d.key, true)} · mean index ${(m[k] || 0).toFixed(4)} · ${d.physics}"><div class="t">${dt.toLocaleDateString("en-IN", { day: "2-digit" })}</div><div class="s">${dt.toLocaleDateString("en-IN", { month: "short" })}</div><div class="bar"><span style="height:${h}px"></span></div><div class="s">${d.physics === "forecast" ? "fcst" : dt.toLocaleDateString("en-IN", { weekday: "short" })}</div></div>` }).join("")}</div>`
}
function wireStrip() { $$("#daystrip .day").forEach(d => d.onclick = () => APP.setDate(d.dataset.k)); const s = $("#daystrip .sel"); if (s) s.scrollIntoView({ block: "nearest", inline: "center" }) }

/* ---------- shared: map creation with persisted view ---------- */
function pageMap(id, mode, onClick) {
  if (APP.mapObj) { APP.mapObj.destroy(); APP.mapObj = null }
  const M = makeMap($("#" + id), { mode, onClick: onClick || ((i, ll) => { if (i >= 0) { APP.selCell = i; M.select(i); APP.cellPanel && APP.cellPanel(i) } }) });
  APP.mapObj = M; if (APP.area) M.map.setView([APP.area.lat, APP.area.lon], APP.area.km <= 25 ? 9 : APP.area.km <= 50 ? 8 : APP.area.km <= 100 ? 7 : 6); else M.fitRegion(APP.region);
  if (APP.area) M.area(APP.area); if (APP.selCell != null) M.select(APP.selCell);
  setTimeout(() => { if (APP.mapObj === M) M.map.invalidateSize() }, 60); return M
}
function layerToggles(opts) {
  const nF = window.AQ_FDI ? AQ_FDI.idx.filter((i, k) => AQ_FDI.fdi_mean[k] > 0 && (APP.region === "ALL" || REG[G.r[i]] === APP.region)).length : 0;
  return `<div class="lyr-toggle">${opts.zones ? `<label><input type="checkbox" id="tgZ" ${APP.tgZ ? "checked" : ""}> Show named high-risk zones</label>` : ""}${opts.fdi && window.AQ_FDI ? `<label><input type="checkbox" id="tgF" ${APP.tgF ? "checked" : ""}> Show Sentinel-2 debris-like signal (${nF} cells, FDI &gt; 0)</label>` : ""}</div><div id="zoneBox"></div>`
}
function wireToggles(M, opts) {
  const D = APP.D();
  const doZ = () => { const box = $("#zoneBox"); if (!APP.tgZ) { M.zones(null); if (box) box.innerHTML = ""; return }
    const Z = riskZones(D, APP.region); M.zones(Z);
    if (box) { box.innerHTML = `<div class="zonelist"><b>High-risk zones — ${dateLabel(APP.date, true)}</b> <span class="muted small">(groups of ≥ 3 neighbouring High-risk cells; click a zone to zoom)</span><div class="tablewrap" style="max-height:190px;margin-top:6px"><table><thead><tr><th>Zone</th><th>Location</th><th>Cells</th><th>Area (km²)</th><th>Mean density</th></tr></thead><tbody>${Z.map((z, k) => `<tr class="ck zrow" data-k="${k}"><td><b>Zone ${z.n}</b></td><td>${esc(z.name)}</td><td>${z.cells.length}</td><td>${fmtN(z.area)}</td><td>${z.meanP.toFixed(4)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No group of 3 or more neighbouring High-risk cells on this date.</td></tr>`}</tbody></table></div></div>`;
      $$("#zoneBox tr.zrow").forEach(r => r.onclick = () => M.map.fitBounds(Z[+r.dataset.k].bounds, { maxZoom: 8 })) } };
  const doF = () => M.fdi(APP.tgF);
  if (opts.zones && $("#tgZ")) { $("#tgZ").onchange = e => { APP.tgZ = e.target.checked; doZ() }; doZ() }
  if (opts.fdi && $("#tgF")) { $("#tgF").onchange = e => { APP.tgF = e.target.checked; doF() }; doF() }
}
function legendTier(title) { return `<div class="maplegend"><b>${title || "Predicted accumulation tier"}</b>${TIER.map((t, k) => `<div class="lg"><i style="background:${hexA(TIERC[k], k ? .7 : .4)}"></i>${t}</div>`).slice().reverse().join("")}<div class="muted small" style="margin-top:4px">Tertiles of LSTM output for the date</div></div>` }

/* ---------- shared: cell info ---------- */
function cellInfo(i) {
  if (i == null || i < 0) return `<p class="muted">Click any grid cell on the map to inspect it.</p>`;
  const D = APP.D(), pk = prevKey(APP.date), Dp = pk ? day(pk) : null, d = Dp ? D.P[i] - Dp.P[i] : null;
  return `<table class="kv"><tr><td>Grid cell</td><td><b>${G.id[i]}</b> · ${REGN[REG[G.r[i]]]}</td></tr><tr><td>Location</td><td>${G.lat[i].toFixed(3)}°N, ${G.lon[i].toFixed(3)}°E</td></tr>
  <tr><td>Predicted density</td><td><b>${D.P[i].toFixed(4)}</b> <span class="tier-${TIER[D.tier[i]].toLowerCase()}">${TIER[D.tier[i]]}</span>${d != null ? ` <span class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(4)}</span>` : ""}</td></tr>
  ${APP.role !== "PUBLIC" ? `<tr><td>Habitat sensitivity (H)</td><td>${G.H[i].toFixed(3)}</td></tr><tr><td>Wildlife exposure (W)</td><td>${G.W[i].toFixed(3)}</td></tr><tr><td>P×H · P×W</td><td>${D.rh[i].toFixed(4)} · ${D.rw[i].toFixed(4)}</td></tr>` : ""}
  <tr><td>Ecological risk</td><td>${D.rc[i].toFixed(4)} <span class="tier-${TIER[D.rtier[i]].toLowerCase()}">${TIER[D.rtier[i]]}</span></td></tr></table>`
}

/* ---------- shared: area model ---------- */
function setArea(place, km) {
  const [ni, nd] = nearestCell(place.lat, place.lon); km = km || (APP.area && APP.area.km) || 50;
  const cells = cellsWithin(place.lat, place.lon, km);
  APP.area = { name: place.name, sub: place.sub || "", lat: place.lat, lon: place.lon, km, cells: cells.length ? cells : [ni], near: ni, nkm: nd };
  APP.selCell = ni; APP.updateChip()
}
function areaSummary(A, D) {
  const lv = coastLevel(D, A.cells), pk = prevKey(APP.date), Dp = pk ? day(pk) : null, lp = Dp ? coastLevel(Dp, A.cells) : null;
  let hi = 0, rhi = 0, newHi = 0; for (const i of A.cells) { if (D.tier[i] === 2) hi++; if (D.rtier[i] === 2) rhi++; if (Dp && D.tier[i] === 2 && Dp.tier[i] !== 2) newHi++ }
  return { lv, lp, hi, rhi, newHi, n: A.cells.length, chg: lp ? (lv.mean - lp.mean) / (lp.mean || 1) * 100 : null }
}
function areaTrend(A) {
  if (!DATA.daily) return ""; const vals = DATA.dates.map(d => { let s = 0, n = 0; const off = d.j * N; for (const i of A.cells) { const x = DATA.mat[off + i]; if (x !== 65535) { s += x / 60000; n++ } } return n ? s / n : NaN });
  return sparkSVG(vals, DATA.dates.map(d => d.key), "Area mean predicted density per model date")
}
function sparkSVG(vals, keys, caption, wide) {
  const w = wide ? 1150 : 520, h = wide ? 150 : 120, ok = vals.filter(v => v === v), mn = Math.min(...ok), mx = Math.max(...ok), px = k => 10 + k * (w - 20) / Math.max(1, vals.length - 1), py = v => h - 18 - (v - mn) / ((mx - mn) || 1) * (h - 34);
  const pts = vals.map((v, k) => v === v ? `${px(k)},${py(v)}` : null).filter(Boolean).join(" "), si = keys.indexOf(APP.date), fi = DATA.dates.findIndex(d => d.physics === "forecast");
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">${fi > 0 ? `<rect x="${px(fi) - 4}" y="2" width="${w - px(fi) + 4}" height="${h - 18}" fill="#7aa7c722"/><text x="${px(fi)}" y="12" font-size="9" fill="#5b7f99">Copernicus forecast physics →</text>` : ""}<polyline fill="none" stroke="#0b5c8e" stroke-width="2.2" points="${pts}"/>${si >= 0 && vals[si] === vals[si] ? `<circle cx="${px(si)}" cy="${py(vals[si])}" r="4.5" fill="#d98b27"/>` : ""}<text x="4" y="${h - 3}" font-size="9" fill="#64748b">${dateLabel(keys[0])}</text><text x="${w - 64}" y="${h - 3}" font-size="9" fill="#64748b">${dateLabel(keys[keys.length - 1])}</text></svg><div class="footer-note" style="margin-top:2px">${caption}</div>`
}
function alertsFor(A, D, label) {
  const out = [], S = areaSummary(A, D), nm = esc(label || A.name);
  if (!A.km) { out.push(["b", `${fmtN(S.hi)} high-tier cells in ${nm}`, `${(S.hi / S.n * 100).toFixed(1)}% of ${fmtN(S.n)} scored cells are in the top tertile of LSTM-predicted density on ${dateLabel(APP.date)}.`]) }
  else if (S.lv.tier === 2) out.push(["r", `High plastic accumulation predicted near ${nm}`, `Area mean density ${S.lv.mean.toFixed(4)} is in the upper third of ${REGN[S.lv.reg]} coastal waters on ${dateLabel(APP.date)}.`]);
  else if (A.km && S.lv.tier === 1) out.push(["", `Moderate plastic accumulation near ${nm}`, `Area mean density ${S.lv.mean.toFixed(4)} (medium tier).`]);
  if (S.chg != null && Math.abs(S.chg) >= 3) out.push([S.chg > 0 ? "" : "g", S.chg > 0 ? `Accumulation rising near ${nm}` : `Accumulation easing near ${nm}`, `${S.chg > 0 ? "+" : ""}${S.chg.toFixed(1)}% vs the previous model date.`]);
  if (S.newHi) out.push(["r", `${S.newHi} grid cell${S.newHi > 1 ? "s" : ""} newly in the high tier`, A.km ? `Within ${A.km} km of ${nm} since the previous model date.` : `Across ${nm} since the previous model date (${dateLabel(prevKey(APP.date) || APP.date)}).`]);
  if (S.rhi) out.push(["r", `Sensitive habitat / wildlife at risk`, `${fmtN(S.rhi)} high ecological-risk cell${S.rhi > 1 ? "s" : ""} (P×H, P×W) ${A.km ? "within " + A.km + " km" : "in " + nm}.`]);
  if (DATA.daily) { const fut = DATA.dates.filter(d => d.key > APP.date).slice(0, 5); if (fut.length) { const lv2 = coastLevel(day(fut[fut.length - 1].key), A.cells); const c2 = (lv2.mean - S.lv.mean) / (S.lv.mean || 1) * 100; if (Math.abs(c2) >= 3) out.push(["b", `Outlook to ${dateLabel(fut[fut.length - 1].key)}: ${c2 > 0 ? "rising" : "easing"}`, `${c2 > 0 ? "+" : ""}${c2.toFixed(1)}% predicted by the LSTM on Copernicus ${fut[fut.length - 1].physics} physics.`]) } }
  if (!out.length) out.push(["g", `No significant alerts near ${nm}`, `Low predicted accumulation and no new high-tier cells for ${dateLabel(APP.date)}.`]);
  return out
}
const alertHTML = list => list.map(a => `<div class="alert ${a[0]}"><b>${a[1]}</b><div class="muted">${a[2]}</div></div>`).join("");

/* =================== PAGES =================== */
const PAGES = {};
PAGES.overview = c => {
  const D = APP.D(), S = regionStats(D, APP.region), pk = prevKey(APP.date), Sp = pk ? regionStats(day(pk), APP.region) : null, hs = hotspotList(D, APP.region, 10, APP.region === "IO" || APP.region === "ALL" ? 250 : 120);
  const plan = APP.role === "GOVERNMENT" ? APP.plan() : null;
  c.innerHTML = `<div class="grid kpis">${kpi("Grid cells", fmtN(S.master))}${kpi("High hotspot cells", fmtN(S.hi), deltaTxt(S.hi, Sp && Sp.hi))}${kpi("High-risk cells", fmtN(S.rhi), deltaTxt(S.rhi, Sp && Sp.rhi))}${plan ? kpi("Cleanup sites (GA plan)", plan.sel.length, `<div class="delta muted">${plan.trips.length} vessel trips</div>`) : kpi("Mean density index", S.mean.toFixed(4), Sp ? `<div class="delta ${S.mean > Sp.mean ? "up" : "down"}">${S.mean > Sp.mean ? "▲" : "▼"} ${Math.abs((S.mean - Sp.mean) / Sp.mean * 100).toFixed(1)}% vs ${dateLabel(prevKey(APP.date))}</div>` : "")}</div>
  <div class="section">${card("", dayStrip())}</div>
  <div class="section grid two"><div class="card"><h3>Indian Ocean Pollution Intelligence</h3><div class="mapwrap"><div id="map" class="map"></div>${legendTier()}</div><div class="footer-note">${srcLine(D)}</div></div>
  <div class="card"><h3>Decision Snapshot</h3><p><b>Region:</b> ${REGN[APP.region]} · <b>Date:</b> ${dateLabel(APP.date, true)}</p><p><b>Scored cells:</b> ${fmtN(S.n)} · <b>Medium hotspots:</b> ${fmtN(S.med)} · <b>Medium-risk:</b> ${fmtN(S.rmed)}</p>
  ${plan ? `<p><b>Today's GA plan:</b> ${plan.sel.length} sites · plastic index removed ${plan.tot.removed.toFixed(3)} · cost ${fmtN(plan.tot.cost)} units · ${plan.trips.length} trips</p>` : ""}
  <h4 style="margin:14px 0 6px">Top hotspots</h4><div class="tablewrap" style="max-height:220px"><table><thead><tr><th>#</th><th>Grid</th><th>Density</th><th>Tier</th></tr></thead><tbody>${hs.map((i, n) => `<tr class="ck" data-i="${i}"><td>H${n + 1}</td><td>${G.id[i]}</td><td>${D.P[i].toFixed(4)}</td><td class="tier-${TIER[D.tier[i]].toLowerCase()}">${TIER[D.tier[i]]}</td></tr>`).join("")}</tbody></table></div>
  <h4 style="margin:14px 0 6px">Selected cell</h4><div id="cellBox">${cellInfo(APP.selCell)}</div>
  <p class="footer-note">Model-assisted decision support — not an official operational order.</p></div></div>`;
  wireStrip(); const M = pageMap("map", "tier"); M.hotspots(hs);
  APP.cellPanel = i => $("#cellBox").innerHTML = cellInfo(i);
  $$("tr.ck").forEach(r => r.onclick = () => { const i = +r.dataset.i; APP.selCell = i; M.select(i); M.map.setView([G.lat[i], G.lon[i]], Math.max(M.map.getZoom(), 7)); APP.cellPanel(i) })
};

PAGES.area = c => {
  const A = APP.area, D = APP.D();
  c.innerHTML = `<div class="card"><div class="searchbox"><input id="aq" placeholder="Search any coastal town, beach, port, grid ID (AS_00120) or lat,lon — e.g. Udupi, Bhimavaram, RK Beach, 12.9,74.8" autocomplete="off" value="${A ? esc(A.name) : ""}"><select id="akm">${[25, 50, 100, 200].map(k => `<option value="${k}" ${A && A.km === k || (!A && k === 50) ? "selected" : ""}>${k} km</option>`).join("")}</select><button class="primary" id="ago">Search</button></div><div id="astatus" class="footer-note"></div></div>
  <div class="section grid two"><div class="card"><div class="mapwrap"><div id="map" class="map tall"></div>${legendTier()}</div><div class="footer-note">Tip: click anywhere on the sea to analyse that spot.</div></div><div class="card" id="areaPanel"></div></div>`;
  const M = pageMap("map", "tier", (i, ll) => { if (i < 0) { const [ni, nd] = nearestCell(ll.lat, ll.lng); if (nd > 80) return; i = ni } setArea({ name: G.id[i], sub: "Grid cell", lat: G.lat[i], lon: G.lon[i] }, +$("#akm").value); go() });
  const go = () => { if (APP.mapObj !== M) return; const A = APP.area; if (!A) { renderPanel(); return } M.area(A); M.select(A.near); M.map.flyTo([A.lat, A.lon], A.km <= 25 ? 9 : A.km <= 50 ? 8 : A.km <= 100 ? 7 : 6, { duration: .7 }); renderPanel() };
  const renderPanel = () => {
    const A = APP.area, P = $("#areaPanel"); if (!A) { P.innerHTML = `<h3>Area report</h3><p class="muted">Search a place or click the map. The map zooms in, shows the grid around the place and summarises every cell inside the radius for the selected model date.</p><p>Try: ${["Udupi", "Mangaluru", "Bhimavaram", "RK Beach", "Kochi", "Puri", "Port Blair"].map(x => `<a href="#" data-q="${x}">${x}</a>`).join(" · ")}</p>`; P.querySelectorAll("a[data-q]").forEach(a => a.onclick = e => { e.preventDefault(); $("#aq").value = a.dataset.q; S.run(a.dataset.q) }); return }
    const S_ = areaSummary(A, D), st = S_.lv.tier, near = G.id[A.near], plan = APP.role === "GOVERNMENT" ? APP.plan() : null, tr = plan ? plan.trips.filter(t => t.stops.some(s => A.cells.includes(s.i))) : [];
    P.innerHTML = `<h3>📍 ${esc(A.name)}</h3><div class="muted small">${esc(A.sub)} · radius ${A.km} km · ${dateLabel(APP.date, true)}</div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:10px">${kpi("Area level", `<span class="statusbadge ${STATUSC[st]}">${TIER[st]}</span>`)}${kpi("Mean density", S_.lv.mean.toFixed(4), S_.chg != null ? `<div class="delta ${S_.chg > 0 ? "up" : "down"}">${S_.chg > 0 ? "▲" : "▼"} ${Math.abs(S_.chg).toFixed(1)}% vs previous date</div>` : "")}</div>
    <table class="kv" style="margin-top:8px"><tr><td>Nearest sea grid cell</td><td><b>${near}</b> · ${A.nkm.toFixed(0)} km</td></tr><tr><td>Grid cells in area</td><td>${S_.n}</td></tr><tr><td>High-tier cells</td><td>${S_.hi}${S_.newHi ? ` <span class="up">(+${S_.newHi} new)</span>` : ""}</td></tr><tr><td>High ecological-risk cells</td><td>${S_.rhi}</td></tr>
    <tr><td>Beach / coastal status</td><td><span class="statusbadge ${STATUSC[st]}">${STATUS[st]}</span></td></tr>${plan ? `<tr><td>Cleanup coverage</td><td>${tr.length ? tr.map(t => `${t.name} from ⚓ ${esc(t.port.name)}`).join(", ") : "Not in today's GA plan"}</td></tr>` : ""}</table>
    <div class="section">${areaTrend(A)}</div><h4 style="margin:12px 0 6px">Alerts for this area</h4>${alertHTML(alertsFor(A, D))}<h4 style="margin:12px 0 6px">Nearest cell detail</h4>${cellInfo(A.near)}`
  };
  const S = attachSearch($("#aq"), r => { setArea(r, +$("#akm").value); $("#astatus").textContent = ""; go() }, { status: m => $("#astatus").innerHTML = m });
  $("#ago").onclick = () => S.run($("#aq").value); $("#akm").onchange = () => { if (APP.area) { setArea(APP.area, +$("#akm").value); go() } };
  APP.cellPanel = null; if (A) { M.area(A); renderPanel() } else renderPanel()
};

function coastalPlaces(A, D, extraKm) {
  const lst = []; for (const p of PLACES) { if (A && haversine(A.lat, A.lon, p.lat, p.lon) > A.km + (extraKm || 30)) continue; const [ni, nd] = nearestCell(p.lat, p.lon, A ? "ALL" : APP.region); if (nd > 35) continue; if (!A && p.kind !== "beach") continue; const cells = cellsWithin(p.lat, p.lon, 30); const lv = coastLevel(D, cells.length ? cells : [ni]); lst.push({ p, lv, ni, nd }) }
  lst.sort((a, b) => (b.p.kind === "beach") - (a.p.kind === "beach") || b.lv.mean - a.lv.mean); return lst.slice(0, 40)
}
PAGES.beach = c => {
  const D = APP.D(), A = APP.area, L_ = coastalPlaces(A, D);
  c.innerHTML = `<div class="grid two"><div class="card"><h3>🏖️ Beach & coastal safety ${A ? "around " + esc(A.name) : "— " + REGN[APP.region]}</h3><div class="mapwrap"><div id="map" class="map"></div><div class="maplegend"><b>Coastal status</b>${STATUS.map((s, k) => `<div class="lg"><i style="background:${TIERC[k]}"></i>${s}</div>`).reverse().join("")}</div></div><div class="footer-note">${srcLine(D)}</div></div>
  <div class="card"><div class="notice small">${A ? `Showing beaches and coastal towns within ${A.km + 30} km of <b>${esc(A.name)}</b>. <a href="#" id="chg">Change area</a>` : `Showing well-known beaches in ${REGN[APP.region]}. <a href="#" id="chg">Search your beach / town</a> to see places around it.`}</div>
  <div class="tablewrap section" style="max-height:470px"><table><thead><tr><th>Place</th><th>Type</th><th>Index</th><th>Status</th></tr></thead><tbody>${L_.map(x => `<tr class="ck" data-la="${x.p.lat}" data-lo="${x.p.lon}" data-n="${esc(x.p.name)}"><td>${esc(x.p.name)}<br><small class="muted">${esc(x.p.state)}</small></td><td>${x.p.kind === "beach" ? "Beach" : "Town"}</td><td>${x.lv.mean.toFixed(4)}</td><td><span class="statusbadge ${STATUSC[x.lv.tier]}">${STATUS[x.lv.tier]}</span></td></tr>`).join("") || `<tr><td colspan="4" class="muted">No coastal places found in this area.</td></tr>`}</tbody></table></div>
  <div class="section notice small"><b>How status is decided:</b> mean LSTM-predicted plastic-accumulation index of the ocean cells within 30 km, compared with all coastal waters of the same sea on that date (tertiles) — Safe (lower third), Caution (middle), Avoid (upper third).<br>• Avoid swimming where status is <b>Avoid</b> · carry your waste back · join cleanup drives when <b>Caution</b>.</div></div></div>`;
  const M = pageMap("map", "tier", (i, ll) => { const [ni, nd] = nearestCell(ll.lat, ll.lng); if (nd > 80) return; setArea({ name: G.id[ni], sub: "Grid cell", lat: G.lat[ni], lon: G.lon[ni] }, APP.area ? APP.area.km : 50); APP.render() });
  L_.forEach(x => M.marker(x.p.lat, x.p.lon, `<div style="width:14px;height:14px;border-radius:50%;background:${TIERC[x.lv.tier]};border:2px solid #fff;box-shadow:0 1px 4px #0006;transform:translate(-7px,-7px)"></div>`, `${esc(x.p.name)} · ${STATUS[x.lv.tier]}`));
  if (A) M.map.setView([A.lat, A.lon], A.km <= 50 ? 8 : 7);
  $("#chg").onclick = e => { e.preventDefault(); APP.go("area") };
  $$("tr.ck").forEach(r => r.onclick = () => M.map.setView([+r.dataset.la, +r.dataset.lo], 9))
};

PAGES.alerts = c => {
  const D = APP.D(), A = APP.area, regA = { name: REGN[APP.region], lat: 0, lon: 0, km: 0, cells: IDX[APP.region] };
  c.innerHTML = `<div class="grid two"><div class="card"><h3>🔔 ${A ? "Alerts near " + esc(A.name) : "Regional alerts"} — ${dateLabel(APP.date, true)}</h3>${A ? alertHTML(alertsFor(A, D)) : `<div class="notice">Select an area (search or click the map) to get alerts for your beach or town.</div>`}
  <h3 class="section">Region: ${REGN[APP.region]}</h3>${alertHTML(alertsFor(regA, D, REGN[APP.region]).slice(0, 4))}</div><div class="card"><div class="mapwrap"><div id="map" class="map"></div>${legendTier()}</div><div class="footer-note">Click the map to get alerts for that spot. ${srcLine(D)}</div></div></div>`;
  pageMap("map", "tier", (i, ll) => { const [ni, nd] = nearestCell(ll.lat, ll.lng); if (nd > 80) return; setArea({ name: G.id[ni], sub: "Grid cell", lat: G.lat[ni], lon: G.lon[ni] }, APP.area ? APP.area.km : 50); APP.render() })
};

/* ---------- public sighting reports (validated) ---------- */
const SIGHT_KEY = "aq_sightings_v2";
const DEBRIS = /(plastic|bottle|net|nets|bag|bags|sack|waste|garbage|debris|litter|wrapper|packet|cover|trash|rope|foam|thermocol|styrofoam|cup|straw|container|polythene|pet|can|cans|slipper|footwear|ghost gear|fishing|buoy|crate|carton|pouch|sachet|microplastic|dump|pile|patch|floating|washed)/i;
const ABUSE = /\b(mad|stupid|idiot|fool|dumb|useless|shut ?up|hate|kill|damn|bloody|bastard|pagal|kutta|kamina|bewakoof|gadha|chutiya|loser|moron)\b/i;
function gibberish(t) { const w = t.toLowerCase().match(/[a-z]+/g) || []; if (w.length < 3) return true; const bad = w.filter(x => x.length > 2 && (!/[aeiouy]/.test(x) || /[bcdfghjklmnpqrstvwxz]{5,}/.test(x) || /(.)\1{3,}/.test(x))).length; return bad / w.length > .3 }
function personBlame(t) { const m = t.match(/\b([A-Z][a-z]{2,})(\s+[A-Z][a-z]{2,})?\s+(threw|throws|dumped|dumps|is|was|did|does)\b/); if (!m) return false; const w = m[1].toLowerCase(); if (["someone", "people", "tourists", "fishermen", "visitors", "boats", "there", "this", "that", "it", "waste", "plastic", "the"].includes(w)) return false; return !PLACES.some(p => p.key === w) }
function validateSighting(f) {
  const e = {};
  if (!f.place) e.loc = "Pick a location from the suggestions, click the map, or enter lat,lon.";
  else { const s = inStudyArea(f.place.lat, f.place.lon); if (!s.ok) e.loc = "This location is outside the monitored coastline / ocean grid."; else if (s.km > 40) e.loc = `This point is ${s.km.toFixed(0)} km from the sea grid — report from the coast or sea.` }
  const when = f.when ? new Date(f.when) : null; if (!when || isNaN(when)) e.when = "Enter when you saw it."; else if (when > new Date(Date.now() + 5 * 6e4)) e.when = "Date/time cannot be in the future."; else if (Date.now() - when > 30 * 864e5) e.when = "Only sightings from the last 30 days are accepted.";
  const t = (f.desc || "").trim();
  if (t.length < 15 || t.split(/\s+/).length < 3) e.desc = "Describe the debris in at least a short sentence (15+ characters).";
  else if (t.length > 500) e.desc = "Keep the description under 500 characters.";
  else if (ABUSE.test(t)) e.desc = "Please keep the report factual and respectful — abusive language is not accepted.";
  else if (gibberish(t)) e.desc = "The description does not look like real text — please describe what you saw.";
  else if (!DEBRIS.test(t)) e.desc = "Describe the debris itself (e.g. plastic bottles, fishing nets, bags washed ashore).";
  else if (personBlame(t)) e.desc = "Please describe the debris, not individuals — do not name or accuse people.";
  if (f.contact && !/^([^\s@]+@[^\s@]+\.[a-z]{2,}|(\+91[\s-]?)?[6-9]\d{9})$/i.test(f.contact.trim())) e.contact = "Enter a valid e-mail or 10-digit Indian mobile number (or leave empty).";
  if (!f.consent) e.consent = "Please confirm the report is genuine.";
  const L_ = LS.get(SIGHT_KEY, []), hr = Date.now() - 36e5;
  if (L_.filter(x => x.ts > hr && x.mine).length >= 5) e.form = "Limit reached: 5 reports per hour from this device.";
  if (f.place && L_.some(x => x.ts > Date.now() - 2 * 36e5 && x.cat === f.cat && haversine(x.lat, x.lon, f.place.lat, f.place.lon) < 2)) e.form = "A similar report for this place and category was already submitted in the last 2 hours.";
  return e
}
PAGES.sighting = c => {
  const mine = LS.get(SIGHT_KEY, []).filter(x => x.mine).slice(-6).reverse(), now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  c.innerHTML = `<div class="grid two"><div class="card"><h3>📸 Report a plastic sighting</h3><div class="formgrid">
  <label class="fl full">Location *<div class="searchbox"><input id="sLoc" placeholder="Beach / town / lat,lon — or click the map" autocomplete="off"></div><span class="err-msg small" id="e_loc"></span></label>
  <label class="fl">When did you see it? *<input id="sWhen" type="datetime-local" max="${now}" value="${now}"><span class="err-msg small" id="e_when"></span></label>
  <label class="fl">Debris type *<select id="sCat"><option>Plastic bottles / containers</option><option>Fishing nets / ropes (ghost gear)</option><option>Plastic bags / sacks</option><option>Food packaging / wrappers</option><option>Mixed plastic debris</option></select></label>
  <label class="fl">Approximate amount *<select id="sQty"><option>A few items (under 10)</option><option>Moderate patch (10–100 items)</option><option>Large accumulation (100+ items)</option></select></label>
  <label class="fl">Contact (optional)<input id="sContact" placeholder="e-mail or mobile"><span class="err-msg small" id="e_contact"></span></label>
  <label class="fl full">Description *<textarea id="sDesc" rows="3" maxlength="500" placeholder="e.g. Many plastic bottles and a torn fishing net washed up near the high-tide line"></textarea><span class="err-msg small" id="e_desc"></span></label>
  <label class="fl full">Photo (recommended — verified by our AI plastic detector)<input id="sPhoto" type="file" accept="image/*"><span class="small muted" id="sPhotoMsg"></span></label>
  <label class="full small"><input type="checkbox" id="sOk"> I confirm this is a genuine sighting and contains no personal information about others. <span class="err-msg small" id="e_consent"></span></label>
  <div class="full"><button class="primary" id="sSend">Submit report</button> <span class="err-msg small" id="e_form"></span></div></div></div>
  <div class="card"><div class="mapwrap"><div id="map" class="map" style="height:380px"></div></div><h3 class="section">Your recent reports</h3>${mine.map(x => `<div class="alert ${x.status === "verified" ? "g" : x.status === "rejected" ? "r" : ""}"><b>${esc(x.place)}</b> · ${esc(x.cat)} <span class="vbadge ${x.status === "verified" ? "v-ok" : x.status === "rejected" ? "v-rej" : "v-pend"}">${x.status === "verified" ? "Verified" : x.status === "rejected" ? "Rejected" : "Pending review"}</span><div class="muted">${esc(x.desc)}<br>${new Date(x.when).toLocaleString("en-IN")} · ${x.ai ? `AI: ${x.ai.n} plastic object(s), top ${(x.ai.top * 100).toFixed(0)}%` : "no photo"}</div></div>`).join("") || `<p class="muted">No reports yet.</p>`}</div></div>`;
  let place = null, photo = null;
  const M = pageMap("map", "tier", (i, ll) => { const [ni, nd] = nearestCell(ll.lat, ll.lng); if (nd > 40) { $("#e_loc").textContent = "Click on the sea or coastline."; return } place = { name: `${ll.lat.toFixed(3)}, ${ll.lng.toFixed(3)}`, lat: ll.lat, lon: ll.lng }; $("#sLoc").value = place.name; $("#e_loc").textContent = ""; pin() });
  let pinM = null; const pin = () => { if (pinM) pinM.remove(); pinM = M.marker(place.lat, place.lon, '<div class="area-ic" style="transform:translate(-8px,-8px)"></div>', place.name); M.map.setView([place.lat, place.lon], 8) };
  attachSearch($("#sLoc"), r => { place = r; $("#e_loc").textContent = ""; pin() }, { status: m => $("#e_loc").innerHTML = m });
  $("#sLoc").addEventListener("input", () => place = null);
  $("#sPhoto").onchange = async ev => { const f = ev.target.files[0]; photo = null; if (!f) return; const msg = $("#sPhotoMsg"); try { const im = await readImage(f); msg.textContent = "Checking photo with the AI detector…"; const r = await detect(im, .25, (m) => msg.textContent = m); const s = detSummary(im, r.boxes); photo = { n: s.n, top: s.top }; msg.innerHTML = s.n ? `<span class="ok-msg">✅ AI detector found ${s.n} plastic object(s) (top confidence ${(s.top * 100).toFixed(0)}%) — report will be marked verified.</span>` : `<span class="err-msg">No plastic detected in this photo — the report will need manual review.</span>` } catch (e) { msg.innerHTML = `<span class="err-msg">${esc(e.message)}</span>` } };
  $("#sSend").onclick = () => {
    $$("[id^=e_]").forEach(x => x.textContent = "");
    const f = { place, when: $("#sWhen").value, cat: $("#sCat").value, desc: $("#sDesc").value, contact: $("#sContact").value, consent: $("#sOk").checked };
    const e = validateSighting(f); if (Object.keys(e).length) { Object.entries(e).forEach(([k, v]) => { const el = $("#e_" + k); if (el) el.textContent = v }); return }
    const [ni] = nearestCell(place.lat, place.lon), L_ = LS.get(SIGHT_KEY, []);
    L_.push({ id: "S" + Date.now().toString(36).toUpperCase(), place: place.name, lat: place.lat, lon: place.lon, cell: G.id[ni], when: f.when, cat: f.cat, qty: $("#sQty").value, desc: f.desc.trim(), contact: f.contact ? "provided" : "", ai: photo, status: photo && photo.n ? "verified" : "pending", ts: Date.now(), mine: true });
    if (!LS.set(SIGHT_KEY, L_)) { $("#e_form").textContent = "Browser storage is blocked — report not saved."; return }
    toast(photo && photo.n ? "✅ Report submitted and AI-verified. Thank you!" : "✅ Report submitted — pending review by officials."); APP.render()
  }
};

PAGES.hotspots = c => {
  const D = APP.D(), pk = prevKey(APP.date), Dp = pk ? day(pk) : null, rows = IDX[APP.region].slice().sort((a, b) => D.P[b] - D.P[a]).slice(0, 500);
  c.innerHTML = `<div class="grid two"><div class="card"><h3>Hotspot map — ${dateLabel(APP.date, true)}</h3>${layerToggles({ zones: true, fdi: true })}<div class="mapwrap"><div id="map" class="map"></div>${legendTier()}</div><div class="footer-note">${srcLine(D)}</div></div>
  <div class="card"><div class="notice small">Top 500 of ${fmtN(IDX[APP.region].length)} scored cells by LSTM-predicted density. Click a row to locate it.</div><div class="tablewrap section"><table><thead><tr><th>Grid</th><th>Region</th><th>Density</th><th>Tier</th>${Dp ? "<th>Δ prev</th>" : ""}<th>Lat</th><th>Lon</th></tr></thead><tbody>${rows.map(i => { const d = Dp ? D.P[i] - Dp.P[i] : 0; return `<tr class="ck" data-i="${i}"><td>${G.id[i]}</td><td>${REG[G.r[i]]}</td><td>${D.P[i].toFixed(5)}</td><td class="tier-${TIER[D.tier[i]].toLowerCase()}">${TIER[D.tier[i]]}</td>${Dp ? `<td class="${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(4)}</td>` : ""}<td>${G.lat[i].toFixed(3)}</td><td>${G.lon[i].toFixed(3)}</td></tr>` }).join("")}</tbody></table></div></div></div>`;
  const M = pageMap("map", "tier"); M.hotspots(hotspotList(D, APP.region, 10, APP.region === "IO" || APP.region === "ALL" ? 250 : 120)); wireToggles(M, { zones: true, fdi: true });
  $$("tr.ck:not(.zrow)").forEach(r => r.onclick = () => { const i = +r.dataset.i; APP.selCell = i; M.select(i); M.map.setView([G.lat[i], G.lon[i]], 8); $$("tr.sel").forEach(x => x.classList.remove("sel")); r.classList.add("sel") })
};

PAGES.forecast = c => {
  const D = APP.D(), run = DATA.run || {}, m = AQ_META.lstm_metrics, pl = AQ_META.lstm_pooled;
  c.innerHTML = `${card("Daily model runs — select a date", dayStrip() + (DATA.daily ? sparkSVG(dateMeans(APP.region), DATA.dates.map(d => d.key), `${REGN[APP.region]} mean predicted density per model date`, true) : ""))}
  <div class="section grid two"><div class="card"><h3>Predicted plastic-accumulation density — ${dateLabel(APP.date, true)}</h3>${layerToggles({ fdi: true })}<div class="mapwrap"><div id="map" class="map"></div><div class="maplegend"><b>Predicted density</b><div style="height:10px;width:150px;border-radius:5px;background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map(v => rampColor(v, 1)).join(",")})"></div><div class="lg" style="justify-content:space-between"><span>${D.pmin.toFixed(3)}</span><span>${D.pmax.toFixed(3)}</span></div></div></div><div class="footer-note">${srcLine(D)}</div></div>
  <div class="card"><h3>Model run</h3><table class="kv">${DATA.daily ? `<tr><td>Model</td><td>aqua_strat_lstm_v5.keras (no retraining)</td></tr><tr><td>Inputs</td><td>Copernicus GLOBAL_ANALYSISFORECAST_PHY_001_024 — SST, salinity, u/v currents, SSH (daily, 1/12°)</td></tr><tr><td>Dates available</td><td>${dateLabel(DATA.dates[0].key, true)} → ${dateLabel(DATA.dates[DATA.dates.length - 1].key, true)} (${DATA.dates.length})</td></tr><tr><td>Forecast-physics dates</td><td>${DATA.dates.filter(d => d.physics === "forecast").length}</td></tr><tr><td>Inference run</td><td>${esc(run.run_date || "—")}</td></tr><tr><td>Pipeline check vs v5</td><td>${run.verified_vs_v5 === "True" ? '<span class="ok-msg">✅ reproduces saved v5 output</span>' : esc(run.verified_vs_v5 || "—")}</td></tr>` : `<tr><td>Prediction source</td><td>predicted_hotspots_v5.csv (14,777 cells)</td></tr>`}<tr><td>Window / horizon</td><td>14 days → next day</td></tr></table>
  <h3 class="section">Test metrics by region</h3><table><thead><tr><th>Region</th><th>MAE</th><th>RMSE</th><th>R²</th><th>Samples</th></tr></thead><tbody>${m.map(r => `<tr><td>${r.Region}</td><td>${(+r.MAE).toFixed(5)}</td><td>${(+r.RMSE).toFixed(5)}</td><td>${(+r.R2).toFixed(4)}</td><td>${fmtN(r["Test samples"])}</td></tr>`).join("")}<tr><th>Pooled</th><th>${pl.MAE}</th><th>${pl.RMSE}</th><th>${pl.R2}</th><th>${fmtN(pl.samples)}</th></tr></tbody></table><p class="footer-note">Measured test results of the trained LSTM (no target metric is hard-coded).</p></div></div>`;
  wireStrip(); const M = pageMap("map", "density"); wireToggles(M, { fdi: true })
};

PAGES.risk = c => {
  const D = APP.D(), rows = IDX[APP.region].slice().sort((a, b) => D.rc[b] - D.rc[a]).slice(0, 1000); let t = [0, 0, 0]; for (const i of IDX[APP.region]) t[D.rtier[i]]++;
  c.innerHTML = `<div class="grid kpis">${kpi("High risk", fmtN(t[2]))}${kpi("Medium risk", fmtN(t[1]))}${kpi("Low risk", fmtN(t[0]))}${kpi("Date", dateLabel(APP.date))}</div><div class="section grid two"><div class="card"><h3>Ecological risk map</h3>${layerToggles({ zones: true })}<div class="mapwrap"><div id="map" class="map"></div>${legendTier("Combined risk tier (P×H, P×W)")}</div><div class="footer-note">Risk = predicted density × habitat sensitivity (P×H) and × wildlife exposure (P×W); combined = ½·P×H + ½·P×W. Tiers: zero risk → Low, non-zero split at the median (Objective-4 v6).</div></div>
  <div class="card"><h3>Risk-ranked cells</h3><div class="tablewrap"><table><thead><tr><th>Grid</th><th>P×H</th><th>P×W</th><th>Combined</th><th>Tier</th></tr></thead><tbody>${rows.map(i => `<tr class="ck" data-i="${i}"><td>${G.id[i]}</td><td>${D.rh[i].toFixed(4)}</td><td>${D.rw[i].toFixed(4)}</td><td>${D.rc[i].toFixed(4)}</td><td class="tier-${TIER[D.rtier[i]].toLowerCase()}">${TIER[D.rtier[i]]}</td></tr>`).join("")}</tbody></table></div></div></div>`;
  const M = pageMap("map", "risk"); wireToggles(M, { zones: true }); $$("tr.ck:not(.zrow)").forEach(r => r.onclick = () => { const i = +r.dataset.i; APP.selCell = i; M.select(i); M.map.setView([G.lat[i], G.lon[i]], 8) })
};

PAGES.fdi = c => {
  const F = AQ_META.fdi, has = !!window.AQ_FDI, D = APP.D();
  let tbl = ""; if (has) { const rows = AQ_FDI.idx.map((i, k) => ({ i, f: AQ_FDI.fdi_mean[k], n: AQ_FDI.n_tiles[k] })).filter(x => APP.region === "ALL" || REG[G.r[x.i]] === APP.region).sort((a, b) => b.f - a.f).slice(0, 300); tbl = `<div class="tablewrap" style="max-height:320px"><table><thead><tr><th>Grid</th><th>FDI mean</th><th>Tiles</th><th>LSTM density (${dateLabel(APP.date)})</th></tr></thead><tbody>${rows.map(x => `<tr class="ck" data-i="${x.i}"><td>${G.id[x.i]}</td><td>${x.f.toFixed(5)}</td><td>${x.n}</td><td>${D.P[x.i].toFixed(4)}</td></tr>`).join("")}</tbody></table></div>` }
  c.innerHTML = `<div class="grid kpis">${kpi("Sentinel-2 tiles", F.tiles)}${kpi("Cells with FDI", fmtN(F.coverage.AS[0] + F.coverage.BOB[0] + F.coverage.IO[0]))}${kpi("Spearman rho (FDI vs LSTM)", F.rho)}${kpi("p-value · n", `${F.p} · ${F.n}`)}</div>
  <div class="section grid two"><div class="card"><h3>Floating Debris Index — satellite validation layer</h3>${has ? `<div class="mapwrap"><div id="map" class="map" style="height:420px"></div><div class="maplegend"><b>FDI mean per cell</b><div class="lg"><i style="background:#f97316"></i>positive (debris-like)</div><div class="lg"><i style="background:#3b82f6"></i>negative</div><div class="lg"><i style="background:#cbd5e1"></i>no cloud-free coverage</div></div></div>` : `<img src="assets/img/fdi_sample_tile.png" style="width:100%;border-radius:8px;border:1px solid var(--line)" alt="FDI raster">`}
  <h4>Pipeline (AQUA_STRAT_FDI_Final.ipynb)</h4><ol class="small"><li>Sentinel-2 L2A search (Earth Search STAC, ${F.date_range}, cloud &lt; ${F.max_cloud}%) — ${F.tiles_per_region} least-cloudy tiles per region</li><li>B06 (red-edge) + B11 (SWIR) at native 20 m; B08 (NIR) aligned to 20 m</li><li>FDI = R<sub>NIR</sub> − R′<sub>NIR</sub> (Biermann et al., 2020)</li><li>Aggregated onto the AQUA-STRAT master grid (mean, p95, tile count)</li><li>Validated against LSTM-predicted density (Spearman)</li></ol></div>
  <div class="card"><h3>Coverage & validation</h3><table><thead><tr><th>Region</th><th>Cells with FDI</th><th>Coverage</th></tr></thead><tbody>${["AS", "BOB", "IO"].map(r => `<tr><td>${r}</td><td>${F.coverage[r][0]} / ${fmtN(F.coverage[r][1])}</td><td>${(F.coverage[r][0] / F.coverage[r][1] * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table>
  <img src="assets/img/fdi_vs_density.png" style="width:100%;margin-top:12px;border-radius:8px;border:1px solid var(--line)" alt="FDI vs density">
  <div class="notice warning small section">Spearman ρ = ${F.rho} (p = ${F.p}, n = ${F.n}): a weak negative association. FDI is a physics-based spectral index (no train/test split) used as <b>supporting satellite evidence</b>; coverage is sparse (cloud-free tiles) and FDI is sensitive to foam, sun-glint and algae look-alikes.</div>${tbl}</div></div>`;
  if (has) { const M = pageMap("map", "fdi"); $$("tr.ck").forEach(r => r.onclick = () => { const i = +r.dataset.i; M.select(i); M.map.setView([G.lat[i], G.lon[i]], 8) }) }
};

PAGES.detector = c => {
  const C = AQ_META.cnn; let cur = null;
  c.innerHTML = `<div class="grid two"><div class="card"><h3>AI-Assisted Plastic Detector</h3><p class="small">Runs your trained <b>${C.model}</b> checkpoint <code>${C.weights}</code> (precision ${C.precision} · recall ${C.recall} · mAP@50 ${C.map50}) directly in this app — no internet, no server.</p>
  <label class="drop" id="drop">📷 <b>Choose an image</b>, drag &amp; drop it here, or paste (Ctrl+V)<input id="img" type="file" accept="image/*" style="display:none"></label>
  <div class="range section"><span class="small">Confidence ≥</span><input id="conf" type="range" min="0.1" max="0.9" step="0.05" value="0.25"><b id="confv">0.25</b></div>
  <div id="dstat" class="footer-note">The model loads on first use (a few seconds).</div><div id="dimg" class="section"></div></div><div class="card" id="dres"><h3>Result</h3><p class="muted">Upload an underwater, surface or shoreline photo.</p></div></div>`;
  const prog = (m) => $("#dstat").innerHTML = `⏳ ${esc(m)}`;
  const show = () => {
    if (!cur) return; cur.boxes = post(cur.raw, cur.im, +$("#conf").value); const s = detSummary(cur.im, cur.boxes); const cv = detCanvas(cur.im, cur.boxes, 1400); cv.className = "det-canvas"; $("#dimg").innerHTML = ""; $("#dimg").appendChild(cv);
    $("#dres").innerHTML = `<h3>${s.n ? '<span class="up">⚠ Plastic detected</span>' : '<span class="down">✓ No plastic detected</span>'}</h3><div class="grid" style="grid-template-columns:1fr 1fr">${kpi("Plastic objects", s.n)}${kpi("Top confidence", s.n ? (s.top * 100).toFixed(0) + "%" : "—")}${kpi("Image area covered", s.cov.toFixed(1) + "%")}${kpi("Debris level", s.level)}</div>
    ${s.n ? `<div class="tablewrap section" style="max-height:200px"><table><thead><tr><th>#</th><th>Confidence</th><th>Box (px)</th></tr></thead><tbody>${cur.boxes.slice(0, 20).map((b, k) => `<tr><td>${k + 1}</td><td>${b.s.toFixed(3)}</td><td>${b.w.toFixed(0)}×${b.h.toFixed(0)}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <div class="row section"><button class="ghost" id="dsave">⬇ Save annotated image</button></div>
    <h4>Log as field observation</h4><div class="searchbox"><input id="dloc" placeholder="Where was the photo taken? (place or lat,lon)" autocomplete="off"><button class="primary" id="dlog">Add</button></div><div id="dlogmsg" class="footer-note"></div>
    <p class="footer-note">Inference ${cur.ms.toFixed(0)} ms · image-based detector — decision support, not a 100% classifier.</p>`;
    $("#dsave").onclick = () => { const a = document.createElement("a"); a.href = detCanvas(cur.im, cur.boxes, 4000).toDataURL("image/png"); a.download = "aquastrat_detection.png"; a.click() };
    let pl = null; attachSearch($("#dloc"), r => pl = r, { status: m => $("#dlogmsg").innerHTML = m });
    $("#dlog").onclick = () => { if (!pl) return $("#dlogmsg").innerHTML = '<span class="err-msg">Pick a location from the suggestions.</span>'; const L_ = LS.get(SIGHT_KEY, []), [ni] = nearestCell(pl.lat, pl.lon); L_.push({ id: "F" + Date.now().toString(36).toUpperCase(), place: pl.name, lat: pl.lat, lon: pl.lon, cell: G.id[ni], when: new Date().toISOString(), cat: "Field observation (AI detector)", qty: "", desc: `${s.n} plastic object(s) detected, top confidence ${(s.top * 100).toFixed(0)}%`, ai: { n: s.n, top: s.top }, status: s.n ? "verified" : "pending", ts: Date.now(), by: APP.role }); LS.set(SIGHT_KEY, L_); $("#dlogmsg").innerHTML = `<span class="ok-msg">✅ Logged at ${esc(pl.name)} (cell ${G.id[ni]}).</span>` }
  };
  const run = async f => { try { const im = await readImage(f); $("#dimg").innerHTML = ""; prog("Starting…"); const r = await detect(im, +$("#conf").value, prog); cur = { im, raw: r.raw, ms: r.ms }; $("#dstat").innerHTML = "✅ Model ready."; show() } catch (e) { $("#dstat").innerHTML = `<span class="err-msg">${esc(e.message)}</span>` } };
  const dr = $("#drop"); dr.onclick = () => $("#img").click(); $("#img").onchange = e => run(e.target.files[0]);
  dr.ondragover = e => { e.preventDefault(); dr.classList.add("over") }; dr.ondragleave = () => dr.classList.remove("over"); dr.ondrop = e => { e.preventDefault(); dr.classList.remove("over"); run(e.dataTransfer.files[0]) };
  $("#conf").oninput = e => { $("#confv").textContent = (+e.target.value).toFixed(2); if (cur) show() };
  APP.onPaste = e => { const it = [...(e.clipboardData || {}).items || []].find(i => i.type.startsWith("image/")); if (it) run(it.getAsFile()) }
};

PAGES.ga = c => {
  const D = APP.D(), gov = APP.role === "GOVERNMENT", P = APP.planPrm;
  c.innerHTML = `<div class="grid two"><div class="card"><h3>${gov ? "Cleanup operation plan" : "Cleanup scenario"} — ${dateLabel(APP.date, true)}</h3><div class="mapwrap"><div id="map" class="map tall"></div><div class="maplegend" id="tripLegend"></div></div><div class="footer-note">Sites selected by the Genetic Algorithm on this date's LSTM predictions; arrows show each vessel trip from its port (dashed = return leg). Click a trip in the legend to highlight it.</div></div>
  <div class="card"><h3>Plan settings</h3><div class="formgrid">
  <label class="fl">Region<select id="pScope">${["ALL", "AS", "BOB", "IO"].map(r => `<option ${P.scope === r ? "selected" : ""}>${r}</option>`).join("")}</select></label>
  <label class="fl">Maximum sites (budget)<input id="pMax" type="number" min="5" max="100" value="${P.maxSites}"></label>
  <label class="fl">Pollution weight<input id="pWP" type="number" step="5" value="${P.wP}"></label><label class="fl">Cost weight<input id="pWC" type="number" step="0.01" value="${P.wC}"></label>
  <label class="fl">Risk weight<input id="pWR" type="number" step="5" value="${P.wR}"></label><label class="fl">Generations<input id="pGen" type="number" min="20" max="400" value="${P.gens}"></label>
  <label class="fl">Port model<select id="pPorts"><option value="nearest" ${P.ports === "nearest" ? "selected" : ""}>Nearest major Indian port</option><option value="notebook" ${P.ports === "notebook" ? "selected" : ""}>Notebook (1 port per region)</option></select></label>
  <label class="fl">Vessels<input id="pVes" type="number" min="1" max="12" value="${P.vessels}"></label><label class="fl">Max stops per trip<input id="pStops" type="number" min="1" max="6" value="${P.stops}"></label>
  <div class="fl" style="align-self:end"><button class="primary" id="pRun">⚙ Optimise plan</button></div></div><div id="pOut" class="section"></div></div></div>`;
  const M = pageMap("map", "plan");
  const draw = () => {
    const plan = APP.plan(); if (!plan) return;
    if (plan.prm.scope !== "ALL") { } M.routes(plan, APP.hiTrip);
    if (!APP._planFitted || APP._planFitted !== plan) { APP._planFitted = plan; const ll = []; plan.trips.forEach(t => { ll.push([t.port.lat, t.port.lon]); t.stops.forEach(s => ll.push([G.lat[s.i], G.lon[s.i]])) }); if (ll.length) { M.map.invalidateSize(); M.map.fitBounds(ll, { padding: [30, 30], maxZoom: 7 }); setTimeout(() => { if (APP.mapObj !== M) return; M.map.invalidateSize(); M.map.fitBounds(ll, { padding: [30, 30], maxZoom: 7 }) }, 120) } }
    $("#tripLegend").innerHTML = `<b style="display:flex;justify-content:space-between;gap:10px">Vessel trips (${plan.trips.length}) <a href="#" id="lgTog">${APP.lgHide ? "show" : "hide"}</a></b>` + (APP.lgHide ? "" : plan.trips.map((t, k) => `<div class="lg click ${APP.hiTrip >= 0 && APP.hiTrip !== k ? "dim" : ""}" data-k="${k}"><i class="line" style="background:${t.col}"></i>${t.name} · ⚓ ${esc(t.port.name)} · ${t.stops.length} stops · V${t.v + 1}</div>`).join("") + `<div class="lg"><i class="line" style="background:repeating-linear-gradient(90deg,#64748b 0 5px,transparent 5px 9px)"></i>return leg</div>`); $("#lgTog").onclick = e => { e.preventDefault(); APP.lgHide = !APP.lgHide; draw() };
    $$("#tripLegend .lg.click").forEach(e => e.onclick = () => { const k = +e.dataset.k; APP.hiTrip = APP.hiTrip === k ? -1 : k; draw(); out() });
    out()
  };
  const out = () => {
    const p = APP.plan(); const sv = p.directKm ? (1 - p.routedKm / p.directKm) * 100 : 0, b = AQ_META.ga_summary;
    $("#pOut").innerHTML = `<div class="grid" style="grid-template-columns:repeat(3,1fr)">${kpi("Sites", p.sel.length)}${kpi("Plastic index removed", p.tot.removed.toFixed(3), `<div class="delta muted">sum of predicted density index (0–1) of selected cells</div>`)}${kpi("Cost (units)", fmtN(p.tot.cost))}${kpi("Disturbance risk", p.tot.dist.toFixed(3))}${kpi("Route distance", fmtN(toNM(p.routedKm)) + " NM", `<div class="delta muted">(${fmtN(p.routedKm)} km)</div><div class="delta down">${sv.toFixed(0)}% shorter than direct trips</div>`)}${kpi("Duration", p.days.toFixed(1) + " days", `<div class="delta muted">${p.prm.vessels} vessel${p.prm.vessels > 1 ? "s" : ""} · ${(p.prm.speed / 24 / KM_PER_NM).toFixed(1)} knots</div>`)}</div>
    <div class="section">${convSVG(p)}</div>
    <h4>Vessel trips</h4><div class="tablewrap" style="max-height:260px"><table><thead><tr><th>Trip</th><th>Route</th><th>NM</th><th>Days</th></tr></thead><tbody>${p.trips.map((t, k) => `<tr class="ck trip-row ${APP.hiTrip === k ? "sel" : ""}" data-k="${k}"><td><span class="sw" style="background:${t.col}"></span><b>${t.name}</b> · V${t.v + 1}</td><td>⚓ ${esc(t.port.name)} → ${t.stops.map((s, n) => `<b>${n + 1}</b> ${G.id[s.i]}`).join(" → ")} → ⚓${tripLand(t).length ? ` <span class="landwarn" title="Straight great-circle leg passes over land; a real sea route would be longer">⚠ crosses land (leg ${tripLand(t).map(m => m + 1).join(", ")})</span>` : ""}</td><td>${fmtN(toNM(t.km))}${tripLand(t).length ? "*" : ""}</td><td>${t.start.toFixed(1)}–${(t.start + t.days).toFixed(1)}</td></tr>`).join("")}</tbody></table></div>${calcBox(p, sv)}
    <h4 class="section">Vessel schedule</h4>${gantt(p)}
    <div class="notice small section"><b>Notebook baseline (Objective-4, 16 Aug run):</b> ${b.sites_selected} sites · plastic index removed ${(+b.total_pollution_removed).toFixed(3)} · cost ${fmtN(+b.total_cost)} · ${b.generations} generations. This plan uses the same GA formulation on ${dateLabel(APP.date, true)}'s predictions · fitness ${p.fitness.toFixed(1)} · computed in ${p.ms} ms.</div>`;
    $$("#pOut tr.ck").forEach(r => r.onclick = () => { const k = +r.dataset.k; APP.hiTrip = APP.hiTrip === k ? -1 : k; draw() })
  };
  $("#pRun").onclick = () => { Object.assign(APP.planPrm, { scope: $("#pScope").value, maxSites: clamp(+$("#pMax").value || 40, 5, 100), wP: +$("#pWP").value, wC: +$("#pWC").value, wR: +$("#pWR").value, gens: clamp(+$("#pGen").value || 150, 20, 400), ports: $("#pPorts").value, vessels: clamp(+$("#pVes").value || 4, 1, 12), stops: clamp(+$("#pStops").value || 4, 1, 6) }); APP.planCache.clear(); APP.hiTrip = -1; APP._planFitted = null; draw(); toast("✅ Plan re-optimised") };
  draw()
};
function convSVG(p) { const w = 520, h = 120, a = p.hist, b = p.avg, mn = Math.min(...b.filter(x => x > -1e5), ...a), mx = Math.max(...a), px = k => 30 + k * (w - 40) / (a.length - 1), py = v => h - 20 - (clamp(v, mn, mx) - mn) / ((mx - mn) || 1) * (h - 34); return `<svg viewBox="0 0 ${w} ${h}" width="100%"><polyline fill="none" stroke="#9db3c2" stroke-width="1.3" points="${b.map((v, k) => px(k) + "," + py(v)).join(" ")}"/><polyline fill="none" stroke="#0b5c8e" stroke-width="2.2" points="${a.map((v, k) => px(k) + "," + py(v)).join(" ")}"/><text x="30" y="12" font-size="10" fill="#0b5c8e">best fitness</text><text x="110" y="12" font-size="10" fill="#7b93a5">population average</text><text x="${w - 70}" y="${h - 4}" font-size="9" fill="#64748b">generation ${a.length}</text></svg>` }
function calcBox(p, sv) {
  const t0 = p.trips[0]; if (!t0) return "";
  const s0 = t0.stops[0], la1 = t0.port.lat, lo1 = t0.port.lon, la2 = G.lat[s0.i], lo2 = G.lon[s0.i], r = Math.PI / 180,
    a = Math.sin((la2 - la1) * r / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin((lo2 - lo1) * r / 2) ** 2, dkm = haversine(la1, lo1, la2, lo2),
    kmh = p.prm.speed / 24, kn = kmh / KM_PER_NM, legs = p.trips.reduce((x, t) => x + t.stops.length + 1, 0), land = p.trips.reduce((x, t) => x + tripLand(t).length, 0),
    landKm = p.trips.reduce((x, t) => { const P = tripPts(t); return x + tripLand(t).reduce((y, m) => y + haversine(P[m][0], P[m][1], P[m + 1][0], P[m + 1][1]), 0) }, 0),
    f = (v, d) => v.toFixed(d == null ? 2 : d), sign = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  return `<details class="calcbox section"><summary>ⓘ How is this calculated?</summary><div class="calc">
  <h5>1 · Distance of each leg: Haversine great-circle formula</h5>
  <div class="eq">d = 2R · asin( √( sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2) ) ),&nbsp; R = ${fmtN(R_KM)} km = ${R_NM.toLocaleString("en-IN", { maximumFractionDigits: 1 })} NM</div>
  <p><b>Worked example</b> (trip ${t0.name}, first leg): ⚓ ${esc(t0.port.name)} (φ₁ ${f(la1)}°, λ₁ ${f(lo1)}°) → stop 1 ${G.id[s0.i]} (φ₂ ${f(la2)}°, λ₂ ${f(lo2)}°)<br>
  Δφ = ${sign(la2 - la1)}°, Δλ = ${sign(lo2 - lo1)}° → sin²(Δφ/2) + cos φ₁ cos φ₂ sin²(Δλ/2) = ${a.toExponential(3)}<br>
  d = 2 × ${R_NM.toLocaleString("en-IN", { maximumFractionDigits: 1 })} × asin(√${a.toExponential(3)}) = <b>${f(toNM(dkm), 1)} NM</b> (= ${f(dkm, 1)} km)</p>
  <h5>2 · Route distance</h5>
  <p>Sum of all ${legs} legs (port → stops → port) = ${fmtN(p.routedKm)} km ÷ 1.852 = <b>${fmtN(toNM(p.routedKm))} NM</b>.<br>
  Direct trips (one return trip per site) = ${fmtN(toNM(p.directKm))} NM, so the combined routes are <b>${sv.toFixed(0)}% shorter</b>.</p>
  <h5>3 · Vessel speed</h5>
  <p>${fmtN(p.prm.speed)} km/day ÷ 24 = ${f(kmh, 1)} km/h ÷ 1.852 = <b>${f(kn, 1)} knots</b> (1 knot = 1 NM per hour).</p>
  <h5>4 · Duration</h5>
  <p>Each trip = distance ÷ speed + 0.5 day per cleanup stop. Example ${t0.name}: ${fmtN(t0.km)} km ÷ ${fmtN(p.prm.speed)} km/day + 0.5 × ${t0.stops.length} = <b>${f(t0.days)} days</b>.<br>
  Trips are shared among ${p.prm.vessels} vessel${p.prm.vessels > 1 ? "s" : ""} working in parallel; the plan takes as long as the busiest vessel = <b>${p.days.toFixed(1)} days</b>.</p>
  <h5>5 · Cost units</h5>
  <p>Per site: distance from its port (km) × 1 + 50 fixed → total for ${p.sel.length} sites = <b>${fmtN(p.tot.cost)} units</b>.</p>
  <h5>6 · Land check</h5>
  <p>${land ? `<span class="landwarn">⚠ ${land} of ${legs} legs</span> (${fmtN(toNM(landKm))} NM) pass over land on the straight great-circle line, checked against the coastline map. Real sea routes around the land would be longer, so those trip distances are lower-bound estimates.` : `✅ No leg passes over land (checked against the coastline map).`}</p>
  </div></details>`
}
function gantt(p) { const T = Math.max(1, p.days), w = 100; return `<div class="small">${p.vessels.map((v, j) => `<div style="display:flex;align-items:center;gap:8px;margin:4px 0"><b style="width:28px">V${j + 1}</b><div style="flex:1;position:relative;height:18px;background:#eef3f6;border-radius:5px">${v.trips.map(t => `<div title="${t.name}: day ${t.start.toFixed(1)}–${(t.start + t.days).toFixed(1)}" style="position:absolute;left:${t.start / T * w}%;width:${Math.max(1.5, t.days / T * w)}%;top:2px;bottom:2px;background:${t.col};border-radius:4px;color:#fff;font-size:10px;line-height:14px;padding-left:3px;overflow:hidden">${t.name}</div>`).join("")}</div></div>`).join("")}<div class="muted" style="text-align:right">0 → ${T.toFixed(1)} days</div></div>` }

PAGES.advisories = c => {
  const D = APP.D(), ports = OPS_PORTS.map(p => { const cells = cellsWithin(p.lat, p.lon, 60), lv = coastLevel(D, cells.length ? cells : [nearestCell(p.lat, p.lon)[0]]); let rhi = 0; for (const i of cells) if (D.rtier[i] === 2) rhi++; return { p, lv, rhi, n: cells.length } }).filter(x => x.n && (APP.region === "ALL" || REG[G.r[nearestCell(x.p.lat, x.p.lon)[0]]] === APP.region));
  const regA = { name: REGN[APP.region], km: 0, cells: IDX[APP.region] };
  c.innerHTML = `<div class="grid two"><div class="card"><h3>Coastal advisories by port (60 km) — ${dateLabel(APP.date, true)}</h3><div class="tablewrap"><table><thead><tr><th>Port / coast</th><th>Mean index</th><th>Status</th><th>High-risk cells</th></tr></thead><tbody>${ports.map(x => `<tr><td>⚓ ${esc(x.p.name)}</td><td>${x.lv.mean.toFixed(4)}</td><td><span class="statusbadge ${STATUSC[x.lv.tier]}">${STATUS[x.lv.tier]}</span></td><td>${x.rhi}</td></tr>`).join("")}</tbody></table></div>
  <h3 class="section">Regional alerts</h3>${alertHTML(alertsFor(regA, D, REGN[APP.region]))}${APP.area ? `<h3 class="section">Selected area: ${esc(APP.area.name)}</h3>${alertHTML(alertsFor(APP.area, D))}` : ""}
  <button class="primary section" id="advPrint">🖨 Issue printable advisory</button></div><div class="card"><div class="mapwrap"><div id="map" class="map tall"></div>${legendTier()}</div></div></div>`;
  const M = pageMap("map", "tier"); ports.forEach(x => M.marker(x.p.lat, x.p.lon, `<div class="port-ic" style="background:${TIERC[x.lv.tier]}">⚓ ${esc(x.p.name)}</div>`, `${STATUS[x.lv.tier]} · index ${x.lv.mean.toFixed(4)}`));
  $("#advPrint").onclick = () => printDoc(`<h1>AQUA-STRAT Coastal Advisory</h1><p>${REGN[APP.region]} · ${dateLabel(APP.date, true)} · issued ${new Date().toLocaleString("en-IN")}</p><table><tr><th>Port / coast</th><th>Index</th><th>Status</th><th>High-risk cells</th></tr>${ports.map(x => `<tr><td>${esc(x.p.name)}</td><td>${x.lv.mean.toFixed(4)}</td><td>${STATUS[x.lv.tier]}</td><td>${x.rhi}</td></tr>`).join("")}</table><h3>Alerts</h3>${alertsFor(regA, D, REGN[APP.region]).map(a => `<p>• <b>${a[1]}</b> — ${a[2]}</p>`).join("")}<p><i>Decision-support advisory generated from LSTM model output — not an official order.</i></p>`)
};

PAGES.sightings = c => {
  const L_ = LS.get(SIGHT_KEY, []).slice().reverse();
  c.innerHTML = `<div class="grid two"><div class="card"><h3>Public sighting reports (${L_.length})</h3><div class="tablewrap"><table><thead><tr><th>Report</th><th>Place / cell</th><th>Details</th><th>Status</th><th></th></tr></thead><tbody>${L_.map(x => `<tr class="trip-row"><td><b>${x.id}</b><br><small>${new Date(x.when).toLocaleString("en-IN")}</small></td><td>${esc(x.place)}<br><small>${x.cell}</small></td><td>${esc(x.cat)}<br><small>${esc(x.desc)}</small><br><small>${x.ai ? `AI: ${x.ai.n} obj · ${(x.ai.top * 100).toFixed(0)}%` : "no photo"}</small></td><td><span class="vbadge ${x.status === "verified" ? "v-ok" : x.status === "rejected" ? "v-rej" : "v-pend"}">${x.status}</span></td><td>${x.status === "pending" ? `<button class="ghost" data-a="ok" data-id="${x.id}">Approve</button> <button class="ghost" data-a="no" data-id="${x.id}">Reject</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No reports submitted yet.</td></tr>`}</tbody></table></div></div><div class="card"><div class="mapwrap"><div id="map" class="map tall"></div></div></div></div>`;
  const M = pageMap("map", "tier"); L_.forEach(x => M.marker(x.lat, x.lon, `<div class="sight-ic" style="transform:translate(-9px,-9px)">${x.status === "verified" ? "🟢" : x.status === "rejected" ? "⚫" : "🟠"}</div>`, `${esc(x.place)} · ${esc(x.cat)} · ${x.status}`));
  $$("button[data-a]").forEach(b => b.onclick = () => { const A = LS.get(SIGHT_KEY, []), r = A.find(x => x.id === b.dataset.id); if (r) { r.status = b.dataset.a === "ok" ? "verified" : "rejected"; r.reviewedBy = APP.user; LS.set(SIGHT_KEY, A) } APP.render() })
};

PAGES.data = c => {
  const run = DATA.run || {};
  c.innerHTML = `<div class="grid two"><div class="card"><h3>Active model output</h3><table class="kv"><tr><td>Source</td><td>${DATA.daily ? (DATA.src === "uploaded" ? "Uploaded daily inference file" : "Bundled daily inference file") : "Saved LSTM v5 output (predicted_hotspots_v5.csv)"}</td></tr>${DATA.daily ? `<tr><td>Dates</td><td>${dateLabel(DATA.dates[0].key, true)} → ${dateLabel(DATA.dates[DATA.dates.length - 1].key, true)} (${DATA.dates.length})</td></tr><tr><td>Inference run</td><td>${esc(run.run_date || "—")}</td></tr><tr><td>Physics</td><td>${esc(run.physics_source || "Copernicus")}</td></tr><tr><td>Verified vs v5</td><td>${esc(run.verified_vs_v5 || "—")}</td></tr>` : ""}<tr><td>Grid cells</td><td>${fmtN(N)} scored · ${fmtN(G.master_cells.ALL)} master</td></tr></table>
  <h3 class="section">Load a new daily run</h3><p class="small">Run <code>notebooks/AQUA_STRAT_Daily_LSTM_Inference.ipynb</code> in Colab and load the <code>aquastrat_daily_predictions_*.zip</code> here. Every page switches to the new real model output.</p><input type="file" id="up" accept=".zip,.csv"><div id="upmsg" class="footer-note"></div>${DATA.src === "uploaded" ? '<button class="ghost section" id="upReset">Remove uploaded run</button>' : ""}</div>
  <div class="card"><h3>Export (${dateLabel(APP.date, true)} · ${APP.region})</h3><p><button class="primary" data-x="grid">⬇ Grid predictions + risk (CSV)</button></p><p><button class="ghost" data-x="hot">⬇ Top 500 hotspots (CSV)</button></p>${APP.role === "GOVERNMENT" ? '<p><button class="ghost" data-x="plan">⬇ GA cleanup plan + trips (CSV)</button></p>' : ""}<p><button class="ghost" data-x="sight">⬇ Sighting reports (CSV)</button></p></div></div>`;
  $("#up").onchange = e => uploadRun(e.target.files[0]); if ($("#upReset")) $("#upReset").onclick = () => { LS.del("aq_daily_upload"); location.reload() };
  $$("button[data-x]").forEach(b => b.onclick = () => exportCSV(b.dataset.x))
};
function dl(name, text) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 400) }
function exportCSV(k) {
  const D = APP.D(), ix = IDX[APP.region], tag = APP.region + "_" + APP.date;
  if (k === "grid") dl(`aquastrat_grid_${tag}.csv`, "grid_id,region,lat,lon,predicted_density,hotspot_tier,habitat_sensitivity,wildlife_exposure,risk_habitat,risk_wildlife,risk_combined,combined_risk_tier\n" + ix.map(i => [G.id[i], REG[G.r[i]], G.lat[i], G.lon[i], D.P[i].toFixed(6), TIER[D.tier[i]], G.H[i], G.W[i], D.rh[i].toFixed(6), D.rw[i].toFixed(6), D.rc[i].toFixed(6), TIER[D.rtier[i]]].join(",")).join("\n"));
  if (k === "hot") dl(`aquastrat_hotspots_${tag}.csv`, "rank,grid_id,region,lat,lon,predicted_density,tier\n" + ix.slice().sort((a, b) => D.P[b] - D.P[a]).slice(0, 500).map((i, n) => [n + 1, G.id[i], REG[G.r[i]], G.lat[i], G.lon[i], D.P[i].toFixed(6), TIER[D.tier[i]]].join(",")).join("\n"));
  if (k === "plan") { const p = APP.plan(); dl(`aquastrat_cleanup_plan_${tag}.csv`, "trip,vessel,stop,grid_id,region,lat,lon,predicted_density,port,start_day,trip_km\n" + p.trips.flatMap(t => t.stops.map((s, n) => [t.name, "V" + (t.v + 1), n + 1, G.id[s.i], s.region, G.lat[s.i], G.lon[s.i], s.p.toFixed(6), '"' + t.port.name + '"', t.start.toFixed(2), t.km.toFixed(1)].join(","))).join("\n")) }
  if (k === "sight") dl("aquastrat_sightings.csv", "id,when,place,lat,lon,cell,category,quantity,status,ai_objects,description\n" + LS.get(SIGHT_KEY, []).map(x => [x.id, x.when, '"' + x.place + '"', x.lat, x.lon, x.cell, '"' + x.cat + '"', '"' + (x.qty || "") + '"', x.status, x.ai ? x.ai.n : "", '"' + String(x.desc).replace(/"/g, "'") + '"'].join(",")).join("\n"))
}
async function uploadRun(f) {
  const msg = $("#upmsg"); if (!f) return; msg.textContent = "Reading " + f.name + "…";
  try {
    let text; if (/\.zip$/i.test(f.name)) text = await unzipCsv(await f.arrayBuffer()); else text = await f.text();
    const L_ = text.split(/\r?\n/), H = L_[0].split(",").map(s => s.trim()), id = H.indexOf("date"), ig = H.indexOf("grid_id"), ip = H.indexOf("predicted_density"), iph = H.indexOf("physics");
    if (id < 0 || ig < 0 || ip < 0) throw new Error("File needs columns date, grid_id, predicted_density");
    const pos = new Map(G.id.map((g, i) => [g, i])), dset = new Map(), phys = {};
    for (let q = 1; q < L_.length; q++) { const p = L_[q].split(","); if (p.length <= ip) continue; const i = pos.get(p[ig]); if (i == null) continue; if (!dset.has(p[id])) dset.set(p[id], new Uint16Array(N).fill(65535)); dset.get(p[id])[i] = Math.round(clamp(+p[ip], 0, 1.09) * 60000); if (iph >= 0) phys[p[id]] = p[iph].trim() }
    const dates = [...dset.keys()].sort(); if (!dates.length) throw new Error("No matching grid cells found");
    const all = new Uint16Array(dates.length * N); dates.forEach((d, j) => all.set(dset.get(d), j * N));
    const u8 = new Uint8Array(all.buffer); let s = ""; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
    const pack = { dates, physics: dates.map(d => phys[d] === "forecast" ? "forecast" : "analysis"), data: btoa(s), run: { run_date: new Date().toISOString().slice(0, 10), physics_source: "Copernicus (uploaded run)", verified_vs_v5: "see notebook output", file: f.name } };
    if (!LS.set("aq_daily_upload", pack)) throw new Error("Browser storage is full or blocked");
    msg.innerHTML = `<span class="ok-msg">✅ Loaded ${dates.length} dates (${dates[0]} → ${dates[dates.length - 1]}). Reloading…</span>`; setTimeout(() => location.reload(), 900)
  } catch (e) { msg.innerHTML = `<span class="err-msg">${esc(e.message)}</span>` }
}
async function unzipCsv(buf) { const u = new Uint8Array(buf), dv = new DataView(buf); let p = 0; while (p + 30 < u.length && dv.getUint32(p, true) === 0x04034b50) { const m = dv.getUint16(p + 8, true), cs = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), el = dv.getUint16(p + 28, true), name = new TextDecoder().decode(u.subarray(p + 30, p + 30 + nl)), st = p + 30 + nl + el, data = u.subarray(st, st + cs); if (/predictions.*\.csv$/i.test(name)) { if (m === 0) return new TextDecoder().decode(data); if (m === 8) return await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text() } p = st + cs } throw new Error("No predictions CSV inside the zip") }

PAGES.reports = c => {
  c.innerHTML = `<div class="card"><h3>Reports & Export</h3><p>Generate a role-appropriate report from the model outputs for <b>${REGN[APP.region]}</b> on <b>${dateLabel(APP.date, true)}</b>${APP.area ? ` including the area <b>${esc(APP.area.name)}</b>` : ""}.</p><button class="primary" id="rp">📄 Generate report (Print → Save as PDF)</button><div class="section notice">${APP.role === "GOVERNMENT" ? "Government reports are decision-support recommendations, not official government orders." : "Researcher reports support analysis and documentation."}</div></div>`;
  $("#rp").onclick = () => printDoc(reportHTML())
};
function reportHTML() {
  const D = APP.D(), S = regionStats(D, APP.region), hs = hotspotList(D, APP.region, 10, 150), regA = { name: REGN[APP.region], km: 0, cells: IDX[APP.region] }, p = APP.role === "GOVERNMENT" ? APP.plan() : null;
  return `<h1 style="color:#0b5c8e">AQUA-STRAT Decision-Support Report</h1><p>Ecosystem-Aware Marine Plastic Intervention Planning · MITE Moodabidri, Dept. of CS&E</p><p><b>Role:</b> ${APP.role} · <b>User:</b> ${esc(APP.user || "")} · <b>Region:</b> ${REGN[APP.region]} · <b>Model date:</b> ${dateLabel(APP.date, true)} · <b>Generated:</b> ${new Date().toLocaleString("en-IN")}</p><p><b>Data:</b> ${srcLine(D).replace(/<[^>]+>/g, "")}</p>
  <h3>Key figures</h3><table><tr><th>Metric</th><th>Value</th></tr><tr><td>Master grid cells</td><td>${fmtN(S.master)}</td></tr><tr><td>Scored cells</td><td>${fmtN(S.n)}</td></tr><tr><td>High / medium hotspot cells</td><td>${fmtN(S.hi)} / ${fmtN(S.med)}</td></tr><tr><td>High / medium ecological-risk cells</td><td>${fmtN(S.rhi)} / ${fmtN(S.rmed)}</td></tr><tr><td>Mean predicted density</td><td>${S.mean.toFixed(4)}</td></tr></table>
  <h3>Top hotspots</h3><table><tr><th>#</th><th>Grid</th><th>Lat</th><th>Lon</th><th>Density</th><th>Risk</th></tr>${hs.map((i, n) => `<tr><td>H${n + 1}</td><td>${G.id[i]}</td><td>${G.lat[i].toFixed(2)}</td><td>${G.lon[i].toFixed(2)}</td><td>${D.P[i].toFixed(4)}</td><td>${TIER[D.rtier[i]]}</td></tr>`).join("")}</table>
  <h3>Alerts</h3>${alertsFor(regA, D, REGN[APP.region]).map(a => `<p>• <b>${a[1]}</b> — ${a[2]}</p>`).join("")}
  ${APP.area ? `<h3>Area of interest: ${esc(APP.area.name)} (${APP.area.km} km)</h3>${alertsFor(APP.area, D).map(a => `<p>• <b>${a[1]}</b> — ${a[2]}</p>`).join("")}` : ""}
  ${p ? `<h3>GA cleanup plan</h3><p>${p.sel.length} sites · plastic index removed ${p.tot.removed.toFixed(3)} · cost ${fmtN(p.tot.cost)} units · disturbance ${p.tot.dist.toFixed(3)} · ${p.trips.length} trips · ${fmtN(toNM(p.routedKm))} NM (${fmtN(p.routedKm)} km) · ${p.days.toFixed(1)} days with ${p.prm.vessels} vessels</p><table><tr><th>Trip</th><th>Vessel</th><th>Route</th><th>NM</th></tr>${p.trips.map(t => `<tr><td>${t.name}</td><td>V${t.v + 1}</td><td>${esc(t.port.name)} → ${t.stops.map(s => G.id[s.i]).join(" → ")} → ${esc(t.port.name)}${tripLand(t).length ? " ⚠ crosses land" : ""}</td><td>${fmtN(toNM(t.km))}</td></tr>`).join("")}</table>${(() => { const n = p.trips.reduce((a, t) => a + tripLand(t).length, 0); return n ? `<p style="font-size:11px">⚠ ${n} route leg${n > 1 ? "s" : ""} pass over land on the straight great-circle line; real sea routes would be longer. 1 NM = 1.852 km.</p>` : "" })()}` : ""}
  <h3>Models</h3><p>Detection: YOLOv8m (P ${AQ_META.cnn.precision}, R ${AQ_META.cnn.recall}, mAP@50 ${AQ_META.cnn.map50}). Forecast: region-weighted LSTM v5 (pooled R² ${AQ_META.lstm_pooled.R2}). FDI: supporting satellite validation (ρ = ${AQ_META.fdi.rho}).</p>
  <p style="margin-top:18px"><i>Scientific note: model-assisted decision support from the project's trained models. FDI is a supporting validation layer. Not an official operational order.</i></p>`
}
function printDoc(html) { $("#printArea").innerHTML = `<div style="font-family:Segoe UI,Arial,sans-serif">${html}</div>`; setTimeout(() => window.print(), 50) }
