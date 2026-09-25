# familienapp

Dieses Repository hostet über GitHub Pages mehrere kleine Web-Projekte.

| Pfad | Inhalt |
| --- | --- |
| `/` | Werbeseite „Wochen Champion" (`vermarktung.html`) |
| `/lehrerassistent.html` | Werbeseite „LehrerAssistent" |
| `/lehrerassistent-v2/` | **LehrerAssistent 2 – die aktuelle App** (installierbare PWA) |
| `/lehrerassistent/` | LehrerAssistent – erste Fassung |
| `/ebs-3d/` | Begehbares 3D-Modell der Engelbert-Bohn-Schule Karlsruhe (Three.js) |
| `src/`, `index.html` | Quellcode der React-App „Wochen Champion" (Vite) |

## 3D-Modell Engelbert-Bohn-Schule (Ordner `ebs-3d/`)

Eine einzelne HTML-Datei ohne Build-Schritt; Three.js 0.169 kommt über jsDelivr.
Zwei Ansichten: **Überblick** (drehen, zoomen) und **Rundgang** in Augenhöhe
(WASD/Maus am Rechner, Steuerknüppel und Wischen am iPhone), dazu Lageplan zum
Hinspringen, Orte-Menü und Tageszeit mit Sonnenstand für Karlsruhe.

Grafik: prozedurale Texturen mit Relief (Normal Maps) für Trapezblech, Fischgrätpflaster,
Kies, Sichtbeton, Waldboden und Rinde; echte gelbe Fensterrahmen; Bäume aus Blattkarten
mit Windbewegung, Farne und Sträucher; physikalischer Himmel mit Wolken und Sternen,
Umgebungsspiegelungen, Umgebungsverdeckung (GTAO) und Leuchteffekt bei Nacht.
Drei Grafikstufen (Hoch, Mittel, Einfach); das Modell schaltet bei zu niedriger
Bildrate selbst herunter.

Die Sporthalle Oberreut ist nach Fotos des fertigen Baus nachgebildet (Karl Braun
Innenausbau, BMP, Stadt Karlsruhe, eigenes Foto vom Vorplatz): Flachdach mit dunkler
Blende auf +5,80 m, weite Auskragung zur Promenade, heller Eingangsbaukörper mit
Brettschalung und Federball-Skulptur, Glasfassaden mit Bronzepaneelen, 3 m abgesenkte
Halle mit Holzbindern und weißen V-Stützen innen. Der Pausenhof hat nach dem Schulfoto
den gelben Windfang und bunt gestreifte Beeteinfassungen.

- Grundrisse, Wege, Parkplätze, Zäune: OpenStreetMap (ODbL), in einen an der
  Gebäudeachse ausgerichteten Meter-Rahmen umgerechnet und in die Datei eingebettet
- Fassade nach dem Außenfoto auf ebs-karlsruhe.de, Geschosshöhen aus dem Luftbild geschätzt
- Innenräume sind nicht modelliert, der Wald ist zufällig verteilt

```bash
cd ebs-3d
python3 -m http.server 8000
```

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
