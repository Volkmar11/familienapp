# Phase 3a/3b – Supabase-Testbackend: Einrichtung und Ergebnisse

Stand: 2026-09-27 · Branch `feature/appstore-v1` · ausgeführt über den Supabase-Connector (MCP) in der Claude-Code-Sitzung.

> **Produktionsprojekt:** Es wurden keine Daten gelesen und keine verändert. Das Produktionsprojekt ist pausiert (Status `INACTIVE`). Den Versuch, es zu reaktivieren, hat die Sicherheitsprüfung der Claude-Code-Umgebung blockiert. Deshalb gibt es noch **kein** Backup von `family-main` (siehe Abschnitt 7).

---

## 1. Projekte

| | Produktion | Test |
| --- | --- | --- |
| Name | `Familienapp` | **`wochen-champion-test`** |
| Referenz | `gkkzjmszcjivtaygbmfw` | `otejitifgcrrwmudrnhs` |
| Region | eu-west-1 (Irland) | eu-central-1 (Frankfurt) |
| Status | **INACTIVE (pausiert)** | ACTIVE_HEALTHY |
| Postgres | 17 | 17.6 |
| Organisation | „Volkmar Familienapp“, Free-Tarif | dieselbe, keine Zusatzkosten |

Die Projekt-Referenzen sind keine Geheimnisse. Schlüssel und Passwörter stehen **nicht** in diesem Repository.

## 2. Migration im Testprojekt

- Die Migration wurde am 2026-09-27 per `apply_migration` unter dem Namen `family_architecture` eingespielt, und zwar **nur** in `otejitifgcrrwmudrnhs`.
- Der Inhalt entspricht `supabase/migrations/20260927120000_family_architecture.sql`. Davor stand `set app.migration_target = 'test'`. `begin;` und `commit;` wurden weggelassen, weil `apply_migration` selbst eine Transaktion verwendet.
- Die Migrationsdatei im Repository ist **unverändert**. Es wurden keine SQL-Fehler gefunden.

**Kontrolle:**

- **13/13 Tabellen**, alle mit RLS: `categories`, `category_assignments`, `champion_history`, `completions`, `families`, `family_members`, `family_settings`, `profiles`, `redemptions`, `reward_assignments`, `rewards`, `task_assignments`, `tasks`
- **47 Policies**
- **Funktionen:** `public.create_family`, `private.is_family_member`, `private.has_family_role`, `private.set_updated_at`
- **Realtime-Publikation:** `categories`, `champion_history`, `completions`, `family_settings`, `profiles`, `redemptions`, `rewards`, `tasks`
- `family_settings.show_daily_crown`: `NOT NULL DEFAULT true`
- `anon`: kein `EXECUTE` auf `create_family`, kein `SELECT` auf die Tabellen

**Supabase-Sicherheitsprüfung (Advisor):** Es gibt einen Hinweis. `public.create_family` ist eine `SECURITY DEFINER`-Funktion und für `authenticated` aufrufbar ([Lint 0029](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)). Das ist **beabsichtigt**: So wird das Problem gelöst, dass ein neuer Nutzer anfangs noch zu keiner Familie gehört. Die Funktion prüft `auth.uid()`, hat `search_path = ''` und legt nur für den Aufrufer selbst an. Es gibt keine weiteren Hinweise, also auch keine fehlende RLS.

## 3. Testkonten

- Im Testprojekt gibt es `wc-test-a@example.com` (User A, „Testfamilie A“) und `wc-test-b@example.com` (User B, „Testfamilie B“), beide bestätigt und mit E-Mail-Identität.
- Angelegt wurden sie direkt per SQL. So war kein echter Mailversand nötig und auch keine Änderung an der Einstellung „Confirm email“.
- Die Passwörter wurden zufällig und nur lokal erzeugt, als bcrypt-Hash übertragen und **nirgends gespeichert**. Für spätere Tests setzt man neue Passwörter auf demselben Weg, also mit einem lokal erzeugten bcrypt-Hash und `update auth.users set encrypted_password = …`.
- „Confirm email“ ist im Testprojekt inzwischen **ausgeschaltet** (vom Nutzer am 27.09.2026; per signUp-Test bestätigt).

## 4. create_family

| Prüfung | Ergebnis |
| --- | --- |
| User A `create_family('Testfamilie A')` → UUID | PASS |
| User B `create_family('Testfamilie B')` → andere UUID | PASS |
| Aufrufer automatisch `owner` | PASS (A und B) |
| `family_settings` automatisch, `show_daily_crown = true` | PASS |
| Aufruf ohne angemeldeten Benutzer → „Nicht angemeldet“ | PASS |
| `anon` → „permission denied for function create_family“ (SQL und REST) | PASS |
| Ungültiger Name → abgelehnt, keine Teil-Anlage (atomar) | PASS |
| Zweite Familie für denselben Nutzer möglich, keine DB-Beschränkung | PASS |

## 5. RLS-Matrix

**Teil 1: SQL-Test** mit echten Supabase-Rollen `authenticated` und `anon` und echter `auth.uid()`. Das Skript liegt in `supabase/tests/rls_matrix_test.sql` und hat **39/39 PASS** ergeben, zweimal ausgeführt. Der zweite Lauf lief mit Wegwerf-Konten und hat danach vollständig aufgeräumt.

| Operation | User A eigene Familie | User A fremde Familie | User B eigene Familie | anon |
| --- | --- | --- | --- | --- |
| Familie lesen | PASS | PASS (0 Zeilen) | PASS | PASS (verweigert) |
| Profile anlegen/lesen | PASS | PASS (0 Zeilen / RLS-Fehler) | PASS | PASS (verweigert) |
| Kategorien verwalten | PASS | PASS (FK/RLS) | PASS | PASS (verweigert) |
| Aufgaben verwalten | PASS | PASS (UPDATE 0 Zeilen) | PASS | PASS (verweigert) |
| Belohnungen verwalten | PASS | PASS (UPDATE 0 Zeilen) | PASS | PASS (verweigert) |
| Completions verwalten | PASS | PASS (DELETE 0 Zeilen) | PASS | PASS (verweigert) |
| Einlösungen anlegen | PASS | – | – | PASS (verweigert) |
| Settings lesen/ändern (`show_daily_crown`) | PASS | PASS (0 Zeilen) | PASS | PASS (verweigert) |
| Mitglieder der Familie lesen | PASS | PASS (0 Zeilen) | PASS | PASS (verweigert) |
| Selbst in fremde Familie einschreiben | – | PASS (RLS-Fehler) | – | PASS (verweigert) |
| Verknüpfung über Familiengrenzen | – | PASS (FK-Fehler) | – | – |
| owner tritt selbst aus | PASS (nicht möglich) | – | – | – |
| owner löscht eigene Familie | PASS | – | – | – |

**Teil 2: Test über die öffentliche Schnittstelle** (supabase-js, Publishable Key, echte Anmeldung). Das Skript liegt in `tests/supabase/auth-rls-realtime.test.mjs` und hat **16/16 PASS** ergeben, zweimal ausgeführt.

- Anmeldung A und B erfolgreich, ein falsches Passwort wird abgelehnt.
- REST: A und B sehen jeweils genau ihre Familie. Profile und Settings der jeweils anderen Familie liefern 0 Zeilen, Fremdschreiben und Selbst-Einschreiben werden abgelehnt.
- `anon` kann weder lesen noch `create_family` aufrufen.

## 6. Realtime

| Prüfung | Ergebnis |
| --- | --- |
| A abonniert `postgres_changes` auf `profiles`, `tasks`, `completions`, `rewards`, `family_settings` | PASS (`SUBSCRIBED`) |
| A empfängt Änderungen der eigenen Familie | PASS (5 Ereignisse, alle 5 Tabellen) |
| A empfängt Änderungen von Familie B | PASS (**0** Ereignisse) |

Auffälligkeiten: keine. Hinweis: In Node 22 wird `NODE_USE_ENV_PROXY=1` benötigt, damit `fetch` in der Cloud-Umgebung den Proxy nutzt. Die Domain des Testprojekts ist aus der Cloud-Umgebung erreichbar.

## 7. family-main-Backup – offen

- Das Produktionsprojekt `Familienapp` ist **pausiert** (Free-Tarif, pausiert nach Inaktivität).
- Eine lesende Abfrage bricht deshalb mit „connection timeout“ ab.
- Die Reaktivierung per Connector (`restore_project`) hat die Sicherheitsprüfung der Claude-Code-Umgebung blockiert. Sie wurde nicht umgangen.
- **Folge:** Solange das Projekt pausiert ist, kann auch die produktive Web-App keine Daten laden. Seit Phase 2 zeigt sie dann den Fehlerbildschirm und überschreibt nichts.
- **Nächster Schritt (Nutzer):** Im Supabase-Dashboard das Projekt `Familienapp` öffnen und **„Restore project“** klicken. Das dauert einige Minuten. Danach kann Claude Code das Backup nur lesend erstellen, oder du exportierst es selbst nach `PHASE_03A_MANUAL_SETUP.md`, Abschnitt F.

## 8. Wiederholung der Tests

- **SQL-Matrix:** Den Inhalt von `supabase/tests/rls_matrix_test.sql` im SQL-Editor des **Testprojekts** ausführen oder per `execute_sql`. Das Skript legt Wegwerf-Konten an, räumt selbst auf und gibt PASS/FAIL aus.
- **Auth, REST und Realtime:**
  ```
  SUPABASE_TEST_PROJECT_NAME=wochen-champion-test \
  SUPABASE_TEST_URL=https://otejitifgcrrwmudrnhs.supabase.co \
  SUPABASE_TEST_PUBLISHABLE_KEY=<publishable key des Testprojekts> \
  SUPABASE_TEST_USER_A_PASSWORD=<…> SUPABASE_TEST_USER_B_PASSWORD=<…> \
  NODE_USE_ENV_PROXY=1 node tests/supabase/auth-rls-realtime.test.mjs
  ```
  Ohne diese Variablen bricht das Skript ab.

## 9. Voraussetzungen für Phase 4

- [x] Testprojekt mit Migration, RLS, Realtime und `create_family`, **validiert**
- [ ] Produktionsprojekt reaktivieren und das Backup von `family-main` erstellen
- [ ] „Confirm email“ im Testprojekt ausschalten, nötig für die Registrierung über die App im Test
- [ ] Optional: in der Claude-Code-Umgebung `SUPABASE_TEST_URL` und `SUPABASE_TEST_PUBLISHABLE_KEY` hinterlegen, damit neue Sitzungen ohne Connector testen können
