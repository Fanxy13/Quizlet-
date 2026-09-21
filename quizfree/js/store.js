/* ==========================================================================
   store.js - Sets, Lernfortschritt und Einstellungen im localStorage
   Datenmodell:
   set  = { id, title, description, lang, source, created, updated, cards:[card] }
   card = { id, term, definition, starred }
   progress[setId] = { box:{cardId:0..2}, mastered:[ids], lastMode, tests:[], matchBest }
   ========================================================================== */
window.App = window.App || {};

(function (App) {
  'use strict';

  var KEY_SETS = 'quizfree.sets.v1';
  var KEY_PROGRESS = 'quizfree.progress.v1';
  var KEY_SETTINGS = 'quizfree.settings.v1';

  var listeners = [];

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { App.util.toast('Speicher voll', 'alert'); }
  }

  function emit() { listeners.forEach(function (fn) { fn(); }); }

  /* ---------- Sets ---------- */

  function allSets() {
    var sets = read(KEY_SETS, []);
    return Array.isArray(sets) ? sets : [];
  }

  function getSet(id) {
    var found = null;
    allSets().forEach(function (set) { if (set.id === id) found = set; });
    return found;
  }

  function saveSet(set) {
    var sets = allSets();
    var index = -1;
    sets.forEach(function (existing, i) { if (existing.id === set.id) index = i; });
    set.updated = Date.now();
    if (index === -1) { set.created = set.created || Date.now(); sets.unshift(set); }
    else sets[index] = set;
    write(KEY_SETS, sets);
    emit();
    return set;
  }

  function deleteSet(id) {
    write(KEY_SETS, allSets().filter(function (set) { return set.id !== id; }));
    var progress = read(KEY_PROGRESS, {});
    delete progress[id];
    write(KEY_PROGRESS, progress);
    emit();
  }

  /** Rohdaten (Titel + Kartenpaare) zu einem gültigen Set machen. */
  function makeSet(data) {
    var cards = (data.cards || []).map(function (card) {
      return {
        id: card.id || App.util.uid(),
        term: String(card.term || '').trim(),
        definition: String(card.definition || '').trim(),
        starred: !!card.starred
      };
    }).filter(function (card) { return card.term || card.definition; });

    return {
      id: data.id || App.util.uid(),
      title: String(data.title || 'Neues Set').trim().slice(0, 120),
      description: String(data.description || '').slice(0, 400),
      source: data.source || '',
      lang: data.lang || 'de-DE',
      created: data.created || Date.now(),
      updated: Date.now(),
      cards: cards
    };
  }

  /* ---------- Fortschritt ---------- */

  function progressFor(setId) {
    var all = read(KEY_PROGRESS, {});
    var entry = all[setId] || {};
    return {
      box: entry.box || {},
      known: entry.known || {},
      matchBest: entry.matchBest || 0,
      tests: entry.tests || [],
      lastMode: entry.lastMode || ''
    };
  }

  function saveProgress(setId, patch) {
    var all = read(KEY_PROGRESS, {});
    all[setId] = Object.assign(progressFor(setId), patch);
    write(KEY_PROGRESS, all);
    emit();
  }

  function resetProgress(setId) {
    var all = read(KEY_PROGRESS, {});
    delete all[setId];
    write(KEY_PROGRESS, all);
    emit();
  }

  /** Anteil gemeisterter Karten (Box-Stufe 2) in Prozent. */
  function masteryPercent(set) {
    if (!set || !set.cards.length) return 0;
    var progress = progressFor(set.id);
    var mastered = set.cards.filter(function (card) { return (progress.box[card.id] || 0) >= 2; }).length;
    return Math.round((mastered / set.cards.length) * 100);
  }

  /* ---------- Einstellungen ---------- */

  function settings() {
    var saved = read(KEY_SETTINGS, {});
    return {
      theme: saved.theme || 'dark',
      sound: saved.sound !== false,
      front: saved.front || 'term',          // Vorderseite: term | definition
      answerWith: saved.answerWith || 'definition',
      shuffle: !!saved.shuffle,
      starredOnly: !!saved.starredOnly
    };
  }

  function updateSettings(patch) {
    write(KEY_SETTINGS, Object.assign(settings(), patch));
    emit();
    return settings();
  }

  /* ---------- Teilen: Set <-> Link ---------- */

  function encodeSet(set) {
    var payload = {
      t: set.title,
      d: set.description,
      c: set.cards.map(function (card) { return [card.term, card.definition]; })
    };
    var json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decodeSet(code) {
    try {
      var base64 = code.replace(/-/g, '+').replace(/_/g, '/');
      var json = decodeURIComponent(escape(atob(base64)));
      var payload = JSON.parse(json);
      return makeSet({
        title: payload.t,
        description: payload.d,
        cards: (payload.c || []).map(function (pair) { return { term: pair[0], definition: pair[1] }; })
      });
    } catch (error) { return null; }
  }

  function shareLink(set) {
    var base = location.href.split('#')[0];
    return base + '#/import?d=' + encodeSet(set);
  }

  /* ---------- Export / Import ---------- */

  function exportAll() {
    return JSON.stringify({ app: 'quizfree', version: 1, sets: allSets(), progress: read(KEY_PROGRESS, {}) }, null, 2);
  }

  function importAll(json) {
    var data = JSON.parse(json);
    var incoming = Array.isArray(data) ? data : data.sets || [];
    var existing = allSets();
    var ids = {};
    existing.forEach(function (set) { ids[set.id] = true; });
    incoming.forEach(function (set) {
      var clean = makeSet(set);
      if (ids[clean.id]) clean.id = App.util.uid();
      existing.unshift(clean);
    });
    write(KEY_SETS, existing);
    emit();
    return incoming.length;
  }

  function onChange(fn) { listeners.push(fn); }

  App.store = {
    allSets: allSets, getSet: getSet, saveSet: saveSet, deleteSet: deleteSet, makeSet: makeSet,
    progressFor: progressFor, saveProgress: saveProgress, resetProgress: resetProgress, masteryPercent: masteryPercent,
    settings: settings, updateSettings: updateSettings,
    encodeSet: encodeSet, decodeSet: decodeSet, shareLink: shareLink,
    exportAll: exportAll, importAll: importAll, onChange: onChange
  };
})(window.App);
