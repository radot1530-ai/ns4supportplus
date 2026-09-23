/* ================= NS4 ADS — infrastructure commune ================= */
const NS4Ads = {
  isPro() {
    try {
      const u = JSON.parse(localStorage.getItem('ns4_user') || '{}');
      return u.status === 'PRO' && (!u.proExpireAt || u.proExpireAt > Date.now());
    } catch (e) { return false; }
  },

  // Bannière permanente de home.html — visible pour TOUT LE MONDE (FREE + PRO)
  showHomeBanner() {
    if (window.AndroidAds) window.AndroidAds.setBannerVisible(true);
  },

  // Bannière des autres pages (quiz, milti, defi) — jamais pour PRO
  applyPageBanner(showForFree) {
    if (!window.AndroidAds) return;
    const show = !this.isPro() && !!showForFree;
    window.AndroidAds.setBannerVisible(show);
  },

  // Interstitiel — jamais pour PRO ; callback appelé dans tous les cas (pub vue, refusée, ou indisponible)
  showInterstitial(callback) {
    const done = callback || function () {};
    if (this.isPro() || !window.AndroidAds) { done(); return; }
    window._ns4AdsCallback = done;
    window.AndroidAds.showInterstitial();
  },

  // Verrou rewarded obligatoire (vocab/fòmil/exam) — PRO passe direct
  requireRewarded(onUnlocked, onNotReady) {
    if (this.isPro() || !window.AndroidAds) { onUnlocked(); return; }
    window._ns4RewardGateCallback = onUnlocked;
    window._ns4RewardGateNotReady = onNotReady || function () {};
    window.AndroidAds.showRewardedAd('unlock_note');
  }
};

// ---------- Callbacks appelés depuis MainActivity.java ----------

function onInterstitialClosed() {
  if (typeof window._ns4AdsCallback === 'function') {
    const cb = window._ns4AdsCallback;
    window._ns4AdsCallback = null;
    cb();
  }
}

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