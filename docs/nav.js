/* =========================================================================
   NS4 NAV — bouton retour Android (appelé par MainActivity.java)
   Règle simple, toujours la même :
     1) fermer ce qui est ouvert (menu, modale, vidéo, lightbox)
     2) remonter d'un niveau DANS la page (matière -> liste, jour -> semaine...)
     3) sinon (false) -> le natif décide : Accueil, ou double-appui pour quitter
   Aucune dépendance à l'historique du navigateur : pas de "page précédente"
   aléatoire, on remonte toujours l'arbre : page -> Accueil -> quitter.
   ========================================================================= */
(function (global) {
  "use strict";

  function $(id) { return document.getElementById(id); }

  // 1) Éléments "ouverts" à fermer d'abord
  function closeOpenLayer() {
    // Modale de verrou pub (ads.js)
    const gate = document.querySelector(".ns4-gate-overlay");
    if (gate) { gate.remove(); return true; }

    // Lightbox / vidéo / modales de déblocage ("show")
    const shown = document.querySelector(".modal-overlay.show, .video-overlay.show, #videoOverlay.show, #lightbox.show, #unlockOverlay.show");
    if (shown) {
      if (shown.id === "lightbox" && typeof global.closeLightbox === "function") global.closeLightbox();
      else if (shown.id === "videoOverlay" && typeof global.closeVideo === "function") global.closeVideo();
      else if (shown.id === "unlockOverlay" && typeof global.closeUnlock === "function") global.closeUnlock();
      else shown.classList.remove("show");
      return true;
    }

    // Menu latéral
    const menu = $("main-menu");
    if (menu && menu.classList.contains("open") && typeof global.toggleMainMenu === "function") {
      global.toggleMainMenu();
      return true;
    }
    return false;
  }

  // 2) Sous-vues propres à chaque page (elles ont déjà handleBack() ou onBack())
  function innerViewBack() {
    // vocab / fòmil / exam / defi : handleBack() remonte d'un niveau ou va à l'accueil
    const inner =
      ($("lessonsView") && $("lessonsView").classList.contains("active")) ||
      ($("exosView") && $("exosView").classList.contains("active")) ||
      ($("detailView") && $("detailView").classList.contains("active")) ||
      ($("view-quiz") && $("view-quiz").classList.contains("active")) ||
      ($("view-result") && $("view-result").classList.contains("active"));
    if (inner && typeof global.handleBack === "function") { global.handleBack(); return true; }

    // quiz.html : onBack() gère matière / niveau / leçon (avec confirmation)
    const qs = global.NS4_QUIZ_STATE;   // exposé par quiz.js
    if (typeof global.onBack === "function" && qs && qs.view && qs.view !== "subjects") {
      global.onBack();
      return true;
    }

    // milti.html : une partie affichée -> retour à la liste (jamais de sortie surprise)
    const live = $("match-live"), res = $("match-result");
    if (res && res.style.display === "block" && typeof global.backToLobby === "function") { global.backToLobby(); return true; }
    if (live && live.style.display === "block") {   // match en cours : on ne quitte pas par accident
      if (typeof global.showToast === "function") global.showToast("Match la ap kouri. Fini l anvan ou kite.", "⚠️");
      return true;
    }
    return false;
  }

  // Retourne true si la page a géré le retour, false sinon (le natif prend le relais)
  global.onAndroidBackPressed = function () {
    try {
      if (closeOpenLayer()) return true;
      if (innerViewBack()) return true;
    } catch (e) { console.warn("back:", e); }
    return false;
  };
})(window);
