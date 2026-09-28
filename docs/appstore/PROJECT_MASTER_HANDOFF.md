# PROJECT MASTER HANDOFF – „Wochen Champion“ → iOS / App Store

> **Einstieg für jede neue Claude-Code- oder ChatGPT-Sitzung.** Kompakt; die Details stehen in den Phasen-Handoffs.
> Stand: **nach Phase 7A** (28.09.2026). **Neueste Handoff-Datei: `docs/appstore/CHATGPT_HANDOFF_PHASE_07A.md`.**
> Enthält bewusst keine Secrets, Passwörter, PINs, Invite-Tokens oder persönlichen Daten.

## 1. Repository und Branch

- Repository: `volkmar11/familienapp`
- **Arbeitsbranch: `feature/appstore-v1`.** Nie direkt nach `main` mergen; `main` = Produktions-Web (LEGACY), Stand `8035896`.
- Remote-Sitzungen arbeiten ggf. auf einem Sitzungsbranch (`claude/…`), der von `feature/appstore-v1` abzweigt und per Fast-Forward dorthin übernommen wird.
- **Nicht Teil des Projekts, nicht anfassen:**
  - `lehrerassistent/`, `lehrerassistent-v2/`, `lehrerassistent.html`, `vermarktung.html`
  - `.github/workflows/deploy-pages.yml`
- **Verbindliche Quelle:** Git-Stand und die Dokumente unter `docs/appstore/`. Kein Verlass auf alte Chat-Verläufe.

## 2. Architektur (Kurzfassung)

- **Web-App:** React 18 + Vite 6 + Supabase JS 2, gehostet auf Vercel (`https://familienapp.vercel.app`, heute LEGACY).
- **Zwei Backend-Modi** über `VITE_BACKEND_MODE`, entschieden zur **Build-Zeit** (`__WC_FAMILY_BUILD__` in `vite.config.js`; der jeweils andere Zweig fehlt im Bundle):
  - `legacy` (Standard, Produktion heute): eine JSON-Zeile `public.app_state` / `family-main`, anon-Zugriff, `src/App.jsx`
  - `family` (neu): Supabase Auth, Eltern-Konten, Kinder als Profile, mehrere Eltern pro Familie, strikte RLS, `src/family/*`
- Gemeinsame Oberfläche: `src/shared/ChampionApp.jsx` (Schalter `fam`; FAMILY-only-Änderungen immer an `fam` koppeln, LEGACY bleibt unverändert).
- **iOS (seit 7A):**
  - Capacitor 8 packt den lokal gebauten FAMILY-Web-Build (`dist/`) in eine native App, kein Remote-Wrapper
  - Xcode-Projekt unter `ios/` (Swift Package Manager)
  - nur Test-Build gegen das Testprojekt
- **Backend-Logik:** SQL-RPCs (`SECURITY DEFINER`, fester `search_path`), RLS auf allen Tabellen, Realtime (`family_sync`, `user_membership_sync`), privater Storage-Bucket `family-media`, Edge Functions `delete-account` / `delete-family`.

## 3. Supabase-Projekte

| | Produktion | Test |
|---|---|---|
| Name | „Familienapp“ | „wochen-champion-test“ |
| Ref | `gkkzjmszcjivtaygbmfw` | `otejitifgcrrwmudrnhs` |
| Inhalt | nur `public.app_state` (`family-main`, 3 Policies, Realtime); 0 Auth-User, 0 Buckets, 0 Edge Functions | vollständiges FAMILY-Schema (10 Migrationen), Edge Functions v3, Bucket `family-media` |
| Auth | – | E-Mail/Passwort, Confirm Email AUS (Test) |
| Nutzung | LEGACY-Produktion der Familie | Entwicklung, Integrationstests, Vercel-Preview, **native iOS-Test-App** |

## 4. Sicherheitsregeln (immer gültig)

1. **Produktion nur lesend**, ohne ausdrückliche Freigabe nichts ändern:
   - keine Migration, kein Edge-Deploy, keine Auth-/Storage-Änderung am Produktionsprojekt
   - keine Vercel-Production-Änderung
   - kein Schreibzugriff auf `family-main`
   - kein Merge nach `main`
2. **Cutover (6B2) nur nach Runbook** `PRODUCTION_CUTOVER_RUNBOOK.md` (STOP 1–8, STOP 8 nur mit wörtlicher Freigabe).
3. **Keine Secrets im Repo, in Logs oder im Chat.**
   - Nur Publishable Keys gehören in den Client.
   - Nie `service_role`/`sb_secret_…` im Client; der Build und `src/config/backend.js` lehnen das ab.
   - Echte Werte stehen nur in `.env*.local` (ignoriert), Vercel oder Supabase.
4. **FAMILY nie gegen Produktion testen**, bevor der Cutover freigegeben ist. Die native App ist in 7A **nur Test**:
   - Build-, Hook- und Laufzeit-Schutz verhindern die Produktions-Ref
   - LEGACY kann nicht in den nativen Container gelangen
5. Integrationstests legen nur Wegwerf-Konten `…@example.com` an und löschen sie über `delete-account`.
6. **Keine Test-Hintertüren** in Migrationen oder im Bundle (Release-Check prüft das).
7. Push normal, **kein Force-Push**; sauberer Arbeitsbaum vor jedem Phasenabschluss.

## 5. Abgeschlossene Phasen

| Phase | Inhalt | Handoff |
|---|---|---|
| 1 | Baseline, `.gitignore`, Doku | `CHATGPT_HANDOFF_PHASE_01.md` |
| 2 | Datenverlust-Fix (`load` → loaded/empty/error), Zielarchitektur | `…_02.md` |
| 3 / 3A / 3B | Datumsfix (Europe/Berlin), Testprojekt + Migration + RLS, `family-main`-Backup | `…_03.md`, `…_03A.md`, `…_03B.md` |
| 4A | Auth (Registrierung, Login, Reset), Backend-Modi | `…_04A.md` |
| 4B | Onboarding-Assistent, Eltern-PIN (bcrypt) | `…_04B.md` |
| 4C1 / 4C2A / 4C2B1 / 4C2B2 | Familiendaten → UI, Kerninteraktionen, Elternverwaltung, Realtime + Wochen-Champion | `…_04C1.md` … `…_04C2B2.md` |
| 5A | Legacy→Family-Migration (Test) | `…_05A.md` |
| 5B | privater Medien-Storage (EXIF-frei, signierte URLs) | `…_05B.md` |
| 5C | Konto & Sicherheit, Account-/Familienlöschung (Edge Functions) | `…_05C.md` |
| 5D | Einladungen mehrerer Eltern (Link + Code) | `…_05D.md` |
| 6A | Produktions-/iOS-Audit, Zeilengrenzen-Fix, Release-Check, **Feature Freeze** | `…_06A.md` |
| 6B1 | Produktionspaket: Bootstrap-Generator, Migrationsmodus, Generalprobe, PRE-GO 0 FAIL | `…_06B1.md` |
| **7A** | **Capacitor 8 + Xcode-Projekt (SPM), nativer Lifecycle, Test-Build-Schutz, Safe Area, 44-pt-Tippziele** | **`CHATGPT_HANDOFF_PHASE_07A.md`** |

## 6. Wichtige Dateien

**App:**
- `src/main.jsx`: Moduswahl, Konfigurationsfehler, nativer Start-Schutz (nur FAMILY)
- `src/config/backend.js`: Modus, Konfiguration, Schutz
- `src/config/legal.js`: Rechtslinks
- `src/config/nativeTarget.js`: App-ID, Name, Test-Ref, Laufzeitprüfung
- `src/family/*`: FAMILY-Oberfläche (`FamilyApp.jsx`, `FamilyChampion.jsx`, `AuthScreen.jsx`, `AccountSecurity.jsx`, `InviteScreen.jsx`, `onboarding/`, `nativeBoot.js`)
- `src/lib/*`:
  - Daten, Mutationen, Realtime, Medien, Einladungen, Auth, Redirects, Lifecycle
  - `appLifecycle.js` + `nativeAppState.js` + `nativePlatform.js` (7A)
  - `reloadScheduler.js`
- `src/shared/ChampionApp.jsx`: gemeinsame UI
- `src/App.jsx` + `src/legacy/*`: LEGACY

**Backend:**
- `supabase/migrations/*`: 10 Migrationen, alle mit Test-Guard
- `supabase/functions/*` (+ `_shared/cors.js`, `lifecycle.ts`)
- `supabase/tests/*`
- `supabase/production/*`: Bootstrap-Manifest, erwarteter Fingerabdruck

**Skripte:**
- `check-release-readiness.mjs` (Profile preview / pre-go / production)
- `generate-production-bootstrap.mjs`, `rehearse-production-bootstrap.mjs`
- `migrate-legacy-family.mjs` (+ `lib/productionMigration.mjs`), `export-legacy-backup.mjs`, `generate-redemption-import.mjs`
- **iOS:** `build-ios-test.mjs`, `check-native-web-bundle.mjs` (Capacitor-Hook), `check-ios-readiness.mjs`, `lib/iosTestGuard.mjs`

**iOS:**
- `capacitor.config.json`
- `ios/App/App.xcodeproj`, `ios/App/App/Info.plist`, `ios/App/CapApp-SPM/Package.swift`
- `.env.ios-test.example`

**Tests:**
- `tests/*.test.mjs`: Unit, `node --test tests/*.test.mjs`
- `tests/supabase/*.test.mjs`: Integration gegen das Testprojekt

**Doku (Referenz):**
- `PRODUCTION_CUTOVER_RUNBOOK.md`, `PRODUCTION_MIGRATION_PLAN.md`, `PRODUCTION_ENVIRONMENT.md`, `PRODUCTION_AUTH_CONFIG.md`
- `SMTP_SETUP_CHECKLIST.md`, `APP_PRIVACY_DATA_MAP.md`, `IOS_RELEASE_ROADMAP.md`
- `PHASE_07A_CAPACITOR_XCODE.md`

## 7. Befehle

```bash
npm ci
node --test tests/*.test.mjs                                   # Unit (173)
SUPABASE_TEST_URL=https://<test-ref>.supabase.co SUPABASE_TEST_PUBLISHABLE_KEY=<publishable> \
  SUPABASE_TEST_PROJECT_NAME=wochen-champion-test NODE_USE_ENV_PROXY=1 node tests/supabase/<suite>.test.mjs
node scripts/check-release-readiness.mjs [--profile pre-go|production]
npm run ios:test && npm run check:ios && npm run cap:open:ios   # iOS (Mac mit Xcode 26)
npm audit                                                      # Ziel: 0
```

## 8. Production Status

- **Produktion = LEGACY**, unverändert:
  - Vercel liefert LEGACY
  - Supabase-Produktion hat nur `app_state`
  - kein FAMILY-Schema, 0 Auth-User, 0 Buckets, 0 Edge Functions
- **Phase 6B2 (Cutover): noch nicht begonnen.** Technisch bereit (PRE-GO 0 technische FAILs). Externe Voraussetzungen offen:
  - eigene Domain
  - SMTP-Anbieter (SPF/DKIM/DMARC)
  - veröffentlichte Datenschutzerklärung, Impressum, Support
  - Wartungsfenster, owner-Konto

## 9. iOS Status (nach 7A)

- Capacitor **8.5.2** (core, cli, ios), `@capacitor/app` **8.1.1**, **SPM**, `webDir` = `dist`, **kein `server.url`**.
- App-Identität:
  - „Wochen Champion“, `de.volkmarsolutions.wochenchampion`
  - Version 0.1.0 (1), iOS 15.0
  - nur iPhone, Hochformat
- **Nur Test-Backend.** Dreifacher Schutz:
  1. Env-Prüfung in Build und `vite --mode ios-test`
  2. Capacitor-Hooks vor `sync`/`copy` (Marker + Bundle-Scan)
  3. Laufzeit-Allowlist in der App
- Nativer Lifecycle: `appStateChange` → dieselbe entprellte Vordergrund-Logik wie `visibilitychange`/`focus`/`online`; genau ein Refresh-Zyklus.
- Sonst umgesetzt:
  - Safe Area vierseitig (FAMILY), Tippziele ≥ 44 px (FAMILY)
  - Launch Screen in App-Farbe
  - einzige Berechtigung: `NSCameraUsageDescription`
  - Edge-CORS erlaubt `capacitor://localhost` im Testprojekt
- **Noch nicht auf dem Mac gebaut:** Die 7A-Sitzung lief unter Linux ohne Xcode. Xcode-Build, Simulator und iPhone-Test sind die nächsten Nutzeraktionen (`PHASE_07A_CAPACITOR_XCODE.md` §10, §11, §14).
- App-Icon: noch Capacitor-Entwicklungsicon (finales 1024-px-Icon offen).

## 10. Offene Punkte (Auswahl)

- **Nutzer:**
  - Xcode 26 installieren
  - Simulator- und iPhone-Test (Personal Team genügt)
  - Entscheidung Apple Developer Program
  - finales App-Icon
  - Domain, SMTP, Rechtstexte (für 6B2 und 7B)
- **7B:**
  - Gerätetest: Lifecycle, Fotos/Kamera, Share Sheet, Tastatur, Safe Area
  - Universal Links / Associated Domains, `appUrlOpen` für Recovery und Einladungen
  - `user-scalable=no` prüfen
- **Produktion vor der nativen Produktions-App:** Edge-Secret `WC_ALLOWED_ORIGINS=capacitor://localhost` (nach dem Cutover).
- **Entscheidungen:** iPad/Querformat, In-App-Browser für Links, Premium/StoreKit (Phase 8) vor oder nach dem ersten Release.

## 11. Roadmap

1. **7A-Abschluss auf dem Mac:** `npm run ios:test`, `xcodebuild`, Simulator (groß und klein), dann iPhone mit Personal Team.
2. **6B2 – Produktions-Cutover** (nach Domain, SMTP, Rechtstexten; Runbook STOP 1–8). Kann vor oder parallel zu 7B laufen.
3. **7B – Deep Links und Gerät:** Universal Links (Developer Program nötig), Recovery-/Invite-Deep-Link, Gerätetest, App-Icon final.
4. **8 – Premium/Trial/StoreKit** (Geschäftsmodell zuerst; optional nach dem ersten Release).
5. **9 – TestFlight, App-Store-Assets, Datenschutzangaben, Review-Demo-Konto, Einreichung** (erst mit Freigabe; Version 1.0.0).

## 12. Welche Datei ist aktuell?

- **Neueste Handoff-Datei:** `docs/appstore/CHATGPT_HANDOFF_PHASE_07A.md`
- **Diese Datei** ist der Einstieg und wird bei jedem Phasenabschluss aktualisiert.
- `CHATGPT_STATUS_CURRENT.md` ist **veraltet** (Stand 4B) und nur noch historisch.
- Eine neue Claude-Sitzung liest: diese Datei → neuester Handoff → die im Auftrag genannten Detaildokumente → `git log`.
