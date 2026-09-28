# CHATGPT HANDOFF – PHASE 5C

## 1. Ergebnis
- Phase erfolgreich: JA. Konto & Sicherheit, Passwort-Reset, Account- und Familienlöschung; alle Tests grün, ausschließlich im Testprojekt
- Branch: `feature/appstore-v1`
- Commit: `b1c6cfa` („feat: add account security and deletion“), danach Handoff-Commit
- Push: normal nach `origin/feature/appstore-v1` (kein Force, kein Merge nach `main`)
- Legacy-Build: OK. 3 Legacy-Regressionen identisch, Legacy-Fototest 8/8, keine Konto- oder Lösch-Funktionen im Legacy-Bundle
- Family-Build: OK. Kein Secret und kein service_role-Wert im Bundle (nur die Schutzregel, die solche Schlüssel ablehnt)
- Produktionsdaten verändert: NEIN. Nur gelesen: 0 Edge Functions, keine Lebenszyklus-Funktionen, 0 Buckets, `app_state` unverändert
- neue Migration: `supabase/migrations/20260929200000_account_lifecycle.sql`, nur im Testprojekt angewandt (`account_lifecycle`)
- neue Edge Function: `delete-account` und `delete-family` (mit `_shared/lifecycle.ts`), nur im Testprojekt, `verify_jwt = true`

## 2. Konto & Sicherheit
- Bereich vorhanden: JA, `src/family/AccountSecurity.jsx`. Erreichbar über „Verwalten“ (auch **vor** der PIN), im Onboarding und in der Familienauswahl
- E-Mail: wird angezeigt, dazu Familien und Rollen
- Passwort ändern: aktuelles Passwort (Re-Auth mit der E-Mail der Sitzung) + neues Passwort + Wiederholung → `updateUser`
- Passwort vergessen: Reset-Link an die eigene Adresse; auf dem Login „Passwort vergessen?“
- Logout: JA
- Account löschen: JA, „Account dauerhaft löschen …“ direkt sichtbar

## 3. Passwort-Reset
- resetPasswordForEmail: JA, mit neutraler Meldung (keine Benutzer-Enumeration; bekannte und unbekannte Adresse identisch, getestet)
- redirectTo: zentral über `src/lib/authRedirects.js`
  - localhost und Vercel-Preview: eigene Origin + `/`
  - Produktion: `VITE_AUTH_REDIRECT_URL`
  - native: `VITE_NATIVE_AUTH_REDIRECT_URL`
- erlaubte Test-Redirects: **nicht gesetzt** (kein Zugriff auf die Auth-URL-Konfiguration). Bitte im Dashboard eintragen: wochen-champion-test → Authentication → URL Configuration
  - Site URL: `https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app`
  - Redirect URLs:
    - `http://localhost:5173/**`
    - `http://localhost:4173/**`
    - `https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app/**`
    - optional `https://familienapp-*-volkmar11s-projects.vercel.app/**`
- PASSWORD_RECOVERY: Ereignis plus URL-Fallback → „Neues Passwort festlegen“; danach werden die Token-Parameter aus der URL entfernt. Ein abgelaufener Link zeigt eine verständliche Meldung.
- neues Passwort: min. 6 Zeichen, Wiederholung wird geprüft; Login mit dem neuen Passwort getestet
- unbekannte E-Mail: gleiche neutrale Meldung
- Mail-E2E getestet: NEIN, weil der Standard-Mailversand nur an Team-Adressen geht und gedrosselt ist. Die Landung aus dem Link ist mit einer echten Recovery-Session in der URL simuliert und getestet.
- SMTP-Status: Supabase-Standard (kein eigener SMTP). Für die Produktion nötig: eigener SMTP mit Absenderdomain (SPF/DKIM/DMARC) und deutsche Vorlagen. Nicht ungefragt eingerichtet.

## 4. iOS Vorbereitung
- Redirect-Abstraktion: `detectAuthEnvironment()` / `getAuthRedirectUrl()` (localhost, vercel-preview, production-web, native)
- Web: eigene Origin bzw. `VITE_AUTH_REDIRECT_URL`
- Preview: Branch-Alias bzw. eigene Preview-Origin
- zukünftiger Deep Link: `VITE_NATIVE_AUTH_REDIRECT_URL` (Universal Link bevorzugt) → `appUrlOpen` → `setSession`/`exchangeCodeForSession` → derselbe Recovery-Pfad. Bundle-ID und Scheme sind bewusst nicht festgelegt.
- Capacitor installiert: NEIN

## 5. Account Deletion
- innerhalb App auffindbar: JA (Konto & Sicherheit, ohne tiefe Menüs, ohne PIN)
- Re-Auth: Client `signInWithPassword` mit der Sitzungs-E-Mail; Server verlangt eine Passwort-Anmeldung ≤ 5 min (`amr`). Getestet, auch mit einer echten über 5 Minuten alten Anmeldung
- Bestätigung: Warnbildschirm mit Folgen je Familie + Häkchen + Passwort + „LÖSCHEN“; der Button ist bis dahin gesperrt
- Edge Function: `delete-account`. Ablauf: Plan → Medien → DB → Auth-User hart löschen
- Client kann Ziel-user_id bestimmen: NEIN. Die ID kommt nur aus dem verifizierten JWT, der Body wird nicht gelesen (mit fremder `user_id` getestet)
- Auth User gelöscht: JA, kein Login mehr möglich; eine Neu-Registrierung mit derselben Adresse ist möglich
- Session danach: lokal entfernt. Realtime, Medien-Cache, Familien- und PIN-State werden verworfen, danach Login mit „Dein Account wurde gelöscht.“
- idempotent: JA. Der Plan wird neu berechnet; fehlende Medien und Mitgliedschaften werden ignoriert, `deleteUser` läuft einmal am Ende, ein erneuter Aufruf liefert `401` ohne Schaden. Der Button ist während der Löschung gesperrt.

## 6. Shared Families
- letzter Erwachsener: Familie inkl. Medien und aller Tabellen wird gelöscht (Kaskaden per SQL geprüft: 0 Reste)
- andere Eltern bleiben: Familie, Kinder, Aufgaben, Punkte, Belohnungen, Einlösungen und Bilder bleiben; Audit-Felder werden NULL, Zeitpunkte bleiben
- owner löscht sich: Übergabe an ein anderes Elternteil, falls kein weiterer owner existiert
- Ownership Transfer: ältestes verbleibendes Mitglied nach `created_at`, bei Gleichstand `user_id`. Spielerprofile erzeugen keine Ownership. Bei weiterem owner gibt es keine Rollenänderung.
- parent löscht sich: nur Austritt; der owner und die Familie bleiben unverändert
- mehrere Familien: je Familie korrekt behandelt (getestet mit 4 Familien: löschen / übergeben / austreten / zweiter owner)

## 7. Family Delete
- owner: JA, im entsperrten Elternbereich unter „Gefahrenzone“, über die Edge Function `delete-family`
- parent: blockiert; UI-Hinweis und serverseitig `403` (getestet)
- PIN: erneut eingeben, serverseitig über `verify_parent_pin` mit Fehlversuchssperre
- Re-Auth: Passwort (frische Session ≤ 5 min) + „FAMILIE LÖSCHEN“
- DB-Daten: Familie inkl. aller Kaskaden gelöscht
- Medien: `families/<id>/` vorher über die Storage-API entfernt
- Auth Account bleibt: JA; danach Familienauswahl bzw. Onboarding

## 8. Media Cleanup
- Family Tree: serverseitig `removeFamilyMediaTree` (listen und löschen, nur Pfade aus Familien-IDs des Plans)
- Reihenfolge: Medien → DB → Auth-User
- verwaiste Objekte: 0 im Testprojekt; gemeinsame Familien behalten ihre Bilder
- Auth User mit Storage: `storage.objects` hat keinen FK auf `auth.users`; die Objekte einer weiterbestehenden Familie bleiben erhalten und lesbar (getestet)
- Tests: Integration (Medien weg bzw. bleiben) + SQL-Nachprüfung (0 Objekte der gelöschten Familien)

## 9. Datenbank / Edge
- Migration:
  - `account_deletion_plan`, `execute_account_deletion`, `family_owner_check`, `delete_family_as_service`, alle nur für `service_role`
  - Trigger `family_members_bump_sync`
  - Trigger-Fix
- neue/angepasste FKs: keine nötig. Alle Referenzen auf `auth.users` sind CASCADE (Mitgliedschaft) bzw. SET NULL (Audit); kein RESTRICT
- Audit-Felder: **Fehler behoben.** Die Stempel-Trigger schrieben `confirmed_by`/`acknowledged_by` zurück, dadurch scheiterte `ON DELETE SET NULL`, und Eltern mit Bestätigungen waren nicht löschbar. Jetzt ist NULL nur erlaubt, wenn der Auth-User nicht mehr existiert.
- Edge Function Auth: Gateway-JWT-Prüfung + `auth.getUser(token)` + Frische-Check `amr`; CORS auf localhost und die Vercel-Previews beschränkt (weitere per Secret `WC_ALLOWED_ORIGINS`)
- serverseitiger Secret: von der Supabase-Laufzeit bereitgestellt (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEYS`); nie im Repo, nie in `VITE_*`, nie in Logs
- im Client vorhanden: NEIN (Bundle geprüft; Unit-Test prüft den Client-Code statisch)

## 10. Tests
- Unit: 123/123, neu darin `accountLifecycle` 10
- Auth: Browser-Reset und Recovery (neutral, Wiederholung falsch, neues Passwort, abgelaufener Link); `family-auth` 12/12
- Account Delete:
  - SQL-Check 22/22 (lokal und Testprojekt)
  - Integration 35/35 mit echten Edge Functions, inkl. Angriffe und 5-Minuten-Frische
  - SQL-Kaskaden-Nachprüfung: 0 Reste
- Shared Family: in Integration und SQL-Check enthalten (Übergabe, parent, mehrere Familien, zweiter owner)
- Family Delete: Integration (owner, parent blockiert, falsche PIN, falsches Passwort, Medien) + Browser
- Browser: 34/34 (Chromium 393 × 852, kein horizontales Scrollen, keine technischen Meldungen, keine JS-Fehler)
- Zwei-Geräte: 8/8. A löscht, B bleibt angemeldet und wird ohne Neuanmeldung owner, die PIN-Entsperrung bleibt, Realtime ist weiter aktiv
- Legacy Regression: 3 Skripte identisch, Legacy-Fotos 8/8
- Ergebnis: alles grün. Bestehende Suites nach der Migration:
  - data 18/18, mutations 44/44, admin 60/60, champion-realtime 17/17
  - two-device 27/27, onboarding 29/29, auth 12/12, media 30/30

## 11. Sicherheit
- Service Role im Browser: NEIN
- Service Role committed: NEIN
- Passwörter geloggt: NEIN; Function-Logs enthalten nur Aktion und Zähler (geprüft)
- fremder Account löschbar: NEIN (fremde `user_id` im Body wirkungslos)
- fremde Familie löschbar: NEIN (`403`)
- anon: `401` (beide Functions); ungültiges Token `401`
- Produktionsmutation: NEIN

## 12. Apple/App-Store-Basis
- Account Creation vorhanden: JA (E-Mail + Passwort)
- Account Deletion innerhalb App: JA, leicht auffindbar
- vollständige Löschung: JA. Der Auth-User wird hart gelöscht; alleinige Familien werden inkl. Medien gelöscht, aus gemeinsamen Familien tritt das Konto aus
- reine Deaktivierung: NEIN (auch kein reiner Support-Kontakt und kein reiner Weblink)
- offene Compliance-Punkte:
  - Datenschutzerklärung und Impressum in der App
  - Produktions-SMTP
  - Hinweis zur Löschung in der App-Store-Beschreibung und im Review-Hinweis
  - Datenexport (optional)
  - Sign in with Apple erst nötig, falls andere Social Logins kommen

## 13. Geänderte Dateien
- neu:
  - `src/lib/authRedirects.js`
  - `src/lib/accountLifecycle.js`
  - `src/family/AccountSecurity.jsx`
  - `supabase/functions/_shared/lifecycle.ts`
  - `supabase/functions/delete-account/index.ts`
  - `supabase/functions/delete-family/index.ts`
  - `supabase/migrations/20260929200000_account_lifecycle.sql`
  - `supabase/tests/account_lifecycle_check.sql`
  - `supabase/test-support/add_family_member.sql` (nur Testprojekt)
  - `tests/accountLifecycle.test.mjs`
  - `tests/supabase/account-lifecycle.test.mjs`
  - `docs/appstore/PHASE_05C_ACCOUNT_SECURITY.md`
  - `docs/appstore/CHATGPT_HANDOFF_PHASE_05C.md`
- geändert:
  - `src/family/FamilyApp.jsx`: Konto-Bereich, Recovery-Fallback, Hinweise, Mitgliedschafts-Refresh
  - `src/family/AuthScreen.jsx`: zentraler Redirect, neutrale Meldung, Hinweise
  - `src/family/FamilyChampion.jsx`: Konto-Button, Familie löschen, Rollenabgleich
  - `src/family/onboarding/OnboardingWizard.jsx`, `WelcomeStep.jsx`: Konto-Link

## 14. Offene Punkte
- Eltern-Einladungen: offen (Phase 5D). Im Test ersetzt durch die Test-Hilfsfunktion.
- SMTP / E-Mail-Produktion:
  - eigener SMTP und Vorlagen
  - Confirm Email in der Produktion: Empfehlung AN
  - Auth-Redirect-Allowlist im Testprojekt noch von dir einzutragen (siehe 3)
- Datenschutz-/Impressumsseiten: offen
- Produktionsmigration: offen und nicht freigegeben
  - Migrationen 5A–5C, Edge Functions, Auth-URL-Konfiguration und SMTP der Produktion
  - direktes DELETE auf `families` für Clients vor der Produktion entziehen
  - Leaked Password Protection aktivieren, Mindestlänge 8
- Capacitor/iOS: offen (Deep-Link-Abstraktion vorbereitet)
- Premium/StoreKit: offen

## 15. Empfehlung nächste Phase
**Phase 5D – Mehrere Eltern / Einladungen**, noch nicht umsetzen:

1. Einladungsmodell: einmaliger, zeitlich begrenzter Code bzw. Link (gehashter Token), nur owner/parent können einladen
2. Beitritt als `parent` nach Login oder Registrierung; kein Beitritt ohne gültige Einladung; Einladung widerrufbar
3. Rollenverwaltung: owner kann parent zum owner machen oder entfernen; eigene Mitgliedschaft verlassen (nutzt die Übergabe-Regel aus 5C)
4. UI: „Eltern einladen“ im Elternbereich, Liste der Eltern, Beitrittsbildschirm; die PIN bleibt pro Familie
5. Realtime und Mehrgeräte: Rollenwechsel und Entfernen sofort sichtbar (Grundlage aus 5C vorhanden)
6. `test_add_family_member` durch den echten Einladungsweg ersetzen und aus dem Testprojekt entfernen
7. Sicherheitstests: fremde Codes, abgelaufene/benutzte Codes, Rate-Limit, keine Enumeration
8. Danach Produktionsvorbereitung: SMTP, Confirm Email, Redirect-Allowlist, Datenschutz/Impressum, direktes Familien-DELETE entziehen
9. Danach Capacitor/iOS (Deep Links, Kamera), dann Premium/StoreKit, dann TestFlight
10. Produktion weiterhin erst nach ausdrücklicher Freigabe migrieren
