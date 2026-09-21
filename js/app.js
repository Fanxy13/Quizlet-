/* ==========================================================================
   app.js - Start der Anwendung
   ========================================================================== */
(function (App) {
  'use strict';

  // Muss zum ?v=... in index.html passen - daran erkennt man, ob der
  // Browser wirklich die neueste Fassung geladen hat.
  App.VERSION = '1.4';

  function boot() {
    App.registerPages();
    App.ui.register('study', App.study.route);

    // Geteilter Link ohne Hash-Route (?d=...) -> auf die Import-Route umbiegen
    var params = new URLSearchParams(location.search);
    if (params.get('d') && !location.hash) {
      location.replace(location.pathname + '#/import?d=' + params.get('d'));
    }

    App.ui.start();

    // Zweitkopie prüfen: war der Hauptspeicher leer, kommen die Daten zurück
    App.store.restore().then(function (restored) {
      if (restored) {
        App.util.toast(App.util.plural(restored, 'Set', 'Sets') + ' wiederhergestellt', 'database');
        App.ui.render();
      }
    });

    if (App.store.storageMode() === 'memory') {
      App.util.toast('Speichern blockiert – bitte sichern', 'alert');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.App);
