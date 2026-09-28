# CHATGPT HANDOFF – PHASE 5A

## 1. Ergebnis
- Phase erfolgreich: JA. Migrationstest vollständig, alle Punkte-Diffs 0, Champion-Sync ohne falsche Zeremonie
- Branch: `feature/appstore-v1`
- Commit: `18c5e37` („test: validate legacy family migration“), danach Handoff-Commit
- Push: normal nach `origin/feature/appstore-v1` (kein Force, kein Merge nach `main`)
- Produktionsdaten verändert: NEIN. Die Produktion wurde nur gelesen: 1 öffentliche Tabelle, keine FAMILY-Funktionen, `app_state` unverändert durch uns.
- Testprojekt verändert: JA, nur `wochen-champion-test`:
  - Wegwerf-owner `wc-p5a-migration-…@example.com`
  - Familie „Migration Test“
  - Test-Hilfsfunktion `public.legacy_import_redemptions` (per SQL, keine reguläre Migration)
- Backup verwendet: `local-backups/family-main-20260927-195206.json` (265.457 Bytes, SHA-256 `9540cdf7…1e5c`, nicht committet)
- Backup updated_at: `2026-09-27T17:46:45.392+00:00`. Die Produktion zeigt inzwischen `2026-09-27 22:09 UTC`, weil die Familie weiter genutzt hat. Für die echte Migration ist ein frisches Backup Pflicht.

## 2. Legacy Quelle
- Profile: 5 (2 mit `isAdmin`)
- Tasks: 33
- Categories: 6 eigene, dazu 2 von Aufgaben genutzte, nicht gelistete Standardkategorien
- Completions: 361
- confirmed: 361
- pending: 0
- Rewards: 13
- Redemptions: 25
- Champions: 23 Einträge (17 als UTC-Sonntag, 6 Wochen doppelt)
- Profilbilder: 5
- Aufgabenbilder: 0

Keine Namen oder Inhalte.

## 3. Migration
- Script:
  - `scripts/migrate-legacy-family.mjs` mit den Modi `--dry-run`, `--reference`, `--apply`, `--verify`, `--sync-test`
  - Mapping: `scripts/lib/legacyMigration.mjs` (reine Funktionen)
- Dry Run: OK. Kein Client, keine Writes, 0 Validierungsfehler, 3 Hinweise (2 ergänzte Kategorien, 1 Titel gekürzt, 6 Champion-Dubletten)
- Apply: OK. Onboarding-RPC plus owner-Inserts unter RLS; Einlösungen über die Test-Hilfsfunktion (nur owner, nur „Migration Test“, einmalig). Kein `service_role`.
- Ziel: ausschließlich `wochen-champion-test` (`otejitifgcrrwmudrnhs`)
- Testfamilie: „Migration Test“, owner = Wegwerfkonto `@example.com`; Zugangsdaten und Test-PIN nur lokal in `local-backups/migration-owner.json` (ignoriert)
- Wiederholbar: JA. Es wird nur die „Migration Test“-Familie dieses owners gelöscht und neu importiert; das wurde dreimal ausgeführt, andere Familien werden nie angefasst.
- Produktionsziel-Schutz: `assertSafeTarget` bricht vor jeder Client-Erzeugung ab bei:
  - Produktions-Ref oder `source_project` des Backups
  - Projektname ohne „test“
  - Secret- oder `service_role`-Key
  - Nicht-Supabase-URL

  Unit-getestet.

## 4. Profile
- Legacy Mitglieder: 5
- FAMILY Profile: 5
- isAdmin Mapping: 2 × `isAdmin` → `is_parent = true` (Eltern-Spielerprofile, nur für diese Migration). Keine Adminrechte, die hängen an Rolle plus PIN.
- Reihenfolge: erhalten (`sort_order` 0–4), Emoji und Farbe übernommen
- Bilder: nicht migriert (Profil 1–5 hatten je ein Foto), Emoji als Avatar

## 5. Tasks / Categories
- Tasks vorher/nachher: 33 / 33 (1 Titel mit 81 Zeichen auf 80 gekürzt; der Snapshot in den Erledigungen bleibt vollständig)
- Kategorien vorher/nachher: 6 / 8. Die 2 von 7 Aufgaben genutzten Legacy-Standardkategorien wurden ergänzt, damit Badges und Statistik gleich bleiben. 0 doppelte Namen.
- Assignments: Kategorie 4, Aufgabe 29, Belohnung 11 Zeilen, alle 1:1. Leer bedeutet für alle, also keine Zeilen.
- ungeklärte Referenzen: 0

## 6. Completions
- vorher/nachher: 361 / 361
- confirmed: 361
- pending: 0
- rejected: 0 (gibt es in Legacy nicht)
- Datumskorrekturen: 0. `completion_date` = lokaler Tag Europe/Berlin; 0 Abweichungen zum UTC-Tag, SQL-Gegenprüfung ebenfalls 0. Der alte UTC-Fehler betraf nur Wochenschlüssel.
- Punkte-Snapshots: übernommen. 4 Erledigungen weichen vom heutigen Aufgabenwert ab und werden korrekt historisch gezählt.

## 7. Rewards / Redemptions
- Rewards: 13 / 13
- Redemptions: 25 / 25, mit Originaldatum, Titel- und Kosten-Snapshot
- ausgegebene Punkte: je Profil exakt gleich (Diff 0)
- Notifications/Acknowledgement:
  - 23 von 28 eindeutig zugeordnet (gleiches Profil, ≤ 2 s, Belohnungsname)
  - 18 gelesen → `acknowledged_at` gesetzt
  - 5 ungelesen → offen
- ungeklärte Fälle:
  - 5 Notifications konnten nicht eindeutig zugeordnet werden (nicht geraten)
  - 2 Einlösungen ohne passende Notification bleiben unquittiert
  - FAMILY zeigt daher 7 statt 5 offene Eltern-Hinweise; kein Einfluss auf die Punkte

## 8. Champions
- Legacy Champions: 23 Einträge
- FAMILY Champions: 17
- normalisierte Wochen: 17 Sonntag → Montag (`normalizeWeekKey`)
- Duplikate: 6 Wochen doppelt. Der Eintrag mit echtem Montag gewinnt; er entspricht in allen 6 Fällen dem neu berechneten Wochensieger. Der verworfene trug die Vorwochenpunkte.
- lastChampionWeek Legacy: `2026-09-20` → normalisiert `2026-09-21`
- last_champion_week FAMILY: `2026-09-14` (Marker − 7). Konsistent mit der Historie (jüngster Eintrag `2026-08-17`); ein früherer Wert würde für eine von Legacy übersprungene Woche mit Punkten einen falschen neuen Champion erzeugen.
- sync_weekly_champion nach Migration:
  - 1 Woche verarbeitet (`2026-09-21`, keine Punkte), 0 neue Einträge
  - Marker → `2026-09-21`, Historie 17 → 17, keine Dubletten
  - zweiter Aufruf: No-op
- falsche neue Zeremonie: NEIN, auch beim App-Start im UI-Test nicht

Keine Namen.

## 9. Punkteabgleich
Nur anonymisiert:

- Anzahl Profile mit Diff 0 heute: 5/5
- Anzahl Profile mit Diff 0 Woche: 5/5
- Anzahl Profile mit Diff 0 Monat: 5/5
- Anzahl Profile mit Diff 0 Gesamt: 5/5
- Anzahl Profile mit Diff 0 verfügbar: 5/5
- maximale Abweichung: 0. Auch eingelöst, bestätigte und offene Anzahl sowie Champion-Anzahl sind 0. Dazu 270 historische Zeitreihen-Prüfungen (18 Wochen × 5 Profile × Heute/Woche/Monat) mit 0 Abweichungen, und die serverseitige SQL-Summe ist identisch.
- erklärte Abweichungen: keine bei Punkten. Bei den Counts nur Kategorien 6→8 und Champion-Historie 23→17 (beides siehe oben).

## 10. UI-Test
- Profile: 5/5 sichtbar; genau eine Familie für das Konto
- Tasks: sichtbar; Zuordnungen wirken (14/14/26/24/21 sichtbare Aufgaben je Profil)
- Rewards: vorhanden; verfügbare Punkte je Profil = Referenz (5/5)
- Statistiken: laden
- Champion History: sichtbar (10 Zeilen, Limit der Oberfläche)
- Realtime:
  - Node über echte WebSockets 9/9: pending → Bestätigung → Punkte, Einlösung mit Serverprüfung, Realtime-Signal am zweiten Client
  - Der Chromium-Proxy dieser Umgebung kann keine WebSocket-Upgrades (bekannt seit 4C2B2)
  - Die Testaktionen wurden per Neuimport entfernt; danach Verify und Sync-Test erneut OK
- Ergebnis: UI 11/11, Funktion/Realtime 9/9, keine JS-Fehler, keine Zeremonie

## 11. Nicht migriert
- PIN: Die Legacy-Klartext-PIN wurde nicht migriert, nicht geloggt und nicht dokumentiert. Die Testfamilie hat eine neue zufällige Test-PIN (nur Hash in der DB).
- Profilbilder: 5 nicht migriert (spätere Storage-Phase)
- Aufgabenbilder: 0 vorhanden
- sonstiges:
  - `notifications` als eigene Liste (FAMILY leitet sie ab)
  - `memberName`/`memberEmoji` in Erledigungen (redundant)
  - echter Bestätigungszeitpunkt (unbekannt → `confirmed_at = completed_at`)

## 12. Produktionsmigration
- Plan erstellt: JA, `docs/appstore/PRODUCTION_MIGRATION_PLAN.md` (10 Schritte, nicht ausgeführt)
- Produktion bereit zur Migration: NEIN
- noch notwendige Voraussetzungen:
  - frisches Backup kurz vor der Umstellung
  - Entscheidung zum temporären Einlöse-Importweg
  - Produktionsmodus des Skripts (echter owner, kein Delete, doppelte Bestätigung)
  - Schema-Freigabe für die Produktion
  - Storage für Profilbilder
  - Passwort-Reset- und E-Mail-Redirects
  - Kontolöschung
  - Eltern-Einladungen
  - Vercel-Production-Variablen plus Rollback-Plan

## 13. Tests
- Mapping Unit: 17/17 (`tests/legacyMigration.test.mjs`). Deckt ab:
  - Profile und `isAdmin`
  - IDs und Zuordnungen
  - Status, lokale Tage und Snapshots
  - Belohnungen, Einlösungen und Notification-Zuordnung
  - Wochen-Normalisierung und Dubletten
  - `lastChampionWeek`
  - fehlende Referenzen
  - Dry-Run ohne Client
  - Produktionssperre
  - Round-Trip über `mapFamilyToChampionData`
- Migration Integration (Testprojekt):
  - Apply 3×, Count-Abgleich 14/14
  - Verify: alle Diffs 0, 270 Zeitreihen-Prüfungen
  - Sync-Test 6/6 Prüfungen
  - UI 11/11, Funktion/Realtime 9/9
- Regression: gesamte Unit-Suite 98/98; die 3 Legacy-Regressionsskripte sind identisch zur Baseline
- Legacy Build: OK
- Family Build: OK
- Ergebnis: grün

## 14. Sicherheit
- Backup committed: NEIN. `local-backups/` ist ignoriert (Backup, `migration-reference.json`, `migration-owner.json`, `migration-state.json`).
- persönliche Daten dokumentiert: NEIN. Nur Profil 1–5 und Counts; automatischer Abgleich der zu committenden Dateien gegen Namen und Texte aus dem Backup.
- service_role: NEIN (Publishable Key plus Wegwerf-owner unter RLS)
- Produktionsmutation: NEIN (nur ein SELECT zur Kontrolle)
- main verändert: NEIN
- Vercel Production verändert: NEIN

## 15. Empfehlung nächste Phase
Noch nicht ausführen. Keine automatische Produktionsumstellung.

1. **Phase 5B – Supabase Storage für Bilder:** privater Bucket je Familie, RLS, Upload und Resize; Profil- und Aufgabenbilder. Den Migrationspfad für Base64 im Skript ergänzen und hier im Testprojekt verifizieren.
2. Passwort-Reset und E-Mail-Bestätigung: Redirect-URLs für Web und später iOS (Deep Link), deutsche Texte.
3. Kontolöschung (App-Store-Pflicht): Konto und Familie löschen, inklusive Bestätigungsdialog.
4. Eltern-Einladungen: zweites Elternkonto per Code oder Link als Rolle `parent`.
5. Die Entscheidung zum Einlöse-Importweg für die Produktion treffen und reviewen: temporäre Funktion plus DROP, oder einmaliger Admin-SQL-Import.
6. Einen Produktionsmodus des Migrationsskripts entwerfen (echter owner, kein Delete, Dry-Run-Pflicht, doppelte Bestätigung); nur im Testprojekt erproben.
7. Die 7 offenen Eltern-Hinweise und die 2 ergänzten Kategorien kurz mit der Familie abstimmen (UX).
8. Danach die Produktionsmigration nach `PRODUCTION_MIGRATION_PLAN.md` vorbereiten; die Ausführung nur nach ausdrücklicher Freigabe.
