# CHATGPT HANDOFF – PHASE 6A

## 1. Ergebnis
- **Phase erfolgreich:** ja (Audit, Bereinigung, Vorbereitung; keine produktive Umschaltung)
- **Branch:** `feature/appstore-v1`
- **Commit:** `f4e69fc` „chore: prepare production and ios readiness“ (plus Docs-Commit mit diesem Handoff)
- **Push:** normal nach `origin/feature/appstore-v1` (kein Force)
- **Legacy-Build:** grün, byte-identisch zum Stand nach 5C (auch nach dem Dependency-Update)
- **Family-Build:** grün (`FamilyApp` 393 kB / 105 kB gzip, `index` 147,5 kB / 48 kB gzip)
- **Produktionsmutation:** keine. Nur lesend geprüft:
  - Supabase: nur `app_state`, 0 Auth-Nutzer, 0 Buckets, 0 Edge Functions
  - Vercel Production unverändert
- **main verändert:** nein (`8035896`)

## 2. Release-Readiness
- **funktionale FAMILY-App:** funktional vollständig für v1. Auth, Konto & Sicherheit, Onboarding, Familienverwaltung, mehrere Eltern und Einladungen, PIN, Aufgaben, Punkte, Belohnungen, Champion, Realtime, Medien, Account- und Familienlöschung sind alle getestet.
- **kritische Funktionslücken:** keine. Ein latenter Release-Blocker ist **gefunden und behoben**, siehe nächster Punkt.
- **Feature Freeze empfohlen:** ja. Ab jetzt nur Punkte der Kategorien A und B (Audit, Abschnitt 24).
- **release-blockierende Fehler:**
  1. **Zeilengrenze (behoben):** Supabase kappt eingebettete Listen bei `max_rows` = 1000.
     - Mit 1100 synthetischen Erledigungen lud die App stillschweigend nur 1000; Punkte und Historie wären falsch gewesen (rund 870 Erledigungen pro Jahr ⇒ nach etwa 14 Monaten).
     - **Behoben:** Verläufe werden paginiert geladen (1100/1100 nachgewiesen).
  2. **Direktes Familien-Löschen ohne Medienbereinigung (behoben):** Die Policy `families_delete` ist entfernt (Testprojekt).
  3. **Noch offen, Voraussetzungen für Produktion statt Codefehler:**
     - SMTP, Auth-Einstellungen, Rechtstexte
     - Google Fonts lokal bündeln
     - Produktions-Bootstrap

## 3. Migrationen
- **Anzahl Repo-Migrationen:** 9 (8 bis 5D plus neu `20260930100000_release_hardening.sql`)
- **Test-Guards:** alle 9 (`app.migration_target = 'test'`); ohne Setzen bricht Migration 1 ab (verifiziert)
- **direkt produktionsgeeignet:** keine (bewusst)
- **empfohlene Produktionsstrategie:** Variante A, **Produktions-Bootstrap-Generator**:
  - nimmt die unveränderten Migrationen und entfernt nur exakt die bekannten Guard-Blöcke
  - eine Transaktion mit eigenem Produktions-Guard (`production`, `families` existiert nicht, `app_state` existiert und bleibt unverändert)
  - SHA-256 plus Review
  - Probelauf mit identischem Schema-Fingerabdruck
  - Nicht B (Dump, verliert Historie) und nicht C (alte Dateien umschreiben)
- **Fresh-DB-Rehearsal:** bestanden.
  - Frische lokale PostgreSQL-Datenbank nur aus den Repo-Dateien plus Supabase-Stubs.
  - Alle 9 Migrationen laufen durch.
  - SQL-Prüfungen: rls_matrix 40/40, admin_crud 13/13, onboarding_security 8/8, media_storage 32/32, account_lifecycle 22/22, family_invitations 31/31, release_hardening 10/10.
- **Schema Drift:** Testprojekt gegen frische Datenbank per `supabase/tests/schema_fingerprint.sql`:
  - Spalten, Constraints, Indizes, RLS, Policies inklusive Storage, Trigger, Grants, Publikation und Bucket sind **identisch**.
  - Funktionen: 50 gegen 49.
  - Die Delta-Migration `family_admin_crud_assignment_safety` im Testprojekt steckt bereits vollständig in der Repo-Datei.
- **offene Drift-Punkte:** nur `public.legacy_import_redemptions` (bewusst testprojektbezogen, nie in Produktion)

## 4. Test-/Backdoors
- **test_add_family_member:** entfernt (Datei gelöscht, DB-Funktion per Migration entfernt, verifiziert)
- **legacy_import_redemptions:** nur Testprojekt (Klasse B). Für Produktion gilt Variante A:
  - temporär, mit fester `family_id`, Ablaufzeit, nur owner, einmalig
  - im Wartungsfenster anlegen → importieren → sofort `drop`
  - Nachweis per Fingerabdruck, Anzahl und Punktesumme
- **weitere Testfunktionen:** keine. `create_family` (Phase-2-RPC ohne PIN) ist eine Altlast mit niedrigem Risiko; Empfehlung für 6B: EXECUTE für Clients im Bootstrap entziehen.
- **direkte Membership-Manipulation:** unmöglich (kein INSERT, UPDATE, DELETE; getestet)
- **families_delete:** **entzogen** (Migration 9 im Testprojekt; DELETE-Recht zusätzlich revoked). Familie löschen nur noch über die Edge Function `delete-family`.
- **notwendige Bereinigung:** Testintegrations-Cleanup auf `delete-account` umgestellt (`tests/supabase/_cleanup.mjs`); das Legacy-Migrationsskript löscht die alte Testfamilie jetzt über `delete-family`.

## 5. Security Audit
- **RLS:** aktiv auf allen 19 Tabellen. Mitglieder lesen, owner und parent schreiben; anon hat keine Rechte; fremde Familien sind isoliert (getestet). Die PIN ist eine UI-Schranke, keine Grenze zwischen Erwachsenen (akzeptiert und dokumentiert).
- **RPCs:**
  - 28 öffentliche, alle mit festem `search_path`, keine für anon
  - `auth.uid()`- bzw. Rollenprüfung überall, wo nötig
  - Service-RPCs nur für service_role
  - keine frei wählbaren `user_id` ohne Prüfung
- **Edge Functions:**
  - `verify_jwt`, `getUser`, Re-Auth höchstens 300 s
  - Ziel ausschließlich aus dem JWT
  - Logs nur mit Anzahlen, Medien vor dem DB-Löschen entfernt, idempotent
  - Empfehlung: CORS-Dev-Origins in Produktion abschaltbar machen
- **service_role Client:** nicht vorhanden (Bundle-Check und Schutzregel in `backend.js`)
- **Secrets:** 0 Treffer im aktuellen Stand **und** in der gesamten Git-Historie
- **kritische Findings:**
  1. Zeilengrenze eingebetteter Listen (Datenverlust in der Anzeige)
  2. `families_delete` ohne Medienbereinigung
  3. Produktion: `app_state` ist für anon lesbar und schreibbar (Legacy-Design); nach dem Cutover sperren (Runbook)
- **behobene Findings:** 1 und 2 (Code bzw. Testprojekt); 3 ist im Runbook eingeplant

## 6. Auth Produktion
- **Confirm Email:** Soll AN (Test: AUS)
- **Passwortminimum:** Soll 8 (App-Konstante heute 6, Anpassung in 6B)
- **Leaked Password Protection:** Soll AN (Test: AUS, Advisor-Warnung)
- **Site URL:** `https://familienapp.vercel.app/` bzw. später eigene Domain
- **Redirect URLs:** Produktions-Domain `/**` (inklusive `/?invite=*`), später iOS-Universal-Link
- **Invite Redirect:** `emailRedirectTo` = `VITE_INVITE_BASE_URL/?invite=<token>` (Code fertig, getestet in 5D)
- **iOS Redirect vorbereitet:** ja im Code (`detectAuthEnvironment` native, `VITE_NATIVE_AUTH_REDIRECT_URL`); Wert erst in 7B

## 7. SMTP
- **aktueller Zustand:** eingebauter Supabase-Mailer (nur für Tests; niedrige Limits, keine eigene Absenderdomain), in beiden Projekten
- **benötigt:**
  - SMTP-Host, Port 587, Benutzer
  - Passwort als Secret nur im Dashboard
  - From `no-reply@<eigene-domain>`, From-Name „Wochen Champion“
  - SPF, DKIM, DMARC
- **empfohlene Optionen:** Brevo (EU), Postmark, Resend. Nichts gebucht.
- **E-Mail-Templates vorbereitet:** ja (`docs/appstore/AUTH_MAIL_TEMPLATES.md`: Bestätigung und Reset, Deutsch, `{{ .ConfirmationURL }}`)
- **Nutzeraktion notwendig:** Anbieter wählen, Domain bereitstellen, DNS-Einträge setzen, Zugangsdaten im Supabase-Dashboard eintragen

## 8. Vercel
- **Preview:** Für `a34e0a8` meldet GitHub „Vercel: success“. Das Preview für `f4e69fc` war beim Abschluss noch „pending“.
- **Preview URL:** `https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app` (geschützt durch Vercel-Login; aus der Sandbox nicht testbar)
- **Preview nutzt Testprojekt:** **nicht verifizierbar** (kein Vercel-Zugriff); Prüfliste unten
- **Production weiterhin Legacy:** ja (200 OK, unverändert)
- **benötigte Production Env Variablen:**
  - `VITE_BACKEND_MODE=family`
  - `VITE_FAMILY_SUPABASE_URL`, `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_AUTH_REDIRECT_URL`, `VITE_INVITE_BASE_URL`
  - `VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`, `VITE_SUPPORT_URL`
  - **`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` beim Cutover entfernen** (sonst blockiert der Guard, weil es dasselbe Projekt ist)
- **Domain-Empfehlung:** `familienapp.vercel.app` ist vorerst ok. Vor dem App Store eine **eigene Domain** (SMTP-Absender, Universal Links, stabile Rechts-URLs).
- **Manuelle iPhone-Checkliste (Preview):**
  1. In Vercel prüfen: Preview-Env hat `VITE_BACKEND_MODE=family` sowie Testprojekt-URL und -Key.
  2. Preview-URL im iPhone-Safari öffnen (mit Vercel-Konto angemeldet).
  3. Registrieren bzw. anmelden → Onboarding → Familie sichtbar.
  4. Aufgabe erledigen; auf einem zweiten Gerät (anderer Browser) erscheint die Punkteänderung **ohne Neuladen** (Realtime).
  5. Verwalten mit PIN → „Eltern & Einladungen“ → Einladung teilen (Share-Sheet) → auf dem zweiten Gerät annehmen.
  6. Profilfoto aufnehmen bzw. auswählen → sichtbar auf beiden Geräten.
  7. App in den Hintergrund und wieder öffnen → Daten aktuell.
  8. Konto & Sicherheit → Passwort-Reset-Mail (der Testmailer ist limitiert).

## 9. Datenschutz / Legal
- **Privacy-Dateninventar:** erstellt (`APP_PRIVACY_DATA_MAP.md`): E-Mail, User-ID, Familie, Rollen, Kinderprofile (optional Foto ohne EXIF/GPS), App-Inhalte, Einladungs-Hashes, lokale Speicherung, Anbieter-Logs; Eltern sehen gegenseitig ihre E-Mail-Adressen
- **Privacy Policy erforderlich:** ja
- **Impressum erforderlich:** ja (§ 5 DDG, sofern geschäftsmäßig; bitte prüfen)
- **Support erforderlich:** ja (App Store: Support-URL)
- **App Privacy Map:** erstellt. Kein Tracking, keine Analytics, keine Werbung. Einzige Drittanfrage: Google Fonts → vor Produktion lokal bündeln.
- **offene Angaben vom Nutzer:** Verantwortlicher (Name, Anschrift, Kontakt), Supabase-Region, SMTP-Anbieter, Support-Kontakt, URLs der Rechtstexte
- **Technisch umgesetzt:** Links konfigurierbar (`VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`, `VITE_SUPPORT_URL`), sichtbar ohne Login (Login-Screen) und in „Konto & Sicherheit“; Browser-Test 9/9

## 10. Capacitor/iOS Readiness
- **WebView-Risiken:** gering; keine Blocker im Code
- **Safe Area:** vorhanden (`viewport-fit=cover`, `env(safe-area-inset-*)`); am Gerät prüfen
- **Keyboard:** Standard-Inputs; Capacitor-Resize-Modus in 7A festlegen
- **Bilder:** `<input type=file accept=image/*>` reicht für v1; Info.plist-Texte Pflicht; native Kamera optional später
- **Share:** `navigator.share` mit Fallback auf die Zwischenablage; funktioniert in WKWebView
- **Realtime:** natives WebSocket, ok
- **Lifecycle:** `visibilitychange`/`focus`/`online` vorhanden; in 7A `App.appStateChange` ergänzen
- **Auth Redirects:** zentral, `native` vorbereitet; PKCE für nativen Reset in 7B prüfen
- **Invite Links:** in nativer App nur mit `VITE_INVITE_BASE_URL` (sonst nur Code)
- **Deep-Link-Konzept:** Universal Link → iOS-App → `appUrlOpen` → URL-Whitelist → bestehende Invite- bzw. Recovery-Logik (Audit, Abschnitt 22)
- **Blocker vor Capacitor:** keine im Code. Vorher nötig: Bundle-ID, Domain, App-Name, Icon (Entscheidungen). Tippziele im Elternbereich (22–28 px) vor dem App Store vergrößern.

## 11. Dependencies
- **npm audit:** vorher 7 (1 low, 1 moderate, 5 high, 0 critical), jetzt **0**
- **Runtime Findings:** `ws` (transitiv über `@supabase/realtime-js`, nur in Node aktiv) → behoben
- **Dev Findings:** vite, postcss/nanoid, @babel/core, browserslist, baseline-browser-mapping → behoben
- **Updates durchgeführt:** `npm audit fix` **ohne** `--force`; nur `package-lock.json` (Patch/Minor). Bundles byte-identisch, alle Tests erneut grün.
- **verbleibende Findings:** 0

## 12. Release Check
- **Script:** `scripts/check-release-readiness.mjs` (Profile `preview` und `production`; keine Secrets, kein Netzwerk). Prüft:
  - Build
  - Bundle: Secrets, Test-Hintertüren, Testkonten, Service-RPCs, Legacy-Personendaten
  - Migrationen und Test-Support
  - Env-Dokumentation, Rechtslinks
  - Backend-Ziel, Legacy-Guard
- **Ergebnis:**
  - `preview`: 15 PASS, 1 WARN (Rechtslinks nicht gesetzt), 0 FAIL
  - `production`: FAIL wie erwartet, bis Produktionswerte gesetzt sind
- **FAMILY Bundle sauber:** ja. Keine Legacy-Namen (Gegenprobe: das Legacy-Bundle enthält 5/5).
- **Test-Backdoors ausgeschlossen:** ja
- **Secrets ausgeschlossen:** ja

## 13. Produktionsmigration
- **Plan aktualisiert:** ja (`PRODUCTION_MIGRATION_PLAN.md`, Schritte 1–25: Pre-Flight, Backend, Migration, Cutover, Rollback)
- **Runbook erstellt:** ja (`PRODUCTION_CUTOVER_RUNBOOK.md`, STOP 1–8 mit menschlicher Freigabe; STOP 7 = ausdrückliche Cutover-Freigabe)
- **Rollback:** Vercel Instant Rollback auf das markierte LEGACY-Deployment, Schreibsperre aufheben; `family-main`/`app_state` bleibt bis zur Abnahme unverändert; nichts vorschnell löschen
- **Produktion jetzt umstellen: NEIN**
- **Voraussetzungen für GO:**
  - Bootstrap-Generator plus Probelauf
  - Produktionsmodus des Migrationsskripts
  - SMTP plus eigene Domain
  - Auth-Einstellungen
  - Rechtstexte
  - Fonts lokal
  - Release-Check `production` grün
  - Punktediff 0

## 14. iOS Roadmap
- **Phase 6B:** Produktionsbackend vorbereiten (Bootstrap, Produktionsmodus, Fonts, Auth, SMTP, Edge Functions) und kontrollierter Cutover nach Runbook
- **Phase 7A:** Capacitor plus Xcode-Projekt, Info.plist, Lifecycle, externe Links, Simulator gegen das Testprojekt. **Kann parallel zu 6B starten.**
- **Phase 7B:** Universal Links (AASA, Associated Domains), `appUrlOpen`-Adapter, Geräte-Test am iPhone, Tippziele 44 pt
- **Phase 8:** Premium/Trial/StoreKit. Geschäftsmodell zuerst; kann auch nach dem ersten Release kommen.
- **Phase 9:** TestFlight, App-Store-Assets, Datenschutzangaben, Review-Demo-Konto, Einreichung
- **Empfohlene Anpassung:** Identitätsentscheidungen (Domain, Bundle-ID, SMTP) vor bzw. zu Beginn von 6B treffen.

## 15. Tests
- **Unit:** 138/138 (neu: Paginierung, Rechtslinks)
- **Integration** (Testprojekt; Aufräumen jetzt über `delete-account`):

| Suite | Ergebnis |
|---|---|
| data | 18/18 |
| mutations | 44/44 |
| admin | 60/60 |
| champion-realtime | 17/17 |
| two-device | 27/27 |
| onboarding | 29/29 |
| auth | 12/12 |
| media | 31/31 |
| invitations | 49/49 |
| account-lifecycle | 34/34 (ohne `STALE`) |
| SQL im Testprojekt | release_hardening 10/10 |
| Zeilengrenzen-Probe | 1100/1100 nach Fix |

- **Browser/Preview:**
  - Einladungen 40/40, zwei Geräte 10/10
  - 5C-Browser 34/34 (ein erster Lauf brach ohne Ausgabe ab; die Wiederholung war grün), 5C zwei Geräte 8/8
  - Rechtslinks und Accessibility 9/9; Accessibility-Stichprobe Home/Elternbereich bei 393, 375 und 320 px
  - Echte Vercel-Preview: **nicht** getestet (geschützt, Sandbox ohne Zugang bzw. WebSocket)
- **Legacy Regression:** reg1, reg2, reg3 identisch zu den Referenzen (vor und nach dem Dependency-Update), Fototest 8/8, Bundle byte-identisch
- **Gesamtergebnis:** alle ausgeführten Tests grün. Nicht ausgeführt: `auth-rls-realtime.test.mjs` (Phase 3; Passwörter der festen Testkonten fehlen). Testprojekt nach dem Aufräumen wieder bei 4 Konten, 3 Familien, 5 Medien, 0 verwaisten Medien.

## 16. Geänderte Dateien
- **Neu:**
  - `supabase/migrations/20260930100000_release_hardening.sql`
  - `supabase/tests/release_hardening_check.sql`
  - `supabase/tests/schema_fingerprint.sql`
  - `scripts/check-release-readiness.mjs`
  - `src/config/legal.js`
  - `tests/legalLinks.test.mjs`
  - `tests/supabase/_cleanup.mjs`
  - `docs/appstore/PHASE_06A_PRODUCTION_IOS_AUDIT.md`, `APP_PRIVACY_DATA_MAP.md`, `AUTH_MAIL_TEMPLATES.md`, `PRODUCTION_CUTOVER_RUNBOOK.md`, `IOS_RELEASE_ROADMAP.md`, `CHATGPT_HANDOFF_PHASE_06A.md`
- **Geändert:**
  - `src/lib/familyData.js` (Paginierung)
  - `src/family/ui.jsx` (LegalLinks), `src/family/AuthScreen.jsx`, `src/family/AccountSecurity.jsx`
  - `.env.example` (Redirect-, Invite- und Legal-Variablen)
  - `package-lock.json`
  - `scripts/migrate-legacy-family.mjs` (Löschen über `delete-family`; nicht Ende-zu-Ende ausgeführt, um die private Migrationsfamilie nicht zu berühren)
  - `supabase/tests/admin_crud_check.sql`, `tests/familyData.test.mjs`
  - 8 Integrationstests (Cleanup)
  - `docs/appstore/PRODUCTION_MIGRATION_PLAN.md`

## 17. Entscheidungen / Angaben vom Nutzer benötigt
- **Domain:** eigene Domain ja oder nein (empfohlen vor SMTP bzw. App Store); ansonsten bleibt `familienapp.vercel.app`
- **SMTP-Anbieter** (z. B. Brevo, Postmark, Resend) und Zugang zur DNS-Verwaltung der Absenderdomain
- **Impressums- und Datenschutzangaben:** Verantwortlicher (Name, Anschrift, Kontakt-E-Mail), Support-Kontakt bzw. -URL
- **Wartungsfenster** und owner-E-Mail für den späteren Cutover
- **Vor Phase 7A:** endgültiger App-Name, Bundle Identifier, Apple Developer Team (Einzelperson oder Organisation), App-Icon
- **Kurzer Blick in Vercel:** Sind die Preview-Env-Variablen auf das Testprojekt gesetzt? (Aus der Sandbox nicht einsehbar.)

## 18. Empfehlung nächster Schritt
1. Nutzerentscheidungen aus Abschnitt 17 treffen (Domain, SMTP, Rechtsangaben).
2. Phase 6B starten: Bootstrap-Generator plus Probelauf (lokal und Wegwerf- bzw. Branch-Projekt) mit identischem Fingerabdruck.
3. Produktionsmodus für `migrate-legacy-family.mjs` inklusive temporärer Importfunktion (feste `family_id`, Ablaufzeit, Drop-Nachweis).
4. Google Fonts lokal bündeln (FAMILY und LEGACY gemeinsam prüfen; Legacy-Regression).
5. `MIN_PASSWORD_LENGTH` = 8, `create_family` für Clients einschränken, CORS-Dev-Origins in Produktion abschaltbar.
6. SMTP plus Templates, Auth-Einstellungen und Rechtstexte vorbereiten; Release-Check `production` grün bekommen.
7. Cutover strikt nach Runbook (STOP 1–8), inklusive Sperre von `app_state` nach der Abnahme.
8. Parallel Phase 7A: Capacitor-Grundgerüst gegen das Testprojekt (keine Produktionsabhängigkeit).
9. Tippziele im Elternbereich auf 44 pt (nur FAMILY-Stil) vor dem App Store.
10. Manuelle iPhone-Checkliste auf der Preview durchführen und Ergebnisse zurückmelden.
