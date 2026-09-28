# Phase 6B1 – Production Package & Cutover Rehearsal

- **Ziel:** Alles für den Produktions-Cutover (Phase 6B2) vorbereiten und proben, ohne die Produktion zu verändern.
- **In 6B1 nicht getan:**
  - keine SQL-Änderung an `gkkzjmszcjivtaygbmfw`
  - keine Änderung an Production Auth, Storage, Edge Functions, Secrets oder Vercel
  - kein Deployment, kein Merge nach `main`, kein Cutover
- **Produktion:** nur lesend kontrolliert (Abschnitt 17).
- **Generalproben:**
  - lokal auf frischem PostgreSQL 16 mit Plattform-Stub
  - gegen das Testprojekt `wochen-champion-test` (`otejitifgcrrwmudrnhs`) mit einem **synthetischen** Backup und Wegwerfkonten `wc-…@example.com`, die danach wieder gelöscht wurden

---

## 1. Bootstrap Generator

`scripts/generate-production-bootstrap.mjs` (Version 6B1.1) erzeugt aus den **unveränderten** 10 Migrationen ein einziges Produktions-Skript.

Quellen und Prüfungen:

- `supabase/production/bootstrap-manifest.json` enthält Reihenfolge und SHA-256 jeder Migration sowie den SHA-256 des Test-Guard-Blocks (232 Bytes).
- Weicht eine Migration ab (Hash, Liste), bricht der Generator ab.
- `transformMigration` entfernt je Migration **exakt** den Test-Guard-Block und prüft dabei:
  - der Guard kommt genau einmal vor
  - genau ein `begin;` und ein `commit;`, das `begin` steht vor dem Guard
  - nach `commit` folgt nichts mehr
  - kein weiteres `migration_target` außerhalb von Kommentaren
  - keine weitere Transaktionssteuerung

Ausgabe in `local-release/` (von Git ignoriert):

| Datei | Inhalt | SHA-256 |
|---|---|---|
| `production-bootstrap.sql` | psql-Variante mit einem `begin … commit` (120 384 Bytes) | `4bd4b426aa8d098029f215a0dd02ef6afa4a4b06347403b162c4fb789ba8dbe2` |
| `production-bootstrap.mcp.sql` | identisch ohne `begin/commit` (120 367 Bytes) | `9814b72955fa42f7b77b8ada4af57662e9133228a8b74808d04cda14b731292c` |
| `production-bootstrap.meta.json` | Generator-Version, Hashes, Bytes, Quellhashes, Git-Commit/dirty, erwarteter Fingerabdruck | – |

- **Deterministisch:** Die Ausgabe hat keinen Zeitstempel im SQL. Zwei Läufe sind byte-identisch (`--check`, Unit-Test, PRE-GO).
- **Neue Migration 10** `20260930200000_create_family_hardening.sql`: entzieht `create_family(text)` allen Client-Rollen. Familien entstehen nur noch über `create_family_with_onboarding`.
  - im Testprojekt angewendet
  - SQL-Tests passen `create_family` als DB-Admin an
  - neue Prüfung „create_family als Client nicht ausführbar“
- **`families`-DELETE:** Für Clients seit Migration 9 entzogen (`revoke delete on public.families …`). Jetzt geprüft in `release_hardening_check.sql`, `rls_matrix_test.sql`, im Bootstrap-Epilog und in der Generalprobe.

## 2. Production Guard

Prolog (Abbruch vor jeder Änderung):

- `app.migration_target` muss `production` sein.
- `app.confirm_project_ref` muss exakt die Produktions-Ref sein; die Test-Ref wird ausdrücklich abgelehnt.
- `public.app_state` mit `family-main` muss existieren.
- Es darf noch kein FAMILY-Objekt existieren (`families`, `family_members`, `private.family_security`, `family_sync`).
- Der Fingerabdruck von `app_state` (Inhalt, Spalten, Policies, Realtime) wird gemerkt.

Epilog (Abbruch mit Rollback der ganzen Transaktion), wenn:

- `app_state` verändert wurde
- das Schema unvollständig ist
- `legacy_import_redemptions*` oder `test_add_family_member` existiert
- `create_family` für Clients ausführbar ist
- `DELETE` auf `families` für Clients möglich ist
- der private Bucket `family-media` fehlt
- die Realtime-Publikation unvollständig ist

## 3. Fresh DB Rehearsal

`node scripts/rehearse-production-bootstrap.mjs`: reproduzierbar, nur lokal, Wegwerf-DBs `wc_bsr_*`. Stub und Simulation sind jetzt im Repo:

- `supabase/tests/local/supabase_platform_stub.sql`
- `supabase/tests/local/production_app_state_sim.sql` (Produktions-`app_state` mit Policies und Realtime, **synthetisches** `family-main`)

Ergebnis 22/22 PASS, Nachweis in `local-release/bootstrap-rehearsal.json`:

| Teil | Prüfung | Ergebnis |
|---|---|---|
| A | 10 Migrationen im Testmodus; Fingerabdruck = `expected_schema_fingerprint.tsv` (538 Objekte) | PASS |
| B | Fehlerfälle: ohne Ziel, Testmodus, Test-Ref, falsche Ref, ohne Ref → Abbruch, 0 FAMILY-Tabellen, `app_state` unverändert | 5 × PASS |
| B | korrekter Lauf; `app_state`-Hash `50c76a16d040d4b43ee6312fa8728d87` vorher = nachher; Fingerabdruck = Erwartung | PASS |
| B | zweiter Bootstrap → „FAMILY-Schema existiert bereits“, Schema und `app_state` unverändert | PASS |
| B | keine Import-/Test-Hintertür; `create_family`/anon/`families`-DELETE: `false/false/false` | PASS |
| C | SQL-Checks gegen das Bootstrap-Ziel: account_lifecycle 22, admin_crud 13, invitations 31, media 32, onboarding 8, release_hardening 13, rls_matrix 40 – alle ohne Fehler | 7 × PASS |
| D | MCP-Variante mit `set_config(…, true)`-Präfix in einer Transaktion → erfolgreich, gleicher Fingerabdruck | 2 × PASS |

## 4. Schema Fingerprint

- `supabase/production/expected_schema_fingerprint.tsv`: 538 Objekte, SHA-256 `f3ef13e08713ce48…`. Er wurde aus den Migrationen erzeugt, ohne `app_state`.
- Neue Kategorie `function_normalized` in `supabase/tests/schema_fingerprint.sql`: Funktionsrumpf ohne Kommentare und Leerraum.

**Korrektur zu 6A:**

- 6A meldete für das Testprojekt eine einzige abweichende Funktion. Tatsächlich unterschieden sich im Rohvergleich die Kategorien `function` und `function_grant`, aus zwei Gründen:
  1. Beim Anwenden per MCP wurden Kommentare in Funktionsrümpfen entfernt.
  2. Der lokale Stub hatte keine `service_role`-Standardrechte (jetzt im Stub).
- Normalisiert sind alle 49 Funktionen identisch (Aggregat `42c7bdf4954fcf2e47154b981deff8df`).
- Fachlich bleibt es dabei: Die einzige echte Drift ist die Testhilfe `legacy_import_redemptions(uuid, jsonb)` im Testprojekt.
- Für STOP 4 gilt deshalb: psql-Weg → Rohvergleich; MCP-Weg → `function_normalized`.

## 5. Migration Production Mode

`scripts/migrate-legacy-family.mjs` verzweigt bei `--target=…` in `scripts/lib/productionMigration.mjs`. Der Testmodus ist unverändert (21/21 Legacy-Tests grün).

Ziele:

- `--target=production --confirm-production=<prod-ref>`
- `--target=rehearsal --confirm-rehearsal=<test-ref>` (gleicher Code gegen das Testprojekt, nur synthetisches Backup)

Modi (genau einer je Aufruf):

- `--dry-run`, `--reference` (beide offline)
- `--apply`, `--import-redemptions`, `--verify`, `--sync-test`, `--go-check`

Guards (alle mit Exit 2 und deutscher Meldung):

- Ref nicht exakt bestätigt
- Testprojekt als Produktionsziel
- fremder Host
- Secret- oder service_role-Key
- Backup-Herkunft passt nicht (`source_project`)
- `exported_at` fehlt oder liegt in der Zukunft
- Backup älter als 15 min (Override nur bewusst: `--allow-stale-backup-minutes=<n>`)
- unsauberer Arbeitsbaum (Produktion: dry-run, apply, import)
- owner-Konto hat bereits eine Familie
- ein Migrationsstand existiert schon (keine Wiederholung ohne Recovery)
- FAMILY-Schema fehlt
- Produktion mit `@example.com`-Konto bzw. Generalprobe ohne Wegwerfkonto

Weitere Eigenschaften:

- **Löschen oder Neuanlegen:** Beides tut das Skript nie.
- **Checkpoints A–J:** Phasen A–F, H, I, J mit Count-Validierung je Checkpoint; G (Einlösungen) läuft separat. Der Stand steht in `local-release/migration-state.json`.
- **Deterministische IDs:** UUIDs aus dem Backup-Hash (`deterministicUuid`), damit Plan und Import dieselben Zeilen meinen. Zeilen-Hash der Einlösungen im Stand.
- **Backup-Export (neu, nur lesend, nur gemockt getestet):** `scripts/export-legacy-backup.mjs --confirm-production=<ref>` (ein GET auf `family-main`, schreibt `source_project`/`exported_at`, gibt nur Hash und Anzahlen aus).

## 6. Dry-Run Gate

`--apply` verlangt `local-release/dry-run.json` mit:

- gleichem Backup-SHA-256
- gleicher Ziel-Ref
- gleichem Git-Commit
- Alter ≤ 120 min

Außerdem muss `reference.json` zum selben Backup gehören.

Geprobt:

- Dry-Run mit Backup A, Apply mit Backup B → „Dry-Run gehört zu einem anderen Backup (Hash)“
- ohne passende Referenz → „Punkte-Referenz fehlt …“

## 7. Redemption Import

`scripts/generate-redemption-import.mjs --family-id --owner-id --expires-in-minutes (≤ 180)` erzeugt `redemption-import-create.sql`, `…-drop.sql` und `.meta.json` (Hashes).

Die temporäre Funktion `public.legacy_import_redemptions_once(jsonb)`:

- `SECURITY DEFINER`, `search_path=''`
- `family_id` und owner fest als Konstanten, **kein** Familien-Parameter
- Ablaufzeit fest eingebaut
- nur `auth.uid()` = owner mit owner-Rolle
- höchstens 10 000 Zeilen; `[]` ist ein Prüfaufruf ohne Wirkung
- nur einmal nutzbar (Abbruch, wenn die Familie schon Einlösungen hat)
- historisches `redeemed_at`; Quittierung mit `acknowledged_at`
- `revoke` von public/anon; `notify pgrst`

Das Drop-SQL entfernt die Funktion und prüft den **exakten** Namen; die Testhilfe gleichen Präfixes wird davon nicht erfasst.

Lebenszyklus lokal geprobt:

- fremder Nutzer → „Kein Zugriff“
- abgelaufen → „abgelaufen“
- `[]` → 0
- Import von 2 Zeilen (Summe 50, 1 quittiert)
- zweiter Import abgelehnt
- Release-Check vor dem Drop FAIL, danach OK

Im Testprojekt geprobt: Import 6 Einlösungen (Summe 240); zweiter Import blockiert; `--verify` mit noch vorhandener Funktion → FEHLER; nach dem Drop OK. Die Funktion ist im Testprojekt entfernt (`import_fn = 0`).

## 8. Migration GO Gates

`--verify` schreibt `local-release/go-gates.json` mit folgenden Gates:

- Punkte (maxΔ je Profil und Kennzahl, Zeitreihe)
- Counts
- Einlösungen (Anzahl, Summe, Quittierungen, Zeilen-Hash)
- Medien: gelistet, referenziert, fehlend, fremd, verwaist
- Importfunktion entfernt (RPC → PGRST202)

`--sync-test` ergänzt das Champion-Gate: keine alte Woche neu, keine Duplikate, `lastChampionWeek` nicht rückwärts, zweiter Lauf no-op.

`--go-check` gibt Exit 0 nur, wenn alle Gates grün sind und Backup und Commit gleich bleiben.

Ergebnis der Generalprobe:

- Punkte maxΔ 0, Zeitreihe 0, Counts ok, Medien ok, Importfunktion entfernt
- SYNC OK (6/6 Champion-Eigenschaften)
- GO-CHECK OK (rehearsal)

## 9. Font Hardening

- Google Fonts entfernt (`<link>` in `src/shared/ChampionApp.jsx` und `src/family/ui.jsx`).
- Fredoka ist jetzt selbst gehostet:
  - `src/assets/fonts/fredoka-latin-wght-normal.woff2` (29,7 kB), `…-latin-ext-…` (4,6 kB)
  - `fonts.css` (Gewichte 300–700, `font-display: swap`, Unicode-Ranges aus `@fontsource-variable/fredoka` 5.3.0)
  - Lizenz SIL OFL 1.1 in `OFL-Fredoka.txt`
  - eingebunden in `src/main.jsx`, also für LEGACY und FAMILY
- **Netzwerkprüfung** (Playwright): LEGACY 0 und FAMILY 0 Anfragen an `fonts.googleapis.com`/`fonts.gstatic.com`; Fredoka lädt lokal (`document.fonts.check` true).
- **Bundle-Prüfung:** 0 Treffer im Release-Check (LEGACY, FAMILY, Quellcode).
- **LEGACY-Verhalten:**
  - Regressions-Snapshots reg und reg2 identisch zu 5C, Foto-Test 8/8.
  - reg3 wich im ersten Lauf nur durch einen zeitabhängigen Toast („Gelöscht“) ab, bekannt aus 5D. Zwei Wiederholungen waren identisch, ebenso das 5C-Referenzbundle erneut.
  - Die Byte-Identität des LEGACY-Bundles gegenüber 5C entfällt bewusst, weil das Bundle jetzt die Font-CSS enthält.

## 10. Password Hardening

- `MIN_PASSWORD_LENGTH = 8` zentral in `src/lib/auth.js`. Genutzt werden die Konstante und dieselbe deutsche Meldung („Das Passwort muss mindestens 8 Zeichen lang sein.“) bei:
  - Registrierung (`AuthScreen.jsx`, inklusive Hinweis „Mindestens 8 Zeichen.“)
  - Passwort ändern (`accountLifecycle.validateNewPassword`)
  - Recovery (`FamilyApp.jsx` NewPasswordScreen)
- Serverfehler `weak_password` → „Das Passwort ist zu schwach. Bitte mindestens 8 Zeichen verwenden.“
- Neu: Leaked-Password-Meldung → „Dieses Passwort ist aus Datenlecks bekannt …“
- Tests: Unit (7 Zeichen abgelehnt, 8 akzeptiert), Integration family-auth (deutsche Meldung, kein englischer Text).
- **Serverseitig:** Das Testprojekt steht noch auf Supabase-Standard 6. Die Produktion wird in 6B2 auf 8 gestellt (`PRODUCTION_AUTH_CONFIG.md`).

## 11. Edge CORS

- Neues reines ES-Modul `supabase/functions/_shared/cors.js`; `lifecycle.ts` nutzt es.
- Konfiguration:
  - `WC_APP_ORIGIN` (Produktions-Origin, exakt)
  - `WC_ALLOWED_ORIGINS` (weitere exakte Origins, z. B. später `capacitor://localhost`)
  - `WC_ALLOW_DEV_ORIGINS=true|false`: localhost, 127.0.0.1 und Vercel-Previews. Nicht gesetzt: nur im Testprojekt an, **in Produktion aus**.
- **Vergleich:** exakt, kein Präfix- oder Teilstring-Match, `null`-Origin abgelehnt.
- **Tests** `tests/edgeCors.test.mjs` (6):
  - Testmodus
  - Produktionssimulation (Dev aus, nur App-Origin)
  - expliziter Schalter
  - Angriffs-Origins (`app.example.org.evil.com`, falscher Port/Schema, `localhost.evil.com`, fremdes Vercel-Team)
  - Header
- **Testprojekt:** `delete-account` und `delete-family` wurden mit dem neuen Modul neu deployt (v2, `verify_jwt=true`); die Produktion blieb unberührt.
  - Live-Probe: localhost und Preview erhalten `Access-Control-Allow-Origin`; `evil.example.com` und `localhost.evil.com` nicht; ohne Token 401.
  - Die Suite account-lifecycle (34/34) lief gegen die neue Version.

## 12. Auth Config

`docs/appstore/PRODUCTION_AUTH_CONFIG.md` beschreibt das Soll für 6B2:

- Confirm Email AN, Passwort ≥ 8, Leaked Password Protection
- Anonymous aus
- Site- und Redirect-URLs (ohne Previews)
- Sitzungen, Rate Limits, Vorlagen
- Nachweisprozedur

In 6B1 ist nichts gesetzt.

## 13. SMTP

`docs/appstore/SMTP_SETUP_CHECKLIST.md` enthält:

- Anbieterauswahl (DSGVO/AVV), DNS (SPF, DKIM, DMARC)
- Supabase-Felder
- deutsche Vorlagen
- Abnahme

Status: **offen, menschliche Aufgabe.** Kein Anbieter gebucht, keine DNS-Änderung.

## 14. Environment Variables

`docs/appstore/PRODUCTION_ENVIRONMENT.md` enthält eine Tabelle (Variable, System, Pflicht, sensitiv, Beispieltyp, wann setzen) für:

- Vercel (inklusive `VITE_NATIVE_AUTH_REDIRECT_URL` für später)
- Edge-Secrets (`WC_APP_ORIGIN`, `WC_ALLOWED_ORIGINS`, `WC_ALLOW_DEV_ORIGINS`)
- automatische Supabase-Secrets
- SMTP-Felder
- lokale Migrations- und Check-Variablen

**Legacy-Env-Cutover:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` werden bei STOP 8 aus Vercel Production entfernt.

- Der Release-Check im Profil `production` schlägt fehl, solange eine davon gesetzt ist (geprobt).
- Rollback C trägt sie aus dem Passwortmanager wieder ein.

`.env.example` bleibt unverändert, weil keine neuen `VITE_`-Namen hinzugekommen sind.

## 15. PRE-GO Check

`node scripts/check-release-readiness.mjs --profile pre-go` prüft:

- Commit bekannt, Arbeitsbaum sauber
- FAMILY- und LEGACY-Build
- Bundle-Regeln
- 0 externe Fonts (Bundles und Quellcode)
- Passwort-Minimum 8
- Migrationen mit Guard
- `npm audit` 0
- Bootstrap generierbar und deterministisch (Hash); keine Hintertür
- `create_family` und `families`-DELETE entzogen
- frische Generalprobe OK und passend zu Bootstrap-Hash und Fingerabdruck
- Guards des Produktionsmodus offline (7/7), Dry-Run-Plan offline berechenbar
- alle Env-Namen dokumentiert
- `EXTERN` (blockiert PRE-GO nicht, wird aber ausgewiesen): SMTP, Rechtstexte bzw. Rechtslinks

Das Profil `production` ist verschärft. Es verlangt:

- `VITE_BACKEND_MODE=family`
- keine Legacy-Variablen
- nicht das Testprojekt
- Redirect- und Invite-URL mit https
- Rechtslinks
- `WC_GO_SMTP_CONFIRMED=yes` und `WC_GO_LEGAL_CONFIRMED=yes`

Ergebnis auf dem Commit dieser Phase: siehe Handoff (PRE-GO nach dem Commit ausgeführt).

## 16. Cutover Rehearsal

Ende-zu-Ende mit identischem Code gegen das Testprojekt, synthetisches Backup (3 Profile, 171 Erledigungen, 6 Einlösungen, 10 Champion-Wochen, 1 Foto):

1. Code-Stand und Commit festgehalten
2. synthetisches Backup erzeugt (`create-synthetic-legacy-backup.mjs`), SHA-256 notiert
3. Bootstrap generiert, Hash geprüft, deterministisch
4. frische Produktionssimulation: Bootstrap OK, `app_state` unverändert, Fingerabdruck = Erwartung
5. SQL-Sicherheitschecks gegen das Bootstrap-Ziel grün
6. `--dry-run` → Nachweis
7. `--reference` → anonymisierte Referenz
8. `--apply` mit Checkpoints A–J:
   - Profile 3/1
   - Kategorien 2, Aufgaben 3, Zuordnungen 1/3
   - Erledigungen 171/157/14
   - Belohnungen 2/1
   - Champions 10
   - Einstellungen `lastChampionWeek` 2026-09-21
   - Medien 1
9. temporäre Importfunktion angelegt (an diese Familie gebunden)
10. `--import-redemptions`: 6 Einlösungen, Summe 240; zweiter Import blockiert
11. `--verify` mit noch vorhandener Funktion → FEHLER, `--go-check` blockiert
12. Drop der Importfunktion
13. `--verify` OK (maxΔ 0)
14. `--sync-test` OK
15. `--go-check` OK
16. FAMILY-Build gegen das Ziel und Smoke Test im Browser (12/12):
    - Login owner
    - 3 Profile
    - Wochenpunkte = Referenz
    - verfügbar 595 / gesamt 685 = Referenz
    - Profilfoto aus privatem Storage
    - Champion-Historie, keine Zeremonie
    - neue PIN entsperrt
    - keine JS-Fehler
    - 0 Google-Fonts-Anfragen (FAMILY und LEGACY)
17. Legacy-Daten unverändert: `app_state`-Hash der Simulation vorher = nachher; Produktion lesend unverändert (Abschnitt 17)

## 17. Failure Rehearsal

| Fall | Probe | Ergebnis |
|---|---|---|
| falsche Prod-Ref | `--confirm-production=aaaa…` bzw. ohne | Abbruch, Exit 2 |
| Testprojekt als Produktionsziel | Backup mit Prod-Herkunft + Test-URL | „Testprojekt als Produktionsziel – Abbruch“; im Bootstrap: „Das Testprojekt ist kein Produktionsziel“ |
| fremdes/synthetisches Backup in Produktion | `source_project` synthetisch | „Backup-Herkunft passt nicht“ |
| unsauberer Arbeitsbaum | Produktion `--dry-run` | „Arbeitsbaum nicht sauber“ |
| altes Backup (2 h) | ohne Override | Abbruch „120 min alt (Grenze 15 min)“; mit `--allow-stale-backup-minutes=180` Dry-Run OK |
| Hash nach Dry-Run geändert | Dry-Run A, Apply B | „Dry-Run gehört zu einem anderen Backup (Hash)“ |
| zweiter Bootstrap | lokal | „FAMILY-Schema existiert bereits“, nichts verändert |
| bestehende Zielfamilie / Migrationsstand | Apply erneut | „Migrationsstand existiert“ bzw. „owner gehört bereits zu einer Familie“ |
| Punktediff ≠ 0 | eine Erledigung +1 Punkt | VERIFY FEHLER (profile-3 total/available Δ 1, Zeitreihe 2), GO-CHECK BLOCKIERT; zurückgesetzt → OK |
| Importfunktion nicht entfernt | Verify vor Drop | VERIFY FEHLER, GO-CHECK BLOCKIERT |
| fehlendes Medium | Objekt entfernt | Medien `missing 1`, GO-CHECK BLOCKIERT „Gate media“; wiederhergestellt → OK |
| fehlende Rechts-Env | Release-Check `production` | FAIL „Rechtliche Links gesetzt“ |
| falscher Backend-Modus | `VITE_BACKEND_MODE=legacy` | FAIL „VITE_BACKEND_MODE=family“; zusätzlich FAIL Testprojekt, Legacy-Env gesetzt |
| externe Voraussetzungen | korrekte Werte, ohne Bestätigung | nur FAIL SMTP und Rechtstexte |

## 18. Rollback

Die Fälle A–D stehen in `PRODUCTION_CUTOVER_RUNBOOK.md`:

- **A:** Bootstrap-Abbruch; die Transaktion rollt zurück.
- **B:** Import oder Gate rot; Vercel bleibt LEGACY, die Familie wird über `delete-family` entfernt, neuer Dry-Run. Die Recovery wurde geprobt.
- **C:** nach dem Vercel-Cutover: Instant Rollback, Legacy-Env wieder eintragen.
- **D:** Sicherheitsvorfall: Rollback C, Functions aus, Art.-33-Entscheidung beim Nutzer.

## 19. Voraussetzungen 6B2

Menschliche Entscheidungen und externe Aufgaben (Code kann sie nicht erfüllen):

1. Produktions-Domain festlegen (bestimmt Site-URL, Redirects, `WC_APP_ORIGIN`, Invite-Basis).
2. SMTP-Anbieter wählen, AVV, DNS (SPF/DKIM/DMARC), Zugang bereit (`SMTP_SETUP_CHECKLIST.md`).
3. Datenschutzerklärung, Impressum, Support-Kontakt mit echten Betreiberdaten veröffentlichen (werden nicht erfunden).
4. owner-E-Mail, neues Passwort (≥ 8), neue Eltern-PIN, Familienname.
5. Wartungsfenster mit der Familie vereinbaren (LEGACY in dieser Zeit nicht benutzen).
6. Weg für den Bootstrap wählen: psql mit DB-Verbindung (bevorzugt) oder MCP `apply_migration`.
7. Entscheiden, ob Leaked Password Protection verfügbar ist (Plan).
8. Ausdrückliche Freigaben STOP 1–8, insbesondere STOP 8 für den Vercel-FAMILY-Cutover.
