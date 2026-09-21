/* ==========================================================================
   util.js - kleine Helfer: DOM, Text-Normalisierung, Zufall, Sprache, Toasts
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  /* ---------- DOM ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    (Array.isArray(children) ? children : children ? [children] : []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function qs(selector, scope) { return (scope || document).querySelector(selector); }
  function qsa(selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); }

  /** Icon aus dem SVG-Sprite in index.html. */
  function icon(name, size) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    if (size) { svg.style.width = size + 'px'; svg.style.height = size + 'px'; }
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  /** Button mit Icon und optionalem Label (Label wird bei wenig Platz versteckt). */
  function iconButton(name, label, opts) {
    opts = opts || {};
    var btn = el('button', {
      class: 'btn ' + (opts.variant ? 'btn--' + opts.variant : '') + (opts.class ? ' ' + opts.class : ''),
      type: 'button',
      title: opts.title || label || '',
      'aria-label': opts.title || label || name,
      onclick: opts.onClick
    }, [icon(name)]);
    if (label) btn.appendChild(el('span', { class: 'btn__label', text: label }));
    return btn;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  /* ---------- Text ---------- */

  var ARTICLES = ['der', 'die', 'das', 'ein', 'eine', 'the', 'a', 'an', 'to', 'le', 'la', 'les', 'el', 'il'];

  /** Vergleichbare Form: klein, ohne Akzente, ohne Satzzeichen/Artikel. */
  function normalize(value) {
    var text = String(value === undefined || value === null ? '' : value)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[.,;:!?¿¡"'`´()[\]{}<>/\\|_*#~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    var words = text.split(' ').filter(function (word, index) {
      return !(index === 0 && words_len(text) > 1 && ARTICLES.indexOf(word) !== -1);
    });
    return words.join(' ').trim();
  }

  function words_len(text) { return text.split(' ').length; }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var previous = new Array(b.length + 1);
    var current = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) previous[j] = j;
    for (var i = 1; i <= a.length; i++) {
      current[0] = i;
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(k - 1) ? 0 : 1;
        current[k] = Math.min(current[k - 1] + 1, previous[k] + 1, previous[k - 1] + cost);
      }
      for (var c = 0; c <= b.length; c++) previous[c] = current[c];
    }
    return previous[b.length];
  }

  /**
   * Antwort prüfen. Mehrere richtige Lösungen per "," oder "/" getrennt.
   * -> { correct: bool, close: bool }
   */
  function checkAnswer(input, expected) {
    var given = normalize(input);
    if (!given) return { correct: false, close: false };
    var options = String(expected).split(/[,/;]|\bbzw\.?\b|\boder\b/i)
      .map(normalize).filter(Boolean);
    if (!options.length) options = [normalize(expected)];
    var best = Infinity;
    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      if (given === option) return { correct: true, close: false };
      var distance = levenshtein(given, option);
      if (distance < best) best = distance;
    }
    var tolerance = best <= Math.max(1, Math.floor(Math.min.apply(null, options.map(function (o) { return o.length; })) / 5));
    return { correct: false, close: tolerance };
  }

  function truncate(text, max) {
    text = String(text || '');
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  /* ---------- Zufall / Arrays ---------- */

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  function sample(list, count) { return shuffle(list).slice(0, count); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Sprachausgabe ---------- */

  var speech = window.speechSynthesis || null;

  function speak(text, lang) {
    if (!speech || !App.store.settings().sound) return;
    try {
      speech.cancel();
      var utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = lang || document.documentElement.lang || 'de-DE';
      utterance.rate = 0.95;
      speech.speak(utterance);
    } catch (error) { /* Sprachausgabe ist optional */ }
  }

  /* ---------- Feedback ---------- */

  var toastHost = null;

  function toast(message, iconName) {
    if (!toastHost) {
      toastHost = el('div', { class: 'toasts' });
      document.body.appendChild(toastHost);
    }
    var node = el('div', { class: 'toast' }, [icon(iconName || 'info'), el('span', { text: message })]);
    toastHost.appendChild(node);
    setTimeout(function () { node.classList.add('toast--out'); }, 2600);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3100);
  }

  var audioContext = null;

  /** Kurzer Ton als Feedback - ohne Audiodateien. */
  function blip(type) {
    if (!App.store.settings().sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.type = 'sine';
      var now = audioContext.currentTime;
      if (type === 'wrong') {
        oscillator.frequency.setValueAtTime(220, now);
        oscillator.frequency.exponentialRampToValueAtTime(150, now + 0.18);
      } else {
        oscillator.frequency.setValueAtTime(660, now);
        oscillator.frequency.exponentialRampToValueAtTime(990, now + 0.12);
      }
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    } catch (error) { /* Audio ist optional */ }
  }

  /** "gerade eben", "vor 5 Min.", "vor 3 Std.", "vor 2 Tagen" */
  function timeAgo(timestamp) {
    if (!timestamp) return 'noch nie';
    var seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 45) return 'gerade eben';
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return 'vor ' + minutes + ' Min.';
    var hours = Math.round(minutes / 60);
    if (hours < 24) return 'vor ' + hours + ' Std.';
    var days = Math.round(hours / 24);
    return days === 1 ? 'gestern' : 'vor ' + days + ' Tagen';
  }

  /** plural(1, 'Set', 'Sets') -> "1 Set" */
  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function formatTime(milliseconds) {
    var total = Math.max(0, Math.round(milliseconds / 100) / 10);
    var minutes = Math.floor(total / 60);
    var seconds = (total - minutes * 60).toFixed(1);
    return minutes ? minutes + ':' + (seconds < 10 ? '0' : '') + seconds : seconds + 's';
  }

  App.util = {
    el: el, qs: qs, qsa: qsa, icon: icon, iconButton: iconButton, clear: clear,
    normalize: normalize, levenshtein: levenshtein, checkAnswer: checkAnswer, truncate: truncate,
    shuffle: shuffle, sample: sample, uid: uid,
    speak: speak, toast: toast, blip: blip, formatTime: formatTime,
    timeAgo: timeAgo, formatBytes: formatBytes, plural: plural
  };
})(window.App);
