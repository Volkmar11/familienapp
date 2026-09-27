# CHATGPT HANDOFF – PHASE 3B (Stand seit Handoff 3A)

Zeitraum: nach `CHATGPT_HANDOFF_PHASE_03A.md` bis jetzt · Branch `feature/appstore-v1` (auf GitHub)

## 1. Kurzfassung

- Der Nutzer hat Claude Code erlaubt, die manuellen Schritte selbst auszuführen. Dafür wurde der **Supabase-Connector (MCP)** in claude.ai verbunden.
- Das **Testprojekt `wochen-champion-test`** wurde angelegt, die Migration eingespielt und alle Backend-Tests bestanden: **RLS 39/39, Auth/REST/Realtime 16/16**.
- **Neuer kritischer Befund:** Das einzige Projekt im verbundenen Supabase-Konto („Familienapp“) ist **leer**. Es gibt dort **keine Tabelle `app_state`**. Die produktiven Daten von Wochen Champion liegen also in einem **anderen, noch unbekannten Supabase-Projekt oder -Konto**.
- Das **Backup von `family-main` fehlt deshalb weiterhin.**

## 2. Durchgeführte Arbeitsschritte (chronologisch)

1. **Connector:** Der Supabase-Connector wurde vom Nutzer verbunden. Nach dem Neuladen waren die Supabase-MCP-Werkzeuge in der Sitzung verfügbar.
2. **Bestandsaufnahme (nur lesend):**
   - Organisation „Volkmar Familienapp“ (`wpczexcrbwmiqaafmmor`), **Free-Tarif**
   - Einziges Projekt „Familienapp“ (`gkkzjmszcjivtaygbmfw`, eu-west-1, Postgres 17), Status **INACTIVE (pausiert)**
3. **Testprojekt angelegt:** `wochen-champion-test`, Referenz `otejitifgcrrwmudrnhs`, eu-central-1 (Frankfurt), Free-Tarif ohne Kosten, Status ACTIVE_HEALTHY.
4. **Reaktivierung der Produktion per Connector versucht:** Die Sicherheitsprüfung der Claude-Code-Umgebung hat das blockiert. Es wurde nicht umgangen, sondern an den Nutzer übergeben.
5. **Migration im Testprojekt:**
   - per `apply_migration` („family_architecture“), Inhalt identisch mit `supabase/migrations/20260927120000_family_architecture.sql`, mit `set app.migration_target = 'test'`, ohne eigenes `begin`/`commit`
   - Ergebnis: 13/13 Tabellen mit RLS, 47 Policies, 4 Funktionen (`create_family`, `private.is_family_member`, `private.has_family_role`, `private.set_updated_at`), Realtime auf 8 Tabellen, `show_daily_crown` NOT NULL mit Default `true`
   - `anon` hat keinen Zugriff
   - SQL-Datei im Repo unverändert, keine SQL-Fehler gefunden
6. **Supabase-Advisor:** Nur ein Hinweis, nämlich dass `create_family` als SECURITY DEFINER für authenticated aufrufbar ist. Das ist **beabsichtigt** (Bootstrapping der ersten Familie).
7. **RLS-Matrix per SQL** mit echten Rollen `authenticated`/`anon` und echter `auth.uid()`: **39/39 PASS**. Geprüft wurden:
   - Familientrennung beim Lesen und Schreiben für Familien, Mitglieder, Profile, Kategorien, Aufgaben, Belohnungen, Completions, Einlösungen und Settings
   - Selbst-Einschreiben in eine fremde Familie blockiert
   - Cross-Family-FK blockiert
   - owner kann nicht selbst austreten, owner darf die eigene Familie löschen
   - zweite Familie pro Nutzer möglich (bewusst keine DB-Beschränkung)
   - `create_family` ist atomar und lehnt nicht angemeldete Aufrufe und anon ab
   - `show_daily_crown` ist für die eigene Familie lesbar und änderbar, für die fremde nicht
8. **Testkonten:** `wc-test-a@example.com` („Testfamilie A“) und `wc-test-b@example.com` („Testfamilie B“), per SQL angelegt und bestätigt. Die Passwörter wurden lokal zufällig erzeugt, nur als bcrypt-Hash übertragen und nicht gespeichert.
9. **Netzwerk:** Die Domain des Testprojekts ist aus der Cloud-Umgebung erreichbar.
10. **Test über die öffentliche Schnittstelle** (supabase-js + Publishable Key): **16/16 PASS**
    - Login A/B, falsches Passwort abgelehnt
    - REST-Familientrennung, anon blockiert, `create_family` mit leerem Namen abgelehnt
    - **Realtime:** A empfängt eigene Änderungen in `profiles`, `tasks`, `completions`, `rewards` und `family_settings` (5/5) und **0** Ereignisse von Familie B
11. **Wiederholbare Tests ins Repo übernommen** (ohne Secrets):
    - `supabase/tests/rls_matrix_test.sql`: Testsperre, Wegwerf-Konten, räumt selbst auf. Ein zweiter Lauf ergab 39/39 und 0 Reste.
    - `tests/supabase/auth-rls-realtime.test.mjs`: liest URL, Key und Passwörter aus Umgebungsvariablen und bricht ohne sie ab. Ein zweiter Lauf ergab 16/16.
12. **Dokumentation:** `docs/appstore/PHASE_03B_TEST_BACKEND_RESULTS.md`
13. **Commit und Push:** `6d680d8` „test: validate family backend in supabase test project“. Build erfolgreich, keine Schlüssel in Dateien.
14. **Nutzer hat das Projekt „Familienapp“ reaktiviert** („Restore project“). Claude Code hat gewartet, bis die API erreichbar war.
15. **Backup-Versuch, nur lesend:** `select … from public.app_state where id = 'family-main'` ergab den Fehler **„relation public.app_state does not exist“**.
16. **Nachprüfung, nur lesend:** Im Projekt „Familienapp“ gibt es **keine eigenen Tabellen** in irgendeinem Schema, `app_state` existiert nirgends, `auth.users` hat 0 Einträge. Das Projekt wurde **nie für die Web-App genutzt**.

## 3. Aktueller Stand

| Punkt | Status |
| --- | --- |
| Datumsfix, Datenverlust-Fix, Web-Build | erledigt (Phasen 2–3) |
| Testprojekt `wochen-champion-test` mit Migration | erledigt, validiert |
| RLS / create_family / Realtime / show_daily_crown | validiert (39/39, 16/16) |
| „Confirm email“ im Testprojekt | noch **EIN**; der Connector kann das nicht ändern. Der Nutzer muss es im Dashboard ausschalten (nötig für Registrierungstests in Phase 4). |
| Produktives Supabase-Projekt der Web-App | **UNBEKANNT**, nicht im verbundenen Konto |
| Backup `family-main` | **NICHT vorhanden** |
| Produktionsdaten gelesen oder verändert | NEIN |
| Projekt „Familienapp“ (`gkkzjmszcjivtaygbmfw`) | leer, jetzt wieder aktiv; keine Änderungen durch Claude |

## 4. Offene Frage an den Nutzer (Blocker)

Unter welcher **URL** läuft die Web-App (Vercel-Domain bzw. Home-Bildschirm-Link)? Aus dem öffentlich ausgelieferten JS-Bundle lässt sich die tatsächlich verwendete **Supabase-Projekt-Referenz** (`VITE_SUPABASE_URL`) ablesen. Alternativ steht sie in Vercel unter Project → Settings → Environment Variables.

Danach gibt es zwei Möglichkeiten:

- Das Projekt liegt in einem **anderen Supabase-Konto**: Den Connector mit diesem Konto verbinden bzw. die Organisation freigeben. Oder der Nutzer exportiert `family-main` manuell (SELECT + JSON-Export, siehe `PHASE_03A_MANUAL_SETUP.md`, Abschnitt F).
- Das Projekt ist **gelöscht oder nicht mehr erreichbar**: Die Web-App hat dann keine Daten mehr. Die Migration von `family-main` entfällt, und die App startet in der neuen Architektur ohne Altdaten.

## 5. Empfehlung für die nächsten Schritte

1. Die Web-App-URL bzw. die echte Supabase-Referenz klären.
2. Das Backup von `family-main` aus dem richtigen Projekt ziehen (nur lesend) und an zwei Orten sichern.
3. „Confirm email“ im Testprojekt ausschalten.
4. Entscheiden, ob das leere Projekt „Familienapp“ künftig als Produktionsprojekt für die neue Architektur dienen soll oder gelöscht bzw. pausiert wird. Im Free-Tarif sind 2 aktive Projekte erlaubt.
5. Danach Phase 4: Auth-Frontend, Onboarding (`create_family`, Profile, Starter-Inhalte) und neue Datenschicht gegen `wochen-champion-test`.
