# QuizFree

Ein kostenloser Quizlet-Klon: Karten per Lesezeichen von Quizlet holen oder einfügen,
und sofort abgefragt werden. Kein Konto, kein Server, keine Bezahlschranke – alles
läuft im Browser.

## Starten

* **Im Netz:** <https://fanxy13.github.io/Quizlet-/> – veröffentlicht über
  GitHub Pages (Settings → Pages → Branch `main`, Ordner `/ (root)`).
* **Lokal:** `index.html` doppelklicken. Kein Build-Schritt, keine Installation,
  keine Abhängigkeiten.

## Was drin ist

| Modus | Was passiert |
| --- | --- |
| Karteikarten | Karte umdrehen, in „Sitzt“ und „Nochmal“ sortieren, Auto-Abspielen, Vorlesen |
| Lernen | Runden aus Auswahl- und Tippfragen, drei Stufen pro Karte, Fortschritt bleibt gespeichert |
| Schreiben | Alles eintippen, Fehler kommen erneut dran, Tippfehler-Erkennung |
| Test | Auswahl, Wahr/Falsch und Tippfragen, danach Auswertung Frage für Frage |
| Zuordnen | Paare auf Zeit anklicken, mit Bestzeit pro Set |
| Speed | Begriffe fallen von oben, unten stehen 4–6 Antworten. Treffer geben einen Punkt und erhöhen das Tempo, Fehlgriff und durchgefallenes Wort kosten einen. Bestwert pro Set |

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

Doppelte Karten bleiben erhalten – Quizlet-Sets enthalten denselben Begriff
durchaus mehrfach, und jede Karte soll einzeln abgefragt werden. Entdoppelt wird
nur, wenn die Karten aus der Seite gelesen werden, weil dort dieselbe Karte über
mehrere Wege auftauchen kann. Karten, deren Seite gar keinen Text hat (reine
Bildkarten), lassen sich nicht abfragen; wie viele das waren, steht als Hinweis
in der Import-Vorschau und in der Konsole.

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

| Wo | Taste | Wirkung |
| --- | --- | --- |
| Karteikarten | `Leertaste` / `F` | Karte umdrehen |
| Karteikarten | `←` `→` | vor und zurück |
| Karteikarten | `↑` `↓` | „Sitzt“ / „Nochmal“ |
| Karteikarten | `A` / `S` | vorlesen / mischen |
| Lernen, Test | `1`–`4` | Antwort auswählen |
| Lernen, Schreiben | `Enter` | prüfen bzw. weiter |
| Lernen | `Leertaste` | nach einer falschen Antwort weiter |
| Speed | `1`–`6` | Antwort auswählen |
| Speed | `Leertaste` | Pause |
| Editor | `Strg`/`Cmd` + `S` | Set speichern |

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

Die App ruft keine fremden Server auf – kein Tracker, kein Proxy, keine
Anmeldung. Der einzige Netzzugriff geschieht im Quizlet-Helfer, und der läuft
nicht hier, sondern im Browser auf der Quizlet-Seite.

Gespeichertes gehört immer zu einer Adresse: Sets von `fanxy13.github.io` tauchen
nicht in einer lokal geöffneten Kopie auf und umgekehrt. Für den Wechsel auf ein
anderes Gerät **Sichern** und dort **Laden**, oder ein einzelnes Set als Link
teilen.

## Aufbau

```
index.html          Grundgerüst und Icon-Sprite (alle Symbole inline)
css/style.css       komplettes Design, hell und dunkel
js/util.js          DOM-Helfer, Antwortprüfung, Töne, Sprachausgabe
js/store.js         localStorage: Sets, Fortschritt, Einstellungen, Teilen-Links
js/importer.js      Parser für eingefügten Text und Dateien
js/ui.js            Navigation, Router, Dialoge, gemeinsame Bausteine
js/pages.js         Start, Bibliothek, Set-Übersicht, Editor, Einstellungen
js/modes/           study.js (Basis) + flashcards, learn, write, test, match, speed
```

Reines HTML, CSS und JavaScript ohne Abhängigkeiten oder Build-Werkzeug.
Die Verweise auf Profil und Quelltext stehen gesammelt in `App.LINKS` (js/app.js)
und erscheinen unten in der Navigationsleiste sowie unter **Einstellungen → Projekt**.

### Version

Die Datei-Verweise in `index.html` tragen einen Versionsstempel (`?v=2.0`),
damit Browser nach einer Änderung nicht die alte Fassung aus dem Zwischenspeicher
nehmen. Beim Ändern von `css/` oder `js/` diesen Stempel und `App.VERSION` in
`js/app.js` gemeinsam hochzählen. Die laufende Version steht in der App unter
**Einstellungen** ganz unten.
