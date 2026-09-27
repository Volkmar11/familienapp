# CHATGPT HANDOFF – PHASE 4A

## 1. Ergebnis

- Phase erfolgreich: JA
- Branch: `feature/appstore-v1`
- Commit: `e2d7771` „feat: add family authentication foundation“ (diese Übergabedatei folgt in einem eigenen Commit direkt danach)
- auf GitHub gepusht: JA (normaler Push, kein Merge nach `main`, kein Produktionsdeploy)
- Legacy-Build erfolgreich: JA (`npm run build` ohne `VITE_BACKEND_MODE`)
- Family-Build erfolgreich: JA (`VITE_BACKEND_MODE=family` + `VITE_FAMILY_*` des Testprojekts, nur als Build-Umgebung übergeben)

## 2. Backend-Modi

- Environment-Schalter: `VITE_BACKEND_MODE` (`legacy` | `family`), zentral in `src/config/backend.js`
- Default: `legacy`, wenn nicht gesetzt oder leer. Ein ungültiger Wert zeigt den Konfigurationsfehler-Bildschirm.
- Legacy-Backend: `src/lib/supabaseLegacy.js` mit `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` (unverändert, Produktion)
- Family-Backend: `src/lib/supabaseFamily.js` mit `VITE_FAMILY_SUPABASE_URL` und `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY` (Testprojekt)
- Schutz gegen versehentliche Produktionsumschaltung:
  - Der Standard ist `legacy`. Die Vercel-Production hat die Variable nicht und bleibt deshalb unverändert.
  - Fehlt die FAMILY-Konfiguration, erscheint ein Fehlerbildschirm.
  - Eine FAMILY-URL, die gleich der Legacy-URL ist, wird blockiert.
  - Secret- bzw. `service_role`-Keys werden abgelehnt.
  - Keine automatische Erkennung, keine hart codierten Projekt-Referenzen.
  - `main.jsx` lädt die jeweils andere App gar nicht (dynamischer Import).

## 3. Auth

- Registrierung: E-Mail + Passwort + Wiederholung, mindestens 6 Zeichen. Bei aktiver E-Mail-Bestätigung erscheint ein Hinweis.
- Login: E-Mail + Passwort; deutsche Fehlermeldungen; Buttons während der Anfrage gesperrt
- Logout: `signOut`, danach Login; bleibt nach Neuladen abgemeldet
- Session Restore: `getSession()` beim Start, Session-Speicherung durch supabase-js (keine eigene Token-Speicherung)
- Auth State Listener: `onAuthStateChange` für SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED und PASSWORD_RECOVERY; im Listener nur State setzen
- Password Reset: `resetPasswordForEmail(email, { redirectTo: window.location.origin })` mit neutraler Erfolgsmeldung. Der Rückweg über PASSWORD_RECOVERY führt zu „Neues Passwort festlegen“ (`updatePassword`). Die Redirect-URLs für Web/Vercel und iOS-Deep-Links sind noch zu konfigurieren.
- Confirm Email im Testprojekt: AUS (Registrierung liefert sofort eine Session, getestet)

## 4. UI

- Login Screen: vorhanden (Tab „Anmelden“, „Passwort vergessen?“)
- Register Screen: vorhanden (Tab „Registrieren“)
- Forgot Password: vorhanden (E-Mail, „Link senden“, Erfolgsmeldung, „Zurück zur Anmeldung“)
- Loading: „Anmeldung wird geprüft …“ und „Familie wird geladen …“ (Pokal-Spinner)
- Nutzer ohne Familie: „Willkommen bei Wochen Champion“, „Deine Familie wird im nächsten Schritt eingerichtet.“, Button „Familie einrichten“ **deaktiviert** (Phase 4B)
- Nutzer mit Familie: Übergangsbildschirm „Familie gefunden“ mit Familienname, Rolle (owner/parent) und Abmelden
- mehrere Familien berücksichtigt: JA (Auswahlbildschirm, „Andere Familie wählen“)
- Stil: wie die bestehende App (Indigo-Verlauf, gelbe Buttons, Fredoka, Safe Area, maximal 480 px breit, Eingabefelder 16 px gegen iOS-Zoom)

## 5. Family Membership

- Abfrage: `family_members` → `family_id, role, created_at, families(id, name)` mit dem Filter `user_id = eigene ID`, nur über RLS (`src/lib/familyMembership.js`)
- keine Familie: `none`, Willkommen-Bildschirm
- eine Familie: `single`, automatisch aktiv, „Familie gefunden“
- mehrere Familien: `multiple`, Auswahl
- create_family in dieser Phase verwendet: NEIN (in der App nicht; nur im Integrationstest, um den Zustand „mit Familie“ herzustellen)

## 6. Legacy-Kompatibilität

- app_state weiterhin nutzbar: JA
- bestehende App unverändert erreichbar: JA (einzige Änderung in `App.jsx`: Import des Clients aus `supabaseLegacy.js`; keine Auth-Bildschirme und keine Auth-Aufrufe im LEGACY-Modus, getestet)
- Datenverlust-Fix erhalten: JA (Ladefehler führt zum Fehlerbildschirm mit 0 Schreibzugriffen, getestet)
- Datumsfix erhalten: JA (`dateUtils`-Tests 15/15)
- Produktionsdaten verändert: NEIN

## 7. Tests

- automatisierte Tests: `tests/backendConfig.test.mjs` **10/10 PASS** (Modus fehlt/legacy/family/ungültig, FAMILY ohne Env, FAMILY = Legacy-URL, Secret-Key, deutsche Fehlertexte, Klassifizierung); `tests/dateUtils.test.mjs` **15/15 PASS**
- Auth-Tests: `tests/supabase/family-auth.test.mjs` gegen `wochen-champion-test` **12/12 PASS** (Registrierung, sofortige Session, keine Familie, doppelte Registrierung, schwaches Passwort, Logout, falsches Passwort, Login, Session-Restore, eine Familie, mehrere Familien, Aufräumen)
- Browser-/UI-Test: Chromium 393×852 (mobil) gegen das Testprojekt **27/27 PASS**. Geprüft: alle Bildschirme ohne horizontales Scrollen, Fehlermeldungen, gesperrte Buttons, Reset-Aufruf (abgefangen, keine Mail), Session-Restore, Mehrfach-Familien, Logout, nur Testprojekt kontaktiert, keine Tokens in der Konsole, 3 Konfigurationsfehler ohne Supabase-Aufruf, LEGACY unverändert und Datenverlust-Fix.
- Ergebnisse: alle bestanden. „Anmeldung wird geprüft“ ist nur einen Sekundenbruchteil sichtbar, deshalb gibt es keinen Screenshot. Die Wegwerf-Konten `wc-p4a-…@example.com` wurden danach gelöscht; im Testprojekt verbleiben nur `wc-test-a`/`wc-test-b` mit Testfamilie A/B.

## 8. Sicherheit

- Secrets committed: NEIN
- service_role verwendet: NEIN (wird aktiv abgelehnt)
- Tokens/Passwörter geloggt: NEIN
- FAMILY-Modus gegen Produktionsprojekt verbunden: NEIN
- Auffälligkeiten:
  - Die Legacy-Produktion ist weiterhin ohne Anmeldung les- und schreibbar (bekannt aus Phase 3B).
  - Supabase verschickt ohne eigenes SMTP keine Reset-Mails an echte Nutzer.
  - Die Chromium-Tests in der Cloud-Umgebung brauchen einen gezielten SPKI-Pin für die Proxy-CA (keine generelle Abschaltung der TLS-Prüfung).

## 9. Geänderte Dateien

- geändert: `src/main.jsx` (Moduswahl, Konfigurationsfehler), `src/App.jsx` (Client-Import)
- neu: `src/config/backend.js`, `src/lib/supabaseLegacy.js`, `src/lib/supabaseFamily.js`, `src/lib/auth.js`, `src/lib/familyMembership.js`, `src/family/FamilyApp.jsx`, `src/family/AuthScreen.jsx`, `src/family/ui.jsx`, `.env.example`, `tests/backendConfig.test.mjs`, `tests/supabase/family-auth.test.mjs`, `docs/appstore/PHASE_04A_AUTH.md`, `docs/appstore/CHATGPT_HANDOFF_PHASE_04A.md`
- unverändert: `package.json`, `package-lock.json`, SQL-Migration, LehrerAssistent, GitHub-Pages-Workflow

## 10. Offene Punkte vor Phase 4B

- Wo der FAMILY-Modus im Browser getestet wird: lokal (`.env.local`) oder als Vercel **Preview** mit Preview-Variablen (`VITE_BACKEND_MODE=family`, `VITE_FAMILY_*` = Testprojekt). Production-Variablen bleiben unangetastet.
- Testprojekt: Site URL und Redirect-URLs setzen (localhost, Vercel-Preview) für den Passwort-Reset
- Fachliche Vorgaben für das Onboarding: Pflichtangaben, Anzahl und Reihenfolge der Kinderprofile, Avatare und Farben, Auswahl der Starter-Inhalte, PIN-Konzept

## 11. Empfehlung Phase 4B

1. Onboarding-Assistent hinter dem Button „Familie einrichten“ (mehrstufig, abbrechbar, im bestehenden Stil)
2. Schritt „Familienname“, dann `create_family` (RPC; danach Mitgliedschaften neu laden)
3. Schritt „Kinderprofile“ mit Name, Emoji/Farbe und Reihenfolge (`profiles`); optional ein eigenes Elternprofil (`is_parent`)
4. Schritt „Starter-Kategorien/-Aufgaben/-Belohnungen“ aus `src/config/starterContent.js` auswählen und anpassen (Punkte editierbar) → `categories`, `tasks`, `rewards`
5. Einstellungen: `show_daily_crown` und `require_confirmation` in `family_settings`
6. Eltern-PIN nur vorbereiten (Konzept und UI-Platzhalter; Speicherung ausschließlich als Hash, z. B. über eine RPC), noch nicht scharf schalten
7. Die Anlage sollte möglichst atomar erfolgen (z. B. RPC `complete_onboarding` oder eine robuste Wiederaufnahme bei Abbruch)
8. Abschluss: neue Familie aktiv, Übergang in einen ersten Familien-Startbildschirm; die volle App-Umstellung folgt in Phase 4C
9. Tests: Onboarding-Integration gegen das Testprojekt (Wegwerf-Konten), RLS-Stichproben, UI-Test mobil
10. Weiterhin: nur Testprojekt, kein Merge nach `main`, LEGACY-Produktion unverändert
