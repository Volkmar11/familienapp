# Phase 4C2A – Core Mutations

Stand: 27.09.2026 · Branch `feature/appstore-v1` · neue Migration `20260928100000_core_mutations.sql` (nur Testprojekt `wochen-champion-test`) · Produktion unverändert

FAMILY ist jetzt interaktiv. Folgende Aktionen funktionieren:

- Aufgaben erledigen und zurücknehmen
- Erledigungen bestätigen und ablehnen
- Elternbereich per PIN öffnen (10 Minuten)
- PIN ändern
- Belohnungen serverseitig einlösen
- Tageskrone und Bestätigungspflicht umschalten

Nicht enthalten, weil für 4C2B vorgesehen:

- CRUD für Aufgaben, Kategorien, Belohnungen und Profile
- Assignments
- Realtime
- automatische Champion-Einträge

---

## 1. Mutation Layer

- `src/lib/familyMutations.js` ist der **einzige** Ort mit FAMILY-Schreibzugriffen. Funktionen:
  - `completeTask`
  - `undoCompletion`
  - `confirmCompletion`
  - `rejectCompletion`
  - `redeemReward`
  - `updateFamilySettings`
  - `verifyParentPin`
  - `changeParentPin`
- Rückgabe immer `{ ok: true, … }` oder `{ ok: false, reason, message }`. `message` ist eine deutsche Nutzermeldung; rohe Supabase-Fehler (Codes, SQL-Texte) werden nie angezeigt (`toMutationError`).
- Intern: `console.error` nur mit Aktionsname und Fehlercode, nie mit PIN, Token oder Passwort (statischer Test).
- **Gemeinsame UI:** `ChampionApp` hat die optionale Prop `actions` mit diesen Handlern:
  - `completeTask`
  - `undoCompletion`
  - `confirmCompletion`
  - `rejectCompletion`
  - `redeemReward`
  - `verifyPin`
  - `updateSettings`
  - `changePin`

  LEGACY übergibt kein `actions` und nutzt weiter `update(prev → next)`. Die Oberfläche bleibt eine einzige, es gibt keine zweite UI.
- `FamilyChampion` verdrahtet die Handler mit dem FAMILY-Client, prüft das PIN-Gate und lädt nach jedem Erfolg neu.

## 2. Task Completion

`completeTask` liest vor dem Insert frisch aus der DB:
- `family_settings.require_confirmation`
- Aufgabe (Titel, Punkte, aktiv, Kategoriename)
- Profil (aktiv, `is_parent`)

Status:
- `require_confirmation = true` → `pending`
- Ausnahme: ein optionales Eltern-Spielerprofil → `confirmed`
- `require_confirmation = false` → `confirmed`

Gespeicherte Felder:
- `family_id`, `profile_id`, `task_id`
- `task_title`, `category_name`, `points` (Momentaufnahmen)
- `status`
- `completed_at` (Zeitstempel)
- `completion_date` = `toDateKey(now)`, der lokale Kalendertag Europe/Berlin ohne UTC-Versatz (getestet mit 23:30 Uhr)

Duplikate: Der Index `completions_once_per_day_uidx` gilt pro Profil, Aufgabe und Tag ohne `rejected`. Ein Konflikt (23505) wird zu „Diese Aufgabe wurde heute bereits erledigt.“. Die UI prüft das zusätzlich vorab. Ein abgelehnter Eintrag blockiert nicht, die Aufgabe kann also erneut erledigt werden.

## 3. Undo

- Gelöscht wird nur die Erledigung mit passender `family_id`, `profile_id`, `task_id` und `completion_date` **und** `status = 'pending'`. RLS greift zusätzlich (owner/parent der Familie).
- **Version 1:** Kinder nehmen nur `pending` zurück. `confirmed` wird nicht gelöscht; dann erscheint „Diese Aufgabe wurde schon bestätigt. Nur Eltern können sie korrigieren.“.
- UI-Anpassung: Der ↩️-Knopf erscheint im FAMILY-Modus nur bei wartenden Einträgen.
- Hinweis: Kinder haben keine eigenen Konten, sie nutzen das angemeldete Elterngerät. Die Unterscheidung Kind/Eltern ist deshalb eine App-Regel (Mutationsschicht und UI) plus PIN-Gate, keine DB-Regel. Die Eltern-Korrektur bestätigter Einträge folgt in 4C2B über die Adminfunktionen.

## 4. Confirmation

- `confirmCompletion`: `update { status: 'confirmed' }` nur bei `status = 'pending'`.
- Neuer Trigger `completions_review_stamp` setzt bei jedem Statuswechsel serverseitig `confirmed_at = now()` und `confirmed_by = auth.uid()`. Der Client kann `confirmed_by` nicht fälschen (getestet).
- Punkte zählen erst nach der Bestätigung. Danach wird neu geladen, und der Pending-Zähler aktualisiert sich.

## 5. Rejection

- `rejectCompletion`: `status = 'rejected'`, dazu setzt derselbe Trigger `confirmed_at` und `confirmed_by`.
- `rejected` gibt keine Punkte, wird in der Spieleransicht ausgeblendet und hält die Aufgabe nicht für den Tag fest.

## 6. Parent PIN Gate

- Zugang zum Elternbereich = **Auth-Rolle owner/parent** UND **`pinVerified`** (`src/lib/parentGate.js`: `canAccessAdmin(role, unlockedUntil, now)`).
- `isParentPlayer`/`isAdmin` aus Spielerprofilen spielen keine Rolle (statischer Test).
- Der PIN-Dialog nimmt nur 4 Ziffern an. Die Prüfung läuft **ausschließlich** über `verify_parent_pin(family_id, pin)`.
- Die PIN wird nicht geloggt, nicht gespeichert und nicht in Storage abgelegt. Das Eingabefeld wird nach dem Absenden geleert.
- Der Entsperrzustand ist nur ein Zeitstempel im React-State von `FamilyChampion`.
- Fehlversuche:
  - `verify_parent_pin` sperrt nach 5 Fehlversuchen für 60 s und liefert dann `false`.
  - Die neue, rein lesende RPC `parent_pin_lock_seconds(family_id)` unterscheidet „falsch“ von „gesperrt“.
  - Anzeige bei Sperre: „Zu viele Fehlversuche. Bitte versucht es in einer Minute erneut.“ Hash und DB-Details werden nie angezeigt.
- Sicherheitseinordnung: Das PIN-Gate ist ein UI-Zusatzschutz gegen Kinder am Elterngerät. Die eigentliche Rechtegrenze bleiben Auth und RLS (owner/parent).

## 7. PIN Timeout

- `PARENT_UNLOCK_MS = 10 min`. Nach erfolgreicher PIN gilt `unlockedUntil = now + 10 min`.
- Jede Elternaktion verlängert erneut auf 10 Minuten:
  - Bestätigen
  - Ablehnen
  - Einstellungen
  - PIN ändern
- Automatische Sperre per Timer. Zusätzlich wird bei jedem Rendern und bei `visibilitychange` geprüft, falls Hintergrund-Tabs Timer drosseln. Admin-Aktionen prüfen vor der Ausführung erneut.
- Sofort gesperrt bei:
  - Logout (Unmount)
  - Familienwechsel (`key={familyId}`)
  - Reload und App-Neustart (nur Speicher)
  - 🔒-Knopf im Elternbereich

## 8. PIN Change

- Formular „Eltern-PIN ändern“ mit aktueller PIN, neuer PIN und Wiederholung (je genau 4 Ziffern). Aufruf `set_parent_pin(family_id, current, new)`.
- Der Server hasht mit bcrypt in `private.family_security`, es gibt keinen Klartext.
- Falsche aktuelle PIN → „Die aktuelle PIN ist falsch.“ (zählt als Fehlversuch).
- Erfolg → „Eltern-PIN geändert“, der Bereich bleibt entsperrt. Danach gilt die neue PIN, die alte nicht mehr (getestet).

## 9. Reward Redemption RPC

`public.redeem_reward(p_family_id, p_profile_id, p_reward_id) → jsonb`:
- `SECURITY DEFINER`, `search_path = ''`, `auth.uid()` plus `has_family_role(owner, parent)` (sonst 42501). `EXECUTE` nur für `authenticated`.

Ablauf in einer Transaktion:
1. Profil der Familie mit `FOR UPDATE` sperren
2. Belohnung der Familie laden
3. Belohnung aktiv?
4. Sichtbarkeit: keine Assignments = alle, sonst muss das Profil zugeordnet sein
5. Punkte serverseitig berechnen (Abschnitt 10)
6. `available >= points_required`?
7. genau eine Redemption mit `points_spent`- und Titel-Snapshot anlegen
8. `{ ok, redemption_id, points_spent, available }` zurückgeben

Fachliche Ablehnungen als `{ ok: false, reason }`:
- `profile_not_found`
- `reward_not_found`
- `reward_inactive`
- `not_assigned`
- `insufficient_points` (mit `available`, `required`)

Die UI zeigt dazu: „Dafür fehlen noch X Punkte.“

Absicherung: Die RLS-Policy `redemptions_insert` wurde entfernt, `INSERT`/`UPDATE` auf `redemptions` für `authenticated` entzogen. Einlösen geht nur noch über die RPC. `UPDATE` ist nur noch für `acknowledged_at`/`acknowledged_by` erlaubt (Quittierung, 4C2B).

## 10. Server-side Points

- Verfügbar = Summe `completions.points` mit `status = 'confirmed'` des Profils minus Summe `redemptions.points_spent` des Profils.
- Es wird die Punkte-Momentaufnahme der Erledigung verwendet; spätere Änderungen am Aufgabenwert ändern die Historie nicht.
- Der Client übermittelt keine Punkte. Die UI-Vorprüfung dient nur der Anzeige.

## 11. Race Condition Protection

- `SELECT … FROM profiles … FOR UPDATE` serialisiert alle Einlösungen desselben Profils.
- In READ COMMITTED liest die wartende Transaktion ihre Summen erst nach Erhalt der Sperre und sieht damit die bereits festgeschriebene Einlösung.
- Tests:
  - lokal PostgreSQL 16 mit zwei Sessions: die zweite wartet ca. 1,5 s und bekommt `insufficient_points`
  - Testprojekt: Profil mit 100 Punkten, zwei Geräte lösen gleichzeitig je 80 ein, über 3 Runden immer genau 1 Erfolg; Restpunkte 20

## 12. Family Settings

- Im entsperrten Elternbereich gibt es zwei Schalter (AN/AUS):
  - „Tageskrone anzeigen“ (`show_daily_crown`)
  - „Aufgaben bestätigen“ (`require_confirmation`)
- Speichern per `update family_settings`, danach neu laden. Die Krone erscheint bzw. verschwindet sofort.
- `require_confirmation` gilt nur für neue Erledigungen. Bestehende `pending` bleiben `pending` (getestet).
- RLS geprüft und unverändert korrekt: `family_settings_update` nur für `owner`/`parent`, fremde Familie wirkungslos. **Keine Policy-Änderung.**

## 13. Reload Strategy

- Keine optimistische UI: erst die Servermutation, bei Erfolg `loadFamilyData` (eine Abfrage), dann die UI.
- Während der Aktion inklusive Neuladen gilt `busy`: Buttons sind gesperrt, Doppelklicks werden ignoriert. Die App springt nicht zum Login oder Ladebildschirm zurück, die aktuelle Ansicht bleibt.
- Scheitert nur das Neuladen, bleiben die alten Daten stehen und es erscheint der Hinweis „Die Anzeige konnte nicht aktualisiert werden …“.
- Kein Realtime (4C2B).

## 14. Tests

| Test | Datei | Ergebnis |
|---|---|---|
| Unit gesamt | `node --test tests/*.test.mjs` | 60/60 |
| davon neu: Mutationsschicht + PIN-Gate + statisch | `tests/familyMutations.test.mjs` | 13/13 |
| Integration Kernaktionen (Testprojekt) | `tests/supabase/family-mutations.test.mjs` | 44/44 |
| Integration Datenadapter (angepasst: Einlösung per RPC) | `tests/supabase/family-data.test.mjs` | 18/18 |
| RLS-Matrix (angepasst: direkter INSERT blockiert) | `supabase/tests/rls_matrix_test.sql` | 40/40 |
| Migration lokal (PostgreSQL 16) + Zwei-Session-Race | Scratchpad | bestanden |
| Browser 393×852 (Chromium, Playwright-Uhr) | Scratchpad `ui4c2a.mjs` | 41/41 |
| Legacy-Regression | Scratchpad `legacy-reg.mjs` + `legacy-reg2.mjs` | identisch |

Abgedeckte Integrationspunkte:

- **Completion (1–10):**
  - pending oder confirmed je nach Einstellung
  - Punkte nur für confirmed
  - Duplikat blockiert
  - Undo nur für pending
  - fremdes Profil und fremde Familie blockiert
  - lokales Datum
- **Confirmation (1–9):**
  - Status, `confirmed_at` und `confirmed_by` gesetzt
  - Punkte steigen
  - Ablehnen ohne Punkte
  - fremde Familie und anon blockiert
  - `confirmed_by` nicht fälschbar
- **PIN:**
  - richtig und falsch
  - Sperre nach 5 Fehlversuchen
  - Änderung mit falscher aktueller PIN abgelehnt
  - neue PIN gilt, alte nicht mehr
  - fremde Familie blockiert
- **Reward (1–11):**
  - Erfolg und zu wenig Punkte
  - falsche Familie, falsches Profil, falsche Belohnung
  - inaktive und nicht zugewiesene Belohnung
  - `points_spent` korrekt, verfügbare Punkte sinken
  - parallele Einlösung
  - anon blockiert
  - direkter Insert/Update blockiert
- **Settings:**
  - Krone umschalten
  - bestehende pending bleiben
  - neue Erledigungen danach direkt confirmed
  - fremde Familie blockiert

Browser: alle Punkte aus Schritt 30. Dazu:

- Timeout 10 min und Verlängerung per Playwright-Uhr
- Sperre bei Reload, Familienwechsel sowie Logout und Login
- 5 Fehlversuche
- nur erwartete Schreibanfragen (`completions`, `family_settings`, RPCs)
- keine PIN in Konsole oder Storage
- keine JS-Fehler

Testdaten: Wegwerf-Konten `wc-p4c2a-…@example.com` mit Alex, Sam und Kim. Danach aufgeräumt; im Testprojekt verbleiben nur „Testfamilie A/B“.

## 15. Legacy Regression

- `legacy-reg.mjs` vergleicht mit der Baseline vor 4C1 (13 Screens, 4 Schreib-Payloads) und ist **identisch**:
  - Start mit Champion-Zeremonie
  - Erledigen
  - Undo
  - Einlösen
  - Statistik
  - Admin-PIN falsch und richtig
  - Bestätigen
- Neues Zusatzskript `legacy-reg2.mjs`, verglichen mit einem Build des 4C1-Commits `6f5ce16` (7 Screens, 3 Payloads), ebenfalls **identisch**:
  - Einstellung „Eltern-Bestätigung“
  - PIN ändern
  - neue PIN entsperrt
  - Datenverlust-Fix: Ladefehler → Fehlerbildschirm, „Erneut versuchen“, kein Speichern
- Datumsfix: feste Uhr 30.09.2026 10:00 Berlin, identische Tageszuordnung.
- Alles lief mit simulierter API (`test-dummy.supabase.co`); es gab keine Produktionsverbindung.
- Bundle-Trennung:
  - FAMILY-Bundle ohne `Marlon|Clara|Jonah|Papa|Mama|family-main|app_state|DEFAULT_|adminPin`
  - LEGACY-Bundle ohne RPC- oder Tabellennamen des FAMILY-Backends
  - Im LEGACY-Bundle steckt nur das inaktive Markup des FAMILY-Zweigs der gemeinsamen UI; es wird ohne `actions` nie angezeigt.

## 16. Voraussetzungen Phase 4C2B

1. CRUD für Aufgaben, Kategorien, Belohnungen und Profile inkl. Assignments in `familyMutations.js`; UI-Bereiche im Elternbereich statt „Bearbeitung folgt“
2. Eltern-Korrektur bestätigter Erledigungen (z. B. auf `rejected` setzen, Trigger stempelt) sowie Punkte-Korrektur
3. Eltern-Hinweise quittieren (`redemptions.acknowledged_at` ist per Spaltenrecht bereits freigegeben)
4. Champion idempotent schreiben (`unique(family_id, week_start)`) + `last_champion_week`, bevorzugt per RPC
5. Realtime pro `family_id` (danach `loadFamilyData` oder inkrementell) + Mehrgeräte-Synchronisation
6. Rolle `parent` (Einladung weiterer Eltern) fehlt noch; die RLS ist dafür vorbereitet
7. Optional serverseitige Completion-RPC (Status, Punkte und Datum im Server) statt Client-Insert, falls Kinder-Missbrauch direkter API-Aufrufe relevant wird
8. Menge der Completions langfristig begrenzen bzw. Punktesummen serverseitig
