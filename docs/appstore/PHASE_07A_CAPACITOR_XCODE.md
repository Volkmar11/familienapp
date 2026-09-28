# Phase 7A – Capacitor & Xcode

- **Ziel:** Die bestehende React/Vite-FAMILY-App läuft erstmals als native iOS-App (Capacitor) – als **TEST-App** ausschließlich gegen das Testprojekt `wochen-champion-test` (`otejitifgcrrwmudrnhs`).
- **Nicht in 7A:** Universal Links, Associated Domains, Produktions-Backend, App Store Connect, TestFlight, StoreKit, Push, native Kamera, Social Login.
- **Produktion:** unverändert (Abschnitt 12 und Handoff §15).

---

## 1. Toolchain

| | Sandbox (diese Sitzung) | Mac des Nutzers (Voraussetzung) |
|---|---|---|
| Betriebssystem | Ubuntu 24.04.4 LTS (Linux) | macOS **Sequoia 15.6 oder neuer** (Xcode 26) bzw. macOS Tahoe 26 |
| Architektur | x86_64 | Apple Silicon (MacBook Pro 2020, M1) |
| Node | 22.22.2 | **≥ 22** (Capacitor 8) |
| npm | 10.9.7 | mitgeliefert |
| Xcode / `xcodebuild` | **nicht vorhanden** (Linux) | **Xcode 26.0 oder neuer** |
| `xcode-select -p` | – | muss auf `/Applications/Xcode.app/Contents/Developer` zeigen |
| Simulator-Runtimes | – | iOS 26 (mit Xcode), weitere über Xcode → Settings → Components |

Quellen:
- Capacitor 8: „Capacitor 8 requires Xcode 26.0+“, „NodeJS 22 or greater“, Deployment Target iOS 15.0, SPM ist Standard – <https://capacitorjs.com/docs/updating/8-0>, <https://capacitorjs.com/docs/getting-started/environment-setup>
- Xcode 26: macOS Sequoia 15.6 bis Tahoe 26.x, SDK iOS 26, Simulator iOS 15–26 – <https://developer.apple.com/xcode/system-requirements/>

**Folge:** Code-, Capacitor- und Projektseite sind vollständig umgesetzt und geprüft. **Xcode-Build, Simulator und Gerät** können erst auf dem Mac laufen. Die exakten Schritte stehen in Abschnitt 10, 11 und 14. `npm run check:ios` meldet die Toolchain auf dem Mac automatisch (`xcodebuild -version`, `xcode-select -p`, `xcrun simctl list runtimes`).

## 2. Capacitor Version

- Geprüft per `npm view` (dist-tags): `latest` = **8.5.2** (`@capacitor/core`, `cli`, `ios`), `@capacitor/app` `latest` = **8.1.1**. Nicht verwendet: `next` = 9.0.0-alpha, `nightly`, `dev`.
- Installiert:

| Paket | Version | Abschnitt in `package.json` |
|---|---|---|
| `@capacitor/core` | 8.5.2 | dependencies |
| `@capacitor/ios` | 8.5.2 | dependencies |
| `@capacitor/app` | 8.1.1 | dependencies (nativer Lebenszyklus) |
| `@capacitor/cli` | 8.5.2 | devDependencies |

- Alle Kernpakete haben **Major 8**. Keine weiteren Plugins: kein Camera, Push, StoreKit, Analytics, Ads, Browser, Share, Splash.
- **npm audit:** Nach der Installation meldete npm 3 × moderate (`uuid` < 11.1.1 über `@capacitor/cli` → `xcode` → `uuid@7`, GHSA-w5hq-g745-h8pq).
  - `xcode` nutzt nur `uuid.v4()` ohne Buffer-Argument, die Lücke ist also nicht ausnutzbar.
  - `npm audit fix --force` hätte die CLI auf 8.4.3 herabgestuft (andere Minor-Version als `ios`).
  - Stattdessen gezielter Override in `package.json`: `"overrides": { "xcode": { "uuid": "^11.1.1" } }`. uuid 11 unterstützt weiterhin `require()`, `v4()` ist geprüft.
  - Ergebnis: **0 vulnerabilities**.

## 3. App Identity

| Wert | Einstellung | Ort |
|---|---|---|
| App-Name (Home-Screen) | **Wochen Champion** | `capacitor.config.json` `appName`; `ios/App/App/Info.plist` `CFBundleDisplayName` |
| Bundle Identifier | **de.volkmarsolutions.wochenchampion** | `capacitor.config.json` `appId`; Xcode Target „App“ → `PRODUCT_BUNDLE_IDENTIFIER` (Debug + Release) |
| Marketing Version | **0.1.0** | Xcode → Target „App“ → General → Identity → *Version* (`MARKETING_VERSION` in `project.pbxproj`) |
| Build | **1** | Xcode → Target „App“ → General → Identity → *Build* (`CURRENT_PROJECT_VERSION`) |
| iOS Deployment Target | **15.0** (Minimum von Capacitor 8, nicht höher) | Target „App“ → General → Minimum Deployments; `CapApp-SPM/Package.swift` `.iOS(.v15)` |
| Gerätefamilie | **nur iPhone** (`TARGETED_DEVICE_FAMILY = 1`) | Target „App“ → General → Supported Destinations |
| Ausrichtung (iPhone) | nur Hochformat (wie `public/manifest.json` `orientation: portrait`) | `Info.plist` `UISupportedInterfaceOrientations` |
| Entwicklungssprache | `de` (System-Dialoge wie die Bildauswahl erscheinen deutsch) | `Info.plist` `CFBundleDevelopmentRegion` |

- Es gibt keine zusätzlichen Targets (keine Test-Targets) und keine weitere oder zufällige Bundle-ID.
- Der Repository-Name „familienapp“ kommt im nativen Projekt nicht vor (Unit-Test).
- **Version später ändern:** in Xcode im Target „App“ unter General → Identity (Version bzw. Build). Für jeden TestFlight-Upload muss Build steigen; 1.0.0 erst zur Einreichung (Phase 9).
- **iPad / Querformat:** bewusst aus, um keine iPad-Screenshots und keinen iPad-Review auszulösen. Umkehrbar über Supported Destinations bzw. Orientations. Die Entscheidung liegt beim Nutzer (Handoff §16).

## 4. iOS Project

- Befehl nach Prüfung von `npx cap add --help` (Option `--packagemanager <CocoaPods|SPM>`): `npx cap add ios --packagemanager SPM`.
- Paketverwaltung ist **Swift Package Manager**: keine Podfile, kein CocoaPods. `ios/App/CapApp-SPM/Package.swift` wird von der CLI verwaltet und bindet `capacitor-swift-pm` 8.5.2 exakt sowie `@capacitor/app` lokal aus `node_modules` ein.
- Capacitor 8 erzeugt das Projekt mit `SceneDelegate.swift` (UIScene-Lebenszyklus).
- **Versioniert** in `ios/`:
  - `App.xcodeproj`
  - `App/` (Swift-Dateien, `Info.plist`, Storyboards, `Assets.xcassets`)
  - `CapApp-SPM/`
  - `debug.xcconfig`
- **Nicht versioniert** (`ios/.gitignore` der CLI):
  - `App/App/public` (Web-Kopie)
  - `App/App/capacitor.config.json` und `config.xml` (generiert)
  - `capacitor-cordova-ios-plugins`, `DerivedData`, `xcuserdata`, `Pods`
- Zusätzlich im Wurzel-`.gitignore`: `xcuserdata/`, `*.xcuserstate`, `DerivedData/`.
- **Konsequenz:** Nach einem frischen Clone ist `ios/App/App/public` leer. Vor dem Öffnen in Xcode immer `npm run ios:test` ausführen (Abschnitt 5).

**Capacitor-Konfiguration** `capacitor.config.json`: JSON statt TS, weil `capacitor.config.ts` TypeScript als zusätzliche Abhängigkeit verlangen würde. Das Projekt ist reines JavaScript.

```json
{ "appId": "de.volkmarsolutions.wochenchampion", "appName": "Wochen Champion", "webDir": "dist",
  "backgroundColor": "#1e1b4b", "ios": { "contentInset": "never", "backgroundColor": "#1e1b4b" } }
```

- Es gibt **keinen `server`-Block**: kein `server.url`, kein `cleartext`, kein `allowNavigation`. Die App lädt das lokal gebündelte Web-Bundle (`capacitor://localhost`) und ist kein Remote-Wrapper.
- `backgroundColor` verhindert einen weißen Blitz vor dem ersten Rendern. `contentInset: never` bedeutet: Die Safe Area regelt CSS (Abschnitt 8).

## 5. Build Pipeline

```
Web-Code ändern
  → npm run build:ios:test     FAMILY-Test-Build nach dist/ (Env-Prüfung, vite --mode ios-test, Marker, Bundle-Scan)
  → npm run cap:sync:ios       npx cap sync ios (Hook prüft dist/ vor dem Kopieren)
  → npm run cap:open:ios       Xcode öffnen (nur macOS) → Run
Kurzform:  npm run ios:test   (= build:ios:test + cap:sync:ios)
Prüfung:   npm run check:ios  (scripts/check-ios-readiness.mjs, ohne Netzwerk/Secrets)
```

| Script | Befehl | Zweck |
|---|---|---|
| `build:ios:test` | `node scripts/build-ios-test.mjs` | Env prüfen, `vite build --mode ios-test`, Marker `dist/wc-native-build.json`, statischer Scan; bei jedem Fehler wird `dist/` gelöscht |
| `cap:sync:ios` | `cap sync ios` | Web-Kopie und SPM-Pakete aktualisieren |
| `cap:open:ios` | `cap open ios` | Xcode öffnen |
| `ios:test` | beides nacheinander | Standardweg |
| `check:ios` | `node scripts/check-ios-readiness.mjs` | Readiness-Check |
| `capacitor:sync:before`, `capacitor:copy:before` | `node scripts/check-native-web-bundle.mjs` | **Capacitor-Hooks**: Die CLI führt sie vor jedem `cap sync` und `cap copy` aus |

- In `package.json` stehen keine Werte und keine Secrets (Unit-Test).
- **Hook-Verhalten (CLI 8.5.2 geprüft):**
  - Scheitert `capacitor:sync:before`, bricht `cap sync` mit Exit 1 ab.
  - Scheitert `capacitor:copy:before`, loggt `cap copy` den Fehler und endet mit Exit 0, **kopiert aber nichts**, weil der Hook vor dem Kopieren läuft.
  - Nachgewiesen: Ein LEGACY-Web-Build (`npm run build`) in `dist/` wird von `cap sync` (Exit 1) und `cap copy` abgelehnt; der SHA-256 der Xcode-Kopie ist vorher und nachher gleich.

## 6. Test Backend

**Env-Datei:** `.env.ios-test.local` (von Git ignoriert über `*.local` und `.env.*`). Vorlage: `.env.ios-test.example`, versioniert, nur Platzhalter.

```
VITE_BACKEND_MODE=family
VITE_FAMILY_SUPABASE_URL=https://<test-ref>.supabase.co
VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_…-des-testprojekts>
VITE_SUPABASE_URL=            # LEGACY bewusst leer
VITE_SUPABASE_ANON_KEY=       # LEGACY bewusst leer
VITE_AUTH_REDIRECT_URL=       # nativ ungenutzt (native Umgebung → VITE_NATIVE_AUTH_REDIRECT_URL)
VITE_INVITE_BASE_URL=         # optional: Vercel-Preview von feature/appstore-v1; leer = nur Einladungscode
VITE_NATIVE_AUTH_REDIRECT_URL= # erst 7B
VITE_PRIVACY_URL= / VITE_IMPRINT_URL= / VITE_SUPPORT_URL=   # optional im Test
```

**Warum LEGACY leer überschreiben?** Vite liest im Modus `ios-test` auch `.env` und `.env.local` und bettet **alle** `VITE_`-Werte über `import.meta.env` ins Bundle ein (am Baseline-Bundle nachgewiesen). Eine lokale LEGACY-Konfiguration würde sonst die Produktions-URL in die App tragen.

**Build-Schutz** (`scripts/lib/iosTestGuard.mjs → validateIosTestEnv`). Er greift an drei Stellen:
1. `build-ios-test.mjs`
2. `vite.config.js` bei `--mode ios-test` (auch bei direktem `npx vite build --mode ios-test`)
3. indirekt über den Bundle-Scan

Abbruch bei:
- `VITE_BACKEND_MODE` ≠ `family`
- `VITE_FAMILY_SUPABASE_URL` ≠ exakt `https://otejitifgcrrwmudrnhs.supabase.co`; die **Produktions-Ref** erhält eine eigene, deutliche Meldung
- einem Key, der kein Publishable Key ist: `sb_secret_…`, `service_role`, oder ein JWT, dessen `role` ≠ `anon` bzw. dessen `ref` ≠ Testprojekt ist
- nicht leerem `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- einem beliebigen `VITE_`-Wert mit Produktions-Ref, `family-main` oder `http://`
- URL-Variablen, die nicht `https://` sind oder auf die Produktions-Web-Domain `familienapp.vercel.app` zeigen
- Meldungen enthalten nur Variablennamen, nie Werte

**Negativproben (live):**

| Probe | Ergebnis |
|---|---|
| Produktions-URL | Exit 1, `dist/` gelöscht |
| LEGACY-URL gesetzt | Exit 1 |
| direkter `vite build --mode ios-test` mit Produktions-URL | Exit 1 |

Die Prod-Ref steht **nur** im Node-Skript (Sperrliste), nie im Client-Code. Der Client kennt nur die Allowlist (Test-Ref), siehe Abschnitt 7 bzw. 12.

**Edge Functions / CORS (Testprojekt):**
- Die native WebView sendet `Origin: capacitor://localhost`. Die CORS-Regeln aus 6B1 erlaubten diesen Origin nicht; `delete-account` und `delete-family` wären in der App gescheitert (per Preflight nachgewiesen).
- **Fix:** `supabase/functions/_shared/cors.js` nimmt `^capacitor://localhost$` in die Dev-Origins auf. Diese gelten automatisch **nur im Testprojekt** bzw. mit `WC_ALLOW_DEV_ORIGINS=true`.
- In Produktion bleibt es bei der expliziten Freigabe `WC_ALLOWED_ORIGINS=capacitor://localhost` (siehe `PRODUCTION_ENVIRONMENT.md`).
- Neuer Unit-Test: Varianten wie `capacitor://localhost:8080`, `capacitor://evil`, `ionic://localhost` bleiben abgelehnt.
- **Deploy nur ins Testprojekt** (Version 3 beider Functions, `verify_jwt = true`). Der Code ist identisch zum Repo, einzige Änderung ist `cors.js`; die vorher deployte Version wurde gegen das Repo verglichen.
- Live-Nachweis:
  - Preflight `capacitor://localhost` → `Access-Control-Allow-Origin: capacitor://localhost`
  - fremder Origin → kein ACAO
  - POST ohne JWT → 401
  - Suite `account-lifecycle` nach dem Deploy grün

## 7. Native Lifecycle

- `src/lib/nativePlatform.js`: `isNativePlatform()` / `getPlatform()` über `Capacitor.isNativePlatform()`. Das ist die **einzige** Stelle mit Plattformabfrage; sie wird nur aus FAMILY-Code importiert.
- `src/lib/nativeAppState.js`: `subscribeNativeAppState(handler)` registriert `App.addListener('appStateChange', …)` **nur nativ**; im Web gibt es keinen Plugin-Aufruf. Die Abmeldung ist synchron. Wird vor dem asynchronen `addListener` abgemeldet, wird der Listener danach sofort entfernt (kein verwaister Listener).
- `src/lib/appLifecycle.js` → `onAppForeground()`:
  - Web: `visibilitychange` (sichtbar), `focus`, `online`
  - nativ: `appStateChange({ isActive: true })`
  - **Alle Quellen laufen durch dieselbe Entprellung** (800 ms je Abonnent). Das native Signal gilt als maßgeblich, auch wenn die WebView für einige Millisekunden noch `hidden` meldet.
  - Die Aufrufer (`FamilyApp.jsx`: Mitgliedschaften und Realtime; `FamilyChampion.jsx`: PIN-Timeout, Reload-Scheduler, Realtime-Reconnect, Champion-Sync) sind **unverändert**.
- **Keine doppelten Reloads:** Unit-Test „appStateChange(active) + visibilitychange + focus → genau EIN Vordergrund-Zyklus“, auch in umgekehrter Reihenfolge. Ende-zu-Ende mit dem echten `createReloadScheduler`: 1 Reload, 1 Champion-Sync, 1 Realtime-Reconnect.
- **Nativer Start-Schutz** (`src/config/nativeTarget.js → checkNativeRuntime`, geladen über `src/family/nativeBoot.js` nur im FAMILY-Zweig von `main.jsx`):
  - nativ + normaler Web-Build (kein `__WC_NATIVE_TEST_REF__`) → Startabbruch „kein nativer Test-Build“
  - nativer Test-Build + URL ≠ Testprojekt → Startabbruch
  - normaler Web-Build im Browser → unverändert
  - Browser-Probe mit simulierter iOS-Bridge (`window.webkit.messageHandlers.bridge`): 4/4 Fälle wie erwartet.
- Bekannt, unkritisch: iOS meldet `appStateChange` aktiv auch nach Kontrollzentrum oder System-Dialogen, etwa nach der Fotoauswahl. Das löst höchstens einen entprellten Refresh aus. Am Gerät in 7B beobachten.

## 8. Safe Area / Mobile

**Viewport** (`index.html`, unverändert): `width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no`.
- `viewport-fit=cover` ist vorhanden.
- `user-scalable=no` ist eine **bestehende** Zoom-Sperre (seit LEGACY). Sie wurde in 7A **nicht** hinzugefügt, aber auch nicht entfernt: `index.html` ist mit LEGACY geteilt, und eine Entfernung erfordert eine Prüfung des iOS-Auto-Zooms bei Eingabefeldern unter 16 px.
- Empfehlung 7B: entfernen, sobald die Eingabefelder überall ≥ 16 px haben (FAMILY-Eingaben haben bereits 16 px).

**Safe Area:**

| Bereich | Regel |
|---|---|
| FAMILY-Seitenrahmen (`src/family/ui.jsx` `S.page`) | jetzt **alle vier** Insets (`top`/`right`/`bottom`/`left` + Grundabstand) |
| Hauptansicht (`ChampionApp.jsx`) | `paddingTop: env(safe-area-inset-top)`; Tab-Leiste `padding-bottom: env(safe-area-inset-bottom)` (bestehend) |
| Bottom-Sheets / Dialoge (FAMILY) | neu: `padding-bottom: calc(env(safe-area-inset-bottom) + 24px)`, damit Buttons nicht unter dem Home-Indicator liegen |
| Onboarding-Fußleiste, Offline-Hinweis, Konfigurationsfehler | bestehend mit `safe-area-inset-bottom` bzw. `top` |
| links / rechts | iPhone nur im Hochformat → Insets 0; der FAMILY-Rahmen berücksichtigt sie trotzdem |

Auf dem Web sind die Insets 0 bzw. identisch zum Browser, das Layout bleibt unverändert.

**Tippziele (6A-Befund, 41 Symbol-Buttons 22–28 px):**
- Im FAMILY-Elternbereich sind jetzt **alle ≥ 44 × 44 px**: ▲ ▼ ✏️ 🗑️ bei Aufgaben, Belohnungen, Kindern und Kategorien sowie „✓ Gesehen“.
- Die Button-Gruppe bricht bei Platzmangel unter den Namen um (Namen mindestens 110 px). Damit ist auch der 320-px-Überlauf aus 6A behoben.
- Nur FAMILY: `S.ib()` / `S.row` / `S.rowName` liefern für LEGACY exakt die alten Stile, `IconGroup` rendert für LEGACY ein Fragment (DOM unverändert).
- Browser-Messung: 104/104 Buttons ≥ 44 × 44 bei 430 und 375 px; kein horizontales Scrollen bei 430, 375 und 320 px.

**Launch Screen:**
- Der Capacitor-Standard-Splash (weiß mit Capacitor-Logo) ist ersetzt durch eine schlichte Fläche in der App-Farbe `#1e1b4b` (`LaunchScreen.storyboard`, kein Bild).
- `Splash.imageset` ist entfernt. Kein Splash-Plugin.

**App-Icon:**
- `public/icon-512x512.png` ist das PWA-Icon: nur 512 px, mit eingebackenen abgerundeten Ecken und hellem Rand. iOS verlangt 1024 × 1024 ohne eigene Maske. Das ist **kein** fertiges iOS-Asset.
- Deshalb bleibt das **Capacitor-Entwicklungsicon** (`AppIcon-512@2x.png`, 1024 px). **Offener Punkt:** finales 1024-px-Icon ohne Transparenz und ohne Rundung liefern (Nutzer bzw. Design). Kein neues Logo erfunden.

## 9. Images / Share / External Links

**Bildauswahl:**
- `<input type="file" accept="image/*">` (Profil- und Aufgabenbilder) bleibt unverändert und kompiliert in WKWebView. iOS zeigt „Fotomediathek“, „Foto aufnehmen“ und „Datei auswählen“.
- „Fotomediathek“ nutzt den System-Picker **ohne** Berechtigung.
- **„Foto aufnehmen“ benötigt `NSCameraUsageDescription`**, sonst beendet iOS die App beim Antippen. Daher als **einzige** Berechtigung ergänzt: „Wochen Champion nutzt die Kamera nur, wenn du selbst ein Foto für ein Profil oder eine Aufgabe aufnimmst.“
- Keine `NSPhotoLibraryUsageDescription` (kein Bibliothekszugriff außer über den Picker), kein Mikrofon (nur `image/*`).
- Kein Camera-Plugin. Der Simulator hat keine Kamera; das ist kein Fehler. Gerätetest in 7B.

**Teilen:**
- Die Einladung nutzt weiterhin `navigator.share`, danach die Zwischenablage als Fallback (`familyInvitations.js`, unverändert).
- Kein Share-Plugin. Verfügbarkeit von `navigator.share` in WKWebView und Clipboard unter `capacitor://localhost` am Gerät prüfen (7B).
- Die Code-Eingabe für Einladungen funktioniert unabhängig davon.

**Externe Links** (Datenschutz, Impressum, Support; `LegalLinks` mit `target="_blank"` bzw. `mailto:`):
- In Capacitor 8 (`WebViewDelegationHandler.swift`) wird jede Top-Level-Navigation, die weder App-URL noch `allowNavigation` ist, **abgebrochen und an iOS übergeben** (`UIApplication.shared.open`). `target="_blank"` geht über `createWebViewWith` ebenfalls an iOS.
- Folge: Safari bzw. Mail öffnen sich, die App-WebView bleibt auf `capacitor://localhost`. Ein fremder Webkontext in der App ist unmöglich, und es gibt keine Domain-Freigaben.
- **Keine Link-Abstraktion und kein Browser-Plugin nötig.** Optional für 7B: `@capacitor/browser` (SFSafariViewController), falls Links in der App bleiben sollen.

**Auth:**
- E-Mail/Passwort-Login und Registrierung laufen gegen das Testprojekt; Confirm Email ist dort AUS.
- Nativ liefert `getAuthRedirectUrl` ohne `VITE_NATIVE_AUTH_REDIRECT_URL` `null`, dann gilt die Supabase Site URL.
- Passwort-Reset per Deep Link kommt erst in 7B. Der Web-/Preview-Pfad ist unverändert (`authRedirects.js` nicht angefasst).

**Einladungen:**
- Code-Eingabe funktioniert.
- Einladungslinks entstehen nativ nur mit `VITE_INVITE_BASE_URL` (vorher so gebaut, `capacitor://` ist nicht teilbar). Universal Link erst in 7B.

**Realtime:**
- `@supabase/realtime-js` nutzt das Browser-WebSocket.
- Im Code gibt es keine Browser-only-Annahmen, die WKWebView verhindern; Ziel ist `wss://otejitifgcrrwmudrnhs.supabase.co/realtime/v1`.
- Node-Suites `champion-realtime` und `two-device` sind grün.
- Im Sandbox-Browser scheitert nur der WebSocket-Handshake am Egress-Proxy (500). Das ist eine Umgebungsgrenze; echter Test am Gerät in 7B.

**Speicher:**
- Die Supabase-Session liegt wie im Web im `localStorage` der WKWebView (App-Container). Nachgewiesen: Neustart → Session-Restore.
- Die Einladung liegt in `sessionStorage`; PIN-Gate und Bild-URLs nur im Speicher.
- Keine Kopie von Tokens in native Stores, kein Keychain-Plugin.

## 10. Xcode Build

In dieser Sitzung **nicht ausführbar** (Linux, kein Xcode). Auf dem Mac:

```bash
git switch feature/appstore-v1 && git pull --ff-only
npm ci
cp .env.ios-test.example .env.ios-test.local        # Testwerte eintragen (nur Testprojekt, Publishable Key)
npm run ios:test                                    # Build + Schutz + cap sync ios
npm run check:ios                                   # erwartet: 0 FAIL, Toolchain-Zeilen PASS
xcodebuild -version && xcode-select -p && xcrun simctl list runtimes
# CLI-Build gegen den generischen Simulator (ohne Signierung):
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build/DerivedData build
```

Erwartung: `** BUILD SUCCEEDED **`. Beim ersten Build lädt Xcode das Swift-Paket `capacitor-swift-pm` 8.5.2 von GitHub; das braucht Internet.

Falls `xcode-select -p` auf die CommandLineTools zeigt, einmalig im Terminal (fragt nach dem Mac-Passwort):

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

## 11. Simulator

In dieser Sitzung **nicht ausführbar**. Ersatzweise ist der **identische native Test-Build** (`dist/`) im Browser mit iPhone-Emulation (Chromium) gegen das Testprojekt geprüft. WebKit ist in der Sandbox nicht installiert.

- Supabase-HTTPS wurde über Node an das Testprojekt durchgereicht, weil Chromium nicht stabil durch den Sandbox-Proxy kommt. Die Antworten inklusive CORS-Header stammen original vom Testprojekt.
- Wegwerfkonto `wc-p7a-…@example.com`, danach über `delete-account` gelöscht (1 Konto, 1 Familie).

**Ergebnis 23/23 PASS:**
- Start ohne weiße Seite
- Registrierung → Onboarding (7 Schritte) → Family Home
- Elternbereich per serverseitiger PIN
- Dialog öffnen
- Neustart mit Session-Restore
- Session im WebView-`localStorage`
- Logout und Login
- Tippziele ≥ 44 und kein horizontales Scrollen bei 430 (großes iPhone), 375 (kleines iPhone, SE) und 320 px
- Netzwerk: nur `localhost` + `otejitifgcrrwmudrnhs.supabase.co`, keine Produktions-Ref, kein `app_state`, kein HTTP, WebSocket-Ziel Testprojekt
- keine JS-Ausnahme

**Auf dem Mac nachzuholen** (Simulator „iPhone 17 Pro Max“ bzw. aktuelles großes Modell, dazu „iPhone SE (3rd generation)“ oder das kleinste verfügbare):
1. Xcode → Scheme „App“ → Ziel-Simulator wählen → Run (⌘R).
2. Home-Screen: Name „Wochen Champion“.
3. Start ohne weiße Seite; Safari → Entwickeln → Simulator → Web-Inspector: keine JS-Fehler.
4. Registrierung mit Wegwerf-Adresse, Onboarding, Home, Elternbereich, Logout/Login.
5. App beenden (App-Umschalter) und neu öffnen: angemeldet.
6. Web-Inspector → Netzwerk: nur `otejitifgcrrwmudrnhs`, kein `gkkz…`, kein `app_state`.
7. Hintergrund → Vordergrund (⇧⌘H, App wieder öffnen): genau ein Neuladen (Netzwerk-Tab).
8. Safe Area: Dynamic Island, Statusleiste, Home-Indicator frei; Tastatur bei Formularen.
9. Konto & Sicherheit → Account löschen (Wegwerfkonto): funktioniert dank CORS-Fix.

## 12. Security

| Prüfung | Ergebnis |
|---|---|
| nur HTTPS-Backend | ja (Build-Schutz lehnt `http://` ab; Bundle-Scan „HTTP-Backend“) |
| ATS-Ausnahme | keine (`NSAppTransportSecurity` fehlt; Test + Readiness) |
| Service Role / Secret Key | nicht vorhanden (Build-Schutz, Bundle-Scan mit JWT-Rollenprüfung) |
| Secrets im nativen Bundle | nur der Publishable Key des Testprojekts (erwartet öffentlich) |
| Produktions-Ref | 0 Treffer in `dist/`, in `ios/App/App/public`, in der nativen Konfiguration und im Client-Code (Unit-Test) |
| `family-main` / `app_state` | 0 Treffer |
| Legacy-Personendaten | 0 Treffer (Namen aus `legacyDefaults.js` zur Laufzeit geprüft, nie ausgegeben) |
| Testkonten / Passwörter / PINs / Invite-Tokens | 0 Treffer; keine Werte im Repo |
| persönliche Bilder / Base64 | keine Fotodateien, kein Base64-Bild > 2 kB; nur PWA-Icons |
| LEGACY im nativen Container | technisch verhindert (Hook + Marker + Laufzeit-Schutz) |
| Produktion verändert | nein (Handoff §15) |

**Bundle-Scan** (`scanNativeWebBundle`, in Build, Hook und `check:ios`):
- Produktions-Ref, `family-main`, `app_state`, LEGACY-Web-Domain
- Secret/`service_role` (inklusive JWT-Dekodierung), Testkonten, Test-Hintertüren
- HTTP-Backend, LEGACY-Env-Werte, fehlendes Testprojekt
- LEGACY-Personendaten, eingebettete Bilder, Fotodateien

## 13. Web Regression

| Prüfung | Ergebnis |
|---|---|
| Unit | **173/173** (vorher 154; neu: 18 × `nativeIos`, 1 × CORS) |
| Integration (Testprojekt, vor/nach) | data 18, mutations 44, admin 60, champion-realtime 17, two-device 27, onboarding 29, auth 13, media 31, invitations 49, account-lifecycle 34: **vor und nach 7A je 10/10 Suites, 322/322** |
| LEGACY-Bundle | `index`/`index.html` identisch bis auf den Chunk-Namen; `App`-Chunk geändert (gemeinsame `ChampionApp.jsx`); **0 × „capacitor“** im LEGACY-Bundle |
| LEGACY-Verhalten | Screenshot-Vergleich alt/neu, Supabase komplett abgefangen: **6/6 pixelidentisch** (Home, Belohnungen, Statistik, Verwalten gesperrt/entsperrt, Bearbeiten-Dialog), 0 JS-Fehler |
| FAMILY-Web | Web-Build ohne Änderung des Verhaltens (Laufzeit-Schutz greift nur nativ oder im ios-test-Build); E2E wie Abschnitt 11 |
| Release-Check `preview` | 21 PASS, 1 WARN (Rechtslinks), 0 FAIL |
| npm audit | 0 |

## 14. Physical iPhone Instructions

Voraussetzungen:
- Mac mit Xcode 26
- iPhone 17 Pro Max (iOS 26) und USB-C-Kabel
- Apple Account (ein kostenloser genügt)

1. **Xcode öffnen:** `npm run ios:test`, danach `npm run cap:open:ios`. Alternativ in Xcode `ios/App/App.xcodeproj` öffnen.
2. **Apple Account hinzufügen:** Xcode → Settings (⌘,) → Accounts → „+“ → Apple Account → anmelden.
3. **iPhone verbinden:** per Kabel an den Mac.
4. **Gerät bestätigen:** Auf dem iPhone „Diesem Computer vertrauen?“ → Vertrauen → Code eingeben. Xcode → Window → Devices and Simulators zeigt das iPhone; beim ersten Mal bereitet Xcode es vor, das dauert einige Minuten.
5. **Developer Mode:**
   - iPhone → Einstellungen → Datenschutz & Sicherheit → Entwicklermodus → Ein.
   - Das iPhone startet neu, danach „Einschalten“ bestätigen.
   - Der Schalter erscheint erst, nachdem Xcode das Gerät einmal erkannt hat.
   - Quelle: <https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device>
6. **Target wählen:** Projekt-Navigator → „App“ (blaues Symbol) → unter TARGETS „App“.
7. **Signing & Capabilities** öffnen.
8. **Automatically manage signing** aktivieren.
9. **Team:** „<Dein Name> (Personal Team)“ wählen. Bundle Identifier bleibt `de.volkmarsolutions.wochenchampion`. Meldet Xcode, die ID sei vergeben, vorübergehend z. B. `.dev` anhängen und im Handoff notieren; `capacitor.config.json` nicht ändern.
10. **Run Destination:** Oben in der Toolbar das iPhone statt eines Simulators wählen.
11. **Run** (▶ bzw. ⌘R):
    - Beim ersten Start meldet iOS „Nicht vertrauenswürdiger Entwickler“.
    - iPhone → Einstellungen → Allgemein → VPN & Geräteverwaltung → Entwickler-App → „<Apple Account>“ vertrauen.
    - Danach erneut starten.

**Kostenloses Personal Team** (Quelle: <https://developer.apple.com/support/compare-memberships/>):
- geeignet für den ersten Gerätetest
- Einschränkungen:
  - Provisioning-Profile laufen nach **7 Tagen** ab; danach aus Xcode neu installieren
  - höchstens 3 Geräte und 3 Apps pro Gerät, 10 App-IDs (je 7 Tage)
  - **kein** TestFlight, **kein** App Store Connect
  - **keine Associated Domains** (Universal Links) und kein Push
- 7A ist davon nicht blockiert. Für 7B (Universal Links) und Phase 9 (TestFlight) ist das **Apple Developer Program** (kostenpflichtig) nötig. Die Anmeldung erfolgt nur durch den Nutzer.

## 15. Open Items for 7B

1. **Echter iPhone-Test** (Abschnitt 14) und Nachholen von Xcode-CLI-Build und Simulator (Abschnitte 10 und 11) auf dem Mac.
2. **Lebenszyklus am Gerät:** Hintergrund/Vordergrund, Sperrbildschirm, Kontrollzentrum, Fotoauswahl → jeweils höchstens ein Refresh; Realtime nach dem Aufwachen.
3. **Fotos:** Mediathek und „Foto aufnehmen“ (Kamera-Berechtigungsdialog mit deutschem Text), HEIC → JPEG-Verarbeitung, Upload.
4. **Share Sheet:** `navigator.share` in WKWebView; Clipboard-Fallback.
5. **Tastatur:** Formulare, Onboarding-Fußleiste, PIN-Eingabe, Bottom-Sheets. Ggf. Keyboard-Resize-Modus festlegen (heute Standard).
6. **Safe Area** am Gerät mit Dynamic Island und Home-Indicator; `user-scalable=no` prüfen bzw. entfernen.
7. **Universal Links / Associated Domains:** Domain, `apple-app-site-association`, Entitlement (braucht das Apple Developer Program).
8. **Auth-Recovery-Deep-Link:** `VITE_NATIVE_AUTH_REDIRECT_URL`, `appUrlOpen`-Adapter, PKCE prüfen, Supabase-Redirect-URLs.
9. **Invite-Deep-Link:** `appUrlOpen` → bestehende Einladungslogik; `VITE_INVITE_BASE_URL` auf die finale Domain.
10. **App-Icon final** (1024 × 1024, ohne Transparenz und Rundung).
11. **Apple Developer Program** (Nutzerentscheidung), danach Team-ID statt Personal Team.
12. **Entscheidungen:** iPad-Unterstützung ja/nein, Querformat ja/nein, Links in der App (`@capacitor/browser`) ja/nein.
13. **Produktion (später):** `WC_ALLOWED_ORIGINS=capacitor://localhost` als Edge-Secret im Produktionsprojekt, erst mit dem Cutover (6B2) bzw. vor dem Produktions-Build der App.
