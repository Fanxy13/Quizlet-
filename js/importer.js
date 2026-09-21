/* ==========================================================================
   importer.js - aus einem Link oder Text ein Lernset machen

   Browser dürfen fremde Seiten nicht selbst laden (CORS), darum laufen die
   Anfragen über öffentliche Read-Proxys. Quizlet sperrt solche Proxys
   teilweise aus (Cloudflare), deshalb werden mehrere Wege gleichzeitig
   versucht und der erste brauchbare gewinnt:

   1. quizlet.com/webapi/... - die Karten als JSON, mit Seitenweise-Abruf
   2. die normale Set-Seite mit eingebettetem JSON
   3. ein Schnappschuss aus dem Internet Archive
   4. generische Parser (Tabellen, Textlisten)

   Wenn alles gesperrt ist, hilft der Quizlet-Helfer in der Oberfläche: ein
   Schnipsel, das im Browser des Nutzers direkt auf der Quizlet-Seite läuft
   und dabei gar keinen Proxy braucht.
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  /**
   * Zugriffswege. "direkt" klappt bei CORS-freundlichen Quellen
   * (raw.githubusercontent.com, eigene Dateien), der Rest sind Read-Proxys.
   * unwrap() holt den Seiteninhalt aus einer JSON-Verpackung.
   */
  var PROXIES = [
    {
      name: 'direkt',
      build: function (url) { return url; }
    },
    {
      name: 'allorigins',
      build: function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); }
    },
    {
      name: 'allorigins-json',
      build: function (url) { return 'https://api.allorigins.win/get?url=' + encodeURIComponent(url); },
      unwrap: function (body) {
        try { return JSON.parse(body).contents || ''; } catch (error) { return body; }
      }
    },
    {
      name: 'corsproxy',
      build: function (url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); }
    },
    {
      name: 'codetabs',
      build: function (url) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url); }
    },
    {
      name: 'whateverorigin',
      build: function (url) { return 'https://whateverorigin.org/get?url=' + encodeURIComponent(url); },
      unwrap: function (body) {
        try { return JSON.parse(body).contents || ''; } catch (error) { return body; }
      }
    },
    {
      name: 'archive',
      build: function (url) { return 'https://web.archive.org/web/2id_/' + url; }
    },
    {
      name: 'jina',
      build: function (url) { return 'https://r.jina.ai/' + url; }
    }
  ];

  var TIMEOUT = 14000;

  function proxyByName(name) {
    var found = PROXIES[0];
    PROXIES.forEach(function (proxy) { if (proxy.name === name) found = proxy; });
    return found;
  }

  function fetchThrough(proxy, url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT);
    return fetch(proxy.build(url), {
      signal: controller.signal,
      headers: { 'Accept': 'text/html,application/json,text/plain,*/*' },
      redirect: 'follow'
    })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .then(function (body) { return proxy.unwrap ? proxy.unwrap(body) : body; })
      .finally(function () { clearTimeout(timer); });
  }

  /**
   * Alle Wege gleichzeitig anstoßen, der erste brauchbare gewinnt.
   * accept(body) gibt das Ergebnis zurück oder etwas Falsches, wenn der
   * Inhalt nichts taugt (z. B. eine Cloudflare-Sperrseite).
   * -> { body, value, via } oder Fehler mit Sammelmeldung
   */
  function loadFirst(url, accept, onStep) {
    return new Promise(function (resolve, reject) {
      var pending = PROXIES.length;
      var problems = [];
      var settled = false;
      var tried = 0;

      PROXIES.forEach(function (proxy) {
        fetchThrough(proxy, url).then(function (body) {
          tried++;
          if (settled) return;
          var value = null;
          try { value = accept(body); } catch (error) { value = null; }
          if (value) {
            settled = true;
            resolve({ body: body, value: value, via: proxy.name });
            return;
          }
          problems.push(proxy.name + ': ' + (blockedPage(body) ? 'gesperrt' : 'nichts gefunden'));
          step();
        }, function (error) {
          tried++;
          problems.push(proxy.name + ': ' + (error.name === 'AbortError' ? 'Zeitüberschreitung' : error.message || 'Fehler'));
          step();
        });
      });

      function step() {
        pending--;
        if (settled) return;
        if (onStep) onStep(tried, PROXIES.length);
        if (pending <= 0) {
          var blocked = problems.filter(function (text) {
            return /gesperrt|HTTP 4|HTTP 5/.test(text);
          }).length;
          var error = new Error(blocked >= problems.length - 1
            ? 'Die Seite lässt den Abruf nicht zu'
            : 'Keine Karten gefunden');
          error.details = problems.join(' · ');
          error.blocked = blocked > 0;
          reject(error);
        }
      }
    });
  }

  /** Typische Sperr- oder Fehlerseiten erkennen. */
  function blockedPage(body) {
    if (!body || body.length < 80) return true;
    return /just a moment|cf-browser-verification|attention required|access denied|enable javascript and cookies|captcha/i
      .test(body.slice(0, 4000));
  }

  /* ---------- Quizlet ---------- */

  function isQuizlet(url) { return /(^|\.)quizlet\.com/i.test(hostOf(url)); }

  /** Set-Nummer aus einer Quizlet-Adresse ziehen: /de/123456789/titel/ -> 123456789 */
  function quizletSetId(url) {
    var match = String(url).match(/quizlet\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(\d{6,})/i);
    return match ? match[1] : '';
  }

  function apiUrl(setId, page, token) {
    return 'https://quizlet.com/webapi/3.4/studiable-item-documents'
      + '?filters%5BstudiableContainerId%5D=' + setId
      + '&filters%5BstudiableContainerType%5D=1'
      + '&perPage=500&page=' + page
      + (token ? '&pagingToken=' + encodeURIComponent(token) : '');
  }

  function cardsFromBody(body) {
    var cards = [];
    try { harvestJson(JSON.parse(body), cards); }
    catch (error) { cards = parseQuizlet(body); }
    return dedupe(cards);
  }

  function pagingToken(body) {
    var match = String(body).match(/"paging"\s*:\s*\{[^{}]*"token"\s*:\s*"([^"]+)"/);
    return match ? match[1] : '';
  }

  /**
   * Karten über Quizlets eigene JSON-Schnittstelle holen - kleiner als die
   * Seite und vollständig, weil die Set-Seite lange Sets nur häppchenweise
   * ausliefert.
   */
  async function quizletApi(setId, onStep) {
    if (onStep) onStep('Quizlet-Daten werden abgefragt …');
    var first = await loadFirst(apiUrl(setId, 1, ''), function (body) {
      var found = cardsFromBody(body);
      return found.length ? found : null;
    }, function (tried, total) {
      if (onStep) onStep('Quelle ' + tried + '/' + total + ' …');
    });

    var cards = first.value;
    var proxy = proxyByName(first.via);
    var token = pagingToken(first.body);
    var page = 1;

    while (token && page < 12) {
      page++;
      if (onStep) onStep(cards.length + ' Karten …');
      try {
        var body = await fetchThrough(proxy, apiUrl(setId, page, token));
        var more = cardsFromBody(body);
        if (!more.length) break;
        cards = dedupe(cards.concat(more));
        token = pagingToken(body);
      } catch (error) { break; }
    }
    return cards;
  }

  function hostOf(url) {
    try { return new URL(url).hostname; } catch (error) { return ''; }
  }

  function decodeEntities(text) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = String(text)
      .replace(/\\u([0-9a-fA-F]{4})/g, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
      .replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\\\/g, '\\');
    return textarea.value.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  /** In einem beliebigen JSON-Baum nach Karten-Strukturen suchen. */
  function harvestJson(node, out, seen) {
    if (!node || typeof node !== 'object') return out;
    seen = seen || new Set();
    if (seen.has(node)) return out;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach(function (item) { harvestJson(item, out, seen); });
      return out;
    }

    // Neues Quizlet-Format: studiableItem mit cardSides
    if (Array.isArray(node.cardSides)) {
      var sides = {};
      node.cardSides.forEach(function (side) {
        var text = '';
        (side.media || []).forEach(function (media) {
          text = text || media.plainText || media.text || media.title || '';
        });
        if (side.sideId) sides[String(side.sideId).toLowerCase()] = decodeEntities(text);
      });
      var term = sides.word || sides['1'] || sides.front;
      var definition = sides.definition || sides['2'] || sides.back;
      if (term && definition) out.push({ term: term, definition: definition });
      return out;
    }

    // Klassisches Format: { word, definition }
    if (typeof node.word === 'string' && typeof node.definition === 'string') {
      out.push({ term: decodeEntities(node.word), definition: decodeEntities(node.definition) });
      return out;
    }

    Object.keys(node).forEach(function (key) { harvestJson(node[key], out, seen); });
    return out;
  }

  function parseQuizlet(html) {
    var cards = [];

    // 1) Eingebettete JSON-Blöcke auswerten
    var blocks = [];
    var nextData = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextData) blocks.push(nextData[1]);
    var quizletVar = html.match(/window\.Quizlet\["[^"]+"\]\s*=\s*(\{[\s\S]*?\});/g) || [];
    quizletVar.forEach(function (chunk) {
      var json = chunk.replace(/^window\.Quizlet\["[^"]+"\]\s*=\s*/, '').replace(/;\s*$/, '');
      blocks.push(json);
    });

    blocks.forEach(function (block) {
      try { harvestJson(JSON.parse(block), cards); } catch (error) { /* nächster Block */ }
    });

    // 2) Fallback: Roh-Regex über die Seite (auch wenn JSON kaputt ist)
    if (cards.length < 2) {
      var pattern = /"word"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*(?:"[^"]+"\s*:\s*(?:"(?:[^"\\]|\\.)*"|[^,}]*)\s*,\s*)*?"definition"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      var match;
      while ((match = pattern.exec(html)) !== null) {
        var term = decodeEntities(match[1]);
        var definition = decodeEntities(match[2]);
        if (term && definition) cards.push({ term: term, definition: definition });
      }
    }

    // 3) Fallback: sichtbares HTML der Set-Seite
    if (cards.length < 2 && /<[a-z]/i.test(html)) {
      try {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var rows = doc.querySelectorAll('[class*="SetPageTerm-content"], [class*="SetPageTerms-term"], .TermText');
        var buffer = [];
        Array.prototype.forEach.call(rows, function (row) {
          var texts = Array.prototype.map.call(row.querySelectorAll('.TermText, [class*="TermText"]'), function (node) {
            return node.textContent.trim();
          }).filter(Boolean);
          if (texts.length >= 2) cards.push({ term: texts[0], definition: texts[1] });
          else if (row.classList.contains('TermText')) buffer.push(row.textContent.trim());
        });
        for (var i = 0; i + 1 < buffer.length && cards.length < 2; i += 2) {
          cards.push({ term: buffer[i], definition: buffer[i + 1] });
        }
      } catch (error) { /* egal */ }
    }

    return dedupe(cards);
  }

  function dedupe(cards) {
    var seen = {};
    return cards.filter(function (card) {
      card.term = String(card.term || '').replace(/\s+/g, ' ').trim();
      card.definition = String(card.definition || '').replace(/\s+/g, ' ').trim();
      if (!card.term || !card.definition) return false;
      if (card.term.length > 600 || card.definition.length > 600) return false;
      var key = card.term.toLowerCase() + '\u0000' + card.definition.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  /* ---------- Freier Text / andere Seiten ---------- */

  /**
   * Zeilen in Paare zerlegen. Erkennt Tab, ";", " - ", " – ", ":" sowie
   * abwechselnde Zeilen (Begriff / Definition / Begriff / ...).
   */
  function parseText(raw, forced) {
    var lines = String(raw || '').replace(/\r/g, '').split('\n')
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; });
    if (!lines.length) return [];

    var separators = forced ? [forced] : ['\t', ' | ', ';', ' - ', ' – ', ' — ', ' = ', ',', ':'];
    var best = null;

    separators.forEach(function (separator) {
      var hits = lines.filter(function (line) { return line.indexOf(separator) > 0; }).length;
      var ratio = hits / lines.length;
      if (ratio >= 0.6 && (!best || hits > best.hits)) best = { separator: separator, hits: hits, ratio: ratio };
    });

    if (best) {
      return dedupe(lines.map(function (line) {
        var index = line.indexOf(best.separator);
        if (index <= 0) return null;
        return { term: line.slice(0, index).trim(), definition: line.slice(index + best.separator.length).trim() };
      }).filter(Boolean));
    }

    // Abwechselnde Zeilen
    if (lines.length >= 4 && lines.length % 2 === 0) {
      var alternating = [];
      for (var i = 0; i + 1 < lines.length; i += 2) {
        alternating.push({ term: lines[i], definition: lines[i + 1] });
      }
      return dedupe(alternating);
    }

    return [];
  }

  /** Tabellen einer beliebigen Seite als Karten lesen. */
  function parseTables(html) {
    var cards = [];
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      Array.prototype.forEach.call(doc.querySelectorAll('table'), function (table) {
        Array.prototype.forEach.call(table.querySelectorAll('tr'), function (row) {
          var cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            cards.push({ term: cells[0].textContent.trim(), definition: cells[1].textContent.trim() });
          }
        });
      });
      if (cards.length < 2) {
        Array.prototype.forEach.call(doc.querySelectorAll('dl'), function (list) {
          var terms = list.querySelectorAll('dt');
          var definitions = list.querySelectorAll('dd');
          for (var i = 0; i < Math.min(terms.length, definitions.length); i++) {
            cards.push({ term: terms[i].textContent.trim(), definition: definitions[i].textContent.trim() });
          }
        });
      }
    } catch (error) { /* egal */ }
    return dedupe(cards);
  }

  /** Aus dem Pfad einen lesbaren Titel machen: /de/123/franzoesisch-basics -> Franzoesisch Basics */
  function titleFromUrl(url) {
    try {
      var path = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
      path = decodeURIComponent(path)
        .replace(/\.[a-z0-9]{1,5}$/i, '')
        .replace(/[-_+]+/g, ' ')
        .replace(/\b(flash cards|flashcards|karteikarten)\b/ig, '')
        .trim();
      if (!path || /^\d+$/.test(path)) return '';
      return path.charAt(0).toUpperCase() + path.slice(1);
    } catch (error) { return ''; }
  }

  function titleFrom(html, fallback) {
    var match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    var title = match ? decodeEntities(match[1]) : '';
    if (!title) {
      var heading = html.match(/^#\s+(.+)$/m) || html.match(/^Title:\s*(.+)$/im);
      title = heading ? heading[1].trim() : '';
    }
    title = title
      .replace(/\s*[|–-]\s*Quizlet.*$/i, '')
      .replace(/\s*(Karteikarten|Flashcards|Lernsets?|Study Set).*$/i, '')
      .trim();
    return title || fallback || 'Importiertes Set';
  }

  /* ---------- Öffentliche API ---------- */

  /**
   * Link importieren.
   * onStep(text) meldet den Fortschritt an die Oberfläche.
   * -> Promise<{ title, cards, source, note }>
   */
  async function fromLink(rawUrl, onStep) {
    var url = String(rawUrl || '').trim();
    if (!url) throw new Error('Kein Link angegeben');
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    // Eigener Teilen-Link: keine Netzwerkanfrage nötig
    var shared = url.match(/[#&?]\/?import\?d=([A-Za-z0-9_-]+)/) || url.match(/[?&]d=([A-Za-z0-9_-]{20,})/);
    if (shared) {
      var set = App.store.decodeSet(shared[1]);
      if (set && set.cards.length) return { title: set.title, cards: set.cards, source: url, note: 'Geteiltes Set' };
    }

    var setId = quizletSetId(url);
    var apiError = null;

    // Weg 1: Quizlets JSON-Schnittstelle
    if (setId) {
      try {
        var apiCards = await quizletApi(setId, onStep);
        if (apiCards.length >= 2) {
          return {
            title: titleFromUrl(url) || 'Quizlet-Set',
            cards: apiCards,
            source: url,
            note: 'Von Quizlet importiert'
          };
        }
      } catch (error) { apiError = error; }
    }

    // Weg 2: die Seite selbst (eingebettetes JSON, Tabellen, Textliste)
    if (onStep) onStep('Seite wird geladen …');
    var page;
    try {
      page = await loadFirst(url, function (body) {
        if (blockedPage(body)) return null;
        var found = parseQuizlet(body);
        if (found.length < 2) found = parseTables(body);
        if (found.length < 2) {
          found = parseText(/<[a-z][\s\S]*>/i.test(body) ? htmlToText(body) : body);
        }
        return found.length >= 2 ? { cards: found, body: body } : null;
      }, function (tried, total) {
        if (onStep) onStep('Quelle ' + tried + '/' + total + ' …');
      });
    } catch (error) {
      throw describeFailure(error, apiError, url);
    }

    return {
      title: titleFrom(page.body, titleFromUrl(url) || hostOf(url)),
      cards: page.value.cards,
      source: url,
      note: isQuizlet(url) ? 'Von Quizlet importiert' : ''
    };
  }

  /** Aus den gesammelten Fehlern eine Meldung machen, die weiterhilft. */
  function describeFailure(pageError, apiError, url) {
    var blocked = (pageError && pageError.blocked) || (apiError && apiError.blocked);
    var error;
    if (isQuizlet(url)) {
      error = new Error(blocked
        ? 'Quizlet blockiert den Abruf'
        : 'Karten nicht lesbar – ist das Set privat?');
      error.quizlet = true;
    } else {
      error = new Error(blocked
        ? 'Die Seite lässt den Abruf nicht zu'
        : 'Keine Karten auf der Seite gefunden');
    }
    error.blocked = !!blocked;
    error.details = [apiError && apiError.details, pageError && pageError.details]
      .filter(Boolean).join(' || ');
    return error;
  }

  function htmlToText(html) {
    try {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      Array.prototype.forEach.call(doc.querySelectorAll('script, style, nav, footer, header, svg'), function (node) {
        node.parentNode.removeChild(node);
      });
      return (doc.body ? doc.body.innerText || doc.body.textContent : '') || '';
    } catch (error) {
      return String(html).replace(/<[^>]+>/g, '\n');
    }
  }

  App.importer = {
    fromLink: fromLink,
    quizletSetId: quizletSetId,
    titleFromUrl: titleFromUrl,
    fromText: parseText,
    isQuizlet: isQuizlet,
    titleFrom: titleFrom,
    dedupe: dedupe
  };
})(window.App);
