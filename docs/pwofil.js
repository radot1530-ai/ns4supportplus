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
  2. AUTH GUARD (menm modèl ak home.js / ranking.js)
=========================================================*/
let localUser = JSON.parse(localStorage.getItem("ns4_user"));

if (!localUser || !localUser.uid) {
    window.location.href = "index.html";
}

auth.onAuthStateChanged((user) => {
    if (!user) {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
        return;
    }
    renderPasswordCard(user);
});

function logout() {
    if (localUser && localUser.uid) {
        db.ref(`users/${localUser.uid}`).update({ isConnected: false });
    }
    auth.signOut().then(() => {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    }).catch(err => console.error("Erè:", err));
}

/************************************************=========
  3. UI HELPERS
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
  4. REMPLI FÒM LAN AK DONE ITILIZATÈ A
=========================================================*/
function fillForm() {
    document.getElementById("avatar-preview").src = localUser.photoURL || fallbackAvatar(localUser.pseudo);
    document.getElementById("avatar-name").innerText = localUser.pseudo || "Itilizatè";
    document.getElementById("input-pseudo").value = localUser.pseudo || "";
    document.getElementById("input-serie").value = localUser.serie || "";
}

if (localUser && localUser.uid) {
    fillForm();
    db.ref("users/" + localUser.uid).once("value").then((snap) => {
        if (snap.exists()) {
            localUser = { uid: localUser.uid, ...localUser, ...snap.val() };
            localStorage.setItem("ns4_user", JSON.stringify(localUser));
            fillForm();
        }
    });
}

/************************************************=========
  5. IDANTITE (pseudo + seri)
=========================================================*/
function saveIdentity() {
    const newPseudo = document.getElementById("input-pseudo").value.trim();
    const newSerie = document.getElementById("input-serie").value;

    if (newPseudo.length < 3) {
        showToast("Pseudo a dwe gen omwen 3 karaktè.", "⚠️");
        return;
    }
    if (newPseudo.length > 15) {
        showToast("Pseudo a twò long (max 15 karaktè).", "⚠️");
        return;
    }

    const updates = { pseudo: newPseudo, serie: newSerie };

    db.ref("users/" + localUser.uid).update(updates)
        .then(() => db.ref("leaderboard/" + localUser.uid).update({ pseudo: newPseudo }))
        .then(() => {
            localUser = { ...localUser, ...updates };
            localStorage.setItem("ns4_user", JSON.stringify(localUser));
            document.getElementById("avatar-name").innerText = newPseudo;
            showToast("Pwofil ou mete a jou!", "✅");
        })
        .catch((err) => {
            console.error(err);
            showToast("Erè pandan sovgad la.", "❌");
        });
}

/************************************************=========
  6. FOTO PWOFIL — redimansyone + konprese an JPEG,
     estoke an base64 dirèkteman nan Realtime Database
     (pa gen Firebase Storage nan pwojè a, e 20 Ko rete
     tou piti pou yon liy nan users/ ak leaderboard/)
=========================================================*/
const MAX_PHOTO_BYTES = 20 * 1024; // 20 Ko

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Rekadre kare (crop santral) + redwi + ekspòte an JPEG
function drawSquareJPEG(img, size, quality) {
    const minSide = Math.min(img.width, img.height);
    const sx = (img.width - minSide) / 2;
    const sy = (img.height - minSide) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", quality);
}

async function compressImageToBase64(file, maxBytes = MAX_PHOTO_BYTES) {
    const img = await loadImageFromFile(file);

    let size = 220;
    let quality = 0.85;
    let dataUrl = drawSquareJPEG(img, size, quality);

    // 1. Bese kalite a dabò (pi bon pou detay avata a)
    while (dataUrl.length > maxBytes && quality > 0.35) {
        quality -= 0.1;
        dataUrl = drawSquareJPEG(img, size, quality);
    }

    // 2. Si li toujou twò gwo, bese dimansyon an tou
    while (dataUrl.length > maxBytes && size > 80) {
        size -= 20;
        quality = 0.7;
        dataUrl = drawSquareJPEG(img, size, quality);
    }

    return dataUrl;
}

document.getElementById("avatar-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showToast("Chwazi yon fichye imaj.", "⚠️");
        return;
    }
    if (file.size > 8 * 1024 * 1024) {
        showToast("Imaj la twò gwo (maksimòm 8 Mo).", "⚠️");
        return;
    }

    showToast("Ap konprese imaj la...", "⏳");

    try {
        const dataUrl = await compressImageToBase64(file);
        document.getElementById("avatar-preview").src = dataUrl;

        await db.ref("users/" + localUser.uid).update({ photoURL: dataUrl });
        await db.ref("leaderboard/" + localUser.uid).update({ photoURL: dataUrl });

        localUser.photoURL = dataUrl;
        localStorage.setItem("ns4_user", JSON.stringify(localUser));

        showToast(`Foto chanje! (${Math.round(dataUrl.length / 1024)} Ko)`, "✅");
    } catch (err) {
        console.error(err);
        showToast("Nou pa t kapab trete imaj la.", "❌");
    }
});

/************************************************=========
  7. SEKIRITE — chanjman modpas (sèlman pou kont
     email/modpas; kont Google pa gen modpas Firebase)
=========================================================*/
function renderPasswordCard(user) {
    const card = document.getElementById("password-card");
    if (!card) return;

    const providerId = user && user.providerData && user.providerData[0]
        ? user.providerData[0].providerId
        : null;

    if (providerId === "password") {
        card.innerHTML = `
          <label class="form-label">Ansyen modpas</label>
          <input type="password" id="current-password" class="form-input" autocomplete="current-password">
          <label class="form-label">Nouvo modpas</label>
          <input type="password" id="new-password" class="form-input" autocomplete="new-password">
          <label class="form-label">Konfime nouvo modpas</label>
          <input type="password" id="confirm-password" class="form-input" autocomplete="new-password">
          <div class="form-note">Omwen 6 karaktè.</div>
          <button class="btn-primary" onclick="changePassword()" type="button">Chanje modpas</button>
        `;
    } else {
        card.innerHTML = `<div class="provider-note">Ou konekte ak Google — pa gen modpas Firebase pou jere isit la.</div>`;
    }
}

function changePassword() {
    const currentPw = document.getElementById("current-password").value;
    const newPw = document.getElementById("new-password").value;
    const confirmPw = document.getElementById("confirm-password").value;

    if (!currentPw || !newPw || !confirmPw) {
        showToast("Ranpli tout chan yo.", "⚠️");
        return;
    }
    if (newPw.length < 6) {
        showToast("Nouvo modpas la dwe gen omwen 6 karaktè.", "⚠️");
        return;
    }
    if (newPw !== confirmPw) {
        showToast("Nouvo modpas yo pa menm.", "⚠️");
        return;
    }

    const user = auth.currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, currentPw);

    showToast("Ap verifye ansyen modpas ou...", "⏳");

    user.reauthenticateWithCredential(credential)
        .then(() => user.updatePassword(newPw))
        .then(() => {
            showToast("Modpas ou chanje avèk siksè!", "✅");
            document.getElementById("current-password").value = "";
            document.getElementById("new-password").value = "";
            document.getElementById("confirm-password").value = "";
        })
        .catch((err) => {
            console.error(err);
            if (err.code === "auth/wrong-password") {
                showToast("Ansyen modpas la pa kòrèk.", "❌");
            } else if (err.code === "auth/too-many-requests") {
                showToast("Twòp tantativ. Eseye pita.", "❌");
            } else if (err.code === "auth/weak-password") {
                showToast("Nouvo modpas la twò fèb.", "❌");
            } else {
                showToast("Yon erè pase. Eseye ankò.", "❌");
            }
        });
}