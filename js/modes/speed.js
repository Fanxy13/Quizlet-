/* ==========================================================================
   speed.js - Speed: Begriffe fallen von oben, unten stehen die Antworten.
   Richtig angeklickt gibt einen Punkt und macht das Tempo höher. Ein
   Fehlgriff oder ein durchgefallenes Wort kostet einen Punkt.
   ========================================================================== */
(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  var START_MS = 6500;     // Falldauer am Anfang
  var MIN_MS = 2200;       // schnellstmögliche Falldauer
  var STEP_MS = 260;       // Beschleunigung je richtiger Antwort

  App.modes.speed = function (host, set) {
    var cards = App.study.deck(set, { shuffle: true });
    var optionCount = Math.max(2, Math.min(6, cards.length));

    var queue = cards.slice();
    var index = 0;
    var score = 0;
    var right = 0;
    var missed = 0;
    var streak = 0;

    var frameId = null;
    var startedAt = 0;
    var duration = START_MS;
    var paused = false;
    var pausedAt = 0;
    var settled = true;
    var current = null;

    var scoreNode = el('span', { class: 'studybar__count studybar__count--score', text: '0' });
    var pauseButton = el('button', {
      class: 'iconbtn', type: 'button', title: 'Pause', 'aria-label': 'Pause', onclick: togglePause
    }, [u.icon('pause')]);

    var shell = App.study.frame(host, set, { actions: [pauseButton] });
    var actions = u.qs('.studybar__actions', host);
    actions.insertBefore(scoreNode, actions.firstChild);

    var lane = el('div', { class: 'speed__lane' });
    var wordNode = el('div', { class: 'speed__word' });
    var options = el('div', { class: 'speed__options' });
    lane.appendChild(wordNode);
    lane.appendChild(el('div', { class: 'speed__line' }));
    shell.body.appendChild(el('div', { class: 'speed' }, [lane, options]));

    /* ---------- Antwortmöglichkeiten ---------- */

    function choicesFor(card) {
      var answer = App.study.ask(card).answer;
      var pool = cards.filter(function (other) {
        return other.id !== card.id && u.normalize(App.study.ask(other).answer) !== u.normalize(answer);
      });
      var picks = u.sample(pool, optionCount - 1).map(function (other) { return App.study.ask(other).answer; });
      return u.shuffle(picks.concat([answer]));
    }

    /* ---------- Ablauf ---------- */

    function next() {
      if (index >= queue.length) { finish(); return; }
      var card = queue[index];
      var data = App.study.ask(card);
      current = { card: card, answer: data.answer };
      settled = false;

      wordNode.className = 'speed__word';
      wordNode.textContent = data.prompt;
      wordNode.style.transform = 'translate(-50%, 0)';

      u.clear(options);
      choicesFor(card).forEach(function (text, position) {
        var button = el('button', {
          class: 'speed__option', type: 'button',
          onclick: function () { choose(text, button); }
        }, [
          el('span', { class: 'speed__key', text: String(position + 1) }),
          el('span', { class: 'speed__text', text: text })
        ]);
        options.appendChild(button);
      });

      startedAt = Date.now();
      frameId = requestAnimationFrame(tick);
    }

    function tick() {
      frameId = null;
      if (paused || settled) return;

      var progress = (Date.now() - startedAt) / duration;
      var travel = Math.max(40, lane.clientHeight - wordNode.offsetHeight - 6);
      wordNode.style.transform = 'translate(-50%, ' + Math.round(progress * travel) + 'px)';

      if (progress >= 1) { miss(); return; }
      frameId = requestAnimationFrame(tick);
    }

    function choose(text, button) {
      if (settled || paused) return;
      if (u.normalize(text) === u.normalize(current.answer)) {
        hit(button);
        return;
      }
      // Fehlgriff kostet einen Punkt, das Wort fällt weiter
      button.classList.add('is-wrong');
      button.disabled = true;
      addScore(-1);
      streak = 0;
      u.blip('wrong');
    }

    function hit(button) {
      settled = true;
      if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
      button.classList.add('is-right');
      wordNode.classList.add('speed__word--hit');
      addScore(1);
      right++;
      streak++;
      duration = Math.max(MIN_MS, START_MS - streak * STEP_MS);
      u.blip('right');
      remember(true);
      step(260);
    }

    function miss() {
      settled = true;
      missed++;
      streak = 0;
      addScore(-1);
      u.blip('wrong');
      wordNode.classList.add('speed__word--miss');
      u.qsa('.speed__option', options).forEach(function (node) {
        var label = u.qs('.speed__text', node).textContent;
        if (u.normalize(label) === u.normalize(current.answer)) node.classList.add('is-right');
        node.disabled = true;
      });
      remember(false);
      step(760);
    }

    function step(delay) {
      index++;
      shell.progress(index, queue.length);
      setTimeout(function () { if (!paused) next(); else pendingNext = true; }, delay);
    }

    var pendingNext = false;

    function addScore(value) {
      score += value;
      scoreNode.textContent = String(score);
      scoreNode.classList.remove('is-up', 'is-down');
      void scoreNode.offsetWidth;
      scoreNode.classList.add(value > 0 ? 'is-up' : 'is-down');
    }

    function remember(wasRight) {
      var progress = App.store.progressFor(set.id);
      var box = progress.box[current.card.id] || 0;
      progress.box[current.card.id] = wasRight ? Math.min(2, box + 1) : 0;
      App.store.saveProgress(set.id, { box: progress.box });
    }

    function togglePause() {
      paused = !paused;
      u.clear(pauseButton);
      pauseButton.appendChild(u.icon(paused ? 'play' : 'pause'));
      pauseButton.title = paused ? 'Weiter' : 'Pause';
      if (paused) {
        pausedAt = Date.now();
        if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
        lane.classList.add('is-paused');
        return;
      }
      lane.classList.remove('is-paused');
      startedAt += Date.now() - pausedAt;
      if (pendingNext) { pendingNext = false; next(); return; }
      if (!settled) frameId = requestAnimationFrame(tick);
    }

    function finish() {
      if (frameId) { cancelAnimationFrame(frameId); frameId = null; }
      u.clear(shell.body);
      var stored = App.store.progressFor(set.id);
      var best = stored.speedBest || 0;
      var isRecord = score > best;
      if (isRecord) App.store.saveProgress(set.id, { speedBest: score });

      App.study.result(shell.body, {
        percent: Math.round((right / Math.max(1, right + missed)) * 100),
        label: String(score),
        stats: [
          { icon: 'check-circle', value: right, label: 'Getroffen', tone: 'good' },
          { icon: 'x-circle', value: missed, label: 'Verpasst', tone: 'bad' },
          { icon: 'trophy', value: isRecord ? score : best, label: 'Bestwert', tone: isRecord ? 'good' : 'neutral' }
        ],
        actions: [
          App.study.actionButton('refresh', 'Nochmal', function () {
            queue = u.shuffle(cards.slice());
            index = 0; score = 0; right = 0; missed = 0; streak = 0;
            duration = START_MS;
            scoreNode.textContent = '0';
            u.clear(shell.body);
            shell.body.appendChild(el('div', { class: 'speed' }, [lane, options]));
            next();
          }, 'primary'),
          el('a', { class: 'btn', href: '#/set/' + set.id }, [u.icon('home'), el('span', { class: 'btn__label', text: 'Set' })])
        ]
      });
      if (isRecord) u.toast('Neuer Bestwert: ' + score, 'trophy');
    }

    var keyMap = {};
    ['1', '2', '3', '4', '5', '6'].forEach(function (key, position) {
      keyMap[key] = function () {
        var buttons = u.qsa('.speed__option', options);
        if (buttons[position] && !buttons[position].disabled) buttons[position].click();
      };
    });
    keyMap[' '] = togglePause;
    App.ui.keys(keyMap);

    shell.progress(0, queue.length);
    next();

    return function () { if (frameId) cancelAnimationFrame(frameId); };
  };
})(window.App);
