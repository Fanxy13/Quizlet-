/* ==========================================================================
   importer.js - aus einem Link oder Text ein Lernset machen
   Reihenfolge: eigener Teilen-Link -> Quizlet-Parser -> generischer Seiten-Text
   Browser dürfen fremde Seiten nicht direkt laden (CORS), darum laufen die
   Anfragen über öffentliche Read-Proxys. Klappt einer nicht, kommt der nächste.
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  // Erst direkt versuchen (klappt bei CORS-freundlichen Quellen wie raw.githubusercontent.com),
  // danach über öffentliche Read-Proxys.
  var PROXIES = [
    function (url) { return url; },
    function (url) { return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url); },
    function (url) { return 'https://corsproxy.io/?url=' + encodeURIComponent(url); },
    function (url) { return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url); },
    function (url) { return 'https://r.jina.ai/' + url; }
  ];

  var TIMEOUT = 15000;

  function fetchText(url) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT);
    return fetch(url, { signal: controller.signal, headers: { 'Accept': 'text/html,text/plain,*/*' } })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.text();
      })
      .finally(function () { clearTimeout(timer); });
  }

  /** Seite über die Proxys laden, bis einer brauchbaren Inhalt liefert. */
  async function loadPage(url, onStep) {
    var lastError = null;
    for (var i = 0; i < PROXIES.length; i++) {
      try {
        if (onStep) onStep(i + 1, PROXIES.length);
        var body = await fetchText(PROXIES[i](url));
        if (body && body.length > 120) return body;
        lastError = new Error('Leere Antwort');
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error('Seite nicht erreichbar');
  }

  /* ---------- Quizlet ---------- */

  function isQuizlet(url) { return /(^|\.)quizlet\.com/i.test(hostOf(url)); }

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

    if (onStep) onStep('Seite wird geladen …');
    var html = await loadPage(url, function (index, total) {
      if (onStep) onStep('Versuch ' + index + '/' + total + ' …');
    });

    if (onStep) onStep('Karten werden gelesen …');

    // Eingebettete Kartendaten zuerst - das deckt Quizlet und ähnliche
    // Lernseiten ab, die ihre Karten als JSON in die Seite schreiben.
    var cards = parseQuizlet(html);
    var note = cards.length && isQuizlet(url) ? 'Von Quizlet importiert' : '';
    if (cards.length < 2) cards = parseTables(html);
    if (cards.length < 2) {
      var plain = /<[a-z][\s\S]*>/i.test(html) ? htmlToText(html) : html;
      cards = parseText(plain);
    }

    if (cards.length < 2) {
      throw new Error('Auf der Seite wurden keine Karten gefunden');
    }

    return {
      title: titleFrom(html, titleFromUrl(url) || hostOf(url)),
      cards: cards,
      source: url,
      note: note
    };
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
    titleFromUrl: titleFromUrl,
    fromText: parseText,
    isQuizlet: isQuizlet,
    titleFrom: titleFrom,
    dedupe: dedupe
  };
})(window.App);
