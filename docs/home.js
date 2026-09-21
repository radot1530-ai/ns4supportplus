/*=========================================================
  1. FIREBASE CONFIG & INITIALIZATION
=========================================================*/
const firebaseConfig = {
    apiKey: "AIzaSyDxN2jYclFAeSh9tMvkoeZCTsFvWNQYOzA",
    authDomain: "ns4supportplus.firebaseapp.com",
    projectId: "ns4supportplus",
    storageBucket: "ns4supportplus.firebasestorage.app",
    messagingSenderId: "1072291248908",
    appId: "1:1072291248908:web:711d01129b833847c5a729",
    measurementId: "G-DEYNQ8GQ9B"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();
const auth = firebase.auth();

/*=========================================================
  2. STATE, CONSTANTS & HELPERS
  (tout const/let yo isit anvan nenpòt fonksyon kouri)
=========================================================*/
const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_CFG_KEY = "ns4_payment_cfg";

let localUser = safeParse("ns4_user");   // kopi lokal (sèlman pou afichaj rapid)
let serverUser = null;                   // dènye done ki soti sou sèvè a (sous verite)
let serverOffset = 0;                    // dekalaj ant revèy telefòn nan ak sèvè a
localStorage.removeItem("ns4_pending_pro"); // ansyen vèsyon offline la: efase rès li
let userRef = null;
let firebaseConnected = false;
let expiryChecked = false;
let leaderboardSynced = false;
let submittingPro = false;
let buyingPro = false;

const $ = (id) => document.getElementById(id);

function setText(id, value) {
    const el = $(id);
    if (el) el.innerText = value;
}

function setDisplay(id, visible) {
    const el = $(id);
    if (el) el.style.display = visible ? "block" : "none";
}

function safeParse(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* kach plen */ }
}

function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));}

// Fè yon URL sekirize pou background-image (bloke guillemet, parantèz, espas)
function cssUrl(u) {
    const s = String(u || "").trim();
    if (!/^(https?:\/\/|data:image\/)/i.test(s)) return "none";
    return "url('" + s.replace(/['"()\\\s]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")) + "')";
}

function whenReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
}

function formatDate(ms) {
    const d = new Date(ms);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// Offline, once("value") ka rete an pann pou tout tan; sa fòse yon erè apre ms
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}

// Tan sèvè a (pou yon revèy telefòn ki mal reglé pa ka triche/bloke PRO)
function serverNow() { return Date.now() + serverOffset; }

// PRO valab sèlman si gen yon dat ekspirasyon ki poko pase
function isProActive(u) {
    return !!u && u.status === "PRO" && !!u.proExpireAt && u.proExpireAt > serverNow();
}

/*=========================================================
  3. AUTHENTICATION & OFFLINE CAPABILITY
=========================================================*/
// Koneksyon Firebase (vre eta rezo a, pa sèlman navigator.onLine)
db.ref(".info/serverTimeOffset").on("value", (snap) => { serverOffset = snap.val() || 0; });
db.ref(".info/connected").on("value", (snap) => {
    firebaseConnected = snap.val() === true;
    setDisplay("pro-offline-note", !firebaseConnected);
});

// Otorite se Firebase Auth (pa localStorage). Sa fè kont lan mache sou nenpòt telefòn.
auth.onAuthStateChanged((user) => {
    if (!user) {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
        return;
    }
    // Lòt kont sou menm telefòn: pa kenbe done kont anvan an
    if (localUser && localUser.uid && localUser.uid !== user.uid) {
        localUser = null;
        serverUser = null;
        localStorage.removeItem("ns4_user");
    }
    attachUserListener(user.uid);
});

function attachUserListener(uid) {
    if (userRef) userRef.off();
    userRef = db.ref("users/" + uid);

    userRef.on("value", (snap) => {
        if (!snap.exists()) return;
        const data = snap.val();

        // Sèvè a gen dènye mo pou sa ki enpòtan (pyès, PRO, XP...)
        const merged = { ...(localUser || {}), ...data, uid };
        ["coins", "status", "proExpireAt", "xp", "level", "streak", "rank", "quizStats", "rewardIds"].forEach((k) => {
            merged[k] = data[k];
        });
        serverUser = merged;

        refreshUser();
        checkProExpiry(serverUser);

        // Ranje antre klasman an (yon fwa pa sesyon) pou XP parèt sou lòt telefòn yo tou
        if (!leaderboardSynced && typeof StatsAPI !== "undefined" && StatsAPI.syncLeaderboard) {
            leaderboardSynced = true;
            StatsAPI.syncLeaderboard();
        }
    }, (err) => console.error("Erè lekti itilizatè:", err));
}

// Mete afichaj la ajou ak dènye done sèvè a
function refreshUser() {
    const base = serverUser || safeParse("ns4_user");   // verite sèvè a
    if (!base) return;
    safeSet("ns4_user", base);
    // Sa moun nan wè = verite + pwen ki sove offline men poko voye (yo pa disparèt)
    localUser = (typeof StatsAPI !== "undefined" && StatsAPI.applyPending) ? StatsAPI.applyPending(base) : base;
    updateDOMWithUserData(localUser);
}

function checkProExpiry(u) {
    if (expiryChecked || !u || !u.uid) return;
    if (u.status === "PRO" && u.proExpireAt && u.proExpireAt <= serverNow()) {
        expiryChecked = true;
        db.ref("users/" + u.uid).update({ status: "FREE" }).catch(() => {});
    }
}

function logout() {
    if (userRef) userRef.off();
    if (localUser && localUser.uid) {
        db.ref(`users/${localUser.uid}`).update({ isConnected: false }).catch(() => {});
    }
    auth.signOut().then(() => {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    }).catch((err) => console.error("Erè:", err));
}

/*=========================================================
  4. PRO VERSION LOGIC — ONLINE SÈLMAN
  - Acha PRO a fèt sou sèvè a (tranzaksyon): sèvè a tcheke pyès
    ki VRÈMAN nan kont lan, pa sa ki nan localStorage.
  - Pri plan yo soti nan /config/pro_plans (admin fikse yo),
    pa nan bouton HTML la, kidonk pyès/pri modifye pa fonksyone.
  - PRO a sove sou kont lan (sèvè), kidonk li swiv kont lan sou
    nenpòt telefòn. Anyen pa sove kòm "PRO" sou yon sèl telefòn.
  - Règ Firebase yo (firebase-rules-ajoute.json) bloke nenpòt
    ekriti dirèk ki eseye bay tèt li PRO san peye.
=========================================================*/
function showProPanel(name) {
    ["plans", "annual", "pending", "active"].forEach((n) => setDisplay("pro-panel-" + n, n === name));
}

function showProModal() {
    const u = localUser || {};

    if (isProActive(u)) {
        setText("pro-expire-date", formatDate(u.proExpireAt));
        showProPanel("active");
    } else if (u.pendingProRequest) {
        showProPanel("pending");
    } else {
        showProPanel("plans");
    }

    // Opsyonèl: <div id="pro-offline-note">PRO mande entènèt.</div> nan modal la
    setDisplay("pro-offline-note", !firebaseConnected);

    loadPaymentConfig();

    const modal = $("pro-modal");
    if (modal) modal.classList.add("show");
}

function showPaymentNumbers(cfg, state) {
    const empty = state === "loading" ? "Ap chaje..."
                : state === "failed" ? "Konekte pou wè nimewo a"
                : "Pa konfigire ankò";
    setText("moncash-number", cfg.moncash || empty);
    setText("natcash-number", cfg.natcash || empty);
}

// Nimewo peman yo kache lokalman; pa janm rete bloke si offline
function loadPaymentConfig() {
    const cached = safeParse(PAYMENT_CFG_KEY) || {};
    showPaymentNumbers(cached, "loading");

    withTimeout(db.ref("config/payment").once("value"), 6000)
        .then((snap) => {
            const cfg = snap.val() || {};
            safeSet(PAYMENT_CFG_KEY, cfg);
            showPaymentNumbers(cfg, "ok");
        })
        .catch(() => showPaymentNumbers(cached, "failed"));
}

function showRenewOptions() { showProPanel("plans"); }
function closeProModal() { const m = $("pro-modal"); if (m) m.classList.remove("show"); }
function showAnnualPaymentForm() { showProPanel("annual"); }
function backToPlans() { showProPanel("plans"); }

// Peman anyèl (MonCash/NatCash) -> admin verifye. Bezwen entènèt.
function submitProPaymentRequest() {
    if (!localUser || !localUser.uid) return;
    if (submittingPro) return;

    if (!firebaseConnected) {
        showToast("PRO mande entènèt. Konekte epi eseye ankò.", "📡");
        return;
    }

    const method = ($("payment-method") || {}).value;
    const reference = (($("payment-reference") || {}).value || "").trim();

    if (!reference) {
        showToast("Mete ID tranzaksyon an anvan ou voye.", "⚠️");
        return;
    }

    submittingPro = true;
    const request = {
        uid: localUser.uid,
        pseudo: localUser.pseudo || "Itilizatè",
        method: method,
        reference: reference,
        amount: 250,
        plan: "annual",
        status: "pending",
        requestedAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref("pro_requests").push(request)
        .then(() => db.ref("users/" + localUser.uid).update({ pendingProRequest: true }))
        .then(() => {
            showProPanel("pending");
            showToast("Demann ou voye pou verifikasyon!", "✅");
        })
        .catch((err) => {
            console.error(err);
            showToast("Erè pandan l ap voye demann lan.", "❌");
        })
        .then(() => { submittingPro = false; });
}

// Tranzaksyon sou sèvè a: li pyès reyèl yo, dedwi, epi bay PRO a nan yon sèl ekriti.
function runProPurchase(uid, days, cost) {
    return db.ref("users/" + uid).transaction((u) => {
        if (u === null) return u;                       // pa gen kach: sèvè a ap rele ankò ak vre done yo
        if ((u.coins || 0) < cost) return;              // pa gen ase pyès sou sèvè a -> abandone

        const now = serverNow();
        const base = (u.proExpireAt && u.proExpireAt > now) ? u.proExpireAt : now;
        u.coins = (u.coins || 0) - cost;
        u.status = "PRO";
        u.proExpireAt = base + days * DAY_MS;
        return u;
    }, undefined, false);
}

// Achte PRO ak pyès (semèn/mwa). Sèlman online. (2yèm paramèt la pa itilize ankò: pri a soti sou sèvè.)
function buyPro(duration) {
    if (!localUser || !localUser.uid || buyingPro) return;

    if (!firebaseConnected) {
        showToast("PRO mande entènèt. Konekte epi eseye ankò.", "📡");
        return;
    }

    const planKey = duration === "week" ? "week" : "month";
    const days = planKey === "week" ? 7 : 30;
    const uid = localUser.uid;

    buyingPro = true;
    showToast("Ap trete acha w la...", "⏳");

    withTimeout(db.ref("config/pro_plans/" + planKey).once("value"), 8000)
        .then((snap) => {
            const cost = Math.floor(Number(snap.val()) || 0);
            if (cost <= 0) throw new Error("NO_PRICE");
            return withTimeout(runProPurchase(uid, days, cost), 15000);
        })
        .then((res) => {
            const v = res.snapshot && res.snapshot.val();
            if (res.committed && v && v.status === "PRO") {
                closeProModal();
                showToast("Felisitasyon! Ou se itilizatè PRO kounye a.", "👑");
            } else {
                showToast("Ou pa gen ase pyès pou w achte plan sa a.", "❌");
            }
        })
        .catch((err) => {
            console.error("Erè acha PRO:", err);
            if (err && err.message === "NO_PRICE") {
                showToast("Pri plan sa a poko konfigire. Kontakte admin.", "⚠️");
            } else if (err && err.message === "timeout") {
                showToast("Pa t kapab konfime acha a. Verifye eta PRO ou epi eseye ankò.", "📡");
            } else {
                showToast("Acha a pa t pase. Eseye ankò.", "❌");
            }
        })
        .then(() => { buyingPro = false; });
}

/*=========================================================
  5. UI, TOAST & NAV LOGIC
=========================================================*/
let toastTimeout;
function showToast(message, icon = "ℹ️") {
    const toast = $("toast");
    const msgElement = $("toast-message");
    const iconElement = $("toast-icon");
    if (!toast || !msgElement || !iconElement) return;

    msgElement.innerText = message;
    iconElement.innerText = icon;
    toast.classList.add("show");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 3500);
}

function simulateNav(pageName) {
    showToast(`Ouvèti paj: ${pageName}...`, "🔄");
}

function toggleMainMenu() {
    const menu = $("main-menu");
    const overlay = $("menu-overlay");
    if (menu && overlay) {
        menu.classList.toggle("open");
        overlay.classList.toggle("show");
    }
}

function activateTab(element) {
    document.querySelectorAll(".bottom-item").forEach((tab) => tab.classList.remove("active"));
    element.classList.add("active");
}

/*=========================================================
  6. SLIDER DINAMIK (Firebase /sliders + kach offline)
  Admin ajoute slide yo nan admin.html
=========================================================*/
const DEFAULT_SLIDES = [
    { title: "Nouvo Kou Matematik", sub: "Prepare egzamen ofisyèl ou yo!", img: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80" },
    { title: "Tounwa Samdi a", sub: "Genyen jiska 500 Pyès (Coins)", img: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80" },
    { title: "Mizajou PRO", sub: "Dekouvri tout nouvo opsyon yo.", img: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80" }
];

let currentSlide = 0;
let slideCount = 3;
let slideInterval;
let lastSlidesJSON = "";

function initSlider() {
    // 1. Kach lokal an premye (offline)
    const cached = safeParse("ns4_sliders");
    renderSlider(cached && cached.length ? cached : DEFAULT_SLIDES);

    // 2. Done admin yo sou Firebase
    db.ref("sliders").on("value", (snap) => {
        const list = [];
        snap.forEach((child) => {
            const v = child.val();
            if (v && v.active !== false && (v.img || v.title)) list.push({ id: child.key, ...v });
        });
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        if (list.length) {
            safeSet("ns4_sliders", list);
            renderSlider(list);
        } else {
            localStorage.removeItem("ns4_sliders");
            renderSlider(DEFAULT_SLIDES);
        }
    }, (err) => console.error("Erè slider:", err));
}

function renderSlider(slides) {
    const track = $("slider-track");
    const dotsContainer = $("slider-dots");
    if (!track || !dotsContainer) return;

    // Pa re-desine si anyen pa chanje (pou slide a pa sote)
    const json = JSON.stringify(slides);
    if (json === lastSlidesJSON) return;
    lastSlidesJSON = json;

    slideCount = slides.length;
    track.style.width = `${slideCount * 100}%`;

    let slidesHTML = "";
    let dotsHTML = "";

    slides.forEach((slide, index) => {
        const bg = slide.img
            ? `background-image: ${cssUrl(slide.img)};`
            : "background-image: linear-gradient(135deg, #24439a, #1d3783);";
        slidesHTML += `
            <div class="slide" style="width: ${100 / slideCount}%; ${escapeHtml(bg)}">
                <div class="slide-content">
                    <div class="promo-main-text">${escapeHtml(slide.title || "")}</div>
                    <div class="promo-sub-text">${escapeHtml(slide.sub || "")}</div>
                </div>
            </div>`;
        dotsHTML += `<button class="slider-dot ${index === 0 ? "active" : ""}" onclick="goToSlide(${index})" aria-label="Slide ${index + 1}"></button>`;
    });

    track.innerHTML = slidesHTML;
    dotsContainer.innerHTML = dotsHTML;

    currentSlide = 0;
    updateSliderPosition();
    resetInterval();
}

function updateSliderPosition() {
    const track = $("slider-track");
    if (!track) return;
    track.style.transform = `translateX(-${currentSlide * (100 / slideCount)}%)`;
    document.querySelectorAll(".slider-dot").forEach((dot, i) => {
        dot.classList.toggle("active", i === currentSlide);
    });
}

function goToSlide(index) {
    currentSlide = index;
    updateSliderPosition();
    resetInterval();
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slideCount;
    updateSliderPosition();
}

function resetInterval() {
    clearInterval(slideInterval);
    if (slideCount > 1) slideInterval = setInterval(nextSlide, 4000);
}


function updateDOMWithUserData(data) {
    if (!data) return;

    setText("profile-name", data.pseudo || "Itilizatè");
    setText("user-coins", data.coins ?? 0);
    setText("user-streak", data.streak ?? 0);
    setText("user-rank", data.rank ? "#" + data.rank : "#-");

    const avatar = $("user-avatar");
    if (avatar) {
        avatar.src = data.photoURL ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(data.pseudo || "U")}&background=ffffff&color=24439a&bold=true`;
    }

    // Stati PRO (pa gen okenn ekriti Firebase isit la ankò)
    const isPro = isProActive(data);
    const statusEl = $("user-status");
    if (statusEl) {
        statusEl.innerText = isPro ? "PRO" : "FREE";
        statusEl.style.color = isPro ? "#ffc107" : "inherit";
    }
    const statusIcon = $("user-status-icon");
    if (statusIcon) statusIcon.innerText = isPro ? "👑" : "⭐";

    // XP ak Nivo (chak 100 XP = 1 nivo)
    const xp = data.xp || 0;
    const level = Math.floor(xp / 100) + 1;
    const currentLevelXP = xp % 100;

    setText("user-level", `Nivo ${level}`);
    setText("user-xp-text", `${currentLevelXP} / 100 XP`);
    const fill = $("xp-bar-fill");
    if (fill) fill.style.width = `${currentLevelXP}%`;
}

// Gade piblisite pou fè pyès
let watchingAd = false;
function watchAdForCoins() {
    showToast("Piblisite ap chaje...", "⏳");
    if (window.AndroidAds) {
        window.AndroidAds.showRewardedAd();
    } else {
        showToast("Pa disponib sou navigatè, sèlman sou app la.", "⚠️");
    }
}

// 🔵 Appelée par MainActivity.java quand la récompense est gagnée
function onAdRewardEarned() {
    StatsAPI.addReward(5, 10, "ads");
    showToast("Mèsi dèske w te gade piblisite a!", "📺");
}

function onAdNotReady() {
    showToast("Piblisite a poko pare, eseye ankò nan kèk segonn.", "⚠️");
}

/*=========================================================
  8. DEMARE
=========================================================*/
window.addEventListener("load", initSlider);

whenReady(() => {
    if (localUser && localUser.uid) refreshUser();   // afichaj imedya (offline)
    if (typeof StatsAPI !== "undefined") {
        StatsAPI.onChange = refreshUser;              // pwen voye/sove -> mete afichaj la ajou
        StatsAPI.start();                             // voye pwen ki an atant lè entènèt la tounen
    }
    // Si PRO ekspire pandan aplikasyon an ouvè, mete UI a ajou chak minit
    setInterval(() => { if (localUser) updateDOMWithUserData(localUser); }, 60000);
});
