/* AQUA-STRAT application shell */
"use strict";
const APP = {
  role: "PUBLIC", user: "", region: "ALL", date: null, page: "overview", area: null, selCell: null, mapObj: null, view: null, hiTrip: -1,
  planPrm: Object.assign({}, PLAN_DEFAULT), planCache: new Map(),
  D() { return day(this.date) },
  plan() { const k = this.date + "|" + JSON.stringify(this.planPrm); if (!this.planCache.has(k)) { this.planCache.set(k, runPlan(this.D(), this.planPrm)); if (this.planCache.size > 8) this.planCache.delete(this.planCache.keys().next().value) } return this.planCache.get(k) },
  enter(role, name) {
    this.role = role; this.user = name || ""; SS.set("aq_session", Object.assign(SS.get("aq_session", {}), { role, name: this.user }));
    $("#landing").style.display = "none"; $("#app").style.display = "block";
    $("#rolePill").textContent = role + (name && role !== "PUBLIC" ? " · " + name : "");
    $("#nav").innerHTML = NAVS[role].map(p => `<button id="nav-${p}" data-p="${p}">${LABELS[p]}</button>`).join("");
    $$("#nav button").forEach(b => b.onclick = () => this.go(b.dataset.p));
    this.planPrm.scope = this.region; this.go(NAVS[role].includes(this.page) ? this.page : "overview")
  },
  go(p) { this.page = p; this.hiTrip = -1; $$("#nav button").forEach(b => b.classList.toggle("active", b.dataset.p === p)); SS.set("aq_page", p); this.render() },
  render() {
    const c = $("#content"); $("#pageTitle").textContent = LABELS[this.page]; this.onPaste = null; this.cellPanel = null;
    const D = this.D(); $("#subtitle").innerHTML = `${REGN[this.region]} · ${dateLabel(this.date, true)} · ${DATA.daily ? (D.info.physics === "forecast" ? "LSTM on Copernicus forecast physics" : "LSTM on Copernicus analysis physics") : "LSTM v5 output"}`;
    try { PAGES[this.page](c) } catch (e) { console.error(e); c.innerHTML = `<div class="card danger"><b>Could not load this module.</b><p>${esc(e.message)}</p></div>` }
    window.scrollTo(0, 0)
  },
  setDate(k) { this.date = k; $("#dateSel").value = k; this.render() },
  updateChip() { const ch = $("#areaChip"); if (this.area) { ch.innerHTML = `📍 ${esc(this.area.name)} · ${this.area.km} km &nbsp;✕`; ch.classList.remove("hidden"); ch.title = "Click to clear the selected area" } else ch.classList.add("hidden") }
};
function fillDates() {
  $("#dateSel").innerHTML = DATA.dates.map(d => `<option value="${d.key}">${dateLabel(d.key, true)}${d.physics === "forecast" ? " · forecast" : ""}</option>`).join("");
  $("#dateSel").value = APP.date
}
function sideFoot() {
  $("#sideFoot").innerHTML = DATA.daily ? `Model data: LSTM v5 daily inference<br>${dateLabel(DATA.dates[0].key)} – ${dateLabel(DATA.dates[DATA.dates.length - 1].key, true)}<br>Copernicus ocean physics` : `Model data: ${esc(AQ_LSTM.base.label)}`
}
window.addEventListener("DOMContentLoaded", () => {
  initData(); APP.date = defaultDate(); fillDates(); sideFoot(); wireAuth();
  $("#landingData").innerHTML = DATA.daily ? `🛰️ LSTM daily predictions available: ${dateLabel(DATA.dates[0].key)} → ${dateLabel(DATA.dates[DATA.dates.length - 1].key, true)}` : `📊 ${esc(AQ_LSTM.base.label)}`;
  $("#btnPublic").onclick = () => APP.enter("PUBLIC");
  $("#btnResearcher").onclick = () => openLogin("RESEARCHER");
  $("#btnGovernment").onclick = () => openLogin("GOVERNMENT");
  $("#btnExit").onclick = () => { if (APP.mapObj) { APP.mapObj.destroy(); APP.mapObj = null } SS.del("aq_session"); SS.del("aq_page"); APP.area = null; APP.selCell = null; APP.updateChip(); $("#app").style.display = "none"; $("#landing").style.display = "flex" };
  $("#dateSel").onchange = e => APP.setDate(e.target.value);
  $("#region").onchange = e => { APP.region = e.target.value; APP.planPrm.scope = APP.region; APP.view = null; APP.render() };
  $("#areaChip").onclick = () => { APP.area = null; APP.updateChip(); if (APP.mapObj) APP.mapObj.area(null); APP.render() };
  document.addEventListener("paste", e => { if (APP.onPaste) APP.onPaste(e) });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { $("#loginModal").classList.add("hidden"); $("#registerModal").classList.add("hidden") } });
  const s = SS.get("aq_session", null); if (s && s.role) { APP.page = SS.get("aq_page", "overview"); APP.enter(s.role, s.name) }
});
