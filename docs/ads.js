/* =========================================================================
   NS4 ADS — module UNIQUE de pub (AdMob via le pont Android "AndroidAds")
   Chargé sur toutes les pages. Tout se règle dans NS4_ADS_CFG ci-dessous.

   FREE : bannière + interstitiels (aux pauses naturelles) + rewarded
          (nòt/fòmil/egzamen + pièces de la home)
   PRO  : AUCUNE bannière, AUCUN verrou, AUCUNE pub-pièces.
          Seulement de rares interstitiels "monétisation" (pas d'objectif).
   ========================================================================= */
(function (global) {
  "use strict";

  /* ----------------------------- RÉGLAGES ----------------------------- */
  const NS4_ADS_CFG = {
    // Pages où la bannière FREE s'affiche (nom de fichier sans .html)
    bannerPages: ["home", "quiz", "vocab", "fòmil", "exam", "milti", "defi", "ranking"],

    free: { everyN: 2, minGapMs: 3 * 60 * 1000 },   // 1 interstitiel toutes les 2 activités, min 3 min d'écart
    pro:  { everyN: 6, minGapMs: 12 * 60 * 1000 },  // PRO : rare (toutes les 6 activités, min 12 min)

    // Nòt (vocab / fòmil / egzamen) : 1 pub regardée = accès pendant X minutes
    // 0 = une pub À CHAQUE ouverture de matière / chapitre / examen
    notePassMinutes: 30,

    // Pièces de la home
    coinAd: { coins: 10, xp: 5, cooldownMs: 30 * 1000, dailyMax: 10 },

    // true  = dans un navigateur (hors app) on laisse passer sans pub (comportement actuel)
    // false = hors app, les nòt gardées restent fermées ("ouvre dans l'app")
    allowWebWithoutAds: true,

    // Si la pub n'est pas dispo 2 fois de suite (pas de fill), on ouvre 5 min
    // pour ne pas bloquer l'élève à cause d'un manque d'annonceurs.
    graceAfterFails: 2,
    graceMinutes: 5
  };

  /* ------------------------------ ÉTAT -------------------------------- */
  const KEY = "ns4_ads_state";
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  function today() { return new Date().toISOString().slice(0, 10); }
  function toast(msg, icon) { if (typeof global.showToast === "function") global.showToast(msg, icon || "ℹ️"); }

  function isPro() {
    try {
      const u = JSON.parse(localStorage.getItem("ns4_user") || "{}");
      return u.status === "PRO" && !!u.proExpireAt && u.proExpireAt > Date.now();
    } catch (e) { return false; }
  }
  function inApp() { return !!global.AndroidAds; }
  function pageName() {
    try {
      const f = decodeURIComponent(location.pathname.split("/").pop() || "");
      return f.replace(/\.html$/, "") || "index";
    } catch (e) { return ""; }
  }

  /* ----------------------------- BANNIÈRE ----------------------------- */
  function bannerWanted() {
    return inApp() && !isPro() && NS4_ADS_CFG.bannerPages.indexOf(pageName()) !== -1;
  }
  function applyBanner() {
    if (!inApp()) return;
    try { global.AndroidAds.setBannerVisible(bannerWanted()); } catch (e) {}
  }
  function hideBanner() { if (inApp()) { try { global.AndroidAds.setBannerVisible(false); } catch (e) {} } }

  /* ------------------------ REWARDED (Promise<bool>) ------------------- */
  let waiting = null;   // { res, timer }
  function settle(ok) {
    if (!waiting) return;
    clearTimeout(waiting.timer);
    const r = waiting.res; waiting = null;
    r(ok);
  }
  // Résout true seulement si la récompense est gagnée
  function showRewarded(purpose) {
    return new Promise((resolve) => {
      if (!inApp()) { resolve(!!NS4_ADS_CFG.allowWebWithoutAds); return; }
      if (waiting) { resolve(false); return; }
      waiting = { res: resolve, timer: setTimeout(() => settle(false), 5 * 60 * 1000) };
      try { global.AndroidAds.showRewardedAd(purpose || "generic"); }
      catch (e) { settle(false); }
    });
  }
  // Callbacks appelés par MainActivity.java
  global.onAdRewardEarned = function () {
    const s = load(); s.fails = 0; s.last = Date.now(); save(s);
    settle(true);
  };
  global.onAdNotReady = function () {
    const s = load(); s.fails = (s.fails || 0) + 1; save(s);
    toast("Piblisite a poko pare, eseye ankò nan kèk segonn.", "⚠️");
    settle(false);
  };
  global.onAdClosedNoReward = function () {
    toast("Gade piblisite a jiska la fen pou w jwenn aksè a.", "ℹ️");
    settle(false);
  };

  /* --------------------------- INTERSTITIEL ---------------------------- */
  let interWait = null;
  global.onInterstitialClosed = function () {
    if (interWait) { const r = interWait; interWait = null; r(); }
  };
  function showInterstitial() {
    return new Promise((resolve) => {
      if (!inApp() || document.hidden) { resolve(false); return; }
      const t0 = Date.now();
      interWait = function () {
        const shown = Date.now() - t0 > 600;   // fermé aussitôt = pas de pub dispo
        if (shown) { const s = load(); s.last = Date.now(); save(s); }
        resolve(shown);
      };
      try { global.AndroidAds.showInterstitial(); } catch (e) { interWait = null; resolve(false); }
    });
  }
  // À appeler aux pauses naturelles (fin de leçon, de match, de défi...)
  function maybeInterstitial(/* reason */) {
    if (!inApp()) return;
    const tier = isPro() ? NS4_ADS_CFG.pro : NS4_ADS_CFG.free;
    const s = load();
    s.n = (s.n || 0) + 1; save(s);
    if (s.n % tier.everyN !== 0) return;
    if (Date.now() - (s.last || 0) < tier.minGapMs) return;
    setTimeout(showInterstitial, 800);
  }

  /* ------------------------- PASSE D'ACCÈS AUX NÒT --------------------- */
  function hasPass(kind) {
    if (isPro()) return true;
    const t = (load().passes || {})[kind];
    return !!t && Date.now() < t;
  }
  function grantPass(kind, minutes) {
    const s = load(); s.passes = s.passes || {};
    s.passes[kind] = Date.now() + (minutes == null ? NS4_ADS_CFG.notePassMinutes : minutes) * 60000;
    save(s);
  }

  const LABELS = { vocab: "nòt yo", fomil: "fòmil yo", exam: "egzamen an" };
  let gateEl = null;
  function closeGate() { if (gateEl) { gateEl.remove(); gateEl = null; } }

  function openGate(kind, onOk) {
    closeGate();
    const el = document.createElement("div");
    el.className = "ns4-gate-overlay";
    el.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:20px;";
    el.innerHTML =
      '<div style="background:#fff;border-radius:22px;padding:24px 20px;width:100%;max-width:330px;text-align:center;font-family:Inter,system-ui,sans-serif;">' +
      '<div style="font-size:42px;margin-bottom:6px">📺</div>' +
      '<h3 style="font-size:18px;margin:0 0 6px;color:#1a2b5f">Gade yon piblisite kout</h3>' +
      '<p style="font-size:13px;color:#666;margin:0 0 16px">Pou ouvri ' + (LABELS[kind] || "kontni an") + ', gade yon piblisite jiska la fen.' +
      (NS4_ADS_CFG.notePassMinutes > 0 ? ' Apre sa w gen aksè pandan ' + NS4_ADS_CFG.notePassMinutes + ' minit.' : '') + '</p>' +
      '<button id="ns4GateWatch" style="display:block;width:100%;padding:13px;border:0;border-radius:12px;font-weight:700;font-size:14px;background:#24439a;color:#fff;margin-bottom:10px">📺 Gade piblisite a</button>' +
      '<button id="ns4GatePro" style="display:block;width:100%;padding:13px;border:0;border-radius:12px;font-weight:700;font-size:14px;background:#fff3cd;color:#8a6500;margin-bottom:10px">👑 Vin PRO (san piblisite)</button>' +
      '<button id="ns4GateCancel" style="display:block;width:100%;padding:11px;border:0;border-radius:12px;font-weight:600;font-size:13px;background:#eee;color:#555">Anile</button>' +
      '</div>';
    document.body.appendChild(el);
    gateEl = el;
    el.addEventListener("click", (e) => { if (e.target === el) closeGate(); });
    el.querySelector("#ns4GateCancel").onclick = closeGate;
    el.querySelector("#ns4GatePro").onclick = function () { location.href = "home.html"; };
    const btn = el.querySelector("#ns4GateWatch");
    btn.onclick = function () {
      btn.disabled = true; btn.style.opacity = ".6";
      showRewarded("unlock_note").then((ok) => {
        if (ok) {
          grantPass(kind);
          closeGate();
          onOk();
        } else {
          btn.disabled = false; btn.style.opacity = "1";
          const s = load();
          if ((s.fails || 0) >= NS4_ADS_CFG.graceAfterFails) {   // pas de pub dispo : ne pas bloquer l'élève
            s.fails = 0; save(s);
            grantPass(kind, NS4_ADS_CFG.graceMinutes);
            closeGate();
            toast("Pa gen piblisite kounye a. Ou ka kontinye pou kèk minit.", "🎁");
            onOk();
          }
        }
      });
    };
  }

  // Utilisation : NS4Ads.requireNoteAccess('vocab', () => ouvrirLaMatiere())
  function requireNoteAccess(kind, onOk) {
    if (hasPass(kind)) { onOk(); return; }
    if (!inApp() && NS4_ADS_CFG.allowWebWithoutAds) { onOk(); return; }
    if (!inApp()) { toast("Ouvri aplikasyon NS4 Support+ pou wè kontni sa a.", "📱"); return; }
    openGate(kind, onOk);
  }

  /* ---------------------- PUB → PIÈCES (home.html) --------------------- */
  function coinAdState() {
    const s = load();
    if (!s.coin || s.coin.d !== today()) s.coin = { d: today(), c: 0, t: 0 };
    return s;
  }
  function coinAdRemaining() {
    return Math.max(0, NS4_ADS_CFG.coinAd.dailyMax - coinAdState().coin.c);
  }
  function watchForCoins() {
    if (isPro()) { toast("PRO: pa gen piblisite. Pyès yo rete disponib nan lòt fason.", "👑"); return Promise.resolve(false); }
    const s = coinAdState();
    if (s.coin.c >= NS4_ADS_CFG.coinAd.dailyMax) { toast("Ou rive nan limit jodi a (" + NS4_ADS_CFG.coinAd.dailyMax + " piblisite). Tounen demen!", "⏳"); return Promise.resolve(false); }
    const wait = NS4_ADS_CFG.coinAd.cooldownMs - (Date.now() - s.coin.t);
    if (wait > 0) { toast("Tann " + Math.ceil(wait / 1000) + " segonn anvan pwochen piblisite a.", "⏳"); return Promise.resolve(false); }
    if (!inApp()) { toast("Disponib sèlman nan aplikasyon an.", "⚠️"); return Promise.resolve(false); }
    toast("Piblisite ap chaje...", "⏳");
    return showRewarded("coins").then((ok) => {
      if (!ok) return false;
      const st = coinAdState(); st.coin.c++; st.coin.t = Date.now(); save(st);
      const c = NS4_ADS_CFG.coinAd;
      if (typeof global.StatsAPI !== "undefined") global.StatsAPI.addReward(c.xp, c.coins, "ads");
      toast("Mèsi! +" + c.coins + " pyès 🪙", "📺");
      return true;
    });
  }

  /* --------------------------- API PUBLIQUE ---------------------------- */
  global.NS4Ads = {
    cfg: NS4_ADS_CFG,
    isPro: isPro, inApp: inApp,
    applyBanner: applyBanner, hideBanner: hideBanner,
    showRewarded: showRewarded, showInterstitial: showInterstitial, maybeInterstitial: maybeInterstitial,
    requireNoteAccess: requireNoteAccess, hasPass: hasPass,
    watchForCoins: watchForCoins, coinAdRemaining: coinAdRemaining
  };

  /* ----- Compat avec l'ancien code (ns4-content.js, quiz.js, home.js) ----- */
  global.NS4_AD_BRIDGE = {
    showBanner: applyBanner, hideBanner: hideBanner,
    showInterstitial: function () { return showInterstitial(); },
    showRewarded: function () { return showRewarded("unlock_note"); }   // utilisé par NS4Content.unlockByAd
  };
  global.ns4IsPro = isPro;
  global.ns4ShowBanner = applyBanner;
  global.ns4HideBanner = hideBanner;

  // Bannière automatique selon la page (le natif la masque à chaque changement de page)
  function boot() { applyBanner(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
  // Si le statut PRO change pendant que la page est ouverte
  global.addEventListener("storage", function (e) { if (e.key === "ns4_user") applyBanner(); });
  setInterval(applyBanner, 60000);
})(window);
