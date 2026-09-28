# CHATGPT HANDOFF – PHASE 7A

## 1. Ergebnis
- Phase erfolgreich: ja, für die Code-, Capacitor- und Projektseite (vollständig umgesetzt und getestet). Xcode-Build, Simulator und iPhone-Test stehen noch aus; die Sitzung lief unter Linux ohne Xcode (Abschnitt 2 und 6).
- Branch: `feature/appstore-v1` (Arbeit im Sitzungsbranch `claude/capacitor-ios-foundation-ylwf88`, per Fast-Forward nach `feature/appstore-v1` übernommen)
- Commit: `f0c1670` „feat: add capacitor ios foundation“; dazu dieser Handoff als Folgecommit „docs: add phase 7A handoff“
- Push: normal nach `origin/feature/appstore-v1` (Fast-Forward, kein Force) und nach `origin/claude/capacitor-ios-foundation-ylwf88`
- Produktionsmutation: keine. Produktion nur lesend geprüft (Abschnitt 15). Einzige Backend-Änderung: Deploy von `delete-account`/`delete-family` **ins Testprojekt** (CORS für `capacitor://localhost`).
- main verändert: nein (`8035896`)

## 2. Toolchain
- macOS: in der Sitzung keins (Ubuntu 24.04.4 LTS, Cloud-Sandbox). Nötig auf dem Mac: macOS Sequoia 15.6 oder neuer bzw. Tahoe 26 (für Xcode 26)
- Architektur: Sandbox x86_64; Mac des Nutzers Apple Silicon (MacBook Pro 2020, M1)
- Node: 22.22.2 (Capacitor 8 verlangt ≥ 22)
- npm: 10.9.7
- Xcode: in der Sitzung nicht vorhanden. Nötig: Xcode 26.0 oder neuer (Capacitor 8)
- xcode-select: in der Sitzung nicht vorhanden. Auf dem Mac muss es auf `/Applications/Xcode.app/Contents/Developer` zeigen
- Simulator Runtime: in der Sitzung keine. Xcode 26 bringt iOS 26 mit (Simulator iOS 15–26 möglich)
- Quellen: <https://capacitorjs.com/docs/updating/8-0> · <https://capacitorjs.com/docs/getting-started/environment-setup> · <https://developer.apple.com/xcode/system-requirements/>

## 3. Capacitor
- Version: 8.5.2 (npm `latest`; `next` 9.0.0-alpha bewusst nicht genutzt)
- @capacitor/core: 8.5.2
- @capacitor/cli: 8.5.2 (devDependency; `uuid`-Override für das transitive `xcode`-Paket, dadurch npm audit 0)
- @capacitor/ios: 8.5.2
- @capacitor/app: 8.1.1
- Package Manager iOS: Swift Package Manager (`ios/App/CapApp-SPM/Package.swift`; keine Podfile)
- webDir: `dist`
- server.url vorhanden: nein (kein `server`-Block, kein cleartext, kein allowNavigation; lokales Bundle)

## 4. App Identity
- App Name: Wochen Champion (`appName`, `CFBundleDisplayName`)
- Bundle ID: `de.volkmarsolutions.wochenchampion` (Debug + Release; keine weiteren Targets)
- Marketing Version: 0.1.0
- Build: 1 (Änderung: Xcode → Target „App“ → General → Identity)
- iOS Deployment Target: 15.0 (Minimum von Capacitor 8)
- App Icon: Capacitor-Entwicklungsicon (1024 px). Das PWA-Icon (512 px, eingebackene Rundung) ist kein iOS-Asset. **Offen:** finales 1024-px-Icon
- Launch Screen: schlichte Fläche in `#1e1b4b` (Standard-Splash mit Capacitor-Logo entfernt, kein Plugin)

## 5. Native Backend
- Backend Mode: `family` (LEGACY in der nativen App technisch ausgeschlossen)
- Supabase Projekt: `wochen-champion-test`
- Test-Ref: `otejitifgcrrwmudrnhs`
- Production-Ref im nativen Bundle: nein (0 Treffer in `dist/`, `ios/App/App/public`, nativer Konfiguration und Client-Code)
- app_state Zugriff: nein (0 Treffer im Bundle; 0 Requests im E2E)
- Native Test Guard: ja, dreifach:
  1. Env-Prüfung in `build:ios:test` und `vite --mode ios-test` (Prod-Ref, LEGACY-Werte, Secrets, HTTP, Produktions-Domain → Abbruch)
  2. Capacitor-Hooks vor `cap sync`/`cap copy` (Marker + Bundle-Scan; LEGACY-Build nachweislich abgelehnt)
  3. Laufzeit-Allowlist in `main.jsx` (nativ nur Test-Build gegen das Testprojekt; mit simulierter iOS-Bridge 4/4 geprüft)

## 6. iOS Project
- ios/ erzeugt: ja (`npx cap add ios --packagemanager SPM`, Syntax vorher per `--help` geprüft); versioniert ohne Web-Kopie und ohne generierte Configs
- Xcode-Projekt: `ios/App/App.xcodeproj` (Scheme „App“, UIScene/`SceneDelegate`)
- Swift Package Manager: ja (`capacitor-swift-pm` 8.5.2 exakt, `CapacitorApp` lokal)
- cap sync: erfolgreich (inklusive Schutz-Hook)
- xcodebuild: nicht ausgeführt (kein Xcode unter Linux); Befehl für den Mac in `PHASE_07A_CAPACITOR_XCODE.md` §10
- Ergebnis: Projekt vollständig vorbereitet; `npm run check:ios` 32 PASS, 1 WARN (kein macOS/Xcode), 0 FAIL

## 7. Lifecycle
- @capacitor/app: 8.1.1, nur nativ registriert (`src/lib/nativeAppState.js`)
- appStateChange: `isActive: true` → derselbe zentrale Vordergrund-Handler (`onAppForeground`)
- visibility/focus: unverändert, plus `online`
- Debounce: gemeinsame Entprellung (800 ms je Abonnent) über alle Quellen; das native Signal ist maßgeblich
- doppelte Reloads verhindert: ja. Unit-Tests: `appStateChange` + `visibilitychange` + `focus` ergeben genau einen Zyklus (auch in umgekehrter Reihenfolge); mit echtem Scheduler 1 Reload, 1 Champion-Sync, 1 Realtime-Reconnect
- Web weiterhin kompatibel: ja (im Web kein Plugin-Aufruf; LEGACY-Bundle ohne Capacitor)

## 8. Mobile UI
- viewport-fit: vorhanden (`viewport-fit=cover`). Bestehendes `user-scalable=no` wurde nicht hinzugefügt und nicht entfernt (geteilt mit LEGACY); Prüfung in 7B
- Safe Area: FAMILY-Rahmen jetzt vierseitig; Bottom-Sheets über dem Home-Indicator; Hauptansicht, Tab-Leiste, Onboarding wie bisher
- großes iPhone: 430 × 932 (Browser-Emulation des nativen Test-Builds): Home, Elternbereich, Dialog ohne horizontales Scrollen
- kleines iPhone: 375 × 667 (SE): Home und Elternbereich ohne horizontales Scrollen; zusätzlich 320 px ohne Überlauf
- horizontaler Scroll: keiner (430, 375, 320)
- 44pt Tippziele: erledigt (nur FAMILY). 104/104 Symbol-Buttons im Elternbereich ≥ 44 × 44; Gruppe bricht um. LEGACY pixelidentisch
- offene UI-Punkte: Gerätetest (Dynamic Island, Tastatur), `user-scalable=no`, iPad/Querformat (bewusst aus), App-Icon

## 9. Native Features v1
- Bildauswahl: `<input type="file" accept="image/*">` unverändert; Mediathek über den System-Picker ohne Berechtigung
- Camera Plugin: nein. Nur `NSCameraUsageDescription` (Deutsch), weil die Dateiauswahl „Foto aufnehmen“ anbietet (sonst Absturz)
- navigator.share: unverändert, kein Plugin; Verfügbarkeit in WKWebView am Gerät prüfen (7B)
- Clipboard Fallback: beibehalten
- externe Links: Capacitor 8 öffnet fremde URLs automatisch in Safari bzw. Mail; die App-WebView bleibt auf `capacitor://localhost`. Keine Abstraktion und kein Browser-Plugin nötig
- Realtime: Browser-WebSocket, keine Browser-only-Annahmen; Ziel `wss://otejitifgcrrwmudrnhs…`; Node-Suites grün; nativer Test am Gerät (7B)
- Session Restore: ja (Supabase-Session im WebView-`localStorage`; Neustart ohne Login im E2E nachgewiesen); keine Token-Kopie in native Stores

## 10. Simulator Test
- Simulator gestartet: nein (kein Xcode). Ersatz: identischer nativer Test-Build (`dist/`) in Chromium mit iPhone-Emulation gegen das Testprojekt, **23/23 PASS**
- App startet: ja (keine weiße Seite)
- Login: ja
- Registrierung: ja (Wegwerfkonto `@example.com`, danach über `delete-account` gelöscht)
- Onboarding: ja (7 Schritte → Familie angelegt)
- Family Home: ja
- Elternbereich: ja (serverseitige PIN)
- Logout/Login: ja
- Session Restore: ja
- JS-Fehler: keine (nur Sandbox-Proxy: WebSocket-Handshake 500, kein App-Fehler)
- Network Backend: nur `otejitifgcrrwmudrnhs.supabase.co` (+ lokaler Server); 0 Requests an die Produktions-Ref; 0 `app_state`; kein HTTP

## 11. Physical iPhone
- Gerätetest durchgeführt: nein
- falls nein, warum: Die Sitzung läuft in einer Linux-Cloud-Sandbox ohne Xcode und ohne angeschlossenes Gerät
- genaue nächste Nutzeraktion:
  1. Xcode 26 installieren
  2. `git pull`, `npm ci`
  3. `.env.ios-test.local` aus der Vorlage anlegen
  4. `npm run ios:test`, `npm run check:ios`, `npm run cap:open:ios`
  5. Simulator-Run, dann das iPhone mit Personal Team (11 Schritte in `PHASE_07A_CAPACITOR_XCODE.md` §14)
- Apple Developer Program erforderlich: nein für 7A (kostenloses Personal Team genügt; Profil 7 Tage gültig, max. 3 Geräte). Ja ab 7B (Associated Domains) und Phase 9 (TestFlight/App Store). Quelle: <https://developer.apple.com/support/compare-memberships/>

## 12. Security
- Service Role: nicht vorhanden (Build-Schutz + Bundle-Scan mit JWT-Rollenprüfung)
- Secrets: keine; nur der Publishable Key des Testprojekts im Bundle (erwartet öffentlich); echte Werte nur in `.env.ios-test.local` (ignoriert)
- Production Ref: nicht im Bundle, nicht in der nativen Konfiguration, nicht im Client-Code (nur als Sperrliste im Node-Skript)
- family-main: 0 Treffer
- persönliche Legacy Daten: 0 Treffer (keine Legacy-Namen, keine Fotos, kein Base64-Bild)
- ATS Ausnahme: keine
- HTTP: keins (nur HTTPS/WSS; Build-Schutz lehnt `http://` ab)

## 13. Regression
- Unit: 173/173 (neu: 18 × `nativeIos`, 1 × CORS)
- Family Integration: data 18/18, mutations 44/44, admin 60/60, two-device 27/27, onboarding 29/29 (vorher und nachher je grün)
- Auth: 13/13
- Invitations: 49/49
- Media: 31/31
- Realtime: champion-realtime 17/17
- Account Lifecycle: 34/34 (nach dem CORS-Deploy im Testprojekt)
- Legacy: 6/6 Ansichten pixelidentisch alt/neu (Supabase abgefangen), 0 JS-Fehler, 0 × Capacitor im LEGACY-Bundle
- npm audit: 0
- Ergebnis:
  - grün (Integration 10/10 Suites, 322/322)
  - Release-Check `preview`: 0 FAIL
  - PRE-GO auf dem Commit: 31 PASS, 3 EXTERN, 0 FAIL
  - Bootstrap-Generalprobe 22/22

## 14. Projektübergabe
- PROJECT_MASTER_HANDOFF erstellt: ja (`docs/appstore/PROJECT_MASTER_HANDOFF.md`; `CHATGPT_STATUS_CURRENT.md` als veraltet markiert)
- neueste Handoff-Datei: `docs/appstore/CHATGPT_HANDOFF_PHASE_07A.md`
- neue Claude-Sitzung künftig möglich: ja (Einstieg: Master-Handoff → dieser Handoff → `PHASE_07A_CAPACITOR_XCODE.md`)

## 15. Produktion
- Supabase Production: unverändert (nur lesend geprüft): nur `public.app_state` mit 3 Policies und Realtime, kein `private`-Schema, keine Migrationstabelle, 0 Auth-User, 0 Buckets, 0 Edge Functions. `family-main` vorhanden (1 Zeile); letzte Änderung 28.09.2026 12:02 UTC, vor Beginn dieser Sitzung (normale LEGACY-Nutzung)
- Vercel Production: unverändert (HTTP 200, LEGACY-Bundle, kein FAMILY-/Capacitor-Code)
- family-main: nicht angefasst
- Production Cutover: nein
- Phase 6B2 begonnen: nein

## 16. Offene Punkte für Phase 7B
Insbesondere:
- echter iPhone-Test: dazu Xcode-CLI-Build und Simulator (groß und klein) auf dem Mac nachholen
- App Lifecycle Gerätetest: Hintergrund/Vordergrund, Sperre, Kontrollzentrum, nach der Fotoauswahl je höchstens ein Refresh; Realtime nach dem Aufwachen
- Fotos: Mediathek und Kamera-Dialog (deutscher Text), HEIC-Verarbeitung, Upload
- Share Sheet: `navigator.share` in WKWebView, Clipboard-Fallback
- Tastatur: Formulare, PIN, Bottom-Sheets; ggf. Resize-Modus festlegen
- Safe Area: Dynamic Island und Home-Indicator am Gerät; `user-scalable=no` prüfen bzw. entfernen
- Universal Links: Domain und `apple-app-site-association`
- Auth Recovery Deep Link: `VITE_NATIVE_AUTH_REDIRECT_URL`, `appUrlOpen`, PKCE, Supabase-Redirects
- Invite Deep Link: `appUrlOpen` → Einladungslogik, `VITE_INVITE_BASE_URL` auf die finale Domain
- Associated Domains: Entitlement (braucht das Apple Developer Program)
- App Icon final: 1024 × 1024, ohne Transparenz und Rundung
- Apple Developer Enrollment: Entscheidung und Durchführung nur durch den Nutzer
- außerdem: iPad/Querformat ja/nein; In-App-Browser für Links ja/nein; in Produktion später `WC_ALLOWED_ORIGINS=capacitor://localhost`

## 17. Empfehlung nächster Schritt

1. Auf dem Mac Xcode 26 aus dem App Store installieren, einmal starten, Komponenten und iOS-26-Simulator laden; `xcode-select -p` prüfen.
2. `git switch feature/appstore-v1 && git pull --ff-only && npm ci`.
3. `.env.ios-test.local` aus `.env.ios-test.example` anlegen (nur Testprojekt-URL und Publishable Key; LEGACY leer).
4. `npm run ios:test` und `npm run check:ios`. Erwartet: 0 FAIL, Toolchain-Zeilen PASS.
5. `xcodebuild … -destination 'generic/platform=iOS Simulator' build` (Befehl in §10 der Phasendoku) → `BUILD SUCCEEDED`.
6. Simulator-Checkliste (§11 der Phasendoku) auf einem großen und einem kleinen iPhone abarbeiten; Web-Inspector prüft Netzwerk und JS-Fehler.
7. iPhone 17 Pro Max mit Personal Team starten (§14): Developer Mode, Signing, Run, Entwickler vertrauen.
8. Ergebnisse (Screens, Auffälligkeiten) zurückmelden; danach Phase 7B planen.
9. Parallel entscheiden: Apple Developer Program (für 7B/9), finales App-Icon, iPad/Querformat.
10. Unabhängig davon für 6B2: Domain, SMTP und Rechtstexte vorbereiten (Cutover erst nach ausdrücklicher Freigabe).
