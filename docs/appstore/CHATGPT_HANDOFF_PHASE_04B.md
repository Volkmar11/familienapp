# CHATGPT HANDOFF – PHASE 4B

## 1. Ergebnis

- Phase erfolgreich: JA
- Branch: `feature/appstore-v1`
- Commit: `21f0ae7` „feat: add family onboarding flow“ (diese Übergabedatei folgt in einem eigenen Commit direkt danach)
- Push: JA (normal, kein Force, kein Merge nach `main`)
- Legacy-Build: erfolgreich (`npm run build`), enthält keinen Onboarding- oder Auth-Code
- Family-Build: erfolgreich (`VITE_BACKEND_MODE=family` + Testprojekt-Variablen), enthält keinen Legacy-Code und keine Entwicklerdaten
- Produktionsdaten verändert: NEIN

## 2. Onboarding

- Schritte: Willkommen → (1) Familienname → (2) Kinderprofile → (3) Eltern-PIN → (4) Aufgaben → (5) Belohnungen → (6) Einstellungen → (7) So funktioniert’s → Ladeanzeige → Erfolgsseite → Familien-Startseite
- Fortschrittsanzeige: „Schritt X von 7“ mit Balken
- Vor/Zurück: JA; Eingaben bleiben erhalten; Prüfung pro Schritt und vollständig vor dem Absenden
- Abschluss: Button „Familie einrichten“ wird gesperrt, Ladeanzeige, atomare RPC, Mitgliedschaften still neu laden, Erfolgsseite „Alles eingerichtet!“ mit Familienname und Kindern, „Los geht’s“ führt zur Familien-Startseite
- Wiederholung nach Login verhindert: JA (Nutzer mit Familie sehen direkt die Startseite bzw. die Familienauswahl; getestet nach Reload und nach Logout/Login)

## 3. Familie

- Anlage über: RPC `public.create_family_with_onboarding(p_request_id, p_family_name, p_pin, p_children, p_tasks, p_rewards, p_settings)`
- atomar: JA (eine Transaktion; bei Validierungsfehler wird nichts angelegt, getestet)
- Idempotenz: `requestId` pro Assistent (nur im State) + `private.onboarding_requests` (PK `request_id`, Besitzer `user_id`). Eine Wiederholung liefert dieselbe Familie (`replayed: true`), gleichzeitige Aufrufe ergeben genau eine Familie, eine fremde ID wird abgelehnt (getestet, auch per UI mit „Antwort verloren“).
- Familienname: Pflicht, getrimmt, 1–80 Zeichen (Client und Server)
- owner: der aufrufende Nutzer wird automatisch `owner`
- family_settings: wird automatisch mit den gewählten Werten angelegt

## 4. Kinderprofile

- Mindestanzahl: 1
- technisches Maximum: 20 (Integritätsgrenze, kein FREE-Limit)
- Name: Pflicht, getrimmt, 1–40 Zeichen
- Emoji: Auswahl aus 12 neutralen Emojis (`options.js`, leicht erweiterbar)
- Farbe: Auswahl aus 8 Farben (`#RRGGBB`)
- Sortierung: ▲▼ im Assistenten; `profiles.sort_order` 0…n entsprechend
- persönliche Defaultnamen vorhanden: NEIN (leeres Namensfeld; statischer Test prüft, dass der FAMILY-Code weder `App.jsx` noch `DEFAULT_MEMBERS` oder Entwicklernamen enthält)

## 5. Eltern-PIN

- Länge: genau 4 Ziffern (Client und Server)
- Klartext gespeichert: NEIN (weder in der DB noch im Browser)
- Hash-Verfahren: bcrypt über `extensions.crypt(pin, extensions.gen_salt('bf', 10))`, serverseitig
- Speicherort: `private.family_security` (Schema nicht über die API erreichbar; RLS ohne Policies; Rechte für anon und authenticated entzogen). Die frühere Spalte `family_settings.parent_pin_hash` wurde entfernt, weil sie für alle Mitglieder lesbar war.
- direkter Client-SELECT möglich: NEIN (getestet)
- Set-/Verify-RPC:
  - `verify_parent_pin(family_id, pin)` für Mitglieder; 5 Fehlversuche führen zu 60 Sekunden Sperre
  - `set_parent_pin(family_id, current_pin, new_pin)` für owner/parent; die aktuelle PIN ist erforderlich
  - die Erst-PIN wird in der Onboarding-RPC gesetzt
- Tests: richtige PIN wird angenommen, falsche abgelehnt, fremder Nutzer blockiert, Änderung mit falscher bzw. richtiger aktueller PIN, ungültiges Format, Sperre. Admin-Prüfung: bcrypt mit Kostenfaktor 10 und kein Klartext.
- Die PIN ist nur ein Eltern-Gate auf einem angemeldeten Gerät, **kein** Ersatz für die Benutzer-Authentifizierung.

## 6. Starter-Aufgaben

- Quelle: `src/config/starterContent.js`
- Kategorien: Haushalt, Schule, Alltag; angelegt werden nur Kategorien mit mindestens einer gewählten Aufgabe (getestet)
- Anzahl Vorschläge: 14
- auswählbar: JA (standardmäßig alle gewählt, dazu „Alle ab-/auswählen“)
- Punkte editierbar: JA (ganze Zahlen 0–10 000)
- alle abwählbar: JA

## 7. Starter-Belohnungen

- Anzahl Vorschläge: 8
- auswählbar: JA (standardmäßig alle gewählt)
- Punktkosten editierbar: JA (0–100 000)
- alle abwählbar: JA

## 8. Family Settings

- show_daily_crown: Schalter „Tageskrone anzeigen“ mit Beschreibung und Streit-Hinweis
- Default: `true`
- require_confirmation: Schalter „Aufgaben bestätigen“
- Default: `true`

## 9. Datenbankänderungen

- neue Migration: `supabase/migrations/20260927200000_family_onboarding.sql` (die alte Migration ist unverändert; Schutzsperre `app.migration_target = 'test'`)
- nur Testprojekt: JA (vorab lokal in PostgreSQL 16 getestet, dann per `apply_migration` nur in `otejitifgcrrwmudrnhs`)
- neue Tabelle(n): `private.family_security`, `private.onboarding_requests`; `family_settings.parent_pin_hash` entfernt
- neue RPCs: `create_family_with_onboarding`, `verify_parent_pin`, `set_parent_pin`
- RLS: auf beiden neuen Tabellen aktiv ohne Policies (kein Client-Zugriff); die bestehende RLS-Matrix besteht weiterhin 39/39
- Security Definer geprüft: JA (`search_path = ''`, `auth.uid()`-Prüfung, Familienzugehörigkeit bzw. Rolle, `EXECUTE` nur für authenticated)
- Produktion verändert: NEIN

## 10. Tests

- Backendtests: `tests/supabase/family-onboarding.test.mjs` **29/29 PASS** (alle 23 geforderten Punkte plus Zusatzprüfungen)
- Idempotenz: gleiche ID, gleichzeitiger Doppelklick, fremde ID und UI mit verlorener Antwort – überall genau eine Familie
- PIN: bcrypt, kein Klartext, Verify/Set, Sperre, fremder Nutzer blockiert; Admin-Prüfung `supabase/tests/onboarding_security_check.sql` **8/8 ok**
- RLS: Regression `rls_matrix_test.sql` **39/39**, Auth-Test 4A **12/12**
- Browser/UI: Chromium 393×852 gegen das Testprojekt **42/42 PASS** (alle geforderten Screens und Interaktionen, Layout- und Datenschutzprüfungen)
- Legacy Regression: LEGACY startet ohne Auth und Onboarding; ein Ladefehler führt zu 0 Schreibzugriffen; Datumstests 15/15
- Ergebnis: alle bestanden. Unit-Tests: `onboarding` 8/8, `backendConfig` 10/10, `dateUtils` 15/15. Die Wegwerf-Daten wurden entfernt.

## 11. Sicherheit

- Secrets committed: NEIN
- PIN geloggt: NEIN
- PIN in localStorage: NEIN (auch nicht in sessionStorage; statisch und im UI-Test geprüft)
- PIN im Klartext in DB: NEIN
- service_role: NEIN
- Produktionsmutation: NEIN

## 12. FAMILY-Modus nach Einrichtung

- Bildschirm: Familien-Startseite (Zwischenstand) mit Familienname, Rolle, Kinder-Chips (Avatar, Farbe), Zählern (Kinder, Aufgaben, Belohnungen, Tageskrone an/aus), den Texten „Eure Familie ist eingerichtet.“ und „Aufgaben und Belohnungen wurden vorbereitet.“ sowie Abmelden
- vorhandene Familie nach Reload: JA, kein erneutes Onboarding
- Logout/Login: JA, die Familie wird wieder gefunden
- mehrere Familien: Die Auswahl aus 4A bleibt; ein Wechsel ist über „Andere Familie wählen“ möglich

## 13. Geänderte Dateien

- neu: `src/family/onboarding/*` (Wizard, 9 Schritte, StepLayout, options), `src/family/FamilyHome.jsx`, `src/lib/onboarding.js`, `src/lib/familySummary.js`, `supabase/migrations/20260927200000_family_onboarding.sql`, `supabase/tests/onboarding_security_check.sql`, `tests/onboarding.test.mjs`, `tests/supabase/family-onboarding.test.mjs`, `docs/appstore/PHASE_04B_ONBOARDING.md`, dieses Handoff
- geändert: `src/family/FamilyApp.jsx` (Onboarding und Startseite eingebunden), `src/main.jsx` und `vite.config.js` (Build-Zeit-Trennung der Modi)
- unverändert: `src/App.jsx`, `package.json`, `package-lock.json`, die alte Migration, LehrerAssistent, GitHub-Pages-Workflow

## 14. Offene Punkte vor Phase 4C

- Adapter-Entscheidung: `App.jsx` erwartet ein einziges `data`-Objekt (members, tasks, completions, rewards, redeemedRewards, championHistory …). Für 4C wird eine Datenschicht benötigt, die die neuen Tabellen darauf abbildet und gezielt pro Tabelle schreibt.
- Serverseitige Prüfung beim Einlösen (verfügbare Punkte), z. B. als RPC `redeem_reward`
- Champion-Auswertung: bisher im Client beim Wochenwechsel; in 4C `champion_history` idempotent befüllen (Unique-Constraint `family_id, week_start` vorhanden)
- Eltern-Profile: Die Legacy-App kennt Eltern als Mitspieler (`isAdmin`). Das Onboarding legt nur Kinder an. Soll es optional auch Elternprofile geben (`profiles.is_parent`)?
- Auth-Einstellungen im Testprojekt (Dashboard): Site URL und Redirect-URLs für den Passwort-Reset; „Leaked Password Protection“ (laut Advisor aus, je nach Tarif)
- Die fixierte Button-Leiste nutzt `position: sticky`; in einer echten iOS-WebView (Capacitor) ist das zusammen mit der Tastatur später zu prüfen.

## 15. Empfehlung für Phase 4C

1. `src/lib/familyData.js`: Laden aller Familiendaten (profiles, categories, tasks, rewards, completions, redemptions, champion_history, settings) und Abbildung auf die bisherige `data`-Struktur, damit die UI von `App.jsx` möglichst unverändert bleibt
2. Schreiboperationen pro Aktion (Erledigen, Rückgängig, Bestätigen/Ablehnen, Einlösen, CRUD im Elternbereich) direkt auf die Tabellen, ohne Whole-Document-Upsert
3. Punkteberechnung (Woche, Monat, gesamt, verfügbar) auf Basis von `completions.status = 'confirmed'` und `redemptions`; Einlösen serverseitig absichern (RPC)
4. Bestätigungen: `require_confirmation` → `pending` bzw. `confirmed`; Eltern bestätigen oder lehnen ab
5. Champion-Logik mit `dateUtils`, `week_start` (Montag) und idempotentem Eintrag in `champion_history`
6. Statistiken und Abzeichen aus den neuen Daten (Kategorie-Snapshots in `completions`)
7. Realtime auf die Familientabellen (gefiltert per `family_id`, RLS-geschützt) statt `app_state`
8. `show_daily_crown` auf der Startseite auswerten
9. Elternbereich an `verify_parent_pin` koppeln (Entsperrung nur im Speicher, mit Zeitablauf) und PIN-Änderung über `set_parent_pin`
10. Tests: Integration gegen das Testprojekt, UI mobil, LEGACY-Regression; weiterhin kein Merge nach `main` und keine Produktionsumstellung
