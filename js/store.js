/* ==========================================================================
   store.js - Sets, Lernfortschritt und Einstellungen dauerhaft speichern

   Speicherwege, absteigend nach Haltbarkeit:
   1. localStorage  - Hauptspeicher, synchron lesbar
   2. IndexedDB     - Zweitkopie; springt ein, wenn localStorage leer oder
                      gesperrt ist (privates Fenster, blockierte Seitendaten)
   3. Arbeitsspeicher - Notbetrieb; die App warnt dann sichtbar

   Cookies kommen bewusst nicht vor: sie fassen nur rund 4 KB und würden bei
   jeder Anfrage mitgeschickt - für Lernsets ungeeignet.

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
  var KEY_SAVED = 'quizfree.saved.v1';
  var ALL_KEYS = [KEY_SETS, KEY_PROGRESS, KEY_SETTINGS];

  var listeners = [];
  var memory = {};
  var mode = 'local';          // local | memory
  var lastSave = 0;
  var mirrorOk = null;         // null = noch unbekannt, true/false = IndexedDB-Kopie

  /* ---------- Ebene 1: localStorage, mit Notbetrieb im Arbeitsspeicher ---------- */

  function localAvailable() {
    try {
      var probe = '__quizfree__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (error) { return false; }
  }

  if (!localAvailable()) mode = 'memory';

  function read(key, fallback) {
    try {
      var raw = mode === 'local' ? localStorage.getItem(key) : memory[key];
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) { return fallback; }
  }

  function write(key, value) {
    var raw = JSON.stringify(value);
    if (mode === 'local') {
      try { localStorage.setItem(key, raw); }
      catch (error) {
        // Voll oder gesperrt: nicht verlieren, sondern in den Notbetrieb wechseln
        mode = 'memory';
        memory[key] = raw;
        App.util.toast('Speicher blockiert – bitte sichern', 'alert');
      }
    } else {
      memory[key] = raw;
    }
    lastSave = Date.now();
    try {
      if (mode === 'local') localStorage.setItem(KEY_SAVED, String(lastSave));
      else memory[KEY_SAVED] = String(lastSave);
    } catch (error) { /* der Zeitstempel ist Beiwerk */ }
    mirror(key, raw);
  }

  /* ---------- Ebene 2: IndexedDB als Zweitkopie ---------- */

  var DB_NAME = 'quizfree';
  var DB_STORE = 'kv';
  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB nicht verfügbar')); return; }
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains(DB_STORE)) request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
      request.onblocked = function () { reject(new Error('IndexedDB blockiert')); };
    }).catch(function (error) { dbPromise = null; throw error; });
    return dbPromise;
  }

  function mirror(key, raw) {
    openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(raw, key);
        tx.oncomplete = function () { mirrorOk = true; resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    }).catch(function () { mirrorOk = false; });
  }

  function mirrorRead(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(DB_STORE, 'readonly');
        var request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error); };
      });
    });
  }

  /**
   * Beim Start prüfen, ob der Hauptspeicher leer ist, die Zweitkopie aber
   * Daten hat - dann zurückspielen. Antwort: Anzahl wiederhergestellter Sets.
   */
  function restore() {
    return Promise.all(ALL_KEYS.map(function (key) {
      return mirrorRead(key).catch(function () { return undefined; });
    })).then(function (values) {
      var restored = 0;
      if (!allSets().length && typeof values[0] === 'string') {
        try {
          var sets = JSON.parse(values[0]);
          if (Array.isArray(sets) && sets.length) {
            write(KEY_SETS, sets);
            if (typeof values[1] === 'string') write(KEY_PROGRESS, JSON.parse(values[1]));
            if (typeof values[2] === 'string') write(KEY_SETTINGS, JSON.parse(values[2]));
            restored = sets.length;
          }
        } catch (error) { /* beschädigte Kopie ignorieren */ }
      }
      if (mirrorOk === null) mirrorOk = true;
      if (restored) emit();
      return restored;
    }).catch(function () { mirrorOk = false; return 0; });
  }

  /* ---------- Dauerhaftigkeit beim Browser anmelden ---------- */

  /** Bittet den Browser, die Daten nicht bei Platzmangel zu verwerfen. */
  function requestPersistence() {
    if (!navigator.storage || !navigator.storage.persist) return Promise.resolve(false);
    return navigator.storage.persist().catch(function () { return false; });
  }

  function isPersisted() {
    if (!navigator.storage || !navigator.storage.persisted) return Promise.resolve(null);
    return navigator.storage.persisted().catch(function () { return null; });
  }

  /** Überblick für die Einstellungen: Zustand, Umfang, letzter Speicherzeitpunkt. */
  function storageInfo() {
    var sets = allSets();
    var info = {
      mode: mode,
      mirror: mirrorOk,
      sets: sets.length,
      cards: sets.reduce(function (sum, set) { return sum + set.cards.length; }, 0),
      bytes: ALL_KEYS.reduce(function (sum, key) {
        var raw = mode === 'local' ? (localStorage.getItem(key) || '') : (memory[key] || '');
        return sum + raw.length;
      }, 0),
      lastSave: lastSave || Number(read(KEY_SAVED, 0)) || 0,
      persisted: null,
      quota: 0,
      usage: 0
    };
    return isPersisted().then(function (persisted) {
      info.persisted = persisted;
      if (!navigator.storage || !navigator.storage.estimate) return info;
      return navigator.storage.estimate().then(function (estimate) {
        info.usage = estimate.usage || 0;
        info.quota = estimate.quota || 0;
        return info;
      }).catch(function () { return info; });
    });
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

  var persistenceAsked = false;

  function saveSet(set) {
    // Erst wenn wirklich Daten da sind, beim Browser um dauerhaften Speicher bitten
    if (!persistenceAsked) { persistenceAsked = true; requestPersistence(); }
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
      speedBest: entry.speedBest || 0,
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
    restore: restore,
    storageInfo: storageInfo,
    requestPersistence: requestPersistence,
    storageMode: function () { return mode; },
    allSets: allSets, getSet: getSet, saveSet: saveSet, deleteSet: deleteSet, makeSet: makeSet,
    progressFor: progressFor, saveProgress: saveProgress, resetProgress: resetProgress, masteryPercent: masteryPercent,
    settings: settings, updateSettings: updateSettings,
    encodeSet: encodeSet, decodeSet: decodeSet, shareLink: shareLink,
    exportAll: exportAll, importAll: importAll, onChange: onChange
  };
})(window.App);
