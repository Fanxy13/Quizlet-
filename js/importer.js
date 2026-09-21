/* ==========================================================================
   importer.js - aus eingefügtem Text oder einer Datei ein Lernset machen

   Karten kommen auf drei Wegen in die App:
   1. Quizlet-Helfer (Lesezeichen oder Konsole) - liefert fertige Sets über
      die Import-Route, siehe js/pages.js
   2. Text einfügen oder Datei laden - dafür sind die Parser hier zuständig
   3. eigener Teilen-Link

   Fremde Seiten selbst abzurufen hat die App aufgegeben: Quizlet sperrt das
   (Cloudflare), und auch die bekannten Open-Source-Werkzeuge holen die Karten
   inzwischen im Browser des Nutzers statt von außen.
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  /** Unbrauchbare und doppelte Karten entfernen. */
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

  /**
   * Zeilen in Paare zerlegen. Erkennt Tab, ";", "|", " - ", ":" und Komma
   * sowie abwechselnde Zeilen (Begriff / Definition / Begriff / ...).
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
      if (hits / lines.length >= 0.6 && (!best || hits > best.hits)) best = { separator: separator, hits: hits };
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

  App.importer = {
    fromText: parseText,
    dedupe: dedupe
  };
})(window.App);
