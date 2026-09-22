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
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

/************************************************=========
  ⚠️ MENM BAZ KESYON AK MULTIJOUE (milti.js) — ranplase ak
     pwòp lyen GitHub ou
=========================================================*/
const GITHUB_BASE = "https://raw.githubusercontent.com/METE_NON_ITILIZATE_OU/METE_NON_REPO_OU/main/questions/";
const QUESTIONS_PER_DAY = 5;
const REWARD_COINS = 20;
const REWARD_XP = 15;

/************************************************=========
  2. AUTH GUARD
=========================================================*/
let localUser = JSON.parse(localStorage.getItem("ns4_user"));
if (!localUser || !localUser.uid) window.location.href = "index.html";

auth.onAuthStateChanged((user) => {
    if (!user) {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    }
});

function logout() {
    if (localUser && localUser.uid) db.ref(`users/${localUser.uid}`).update({ isConnected: false });
    auth.signOut().then(() => {
        localStorage.removeItem("ns4_user");
        window.location.href = "index.html";
    });
}

/************************************************=========
  3. UI HELPERS
=========================================================*/
let toastTimeout;
function showToast(message, icon = "ℹ️") {
    const toast = document.getElementById("toast");
    document.getElementById("toast-message").innerText = message;
    document.getElementById("toast-icon").innerText = icon;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 3000);
}
function toggleMainMenu() {
    document.getElementById("main-menu").classList.toggle("open");
    document.getElementById("menu-overlay").classList.toggle("show");
}
function handleBack() {
    if (document.getElementById("view-quiz").classList.contains("active") ||
        document.getElementById("view-result").classList.contains("active")) {
        showDaysView();
    } else {
        window.location.href = "home.html";
    }
}

/************************************************=========
  4. SEMÈN ISO (pou reset chak semèn)
=========================================================*/
function getWeekId(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
const CURRENT_WEEK = getWeekId();

/************************************************=========
  5. CHAJE KESYON YO (menm pool ak milti.js)
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
    } catch (err) {
        console.error("Erè chajman kesyon:", err);
        showToast("Nou pa t kapab chaje kesyon yo.", "❌");
    }
}

function pickQuestionsForDay(day) {
    // Melanj Fisher-Yates senp — chak jwè jwenn yon seleksyon diferan
    const pool = [...allQuestions];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, QUESTIONS_PER_DAY);
}

/************************************************=========
  6. PWOGRÈ SEMÈN NAN (anti-repetisyon)
=========================================================*/
let weekProgress = {};

function loadWeekProgress() {
    return db.ref(`defi_progress/${localUser.uid}/${CURRENT_WEEK}`).once("value")
        .then((snap) => {
            weekProgress = snap.val() || {};
            renderDaysGrid();
        });
}

function renderDaysGrid() {
    document.getElementById("week-label").innerText = `Semèn ${CURRENT_WEEK}`;
    const grid = document.getElementById("days-grid");
    let html = "";
    for (let day = 1; day <= 7; day++) {
        const done = weekProgress[day] && weekProgress[day].completed;
        html += `
          <div class="day-card ${done ? "done" : ""}" onclick="startDay(${day})">
            <div class="day-icon">${done ? "✅" : "🎯"}</div>
            <div class="day-title">Jou ${day}</div>
            <div class="day-status">${done ? "Fèt" : "Kòmanse"}</div>
          </div>
        `;
    }
    grid.innerHTML = html;
}

/************************************************=========
  7. VI (navigasyon)
=========================================================*/
function showDaysView() {
    document.getElementById("view-days").style.display = "block";
    document.getElementById("view-quiz").classList.remove("active");
    document.getElementById("view-result").classList.remove("active");
}
function showQuizView() {
    document.getElementById("view-days").style.display = "none";
    document.getElementById("view-quiz").classList.add("active");
    document.getElementById("view-result").classList.remove("active");
}
function showResultView() {
    document.getElementById("view-days").style.display = "none";
    document.getElementById("view-quiz").classList.remove("active");
    document.getElementById("view-result").classList.add("active");
}

/************************************************=========
  8. JWE YON JOU
=========================================================*/
let currentDay = 1;
let currentQuestions = [];
let currentIndex = 0;
let currentScore = 0;

function startDay(day) {
    if (!questionsLoaded) {
        showToast("Kesyon yo poko fin chaje. Tann yon ti moman.", "⏳");
        return;
    }
    const alreadyDone = weekProgress[day] && weekProgress[day].completed;
    if (alreadyDone) {
        showToast("Ou fin fè jou sa a semèn sa a! Tounen semèn pwochèn.", "ℹ️");
        return;
    }

    currentDay = day;
    currentQuestions = pickQuestionsForDay(day);
    currentIndex = 0;
    currentScore = 0;

    document.getElementById("quiz-day-pill").innerText = `Jou ${day}`;
    showQuizView();
    loadQuestion();
}

function retryDay() {
    startDay(currentDay);
}

function loadQuestion() {
    const q = currentQuestions[currentIndex];
    document.getElementById("quiz-progress").innerText = `${currentIndex + 1}/${currentQuestions.length}`;
    document.getElementById("quiz-question").innerText = q.question;

    const answersDiv = document.getElementById("quiz-answers");
    answersDiv.innerHTML = "";
    q.options.forEach((opt, i) => {
        const btn = document.createElement("button");
        btn.className = "answer-btn";
        btn.innerText = opt;
        btn.onclick = () => checkAnswer(i, btn);
        answersDiv.appendChild(btn);
    });
}

function checkAnswer(selectedIndex, btnEl) {
    const q = currentQuestions[currentIndex];
    const allBtns = document.querySelectorAll(".answer-btn");
    allBtns.forEach(b => { b.classList.add("disabled"); });

    if (selectedIndex === q.reponse) {
        btnEl.classList.add("correct");
        currentScore++;
    } else {
        btnEl.classList.add("wrong");
        if (allBtns[q.reponse]) allBtns[q.reponse].classList.add("correct");
    }

    setTimeout(() => {
        currentIndex++;
        if (currentIndex < currentQuestions.length) {
            loadQuestion();
        } else {
            finishDay();
        }
    }, 1300);
}

/************************************************=========
  9. FEN JOU A — rekonpans si tout bon, sove pwogrè a
=========================================================*/
function finishDay() {
    const total = currentQuestions.length;
    const perfect = currentScore === total;

    document.getElementById("result-emoji").innerText = perfect ? "🎉" : "😕";
    document.getElementById("result-title").innerText = perfect ? "Bravo, tout bon!" : "Prèske genyen l!";
    document.getElementById("result-score").innerText = `${currentScore}/${total} kòrèk`;

    const coinsDiv = document.getElementById("result-coins");
    const retryBtn = document.getElementById("retry-btn");

    if (perfect) {
        coinsDiv.style.display = "inline-flex";
        coinsDiv.innerText = `🪙 +${REWARD_COINS} pyès`;
        retryBtn.style.display = "none";
        applyReward();
        saveDayProgress(true);
    } else {
        coinsDiv.style.display = "none";
        retryBtn.style.display = "block";
        // Pa sove kòm "fèt" — yo ka eseye ankò
    }

    showResultView();
}

function applyReward() {
    const newCoins = (localUser.coins || 0) + REWARD_COINS;
    const newXp = (localUser.xp || 0) + REWARD_XP;
    const newLevel = Math.floor(newXp / 100) + 1;

    localUser.coins = newCoins;
    localUser.xp = newXp;
    localUser.level = newLevel;
    localStorage.setItem("ns4_user", JSON.stringify(localUser));

    db.ref(`users/${localUser.uid}`).update({ coins: newCoins, xp: newXp, level: newLevel });
    db.ref(`leaderboard/${localUser.uid}`).update({ xp: newXp, level: newLevel });
}

function saveDayProgress(completed) {
    weekProgress[currentDay] = {
        completed,
        score: currentScore,
        total: currentQuestions.length,
        earnedCoins: completed ? REWARD_COINS : 0,
        completedAt: firebase.database.ServerValue.TIMESTAMP
    };
    db.ref(`defi_progress/${localUser.uid}/${CURRENT_WEEK}/${currentDay}`).set(weekProgress[currentDay]);
}

/************************************************=========
  10. INISYALIZASYON
=========================================================*/
loadQuestionsFromGithub();
loadWeekProgress();

