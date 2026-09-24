/* =========================================================
   ns4-correction.js — Korije an TÈKS ak bèl style
   Admin ekri yon tèks senp (fòma anba a), paj egzamen an transfòme l an kat byen estile
   (egzèsis, kesyon, repons an vèt, fòmil, konsèy, atansyon...). Menm kòd la sèvi pou "Prevwa" nan admin.

   FÒMA (yon liy chak fwa):
     # Egzèsis 1 — Limit ak dérivé (5 pts)     -> nouvo egzèsis  (pwen opsyonèl: (5 pts))
     ## 1) Kalkile f'(x)                        -> nouvo kesyon nan egzèsis la
     Tèks nòmal ...                             -> paragraf   (**gra** pou mete an gra)
     - yon pwen / - yon lòt                     -> lis
     1. premye etap / 2. dezyèm etap            -> etap nimewote
     Fòmil: f'(x) = 3x^2 + 1                    -> bwat fòmil        (oswa $$ ... $$ sou yon liy)
     Repons: f'(x) = 3x^2 + 1                   -> bwat repons final (oswa liy ki kòmanse ak  > )
     Metòd: ... | Rapèl: ... | Konsèy: ... | Atansyon: ...   -> ti bwat koulè
     ---                                        -> liy separasyon
   Fòmil: ekri ak \( ... \) oswa $ ... $ (si ou bliye, kòd la eseye mete yo pou ou).
========================================================= */
(function (global) {
"use strict";

const CSS = `
.cor{--c-primary:var(--primary,#24439a);--c-dark:var(--primary-dark,#1d3783);--c-green:#1e9e57;--c-gold:#e0a800;--c-red:#d9382e;
  font-size:14px;line-height:1.6;color:var(--text,#1a1a1a);}
.cor *{box-sizing:border-box;}
.cor-toc{display:flex;gap:8px;overflow-x:auto;padding:2px 2px 12px;margin:0 -2px;-webkit-overflow-scrolling:touch;}
.cor-toc button{flex-shrink:0;border:0;background:#fff;color:var(--c-dark);font-weight:700;font-size:12.5px;padding:8px 14px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.06);cursor:pointer;font-family:inherit;}
.cor-toc button.done{background:#e8f8ee;color:var(--c-green);}
.cor-intro{background:#fff;border-radius:16px;padding:14px 16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(0,0,0,.05);}
.cor-ex{background:#fff;border-radius:18px;margin-bottom:16px;box-shadow:0 2px 10px rgba(0,0,0,.06);overflow:hidden;scroll-margin-top:90px;}
.cor-ex-head{display:flex;align-items:center;gap:12px;padding:14px 16px;background:linear-gradient(135deg,#eef2fb 0%,#fff 100%);border-bottom:1px solid #eef0f6;}
.cor-ex-num{flex-shrink:0;width:36px;height:36px;border-radius:12px;background:linear-gradient(135deg,var(--c-primary),var(--c-dark));color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center;font-family:"Baloo 2",sans-serif;}
.cor-ex-title{flex:1;min-width:0;font-family:"Baloo 2",sans-serif;font-weight:700;font-size:16px;line-height:1.25;color:var(--c-dark);}
.cor-pts{flex-shrink:0;background:#fff8e6;color:#8a6500;border:1px solid #ffe08a;font-weight:800;font-size:11.5px;padding:4px 10px;border-radius:12px;}
.cor-ex-body{padding:12px 16px 4px;}
.cor-q{position:relative;margin:0 0 14px;padding:10px 12px 12px 14px;border-left:4px solid #c9d3ee;border-radius:0 12px 12px 0;background:#fafbfe;transition:.2s;}
.cor-q.understood{border-left-color:var(--c-green);background:#f3fbf6;}
.cor-q.review{border-left-color:var(--c-gold);background:#fffbf0;}
.cor-q-title{font-weight:800;font-size:14.5px;color:var(--c-dark);margin-bottom:6px;}
.cor-p{margin:6px 0;}
.cor-list{margin:6px 0 6px 20px;padding:0;}
.cor-list li{margin:3px 0;}
ol.cor-list{counter-reset:s;list-style:none;margin-left:0;}
ol.cor-list li{counter-increment:s;position:relative;padding-left:30px;margin:6px 0;}
ol.cor-list li::before{content:counter(s);position:absolute;left:0;top:1px;width:22px;height:22px;border-radius:50%;background:var(--c-primary);color:#fff;font-size:11.5px;font-weight:800;display:flex;align-items:center;justify-content:center;}
.cor-tag{display:inline-block;font-size:10.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;margin-bottom:3px;}
.cor-formula{margin:8px 0;padding:10px 12px;border-radius:12px;background:#fff8e6;border:1px dashed #f0c14b;overflow-x:auto;}
.cor-formula .cor-tag{color:#8a6500;}
.cor-answer{margin:10px 0;padding:11px 14px;border-radius:12px;background:#e8f8ee;border:1.5px solid #7fd6a1;overflow-x:auto;transition:filter .25s;}
.cor-answer .cor-tag{color:var(--c-green);}
.cor-answer strong{color:#12703c;}
.cor-hide .cor-answer:not(.revealed){filter:blur(7px);cursor:pointer;user-select:none;}
.cor-hide .cor-answer:not(.revealed)::after{content:"👁 Tape pou wè repons lan";position:absolute;}
.cor-callout{margin:8px 0;padding:9px 12px;border-radius:12px;border-left:4px solid;font-size:13.5px;}
.cor-callout .cor-tag{display:block;}
.cor-tip{background:#eef2fb;border-color:#5b7bd5;}.cor-tip .cor-tag{color:#3556b8;}
.cor-warn{background:#fdecea;border-color:var(--c-red);}.cor-warn .cor-tag{color:var(--c-red);}
.cor-method{background:#f4edfb;border-color:#8e5bd5;}.cor-method .cor-tag{color:#6b3bb8;}
.cor-recall{background:#eaf6fb;border-color:#3aa3d1;}.cor-recall .cor-tag{color:#1f7ca3;}
.cor-hr{border:0;border-top:1px dashed #d5d9e6;margin:12px 0;}
.cor code{background:#eef0f6;padding:1px 6px;border-radius:6px;font-size:12.5px;}
.cor-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}
.cor-actions button{border:0;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;background:#eef0f6;color:var(--c-dark);font-family:inherit;}
.cor-actions button.on-ok{background:var(--c-green);color:#fff;}
.cor-actions button.on-rev{background:var(--c-gold);color:#4a3600;}
.cor-ex-foot{padding:0 16px 12px;}
.cor mjx-container[display="true"]{display:block;margin:.5em 0;overflow-x:auto;overflow-y:hidden;max-width:100%;}
`;

function injectCSS() {
  if (document.getElementById("ns4-cor-css")) return;
  const st = document.createElement("style");
  st.id = "ns4-cor-css";
  st.textContent = CSS;
  document.head.appendChild(st);
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fx(s) { return global.NS4Math ? global.NS4Math.T(s) : String(s == null ? "" : s); }
function inline(s) {
  return esc(fx(s)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}

/* ---------- PARSE ---------- */
const RX_ANSWER = /^(repons|réponse|reponse|rezilta|résultat|resultat|solisyon finale|reponn)\s*[:：]\s*(.*)$/i;
const RX_FORMULA = /^(fòmil|fomil|formule|formula)\s*[:：]\s*(.*)$/i;
const RX_CALLOUT = [
  ["tip", /^(konsèy|konsey|astuce|tip|trik)\s*[:：]\s*(.*)$/i],
  ["warn", /^(atansyon|attention|erè komen|ere komen|pyèj|piege|piège)\s*[:：]\s*(.*)$/i],
  ["method", /^(metòd|metod|méthode|methode)\s*[:：]\s*(.*)$/i],
  ["recall", /^(rapèl|rapel|rappel)\s*[:：]\s*(.*)$/i]
];

function parse(text) {
  const raw = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
  const lines = raw.split("\n");
  const intro = [], exercises = [];
  let ex = null, q = null, para = null, list = null, ans = null;

  const cur = () => (q ? q.blocks : ex ? ex.blocks : intro);
  const flush = () => {
    if (para) { cur().push({ t: "p", text: para.join("\n") }); para = null; }
    if (list) { cur().push(list); list = null; }
  };
  const newEx = (title) => {
    flush(); ans = null;
    let pts = "";
    title = title.replace(/\(\s*(\d+(?:[.,]\d+)?)\s*(?:pts?|points?|pwen)\s*\)/i, (m, n) => { pts = n; return ""; }).trim();
    ex = { title: title || "Egzèsis", points: pts, blocks: [], questions: [] };
    exercises.push(ex);
    q = null;
  };
  const newQ = (title) => {
    flush(); ans = null;
    if (!ex) newEx("Korije");
    q = { title: title, blocks: [] };
    ex.questions.push(q);
  };

  lines.forEach((line) => {
    const l = line.trim();
    let m;

    if (!l) { flush(); ans = null; return; }
    if ((m = l.match(/^#\s+(.*)$/))) { newEx(m[1]); return; }
    if ((m = l.match(/^#{2,3}\s+(.*)$/))) { newQ(m[1]); return; }
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(l)) { flush(); ans = null; cur().push({ t: "hr" }); return; }

    if ((m = l.match(/^>\s?(.*)$/))) {
      flush();
      if (ans) ans.text += "\n" + m[1];
      else { ans = { t: "answer", text: m[1] }; cur().push(ans); }
      return;
    }
    ans = null;

    if ((m = l.match(RX_ANSWER))) { flush(); cur().push({ t: "answer", text: m[2] }); return; }
    if ((m = l.match(RX_FORMULA))) { flush(); cur().push({ t: "formula", text: m[2] }); return; }
    if (/^\$\$.+\$\$$/.test(l) || /^\\\[.+\\\]$/.test(l)) { flush(); cur().push({ t: "formula", text: l }); return; }
    for (let i = 0; i < RX_CALLOUT.length; i++) {
      if ((m = l.match(RX_CALLOUT[i][1]))) { flush(); cur().push({ t: "callout", kind: RX_CALLOUT[i][0], text: m[2] }); return; }
    }
    if ((m = l.match(/^[-*•]\s+(.*)$/))) {
      if (para) flush();
      if (list && list.t !== "ul") flush();
      if (!list) list = { t: "ul", items: [] };
      list.items.push(m[1]);
      return;
    }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))) {
      if (para) flush();
      if (list && list.t !== "ol") flush();
      if (!list) list = { t: "ol", items: [] };
      list.items.push(m[1]);
      return;
    }
    if (list) flush();
    if (!para) para = [];
    para.push(l);
  });
  flush();

  // Tèks san okenn tit -> yon sèl egzèsis
  if (!exercises.length && intro.length) {
    exercises.push({ title: "Korije", points: "", blocks: intro.splice(0), questions: [] });
  }

  // Estatistik
  let nQ = 0, nAns = 0;
  const countAns = (bl) => bl.forEach((b) => { if (b.t === "answer") nAns++; });
  countAns(intro);
  exercises.forEach((e) => { countAns(e.blocks); e.questions.forEach((k) => { nQ++; countAns(k.blocks); }); });
  const words = (raw.match(/\S+/g) || []).length;
  const items = [];
  exercises.forEach((e, i) => {
    if (e.questions.length) e.questions.forEach((k, j) => items.push(i + "_" + j));
    else items.push(String(i));
  });

  return {
    intro, exercises, items,
    stats: { exercises: exercises.length, questions: nQ, answers: nAns, minutes: Math.max(1, Math.ceil(words / 170)) }
  };
}

/* ---------- RENDER ---------- */
function blockHTML(b) {
  switch (b.t) {
    case "p": return '<p class="cor-p">' + b.text.split("\n").map(inline).join("<br>") + "</p>";
    case "ul":
    case "ol": return "<" + b.t + ' class="cor-list">' + b.items.map((i) => "<li>" + inline(i) + "</li>").join("") + "</" + b.t + ">";
    case "formula": return '<div class="cor-formula"><span class="cor-tag">Fòmil</span><div>' + inline(b.text) + "</div></div>";
    case "answer": return '<div class="cor-answer"><span class="cor-tag">✅ Repons</span><div>' + b.text.split("\n").map(inline).join("<br>") + "</div></div>";
    case "callout": {
      const meta = { tip: ["cor-tip", "💡 Konsèy"], warn: ["cor-warn", "⚠️ Atansyon"], method: ["cor-method", "🧭 Metòd"], recall: ["cor-recall", "📌 Rapèl"] }[b.kind];
      return '<div class="cor-callout ' + meta[0] + '"><span class="cor-tag">' + meta[1] + "</span>" + inline(b.text) + "</div>";
    }
    case "hr": return '<hr class="cor-hr">';
  }
  return "";
}

function actionsHTML(key) {
  return '<div class="cor-actions">' +
    '<button type="button" data-act="ok" data-key="' + key + '">✓ Mwen konprann</button>' +
    '<button type="button" data-act="rev" data-key="' + key + '">🔁 Pou revize</button></div>';
}

// opts.interactive = mete bouton "Mwen konprann" / "Pou revize"; opts.idPrefix = prefiks id yo
function render(parsed, opts) {
  opts = opts || {};
  const pre = opts.idPrefix || "cor";
  let html = '<div class="cor">';

  if (parsed.intro.length) html += '<div class="cor-intro">' + parsed.intro.map(blockHTML).join("") + "</div>";

  parsed.exercises.forEach((e, i) => {
    html += '<section class="cor-ex" id="' + pre + "-ex-" + i + '">';
    html += '<header class="cor-ex-head"><div class="cor-ex-num">' + (i + 1) + '</div><div class="cor-ex-title">' + inline(e.title) + "</div>" +
            (e.points ? '<span class="cor-pts">' + esc(e.points) + " pts</span>" : "") + "</header>";
    html += '<div class="cor-ex-body">' + e.blocks.map(blockHTML).join("");

    e.questions.forEach((k, j) => {
      const key = i + "_" + j;
      html += '<div class="cor-q" data-key="' + key + '"><div class="cor-q-title">' + inline(k.title) + "</div>" +
              k.blocks.map(blockHTML).join("") + (opts.interactive ? actionsHTML(key) : "") + "</div>";
    });
    html += "</div>";
    if (!e.questions.length && opts.interactive) {
      html += '<div class="cor-ex-foot" data-key="' + i + '">' + actionsHTML(String(i)) + "</div>";
    }
    html += "</section>";
  });

  return html + "</div>";
}

global.NS4Correction = { parse: parse, render: render, injectCSS: injectCSS, inline: inline, esc: esc };

})(window);