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

const RANK_LIMIT = 50;
const LB_CACHE_KEY = "ns4_leaderboard_cache";
const MOIS_KREYOL = ["Jan", "Fev", "Mas", "Avr", "Me", "Jen", "Jiy", "Out", "Sept", "Okt", "Nov", "Des"];

let truthUser = safeParse("ns4_user") || {};   // verite sèvè a
let localUser = withPending(truthUser);         // sa moun nan wè: verite + pwen ki poko voye
let serverLoaded = false;   // vre sèlman lè nou li done yo sou sèvè a
let started = false;
let toastTimeout;

/*=========================================================
  DIYAGNOSTIK — ouvri ranking.html?debug=1 pou wè poukisa yon bagay pa mache
=========================================================*/
const DEBUG = /[?&]debug/.test(window.location.search);
const dbg = {};
function setDbg(key, value) {
    dbg[key] = value;
    if (!DEBUG) return;
    let p = document.getElementById("debug-panel");
    if (!p) {
        p = document.createElement("pre");
        p.id = "debug-panel";
        p.style.cssText = "margin:16px 12px 100px;padding:12px;background:#111;color:#0f0;border-radius:10px;font:12px/1.5 monospace;white-space:pre-wrap;word-break:break-word";
        document.body.appendChild(p);
    }
    const pend = (typeof StatsAPI !== "undefined" && StatsAPI.pendingCount) ? StatsAPI.pendingCount() : "stats.js PA chaje";
    const lines = [
        "DIYAGNOSTIK KLASMAN",
        "auth uid          : " + (dbg.uid || "-"),
        "konekte Firebase  : " + (dbg.connected === undefined ? "?" : dbg.connected),
        "lekti users/uid   : " + (dbg.user || "-"),
        "lekti leaderboard : " + (dbg.board || "-"),
        "ekriti leaderboard: " + (dbg.publish || "-"),
        "pwen an atant     : " + pend,
        "dènye erè stats   : " + ((typeof StatsAPI !== "undefined" && StatsAPI.lastError) || "-")
    ];
    p.textContent = lines.join("\n");
}

function describeError(err) {
    const code = (err && (err.code || err.message)) || "erè enkoni";
    if (/permission/i.test(code)) return "PERMISSION_DENIED — règ Firebase yo bloke sa. Mete règ nan firebase-rules-ajoute.json";
    return String(code);
}

/*=========================================================
  2. HELPERS
=========================================================*/
function withPending(u) {
    return (typeof StatsAPI !== "undefined" && StatsAPI.applyPending) ? StatsAPI.applyPending(u) : u;
}
function nz(v, d) { return v == null ? (d === undefined ? 0 : d) : v; }
function safeParse(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function safeSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* kach plen */ }
}
function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
// Offline, once("value") ka rete an pann pou tout tan; sa fòse yon erè apre ms
function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), ms);
        promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
}

function showToast(message, icon = "ℹ️") {
    const toast = document.getElementById("toast");
    const msgElement = document.getElementById("toast-message");
    const iconElement = document.getElementById("toast-icon");
    if (!toast || !msgElement || !iconElement) return;

    msgElement.innerText = message;
    iconElement.innerText = icon;
    toast.classList.add("show");

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 3000);
}

function toggleMainMenu() {
    const menu = document.getElementById("main-menu");
    const overlay = document.getElementById("menu-overlay");
    if (menu && overlay) {
        menu.classList.toggle("open");
        overlay.classList.toggle("show");
    }
}

/*=========================================================
  3. AUTH (Firebase Auth se otorite, pa localStorage)
=========================================================*/
auth.onAuthStateChanged((user) => {
    if (!user) {
        localStorage.removeItem("ns4_user");
        window.location.href = "intro.html";
        return;
    }
    if (started) return;
    started = true;
    setDbg("uid", user.uid);
    try { db.ref(".info/connected").on("value", (s) => setDbg("connected", s.val() === true)); } catch (e) { /* pa gen rezo */ }
    truthUser.uid = user.uid;
    localUser = withPending(truthUser);
    startPage();
});

function logout() {
    if (localUser && localUser.uid) {
        db.ref(`users/${localUser.uid}`).update({ isConnected: false }).catch(() => {});
    }
    auth.signOut().then(() => {
        localStorage.removeItem("ns4_user");
        window.location.href = "intro.html";
    }).catch((err) => console.error("Erè:", err));
}

function startPage() {
    if (typeof StatsAPI !== "undefined") {
        // Lè yon pwen voye sou sèvè a (oswa sove), mete estatistik ak klasman an ajou
        StatsAPI.onChange = () => {
            truthUser = Object.assign({}, truthUser, safeParse("ns4_user") || {});
            localUser = withPending(truthUser);
            renderMyStats();
            if (lastServerBoard) renderBoard(lastServerBoard);
        };
        if (StatsAPI.start) StatsAPI.start();   // voye pwen ki an atant
    }
    renderMyStats(); // pentire ak sa nou gen lokalman touswit

    // Montre klasman ki sove a TOUSWIT (pa tann rezo a), epi mete l ajou apre
    const cachedBoard = safeParse(LB_CACHE_KEY);
    if (cachedBoard && cachedBoard.length) { lastServerBoard = cachedBoard; renderBoard(cachedBoard, "Ap mete ajou...", true); }

    // Chaje vrè done yo sou sèvè a (fonksyone sou nenpòt telefòn)
    withTimeout(db.ref("users/" + localUser.uid).once("value"), 6000)
        .then((snap) => {
            if (snap.exists()) {
                truthUser = Object.assign({}, truthUser, snap.val(), { uid: truthUser.uid });
                localUser = withPending(truthUser);
                serverLoaded = true;
                setDbg("user", "OK (xp sèvè = " + nz(truthUser.xp, 0) + ")");
                // Si telefòn sa a pa t gen anyen nan kach la, sove l (home.js ap konplete l apre)
                if (!safeParse("ns4_user")) safeSet("ns4_user", truthUser);
            }
        })
        .catch((err) => { setDbg("user", "ERÈ: " + describeError(err)); })
        .then(() => {
            renderMyStats();
            publishMyEntry();
            loadLeaderboard();
        });
}

// Asire antre m nan /leaderboard la (itilizatè ki gen XP anvan klasman an te egziste yo tou)
function publishMyEntry() {
    if (!serverLoaded || !truthUser.uid) return;
    const xp = truthUser.xp || 0;          // XP sèvè a (pa pwen ki poko voye: sa yo ap antre apre flush la)
    if (xp <= 0) { setDbg("publish", "pa gen XP sou sèvè (xp = 0), pa ekri"); return; }
    db.ref("leaderboard/" + truthUser.uid).update({
        pseudo: truthUser.pseudo || "Itilizatè",
        xp: xp,
        level: Math.floor(xp / 100) + 1,
        streak: truthUser.streak || 0,
        photoURL: truthUser.photoURL || null
    }).then(() => setDbg("publish", "OK (xp = " + xp + ")"))
      .catch((err) => { console.warn("Ekriti /leaderboard:", err); setDbg("publish", "ERÈ: " + describeError(err)); });
}

/*=========================================================
  4. KLASMAN (TOP 50) — li sèlman /leaderboard,
     jamè /users (pou pa ekspoze email/aparèy moun)
=========================================================*/
function medalFor(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return null;
}

function fallbackAvatar(pseudo) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(pseudo || "U")}&background=24439a&color=fff&bold=true`;
}

function renderBoardRow(rank, entry) {
    const medal = medalFor(rank);
    const isMe = entry.uid === localUser.uid;
    const rankClass = rank <= 3 ? `rank-${rank}` : "";
    const pseudo = entry.pseudo || "Itilizatè";
    const avatar = entry.photoURL || fallbackAvatar(pseudo);

    return `
      <div class="board-row ${isMe ? "me" : ""} ${rankClass}">
        <div class="board-rank ${medal ? "medal" : ""}">${medal || "#" + rank}</div>
        <div class="board-avatar"><img src="${escapeHtml(avatar)}" alt="${escapeHtml(pseudo)}"></div>
        <div class="board-name">${escapeHtml(pseudo)}${isMe ? '<span class="me-badge">ou</span>' : ""}</div>
        <div class="board-xp">${Number(entry.xp) || 0} XP</div>
      </div>
    `;
}

// Mete m nan klasman an ak XP reyèl mwen (sèvè + pwen ki sove offline men poko voye),
// retrye, epi koupe nan Top 50. Konsa klasman an pa "bliye" pwen m fè yo.
function withMe(entries) {
    const myXp = localUser.xp || 0;
    const rows = entries.filter((e) => e.uid !== localUser.uid);
    if (localUser.uid && myXp > 0) {
        rows.push({ uid: localUser.uid, pseudo: localUser.pseudo || "Itilizatè", xp: myXp, photoURL: localUser.photoURL || null });
    }
    rows.sort((a, b) => (Number(b.xp) || 0) - (Number(a.xp) || 0));
    return rows.slice(0, RANK_LIMIT);
}

let lastServerBoard = null;   // dènye /leaderboard ki soti sèvè a (san m ladan l)

function renderBoard(rawEntries, note, fromCache) {
    const list = document.getElementById("board-list");
    if (!list) return;
    const entries = withMe(rawEntries);

    let html = note ? `<div class="state-msg">${escapeHtml(note)}</div>` : "";
    let myRankInList = null;

    entries.forEach((entry, index) => {
        const rank = index + 1;
        if (entry.uid === localUser.uid) myRankInList = rank;
        html += renderBoardRow(rank, entry);
    });
    list.innerHTML = html;

    if (myRankInList) {
        renderMyRankCard(myRankInList, false, entries[myRankInList - 1]);
    } else if (fromCache) {
        renderMyRankCard(localUser.rank || null, false, { pseudo: localUser.pseudo, xp: localUser.xp || 0, photoURL: localUser.photoURL });
    } else {
        computeExactRank();
    }
}

let boardRef = null;

function showBoardOffline(reason) {
    const why = reason ? " (" + reason + ")" : "";
    const cached = lastServerBoard || safeParse(LB_CACHE_KEY);
    if (cached && cached.length) {
        renderBoard(cached, "Dènye klasman ki sove a" + why);
    } else if (!(localUser.xp > 0)) {
        document.getElementById("board-list").innerHTML =
            `<div class="state-msg">Nou pa t kapab chaje klasman an. ${escapeHtml(reason || "Tcheke koneksyon entènèt ou.")}</div>`;
    } else {
        renderBoard([], "Se sèlman pwen ou yo ki parèt" + why);
    }
}

// Klasman an LIVE: li mete l ajou pou kont li lè pwen yo rive sou sèvè a oswa lè lòt moun fè pwen
function loadLeaderboard() {
    if (boardRef) boardRef.off();
    boardRef = db.ref("leaderboard").orderByChild("xp").limitToLast(RANK_LIMIT);

    let answered = false;
    const timer = setTimeout(() => { if (!answered) { setDbg("board", "pa gen repons apre 8 segonn (offline?)"); showBoardOffline("pa gen koneksyon"); } }, 8000);

    boardRef.on("value", (snap) => {
        answered = true;
        clearTimeout(timer);

        const entries = [];
        snap.forEach((child) => {
            entries.push(Object.assign({ uid: child.key }, child.val()));
        });
        entries.reverse(); // Firebase bay lòd kwasan, nou vle desandan
        lastServerBoard = entries;
        setDbg("board", "OK (" + entries.length + " antre)");

        if (!entries.length && !(localUser.xp > 0)) {
            document.getElementById("board-list").innerHTML =
                `<div class="state-msg">Poko gen okenn done nan klasman an. Se ou ki pou premye a! 🚀</div>`;
            renderMyRankCard(null, true);
            return;
        }
        if (entries.length) safeSet(LB_CACHE_KEY, entries);
        renderBoard(entries);
    }, (err) => {
        answered = true;
        clearTimeout(timer);
        console.error("Erè klasman:", err);
        setDbg("board", "ERÈ: " + describeError(err));
        showBoardOffline(describeError(err));
        showToast("Erè pandan chajman klasman an.", "❌");
    });
}

// Lè moun nan pa nan Top 50 la, konte konbyen moun ki gen plis XP pase li
function computeExactRank() {
    const myXp = localUser.xp || 0;
    const me = { pseudo: localUser.pseudo, xp: myXp, photoURL: localUser.photoURL };

    withTimeout(db.ref("leaderboard").orderByChild("xp").startAt(myXp + 1).once("value"), 8000)
        .then((snap) => renderMyRankCard(snap.numChildren() + 1, false, me))
        .catch(() => renderMyRankCard(null, false, me));
}

function renderMyRankCard(rank, isEmpty, entry) {
    const el = document.getElementById("my-rank-inner");
    if (!el) return;

    if (isEmpty) {
        el.innerHTML = `
          <div class="my-rank-info">
            <div class="my-rank-label">Ou</div>
            <div class="my-rank-name">Fè yon egzèsis pou parèt nan klasman an!</div>
          </div>`;
        return;
    }

    const medal = rank ? medalFor(rank) : null;
    const badgeClass = rank === 1 ? "top1" : rank === 2 ? "top2" : rank === 3 ? "top3" : "";
    const avatar = (entry && entry.photoURL) || localUser.photoURL || fallbackAvatar(localUser.pseudo);
    const xpValue = nz(entry && entry.xp, nz(localUser.xp, 0));
    const pseudo = localUser.pseudo || "Itilizatè";

    el.innerHTML = `
      <div class="my-rank-badge ${badgeClass}">${medal || (rank ? "#" + rank : "-")}</div>
      <div class="my-rank-avatar"><img src="${escapeHtml(avatar)}" alt="${escapeHtml(pseudo)}"></div>
      <div class="my-rank-info">
        <div class="my-rank-label">Pozisyon Ou</div>
        <div class="my-rank-name">${escapeHtml(pseudo)}</div>
      </div>
      <div class="my-rank-xp">
        <div class="val">${Number(xpValue) || 0}</div>
        <div class="lbl">XP</div>
      </div>
    `;

    // Ekri rang lan sou pwofil la (sèlman si li chanje) pou home.html ka afiche l (#user-rank)
    if (rank && localUser.uid && serverLoaded && localUser.rank !== rank) {
        localUser.rank = rank;
        db.ref("users/" + localUser.uid).update({ rank: rank }).catch(() => {});
    }
}

/*=========================================================
  5. ESTATISTIK MWEN
=========================================================*/
function renderMyStats() {
    const xp = localUser.xp || 0;
    const level = Math.floor(xp / 100) + 1;
    const currentLevelXP = xp % 100;

    document.getElementById("my-level-text").innerText = `Nivo ${level}`;
    document.getElementById("my-xp-text").innerText = `${currentLevelXP} / 100 XP`;
    document.getElementById("my-xp-fill").style.width = `${currentLevelXP}%`;

    document.getElementById("stat-coins").innerText = nz(localUser.coins, 0);
    document.getElementById("stat-streak").innerText = nz(localUser.streak, 0);
    document.getElementById("stat-quizxp").innerText = (localUser.quizStats && localUser.quizStats.xp) || 0;

    const since = document.getElementById("stat-since");
    if (localUser.createdAt) {
        const d = new Date(localUser.createdAt);
        since.innerText = `${MOIS_KREYOL[d.getMonth()]} ${d.getFullYear()}`;
    } else {
        since.innerText = "-";
    }
}