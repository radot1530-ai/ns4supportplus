/* ================= NS4 ADS — pont commun pour toutes les pages ================= */

// Contrat attendu par le système Ads déjà présent dans quiz.js — réutilisable ailleurs aussi
window.NS4_AD_BRIDGE = {
  showBanner(id) {
    if (window.AndroidAds) window.AndroidAds.setBannerVisible(true);
  },
  hideBanner() {
    if (window.AndroidAds) window.AndroidAds.setBannerVisible(false);
  },
  showInterstitial(id) {
    return new Promise((resolve) => {
      if (!window.AndroidAds) { resolve(); return; }
      window._ns4InterstitialResolve = resolve;
      window.AndroidAds.showInterstitial();
    });
  }
};

// Callback natif (MainActivity.java) quand l'interstitiel se ferme
function onInterstitialClosed() {
  if (typeof window._ns4InterstitialResolve === 'function') {
    const r = window._ns4InterstitialResolve;
    window._ns4InterstitialResolve = null;
    r();
  }
}

// Vérification PRO partagée (même logique que partout ailleurs dans le code)
function ns4IsPro() {
  try {
    const u = JSON.parse(localStorage.getItem('ns4_user') || '{}');
    return u.status === 'PRO' && !!u.proExpireAt && u.proExpireAt > Date.now();
  } catch (e) { return false; }
}

// Verrou rewarded obligatoire (vocab/fòmil/exam) — PRO passe direct
function ns4RequireRewarded(onUnlocked, onNotReady) {
  if (ns4IsPro() || !window.AndroidAds) { onUnlocked(); return; }
  window._ns4RewardGateCallback = onUnlocked;
  window._ns4RewardGateNotReady = onNotReady || function () {};
  window.AndroidAds.showRewardedAd('unlock_note');
}

// Callbacks natifs pour rewarded (coins + unlock_note)
function onAdRewardEarned(purpose) {
  if (purpose === 'coins') {
    if (typeof StatsAPI !== 'undefined') StatsAPI.addReward(5, 10, "ads");
    if (typeof showToast === 'function') showToast("Mèsi dèske w te gade piblisite a!", "📺");
  }
  if (purpose === 'unlock_note' && window._ns4RewardGateCallback) {
    const cb = window._ns4RewardGateCallback;
    window._ns4RewardGateCallback = null;
    cb();
  }
}

function onAdNotReady(purpose) {
  if (typeof showToast === 'function') showToast("Piblisite a poko pare, eseye ankò nan kèk segonn.", "⚠️");
  if (purpose === 'unlock_note' && window._ns4RewardGateNotReady) {
    const cb = window._ns4RewardGateNotReady;
    window._ns4RewardGateNotReady = null;
    cb();
  }
}

// Bannière simple pour pages SANS système Ads propre (milti, defi, home)
function ns4ShowBanner() {
  if (!ns4IsPro() && window.AndroidAds) window.AndroidAds.setBannerVisible(true);
}
function ns4HideBanner() {
  if (window.AndroidAds) window.AndroidAds.setBannerVisible(false);
}