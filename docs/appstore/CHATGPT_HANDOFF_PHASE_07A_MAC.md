# CHATGPT HANDOFF – PHASE 7A MAC ABNAHME

> Nachholung der Mac-/Xcode-/Simulator-Punkte aus Phase 7A (28.09.2026, lokal auf dem Mac mini des Nutzers).
> Keine neue Entwicklung, kein Code geändert. Enthält keine Secrets, Passwörter, PINs oder Keys.

## 1. Toolchain
- macOS: 27.0.1 (Build 26A434)
- Architektur: arm64 (Apple Silicon, Mac mini)
- Node: v22.23.1
- npm: 10.9.8
- Xcode: 27.0 (Build 27A266a)
- xcode-select: `/Applications/Xcode.app/Contents/Developer` (korrekt, nicht CommandLineTools)
- iOS Runtime: iOS 27.0 (24A434); Simulatoren u. a. iPhone 18 Pro Max, iPhone 18 Pro, iPhone Air, iPhone 17, iPhone 17e
- Hinweis: Xcode 27 liefert auf diesem Mac keine `Simulator.app`-GUI unter `Xcode.app/Contents/Developer/Applications` aus. Die Simulatoren liefen headless (`simctl`); in Xcode selbst funktioniert Run → Simulator normal. Keine zusätzlichen Komponenten nötig, kein `sudo` verwendet.

## 2. Repository
- Branch: `feature/appstore-v1` (up to date mit `origin`)
- Commit: `cea2b57` „docs: add phase 7A handoff“ (Basis der Abnahme; Build-Marker in `dist/` zeigt denselben Commit)
- Arbeitsbaum: sauber bis auf
  - diese Handoff-Datei (neu)
  - `ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (neu, von Xcode beim ersten SPM-Resolve erzeugt; pinnt `capacitor-swift-pm` 8.5.2, Revision `0b6882e9…`; keine Secrets; Empfehlung: mitversionieren)
- `npm ci`: 173 Pakete, 0 vulnerabilities
- `.env.ios-test.local`: aus `.env.ios-test.example` angelegt (von Git ignoriert über `*.local`, Rechte 600). Inhalt: `VITE_BACKEND_MODE=family`, Test-URL `https://otejitifgcrrwmudrnhs.supabase.co`, Publishable Key (`sb_publishable_…`) des Testprojekts, gelesen über die Supabase-Verbindung; LEGACY-Werte leer. Der Wert wurde nirgends ausgegeben oder committet.

## 3. Native Build
- ios:test: erfolgreich. Env-Guard ✓ (FAMILY, Testprojekt, Publishable Key), `vite build --mode ios-test` ✓, Bundle-Scan sauber (14 Dateien), Capacitor-Hook vor `sync` ✓
- check:ios: **35 PASS, 0 WARN, 0 FAIL** (inklusive Toolchain-Zeilen: Node ≥ 22, xcodebuild, xcode-select, iOS-Runtime)
- cap sync: erfolgreich (über `npm run ios:test`, Plugin `@capacitor/app@8.1.1`)
  - App Name = Wochen Champion ✓
  - Bundle ID = `de.volkmarsolutions.wochenchampion` (Debug + Release) ✓
  - webDir = `dist` ✓
  - kein `server.url` ✓
  - Swift Package Manager (keine Podfile) ✓
  - `CapacitorApp` im SPM-Paket ✓
- xcodebuild: `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug -destination 'generic/platform=iOS Simulator' -derivedDataPath <außerhalb des Repos> build`
  - Schemes: `App`, `CapacitorApp`, `CapApp-SPM`; Target `App`
  - Warnungen: nur 2× in `node_modules/@capacitor/app/…/AppPlugin.swift:121` (Upstream, „implicitly coerced from String? to Any“), keine im Projekt
- BUILD SUCCEEDED: **ja** (`** BUILD SUCCEEDED **`, ohne Projektänderung)

## 4. Simulator
Steuerung per WebKit-Web-Inspector-Protokoll (Simulator-Socket), Netzwerk über Resource Timing in der WebView, Realtime über die Edge-Logs des Testprojekts. Wegwerfkonto `wc-p7amac-…@example.com`, am Ende in der App gelöscht.

- Gerät: iPhone 18 Pro Max (iOS 27.0), Viewport 440 × 956
- App startet: ja, keine weiße Seite; WebView `capacitor://localhost`, `Capacitor.isNativePlatform() = true`
- Login: ja (nach Logout mit demselben Konto)
- Registrierung: ja (gegen das Testprojekt, danach direkt Onboarding)
- Onboarding: ja, 7/7 Schritte (Familienname, Kind, Eltern-PIN, Aufgaben, Belohnungen, Einstellungen, Übersicht) → „Alles eingerichtet! 🎉“
- Home: ja (Profilkarte, Tab-Leiste über dem Home-Indicator, Statusleiste frei)
- Elternbereich: ja (serverseitige PIN `verify_parent_pin`), 14 Aufgaben, alle Symbol-Buttons ≥ 44 pt, Dialog „Neue Aufgabe“: Buttons enden bei 898/956 pt, frei vom Home-Indicator
- Logout/Login: ja (Logout leert den WebView-`localStorage`, Login führt direkt ins Home)
- Session Restore: ja (App beendet und kalt neu gestartet → direkt Family Home, kein Login)
- Hintergrund → Vordergrund (andere App, dann zurück): genau **ein** Refresh-Zyklus (+7 Requests: Familiendaten + Mitgliedschaft), keine Dopplung
- JS-Fehler: keine (`error`/`unhandledrejection`/`console.error` nach dem Laden überwacht: 0 App-Fehler)
- Backend: nur `otejitifgcrrwmudrnhs.supabase.co`
  - REST/RPC/Auth: 19 Requests (Registrierungssitzung) bzw. 12 (Kaltstart), alle Testprojekt
  - Realtime: `/realtime/v1/websocket` → **101** im Testprojekt (2×, iPhone-WebKit-User-Agent)
  - Edge Function `delete-account` aus der App (Origin `capacitor://localhost`) erfolgreich → CORS-Fix aus 7A bestätigt
  - 0 Requests an `gkkzjmszcjivtaygbmfw`, 0 × `app_state`, 0 × `http://`

## 5. Zweiter Simulator
- getestet: ja
- Gerät: iPhone 17e (iOS 27.0, Notch), Viewport 390 × 844 (kleinstes installiertes iPhone; ein iPhone SE ist für iOS 27 nicht vorhanden)
- Safe Area: Statusleiste/Notch und Home-Indicator frei; Tab-Leiste und Dialog-Buttons (Ende 786/844 pt) oberhalb des Home-Indicators
- Dialoge: „Neue Aufgabe“ scrollt vollständig, Speichern/Abbrechen erreichbar
- Tippziele: 0 Symbol-Buttons < 44 pt; die Button-Gruppe bricht unter den Aufgabennamen um
- Tastatur: im headless Simulator nicht prüfbar (keine echte Touch-Eingabe) → Gerätetest (7B)
- horizontaler Scroll: keiner (Login, Home, Elternbereich, Dialog: `scrollWidth = innerWidth` bei 440 und 390)

## 6. Security
- Testprojekt: ausschließlich `wochen-champion-test` / `otejitifgcrrwmudrnhs` (Env-Guard, Hook, Laufzeit, Netzwerk bestätigt)
- Production Ref verwendet: nein (0 im Bundle, 0 in nativer Konfiguration, 0 Requests). Das Produktionsprojekt wurde in dieser Sitzung nicht angesprochen, auch nicht lesend.
- app_state: 0 (Bundle-Scan und Netzwerk)
- Service Role: nicht vorhanden (nur Publishable Key im Bundle)
- Secrets: keine im Repo, im Log oder in dieser Datei; `.env.ios-test.local` ignoriert
- Testdaten: Wegwerfkonto und „Familie Simtest“ in der App gelöscht; Kontrolle im Testprojekt: 0 Nutzer, 0 Familien übrig
- Keine Produktionsmutation, keine Migration, kein Vercel-Deploy, kein Merge, kein Upload

## 7. Physical iPhone
- Xcode geöffnet: ja (`npm run cap:open:ios` → Workspace `ios/App`)
- Apple Account: vom Nutzer in Xcode zu prüfen bzw. hinzuzufügen (Schritt 1 unten)
- Signing: noch nicht konfiguriert (Nutzeraktion)
- Personal Team: noch nicht gewählt (Nutzeraktion)
- iPhone erkannt: nein, zum Zeitpunkt der Prüfung kein Gerät angeschlossen (`xcrun devicectl list devices` zeigt nur Simulatoren)
- Developer Mode: offen (am iPhone)
- Device Build: offen
- App auf iPhone installiert: nein (wartet auf Nutzerinteraktion)

## 8. Offene Punkte
1. **iPhone-Test mit Personal Team** (Abschnitt 9): Signing, Developer Mode, Run
2. `Package.resolved` mitversionieren (Empfehlung) und diesen Handoff committen
3. Tastatur-Verhalten (Formulare, PIN, Bottom-Sheets) nur am Gerät prüfbar → 7B
4. Weiterhin aus 7A offen (unverändert): finales App-Icon, Kamera/Fotos/Share am Gerät, Universal Links/Deep Links, `user-scalable=no`, Apple Developer Program → 7B

## 9. Empfehlung
**Nächste Nutzeraktion – iPhone mit Personal Team (Xcode ist bereits geöffnet):**

1. **Apple Account:** Xcode → Settings… (⌘,) → Reiter **Accounts** → unten links **„+“** → **Apple Account** → Continue → mit deiner Apple-ID anmelden. Danach erscheint „<Dein Name> (Personal Team)“.
2. **Target öffnen:** Links im Project Navigator (⌘1) ganz oben das blaue **„App“** anklicken → in der mittleren Spalte unter **TARGETS** → **„App“**.
3. **Signing & Capabilities:** oben den Reiter **Signing & Capabilities** wählen.
4. **Automatically manage signing:** Häkchen setzen.
5. **Team:** im Dropdown **„<Dein Name> (Personal Team)“** wählen. Bundle Identifier bleibt `de.volkmarsolutions.wochenchampion`. Meldet Xcode „not available“, vorübergehend nur **in Xcode** `.dev` anhängen (nicht in `capacitor.config.json`) und notieren.
6. **iPhone verbinden:** per USB-C-Kabel an den Mac mini → auf dem iPhone „Diesem Computer vertrauen?“ → **Vertrauen** → Code eingeben. Xcode bereitet das Gerät beim ersten Mal einige Minuten vor (Window → Devices and Simulators zeigt den Fortschritt).
7. **Run Destination:** oben mittig in der Xcode-Toolbar auf das Ziel neben „App“ klicken → unter „iOS Device“ dein **iPhone** wählen.
8. **Developer Mode:** iPhone → Einstellungen → **Datenschutz & Sicherheit** → ganz unten **Entwicklermodus** → Ein → Neustart → nach dem Neustart **„Einschalten“** bestätigen (der Schalter erscheint erst, nachdem Xcode das Gerät erkannt hat).
9. **App starten:** in Xcode **▶ (⌘R)**. Beim ersten Start meldet iOS „Nicht vertrauenswürdiger Entwickler“: iPhone → Einstellungen → Allgemein → **VPN & Geräteverwaltung** → unter „Entwickler-App“ deine Apple-ID → **Vertrauen** → in Xcode erneut ▶.

Vorher nicht nötig: `npm run ios:test` ist aktuell (dist + Xcode-Kopie vom Commit `cea2b57`). Nur nach Web-Code-Änderungen erneut ausführen.

Danach am iPhone kurz prüfen: Start, Registrierung (Wegwerfadresse), Home, Elternbereich, Tastatur, App schließen/öffnen. Anschließend Rückmeldung (ggf. Screenshots), dann Handoff ergänzen und Phase 7B planen. **Phase 7B ist nicht begonnen.**
