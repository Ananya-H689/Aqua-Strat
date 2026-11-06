/* AQUA-STRAT plastic detector — the trained YOLOv8m checkpoint (aqua_strat_best_v7) running in the browser (ONNX Runtime Web / WebAssembly) */
"use strict";
const DET = { sess: null, loading: null };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Missing file: " + src)); document.head.appendChild(s) }) }
async function gunzipB64(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++)u[i] = bin.charCodeAt(i); return new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()) }
async function detLoad(progress) {
  if (DET.sess) return DET.sess; if (DET.loading) return DET.loading;
  DET.loading = (async () => {
    if (!window.DecompressionStream) throw new Error("Please open AQUA-STRAT in Chrome or Edge to use the AI detector.");
    progress && progress("Loading AI engine…", 10); if (!window.ort) await loadScript("models/ort.wasm.min.js");
    if (!window.AQ_WASM) await loadScript("models/aq_engine.js");
    const wb = URL.createObjectURL(new Blob([await gunzipB64(AQ_WASM)], { type: "application/wasm" }));
    ort.env.wasm.wasmPaths = { "ort-wasm-simd.wasm": wb, "ort-wasm.wasm": wb }; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    progress && progress("Loading trained YOLOv8m weights (aqua_strat_best_v7)…", 40); if (!window.AQ_MODEL) await loadScript("models/aq_yolov8m_int8.js");
    const m = await gunzipB64(AQ_MODEL); progress && progress("Initialising model…", 75);
    DET.sess = await ort.InferenceSession.create(m, { executionProviders: ["wasm"], graphOptimizationLevel: "all" }); window.AQ_MODEL = null; return DET.sess
  })();
  try { return await DET.loading } catch (e) { DET.loading = null; throw e }
}
function readImage(file) { return new Promise((res, rej) => { if (!file || !/^image\//.test(file.type)) return rej(new Error("Please choose an image file (JPG / PNG).")); if (file.size > 20e6) return rej(new Error("Image is larger than 20 MB.")); const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Could not read that image.")); im.src = URL.createObjectURL(file) }) }
async function detect(im, conf, progress) {
  const s = await detLoad(progress); progress && progress("Detecting plastic…", 90); await new Promise(r => setTimeout(r, 20));
  const S = 640, r = Math.min(S / im.naturalWidth, S / im.naturalHeight), nw = Math.round(im.naturalWidth * r), nh = Math.round(im.naturalHeight * r), px = (S - nw) / 2, py = (S - nh) / 2;
  const c = document.createElement("canvas"); c.width = c.height = S; const g = c.getContext("2d"); g.fillStyle = "rgb(114,114,114)"; g.fillRect(0, 0, S, S); g.drawImage(im, px, py, nw, nh);
  const d = g.getImageData(0, 0, S, S).data, NN = S * S, x = new Float32Array(3 * NN); for (let i = 0; i < NN; i++) { x[i] = d[i * 4] / 255; x[NN + i] = d[i * 4 + 1] / 255; x[2 * NN + i] = d[i * 4 + 2] / 255 }
  const t0 = performance.now(), out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", x, [1, 3, S, S]) }), o = out[s.outputNames[0]].data, A = o.length / 5;
  return { raw: { o, A, r, px, py }, ms: performance.now() - t0, boxes: post({ o, A, r, px, py }, im, conf || .25) }
}
function post(R, im, conf) {
  const { o, A, r, px, py } = R, c = []; for (let i = 0; i < A; i++) { const sc = o[4 * A + i]; if (sc < conf) continue; const w = o[2 * A + i], h = o[3 * A + i]; c.push({ x: (o[i] - w / 2 - px) / r, y: (o[A + i] - h / 2 - py) / r, w: w / r, h: h / r, s: sc }) }
  c.sort((a, b) => b.s - a.s); const k = [], iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)), I = ix * iy; return I / (a.w * a.h + b.w * b.h - I) };
  for (const b of c) { if (k.length >= 100) break; if (k.every(q => iou(q, b) < .45)) k.push(b) }
  const W = im.naturalWidth, H = im.naturalHeight; k.forEach(b => { b.x = clamp(b.x, 0, W); b.y = clamp(b.y, 0, H); b.w = Math.min(b.w, W - b.x); b.h = Math.min(b.h, H - b.y) }); return k
}
function detCanvas(im, boxes, maxW) {
  const sc = Math.min(1, maxW / im.naturalWidth), c = document.createElement("canvas"); c.width = Math.round(im.naturalWidth * sc); c.height = Math.round(im.naturalHeight * sc); const g = c.getContext("2d"); g.drawImage(im, 0, 0, c.width, c.height);
  const lw = Math.max(2, c.width / 260), fs = Math.max(12, c.width / 40); g.font = `bold ${fs}px Segoe UI,sans-serif`;
  (boxes || []).forEach(b => { const x = b.x * sc, y = b.y * sc, w = b.w * sc, h = b.h * sc, col = b.s >= .6 ? "#d64545" : b.s >= .4 ? "#d98b27" : "#eab308"; g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(x, y, w, h); const t = "plastic " + b.s.toFixed(2), tw = g.measureText(t).width + 8, ty = y > fs + 4 ? y - fs - 4 : y; g.fillStyle = col; g.fillRect(x, ty, tw, fs + 4); g.fillStyle = "#fff"; g.fillText(t, x + 4, ty + fs) });
  return c
}
function detSummary(im, boxes) { const n = boxes.length, cov = Math.min(100, boxes.reduce((s, b) => s + b.w * b.h, 0) / (im.naturalWidth * im.naturalHeight) * 100); return { n, top: n ? boxes[0].s : 0, mean: n ? boxes.reduce((s, b) => s + b.s, 0) / n : 0, cov, level: !n ? "None" : cov > 25 || n >= 8 ? "High" : cov > 8 || n >= 3 ? "Medium" : "Low" } }
