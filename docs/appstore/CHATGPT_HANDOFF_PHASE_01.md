# CHATGPT HANDOFF – PHASE 1

## 1. Ergebnis

- Phase erfolgreich: JA, mit Einschränkung. Das Backup von family-main und die Supabase- und Vercel-Prüfung waren mangels Zugangsdaten NICHT MÖGLICH.
- Branch: `feature/appstore-v1` (lokal, nicht gepusht)
- Letzter Commit: `a577c2d` „chore: prepare app store migration baseline“. Diese Übergabedatei folgt in einem eigenen Commit direkt danach. Ausgangs-Commit vor Phase 1: `8035896`.
- Arbeitsbaum sauber: JA
- Web-Build erfolgreich: JA

## 2. Durchgeführte Änderungen

- `.gitignore` (neu): node_modules/, dist/, coverage/, .env, .env.*, !.env.example, *.local, local-backups/, vite.config.*.timestamp-*, .vercel/, .DS_Store. Ein künftiger ios/-Ordner wird bewusst nicht ignoriert.
- `docs/appstore/PHASE_01_BASELINE.md` (neu)
- `docs/appstore/CHATGPT_HANDOFF_PHASE_01.md` (neu)
- `local-backups/` wurde lokal angelegt, ist leer und über .gitignore ausgeschlossen.
- Keine Änderungen an: src/, index.html, public/, package.json, package-lock.json, vite.config.js, LehrerAssistent-Dateien, vermarktung.html, lehrerassistent.html, .github/workflows/deploy-pages.yml.
- Vor Phase 1 wurden keine Dateien von Git verfolgt, die jetzt ignoriert werden.

## 3. Backup family-main

- Backup erfolgreich: NICHT MÖGLICH
- lokaler Dateiname: –
- Dateigröße: –
- Supabase updated_at: unbekannt
- Bemerkung: In der Arbeitsumgebung gab es weder VITE_SUPABASE_URL noch VITE_SUPABASE_ANON_KEY noch eine .env-Datei oder Supabase-CLI-Verknüpfung. Es wurde kein Zugriff versucht. Der Nutzer muss das Backup manuell im Supabase-Dashboard erstellen: SQL Editor, dann `select id, data, updated_at from public.app_state where id = 'family-main';` ausführen und das Ergebnis als JSON exportieren. Die Anleitung steht in PHASE_01_BASELINE.md, Abschnitt 8.

## 4. Supabase

- Tabelle app_state bestätigt: nur im Code (src/App.jsx:5-8). In der Datenbank NICHT PRÜFBAR.
- RLS aktiv: NICHT PRÜFBAR. Vermutlich deaktiviert oder für anon offen, weil die App ohne Auth liest und schreibt.
- Vorhandene Policies: NICHT PRÜFBAR
- Realtime aktiv: NICHT PRÜFBAR. Der Code abonniert postgres_changes auf app_state mit dem Filter id=eq.family-main.
- Verwendeter Client-Key-Typ: unbekannt. Der Variablenname VITE_SUPABASE_ANON_KEY deutet auf einen Legacy-Anon-Key hin.
- Nicht prüfbare Punkte: Projekt-URL, Schlüsseltyp, Spalten, Datentypen und Primärschlüssel von app_state, RLS-Status, Policies, Realtime-Publikation, Größe von data, updated_at, weitere Tabellen und Backup- bzw. PITR-Optionen des Plans.

## 5. Vercel

- Projekt lokal erkannt: NEIN (kein .vercel/project.json, keine vercel.json, keine api/-Funktionen)
- Framework: Vite (laut Repo; das Preset im Dashboard ist nicht geprüft)
- Build: `npm run build` bzw. `vite build` (Standard, nicht im Dashboard geprüft)
- Output: `dist` (Standard, nicht im Dashboard geprüft)
- Root-Verzeichnis: Repo-Root (anzunehmen, nicht geprüft)
- Nicht prüfbare Punkte: Projektname, Domain, Produktions-Branch, Preview-Deployments, Node-Version, Namen der gesetzten Umgebungsvariablen.

## 6. Build

- npm install/npm ci notwendig: JA. `npm ci` lief; package.json und package-lock.json sind unverändert (SHA-256 geprüft).
- npm run build: erfolgreich (Vite 6.4.2, 66 Module)
- Warnungen: keine Build-Warnungen. `npm audit` meldet 7 Schwachstellen (1 niedrig, 1 mittel, 5 hoch) in vite ≤ 6.4.2, postcss und ws, überwiegend im Dev-Server und in den Build-Werkzeugen. Nicht behoben.
- Fehler: keine
- dist erzeugt: JA, ca. 884 KB
- Bundle-Hinweise: ein JS-Chunk mit 411 KB (gzip 114 KB) enthält React und supabase-js. icon-512x512.png ist 344 KB groß. Der Build lief ohne Supabase-Umgebungsvariablen, das lokale dist ist deshalb zur Laufzeit nicht lauffähig. Auf Vercel sind die Variablen vermutlich gesetzt.

## 7. Risiken oder Auffälligkeiten

- Die Datenzeile `family-main` ist fest eingetragen. Alle Installationen teilen dieselben Daten, eine öffentliche App-Store-Version ist so nicht möglich.
- Datenverlust-Pfad: load() gibt bei jedem Fehler null zurück, dann folgen DEFAULT_DATA und der Wochen-Effekt ruft sofort save() auf (src/App.jsx:8, :200, :236-238). Nach einem Ladefehler können so die echten Daten überschrieben werden.
- Jede Änderung schreibt das ganze Dokument per upsert. Gleichzeitige Änderungen von mehreren Geräten überschreiben sich.
- Die Zugriffsrechte sind vermutlich offen: anon darf ohne Auth lesen und schreiben, und der Client-Key steht öffentlich im Bundle.
- Die Eltern-PIN steht im Klartext im JSON (Standard 1234) und wird nur im Client geprüft.
- Fotos liegen als Base64 im JSON. Erledigungen, Einlösungen und Benachrichtigungen wachsen unbegrenzt.
- Google Fonts werden zur Laufzeit geladen.
- Es gibt noch kein Backup der Produktionsdaten.

## 8. Was für Phase 2 noch benötigt wird

- Manuelles Backup von family-main als JSON, lokal und zusätzlich außerhalb des Repos.
- Aus dem Supabase-Dashboard (nur lesend): Projekt-URL (ohne Schlüssel), Schlüsseltyp (Legacy-Anon-Key oder Publishable Key), Spaltenstruktur und Primärschlüssel von app_state, RLS-Status, vorhandene Policies, Realtime-Publikation für app_state, Supabase-Plan mit Backup- bzw. PITR-Möglichkeit sowie die Liste weiterer Tabellen. Die SQL-Abfragen stehen in PHASE_01_BASELINE.md, Abschnitte 9 und 10.
- Entscheidung: Wird ein separates Supabase-Testprojekt für Phase 2 angelegt? Empfohlen: ja.
- Aus dem Vercel-Dashboard: Projektname, Produktions-Branch, Root Directory, Build- und Output-Einstellungen, Namen der Umgebungsvariablen und ob Preview-Deployments aktiv sind.
- Entscheidungen des Nutzers: öffentlicher App Store oder nur die eigene Familie; Anmeldeart (E-Mail und Passwort, Magic Link, Sign in with Apple); wie Kinder-Geräte angemeldet werden (gemeinsames Familiengerät oder eigenes Konto); Premium und In-App-Kauf ja oder nein.
- Ob `feature/appstore-v1` nach GitHub gepusht werden soll. Bisher liegt der Branch nur lokal in der Cloud-Sitzung.

## 9. Empfehlung für Phase 2

1. Zuerst das Backup von family-main erstellen und prüfen, danach alles Weitere.
2. Alle Datenbankänderungen erst in einem separaten Supabase-Testprojekt entwickeln.
3. Den Datenverlust-Pfad in load() und im Wochen-Effekt beheben, bei einem Ladefehler also nicht speichern. Das ist klein und isoliert.
4. Supabase Auth für Elternkonten einführen, zunächst mit E-Mail und Passwort.
5. Neue Tabellen families und family_members; app_state bekommt eine Zuordnung per family_id.
6. RLS nach Familienzugehörigkeit, auch für den Realtime-Filter.
7. Ein Umzugsskript für family-main, zuerst im Testprojekt geprobt, mit Rückfallmöglichkeit.
8. Die bestehende UI und Logik von App.jsx beibehalten und nur die Datenschicht (Zeilen 5–8 und 200–244) anpassen.
9. Die Web-App auf Vercel nach jedem Schritt über Preview-Deployments testen.
10. Die PIN-Umstellung, die Modularisierung und Capacitor erst in späteren Phasen angehen.
