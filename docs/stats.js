// stats.js v3
// XP / Pyès ak yon "outbox" dirab: pwen yo sove sou telefòn nan touswit (menm offline, menm si paj la fèmen),
// epi yo voye sou Firebase lè entènèt la tounen — yon sèl fwa chak (idanpotan).
//
// REGLE OR:  localStorage "ns4_user" = dènye done SÈVÈ a (verite).
//            Sa moun nan wè = StatsAPI.applyPending(ns4_user)  (verite + pwen ki poko voye).
//
// Chaje stats.js APRE Firebase SDK yo, epi rele StatsAPI.start() apre firebase.initializeApp().
const StatsAPI = {

  _connected: false,
  _flushing: false,
  _started: false,
  onChange: null,          // (opsyonèl) fonksyon ki rele lè outbox la chanje
  lastError: null,         // dènye erè voye/senkronize (pou diyagnostik)

  getUser() {
    try { return JSON.parse(localStorage.getItem("ns4_user")); } catch (e) { return null; }
  },

  saveUser(user) {
    localStorage.setItem("ns4_user", JSON.stringify(user));
  },

  /* ---------- OUTBOX ---------- */
  _key(uid) { return "ns4_outbox_" + uid; },

  _read(uid) {
    try {
      const l = JSON.parse(localStorage.getItem(this._key(uid)) || "[]");
      return Array.isArray(l) ? l : [];
    } catch (e) { return []; }
  },

  _write(uid, list) {
    try {
      if (list.length) localStorage.setItem(this._key(uid), JSON.stringify(list));
      else localStorage.removeItem(this._key(uid));
    } catch (e) { /* kach plen */ }
    if (typeof this.onChange === "function") { try { this.onChange(); } catch (e) {} }
  },

  pendingCount() {
    const u = this.getUser();
    return u && u.uid ? this._read(u.uid).length : 0;
  },

  // verite (ns4_user) + pwen ki poko sou sèvè a. Pa janm konte yon pwen de fwa (rewardIds).
  applyPending(user) {
    if (!user || !user.uid) return user;
    const applied = user.rewardIds || {};
    let dx = 0, dc = 0, qx = 0, qc = 0;
    this._read(user.uid).forEach((it) => {
      if (applied[it.id]) return;
      dx += it.xp || 0;
      dc += it.coins || 0;
      if (it.source === "quiz") { qx += it.xp || 0; qc += it.coins || 0; }
    });
    if (!dx && !dc) return user;

    const out = Object.assign({}, user);
    out.xp = (user.xp || 0) + dx;
    out.coins = (user.coins || 0) + dc;
    out.level = Math.floor(out.xp / 100) + 1;
    if (qx || qc) {
      const q = user.quizStats || {};
      out.quizStats = Object.assign({}, q, { xp: (q.xp || 0) + qx, coins: (q.coins || 0) + qc });
    }
    return out;
  },

  /* ---------- BAY REKONPANS ---------- */
  // Sove nan outbox la (dirab), voye sou sèvè a si nou konekte. Retounen eleman an.
  addReward(xp, coins, source = "quiz") {
    const user = this.getUser();
    if (!user || !user.uid) return null;

    xp = Math.max(0, Math.floor(Number(xp) || 0));
    coins = Math.max(0, Math.floor(Number(coins) || 0));
    if (!xp && !coins) return null;

    const item = {
      id: user.uid.slice(0, 6) + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      xp: xp, coins: coins, source: source, ts: Date.now()
    };
    const list = this._read(user.uid);
    list.push(item);
    this._write(user.uid, list.slice(-500));

    this.flush();
    return item;
  },

  /* ---------- VOYE SOU SÈVÈ A ---------- */
  flush() {
    const user = this.getUser();
    if (!user || !user.uid || this._flushing || !this._connected) return Promise.resolve();
    if (typeof firebase === "undefined") return Promise.resolve();

    const uid = user.uid;
    const cu = firebase.auth().currentUser;
    if (!cu || cu.uid !== uid) return Promise.resolve();

    const list = this._read(uid);
    if (!list.length) return Promise.resolve();

    this._flushing = true;
    const database = firebase.database();
    const withTimeout = (p, ms) => new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout")), ms);
      p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
    });

    const step = (i) => {
      if (i >= list.length) return Promise.resolve();
      const it = list[i];

      const tx = database.ref("users/" + uid).transaction((u) => {
        if (u === null) return u;                  // pa gen kach: sèvè a ap rele ankò ak vre done yo
        const ids = u.rewardIds || {};
        if (ids[it.id]) return;                    // deja aplike -> abandone (pa konte de fwa)

        u.xp = (u.xp || 0) + it.xp;
        u.coins = (u.coins || 0) + it.coins;
        if (it.source === "quiz") {
          const q = u.quizStats || {};
          q.xp = (q.xp || 0) + it.xp;
          q.coins = (q.coins || 0) + it.coins;
          u.quizStats = q;
        }
        u.level = Math.floor(u.xp / 100) + 1;

        ids[it.id] = it.ts;
        const cutoff = Date.now() - 45 * 24 * 60 * 60 * 1000;   // netwaye ansyen id yo
        Object.keys(ids).forEach((k) => { if (ids[k] < cutoff) delete ids[k]; });
        u.rewardIds = ids;
        return u;
      }, undefined, false);

      return withTimeout(tx, 15000).then((res) => {
        const v = res.snapshot && res.snapshot.val();
        const done = !!(v && v.rewardIds && v.rewardIds[it.id]);   // sèlman si sèvè a gen id la vre
        if (!done) throw new Error("pa aplike");
        this._write(uid, this._read(uid).filter((x) => x.id !== it.id));
        return step(i + 1);
      });
    };

    return step(0)
      .then(() => this.syncLeaderboard())
      .then(() => { this.lastError = null; })
      .catch((err) => { this.lastError = (err && (err.code || err.message)) || "erè"; console.warn("StatsAPI.flush (n ap eseye ankò):", this.lastError); })
      .then(() => { this._flushing = false; });
  },

  // Rele yon fwa apre firebase.initializeApp()
  start() {
    if (this._started || typeof firebase === "undefined") return;
    this._started = true;
    try {
      firebase.database().ref(".info/connected").on("value", (snap) => {
        this._connected = snap.val() === true;
        if (this._connected) this.flush();
      });
      firebase.auth().onAuthStateChanged((u) => { if (u) this.flush(); });
    } catch (e) { console.warn("StatsAPI.start:", e); }
    window.addEventListener("online", () => this.flush());
    setInterval(() => this.flush(), 60000);
  },

  /* ---------- KLASMAN ---------- */
  // Li vrè done yo sou /users/{uid}; kopye done piblik yo nan /leaderboard;
  // mete verite lokal la ajou (xp, pyès, quizStats ak rewardIds ANSANM pou pa konte de fwa).
  syncLeaderboard() {
    const user = this.getUser();
    if (!user || !user.uid) return Promise.resolve();

    const database = firebase.database();
    return database.ref("users/" + user.uid).once("value").then((snap) => {
      if (!snap.exists()) return;
      const d = snap.val();
      const xp = d.xp || 0;
      const level = Math.floor(xp / 100) + 1;

      const local = this.getUser() || user;
      local.xp = xp;
      local.coins = d.coins || 0;
      local.level = level;
      local.quizStats = d.quizStats || {};
      local.rewardIds = d.rewardIds || {};
      this.saveUser(local);
      if (typeof this.onChange === "function") { try { this.onChange(); } catch (e) {} }

      const ops = {};
      ops["leaderboard/" + user.uid] = {
        pseudo: d.pseudo || "Itilizatè",
        xp: xp,
        level: level,
        streak: d.streak || 0,
        photoURL: d.photoURL || null
      };
      ops["users/" + user.uid + "/level"] = level;
      return database.ref().update(ops);
    }).catch((err) => { this.lastError = "leaderboard: " + ((err && (err.code || err.message)) || "erè"); console.warn("StatsAPI.syncLeaderboard:", this.lastError); });
  }
};