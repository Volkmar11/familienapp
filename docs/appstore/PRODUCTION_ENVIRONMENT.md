# Produktions-Umgebungsvariablen – Wochen Champion (Phase 6B1)

Diese Liste zeigt nur **Namen, Zweck und Zeitpunkt**, keine Werte. Echte Werte liegen ausschließlich in Vercel, in Supabase (Edge Function Secrets bzw. Auth-Einstellungen) oder im Passwortmanager. Sie gehören nie ins Repository, in Logs oder in den Chat.

Legende:

- **Pflicht:** ja / nein / später (iOS)
- **sensitiv:** ja = geheim halten; „öffentlich“ = landet im Client-Bundle und ist damit einsehbar (z. B. der Publishable Key, geschützt durch RLS)
- **wann setzen:** Runbook-Schritt (`PRODUCTION_CUTOVER_RUNBOOK.md`)

Der PRE-GO-Check (`node scripts/check-release-readiness.mjs --profile pre-go`) prüft, dass alle im Code verwendeten Namen hier dokumentiert sind.

## 1. Vercel – Web-App (Build-Zeit, `VITE_…`)

| Variable | System | Pflicht | sensitiv | Beispieltyp | wann setzen |
|---|---|---|---|---|---|
| `VITE_BACKEND_MODE` | Vercel Production | ja | nein | `family` (heute: `legacy` bzw. leer) | STOP 8 (Cutover) |
| `VITE_FAMILY_SUPABASE_URL` | Vercel Production | ja | öffentlich | `https://<produktions-ref>.supabase.co` | STOP 8 |
| `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY` | Vercel Production | ja | öffentlich (nur Publishable Key, nie Secret/service_role) | `sb_publishable_…` | STOP 8 |
| `VITE_AUTH_REDIRECT_URL` | Vercel Production | ja | nein | `https://<produktions-domain>` | STOP 8 (muss in Supabase Redirect-URLs stehen, STOP 7) |
| `VITE_INVITE_BASE_URL` | Vercel Production | ja | nein | `https://<produktions-domain>` | STOP 8 |
| `VITE_PRIVACY_URL` | Vercel Production | ja | nein | `https://<domain>/datenschutz` | STOP 7/8 (erst wenn die Seite öffentlich ist) |
| `VITE_IMPRINT_URL` | Vercel Production | ja | nein | `https://<domain>/impressum` | STOP 7/8 |
| `VITE_SUPPORT_URL` | Vercel Production | ja | nein | `mailto:<adresse>` oder `https://…` | STOP 7/8 |
| `VITE_NATIVE_AUTH_REDIRECT_URL` | Vercel/Capacitor-Build | später (iOS) | nein | Universal Link `https://<domain>/auth` oder `<scheme>://auth` | iOS-Phase, nicht in 6B2 |
| `VITE_SUPABASE_URL` | Vercel Production (LEGACY) | heute ja, nach Cutover **entfernen** | öffentlich | `https://<produktions-ref>.supabase.co` | beim Cutover STOP 8 entfernen (Rollback C: wieder eintragen) |
| `VITE_SUPABASE_ANON_KEY` | Vercel Production (LEGACY) | heute ja, nach Cutover **entfernen** | öffentlich | anon/publishable Key | wie oben |

**Legacy-Env-Cutover:** Vor dem Entfernen die aktuellen Werte von `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` im Passwortmanager sichern und die ID des letzten LEGACY-Deployments notieren. Der Release-Check im Profil `production` schlägt fehl, solange eine der beiden Variablen gesetzt ist. Rollback siehe Runbook, Fall C.

Preview-Umgebung: Sie bleibt unverändert (Testprojekt `wochen-champion-test`). In 6B1 wurde sie nicht angefasst.

## 2. Supabase – Edge Function Secrets (Produktionsprojekt)

| Variable | System | Pflicht | sensitiv | Beispieltyp | wann setzen |
|---|---|---|---|---|---|
| `SUPABASE_URL` | Supabase (automatisch) | ja | nein | wird von der Plattform gesetzt | nie manuell |
| `SUPABASE_ANON_KEY` | Supabase (automatisch) | ja | öffentlich | wird von der Plattform gesetzt | nie manuell |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase (automatisch) | ja | **ja, streng geheim** | wird von der Plattform gesetzt; verlässt die Function nie | nie manuell |
| `SUPABASE_SECRET_KEYS` | Supabase (automatisch, neue Keys) | alternativ zu oben | **ja, streng geheim** | JSON, von der Plattform gesetzt | nie manuell |
| `WC_APP_ORIGIN` | Supabase Edge Secret | ja | nein | `https://<produktions-domain>` (exakt, ohne Slash am Ende) | STOP 7 (vor dem Deploy der Functions) |
| `WC_ALLOWED_ORIGINS` | Supabase Edge Secret | nein (später iOS) | nein | kommagetrennt, z. B. `capacitor://localhost` | iOS-Phase |
| `WC_ALLOW_DEV_ORIGINS` | Supabase Edge Secret | nein | nein | `false` (Standard in Produktion, auch wenn nicht gesetzt) | nicht setzen; nur Testprojekt nutzt Dev-Origins |

CORS-Regel (`supabase/functions/_shared/cors.js`):

- Erlaubt sind nur exakte Origins aus `WC_APP_ORIGIN` und `WC_ALLOWED_ORIGINS`.
- `localhost`, `127.0.0.1` und die Vercel-Previews gelten nur mit `WC_ALLOW_DEV_ORIGINS=true`.
- Ist `WC_ALLOW_DEV_ORIGINS` nicht gesetzt, sind die Dev-Origins nur im Testprojekt automatisch erlaubt.
- Tests: `tests/edgeCors.test.mjs` (Testmodus und Produktionssimulation).

## 3. Supabase – Auth / SMTP (Dashboard, keine Env-Datei)

Diese Werte werden im Supabase-Dashboard eingetragen (Authentication → Emails → SMTP Settings). Details: `SMTP_SETUP_CHECKLIST.md`, `PRODUCTION_AUTH_CONFIG.md`.

| Variable | System | Pflicht | sensitiv | Beispieltyp | wann setzen |
|---|---|---|---|---|---|
| SMTP Host | Supabase Auth | ja | nein | `smtp.<anbieter>.tld` | STOP 7 |
| SMTP Port | Supabase Auth | ja | nein | `587` (STARTTLS) oder `465` | STOP 7 |
| SMTP User | Supabase Auth | ja | ja | Anbieter-Benutzer/API-User | STOP 7 |
| SMTP Passwort / API-Key | Supabase Auth | ja | **ja, streng geheim** | nur im Dashboard eintragen, nie im Chat | STOP 7 |
| Absenderadresse / -name | Supabase Auth | ja | nein | `no-reply@<domain>` / „Wochen Champion“ | STOP 7 |
| Site URL / Redirect URLs | Supabase Auth | ja | nein | `https://<produktions-domain>` | STOP 7 |

## 4. Nur lokal für Migration und Checks (Shell, nie im Repo)

| Variable | System | Pflicht | sensitiv | Beispieltyp | wann setzen |
|---|---|---|---|---|---|
| `LEGACY_SUPABASE_URL` | lokale Shell (Backup-Export) | STOP 2 | nein | `https://<produktions-ref>.supabase.co` | STOP 2 |
| `LEGACY_SUPABASE_KEY` | lokale Shell (Backup-Export, nur lesend) | STOP 2 | öffentlich | anon/publishable Key | STOP 2 |
| `MIGRATION_TARGET_URL` | lokale Shell (Migration) | STOP 5/6 | nein | `https://<produktions-ref>.supabase.co` | STOP 6 |
| `MIGRATION_TARGET_PUBLISHABLE_KEY` | lokale Shell | STOP 6 | öffentlich | `sb_publishable_…` (Secret-Keys werden abgelehnt) | STOP 6 |
| `MIGRATION_OWNER_EMAIL` | lokale Shell | STOP 6 | ja (personenbezogen) | echte owner-Adresse (in Produktion kein `@example.com`) | STOP 6 |
| `MIGRATION_OWNER_PASSWORD` | lokale Shell | STOP 6 | **ja** | nur per `read -s` eingeben, nie in die History | STOP 6 |
| `MIGRATION_FAMILY_PIN` | lokale Shell | STOP 6 | **ja** | neue vierstellige Eltern-PIN | STOP 6 |
| `MIGRATION_FAMILY_NAME` | lokale Shell | STOP 6 | nein | Familienname in der App | STOP 6 |
| `WC_GO_SMTP_CONFIRMED` | lokale Shell (Release-Check `production`) | STOP 7 | nein | `yes`, erst nach erfolgreicher Testmail | STOP 7 |
| `WC_GO_LEGAL_CONFIRMED` | lokale Shell (Release-Check `production`) | STOP 7 | nein | `yes`, erst wenn Datenschutz/Impressum/Support öffentlich sind | STOP 7 |
| `SUPABASE_TEST_URL` / `SUPABASE_TEST_PUBLISHABLE_KEY` / `SUPABASE_TEST_PROJECT_NAME` | lokale Shell (Integrationstests) | nur Tests | öffentlich | Testprojekt | jederzeit (nur Testprojekt) |

## 5. Was nie gesetzt wird

- kein `service_role`- oder `sb_secret_…`-Key in Vercel oder in einer `VITE_…`-Variable (der Build und `src/config/backend.js` lehnen ihn ab)
- keine Datenbank-Passwörter im Repository oder in Skripten
- `VITE_FAMILY_SUPABASE_URL` in Production nie auf das Testprojekt (der Release-Check schlägt fehl)
