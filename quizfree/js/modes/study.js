/* ==========================================================================
   study.js - gemeinsame Basis der Lernmodi (Deck, Rahmen, Ergebnisbildschirm)
   ========================================================================== */
window.App = window.App || {};
window.App.modes = window.App.modes || {};

(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  /** Karten für eine Runde: Filter "nur markierte" und optionales Mischen. */
  function deck(set, options) {
    options = options || {};
    var settings = App.store.settings();
    var cards = set.cards.slice();
    if (settings.starredOnly && cards.some(function (card) { return card.starred; })) {
      cards = cards.filter(function (card) { return card.starred; });
    }
    if (options.shuffle !== false && (settings.shuffle || options.shuffle === true)) cards = u.shuffle(cards);
    return cards;
  }

  /** Frage-/Antwortseite gemäß Einstellungen. */
  function sides(card, flipped) {
    var settings = App.store.settings();
    var frontIsTerm = settings.front === 'term';
    if (flipped) frontIsTerm = !frontIsTerm;
    return {
      front: frontIsTerm ? card.term : card.definition,
      back: frontIsTerm ? card.definition : card.term
    };
  }

  /** Prompt/Lösung für Tipp- und Auswahlfragen. */
  function ask(card) {
    var settings = App.store.settings();
    return settings.answerWith === 'term'
      ? { prompt: card.definition, answer: card.term }
      : { prompt: card.term, answer: card.definition };
  }

  /** Standardrahmen: Kopfzeile mit Schließen, Fortschritt und Aktionen. */
  function frame(host, set, options) {
    var fill = el('div', { class: 'bar__fill' });
    var counter = el('span', { class: 'studybar__count', text: '' });

    var head = el('header', { class: 'studybar' }, [
      el('a', { class: 'iconbtn', href: '#/set/' + set.id, title: 'Beenden', 'aria-label': 'Beenden' }, [u.icon('x')]),
      el('div', { class: 'bar studybar__bar' }, [fill]),
      counter,
      el('div', { class: 'studybar__actions' }, options.actions || [])
    ]);

    var body = el('div', { class: 'study' });
    host.appendChild(head);
    host.appendChild(body);

    return {
      body: body,
      progress: function (value, max) {
        fill.style.width = (max ? Math.round((value / max) * 100) : 0) + '%';
        counter.textContent = value + '/' + max;
      }
    };
  }

  /** Ergebnisbildschirm mit Ring, Kennzahlen und Folgeaktionen. */
  function result(host, options) {
    var score = options.percent === undefined ? 100 : options.percent;
    var tone = score >= 80 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
    var box = el('div', { class: 'result' }, [
      el('div', { class: 'result__ring' }, [App.ui.ring(options.percent === undefined ? 100 : options.percent, 132, options.label)]),
      el('div', { class: 'result__stats' }, (options.stats || []).map(function (item) {
        return el('div', { class: 'stat stat--' + (item.tone || 'neutral') }, [
          u.icon(item.icon),
          el('strong', { class: 'stat__value', text: String(item.value) }),
          el('span', { class: 'stat__label', text: item.label })
        ]);
      })),
      el('div', { class: 'result__actions' }, options.actions || [])
    ]);
    box.style.setProperty('--result-color', tone);
    host.appendChild(box);
    if (App.store.settings().sound) u.blip('right');
    return box;
  }

  function actionButton(iconName, label, onClick, variant) {
    return el('button', { class: 'btn ' + (variant ? 'btn--' + variant : ''), type: 'button', title: label, onclick: onClick },
      [u.icon(iconName), el('span', { class: 'btn__label', text: label })]);
  }

  /** Vier Antwortmöglichkeiten: die richtige plus drei Ablenker. */
  function options4(cards, card, key) {
    var correct = ask(card).answer;
    var pool = cards.filter(function (other) { return other.id !== card.id; });
    var distractors = u.sample(pool, 3).map(function (other) { return ask(other).answer; })
      .filter(function (text) { return u.normalize(text) !== u.normalize(correct); });
    while (distractors.length < 3 && pool.length) {
      var filler = pool[Math.floor(Math.random() * pool.length)];
      var text = ask(filler).answer;
      if (distractors.indexOf(text) === -1 && u.normalize(text) !== u.normalize(correct)) distractors.push(text);
      else break;
    }
    return u.shuffle(distractors.concat([correct]));
  }

  /* ---------- Route: #/study/<mode>/<setId> ---------- */

  function route(host, segments) {
    var modeKey = segments[0];
    var set = App.store.getSet(segments[1]);
    if (!set) { host.appendChild(App.ui.empty('alert', 'Set nicht gefunden')); return; }
    if (!set.cards.length) {
      host.appendChild(App.ui.empty('cards', 'Keine Karten',
        el('a', { class: 'btn btn--primary', href: '#/edit/' + set.id }, [u.icon('plus'), el('span', { text: 'Karten hinzufügen' })])));
      return;
    }
    var mode = App.modes[modeKey];
    if (!mode) { App.ui.go('#/set/' + set.id); return; }
    App.store.saveProgress(set.id, { lastMode: modeKey });
    document.body.dataset.mode = modeKey;
    var cleanup = mode(host, set);
    return function () {
      delete document.body.dataset.mode;
      if (typeof cleanup === 'function') cleanup();
    };
  }

  App.study = {
    deck: deck, sides: sides, ask: ask, frame: frame, result: result,
    actionButton: actionButton, options4: options4, route: route
  };
})(window.App);
