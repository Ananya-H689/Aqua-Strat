/* AQUA-STRAT place search: offline coastal gazetteer (2,400+ towns & beaches) + grid IDs + coordinates + online geocoding fallback */
"use strict";
const PLACES = AQ_PLACES.map(p => ({ name: p[0], lat: p[1], lon: p[2], state: p[3], country: p[4], kind: p[5], key: normName(p[0]) }));
const STOPW = /\b(beach|beaches|port|harbour|harbor|city|town|village|coast|district|near|the|sea|shore|jetty|lighthouse)\b/g;
const ALIAS = { vizag: "visakhapatnam", vishakhapatnam: "visakhapatnam", bombay: "mumbai", madras: "chennai", calicut: "kozhikode", cochin: "kochi", ernakulam: "kochi", mangalore: "mangaluru", trivandrum: "thiruvananthapuram", pondicherry: "puducherry", pondy: "puducherry", tuticorin: "thoothukudi", alleppey: "alappuzha", panjim: "panaji", calcutta: "kolkata", quilon: "kollam", cannanore: "kannur", vizianagaram: "vizianagaram", rk: "rk", baroda: "vadodara" };
function aliasQ(s) { return s.split(" ").map(w => ALIAS[w] || w).join(" ") }
function normName(s) { return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim() }
function lev(a, b) { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++)d[0][j] = j; for (let i = 1; i <= a.length; i++)for (let j = 1; j <= b.length; j++)d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length] }
function inStudyArea(lat, lon) { const [c, d] = nearestCell(lat, lon); return { ok: d <= 150, cell: c, km: d } }
function localSearch(q, limit) {
  q = (q || "").trim(); if (!q) return [];
  const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (m) { const la = +m[1], lo = +m[2]; if (Math.abs(la) <= 90 && Math.abs(lo) <= 180) return [{ name: `${la.toFixed(3)}°, ${lo.toFixed(3)}°`, lat: la, lon: lo, sub: "Coordinates", src: "coord" }] }
  const gid = q.toUpperCase().replace(/\s/g, ""); const gi = G.id.indexOf(gid);
  if (/^(AS|BOB|IO)_\d+$/.test(gid)) return gi >= 0 ? [{ name: gid, lat: G.lat[gi], lon: G.lon[gi], sub: "Grid cell · " + REGN[REG[G.r[gi]]], src: "grid", cell: gi }] : [];
  const full = aliasQ(normName(q)), core = full.replace(STOPW, " ").replace(/\s+/g, " ").trim() || full, wantBeach = /beach/.test(full);
  const sc = [];
  for (const p of PLACES) {
    let s = 0;
    if (p.key === full) s = 100; else if (p.key === core) s = 95; else if (p.key.startsWith(core)) s = 80 - (p.key.length - core.length) * .2;
    else if (p.key.includes(core) && core.length >= 3) s = 60; else if (core.length >= 5) { const pk = p.key.replace(STOPW, " ").trim(), d = lev(core, pk); if (d <= 2) s = 50 - d * 10 }
    if (!s) { const toks = core.split(" ").filter(t => t.length >= 2), pw = p.key.split(" "); const hit = toks.filter(t => pw.includes(t) || (t.length >= 5 && pw.some(w => w.startsWith(t)))).length; if (hit && toks.length > 1) s = 35 + 25 * hit / toks.length }
    if (s && wantBeach && p.kind === "beach") s += 8;
    if (s) sc.push([s, p])
  }
  sc.sort((a, b) => b[0] - a[0]);
  const seen = new Set(), out = [];
  for (const [s, p] of sc) { const k = p.name + p.state; if (seen.has(k)) continue; seen.add(k); out.push({ name: p.name, lat: p.lat, lon: p.lon, sub: [p.kind === "beach" ? "Beach" : "Town", p.state, p.country].filter(Boolean).join(" · "), src: "local", score: s }); if (out.length >= (limit || 8)) break }
  return out
}
async function onlineSearch(q) {
  const tries = [
    async (sg) => { const r = await fetch("https://photon.komoot.io/api/?limit=6&lat=12&lon=80&q=" + encodeURIComponent(q), { signal: sg }); const j = await r.json(); return (j.features || []).map(f => ({ name: f.properties.name || q, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], sub: [f.properties.osm_value, f.properties.state, f.properties.country].filter(Boolean).join(" · "), src: "online" })) },
    async (sg) => { const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=6&q=" + encodeURIComponent(q), { signal: sg }); const j = await r.json(); return j.map(x => ({ name: x.display_name.split(",")[0], lat: +x.lat, lon: +x.lon, sub: x.display_name.split(",").slice(1, 4).join(","), src: "online" })) },
  ];
  for (const t of tries) { try { const ctrl = new AbortController(), tm = setTimeout(() => ctrl.abort(), 6000); const r = await t(ctrl.signal); clearTimeout(tm); if (r.length) return r } catch (e) { } }
  return null
}
/* attach autocomplete to an input; onPick(result) */
function attachSearch(input, onPick, opts) {
  const box = document.createElement("div"); box.className = "suggest hidden"; input.parentElement.appendChild(box); let items = [], act = -1;
  const show = list => { items = list; act = -1; if (!list.length) { box.classList.add("hidden"); return } box.innerHTML = list.map((r, k) => `<div data-k="${k}"><b>${esc(r.name)}</b><br><small>${esc(r.sub || "")}</small></div>`).join(""); box.classList.remove("hidden"); box.querySelectorAll("div").forEach(d => d.onmousedown = e => { e.preventDefault(); pick(items[+d.dataset.k]) }) };
  const pick = r => { box.classList.add("hidden"); input.value = r.name; onPick(r) };
  input.addEventListener("input", () => show(localSearch(input.value, 8)));
  input.addEventListener("blur", () => setTimeout(() => box.classList.add("hidden"), 150));
  input.addEventListener("keydown", async e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { if (!items.length) return; e.preventDefault(); act = (act + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; box.querySelectorAll("div").forEach((d, k) => d.classList.toggle("act", k === act)); return }
    if (e.key === "Enter") { e.preventDefault(); if (act >= 0 && items[act]) return pick(items[act]); runSearch(input.value) }
    if (e.key === "Escape") box.classList.add("hidden")
  });
  async function runSearch(q) {
    q = (q || "").trim(); if (!q) return;
    const loc = localSearch(q, 8); if (loc.length && (loc[0].score >= 80 || loc[0].src !== "local")) return pick(loc[0]);
    if (opts && opts.status) opts.status(`Searching online for “${esc(q)}”…`);
    const on = await onlineSearch(q);
    if (!input.isConnected) return; // user moved to another page while the online lookup was running
    if (on && on.length) { const ok = on.filter(r => inStudyArea(r.lat, r.lon).ok); if (ok.length) { if (opts && opts.status) opts.status(""); return ok.length === 1 ? pick(ok[0]) : show(ok) } if (opts && opts.status) return opts.status(`“${esc(q)}” was found but lies outside the AQUA-STRAT ocean grid (${esc(on[0].sub || "")}).`) }
    if (loc.length) { if (opts && opts.status) opts.status(""); return show(loc) }
    if (opts && opts.status) opts.status(on === null ? `No offline match for “${esc(q)}” and the online search is unreachable. Try a nearby town, a grid ID (AS_00120) or lat,lon.` : `No place called “${esc(q)}” found.`)
  }
  return { run: runSearch }
}
