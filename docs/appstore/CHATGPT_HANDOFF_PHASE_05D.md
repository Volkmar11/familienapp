# ChatGPT Handoff – Phase 5D: Mehrere Eltern / Einladungen

## 1. Ergebnis

- Der Mehr-Eltern-Workflow ist im Testprojekt `wochen-champion-test` umgesetzt und getestet: sichere Einladungen (Link und Code), Annahme nach Login bzw. Registrierung, Eltern- und Einladungsverwaltung, Rollen, Entfernen, Verlassen und Mitgliedschafts-Realtime.
- Produktion (`gkkzjmszcjivtaygbmfw`) ist unverändert: nur lesend geprüft; 1 Tabelle, 0 Buckets, keine Einladungs-RPCs.
- Kein Merge nach `main`, `family-main` unverändert, Vercel Production unverändert.
- Commits auf `feature/appstore-v1`:
  - `8d62e38` (WIP-Zwischenstand)
  - „feat: add secure family invitations“ (Abschluss)

## 2. Invitation Modell

- `private.family_invitations`:
  - Spalten: `id, family_id, token_hash, role='parent', created_by, created_at, expires_at, used_at, used_by, revoked_at`
  - RLS aktiv, keine Policy, keine Grants → nur über RPCs erreichbar.
- Token:
  - 128 Bit (`gen_random_bytes(16)`, 32 Hex-Zeichen), serverseitig erzeugt; gespeichert wird nur SHA-256.
  - Der Klartext wird genau einmal zurückgegeben.
- Kanonisierung: Groß-/Kleinschreibung egal, Leerzeichen und Bindestriche werden entfernt, danach muss `^[0-9a-f]{32}$` passen.
- TTL 7 Tage, einmalig verwendbar, widerrufbar. Die Rolle ist immer `parent`.
- `private.invitation_attempts` speichert Fehlversuche für das Rate-Limit.
- Migration: `supabase/migrations/20260929300000_family_invitations.sql`, mit Testsperre `app.migration_target='test'`.

## 3. Einladung erzeugen

- Ort: Elternbereich (Rolle plus Familien-PIN) → Karte „Eltern & Einladungen“ → „+ Elternteil einladen“.
- Link und Code werden **einmalig** angezeigt, mit dem Hinweis, dass sie später nicht erneut abrufbar sind.
- Teilen:
  - „Teilen …“ über `navigator.share`, mit Fallback auf die Zwischenablage
  - „Link kopieren“, „Code kopieren“
  - keine zusätzliche Bibliothek
- Link: `VITE_INVITE_BASE_URL` oder die vertrauenswürdige App-Herkunft (über den zentralen Redirect-Helfer), dann `/?invite=<token>`. Es gibt keine fest eingetragene Preview-URL.
- PIN-Hinweis: „Für den geschützten Elternbereich benötigt ihr zusätzlich eure Familien-PIN.“ Die PIN wird nie geteilt.
- Limits: höchstens 10 aktive Einladungen je Familie und 20 neue je Nutzer und Stunde.

## 4. Einladung annehmen

- Es gibt keinen automatischen Beitritt. Die App zeigt „Einladung zu <Familienname>“ und „Du trittst dieser Familie als Elternteil bei.“ mit den Buttons „Einladung annehmen“ und „Abbrechen“.
- `accept_family_invitation` ist atomar:
  - Sperrreihenfolge: erst die Familie, dann die Einladung (`FOR UPDATE`).
  - Bei parallelen Annahmen ist genau eine erfolgreich (getestet mit 5 Nutzern).
  - Ist der Nutzer bereits Mitglied, lautet das Ergebnis `already_member` (idempotent); die Einladung wird dann nicht verbraucht.
- Ungültig, abgelaufen, verwendet oder widerrufen ergibt immer dieselbe Meldung: „Diese Einladung ist ungültig oder nicht mehr verfügbar.“
- Bei Erfolg zeigt die App „Du bist der Familie beigetreten.“ und den PIN-Hinweis. Danach lädt sie die Mitgliedschaften neu und wählt die neue Familie aus.
- Einladungscodes lassen sich auch manuell eingeben: im Onboarding, in der Familienauswahl und im Elternbereich.

## 5. Login/Registrierung

- Beim Start liest die App `?invite=` und prüft das Format. Der Token kommt in `sessionStorage` (`wc.pendingInvite`), danach entfernt `history.replaceState` den Parameter aus der URL.
- Warum `sessionStorage`: Der Token übersteht Login und Registrierung sowie einen Reload im selben Tab, bleibt aber nicht dauerhaft auf dem Gerät und geht nicht in andere Tabs über.
- Der Token wird gelöscht, sobald die Einladung angenommen, abgebrochen oder als ungültig erkannt wurde, sowie bei „bereits Mitglied“.
- Nicht angemeldet: Die App zeigt „Du wurdest zu einer Familie eingeladen.“ mit „Anmelden“, „Konto erstellen“ und „Einladung verwerfen“. Nach der Anmeldung geht der Einladungsfluss weiter.
- Registrierung aus einer Einladung: `signUp(..., { emailRedirectTo: <App-Herkunft>/?invite=<token> })`.
  - „Confirm Email“ ist im Testprojekt AUS.
  - Der Codepfad ist im Browser simuliert: Signup ohne Session, Hinweis „bestätige deine E-Mail-Adresse“, korrektes `redirect_to`, Rückkehr über den Bestätigungslink in einem neuen Tab.

## 6. Elternliste

- `list_family_adults`: `user_id, email, role, created_at, is_self`. Nur Mitglieder dürfen die Liste abrufen.
- `list_family_invitations`: nur aktive Einladungen, **ohne `token_hash`**.
- Die UI zeigt:
  - E-Mail, Rolle, Beitrittsdatum und „(du)“ je Elternkonto
  - offene Einladungen mit Ablaufzeit und Ersteller:in
  - „Widerrufen“ (erlaubt für owner und parent derselben Familie)

## 7. Rollenverwaltung

- `promote_family_parent`: nur owner, macht aus parent einen owner.
- Mehrere owner sind erlaubt. In v1 gibt es kein Zurückstufen.
- Der Rollenwechsel erscheint auf dem anderen Gerät ohne Neuanmeldung (Zwei-Geräte-Test grün).

## 8. Parent entfernen

- `remove_family_parent`: nur owner. owner-Konten lassen sich nicht entfernen, das eigene Konto auch nicht.
- Die offenen Einladungen des Entfernten werden widerrufen.
- Der Entfernte verliert sofort den Zugriff (RLS). Seine App bekommt das Signal über `user_membership_sync` und reagiert so:
  - FamilyChampion wird ausgehängt; Realtime, PIN-Freischaltung und Bild-Cache werden verworfen.
  - Hinweis „Du hast keinen Zugriff mehr auf diese Familie.“
  - Danach folgt die Auswahl bzw. das Onboarding.

## 9. Familie verlassen

`leave_family` sperrt die Familienzeile und ist damit rennsicher.

| Fall | Ergebnis |
|---|---|
| parent verlässt | Austritt |
| owner verlässt, weiterer owner vorhanden | Austritt ohne Rollenänderung |
| letzter owner, weitere parents | ältester parent wird owner, danach Austritt |
| letztes Elternkonto | blockiert: „Du bist das letzte Elternkonto dieser Familie. Lösche die Familie stattdessen über die Gefahrenzone.“ |

- In jedem Fall werden die offenen Einladungen des Austretenden widerrufen.
- Verlassen die letzten beiden Konten gleichzeitig, ist genau eines erfolgreich; das verbleibende ist owner.
- `execute_account_deletion` ist ebenfalls rennsicher: Es sperrt erst alle Familien, plant dann und widerruft die Einladungen des gelöschten Nutzers.

## 10. Membership Realtime

- `public.user_membership_sync (user_id PK, version, changed_at)`:
  - RLS: nur die eigene Zeile lesbar; Clients können nicht schreiben
  - in der Publikation `supabase_realtime`
- Ein Trigger auf `family_members` (INSERT/UPDATE/DELETE) erhöht die Version des betroffenen Nutzers (bei DELETE `OLD.user_id`). Wird der Auth-User gerade gelöscht, entfällt das Signal; das verhindert FK-Fehler.
- Client:
  - `createMembershipRealtime` ist ein generischer `createRowSyncRealtime`; `family_sync` funktioniert unverändert.
  - FamilyApp lädt die Mitgliedschaften entprellt still neu, auch beim Wechsel in den Vordergrund.
- Das Signal erreicht auch ein gerade entferntes Konto (in Node geprüft). Chromium hat im Proxy keine WebSockets; dort ist der Vordergrund-Reload getestet.

## 11. Test-Backdoor

- `supabase/test-support/add_family_member.sql` ist gelöscht.
- `public.test_add_family_member` entfernt die Migration (`drop function if exists`); im Testprojekt ist die Funktion verifiziert weg.
- Alle Tests laufen jetzt über den echten Einladungsfluss: `account-lifecycle.test.mjs`, 5C-Browser-Skripte, neue Suites.
- Weiterhin nur im Testprojekt vorhanden: `public.legacy_import_redemptions` (Phase 5A, offener Punkt).

## 12. Sicherheit

- Alle 9 RPCs:
  - `SECURITY DEFINER`, `search_path=''`, prüfen `auth.uid()`
  - EXECUTE nur für `authenticated`; `anon` und `public` entzogen
- `family_members`: direktes INSERT, UPDATE und DELETE sind für Clients wirkungslos.
  - Die Policy `family_members_delete` ist entfernt.
  - Das wird getestet.
- Anti-Abuse: höchstens 20 ungültige Versuche je Nutzer in 10 Minuten, danach gesperrt (auch für gültige Tokens). Die Antworten verraten nicht, ob ein Token existiert.
- Keine Tokens in Logs, Konsole, Bundle oder Doku. Der Token ist nur einmal in der UI sichtbar und nach „Fertig“ aus dem DOM entfernt. Kein `localStorage`.
- Advisor: nur erwartete Hinweise.
  - aufrufbare `SECURITY DEFINER`-RPCs (beabsichtigt)
  - private Tabellen ohne Policy (beabsichtigt)
  - Leaked-Password-Protection deaktiviert (bekannt)

## 13. Tests

| Suite | Ergebnis |
|---|---|
| Unit (alle) | 134/134 |
| SQL `family_invitations_check.sql` (lokal + Testprojekt) | 31/31 |
| SQL `account_lifecycle_check.sql` (lokal) | 22/22 |
| Integration Einladungen | 49/49 |
| Integration Account-Lifecycle (über Einladungen, ohne `STALE`) | 34/34 |
| Ältere Suites: data, mutations, admin, champion-realtime, two-device, onboarding, auth, media | 18, 44, 60, 17, 27, 29, 12, 30 – alle grün |
| Browser 393×852 | 40/40 |
| Zwei Geräte | 10/10 |
| 5C-Browser-Regression | 34/34 und 8/8 |
| Legacy: Bundle byte-identisch zu 5C; Regressionsläufe identisch; Fototest | 8/8 |
| Bundle-Prüfung | keine Tokens, Testkonten, Secrets oder Hintertür |

- Der Browsertest hat einen echten Fehler gefunden, der behoben ist: Der Token blieb nach der Annahme bis „Familie öffnen“ in `sessionStorage`. Jetzt wird er sofort gelöscht.
- `auth-rls-realtime.test.mjs` (Phase 3) wurde nicht ausgeführt, weil die Passwörter der festen Testkonten fehlen.
- Aufgeräumt: 60 Wegwerf-Konten über die Edge Function `delete-account` gelöscht. Das Testprojekt steht wieder bei 4 Konten, 3 Familien, 5 Medien, 0 verwaisten Medien und 0 Einladungen.

## 14. Geänderte Dateien

- Neu:
  - `supabase/migrations/20260929300000_family_invitations.sql`
  - `supabase/tests/family_invitations_check.sql`
  - `src/lib/familyInvitations.js`
  - `src/family/InviteScreen.jsx`
  - `src/family/FamilyAdultsPanel.jsx`
  - `tests/familyInvitations.test.mjs`
  - `tests/supabase/family-invitations.test.mjs`
  - `docs/appstore/PHASE_05D_FAMILY_INVITATIONS.md`
  - `docs/appstore/CHATGPT_HANDOFF_PHASE_05D.md`
- Geändert:
  - `src/lib/familyRealtime.js`
  - `src/lib/auth.js`
  - `src/family/FamilyApp.jsx`
  - `src/family/AuthScreen.jsx`
  - `src/family/FamilyChampion.jsx`
  - `src/family/onboarding/OnboardingWizard.jsx`
  - `src/family/onboarding/WelcomeStep.jsx`
  - `tests/onboarding.test.mjs` (eng begrenzte `sessionStorage`-Ausnahme nur für den Einladungs-Token)
  - `tests/supabase/account-lifecycle.test.mjs`
- Gelöscht: `supabase/test-support/add_family_member.sql`

## 15. Offene Punkte

- **SMTP Produktion:** eigener SMTP-Anbieter für Auth-Mails (Registrierung, Reset); die Supabase-Standardmails sind stark limitiert.
- **Confirm Email Produktion:** in Produktion aktivieren. Der Einladungs-Codepfad dafür ist vorbereitet und simuliert getestet, aber noch nicht mit echter Mail.
- **Redirect-Allowlist:**
  - Produktions-Domain inklusive `/?invite=*` in den Auth-Redirect-URLs erlauben.
  - `VITE_INVITE_BASE_URL` setzen; für die native App ist das Pflicht.
- **Datenschutz/Impressum:** Eltern derselben Familie sehen gegenseitig ihre E-Mail-Adressen; das in der Datenschutzerklärung nennen. Impressum fehlt noch.
- **Produktionsmigration:** alle Migrationen 4A–5D in der richtigen Reihenfolge; Guard, Edge Functions, Bucket und Realtime-Publikation.
  - Außerdem die Leaked-Password-Protection aktivieren.
  - Die Policy `families_delete` entfernen: direktes Löschen durch owner ohne Medienbereinigung. Stattdessen nur noch die Edge Function nutzen.
  - `legacy_import_redemptions` nicht nach Produktion übernehmen bzw. im Testprojekt entfernen.
- **Capacitor/iOS:** Universal Links bzw. Deep Link für `?invite=`, native Redirect-URL, Share-Sheet (`navigator.share` im WKWebView prüfen).
- **Premium/StoreKit:** nicht begonnen.
- **TestFlight:** nicht begonnen.

## 16. Empfehlung nächste Phase

Nächster Block: **PHASE 6 – PRODUCTION & IOS READINESS**

1. Produktions-Supabase vorbereiten: Migrationsplan 4A–5D, Dry-Run gegen eine Kopie bzw. einen Branch, Guard-Strategie für Produktion.
2. Auth in Produktion: SMTP, „Confirm Email“ an, Redirect-Allowlist (Web plus iOS), Leaked-Password-Protection.
3. Edge Functions `delete-account` und `delete-family` in Produktion, mit CORS auf die Produktions-Domain und `WC_ALLOWED_ORIGINS`.
4. Aufräumen: Policy `families_delete` entfernen, Test-Hilfsfunktionen nicht übernehmen.
5. Feste Web-Domain und `VITE_AUTH_REDIRECT_URL` / `VITE_INVITE_BASE_URL` setzen; Vercel-Production erst nach Freigabe umstellen.
6. Capacitor-Projekt anlegen: Bundle-ID, App-Icon, Splash; WKWebView-Test von Auth, Realtime, Kamera/Fotos.
7. Universal Links bzw. Associated Domains für Einladungs- und Reset-Links (`apple-app-site-association`).
8. Datenschutzerklärung, Impressum und App-Store-Datenschutzangaben (Privacy Nutrition Label); Account-Löschung ist in der App vorhanden.
9. Monitoring: Auth- und Function-Logs, Fehlerberichte ohne personenbezogene Daten.
10. TestFlight-Build und interner Test mit zwei Geräten (Einladung, Rollen, Realtime, Löschen).
