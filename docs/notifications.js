/************************************************=========
  SISTÈM NOTIFIKASYON
  Sipoze firebaseConfig/db/auth/localUser/showToast() deja
  defini pa home.js, ki chaje AVAN fichye sa a.
=========================================================*/
const NOTIF_LIMIT = 30;
let notifCache = [];
let notifsLoaded = false;
let currentTourSteps = [];
let currentTourIndex = 0;

/************************************************=========
  1. ETID TAN (pou "sa gen 2 è" elatriye) + SEKIRITE
=========================================================*/
function timeAgo(ts) {
    if (!ts) return "";
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "kounye a";
    if (min < 60) return `sa gen ${min} min`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `sa gen ${hr}è`;
    const days = Math.floor(hr / 24);
    return `sa gen ${days}j`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

/************************************************=========
  2. RAPÈL LOKAL (pa estoke nan Firebase, jenere sou plas)
=========================================================*/
function reminderCard() {
    const streak = (localUser && localUser.streak) || 0;
    const text = streak > 0
        ? `Ou gen ${streak} jou afile! Fè yon ti egzèsis jodi a pou pa pèdi l.`
        : `Kòmanse yon seri jodi a — fè yon egzèsis pou lanse premye jou ou!`;

    return `
      <div class="notif-item reminder">
        <div class="notif-icon">🔥</div>
        <div class="notif-body">
          <div class="notif-title">Kenbe ale w la</div>
          <div class="notif-msg">${text}</div>
        </div>
      </div>
    `;
}

/************************************************=========
  3. LIS NOTIFIKASYON (admin) + BADGE
=========================================================*/
function renderNotifList(lastSeen) {
    const list = document.getElementById("notif-list");
    if (!list) return;

    let html = reminderCard();

    if (notifCache.length === 0) {
        html += `<div class="state-msg">Pa gen lòt notifikasyon kounye a.</div>`;
    } else {
        notifCache.forEach((n) => {
            const isUnread = n.createdAt > lastSeen;
            const isReminder = n.type === "rapèl";
            const tourBtn = (n.type === "fonksyonalite" && n.steps && n.steps.length)
                ? `<button class="notif-tour-btn" onclick="openTour('${n.id}')" type="button">Gade kijan ▶</button>`
                : "";
            html += `
              <div class="notif-item ${isUnread ? "unread" : ""} ${isReminder ? "reminder" : ""}">
                <div class="notif-icon">${escapeHtml(n.icon) || "📣"}</div>
                <div class="notif-body">
                  <div class="notif-title">${escapeHtml(n.title)}</div>
                  <div class="notif-msg">${escapeHtml(n.message)}</div>
                  <div class="notif-time">${timeAgo(n.createdAt)}</div>
                  ${tourBtn}
                </div>
              </div>
            `;
        });
    }

    list.innerHTML = html;
}

function updateNotifBadge(lastSeen) {
    const badge = document.getElementById("notification-badge");
    if (!badge) return;
    const hasUnread = notifCache.some((n) => n.createdAt > lastSeen);
    badge.classList.toggle("show", hasUnread);
}

function loadNotifications() {
    db.ref("notifications").orderByChild("createdAt").limitToLast(NOTIF_LIMIT).once("value")
        .then((snap) => {
            notifCache = [];
            snap.forEach((child) => {
                notifCache.push({ id: child.key, ...child.val() });
            });
            notifCache.reverse(); // pi resan an premye
            notifsLoaded = true;

            const lastSeen = (localUser && localUser.lastSeenNotif) || 0;
            updateNotifBadge(lastSeen);

            const sheet = document.getElementById("notif-sheet");
            if (sheet && sheet.classList.contains("open")) {
                renderNotifList(lastSeen);
            }
        })
        .catch((err) => console.error("Erè notifikasyon:", err));
}

/************************************************=========
  4. OUVRI / FÈMEN PANEL LA
=========================================================*/
function openNotifPanel() {
    const overlay = document.getElementById("notif-overlay");
    const sheet = document.getElementById("notif-sheet");
    if (!overlay || !sheet) return;

    const lastSeen = (localUser && localUser.lastSeenNotif) || 0;

    if (notifsLoaded) {
        renderNotifList(lastSeen);
    } else {
        document.getElementById("notif-list").innerHTML = reminderCard() + `<div class="state-msg">Ap chaje...</div>`;
    }

    overlay.classList.add("show");
    sheet.classList.add("open");

    // Make tout sa nou gen kounye a mache kòm "li"
    const now = Date.now();
    if (localUser && localUser.uid) {
        localUser.lastSeenNotif = now;
        localStorage.setItem("ns4_user", JSON.stringify(localUser));
        db.ref("users/" + localUser.uid).update({ lastSeenNotif: now });
    }
    const badge = document.getElementById("notification-badge");
    if (badge) badge.classList.remove("show");
}

function closeNotifPanel() {
    const overlay = document.getElementById("notif-overlay");
    const sheet = document.getElementById("notif-sheet");
    if (overlay) overlay.classList.remove("show");
    if (sheet) sheet.classList.remove("open");
}

/************************************************=========
  5. TOUR ANIME POU NOUVO FONKSYONALITE
=========================================================*/
function openTour(notifId) {
    const notif = notifCache.find((n) => n.id === notifId);
    if (!notif || !notif.steps || !notif.steps.length) return;

    currentTourSteps = notif.steps;
    currentTourIndex = 0;

    const container = document.getElementById("tour-slides");
    container.innerHTML = currentTourSteps.map((stepText, i) => `
      <div class="tour-slide ${i === 0 ? "active" : ""}" data-index="${i}">
        <div class="tour-icon">${escapeHtml(notif.icon) || "✨"}</div>
        <div class="tour-title">${escapeHtml(notif.title)}</div>
        <div class="tour-text">${escapeHtml(stepText)}</div>
      </div>
    `).join("");

    const dots = document.getElementById("tour-dots");
    dots.innerHTML = currentTourSteps.map((_, i) =>
        `<div class="tour-dot ${i === 0 ? "active" : ""}"></div>`
    ).join("");

    updateTourButton();
    document.getElementById("tour-overlay").classList.add("show");
    closeNotifPanel();
}

function updateTourButton() {
    const btn = document.getElementById("tour-next-btn");
    if (!btn) return;
    const isLast = currentTourIndex === currentTourSteps.length - 1;
    btn.innerText = isLast ? "Konpri!" : "Kontinye";
}

function tourNext() {
    if (currentTourIndex === currentTourSteps.length - 1) {
        closeTour();
        return;
    }
    currentTourIndex++;
    document.querySelectorAll(".tour-slide").forEach((el, i) => {
        el.classList.toggle("active", i === currentTourIndex);
    });
    document.querySelectorAll(".tour-dot").forEach((el, i) => {
        el.classList.toggle("active", i === currentTourIndex);
    });
    updateTourButton();
}

function closeTour() {
    const overlay = document.getElementById("tour-overlay");
    if (overlay) overlay.classList.remove("show");
}

/************************************************=========
  6. INISYALIZASYON
=========================================================*/
loadNotifications();
