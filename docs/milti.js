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
  ⚠️ RANPLASE SA A AK PWÒP GITHUB REPO OU
     (kote quiz.json ak defi.json ye)
=========================================================*/
const GITHUB_BASE = "https://raw.githubusercontent.com/METE_NON_ITILIZATE_OU/METE_NON_REPO_OU/main/questions/";

const WINNER_XP = 20;
const LOSER_XP = 5;

/************************************************=========
  2. AUTH GUARD
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

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
}

function switchTab(tab) {
    document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    document.getElementById("tab-" + tab).style.display = "block";
    event.target.classList.add("active");

    if (tab === "attente") loadWaitingPlayers();
    if (tab === "historique") loadHistory();
}

/************************************************=========
  4. CHAJE KESYON YO SOU GITHUB (quiz.json + defi.json)
=========================================================*/
let allQuestions = [];
let questionsLoaded = false;

async function loadQuestionsFromGithub() {
    try {
        const [quizRes, defiRes] = await Promise.all([
            fetch(GITHUB_BASE + "quiz.json"),
            fetch(GITHUB_BASE + "defi.json")
        ]);
        const quiz = await quizRes.json();
        const defi = await defiRes.json();
        allQuestions = [...(quiz.questions || []), ...(defi.questions || [])];
        questionsLoaded = true;
        console.log(`${allQuestions.length} kesyon chaje.`);
    } catch (err) {
        console.error("Erè chajman kesyon yo:", err);
        showToast("Nou pa t kapab chaje kesyon yo. Tcheke konfigirasyon GitHub la.", "❌");
    }
}

function pickRandomQuestions(matiere, difficulte, count) {
    let pool = allQuestions.filter(q => q.matiere === matiere);
    if (difficulte) pool = pool.filter(q => q.difficulte === difficulte);

    // Mele lis la (Fisher-Yates)
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

/************************************************=========
  5. LIS JWÈ K ap TANN (matches status === "wait")
=========================================================*/
function loadWaitingPlayers() {
    const list = document.getElementById("players-list");
    db.ref("milti_matches").orderByChild("status").equalTo("wait").once("value")
        .then((snap) => {
            let items = [];
            snap.forEach((child) => items.push({ id: child.key, ...child.val() }));
            items.reverse();

            if (items.length === 0) {
                list.innerHTML = `<div class="state-msg">Pa gen okenn match k ap tann kounye a. Kriye pa w!</div>`;
                return;
            }

            list.innerHTML = items.map((m) => {
                const isMine = m.hostUid === localUser.uid;
                const avatar = m.hostPhoto || fallbackAvatar(m.hostPseudo);
                const btn = isMine
                    ? `<button class="btn-join" style="background:#ff4757;" onclick="cancelMatch('${m.id}')" type="button">Anile</button>`
                    : `<button class="btn-join" onclick="joinMatch('${m.id}')" type="button">Jwenn</button>`;
                return `
                  <div class="player-card">
                    <div class="player-avatar"><img src="${avatar}" alt=""></div>
                    <div class="player-info">
                      <div class="player-name">${escapeHtml(m.hostPseudo)}${isMine ? " (Ou)" : ""}</div>
                      <div class="player-stake">${escapeHtml(m.matiere)} • ${m.questionCount} kesyon • 🪙 ${m.coins}</div>
                    </div>
                    ${btn}
                  </div>
                `;
            }).join("");
        })
        .catch((err) => {
            console.error(err);
            list.innerHTML = `<div class="state-msg">Erè pandan chajman an.</div>`;
        });
}

/************************************************=========
  6. KRIYE MATCH (host)
=========================================================*/
function createMatch() {
    if (!questionsLoaded) {
        showToast("Kesyon yo poko fin chaje. Tann yon ti moman.", "⏳");
        return;
    }

    const matiere = document.getElementById("create-matiere").value;
    const questionCount = parseInt(document.getElementById("create-questions").value, 10);
    const coins = parseInt(document.getElementById("create-coins").value, 10);
    const difficulte = document.getElementById("create-difficulte").value;
    const timerSeconds = parseInt(document.getElementById("create-timer").value, 10);

    if (!matiere) {
        showToast("Chwazi yon matye.", "⚠️");
        return;
    }
    if (!coins || coins < 10) {
        showToast("Mete omwen 10 pyès.", "⚠️");
        return;
    }
    if ((localUser.coins || 0) < coins) {
        showToast("Ou pa gen ase pyès pou parye sa a.", "⚠️");
        return;
    }

    const available = allQuestions.filter(q => q.matiere === matiere && (!difficulte || q.difficulte === difficulte));
    if (available.length < questionCount) {
        showToast(`Sèlman ${available.length} kesyon disponib pou chwa sa a.`, "⚠️");
        return;
    }

    const questions = pickRandomQuestions(matiere, difficulte, questionCount);
    const questionIds = questions.map(q => q.id);

    const newMatch = {
        hostUid: localUser.uid,
        hostPseudo: localUser.pseudo || "Itilizatè",
        hostPhoto: localUser.photoURL || null,
        guestUid: null, guestPseudo: null, guestPhoto: null,
        matiere, questionCount, coins, difficulte: difficulte || null, timerSeconds,
        questionIds,
        currentQuestion: 0,
        status: "wait",
        answers: {},
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };

    db.ref("milti_matches").push(newMatch)
        .then((ref) => {
            // Retire pyès yo tousuit (yo an "eskwo" pandan match la)
            const newCoins = (localUser.coins || 0) - coins;
            localUser.coins = newCoins;
            localStorage.setItem("ns4_user", JSON.stringify(localUser));
            db.ref("users/" + localUser.uid).update({ coins: newCoins });

            showToast("Match kriye! Tann yon advèsè.", "✅");
            watchMyMatch(ref.key);
            switchToAttenteTab();
        })
        .catch((err) => {
            console.error(err);
            showToast("Erè pandan kreyasyon match la.", "❌");
        });
}

function switchToAttenteTab() {
    document.querySelectorAll(".tab-content").forEach(el => el.style.display = "none");
    document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));
    document.getElementById("tab-attente").style.display = "block";
    document.querySelectorAll(".tab-btn")[0].classList.add("active");
    loadWaitingPlayers();
}

function cancelMatch(matchId) {
    db.ref("milti_matches/" + matchId).once("value").then((snap) => {
        const m = snap.val();
        if (!m || m.status !== "wait") return;

        // Remèt pyès yo
        const newCoins = (localUser.coins || 0) + m.coins;
        localUser.coins = newCoins;
        localStorage.setItem("ns4_user", JSON.stringify(localUser));
        db.ref("users/" + localUser.uid).update({ coins: newCoins });

        db.ref("milti_matches/" + matchId).remove().then(() => {
            showToast("Match anile, pyès ou remèt.", "↩️");
            loadWaitingPlayers();
        });
    });
}

/************************************************=========
  7. JWENN MATCH (guest)
=========================================================*/
function joinMatch(matchId) {
    const matchRef = db.ref("milti_matches/" + matchId);

    matchRef.once("value").then((snap) => {
        const m = snap.val();
        if (!m || m.status !== "wait") {
            showToast("Match sa a pa disponib ankò.", "⚠️");
            loadWaitingPlayers();
            return;
        }
        if ((localUser.coins || 0) < m.coins) {
            showToast("Ou pa gen ase pyès pou match sa a.", "⚠️");
            return;
        }

        matchRef.update({
            guestUid: localUser.uid,
            guestPseudo: localUser.pseudo || "Itilizatè",
            guestPhoto: localUser.photoURL || null,
            status: "playing",
            startedAt: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            const newCoins = (localUser.coins || 0) - m.coins;
            localUser.coins = newCoins;
            localStorage.setItem("ns4_user", JSON.stringify(localUser));
            db.ref("users/" + localUser.uid).update({ coins: newCoins });

            watchMyMatch(matchId);
        });
    });
}

/************************************************=========
  8. MATCH LIVE — de jwè reponn an paralèl
=========================================================*/
let currentMatchId = null;
let currentMatchRef = null;
let myRole = null; // "host" oswa "guest"
let localTimerInterval = null;
let hasAnsweredThisQuestion = false;
let lastRenderedQuestionIndex = -1;
let rewardsApplied = false;

function watchMyMatch(matchId) {
    currentMatchId = matchId;
    currentMatchRef = db.ref("milti_matches/" + matchId);
    hasAnsweredThisQuestion = false;
    lastRenderedQuestionIndex = -1;
    rewardsApplied = false;

    currentMatchRef.on("value", (snap) => {
        const m = snap.val();
        if (!m) return;

        myRole = (m.hostUid === localUser.uid) ? "host" : "guest";

        if (m.status === "playing") {
            document.getElementById("match-live").style.display = "block";
            document.getElementById("match-result").style.display = "none";
            renderMatchArena(m);
            watchChat(matchId);
        } else if (m.status === "finished") {
            applyMyRewardsIfNeeded(m);
            renderMatchResult(m);
        }
    });
}

function renderMatchArena(m) {
    const qIndex = m.currentQuestion;
    const questionId = m.questionIds[qIndex];
    const question = allQuestions.find(q => q.id === questionId);
    if (!question) return;

    const myAnswers = m.answers || {};
    const myQAnswers = myAnswers[qIndex] || {};

    if (qIndex !== lastRenderedQuestionIndex) {
        lastRenderedQuestionIndex = qIndex;
        hasAnsweredThisQuestion = false;
        startLocalTimer(m.timerSeconds, m);
    }

    const iAlreadyAnswered = !!myQAnswers[myRole];
    const oppRole = myRole === "host" ? "guest" : "host";
    const oppAnswered = !!myQAnswers[oppRole];
    const bothAnswered = iAlreadyAnswered && oppAnswered;

    const mySide = renderPlayerSide(
        myRole === "host" ? m.hostPseudo : m.guestPseudo,
        myRole === "host" ? m.hostPhoto : m.guestPhoto,
        question, myQAnswers[myRole], iAlreadyAnswered, bothAnswered, true
    );
    const oppSide = renderPlayerSide(
        oppRole === "host" ? m.hostPseudo : m.guestPseudo,
        oppRole === "host" ? m.hostPhoto : m.guestPhoto,
        question, myQAnswers[oppRole], oppAnswered, bothAnswered, false
    );

    document.getElementById("match-arena").innerHTML = mySide + oppSide;

    if (bothAnswered) {
        stopLocalTimer();
        setTimeout(() => tryAdvanceQuestion(m, qIndex), 2200);
    }
}

function renderPlayerSide(pseudo, photo, question, answerData, answered, revealed, isMe) {
    const avatar = photo || fallbackAvatar(pseudo);
    let optionsHtml = "";

    question.options.forEach((opt, i) => {
        let cls = "option-btn";
        if (revealed) {
            if (i === question.reponse) cls += " correct";
            else if (answerData && answerData.choice === i) cls += " incorrect";
        } else if (answered && answerData && answerData.choice === i && isMe) {
            cls += " selected";
        }
        const clickable = isMe && !answered ? `onclick="answerQuestion(${i})"` : "";
        optionsHtml += `<button class="${cls}" ${clickable} type="button" ${!isMe || answered ? "disabled" : ""}>${escapeHtml(opt)}</button>`;
    });

    const status = revealed ? "" : (answered ? "⏳ Ap tann advèsè a..." : (isMe ? "Chwazi yon repons" : "⏳ Ap chwazi..."));

    return `
      <div class="player-side">
        <div class="player-header">
          <div class="player-avatar-big"><img src="${avatar}" alt=""></div>
          <div class="player-pseudo">${escapeHtml(pseudo)}${isMe ? " (Ou)" : ""}</div>
          <div class="player-status">${status}</div>
        </div>
        <div class="match-question">${escapeHtml(question.question)}</div>
        <div class="match-options">${optionsHtml}</div>
      </div>
    `;
}

function answerQuestion(choiceIndex) {
    if (hasAnsweredThisQuestion) return;
    hasAnsweredThisQuestion = true;

    currentMatchRef.once("value").then((snap) => {
        const m = snap.val();
        const qIndex = m.currentQuestion;
        const questionId = m.questionIds[qIndex];
        const question = allQuestions.find(q => q.id === questionId);
        const correct = choiceIndex === question.reponse;

        currentMatchRef.child(`answers/${qIndex}/${myRole}`).set({
            choice: choiceIndex, correct, at: firebase.database.ServerValue.TIMESTAMP
        });
    });
}

function startLocalTimer(seconds, matchSnapshot) {
    stopLocalTimer();
    let remaining = seconds;
    updateTimerDisplay(remaining);

    localTimerInterval = setInterval(() => {
        remaining--;
        updateTimerDisplay(remaining);
        if (remaining <= 0) {
            stopLocalTimer();
            if (!hasAnsweredThisQuestion) {
                hasAnsweredThisQuestion = true;
                currentMatchRef.child(`answers/${matchSnapshot.currentQuestion}/${myRole}`).set({
                    choice: -1, correct: false, at: firebase.database.ServerValue.TIMESTAMP
                });
            }
        }
    }, 1000);
}

function stopLocalTimer() {
    if (localTimerInterval) clearInterval(localTimerInterval);
    localTimerInterval = null;
}

function updateTimerDisplay(seconds) {
    const arena = document.getElementById("match-arena");
    let timerEl = document.getElementById("match-timer-display");
    if (!timerEl) {
        arena.insertAdjacentHTML("afterend", `<div class="match-timer" id="match-timer-display"></div>`);
        timerEl = document.getElementById("match-timer-display");
    }
    timerEl.innerText = seconds > 0 ? `⏱️ ${seconds}s` : "⏱️ Fini!";
}

// Transaction pou evite 2 kliyan avanse kesyon an anmenmtan
function tryAdvanceQuestion(m, fromIndex) {
    const nextIndex = fromIndex + 1;

    if (nextIndex >= m.questionCount) {
        finalizeMatch(m);
        return;
    }

    currentMatchRef.child("currentQuestion").transaction((current) => {
        if (current === fromIndex) return nextIndex;
        return; // yon lòt kliyan deja fè l
    });
}

function finalizeMatch(m) {
    // Kalkile pwen yo apati repons yo
    let hostScore = 0, guestScore = 0;
    Object.values(m.answers || {}).forEach((qAns) => {
        if (qAns.host && qAns.host.correct) hostScore++;
        if (qAns.guest && qAns.guest.correct) guestScore++;
    });

    let winnerUid = null;
    if (hostScore > guestScore) winnerUid = m.hostUid;
    else if (guestScore > hostScore) winnerUid = m.guestUid;
    // egalite: winnerUid rete null

    currentMatchRef.child("status").transaction((current) => {
        if (current === "playing") return "finished";
        return;
    }).then(() => {
        currentMatchRef.update({
            scores: { host: hostScore, guest: guestScore },
            winnerUid: winnerUid,
            finishedAt: firebase.database.ServerValue.TIMESTAMP
        });
    });
}

/************************************************=========
  9. APLIKE REKONPANS/PÈT PÒ MWEN (chak kliyan jere pwòp done l)
=========================================================*/
function applyMyRewardsIfNeeded(m) {
    if (rewardsApplied) return;
    rewardsApplied = true;
    stopLocalTimer();

    const isWinner = m.winnerUid === localUser.uid;
    const isTie = !m.winnerUid;
    let coinsChange = 0;
    let xpChange = LOSER_XP;

    if (isTie) {
        coinsChange = m.coins; // remèt pwòp pyès ou
        xpChange = LOSER_XP;
    } else if (isWinner) {
        coinsChange = m.coins * 2; // ou resevwa tou de pò a (ou te deja peye pa w la)
        xpChange = WINNER_XP;
    }
    // pèdan: pa gen coinsChange, yo te deja peye pyès yo lè match la te kòmanse

    const newCoins = (localUser.coins || 0) + coinsChange;
    const newXp = (localUser.xp || 0) + xpChange;

    localUser.coins = newCoins;
    localUser.xp = newXp;
    localStorage.setItem("ns4_user", JSON.stringify(localUser));

    db.ref("users/" + localUser.uid).update({ coins: newCoins, xp: newXp, level: Math.floor(newXp / 100) + 1 });
    db.ref("leaderboard/" + localUser.uid).update({ xp: newXp, level: Math.floor(newXp / 100) + 1 });
}

let _adShownForMatch = null;
function renderMatchResult(m) {
    // 📺 pause naturelle : fin de match (renderMatchResult est rappelée à chaque mise à jour -> une seule fois)
    if (window.NS4Ads && _adShownForMatch !== currentMatchId) {
        _adShownForMatch = currentMatchId;
        NS4Ads.maybeInterstitial("milti");
    }
    document.getElementById("match-live").style.display = "none";
    const resultDiv = document.getElementById("match-result");
    resultDiv.style.display = "block";

    const isWinner = m.winnerUid === localUser.uid;
    const isTie = !m.winnerUid;
    const title = isTie ? "Egalite! 🤝" : (isWinner ? "Ou genyen! 🏆" : "Ou pèdi 😔");

    resultDiv.innerHTML = `
      <div class="match-result">
        <div class="result-title">${title}</div>
        <div class="result-score">
          <div class="result-card">
            <div class="result-pseudo">${escapeHtml(m.hostPseudo)}</div>
            <div class="result-points">${m.scores.host} / ${m.questionCount}</div>
          </div>
          <div class="result-card">
            <div class="result-pseudo">${escapeHtml(m.guestPseudo)}</div>
            <div class="result-points">${m.scores.guest} / ${m.questionCount}</div>
          </div>
        </div>
        <button class="btn-rematch" onclick="backToLobby()" type="button">Retounen nan lis la</button>
      </div>
    `;
}

function backToLobby() {
    if (currentMatchRef) currentMatchRef.off();
    document.getElementById("match-result").style.display = "none";
    document.getElementById("match-live").style.display = "none";
    switchToAttenteTab();
}

/************************************************=========
  10. CHAT (pandan ak apre match)
=========================================================*/
let chatListenerAttached = null;

function watchChat(matchId) {
    if (chatListenerAttached === matchId) return;
    chatListenerAttached = matchId;

    db.ref(`milti_matches/${matchId}/chat`).limitToLast(50).on("child_added", (snap) => {
        const msg = snap.val();
        const container = document.getElementById("chat-messages");
        if (!container) return;
        container.insertAdjacentHTML("beforeend", `
          <div class="chat-msg">
            <span class="chat-sender">${escapeHtml(msg.pseudo)}:</span>
            <span class="chat-text">${escapeHtml(msg.text)}</span>
          </div>
        `);
        container.scrollTop = container.scrollHeight;
    });
}

function sendChatMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text || !currentMatchId) return;

    db.ref(`milti_matches/${currentMatchId}/chat`).push({
        uid: localUser.uid,
        pseudo: localUser.pseudo || "Itilizatè",
        text: text,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });
    input.value = "";
}

/************************************************=========
  11. ISTORIK
=========================================================*/
function loadHistory() {
    const list = document.getElementById("history-list");
    db.ref("milti_matches").orderByChild("status").equalTo("finished").limitToLast(100).once("value")
        .then((snap) => {
            let items = [];
            snap.forEach((child) => {
                const m = child.val();
                if (m.hostUid === localUser.uid || m.guestUid === localUser.uid) {
                    items.push({ id: child.key, ...m });
                }
            });
            items.reverse();

            if (items.length === 0) {
                list.innerHTML = `<div class="state-msg">Ou poko jwe okenn match.</div>`;
                return;
            }

            list.innerHTML = items.slice(0, 20).map((m) => {
                const isWinner = m.winnerUid === localUser.uid;
                const isTie = !m.winnerUid;
                const opponent = m.hostUid === localUser.uid ? m.guestPseudo : m.hostPseudo;
                const result = isTie ? "🤝 Egalite" : (isWinner ? "✅ Genyen" : "❌ Pèdi");
                return `
                  <div class="player-card">
                    <div class="player-info">
                      <div class="player-name">${result} kont ${escapeHtml(opponent || "?")}</div>
                      <div class="player-stake">${escapeHtml(m.matiere)} • 🪙 ${m.coins}</div>
                    </div>
                  </div>
                `;
            }).join("");
        })
        .catch((err) => {
            console.error(err);
            list.innerHTML = `<div class="state-msg">Erè pandan chajman istorik la.</div>`;
        });
}

/************************************************=========
  12. INISYALIZASYON — repran yon match ki deja an kou
=========================================================*/
loadQuestionsFromGithub();
loadWaitingPlayers();

// Si m gen yon match "wait" oswa "playing" deja, retounen ladan l
db.ref("milti_matches").orderByChild("hostUid").equalTo(localUser.uid).once("value").then((snap) => {
    snap.forEach((child) => {
        const m = child.val();
        if (m.status === "wait" || m.status === "playing") watchMyMatch(child.key);
    });
});
db.ref("milti_matches").orderByChild("guestUid").equalTo(localUser.uid).once("value").then((snap) => {
    snap.forEach((child) => {
        const m = child.val();
        if (m.status === "playing") watchMyMatch(child.key);
    });
});
