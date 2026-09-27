# CHATGPT – AKTUELLER ARBEITSSTAND „Wochen Champion“ → iOS / App Store

Stand: 27.09.2026 (nach Phase 4B) · Repository `volkmar11/familienapp` · Arbeitsbranch **`feature/appstore-v1`** (auf GitHub, nicht nach `main` gemergt) · letzter Commit `7499899`

## 1. Ziel und Rahmen

- **Ziel:** Die bestehende Web-App „Wochen Champion“ (React 18.3.1 + Vite 6.4.2 + Supabase, Vercel: `https://familienapp.vercel.app`) wird zu einer öffentlichen iOS-App im App Store.
- **Architektur:**
  - Capacitor verpackt den gebündelten Web-Build; Vercel und Supabase bleiben.
  - Neues Datenmodell mit Supabase Auth: Eltern haben Konten, Kinder sind Profile. Mehrere Eltern pro Familie sind möglich, die Familien sind strikt getrennt (RLS).
- **Zwei Backend-Modi** über `VITE_BACKEND_MODE`:
  - `legacy` (**Standard**): bestehende Produktion, `public.app_state` / `family-main`
  - `family`: neue Architektur, **nur gegen das Testprojekt**
  - Die Moduswahl wird schon zur Build-Zeit getroffen (`__WC_FAMILY_BUILD__` in `vite.config.js`). FAMILY-Builds enthalten keinen Legacy-Code und keine Entwicklerdaten, LEGACY-Builds keinen Auth- oder Onboarding-Code.
- **Später geplant, noch nicht umgesetzt:** FREE / TRIAL / PREMIUM (StoreKit/IAP, serverseitig geprüfte Entitlements). Keine Limits, keine Paywall.
- **Nicht Teil des Projekts, unverändert:** `lehrerassistent/`, `lehrerassistent-v2/`, `vermarktung.html`, `lehrerassistent.html`, `.github/workflows/deploy-pages.yml`.

## 2. Abgeschlossene Phasen

| Phase | Inhalt | Ergebnis |
| --- | --- | --- |
| 1 | Baseline | `.gitignore`, `local-backups/` (ignoriert), Baseline-Doku |
| 2 | Datenverlust-Fix + Zielarchitektur | `load()`: `loaded`/`empty`/`error`; nach einem Ladefehler kein Speichern; SQL-Entwurf, Starter-Inhalte |
| 3 | Datumsfix | `src/lib/dateUtils.js` (Europe/Berlin statt UTC, `normalizeWeekKey` für alte Sonntags-Wochenschlüssel) |
| 3a/3b | Testbackend | Testprojekt angelegt, Migration, RLS 39/39, Auth/REST/Realtime 16/16, Backup von `family-main` |
| 4A | Auth-Grundlage | Backend-Modi, Supabase-Clients getrennt, Registrierung/Login/Logout/Session/Passwort-Reset, Mitgliedschaftserkennung |
| **4B** | **Familien-Onboarding** | 7-stufiger Assistent, atomare und idempotente Anlage, Eltern-PIN (bcrypt), Familien-Startseite (Zwischenstand) |

## 3. Supabase

| | Produktion | Test |
| --- | --- | --- |
| Projekt | „Familienapp“ | „wochen-champion-test“ |
| Referenz | `gkkzjmszcjivtaygbmfw` | `otejitifgcrrwmudrnhs` |
| Region / Tarif | eu-west-1 / Free | eu-central-1 (Frankfurt) / Free |
| Schema | nur `public.app_state` (`family-main`) | Familienarchitektur (13 Tabellen) + `private.family_security` + `private.onboarding_requests` |
| Migrationen | keine neuen | `20260927120000_family_architecture`, `20260927200000_family_onboarding` (beide mit Testsperre `app.migration_target = 'test'`) |
| Auth | – | E-Mail/Passwort, **Confirm email AUS** |
| Daten verändert | **NEIN** | Testdaten nur „Testfamilie A/B“ und `wc-test-a`/`wc-test-b@example.com` |

**Backup:** `local-backups/family-main-20260927-195206.json` (265 KB; 5 Mitglieder, 361 Erledigungen, 23 Champions), nur lesend erstellt, an den Nutzer übergeben, **nicht committet**.

**RPCs im Testprojekt** (alle `SECURITY DEFINER`, `search_path = ''`, nur für `authenticated`):
- `create_family(p_name)`: ältere einfache Anlage; bleibt bestehen, wird von der App nicht mehr genutzt
- `create_family_with_onboarding(p_request_id, p_family_name, p_pin, p_children, p_tasks, p_rewards, p_settings)`: atomar, idempotent über `request_id`, validiert alle Eingaben serverseitig
- `verify_parent_pin(family_id, pin)`: 5 Fehlversuche führen zu 60 Sekunden Sperre
- `set_parent_pin(family_id, current_pin, new_pin)`

**Eltern-PIN:** 4 Ziffern, nur als bcrypt-Hash (Kostenfaktor 10) in `private.family_security` gespeichert; kein Client-Zugriff. `family_settings.parent_pin_hash` wurde entfernt. Die PIN ist nur ein UI-Gate, **kein** Ersatz für die Anmeldung.

**Assignments:** keine Zeile bedeutet „für alle Kinder sichtbar“ (wie `assignedTo: []` der Legacy-App); das Onboarding legt keine an.

## 4. Frontend-Struktur (FAMILY-Modus)

```
src/main.jsx                  Moduswahl (Build-Zeit), Konfigurationsfehler-Bildschirm
src/config/backend.js         VITE_BACKEND_MODE, Legacy-/Family-Konfiguration inkl. Schutzprüfungen
src/lib/supabaseLegacy.js     Client LEGACY (App.jsx)
src/lib/supabaseFamily.js     Client FAMILY
src/lib/auth.js               signUp/signIn/signOut/getSession/onAuthStateChange/requestPasswordReset/updatePassword
src/lib/familyMembership.js   Mitgliedschaften (none/single/multiple)
src/lib/onboarding.js         Assistent-Logik, Validierung, Payload, RPC
src/lib/familySummary.js      Übersicht für die Startseite
src/family/FamilyApp.jsx      Session → Login | Onboarding | Familienauswahl | Startseite
src/family/AuthScreen.jsx     Login, Registrieren, Passwort vergessen
src/family/onboarding/*       Wizard + 9 Schritte (je 15–90 Zeilen)
src/family/FamilyHome.jsx     Familien-Startseite (Zwischenstand bis 4C)
src/App.jsx                   LEGACY-App (monolithisch, unverändert seit 4A bis auf den Client-Import)
```

## 5. Tests (alle bestanden)

| Test | Datei | Ergebnis |
| --- | --- | --- |
| Datumslogik | `tests/dateUtils.test.mjs` | 15/15 |
| Backend-Modus/Konfiguration | `tests/backendConfig.test.mjs` | 10/10 |
| Onboarding-Logik + statische Prüfung „keine Entwicklerdaten, keine PIN in Storage/Log“ | `tests/onboarding.test.mjs` | 8/8 |
| Auth-Integration (Testprojekt) | `tests/supabase/family-auth.test.mjs` | 12/12 |
| Onboarding-/PIN-/Idempotenz-Integration (Testprojekt) | `tests/supabase/family-onboarding.test.mjs` | 29/29 |
| Auth/REST/Realtime (Testprojekt) | `tests/supabase/auth-rls-realtime.test.mjs` | 16/16 (3b) |
| RLS-Matrix (SQL) | `supabase/tests/rls_matrix_test.sql` | 39/39 (zuletzt nach 4B) |
| PIN-Admin-Prüfung (SQL) | `supabase/tests/onboarding_security_check.sql` | 8/8 |
| UI mobil (Chromium 393×852) | nicht versioniert (Cloud-spezifisch) | 4A: 27/27, 4B: 42/42 |

Die Wegwerf-Testkonten tragen die Präfixe `wc-p4a-`, `wc-p4b-` und `wc-rls-` und werden nach jedem Lauf gelöscht.

## 6. Offene Risiken / Befunde

1. **Produktion unsicher:** `app_state` ist mit dem öffentlichen Publishable Key ohne Anmeldung lesbar und vermutlich schreibbar (enthält Namen, Fotos und PIN). Behoben erst durch die Umstellung auf die neue Architektur.
2. **Deploy-Stand:** Vercel liefert noch den alten `main`-Stand (22.09.2026) **ohne** Datenverlust- und Datumsfix aus.
3. **Free-Tarif** pausiert das Produktionsprojekt bei Inaktivität (ist am 27.09. bereits passiert).
4. **Migration `family-main`** in die neue Struktur ist geplant, aber nicht ausgeführt. Das Mapping steht in `PHASE_02_ARCHITECTURE.md`, Abschnitt 14 (`normalizeWeekKey`, kein PIN-Klartext, Fotos nach Storage).
5. **Auth-Einstellungen im Testprojekt:** Site URL und Redirect-URLs für den Passwort-Reset fehlen noch. Laut Advisor ist „Leaked Password Protection“ aus. Für echte Nutzer ist ein eigenes SMTP nötig.
6. `npm audit`: 7 Schwachstellen in Dev-Abhängigkeiten (vite, postcss, ws), nicht behoben.

## 7. Offene Entscheidungen des Nutzers

- Sollen im Onboarding optional auch **Elternprofile** als Mitspieler angelegt werden? Die Legacy-App kennt Eltern als Punktesammler (`isAdmin`), `profiles.is_parent` ist vorhanden.
- Wo wird der FAMILY-Modus für Tests bereitgestellt: lokal (`.env.local`) oder als Vercel-Preview mit Preview-Variablen?
- Soll der Datenverlust- und Datumsfix vorab per PR nach `main` in die Produktion gehen?

## 8. Arbeitsumgebung (Claude Code, Cloud)

- **Supabase-Connector (MCP)** ist verbunden (Organisation „Volkmar Familienapp“, beide Projekte). Migrationen laufen per `apply_migration` **nur** im Testprojekt.
- Die Sicherheitsprüfung der Umgebung blockiert manche Produktionsaktionen (z. B. `restore_project`); solche Schritte erledigt der Nutzer im Dashboard.
- Nur ausgehendes HTTPS über einen Proxy. Für Node 22 ist `NODE_USE_ENV_PROXY=1` nötig. Chromium-Tests brauchen einen gezielten SPKI-Pin für die Proxy-CA.
- Branch `feature/appstore-v1` wird nach jeder Phase gepusht.

## 9. Nächste Phase: 4C (empfohlen)

Ziel: die bestehende Wochen-Champion-Oberfläche im FAMILY-Modus an das neue Datenmodell anbinden, weiterhin nur gegen das Testprojekt.

1. `src/lib/familyData.js`: alle Familiendaten laden und auf die bisherige `data`-Struktur abbilden, damit die UI von `App.jsx` möglichst unverändert bleibt
2. Schreiboperationen pro Aktion direkt auf die Tabellen (kein Whole-Document-Upsert)
3. Punkteberechnung (Woche/Monat/gesamt/verfügbar); Einlösen serverseitig absichern (RPC `redeem_reward`)
4. Bestätigungen über `require_confirmation` → `pending`/`confirmed`
5. Champion-Logik mit `dateUtils`, `week_start` (Montag) und idempotentem `champion_history`
6. Statistiken und Abzeichen aus den neuen Daten
7. Realtime auf die Familientabellen statt `app_state`
8. `show_daily_crown` auf der Startseite auswerten
9. Elternbereich an `verify_parent_pin` koppeln (Entsperrung nur im Speicher, mit Zeitablauf); PIN ändern über `set_parent_pin`
10. Tests: Integration, UI mobil, LEGACY-Regression; kein Merge nach `main`, keine Produktionsumstellung

**Danach (grob):** Migration von `family-main` (zuerst im Testprojekt), Kontolöschung in der App (Apple 5.1.1(v)), Capacitor/iOS, Datenschutzangaben, Entitlements/StoreKit, Umstellung der Produktion.

## 10. Wichtige Dokumente

`docs/appstore/`:
- `PHASE_01_BASELINE.md`, `PHASE_02_ARCHITECTURE.md`, `PHASE_03_TEST_BACKEND.md`, `PHASE_03A_MANUAL_SETUP.md`, `PHASE_03B_TEST_BACKEND_RESULTS.md`, `PHASE_04A_AUTH.md`, `PHASE_04B_ONBOARDING.md`
- `SUPABASE_TESTPROJECT_SETUP.md`, `SUPABASE_TEST_MIGRATION_SQL.md`
- alle `CHATGPT_HANDOFF_*.md`
