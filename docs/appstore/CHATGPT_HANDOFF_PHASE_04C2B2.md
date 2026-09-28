# CHATGPT HANDOFF – PHASE 4C2B2

## 1. Ergebnis

* Phase erfolgreich: JA
* Branch: `feature/appstore-v1`
* Commit: `67e2007` „feat: add realtime sync and weekly champion“ (diese Übergabedatei folgt in einem eigenen Commit direkt danach)
* Push: JA (normal, kein Force, kein Merge nach `main`)
* Legacy-Build: erfolgreich (`npm run build`), Verhalten identisch (3 Regressionsskripte)
* Family-Build: erfolgreich (Testprojekt-Variablen)
* Produktionsdaten verändert: NEIN
* neue Migration: JA. `supabase/migrations/20260928300000_champion_realtime.sql`, nur Testprojekt, Testsperre `app.migration_target = 'test'`; bestehende Migrationen unverändert

## 2. Champion

* RPC: `public.sync_weekly_champion(p_family_id)` → Kern `private.sync_weekly_champion_at(p_family_id, now())`; SECURITY INVOKER, `search_path = ''`, Rolle owner/parent, `EXECUTE` nur `authenticated`
* Punktequelle: nur `completions.status = 'confirmed'`, Punkte-Momentaufnahme `completions.points`, Tag = `completion_date`; keine Client-Punkte
* Zeitzone: `family_settings.timezone` (Standard `Europe/Berlin`) per `at time zone`, ohne UTC-Versatz (Grenze Sonntag 23:59/Montag 00:01 getestet, auch New York)
* Wochenbeginn: lokaler Montag; ausgewertet werden nur vollständig abgeschlossene Wochen (Montag 28.09.2026 → Woche ab 21.09.2026)
* Gleichstand: wie LEGACY (stabile Mitgliederreihenfolge) → kleinere `profiles.sort_order`, danach `profiles.id`; nie zufällig
* Woche ohne Punkte: kein Champion (wie LEGACY); die Woche gilt trotzdem als verarbeitet
* Catch-up: alle fehlenden abgeschlossenen Wochen seit `last_champion_week` (ohne Marker: ab Gründung bzw. erster Erledigung; max. 104 Wochen); die Zeremonie zeigt höchstens die neueste Woche
* last_champion_week: Montag der letzten vollständig verarbeiteten Woche (FAMILY-Semantik; LEGACY speicherte den aktuellen Montag, für die Migration −7 Tage)
* Race-Schutz: `SELECT … FOR UPDATE` auf `family_settings` serialisiert parallele Aufrufe
* Idempotenz: `unique(family_id, week_start)` + `on conflict do nothing`; erneuter Aufruf → `processed_weeks = 0` (getestet lokal mit 3 Sitzungen und im Testprojekt mit 3 Geräten)

## 3. Champion-Zeremonie

* wann ausgelöst: nur wenn der RPC-Aufruf dieses Geräts den Champion der zuletzt abgeschlossenen Woche **neu** angelegt hat (`new_champion`); Sync nach dem ersten Laden, bei Rückkehr in den Vordergrund und nach Reconnect
* Reload: keine zweite Zeremonie (Browser getestet)
* zweites Gerät: sieht den vorhandenen Eintrag, `new_champion = false`, keine Zeremonie (Browser und Integration getestet)
* nachgeholte Wochen: nur in der Historie, keine Zeremonie-Serie
* Tests:
  * lokal: Sieger, Gleichstand, 0 Punkte, pending/rejected, Catch-up über 4 Wochen, Zeitzonengrenze, Parallelität
  * Testprojekt: 12 Champion-Prüfungen
  * Browser: Zeremonie, Reload, zweites Gerät

## 4. Realtime

* Datei/Service:
  * `src/lib/familyRealtime.js`: Channel, Status, Reconnect
  * `src/lib/reloadScheduler.js`
  * `src/lib/appLifecycle.js`
  * Anbindung nur in `src/family/FamilyChampion.jsx`
* abonnierte Tabellen: nur `public.family_sync` (Signal pro Familie). DB-Trigger erhöhen es bei jeder Änderung an:
  * `families`
  * `family_settings`
  * `profiles`
  * `categories`
  * `category_assignments`
  * `tasks`
  * `task_assignments`
  * `rewards`
  * `reward_assignments`
  * `completions`
  * `redemptions`
  * `champion_history`
* Filter: `family_id=eq.<aktive Familie>`
* RLS: `family_sync` nur für Mitglieder lesbar, nicht schreibbar. Ein fremder Nutzer mit fremder `family_id` im Filter erhält nichts (echter WebSocket-Test). Grund für das Signal-Design: DELETE-Ereignisse sind in Supabase Realtime weder filterbar noch RLS-geprüft.
* Debounce: 200 ms
* Single Flight: höchstens ein Reload gleichzeitig; Ereignisse während eines Reloads ergeben genau einen Nachlauf (keine verlorenen Änderungen)
* eigene Mutationen: warten auf den Scheduler-Reload; das zusätzliche Realtime-Signal wird gebündelt (höchstens 2 Reloads je Aktion, getestet); keine Unterdrückung über lokale IDs
* Familienwechsel: Unmount (`key={familyId}`) stoppt Channel, Scheduler und Timer; verspätete Ergebnisse werden verworfen; die neue Familie hat ein eigenes Abo; das PIN-Gate ist gesperrt (getestet)
* Logout: gleicher Abbau; danach keine Datenabfragen mehr, auch nicht bei Vordergrund-Ereignissen (getestet)

## 5. Reconnect / Lifecycle

* Channel Error: Status `disconnected`, Channel wird verworfen und neu aufgebaut
* Timeout: wie Channel Error
* Closed: wie Channel Error
* Reconnect: Wartezeiten 1 s, 2 s, 5 s, 10 s, 30 s; Rückmeldungen alter Channels werden ignoriert; `reconnectNow()` bei Vordergrund/`online`
* vollständiger Reload: bei **jedem** `SUBSCRIBED` (auch nach Reconnect), danach Champion-Sync
* visibilitychange: Vordergrund → PIN-Timeout prüfen, neu laden, Realtime prüfen, Champion-Sync
* focus: ebenso; mit visibilitychange entprellt (800 ms) → genau ein Reload (getestet); zusätzlich `online`
* PIN-Timeout: bei Rückkehr geprüft, abgelaufen → Elternbereich gesperrt (getestet mit 11 Minuten)
* Capacitor vorbereitet: JA. Zentrale Stelle in `appLifecycle.js` mit Hinweis auf `@capacitor/app` `appStateChange`; **nicht installiert**
* Verbindungshinweis: erst nach 6 s, dezent und klick-durchlässig: „Verbindung unterbrochen – Daten werden nach dem Wiederverbinden aktualisiert.“ Verschwindet nach dem Reconnect.

## 6. Konflikte

* updated_at genutzt: JA (bereits vorhanden inkl. Trigger; **keine Schemaergänzung**)
* betroffene Tabellen: `profiles`, `categories`, `tasks`, `rewards`, `family_settings`
* stale edit: `UPDATE … WHERE id = … AND updated_at = <Stand beim Öffnen>`; 0 Zeilen und Eintrag vorhanden → Konflikt. Offene Formulare erkennen Änderungen anderer Geräte und behalten den eigenen Inhalt.
* UI-Meldung:
  * im Formular: „Dieser Eintrag wurde inzwischen auf einem anderen Gerät geändert.“ + „Aktuellen Stand übernehmen“
  * beim Speichern: „Dieser Eintrag wurde auf einem anderen Gerät geändert. Bitte lade die aktuellen Daten neu.“
* Last-Writer-Wins verhindert: JA
* Tests:
  * Unit: 3
  * Zwei-Geräte-Integration: Konflikt, kein Überschreiben
  * Browser: veraltetes Formular, Konfliktmeldung, DB-Stand erhalten, Übernehmen

## 7. Mehrgeräte-Synchronisation

* Completion: gleichzeitig dieselbe Aufgabe → genau eine Erledigung; das andere Gerät bekommt „Diese Aufgabe wurde heute bereits erledigt.“, beide zeigen denselben Stand
* Confirmation: Bestätigung auf B → Punkte auf A steigen automatisch
* Reward: gleichzeitig mit knappen Punkten → genau eine Einlösung; beide Geräte zeigen denselben verfügbaren Punktestand
* CRUD: neue und geänderte Aufgabe, Profil, Kategorie, Belohnung und Zuordnungen erscheinen auf dem anderen Gerät
* Settings: Änderungen übertragen
* Tageskrone: aus → verschwindet, an → erscheint wieder (auf dem anderen Gerät)
* Pending: erscheint automatisch auf dem Elterngerät; der Hinweis-Zähler aktualisiert sich nach dem Quittieren
* Profil/Kategorie/Reward: geprüft
* Ergebnis:
  * über echte WebSockets (Node, App-Bausteine): 27/27
  * zwei Chromium-Kontexte: 44/44
  * Einschränkung: Chromium kann in dieser Sandbox keine WebSockets öffnen (Egress-Proxy), daher läuft die Weitergabe im Browsertest über Vordergrund/`online`. Live-Realtime zwischen zwei echten Geräten einmal in der Vercel-Preview prüfen.

## 8. Netzwerkunterbrechung

* Test:
  * Node: Realtime-Verbindung getrennt (`realtime.disconnect`)
  * Browser: `setOffline(true/false)`
* während Offline Änderungen: auf Gerät B durchgeführt
* Reconnect: automatisch (Status getrennt → verbunden), mit Backoff
* verpasste Daten nachgeladen: JA (vollständiger Reload nach `SUBSCRIBED` bzw. `online`)
* Ergebnis: bestanden. Beim Offline-Zustand bleibt die App sichtbar, es werden keine Daten verworfen, der Hinweis erscheint erst nach 6 s.

## 9. End-to-End

* Registrierung: neuer Wegwerfnutzer über die UI
* Onboarding: Familie, 2 Kinder, PIN, Aufgaben, Belohnungen, Einstellungen
* Alltag: Aufgabe erledigen (pending) → PIN → bestätigen → Belohnung einlösen
* Verwaltung: Belohnung angelegt
* Champion: Sync beim Start ausgeführt; neue Familie bekommt keine Zeremonie
* Logout/Login: alle Daten vollständig wieder da
* Ergebnis: 17/17

## 10. Datenbankänderungen

* Migration: `20260928300000_champion_realtime.sql`
* nur Testprojekt: JA
* neue RPCs:
  * `public.sync_weekly_champion`
  * privat: `sync_weekly_champion_at`, `local_week_start`, Trigger-Funktion `bump_family_sync`
* Realtime-Publikation: `public.family_sync` hinzugefügt (die 8 bereits publizierten Familientabellen bleiben; die App nutzt sie nicht direkt)
* Schemaergänzungen:
  * neue Tabelle `family_sync` (family_id, version, changed_at) mit RLS-Select für Mitglieder
  * AFTER-Trigger auf 12 Tabellen
  * keine Änderung an bestehenden Spalten
* Produktion verändert: NEIN

## 11. Tests

* Unit: 81/81 (neu `tests/realtimeSync.test.mjs`: Scheduler, Realtime-Service mit Status/Reconnect, Lebenszyklus, Konflikte, Champion-Ergebnis, statische Trennung)
* Integration:
  * Champion + Realtime 17/17 (`tests/supabase/family-champion-realtime.test.mjs`)
  * Regression 4C2B1/4C2A/4C1: Datenadapter 18/18, Kernaktionen 44/44, Elternverwaltung 60/60
* Champion: lokal (PostgreSQL 16) alle Regeln + Zeitzone + 3 parallele Sitzungen; Testprojekt 12 Prüfungen
* Realtime: echter WebSocket (Signal, RLS-Isolation, Schreibschutz)
* Zwei-Geräte: 27/27 über echte WebSockets (`tests/supabase/family-two-device.test.mjs`)
* Browser: Zwei-Kontext-Test 44/44, End-to-End 17/17, 393×852, kein horizontales Scrollen, keine JS-Fehler
* Legacy Regression: 3 Skripte identisch
* Gesamtergebnis: alle Tests grün

## 12. Sicherheit

* Fremde Familiendaten über Realtime: NEIN (Filter + RLS auf `family_sync`, zusätzlich Prüfung im Client; das Signal enthält nur Familien-ID und Zähler)
* Secrets: keine committet
* service_role: NEIN
* Produktionsmutation: NEIN
* persönliche Legacy-Daten im FAMILY-Bundle: NEIN (keine Entwicklernamen, kein `family-main`, keine Legacy-PIN, keine Produktions-Ref)

## 13. Geänderte Dateien

* neu:
  * `supabase/migrations/20260928300000_champion_realtime.sql`
  * `src/lib/familyRealtime.js`
  * `src/lib/reloadScheduler.js`
  * `src/lib/appLifecycle.js`
  * `tests/realtimeSync.test.mjs`
  * `tests/supabase/family-champion-realtime.test.mjs`
  * `tests/supabase/family-two-device.test.mjs`
  * `docs/appstore/PHASE_04C2B2_REALTIME_CHAMPION.md`
  * diese Datei
* geändert:
  * `src/family/FamilyChampion.jsx`: Scheduler, Realtime, Lebenszyklus, Champion, Hinweis
  * `src/shared/ChampionApp.jsx`: Zeremonie über `ceremony`, Konflikthinweis in Formularen
  * `src/lib/familyMutations.js`: `updated_at`-Konflikte, `syncWeeklyChampion`
  * `src/lib/familyData.js` / `familyMapping.js`: `updated_at` → `updatedAt`
  * `tests/familyData.test.mjs`

## 14. Noch offene Punkte

* Profil-/Aufgabenbilder und Supabase Storage: im FAMILY-Modus noch ausgeblendet (LEGACY nutzt Base64)
* Eltern-Einladungen: fehlen (nur `owner`; RLS für `parent` vorbereitet)
* Passwort-Reset Redirect URLs: Site-URL/Redirects im Testprojekt für die Vercel-Preview und später Produktion/App prüfen
* Migration family-main: noch nicht erfolgt (nächste Phase, zuerst im Testprojekt, `lastChampionWeek` −7 Tage)
* Produktionsbereitstellung: Vercel-Preview braucht einmalig Preview-Variablen (siehe Preview-Anleitung); Produktion bleibt LEGACY
* Capacitor/iOS: vorbereitet (`appLifecycle.js`), nicht installiert
* Premium/StoreKit: nicht begonnen
* Live-Realtime zwischen zwei echten Geräten in der Preview prüfen (Sandbox-Chromium ohne WebSocket)
* Konflikt auch nach reinem Sortieren oder Archivieren auf einem anderen Gerät (bewusst sicher, ggf. später verfeinern)

## 15. Empfehlung nächste Phase

1. Backup `family-main` (lokal, nicht im Repo) lesen und das Mapping-Konzept LEGACY → FAMILY festhalten (IDs, Mitglieder mit `isAdmin` → Profile mit `is_parent`, Kategorien per Name)
2. Migrationsskript (Node, nur Testprojekt, idempotent über Zuordnungstabelle) mit Wegwerf-Familie „Familie (Migration Test)“
3. Aufgaben, Kategorien und Belohnungen inkl. `assignedTo` → Assignment-Tabellen
4. Erledigungen: `confirmed !== false` → `confirmed`, unbestätigt → `pending`; `completion_date` per `dateUtils` (Europe/Berlin); Punkte-Momentaufnahme übernehmen
5. Einlösungen (`points_spent`), Hinweise (gelesen → `acknowledged_at`), Champion-Historie (Woche → lokaler Montag), `last_champion_week` = LEGACY-Marker − 7 Tage
6. Abgleich je Kind: heute, Woche, Monat, gesamt, verfügbar (LEGACY-Berechnung aus Backup vs. FAMILY-Datenmodell); Abweichungen = 0 oder erklärt
7. Stichproben in der FAMILY-UI (Preview) mit migrierten Testdaten, Zeremonie nicht erneut auslösen
8. Rückweg dokumentieren (Testfamilie löschen), keine Produktionsdaten ändern
9. Checkliste für eine spätere Produktionsumstellung (Freigabe, Backup, Zeitfenster, Vercel-Variablen) nur vorbereiten
10. Keine Produktionsumstellung, kein Merge nach `main`
