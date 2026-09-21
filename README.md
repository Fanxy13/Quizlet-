# QuizFree

Ein kostenloser Quizlet-Klon: Link einfügen, Karten werden importiert, und du wirst
sofort abgefragt. Kein Konto, kein Server, keine Bezahlschranke – alles läuft im Browser.

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

## Karten importieren

Vier Wege, alle über die Startseite:

1. **Link** – z. B. ein Quizlet-Set. Die App liest die Seite und zieht die Karten heraus.
2. **Text** – eingefügte Liste. Erkannt werden Tab, `;`, `|`, `-`, `=`, `:`, Komma
   und abwechselnde Zeilen (Begriff / Definition / Begriff / …).
3. **Prompt** – fertiger Prompt für ChatGPT, Claude & Co. Thema eintragen,
   Kartenzahl und Trennzeichen wählen, kopieren, in den Chat einfügen. Die Antwort
   kommt in genau dem Format zurück, das der Importer liest, und wird unter **Text**
   eingesetzt. Semikolon ist voreingestellt, weil Tabulatoren beim Kopieren aus
   einem Chat oft verloren gehen.
4. **Datei** – CSV, TSV, TXT oder ein JSON-Backup.
5. **Neu** – Karten selbst schreiben.

Jedes Set lässt sich als Link teilen: Der Link enthält das ganze Set (Base64 im Hash),
es wird also nichts hochgeladen.

### Grenzen des Link-Imports

Ein Browser darf fremde Seiten nicht direkt laden (CORS). Die App versucht deshalb
der Reihe nach: direkter Abruf, dann drei öffentliche Read-Proxys, dann `r.jina.ai`.
Klappt keiner, kommt eine Fehlermeldung mit dem Angebot, den Text einzufügen.

Quizlet schützt seine Seiten teilweise gegen automatisches Auslesen. Bei geschützten
oder privaten Sets kann der Import deshalb fehlschlagen – in dem Fall: Set bei Quizlet
öffnen, Karten markieren und kopieren, und über **Text** einfügen. Das funktioniert immer.

Eingebaute Parser: Quizlet (aktuelles `__NEXT_DATA__`-Format und älteres
`window.Quizlet`-Format), Tabellen und Definitionslisten beliebiger Seiten,
sowie reine Textlisten.

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
js/importer.js      Link- und Textimport samt Parsern
js/ui.js            Navigation, Router, Dialoge, gemeinsame Bausteine
js/pages.js         Start, Bibliothek, Set-Übersicht, Editor, Einstellungen
js/modes/           study.js (Basis) + flashcards, learn, write, test, match
```

Reines HTML, CSS und JavaScript ohne Abhängigkeiten oder Build-Werkzeug.
