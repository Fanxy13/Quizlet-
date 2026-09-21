# QuizFree

Ein kostenloser Quizlet-Klon: Karten per Lesezeichen von Quizlet holen oder einfügen,
und sofort abgefragt werden. Kein Konto, kein Server, keine Bezahlschranke – alles
läuft im Browser.

## Starten

* **Lokal:** `index.html` doppelklicken. Fertig, es gibt keinen Build-Schritt.
* **Im Netz:** Repo auf GitHub Pages veröffentlichen
  (Settings → Pages → Branch wählen → `/root`). Die Seite liegt dann unter
  `https://<name>.github.io/Quizlet-/`.

## Was drin ist

| Modus | Was passiert |
| --- | --- |
| Karteikarten | Karte umdrehen, in „Sitzt“ und „Nochmal“ sortieren, Auto-Abspielen, Vorlesen |
| Lernen | Runden aus Auswahl- und Tippfragen, drei Stufen pro Karte, Fortschritt bleibt gespeichert |
| Schreiben | Alles eintippen, Fehler kommen erneut dran, Tippfehler-Erkennung |
| Test | Auswahl, Wahr/Falsch und Tippfragen, danach Auswertung Frage für Frage |
| Zuordnen | Paare auf Zeit anklicken, mit Bestzeit pro Set |

Dazu: Sets selbst anlegen und bearbeiten, Karten markieren (Stern), Seiten tauschen,
mischen, Fortschritt zurücksetzen, CSV-Export, komplettes Backup als JSON,
helles und dunkles Design, Tastatursteuerung, Sprachausgabe.

## Karten hereinholen

Die App ruft keine fremden Seiten mehr ab. Quizlet sperrt das (Cloudflare), und
die bekannten Open-Source-Werkzeuge sind aus demselben Grund davon abgerückt –
`quizlet-fetcher` etwa hat das Herunterladen in 1.1.0 entfernt („You'll need to
provide the webpage yourself"). Karten kommen deshalb auf vier Wegen herein:

### 1. Lesezeichen (Hauptweg, für Quizlet)

Auf der Startseite steht **QuizFree-Import** als ziehbares Lesezeichen. Einmal in
die Lesezeichenleiste ziehen, dann auf einer beliebigen Quizlet-Set-Seite
anklicken – die Karten öffnen sich als Import in QuizFree. Wer keine
Lesezeichenleiste nutzt, findet unter **Anleitung** denselben Code zum Einfügen
in die Browser-Konsole (F12).

Der Code läuft in der bereits geöffneten Quizlet-Seite und versucht vier Quellen:

1. **Quizlets Schnittstelle mit deiner Sitzung** – `fetch(..., {credentials: "include"})`
   auf `webapi/3.4/studiable-item-documents`. Cookies gehen mit, also kommen
   **alle** Karten an, auch ungescrollte, und private Sets funktionieren ebenfalls.
2. eingebettetes JSON der Seite
3. Rohsuche im Quelltext
4. die sichtbaren Karten im Seiteninhalt

Die Übergabe läuft über die Adresszeile; ist das Set dafür zu groß oder blockt der
Browser das neue Fenster (aus der Konsole heraus immer), wandern die Daten über
`window.name` und die Seite wechselt im selben Tab.

Übernommen wurde nur das Vorgehen, kein fremder Code.

### 2. Text einfügen

Eingefügte Liste. Erkannt werden Tab, `;`, `|`, `-`, `=`, `:`, Komma und
abwechselnde Zeilen (Begriff / Definition / Begriff / …).

### 3. Prompt für eine KI

Fertiger Prompt für ChatGPT, Claude & Co.: Thema eintragen, Kartenzahl und
Trennzeichen wählen, kopieren, in den Chat einfügen. Die Antwort kommt im
richtigen Format zurück und wird unter **Text** eingesetzt. Semikolon ist
voreingestellt, weil Tabulatoren beim Kopieren aus einem Chat oft verloren gehen.

### 4. Datei oder selbst schreiben

CSV, TSV, TXT, ein JSON-Backup – oder Karten im Editor eintippen.

Jedes Set lässt sich als Link teilen: Der Link enthält das ganze Set (Base64 im
Hash), es wird also nichts hochgeladen.

## Tastatur

| Taste | Wirkung |
| --- | --- |
| `Leertaste` / `F` | Karte umdrehen |
| `←` `→` | vor und zurück |
| `↑` `↓` | „Sitzt“ / „Nochmal“ |
| `1`–`4` | Antwort auswählen |
| `Enter` | prüfen bzw. weiter |
| `A` | vorlesen |
| `S` | mischen |
| `Strg`/`Cmd` + `S` | Set im Editor speichern |

## Daten und Speicherung

Gespeichert wird in drei Stufen, damit nichts verloren geht:

1. **localStorage** – Hauptspeicher, wird bei jeder Änderung sofort geschrieben.
2. **IndexedDB** – Zweitkopie. Ist der Hauptspeicher beim Start leer (gelöscht,
   gesperrt, abgelaufen), holt die App die Daten von dort zurück.
3. **Arbeitsspeicher** – Notbetrieb, wenn der Browser das Speichern ganz
   blockiert (privates Fenster, blockierte Seitendaten). Die App warnt dann
   sichtbar und läuft weiter.

Zusätzlich bittet die App beim ersten gespeicherten Set über
`navigator.storage.persist()` um dauerhaften Speicher, damit der Browser die
Daten bei Platzmangel nicht verwirft. Den Zustand zeigt
**Einstellungen → Speicher**: Status, Umfang, letzter Speicherzeitpunkt,
Zweitkopie sowie Sichern und Laden.

Cookies werden bewusst nicht verwendet: sie fassen nur rund 4 KB und würden bei
jeder Anfrage mitgeschickt – für Lernsets ungeeignet.

Nichts wird an einen Server geschickt. Ausnahme: Beim Link-Import geht die
aufgerufene Adresse an den jeweiligen Read-Proxy. Die Daten gehören zur
jeweiligen Adresse – Sets von `fanxy13.github.io` tauchen also nicht in einer
lokal geöffneten Kopie auf. Für den Wechsel auf ein anderes Gerät:
**Sichern** und dort **Laden**, oder ein einzelnes Set als Link teilen.

## Aufbau

```
index.html          Grundgerüst und Icon-Sprite (alle Symbole inline)
css/style.css       komplettes Design, hell und dunkel
js/util.js          DOM-Helfer, Antwortprüfung, Töne, Sprachausgabe
js/store.js         localStorage: Sets, Fortschritt, Einstellungen, Teilen-Links
js/importer.js      Parser für eingefügten Text und Dateien
js/ui.js            Navigation, Router, Dialoge, gemeinsame Bausteine
js/pages.js         Start, Bibliothek, Set-Übersicht, Editor, Einstellungen
js/modes/           study.js (Basis) + flashcards, learn, write, test, match
```

Reines HTML, CSS und JavaScript ohne Abhängigkeiten oder Build-Werkzeug.

### Version

Die Datei-Verweise in `index.html` tragen einen Versionsstempel (`?v=1.6`),
damit Browser nach einer Änderung nicht die alte Fassung aus dem Zwischenspeicher
nehmen. Beim Ändern von `css/` oder `js/` diesen Stempel und `App.VERSION` in
`js/app.js` gemeinsam hochzählen. Die laufende Version steht in der App unter
**Einstellungen** ganz unten.
