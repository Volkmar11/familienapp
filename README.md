# familienapp

Dieses Repository hostet über GitHub Pages mehrere kleine Web-Projekte.

| Pfad | Inhalt |
| --- | --- |
| `/` | Werbeseite „Wochen Champion" (`vermarktung.html`) |
| `/lehrerassistent.html` | Werbeseite „LehrerAssistent" |
| `/lehrerassistent/` | **LehrerAssistent – die App** (installierbare PWA) |
| `src/`, `index.html` | Quellcode der React-App „Wochen Champion" (Vite) |

## LehrerAssistent (Ordner `lehrerassistent/`)

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
