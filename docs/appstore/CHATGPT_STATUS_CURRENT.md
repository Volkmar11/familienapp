# CHATGPT – AKTUELLER ARBEITSSTAND „Wochen Champion“ → iOS / App Store

Stand: 27.09.2026, abends · Repository `volkmar11/familienapp` · Arbeitsbranch **`feature/appstore-v1`** (auf GitHub, nicht nach `main` gemergt)

## 1. Ziel und Rahmen

- **Ziel:** Die bestehende Web-App „Wochen Champion“ (React 18.3.1 + Vite 6.4.2 + Supabase, Deployment auf Vercel unter `https://familienapp.vercel.app`) wird zu einer öffentlichen iOS-App im App Store.
- **Architektur-Entscheidung:** Capacitor verpackt den gebündelten Web-Build. Vercel und Supabase bleiben. Keine Neuentwicklung in React Native.
- **Produktmodell:**
  - Eltern haben Konten (Supabase Auth). Kinder sind Profile ohne Konto.
  - Mehrere Eltern pro Familie sind möglich, die Familien sind strikt voneinander getrennt.
  - FREE / TRIAL / PREMIUM ist später geplant (StoreKit/IAP, serverseitig geprüfte Entitlements). Nichts davon ist implementiert.
  - Familieneinstellung `show_daily_crown`.
- **Nicht Teil des Projekts und unverändert:** `lehrerassistent/`, `lehrerassistent-v2/`, `vermarktung.html`, `lehrerassistent.html`, `.github/workflows/deploy-pages.yml`.

## 2. Abgeschlossene Phasen

| Phase | Inhalt | Ergebnis |
| --- | --- | --- |
| 1 | Baseline | `.gitignore`, `local-backups/` (ignoriert), `docs/appstore/PHASE_01_BASELINE.md`; Web-Build funktioniert |
| 2 | Datenverlust-Fix + Zielarchitektur | `load()` unterscheidet `loaded`/`empty`/`error`; nach einem Ladefehler gibt es kein Speichern, sondern einen Fehlerbildschirm mit „Erneut versuchen“; Speicherfehler werden angezeigt. SQL-Entwurf der Familienarchitektur, Starter-Inhalte `src/config/starterContent.js`, `docs/appstore/PHASE_02_ARCHITECTURE.md` |
| 3 | Datumsfix | `src/lib/dateUtils.js`: lokale Kalendertage in Europe/Berlin statt UTC; alte Sonntags-Wochenschlüssel werden per `normalizeWeekKey` auf Montag gehoben; 15/15 Unit-Tests (`node --test tests/dateUtils.test.mjs`) und 4/4 Browser-Szenarien |
| 3a | Einrichtung | Anleitungen `PHASE_03A_MANUAL_SETUP.md` und `SUPABASE_TEST_MIGRATION_SQL.md` |
| 3b | Testbackend | über den Supabase-Connector (MCP) umgesetzt, siehe Abschnitt 3 |

## 3. Supabase

| | Produktion | Test |
| --- | --- | --- |
| Projekt | „Familienapp“ | „wochen-champion-test“ |
| Referenz | `gkkzjmszcjivtaygbmfw` | `otejitifgcrrwmudrnhs` |
| Region | eu-west-1 | eu-central-1 (Frankfurt) |
| Tarif | Free (Organisation „Volkmar Familienapp“) | Free |
| Status | aktiv; war pausiert, vom Nutzer am 27.09. reaktiviert | aktiv |
| Schema | nur `public.app_state` (Zeile `family-main`, JSON-Dokument) | neue Familienarchitektur (13 Tabellen) |
| Client-Key | Publishable Key (im Web-Bundle) | Publishable Key + Legacy-Anon |

**Testprojekt, validiert:**

- **Migration** `supabase/migrations/20260927120000_family_architecture.sql` wurde nur dort angewendet, mit Schutzsperre `set app.migration_target = 'test'`. Die SQL-Datei ist unverändert, es wurden keine Fehler gefunden.
- **Tabellen (alle mit RLS, 47 Policies):** `families`, `family_members`, `family_settings`, `profiles`, `categories`, `category_assignments`, `tasks`, `task_assignments`, `rewards`, `reward_assignments`, `completions`, `redemptions`, `champion_history`.
- **Funktionen:** `public.create_family(p_name)` (SECURITY DEFINER, legt Familie, owner und Settings atomar an), `private.is_family_member`, `private.has_family_role`, `private.set_updated_at`.
- **Realtime** ist auf 8 Tabellen aktiv. `show_daily_crown` ist `boolean NOT NULL DEFAULT true`.
- **Tests:**
  - RLS-Matrix per SQL: **39/39 PASS** (`supabase/tests/rls_matrix_test.sql`, wiederholbar, räumt selbst auf)
  - Auth/REST/Realtime über supabase-js: **16/16 PASS** (`tests/supabase/auth-rls-realtime.test.mjs`, liest Werte nur aus Umgebungsvariablen)
  - Realtime: A empfängt eigene Änderungen und 0 Ereignisse von Familie B
- **Auth:** E-Mail/Passwort ist aktiv. **„Confirm email“ ist AUS** (vom Nutzer deaktiviert; geprüft: `signUp` liefert sofort eine Session).
- **Testkonten:** `wc-test-a@example.com` („Testfamilie A“) und `wc-test-b@example.com` („Testfamilie B“). Die Passwörter sind nicht gespeichert und müssen bei Bedarf neu gesetzt werden.
- **Supabase-Advisor:** nur der beabsichtigte Hinweis zu `create_family` als SECURITY DEFINER.

**Produktion:**

- **Backup von `family-main` erstellt:** nur lesend per REST-GET am 27.09.2026 um 19:52 Uhr, Datei `local-backups/family-main-20260927-195206.json` (265 KB).
- Inhalt: 5 Mitglieder, 361 Erledigungen, 23 Champions, `lastChampionWeek = "2026-09-20"` (altes UTC-Sonntags-Format), `updated_at` 27.09.2026 17:46 UTC.
- Die Datei ist geprüft und an den Nutzer übergeben, sie ist **nicht committet**.
- **Produktionsdaten verändert: NEIN.**

## 4. Offene Risiken / Befunde

1. **Sicherheit Produktion:** `app_state` ist mit dem öffentlichen Publishable Key **ohne Anmeldung lesbar**, vermutlich auch schreibbar (offene RLS). Enthalten sind Namen, Fotos und die Eltern-PIN der Familie. Die Behebung kommt mit der neuen Architektur (Auth + RLS).
2. **Deploy-Stand:** Vercel liefert noch den alten `main`-Stand vom 22.09.2026 aus, **ohne** Datenverlust- und Datumsfix. Ein PR `feature/appstore-v1` → `main` ist noch nicht erstellt; dafür ist eine Entscheidung des Nutzers nötig.
3. **Free-Tarif pausiert** das Produktionsprojekt bei Inaktivität. Dann lädt die Web-App keine Daten mehr.
4. **Migration `family-main`** in die neue Struktur ist geplant, aber nicht ausgeführt. Das Mapping steht in `PHASE_02_ARCHITECTURE.md`, Abschnitt 14. Pflicht dabei: `normalizeWeekKey` für `lastChampionWeek` und `championHistory[].week`, keinen PIN-Klartext übernehmen, Fotos von Base64 nach Storage.
5. `DEFAULT_MEMBERS` in `App.jsx` enthält noch die echten Familiennamen. Sie müssen mit dem Onboarding entfernt werden.
6. `npm audit` meldet 7 Schwachstellen in Dev-Abhängigkeiten (vite, postcss, ws). Sie sind noch nicht behoben.

## 5. Wichtige Dateien

- `docs/appstore/`: `PHASE_01_BASELINE.md`, `PHASE_02_ARCHITECTURE.md`, `PHASE_03_TEST_BACKEND.md`, `PHASE_03A_MANUAL_SETUP.md`, `PHASE_03B_TEST_BACKEND_RESULTS.md`, `SUPABASE_TESTPROJECT_SETUP.md`, `SUPABASE_TEST_MIGRATION_SQL.md`, alle `CHATGPT_HANDOFF_*.md`
- `src/App.jsx` (App, noch monolithisch), `src/lib/dateUtils.js`, `src/config/starterContent.js`
- `supabase/migrations/20260927120000_family_architecture.sql`, `supabase/tests/rls_matrix_test.sql`
- `tests/dateUtils.test.mjs`, `tests/supabase/auth-rls-realtime.test.mjs`

## 6. Arbeitsumgebung (Claude Code, Cloud)

- Der **Supabase-Connector (MCP)** ist verbunden und sieht die Organisation „Volkmar Familienapp“ mit beiden Projekten.
- Die Sicherheitsprüfung der Umgebung kann einzelne Aktionen am Produktionsprojekt blockieren, z. B. „restore_project“. Solche Schritte erledigt der Nutzer im Dashboard.
- Nur ausgehendes HTTPS über einen Proxy (keine direkten Postgres-Verbindungen). `*.supabase.co` ist erreichbar. Node 22 braucht `NODE_USE_ENV_PROXY=1`.
- Branch `feature/appstore-v1` wird regelmäßig gepusht. Die Umgebung ist flüchtig.

## 7. Empfohlene nächste Schritte

1. **Optional sofort:** Den PR `feature/appstore-v1` → `main` erstellen, damit Vercel den Datenverlust- und Datumsfix ausliefert. Nur mit Zustimmung des Nutzers; vorher auf einer Vercel-Preview testen.
2. **Phase 4: Auth-Frontend + Onboarding + neue Datenschicht**, ausschließlich gegen `wochen-champion-test`:
   - Login/Registrierung/Abmelden (E-Mail + Passwort), Session-Handling
   - Onboarding: `create_family` → Profile anlegen → Starter-Inhalte aus `starterContent.js` wählen; keine persönlichen Standarddaten
   - neue Datenschicht, z. B. `src/lib/familyData.js`, für die neuen Tabellen inkl. Realtime, bei möglichst unveränderter UI von `App.jsx`
   - `show_daily_crown` an `family_settings` anbinden
   - Umschalten Test/Produktion ausschließlich über Umgebungsvariablen; die bestehende Web-App bleibt bis zur Migration auf `app_state`
3. **Danach:** Migrationsskript `family-main` → neue Struktur, zuerst im Testprojekt mit einer Kopie des Backups, Punkteabgleich je Profil.
4. **Später:** PIN-Konzept, Kontolöschung in der App (Apple 5.1.1(v)), Capacitor/iOS, Datenschutz-Angaben, Entitlements/StoreKit.
