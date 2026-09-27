# CHATGPT HANDOFF – PHASE 3A/3B

## 1. Ergebnis

- Phase 3a (Einrichtung): JA. Ausnahme: Das family-main-Backup ist offen, siehe Abschnitt 6.
- Phase 3b (Backend-Tests): JA, vollständig erfolgreich
- Branch: `feature/appstore-v1` (auf GitHub gepusht)
- Ausgeführt über den Supabase-Connector (MCP) in Claude Code, ohne Secrets im Repository

## 2. Test-Supabase

- Testprojekt: `wochen-champion-test`, Referenz `otejitifgcrrwmudrnhs`, eu-central-1 (Frankfurt), Free-Tarif, ACTIVE_HEALTHY, Postgres 17.6
- Produktionsprojekt: `Familienapp`, Referenz `gkkzjmszcjivtaygbmfw`, eu-west-1, Status **INACTIVE (pausiert)**
- Client-Key-Typ: Publishable Key (`sb_publishable_…`) vorhanden; Legacy-Anon-Key ebenfalls aktiv
- Secrets ausgegeben oder committet: NEIN

## 3. Migration

- Ausgeführt im Testprojekt: JA (`apply_migration` „family_architecture“, mit `set app.migration_target = 'test'`)
- In Produktion ausgeführt: NEIN
- Ergebnis:
  - 13/13 Tabellen mit RLS, 47 Policies
  - Funktionen `create_family`, `private.is_family_member`, `private.has_family_role` und `private.set_updated_at`
  - Realtime auf 8 Tabellen
  - `show_daily_crown` mit Default `true`
- Änderungen am SQL-Entwurf: KEINE (keine Fehler gefunden)
- Supabase-Advisor: nur der beabsichtigte Hinweis, dass die SECURITY-DEFINER-Funktion `create_family` für authenticated aufrufbar ist

## 4. Tests

- **SQL-RLS-Matrix** (`supabase/tests/rls_matrix_test.sql`, echte Rollen `authenticated`/`anon`): **39/39 PASS**. Wiederholbar, räumt selbst auf.
  - Familientrennung beim Lesen und Schreiben für Profile, Kategorien, Aufgaben, Belohnungen, Completions, Einlösungen, Settings und Mitglieder
  - Selbst-Einschreiben und Cross-Family-FK blockiert
  - owner kann nicht selbst austreten, darf die eigene Familie löschen
  - anon komplett blockiert
- **create_family:** A und B erhalten verschiedene UUIDs, owner und family_settings werden automatisch angelegt. Nicht angemeldet: abgelehnt. anon: abgelehnt. Ungültiger Name: atomar abgelehnt. Mehrere Familien pro Nutzer sind möglich (bewusst keine DB-Beschränkung).
- **Öffentliche Schnittstelle** (`tests/supabase/auth-rls-realtime.test.mjs`, supabase-js + Publishable Key): **16/16 PASS**
  - Login A/B, falsches Passwort abgelehnt
  - REST-Trennung zwischen den Familien, anon blockiert
- **Realtime:** A empfängt eigene Änderungen in `profiles`, `tasks`, `completions`, `rewards` und `family_settings` (5/5) und **0** Ereignisse aus Familie B.
- **show_daily_crown:** Feld vorhanden, Default `true`. Die eigene Familie kann den Wert lesen und ändern, die fremde nicht. In der UI noch NICHT integriert.
- Testkonten: `wc-test-a@example.com` und `wc-test-b@example.com` (per SQL angelegt; Passwörter nicht gespeichert)

## 5. Noch offen / Hinweise

- „Confirm email“ ist im Testprojekt noch EIN. Der Connector kann das nicht ändern; für Tests der Registrierung in Phase 4 im Dashboard ausschalten.
- Produktionsprojekt ist pausiert. Die produktive Web-App kann solange keine Daten laden; seit Phase 2 zeigt sie dann einen Fehlerbildschirm und überschreibt nichts.
- Die Reaktivierung per Connector wurde von der Sicherheitsprüfung der Claude-Code-Umgebung blockiert und muss vom Nutzer im Dashboard erfolgen.

## 6. family-main

- Produktionsbackup vorhanden: NEIN (Projekt pausiert)
- Produktionsdaten gelesen oder verändert: NEIN

## 7. Empfehlung

1. Nutzer: Im Supabase-Dashboard das Projekt `Familienapp` → „Restore project“.
2. Danach das Backup von `family-main` nur lesend erstellen, per Claude Code über den Connector oder manuell, und an zwei Orten außerhalb des Repositorys sichern.
3. Nutzer: im Testprojekt „Confirm email“ ausschalten.
4. Dann Phase 4: Auth-Frontend (Login/Registrierung), Onboarding (`create_family`, Profile, Starter-Inhalte) und neue Datenschicht gegen das Testprojekt. `app_state`/`family-main` bleibt bis zur späteren, getesteten Migration unberührt.
