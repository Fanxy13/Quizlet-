/* ==========================================================================
   app.js - Start der Anwendung
   ========================================================================== */
(function (App) {
  'use strict';

  function boot() {
    App.registerPages();
    App.ui.register('study', App.study.route);

    // Geteilter Link ohne Hash-Route (?d=...) -> auf die Import-Route umbiegen
    var params = new URLSearchParams(location.search);
    if (params.get('d') && !location.hash) {
      location.replace(location.pathname + '#/import?d=' + params.get('d'));
    }

    App.ui.start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.App);
