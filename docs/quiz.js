/* =========================================================
   NS4 QUIZ v6.0
   - Leson / egzamen / final, barre anlè (XP, Pyès, Leson 2/5)
   - Pwen: kat rezilta ak rekonpans klè (pa gen "0 pts" ki pa eksplike)
   - Pwen sove offline (outbox nan stats.js) — yo pa disparèt
   - Estatistik (pwogrè) senkronize sou Firebase
   - Piblisite (AdMob / bridge), PRO = san piblisite
   - Pataje kesyon / rezilta / envitasyon ak lyen pou antre nan app la
   - MathJax pou fòmil yo
   Kesyon yo NAN yon fichye apa: questions.js  (window.NS4_QUESTIONS = {...})
========================================================= */
(function () {
"use strict";

/* ========= 0. KONFIG (chanje sa yo isit la sèlman) ========= */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDxN2jYclFAeSh9tMvkoeZCTsFvWNQYOzA",
  authDomain: "ns4supportplus.firebaseapp.com",
  projectId: "ns4supportplus",
  storageBucket: "ns4supportplus.firebasestorage.app",
  messagingSenderId: "1072291248908",
  appId: "1:1072291248908:web:711d01129b833847c5a729",
  measurementId: "G-DEYNQ8GQ9B"
};

const PASS_LESSON = 80;   // % minimòm pou pase leson an
const PASS_EXAM   = 70;   // % minimòm pou pase egzamen an

// Rekonpans (XP / Pyès). Mete 0 si ou pa vle bay pwen.
const REWARDS = {
  lessonFirst: { xp: 20, coins: 10 },  // premye fwa ou pase yon leson
  examFirst:   { xp: 30, coins: 15 },  // premye fwa ou pase egzamen yon nivo
  replayDaily: { xp: 5,  coins: 2 }    // rejwe yon leson ki deja valide: yon fwa pa jou pa nivo
};

// Lyen pou pataje. CHANJE "web" pou vrè adrès app ou a (sit wèb / paj Play Store).
const APP_LINKS = {
  web: "https://ns4supportplus.web.app/",   // <- adrès kote quiz.html ye
  store: ""                                 // <- lyen Google Play (si ou genyen)
};

// Piblisite. testMode:true = ID tès Google yo + yon kare "Piblisite (tès)". Mete false ak vrè ID ou yo an pwodiksyon.
const ADS = {
  enabled: true,
  testMode: true,
  ids: {
    banner: "ca-app-pub-3940256099942544/6300978111",        // ID tès Google
    interstitial: "ca-app-pub-3940256099942544/1033173712"   // ID tès Google
  },
  interstitialEveryN: 2,          // yon entèstisyèl chak N aktivite fini (leson/egzamen)
  minGapMs: 3 * 60 * 1000         // pa janm pi souvan pase 3 minit
};

const DEFAULT_LEVELS = ["niveau1","niveau2","niveau3","niveau4","niveau5","niveau6","niveau7","niveau8","niveau9","niveau10"];

let qDb = null, qAuth = null;
try {
  if (typeof firebase !== "undefined") {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    qDb = firebase.database();
    qAuth = firebase.auth();
  }
} catch (e) { console.warn("Firebase pa disponib:", e); }

/* ========= 1. SON & VIBRASYON ========= */
const SFX = {
  good: new Audio("son/Lazarre Patrice - Repons kòrèk 2026-02-22 19_39.mp3"),
  bad:  new Audio("son/enkòrèk.mp3"),
  next: new Audio("son/Lazarre Patrice - Repons kòrèk (1).mp3"),
  win:  new Audio("son/Victory_Sound_Effect(48k).mp3")
};
Object.values(SFX).forEach((s) => (s.volume = 0.5));

function playSound(name) {
  const s = SFX[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}
function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

/* ========= 2. HELPERS ========= */
const $ = (id) => document.getElementById(id);
function setText(id, v) { const el = $(id); if (el) el.textContent = v; }
function safeParse(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
function safeSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* kach plen */ } }
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
function fmt(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "") + "M";
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(".0", "") + "k";
  return String(n);
}
function todayStr() {
  const d = new Date();
  const p = (x) => (x < 10 ? "0" : "") + x;
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

let toastTimer;
function toast(msg) {
  let t = $("q-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "q-toast";
    t.className = "q-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ========= 3. MATHJAX =========
   Ekri fòmil yo nan questions.js konsa (DOUB "\\" paske se yon string JavaScript):
     "\\(x^2 + 1\\)"        fòmil nan liy       (oswa  $x^2+1$ )
     "\\[\\frac{a}{b}\\]"   fòmil santre        (oswa  $$\\frac{a}{b}$$ )
   Pou yon vrè siy dola ekri  \\$ .
   Ouvri quiz.html?mathcheck=1 pou wè kisa ki pa bon nan questions.js. */

// Yon sèl "\" nan yon string JS kreye karaktè kontwòl (\f de \frac, \t de \theta, \b de \beta, ...).
function healEscapes(s) {
  return String(s == null ? "" : s)
    .replace(/\f(?=[a-zA-Z])/g, "\\f")
    .replace(/\v(?=[a-zA-Z])/g, "\\v")
    .replace(/\x08(?=[a-zA-Z])/g, "\\b")
    .replace(/\t(?=[a-zA-Z])/g, "\\t")
    .replace(/\r(?=[a-zA-Z])/g, "\\r");
}

/* ---- LaTeX SAN delimitè (egzanp: "moyenne \\bar{x} de ...", "\\frac{a}{b} = 3", "X_{max} - X_{min}", "100\\%")
        -> nou mete \( ... \) otomatikman otou chak ekspresyon. Si tèks la deja gen delimitè, nou pa touche l. ---- */
const AM_OPS = "=+-*/<>×−≤≥≠·±";
function amIsL(c) { return !!c && /[A-Za-z]/.test(c); }
function amIsD(c) { return !!c && /[0-9]/.test(c); }
function amBalanced(s, i) {                 // s[i] === "{"  ->  endèks apre "}" ki koresponn lan (oswa -1)
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === "{") d++;
    else if (s[k] === "}") { d--; if (d === 0) return k + 1; }
  }
  return -1;
}
function amScripts(s, i) {                  // _{..}  ^{..}  _i  ^2
  let end = i, found = false;
  while (end < s.length && (s[end] === "_" || s[end] === "^")) {
    const c = s[end + 1];
    if (c === "{") { const e = amBalanced(s, end + 1); if (e < 0) break; end = e; }
    else if (amIsL(c) || amIsD(c)) end += 2;
    else break;
    found = true;
  }
  return { end: end, found: found };
}
function amAtom(s, i) {                     // yon "atòm" matematik ki kòmanse nan i -> { end, tex } oswa null
  const c = s[i];
  if (c === "\\") {
    if (s[i + 1] === "%") return { end: i + 2, tex: true };
    let k = i + 1;
    while (amIsL(s[k])) k++;
    if (k === i + 1) return null;
    while (s[k] === "{") { const e = amBalanced(s, k); if (e < 0) break; k = e; }
    return { end: amScripts(s, k).end, tex: true };
  }
  if (amIsD(c)) {
    let k = i;
    while (amIsD(s[k])) k++;
    if ((s[k] === "." || s[k] === ",") && amIsD(s[k + 1])) { k++; while (amIsD(s[k])) k++; }
    let tex = false;
    if (s[k] === "\\" && s[k + 1] === "%") { k += 2; tex = true; }
    const sc = amScripts(s, k);
    return { end: sc.end, tex: tex || sc.found };
  }
  if (amIsL(c)) {
    let k = i + 1;
    while (s[k] && /[\u0300-\u036f]/.test(s[k])) k++;     // x̄ (siy konbinasyon)
    if (amIsL(s[k])) return null;                          // 2 lèt oswa plis = yon mo, pa yon variab
    const sc = amScripts(s, k);
    return { end: sc.end, tex: sc.found };
  }
  return null;
}
function autoMath(s) {
  if (!s || /\\[(\[]|\$/.test(s)) return s;                 // deja gen delimitè
  if (!/\\[a-zA-Z%]|[A-Za-z0-9}][_^]/.test(s)) return s;    // pa gen LaTeX
  let out = "", i = 0;
  while (i < s.length) {
    const prev = i > 0 ? s[i - 1] : "";
    const a = /[A-Za-z0-9\\]/.test(prev) ? null : amAtom(s, i);
    if (!a) { out += s[i]; i++; continue; }
    let end = a.end, tex = a.tex;
    for (;;) {                                              // pwolonje ekspresyon an: atòm (op atòm)*
      let j = end;
      while (s[j] === " ") j++;
      if (j >= s.length || AM_OPS.indexOf(s[j]) < 0) break;
      let k = j + 1;
      while (s[k] === " ") k++;
      const b = amAtom(s, k);
      if (!b) break;
      end = b.end; tex = tex || b.tex;
    }
    out += tex ? "\\(" + s.slice(i, end) + "\\)" : s.slice(i, end);
    i = end;
  }
  return out;
}

// T() = repare karaktè kontwòl + mete delimitè si yo manke. Rele l sou CHAK tèks ki afiche.
function T(s) { return autoMath(healEscapes(s)); }

// San MathJax (offline / CDN bloke): fòmil yo vin tèks senp lizib olye de LaTeX brit.
function plainFallback(els) {
  if (!document.createTreeWalker) return;
  els.forEach((el) => {
    const w = document.createTreeWalker(el, 4, null, false);
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => { if (/\\[(\[]|\$\$/.test(n.nodeValue)) n.nodeValue = texToPlain(n.nodeValue); });
  });
}

let mathWarned = false;
function typeset() {
  const els = Array.prototype.slice.call(arguments).filter(Boolean);
  if (!els.length) return;
  const hasStartup = () => !!(window.MathJax && window.MathJax.startup && window.MathJax.startup.promise);
  const run = () => {
    const M = window.MathJax;
    // Chèn apèl yo (rekòmandasyon MathJax) pou de rann rapid pa antre an konfli
    M.startup.promise = M.startup.promise
      .then(() => M.typesetPromise(els))
      .catch((e) => console.warn("MathJax:", e));
  };
  if (hasStartup()) { run(); return; }
  const decide = () => {
    if (hasStartup()) { run(); return; }
    plainFallback(els);
    if (!mathWarned) {
      mathWarned = true;
      console.warn("MathJax pa chaje (tcheke entènèt/CDN, oswa telechaje tex-svg.js): fòmil yo afiche an tèks senp.");
    }
  };
  if (document.readyState === "complete") setTimeout(decide, 1200);
  else window.addEventListener("load", () => setTimeout(decide, 1200));
}

/* ========= 4. ITILIZATÈ & BARRE ANLÈ =========
   ns4_user = verite sèvè a. Sa moun nan wè = verite + pwen ki poko voye (StatsAPI.applyPending). */
let currentUid = null;
let progressReady = Promise.resolve();

function hasStats() { return typeof StatsAPI !== "undefined"; }
function getLocalUser() { return safeParse("ns4_user"); }
function getEffectiveUser() {
  const u = getLocalUser();
  return u && hasStats() && StatsAPI.applyPending ? StatsAPI.applyPending(u) : u;
}
function getUid() { return currentUid || (getLocalUser() || {}).uid || "guest"; }

const Topbar = {
  init() {
    const back = $("tb-back");
    if (back) back.addEventListener("click", onBack);
    this.refresh();
  },
  refresh() {
    const u = getEffectiveUser() || {};
    setText("tb-xp", fmt(u.xp || 0));
    setText("tb-coins", fmt(u.coins || 0));
    // ti pwen jòn = gen pwen ki poko voye sou sèvè a (yo sove, yo pa pèdi)
    const pend = hasStats() && StatsAPI.pendingCount ? StatsAPI.pendingCount() : 0;
    ["chip-xp", "chip-coins"].forEach((id) => { const el = $(id); if (el) el.classList.toggle("pending", pend > 0); });
  },
  label(text) { setText("tb-label", text); },
  progress(current, total) {
    const bar = $("tb-bar"), fill = $("tb-fill");
    if (!bar || !fill) return;
    if (!total) { bar.hidden = true; return; }
    bar.hidden = false;
    fill.style.width = Math.max(0, Math.min(100, Math.round((current / total) * 100))) + "%";
  },
  reward(xp, coins) {
    this.refresh();
    ["chip-xp", "chip-coins"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    });
    const pop = document.createElement("div");
    pop.className = "reward-pop";
    pop.textContent = "+" + xp + " XP  ·  +" + coins + " 🪙";
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1900);
  }
};

// Bay yon rekonpans (sove dirab nan outbox). Retounen true si sove.
function giveReward(r) {
  if (!r || (!r.xp && !r.coins)) return false;
  if (!hasStats() || !StatsAPI.addReward) { console.warn("stats.js pa chaje: pwen pa sove."); return false; }
  const item = StatsAPI.addReward(r.xp, r.coins, "quiz");
  if (!item) return false;
  Topbar.reward(r.xp, r.coins);
  return true;
}

/* ========= 5. PWOGRÈ (estatistik) — lokal + Firebase =========
   progress[matyè][nivo] = { lessonPassed, examPassed, bestExam, bestLesson, replayDay }
   Règ melanj: OR pou pase/pa pase, MAX pou nòt. Yon nivo pase pa janm retounen tounen. */
function norm(e) {
  e = e || {};
  return {
    lessonPassed: !!e.lessonPassed,
    examPassed: !!e.examPassed,
    bestExam: Number(e.bestExam) || 0,
    bestLesson: Number(e.bestLesson) || 0,
    replayDay: typeof e.replayDay === "string" ? e.replayDay : ""
  };
}
function mergeEntry(a, b) {
  a = norm(a); b = norm(b);
  return {
    lessonPassed: a.lessonPassed || b.lessonPassed,
    examPassed: a.examPassed || b.examPassed,
    bestExam: Math.max(a.bestExam, b.bestExam),
    bestLesson: Math.max(a.bestLesson, b.bestLesson),
    replayDay: a.replayDay > b.replayDay ? a.replayDay : b.replayDay
  };
}
function mergeProgress(a, b) {
  const out = {};
  [a, b].forEach((src) => {
    Object.keys(src || {}).forEach((s) => {
      out[s] = out[s] || {};
      Object.keys(src[s] || {}).forEach((l) => { out[s][l] = mergeEntry(out[s][l], src[s][l]); });
    });
  });
  return out;
}

function progressKey() { return "ns4_progress_" + getUid(); }
function getProgress() { return safeParse(progressKey()) || {}; }
function saveProgress(p) { safeSet(progressKey(), p); }
function getEntry(subject, level) { return norm((getProgress()[subject] || {})[level]); }

function saveEntry(subject, level, patch) {
  const p = getProgress();
  p[subject] = p[subject] || {};
  const merged = mergeEntry(p[subject][level], patch);
  p[subject][level] = merged;
  saveProgress(p);
  const uid = getUid();
  if (qDb && uid !== "guest") {
    qDb.ref("users/" + uid + "/progress/" + subject + "/" + level).update(merged).catch(() => {});
  }
  return merged;
}

// Ansyen kle a (ns4_progress) te pataje ant tout kont sou telefòn nan. Nou pase l bay kont aktyèl la yon sèl fwa.
function migrateOldProgress(uid) {
  const old = safeParse("ns4_progress");
  if (!old) return;
  const key = "ns4_progress_" + uid;
  if (!localStorage.getItem(key)) safeSet(key, mergeProgress(old, {}));
  localStorage.removeItem("ns4_progress");
}

// Melanje pwogrè sèvè a ak lokal la, epi voye sa sèvè a pa genyen. (Rele tou lè entènèt la tounen.)
let syncing = null;
function syncProgress() {
  const uid = getUid();
  if (!qDb || uid === "guest") return Promise.resolve();
  if (syncing) return syncing;
  syncing = withTimeout(qDb.ref("users/" + uid + "/progress").once("value"), 6000)
    .then((snap) => {
      const server = snap.val() || {};
      const merged = mergeProgress(getProgress(), server);
      saveProgress(merged);
      const ups = {};
      Object.keys(merged).forEach((s) => {
        Object.keys(merged[s]).forEach((l) => {
          const srv = norm((server[s] || {})[l]);
          if (JSON.stringify(merged[s][l]) !== JSON.stringify(srv)) {
            ups["users/" + uid + "/progress/" + s + "/" + l] = merged[s][l];
          }
        });
      });
      if (Object.keys(ups).length) qDb.ref().update(ups).catch(() => {});
    })
    .catch(() => { /* offline: kontinye ak sa ki lokal */ })
    .then(() => { syncing = null; });
  return syncing;
}

/* ========= 6. ESTATISTIK MATYÈ (pousantaj sou bouton yo) ========= */
function getLevelKeys(subject) {
  const data = window.NS4_QUESTIONS && window.NS4_QUESTIONS[subject];
  const keys = data && data.levels ? Object.keys(data.levels) : [];
  if (!keys.length) return DEFAULT_LEVELS.slice();
  return keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getSubjectPercent(subject) {
  const levels = getLevelKeys(subject);
  const prog = getProgress()[subject] || {};
  let passed = 0;
  levels.forEach((l) => { if (norm(prog[l]).examPassed) passed++; });
  return Math.round((passed / levels.length) * 100);
}

function getSubjectName(subject) {
  const btns = document.querySelectorAll(".subjectBtn");
  for (let i = 0; i < btns.length; i++) {
    if (btns[i].dataset.subject === subject) {
      const n = btns[i].querySelector(".subjectName");
      if (n) return n.textContent.trim().replace(/\s+/g, " ");
    }
  }
  return subject;
}

// Sove kantite nivo chak matyè pou script afichaj imedya a (nan quiz.html) kalkile bon pousantaj la
function cacheLevelCounts() {
  const Q = window.NS4_QUESTIONS;
  if (!Q) return;
  const counts = {};
  Object.keys(Q).forEach((k) => { if (Q[k] && Q[k].levels) counts[k] = Object.keys(Q[k].levels).length; });
  safeSet("ns4_level_counts", counts);
}

function refreshPercents() {
  document.querySelectorAll(".subjectBtn").forEach((btn) => {
    const box = btn.querySelector(".subjectPercent");
    if (!box) return;
    const percent = getSubjectPercent(btn.dataset.subject);
    box.textContent = percent + "%";
    box.style.background = percent < 40 ? "#e74c3c" : percent < 80 ? "#f39c12" : "#2ecc71";
  });
}

function initButtons() {
  document.querySelectorAll(".subjectBtn").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    btn.addEventListener("click", () => startQuiz(btn.dataset.subject, window.NS4_QUESTIONS));
  });
  refreshPercents();
}

/* ========= 7. PIBLISITE =========
   Sipòte 3 fason (nan lòd sa a):
    1) window.NS4_AD_BRIDGE = { showBanner(id), hideBanner(), showInterstitial(id) }  (pou nenpòt wrapper ou itilize)
    2) plugin Cordova/Capacitor "admob-plus" (window.admob)
    3) Anyen (nan navigatè): kare "Piblisite (tès)" si ADS.testMode = true
   Itilizatè PRO pa wè piblisite. Entèstisyèl la parèt SÈLMAN sou ekran rezilta (pa janm pandan kesyon yo). */
const Ads = {
  started: false,
  banner: null,
  inter: null,
  count: 0,

  isPro() {
    const u = getEffectiveUser();
    return !!u && u.status === "PRO" && !!u.proExpireAt && u.proExpireAt > Date.now();
  },
  active() { return ADS.enabled && !this.isPro(); },

  init() {
    if (!this.active()) { this.hideBanner(); return; }
    const B = window.NS4_AD_BRIDGE;
    if (B && B.showBanner) {
      try { B.showBanner(ADS.ids.banner); document.body.classList.add("has-banner"); } catch (e) { console.warn("Ad bridge:", e); }
    } else if (ADS.testMode) {
      const ph = $("ad-banner");
      if (ph) { ph.hidden = false; document.body.classList.add("has-banner"); }
    }
    if (window.admob) this.initAdmob();
    else document.addEventListener("deviceready", () => this.initAdmob(), false);
  },

  // Rele lè done itilizatè a chanje (PRO ka rive pita)
  refresh() { if (this.active()) this.init(); else this.hideBanner(); },

  async initAdmob() {
    if (this.started || !window.admob || !this.active()) return;
    if (window.NS4_AD_BRIDGE && window.NS4_AD_BRIDGE.showBanner) return;
    this.started = true;
    try {
      await window.admob.start();
      this.banner = new window.admob.BannerAd({ adUnitId: ADS.ids.banner });
      await this.banner.show();
      document.body.classList.add("has-banner");
      this.loadInter();
    } catch (e) { console.warn("AdMob:", e); this.started = false; }
  },

  async loadInter() {
    try {
      this.inter = new window.admob.InterstitialAd({ adUnitId: ADS.ids.interstitial });
      await this.inter.load();
    } catch (e) { this.inter = null; }
  },

  hideBanner() {
    document.body.classList.remove("has-banner");
    const ph = $("ad-banner");
    if (ph) ph.hidden = true;
    try { if (window.NS4_AD_BRIDGE && window.NS4_AD_BRIDGE.hideBanner) window.NS4_AD_BRIDGE.hideBanner(); } catch (e) {}
    try { if (this.banner && this.banner.hide) this.banner.hide(); } catch (e) {}
  },

  // Rele sou chak ekran rezilta. Wè a se chak N aktivite, epi pa pi souvan pase minGapMs.
  maybeInterstitial() {
    if (!this.active()) return;
    this.count++;
    if (this.count % ADS.interstitialEveryN !== 0) return;
    const last = Number(localStorage.getItem("ns4_ads_last")) || 0;
    if (Date.now() - last < ADS.minGapMs) return;
    setTimeout(() => this.showInterstitial(), 800);
  },

  async showInterstitial() {
    if (!this.active() || document.hidden) return;
    const B = window.NS4_AD_BRIDGE;
    try {
      if (B && B.showInterstitial) {
        await B.showInterstitial(ADS.ids.interstitial);
      } else if (this.inter) {
        await this.inter.show();
        this.inter = null;
        this.loadInter();
      } else {
        return;   // pa gen piblisite pare: pa bloke itilizatè a
      }
      localStorage.setItem("ns4_ads_last", String(Date.now()));
    } catch (e) { console.warn("Interstitial:", e); }
  }
};

/* ========= 8. PATAJE (kesyon, rezilta, envitasyon) ========= */
function appLink(params) {
  try {
    const u = new URL("quiz.html", APP_LINKS.web);
    Object.keys(params || {}).forEach((k) => { if (params[k]) u.searchParams.set(k, params[k]); });
    return u.toString();
  } catch (e) { return APP_LINKS.web; }
}

// LaTeX -> tèks senp pou yon mesaj (WhatsApp/SMS pa konn rann MathJax)
function texToPlain(s) {
  s = T(s);
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
         .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  }
  const sup = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","n":"ⁿ","+":"⁺","-":"⁻" };
  s = s.replace(/\^\{([0-9n+\-]+)\}|\^([0-9n])/g, (m, a, b) => (a || b).split("").map((c) => sup[c] || c).join(""));
  const map = {
    times:"×", cdot:"·", leq:"≤", le:"≤", geq:"≥", ge:"≥", neq:"≠", infty:"∞", pi:"π",
    alpha:"α", beta:"β", gamma:"γ", delta:"δ", theta:"θ", lambda:"λ", mu:"μ", sigma:"σ", omega:"ω",
    Delta:"Δ", Omega:"Ω", sum:"Σ", int:"∫", pm:"±", to:"→", rightarrow:"→", Rightarrow:"⇒", approx:"≈", in:"∈",
    left:"", right:"", text:"", mathbb:"", mathrm:"", displaystyle:""
  };
  s = s.replace(/\\([a-zA-Z]+)/g, (m, n) => (Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n));
  return s.replace(/\\[()[\]]|\$\$|\$/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

// Pataje: fenèt sistèm nan si li egziste; sinon kopye tèks la (epi ou kole l nan WhatsApp/Messenger).
function shareContent(o) {
  const full = o.text + "\n\n" + o.url;
  const tryNative = navigator.share
    ? navigator.share({ title: o.title, text: o.text, url: o.url }).then(() => "ok", (e) => (e && e.name === "AbortError" ? "abort" : "fail"))
    : Promise.resolve("fail");
  return tryNative.then((r) => {
    if (r !== "fail") return;
    return copyText(full).then((ok) => {
      if (ok) toast("Tèks la kopye ✅ Kole l nan WhatsApp oswa Messenger.");
      else window.prompt("Kopye tèks sa a pou pataje:", full);
    });
  });
}

function shareQuestion(q) {
  const letters = "ABCDEFGH";
  const opts = q.a.map((a, i) => letters[i] + ") " + texToPlain(a)).join("\n");
  const text = "📚 NS4 Support+ · " + getSubjectName(state.subject) + " (" + state.level.toUpperCase() + ")\n\n" +
               "❓ " + texToPlain(q.q) + "\n\n" + opts + "\n\nOu konnen repons lan? Eseye l nan app la 👇";
  return shareContent({ title: "Kesyon NS4 Support+", text, url: appLink({ s: state.subject, l: state.level }) });
}

function shareResult(label, percent) {
  const text = "🏆 Mwen fè " + percent + "% nan " + label + " (" + getSubjectName(state.subject) + ") sou NS4 Support+!\n" +
               "Ou kapab fè pi byen pase m? 💪";
  return shareContent({ title: "Rezilta NS4 Support+", text, url: appLink({ s: state.subject, l: state.level || "" }) });
}

function shareInvite() {
  const store = APP_LINKS.store ? "\nGoogle Play: " + APP_LINKS.store : "";
  const text = "📲 Mwen ap prepare NS4 ak NS4 Support+: leson, kesyon, egzamen ak klasman. Vin fè yo avè m!" + store;
  return shareContent({ title: "NS4 Support+", text, url: appLink({}) });
}

// Lyen pataje a ouvri yon matyè/nivo dirèkteman
function readDeepLink() {
  try {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("s");
    if (!s) return;
    safeSet("ns4_deeplink", { s: s, l: p.get("l") || "", t: Date.now() });
    p.delete("s"); p.delete("l");
    const rest = p.toString();
    if (window.history && history.replaceState) history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : ""));
  } catch (e) { /* URLSearchParams pa disponib */ }
}

function consumeDeepLink() {
  const d = safeParse("ns4_deeplink");
  if (!d) return;
  localStorage.removeItem("ns4_deeplink");
  if (Date.now() - d.t > 24 * 60 * 60 * 1000) return;
  const Q = window.NS4_QUESTIONS;
  if (!Q || !Object.prototype.hasOwnProperty.call(Q, d.s)) return;
  startQuiz(d.s, Q);
  if (!d.l) return;
  const levels = getLevelKeys(d.s);
  const i = levels.indexOf(d.l);
  if (i < 0) return;
  const prog = getProgress()[d.s] || {};
  if (i === 0 || norm(prog[levels[i - 1]]).examPassed) startLesson(d.l);
  else toast("Fini nivo anvan an pou ouvri nivo sa a.");
}

/* ========= 9. NAVIGASYON & KOMPOSAN ========= */
const state = { subject: null, data: null, level: null, mode: null, questions: [], score: 0, view: "subjects" };

function resetBox() {
  const box = $("answers");
  box.innerHTML = "";
  box.classList.remove("menuGrid");
  box.onchange = null;
  return box;
}

function makeBtn(text, fn, cls) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls || "nextBtn";
  b.textContent = text;
  b.onclick = fn;
  return b;
}

// Kat "pwen": tit + liy [etikèt, valè, klas]
function pointsCard(title, rows) {
  const d = document.createElement("div");
  d.className = "pointsCard";
  const h = document.createElement("h3");
  h.textContent = title;
  d.appendChild(h);
  rows.forEach((r) => {
    const row = document.createElement("div");
    row.className = "row";
    const l = document.createElement("span");
    l.textContent = r[0];
    const v = document.createElement("b");
    v.textContent = r[1];
    if (r[2]) v.className = r[2];
    row.appendChild(l);
    row.appendChild(v);
    d.appendChild(row);
  });
  return d;
}

function totalsRow() {
  const u = getEffectiveUser() || {};
  const xp = u.xp || 0;
  return ["Total ou", "⭐ " + xp + " XP · Nivo " + (Math.floor(xp / 100) + 1) + " · 🪙 " + (u.coins || 0)];
}

function rewardText(r) { return "+" + r.xp + " XP · +" + r.coins + " 🪙"; }

function onBack() {
  switch (state.view) {
    case "subjects":
      window.location.href = "home.html";
      break;
    case "levels":
      showSubjects();
      break;
    case "lesson":
    case "exam":
    case "final":
      if (confirm("Kite epi pèdi pwogrè ou nan kesyon sa yo?")) loadLevelMenu();
      break;
    default:
      if (state.subject) loadLevelMenu(); else showSubjects();
  }
}

function showSubjects() {
  state.view = "subjects";
  state.subject = null;
  $("quizArea").style.display = "none";
  $("subjects").style.display = "block";
  refreshPercents();
  Topbar.label("Chwazi matyè");
  Topbar.progress(0, 0);
}

function startQuiz(subject, DATA) {
  const data = DATA && Object.prototype.hasOwnProperty.call(DATA, subject) ? DATA[subject] : null;
  if (!data || !data.levels) {
    toast("Kesyon yo poko disponib pou matyè sa a.");
    return;
  }
  state.subject = subject;
  state.data = data;
  $("subjects").style.display = "none";
  $("quizArea").style.display = "block";
  loadLevelMenu();
}

/* ========= 10. MENU NIVO ========= */
function loadLevelMenu() {
  state.view = "levels";
  state.mode = null;
  const levels = getLevelKeys(state.subject);
  const prog = getProgress()[state.subject] || {};
  const box = resetBox();
  box.classList.add("menuGrid");
  $("quizTitle").textContent = "Chwazi Nivo";
  $("question").textContent = "";

  let passedCount = 0;
  levels.forEach((lvl, i) => {
    const done = norm(prog[lvl]).examPassed;
    if (done) passedCount++;
    const unlocked = i === 0 || norm(prog[levels[i - 1]]).examPassed;
    const btn = document.createElement("button");
    btn.className = "levelBtn";
    if (!unlocked) {
      btn.textContent = "🔒 " + lvl.toUpperCase();
      btn.classList.add("locked");
      btn.disabled = true;
    } else {
      btn.textContent = lvl.toUpperCase() + (done ? " ✅" : "");
      btn.onclick = () => startLesson(lvl);
    }
    box.appendChild(btn);
  });

  if (state.data.final_exam && state.data.final_exam.length) {
    const finalBtn = document.createElement("button");
    finalBtn.className = "finalBtn";
    if (passedCount < levels.length) {
      finalBtn.textContent = "🔒 FINAL EXAM";
      finalBtn.classList.add("locked");
      finalBtn.disabled = true;
    } else {
      finalBtn.textContent = "FINAL EXAM";
      finalBtn.onclick = startFinalExam;
    }
    box.appendChild(finalBtn);
  }

  Topbar.label(getSubjectName(state.subject));
  Topbar.progress(passedCount, levels.length);
}

/* ========= 11. LESON (yon kesyon alafwa) ========= */
function startLesson(level) {
  state.level = level;
  state.mode = "lesson";
  state.score = 0;
  state.questions = (state.data.levels[level] && state.data.levels[level].questions) || [];
  if (!state.questions.length) { toast("Nivo sa a poko gen kesyon."); return; }
  showQuestion(0);
}

function showQuestion(index) {
  const q = state.questions[index];
  const total = state.questions.length;
  const correctIdx = Array.isArray(q.correct) ? q.correct[0] : q.correct;
  const box = resetBox();

  state.view = "lesson";
  playSound("next");
  $("quizTitle").textContent = state.level.toUpperCase();
  $("question").textContent = T(q.q);
  Topbar.label("Leson " + (index + 1) + "/" + total);
  Topbar.progress(index, total);

  const btns = q.a.map((ans) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "answerBtn";
    b.textContent = T(ans);
    box.appendChild(b);
    return b;
  });

  const exp = document.createElement("div");
  exp.className = "explanation";
  exp.hidden = true;
  box.appendChild(exp);

  const next = makeBtn(index === total - 1 ? "Fini" : "Suivant", () => {
    vibrate(30);
    if (index < total - 1) showQuestion(index + 1);
    else finishLesson();
  });
  next.hidden = true;
  box.appendChild(next);

  box.appendChild(makeBtn("📤 Pataje kesyon sa a", () => shareQuestion(q), "shareLink"));

  btns.forEach((b, i) => {
    // Konpare ak INDEKS (pa tèks): MathJax chanje tèks bouton yo, kidonk tèks pa fyab ankò.
    b.onclick = () => {
      const right = i === correctIdx;
      btns.forEach((x, j) => {
        x.disabled = true;
        x.classList.add("disabled");
        if (j === correctIdx) x.classList.add("correct");
        if (j === i && !right) x.classList.add("wrong");
      });
      if (right) { state.score++; playSound("good"); vibrate(70); }
      else { playSound("bad"); vibrate([60, 40, 60]); }

      Topbar.progress(index + 1, total);
      // Eksplikasyon an vin ranpli + fòmat MathJax sèlman lè li vizib (MathJax pa mezire byen eleman kache)
      if (q.explanation) { exp.textContent = T(q.explanation); exp.hidden = false; typeset(exp); }
      setTimeout(() => {
        next.hidden = false;
        if (next.scrollIntoView) next.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 500);
    };
  });

  typeset($("question"), box);
}

function showLessonFailed(percent) {
  state.view = "result";
  playSound("bad");
  vibrate([60, 40, 60]);
  const box = resetBox();
  $("quizTitle").textContent = state.level.toUpperCase();
  $("question").textContent = "";
  Topbar.label("Eseye ankò");
  Topbar.progress(percent, 100);
  box.appendChild(pointsCard("Leson pa pase ❌", [
    ["Nòt", state.score + "/" + state.questions.length + " · " + percent + "%"],
    ["Minimòm", PASS_LESSON + "%"],
    ["Rekonpans", "Pa gen pwen fwa sa a", "muted"],
    totalsRow()
  ]));
  box.appendChild(makeBtn("Eseye ankò", () => startLesson(state.level)));
  box.appendChild(makeBtn("Retounen nan Nivo", loadLevelMenu));
  Ads.maybeInterstitial();
}

function finishLesson() {
  const total = state.questions.length;
  const percent = Math.round((state.score / total) * 100);
  if (percent < PASS_LESSON) { showLessonFailed(percent); return; }

  playSound("win");
  vibrate([100, 50, 100]);
  const subject = state.subject, level = state.level, score = state.score;

  // Tann sinkwonizasyon pwogrè a (si li poko fini) pou pa bay rekonpans doub sou yon lòt telefòn
  progressReady.then(() => {
    if (state.view !== "lesson" || state.level !== level) return;
    const before = getEntry(subject, level);
    const today = todayStr();

    let reward = null, kind;
    if (!before.lessonPassed) { reward = REWARDS.lessonFirst; kind = "first"; }
    else if (before.replayDay !== today) { reward = REWARDS.replayDaily; kind = "replay"; }
    else { kind = "capped"; }

    saveEntry(subject, level, { lessonPassed: true, bestLesson: percent, replayDay: today });
    const given = reward ? giveReward(reward) : false;

    const rows = [
      ["Nòt", score + "/" + total + " · " + percent + "%"],
      ["Pi bon nòt leson", Math.max(before.bestLesson, percent) + "%"]
    ];
    if (given) rows.push([kind === "first" ? "Rekonpans (premye fwa)" : "Bonis rejwe jodi a", rewardText(reward), "gain"]);
    else if (kind === "capped") rows.push(["Rekonpans", "Deja touche jodi a pou nivo sa a. Tounen demen!", "muted"]);
    else rows.push(["Rekonpans", "Pa t kapab sove pwen yo", "muted"]);
    rows.push(totalsRow());

    startExamSheet(level);
    $("question").textContent = "";
    const box = $("answers");
    box.insertBefore(pointsCard("🎉 Leson valide! Kounye a egzamen an", rows), box.firstChild);
  });
}

/* ========= 12. FEY EGZAMEN (tout kesyon yo ansanm) ========= */
function buildSheet(list, prefix, labelPrefix, submitText, onSubmit) {
  const box = resetBox();

  list.forEach((q, i) => {
    const qDiv = document.createElement("div");
    qDiv.className = "examQuestion";
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = (i + 1) + ") " + T(q.q);
    p.appendChild(strong);
    qDiv.appendChild(p);

    q.a.forEach((ans) => {
      const input = document.createElement("input");
      input.type = q.type === "checkbox" ? "checkbox" : "radio";
      input.name = prefix + i;
      input.value = ans;
      const label = document.createElement("label");
      label.style.display = "block";
      label.appendChild(input);
      label.append(" " + T(ans));
      qDiv.appendChild(label);
    });
    box.appendChild(qDiv);
  });

  // Barre anlè a montre konbyen kesyon ou deja reponn
  const updateProgress = () => {
    let answered = 0;
    box.querySelectorAll(".examQuestion").forEach((d) => { if (d.querySelector("input:checked")) answered++; });
    Topbar.label(labelPrefix + " " + answered + "/" + list.length);
    Topbar.progress(answered, list.length);
  };
  box.onchange = updateProgress;
  updateProgress();

  box.appendChild(makeBtn(submitText, onSubmit));
  typeset(box);
  return box;
}

function readAnswers(box) {
  const out = [];
  box.querySelectorAll(".examQuestion").forEach((qDiv) => {
    const sel = [];
    qDiv.querySelectorAll("input").forEach((inp) => { if (inp.checked) sel.push(inp.value); });
    out.push(sel);
  });
  return out;
}

function gradeSheet(list, userAnswers) {
  let score = 0;
  const details = list.map((q, i) => {
    const correct = Array.isArray(q.correct) ? q.correct : [q.correct];
    const selected = userAnswers[i] || [];
    const ok = correct.every((c) => selected.includes(q.a[c])) && correct.length === selected.length;
    if (ok) score++;
    return ok;
  });
  return { score, details };
}

function confirmUnanswered(userAnswers) {
  const missing = userAnswers.filter((a) => !a.length).length;
  return missing === 0 || confirm(missing + " kesyon poko reponn. Soumèt kanmenm?");
}

function renderResult(o) {
  state.view = "result";
  const box = resetBox();
  $("question").textContent = "";
  $("quizTitle").textContent = o.title;
  Topbar.label(o.label);
  Topbar.progress(o.percent, 100);

  if (o.card) box.appendChild(o.card);

  o.list.forEach((q, i) => {
    const div = document.createElement("div");
    div.className = "corr " + (o.details[i] ? "ok" : "no");
    const userAns = T((o.userAnswers[i] || []).join(", ")) || "Pa reponn";
    const correctAns = (Array.isArray(q.correct) ? q.correct : [q.correct]).map((c) => T(q.a[c])).join(", ");
    const p = document.createElement("p");
    const s = document.createElement("strong");
    s.textContent = (i + 1) + ") " + T(q.q);
    p.appendChild(s);
    p.appendChild(document.createElement("br"));
    p.append("Ou: " + userAns);
    p.appendChild(document.createElement("br"));
    p.append("Repons kòrèk: " + correctAns);
    div.appendChild(p);
    box.appendChild(div);
  });

  const fb = document.createElement("p");
  fb.className = "resultFeedback";
  fb.textContent = o.feedback;
  box.appendChild(fb);

  (o.buttons || []).forEach((b) => box.appendChild(b));
  box.appendChild(makeBtn("📤 Pataje rezilta m", () => shareResult(o.shareLabel, o.percent)));
  box.appendChild(makeBtn("👥 Envite yon zanmi", shareInvite));
  box.appendChild(makeBtn("Retounen nan Nivo", loadLevelMenu));
  typeset(box);
  Ads.maybeInterstitial();
}

function startExamSheet(level) {
  state.mode = "exam";
  state.view = "exam";
  state.score = 0;
  state.questions = (state.data.levels[level] && state.data.levels[level].exam) || [];

  if (!state.questions.length) {
    // Pa gen egzamen: nivo a valide otomatikman pou pa bloke nivo swivan an
    saveEntry(state.subject, level, { examPassed: true });
    toast("Pa gen egzamen pou nivo sa a. Nivo a valide.");
    loadLevelMenu();
    return;
  }
  $("quizTitle").textContent = "EXAM " + level.toUpperCase();
  buildSheet(state.questions, "q", "Egzamen", "Soumèt Egzamen", () => finishExamSheet(level));
}

function finishExamSheet(level) {
  const box = $("answers");
  const userAnswers = readAnswers(box);
  if (!confirmUnanswered(userAnswers)) return;

  const total = state.questions.length;
  const { score, details } = gradeSheet(state.questions, userAnswers);
  const percent = Math.round((score / total) * 100);
  const passed = percent >= PASS_EXAM;
  const before = getEntry(state.subject, level);

  // OR/MAX: yon nivo ki deja pase pa janm retounen "pa pase"
  saveEntry(state.subject, level, { examPassed: passed, bestExam: percent });

  if (passed) { playSound("win"); vibrate([120, 50, 120]); }
  else { playSound("bad"); vibrate([60, 40, 60]); }

  const rows = [
    ["Nòt", score + "/" + total + " · " + percent + "%"],
    ["Pi bon nòt egzamen", Math.max(before.bestExam, percent) + "%"]
  ];
  if (passed && !before.examPassed) {
    const given = giveReward(REWARDS.examFirst);
    rows.push(given ? ["Rekonpans (premye fwa)", rewardText(REWARDS.examFirst), "gain"] : ["Rekonpans", "Pa t kapab sove pwen yo", "muted"]);
  } else if (passed) {
    rows.push(["Rekonpans", "Egzamen sa a te deja valide (pa gen nouvo pwen)", "muted"]);
  } else {
    rows.push(["Rekonpans", "Ou bezwen " + PASS_EXAM + "% pou pase", "muted"]);
  }
  rows.push(totalsRow());

  const retry = passed ? [] : [makeBtn("Refè Egzamen", () => startExamSheet(level))];
  renderResult({
    title: "Rezilta Egzamen: " + percent + "%",
    label: passed ? "Egzamen reyisi ✅" : "Egzamen pa pase",
    percent, list: state.questions, userAnswers, details,
    card: pointsCard(passed ? "🎉 Egzamen reyisi" : "Egzamen pa pase", rows),
    shareLabel: "egzamen " + level.toUpperCase(),
    feedback: passed
      ? "🎉 Ou pase egzamen an ✅"
      : before.examPassed
        ? "❌ Ou pa rive " + PASS_EXAM + "% fwa sa a, men nivo a rete valide."
        : "❌ Ou pa rive " + PASS_EXAM + "%, ou pap ka pase nan nivo swivan",
    buttons: retry
  });
}

/* ========= 13. FINAL EXAM ========= */
function startFinalExam() {
  state.mode = "final";
  state.view = "final";
  state.score = 0;
  state.level = null;
  state.questions = (state.data.final_exam || []).slice(0, 20);
  if (!state.questions.length) return;
  $("quizTitle").textContent = "FINAL EXAM";
  $("question").textContent = "";
  buildSheet(state.questions, "f", "Final", "Soumèt FINAL", finishFinalSheet);
}

function finishFinalSheet() {
  const userAnswers = readAnswers($("answers"));
  if (!confirmUnanswered(userAnswers)) return;

  const total = state.questions.length;
  const { score, details } = gradeSheet(state.questions, userAnswers);
  const percent = Math.round((score / total) * 100);
  playSound("win");
  vibrate([120, 50, 120]);

  renderResult({
    title: "🏆 FINAL RESULT: " + percent + "%",
    label: "Final: " + percent + "%",
    percent, list: state.questions, userAnswers, details,
    card: pointsCard("🏆 Rezilta FINAL la", [
      ["Nòt", score + "/" + total + " · " + percent + "%"],
      ["Rekonpans", "FINAL la pa bay pwen", "muted"],
      totalsRow()
    ]),
    shareLabel: "FINAL",
    feedback: percent >= PASS_EXAM ? "🏆 Bravo! Ou pase FINAL la ✅" : "Kontinye pratike, ou ka refè l!",
    buttons: []
  });
}

/* ========= 14. DIYAGNOSTIK MATH (ouvri quiz.html?mathcheck=1) ========= */
function auditMath() {
  const issues = [];
  const samples = [];
  let auto = 0;
  const walk = (node, path) => {
    if (typeof node === "string") {
      const healed = healEscapes(node);
      const wrapped = autoMath(healed);
      const hasTex = /\\[a-zA-Z]+/.test(healed) || /(frac|sqrt|mathbb|text)\{|\^\{|_\{/.test(healed);
      const hasDelim = /\\[(\[]|\$/.test(healed);
      if (/(^|[^\\A-Za-z])(frac|sqrt|mathbb|overline)\{/.test(healed)) {
        issues.push({ path, type: "MANKE \\ devan kòmand (frac{, sqrt{...). Ekri \\\\frac nan questions.js", text: node });
      } else if (hasTex && !hasDelim && wrapped === healed) {
        issues.push({ path, type: "LaTeX detekte men mwen pa ka mete delimitè otomatikman. Mete \\\\( ... \\\\) otou fòmil la", text: node });
      } else if (hasTex && !hasDelim) {
        auto++;
        if (samples.length < 5) samples.push({ path, before: node, after: wrapped });
      } else if (healed !== node) {
        issues.push({ path, type: "Repare otomatikman (te gen yon sèl \\). Pi bon: double \\\\", text: node });
      }
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, path + "[" + i + "]"));
    } else if (node && typeof node === "object") {
      Object.keys(node).forEach((k) => walk(node[k], path ? path + "." + k : k));
    }
  };
  walk(window.NS4_QUESTIONS || {}, "");
  auditMath.auto = auto;
  auditMath.samples = samples;
  return issues;
}

function showMathCheck() {
  const issues = auditMath();
  if (window.console && console.table) console.table(issues);

  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;inset:0;z-index:9999;background:#fff;overflow:auto;padding:16px;font:13px/1.5 monospace;color:#222";
  const add = (tag, text, css) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (css) el.style.cssText = css;
    panel.appendChild(el);
    return el;
  };
  const mjOk = !!(window.MathJax && window.MathJax.typesetPromise);
  add("h3", "Tès MathJax", "margin:0 0 8px");
  add("p", "MathJax: " + (mjOk ? "chaje ✅" : "PA chaje ❌ (tcheke entènèt/CDN)"), "margin:0 0 6px");
  const test = add("p", "Tès liy: \\(x^2+1\\)   Tès $\\frac{a}{b}$   Tès santre: \\[\\sqrt{x}\\]", "margin:0 0 12px;font:16px sans-serif");
  if (auditMath.auto) {
    add("p", auditMath.auto + " tèks te gen LaTeX SAN delimitè: mwen ajoute \\( \\) otomatikman ✅ (egzanp anba yo)", "margin:0 0 6px;color:#1e7a3c;font-weight:bold");
    (auditMath.samples || []).forEach((sm) => {
      const d = document.createElement("div");
      d.style.cssText = "margin:6px 0;padding:8px;border-left:4px solid #2ecc71;background:#f0fbf4;word-break:break-word;white-space:pre-wrap";
      d.textContent = sm.path + "\nAVAN: " + sm.before.slice(0, 90) + "\nAPRE: " + sm.after.slice(0, 110);
      panel.appendChild(d);
    });
  }
  add("p", issues.length + " pwoblèm ki rete nan questions.js" + (issues.length ? ":" : " — anyen pou repare ✅"), "font-weight:bold;margin-top:10px");
  issues.slice(0, 40).forEach((it) => {
    const d = document.createElement("div");
    d.style.cssText = "margin:8px 0;padding:8px;border-left:4px solid #e74c3c;background:#fdf2f2;word-break:break-word;white-space:pre-wrap";
    d.textContent = it.path + "\n" + it.type + "\n→ " + it.text.slice(0, 90);
    panel.appendChild(d);
  });
  if (issues.length > 40) add("p", "... ak " + (issues.length - 40) + " lòt (gade console.table)");
  const close = add("button", "Fèmen", "margin-top:12px;padding:10px 18px;font-size:15px");
  close.onclick = () => panel.remove();
  document.body.appendChild(panel);
  typeset(test);
}

/* ========= 15. DEMARE (auth + done sèvè) ========= */
let listenedUid = null;

function attachUserListener(uid) {
  if (!qDb || listenedUid === uid) return;
  listenedUid = uid;
  qDb.ref("users/" + uid).on("value", (snap) => {
    if (!snap.exists()) return;
    const data = snap.val();
    let local = getLocalUser() || {};
    if (local.uid && local.uid !== uid) local = {};
    const merged = Object.assign({}, local, data, { uid: uid });
    // Sèvè a gen dènye mo (rewardIds ansanm ak xp pou pa konte yon pwen de fwa)
    ["coins", "xp", "level", "quizStats", "status", "proExpireAt", "streak", "rewardIds"].forEach((k) => { merged[k] = data[k]; });
    safeSet("ns4_user", merged);
    Topbar.refresh();
    Ads.refresh();
  }, (err) => console.warn("Erè lekti itilizatè:", err));
}

function boot() {
  readDeepLink();
  Topbar.init();
  Topbar.label("Chwazi matyè");
  Topbar.progress(0, 0);

  const lu = getLocalUser();
  if (lu && lu.uid) migrateOldProgress(lu.uid);
  cacheLevelCounts();
  initButtons();
  Ads.init();
  if (/[?&]mathcheck/.test(window.location.search)) showMathCheck();

  if (hasStats()) {
    StatsAPI.onChange = () => Topbar.refresh();
    if (qDb && StatsAPI.start) StatsAPI.start();
  }

  if (!qAuth) { consumeDeepLink(); return; }

  // Lè entènèt la tounen, re-senkronize pwogrè a
  try {
    qDb.ref(".info/connected").on("value", (snap) => {
      if (snap.val() === true && currentUid) syncProgress().then(() => { refreshPercents(); if (state.view === "levels") loadLevelMenu(); });
    });
  } catch (e) { /* pa gen baz done */ }

  qAuth.onAuthStateChanged((user) => {
    if (!user) {
      localStorage.removeItem("ns4_user");
      window.location.href = "index.html";
      return;
    }
    const local = getLocalUser();
    if (local && local.uid && local.uid !== user.uid) localStorage.removeItem("ns4_user");

    currentUid = user.uid;
    migrateOldProgress(user.uid);
    refreshPercents();
    Topbar.refresh();
    Ads.refresh();
    attachUserListener(user.uid);
    progressReady = syncProgress().then(() => {
      refreshPercents();
      if (state.view === "levels") loadLevelMenu();
    });
    progressReady.then(consumeDeepLink);
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

// Konpatibilite ak ansyen kòd la
window.startQuiz = startQuiz;
window.getSubjectPercent = getSubjectPercent;

})();
