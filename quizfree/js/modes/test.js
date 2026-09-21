/* ==========================================================================
   test.js - Test: Auswahl, Wahr/Falsch und Tippfragen, danach Auswertung
   ========================================================================== */
(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  App.modes.test = function (host, set) {
    var pool = App.study.deck(set, { shuffle: true });
    var config = { count: Math.min(10, pool.length), types: { choice: true, truefalse: true, write: true } };
    var questions = [];

    var shell = App.study.frame(host, set, { actions: [] });

    /* ---------- Einstellungen vor dem Start ---------- */

    function setup() {
      u.clear(shell.body);
      shell.progress(0, 1);

      var counts = [5, 10, 20, pool.length].filter(function (value, index, list) {
        return value <= pool.length && list.indexOf(value) === index;
      });
      if (!counts.length) counts = [pool.length];
      config.count = Math.min(config.count, pool.length);

      var countRow = el('div', { class: 'choice' });
      counts.forEach(function (value) {
        var button = el('button', {
          class: 'choice__item' + (value === config.count ? ' is-on' : ''), type: 'button',
          onclick: function () {
            config.count = value;
            u.qsa('.choice__item', countRow).forEach(function (node) { node.classList.remove('is-on'); });
            button.classList.add('is-on');
          }
        }, [u.icon('hash'), el('span', { text: value === pool.length ? 'Alle' : String(value) })]);
        countRow.appendChild(button);
      });

      var typeRow = el('div', { class: 'choice' });
      [
        { key: 'choice', icon: 'checklist', label: 'Auswahl' },
        { key: 'truefalse', icon: 'scale', label: 'Wahr/Falsch' },
        { key: 'write', icon: 'pencil', label: 'Schreiben' }
      ].forEach(function (type) {
        var button = el('button', {
          class: 'choice__item' + (config.types[type.key] ? ' is-on' : ''), type: 'button',
          onclick: function () {
            var enabled = Object.keys(config.types).filter(function (key) { return config.types[key]; });
            if (config.types[type.key] && enabled.length === 1) { u.toast('Mindestens ein Typ', 'alert'); return; }
            config.types[type.key] = !config.types[type.key];
            button.classList.toggle('is-on', config.types[type.key]);
          }
        }, [u.icon(type.icon), el('span', { text: type.label })]);
        typeRow.appendChild(button);
      });

      shell.body.appendChild(el('div', { class: 'setup' }, [
        el('div', { class: 'setup__icon' }, [u.icon('checklist')]),
        el('div', { class: 'setting' }, [el('span', { class: 'setting__label', text: 'Fragen' }), countRow]),
        el('div', { class: 'setting' }, [el('span', { class: 'setting__label', text: 'Typen' }), typeRow]),
        el('button', { class: 'btn btn--primary btn--wide', type: 'button', onclick: build },
          [u.icon('play'), el('span', { class: 'btn__label', text: 'Test starten' })])
      ]));
    }

    /* ---------- Fragen bauen ---------- */

    function build() {
      var types = Object.keys(config.types).filter(function (key) { return config.types[key]; });
      questions = u.sample(pool, config.count).map(function (card, index) {
        var type = types[index % types.length];
        var data = App.study.ask(card);
        var question = { type: type, card: card, prompt: data.prompt, answer: data.answer, given: null };
        if (type === 'choice') question.options = App.study.options4(pool, card);
        if (type === 'truefalse') {
          var useCorrect = Math.random() < 0.5 || pool.length < 2;
          var other = pool.filter(function (item) { return item.id !== card.id; });
          question.claim = useCorrect || !other.length
            ? data.answer
            : App.study.ask(other[Math.floor(Math.random() * other.length)]).answer;
          question.claimIsTrue = u.normalize(question.claim) === u.normalize(data.answer);
        }
        return question;
      });
      run();
    }

    /* ---------- Test ---------- */

    function answeredCount() {
      return questions.filter(function (question) { return question.given !== null && question.given !== ''; }).length;
    }

    function run() {
      u.clear(shell.body);
      shell.progress(0, questions.length);

      var list = el('div', { class: 'test' });
      questions.forEach(function (question, index) {
        var block = el('section', { class: 'test__q' }, [
          el('div', { class: 'test__head' }, [
            el('span', { class: 'test__num', text: String(index + 1) }),
            u.icon(question.type === 'write' ? 'pencil' : question.type === 'choice' ? 'checklist' : 'scale')
          ]),
          el('p', { class: 'test__prompt', text: question.prompt })
        ]);

        if (question.type === 'choice') {
          var grid = el('div', { class: 'choices choices--compact' });
          question.options.forEach(function (text) {
            var button = el('button', { class: 'choices__item', type: 'button', onclick: function () {
              question.given = text;
              u.qsa('.choices__item', grid).forEach(function (node) { node.classList.remove('is-picked'); });
              button.classList.add('is-picked');
              shell.progress(answeredCount(), questions.length);
            } }, [el('span', { class: 'choices__text', text: text })]);
            grid.appendChild(button);
          });
          block.appendChild(grid);
        } else if (question.type === 'truefalse') {
          block.appendChild(el('p', { class: 'test__claim', text: question.claim }));
          var row = el('div', { class: 'tf' });
          [{ value: 'true', icon: 'check', label: 'Stimmt' }, { value: 'false', icon: 'x', label: 'Falsch' }].forEach(function (option) {
            var button = el('button', { class: 'tf__btn', type: 'button', title: option.label, onclick: function () {
              question.given = option.value;
              u.qsa('.tf__btn', row).forEach(function (node) { node.classList.remove('is-picked'); });
              button.classList.add('is-picked');
              shell.progress(answeredCount(), questions.length);
            } }, [u.icon(option.icon)]);
            row.appendChild(button);
          });
          block.appendChild(row);
        } else {
          var input = el('input', { class: 'answerinput', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'Antwort' });
          input.addEventListener('input', function () {
            question.given = input.value;
            shell.progress(answeredCount(), questions.length);
          });
          block.appendChild(el('div', { class: 'answerfield' }, [input]));
        }

        list.appendChild(block);
      });

      list.appendChild(el('button', { class: 'btn btn--primary btn--wide', type: 'button', onclick: function () {
        if (answeredCount() < questions.length) {
          App.ui.confirm('Noch offene Fragen – trotzdem abgeben?', 'alert').then(function (yes) { if (yes) grade(); });
        } else grade();
      } }, [u.icon('flag'), el('span', { class: 'btn__label', text: 'Abgeben' })]));

      shell.body.appendChild(list);
    }

    /* ---------- Auswertung ---------- */

    function isRight(question) {
      if (question.given === null || question.given === '') return false;
      if (question.type === 'truefalse') return (question.given === 'true') === question.claimIsTrue;
      if (question.type === 'choice') return u.normalize(question.given) === u.normalize(question.answer);
      return u.checkAnswer(question.given, question.answer).correct;
    }

    function grade() {
      var correct = questions.filter(isRight).length;
      var percent = Math.round((correct / questions.length) * 100);

      var progress = App.store.progressFor(set.id);
      questions.forEach(function (question) {
        var current = progress.box[question.card.id] || 0;
        progress.box[question.card.id] = isRight(question) ? Math.min(2, current + 1) : 0;
      });
      progress.tests.unshift({ date: Date.now(), percent: percent, count: questions.length });
      App.store.saveProgress(set.id, { box: progress.box, tests: progress.tests.slice(0, 20) });

      u.clear(shell.body);
      shell.progress(questions.length, questions.length);

      App.study.result(shell.body, {
        percent: percent,
        stats: [
          { icon: 'check-circle', value: correct, label: 'Richtig', tone: 'good' },
          { icon: 'x-circle', value: questions.length - correct, label: 'Falsch', tone: 'bad' }
        ],
        actions: [
          App.study.actionButton('refresh', 'Neuer Test', function () { build(); }, 'primary'),
          questions.length - correct > 0 ? App.study.actionButton('learn', 'Fehler lernen', function () {
            App.ui.go('#/study/learn/' + set.id);
          }) : null,
          el('a', { class: 'btn', href: '#/set/' + set.id }, [u.icon('home'), el('span', { class: 'btn__label', text: 'Set' })])
        ].filter(Boolean)
      });

      var review = el('div', { class: 'review' });
      questions.forEach(function (question, index) {
        var ok = isRight(question);
        var given = question.type === 'truefalse'
          ? (question.given === null ? '—' : (question.given === 'true' ? 'Stimmt' : 'Falsch'))
          : (question.given || '—');
        review.appendChild(el('div', { class: 'review__row review__row--' + (ok ? 'right' : 'wrong') }, [
          el('span', { class: 'review__num', text: String(index + 1) }),
          u.icon(ok ? 'check-circle' : 'x-circle'),
          el('div', { class: 'review__body' }, [
            el('span', { class: 'review__prompt', text: question.prompt }),
            el('span', { class: 'review__given', text: given }),
            ok ? null : el('span', { class: 'review__answer', text: question.type === 'truefalse' ? (question.claimIsTrue ? 'Stimmt' : 'Falsch') : question.answer })
          ].filter(Boolean))
        ]));
      });
      shell.body.appendChild(review);
    }

    setup();
  };
})(window.App);
