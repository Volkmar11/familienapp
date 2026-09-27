# CHATGPT HANDOFF – PHASE 4C2A

## 1. Ergebnis

* Phase erfolgreich: JA
* Branch: `feature/appstore-v1`
* Commit: `2ea5f54` „feat: enable core family interactions“ (diese Übergabedatei folgt in einem eigenen Commit direkt danach)
* Push: JA (normal, kein Force, kein Merge nach `main`)
* Legacy-Build: erfolgreich (`npm run build`), Verhalten identisch (Regression)
* Family-Build: erfolgreich (Testprojekt-Variablen), keine persönlichen Legacy-Daten im Bundle
* Produktionsmutation: NEIN
* neue Migration: JA. `supabase/migrations/20260928100000_core_mutations.sql`, nur im Testprojekt `wochen-champion-test` angewendet, mit Testsperre `app.migration_target = 'test'`. Bestehende Migrationen sind unverändert.

## 2. Task Completion

* require_confirmation=true: Erledigung wird `pending` (Ausnahme: optionales Eltern-Spielerprofil → `confirmed`). Einstellung, Punkte und Titel werden vor dem Insert frisch aus der DB gelesen.
* require_confirmation=false: Erledigung wird direkt `confirmed`
* Duplikat-Schutz: `completions_once_per_day_uidx`. Ein Konflikt (23505) wird zu „Diese Aufgabe wurde heute bereits erledigt.“, dazu eine UI-Vorprüfung. Abgelehnte Einträge blockieren nicht.
* Datum: `completion_date = toDateKey(now)`, lokaler Kalendertag Europe/Berlin. Getestet um 23:30 Uhr, kein UTC-Versatz.
* Undo pending: erlaubt. Gelöscht wird nur die passende Zeile (`family_id`, `profile_id`, `task_id`, `completion_date`, `status = pending`), zusätzlich greift RLS.
* Undo confirmed: für Kinder nicht möglich. Meldung: „Diese Aufgabe wurde schon bestätigt. Nur Eltern können sie korrigieren.“ Der ↩️-Knopf erscheint im FAMILY-Modus nur bei pending.
* Datenreload: nach jeder erfolgreichen Mutation `loadFamilyData` (1 Abfrage), keine optimistische UI

## 3. Confirmation

* Confirm: `status = confirmed` (nur für bisher pending Einträge)
* Reject: `status = rejected`; gibt keine Punkte, ist ausgeblendet und blockiert den Tag nicht
* confirmed_at: serverseitig per neuem Trigger `completions_review_stamp` bei jedem Statuswechsel
* confirmed_by: `auth.uid()` per Trigger, vom Client nicht fälschbar (getestet)
* Punkte: steigen erst nach Bestätigung. Der Pending-Zähler stimmt nach dem Neuladen.
* RLS: nur owner/parent der Familie. Fremde Familie wirkungslos, anon blockiert.

## 4. PIN Gate

* Auth-Rollen: Elternbereich nur mit Rolle `owner`/`parent` UND verifizierter PIN (`canAccessAdmin`). Spielerprofile (`isParentPlayer`) geben keinen Zugriff.
* PIN-Verifikation: ausschließlich `verify_parent_pin(family_id, pin)`. Eingabe genau 4 Ziffern, wird nach dem Absenden geleert.
* Unlock-Speicher: nur ein Zeitstempel im React-State. Kein localStorage, kein sessionStorage, keine Cookies.
* Timeout: 10 Minuten. Elternaktionen verlängern erneut auf 10 Minuten: Bestätigen, Ablehnen, Einstellungen, PIN ändern.
* Reload: sperrt (getestet)
* Logout: sperrt (getestet)
* Familienwechsel: sperrt (`key={familyId}`, getestet)
* Fehlversuche: Die Backend-Sperre greift nach 5 Fehlversuchen für 60 s. Die neue, rein lesende RPC `parent_pin_lock_seconds` erlaubt die Meldung „Zu viele Fehlversuche. Bitte versucht es in einer Minute erneut.“. Hash und DB-Details werden nie angezeigt.
* PIN ändern: aktuelle, neue und wiederholte PIN (je 4 Ziffern) → `set_parent_pin`, bcrypt serverseitig. Falsche aktuelle PIN wird verständlich abgelehnt. Nach Erfolg bleibt der Bereich entsperrt. Die neue PIN funktioniert, die alte nicht mehr (getestet).

## 5. Reward Redemption

* RPC: `public.redeem_reward(p_family_id, p_profile_id, p_reward_id) → jsonb`, `SECURITY DEFINER`, `search_path = ''`, `auth.uid()` plus Rolle owner/parent, `EXECUTE` nur `authenticated`
* serverseitige Punkteprüfung: Summe `confirmed`-Punkte (Snapshot) minus Summe `points_spent` des Profils, alles in einer Transaktion. Der Client liefert keine Punkte.
* verfügbare Punkte: sinken nach der Einlösung (RPC liefert den neuen Wert); UI lädt neu
* Race-Condition-Schutz: `SELECT … FOR UPDATE` auf die Profilzeile serialisiert Einlösungen pro Profil
* paralleler Test:
  * Testprojekt: 100 Punkte, zwei Sitzungen lösen gleichzeitig je 80 ein, über 3 Runden immer genau 1 Erfolg
  * lokal (PostgreSQL 16): Zwei-Session-Test, die zweite wartet und wird abgelehnt
* insufficient points: `{ ok: false, reason: 'insufficient_points', available, required }`. Die UI zeigt „Dafür fehlen noch X Punkte.“ (Vorprüfung nur für die Anzeige)
* Assignment: keine Zuordnung bedeutet für alle sichtbar, sonst nur für zugeordnete Profile (`not_assigned`). Außerdem geprüft: `profile_not_found`, `reward_not_found`, `reward_inactive`.
* RLS/Auth:
  * Direkter Client-INSERT auf `redemptions` ist entfernt (Policy gelöscht, Recht entzogen).
  * UPDATE ist nur noch für `acknowledged_at`/`acknowledged_by` erlaubt.
  * anon und fremde Familie sind blockiert.

## 6. Settings

* show_daily_crown editierbar: JA (Schalter AN/AUS im entsperrten Elternbereich)
* sofortige Wirkung: JA. Nach dem Speichern wird neu geladen, die Krone verschwindet bzw. erscheint sofort (Browser getestet).
* require_confirmation editierbar: JA
* Wirkung auf bestehende pending Einträge: keine; sie bleiben pending (getestet). Die Einstellung gilt nur für neue Erledigungen. RLS (`family_settings_update` nur owner/parent) war korrekt; keine Policy-Änderung.

## 7. Mutation Architecture

* Datei(en):
  * `src/lib/familyMutations.js`: einzige Schreibschicht
  * `src/lib/parentGate.js`: PIN-Gate-Logik
  * `src/family/FamilyChampion.jsx`: Verdrahtung, Timeout, Neuladen
  * `src/shared/ChampionApp.jsx`: optionale Handler
* gemeinsame UI Handler: `actions` = `{ completeTask, undoCompletion, confirmCompletion, rejectCompletion, redeemReward, verifyPin, updateSettings, changePin }`. LEGACY nutzt unverändert `update(prev → next)`. Es gibt keine doppelte UI.
* optimistic UI: NEIN (erst Server, dann Neuladen)
* Reload nach Mutation: JA. Die Ansicht bleibt erhalten, `busy` sperrt Aktionen. Scheitert nur das Neuladen, erscheint ein Hinweis und die alten Daten bleiben.
* Fehlerbehandlung:
  * Laden, Erfolg und Fehler je Aktion
  * deutsche Meldungen, keine rohen Codes
  * `console.error` nur mit Aktionsname und Fehlercode (keine PIN, keine Tokens)

## 8. Tests

* Completion: 10/10 (Integration, Testprojekt)
* Confirmation: 9/9 + Fälschungsschutz `confirmed_by`
* PIN:
  * Integration 7/7: richtig, falsch, Sperre, Änderung, falsche aktuelle PIN, neue PIN gilt, alte nicht, fremde Familie
  * Unit: Gate und 10-Minuten-Timeout
* Reward: 11/11 + direkter Insert/Update blockiert; zusätzlich lokaler Zwei-Session-Race-Test
* Browser: Chromium 393×852, 41/41. Abgedeckt:
  * alle Punkte aus Schritt 30
  * Timeout und Verlängerung per Playwright-Uhr
  * 5 Fehlversuche
  * nur erwartete Schreibanfragen
  * keine PIN in Konsole und Storage
* Legacy Regression: identisch
  * Baseline vor 4C1: 13 Screens, 4 Payloads
  * Zusatzskript gegen 4C1-Build: Einstellungen, PIN ändern, neue PIN, Datenverlust-Fix
* Ergebnisse:
  * Unit 60/60
  * Integration Kernaktionen 44/44
  * Datenadapter 18/18
  * RLS-Matrix 40/40
  * Browser 41/41
  * Legacy identisch

## 9. Sicherheit

* PIN Klartext gespeichert: NEIN (bcrypt in `private.family_security`)
* PIN persistent im Browser: NEIN (nur React-State; Test prüft Storage)
* Secrets committed: NEIN (nur Platzhalter in bestehenden Unit-Tests)
* service_role: NEIN
* Tokens/PIN geloggt: NEIN (statischer Test und Browser-Konsolenprüfung)
* Reward Client-only abgesichert: NEIN. Die Absicherung ist serverseitig (RPC mit eigener Punkteberechnung und Zeilensperre; direkter INSERT entzogen).
* Produktionsdaten verändert: NEIN

## 10. Geänderte Dateien

* neu:
  * `src/lib/familyMutations.js`
  * `src/lib/parentGate.js`
  * `supabase/migrations/20260928100000_core_mutations.sql`
  * `tests/familyMutations.test.mjs`
  * `tests/supabase/family-mutations.test.mjs`
  * `docs/appstore/PHASE_04C2A_CORE_MUTATIONS.md`
  * diese Datei
* geändert:
  * `src/shared/ChampionApp.jsx`: Handler, FAMILY-PIN-Gate, Schalter, PIN ändern, CRUD nur Ansicht
  * `src/family/FamilyChampion.jsx`
  * `tests/familyData.test.mjs`
  * `tests/supabase/family-data.test.mjs` (Einlösung per RPC)
  * `supabase/tests/rls_matrix_test.sql` (direkter INSERT jetzt blockiert)

## 11. Offene Punkte vor Phase 4C2B

* Kind und Eltern teilen sich das Konto. „Confirmed nicht zurücknehmen“ ist deshalb eine App-Regel plus PIN-Gate, keine DB-Regel. Optional später eine serverseitige Completion-RPC.
* Eltern-Korrektur bestätigter Erledigungen und Punkte-Korrektur fehlen noch.
* Eltern-Hinweise (unquittierte Einlösungen) werden angezeigt, das Quittieren folgt (Spaltenrecht vorbereitet).
* Die Rolle `parent` (weitere Eltern einladen) gibt es noch nicht; alle Tests laufen mit `owner`. Die RLS behandelt beide gleich.
* Security-Advisor-Hinweise zu `SECURITY DEFINER`-RPCs sind erwartet (eigene Rollenprüfung); „Leaked Password Protection“ ist im Testprojekt aus.
* Die Admin-Listen enthalten im FAMILY-Modus nur Ansicht und den Hinweis „Bearbeitung folgt“.

## 12. Empfehlung Phase 4C2B

1. CRUD Aufgaben (inkl. Kategorie, Punkte, Wiederholung, aktiv/inaktiv) über `familyMutations.js`
2. CRUD Kategorien und Belohnungen
3. CRUD Profile (Name, Avatar, Farbe, Reihenfolge, aktiv) ohne Adminrechte über Profile
4. Assignments für Aufgaben, Kategorien und Belohnungen bearbeiten
5. Eltern-Korrektur bestätigter Erledigungen + Hinweise quittieren
6. Champion idempotent schreiben (`unique(family_id, week_start)`) + `last_champion_week`, bevorzugt per RPC
7. Realtime pro `family_id` mit anschließendem Neuladen bzw. inkrementellem Update
8. Mehrgeräte-Synchronisation testen (zwei Browser, gleichzeitige Aktionen)
9. Tests: Integration je Mutation + RLS, Browser-Durchlauf, Legacy-Regression
10. Weiterhin nur Testprojekt, kein Produktionswechsel, kein Merge nach `main`
