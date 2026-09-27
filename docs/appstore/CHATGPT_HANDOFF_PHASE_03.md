# CHATGPT HANDOFF – PHASE 3

## 1. Ergebnis

- Phase vollständig erfolgreich: NEIN. Der Datumsteil ist erfolgreich, der Backendteil blockiert.
- Backendteil durchgeführt: NEIN
- Backendteil blockiert: JA – TESTBACKEND BLOCKIERT – MANUELLE EINRICHTUNG ERFORDERLICH
- Datumsfix erfolgreich: JA
- Branch: `feature/appstore-v1` (lokal, nicht gepusht)
- Commit: `83aae13` „test: validate family backend and fix local date handling“. Diese Übergabedatei folgt in einem eigenen Commit direkt danach. Vorheriger Stand: `4b9c368` (Phase 2).
- Arbeitsbaum sauber: JA
- Web-Build erfolgreich: JA (Vite 6.4.2, JS 413 KB / gzip 115 KB, keine Warnungen, keine neuen Abhängigkeiten)

## 2. Test-Supabase

- separates Testprojekt vorhanden: NEIN. Keine `SUPABASE_*`-Umgebungsvariablen, keine `.env`/`.env.local`, keine Supabase-CLI-Verknüpfung, keine Supabase CLI.
- eindeutig als Test identifiziert: NEIN
- Projekt-Referenz: keine
- verwendeter öffentlicher Client-Key-Typ: keiner (vorgesehen: Publishable Key `sb_publishable_…`, alternativ Legacy-Anon-Key)
- Secrets ausgegeben oder committed: NEIN

## 3. Migration

- ausgeführt: NEIN (weder Produktion noch Test)
- erfolgreich: –
- angelegte Tabellen: keine
- angelegte RPCs: keine
- RLS aktiviert: – (im Entwurf für alle 13 Tabellen vorgesehen)
- Realtime eingerichtet: – (im Entwurf vorgesehen)
- Änderungen am SQL-Entwurf: KEINE. Die statische Nachprüfung ergab keinen echten Fehler; die Schutzsperre `app.migration_target = 'test'` bleibt bestehen.
- Neue Erkenntnis: Die Claude-Code-Cloud-Umgebung erlaubt nur ausgehendes HTTPS über einen Proxy. Direkte Postgres-Verbindungen sind voraussichtlich nicht möglich. Deshalb soll der Nutzer die Migration im SQL-Editor des Testprojekts ausführen; Claude testet danach über HTTPS mit dem Publishable Key, ohne Admin-Zugänge.

## 4. Auth und create_family

- User A: nicht angelegt (blockiert). Vorgesehen per `signUp` mit Platzhalter-Adresse, sobald „Confirm email“ im Testprojekt aus ist.
- User B: nicht angelegt (blockiert)
- create_family User A: nicht getestet (blockiert)
- create_family User B: nicht getestet (blockiert)
- anonymer Aufruf blockiert: nur lokal verifiziert (Phase 2, PostgreSQL 16 mit nachgebildeten Rollen); gegen Supabase offen
- family_settings automatisch erstellt: nur lokal verifiziert; gegen Supabase offen
- owner automatisch erstellt: nur lokal verifiziert; gegen Supabase offen
- Mehrere Familien pro Nutzer: technisch erlaubt, bewusst keine DB-Beschränkung; die UI arbeitet zunächst mit einer aktiven Familie.

## 5. RLS-Test

Gegen echtes Supabase: NICHT GETESTET (blockiert).

Lokal (Phase 2):

- PASS: Familientrennung beim Lesen
- PASS: Schreiben in eine fremde Familie → RLS-Fehler
- PASS: UPDATE/DELETE einer fremden Familie ohne Wirkung
- PASS: Selbst-Einschreiben in eine fremde Familie → RLS-Fehler
- PASS: Cross-Family-FK → Fehler
- PASS: anon → permission denied
- PASS: owner-Austritt verhindert

Offen: die vollständige Matrix für Kategorien, Belohnungen und Settings aus Sicht von User B und anon. Die Matrix steht in `docs/appstore/PHASE_03_TEST_BACKEND.md`, Abschnitt 6.

## 6. Realtime-Test

- eigene Familie: nicht getestet (blockiert)
- fremde Familie: nicht getestet (blockiert)
- Auffälligkeiten: keine. Hinweis für später: Node 22 braucht `NODE_USE_ENV_PROXY=1`, damit `fetch` in der Cloud-Umgebung den Proxy nutzt.

## 7. Datumsfix

- Ursache: `isoDate()` nutzte `toISOString()` (UTC). In Europe/Berlin wurde der Wochenbeginn als Sonntag gespeichert (Mo 21.09.2026 → `2026-09-20`), und zwischen 0 und 2 Uhr galt noch der Vortag als „heute“. Wochen- und Monatsfilter hingen von der Gerätezeitzone ab.
- neue Datei/Helper: `src/lib/dateUtils.js` mit `DEFAULT_TIME_ZONE = "Europe/Berlin"`, `toDateKey`, `addDays`, `weekdayOfKey`, `weekStartKey`, `monthStartKey` und `normalizeWeekKey`. Alle Funktionen sind rein und akzeptieren optional einen `timeZone`-Parameter für das spätere `family_settings.timezone`. `App.jsx` wurde nur an den Datumsstellen angepasst (+23/−19 Zeilen), die UI ist unverändert.
- lokales Datum: über `Intl.DateTimeFormat` in Europe/Berlin, Format `YYYY-MM-DD`
- Wochenbeginn: echter lokaler Montag. Alte UTC-Sonntags-Schlüssel in `lastChampionWeek` und `championHistory` werden beim Vergleich normalisiert. Nach dem Deploy gibt es deshalb keine falsche Champion-Zeremonie; neue Schlüssel sind Montage.
- UTC-Problem beseitigt: JA. `toISOString()` wird nur noch für echte Zeitstempel verwendet.
- Tests:
  - `tests/dateUtils.test.mjs` (`node:test`, keine neuen Pakete) mit 15/15 PASS in den Gerätezeitzonen Europe/Berlin, UTC, America/New_York und Asia/Tokyo. Abgedeckt sind die geforderten Daten 21.09., 27.09. und 28.09.2026, Mitternachtsfälle (00:30 MESZ, 00:15 MEZ an Neujahr) und die Sommerzeit-Umstellung.
  - Browser-Integrationstest (Chromium, feste Uhrzeit, simulierte API): 4/4 PASS mit neuem Code. Der alte Code bestand 3 der 4 Szenarien nicht, das bestätigt den Fehler.
  - Ausführen: `node --test tests/dateUtils.test.mjs`

## 8. show_daily_crown

- DB-Feld vorhanden: nur im SQL-Entwurf (`boolean NOT NULL DEFAULT true`); in keinem Supabase-Projekt angelegt
- Default: `true` (lokal in Phase 2 verifiziert)
- RLS getestet: nur lokal (eigene Familie kann ändern); gegen Supabase offen
- UI bereits integriert: NEIN

## 9. family-main

- Produktionsbackup vorhanden: NEIN
- Produktionsdaten verändert: NEIN

## 10. Noch offene Blocker vor Phase 4

- Kein Supabase-Testprojekt vorhanden.
- Migration im Testprojekt nicht ausgeführt.
- Keine Testprojekt-Umgebungsvariablen (`SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY`) und keine Netzwerkfreigabe für `<ref>.supabase.co` in der Claude-Code-Cloud-Umgebung.
- Branch `feature/appstore-v1` ist nicht auf GitHub. Eine neue Sitzung hätte die Phasen 1–3 nicht.
- Backup von `family-main` fehlt weiterhin.

## 11. Empfehlung für Phase 4

Phase 4 wird NOCH NICHT empfohlen. Zuerst muss der Nutzer einmalig manuell folgendes erledigen (Details in `docs/appstore/SUPABASE_TESTPROJECT_SETUP.md`):

1. Den Branch `feature/appstore-v1` nach GitHub pushen lassen.
2. Auf supabase.com das Projekt `wochen-champion-test` anlegen (EU-Region, Datenbankpasswort im Passwortmanager speichern).
3. Unter Authentication → Email „Confirm email“ **nur im Testprojekt** deaktivieren.
4. Im SQL-Editor des **Testprojekts** zuerst `set app.migration_target = 'test';` und darunter den kompletten Inhalt von `supabase/migrations/20260927120000_family_architecture.sql` ausführen; danach die 13 Tabellen mit RLS kontrollieren.
5. In der Claude-Code-Cloud-Umgebung (Titelleiste → Umgebung → Edit) die Variablen `SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_URL` und `SUPABASE_TEST_PUBLISHABLE_KEY` anlegen und unter Network access `<ref>.supabase.co` erlauben. Keine `service_role`-Keys, kein Datenbankpasswort, kein Access Token.
6. Das Backup von `family-main` aus dem Produktivprojekt erstellen (nur SELECT und Export, siehe `PHASE_01_BASELINE.md`, Abschnitt 8).
7. Danach in einer neuen Sitzung eine **Phase 3b** ausführen: Testkonten A und B, `create_family`, die vollständige RLS-Matrix, Realtime und `show_daily_crown` gegen das echte Testprojekt.
8. Erst nach bestandener Phase 3b folgt Phase 4: Auth-Frontend, Onboarding und die neue Datenschicht.
