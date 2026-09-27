# Phase 4B – Familien-Onboarding

Stand: 27.09.2026 · Branch `feature/appstore-v1` · nur Testprojekt `wochen-champion-test` (`otejitifgcrrwmudrnhs`)

> Keine Änderung an der Produktion: kein Merge nach `main`, keine Vercel-Production-Variablen, keine Migration im Produktionsprojekt, `family-main` unberührt.

## 1. UX-Ablauf

Registrierung oder Login führen bei **fehlender Familie** automatisch in den Assistenten:

| # | Schritt | Inhalt |
| --- | --- | --- |
| – | Willkommen | 4 kurze Punkte, „Los geht’s“, Link „Mit einem anderen Konto anmelden“ |
| 1/7 | Familienname | Pflichtfeld, getrimmt, max. 80 Zeichen; Beispiel „Familie Müller“ |
| 2/7 | Kinderprofile | Name, Avatar (12 Emojis), Farbe (8), Reihenfolge ▲▼, hinzufügen/entfernen, mindestens 1 |
| 3/7 | Eltern-PIN | 4 Ziffern + Wiederholung, maskiert, numerische Tastatur |
| 4/7 | Aufgaben | Vorschläge nach Kategorie, an- und abwählbar, Punkte editierbar, „Alle ab-/auswählen“ |
| 5/7 | Belohnungen | Vorschläge, an- und abwählbar, Punktkosten editierbar |
| 6/7 | Einstellungen | Tageskrone (an), Aufgaben bestätigen (an) |
| 7/7 | So funktioniert’s | 4 kompakte Hinweise, danach „Familie einrichten“ |
| – | Ladeanzeige | „Eure Familie wird eingerichtet …“ |
| – | Erfolg | „Alles eingerichtet! 🎉“ mit Familienname und Kindern, danach „Los geht’s“ |
| – | Familien-Startseite | Zwischenstand (siehe Abschnitt 11) |

Die Buttons „Zurück“ und „Weiter“ sind in einer fixierten Leiste am unteren Rand (mit Safe Area). Jeder Schritt wird beim „Weiter“ geprüft. Vor dem Absenden werden **alle** Schritte erneut geprüft; bei einem Fehler springt der Assistent zum betroffenen Schritt. Beim Zurückgehen bleiben alle Eingaben erhalten.

## 2. Komponentenstruktur

```
src/family/onboarding/
  OnboardingWizard.jsx  Zustand, Navigation, Absenden (87 Zeilen)
  StepLayout.jsx        Rahmen, Fortschritt, Toggle, PickRow
  WelcomeStep / FamilyStep / ChildrenStep / PinStep / TasksStep /
  RewardsStep / SettingsStep / IntroStep / FinishStep (jeweils 15–50 Zeilen)
  options.js            Avatare, Farben, technische Grenzen
src/lib/onboarding.js   Anfangszustand, Validierung, Payload, RPC-Aufruf (UI-frei, getestet)
src/lib/familySummary.js  Übersicht für die Startseite
src/family/FamilyHome.jsx Familien-Startseite (Zwischenstand)
```

- Alle Eingaben leben bis zum Absenden **nur im React-State**. Es gibt keinen `localStorage`, keinen `sessionStorage` und kein IndexedDB.
- **Build-Trennung:** `vite.config.js` setzt `__WC_FAMILY_BUILD__` aus `VITE_BACKEND_MODE`, und `main.jsx` verzweigt nur anhand dieser Konstante. Dadurch entfernt Vite den jeweils anderen App-Zweig vollständig:
  - FAMILY-Builds enthalten keinen Legacy-Code, keine `DEFAULT_MEMBERS` und keine Entwicklernamen (geprüft).
  - LEGACY-Builds enthalten keinen Onboarding- oder Auth-Code (geprüft).

## 3. Familienanlage

Beim Tippen auf „Familie einrichten“ wird der Button gesperrt und die Ladeanzeige erscheint. Danach wird **eine** RPC `create_family_with_onboarding(...)` aufgerufen. Bei Erfolg wird die PIN aus dem State gelöscht, die Mitgliedschaften werden im Hintergrund neu geladen (ohne den Assistenten zu verlassen) und die Erfolgsseite erscheint. „Los geht’s“ macht die neue Familie aktiv und zeigt die Familien-Startseite. Ist das Nachladen zu diesem Zeitpunkt noch nicht fertig, wird gezielt neu geladen; der Assistent startet nicht erneut.

## 4. Kinderprofile

- Mindestens 1 Profil, technisches Maximum 20. Das ist eine Integritätsgrenze und **kein** FREE-Limit.
- Name 1–40 Zeichen, Avatar-Emoji, Farbe `#RRGGBB`.
- `sort_order` entspricht der Reihenfolge im Assistenten. `is_parent` ist `false`, Fotos gibt es noch keine.
- Es gibt keine Standardnamen: Die App startet mit einem leeren Namensfeld.

## 5. Eltern-PIN

- **Zweck:** eine UI-Schranke auf einem bereits angemeldeten Familiengerät. Sie ist **kein** Ersatz für die Supabase-Anmeldung und kein eigenständiger Login. Bei 4 Ziffern (10 000 Kombinationen) ist sie bewusst einfach.
- **Bewertung der bisherigen Spalte `family_settings.parent_pin_hash`:** ungeeignet, weil `family_settings` per RLS für alle Familienmitglieder lesbar ist. Ein Hash einer 4-stelligen PIN wäre offline in Sekunden zu erraten. Die Spalte wird deshalb in der neuen Migration **entfernt** (sie war nie befüllt).
- **Neu: `private.family_security`**
  - Felder: `family_id`, `parent_pin_hash`, `failed_attempts`, `last_failed_at`, Zeitstempel
  - liegt im Schema `private`, das nicht über die API erreichbar ist
  - RLS ist aktiv ohne Policies; alle Rechte für `public`, `anon` und `authenticated` sind entzogen
  - ein direkter Client-SELECT ist unmöglich (getestet)
- **Hashing:** serverseitig mit `extensions.crypt(pin, extensions.gen_salt('bf', 10))`, also bcrypt mit Salt und Kostenfaktor 10. Es gibt kein ungesalzenes SHA-256.
- **RPCs:**
  - `verify_parent_pin(family_id, pin) → boolean` für Familienmitglieder. Nach 5 Fehlversuchen gilt 60 Sekunden lang eine Sperre (liefert `false`).
  - `set_parent_pin(family_id, current_pin, new_pin) → boolean` für owner und parent. Die aktuelle PIN muss bestätigt werden.
- Die PIN wird nicht geloggt und nicht im Browser gespeichert (statischer Test und UI-Test).

## 6. Starter-Aufgaben

- Quelle ist `src/config/starterContent.js`: 3 Kategorien (Haushalt, Schule, Alltag) mit 14 neutralen Aufgaben.
- Standardmäßig sind alle ausgewählt. Einzeln oder komplett abwählbar, Punkte editierbar (ganze Zahlen 0–10 000).
- **Kategorien werden nur angelegt, wenn mindestens eine gewählte Aufgabe dazu existiert.** Leere Kategorien entstehen nicht (getestet).

## 7. Starter-Belohnungen

8 neutrale Vorschläge. Standardmäßig ausgewählt, einzeln oder komplett abwählbar, Punktkosten editierbar (0–100 000).

## 8. Familieneinstellungen

Der Schritt „Eure Einstellungen“ speichert in `family_settings`:
- `show_daily_crown`, Standard `true`
- `require_confirmation`, Standard `true`

## 9. Tageskrone

„👑 Tageskrone anzeigen“ mit der Beschreibung „Der aktuell führende Spieler erhält auf der Startseite eine Krone.“ und dem Hinweis zum Abschalten bei Streit. Die Auswertung auf der echten Startseite folgt in Phase 4C.

## 10. Bestätigungsfunktion

„✅ Aufgaben bestätigen“: Wenn die Option aktiv ist, müssen erledigte Aufgaben von einem Elternteil bestätigt werden. Die Logik folgt in Phase 4C.

## 11. Atomare RPC

`public.create_family_with_onboarding(p_request_id, p_family_name, p_pin, p_children, p_tasks, p_rewards, p_settings) → jsonb {family_id, replayed}` ist `SECURITY DEFINER`, hat `search_path = ''` und ist nur für `authenticated` ausführbar.

Alles läuft in **einer** Transaktion:

1. **Validierung (vor jedem Schreiben):**
   - Anmeldung vorhanden
   - Familienname 1–80 Zeichen
   - PIN `^[0-9]{4}$`
   - 1–20 Kinder mit Name, Emoji ≤ 16 und Farbe `#RRGGBB`
   - höchstens 200 Aufgaben: Titel 1–80, Kategorie 1–40, Punkte als JSON-Zahl, ganzzahlig 0–10 000, `recurrence` erlaubt
   - höchstens 200 Belohnungen: Titel 1–80, Punkte ganzzahlig 0–100 000
   - Einstellungen boolesch
2. **Anlage:** Familie, owner-Mitgliedschaft, `family_settings`, PIN-Hash, Profile, Kategorien, Aufgaben, Belohnungen.
3. **Ergebnis:** `family_id`.

Scheitert irgendein Schritt, wird nichts übernommen (getestet: ungültige PIN, leere Kinderliste, ungültige Punkte → keine Familie).

**Assignments:** Die bestehende Semantik lautet „keine Zuweisung = für alle sichtbar“ (wie `assignedTo: []` in der Legacy-App). Die RPC legt deshalb **keine** `task_`/`reward_`/`category_assignments` an (getestet). Zuweisungen an einzelne Kinder folgen im Elternbereich.

Die ältere RPC `create_family` bleibt bestehen; die App nutzt sie nicht mehr.

## 12. Idempotenz

- Der Assistent erzeugt beim Start eine `requestId` (`crypto.randomUUID()`, nur im State) und schickt sie bei **jedem** Versuch unverändert mit.
- `private.onboarding_requests (request_id PK, user_id, family_id)`:
  - Die RPC trägt die ID zuerst per `insert … on conflict do nothing` ein. Gleichzeitige Aufrufe warten dadurch auf den ersten.
  - Ist die ID schon vorhanden und gehört **demselben Nutzer**, liefert die RPC dieselbe `family_id` mit `replayed: true` zurück.
  - Gehört sie einem **anderen Nutzer**, lehnt die RPC ab. Es gibt keine Auskunft und keine Rechte.
  - Scheitert die Anlage, wird auch der ID-Eintrag zurückgerollt, und ein neuer Versuch ist möglich.
- **Getestet:**
  - gleiche ID erneut → keine zweite Familie
  - zwei gleichzeitige Aufrufe → genau eine Familie
  - UI: Die Antwort geht nach erfolgreicher Anlage verloren, der Nutzer tippt erneut → dieselbe Familie, in der Datenbank genau eine
  - fremde ID → abgelehnt

## 13. Datenbanksicherheit

- **Neue Migration:** `supabase/migrations/20260927200000_family_onboarding.sql`. Die alte Migration ist unverändert. Schutzsperre `app.migration_target = 'test'`.
- **Angewendet:**
  - lokal in einer Wegwerf-PostgreSQL-16-Instanz vorab getestet
  - dann per `apply_migration` („family_onboarding“) **nur** im Testprojekt
- **Admin-Prüfung** `supabase/tests/onboarding_security_check.sql`, **8/8 ok**:
  - bcrypt mit Kostenfaktor 10, kein Klartext
  - jede Onboarding-Familie hat einen Hash
  - keine PIN-Spalte in `public`
  - kein Client-Zugriff auf beide `private`-Tabellen
  - RPCs nicht für `anon` ausführbar
  - alle `SECURITY DEFINER`-RPCs mit `search_path = ''`
- **Supabase-Advisor:** Die Hinweise sind erwartet:
  - `SECURITY DEFINER`-RPCs sind absichtlich für `authenticated` aufrufbar.
  - Die `private`-Tabellen haben absichtlich RLS ohne Policies.
  - Neu: „Leaked Password Protection“ ist deaktiviert. Das ist eine Auth-Einstellung, siehe Abschnitt 17.

## 14. Backendtests

`tests/supabase/family-onboarding.test.mjs` (Wegwerf-Konten `wc-p4b-…`): **29/29 PASS**. Abgedeckt sind die 23 geforderten Punkte sowie:
- keine PIN-Spalte in `family_settings`
- keine Assignments
- gleichzeitiger Doppelklick
- PIN ändern mit falscher und mit richtiger aktueller PIN
- ungültiges Format der neuen PIN
- Sperre nach 5 Fehlversuchen

**Regression:**
- RLS-Matrix (`supabase/tests/rls_matrix_test.sql`) **39/39**
- Auth-Test 4A **12/12**
- Unit-Tests: `onboarding` **8/8** (inkl. statischer Prüfung „FAMILY-Code importiert weder `App.jsx` noch `DEFAULT_MEMBERS` oder Entwicklernamen, kein Storage, kein PIN-Logging“; die Gegenprobe schlägt an), `backendConfig` **10/10**, `dateUtils` **15/15**

Die Testdaten wurden danach entfernt. Im Testprojekt bleiben nur „Testfamilie A/B“ und `wc-test-a`/`wc-test-b`.

## 15. UI-Tests

Chromium 393×852 (mobil) gegen das Testprojekt: **42/42 PASS**.

- **Abgedeckt:** Registrierung führt zum Onboarding, Fortschrittsanzeige, leerer Name (Fehler), Kind hinzufügen und entfernen, Emoji und Farbe, PIN nur Ziffern, maskiert und numerisch, abweichende PIN-Wiederholung (Fehler), Aufgabe abwählen und Punkte ändern, Belohnung abwählen und Kosten ändern, Tageskrone aus und Bestätigung an, Zurück/Weiter behält Eingaben, Nutzungshinweise.
- **Abschluss:** verlorene Antwort mit Fehlermeldung, erneuter Klick mit gleicher `requestId` (replayed), Ladeanzeige, Erfolgsseite, Startseite mit korrekten Zählern.
- **Datenbank:** exakt eine Familie; Punkte, Auswahl und Einstellungen korrekt; PIN serverseitig gültig.
- **Datenschutz:** PIN weder im Browser-Speicher noch in der Konsole.
- **Wiederkehr:** Nach Neuladen bleibt die Familie und das Onboarding erscheint nicht; nach Logout und Login wird die Familie wieder gefunden.
- **Darstellung:** Auf jedem Screen gibt es kein horizontales Scrollen und alle Buttons sind vollständig sichtbar. Nirgends erscheinen Entwicklernamen.
- **Weiteres:** 3 Konfigurationsfehler und die LEGACY-Regression.
- **Korrigiert:** Die fixierte Button-Leiste hatte zunächst keinen Hintergrund, sodass Listeneinträge durchschienen. Sie hat jetzt einen Verlaufshintergrund.

## 16. Legacy-Regression

- Ohne `VITE_BACKEND_MODE` startet die bestehende App wie bisher mit `app_state`, ohne Auth und ohne Onboarding (simulierte API, keine Produktionsaufrufe).
- Datenverlust-Fix: Ein Ladefehler zeigt den Fehlerbildschirm mit 0 Schreibzugriffen.
- Datumsfix: `dateUtils` 15/15.
- `App.jsx` ist in Phase 4B **unverändert**.

## 17. Voraussetzungen für Phase 4C

1. **Datenschicht-Entscheidung:** `App.jsx` arbeitet auf einem großen `data`-Objekt. Für 4C empfiehlt sich ein Adapter (`src/lib/familyData.js`), der die neuen Tabellen in die bisherige Form bringt, damit die UI möglichst unverändert bleibt. Schreibvorgänge laufen dann gezielt pro Tabelle (keine Whole-Document-Upserts).
2. **Serverseitige Punkteberechnung** (View oder RPC) für verfügbare Punkte beim Einlösen, damit Einlösungen nicht nur im Client geprüft werden.
3. **PIN-Gate** im Elternbereich über `verify_parent_pin`. Der Status „entsperrt“ gilt nur im Speicher und läuft nach kurzer Zeit ab.
4. **Datumslogik:** `completion_date` bzw. `week_start` mit `dateUtils` und `family_settings.timezone`.
5. **Auth-Einstellungen im Testprojekt** (Dashboard): Site URL und Redirect-URLs für den Passwort-Reset; „Leaked Password Protection“ prüfen (je nach Tarif verfügbar).
