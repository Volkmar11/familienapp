# Phase 6A – Production & iOS Readiness Audit

Stand: 28.09.2026, Branch `feature/appstore-v1`.

- Reine Audit-, Bereinigungs- und Vorbereitungsphase.
- Produktion (`gkkzjmszcjivtaygbmfw`) ist **nur lesend** geprüft und unverändert.
- Vercel Production bleibt LEGACY; `main` und `family-main` sind unverändert.

---

## 1. Gesamtarchitektur (Inventar)

### Frontend

- **Stack:** React 18 und Vite 6, ein Code-Stand für zwei Builds, gesteuert über `VITE_BACKEND_MODE`:
  - **LEGACY** (Standard): `src/App.jsx` mit `src/legacy/legacyDefaults.js`, Daten als JSON-Dokument in `public.app_state` (`family-main`). Die produktive Web-App `https://familienapp.vercel.app` läuft so.
  - **FAMILY:** `src/family/*` (FamilyApp, AuthScreen, Onboarding, FamilyChampion, AccountSecurity, InviteScreen, FamilyAdultsPanel) plus `src/lib/*` (Auth, Daten, Mutationen, Medien, Realtime, Einladungen, Lifecycle).
  - **Gemeinsame UI:** `src/shared/ChampionApp.jsx` (Wochen-Champion-Oberfläche); beide Wrapper reichen Daten und Aktionen hinein.
- **Trennung:** FAMILY importiert keine Legacy-Defaults. Das prüft ein Unit-Test über den Import-Graphen, zusätzlich prüft `scripts/check-release-readiness.mjs` das Bundle.

### Backend (Supabase, Testprojekt `wochen-champion-test`)

- **Auth:** E-Mail und Passwort. „Confirm Email“ ist im Testprojekt AUS. Passwort-Reset und Redirects laufen zentral über `src/lib/authRedirects.js`.
- **Tabellen `public`:**
  - `families`, `family_members`, `family_settings`, `profiles`
  - `categories`, `category_assignments`, `tasks`, `task_assignments`, `rewards`, `reward_assignments`
  - `completions`, `redemptions`, `champion_history`
  - `family_sync`, `user_membership_sync`
- **Tabellen `private`** (nicht über die API erreichbar): `family_security` (PIN-Hash und Sperre), `onboarding_requests`, `family_invitations`, `invitation_attempts`.
- **Storage:** privater Bucket `family-media`, Pfad `families/<fid>/(profiles|tasks)/<id>/<uuid>.jpg`, signierte URLs mit 60 min Gültigkeit.
- **RLS:** aktiv auf allen 19 Tabellen. Lesen dürfen Mitglieder; schreiben dürfen owner und parent. Alle Kinder sind Profile ohne eigenes Konto.
- **RPCs:** 28 in `public` (Details in Abschnitt 9), 21 Hilfsfunktionen in `private`.
- **Edge Functions:** `delete-account` und `delete-family` mit gemeinsamem Code in `_shared/lifecycle.ts`.
- **Realtime:** Publikation `supabase_realtime` mit 10 Tabellen, darunter `family_sync` (Reload-Signal je Familie) und `user_membership_sync` (Signal je Nutzer).
- **Trigger (28):** `updated_at`, Sync-Zähler, Stempel für Bestätigung und Quittierung, Schutz für Profile und Kategorien, Medienreferenz-Prüfung.

### Deployment

- **Vercel-Projekt `familienapp`:**
  - Production (`main`) läuft als LEGACY.
  - Preview-Deployments je Branch. Für `feature/appstore-v1` meldet GitHub den Status „Vercel: success“ für `a34e0a8`.
  - Die Previews sind durch Vercel Deployment Protection geschützt: ohne Vercel-Login Weiterleitung per 302 auf vercel.com.
- **Supabase Test:** `otejitifgcrrwmudrnhs`, mit allen Migrationen und beiden Edge Functions.
- **Supabase Produktion:** `gkkzjmszcjivtaygbmfw`. Lesend festgestellt:
  - nur `public.app_state`, mit 3 Policies für die Rolle `public` (SELECT, INSERT, UPDATE)
  - die Supabase-Funktion `rls_auto_enable`
  - 0 Auth-Nutzer, 0 Buckets, 0 Objekte
  - Realtime nur auf `app_state`
  - kein `supabase_migrations`-Schema
  - `pgcrypto` ist vorhanden

---

## 2. Migrationsinventar

| # | Datei | Zweck | Testprojekt angewendet | Test-Guard | direkt produktionsgeeignet | nötige Anpassung vor Produktion |
|---|---|---|---|---|---|---|
| 1 | `20260927120000_family_architecture.sql` | Kernschema, RLS-Hilfen, `create_family` | JA (als `family_architecture`) | JA | NEIN | Guard (siehe Abschnitt 3) |
| 2 | `20260927200000_family_onboarding.sql` | Onboarding-RPC, PIN-Hash (`private.family_security`) | JA | JA | NEIN | Guard |
| 3 | `20260928100000_core_mutations.sql` | `redeem_reward`, Bestätigen, PIN-Sperre | JA | JA | NEIN | Guard |
| 4 | `20260928200000_family_admin_crud.sql` | Elternverwaltung, Zuordnungen, Sortierung | JA, als **zwei** Einträge: `family_admin_crud` + `family_admin_crud_assignment_safety` | JA | NEIN | Guard. Die Repo-Datei enthält beide Schritte, nachgewiesen durch identischen Schema-Fingerabdruck. |
| 5 | `20260928300000_champion_realtime.sql` | Wochen-Champion serverseitig, `family_sync`, Publikation | JA | JA | NEIN | Guard |
| 6 | `20260929100000_family_media_storage.sql` | Bucket `family-media`, Storage-Policies, Pfadspalten | JA | JA | NEIN | Guard |
| 7 | `20260929200000_account_lifecycle.sql` | Service-RPCs für Account- und Familienlöschung | JA | JA | NEIN | Guard; Edge Functions separat deployen |
| 8 | `20260929300000_family_invitations.sql` | Einladungen, Rollen, Verlassen, `user_membership_sync` | JA | JA | NEIN | Guard |
| 9 | `20260930100000_release_hardening.sql` (**neu, 6A**) | `families_delete` entfernt, DELETE-Recht entzogen | JA (6A) | JA | NEIN | Guard |

**Nicht in `supabase/migrations/`, bewusst:**

- `supabase/test-support/legacy_import_redemptions.sql` (5A): nur im Testprojekt, mit Test-Guard.
- `public.test_add_family_member` (5C) ist per Migration 8 entfernt; die Datei ist gelöscht.

---

## 3. Test-Guard-Analyse und Produktionsstrategie

**Stand:**

- Alle 9 Migrationen beginnen mit:
  ```
  do $$ … if coalesce(current_setting('app.migration_target', true), '') <> 'test' then raise exception … end $$;
  ```
- Im Testprojekt wurden sie über MCP `apply_migration` angewendet:
  - mit vorangestelltem `set app.migration_target = 'test';`
  - ohne die `begin;`/`commit;`-Zeilen (MCP arbeitet transaktional)
- Lokal über `PGOPTIONS='-c app.migration_target=test'`.

**Warum ein blindes Anwenden auf Produktion unzulässig ist:**

1. Der Guard verlangt ausdrücklich `test`. Ihn in Produktion auf `test` zu setzen, würde die Schutzabsicht umgehen und die Absicht („das ist Produktion“) verschleiern.
2. Die Produktion enthält bereits das produktive `app_state` samt Realtime und offenen anon-Policies. Jede Migration muss beweisbar `app_state` unberührt lassen.
3. Die Historie des Testprojekts weicht in der Aufteilung von den Repo-Dateien ab (Migration 4 wurde dort als zwei Einträge angewendet); dazu kommen Test-Hilfen per `execute_sql`. Das Testprojekt taugt deshalb nicht als Vorlage (z. B. für einen Schema-Dump).
4. Die Produktion hat noch kein `supabase_migrations`-Schema. Ein erster CLI-Lauf würde die gesamte Historie neu anlegen.

**Varianten:**

| Variante | Bewertung |
|---|---|
| A) Separates, geprüftes Produktions-Bootstrap-Skript, erzeugt aus den unveränderten Repo-Migrationen | **Empfohlen** |
| B) Frische konsolidierte Migration aus dem finalen Schema (Dump) | Verwirft die nachvollziehbare Historie. Dumps enthalten Supabase-verwaltete Objekte und Grants in anderer Form; das Review ist schwer. Nicht empfohlen. |
| C) Guards nachträglich parametrisieren (`test`\|`production`) | Ändert historische, bereits angewendete Dateien; der Hash bzw. die Reproduzierbarkeit der Historie geht verloren. Nicht empfohlen. |

**Empfehlung A, konkret (Phase 6B):**

1. **Generator** `scripts/build-production-bootstrap.mjs` (noch nicht gebaut):
   - liest die Migrationen 1–9 in fester Reihenfolge
   - entfernt **ausschließlich** den exakt bekannten Guard-Block und die `begin;`/`commit;`-Zeilen
   - verlangt, dass der Guard-Block byte-genau dem erwarteten Muster entspricht; sonst Abbruch
2. Das Ergebnis wird **eine** Transaktion mit einem neuen Produktions-Guard. Er prüft:
   - `app.migration_target = 'production'`
   - dass der Datenbankname bzw. Projekt-Ref erwartet ist (Parameter)
   - dass `public.families` **nicht** existiert (nur Erstanlage)
   - dass `public.app_state` existiert
   - Fingerabdruck von `app_state` (Spalten, Policies, Realtime) vorher gleich nachher
3. Die Ausgabe `supabase/production/bootstrap_<datum>.sql` wird mit SHA-256 committet und reviewt.
4. **Probelauf:**
   - Bootstrap auf eine frische lokale Supabase-kompatible Datenbank anwenden; `supabase/tests/schema_fingerprint.sql` muss dort byte-gleich sein zur Datenbank, die aus den Einzelmigrationen entsteht.
   - Zusätzlich auf einen Supabase-Branch bzw. ein Wegwerf-Projekt mit einer `app_state`-Kopie ohne echte Daten anwenden.
5. Erst danach ausführen, einmalig in Produktion, mit ausdrücklicher Freigabe (Runbook, STOP 4).

---

## 4. Fresh Database Rehearsal

- **Ziel:** eine lokale PostgreSQL-16-Datenbank `wc6a`, frisch angelegt.
  - Ausschließlich Supabase-Grundstruktur-Stubs (`auth.users` mit den üblichen Spalten, `auth.uid()`, Schema `extensions` mit `pgcrypto`, `storage.buckets/objects`, `storage.foldername`, Rollen `anon`/`authenticated`/`service_role`, Publikation `supabase_realtime`).
  - Keine Verbindung zum Testprojekt oder zur Produktion.
- **Ergebnis:** Alle 9 Repo-Migrationen laufen der Reihe nach fehlerfrei durch. Alle SQL-Prüfdateien sind grün:

| Prüfung | Ergebnis |
|---|---|
| `rls_matrix_test.sql` | 40/40 |
| `admin_crud_check.sql` (an die 6A-Härtung angepasst) | 13/13 |
| `onboarding_security_check.sql` | 8/8 |
| `media_storage_check.sql` | 32/32 |
| `account_lifecycle_check.sql` | 22/22 |
| `family_invitations_check.sql` | 31/31 |
| `release_hardening_check.sql` (neu) | 10/10 |

- **Guard-Gegenprobe:** Auf einer frischen Datenbank **ohne** `app.migration_target` bricht Migration 1 mit „Abbruch: Entwurf nur für ein Testprojekt…“ ab; es wurden 0 Tabellen angelegt.
- **Fazit:** Das Schema ist allein aus dem Repository reproduzierbar.
- **Einschränkung:** Die lokale Datenbank ist ein Stub. Supabase-spezifisches Verhalten (Auth-Server, Storage-API, Realtime-Server) prüfen nur die Integrationstests gegen das Testprojekt.

## 5. Schema-Drift

- **Werkzeug:** `supabase/tests/schema_fingerprint.sql`, nur lesend. Es erfasst je Objekt einen md5-Fingerabdruck für:
  - Spalten, Constraints, Indizes, RLS-Status, Policies (inklusive Storage)
  - Funktionen (Quelltext, `SECURITY DEFINER`, `search_path`, Rückgabetyp), Trigger
  - Tabellen-Grants für anon und authenticated; EXECUTE-Rechte für anon, authenticated und service_role
  - Realtime-Publikation, Bucket-Konfiguration

**Vergleich A (Testprojekt) mit B (frisch aus den Migrationen)**, Stand vor der 6A-Härtung:

| Kategorie | Anzahl | Gleich? |
|---|---|---|
| column | 130 | identisch |
| constraint | 92 | identisch |
| index | 46 | identisch |
| rls | 19 | identisch |
| policy | 51 | identisch |
| trigger | 28 | identisch |
| table_grant | 15 | identisch |
| publication | 10 | identisch |
| bucket | 1 | identisch |
| function / function_grant | 50 gegen 49 | **1 Abweichung** |

- **Einzige Drift:** `public.legacy_import_redemptions(uuid, jsonb)` existiert nur im Testprojekt (5A-Testhilfe, `SECURITY DEFINER`, für `authenticated` ausführbar). Sie ist gewollt testprojektbezogen; siehe Abschnitte 6 und 7.
- Die 6A-Härtung ist lokal und im Testprojekt identisch angewendet und in beiden per `release_hardening_check.sql` verifiziert (10/10).
- **C (erwartetes Produktions-Zielschema)** = B plus Migration 9, **ohne** `legacy_import_redemptions`; `app_state` bleibt unverändert daneben.

## 6. Test- und Backdoor-Audit

| Fund | Ort | Klasse | Maßnahme |
|---|---|---|---|
| `test_add_family_member` | nirgends mehr (DB: per Migration 8 entfernt, verifiziert) | – | erledigt (5D) |
| `legacy_import_redemptions` | nur Testprojekt, `supabase/test-support/` | B | nie in Produktion übernehmen; Strategie in Abschnitt 7 |
| Direktes DELETE auf `families` (Policy `families_delete`) | Migration 1 | C | **behoben** in Migration 9 (Test: lokal und Testprojekt) |
| Direktes DELETE, INSERT, UPDATE auf `family_members` | – | – | seit 5D nur über RPCs (getestet) |
| `create_family(p_name)` (Phase-2-RPC ohne PIN) | Migration 1 | B/niedrig | nur für den RLS-Matrixtest genutzt; die App nutzt `create_family_with_onboarding`. Eine so angelegte Familie hat keine PIN; der Elternbereich lässt sich damit nicht entsperren. Empfehlung 6B: `revoke execute` für `authenticated` im Produktions-Bootstrap erwägen und dann den Test anpassen. |
| Integrationstests (`tests/supabase/*`), Browser-Skripte, SQL-Prüfungen | Repo bzw. lokal | A | nicht im Produktions-Bundle (Bundle-Check) |
| Hartcodierte Testkonten, Projekt-Refs, Debug-Pfade, Mock-Backdoors in `src/` | – | – | keine gefunden |
| `service_role` | nur Edge Functions (Laufzeit-Secret) | – | Client-Bundle frei; `backend.js` lehnt solche Keys aktiv ab |
| Test-PINs in Tests (`4827` usw.) | `tests/` | A | synthetisch, nicht die Familien-PIN (PII-Scan gegen das Backup: 0 Treffer) |
| `scripts/migrate-legacy-family.mjs` | Repo | A | hart gegen Produktion gesperrt (Ref-Prüfung); löscht die alte Testfamilie jetzt über `delete-family` |

## 7. Entscheidung `legacy_import_redemptions` (Produktion)

**Empfehlung: Variante A, zeitlich und auf eine Familie begrenzte Importfunktion, im selben Wartungsfenster angelegt und wieder entfernt.**

**Warum nicht B (administrativer SQL-Import):**

- Die Einlösungen enthalten Belohnungstitel und Kind-Zuordnungen. Ein SQL-Import würde diese personenbezogenen Daten in den SQL-Editor, MCP-Logs oder den Verlauf bringen.
- A transportiert die Daten wie alle anderen Tabellen über die authentifizierte API aus dem lokalen Backup-Skript. Es gibt keine Kopie in Logs.

**Ablauf von A:**

1. **Anlegen:** separates, reviewtes SQL `supabase/production/legacy_import_redemptions_temp.sql`. Gegenüber 5A zusätzlich:
   - fest eingetragene Ziel-`family_id` (nach dem Onboarding bekannt) statt Namensprüfung
   - Ablaufzeit: `if now() > '<Fenster-Ende>' then raise`
   - weiter nur owner, nur einmal (keine vorhandenen Einlösungen), höchstens 10 000 Zeilen
   - `grant execute` nur an `authenticated`, `revoke` von `public` und `anon`
2. **Import:** durch das Migrationsskript im Produktionsmodus.
3. **Sofort danach:** `drop function public.legacy_import_redemptions(uuid, jsonb);` und Nachweis per `schema_fingerprint.sql`: Die Funktion fehlt, der Fingerabdruck entspricht dem Zielschema C.
4. **Nachweis der Vollständigkeit:**
   - Anzahl der Einlösungen entspricht dem Backup
   - Summe `points_spent` entspricht dem Backup
   - Punktediff je Profil = 0 (vorhandenes `--verify`)
5. Das Runbook verlangt STOP 6, „Import-Funktion entfernt?“, vor dem Cutover.

## 8. RLS- und Policy-Audit

**Legende:**

- M = Mitglied (owner oder parent) der Familie
- F = fremde Familie
- „nur RPC“ = keine Policy, Zugriff ausschließlich über geprüfte Funktionen
- anon hat auf keiner Tabelle Rechte (REVOKE); getestet über `rls_matrix_test` und Integrationstests

| Tabelle | SELECT | INSERT | UPDATE | DELETE | Bemerkung |
|---|---|---|---|---|---|
| families | M | nur RPC | M (Name) | **gesperrt (6A)**, nur Edge Function `delete-family` | vorher owner-DELETE ohne Medienbereinigung |
| family_members | M | nur RPC (Onboarding, Einladung) | nur RPC | nur RPC (`remove_family_parent`, `leave_family`, Lifecycle) | seit 5D |
| family_settings | M | nur RPC | M | – | |
| profiles | M | M | M | M (Trigger schützt Profile mit Verlauf und letzte aktive) | App nutzt `remove_profile` |
| categories, category_assignments | M | M | M | M | Trigger schützt Kategorien in Nutzung |
| tasks, task_assignments, rewards, reward_assignments | M | M | M | M | |
| completions | M | M | M (Stempel-Trigger) | M | |
| redemptions | M | **nur RPC** `redeem_reward` (Punkteprüfung) | M (Quittierung, Stempel-Trigger) | M | |
| champion_history | M | M | M | M | serverseitige Wochenlogik |
| family_sync | M | – | – | – | nur Trigger |
| user_membership_sync | eigene Zeile | – | – | – | nur Trigger |
| private.* | – | – | – | – | nicht exponiert, keine Grants |
| storage.objects (family-media) | M (Pfad-Familie) | M | M | M | Pfad wird per Trigger bzw. `media_family_id` geprüft |

- **Fremde Familie (F):** kein Lesen, Schreiben wirkungslos (0 Zeilen) bzw. „Kein Zugriff“ (RPC). Getestet in `admin_crud_check` (B→A), `rls_matrix_test` und den Integrationstests.
- **Rollenmodell (bewusst, für v1 dokumentiert):** owner und parent haben dieselben Datenrechte. Nur Rollenverwaltung, Entfernen und Familie löschen sind owner-exklusiv.
- **PIN:**
  - Die Eltern-PIN ist eine **UI-Schranke**, keine Sicherheitsgrenze zwischen Erwachsenen derselben Familie.
  - Kinder haben kein Konto. Wer das Gerät eines Elternteils mit angemeldeter Sitzung bedient, kann per REST alles, was die Rolle erlaubt.
  - Das ist die akzeptierte Annahme von v1; für die Datenschutzerklärung und das Support-FAQ festhalten.
- **Niedrig:** Direktes DELETE auf `profiles` bzw. `tasks` per REST (statt `remove_profile`/`remove_task`) kann ein Bild im Bucket verwaist zurücklassen; es ist nur für Eltern der Familie sichtbar. Empfehlung nach v1: DELETE-Policies auf RPC umstellen oder periodischen Orphan-Cleanup einführen.

## 9. RPC- und SECURITY-DEFINER-Audit

- **Rahmen:** Alle Funktionen in `public`/`private` haben einen festen `search_path` (''); keine `public`-Funktion ist für anon ausführbar (`release_hardening_check`).
- **`private.*`:** über die API nicht erreichbar. Test 23 aus 5D bestätigt, dass `schema("private")` abgewiesen wird.

| RPC | Modus | Schutz | Anmerkung |
|---|---|---|---|
| `create_family_with_onboarding` | DEFINER | `auth.uid()`, Idempotenz per `request_id` | legt owner an |
| `create_family` | DEFINER | `auth.uid()` | Altlast (Abschnitt 6) |
| `redeem_reward` | DEFINER | `auth.uid()`, Rolle, Punkte serverseitig | |
| `verify_parent_pin`, `set_parent_pin`, `parent_pin_lock_seconds` | DEFINER | Rolle, Sperre nach 5 Fehlversuchen | |
| `create_family_invitation`, `revoke_family_invitation`, `list_family_invitations`, `list_family_adults` | DEFINER | Mitglied bzw. Rolle | kein `token_hash` nach außen |
| `inspect_family_invitation`, `accept_family_invitation` | DEFINER | `auth.uid()`, Token-Hash, Rate-Limit | generische Fehler |
| `promote_family_parent`, `remove_family_parent` | DEFINER | nur owner, Familiensperre | `p_user_id` wird gegen die Mitgliedschaft geprüft |
| `leave_family` | DEFINER | Mitgliedschaft des Aufrufers | letzte Person blockiert |
| `remove_task`, `remove_reward`, `remove_profile`, `delete_category`, `set_*_assignments`, `reorder_items`, `sync_weekly_champion` | INVOKER | RLS + `require_family_admin` | |
| `account_deletion_plan`, `execute_account_deletion`, `family_owner_check`, `delete_family_as_service` | DEFINER | **nur service_role** | `p_user_id` stammt in der Edge Function immer aus dem verifizierten JWT |

- **Keine** öffentlich aufrufbare Funktion nimmt eine frei wählbare `user_id` ohne Prüfung an.
- Ohne Mitgliedschafts- bzw. Rollenprüfung arbeiten nur:
  - `create_family*` (neue Familie)
  - `inspect/accept_family_invitation` (Zugang über den Token-Hash)
- **Eingaben:**
  - UUID-Typen, PIN-Format, Token-Format serverseitig kanonisiert
  - Namenslängen per CHECK
  - Import-Obergrenze 10 000 Zeilen (nur Testfunktion)

## 10. Edge-Function-Audit (`delete-account`, `delete-family`)

| Punkt | Befund |
|---|---|
| JWT | Deploy mit `verify_jwt = true` (es gibt keine `supabase/config.toml` im Repo, das Flag wird beim Deploy gesetzt), zusätzlich `admin.auth.getUser(token)` |
| Re-Auth-Frische | JWT-Claim `amr` (password) höchstens 300 s, sonst `401 reauth_required` (5C: echter Test nach 5 min) |
| Ziel-User | ausschließlich aus dem verifizierten Token; Body-`user_id` wird ignoriert (getestet) |
| delete-family | owner-Prüfung (Service-RPC), PIN-Prüfung mit dem Token des Nutzers, UUID/PIN-Validierung |
| CORS | fest: `localhost`, `127.0.0.1`, Vercel-Previews `familienapp-*-volkmar11s-projects.vercel.app`; zusätzlich Secret `WC_ALLOWED_ORIGINS` |
| Secrets | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` bzw. `SUPABASE_SECRET_KEYS` (von Supabase bereitgestellt); `WC_ALLOWED_ORIGINS` (selbst gesetzt) |
| Logs | nur Aktion und Anzahlen (`logAction`), ohne `user_id`, E-Mail oder Token |
| Storage Cleanup | alle Objekte unter `families/<fid>/` über die Storage-API vor dem DB-Löschen; Fehler → Abbruch ohne DB-Löschung |
| Fehler | generische Gründe (`unauthorized`, `forbidden`, `pin`, `invalid`, `server`), keine Stacktraces |
| Idempotenz | wiederholter Aufruf → 401 (Konto weg) bzw. „nicht gefunden“, ohne Schaden (getestet) |

**Produktionskonfiguration (Liste für 6B):**

1. Beide Functions mit `verify_jwt = true` deployen, Code identisch zum Repo (Hash notieren).
2. `WC_ALLOWED_ORIGINS` = Produktions-Web-Origin (z. B. `https://familienapp.vercel.app`), später zusätzlich `capacitor://localhost`.
3. **Empfehlung:** Die fest eingebauten `localhost`- und Preview-Muster in Produktion abschalten, z. B. per Secret `WC_ALLOW_DEV_ORIGINS=0`. Das ist eine kleine Code-Änderung in 6B. Kein Sicherheitsloch (JWT ist Pflicht), aber saubere Trennung.
4. Nach dem Deploy: `OPTIONS`-Probe mit fremder Origin → keine `Allow-Origin`; Aufruf ohne Token → 401.

## 11. Auth-Produktionskonzept (Soll, nichts geändert)

| Einstellung | Soll Produktion | Test heute |
|---|---|---|
| Confirm Email | **AN** | AUS |
| Mindestpasswortlänge | **8** (Supabase „Minimum password length“), App-Konstante `MIN_PASSWORD_LENGTH` in 6B von 6 auf 8 anheben | 6 |
| Password requirements | optional „letters and digits“ | – |
| Leaked Password Protection (HaveIBeenPwned) | **AN** | AUS (Advisor-Warnung) |
| Site URL | `https://familienapp.vercel.app/` (bzw. spätere eigene Domain) | Test-/Preview-URL |
| Redirect URLs | `https://familienapp.vercel.app/**`, später `https://<eigene-domain>/**` und der iOS-Link (siehe unten) | localhost, Previews |
| Passwort-Reset | `getAuthRedirectUrl("recovery")` → `VITE_AUTH_REDIRECT_URL` in Produktion | Herkunft |
| Registrierung aus Einladung | `emailRedirectTo` = `VITE_INVITE_BASE_URL/?invite=<token>`, also ist dieselbe Domain in Redirect URLs nötig | Herkunft |
| iOS | Universal Link `https://<domain>/…` (bevorzugt, siehe Abschnitt 22); `VITE_NATIVE_AUTH_REDIRECT_URL` erst in Phase 7B | nicht gesetzt |
| E-Mail-Rate-Limits | nach SMTP-Einrichtung angemessen erhöhen (z. B. 30/h) | Standard |
| JWT Expiry | Standard (3600 s); Refresh-Token-Rotation AN (Standard) | Standard |

Der Code ist dafür vorbereitet: zentrale Redirect-Helfer, keine verstreuten Herkunfts-Aufrufe (per Unit-Test geprüft).

## 12. SMTP-Konzept

- **Aktueller Zustand:** Beide Projekte nutzen den eingebauten Supabase-Mailer. Er ist nur für Tests gedacht: sehr niedrige Rate-Limits, Versand eingeschränkt, kein eigener Absender.
- **Benötigt für Produktion:** eigener SMTP für
  - (1) E-Mail-Bestätigung
  - (2) Passwort-Reset
  - (optional) E-Mail-Änderung
  - Einladungen versenden in v1 **keine** Mails (Link bzw. Code teilen).

| Feld | Wert / Anforderung |
|---|---|
| SMTP Host | vom Anbieter (z. B. `smtp.<anbieter>.…`) – **vom Nutzer** |
| Port | 587 (STARTTLS) bevorzugt, 465 (TLS) möglich |
| Username | vom Anbieter (oft API-Key-Name) |
| Password | **Secret**, nur im Supabase-Dashboard (Auth → SMTP), nie im Repo |
| From-Adresse | z. B. `no-reply@<eigene-domain>`; eine Adresse einer fremden Domain (z. B. vercel.app) ist nicht authentisierbar → **eigene Domain nötig** |
| From-Name | „Wochen Champion“ |
| SPF | TXT-Record der Absenderdomain inklusive Anbieter-Include |
| DKIM | vom Anbieter generierte CNAME/TXT-Records |
| DMARC | `_dmarc` TXT, zunächst `p=none` mit Report-Adresse, später `quarantine` |

**Mögliche Anbieter** (Beispiele, keine Buchung; Preise und Datenschutz vorher prüfen):

- **Brevo** (EU-Anbieter, Server in der EU)
- **Postmark** (sehr gute Zustellbarkeit transaktionaler Mails, US-Anbieter mit AVV/DPA)
- **Resend** (einfache Einrichtung, Supabase-Integration; US-Anbieter, EU-Region wählbar)

Für eine deutsche Familien-App mit Datenschutzfokus ist ein EU-Anbieter naheliegend. Die Entscheidung trifft der Nutzer.

## 13. Auth-Mail-Templates

Siehe `docs/appstore/AUTH_MAIL_TEMPLATES.md`: deutsche Texte für „E-Mail-Adresse bestätigen“ und „Passwort zurücksetzen“, mit `{{ .ConfirmationURL }}`.

## 14. Vercel-Inventar

Das Repo hat kein `vercel.json`: Standard-Build Vite, Ausgabe `dist`.

| Variable | Preview (feature/appstore-v1) | Production (später FAMILY) | sensitiv |
|---|---|---|---|
| `VITE_BACKEND_MODE` | `family` | heute leer bzw. `legacy`, nach Cutover `family` | nein |
| `VITE_FAMILY_SUPABASE_URL` | Testprojekt-URL | Produktions-URL | nein (öffentlich im Bundle) |
| `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY` | Test-Publishable-Key | Prod-Publishable-Key | nein (öffentlich), trotzdem nicht ins Repo |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | – | heute LEGACY-Werte; **beim Cutover aus Production entfernen**, sonst blockiert der Guard in `backend.js` (gleiches Projekt) | nein |
| `VITE_AUTH_REDIRECT_URL` | leer (Herkunft) | `https://<prod-domain>/` | nein |
| `VITE_INVITE_BASE_URL` | leer (Herkunft) | `https://<prod-domain>` | nein |
| `VITE_NATIVE_AUTH_REDIRECT_URL` | leer | leer bis Phase 7B | nein |
| `VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`, `VITE_SUPPORT_URL` | optional | **Pflicht** | nein |

- Keine Variable darf einen `service_role`- oder Secret-Key enthalten. `backend.js` und der Release-Check prüfen das.
- **Nicht verifizierbar aus dieser Sitzung:** die tatsächlich im Vercel-Dashboard gesetzten Werte (kein Vercel-Zugriff). Im Handoff steht deshalb eine Prüfliste für den Nutzer.
- **Rollback-Hinweis:** Vite backt die Werte beim Build ein. Ein Instant Rollback auf das letzte LEGACY-Deployment funktioniert deshalb unabhängig von späteren Env-Änderungen.

## 15. Web-Domain

- `https://familienapp.vercel.app` **kann vorerst** offizielle Web- und Redirect-Domain bleiben (HTTPS, stabil, schon in Gebrauch).
- **Empfehlung vor dem App-Store-Release:** eigene Domain, weil
  1. SMTP eine authentisierbare Absenderdomain braucht (SPF, DKIM, DMARC; siehe Abschnitt 12),
  2. Universal Links eine Domain brauchen, auf der `/.well-known/apple-app-site-association` kontrolliert ausgeliefert wird (auf `vercel.app` technisch möglich, aber an das Vercel-Projekt gebunden),
  3. Datenschutz-, Impressum- und Support-URLs in App Store Connect dauerhaft stabil sein sollen.
- Keine Domain gekauft, kein DNS verändert.

## 16. Vercel Preview und Live-Test

- Das Preview-Deployment für `a34e0a8` (GitHub-Status „Vercel: success“) existiert. Nach dem Push dieser Phase baut Vercel automatisch ein neues Preview (nur Preview, nicht Production).
- Die Branch-URL `https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app` ist durch Vercel Deployment Protection geschützt (302 auf vercel.com). Aus der Sandbox war deshalb **kein** echter Preview-Test möglich; FAMILY-Modus und Testprojekt-Variablen der Preview sind **nicht** verifiziert.
- **Realtime im echten Browser:** nicht aus der Sandbox testbar, weil der Proxy WebSockets für Chromium blockiert. Das Realtime-Signal ist in Node mit echten WebSockets getestet.
- **Manuelle Checkliste für das iPhone:** siehe Handoff, Abschnitt 8.

## 17. Datenschutz, Impressum, Support

- **Umgesetzt (6A):**
  - `src/config/legal.js`: `VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`, `VITE_SUPPORT_URL`; nur `https:`, Support auch `mailto:`.
  - Komponente `LegalLinks`, sichtbar **ohne Login** auf dem Anmeldebildschirm und in „Konto & Sicherheit“.
  - Ohne Konfiguration zeigt die App keine Links (kein Link ins Leere). Im Profil `production` meldet der Release-Check fehlende Werte als FAIL.
  - Browser-Test bei 393×852 und 320×568: 9/9.
- **Nicht erstellt:** Rechtstexte selbst. Es gibt keine erfundenen Anbieter- oder Personendaten; die Struktur der Inhalte steht in `APP_PRIVACY_DATA_MAP.md`.
- **Hosting der Seiten:** empfohlen als statische Seiten auf der eigenen Domain oder einer öffentlichen Route. Sie müssen vor dem Login erreichbar sein.

## 18. Datenschutz-Dateninventar

Siehe `docs/appstore/APP_PRIVACY_DATA_MAP.md`.

## 19. App Store: Support und Account-Löschung

- **Benötigt:** Support-URL, Privacy-Policy-URL, Marketing-URL (optional).
- **Account-Löschung in der App vorhanden:** Konto & Sicherheit → „Account dauerhaft löschen“ (Passwort plus Bestätigungswort; löscht Konto, verlässt geteilte Familien bzw. überträgt Ownership, löscht eigene Familien samt Bildern).
- **Review-Hinweis:** Anmelden → Verwalten (Eltern-PIN) → „Konto & Sicherheit“ → „Account dauerhaft löschen“. Ohne Familie: auf dem Willkommensbildschirm „Konto & Sicherheit“.
- Für das Review ein Demo-Konto mit Demo-Familie und Demo-PIN vorbereiten (Phase 9).

## 20. Capacitor- und WebView-Audit (ohne Capacitor)

| Thema | Befund | Maßnahme |
|---|---|---|
| Safe Area | `viewport-fit=cover`, `env(safe-area-inset-*)` in Shell, StepLayout, ChampionApp und dem Offline-Hinweis | ok; auf dem Gerät prüfen (Notch, Home-Indikator) |
| 100vh | `minHeight: 100vh` in Shell und ChampionApp | in WKWebView (Vollbild) unkritisch; optional später `100dvh` |
| fixed/sticky | Bottom-Nav, Dialoge, Offline-Hinweis | Geräte-Test mit Tastatur |
| Tastatur | Standard-Inputs mit `inputMode`/`autoComplete` | Capacitor `Keyboard`-Resize-Modus in 7A festlegen (`resize: body`) |
| Datei-Input / Bilder | `<input type="file" accept="image/*">`, clientseitiges Verkleinern, EXIF/GPS entfernt | in WKWebView verfügbar (Fotomediathek, Kamera, Dateien); Info.plist braucht `NSCameraUsageDescription` und `NSPhotoLibraryUsageDescription`, sonst Absturz |
| `navigator.share` | Einladung teilen, mit Fallback | in WKWebView verfügbar (iOS 12.2+); sonst Zwischenablage |
| Zwischenablage | `navigator.clipboard.writeText` mit Fallback-Meldung; Link und Code per `user-select: all` markierbar | in WKWebView nach Nutzergeste meist ok; optional `@capacitor/clipboard` |
| `window.confirm` | Löschen und Zurücknehmen in der gemeinsamen UI | Capacitor bildet `confirm()` nativ ab; optional später eigene Dialoge |
| Realtime (WebSocket) | supabase-js mit nativem WebSocket | ok in WKWebView |
| Lebenszyklus | `visibilitychange`/`focus`/`online` → Reload, Reconnect, PIN-Timeout | in 7A zusätzlich Capacitor `App.appStateChange` anbinden (zuverlässiger beim Aufwachen) |
| Auth-Redirects | `detectAuthEnvironment()` erkennt native; ohne `VITE_NATIVE_AUTH_REDIRECT_URL` kein Redirect | Universal-Link-Flow (Abschnitt 22) |
| Einladungslinks | ohne `VITE_INVITE_BASE_URL` in nativer App kein Link (nur Code) | Produktion: `VITE_INVITE_BASE_URL` setzen |
| Externe Links | Google Fonts (Fredoka) von `fonts.googleapis.com`; Rechtslinks `target=_blank` | **Fonts vor Produktion lokal bündeln** (Datenschutz: IP-Übertragung an Google; ohne Netz Fallback-Schrift); externe Links in 7A per `@capacitor/browser` öffnen |
| Downloads | keine Downloads; `createObjectURL` nur für Vorschauen | ok |
| Session-Speicher | supabase-js in `localStorage` (WKWebView-Datenspeicher der App) | ok; optional `@capacitor/preferences` als Storage-Adapter |
| Tippziele | Symbol-Buttons im Elternbereich 22–28 px (Apple HIG empfiehlt 44 pt) | vor App Store vergrößern (nur FAMILY-Stil, Legacy unverändert) |
| Kleine Displays | 375×667 ok; 320 px: 13 px Überlauf der Löschen-Buttons im Elternbereich | 320 px betrifft kein aktuelles iPhone; mit den Tippzielen beheben |

**Blocker vor Capacitor:** keine im Code. Vorher nötige Entscheidungen stehen in Abschnitt 21. Fonts lokal bündeln und größere Tippziele sind Vorbereitungen für Produktion bzw. App Store.

## 21. iOS-Identitätsentscheidungen (Checkliste, keine Werte festgelegt)

| Entscheidung | Status |
|---|---|
| endgültiger App-Name (App Store / Home-Bildschirm) | offen, Platzhalter „Wochen Champion“ |
| Bundle Identifier (Reverse-DNS, unveränderlich nach Upload) | offen, **nicht** festgelegt |
| Apple Developer Team (Einzelperson oder Organisation; bestimmt den Verkäufernamen im Store) | offen |
| App Icon (1024×1024, ohne Transparenz) | offen |
| Splash Screen | offen |
| Universal-Link-Domain | offen, hängt an der Domain-Entscheidung |
| Support-E-Mail / Support-URL | offen |
| Privacy-URL, Impressum-URL | offen |
| eigene Domain | Empfehlung ja (Abschnitt 15) |

## 22. Deep-Link-Architektur (Konzept für Phase 7B)

```
Mail/Link: https://<domain>/?invite=<token>   bzw.  https://<domain>/#…type=recovery (Supabase-Redirect)
  └─ iOS prüft /.well-known/apple-app-site-association (Associated Domains: applinks:<domain>)
       ├─ App installiert → öffnet App (Universal Link)
       │     └─ Capacitor App.addListener('appUrlOpen', { url })
       │          └─ URL parsen (nur https://<domain>, Whitelist)
       │               ├─ ?invite=…  → capturePendingInvite() mit synthetischer location → InviteScreen (bestehende Weblogik)
       │               └─ #access_token…&type=recovery / ?code=… → supabase.auth (setSession bzw. exchangeCodeForSession) → NewPasswordScreen
       └─ App nicht installiert → Website (FAMILY-Web) mit identischer Logik
```

**Vorbereitungen im Code (heute vorhanden):**

- `capturePendingInvite(win)` und `isRecoveryRedirect(location)` akzeptieren eine injizierbare location bzw. window.
- `detectAuthEnvironment({ isNative })` und `getAuthRedirectUrl` unterstützen `native`.

**Nötig in 7B:**

- kleiner Adapter `nativeLinks.js` (appUrlOpen → Weiterleitung an die bestehenden Funktionen)
- AASA-Datei auf der Domain
- Associated-Domains-Entitlement
- Supabase-Redirect-Allowlist
- **PKCE-Flow** für den nativen Passwort-Reset prüfen (heute implizit, Hash-Tokens); Test auf dem Gerät

## 23. Kamera und Fotos

- Version 1 kommt mit `<input type="file" accept="image/*">` in WKWebView aus: iOS bietet Kamera, Mediathek und Dateien an.
- Verkleinern, JPEG-Umwandlung und Metadaten-Entfernung passieren bereits clientseitig.
- **Pflicht:** Info.plist-Texte (Kamera, Fotomediathek).
- Ein natives Kamera-Plugin (`@capacitor/camera`) ist **optional** nach v1 (z. B. für Zuschneiden oder bessere Rechtesteuerung).

## 24. Feature-Freeze

**A) MUSS vor Produktion bzw. iOS fertig sein:**

- Produktions-Bootstrap plus Probelauf (Abschnitt 3); temporärer Einlöse-Import mit Nachweis der Entfernung (Abschnitt 7)
- Produktions-Auth: Confirm Email, Leaked Password Protection, Redirects; **SMTP mit eigener Domain**
- Datenschutzerklärung, Impressum, Support (URLs gesetzt, Release-Check `production` grün)
- Google Fonts lokal bündeln (Datenschutz)
- Edge Functions in Produktion inklusive `WC_ALLOWED_ORIGINS`
- `app_state` nach dem Cutover für anon sperren (read-only-Archiv)
- Capacitor-Projekt, Deep Links, Geräte-Test (für iOS)

**B) Sollte vor dem App Store fertig sein:**

- Tippziele 44 pt im Elternbereich
- Mindestpasswort 8
- `create_family`-RPC einschränken
- CORS-Dev-Origins in Produktion abschalten
- `App.appStateChange`-Anbindung, externe Links per In-App-Browser
- Demo-Konto für das Review
- App-Store-Datenschutzangaben

**C) Nach Version 1:**

- Premium/StoreKit (eigene Phase; siehe Roadmap)
- Datenexport (DSGVO-Auskunft zunächst per Support)
- native Kamera, Push-Benachrichtigungen, Social Login (Sign in with Apple wird erst Pflicht, wenn andere Social Logins angeboten werden)
- inkrementelle Realtime-Updates und Pagination der Historie
- Orphan-Media-Cleanup
- **Bereits fertig:** Eltern-Einladungen, Account- und Familienlöschung, Medien, Realtime, Mehrgerätebetrieb.

## 25. Performance-Kurzaudit

- **Bundle FAMILY:** `index` 147,5 kB (48 kB gzip) plus `FamilyApp` 391 kB (104 kB gzip), lazy geladen. Für eine App akzeptabel; kein Blocker.
- **Initiales Laden:** eine Abfrage mit eingebetteten Tabellen. Die Migrationsfamilie hat 361 Erledigungen, 25 Einlösungen und 17 Champion-Wochen nach 5 Monaten, rund 68 kB Erledigungsdaten.
- **Realtime:** Jede Änderung führt zu einem entprellten Voll-Reload (Single Flight). Das ist bei heutigen Mengen unkritisch; es wächst mit der Historie (rund 870 Erledigungen pro Jahr).
- **BEHOBENER RELEASE-BLOCKER – Zeilengrenze (max_rows):** Supabase kappt jede REST-Antwort, **auch eingebettete Listen**, bei `max_rows` (Standard 1000).
  - **Nachweis:** Eine synthetische Wegwerf-Familie mit 1100 Erledigungen im Testprojekt lieferte eingebettet nur 1000. `loadFamilyData` meldete „ok“, und Punkte bzw. Historie wären stillschweigend falsch gewesen. Bei rund 870 Erledigungen pro Jahr wäre die migrierte Familie nach gut einem Jahr betroffen.
  - **Fix (`src/lib/familyData.js`):**
    - Stammdaten bleiben eine eingebettete Abfrage.
    - `completions`, `redemptions` und `champion_history` werden getrennt geladen, nach `id` sortiert, seitenweise per `range`, mit `count: exact`. Das ist robust, auch wenn `max_rows` kleiner eingestellt ist; kleine Familien brauchen keine Zusatzseite.
    - Duplikate werden entfernt; Sicherheitsgrenze 200 000.
  - **Nach dem Fix:** 1100 von 1100 im Modell (die rohe eingebettete Abfrage liefert weiterhin 1000). Neue Unit-Tests: Server-Obergrenze 300/1000, fehlender count, Fehlerfall. Alle Integrations- und Browser-Suites sind grün.
  - **Kosten:** 4 statt 1 Leseanfrage pro Laden (parallel).
- **Signierte URLs:** Cache pro Familie, Batch-Anfrage, Erneuerung 10 min vor Ablauf; kein Blocker.
- **Rendering:** keine Auffälligkeiten in den Browsertests (393×852, keine JS-Fehler).

## 26. Accessibility- und Mobile-Kurzaudit

- Alle Eingabefelder sind beschriftet (label oder `aria-label`); alle Buttons haben einen zugänglichen Namen (Home und Elternbereich, 393 und 320 px).
- Kein horizontales Scrollen bei 393×852 und 375×667. Bei 320×568 laufen im Elternbereich 13 px über (kein aktuelles iPhone).
- Tippziele im Elternbereich: 41 Symbol-Buttons unter 32 px (22–28 px). Kein Release-Blocker fürs Web; für iOS vergrößern (Punkt B).
- Dialoge: `role="dialog"`, `aria-modal`, Fehlermeldungen mit `role="alert"`, Statusmeldungen mit `role="status"`.
- Kontrast: helle Schrift auf dunklem Indigo. Die gedämpften Texte (`C.muted`) sollten in 6B/7A einmal mit einem Kontrastwerkzeug geprüft werden.

## 27. Fehler- und Logging-Audit

| Stelle | Inhalt | Bewertung |
|---|---|---|
| `src/lib/familyMutations.js` | Aktion plus Fehlercode bzw. gekürzte DB-Meldung (max. 120 Zeichen) | ok: keine PINs, Tokens, E-Mails; DB-Meldungen enthalten keine Werte |
| `src/lib/familyMedia.js` | Aktion plus Status- bzw. Fehlercode | ok: kein Pfad |
| `src/main.jsx` | Konfigurationsfehler (ohne Werte) | ok |
| `src/App.jsx` (LEGACY) | Speichern/Laden fehlgeschlagen plus Fehlerobjekt | LEGACY, unverändert |
| Edge Functions | JSON mit Aktion und Anzahlen | ok |

Es gibt keine `console.log`-Ausgaben mit Daten im FAMILY-Code (Unit-Test prüft die Einladungs- und FAMILY-Dateien).

## 28. Dependencies

- **Vorher:** 7 Findings (1 low, 1 moderate, 5 high, 0 critical). Alle transitiv außer `vite`:

| Paket | Schwere | Art |
|---|---|---|
| `@babel/core` | low | dev |
| `baseline-browser-mapping` | moderate | dev |
| `browserslist` | high | dev |
| `postcss` / `nanoid` | high | dev/build |
| `vite` | high (Windows-spezifische Dev-Server-Lücken) | dev, direkt |
| `ws` | high | runtime-transitiv über `@supabase/realtime-js`; nur in Node aktiv, der Browser nutzt natives WebSocket |

- **Durchgeführt:** `npm audit fix` **ohne** `--force`; nur `package-lock.json` geändert (Patch- und Minor-Stände: vite 6.4.3, postcss 8.5.28, nanoid 3.3.19, ws 8.22.0, @babel/core 7.29.7, browserslist 4.29.2).
- **Ergebnis:** **0 Findings.** LEGACY- und FAMILY-Bundle byte-identisch zum Stand davor. Alle Tests erneut grün (Unit, Legacy-Regression, Realtime-Suites).

## 29. Secret-Scan

- **Aktueller Stand und gesamte Git-Historie** (alle Branches, `git log --all -p`) auf `sb_secret_…`, JWT-förmige Schlüssel, Postgres-URLs mit Passwort, `SUPABASE_SERVICE_ROLE_KEY=…`, Private Keys, Base64-Bilder, `sb_publishable_…`:
  - **0 Treffer.**
  - Keine token-artigen 32-Hex-Werte außer dem dokumentierten Beispielwert im Unit-Test.
- `.env` und `local-backups/` sind per `.gitignore` ausgeschlossen.
- Test-Passwörter kommen nur als Wegwerf-Literale in Unit-Tests vor („geheim“, „falsch“), ohne echte Konten.
- PII-Scan (Backup-Namen, -Texte, -PIN) über alle seit 5C geänderten Dateien: nur die vorbestehende Sperrliste in `tests/onboarding.test.mjs`.

## 30. Release-Check

- `scripts/check-release-readiness.mjs`: Profil `preview` (Standard) bzw. `--profile production`. Ohne Secrets, ohne Netzwerk.
- **Heute:**
  - `preview`: 15 PASS, 1 WARN (Rechtslinks nicht gesetzt), 0 FAIL.
  - `production`: FAIL, wie erwartet, bis Rechtslinks, Redirect-, Invite- und Produktions-URL gesetzt sind.
