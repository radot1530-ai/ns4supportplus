/* =========================================================
   ns4-content.js — Itilizatè, pyès ak DEBLOKAJ kontni (vokabilè / fòmil / egzamen)

   Pwoblèm li rezoud:
   - Ansyen paj yo te ekri pyès yo an absoli (saveUser -> update({coins})): sa ekraze pyès sèvè a ak pwen ki poko voye.
   - Deblokaj yo te sove sèlman nan localStorage: yo te disparèt sou yon lòt telefòn.
   Kounye a:
   - Peye ak pyès = yon TRANZAKSYON sou sèvè a (li verifye pyès reyèl yo, dedwi yo, epi make kontni an debloke). Bezwen entènèt.
   - Deblokaj yo sove nan  users/{uid}/unlocked/{kind}_{id}  epi kache lokalman.
   - Pyès ou wè yo = sèvè a + pwen ki poko voye (StatsAPI.applyPending).

   Itilizasyon nan paj ki gen ansyen kòd la (vocab.html, fomil.html):
     <script src="stats.js"></script> <script src="ns4-math.js"></script> <script src="ns4-content.js"></script>
     <script> NS4Content.install("vocab", { renderFn: "renderNotes", containerId: "notesContainer" }); </script>
   (apre script prensipal la — li ranplase getUser/saveUser/unlockWithCoins... pou ou)
========================================================= */
(function (global) {
"use strict";

const LEGACY = { vocab: "ns4_unlocked_vocab", fomil: "ns4_unlocked_fomil", exam: "ns4_unlocked_exam" };
let connected = false, inited = false, syncedCb = null;

function safeParse(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* kach plen */ } }
function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
function fdb() { return firebase.database(); }
function toast(m) { if (typeof global.showToast === "function") global.showToast(m); }

function rawUser() { return safeParse("ns4_user") || { coins: 0, status: "FREE" }; }
function getUser() {
  const u = rawUser();
  return (typeof StatsAPI !== "undefined" && StatsAPI.applyPending) ? StatsAPI.applyPending(u) : u;
}
function isPro(u) { u = u || getUser(); return u.status === "PRO" && !!u.proExpireAt && u.proExpireAt > Date.now(); }
function uid() {
  const u = rawUser();
  if (u.uid) return u.uid;
  try { return (firebase.auth().currentUser || {}).uid || null; } catch (e) { return null; }
}

/* ---------- Deblokaj ---------- */
const keyOf = (kind, id) => kind + "_" + id;
const mapKey = () => "ns4_unlocked_map_" + (uid() || "guest");
function localMap() { return safeParse(mapKey()) || {}; }

function isUnlocked(kind, id) {
  const k = keyOf(kind, id);
  const u = rawUser();
  return !!localMap()[k] || !!(u.unlocked && u.unlocked[k]);
}
function unlockedList(kind) {
  const pre = kind + "_";
  const set = {};
  const add = (m) => Object.keys(m || {}).forEach((k) => { if (k.indexOf(pre) === 0) set[k.slice(pre.length)] = 1; });
  add(localMap()); add(rawUser().unlocked);
  return Object.keys(set);
}
function markLocal(kind, id) {
  const m = localMap();
  m[keyOf(kind, id)] = Date.now();
  safeSet(mapKey(), m);
}
function pushServer(kind, id) {
  const u = uid();
  if (!u) return Promise.resolve();
  return fdb().ref("users/" + u + "/unlocked/" + keyOf(kind, id)).set(Date.now()).catch(() => {});
}
function mirrorUser(v) {
  const l = rawUser();
  if (v.coins !== undefined) l.coins = v.coins;
  if (v.unlocked) l.unlocked = v.unlocked;
  safeSet("ns4_user", l);
}

// Melanje deblokaj sèvè ak lokal (lokal ki pa sou sèvè a monte, sèvè ki pa lokal la desann)
function syncUnlocks() {
  const u = uid();
  if (!u) return Promise.resolve();
  // ansyen fòma: tablo id nan localStorage
  Object.keys(LEGACY).forEach((kind) => {
    const arr = safeParse(LEGACY[kind]);
    if (Array.isArray(arr) && arr.length) { arr.forEach((id) => markLocal(kind, id)); }
    if (arr) localStorage.removeItem(LEGACY[kind]);
  });
  return withTimeout(fdb().ref("users/" + u + "/unlocked").once("value"), 6000).then((snap) => {
    const server = snap.val() || {};
    const local = localMap();
    const merged = Object.assign({}, server, local);
    safeSet(mapKey(), merged);
    const ups = {};
    Object.keys(local).forEach((k) => { if (!server[k]) ups["users/" + u + "/unlocked/" + k] = local[k]; });
    if (Object.keys(ups).length) fdb().ref().update(ups).catch(() => {});
    const l = rawUser(); l.unlocked = merged; safeSet("ns4_user", l);
  }).catch(() => { /* offline: kontinye ak lokal */ });
}

/* Peye ak pyès: tranzaksyon sou sèvè a. -> "ok" | "coins" | "offline" | "error" | "nouser" */
function unlockWithCoins(kind, id, cost) {
  const u = uid();
  if (!u) return Promise.resolve("nouser");
  cost = Math.max(0, Math.floor(Number(cost) || 0));
  if (isUnlocked(kind, id)) return Promise.resolve("ok");
  if (cost === 0) { markLocal(kind, id); pushServer(kind, id); return Promise.resolve("ok"); }
  if (!connected) return Promise.resolve("offline");

  const key = keyOf(kind, id);
  return withTimeout(fdb().ref("users/" + u).transaction(function (d) {
    if (d === null) return d;
    if (d.unlocked && d.unlocked[key]) return;             // deja debloke sou sèvè a
    if ((d.coins || 0) < cost) return;                     // pa gen ase pyès (sou SÈVÈ a)
    d.coins = (d.coins || 0) - cost;
    d.unlocked = Object.assign({}, d.unlocked || {});
    d.unlocked[key] = Date.now();
    return d;
  }, undefined, false), 15000).then((res) => {
    const v = res.snapshot && res.snapshot.val();
    if (v && v.unlocked && v.unlocked[key]) { markLocal(kind, id); mirrorUser(v); return "ok"; }
    return "coins";
  }).catch((err) => (err && err.message === "timeout" ? "offline" : "error"));
}

/* Deblokaj ak piblisite (rekonpans). Si ou gen NS4_AD_BRIDGE.showRewarded() li itilize l; sinon li simile 2.5 segonn. */
function unlockByAd(kind, id) {
  let p;
  if (global.NS4_AD_BRIDGE && typeof global.NS4_AD_BRIDGE.showRewarded === "function") {
    try { p = Promise.resolve(global.NS4_AD_BRIDGE.showRewarded()); } catch (e) { p = Promise.resolve(false); }
  } else {
    p = new Promise((r) => setTimeout(() => r(true), 2500));
  }
  return p.then((ok) => { if (ok) { markLocal(kind, id); pushServer(kind, id); } return !!ok; });
}

/* ---------- Demaraj ---------- */
function init(onSynced) {
  if (onSynced) syncedCb = onSynced;
  if (inited) return;
  inited = true;
  try { fdb().ref(".info/connected").on("value", (s) => { connected = s.val() === true; }); } catch (e) { /* pa gen firebase */ }
  if (typeof StatsAPI !== "undefined") {
    StatsAPI.onChange = function () { if (typeof global.refreshCoinDisplay === "function") global.refreshCoinDisplay(); };
    if (StatsAPI.start) StatsAPI.start();
  }
  try {
    firebase.auth().onAuthStateChanged((user) => {
      if (!user) return;
      syncUnlocks().then(() => { if (syncedCb) syncedCb(); });
    });
  } catch (e) { /* pa gen auth */ }
}

/* ---------- Shim pou vocab.html / fomil.html ---------- */
function install(kind, o) {
  o = o || {};
  const costOf = o.costOf || function () { return 15; };
  const pending = () => (typeof pendingUnlockId !== "undefined" ? pendingUnlockId : null);   // "let" nan paj la

  global.getUser = getUser;
  global.saveUser = function () { /* pa ekri pyès an absoli ankò */ };
  global.isPro = isPro;
  global.getUnlocked = function () { return unlockedList(kind); };
  global.addUnlocked = function (id) { markLocal(kind, id); pushServer(kind, id); };
  global.refreshCoinDisplay = function () {
    const el = document.getElementById("coinCount");
    if (el) el.innerText = getUser().coins || 0;
  };

  const afterUnlock = function () {
    if (typeof global.closeUnlock === "function") global.closeUnlock();
    global.refreshCoinDisplay();
    if (o.renderFn && typeof global[o.renderFn] === "function") global[o.renderFn]();
  };

  global.unlockWithCoins = function () {
    const id = pending();
    if (!id) return;
    unlockWithCoins(kind, id, costOf(id)).then((r) => {
      if (r === "ok") { toast("Kontni an debloke ✅"); afterUnlock(); }
      else if (r === "coins") toast("Ou pa gen ase pyès sou kont ou. Ou ka gade yon piblisite pito.");
      else if (r === "offline") toast("Pou peye ak pyès, ou dwe konekte sou entènèt.");
      else toast("Erè. Eseye ankò.");
    });
  };
  global.unlockWithAd = function () {
    const id = pending();
    if (!id) return;
    toast("Piblisite ap chaje...");
    unlockByAd(kind, id).then((ok) => {
      if (ok) { toast("Mèsi! Kontni an debloke 🎉"); afterUnlock(); }
      else toast("Piblisite a pa fini. Pa gen deblokaj.");
    });
  };

  // Chak fwa paj la (re)rann lis la: mete delimitè fòmil + MathJax
  if (o.renderFn && o.containerId) {
    const orig = global[o.renderFn];
    if (typeof orig === "function" && !orig.__ns4) {
      const wrapped = function () {
        const r = orig.apply(this, arguments);
        try {
          const el = document.getElementById(o.containerId);
          if (el && global.NS4Math) global.NS4Math.processDom(el);
        } catch (e) { /* pa kase paj la */ }
        return r;
      };
      wrapped.__ns4 = true;
      global[o.renderFn] = wrapped;
    }
  }

  init(function () {
    global.refreshCoinDisplay();
    if (o.renderFn && typeof global[o.renderFn] === "function") global[o.renderFn]();
  });
  global.refreshCoinDisplay();
}

global.NS4Content = {
  init: init, install: install,
  getUser: getUser, isPro: isPro, uid: uid,
  isUnlocked: isUnlocked, unlockedList: unlockedList,
  unlockWithCoins: unlockWithCoins, unlockByAd: unlockByAd,
  syncUnlocks: syncUnlocks
};

})(window);