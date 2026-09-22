/* =========================================================
   ns4-math.js — MathJax + fòmil otomatik pou tout paj yo (exam, fòmil, vokabilè...)
   - T(tèks): repare "\" ki pèdi epi mete \( \) otou fòmil ki pa gen delimitè
   - typeset(eleman...): rann fòmil yo ak MathJax (chaje MathJax pou kont li, pa bezwen mete l nan HTML)
   - processDom(eleman): T() sou tout tèks nan yon eleman deja afiche + typeset
   - san MathJax (offline): fòmil yo vin tèks senp lizib
   Itilizasyon:  <script src="ns4-math.js"></script>  epi  NS4Math.processDom(document.getElementById("...")) apre chak rann.
========================================================= */
(function (global) {
"use strict";

// Yon sèl "\" nan yon string JS kreye karaktè kontwòl (\f de \frac, \t de \theta, \b de \beta, ...).
function healEscapes(s) {
  return String(s == null ? "" : s)
    .replace(/\f(?=[a-zA-Z])/g, "\\f")
    .replace(/\v(?=[a-zA-Z])/g, "\\v")
    .replace(/\x08(?=[a-zA-Z])/g, "\\b")
    .replace(/\t(?=[a-zA-Z])/g, "\\t")
    .replace(/\r(?=[a-zA-Z])/g, "\\r");
}

/* ---- LaTeX SAN delimitè (egzanp: "moyenne \\bar{x} de ...", "\\frac{a}{b} = 3", "X_{max} - X_{min}", "100\\%")
        -> nou mete \( ... \) otomatikman otou chak ekspresyon. Si tèks la deja gen delimitè, nou pa touche l. ---- */
const AM_OPS = "=+-*/<>×−≤≥≠·±";
function amIsL(c) { return !!c && /[A-Za-z\u00C0-\u024F]/.test(c); }   // lèt (ak aksan)
function amIsD(c) { return !!c && /[0-9]/.test(c); }
function amBalanced(s, i) {                 // s[i] === "{"  ->  endèks apre "}" ki koresponn lan (oswa -1)
  let d = 0;
  for (let k = i; k < s.length; k++) {
    if (s[k] === "{") d++;
    else if (s[k] === "}") { d--; if (d === 0) return k + 1; }
  }
  return -1;
}
function amScripts(s, i) {                  // _{..}  ^{..}  _i  ^2
  let end = i, found = false;
  while (end < s.length && (s[end] === "_" || s[end] === "^")) {
    const c = s[end + 1];
    if (c === "{") { const e = amBalanced(s, end + 1); if (e < 0) break; end = e; }
    else if (amIsL(c) || amIsD(c)) end += 2;
    else break;
    found = true;
  }
  return { end: end, found: found };
}
function amGroup(s, i) {                    // (....) ki sanble matematik (pa gen mo) -> { end, tex } oswa null
  let d = 0, k = i;
  for (; k < s.length; k++) {
    if (s[k] === "(") d++;
    else if (s[k] === ")") { d--; if (d === 0) break; }
  }
  if (k >= s.length) return null;
  const inner = s.slice(i + 1, k);
  if (!inner.trim() || !/^[A-Za-z0-9+\-*\/^_=<>.,'\s\\{}%]*$/.test(inner)) return null;
  if (/[A-Za-z]{2,}/.test(inner.replace(/\\[a-zA-Z]+/g, ""))) return null;
  const sc = amScripts(s, k + 1);
  return { end: sc.end, tex: sc.found || /[\\^_]/.test(inner) };
}
function amAtom(s, i) {                     // yon "atòm" matematik ki kòmanse nan i -> { end, tex } oswa null
  const c = s[i];
  if (c === "(") return amGroup(s, i);
  if (c === "\\") {
    if (s[i + 1] === "%") return { end: i + 2, tex: true };
    let k = i + 1;
    while (amIsL(s[k])) k++;
    if (k === i + 1) return null;
    while (s[k] === "{") { const e = amBalanced(s, k); if (e < 0) break; k = e; }
    return { end: amScripts(s, k).end, tex: true };
  }
  if (amIsD(c)) {
    let k = i;
    while (amIsD(s[k])) k++;
    if ((s[k] === "." || s[k] === ",") && amIsD(s[k + 1])) { k++; while (amIsD(s[k])) k++; }
    let tex = false;
    if (s[k] === "\\" && s[k + 1] === "%") { k += 2; tex = true; }
    const sc = amScripts(s, k);
    return { end: sc.end, tex: tex || sc.found };
  }
  if (amIsL(c)) {
    let k = i + 1;
    while (s[k] && /[\u0300-\u036f]/.test(s[k])) k++;     // x̄ (siy konbinasyon)
    while (s[k] === "'") k++;                               // f'  (dérivé)
    if (amIsL(s[k])) return null;                          // 2 lèt oswa plis (l'étendue, d'un...) = yon mo, pa yon variab
    const sc = amScripts(s, k);
    return { end: sc.end, tex: sc.found };
  }
  return null;
}
function autoMath(s) {
  if (!s || /\\[(\[]|\$/.test(s)) return s;                 // deja gen delimitè
  if (!/\\[a-zA-Z%]|[A-Za-z0-9}][_^]/.test(s)) return s;    // pa gen LaTeX
  let out = "", i = 0;
  while (i < s.length) {
    const prev = i > 0 ? s[i - 1] : "";
    const a = /[A-Za-z0-9\u00C0-\u024F\\]/.test(prev) ? null : amAtom(s, i);
    if (!a) { out += s[i]; i++; continue; }
    let end = a.end, tex = a.tex;
    for (;;) {                                              // pwolonje ekspresyon an
      const nx = s[end];
      if (nx && /[A-Za-z0-9\\(]/.test(nx)) {                // miltiplikasyon implisit: 3x, 2\pi, f(x)
        const b = amAtom(s, end);
        if (b) { end = b.end; tex = tex || b.tex; continue; }
      }
      let j = end;
      while (s[j] === " ") j++;
      if (j >= s.length || AM_OPS.indexOf(s[j]) < 0) break;
      let k = j + 1;
      while (s[k] === " ") k++;
      const b2 = amAtom(s, k);
      if (!b2) break;
      end = b2.end; tex = tex || b2.tex;
    }
    out += tex ? "\\(" + s.slice(i, end) + "\\)" : s.slice(i, end);
    i = end;
  }
  return out;
}

// T() = repare karaktè kontwòl + mete delimitè si yo manke. Rele l sou CHAK tèks ki afiche.
function T(s) { return autoMath(healEscapes(s)); }


// LaTeX -> tèks senp pou yon mesaj (WhatsApp/SMS pa konn rann MathJax)
function texToPlain(s) {
  s = T(s);
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
         .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  }
  const sup = { "0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","n":"ⁿ","+":"⁺","-":"⁻" };
  s = s.replace(/\^\{([0-9n+\-]+)\}|\^([0-9n])/g, (m, a, b) => (a || b).split("").map((c) => sup[c] || c).join(""));
  const map = {
    times:"×", cdot:"·", leq:"≤", le:"≤", geq:"≥", ge:"≥", neq:"≠", infty:"∞", pi:"π",
    alpha:"α", beta:"β", gamma:"γ", delta:"δ", theta:"θ", lambda:"λ", mu:"μ", sigma:"σ", omega:"ω",
    Delta:"Δ", Omega:"Ω", sum:"Σ", int:"∫", pm:"±", to:"→", rightarrow:"→", Rightarrow:"⇒", approx:"≈", in:"∈",
    left:"", right:"", text:"", mathbb:"", mathrm:"", displaystyle:""
  };
  s = s.replace(/\\([a-zA-Z]+)/g, (m, n) => (Object.prototype.hasOwnProperty.call(map, n) ? map[n] : n));
  return s.replace(/\\[()[\]]|\$\$|\$/g, "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}


// Repase tout tèks nan yon eleman deja afiche: mete delimitè si yo manke.
function autoWrapDom(el) {
  if (!el || !document.createTreeWalker) return;
  const w = document.createTreeWalker(el, 4, null, false);
  const nodes = [];
  while (w.nextNode()) nodes.push(w.currentNode);
  nodes.forEach((n) => {
    const p = n.parentNode && n.parentNode.nodeName;
    if (p === "SCRIPT" || p === "STYLE" || p === "TEXTAREA") return;
    for (let a = n.parentNode; a && a !== el; a = a.parentNode) { if (/^MJX-/i.test(a.nodeName)) return; }   // pa touche sa MathJax deja rann
    const v = n.nodeValue;
    if (!v || v.length < 3) return;
    const t = T(v);
    if (t !== v) n.nodeValue = t;
  });
}

function plainFallback(els) {
  if (!document.createTreeWalker) return;
  els.forEach((el) => {
    const w = document.createTreeWalker(el, 4, null, false);
    const nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach((n) => { if (/\\[(\[]|\$\$/.test(n.nodeValue)) n.nodeValue = texToPlain(n.nodeValue); });
  });
}

/* ---- Chajman MathJax (yon sèl fwa) ---- */
const MJ_CDN = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js";
let mjLoading = false, mjFailed = false, mjQueue = [];

function hasMJ() { return !!(global.MathJax && global.MathJax.startup && global.MathJax.startup.promise); }

function runMJ(els) {
  const M = global.MathJax;
  M.startup.promise = M.startup.promise
    .then(() => M.typesetPromise(els))
    .catch((e) => console.warn("MathJax:", e));
}

function flushMJ() {
  const q = mjQueue; mjQueue = [];
  if (!q.length) return;
  if (hasMJ()) runMJ(q);
  else plainFallback(q);
}

function loadMJ() {
  if (mjLoading || hasMJ()) return;
  mjLoading = true;
  if (!global.MathJax || !global.MathJax.startup) {
    global.MathJax = {
      tex: { inlineMath: [["\\(", "\\)"], ["$", "$"]], displayMath: [["$$", "$$"], ["\\[", "\\]"]], processEscapes: true },
      options: { skipHtmlTags: ["script", "noscript", "style", "textarea", "pre", "code"] },
      startup: { typeset: false }
    };
  }
  const existing = document.querySelector('script[src*="mathjax"]');
  if (existing) {                                   // paj la deja gen script MathJax la (defer)
    window.addEventListener("load", () => setTimeout(flushMJ, 400));
    return;
  }
  const sc = document.createElement("script");
  sc.src = MJ_CDN;
  sc.async = true;
  sc.onload = () => { setTimeout(flushMJ, 0); };
  sc.onerror = () => { mjFailed = true; flushMJ(); console.warn("MathJax pa chaje: fòmil yo an tèks senp."); };
  document.head.appendChild(sc);
}

function typeset() {
  const els = Array.prototype.slice.call(arguments).filter(Boolean);
  if (!els.length) return;
  if (hasMJ()) { runMJ(els); return; }
  if (mjFailed) { plainFallback(els); return; }
  mjQueue = mjQueue.concat(els);
  loadMJ();
  // sekou: si MathJax pa vini nan 6 segonn, montre tèks senp
  setTimeout(() => { if (mjQueue.length && !hasMJ()) flushMJ(); }, 6000);
}

function processDom(el) { autoWrapDom(el); typeset(el); }

global.NS4Math = { T: T, healEscapes: healEscapes, autoMath: autoMath, texToPlain: texToPlain, typeset: typeset, processDom: processDom, autoWrapDom: autoWrapDom };

})(window);