/* ==========================================================================
   match.js - Zuordnen: Paare auf Zeit finden, mit Bestzeit pro Set
   ========================================================================== */
(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;
  var PAIRS = 6;
  var PENALTY = 1000;

  App.modes.match = function (host, set) {
    var pool = App.study.deck(set, { shuffle: true });
    var pairs = Math.min(PAIRS, pool.length);
    var tiles = [];
    var picked = null;
    var solved = 0;
    var startedAt = 0;
    var penalty = 0;
    var ticker = null;

    var clock = el('span', { class: 'studybar__count studybar__count--clock', text: '0.0s' });
    var shell = App.study.frame(host, set, {
      actions: [
        el('button', { class: 'iconbtn', type: 'button', title: 'Neu mischen', 'aria-label': 'Neu mischen', onclick: start }, [u.icon('shuffle')])
      ]
    });
    u.qs('.studybar__actions', host).insertBefore(clock, u.qs('.studybar__actions', host).firstChild);

    function elapsed() { return Date.now() - startedAt + penalty; }

    function tick() {
      clock.textContent = u.formatTime(elapsed());
    }

    function start() {
      if (ticker) clearInterval(ticker);
      picked = null; solved = 0; penalty = 0;
      var chosen = u.sample(pool, pairs);
      tiles = [];
      chosen.forEach(function (card) {
        tiles.push({ id: card.id, text: card.term, kind: 'term' });
        tiles.push({ id: card.id, text: card.definition, kind: 'definition' });
      });
      tiles = u.shuffle(tiles);
      startedAt = Date.now();
      ticker = setInterval(tick, 100);
      paint();
    }

    function paint() {
      u.clear(shell.body);
      shell.progress(solved, pairs);

      var grid = el('div', { class: 'match' });
      tiles.forEach(function (tile, index) {
        var node = el('button', {
          class: 'tile', type: 'button',
          dataset: { index: String(index) },
          onclick: function () { choose(tile, node); }
        }, [el('span', { class: 'tile__text', text: tile.text })]);
        tile.node = node;
        grid.appendChild(node);
      });
      shell.body.appendChild(grid);
      tick();
    }

    function choose(tile, node) {
      if (tile.done || node.classList.contains('is-gone')) return;
      if (picked && picked.tile === tile) {
        node.classList.remove('is-picked');
        picked = null;
        return;
      }
      if (!picked) {
        picked = { tile: tile, node: node };
        node.classList.add('is-picked');
        return;
      }
      var first = picked;
      picked = null;

      if (first.tile.id === tile.id && first.tile.kind !== tile.kind) {
        first.tile.done = true; tile.done = true;
        [first.node, node].forEach(function (target) {
          target.classList.remove('is-picked');
          target.classList.add('is-right');
          setTimeout(function () { target.classList.add('is-gone'); }, 180);
        });
        u.blip('right');
        solved++;
        shell.progress(solved, pairs);
        var progress = App.store.progressFor(set.id);
        progress.box[tile.id] = Math.min(2, (progress.box[tile.id] || 0) + 1);
        App.store.saveProgress(set.id, { box: progress.box });
        if (solved >= pairs) finish();
        return;
      }

      penalty += PENALTY;
      u.blip('wrong');
      [first.node, node].forEach(function (target) {
        target.classList.remove('is-picked');
        target.classList.add('is-wrong');
        setTimeout(function () { target.classList.remove('is-wrong'); }, 420);
      });
    }

    function finish() {
      var time = elapsed();
      clearInterval(ticker); ticker = null;
      var stored = App.store.progressFor(set.id);
      var best = stored.matchBest;
      var isRecord = !best || time < best;
      if (isRecord) App.store.saveProgress(set.id, { matchBest: time });

      setTimeout(function () {
        u.clear(shell.body);
        App.study.result(shell.body, {
          percent: 100,
          label: u.formatTime(time),
          stats: [
            { icon: 'clock', value: u.formatTime(time), label: 'Zeit', tone: 'good' },
            { icon: 'trophy', value: u.formatTime(isRecord ? time : best), label: 'Bestzeit', tone: isRecord ? 'good' : 'neutral' },
            { icon: 'alert', value: penalty / 1000 + 's', label: 'Strafe', tone: penalty ? 'warn' : 'neutral' }
          ],
          actions: [
            App.study.actionButton('refresh', 'Nochmal', start, 'primary'),
            el('a', { class: 'btn', href: '#/set/' + set.id }, [u.icon('home'), el('span', { class: 'btn__label', text: 'Set' })])
          ]
        });
        if (isRecord) u.toast('Neue Bestzeit', 'trophy');
      }, 420);
    }

    start();
    return function () { if (ticker) clearInterval(ticker); };
  };
})(window.App);
