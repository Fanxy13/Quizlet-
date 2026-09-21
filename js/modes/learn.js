/* ==========================================================================
   learn.js - Lernen: Runden aus Auswahl- und Tippfragen, mit Langzeit-Boxen
   Box 0 = neu (Auswahlfrage), 1 = geübt (Tippfrage), 2 = sitzt
   ========================================================================== */
(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;
  var ROUND_SIZE = 7;

  App.modes.learn = function (host, set) {
    var cards = App.study.deck(set, { shuffle: true });
    var box = Object.assign({}, App.store.progressFor(set.id).box);
    var round = [];
    var position = 0;
    var roundRight = 0;
    var roundWrong = 0;

    var shell = App.study.frame(host, set, {
      actions: [
        el('button', { class: 'iconbtn', type: 'button', title: 'Fortschritt zurücksetzen', 'aria-label': 'Fortschritt zurücksetzen', onclick: function () {
          App.ui.confirm('Fortschritt zurücksetzen?', 'refresh').then(function (yes) {
            if (!yes) return;
            box = {};
            App.store.saveProgress(set.id, { box: box });
            nextRound();
          });
        } }, [u.icon('refresh')])
      ]
    });

    function remaining() {
      return cards.filter(function (card) { return (box[card.id] || 0) < 2; });
    }

    function persist() { App.store.saveProgress(set.id, { box: box }); }

    function nextRound() {
      var pending = remaining();
      if (!pending.length) { finish(); return; }
      var fresh = pending.filter(function (card) { return (box[card.id] || 0) === 0; });
      var seen = pending.filter(function (card) { return (box[card.id] || 0) === 1; });
      round = u.shuffle(seen).slice(0, 3).concat(u.shuffle(fresh).slice(0, ROUND_SIZE - Math.min(3, seen.length)));
      if (!round.length) round = u.shuffle(pending).slice(0, ROUND_SIZE);
      round = u.shuffle(round);
      position = 0; roundRight = 0; roundWrong = 0;
      question();
    }

    function overall() {
      var mastered = cards.filter(function (card) { return (box[card.id] || 0) >= 2; }).length;
      return { mastered: mastered, total: cards.length };
    }

    function grade(card, isCorrect) {
      var current = box[card.id] || 0;
      box[card.id] = isCorrect ? Math.min(2, current + 1) : 0;
      if (isCorrect) roundRight++; else roundWrong++;
      persist();
      u.blip(isCorrect ? 'right' : 'wrong');
    }

    function question() {
      u.clear(shell.body);
      var totals = overall();
      shell.progress(totals.mastered, totals.total);

      if (position >= round.length) { roundSummary(); return; }

      var card = round[position];
      var data = App.study.ask(card);
      var isWrite = (box[card.id] || 0) >= 1;

      var stage = el('div', { class: 'qa' });
      stage.appendChild(el('div', { class: 'qa__head' }, [
        u.icon(isWrite ? 'pencil' : 'checklist'),
        el('span', { class: 'qa__step', text: (position + 1) + '/' + round.length })
      ]));
      stage.appendChild(el('div', { class: 'qa__prompt' }, [
        el('p', { class: 'qa__text', text: data.prompt }),
        el('button', { class: 'iconbtn', type: 'button', title: 'Vorlesen', 'aria-label': 'Vorlesen', onclick: function () { u.speak(data.prompt, set.lang); } }, [u.icon('volume')])
      ]));

      var answerArea = el('div', { class: 'qa__answer' });
      stage.appendChild(answerArea);
      shell.body.appendChild(stage);

      if (isWrite) buildWrite(card, data, answerArea);
      else buildChoice(card, data, answerArea);
    }

    function advance(delay) {
      setTimeout(function () { position++; question(); }, delay || 0);
    }

    function feedback(area, isCorrect, solution, onNext) {
      // Richtig: nur kurz aufblitzen lassen und sofort weiter - das hält
      // das Durchklicken zügig. Falsch: Lösung stehen lassen.
      if (isCorrect) { advance(220); return; }
      var box_ = el('div', { class: 'feedback feedback--wrong' }, [
        u.icon('x-circle'),
        el('p', { class: 'feedback__text', text: solution })
      ]);
      area.appendChild(box_);
      var next = el('button', { class: 'btn btn--primary btn--wide', type: 'button', onclick: function () { advance(0); } },
        [el('span', { class: 'btn__label', text: 'Weiter' }), u.icon('arrow-right')]);
      box_.appendChild(next);
      next.focus();
      // Enter, Leertaste oder ein Klick irgendwo bringen die nächste Frage
      App.ui.keys({
        'Enter': { always: true, run: function () { advance(0); } },
        ' ': { always: true, run: function () { advance(0); } }
      });
      setTimeout(function () {
        document.addEventListener('click', function once() {
          document.removeEventListener('click', once);
          advance(0);
        });
      }, 150);
    }

    function buildChoice(card, data, area) {
      var choices = App.study.options4(cards, card);
      var grid = el('div', { class: 'choices' });
      choices.forEach(function (text, index) {
        var button = el('button', { class: 'choices__item', type: 'button', onclick: function () { pick(text, button); } }, [
          el('span', { class: 'choices__key', text: String(index + 1) }),
          el('span', { class: 'choices__text', text: text })
        ]);
        grid.appendChild(button);
      });
      area.appendChild(grid);

      var answered = false;
      function pick(text, button) {
        if (answered) return;
        answered = true;
        var isCorrect = u.normalize(text) === u.normalize(data.answer);
        button.classList.add(isCorrect ? 'is-right' : 'is-wrong');
        if (!isCorrect) {
          u.qsa('.choices__item', grid).forEach(function (node) {
            if (u.normalize(u.qs('.choices__text', node).textContent) === u.normalize(data.answer)) node.classList.add('is-right');
          });
        }
        grade(card, isCorrect);
        feedback(area, isCorrect, data.answer);
      }

      var map = {};
      ['1', '2', '3', '4'].forEach(function (key, index) {
        map[key] = function () {
          var buttons = u.qsa('.choices__item', grid);
          if (buttons[index]) buttons[index].click();
        };
      });
      App.ui.keys(map);
    }

    function buildWrite(card, data, area) {
      var input = el('input', { class: 'answerinput', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Antwort' });
      var submit = el('button', { class: 'iconbtn iconbtn--accent', type: 'button', title: 'Prüfen', 'aria-label': 'Prüfen', onclick: check }, [u.icon('arrow-right')]);
      var field = el('div', { class: 'answerfield' }, [input, submit]);
      area.appendChild(field);
      area.appendChild(el('div', { class: 'qa__hints' }, [
        el('button', { class: 'chip chip--ghost', type: 'button', title: 'Antwort zeigen', onclick: function () {
          if (answered) return;
          answered = true;
          grade(card, false);
          feedback(area, false, data.answer);
        } }, [u.icon('eye'), el('span', { text: 'Lösung' })])
      ]));
      setTimeout(function () { input.focus(); }, 50);

      var answered = false;
      var closeTries = 0;
      function check() {
        if (answered) return;
        var verdict = u.checkAnswer(input.value, data.answer);
        // Einmal nachbessern lassen, danach zählt der Tippfehler als richtig.
        if (!verdict.correct && verdict.close) {
          closeTries++;
          if (closeTries === 1) {
            input.classList.add('is-close');
            u.toast('Fast – Tippfehler?', 'alert');
            input.select();
            return;
          }
          verdict.correct = true;
        }
        answered = true;
        input.disabled = true;
        submit.disabled = true;
        field.classList.add(verdict.correct ? 'is-right' : 'is-wrong');
        grade(card, verdict.correct);
        feedback(area, verdict.correct, data.answer);
        if (!verdict.correct) {
          var override = el('button', { class: 'chip chip--ghost', type: 'button', onclick: function () {
            grade(card, true);
            roundWrong = Math.max(0, roundWrong - 1);
            u.toast('Als richtig gewertet', 'check');
            advance(0);
          } }, [u.icon('check'), el('span', { text: 'War richtig' })]);
          u.qs('.feedback', area).appendChild(override);
        }
      }

      App.ui.keys({ 'Enter': { always: true, run: function () { if (answered) advance(0); else check(); } } });
    }

    function roundSummary() {
      var totals = overall();
      App.study.result(shell.body, {
        percent: Math.round((roundRight / Math.max(1, roundRight + roundWrong)) * 100),
        stats: [
          { icon: 'check-circle', value: roundRight, label: 'Richtig', tone: 'good' },
          { icon: 'x-circle', value: roundWrong, label: 'Falsch', tone: 'bad' },
          { icon: 'target', value: totals.mastered + '/' + totals.total, label: 'Sitzt', tone: 'neutral' }
        ],
        actions: [
          App.study.actionButton('arrow-right', 'Weiter', nextRound, 'primary'),
          el('a', { class: 'btn', href: '#/set/' + set.id }, [u.icon('x'), el('span', { class: 'btn__label', text: 'Pause' })])
        ]
      });
      App.ui.keys({ 'Enter': { always: true, run: nextRound } });
    }

    function finish() {
      u.clear(shell.body);
      shell.progress(cards.length, cards.length);
      App.study.result(shell.body, {
        percent: 100,
        label: '100%',
        stats: [
          { icon: 'trophy', value: cards.length, label: 'Karten', tone: 'good' }
        ],
        actions: [
          App.study.actionButton('refresh', 'Neu starten', function () {
            box = {}; persist(); nextRound();
          }, 'primary'),
          el('a', { class: 'btn', href: '#/study/test/' + set.id }, [u.icon('checklist'), el('span', { class: 'btn__label', text: 'Test' })]),
          el('a', { class: 'btn', href: '#/set/' + set.id }, [u.icon('home'), el('span', { class: 'btn__label', text: 'Set' })])
        ]
      });
    }

    nextRound();
  };
})(window.App);
