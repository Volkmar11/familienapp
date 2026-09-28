# Production Cutover Runbook – Wochen Champion (LEGACY → FAMILY)

- **Stand:** Phase 6B1. Alle Befehle existieren und sind geprobt: lokal auf frischer DB bzw. als Generalprobe gegen das Testprojekt mit synthetischen Daten.
- **Ausführung:** erst in **Phase 6B2**, Schritt für Schritt.
- **STOP-Regel:** Jeder STOP ist ein harter Haltepunkt. Weiter geht es nur, wenn die GO-Bedingung erfüllt ist **und** der Mensch im Chat ausdrücklich freigibt, z. B. „GO STOP 3“. Ohne diese Freigabe endet der Lauf.
- **Hintergrund:**
  - `PRODUCTION_MIGRATION_PLAN.md`
  - `PHASE_06B1_PRODUCTION_PACKAGE.md`
  - `PRODUCTION_ENVIRONMENT.md`
  - `PRODUCTION_AUTH_CONFIG.md`
  - `SMTP_SETUP_CHECKLIST.md`

**Grundregeln:**

- Kein Force-Push, kein `reset --hard`, kein Merge nach `main` ohne Freigabe.
- Keine Secrets, Passwörter, PINs oder Invite-Tokens in Logs oder Chat; Eingaben per `read -s`.
- Keine personenbezogenen Daten ausgeben: nur Anzahlen, Hashes und anonymisierte Profile („profile-1 …“).
- `public.app_state` wird **nie** verändert. Bootstrap und Migration prüfen das selbst.
- Produktionsprojekt: `gkkzjmszcjivtaygbmfw`. Testprojekt: `otejitifgcrrwmudrnhs`; es wird nie als Produktionsziel akzeptiert.
- Alle Artefakte liegen in `local-release/` bzw. `local-backups/` (von Git ignoriert, Dateimodus 0600).

**Vom Nutzer zu liefern (nicht im Repo):**

- Produktions-Domain
- SMTP-Anbieter und Zugang
- Rechtslinks
- owner-E-Mail und neues Passwort
- neue Eltern-PIN
- Familienname
- Wartungsfenster
- Datenbank-Verbindung für den Bootstrap (nur bei Variante A)

---

## STOP 1 – Code-Freeze und Commit

```bash
git switch feature/appstore-v1 && git pull --ff-only
git status --porcelain                                # muss leer sein
git tag -a release-6b2-<datum> -m "Cutover-Stand"      # Tag lokal, Push nach Freigabe
node --test tests/*.test.mjs                           # Unit
# Integrationssuites gegen das Testprojekt (siehe PHASE_06B1 §Tests), Browser, Legacy-Regression
node scripts/rehearse-production-bootstrap.mjs         # frische lokale Bootstrap-Generalprobe → local-release/bootstrap-rehearsal.json
node scripts/check-release-readiness.mjs --profile pre-go
```

**GO:**

- Tree clean, alle Suites grün.
- PRE-GO: 0 FAIL. Offen sind nur die `EXTERN`-Punkte SMTP und Rechtstexte; beide werden bis STOP 7 erledigt.
- Commit-Hash notieren.

**Freigabe:** ja.

## STOP 2 – Wartungsfenster, frisches Backup und Hash

1. Familie informieren; LEGACY-Schreibzugriffe für das Wartungsfenster aussetzen (vereinbart: nicht in der App arbeiten).
2. PITR bzw. Datenbank-Backup-Zeitpunkt im Supabase-Dashboard notieren.
3. Backup nur lesend exportieren:

```bash
export LEGACY_SUPABASE_URL=https://gkkzjmszcjivtaygbmfw.supabase.co
read -s LEGACY_SUPABASE_KEY && export LEGACY_SUPABASE_KEY      # anon/publishable Key (nur lesend)
node scripts/export-legacy-backup.mjs --confirm-production=gkkzjmszcjivtaygbmfw
# → local-backups/family-main-<zeit>.json · SHA-256 · Bytes · updated_at · Anzahlen (keine Namen)
```

**GO:**

- SHA-256, `updated_at` und die Anzahlen sind notiert.
- `updated_at` bleibt während des Fensters gleich. Probe: nach STOP 5 erneut exportieren und den Hash des `record` vergleichen.

**Freigabe:** ja.

## STOP 3 – Bootstrap-Hash geprüft

```bash
node scripts/generate-production-bootstrap.mjs          # schreibt local-release/production-bootstrap{.sql,.mcp.sql,.meta.json}
node scripts/generate-production-bootstrap.mjs --check  # zweimal erzeugt → byte-identisch?
cat local-release/production-bootstrap.meta.json         # sha256, git.commit (== STOP 1), dirty=false, Quellhashes
```

**GO:**

- `meta.git.commit` ist der STOP-1-Commit und `dirty` ist false.
- Die SHA-256 stimmt mit `bootstrap-rehearsal.json` überein (die Generalprobe lief auf genau diesem Stand).
- Der Mensch hat den Hash gesehen und bestätigt.

**Freigabe:** ja.

## STOP 4 – Bootstrap ausgeführt und Fingerabdruck geprüft

**Variante A (bevorzugt), psql in einer Transaktion.** Die Datei enthält `begin`/`commit`; der Verbindungsstring kommt vom Nutzer und wird nicht gespeichert.

```bash
read -s PGURI
PGOPTIONS="-c app.migration_target=production -c app.confirm_project_ref=gkkzjmszcjivtaygbmfw" \
  psql "$PGURI" -X -v ON_ERROR_STOP=1 -f local-release/production-bootstrap.sql
```

**Variante B, Supabase MCP `apply_migration`** (Name `family_bootstrap_6b2`):

- Inhalt = Präfix `select set_config('app.migration_target','production',true), set_config('app.confirm_project_ref','gkkzjmszcjivtaygbmfw',true);` + `local-release/production-bootstrap.mcp.sql`
- geprobt in `rehearse-production-bootstrap.mjs`, Teil D

Der Bootstrap bricht selbst ab, wenn:

- das Ziel nicht bestätigt ist
- das Ziel das Testprojekt ist
- `app_state` oder `family-main` fehlt
- das FAMILY-Schema schon existiert
- `app_state` sich verändert hat
- eine Hintertür existiert
- `create_family` oder `DELETE` auf `families` für Clients offen ist

Danach (nur lesend):

```sql
-- supabase/tests/schema_fingerprint.sql ausführen, Zeilen mit app_state entfernen und mit
-- supabase/production/expected_schema_fingerprint.tsv vergleichen (538 Objekte; function_normalized für MCP-Umgebungen)
select count(*) from public.app_state;                          -- 1
select md5(data::text), updated_at from public.app_state where id = 'family-main';   -- == Backup
```

- Security Advisor lesen.
- `release_hardening_check.sql` und `rls_matrix_test.sql` **nur lokal** (die schreibenden SQL-Checks nie in Produktion).

**GO:**

- Fingerabdruck identisch (bei MCP: `function_normalized` identisch).
- `app_state` unverändert, keine Advisor-Fehler.

**Freigabe:** ja.

## STOP 5 – Dry-Run und Referenz

```bash
B=local-backups/family-main-<zeit>.json
P="--target=production --confirm-production=gkkzjmszcjivtaygbmfw --backup $B"
node scripts/migrate-legacy-family.mjs $P --dry-run      # offline, Nachweis local-release/dry-run.json (Hash, Ref, Commit, Counts)
node scripts/migrate-legacy-family.mjs $P --reference    # offline, local-release/reference.json (anonymisierte Punkte je Profil)
```

Sicherungen:

- Backup älter als 15 min → Abbruch. Override nur bewusst mit `--allow-stale-backup-minutes=<n>` und Begründung im Chat.
- Backup-Herkunft ≠ Produktion → Abbruch.
- Unsauberer Arbeitsbaum → Abbruch.

**GO:** Dry-Run ohne Fehler, Counts plausibel, Referenz erzeugt.

**Freigabe:** ja.

## STOP 6 – Apply, Punktediff 0, Champion, Medien

1. Edge Functions deployen (vor dem Apply; `delete-account`, `delete-family`, `verify_jwt=true`).
   - Secret `WC_APP_ORIGIN=https://<produktions-domain>` setzen.
   - `WC_ALLOW_DEV_ORIGINS` **nicht** setzen.
   - Probe: ohne Token 401; fremde Origin ohne `Access-Control-Allow-Origin`.
2. owner-Konto in der Produktions-App bzw. per Supabase-Registrierung anlegen und bestätigen (braucht SMTP, also STOP 7 Teil Auth/SMTP vorziehen, falls noch offen).
3. Apply:

```bash
export MIGRATION_TARGET_URL=https://gkkzjmszcjivtaygbmfw.supabase.co
read -s MIGRATION_TARGET_PUBLISHABLE_KEY && export MIGRATION_TARGET_PUBLISHABLE_KEY
read MIGRATION_OWNER_EMAIL && export MIGRATION_OWNER_EMAIL
read -s MIGRATION_OWNER_PASSWORD && export MIGRATION_OWNER_PASSWORD
read -s MIGRATION_FAMILY_PIN && export MIGRATION_FAMILY_PIN
read MIGRATION_FAMILY_NAME && export MIGRATION_FAMILY_NAME
node scripts/migrate-legacy-family.mjs $P --apply        # Phasen A–F, H, I, J mit Checkpoints → local-release/migration-state.json
```

Das Apply bricht ab, wenn:

- der Dry-Run fehlt, zu einem anderen Backup, Ref oder Commit gehört oder älter als 120 min ist
- die Referenz fehlt
- schon ein Migrationsstand existiert
- das owner-Konto bereits eine Familie hat
- das Ziel das Testprojekt ist
- ein Secret-Key verwendet wird

4. Einlösungen (Phase G) über die temporäre Funktion:

```bash
node scripts/generate-redemption-import.mjs --family-id <aus migration-state.json> --owner-id <aus migration-state.json> --expires-in-minutes 60
# local-release/redemption-import-create.sql per MCP execute_sql/psql anwenden (SHA-256 aus .meta.json prüfen)
node scripts/migrate-legacy-family.mjs $P --import-redemptions      # Anzahl, Summe, Quittierungen, Zeilen-Hash werden geprüft
# SOFORT: local-release/redemption-import-drop.sql anwenden (prüft selbst, dass die Funktion weg ist)
```

5. Gates:

```bash
node scripts/migrate-legacy-family.mjs $P --verify      # Punkte-Δ je Profil/Kennzahl, Zeitreihe, Counts, Medien, „Importfunktion entfernt“
node scripts/migrate-legacy-family.mjs $P --sync-test   # Champion: keine alte Woche neu, keine Duplikate, zweiter Lauf no-op
node scripts/migrate-legacy-family.mjs $P --go-check    # Exit 0 nur wenn alle Gates grün, gleiches Backup, gleicher Commit
```

**GO:**

- `--go-check` meldet OK.
- Punkte maxΔ 0, Zeitreihe 0, Medien ok (kein fehlendes, fremdes oder verwaistes Objekt), Importfunktion entfernt, Champion-Gate grün.
- Bei ≠ 0: **ABBRUCH**, Rollback B.

**Freigabe:** ja.

## STOP 7 – SMTP, Auth und Rechtstexte

- Auth gemäß `PRODUCTION_AUTH_CONFIG.md`: Confirm Email AN, Passwort ≥ 8, Leaked Password Protection, Site/Redirect-URLs.
- SMTP gemäß `SMTP_SETUP_CHECKLIST.md`: Testmails „Bestätigung“ und „Reset“ kommen an.
- Datenschutz, Impressum und Support sind öffentlich erreichbar (Inhalte vom Nutzer; keine erfundenen Firmendaten).

```bash
WC_GO_SMTP_CONFIRMED=yes WC_GO_LEGAL_CONFIRMED=yes VITE_BACKEND_MODE=family \
VITE_FAMILY_SUPABASE_URL=https://gkkzjmszcjivtaygbmfw.supabase.co VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY=<publishable> \
VITE_AUTH_REDIRECT_URL=https://<domain> VITE_INVITE_BASE_URL=https://<domain> \
VITE_PRIVACY_URL=… VITE_IMPRINT_URL=… VITE_SUPPORT_URL=… \
node scripts/check-release-readiness.mjs --profile production
```

**GO:** Release-Check `production` meldet 0 FAIL; die Mails wurden nachweislich zugestellt.

**Freigabe:** ja.

## STOP 8 – AUSDRÜCKLICHE menschliche Freigabe für den Vercel-FAMILY-Cutover

Nur mit wörtlicher Freigabe „GO STOP 8 – Vercel FAMILY Cutover“.

1. ID/URL des letzten LEGACY-Production-Deployments notieren (Rollback-Ziel).
2. Aktuelle Werte `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` im Passwortmanager sichern.
3. Vercel Production Env setzen (`PRODUCTION_ENVIRONMENT.md`, Abschnitt 1):
   - `VITE_BACKEND_MODE=family`, FAMILY-URL/Key, Redirect-/Invite-URL, Rechtslinks
   - **`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` entfernen**
4. Production-Deployment auslösen (Merge nach `main` nur nach Review und Freigabe).
5. Smoke Test (iPhone und Desktop):
   - Login owner
   - Punkte = Referenz
   - Profilfotos
   - PIN-Bereich mit neuer PIN
   - Champion-Historie ohne Zeremonie
   - Aufgabe erledigen
   - Einlösen und quittieren
   - Realtime auf dem zweiten Gerät
   - Reset-Mail
   - Rechtslinks
   - keine Anfragen an Google Fonts
6. Abnahme durch die Familie (Punktestände bestätigt).

Danach:

- `app_state` bleibt 30 Tage unverändert als Archiv.
- Die Sperre für anon erst nach eigener Freigabe („GO app_state lock“).

## Rollback

| Fall | Situation | Maßnahme |
|---|---|---|
| **A** | Abbruch vor/bei STOP 4 (Bootstrap fehlgeschlagen) | Die Transaktion rollt automatisch zurück (Variante A/B); `app_state` ist unverändert. Ursache analysieren, keinen zweiten Versuch ohne neuen STOP 3. LEGACY läuft unverändert weiter. |
| **B** | Abbruch bei STOP 5/6 (Import, Punktediff ≠ 0, Gate rot) | Vercel bleibt LEGACY (noch nichts umgestellt). FAMILY-Familie **nicht** per SQL löschen. Nach Analyse wird sie über die Edge Function `delete-family` (owner + PIN, entfernt Medien) oder „Konto löschen“ entfernt. Danach `local-release/migration-state.json` archivieren, neuer Dry-Run und neues Apply ab STOP 5 (Recovery-Prozedur, geprobt in 6B1). Hängt die temporäre Importfunktion noch, `redemption-import-drop.sql` anwenden. |
| **C** | Problem nach dem Vercel-Cutover (STOP 8) | Vercel Instant Rollback auf das notierte LEGACY-Deployment; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` aus dem Passwortmanager wieder eintragen und `VITE_BACKEND_MODE=legacy` setzen (bzw. entfernen). LEGACY arbeitet mit dem unveränderten `app_state`. Einträge, die nach dem Cutover in FAMILY entstanden sind, manuell nachtragen (Liste aus der App). |
| **D** | Sicherheits- oder Datenschutzproblem im FAMILY-Backend | Sofort Rollback C. Edge Functions löschen bzw. deaktivieren, betroffene Konten sperren (Dashboard). Keine Löschung von Daten ohne Analyse. Der Nutzer entscheidet über die Meldung nach DSGVO Art. 33 (72 h). |

Für alle Fälle gilt:

- Kurzbericht ohne Personendaten: welcher Schritt, welche Prüfung, welcher Wert.
- Kein Force-Push.
- Keine Wiederholung ohne neuen STOP.

| Checkpoint | Frage | menschliche Freigabe |
|---|---|---|
| STOP 1 | Code-Freeze, Commit, PRE-GO 0 FAIL? | ja |
| STOP 2 | frisches Backup + Hash? | ja |
| STOP 3 | Bootstrap-Hash geprüft? | ja |
| STOP 4 | Bootstrap erfolgreich + Fingerabdruck? | ja |
| STOP 5 | Dry-Run + Referenz? | ja |
| STOP 6 | Apply + Punktediff 0 + Champion + Medien? | ja |
| STOP 7 | SMTP, Auth, Rechtstexte? | ja |
| STOP 8 | Vercel-FAMILY-Cutover | **ja, ausdrücklich und wörtlich** |
