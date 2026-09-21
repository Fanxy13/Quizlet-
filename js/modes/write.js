/* ==========================================================================
   write.js - Schreiben: alles eintippen, Fehler kommen erneut dran
   ========================================================================== */
(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  App.modes.write = function (host, set) {
    var cards = App.study.deck(set, { shuffle: true });
    var queue = cards.slice();
    var done = {};
    var right = 0;
    var wrong = 0;

    var shell = App.study.frame(host, set, {
      actions: [
        el('button', { class: 'iconbtn', type: 'button', title: 'Mischen', 'aria-label': 'Mischen', onclick: function () {
          queue = u.shuffle(queue); step();
        } }, [u.icon('shuffle')])
      ]
    });

    function step() {
      u.clear(shell.body);
      shell.progress(Object.keys(done).length, cards.length);
      if (!queue.length) { finish(); return; }

      var card = queue[0];
      var data = App.study.ask(card);

      var stage = el('div', { class: 'qa' });
      stage.appendChild(el('div', { class: 'qa__head' }, [
        u.icon('pencil'),
        el('span', { class: 'qa__step', text: queue.length + ' offen' })
      ]));
      stage.appendChild(el('div', { class: 'qa__prompt' }, [
        el('p', { class: 'qa__text', text: data.prompt }),
        el('button', { class: 'iconbtn', type: 'button', title: 'Vorlesen', 'aria-label': 'Vorlesen', onclick: function () { u.speak(data.prompt, set.lang); } }, [u.icon('volume')])
      ]));

      var area = el('div', { class: 'qa__answer' });
      var input = el('input', { class: 'answerinput', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'Antwort' });
      var submit = el('button', { class: 'iconbtn iconbtn--accent', type: 'button', title: 'Prüfen', 'aria-label': 'Prüfen', onclick: check }, [u.icon('arrow-right')]);
      var field = el('div', { class: 'answerfield' }, [input, submit]);
      area.appendChild(field);
      area.appendChild(el('div', { class: 'qa__hints' }, [
        el('button', { class: 'chip chip--ghost', type: 'button', title: 'Erster Buchstabe', onclick: function () {
          if (!input.value) input.value = data.answer.slice(0, 1);
          input.focus();
        } }, [u.icon('bulb'), el('span', { text: 'Tipp' })]),
        el('button', { class: 'chip chip--ghost', type: 'button', title: 'Überspringen', onclick: function () { reveal(false); } }, [u.icon('skip'), el('span', { text: 'Weiß nicht' })])
      ]));
      stage.appendChild(area);
      shell.body.appendChild(stage);
      setTimeout(function () { input.focus(); }, 50);

      var answered = false;
      var closeTries = 0;

      function check() {
        if (answered) { next(); return; }
        var verdict = u.checkAnswer(input.value, data.answer);
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
        reveal(verdict.correct);
      }

      function reveal(isCorrect) {
        if (answered) return;
        answered = true;
        input.disabled = true;
        submit.disabled = true;
        field.classList.add(isCorrect ? 'is-right' : 'is-wrong');
        u.blip(isCorrect ? 'right' : 'wrong');

        var progress = App.store.progressFor(set.id);
        progress.box[card.id] = isCorrect ? Math.min(2, (progress.box[card.id] || 0) + 1) : 0;
        App.store.saveProgress(set.id, { box: progress.box });

        if (isCorrect) { right++; done[card.id] = true; queue.shift(); }
        else { wrong++; queue.shift(); queue.push(card); }

        var panel = el('div', { class: 'feedback feedback--' + (isCorrect ? 'right' : 'wrong') }, [
          u.icon(isCorrect ? 'check-circle' : 'x-circle'),
          el('p', { class: 'feedback__text', text: isCorrect ? data.answer : data.answer })
        ]);
        if (!isCorrect) {
          panel.appendChild(el('button', { class: 'chip chip--ghost', type: 'button', onclick: function () {
            wrong = Math.max(0, wrong - 1); right++;
            done[card.id] = true;
            queue = queue.filter(function (item) { return item.id !== card.id; });
            u.toast('Als richtig gewertet', 'check');
            next();
          } }, [u.icon('check'), el('span', { text: 'War richtig' })]));
        }
        panel.appendChild(el('button', { class: 'btn btn--primary btn--wide', type: 'button', onclick: next },
          [el('span', { class: 'btn__label', text: 'Weiter' }), u.icon('arrow-right')]));
        area.appendChild(panel);
        if (isCorrect) setTimeout(next, 260);
      }

      function next() { step(); }

      App.ui.keys({ 'Enter': { always: true, run: function () { answered ? next() : check(); } } });
    }

    function finish() {
      u.clear(shell.body);
      shell.progress(cards.length, cards.length);
      App.study.result(shell.body, {
        percent: Math.round((right / Math.max(1, right + wrong)) * 100),
        stats: [
          { icon: 'check-circle', value: right, label: 'Richtig', tone: 'good' },
          { icon: 'x-circle', value: wrong, label: 'Fehler', tone: 'bad' }
        ],
        actions: [
          App.study.actionButton('refresh', 'Nochmal', function () {
            queue = u.shuffle(cards.slice()); done = {}; right = 0; wrong = 0; step();
          }, 'primary'),
          el('a', { class: 'btn', href: '#/set/' + set.id }, [u.icon('home'), el('span', { class: 'btn__label', text: 'Set' })])
        ]
      });
    }

    step();
  };
})(window.App);
