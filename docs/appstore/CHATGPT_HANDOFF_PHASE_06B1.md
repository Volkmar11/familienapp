# CHATGPT HANDOFF – PHASE 6B1

## 1. Ergebnis
- Phase erfolgreich: ja. Das Produktionspaket ist gebaut und lokal sowie gegen das Testprojekt geprobt; PRE-GO meldet 0 technische FAILs.
- Branch: `feature/appstore-v1`
- Commit: `176a888` „chore: prepare production cutover package“; dazu dieser Handoff als Folgecommit
- Push: normal nach `origin/feature/appstore-v1`, ohne Force
- Legacy-Build: grün. Keine Google Fonts mehr; Regression reg/reg2 identisch zu 5C, reg3 identisch in 2 von 3 Läufen (einmal zeitabhängiger Toast, bekannt aus 5D); Foto-Test 8/8
- Family-Build: grün (gegen das Testprojekt und mit Platzhaltern)
- Produktionsmutation: keine. Produktion nur lesend geprüft.
- main verändert: nein

## 2. Production Bootstrap
- Generator: `scripts/generate-production-bootstrap.mjs` (6B1.1) mit Manifest `supabase/production/bootstrap-manifest.json` (SHA-256 je Migration)
- Quellmigrationen: 10, unverändert. Neu ist Migration 10 `20260930200000_create_family_hardening.sql`.
- Test-Guards: je Migration exakt einmal entfernt (Block-Hash geprüft, genau ein begin/commit, nichts danach, kein Rest-`migration_target`)
- Production Guard:
  - verlangt `app.migration_target=production` und `app.confirm_project_ref=<Prod-Ref>`
  - lehnt die Test-Ref ab
  - verlangt `app_state` und `family-main`
  - bricht ab, wenn FAMILY-Objekte existieren
  - Epilog: `app_state` unverändert, keine Hintertür, `create_family` und `families`-DELETE gesperrt, Bucket und Realtime vorhanden
- deterministisch: ja. Zwei Läufe byte-identisch; kein Zeitstempel im SQL.
- Bootstrap SHA-256:
  - psql: `4bd4b426aa8d098029f215a0dd02ef6afa4a4b06347403b162c4fb789ba8dbe2`
  - MCP: `9814b72955fa42f7b77b8ada4af57662e9133228a8b74808d04cda14b731292c`
- zweiter Lauf blockiert: ja („FAMILY-Schema existiert bereits“, Schema und `app_state` unverändert)

## 3. Fresh Rehearsal
- Ausgangszustand: frisches lokales PostgreSQL 16 mit Plattform-Stub und simuliertem Produktions-`app_state` (3 Policies, Realtime, synthetisches `family-main`); Stub und Simulation liegen jetzt im Repo
- Bootstrap: `scripts/rehearse-production-bootstrap.mjs` auf Commit `176a888`, 22/22 PASS. Fehlerfälle (ohne Ziel, Testmodus, Test-Ref, falsche Ref, ohne Ref) brechen jeweils mit 0 FAMILY-Tabellen ab; die MCP-Variante wurde ebenfalls geprobt.
- family-main unverändert: ja (Hash vorher = nachher)
- Schema Fingerprint: 538 Objekte = erwarteter Fingerabdruck (aus den Migrationen gebaut) = Bootstrap-Ziel. Neue Kategorie `function_normalized`; die Aussage aus 6A ist korrigiert (Details im Phasenbericht, §4).
- Security Tests: gegen das Bootstrap-Ziel alle ohne Fehler (account_lifecycle 22, admin_crud 13, invitations 31, media 32, onboarding 8, release_hardening 13, rls_matrix 40)
- Ergebnis: grün

## 4. Production Migration Mode
- Script:
  - `scripts/migrate-legacy-family.mjs --target=production --confirm-production=<ref>` bzw. `--target=rehearsal`
  - Logik in `scripts/lib/productionMigration.mjs`
  - Backup-Export (nur lesend) über `scripts/export-legacy-backup.mjs`
- Dry Run Pflicht: ja. Apply verlangt einen passenden `dry-run.json` (höchstens 120 min alt) und eine passende Referenz.
- Backup-Hash Gate: ja. Herkunft (`source_project`) und Frische (15 min, Override nur bewusst) werden geprüft.
- Git-Commit Gate: ja. Der Dry-Run muss zum Commit passen; ein unsauberer Arbeitsbaum blockiert in der Produktion.
- Project-Ref Gate: ja. Exakte Bestätigung nötig; das Testprojekt als Produktionsziel und Secret-Keys werden abgelehnt.
- vorhandene Zielfamilie: blockiert (owner schon Mitglied, oder Migrationsstand existiert)
- Production Delete möglich: nein. Das Skript löscht nie und legt nichts neu an; Recovery nur über das Runbook (`delete-family`).
- Apply getestet mit synthetischen Daten: ja, gegen das Testprojekt. Checkpoints A–J grün (3 Profile, 171 Erledigungen, 10 Champion-Wochen, 1 Foto).

## 5. Redemptions
- Strategie: temporäre SECURITY-DEFINER-Funktion nur im Wartungsfenster, danach sofort DROP
- temporäre Funktion: `legacy_import_redemptions_once(jsonb)` aus `scripts/generate-redemption-import.mjs`
  - `search_path=''`
  - Ablaufzeit höchstens 180 min
  - nur owner (`auth.uid()` + Rolle)
  - nur einmal nutzbar; `revoke` von public/anon
- Family Binding: `family_id` und owner als Konstanten; kein Familien-Parameter
- Import: 6 Einlösungen mit historischem `redeemed_at` und Quittierungen; zweiter Import blockiert
- Count/Punkteprüfung: Anzahl, Summe (240), Quittierungen und Zeilen-Hash gegen den Plan: OK
- Drop: Drop-SQL prüft den exakten Namen; Verify und GO-Check blockieren, solange die Funktion existiert (geprobt)
- Fingerprint danach: keine Funktion `legacy_import_redemptions_once` (Testprojekt: 0)
- dauerhafte Backdoor: nein. Der Bootstrap-Epilog, `release_hardening_check` und PRE-GO prüfen das.

## 6. Release Hardening
- create_family: für anon und authenticated entzogen (Migration 10, im Testprojekt angewendet, SQL- und Integrationstest)
- families_delete: für Clients entzogen (seit Migration 9); jetzt zusätzlich im Bootstrap-Epilog, in der Generalprobe und in PRE-GO geprüft
- Membership Manipulation: `family_members` ohne INSERT/UPDATE/DELETE-Policy; Rollen nur über RPCs; rls_matrix 40/40 und invitations 31/31 grün
- Google Fonts: entfernt. Fredoka ist selbst gehostet (OFL-Lizenz beiliegend); 0 externe Font-Anfragen in LEGACY und FAMILY (Netzwerktest)
- Passwortminimum: 8, zentral, bei Registrierung, Passwort ändern und Recovery; deutsche Meldungen, auch für „weak/leaked password“
- CORS:
  - `WC_APP_ORIGIN` und `WC_ALLOWED_ORIGINS` sind exakte Origins
  - Dev-Origins nur mit `WC_ALLOW_DEV_ORIGINS=true`; in Produktion standardmäßig aus
  - 6 Tests für Testmodus und Produktionssimulation
  - im Testprojekt neu deployt und live geprüft
- npm audit: 0

## 7. Auth / SMTP Vorbereitung
- Auth Config Dokument: `docs/appstore/PRODUCTION_AUTH_CONFIG.md`
- Confirm Email: Soll AN (noch nicht gesetzt; verboten in 6B1)
- Password Minimum Dashboard: Soll 8 (noch nicht gesetzt)
- Leaked Password Protection: Soll AN, falls der Tarif es zulässt (Entscheidung offen)
- SMTP Checklist: `docs/appstore/SMTP_SETUP_CHECKLIST.md` (Anbieter, AVV, SPF/DKIM/DMARC, deutsche Vorlagen, Abnahme)
- SMTP eingerichtet: nein
- externe Nutzerentscheidung nötig: ja (Domain, SMTP-Anbieter, Absender)

## 8. Environments
- Production Env Manifest: `docs/appstore/PRODUCTION_ENVIRONMENT.md` (Variable, System, Pflicht, sensitiv, Beispieltyp, wann setzen)
- Vercel FAMILY Variablen:
  - `VITE_BACKEND_MODE`, `VITE_FAMILY_SUPABASE_URL`, `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_AUTH_REDIRECT_URL`, `VITE_INVITE_BASE_URL`
  - `VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`, `VITE_SUPPORT_URL`
  - später `VITE_NATIVE_AUTH_REDIRECT_URL`
- Legacy Variablen beim Cutover: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` werden entfernt. Der Release-Check `production` schlägt fehl, solange eine davon gesetzt ist (geprobt). Rollback C trägt sie wieder ein.
- Edge Variablen: `WC_APP_ORIGIN`, `WC_ALLOWED_ORIGINS`, `WC_ALLOW_DEV_ORIGINS`; `SUPABASE_*` automatisch
- Secrets committed: nein (Diff geprüft; nur Platzhalter)

## 9. PRE-GO Check
- Script: `node scripts/check-release-readiness.mjs --profile pre-go`
- Ergebnis: 31 PASS, 0 WARN, 3 EXTERN offen, 0 FAIL (Commit `176a888`, Arbeitsbaum sauber)
- technische FAILs: 0
- externe GO-Voraussetzungen: offen sind SMTP eingerichtet und getestet, Rechtstexte veröffentlicht, Rechtslinks gesetzt
- Cutover aktuell freigegeben: nein

## 10. Cutover Rehearsal
- kompletter Ablauf getestet: ja, 17 Schritte (Phasenbericht §16): Backup, Bootstrap, Fingerabdruck, Dry-Run, Referenz, Apply A–J, Import, Drop, Verify, Sync, GO-Check, FAMILY-Build mit Smoke Test 12/12
- Punkte Diff: maxΔ 0, Zeitreihe 0
- Champions: Sync-Gate 6/6; Historie sichtbar, keine Zeremonie
- Media: 1/1 Foto migriert, im Browser aus privatem Storage geladen; keine fehlenden, fremden oder verwaisten Objekte
- Importfunktion entfernt: ja
- Legacy Daten unverändert: ja (simulierter `app_state` Hash gleich; Produktion lesend unverändert)
- Ergebnis: GO-CHECK OK (rehearsal)

## 11. Failure Rehearsal
- falsches Ziel: falsche oder fehlende Prod-Ref, das Testprojekt als Produktionsziel (Skript und Bootstrap) und fremde Backup-Herkunft werden abgebrochen
- altes Backup: 2 h alt wird abgebrochen; mit bewusstem Override läuft es
- Hash geändert: Apply mit anderem Backup als der Dry-Run wird abgebrochen
- doppelter Bootstrap: abgebrochen, nichts verändert
- vorhandene Zielfamilie: abgebrochen (owner hat Familie bzw. Migrationsstand existiert)
- Punkteabweichung: +1 Punkt führt zu VERIFY FEHLER und GO-CHECK BLOCKIERT; nach dem Zurücksetzen OK
- Importfunktion vorhanden: VERIFY FEHLER und GO-CHECK BLOCKIERT
- fehlende Legal Env: FAIL im Release-Check `production`; ebenso falscher Backend-Modus, Testprojekt, Legacy-Env gesetzt und fehlende SMTP/Legal-Bestätigung. Zusätzlich geprobt: fehlendes Medium führt zu GO-CHECK BLOCKIERT
- Ergebnis: alle Fehlerfälle blockieren wie vorgesehen

## 12. Produktion
- aktuelles Production Schema: unverändert, nur `public.app_state` (3 Policies, Realtime); kein `private`-Schema, keine Migrationstabelle
- family-main: vorhanden, 1 Zeile, nicht angefasst
- FAMILY Bucket: keiner (0 Buckets)
- FAMILY Edge Functions: keine (0)
- Production Auth geändert: nein (0 Auth-User)
- Vercel Production geändert: nein

## 13. Tests
- Unit: 153/153 (neu: Edge-CORS, Bootstrap-Generator, Produktions-Guards, Import-SQL, Backup-Export)
- Integration: 10/10 Suites, 322 Prüfungen (data 18, mutations 44, admin 60, champion-realtime 17, two-device 27, onboarding 29, auth 13, media 31, invitations 49, account-lifecycle 34). `auth-rls-realtime` nicht ausführbar, weil feste Test-User-Passwörter fehlen (wie in früheren Phasen). Browser: ui5d 40, ui5d-2dev 10, ui5c 34, ui5c-2dev 8, legal-ui 9, a11y ohne neue Befunde (bekannte 6A-Punkte: kleine Buttons im Elternbereich, Überlauf bei 320 px)
- SQL: 7 Checks lokal und gegen das Bootstrap-Ziel, alle ohne Fehler
- Rehearsal: Bootstrap 22/22, Cutover-Generalprobe GO, Fehlerfälle alle blockiert, Smoke Test 12/12
- Legacy: Regression identisch (reg3: ein Timing-Toast, bei Wiederholung identisch), Foto 8/8, 0 Google-Fonts-Anfragen
- Builds: LEGACY und FAMILY grün
- npm audit: 0
- Gesamtergebnis: grün

## 14. Geänderte Dateien
- neu:
  - Skripte: `scripts/generate-production-bootstrap.mjs`, `rehearse-production-bootstrap.mjs`, `generate-redemption-import.mjs`, `export-legacy-backup.mjs`, `create-synthetic-legacy-backup.mjs`, `lib/productionMigration.mjs`
  - Supabase: `supabase/production/*` (Manifest, erwarteter Fingerabdruck), `supabase/tests/local/*` (Stub, Produktionssimulation), Migration `20260930200000_create_family_hardening.sql`, `supabase/functions/_shared/cors.js`
  - Fonts: `src/assets/fonts/*`
  - Tests: `tests/edgeCors.test.mjs`, `tests/productionPackage.test.mjs`
  - Doku: `PHASE_06B1_PRODUCTION_PACKAGE.md`, `PRODUCTION_AUTH_CONFIG.md`, `SMTP_SETUP_CHECKLIST.md`, `PRODUCTION_ENVIRONMENT.md`, dieser Handoff
- geändert:
  - Skripte: `scripts/check-release-readiness.mjs` (pre-go/production), `scripts/migrate-legacy-family.mjs` (Verzweigung)
  - App: `src/lib/auth.js`, `src/main.jsx`, `src/shared/ChampionApp.jsx`, `src/family/ui.jsx`
  - Supabase: `supabase/functions/_shared/lifecycle.ts`, SQL-Tests (rls_matrix, admin_crud, media, release_hardening, schema_fingerprint)
  - Tests: Unit- und Integrationstests (Passwort 8, `create_family`)
  - Doku: `PRODUCTION_CUTOVER_RUNBOOK.md`, `PRODUCTION_MIGRATION_PLAN.md`, 6A-Audit (Korrekturnotiz)
  - `.gitignore`: `local-release/`

## 15. Noch offene menschliche Entscheidungen
- eigene Domain: welche Produktions-Domain (Site-URL, Redirects, `WC_APP_ORIGIN`, Invite-Links)
- SMTP-Anbieter: Auswahl, AVV, DNS-Einträge, Absenderadresse
- Support-Mail: Adresse für `VITE_SUPPORT_URL`
- Privacy-/Impressumsdaten: echte Betreiberangaben und Veröffentlichung von Datenschutzerklärung und Impressum
- Wartungsfenster: Termin mit der Familie (LEGACY in dieser Zeit nicht nutzen)
- spätere Owner-E-Mail: echtes owner-Konto sowie neue Eltern-PIN und Familienname (erst in 6B2 eingeben)
- Bootstrap-Weg: psql mit DB-Verbindung (empfohlen) oder MCP
- Leaked Password Protection: im Tarif verfügbar?

## 16. GO/NO-GO für Phase 6B2
- technisch bereit: ja (PRE-GO 0 FAIL, Generalprobe und Fehlerfälle grün)
- externe Voraussetzungen erfüllt: nein (Domain, SMTP, Rechtstexte offen)
- Produktions-Cutover empfohlen: noch nicht
- Begründung: Ohne eigenen SMTP kommen Bestätigungs- und Reset-Mails nicht zuverlässig an, und ohne Domain fehlen Redirect-URLs und CORS-Origin. Ohne veröffentlichte Rechtstexte schlägt der Release-Check `production` zu Recht fehl.

## 17. Empfehlung nächster Schritt
Noch NICHT ausführen.

Externe Voraussetzungen, die noch fehlen:
1. Produktions-Domain festlegen und mit Vercel verbinden (DNS durch den Nutzer).
2. SMTP-Anbieter wählen, AVV abschließen, SPF/DKIM/DMARC setzen (`SMTP_SETUP_CHECKLIST.md`).
3. Datenschutzerklärung, Impressum und Support-Adresse mit echten Angaben veröffentlichen.
4. Wartungsfenster und owner-Konto-Daten bereithalten.

Wenn diese Punkte erledigt sind: Phase 6B2 nach Runbook STOP 1–8, erst nach ausdrücklicher Freigabe des Nutzers; STOP 8 (Vercel-FAMILY-Cutover) nur mit wörtlicher Freigabe.

Alternativ kann parallel Phase 7A (Capacitor/Xcode) gegen das TESTPROJEKT beginnen, ohne die Produktion anzufassen.
