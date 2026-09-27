# Phase 4A – Authentifizierung

Stand: 27.09.2026 · Branch `feature/appstore-v1`

> In Phase 4A wurde **keine** Familie automatisch angelegt, nichts migriert und nichts an der Produktion (Supabase `gkkzjmszcjivtaygbmfw`, Vercel Production) geändert. Der FAMILY-Modus wurde ausschließlich gegen das Testprojekt `wochen-champion-test` betrieben.

## 0. Ausgangsanalyse (vor Phase 4A)

- `createClient` wurde einmalig in `src/App.jsx` (Zeile 6) auf Modulebene erzeugt, mit `import.meta.env.VITE_SUPABASE_URL` und `import.meta.env.VITE_SUPABASE_ANON_KEY`. Auf Vercel enthält die zweite Variable bereits einen **Publishable Key**; der Name wurde beibehalten.
- Direkter Zugriff auf `app_state` erfolgt nur in `src/App.jsx`:
  - `save()`: `upsert`
  - `load()`: `select … maybeSingle`
  - Realtime-Kanal `app_state_changes` (`postgres_changes`, Filter `id=eq.family-main`)
- Stellen, die später den FAMILY-Modus brauchen: genau diese drei (Laden, Speichern, Realtime) sowie alle Stellen, die das JSON-Dokument `data` lesen oder ändern, also die gesamte UI-Logik in `App.jsx`. Das ist Gegenstand von Phase 4B/4C.

## 1. Backend-Modi

| Modus | Bedeutung | Einstieg |
| --- | --- | --- |
| `legacy` (**Standard**) | bestehende Web-App mit `public.app_state` / `family-main` | `src/App.jsx` |
| `family` | neue Auth-/Familienarchitektur | `src/family/FamilyApp.jsx` |

- Die Umschaltung erfolgt ausschließlich über `VITE_BACKEND_MODE` (`src/config/backend.js → resolveBackendMode`). Es gibt keine automatische Erkennung.
- Fehlt der Wert oder ist er leer, gilt **legacy**. Die bestehende Vercel-Produktion (ohne diese Variable) bleibt dadurch unverändert.
- Ein ungültiger Wert führt zu einem **Konfigurationsfehler-Bildschirm**. Es gibt kein stilles Umschalten.
- `src/main.jsx` lädt die jeweilige App per **dynamischem Import**. Im FAMILY-Modus wird der Legacy-Code nicht ausgeführt, es entsteht also kein Legacy-Client. Umgekehrt lädt der LEGACY-Modus keinen Auth-Code.

## 2. Environment-Konfiguration

Die Vorlage liegt in `.env.example`, nur mit Platzhaltern. Echte Werte gehören in `.env.local` (ignoriert) bzw. in die Vercel-Umgebungsvariablen.

| Variable | Modus | Inhalt |
| --- | --- | --- |
| `VITE_BACKEND_MODE` | beide | `legacy` (Standard) oder `family` |
| `VITE_SUPABASE_URL` | legacy | Produktions-URL (unverändert) |
| `VITE_SUPABASE_ANON_KEY` | legacy | Publishable bzw. Anon Key der Produktion (unverändert) |
| `VITE_FAMILY_SUPABASE_URL` | family | URL des **Testprojekts** |
| `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY` | family | Publishable Key des **Testprojekts** |

**Schutzmechanismen in `getFamilyConfig`:**

- Fehlende FAMILY-Variablen ergeben eine klare Fehlermeldung mit den Variablennamen.
- `VITE_FAMILY_SUPABASE_URL` darf **nicht** dieselbe URL wie `VITE_SUPABASE_URL` (Legacy/Produktion) sein.
- Secret- bzw. `service_role`-Keys werden abgelehnt.
- Die URL muss eine https-Projekt-URL sein (lokal ist `http://localhost` erlaubt).

Es sind keine Projekt-Referenzen im Code hinterlegt.

## 3. Supabase-Clients

- `src/lib/supabaseLegacy.js`: der bisherige Client, jetzt ausgelagert. `App.jsx` importiert ihn; die Logik in `App.jsx` ist sonst unverändert.
- `src/lib/supabaseFamily.js`:
  - `createFamilyClient(config)` erzeugt den Client mit `persistSession`, `autoRefreshToken` und `detectSessionInUrl`, damit Reset-Links funktionieren.
  - `getFamilyClient()` legt den Client einmalig und erst bei Bedarf an.

## 4. Auth-Service (`src/lib/auth.js`)

- `signUp`, `signIn`, `signOut`, `getSession`, `onAuthStateChange`, `requestPasswordReset(email, redirectTo)` sowie `updatePassword(newPassword)` für den Reset-Rückweg.
- Der Service nutzt ausschließlich den FAMILY-Client. `createAuthService(getClient)` macht ihn testbar.
- `toGermanAuthError` übersetzt Supabase-Fehler in verständliches Deutsch: falsche Zugangsdaten, Konto existiert bereits, schwaches Passwort, ungültige E-Mail, Rate-Limit, keine Verbindung usw. Es werden keine technischen Details, Tokens oder Passwörter ausgegeben.

## 5. Registrierung

- Felder: E-Mail, Passwort, Passwort wiederholen.
- Prüfung im Client: E-Mail-Format, beide Passwörter gleich, mindestens 6 Zeichen (Supabase-Standard). Die Server-Fehler von Supabase werden zusätzlich übersetzt.
- Da „Confirm email“ im Testprojekt AUS ist, gibt es sofort eine Session. Ist die Bestätigung aktiv (künftige Produktion), zeigt die App den Hinweis „Bitte bestätige deine E-Mail-Adresse“.

## 6. Login

- E-Mail und Passwort, dann „Anmelden“.
- Während der Anfrage sind die Buttons gesperrt und zeigen „Bitte warten …“.
- Falsche Zugangsdaten ergeben „E-Mail-Adresse oder Passwort ist falsch.“

## 7. Session-Handling (`src/family/FamilyApp.jsx`)

- Beim Start wird `getSession()` aufgerufen; bis dahin erscheint „Anmeldung wird geprüft …“.
- Mit Session gilt der Nutzer als angemeldet und die Mitgliedschaften werden geladen. Ohne Session erscheint der Login.
- `onAuthStateChange` verfolgt `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED` und `PASSWORD_RECOVERY`. Im Listener wird nur State gesetzt, es gibt keine weiteren Supabase-Aufrufe (verhindert Deadlocks).
- Die Session speichert und erneuert supabase-js selbst (im Browser: `localStorage`). Es gibt keine eigene Token- oder Passwortspeicherung und kein Logging von Tokens.

## 8. Logout

„Abmelden“ ruft `signOut()` auf und zeigt danach den Login. Auch nach einem Neuladen bleibt der Nutzer abgemeldet (getestet).

## 9. Password Reset

- Ablauf: „Passwort vergessen?“, E-Mail eingeben, `resetPasswordForEmail(email, { redirectTo: window.location.origin })`, danach eine neutrale Erfolgsmeldung. Die Meldung verrät nicht, ob das Konto existiert.
- Rückweg: Der Link aus der Mail löst `PASSWORD_RECOVERY` aus, und die App zeigt „Neues Passwort festlegen“ (`updatePassword`).
- **Noch zu konfigurieren** (Supabase → Authentication → URL Configuration):
  - **Web:** Die Site URL bzw. die Redirect-URLs müssen die Vercel-Domains (Preview und später Produktion) sowie `http://localhost:5173` enthalten. Der aktuelle Stand im Testprojekt wurde **nicht** geändert, der Standard ist `http://localhost:3000`.
  - **iOS:** Deep Link bzw. Universal Link (z. B. `wochenchampion://auth-callback` oder eine Associated Domain) samt Behandlung in Capacitor (`@capacitor/app` → `appUrlOpen`). Das folgt in einer späteren Phase.
  - **Mailversand:** Supabase verschickt ohne eigenes SMTP nur an Team-Adressen und mit sehr niedrigem Limit. Für echte Nutzer ist ein eigener SMTP-Anbieter nötig.
- In den Tests wurde der Reset-Aufruf **abgefangen**. Es wurde keine Mail verschickt.

## 10. Familienmitgliedschaft (`src/lib/familyMembership.js`)

- Abfrage: `family_members` mit `family_id, role, created_at, families(id, name)` und dem Filter `user_id = <eigene ID>`. Der Zugriff läuft ausschließlich über RLS.
- Der zusätzliche Filter ist nötig, weil die Policy auch die Mitgliedschaften anderer Eltern derselben Familie zeigt.
- Ergebnis über `classifyMemberships`:
  - `none`: Bildschirm „Willkommen bei Wochen Champion“ mit dem Hinweis „Deine Familie wird im nächsten Schritt eingerichtet.“ und dem **deaktivierten** Button „Familie einrichten“ (Phase 4B)
  - `single`: Übergangsbildschirm „Familie gefunden“ mit Familienname, Rolle (owner/parent) und Abmelden
  - `multiple`: einfacher Auswahlbildschirm, danach „Familie gefunden“ und „Andere Familie wählen“
- `create_family` wird in der App in Phase 4A **nicht** verwendet, nur im Integrationstest, um den Zustand „mit Familie“ herzustellen.

## 11. Mehrere Familien

Die Abfrage verarbeitet beliebig viele Mitgliedschaften (sortiert nach Beitrittsdatum). Es gibt keine DB-Beschränkung. Bei genau einer Familie wird sie automatisch aktiv, bei mehreren erscheint die Auswahl.

## 12. Legacy-Kompatibilität

- Ohne `VITE_BACKEND_MODE` bzw. mit `legacy` lädt exakt die bisherige App. Ihr einziger Unterschied ist der Import des Clients aus `supabaseLegacy.js`.
- Datenverlust-Fix (Phase 2) und Datumsfix (Phase 3) sind unverändert enthalten.
- Im LEGACY-Modus gibt es keine Auth-Bildschirme und keine Auth-Aufrufe (getestet).
- Ein Nebeneffekt des dynamischen Imports: Das JavaScript ist jetzt auf mehrere Dateien verteilt (`index`, `App`, `FamilyApp`). Die Gesamtgröße ist praktisch unverändert.

## 13. Tests

| Test | Datei | Ergebnis |
| --- | --- | --- |
| Backend-Modus, Konfiguration, Fehlertexte, Klassifizierung | `tests/backendConfig.test.mjs` (`node --test`) | **10/10 PASS** |
| Datumslogik (unverändert) | `tests/dateUtils.test.mjs` | **15/15 PASS** |
| Auth-Integration gegen das Testprojekt | `tests/supabase/family-auth.test.mjs` | **12/12 PASS** |
| Browser/UI (Chromium, 393×852, isMobile) gegen das Testprojekt + Konfigurationsfehler + Legacy (simulierte API) | Skript in der Sitzung, nicht versioniert, siehe unten | **27/27 PASS** |

**Auth-Integration (12):** Registrierung, sofortige Session, Mitgliedschaft `none`, doppelte Registrierung (deutscher Text), zu kurzes Passwort (deutscher Text), Logout, falsches Passwort, Login, Session-Wiederherstellung nach „Neuladen“ (neuer Client, gleicher Speicher), Mitgliedschaft `single` (owner, Familienname), `multiple`, Aufräumen.

**Browser/UI (27):**

- Login, Registrieren und Passwort vergessen jeweils sichtbar und ohne horizontales Scrollen; Eingabefelder mit 16 px Schrift (kein iOS-Zoom)
- Passwort-Abweichung zeigt einen Fehler; der Reset-Aufruf wird ausgelöst (abgefangen, keine Mail); falsches Passwort zeigt die deutsche Meldung
- Button während der Anfrage gesperrt; Ladeanzeige „Familie wird geladen“
- Nutzer ohne Familie sieht den Willkommen-Bildschirm mit deaktiviertem „Familie einrichten“
- Nach Neuladen wird die Session wiederhergestellt und „Familie gefunden“ erscheint
- Mehrere Familien führen zur Auswahl, danach ist die gewählte Familie aktiv
- Logout führt zum Login und bleibt auch nach Neuladen bestehen
- Nur das Testprojekt wurde kontaktiert; keine Passwörter oder Tokens in der Konsole
- Drei Konfigurationsfehler (FAMILY ohne Env, ungültiger Modus, FAMILY = Legacy-URL) zeigen den Fehlerbildschirm, **ohne** einen Supabase-Aufruf
- LEGACY: bestehende App ohne Auth; bei Ladefehler Fehlerbildschirm mit 0 Schreibzugriffen

„Anmeldung wird geprüft“ ist nur einen Sekundenbruchteil sichtbar, weil die Session lokal vorliegt. Deshalb gibt es davon keinen Screenshot. Die Anzeige „Familie wird geladen“ wurde mit verzögerter Antwort geprüft.

**Hinweis zur Testumgebung:** Die Chromium-Tests in der Claude-Cloud-Umgebung brauchen `--ignore-certificate-errors-spki-list=<SPKI der Proxy-CA>`. Das erlaubt gezielt nur die TLS-Neuterminierung durch den Umgebungs-Proxy; die Zertifikatsprüfung bleibt sonst aktiv. Ohne diese Option zeigte die App korrekt „Keine Verbindung zum Server“.

**Testkonten:** Wegwerf-Konten mit dem Präfix `wc-p4a-…@example.com`. Sie wurden nach den Tests im Testprojekt gelöscht, Familien gab es danach keine mehr. Übrig sind nur die festen Konten `wc-test-a` und `wc-test-b` mit „Testfamilie A“ und „Testfamilie B“.

**Integrationstest ausführen:**

```
SUPABASE_TEST_PROJECT_NAME=wochen-champion-test SUPABASE_TEST_URL=https://<test-ref>.supabase.co \
SUPABASE_TEST_PUBLISHABLE_KEY=<publishable key> NODE_USE_ENV_PROXY=1 node tests/supabase/family-auth.test.mjs
```

## 14. Sicherheitsprüfung

- Keine echten Keys oder Tokens im Repository (Scan über alle versionierten und neuen Dateien; einziger Treffer ist der Platzhalter `sb_secret_abc` im Unit-Test für die Ablehnung).
- Kein `service_role` bzw. Secret-Key; solche Keys werden im FAMILY-Modus sogar aktiv abgelehnt.
- Keine Passwörter oder Tokens geloggt. Einziges `console.error` ist die Konfigurationsfehlermeldung. Die Konsole wurde im UI-Test geprüft.
- Der FAMILY-Modus hat nur das Testprojekt kontaktiert. Ein FAMILY-Build mit Legacy-URL wird blockiert.
- Datenzugriff ausschließlich über RLS mit dem Publishable Key und dem Nutzer-JWT; keine Umgehung.
- `package.json` und `package-lock.json` sind unverändert, es gibt keine neuen Abhängigkeiten.

## 15. Voraussetzungen für Phase 4B

1. Entscheidung, wie der FAMILY-Modus für Tests im Browser bereitgestellt wird: lokal über `.env.local` oder als Vercel **Preview** mit Preview-Umgebungsvariablen (`VITE_BACKEND_MODE=family`, `VITE_FAMILY_*` = Testprojekt). Die Production-Variablen bleiben unverändert.
2. Supabase-Testprojekt → Authentication → URL Configuration: Site URL und Redirect-URLs für localhost und Vercel-Preview setzen (für den Passwort-Reset).
3. Fachliche Entscheidungen für das Onboarding: Pflichtfelder (Familienname, Kinderprofile), Standardfarben bzw. Avatare, Auswahl der Starter-Inhalte, PIN-Konzept.
