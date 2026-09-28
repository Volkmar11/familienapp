# Phase 5C – Account & Security

Stand 28.09.2026. Umsetzung und Tests ausschließlich im Supabase-Testprojekt `wochen-champion-test` (`otejitifgcrrwmudrnhs`).
Produktion (`gkkzjmszcjivtaygbmfw`) unverändert: nur gelesen; keine Edge Functions, keine Migration, keine Auth-Konfiguration.

## 1. Auth Architektur

| Baustein | Datei | Verhalten |
|---|---|---|
| Client | `src/lib/supabaseFamily.js` | `persistSession`, `autoRefreshToken`, `detectSessionInUrl` (Implicit Flow → Recovery-Tokens im URL-Hash) |
| Registrierung / Login / Logout | `src/lib/auth.js`, `src/family/AuthScreen.jsx` | `signUp`, `signInWithPassword`, `signOut`; deutsche Fehlermeldungen |
| Session Restore | `src/family/FamilyApp.jsx` | `getSession()` beim Start + `onAuthStateChange` (im Listener nur State setzen) |
| PASSWORD_RECOVERY | `FamilyApp.jsx` | Ereignis **oder** Fallback `isRecoveryRedirect()` → `NewPasswordScreen` → `updateUser({ password })` |
| Redirects | **neu** `src/lib/authRedirects.js` | einzige Stelle für Redirect-URLs; keine verstreuten `window.location.origin` |
| Konto-Lebenszyklus | **neu** `src/lib/accountLifecycle.js` | Re-Auth, Passwort ändern, Account löschen, Familie löschen |
| Serverseitig | **neu** `supabase/functions/delete-account`, `delete-family`, `_shared/lifecycle.ts` | privilegierte Schritte nur hier |
| Datenbank | **neu** `supabase/migrations/20260929200000_account_lifecycle.sql` | Löschplan, Ausführung, Owner-Prüfung, Trigger-Fix, Realtime-Signal für `family_members` |

## 2. Konto & Sicherheit UI

`src/family/AccountSecurity.jsx` zeigt:

* die angemeldete E-Mail
* Familien und Rollen
* **Passwort ändern** (aktuelles Passwort, neues Passwort, Wiederholung)
* **Passwort vergessen** (Reset-Link an die eigene Adresse)
* **Abmelden**
* **Account dauerhaft löschen**

Erreichbarkeit – ohne tiefe Menüs, **ohne Eltern-PIN**:

* Familien-App: Tab „Verwalten“ → Karte mit Familie, Rolle und E-Mail → „👤 Konto & Sicherheit“. Die Karte steht auch **vor** der PIN-Eingabe.
* Onboarding (noch keine Familie): „Konto & Sicherheit (Passwort, Account löschen)“
* Familienauswahl und Fehlerbildschirm: „👤 Konto & Sicherheit“

**Account und Eltern-PIN sind getrennt:**

* Die Account-Löschung verlangt eine echte Auth-Revalidierung, also das aktuelle Passwort, und keine PIN.
* Die PIN bleibt die lokale Verwaltungsschranke der Familie. Beim Löschen einer Familie wird sie zusätzlich verlangt.

## 3. Passwort Reset

Ablauf:

1. „Passwort vergessen?“
2. E-Mail eingeben
3. **neutrale** Meldung: „Wenn ein Konto zu dieser E-Mail-Adresse existiert, haben wir dir einen Link … geschickt.“
4. Link öffnen: Die App verarbeitet die Recovery-Session aus der URL, meldet `PASSWORD_RECOVERY` und zeigt „Neues Passwort festlegen“.
5. Neues Passwort und Wiederholung eingeben (mindestens 6 Zeichen, müssen übereinstimmen).
6. Erfolg „Dein Passwort wurde geändert.“, danach „Weiter“.
7. Token-Parameter werden aus der Adresszeile entfernt; die App läuft normal weiter.

Schutz und Fehlerfälle:

* **Keine Benutzer-Enumeration:** Bekannte und unbekannte Adressen ergeben dieselbe Meldung (im Browser getestet). Nur Verbindungsfehler und zu viele Versuche werden gemeldet.
* Abgelaufener oder ungültiger Link (`#error_code=otp_expired`): verständliche Meldung auf dem Login, die Fehlerparameter werden aus der URL entfernt.
* Eingeloggtes „Passwort ändern“: Das aktuelle Passwort wird per `signInWithPassword` mit der E-Mail der Sitzung geprüft, dann folgt `updateUser`. Das neue Passwort muss sich vom alten unterscheiden.
* Passwörter liegen nur im Formular-State. Sie werden nie geloggt, gespeichert oder an Edge Functions geschickt.

**Mailzustellung / SMTP (Testprojekt):**

* Das Testprojekt nutzt den **Supabase-Standard-Mailversand** (kein eigener SMTP konfiguriert).
* Einschränkungen: Er verschickt nur an Adressen von Mitgliedern des Supabase-Teams und ist stark gedrosselt (wenige Mails pro Stunde).
* Ein echter Mail-Ende-zu-Ende-Test mit Wegwerfadressen ist deshalb nicht möglich und wurde **nicht** durchgeführt.
* Getestet wurde stattdessen:
  * `resetPasswordForEmail` mit neutraler Meldung
  * die Landung aus dem Link, mit einer echten Recovery-Session in der URL wie nach dem Klick
  * `PASSWORD_RECOVERY`, falsche Wiederholung, neues Passwort und Login mit dem neuen Passwort
* **Vor öffentlicher Produktion nötig:**
  * eigener SMTP-Anbieter (z. B. Postmark, Resend, Brevo) mit eigener Absenderdomain, SPF/DKIM/DMARC
  * deutsche Mailvorlagen (Reset, Bestätigung)
  * angemessene Rate-Limits
  * Die Einrichtung ist kostenrelevant und wurde deshalb nicht ungefragt vorgenommen.

**E-Mail-Bestätigung (Confirm Email):**

* Im Testprojekt bewusst **AUS** und nicht verändert, weil die Tests darauf aufbauen.
* **Empfehlung für Produktion: AN.**

| | Bewertung |
|---|---|
| Vorteile | verifizierte Adressen (Passwort-Reset und Kontakt funktionieren sicher), weniger Tippfehler-Konten, kein Anlegen fremder Adressen |
| Nachteile | ein zusätzlicher Schritt vor dem Onboarding; hängt am zuverlässigen SMTP |
| Wirkung auf die App | Nach der Registrierung erscheint bereits „Bitte bestätige deine E-Mail-Adresse…“ (`needsEmailConfirmation`); das Onboarding startet nach Bestätigung und Login. Der Redirect der Bestätigungsmail nutzt dieselbe Allowlist. |

* Die Entscheidung liegt bei der Produktionsvorbereitung.
* Social Login (Google, Facebook, Apple) wurde **nicht** hinzugefügt; das Modell bleibt E-Mail + Passwort.

## 4. Redirect URLs

`getAuthRedirectUrl("recovery")` unterscheidet die Umgebungen:

| Umgebung | Erkennung | Redirect |
|---|---|---|
| localhost | `localhost` / `127.0.0.1` | eigene Origin + `/` |
| vercel-preview | Host `familienapp-…-volkmar11s-projects.vercel.app` | eigene Origin + `/` |
| production-web | sonstiger Host | `VITE_AUTH_REDIRECT_URL` (noch nicht festgelegt), sonst eigene Origin |
| native (iOS, später) | `Capacitor.isNativePlatform()` | `VITE_NATIVE_AUTH_REDIRECT_URL`; ohne Wert kein Redirect (Supabase nutzt dann die Site URL) |

**Erlaubte Redirects im Testprojekt:** Ich habe keinen Zugriff auf die Auth-URL-Konfiguration; die MCP-Werkzeuge bieten sie nicht an. Deshalb wurde **nichts** verändert und **nichts** erfunden. Die Werte trägst du bitte selbst ein:

* Pfad: Supabase Dashboard → Projekt **wochen-champion-test** → Authentication → URL Configuration
* **Site URL:** `https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app`
* **Redirect URLs** (je eine Zeile):
  * `http://localhost:5173/**`
  * `http://localhost:4173/**`
  * `https://familienapp-git-feature-appstore-v1-volkmar11s-projects.vercel.app/**` (stabiler Branch-Alias der FAMILY-Preview)
  * optional für commit-spezifische Previews: `https://familienapp-*-volkmar11s-projects.vercel.app/**`

Die Produktions-Auth-Konfiguration bleibt unverändert.

## 5. iOS Deep-Link Vorbereitung

Konzept, noch **ohne** Capacitor, ohne Bundle-ID und ohne URL-Scheme:

1. Die native App ruft `resetPasswordForEmail` mit `getAuthRedirectUrl("recovery")` auf. Auf iOS ist das der Wert aus `VITE_NATIVE_AUTH_REDIRECT_URL`, z. B. ein Universal Link `https://<domain>/auth/callback` (bevorzugt) oder ein eigenes Schema.
2. Die Mail verlinkt darauf, iOS öffnet Wochen Champion (Associated Domains / URL-Scheme).
3. Das Capacitor-`App`-Plugin meldet `appUrlOpen(url)`. Die App übergibt die Tokens bzw. den Code an Supabase (`setSession` bzw. `exchangeCodeForSession`). Danach greift derselbe `PASSWORD_RECOVERY`-/`NewPasswordScreen`-Pfad wie im Web.

Offen für die iOS-Phase:

* Bundle-ID und Domain festlegen
* `apple-app-site-association`
* Redirect in die Supabase-Allowlist
* `appUrlOpen`-Handler
* ggf. PKCE-Flow für native

Die Edge-Function-CORS-Liste nimmt `capacitor://localhost` später per Secret `WC_ALLOWED_ORIGINS` auf.

## 6. Account Deletion

* Einstieg: „Konto & Sicherheit“ → „Account dauerhaft löschen …“
* **Warnbildschirm** mit Folgen je Familie: Löschung bei alleiniger Elternschaft, Austritt, Übergabe an das dienstälteste Elternteil
* Voraussetzungen zum Auslösen:
  * Häkchen „Ich habe die Folgen gelesen und verstanden“
  * **aktuelles Passwort**
  * Bestätigungstext **„LÖSCHEN“**
  * vorher ist der Button gesperrt
* Während der Löschung ist der Button gesperrt; es gibt kein doppeltes Auslösen.
* **Echte, vollständige Löschung:** Der Auth-User wird hart gelöscht (`auth.admin.deleteUser(id, false)`). Das ist keine Deaktivierung, kein Support-Kontakt und kein reiner Weblink.
* **Nach Erfolg:**
  * lokale Session entfernt (`signOut({ scope: "local" })`)
  * Konto-Bereich geschlossen
  * `FamilyChampion` wird entfernt: Realtime gestoppt, Medien-Cache geleert, Familien-State und PIN-State verworfen
  * Login-Bildschirm mit „Dein Account wurde gelöscht.“
  * Keine automatische Neuanlage; eine Neu-Registrierung (auch mit derselben Adresse) ist möglich (getestet).

## 7. Re-Authentifizierung

* **Client:** `signInWithPassword` mit der E-Mail der **aktuellen** Sitzung; der Nutzer kann kein anderes Konto wählen. Die zurückgegebene User-ID muss der Sitzung entsprechen. Das ergibt eine frische Session.
* **Server:** Die Edge Function prüft den JWT beim Auth-Server (`auth.getUser(token)`). Zusätzlich muss der Claim `amr` eine **Passwort-Anmeldung von höchstens 5 Minuten** enthalten; sonst folgt `401 reauth_required`. Das ist getestet mit einer echten, über 5 Minuten alten Anmeldung.
* Das Passwort geht **nie** an die Edge Function.

## 8. Edge Function

| | `delete-account` | `delete-family` |
|---|---|---|
| Gateway | `verify_jwt = true` (ES256-Tokens funktionieren) | `verify_jwt = true` |
| Aufrufer | aus dem verifizierten JWT; **Body wird nicht gelesen**, eine fremde `user_id` ist wirkungslos (getestet) | aus dem verifizierten JWT |
| Frische | ≤ 5 min Passwort-Anmeldung | ≤ 5 min |
| Rechte | – | `family_owner_check` (owner), dann `verify_parent_pin` im Namen des Aufrufers (inkl. Fehlversuchssperre) |
| Schritte | Plan → Medien der zu löschenden Familien → `execute_account_deletion` → `deleteUser` | Medien-Tree → `delete_family_as_service` (Kaskaden) |
| Antworten | `401 unauthorized/reauth_required`, `500 server` | zusätzlich `400 invalid`, `403 forbidden/pin` |

* **Serverseitiger Schlüssel:** `SUPABASE_SERVICE_ROLE_KEY` bzw. `SUPABASE_SECRET_KEYS` stellt die Supabase-Laufzeit als Secret bereit. Der Schlüssel liegt **nicht** in `VITE_*`, nicht im Browser-Bundle (geprüft: 0 Treffer, nur die Schutzregel, die solche Schlüssel ablehnt), nicht im Repo, nicht in `.env.example`, nicht in Logs und nicht in Testausgaben.
* **CORS:** Erlaubt sind `http://localhost:*`, `http://127.0.0.1:*`, `https://familienapp-…-volkmar11s-projects.vercel.app` und zusätzliche Origins nur per Secret `WC_ALLOWED_ORIGINS`. Fremde Origins erhalten keinen `Access-Control-Allow-Origin` (getestet).
* **Logs:** nur Aktion und Zähler, z. B. `{"action":"delete-account","families_deleted":1,…}` – keine user_id, keine E-Mail und kein Token (in den Function-Logs geprüft).
* **Fehlerstrategie und Idempotenz:**
  * Reihenfolge: Medien → DB → Auth.
  * Scheitert ein Schritt, gibt es `500` mit einer ehrlichen Meldung („… bitte erneut versuchen – bereits Erledigtes wird nicht doppelt ausgeführt“), keine Erfolgsmeldung und keine Abmeldung.
  * Eine Wiederholung berechnet den Plan neu: Bereits gelöschte Medien fehlen einfach, bereits entfernte Mitgliedschaften tauchen nicht mehr im Plan auf, und `deleteUser` läuft nur einmal am Ende.
  * Ist der User schon gelöscht, liefert ein weiterer Aufruf `401` ohne Schaden (getestet).
  * Kein Schritt löscht Medien einer fremden Familie; die Pfade werden nur aus Familien-IDs des Plans gebildet.

## 9. Membership / Ownership Transfer

Fremdschlüssel-Analyse:

* `family_members.user_id` → `auth.users`: **CASCADE**
* `private.onboarding_requests.user_id`: **CASCADE**
* `families.created_by`, `profiles.linked_user_id`, `completions.created_by/confirmed_by`, `redemptions.created_by/acknowledged_by`: **SET NULL**
* Es gibt kein RESTRICT, und `storage.objects` hat keinen FK auf `auth.users`.

**Gefundener und behobener Fehler:** Die Stempel-Trigger `completions_review_stamp` und `redemptions_ack_stamp` stellten bei jedem UPDATE den alten `confirmed_by`- bzw. `acknowledged_by`-Wert wieder her. Dadurch scheiterte `ON DELETE SET NULL` mit einer FK-Verletzung: **Jedes Elternkonto, das je etwas bestätigt oder quittiert hatte, war nicht löschbar.** Jetzt darf der Verweis genau dann NULL werden, wenn der referenzierte Auth-User nicht mehr existiert (`private.auth_user_exists`). Für existierende Nutzer bleibt der Stempel unveränderlich (getestet).

Regeln je Mitgliedschaft (`account_deletion_plan`):

| Fall | Aktion |
|---|---|
| keine weiteren Eltern | **Familie löschen** (inkl. Medien, alle Tabellen per Kaskade) |
| Nutzer ist letzter owner, weitere Eltern bleiben | **Übergabe:** ältestes verbleibendes Mitglied nach `created_at`, bei Gleichstand `user_id`, wird owner; danach Austritt |
| weiterer owner vorhanden | Austritt **ohne** Rollenänderung |
| Nutzer ist parent | Austritt |

* Historische Daten der weiterbestehenden Familie bleiben erhalten: Kinder, Aufgaben, Erledigungen, Einlösungen, Champion-Historie und Bilder. Die Audit-Felder werden NULL, die Zeitpunkte bleiben (getestet).
* Spielerprofile (`is_parent`) erzeugen keine Ownership.
* Realtime: `family_members` löst jetzt `bump_family_sync` aus. Andere Geräte laden neu, und `FamilyChampion` gleicht nach jedem Reload die eigene Rolle ab; bei Abweichung oder entfernter Familie werden die Mitgliedschaften neu geladen. Gerät B wird so ohne Neuanmeldung zur Inhaberin bzw. zum Inhaber.

## 10. Family Deletion

* Im Elternbereich, nur bei **entsperrter PIN** und nur für **owner**: „Gefahrenzone → Familie dauerhaft löschen …“. Ein parent sieht stattdessen „Nur die Inhaberin bzw. der Inhaber kann die Familie löschen.“
* Dialog:
  * Warnung „Diese Familie und alle zugehörigen Aufgaben, Punkte, Belohnungen und Bilder werden dauerhaft gelöscht – auch für alle anderen Eltern und Kinder. Dein Konto bleibt bestehen.“
  * **Eltern-PIN** (serverseitig geprüft), **Passwort** (frische Session), Bestätigungstext **„FAMILIE LÖSCHEN“**
* Serverseitig: owner-Prüfung, PIN, Medien-Tree, Familie inklusive Kaskaden.
* Danach lädt die App die Mitgliedschaften neu und zeigt Familienauswahl oder Onboarding. Das Auth-Konto bleibt bestehen.
* Die Zustimmung weiterer Eltern ist in Version 1 nicht nötig; die Aktion ist aber mehrfach abgesichert.

**Account löschen ≠ Familie löschen:**

* Account löschen entfernt die Identität. Eine alleinige Familie wird mitgelöscht, eine gemeinsame Familie bleibt für die anderen.
* Familie löschen entfernt die Familie für alle; das Konto bleibt.

## 11. Media Cleanup

* Bei Account- und Familienlöschung wird zuerst `families/<id>/…` über die Storage-API entfernt (serverseitig, `removeFamilyMediaTree`). Erst danach folgt die DB-Löschung; direktes SQL-Löschen ist in Supabase gesperrt.
* Gemeinsame Familien behalten ihre Bilder (getestet).
* Kaskaden-Prüfung nach den Tests (SQL): 0 Restzeilen in allen 16 geprüften Tabellen. Geprüft wurden:
  * `families`, `family_members`, `family_settings`, `profiles`, `categories`
  * `category_assignments`, `tasks`, `task_assignments`, `rewards`, `reward_assignments`
  * `completions`, `redemptions`, `champion_history`, `family_sync`
  * `private.family_security`, `private.onboarding_requests`

  Dazu 0 Storage-Objekte, 0 Auth-User und 0 verbliebene Audit-Verweise der gelöschten Familien bzw. Konten.
* Waisen im Bucket: 0.

## 12. Auth Lifecycle

| Zustand | Verhalten |
|---|---|
| Session abgelaufen | supabase-js erneuert automatisch; scheitert das, folgt `SIGNED_OUT` → Login |
| Logout | `SIGNED_OUT` → Konto-Bereich und Recovery zurückgesetzt, `FamilyChampion` wird entfernt (Realtime, Timer, Scheduler, Medien-Cache, PIN weg) |
| Account gelöscht | lokale Abmeldung und Meldung; Reload bleibt ausgeloggt (getestet) |
| Passwort geändert | Sitzung bleibt, Login mit dem neuen Passwort (getestet) |
| PASSWORD_RECOVERY | eigener Bildschirm; danach URL bereinigt |
| Browser-Reload | Session Restore |
| Familienwechsel | `key={familyId}` → vollständiger Neuaufbau |
| Rolle geändert / Mitgliedschaft entfernt | Realtime → Reload → Rollenabgleich → Mitgliedschaften neu |

Es gibt keine Zombie-Subscriptions: Realtime und Intervalle hängen am Lebenszyklus von `FamilyChampion`.

## 13. Tests

| Bereich | Ergebnis |
|---|---|
| Unit gesamt (neu: `accountLifecycle` 10 – Redirects, Re-Auth, Passwort, Lösch-Clients, statische Sicherheitsprüfungen) | 123/123 |
| SQL-Check `supabase/tests/account_lifecycle_check.sql` (Plan, Übergabe, mehrere owner, Idempotenz, Audit-Felder, Trigger-Schutz, Rechte) | 22/22 (lokal und Testprojekt, zurückgerollt) |
| Integration `tests/supabase/account-lifecycle.test.mjs` (echte Edge Functions) | 35/35 |
| Browser 393 × 852: Login, Konto & Sicherheit, Passwort ändern (falsch/Wiederholung/ok), Reset neutral, Recovery, abgelaufener Link, Lösch-Warnung, falsches Passwort, Abbruch, echte Accountlöschung, Login-Bildschirm, Neu-Registrierung, Familie löschen (owner) bzw. blockiert (parent), kein horizontales Scrollen, keine technischen Fehlermeldungen | 34/34 |
| Zwei Geräte: A löscht Account, B bleibt angemeldet, wird ohne Neuanmeldung owner, PIN-Entsperrung bleibt, Realtime aktiv | 8/8 |
| Bestehende Integrationssuites nach Migration und Trigger-Fix (data, mutations, admin, champion-realtime, two-device, onboarding, auth, media) | 18/18 · 44/44 · 60/60 · 17/17 · 27/27 · 29/29 · 12/12 · 30/30 |
| Security Advisor | neue Service-Funktionen **nicht** für `authenticated` ausführbar |

Im Einzelnen deckt der Integrationstest ab:

* einzelner owner mit Daten und Medien
* owner mit parent: Übergabe, Daten, Bilder, Audit-Felder
* parent verlässt die Familie
* vier Familien gleichzeitig
* „Familie löschen“: parent blockiert, falsche PIN, falsches Passwort, Erfolg, Konto bleibt, Medien weg
* anon, ungültiges Token, fremde Familie, manipulierte `family_id`, fremde `user_id`, erneuter Aufruf, CORS
* Anmeldung älter als 5 Minuten

Test-Hilfsfunktion (nur Testprojekt, keine Migration): `supabase/test-support/add_family_member.sql` fügt als owner ein Wegwerfkonto `wc-p5c-…@example.com` als Elternteil hinzu. Echte Einladungen kommen in Phase 5D. Alle Testkonten wurden danach über die Edge Function selbst gelöscht; die Migrations-Testfamilie wurde nie berührt.

## 14. Legacy Regression

* Die 3 Legacy-Regressionsskripte liefern identische Ergebnisse; der Legacy-Fototest besteht 8/8.
* Das Legacy-Bundle enthält keine Konto- oder Lösch-Funktionen.
* `family-main` bzw. `app_state` wurde nicht verändert.

## 15. Produktionsvoraussetzungen

1. Migration `20260929200000_account_lifecycle.sql` (inkl. Trigger-Fix) bewusst freigeben (Testsperre anpassen) – erst mit der Produktionsmigration.
2. Edge Functions `delete-account` und `delete-family` in der Produktion deployen (`verify_jwt = true`); `WC_ALLOWED_ORIGINS` mit der Produktions-Domain setzen, später `capacitor://localhost`.
3. Auth URL Configuration der Produktion: Site URL und Redirect URLs der Produktions-Domain (sowie iOS-Link).
4. Eigener SMTP mit Absenderdomain, deutsche Mailvorlagen; Confirm Email AN (Empfehlung).
5. „Leaked Password Protection“ aktivieren (Advisor-Hinweis) und die Mindestlänge erhöhen (Empfehlung: 8).
6. Die Test-Hilfsfunktionen `test_add_family_member` und `legacy_import_redemptions` existieren nur im Testprojekt und dürfen nicht in die Produktion.
7. Die Datenschutzerklärung beschreibt Account- und Familienlöschung, Bilder und Aufbewahrung; Impressum.
8. Offen: Das RLS-Recht des owners, `families` direkt zu löschen, besteht weiter (u. a. für bestehende Test-Cleanups). Die App nutzt ausschließlich `delete-family`. Vor der Produktion das direkte DELETE entziehen, damit keine Medien verwaisen können.
