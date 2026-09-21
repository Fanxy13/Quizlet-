/* ==========================================================================
   flashcards.js - Karteikarten: umdrehen, sortieren, vorlesen
   ========================================================================== */
(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  App.modes.cards = function (host, set) {
    var queue = App.study.deck(set, { shuffle: false });
    var index = 0;
    var flipped = false;
    var known = [];
    var again = [];
    var autoplay = null;
    var cardNode = null;

    /** Nur die Klasse umschalten - so bleibt die Dreh-Animation erhalten. */
    function setFlipped(value) {
      flipped = value;
      if (cardNode) cardNode.classList.toggle('is-flipped', flipped);
    }

    var shell = App.study.frame(host, set, {
      actions: [
        el('button', { class: 'iconbtn', type: 'button', title: 'Automatisch', 'aria-label': 'Automatisch abspielen', onclick: toggleAutoplay }, [u.icon('play')]),
        el('button', { class: 'iconbtn', type: 'button', title: 'Mischen', 'aria-label': 'Mischen', onclick: function () {
          queue = u.shuffle(queue); index = 0; flipped = false; known = []; again = []; paint();
          u.toast('Gemischt', 'shuffle');
        } }, [u.icon('shuffle')])
      ]
    });

    var stage = el('div', { class: 'stage' });
    var controls = el('div', { class: 'controls' });
    shell.body.appendChild(stage);
    shell.body.appendChild(controls);

    function toggleAutoplay(event) {
      var button = event.currentTarget;
      if (autoplay) {
        clearInterval(autoplay); autoplay = null;
        u.clear(button); button.appendChild(u.icon('play'));
        return;
      }
      u.clear(button); button.appendChild(u.icon('pause'));
      autoplay = setInterval(function () {
        if (!flipped) { setFlipped(true); return; }
        index++;
        flipped = false;
        if (index >= queue.length) { clearInterval(autoplay); autoplay = null; }
        paint();
      }, 2600);
    }

    function sort(isKnown) {
      var card = queue[index];
      if (!card) return;
      (isKnown ? known : again).push(card);
      var progress = App.store.progressFor(set.id);
      var box = progress.box[card.id] || 0;
      progress.box[card.id] = isKnown ? Math.min(2, box + 1) : 0;
      App.store.saveProgress(set.id, { box: progress.box });
      u.blip(isKnown ? 'right' : 'wrong');
      index++; flipped = false;
      paint();
    }

    function move(step) {
      index = Math.max(0, Math.min(queue.length, index + step));
      flipped = false;
      paint();
    }

    function paint() {
      u.clear(stage); u.clear(controls);
      shell.progress(Math.min(index, queue.length), queue.length);

      if (index >= queue.length) { finish(); return; }

      var card = queue[index];
      var faces = App.study.sides(card, false);

      var star = el('button', {
        class: 'iconbtn iconbtn--star' + (card.starred ? ' is-on' : ''),
        type: 'button', title: 'Markieren', 'aria-label': 'Markieren',
        onclick: function (event) {
          event.stopPropagation();
          card.starred = !card.starred;
          App.store.saveSet(set);
          star.classList.toggle('is-on', card.starred);
        }
      }, [u.icon('star')]);

      var flashcard = el('div', {
        class: 'flashcard' + (flipped ? ' is-flipped' : ''),
        tabindex: '0', role: 'button', 'aria-label': 'Karte umdrehen',
        onclick: function () { setFlipped(!flipped); }
      }, [
        el('div', { class: 'flashcard__inner' }, [
          el('div', { class: 'flashcard__face' }, [
            el('div', { class: 'flashcard__hint' }, [u.icon('flip')]),
            el('p', { class: 'flashcard__text', text: faces.front })
          ]),
          el('div', { class: 'flashcard__face flashcard__face--back' }, [
            el('div', { class: 'flashcard__hint' }, [u.icon('flip')]),
            el('p', { class: 'flashcard__text', text: faces.back })
          ])
        ]),
        el('div', { class: 'flashcard__tools' }, [
          el('button', { class: 'iconbtn', type: 'button', title: 'Vorlesen', 'aria-label': 'Vorlesen', onclick: function (event) {
            event.stopPropagation();
            u.speak(flipped ? faces.back : faces.front, set.lang);
          } }, [u.icon('volume')]),
          star
        ])
      ]);
      cardNode = flashcard;
      stage.appendChild(flashcard);

      controls.appendChild(el('button', { class: 'bigbtn bigbtn--again', type: 'button', title: 'Nochmal üben', 'aria-label': 'Nochmal üben', onclick: function () { sort(false); } }, [u.icon('refresh')]));
      controls.appendChild(el('button', { class: 'iconbtn iconbtn--lg', type: 'button', title: 'Zurück', 'aria-label': 'Zurück', onclick: function () { move(-1); } }, [u.icon('chevron-left')]));
      controls.appendChild(el('button', { class: 'iconbtn iconbtn--lg', type: 'button', title: 'Umdrehen', 'aria-label': 'Umdrehen', onclick: function () { setFlipped(!flipped); } }, [u.icon('flip')]));
      controls.appendChild(el('button', { class: 'iconbtn iconbtn--lg', type: 'button', title: 'Weiter', 'aria-label': 'Weiter', onclick: function () { move(1); } }, [u.icon('chevron-right')]));
      controls.appendChild(el('button', { class: 'bigbtn bigbtn--known', type: 'button', title: 'Sitzt', 'aria-label': 'Sitzt', onclick: function () { sort(true); } }, [u.icon('check')]));
    }

    function finish() {
      var total = known.length + again.length;
      App.study.result(stage, {
        percent: total ? Math.round((known.length / total) * 100) : 100,
        stats: [
          { icon: 'check-circle', value: known.length, label: 'Sitzt', tone: 'good' },
          { icon: 'refresh', value: again.length, label: 'Nochmal', tone: 'warn' }
        ],
        actions: [
          again.length ? App.study.actionButton('refresh', 'Schwere üben', function () {
            queue = again.slice(); known = []; again = []; index = 0; flipped = false; paint();
          }, 'primary') : null,
          App.study.actionButton('rotate', 'Von vorn', function () {
            queue = App.study.deck(set, { shuffle: false }); known = []; again = []; index = 0; flipped = false; paint();
          }),
          el('a', { class: 'btn', href: '#/study/learn/' + set.id }, [u.icon('learn'), el('span', { class: 'btn__label', text: 'Lernen' })])
        ].filter(Boolean)
      });
    }

    App.ui.keys({
      ' ': function () { setFlipped(!flipped); },
      'ArrowLeft': function () { move(-1); },
      'ArrowRight': function () { move(1); },
      'ArrowUp': function () { sort(true); },
      'ArrowDown': function () { sort(false); },
      'f': function () { setFlipped(!flipped); },
      's': function () { queue = u.shuffle(queue); index = 0; paint(); },
      'a': function () {
        var card = queue[index];
        if (!card) return;
        var faces = App.study.sides(card, false);
        u.speak(flipped ? faces.back : faces.front, set.lang);
      }
    });

    paint();
    return function () { if (autoplay) clearInterval(autoplay); };
  };
})(window.App);
