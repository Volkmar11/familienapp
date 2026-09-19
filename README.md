# familienapp

Dieses Repository hostet über GitHub Pages mehrere kleine Web-Projekte.

| Pfad | Inhalt |
| --- | --- |
| `/` | Werbeseite „Wochen Champion" (`vermarktung.html`) |
| `/lehrerassistent.html` | Werbeseite „LehrerAssistent" |
| `/lehrerassistent-v2/` | **LehrerAssistent 2 – die aktuelle App** (installierbare PWA) |
| `/lehrerassistent/` | LehrerAssistent – erste Fassung |
| `src/`, `index.html` | Quellcode der React-App „Wochen Champion" (Vite) |

## LehrerAssistent 2 (Ordner `lehrerassistent-v2/`)

Zweite Fassung nach dem React-Prototyp: Navigationsstapel, Strichsymbole, selbst
gehostete Schriften (Fraunces, Manrope – keine Anfragen an Google), Titelbild mit
dem Logo der Engelbert-Bohn-Schule Karlsruhe (`icons/schullogo.png`, im Profil
durch ein eigenes ersetzbar).

Die App startet **leer**: keine Klassen, keine Namen, keine Beispieldaten. Beim
ersten Start führt eine dreistufige Einrichtung durch Grunddaten, optional die
erste Klasse und die Datenschutz- sowie KI-Einstellungen; danach richtet sich
jede Lehrkraft alles Weitere selbst ein. Für bekannte Lernfeldkürzel (LF4, LF5,
LF9, LF12) werden Bezeichnung und Themenliste vorbelegt. Eine Beispielklasse
lässt sich unter „Daten & Austausch" bewusst nachladen.

Kern ist der Bereich **Individuelle Arbeitsblätter**: Die App leitet aus Noten,
Mitarbeit, Fehlzeiten und den Beobachtungen zu jeder Person Niveau, Umfang, Hilfen
und Zusatzangebote ab und erzeugt daraus je Person ein eigenes Arbeitsblatt –
wahlweise als fertiger Prompt oder direkt über eine eigene Modellanbindung
(Claude, ChatGPT oder ein OpenAI-kompatibles Schulmodell).

```bash
cd lehrerassistent-v2
python3 -m http.server 8000
```

- `js/store.js` – Datenmodell, Startbestand, Ableitungen (Lernstand, Förderbedarf)
- `js/ki.js` – Prompts, Lernprofile, Anbieteranbindung
- `js/generieren.js` – gemeinsamer Ergebnisbereich (Ampel, Prompt, direkte Erzeugung)
- `js/screens-*.js` – Bildschirme: Start, Klassen, Material, Werkzeuge, Profil
- `js/screens-einrichten.js` – Einrichtung beim ersten Start
- `js/icons.js` – Strichsymbole als Inline-SVG

## LehrerAssistent, erste Fassung (Ordner `lehrerassistent/`)

Eine reine Browser-App ohne Server und ohne Build-Schritt: statisches HTML,
CSS und JavaScript-Module. Alle Daten liegen im `localStorage` des jeweiligen
Geräts, Klarnamen zusätzlich AES-256-verschlüsselt im lokalen Tresor
(WebCrypto, PBKDF2 mit 250.000 Runden).

**Lokal starten**

```bash
cd lehrerassistent
python3 -m http.server 8000
# danach http://localhost:8000 öffnen
```

**Aufbau**

- `index.html` – App-Hülle
- `styles.css` – Oberfläche (heller und dunkler Modus)
- `js/state.js` – Datenmodell, Speicherung, Lernfeld-Kataloge
- `js/views.js` – Start, Klassen, Sprache, Sync, Profil
- `js/werkzeuge.js` – die zehn Werkzeuge
- `js/sprache.js` – Diktat und regelbasierte Auswertung
- `js/dsgvo.js` – Datenschutz-Ampel und Anonymisierung
- `js/vault.js` – verschlüsselter Tresor
- `js/ki.js` – Prompt-Erzeugung, optionaler direkter API-Aufruf
- `sw.js`, `manifest.webmanifest` – Offline-Betrieb und Installation

Die Veröffentlichung erledigt `.github/workflows/deploy-pages.yml`.
