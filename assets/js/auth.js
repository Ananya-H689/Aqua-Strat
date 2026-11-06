/* AQUA-STRAT authentication: verified role IDs, official e-mail domains, hashed passwords (local accounts). */
"use strict";
/* SHA-256 (synchronous, works on file:// without a secure-context requirement) */
function sha256(str) {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const bytes = new TextEncoder().encode(str), l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(nb - 4, (l * 8) >>> 0); dv.setUint32(nb - 8, Math.floor(l / 0x20000000));
  let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const w = new Uint32Array(64), r = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < nb; o += 64) {
    for (let i = 0; i < 16; i++)w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = r(w[i - 15], 7) ^ r(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = r(w[i - 2], 17) ^ r(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0 }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) { const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0, S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0 }
    h = h.map((x, i) => (x + [a, b, c, d, e, f, g, hh][i]) | 0)
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("")
}

const AUTH = {
  /* Government: ID must be issued (authorised registry) + official .gov.in / nic.in e-mail */
  GOV_RE: /^GOV-(AN|AP|GA|GJ|KA|KL|LD|MH|OD|PY|TN|WB|IN)-(FIS|ENV|MOE|CGD|PRT|CZM)-\d{4}$/,
  GOV_REGISTRY: new Set(["GOV-KA-FIS-1001", "GOV-KA-FIS-1002", "GOV-KA-ENV-1101", "GOV-KL-FIS-2001", "GOV-KL-ENV-2101", "GOV-AP-ENV-3001", "GOV-TN-FIS-4001", "GOV-OD-ENV-5001", "GOV-WB-ENV-6001", "GOV-GJ-FIS-7001", "GOV-MH-CZM-8001", "GOV-GA-ENV-8101", "GOV-AN-ENV-8201", "GOV-IN-MOE-9001", "GOV-IN-CGD-9101"].map(sha256)),
  GOV_MAIL: /^[^\s@]+@([a-z0-9-]+\.)*(gov\.in|nic\.in)$/i,
  /* Researcher: ORCID iD (ISO 7064 MOD 11-2 checksum) or VTU university seat number (USN) + academic e-mail */
  USN_RE: /^[1-4][A-Z]{2}\d{2}[A-Z]{2,3}\d{3}$/,
  ORCID_RE: /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/,
  RES_MAIL: /^[^\s@]+@([a-z0-9-]+\.)+(ac\.in|edu|edu\.in|res\.in|ac\.uk|edu\.au|ernet\.in|iisc\.ac\.in)$/i,
  orcidOk(id) { if (!this.ORCID_RE.test(id)) return false; const d = id.replace(/-/g, ""); let t = 0; for (let i = 0; i < 15; i++)t = (t + +d[i]) * 2; const r = (12 - t % 11) % 11, c = r === 10 ? "X" : String(r); return c === d[15] },
  normId(role, id) { return (id || "").trim().toUpperCase().replace(/\s+/g, "") },
  checkId(role, id) {
    if (role === "GOVERNMENT") {
      if (!this.GOV_RE.test(id)) return "Government employee ID must look like GOV-KA-FIS-1001 (GOV-state-department-number).";
      if (!this.GOV_REGISTRY.has(sha256(id))) return "This employee ID is not in the authorised officer registry.";
      return null
    }
    if (this.ORCID_RE.test(id)) return this.orcidOk(id) ? null : "ORCID iD checksum is invalid — please re-check the last digit.";
    if (this.USN_RE.test(id)) return null;
    return "Researcher / scholar ID must be an ORCID iD (0000-0002-1825-0097) or a university seat number (e.g. 4MT22CS001)."
  },
  checkMail(role, mail) {
    if (role === "GOVERNMENT") return this.GOV_MAIL.test(mail) ? null : "Use your official government e-mail (…@<dept>.gov.in or …@nic.in).";
    return this.RES_MAIL.test(mail) ? null : "Use your institutional e-mail (…@<institute>.ac.in / .edu / .res.in).";
  },
  checkPw(pw) { return pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) ? null : "Password needs 8+ characters with upper-case, lower-case and a number." },
  users() {
    const u = LS.get("aq_users_v2", null); if (u) return u;
    const seed = [
      { name: "Demo Fisheries Officer", email: "officer.fisheries@karnataka.gov.in", role: "GOVERNMENT", id: "GOV-KA-FIS-1001", pw: sha256("officer.fisheries@karnataka.gov.in|Aqua@2026") },
      { name: "Demo Researcher", email: "researcher@mite.ac.in", role: "RESEARCHER", id: "0000-0002-1825-0097", pw: sha256("researcher@mite.ac.in|Aqua@2026") }];
    LS.set("aq_users_v2", seed); return seed
  },
  register(role, name, mail, id, pw, pw2) {
    mail = (mail || "").trim().toLowerCase(); id = this.normId(role, id); name = (name || "").trim();
    if (name.length < 3 || !/^[A-Za-z][A-Za-z .'-]+$/.test(name)) return [false, "Enter your full name (letters only)."];
    let e = this.checkMail(role, mail) || this.checkId(role, id) || this.checkPw(pw); if (e) return [false, e];
    if (pw !== pw2) return [false, "Passwords do not match."];
    const U = this.users();
    if (U.some(u => u.email === mail)) return [false, "This e-mail is already registered."];
    if (U.some(u => u.id === id)) return [false, "This ID is already linked to another account."];
    U.push({ name, email: mail, role, id, pw: sha256(mail + "|" + pw), created: new Date().toISOString() });
    if (!LS.set("aq_users_v2", U)) return [false, "Browser storage is blocked — cannot save the account."];
    return [true, "✅ Account verified and created. Please log in."]
  },
  login(role, mail, id, pw) {
    mail = (mail || "").trim().toLowerCase(); id = this.normId(role, id);
    const lock = LS.get("aq_lock", {}); if (lock.until && Date.now() < lock.until) return [false, `Too many attempts — try again in ${Math.ceil((lock.until - Date.now()) / 1000)} s.`];
    if (!mail || !id || !pw) return [false, "Enter e-mail, ID and password."];
    const u = this.users().find(x => x.email === mail && x.role === role);
    if (!u || u.id !== id || u.pw !== sha256(mail + "|" + pw)) {
      const n = (lock.n || 0) + 1; LS.set("aq_lock", n >= 5 ? { n: 0, until: Date.now() + 60000 } : { n });
      return [false, u && u.id !== id ? "ID does not match this account." : "Invalid credentials for " + role.toLowerCase() + " access."]
    }
    LS.del("aq_lock"); SS.set("aq_session", { role, name: u.name, email: u.email, id: u.id }); return [true, u]
  }
};

let pendingRole = "RESEARCHER";
function openLogin(role) {
  pendingRole = role; const gov = role === "GOVERNMENT";
  $("#loginTitle").textContent = (gov ? "Government" : "Researcher") + " login";
  $("#loginHint").textContent = gov ? "Authorised officers only — official e-mail + issued employee ID." : "Verified researchers — institutional e-mail + ORCID iD or university seat number.";
  $("#loginIdLabel").textContent = gov ? "Government employee ID (e.g. GOV-KA-FIS-1001)" : "Researcher / scholar ID (ORCID or USN)";
  ["#loginEmail", "#loginId", "#loginPassword"].forEach(s => $(s).value = ""); $("#loginMsg").textContent = "";
  $("#demoBox").innerHTML = gov ? `<table class="kv"><tr><td>E-mail</td><td><code>officer.fisheries@karnataka.gov.in</code></td></tr><tr><td>Employee ID</td><td><code>GOV-KA-FIS-1001</code></td></tr><tr><td>Password</td><td><code>Aqua@2026</code></td></tr></table>`
    : `<table class="kv"><tr><td>E-mail</td><td><code>researcher@mite.ac.in</code></td></tr><tr><td>ORCID iD</td><td><code>0000-0002-1825-0097</code></td></tr><tr><td>Password</td><td><code>Aqua@2026</code></td></tr></table>`;
  $("#registerModal").classList.add("hidden"); $("#loginModal").classList.remove("hidden"); $("#loginEmail").focus()
}
function openRegister() {
  const gov = pendingRole === "GOVERNMENT"; $("#loginModal").classList.add("hidden");
  $("#regTitle").textContent = (gov ? "Government" : "Researcher") + " registration";
  $("#regHint").textContent = gov ? "Only employee IDs in the authorised officer registry can register. Official .gov.in / nic.in e-mail required." : "ORCID iD (checksum verified) or university seat number, plus an institutional e-mail (.ac.in / .edu / .res.in).";
  $("#regIdLabel").textContent = gov ? "Government employee ID (GOV-state-dept-number)" : "ORCID iD or university seat number (USN)";
  ["#regName", "#regEmail", "#regId", "#regPassword", "#regPassword2"].forEach(s => $(s).value = ""); $("#regMsg").textContent = "";
  $("#registerModal").classList.remove("hidden"); $("#regName").focus()
}
function doLogin() {
  const [ok, r] = AUTH.login(pendingRole, $("#loginEmail").value, $("#loginId").value, $("#loginPassword").value);
  if (!ok) { $("#loginMsg").innerHTML = `<span class="err-msg">${esc(r)}</span>`; $("#loginPassword").value = ""; return }
  $("#loginModal").classList.add("hidden"); APP.enter(pendingRole, r.name)
}
function doRegister() {
  const [ok, m] = AUTH.register(pendingRole, $("#regName").value, $("#regEmail").value, $("#regId").value, $("#regPassword").value, $("#regPassword2").value);
  $("#regMsg").innerHTML = `<span class="${ok ? "ok-msg" : "err-msg"}">${esc(m)}</span>`;
  if (ok) { const mail = $("#regEmail").value.trim().toLowerCase(), id = AUTH.normId(pendingRole, $("#regId").value); setTimeout(() => { openLogin(pendingRole); $("#loginEmail").value = mail; $("#loginId").value = id; $("#loginMsg").innerHTML = `<span class="ok-msg">${esc(m)}</span>`; $("#loginPassword").focus() }, 900) }
}
function wireAuth() {
  $("#btnDoLogin").onclick = doLogin; $("#btnCloseLogin").onclick = () => $("#loginModal").classList.add("hidden");
  $("#btnOpenRegister").onclick = openRegister; $("#btnDoRegister").onclick = doRegister; $("#btnCloseRegister").onclick = () => $("#registerModal").classList.add("hidden");
  ["#loginEmail", "#loginId", "#loginPassword"].forEach(s => $(s).addEventListener("keydown", e => { if (e.key === "Enter") doLogin() }));
  ["#regName", "#regEmail", "#regId", "#regPassword", "#regPassword2"].forEach(s => $(s).addEventListener("keydown", e => { if (e.key === "Enter") doRegister() }));
  [$("#loginModal"), $("#registerModal")].forEach(m => m.addEventListener("mousedown", e => { if (e.target === m) m.classList.add("hidden") }));
}
