/* ==========================================================================
   ui.js - Grundgerüst: Navigation, Router, wiederverwendbare Bausteine
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  var viewHost = null;
  var railHost = null;
  var routes = {};
  var currentKeyHandler = null;
  var currentCleanup = null;

  /* ---------- Theme ---------- */

  function applyTheme() {
    var theme = App.store.settings().theme;
    document.documentElement.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f7fb' : '#0a092d');
  }

  function toggleTheme() {
    App.store.updateSettings({ theme: App.store.settings().theme === 'light' ? 'dark' : 'light' });
    applyTheme();
    renderRail();
  }

  /* ---------- Navigation ---------- */

  var NAV = [
    { icon: 'home', route: '#/', title: 'Start' },
    { icon: 'link', route: '#/new', title: 'Set aus Link' },
    { icon: 'library', route: '#/library', title: 'Meine Sets' },
    { icon: 'settings', route: '#/settings', title: 'Einstellungen' }
  ];

  function renderRail() {
    if (!railHost) return;
    u.clear(railHost);
    var hash = location.hash || '#/';

    railHost.appendChild(el('a', { class: 'rail__logo', href: '#/', title: 'QuizFree' }, [u.icon('logo')]));

    var nav = el('nav', { class: 'rail__nav' });
    NAV.forEach(function (item) {
      var active = hash === item.route || (item.route !== '#/' && hash.indexOf(item.route) === 0);
      nav.appendChild(el('a', {
        class: 'rail__link' + (active ? ' is-active' : ''),
        href: item.route,
        title: item.title,
        'aria-label': item.title
      }, [u.icon(item.icon), el('span', { class: 'rail__label', text: item.title })]));
    });
    railHost.appendChild(nav);

    var theme = App.store.settings().theme;
    railHost.appendChild(el('button', {
      class: 'rail__link rail__link--end',
      type: 'button',
      title: theme === 'light' ? 'Dunkel' : 'Hell',
      'aria-label': 'Design wechseln',
      onclick: toggleTheme
    }, [u.icon(theme === 'light' ? 'moon' : 'sun')]));
  }

  /* ---------- Bausteine ---------- */

  function topbar(options) {
    var bar = el('header', { class: 'topbar' });
    if (options.back) {
      bar.appendChild(el('a', { class: 'iconbtn', href: options.back, title: 'Zurück', 'aria-label': 'Zurück' }, [u.icon('arrow-left')]));
    }
    var titles = el('div', { class: 'topbar__titles' }, [
      el('h1', { class: 'topbar__title', text: options.title || '' })
    ]);
    if (options.subtitle) titles.appendChild(el('p', { class: 'topbar__subtitle', text: options.subtitle }));
    bar.appendChild(titles);
    if (options.actions && options.actions.length) {
      bar.appendChild(el('div', { class: 'topbar__actions' }, options.actions));
    }
    return bar;
  }

  /** Fortschrittsring als SVG. */
  function ring(percent, size, label) {
    size = size || 56;
    var radius = (size - 8) / 2;
    var circumference = 2 * Math.PI * radius;
    var offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ring');
    svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    var track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('class', 'ring__track');
    track.setAttribute('cx', size / 2); track.setAttribute('cy', size / 2); track.setAttribute('r', radius);
    var value = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    value.setAttribute('class', 'ring__value');
    value.setAttribute('cx', size / 2); value.setAttribute('cy', size / 2); value.setAttribute('r', radius);
    value.setAttribute('stroke-dasharray', circumference);
    value.setAttribute('stroke-dashoffset', offset);
    value.setAttribute('transform', 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')');
    var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('class', 'ring__text');
    text.setAttribute('x', size / 2); text.setAttribute('y', size / 2);
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central');
    text.textContent = label !== undefined ? label : percent + '%';
    svg.appendChild(track); svg.appendChild(value); svg.appendChild(text);
    return svg;
  }

  function bar(value, max) {
    var percent = max ? Math.round((value / max) * 100) : 0;
    return el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': percent }, [
      el('div', { class: 'bar__fill', style: 'width:' + percent + '%' })
    ]);
  }

  function empty(iconName, text, action) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon' }, [u.icon(iconName)]),
      el('p', { class: 'empty__text', text: text }),
      action || null
    ]);
  }

  /* ---------- Overlay / Dialog ---------- */

  function modal(options) {
    var backdrop = el('div', { class: 'modal' });
    function close() {
      backdrop.classList.add('modal--out');
      setTimeout(function () { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); }, 160);
    }
    var box = el('div', { class: 'modal__box' }, [
      el('div', { class: 'modal__head' }, [
        options.icon ? el('div', { class: 'modal__icon' }, [u.icon(options.icon)]) : null,
        el('h2', { class: 'modal__title', text: options.title || '' }),
        el('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Schließen', onclick: close }, [u.icon('x')])
      ]),
      options.body ? el('div', { class: 'modal__body' }, options.body) : null,
      options.actions ? el('div', { class: 'modal__actions' }, options.actions) : null
    ]);
    backdrop.appendChild(box);
    backdrop.addEventListener('click', function (event) { if (event.target === backdrop) close(); });
    document.body.appendChild(backdrop);
    return { close: close, node: box };
  }

  function confirm(message, iconName) {
    return new Promise(function (resolve) {
      var dialog = modal({
        title: message,
        icon: iconName || 'alert',
        actions: [
          el('button', { class: 'btn', type: 'button', text: 'Abbrechen', onclick: function () { dialog.close(); resolve(false); } }),
          el('button', { class: 'btn btn--danger', type: 'button', onclick: function () { dialog.close(); resolve(true); } }, [u.icon('check'), el('span', { text: 'Ja' })])
        ]
      });
    });
  }

  /* ---------- Tastatur ---------- */

  function keys(map) {
    if (currentKeyHandler) document.removeEventListener('keydown', currentKeyHandler);
    currentKeyHandler = function (event) {
      var target = event.target;
      var typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      var key = event.key;
      var handler = map[key] || map[key.toLowerCase()];
      if (!handler) return;
      if (typing && !handler.always) return;
      handler.run ? handler.run(event) : handler(event);
      if (!(handler.passive)) event.preventDefault();
    };
    document.addEventListener('keydown', currentKeyHandler);
  }

  /* ---------- Router ---------- */

  /** decodeURIComponent, das bei kaputten Prozentzeichen nicht wirft. */
  function safeDecode(value) {
    try { return decodeURIComponent(value); } catch (error) { return value; }
  }

  function parseHash() {
    var hash = (location.hash || '#/').slice(1);
    var parts = hash.split('?');
    var path = parts[0].replace(/^\/+|\/+$/g, '');
    var query = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      query[safeDecode(kv[0])] = safeDecode((kv[1] || '').replace(/\+/g, ' '));
    });
    return { segments: path ? path.split('/') : [], query: query };
  }

  function register(name, handler) { routes[name] = handler; }

  function go(hash) { location.hash = hash; }

  function render() {
    if (currentCleanup) { try { currentCleanup(); } catch (error) { /* egal */ } currentCleanup = null; }
    if (currentKeyHandler) { document.removeEventListener('keydown', currentKeyHandler); currentKeyHandler = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    var route = parseHash();
    var name = route.segments[0] || 'home';
    var handler = routes[name] || routes.notfound;

    u.clear(viewHost);
    viewHost.scrollTop = 0;
    window.scrollTo(0, 0);
    var cleanup = handler(viewHost, route.segments.slice(1), route.query);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
    renderRail();
  }

  function start() {
    viewHost = document.getElementById('view');
    railHost = document.getElementById('rail');
    applyTheme();
    window.addEventListener('hashchange', render);
    render();
  }

  App.ui = {
    start: start, register: register, go: go, render: render,
    topbar: topbar, ring: ring, bar: bar, empty: empty,
    modal: modal, confirm: confirm, keys: keys,
    applyTheme: applyTheme, toggleTheme: toggleTheme
  };
})(window.App);
