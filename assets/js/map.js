/* AQUA-STRAT map: Leaflet + fast canvas grid layer + route / area / hotspot overlays */
"use strict";
const RAMP = [[22, 132, 107], [120, 180, 90], [217, 139, 39], [214, 69, 69], [140, 20, 40]];
function rampColor(v, a) { v = clamp(v, 0, .999) * (RAMP.length - 1); const i = Math.floor(v), f = v - i, c = RAMP[i].map((x, k) => Math.round(x + (RAMP[i + 1][k] - x) * f)); return `rgba(${c[0]},${c[1]},${c[2]},${a == null ? .62 : a})` }
const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})` };

const GridLayer = L.Layer.extend({
  initialize(o) { this.o = o },
  onAdd(map) {
    this._map = map; const pane = map.getPane("gridPane") || map.createPane("gridPane"); pane.style.zIndex = 380; pane.style.pointerEvents = "none";
    this._c = L.DomUtil.create("canvas", "aq-grid", pane); this._c.style.position = "absolute";
    map.on("moveend zoomend resize viewreset", this.redraw, this); map.on("zoomstart", this._hide, this); this.redraw()
  },
  onRemove(map) { L.DomUtil.remove(this._c); map.off("moveend zoomend resize viewreset", this.redraw, this); map.off("zoomstart", this._hide, this) },
  _hide() { this._c.style.opacity = 0 },
  redraw() {
    const m = this._map; if (!m) return; const sz = m.getSize(), dpr = Math.min(2, window.devicePixelRatio || 1), c = this._c, o = this.o;
    c.width = sz.x * dpr; c.height = sz.y * dpr; c.style.width = sz.x + "px"; c.style.height = sz.y + "px"; c.style.opacity = 1;
    L.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
    const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, sz.x, sz.y);
    const D = o.D(); if (!D) return; const ix = IDX[o.region()], mode = o.mode(), sp = G.spacing, z = m.getZoom();
    const fdi = mode === "fdi" && window.AQ_FDI ? new Map(AQ_FDI.idx.map((x, k) => [x, AQ_FDI.fdi_mean[k]])) : null;
    for (const i of ix) {
      const [dn, dl] = sp[REG[G.r[i]]], a = m.latLngToContainerPoint([G.lat[i] + dn / 2, G.lon[i] - dl / 2]), b = m.latLngToContainerPoint([G.lat[i] - dn / 2, G.lon[i] + dl / 2]);
      if (b.x < 0 || b.y < 0 || a.x > sz.x || a.y > sz.y) continue;
      let col;
      if (mode === "tier") col = hexA(TIERC[D.tier[i]], D.tier[i] === 0 ? .32 : .62);
      else if (mode === "density") col = rampColor((D.P[i] - D.pmin) / ((D.pmax - D.pmin) || 1));
      else if (mode === "risk") col = D.rc[i] > 0 ? hexA(TIERC[D.rtier[i]], .7) : "rgba(22,132,107,.18)";
      else if (mode === "plan") col = hexA(TIERC[D.tier[i]], D.tier[i] === 2 ? .26 : .09);
      else if (mode === "fdi") { const f = fdi && fdi.get(i); col = f == null ? "rgba(100,116,139,.10)" : (f > 0 ? `rgba(249,115,22,${clamp(.35 + f * 90, .35, .95)})` : `rgba(59,130,246,${clamp(.35 - f * 60, .35, .9)})`) }
      g.fillStyle = col; g.fillRect(a.x, a.y, Math.max(1, b.x - a.x + .6), Math.max(1, b.y - a.y + .6))
    }
    const hl = o.highlight && o.highlight(); if (hl && hl.length) { g.strokeStyle = "rgba(180,120,0,.85)"; g.lineWidth = 1.2; for (const i of hl) { const [dn, dl] = sp[REG[G.r[i]]], a = m.latLngToContainerPoint([G.lat[i] + dn / 2, G.lon[i] - dl / 2]), b = m.latLngToContainerPoint([G.lat[i] - dn / 2, G.lon[i] + dl / 2]); g.strokeRect(a.x + .5, a.y + .5, b.x - a.x - 1, b.y - a.y - 1) } }
    const cwpx = (() => { const i0 = ix[0]; if (i0 == null) return 0; const [dn, dl] = sp[REG[G.r[i0]]], a = m.latLngToContainerPoint([G.lat[i0], G.lon[i0]]), b = m.latLngToContainerPoint([G.lat[i0], G.lon[i0] + dl]); return b.x - a.x })(); if (cwpx > 66) { g.fillStyle = "rgba(15,40,60,.75)"; g.font = "10px Segoe UI,sans-serif"; for (const i of ix) { const [dn, dl] = sp[REG[G.r[i]]], a = m.latLngToContainerPoint([G.lat[i] + dn / 2, G.lon[i] - dl / 2]); if (a.x < -60 || a.y < -20 || a.x > sz.x || a.y > sz.y) continue; g.fillText(G.id[i], a.x + 3, a.y + 12) } }
    const s = o.selected && o.selected(); if (s != null && s >= 0) { const [dn, dl] = sp[REG[G.r[s]]], a = m.latLngToContainerPoint([G.lat[s] + dn / 2, G.lon[s] - dl / 2]), b = m.latLngToContainerPoint([G.lat[s] - dn / 2, G.lon[s] + dl / 2]); g.strokeStyle = "#0b5c8e"; g.lineWidth = 3; g.strokeRect(a.x - 2, a.y - 2, b.x - a.x + 4, b.y - a.y + 4) }
  }
});

function makeMap(el, opt) {
  const map = L.map(el, { preferCanvas: false, zoomControl: true, worldCopyJump: false, minZoom: 3, maxZoom: 11 });
  map.createPane("landPane").style.zIndex = 150;
  L.geoJSON(AQ_LAND, { pane: "landPane", interactive: false, style: { color: "#9db3c2", weight: .8, fillColor: "#eef2ef", fillOpacity: 1 } }).addTo(map);
  // Esri basemaps: free, no API key, work when the app is opened directly from a folder (file://)
  const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  const ocean = L.layerGroup([
    L.tileLayer(ESRI + "Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 13, maxNativeZoom: 13, attribution: "Basemap © Esri, GEBCO, NOAA, Garmin, HERE" }),
    L.tileLayer(ESRI + "Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 13, maxNativeZoom: 13 })]);
  const gray = L.layerGroup([
    L.tileLayer(ESRI + "Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, maxNativeZoom: 16, attribution: "Basemap © Esri, HERE, Garmin" }),
    L.tileLayer(ESRI + "Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, maxNativeZoom: 16 })]);
  const sat = L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, maxNativeZoom: 18, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" });
  const onErr = () => { if (!map._offNote) { map._offNote = true; const n = L.DomUtil.create("div", "basemap-note", map.getContainer()); n.textContent = "Offline basemap (coastline) — connect to the internet for detailed map tiles" } };
  [ocean, gray].forEach(g => g.eachLayer(t => t.on("tileerror", onErr))); sat.on("tileerror", onErr);
  const pref = (() => { try { return localStorage.getItem("aq_basemap") } catch (e) { return null } })();
  (pref === "gray" ? gray : pref === "sat" ? sat : ocean).addTo(map);
  L.control.layers({ "Ocean": ocean, "Light grey": gray, "Satellite": sat }, null, { position: "topleft", collapsed: true }).addTo(map);
  map.on("baselayerchange", e => { try { localStorage.setItem("aq_basemap", e.name === "Light grey" ? "gray" : e.name === "Satellite" ? "sat" : "ocean") } catch (er) { } });
  const st = { mode: opt.mode || "tier", sel: null, hl: [] };
  const grid = new GridLayer({ D: () => APP.D(), region: () => APP.region, mode: () => st.mode, selected: () => st.sel, highlight: () => st.hl }); grid.addTo(map);
  const over = L.layerGroup().addTo(map), routes = L.layerGroup().addTo(map), area = L.layerGroup().addTo(map); const zoneL = L.layerGroup().addTo(map), fdiL = L.layerGroup().addTo(map);
  map.createPane("routePane").style.zIndex = 620; map.createPane("markPane").style.zIndex = 640;
  const svgR = L.svg({ pane: "routePane", padding: .5 });
  const tip = L.DomUtil.create("div", "", map.getContainer()); tip.style.cssText = "position:absolute;z-index:700;pointer-events:none;background:#071a2b;color:#fff;padding:5px 8px;border-radius:7px;font-size:12px;display:none;white-space:nowrap";
  map.on("mousemove", e => {
    const i = cellAt(e.latlng.lat, e.latlng.lng); if (i < 0 || (APP.region !== "ALL" && REG[G.r[i]] !== APP.region)) { tip.style.display = "none"; return }
    const D = APP.D(); tip.innerHTML = `<b>${G.id[i]}</b> · density ${D.P[i].toFixed(4)} · ${TIER[D.tier[i]]}${st.mode === "risk" ? ` · risk ${D.rc[i].toFixed(4)}` : ""}`;
    tip.style.display = "block"; tip.style.left = (e.containerPoint.x + 14) + "px"; tip.style.top = (e.containerPoint.y + 12) + "px"
  });
  map.on("mouseout", () => tip.style.display = "none");
  map.on("click", e => { const i = cellAt(e.latlng.lat, e.latlng.lng); if (opt.onClick) opt.onClick(i, e.latlng) });
  const api = {
    map, grid,
    setMode(m) { st.mode = m; grid.redraw() },
    redraw() { grid.redraw() },
    select(i) { st.sel = i; grid.redraw() },
    highlight(cells) { st.hl = cells || []; grid.redraw() },
    fitRegion(reg) { const ix = IDX[reg || "ALL"]; let a = 90, b = -90, c = 360, d = -360; for (const i of ix) { a = Math.min(a, G.lat[i]); b = Math.max(b, G.lat[i]); c = Math.min(c, G.lon[i]); d = Math.max(d, G.lon[i]) } map.fitBounds([[a, c], [b, d]], { padding: [10, 10] }) },
    clearOver() { over.clearLayers() },
    hotspots(list) { list.forEach((i, n) => L.marker([G.lat[i], G.lon[i]], { pane: "markPane", icon: L.divIcon({ className: "", html: `<div class="hs-ic">H${n + 1}</div>`, iconSize: [30, 16], iconAnchor: [-6, 8] }) }).bindTooltip(`Hotspot H${n + 1} · ${G.id[i]}`).addTo(over)) },
    marker(lat, lon, html, tipText) { const mk = L.marker([lat, lon], { pane: "markPane", icon: L.divIcon({ className: "", html, iconSize: null }) }); if (tipText) mk.bindTooltip(tipText); mk.addTo(over); return mk },
    area(A) {
      area.clearLayers(); if (!A) { st.hl = []; grid.redraw(); return }
      L.circle([A.lat, A.lon], { radius: A.km * 1000, color: "#b47800", weight: 2, dashArray: "7 6", fillColor: "#fde68a", fillOpacity: .08, interactive: false }).addTo(area);
      L.marker([A.lat, A.lon], { pane: "markPane", icon: L.divIcon({ className: "", html: '<div class="area-ic"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).bindTooltip("📍 " + A.name, { permanent: true, direction: "right", offset: [10, 0], className: "" }).addTo(area);
      st.hl = A.cells || []; grid.redraw()
    },
    routes(plan, hi) { routes.clearLayers(); if (plan) drawRoutes(map, routes, svgR, plan, hi) },
    zones(Z, labelN) {
      zoneL.clearLayers(); if (!Z) return;
      Z.forEach((z, k) => {
        const tip = `<b>High-risk zone ${z.n}</b><br>${esc(z.name)}<br>${z.cells.length} high-risk cells · ${fmtN(z.area)} km²<br>mean predicted density ${z.meanP.toFixed(4)}`;
        L.polyline(z.segs, { color: "#7a0f1c", weight: 2.6, opacity: .95 }).bindTooltip(tip, { sticky: true }).addTo(zoneL);
        if (k < (labelN == null ? 6 : labelN)) L.marker([z.lat, z.lon], { pane: "markPane", icon: L.divIcon({ className: "", html: `<div class="zone-ic">Zone ${z.n} · ${esc(z.name)} · ${fmtN(z.area)} km²</div>`, iconSize: null, iconAnchor: [-6, 10] }) }).bindTooltip(tip).addTo(zoneL)
      })
    },
    fdi(on) {
      fdiL.clearLayers(); if (!on || !window.AQ_FDI) return 0; let n = 0;
      AQ_FDI.idx.forEach((i, k) => {
        const f = AQ_FDI.fdi_mean[k]; if (!(f > 0) || (APP.region !== "ALL" && REG[G.r[i]] !== APP.region)) return; n++;
        L.circleMarker([G.lat[i], G.lon[i]], { pane: "markPane", radius: 8, color: "#b45309", weight: 3, fillColor: "#fde047", fillOpacity: .85 })
          .bindTooltip(`<b>Sentinel-2 debris-like signal</b><br>${G.id[i]} · FDI mean ${f.toFixed(5)} (${AQ_FDI.n_tiles[k]} tile${AQ_FDI.n_tiles[k] > 1 ? "s" : ""})<br>LSTM density ${APP.D().P[i].toFixed(4)}`).addTo(fdiL)
      }); return n
    },
    destroy() { try { map.stop() } catch (e) { } map.remove() }
  };
  return api
}
/* ---- routes: one colour per vessel trip, curved legs, arrowheads, stop numbers, animated flow ---- */
const TRIPC = ["#0f8b8d", "#d64545", "#7c3aed", "#d98b27", "#0b5c8e", "#db2777", "#16a34a", "#b45309", "#0891b2", "#9333ea", "#ca8a04", "#475569"];
function curvePts(map, a, b, bendFrac) {
  const pa = map.project(a, 6), pb = map.project(b, 6), dx = pb.x - pa.x, dy = pb.y - pa.y, L_ = Math.hypot(dx, dy) || 1, k = Math.min(L_ * bendFrac, 60);
  const cx = (pa.x + pb.x) / 2 - dy / L_ * k, cy = (pa.y + pb.y) / 2 + dx / L_ * k, out = [];
  for (let t = 0; t <= 1.0001; t += .05) { const x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx + t * t * pb.x, y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy + t * t * pb.y; out.push(map.unproject([x, y], 6)) }
  const t = .55, x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx + t * t * pb.x, y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy + t * t * pb.y,
    tx = 2 * (1 - t) * (cx - pa.x) + 2 * t * (pb.x - cx), ty = 2 * (1 - t) * (cy - pa.y) + 2 * t * (pb.y - cy);
  return { pts: out, mid: map.unproject([x, y], 6), ang: Math.atan2(ty, tx) * 180 / Math.PI + 90, len: L_ }
}
function drawRoutes(map, grp, svgR, plan, hi) {
  plan.trips.forEach((tr, k) => {
    const dim = hi != null && hi >= 0 && hi !== k, op = dim ? .15 : 1, col = tr.col;
    const P = [[tr.port.lat, tr.port.lon], ...tr.stops.map(s => [G.lat[s.i], G.lon[s.i]]), [tr.port.lat, tr.port.lon]];
    for (let m = 0; m < P.length - 1; m++) {
      const ret = m === P.length - 2, c = curvePts(map, L.latLng(P[m]), L.latLng(P[m + 1]), .14);
      L.polyline(c.pts, { renderer: svgR, color: "#0b2236", weight: ret ? 4 : 6, opacity: .55 * op, interactive: false }).addTo(grp);
      L.polyline(c.pts, { renderer: svgR, color: col, weight: ret ? 2.2 : 3.4, opacity: (ret ? .75 : 1) * op, dashArray: ret ? "7 7" : null }).bindTooltip(`Trip ${tr.name} · leg ${m + 1}${ret ? " (return to port)" : ""} · vessel V${tr.v + 1}`, { sticky: true }).addTo(grp);
      if (!ret && !dim) L.polyline(c.pts, { renderer: svgR, color: "#fff", weight: 2.2, opacity: .9, className: "route-flow", interactive: false }).addTo(grp);
      if (tripLand(tr).includes(m)) L.marker(c.mid, { pane: "markPane", icon: L.divIcon({ className: "", html: `<div class="land-ic" style="opacity:${op}">⚠</div>`, iconSize: [20, 20], iconAnchor: [10, 22] }) }).bindTooltip(`<b>⚠ Trip ${tr.name}, leg ${m + 1} crosses land</b><br>Distance is a straight great-circle estimate; a real sea route around the land would be longer.`).addTo(grp);
      if (c.len > 18) L.marker(c.mid, { pane: "markPane", interactive: false, icon: L.divIcon({ className: "arrow-ic", html: `<div style="--c:${col};opacity:${op};transform:translate(-7px,-7px) rotate(${c.ang}deg)"></div>`, iconSize: [0, 0] }) }).addTo(grp)
    }
    tr.stops.forEach((s, n) => L.marker([G.lat[s.i], G.lon[s.i]], { pane: "markPane", opacity: op, icon: L.divIcon({ className: "", html: `<div class="stop-ic" style="--c:${col}">${n + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) })
      .bindTooltip(`<b>${tr.name} · stop ${n + 1}/${tr.stops.length}</b><br>${G.id[s.i]} · density ${s.p.toFixed(4)}<br>from ⚓ ${tr.port.name} · vessel V${tr.v + 1}`).addTo(grp));
  });
  const ports = new Map(); plan.trips.forEach(t => { const e = ports.get(t.port.name) || { p: t.port, n: 0 }; e.n++; ports.set(t.port.name, e) });
  ports.forEach(({ p, n }) => L.marker([p.lat, p.lon], { pane: "markPane", icon: L.divIcon({ className: "", html: `<div class="port-ic">⚓ ${esc(p.name)} · ${n} trip${n > 1 ? "s" : ""}</div>`, iconSize: null, iconAnchor: [0, 10] }) }).addTo(grp))
}
