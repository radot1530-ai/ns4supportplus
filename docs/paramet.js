/************************************************=========
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

/************************************************=========
  2. AUTH GUARD & LOGOUT
=========================================================*/
let localUser = JSON.parse(localStorage.getItem("ns4_user"));

if (!localUser || !localUser.uid) {
    window.location.href = "index.html";
}

auth.onAuthStateChanged((user) => {
    if (!user) {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    }
});

function logout() {
    if (localUser && localUser.uid) {
        db.ref(`users/${localUser.uid}`).update({ isConnected: false }).catch(() => {});
    }
    auth.signOut().then(() => {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    }).catch(err => {
        console.error("Erè Dekoneksyon:", err);
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    });
}

/************************************************=========
  3. UI HELPERS & NAVIGATION
=========================================================*/
let toastTimeout;

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

function fallbackAvatar(pseudo) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(pseudo || "U")}&background=24439a&color=fff&bold=true`;
}

/************************************************=========
  4. AFICHE PWOFIL RAPID
=========================================================*/
if (localUser && localUser.uid) {
    const avatarEl = document.getElementById("profile-avatar");
    const nameEl = document.getElementById("profile-name");
    
    if (avatarEl) avatarEl.src = localUser.photoURL || fallbackAvatar(localUser.pseudo);
    if (nameEl) nameEl.innerText = localUser.pseudo || "Itilizatè";
}

/************************************************=========
  5. MODAL POLITIK KONFIDANSYALITE / KONDISYON ITILIZASYON
=========================================================*/
const LEGAL_TEXTS = {
    privacy: {
        title: "Politik Konfidansyalite",
        body: `
          <h3>1. Ki done nou kolekte</h3>
          <p>Lè w kreye yon kont, nou kolekte: imèl ou, yon pseudo, ak (si w chwazi) yon foto pwofil. Pandan w ap itilize app la, nou anrejistre pwogrè ou (XP, pyès, streak, rezilta egzèsis) ak enfòmasyon sou aparèy la.</p>

          <h3>2. Kijan nou itilize done yo</h3>
          <p>Nou itilize done sa yo pou: fè fonksyone kont ou, kalkile klasman ak estatistik ou, pèmèt rekoneksyon ou sou menm kont lan, ak amelyore eksperyans itilizatè a.</p>

          <h3>3. Kote done yo estoke</h3>
          <p>Done yo estoke sou Firebase (Google). Nou pa vann done pèsonèl ou bay okenn twazyèm pati. App la ka itilize sèvis Google AdMob pou afiche piblisite selon règleman yo.</p>

          <h3>4. Timoun ak Minè (NS4)</h3>
          <p>Nou pa kolekte done ki pa nesesè pou aplikasyon an. Done ki nan app sa a kouvri fòmasyon edikatif pou elèv k ap prepare Bac. Nou mete tout dispozisyon nesesè pou evite move konpòtman oswa asèlman nan zòn kominikasyon yo.</p>

          <h3>5. Dwa ou</h3>
          <p>Ou ka mande pou wè, modifye, oswa efase done ou yo nenpòt lè atravè paj Pwofil la oswa lè w kontakte nou.</p>

          <h3>6. Kontak</h3>
          <p>Pou nenpòt kesyon oswa asistans: storetechnologie9@gmail.com</p>
        `
    },
    terms: {
        title: "Kondisyon Itilizasyon",
        body: `
          <h3>1. Akseptasyon</h3>
          <p>Lè w kreye yon kont oswa itilize NS4 Support+, ou aksepte tout kondisyon sa yo nèt ale.</p>

          <h3>2. Deskripsyon Sèvis La</h3>
          <p>NS4 Support+ se yon zouti edikatif ki fèt pou ede elèv NS4 (Seksyon Sekondè 4) prepare egzamen ofisyèl MENFP (BAC). Li ofri quiz, modèl egzamen, fòmil, nòt ak videyo sipò.</p>

          <h3>3. Pyès ak XP</h3>
          <p>Pyès (Coins) ak XP ki nan aplikasyon an se pou jwèt la sèlman (gamification) — yo <strong>pa gen okenn valè monèt</strong> epi yo pa ka vann oswa chanje an lajan reyèl.</p>

          <h3>4. Konpòtman Atann</h3>
          <p>Nou entèdi tout kalite triche nan quiz ak jwèt miltijwè yo, oswa itilizasyon langaj inapwopriye. Tout kont ki vyole règleman sa yo ka sispann.</p>

          <h3>5. Limitasyon Responsablite</h3>
          <p>Aplikasyon an fèt kòm yon sipò edikatif adisyonèl; li pa ranplase etid pèsonèl ak kou pwofesè yo bay nan lekòl yo.</p>
        `
    }
};

function openTextModal(type) {
    const data = LEGAL_TEXTS[type];
    if (!data) return;
    document.getElementById("text-modal-title").innerText = data.title;
    document.getElementById("text-modal-body").innerHTML = data.body;
    document.getElementById("text-modal-overlay").classList.add("show");
}

function closeTextModal() {
    document.getElementById("text-modal-overlay").classList.remove("show");
}

/************************************************=========
  6. CREDITS ANIME
=========================================================*/
function openCredits() {
    const scroll = document.getElementById("credits-scroll");
    if (scroll) {
        const clone = scroll.cloneNode(true);
        scroll.parentNode.replaceChild(clone, scroll);
    }
    document.getElementById("credits-overlay").classList.add("show");
}

function closeCredits() {
    document.getElementById("credits-overlay").classList.remove("show");
}

/************************************************=========
  7. PATAJE APP LA
=========================================================*/
const SHARE_URL = "https://play.google.com/store/apps/details?id=com.ns4support.app"; // Ranplase ak lyen Play Store la lè li pare

function shareApp() {
    const shareText = "Vin teste NS4 Support+ — aplikasyon ki ede w prepare BAC ou avèk siksè! 📚🎓";
    
    if (navigator.share) {
        navigator.share({ title: "NS4 Support+", text: shareText, url: SHARE_URL })
            .catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(`${shareText} ${SHARE_URL}`)
            .then(() => showToast("Lyen kopye nan presse-papier!", "📋"))
            .catch(() => showToast("Enposib pou kopye lyen an.", "❌"));
    } else {
        showToast(`${shareText} ${SHARE_URL}`, "📤");
    }
}