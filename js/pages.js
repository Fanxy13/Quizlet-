/* ==========================================================================
   pages.js - Start, Import, Bibliothek, Set-Übersicht, Editor, Einstellungen
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  var u = App.util;
  var el = u.el;

  var MODES = [
    { key: 'cards', icon: 'cards', title: 'Karteikarten', color: 'a' },
    { key: 'learn', icon: 'learn', title: 'Lernen', color: 'b' },
    { key: 'write', icon: 'pencil', title: 'Schreiben', color: 'c' },
    { key: 'test', icon: 'checklist', title: 'Test', color: 'd' },
    { key: 'match', icon: 'puzzle', title: 'Zuordnen', color: 'e' },
    { key: 'speed', icon: 'bolt', title: 'Speed', color: 'f' }
  ];

  /* ==================== gemeinsame Bausteine ==================== */

  function setCard(set) {
    var percent = App.store.masteryPercent(set);
    return el('a', { class: 'setcard', href: '#/set/' + set.id }, [
      el('div', { class: 'setcard__ring' }, [App.ui.ring(percent, 46)]),
      el('div', { class: 'setcard__body' }, [
        el('h3', { class: 'setcard__title', text: set.title }),
        el('div', { class: 'setcard__meta' }, [
          u.icon('cards'), el('span', { text: String(set.cards.length) }),
          set.source ? u.icon('link') : null
        ])
      ]),
      el('div', { class: 'setcard__go' }, [u.icon('chevron-right')])
    ]);
  }

  /** Vorschau nach dem Import - Titel anpassen, dann speichern. */
  function previewImport(result) {
    var titleInput = el('input', { class: 'input', type: 'text', value: result.title || 'Importiertes Set', maxlength: '120' });
    var list = el('div', { class: 'preview' });
    var shown = result.cards.slice(0, 200);
    shown.forEach(function (card, position) {
      list.appendChild(el('div', { class: 'preview__row' }, [
        el('span', { class: 'preview__num', text: String(position + 1) }),
        el('span', { class: 'preview__term', text: u.truncate(card.term, 60) }),
        el('span', { class: 'preview__def', text: u.truncate(card.definition, 80) })
      ]));
    });
    if (result.cards.length > shown.length) {
      list.appendChild(el('div', { class: 'preview__more' }, [
        u.icon('dots'),
        el('span', { text: 'und ' + (result.cards.length - shown.length) + ' weitere' })
      ]));
    }

    var dialog = App.ui.modal({
      title: result.cards.length + ' Karten',
      icon: 'check-circle',
      body: [
        el('label', { class: 'field' }, [u.icon('tag'), titleInput]),
        result.note ? el('p', { class: 'status status--warn' }, [u.icon('alert'), el('span', { text: result.note })]) : null,
        list
      ].filter(Boolean),
      actions: [
        el('button', { class: 'btn', type: 'button', onclick: function () { dialog.close(); } }, [u.icon('x'), el('span', { text: 'Verwerfen' })]),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () {
          var set = App.store.saveSet(App.store.makeSet({
            title: titleInput.value.trim() || result.title,
            source: result.source || '',
            cards: result.cards
          }));
          dialog.close();
          u.toast('Set gespeichert', 'check');
          App.ui.go('#/set/' + set.id);
        } }, [u.icon('check'), el('span', { text: 'Los geht’s' })])
      ]
    });
  }

  /** Karten aus eingefügtem Text (Tab, Komma, Bindestrich oder Zeilenwechsel). */
  function openTextImport(prefill) {
    var area = el('textarea', {
      class: 'textarea', rows: '10', spellcheck: 'false',
      placeholder: 'Begriff\tDefinition\nBegriff - Definition\nBegriff\nDefinition'
    });
    if (prefill) area.value = prefill;
    var titleInput = el('input', { class: 'input', type: 'text', placeholder: 'Titel', maxlength: '120' });
    var hint = el('div', { class: 'status' });

    function update() {
      var cards = App.importer.fromText(area.value);
      u.clear(hint);
      hint.className = 'status ' + (cards.length ? 'status--ok' : '');
      hint.appendChild(u.icon(cards.length ? 'check-circle' : 'info'));
      hint.appendChild(el('span', { text: cards.length ? cards.length + ' Karten' : 'Noch keine Karten erkannt' }));
      return cards;
    }
    area.addEventListener('input', update);

    var dialog = App.ui.modal({
      title: 'Text einfügen',
      icon: 'paste',
      body: [
        el('label', { class: 'field' }, [u.icon('tag'), titleInput]),
        area,
        hint,
        el('div', { class: 'chips chips--left' }, [
          el('button', { class: 'chip chip--ghost', type: 'button', title: 'Prompt für ChatGPT & Co.', onclick: function () { dialog.close(); openPromptHelper(); } },
            [u.icon('wand'), el('span', { text: 'Von einer KI erstellen lassen' })]),
          el('button', { class: 'chip chip--ghost', type: 'button', title: 'Karten direkt von Quizlet holen', onclick: function () { dialog.close(); openQuizletHelper(); } },
            [u.icon('terminal'), el('span', { text: 'Quizlet-Helfer' })])
        ])
      ],
      actions: [
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () {
          var cards = App.importer.fromText(area.value);
          if (!cards.length) { u.toast('Keine Karten erkannt', 'alert'); return; }
          var set = App.store.saveSet(App.store.makeSet({ title: titleInput.value || 'Eingefügtes Set', cards: cards }));
          dialog.close();
          App.ui.go('#/set/' + set.id);
        } }, [u.icon('check'), el('span', { text: 'Speichern' })])
      ]
    });
    update();
    setTimeout(function () { area.focus(); }, 60);
  }

  /* ==================== Quizlet-Helfer ==================== */

  /**
   * Code, der im Browser des Nutzers auf der Quizlet-Seite läuft. Weil er
   * Teil der bereits geöffneten Seite ist, greift keine Bot-Sperre: er liest
   * die Karten aus der Seite und schickt sie an diese App.
   */
  function quizletSnippet() {
    var app = location.href.split('#')[0];
    return [
      '// QuizFree-Helfer ' + (App.VERSION || '') + ' - liest die Karten dieser Seite',
      '(function(){',
      '  var app = ' + JSON.stringify(app) + ';',
      '  var out = [], seen = new Set(), keys = {};',
      '  var skipped = 0;',
      '  // Aus der Schnittstelle ist jede Karte eine eigene, auch wenn zwei',
      '  // denselben Text haben. Nur beim Absuchen der Seite wird entdoppelt,',
      '  // weil dort dieselbe Karte mehrfach gefunden werden kann.',
      '  var allowDuplicates = true;',
      '  function add(a, b) {',
      '    a = String(a || "").replace(/\\s+/g, " ").trim();',
      '    b = String(b || "").replace(/\\s+/g, " ").trim();',
      '    if (!a || !b) { skipped++; return; }',
      '    if (!allowDuplicates) {',
      '      var k = a + "\\u0000" + b;',
      '      if (keys[k]) return;',
      '      keys[k] = 1;',
      '    }',
      '    out.push([a, b]);',
      '  }',
      '  function walk(n) {',
      '    if (!n || typeof n !== "object" || seen.has(n)) return;',
      '    seen.add(n);',
      '    if (Array.isArray(n)) { n.forEach(walk); return; }',
      '    if (Array.isArray(n.cardSides)) {',
      '      var s = {};',
      '      n.cardSides.forEach(function (d) {',
      '        var t = "";',
      '        (d.media || []).forEach(function (m) { t = t || m.plainText || m.text || ""; });',
      '        s[String(d.sideId).toLowerCase()] = t;',
      '      });',
      '      add(s.word || s["1"], s.definition || s["2"]);',
      '      return;',
      '    }',
      '    if (typeof n.word === "string" && typeof n.definition === "string") { add(n.word, n.definition); return; }',
      '    Object.keys(n).forEach(function (k) { walk(n[k]); });',
      '  }',
      '',
      '  // Weg 1: Quizlets eigene Schnittstelle mit deiner Sitzung. Liefert alle',
      '  // Karten, auch die noch nicht sichtbaren, und funktioniert bei privaten Sets.',
      '  var id = (location.pathname.match(/\\/(\\d{6,})(?:\\/|$)/) || [])[1]',
      '    || (document.documentElement.innerHTML.match(/"setId"\\s*:\\s*"?(\\d{6,})/) || [])[1] || "";',
      '  function api(page, token) {',
      '    var url = "https://quizlet.com/webapi/3.4/studiable-item-documents"',
      '      + "?filters%5BstudiableContainerId%5D=" + id',
      '      + "&filters%5BstudiableContainerType%5D=1&perPage=500&page=" + page',
      '      + (token ? "&pagingToken=" + encodeURIComponent(token) : "");',
      '    return fetch(url, { credentials: "include", headers: { Accept: "application/json" } })',
      '      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });',
      '  }',
      '  function pages(page, token) {',
      '    return api(page, token).then(function (data) {',
      '      var before = out.length;',
      '      walk(data);',
      '      var next = ((data.responses || [])[0] || {}).paging || {};',
      '      if (next.token && out.length > before && page < 20) return pages(page + 1, next.token);',
      '    });',
      '  }',
      '',
      '  function fallback() {',
      '    allowDuplicates = false;',
      '    out = []; keys = {}; skipped = 0;',
      '    // Weg 2: JSON, das die Seite mitliefert',
      '    Array.prototype.forEach.call(document.querySelectorAll("script"), function (tag) {',
      '      var text = tag.textContent || "";',
      '      if (text.length < 40) return;',
      '      if (text.indexOf("cardSides") < 0 && text.indexOf("definition") < 0) return;',
      '      try { walk(JSON.parse(text.slice(text.indexOf("{")))); } catch (e) {}',
      '    });',
      '    // Weg 3: Rohsuche im Quelltext',
      '    if (out.length < 2) {',
      '      var html = document.documentElement.innerHTML, m;',
      '      var re = /"word"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"[\\s\\S]{0,400}?"definition"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"/g;',
      '      var un = function (v) { try { return JSON.parse(\'"\' + v + \'"\'); } catch (e) { return v; } };',
      '      while ((m = re.exec(html)) !== null) add(un(m[1]), un(m[2]));',
      '    }',
      '    // Weg 4: die sichtbaren Karten',
      '    if (out.length < 2) {',
      '      var rows = document.querySelectorAll(\'[class*="SetPageTerm-content"],[class*="SetPageTerms-term"],[class*="TermsListRow"],li\');',
      '      Array.prototype.forEach.call(rows, function (row) {',
      '        var parts = Array.prototype.map.call(row.querySelectorAll(\'.TermText,[class*="TermText"]\'),',
      '          function (n) { return n.innerText; }).filter(Boolean);',
      '        if (parts.length >= 2) add(parts[0], parts[1]);',
      '      });',
      '    }',
      '    if (out.length < 2) {',
      '      var q = document.querySelectorAll(\'.TermText,[class*="TermText"]\');',
      '      for (var i = 0; i + 1 < q.length; i += 2) add(q[i].innerText, q[i + 1].innerText);',
      '    }',
      '    finish();',
      '  }',
      '',
      '  function finish() {',
      '    if (!out.length) {',
      '      alert("Keine Karten gefunden. Set-Seite ganz nach unten scrollen und erneut versuchen.");',
      '      return;',
      '    }',
      '    var title = (document.title || "Quizlet-Set")',
      '      .replace(/\\s*\\|.*$/, "")',
      '      .replace(/\\s*[-\\u2013\\u2014]\\s*Quizlet.*$/i, "")',
      '      .replace(/\\s*(Karteikarten|Flashcards|Lernsets?)\\s*$/i, "").trim();',
      '    var note = skipped ? skipped + (skipped === 1 ? " Karte" : " Karten")',
      '      + " ohne Text \u00fcbersprungen (nur Bild?)" : "";',
      '    var code = btoa(unescape(encodeURIComponent(JSON.stringify({ t: title, d: note, c: out }))))',
      '      .replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");',
      '    console.log("QuizFree: " + out.length + " Karten gefunden" + (note ? " (" + note + ")" : ""));',
      '    var win = null;',
      '    if (code.length < 30000) { try { win = window.open(app + "#/import?d=" + code, "_blank"); } catch (e) {} }',
      '    if (win) return;',
      '    // Aus der Konsole darf kein Fenster aufgehen: Daten an window.name haengen',
      '    // (ueberlebt den Seitenwechsel) und im selben Tab zu QuizFree wechseln.',
      '    try {',
      '      window.name = "quizfree:" + code;',
      '      location.href = app + "#/import";',
      '      return;',
      '    } catch (e) {}',
      '    prompt(out.length + " Karten - kopieren und in QuizFree unter Text einfuegen:",',
      '      out.map(function (p) { return p[0] + " ; " + p[1]; }).join("\\n"));',
      '  }',
      '',
      '  if (!id) { fallback(); return; }',
      '  pages(1, "").then(function () { if (out.length >= 2) finish(); else fallback(); }, fallback);',
      '})();'
    ].join('\n');
  }

  /** Ziehbares Lesezeichen mit dem Helfer-Code. */
  function bookmarkletLink(label) {
    var link = el('a', {
      class: 'chip chip--drag',
      title: 'In die Lesezeichenleiste ziehen',
      draggable: 'true'
    }, [u.icon('star'), el('span', { text: label || 'QuizFree-Import' })]);
    link.setAttribute('href', 'javascript:' + encodeURIComponent(quizletSnippet()));
    link.addEventListener('click', function (event) {
      event.preventDefault();
      u.toast('Nach oben in die Lesezeichenleiste ziehen', 'info');
    });
    return link;
  }

  /** Anleitung mit Code zum Kopieren und Lesezeichen zum Ziehen. */
  function openQuizletHelper() {
    var code = quizletSnippet();
    var output = el('textarea', { class: 'textarea textarea--prompt', rows: '5', readonly: true, spellcheck: 'false' });
    output.value = code;

    var steps = el('ol', { class: 'steps' });
    [
      { icon: 'link', text: 'Das Set bei Quizlet öffnen (Scrollen nicht nötig).' },
      { icon: 'terminal', text: 'Konsole öffnen: F12, dann Reiter „Console“.' },
      { icon: 'paste', text: 'Code einfügen und Enter drücken. Fragt der Browser danach, erst „allow pasting“ tippen.' },
      { icon: 'check-circle', text: 'Die Seite wechselt von selbst zu QuizFree – dort nur noch speichern.' }
    ].forEach(function (step) {
      steps.appendChild(el('li', { class: 'steps__item' }, [
        el('span', { class: 'steps__icon' }, [u.icon(step.icon)]),
        el('span', { text: step.text })
      ]));
    });

    var bookmarklet = bookmarkletLink();

    App.ui.modal({
      title: 'Quizlet-Helfer',
      icon: 'terminal',
      body: [
        el('p', { class: 'hint', text: 'Quizlet sperrt Abrufe von außen. Dieser Code läuft in deinem eigenen Browser auf der Quizlet-Seite – dort greift keine Sperre, und private Sets gehen ebenfalls.' }),
        steps,
        output,
        el('div', { class: 'chips chips--left' }, [
          el('button', { class: 'chip', type: 'button', onclick: function () { copyText(code); } },
            [u.icon('copy'), el('span', { text: 'Code kopieren' })]),
          bookmarklet
        ]),
        el('p', { class: 'hint', text: 'Oder einmalig als Lesezeichen ziehen: dann genügt künftig ein Klick auf der Quizlet-Seite.' })
      ]
    });
  }

  /* ==================== Prompt für KI-Chats ==================== */

  var PROMPT_COUNTS = [10, 20, 30, 50];

  /**
   * Fertiger Prompt, der eine KI zu einer Liste zwingt, die der Importer
   * sicher lesen kann: eine Karte pro Zeile, ein festes Trennzeichen,
   * kein Markdown und kein Begleittext.
   */
  function buildPrompt(topic, count, separator) {
    var isTab = separator === 'tab';
    var glue = isTab ? '\t' : ' ; ';
    return [
      'Erstelle eine Lernkartei zum Thema: ' + (topic || '[Thema hier eintragen]'),
      '',
      'Halte dich genau an dieses Format, sonst kann meine Lern-App die Karten nicht einlesen:',
      '1. Eine Karte pro Zeile.',
      '2. Begriff und Definition trennst du mit ' + (isTab ? 'einem Tabulatorzeichen' : 'einem Semikolon') + '.',
      '3. Keine Nummerierung, keine Aufzählungszeichen, keine Überschriften.',
      '4. Kein Markdown, keine Tabelle, kein Code-Block, keine Anführungszeichen.',
      '5. Keine Leerzeile und kein Text vor oder nach der Liste.',
      '6. Begriff kurz (1 bis 5 Wörter), Definition höchstens ein Satz.',
      '7. Mehrere gültige Antworten mit " / " trennen.',
      '8. Genau ' + count + ' Karten, nichts doppelt.',
      '',
      'So sieht das Ergebnis aus (nur ein Beispiel für das Format):',
      'Mitochondrium' + glue + 'Kraftwerk der Zelle',
      'Ribosom' + glue + 'baut Proteine aus Aminosäuren',
      '',
      'Gib jetzt nur die ' + count + ' Karten aus, sonst nichts.'
    ].join('\n');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(function () { u.toast('Kopiert', 'check'); })
        .catch(function () { u.toast('Kopieren nicht erlaubt', 'alert'); });
      return;
    }
    var helperField = el('textarea', { style: 'position:fixed;opacity:0' });
    helperField.value = text;
    document.body.appendChild(helperField);
    helperField.select();
    try { document.execCommand('copy'); u.toast('Kopiert', 'check'); }
    catch (error) { u.toast('Kopieren nicht erlaubt', 'alert'); }
    document.body.removeChild(helperField);
  }

  /** Dialog: Prompt zusammenstellen, kopieren, danach Antwort einfügen. */
  function openPromptHelper() {
    var state = { count: 20, separator: 'semicolon' };
    var topicInput = el('input', { class: 'input', type: 'text', maxlength: '120', placeholder: 'Thema, z. B. Biologie Kapitel 3' });
    var output = el('textarea', { class: 'textarea textarea--prompt', rows: '11', readonly: true, spellcheck: 'false' });

    function refresh() { output.value = buildPrompt(topicInput.value.trim(), state.count, state.separator); }
    topicInput.addEventListener('input', refresh);

    function chipRow(options, key) {
      var row = el('div', { class: 'choice' });
      options.forEach(function (option) {
        var button = el('button', {
          class: 'choice__item' + (state[key] === option.value ? ' is-on' : ''),
          type: 'button', title: option.label,
          onclick: function () {
            state[key] = option.value;
            u.qsa('.choice__item', row).forEach(function (node) { node.classList.remove('is-on'); });
            button.classList.add('is-on');
            refresh();
          }
        }, [
          option.glyph ? el('span', { class: 'choice__glyph', text: option.glyph }) : option.icon ? u.icon(option.icon) : null,
          el('span', { text: option.label })
        ].filter(Boolean));
        row.appendChild(button);
      });
      return row;
    }

    var dialog = App.ui.modal({
      title: 'Prompt für die KI',
      icon: 'wand',
      body: [
        el('label', { class: 'field' }, [u.icon('tag'), topicInput]),
        el('div', { class: 'setting' }, [
          el('span', { class: 'setting__label', text: 'Karten' }),
          chipRow(PROMPT_COUNTS.map(function (value) {
            return { value: value, label: String(value), icon: 'hash' };
          }), 'count')
        ]),
        el('div', { class: 'setting' }, [
          el('span', { class: 'setting__label', text: 'Trennzeichen' }),
          chipRow([
            { value: 'semicolon', label: 'Semikolon', glyph: ';' },
            { value: 'tab', label: 'Tabulator', glyph: '\u21e5' }
          ], 'separator')
        ]),
        output,
        el('p', { class: 'hint', text: 'Kopieren → in einen KI-Chat einfügen → Antwort der KI kopieren → hier unter „Text“ einsetzen. Semikolon überlebt das Kopieren aus einem Chat am zuverlässigsten.' })
      ],
      actions: [
        el('button', { class: 'btn', type: 'button', onclick: function () { dialog.close(); openTextImport(); } },
          [u.icon('paste'), el('span', { class: 'btn__label', text: 'Text einfügen' })]),
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () { copyText(output.value); } },
          [u.icon('copy'), el('span', { class: 'btn__label', text: 'Kopieren' })])
      ]
    });

    refresh();
    setTimeout(function () { topicInput.focus(); }, 60);
  }

  /* ==================== Start ==================== */

  function demoSet() {
    return App.store.makeSet({
      title: 'Demo · Hauptstädte',
      description: 'Beispielset zum Ausprobieren',
      cards: [
        { term: 'Frankreich', definition: 'Paris' },
        { term: 'Japan', definition: 'Tokio' },
        { term: 'Brasilien', definition: 'Brasília' },
        { term: 'Kanada', definition: 'Ottawa' },
        { term: 'Australien', definition: 'Canberra' },
        { term: 'Norwegen', definition: 'Oslo' },
        { term: 'Marokko', definition: 'Rabat' },
        { term: 'Indien', definition: 'Neu-Delhi' },
        { term: 'Schweiz', definition: 'Bern' },
        { term: 'Türkei', definition: 'Ankara' }
      ]
    });
  }

  /** Karte mit dem Lesezeichen - der Hauptweg, um Karten hereinzuholen. */
  function importCard(compact) {
    var drag = bookmarkletLink();
    return el('section', { class: 'importcard' + (compact ? ' importcard--compact' : '') }, [
      el('div', { class: 'importcard__head' }, [
        el('div', { class: 'importcard__icon' }, [u.icon('cards')]),
        el('div', {}, [
          el('h2', { class: 'importcard__title', text: 'Karten von Quizlet holen' }),
          el('p', { class: 'importcard__hint', text: 'Einmal in die Lesezeichenleiste ziehen, dann auf jeder Set-Seite anklicken.' })
        ])
      ]),
      el('div', { class: 'importcard__actions' }, [
        drag,
        el('button', { class: 'btn', type: 'button', onclick: function () { openQuizletHelper(); } },
          [u.icon('terminal'), el('span', { class: 'btn__label', text: 'Anleitung' })])
      ])
    ]);
  }

  function renderHome(host) {
    var sets = App.store.allSets();

    // Einstieg als eine Spalte: Zeichen, Import-Karte, Chips, Symbolreihe
    var start = el('section', { class: 'start' }, [
      el('div', { class: 'start__mark' }, [u.icon('logo')]),
      importCard(),
      el('div', { class: 'chips' }, [
        el('button', { class: 'chip', type: 'button', title: 'Text einfügen', onclick: function () { openTextImport(); } },
          [u.icon('paste'), el('span', { text: 'Text' })]),
        el('button', { class: 'chip', type: 'button', title: 'Prompt für ChatGPT & Co.', onclick: function () { openPromptHelper(); } },
          [u.icon('wand'), el('span', { text: 'Prompt' })]),
        el('button', { class: 'chip', type: 'button', title: 'Datei laden (CSV/TXT)', onclick: pickFile },
          [u.icon('upload'), el('span', { text: 'Datei' })]),
        el('a', { class: 'chip', href: '#/edit/new', title: 'Selbst schreiben' },
          [u.icon('plus'), el('span', { text: 'Neu' })]),
        el('button', { class: 'chip', type: 'button', title: 'Demo-Set laden', onclick: function () {
          var set = App.store.saveSet(demoSet());
          App.ui.go('#/set/' + set.id);
        } }, [u.icon('sparkles'), el('span', { text: 'Demo' })])
      ]),
      // Was die App kann - als Symbolreihe statt als Fließtext
      el('div', { class: 'teaser' }, MODES.map(function (mode) {
        return el('div', { class: 'teaser__item mode--' + mode.color, title: mode.title }, [
          el('div', { class: 'teaser__icon' }, [u.icon(mode.icon)]),
          el('span', { class: 'teaser__label', text: mode.title })
        ]);
      }))
    ]);
    host.appendChild(start);

    var recent = sets.slice(0, 8);
    if (recent.length) {
      host.appendChild(el('section', { class: 'section' }, [
        el('div', { class: 'section__head' }, [
          u.icon('clock'),
          el('h2', { class: 'section__title', text: 'Zuletzt' }),
          el('a', { class: 'iconbtn', href: '#/library', title: 'Alle Sets', 'aria-label': 'Alle Sets' }, [u.icon('library')])
        ]),
        el('div', { class: 'grid' }, recent.map(setCard))
      ]));
    }
  }

  function pickFile() {
    var picker = el('input', { type: 'file', accept: '.csv,.tsv,.txt,.json', style: 'display:none' });
    document.body.appendChild(picker);
    picker.addEventListener('change', function () {
      var file = picker.files && picker.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var text = String(reader.result || '');
        if (/\.json$/i.test(file.name)) {
          try {
            var count = App.store.importAll(text);
            u.toast(count + ' Sets importiert', 'check');
            App.ui.go('#/library');
          } catch (error) { u.toast('Datei nicht lesbar', 'alert'); }
        } else {
          openTextImport(text);
        }
        document.body.removeChild(picker);
      };
      reader.readAsText(file);
    });
    picker.click();
  }

  /* ==================== Karten hinzufügen ==================== */

  function renderNew(host) {
    host.appendChild(App.ui.topbar({ title: 'Karten hinzufügen', back: '#/' }));
    host.appendChild(importCard(true));
    host.appendChild(el('div', { class: 'chips chips--left' }, [
      el('button', { class: 'chip', type: 'button', onclick: function () { openTextImport(); } },
        [u.icon('paste'), el('span', { text: 'Text einfügen' })]),
      el('button', { class: 'chip', type: 'button', title: 'Prompt für ChatGPT & Co.', onclick: function () { openPromptHelper(); } },
        [u.icon('wand'), el('span', { text: 'Von einer KI erstellen lassen' })]),
      el('button', { class: 'chip', type: 'button', onclick: pickFile },
        [u.icon('upload'), el('span', { text: 'Datei laden' })]),
      el('a', { class: 'chip', href: '#/edit/new' },
        [u.icon('plus'), el('span', { text: 'Selbst schreiben' })])
    ]));
  }

  /* ==================== Bibliothek ==================== */

  function renderLibrary(host) {
    var sets = App.store.allSets();
    var search = el('input', { class: 'input input--search', type: 'search', placeholder: 'Suchen', 'aria-label': 'Sets durchsuchen' });
    var grid = el('div', { class: 'grid' });

    function paint() {
      var query = u.normalize(search.value);
      u.clear(grid);
      var visible = sets.filter(function (set) {
        return !query || u.normalize(set.title).indexOf(query) !== -1;
      });
      if (!visible.length) { grid.appendChild(App.ui.empty('search', 'Nichts gefunden')); return; }
      visible.forEach(function (set) { grid.appendChild(setCard(set)); });
    }
    search.addEventListener('input', paint);

    host.appendChild(App.ui.topbar({
      title: 'Meine Sets',
      back: '#/',
      actions: [el('a', { class: 'iconbtn iconbtn--accent', href: '#/new', title: 'Neues Set', 'aria-label': 'Neues Set' }, [u.icon('plus')])]
    }));
    if (!sets.length) {
      host.appendChild(App.ui.empty('library', 'Noch keine Sets',
        el('a', { class: 'btn btn--primary', href: '#/new' }, [u.icon('link'), el('span', { text: 'Link einfügen' })])));
      return;
    }
    host.appendChild(el('div', { class: 'searchbar' }, [u.icon('search'), search]));
    host.appendChild(grid);
    paint();
  }

  /* ==================== Set-Übersicht ==================== */

  function renderSet(host, segments) {
    var set = App.store.getSet(segments[0]);
    if (!set) { host.appendChild(App.ui.empty('alert', 'Set nicht gefunden')); return; }
    var percent = App.store.masteryPercent(set);
    var progress = App.store.progressFor(set.id);

    host.appendChild(App.ui.topbar({
      title: set.title,
      subtitle: set.cards.length + ' Karten',
      back: '#/library',
      actions: [
        el('a', { class: 'iconbtn', href: '#/edit/' + set.id, title: 'Bearbeiten', 'aria-label': 'Bearbeiten' }, [u.icon('pencil')]),
        el('button', { class: 'iconbtn', type: 'button', title: 'Teilen', 'aria-label': 'Teilen', onclick: function () { shareSet(set); } }, [u.icon('share')]),
        el('button', { class: 'iconbtn', type: 'button', title: 'Mehr', 'aria-label': 'Mehr', onclick: function () { moreMenu(set); } }, [u.icon('dots')])
      ]
    }));

    host.appendChild(el('div', { class: 'summary' }, [
      App.ui.ring(percent, 72),
      el('div', { class: 'summary__stats' }, [
        stat('check-circle', set.cards.filter(function (card) { return (progress.box[card.id] || 0) >= 2; }).length, 'Sitzt'),
        stat('refresh', set.cards.filter(function (card) { var box = progress.box[card.id] || 0; return box > 0 && box < 2; }).length, 'Am Lernen'),
        stat('star', set.cards.filter(function (card) { return card.starred; }).length, 'Markiert')
      ])
    ]));

    var modeGrid = el('div', { class: 'modes' });
    MODES.forEach(function (mode) {
      modeGrid.appendChild(el('a', {
        class: 'mode mode--' + mode.color,
        href: '#/study/' + mode.key + '/' + set.id,
        title: mode.title
      }, [
        el('div', { class: 'mode__icon' }, [u.icon(mode.icon)]),
        el('span', { class: 'mode__label', text: mode.title })
      ]));
    });
    host.appendChild(modeGrid);

    var list = el('div', { class: 'cards' });
    set.cards.forEach(function (card) {
      var star = el('button', {
        class: 'iconbtn iconbtn--star' + (card.starred ? ' is-on' : ''),
        type: 'button', title: 'Markieren', 'aria-label': 'Markieren',
        onclick: function () {
          card.starred = !card.starred;
          App.store.saveSet(set);
          star.classList.toggle('is-on', card.starred);
        }
      }, [u.icon('star')]);

      list.appendChild(el('div', { class: 'cardrow' }, [
        el('div', { class: 'cardrow__text' }, [
          el('span', { class: 'cardrow__term', text: card.term }),
          el('span', { class: 'cardrow__def', text: card.definition })
        ]),
        el('button', { class: 'iconbtn', type: 'button', title: 'Vorlesen', 'aria-label': 'Vorlesen', onclick: function () { u.speak(card.term + '. ' + card.definition, set.lang); } }, [u.icon('volume')]),
        star
      ]));
    });
    host.appendChild(el('section', { class: 'section' }, [
      el('div', { class: 'section__head' }, [u.icon('list'), el('h2', { class: 'section__title', text: 'Karten' })]),
      list
    ]));
  }

  function stat(iconName, value, label) {
    return el('div', { class: 'stat', title: label }, [
      u.icon(iconName),
      el('strong', { class: 'stat__value', text: String(value) }),
      el('span', { class: 'stat__label', text: label })
    ]);
  }

  function shareSet(set) {
    var link = App.store.shareLink(set);
    var field = el('input', { class: 'input', type: 'text', value: link, readonly: true });
    App.ui.modal({
      title: 'Teilen',
      icon: 'share',
      body: [
        el('label', { class: 'field' }, [u.icon('link'), field]),
        el('p', { class: 'hint', text: 'Der Link enthält das komplette Set – kein Server nötig.' })
      ],
      actions: [
        el('button', { class: 'btn btn--primary', type: 'button', onclick: function () {
          field.select();
          copyText(link);
        } }, [u.icon('copy'), el('span', { text: 'Kopieren' })])
      ]
    });
    setTimeout(function () { field.select(); }, 60);
  }

  function moreMenu(set) {
    var dialog = App.ui.modal({
      title: set.title,
      icon: 'dots',
      body: [el('div', { class: 'menu' }, [
        menuItem('shuffle', 'Reihenfolge mischen', function () {
          set.cards = u.shuffle(set.cards);
          App.store.saveSet(set);
          dialog.close(); App.ui.render(); u.toast('Gemischt', 'shuffle');
        }),
        menuItem('swap', 'Seiten tauschen', function () {
          set.cards = set.cards.map(function (card) {
            return { id: card.id, term: card.definition, definition: card.term, starred: card.starred };
          });
          App.store.saveSet(set);
          dialog.close(); App.ui.render(); u.toast('Getauscht', 'swap');
        }),
        menuItem('refresh', 'Fortschritt zurücksetzen', function () {
          App.store.resetProgress(set.id);
          dialog.close(); App.ui.render(); u.toast('Zurückgesetzt', 'refresh');
        }),
        menuItem('download', 'Als CSV sichern', function () {
          var csv = set.cards.map(function (card) {
            return '"' + card.term.replace(/"/g, '""') + '","' + card.definition.replace(/"/g, '""') + '"';
          }).join('\n');
          downloadFile(set.title.replace(/[^\w\s-]/g, '') + '.csv', csv);
          dialog.close();
        }),
        menuItem('trash', 'Set löschen', function () {
          dialog.close();
          App.ui.confirm('Set löschen?', 'trash').then(function (yes) {
            if (!yes) return;
            App.store.deleteSet(set.id);
            App.ui.go('#/library');
          });
        }, true)
      ])]
    });
  }

  function menuItem(iconName, label, onClick, danger) {
    return el('button', { class: 'menu__item' + (danger ? ' menu__item--danger' : ''), type: 'button', onclick: onClick },
      [u.icon(iconName), el('span', { text: label })]);
  }

  function downloadFile(name, content) {
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var link = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); document.body.removeChild(link); }, 500);
  }

  /* ==================== Editor ==================== */

  function renderEditor(host, segments) {
    var isNew = segments[0] === 'new';
    var set = isNew ? App.store.makeSet({ title: '', cards: [{ term: '', definition: '' }, { term: '', definition: '' }] }) : App.store.getSet(segments[0]);
    if (!set) { host.appendChild(App.ui.empty('alert', 'Set nicht gefunden')); return; }

    var titleInput = el('input', { class: 'input input--title', type: 'text', value: set.title, placeholder: 'Titel', maxlength: '120' });
    var rows = el('div', { class: 'editor' });

    function addRow(card, focus) {
      var term = el('textarea', { class: 'editor__input', rows: '1', placeholder: 'Begriff' });
      var definition = el('textarea', { class: 'editor__input', rows: '1', placeholder: 'Definition' });
      term.value = card.term; definition.value = card.definition;
      [term, definition].forEach(function (field) {
        field.addEventListener('input', function () {
          field.style.height = 'auto';
          field.style.height = field.scrollHeight + 'px';
        });
      });
      var row = el('div', { class: 'editor__row' }, [
        el('span', { class: 'editor__num' }),
        term, definition,
        el('button', { class: 'iconbtn', type: 'button', title: 'Zeile löschen', 'aria-label': 'Zeile löschen', onclick: function () {
          rows.removeChild(row);
          number();
        } }, [u.icon('trash')])
      ]);
      row._read = function () { return { id: card.id, starred: card.starred, term: term.value.trim(), definition: definition.value.trim() }; };
      rows.appendChild(row);
      number();
      if (focus) term.focus();
    }

    function number() {
      u.qsa('.editor__row', rows).forEach(function (row, index) {
        u.qs('.editor__num', row).textContent = index + 1;
      });
    }

    set.cards.forEach(function (card) { addRow(card); });

    function save() {
      var cards = u.qsa('.editor__row', rows).map(function (row) { return row._read(); })
        .filter(function (card) { return card.term || card.definition; });
      if (!cards.length) { u.toast('Mindestens eine Karte', 'alert'); return; }
      set.title = titleInput.value.trim() || 'Ohne Titel';
      set.cards = cards.map(function (card) { return { id: card.id || u.uid(), term: card.term, definition: card.definition, starred: !!card.starred }; });
      App.store.saveSet(set);
      u.toast('Gespeichert', 'check');
      App.ui.go('#/set/' + set.id);
    }

    host.appendChild(App.ui.topbar({
      title: isNew ? 'Neues Set' : 'Bearbeiten',
      back: isNew ? '#/' : '#/set/' + set.id,
      actions: [
        el('button', { class: 'iconbtn', type: 'button', title: 'Zeile hinzufügen', 'aria-label': 'Zeile hinzufügen', onclick: function () { addRow({ term: '', definition: '' }, true); } }, [u.icon('plus')]),
        el('button', { class: 'iconbtn iconbtn--accent', type: 'button', title: 'Speichern', 'aria-label': 'Speichern', onclick: save }, [u.icon('check')])
      ]
    }));
    host.appendChild(el('div', { class: 'field field--title' }, [u.icon('tag'), titleInput]));
    host.appendChild(rows);
    host.appendChild(el('div', { class: 'editor__foot' }, [
      el('button', { class: 'btn', type: 'button', onclick: function () { addRow({ term: '', definition: '' }, true); } }, [u.icon('plus'), el('span', { text: 'Karte' })]),
      el('button', { class: 'btn', type: 'button', onclick: function () { openTextImport(); } }, [u.icon('paste'), el('span', { text: 'Text' })]),
      el('button', { class: 'btn btn--primary', type: 'button', onclick: save }, [u.icon('check'), el('span', { text: 'Speichern' })])
    ]));

    App.ui.keys({ 's': { always: true, run: function (event) { if (event.ctrlKey || event.metaKey) save(); } } });
  }

  /* ==================== Import über Link (#/import?d=) ==================== */

  function renderImport(host, segments, query) {
    var code = query.d;

    // Der Quizlet-Helfer reicht große Sets über window.name weiter,
    // weil die Adresszeile dafür zu kurz sein kann.
    if (!code && /^quizfree:/.test(window.name || '')) {
      code = window.name.slice('quizfree:'.length);
      try { window.name = ''; } catch (error) { /* egal */ }
    }

    if (!code) { App.ui.go('#/new'); return; }
    var set = App.store.decodeSet(code);
    if (!set) { host.appendChild(App.ui.empty('alert', 'Link nicht lesbar')); return; }
    previewImport({ title: set.title, cards: set.cards, source: 'Geteilter Link', note: set.description });
    renderHome(host);
  }

  /* ==================== Einstellungen ==================== */

  /** Speicher-Übersicht: Zustand, Umfang, Sicherung. */
  function storagePanel() {
    var status = el('div', { class: 'storage__status' });
    var meta = el('div', { class: 'storage__meta' });
    var actions = el('div', { class: 'choice' });
    var panel = el('div', { class: 'storage' }, [status, meta, actions]);

    function paint(info) {
      u.clear(status); u.clear(meta); u.clear(actions);

      var blocked = info.mode === 'memory';
      var tone = blocked ? 'bad' : info.persisted === true ? 'good' : 'ok';
      var label = blocked
        ? 'Browser blockiert das Speichern'
        : info.persisted === true ? 'Dauerhaft gespeichert' : 'Im Browser gespeichert';

      status.className = 'storage__status storage__status--' + tone;
      status.appendChild(u.icon(blocked ? 'alert' : info.persisted === true ? 'shield' : 'check-circle'));
      status.appendChild(el('span', { text: label }));

      [
        { icon: 'database', text: u.plural(info.sets, 'Set', 'Sets') + ' · ' + u.plural(info.cards, 'Karte', 'Karten') + ' · ' + u.formatBytes(info.bytes) },
        { icon: 'clock', text: 'Gespeichert: ' + u.timeAgo(info.lastSave) },
        { icon: 'copy', text: info.mirror === false ? 'Zweitkopie nicht möglich' : 'Zweitkopie aktiv' }
      ].forEach(function (row) {
        meta.appendChild(el('div', { class: 'storage__row' }, [u.icon(row.icon), el('span', { text: row.text })]));
      });

      if (blocked) {
        meta.appendChild(el('p', {
          class: 'hint',
          text: 'Private Fenster und blockierte Seitendaten verhindern das Speichern. Sichere deine Sets als Datei oder erlaube dieser Seite, Daten zu speichern.'
        }));
      }

      if (!blocked && info.persisted !== true) {
        actions.appendChild(el('button', { class: 'choice__item', type: 'button', title: 'Browser um dauerhaften Speicher bitten', onclick: function () {
          App.store.requestPersistence().then(function (granted) {
            u.toast(granted ? 'Dauerhaft gesichert' : 'Browser hat abgelehnt', granted ? 'shield' : 'alert');
            refresh();
          });
        } }, [u.icon('shield'), el('span', { text: 'Dauerhaft' })]));
      }

      actions.appendChild(el('button', { class: 'choice__item', type: 'button', onclick: function () {
        downloadFile('quizfree-backup-' + new Date().toISOString().slice(0, 10) + '.json', App.store.exportAll());
      } }, [u.icon('download'), el('span', { text: 'Sichern' })]));

      actions.appendChild(el('button', { class: 'choice__item', type: 'button', onclick: pickFile },
        [u.icon('upload'), el('span', { text: 'Laden' })]));
    }

    function refresh() { App.store.storageInfo().then(paint); }
    refresh();
    return panel;
  }

  function renderSettings(host) {
    var settings = App.store.settings();

    function toggle(iconName, label, key, value) {
      var button = el('button', {
        class: 'toggle' + (value ? ' is-on' : ''), type: 'button', title: label,
        onclick: function () {
          var next = !App.store.settings()[key];
          App.store.updateSettings(JSON.parse('{"' + key + '":' + next + '}'));
          button.classList.toggle('is-on', next);
          if (key === 'theme') App.ui.applyTheme();
        }
      }, [u.icon(iconName), el('span', { text: label }), el('span', { class: 'toggle__dot' })]);
      return button;
    }

    function choice(label, key, options) {
      var group = el('div', { class: 'choice' });
      options.forEach(function (option) {
        var active = App.store.settings()[key] === option.value;
        var button = el('button', {
          class: 'choice__item' + (active ? ' is-on' : ''), type: 'button', title: option.label,
          onclick: function () {
            var patch = {}; patch[key] = option.value;
            App.store.updateSettings(patch);
            u.qsa('.choice__item', group).forEach(function (node) { node.classList.remove('is-on'); });
            button.classList.add('is-on');
            if (key === 'theme') App.ui.applyTheme();
          }
        }, [u.icon(option.icon), el('span', { text: option.label })]);
        group.appendChild(button);
      });
      return el('div', { class: 'setting' }, [el('span', { class: 'setting__label', text: label }), group]);
    }

    host.appendChild(App.ui.topbar({ title: 'Einstellungen', back: '#/' }));
    host.appendChild(el('div', { class: 'settings' }, [
      choice('Design', 'theme', [
        { value: 'dark', label: 'Dunkel', icon: 'moon' },
        { value: 'light', label: 'Hell', icon: 'sun' }
      ]),
      choice('Vorderseite', 'front', [
        { value: 'term', label: 'Begriff', icon: 'cards' },
        { value: 'definition', label: 'Definition', icon: 'flip' }
      ]),
      choice('Antwort', 'answerWith', [
        { value: 'definition', label: 'Definition', icon: 'pencil' },
        { value: 'term', label: 'Begriff', icon: 'tag' }
      ]),
      el('div', { class: 'setting' }, [
        el('span', { class: 'setting__label', text: 'Optionen' }),
        el('div', { class: 'choice' }, [
          toggle('volume', 'Ton', 'sound', settings.sound),
          toggle('shuffle', 'Mischen', 'shuffle', settings.shuffle),
          toggle('star', 'Nur markierte', 'starredOnly', settings.starredOnly)
        ])
      ]),
      el('div', { class: 'setting' }, [
        el('span', { class: 'setting__label', text: 'Speicher' }),
        storagePanel()
      ]),
      el('div', { class: 'setting' }, [
        el('span', { class: 'setting__label', text: 'Projekt' }),
        el('div', { class: 'choice' }, [
          el('a', {
            class: 'choice__item', href: (App.LINKS || {}).profile || '#',
            target: '_blank', rel: 'noopener noreferrer', title: 'GitHub-Profil'
          }, [u.icon('github'), el('span', { text: 'Fanxy13' })]),
          el('a', {
            class: 'choice__item', href: (App.LINKS || {}).repo || '#',
            target: '_blank', rel: 'noopener noreferrer', title: 'Quelltext auf GitHub'
          }, [u.icon('code'), el('span', { text: 'Quelltext' })])
        ])
      ])
    ]));
    host.appendChild(el('p', {
      class: 'hint hint--center',
      text: 'Alles bleibt in diesem Browser – nichts wird hochgeladen. Für ein anderes Gerät: sichern und dort laden, oder ein Set als Link teilen.'
    }));
    host.appendChild(el('p', { class: 'hint hint--center', text: 'Version ' + (App.VERSION || '?') }));
  }

  /* ==================== Registrierung ==================== */

  App.pages = {
    modes: MODES,
    setCard: setCard,
    openTextImport: openTextImport,
    openPromptHelper: openPromptHelper,
    openQuizletHelper: openQuizletHelper,
    bookmarkletLink: bookmarkletLink,
    quizletSnippet: quizletSnippet,
    buildPrompt: buildPrompt,
    previewImport: previewImport,
    downloadFile: downloadFile
  };

  App.registerPages = function () {
    App.ui.register('home', renderHome);
    App.ui.register('new', renderNew);
    App.ui.register('library', renderLibrary);
    App.ui.register('set', renderSet);
    App.ui.register('edit', renderEditor);
    App.ui.register('import', renderImport);
    App.ui.register('settings', renderSettings);
    App.ui.register('notfound', function (host) {
      host.appendChild(App.ui.empty('alert', 'Seite nicht gefunden',
        el('a', { class: 'btn btn--primary', href: '#/' }, [u.icon('home'), el('span', { text: 'Start' })])));
    });
  };
})(window.App);
