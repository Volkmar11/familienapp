# CHATGPT HANDOFF – PHASE 3A

## 1. Git

- Branch: `feature/appstore-v1`
- letzter Commit: „docs: prepare supabase test environment“ (enthält diese Datei). Davor: `449f32b` (Phase-3-Handoff).
- Branch auf GitHub gepusht: JA (normaler Push, kein Force; `main` unverändert; kein Pull Request erstellt)
- Remote: `origin` → `https://github.com/Volkmar11/familienapp`
- Arbeitsbaum sauber: JA

## 2. Migration

- SQL-Migration unverändert/sicher: JA. `supabase/migrations/20260927120000_family_architecture.sql` ist seit Phase 2 unverändert. Geprüft:
  - Schutzsperre `app.migration_target = 'test'` vorhanden
  - kein Zugriff auf `app_state`
  - kein DROP, TRUNCATE, DELETE oder UPDATE
  - INSERT nur innerhalb von `create_family` in neue Tabellen
  - keine persönlichen Namen, keine Secrets
  - RLS auf allen 13 Tabellen
  - `create_family` enthalten
  - `family_settings.show_daily_crown boolean not null default true` enthalten
- SQL-Editor-Datei erstellt: JA, `docs/appstore/SUPABASE_TEST_MIGRATION_SQL.md`
  - Warnhinweis, danach die Zeile `set app.migration_target = 'test';`, danach die Migration unverändert (per `diff` als identisch geprüft)
  - Lokal in einer Wegwerf-PostgreSQL-16-Datenbank getestet, und zwar als ein einziger Aufruf wie im SQL-Editor: Mit der set-Zeile entstehen 13/13 Tabellen mit RLS. Ohne sie gibt es einen Abbruch, und es wird keine Tabelle angelegt.
- produktiv ausgeführt: NEIN
- Testprojekt ausgeführt: NEIN

## 3. Testprojekt

- Testprojekt bereits vorhanden: NEIN (nicht bestätigt; keine Konfiguration in der Umgebung)
- Migration dort bereits ausgeführt: NEIN
- Environment Variablen vorhanden: NEIN (`SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY` fehlen)
- Network Access vorhanden: NEIN (nicht prüfbar ohne Projekt-Referenz; `<REFERENZ>.supabase.co` muss freigegeben werden)

## 4. Produktionsbackup

- family-main Backup vorhanden: NEIN
- Produktionsdaten verändert: NEIN

## 5. Manuelle Schritte

Genaue Anleitung: `docs/appstore/PHASE_03A_MANUAL_SETUP.md`

1. Supabase-Projekt `wochen-champion-test` anlegen (EU-Region, Datenbankpasswort nur im Passwortmanager). Abschnitt A.
2. Im Testprojekt den E-Mail-Provider aktiv lassen und „Confirm email“ ausschalten, nur im Testprojekt. Abschnitt B.
3. Im SQL-Editor des Testprojekts den kompletten Block aus `SUPABASE_TEST_MIGRATION_SQL.md` ausführen und die 13 Tabellen mit RLS kontrollieren. Abschnitt C.
4. Projekt-Referenz, Project URL und Publishable Key (Fallback: anon) des Testprojekts heraussuchen. Abschnitt D.
5. In der Claude-Code-Cloud-Umgebung `SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_URL` und `SUPABASE_TEST_PUBLISHABLE_KEY` setzen und unter Network access nur `<REFERENZ>.supabase.co` erlauben. Abschnitt E.
6. Im Produktionsprojekt nur lesend `family-main` sichern, als JSON an zwei Orten außerhalb des Repositorys, und die Datei prüfen. Abschnitt F.

## 6. Fertig für Phase 3b

- NEIN

Fehlende Voraussetzungen:

- Projekt `wochen-champion-test` existiert nicht bzw. ist nicht bestätigt.
- Die Migration ist im Testprojekt nicht ausgeführt, die 13 Tabellen sind dort nicht vorhanden.
- E-Mail/Passwort-Auth und „Confirm email aus“ sind im Testprojekt nicht konfiguriert bzw. nicht bestätigt.
- Die drei Umgebungsvariablen fehlen in der Claude-Code-Umgebung.
- Keine Netzwerkfreigabe für `<REFERENZ>.supabase.co`.
- Das `family-main`-Produktionsbackup fehlt.

## 7. Empfehlung

Keine Phase 3b starten, solange die Voraussetzungen in Abschnitt 6 fehlen. Sobald alle Fertig-Kriterien aus `PHASE_03A_MANUAL_SETUP.md`, Abschnitt G erfüllt sind, in einer **neuen** Claude-Code-Sitzung auf dem Branch `feature/appstore-v1`:

„Phase 3b: echte Auth-, RLS-, Realtime- und show_daily_crown-Tests durchführen.“
