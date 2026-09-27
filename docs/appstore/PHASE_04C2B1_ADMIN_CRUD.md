# Phase 4C2B1 – Family Admin CRUD

Stand: 27.09.2026 · Branch `feature/appstore-v1` · neue Migration `20260928200000_family_admin_crud.sql` (nur Testprojekt `wochen-champion-test`) · Produktion unverändert

Der FAMILY-Elternbereich ist jetzt funktional vollständig:

- Kinder, Aufgaben, Kategorien und Belohnungen verwalten
- Zuordnungen (Assignments) bearbeiten
- Reihenfolge ändern
- bestätigte Erledigungen korrigieren
- Einlösungen quittieren

Alles bleibt hinter Auth-Rolle (owner/parent) und Eltern-PIN (10 Minuten).

Nicht enthalten (4C2B2 bzw. später):

- Realtime
- automatische Champion-Erzeugung und `last_champion_week`
- Eltern-Einladungen und Rollenverwaltung
- Produktionsumstellung

---

## 1. Architektur

- **Keine zweite Verwaltungsoberfläche.** Die vorhandenen Legacy-Bausteine in `src/shared/ChampionApp.jsx` werden im FAMILY-Modus wiederverwendet:
  - Listen, „+ Neu“, ✏️, 🗑️
  - Modals für Aufgabe, Belohnung, Mitglied, Kategorie
  - Punkte-Manager
- Die FAMILY-Unterschiede sind klein und an `fam` gekoppelt:
  - **Speichern:** über `actions.save/remove/restore/reorder/…` statt `update(prev → next)`
  - **Zusätzlich:**
    - ▲▼-Knöpfe für die Reihenfolge
    - Archivlisten mit „Wiederherstellen“
    - „Aktiv“-Häkchen in den Modals
    - 🗑️ für Kinder
    - „Gesehen“ für Hinweise
    - „Zurücknehmen“ und „Wieder bestätigen“ im Punkte-Manager
  - **Ausgeblendet:**
    - Foto-Upload (Storage folgt später)
    - Häkchen „Admin (Eltern)“
    - Belohnungsvorschläge
    - „Daten-Verwaltung“ (Resets)
    - Löschen von Einlösungen
  - Eingabefelder haben im FAMILY-Modus 16 px (kein iOS-Zoom).
- **LEGACY ist unverändert.** Alle neuen Elemente hängen an `fam`. Drei Regressionsskripte vergleichen mit älteren Ständen und sind identisch, auch die Legacy-Verwaltung.
- **Schichten:**
  - `familyMutations.js`: CRUD, Validierung, Meldungen
  - `FamilyChampion.jsx`: UI-Modell → Mutation, PIN-Gate, Neuladen
  - Migration: atomare RPCs und Schutz-Trigger
  - `familyMapping.js`: zusätzlich `archived.{members,tasks,rewards}` und `rejectedCompletions` für den Elternbereich; die Hauptansicht zeigt weiterhin nur aktive Einträge.

## 2. Aufgaben CRUD

- **Anlegen:**
  - Felder: Titel (1–80 Zeichen), Punkte (0–10000, ganzzahlig), Kategorie (nur eigene Familie, per zusammengesetztem Fremdschlüssel), Wiederholung (täglich/wöchentlich/einmalig), Emoji, aktiv, Profilzuordnung
  - Neue Einträge landen am Ende der Liste (`sort_order` max+1).
  - Mit Teilmengen-Zuordnung wird die Aufgabe **zuerst inaktiv** angelegt, dann atomar zugeordnet und erst danach aktiviert. So ist sie nie versehentlich „für alle“ sichtbar.
- **Bearbeiten:** alle Felder inkl. aktiv/inaktiv und Zuordnung. Historische Erledigungen bleiben unberührt, weil `completions.points` und `task_title` Momentaufnahmen sind (getestet: 15 Punkte bleiben nach Änderung auf 40).
- **Löschen:** `remove_task` (Abschnitt 6).
- **Validierung** doppelt: Client (`validateTask`) und DB-Check-Constraints. Keine FREE-/PREMIUM-Limits.

## 3. Kategorien CRUD

- Anlegen, umbenennen, Emoji, Zuordnung (für alle oder Teilmenge), Reihenfolge.
- Name eindeutig pro Familie (ohne Groß-/Kleinschreibung) → Meldung „Eine Kategorie mit diesem Namen gibt es schon.“
- **Löschen** über `delete_category`:
  - Blockiert, solange **aktive** Aufgaben darin liegen. Meldung: „Diese Kategorie enthält noch N aktive Aufgaben. Bitte verschiebe sie zuerst in eine andere Kategorie.“
  - Zusätzlich blockiert ein DB-Trigger auch direkte DELETEs über die API.
  - Archivierte Aufgaben verlieren beim Löschen nur die Kategoriezuordnung (FK `set null`); ihre Erledigungen behalten `category_name` als Momentaufnahme.
- Scheitert bei einer **neuen** Kategorie die Zuordnung, wird sie wieder entfernt, statt „für alle“ stehen zu bleiben.

## 4. Rewards CRUD

- Anlegen, Titel, Punktkosten (0–100000), Emoji, Zuordnung, aktiv/inaktiv, Reihenfolge. Gleiches Muster wie bei Aufgaben (inaktiv anlegen → zuordnen → aktivieren).
- Historische Einlösungen behalten `reward_title` und `points_spent` als Momentaufnahme; spätere Änderungen wirken nicht zurück (getestet).
- Löschen über `remove_reward` (Abschnitt 6).

## 5. Profile CRUD

- Kind hinzufügen, Name (1–40), Emoji, Farbe (`#RRGGBB`), Reihenfolge, aktiv/inaktiv (Häkchen), 🗑️ Entfernen, Archiv mit „Wiederherstellen“.
- Reine `profiles`-Zeilen: keine Auth-Benutzer, `is_parent = false`, **keine Adminrechte** (weder `isAdmin` noch Rolle).
- Mindestens ein aktives Kind: `remove_profile` prüft das, und der Trigger `profiles_guard_update` blockiert auch direkte Deaktivierungen. Er sperrt die Familienzeile, ist also parallel sicher (lokal mit zwei Sitzungen getestet). Meldung: „Mindestens ein Kinderprofil muss aktiv bleiben.“

## 6. Archivierung / Löschregeln

| Objekt | In der UI | Regel |
|---|---|---|
| Aufgabe | „Löschen“ | in `completions` verwendet → `active = false` (archiviert); sonst physisch gelöscht |
| Belohnung | „Löschen“ | in `redemptions` verwendet → archiviert; sonst gelöscht |
| Kinderprofil | „Entfernen“ | mit Verlauf (`completions`, `redemptions`, `champion_history`) **oder** mit Zuordnungen → archiviert; sonst gelöscht |
| Kategorie | „Löschen“ | nur ohne aktive Aufgaben |

- Die UI sagt „Löschen“, fragt vorher nach und meldet danach „archiviert – Verlauf bleibt erhalten“ oder „gelöscht“.
- Warum Profile mit Zuordnungen nur archiviert werden: Ein physisches Löschen würde die Zuordnungszeilen kaskadiert entfernen. Eine Aufgabe, die nur diesem Kind zugeordnet war, wäre dann plötzlich „für alle“ sichtbar. Beim Browsertest-Entwurf aufgefallen und behoben.
- Schutz auch gegen direkte API-Aufrufe. Der Trigger `profiles_guard_delete` blockiert:
  - Profile mit Verlauf
  - Profile mit Zuordnungen
  - das letzte aktive Profil
- Kaskaden beim Löschen einer ganzen Familie bleiben erlaubt (`pg_trigger_depth() > 1`, getestet).
- Archivierte Profile verschwinden aus der Hauptansicht. Ihre Historie bleibt lesbar (Namen im Mapping auch für archivierte Profile).

## 7. Assignments

- **Leere Zuordnung** (keine Zeilen) bedeutet für alle Kinder sichtbar; in der UI heißt das „👥 Alle“.
- **Teilmenge** bedeutet nur diese Kinder; in der UI ist das eine Mehrfachauswahl.
- Das gilt für Aufgaben, Kategorien und Belohnungen, unverändert seit Phase 4C1.
- Zuordenbar sind Profile der eigenen Familie. Archivierte Profile sind erlaubt, damit bestehende Zuordnungen beim Bearbeiten nicht verloren gehen; die UI bietet nur aktive Kinder an.

## 8. Atomare Assignment-RPCs

- `set_task_assignments`, `set_category_assignments` und `set_reward_assignments` haben die Form `(family_id, id, profile_ids uuid[]) → uuid[]`, mit `SECURITY INVOKER` und `search_path = ''`.
- Ablauf in einer Transaktion:
  1. Rolle owner/parent prüfen
  2. Zielobjekt der Familie sperren (`FOR UPDATE`)
  3. Profil-IDs prüfen (Familie, Duplikate entfernen)
  4. alte Zeilen löschen und neue einfügen
- Jede Exception bricht die gesamte Transaktion ab, die **alte Zuordnung bleibt vollständig erhalten**. Getestet mit fremdem Profil, gelöschtem Profil und parallelen Ersetzungen: Ergebnis ist genau eine der Zuordnungen, nie ein Mischzustand.
- Leeres Array bedeutet „für alle“.

## 9. Sortierung

- `reorder_items(family_id, kind, ids)` mit kind ∈ `profiles | tasks | rewards | categories` (Whitelist, `format('%I')`) setzt `sort_order = Position` für die übergebene Liste atomar. Alle IDs müssen zur Familie gehören, keine Duplikate.
- UI: ▲/▼ tauscht Nachbarn (`moveInList`) und schreibt die vollständige sichtbare Liste neu; nach Reload gleiche Reihenfolge (getestet). Archivierte Einträge behalten ihren alten Wert, bei Reaktivierung sortiert die Tiebreak-Regel (`sort_order`, dann Name).

## 10. Completion-Korrektur

- Neuer Einstieg im Elternbereich: „⭐ Erledigungen korrigieren“ öffnet den bestehenden Punkte-Manager.
- „↩️ Zurücknehmen“ bei bestätigten Einträgen setzt `status = rejected`. **Kein Löschen.** Der Eintrag bleibt als „Zurückgenommen / abgelehnt“ sichtbar, die Punkte zählen nicht mehr.
- „✓ Wieder bestätigen“ bei zurückgenommenen oder abgelehnten Einträgen setzt `status = confirmed`. Kollidiert das mit einer späteren Erledigung am selben Tag, erscheint „Für diesen Tag gibt es diese Aufgabe schon als Erledigung.“
- `confirmed_at`/`confirmed_by`: Der bestehende Trigger `completions_review_stamp` (4C2A) setzt bei **jedem** Statuswechsel Zeitpunkt und Person der **letzten Prüfentscheidung**. Nach einer Korrektur steht dort also, wer wann zurückgenommen hat. Die Entscheidung ist bewusst so gefallen: nachvollziehbar, ohne Schemaänderung; die ursprüngliche Bestätigung wird dabei überschrieben (dokumentiert, keine stille Datenlöschung).
- Der Kind-Weg (`undoCompletion`) löscht weiterhin nur `pending` und kann bestätigte oder zurückgenommene Einträge nicht entfernen (getestet).

## 11. Redemption Acknowledgement

- Hinweise auf unquittierte Einlösungen: „✓ Gesehen“ bzw. „Alle als gesehen markieren“ ruft `acknowledgeRedemptions` auf (Update von `acknowledged_at`).
- Neuer Trigger `redemptions_ack_stamp`:
  - setzt `acknowledged_at = now()` und `acknowledged_by = auth.uid()` serverseitig
  - einmal quittiert bleibt quittiert, Werte sind nicht mehr änderbar
  - Spaltenrecht aus 4C2A: nur diese zwei Spalten sind aktualisierbar, `points_spent` also unveränderlich (getestet)
- Punkte bleiben unverändert, der Hinweis verschwindet nach dem Neuladen. Im Punkte-Manager zeigt jede Einlösung „✓ gesehen“ oder „🔔 neu“.

## 12. PIN-Gate

- Jede Verwaltungsaktion ist eine Elternaktion: `mutate(…, { admin: true })` prüft Rolle und PIN und verlängert den 10-Minuten-Timeout. Dazu gehören:
  - speichern, entfernen, wiederherstellen
  - Reihenfolge
  - Korrektur und Wieder-Bestätigen
  - Quittieren
- Läuft die Zeit ab, sperrt der Bereich und offene Verwaltungsdialoge werden geschlossen (getestet mit Playwright-Uhr).
- Die Sicherheitsgrenze bleibt RLS (owner/parent); alle neuen RPCs prüfen zusätzlich `require_family_admin`. Die PIN ist eine App-Schranke. Spielerprofile erzeugen nie Rechte.

## 13. Tests

| Test | Datei | Ergebnis |
|---|---|---|
| Unit gesamt | `node --test tests/*.test.mjs` | 68/68 |
| davon neu (Validierung, Reihenfolge, Ablauf inaktiv→zuordnen→aktiv, Meldungen, Korrektur/Quittierung) | `tests/familyMutations.test.mjs` | 8 neue Tests |
| Integration Elternverwaltung (Testprojekt) | `tests/supabase/family-admin.test.mjs` | 60/60 |
| Integration Kernaktionen / Datenadapter (Regression) | `family-mutations` / `family-data` | 44/44 · 18/18 |
| RLS-/Schutz-Matrix (Testprojekt) | `supabase/tests/admin_crud_check.sql` | 24/24 |
| Migration lokal (PostgreSQL 16) inkl. Zwei-Sitzungen-Test „letztes aktives Kind“ | Scratchpad | bestanden |
| Browser 393×852 | Scratchpad `ui4c2b1.mjs` | 37/37 |
| Legacy-Regression (3 Skripte) | Scratchpad | identisch |

Abgedeckt:

- **Aufgaben:**
  - erstellen und bearbeiten (Punkte, Kategorie)
  - Zuordnung für alle und Teilmenge
  - aktiv/inaktiv, Historie unverändert
  - benutzt → archiviert, unbenutzt → gelöscht
  - Validierung
  - fremde Familie, anon und fremde Kategorie blockiert
- **Kategorien:**
  - erstellen, umbenennen, für alle/Teilmenge
  - doppelter Name
  - mit Aufgaben nicht löschbar (RPC und direkter DELETE), leere löschbar
  - fremde Familie blockiert
- **Belohnungen:**
  - erstellen, Kosten ändern, Teilmenge
  - Einlösung unverändert
  - archivieren/wiederherstellen, benutzt → archiviert, unbenutzt → gelöscht
  - fremde Familie blockiert
- **Profile:**
  - erstellen, umbenennen, Emoji, Farbe, Reihenfolge
  - mit Verlauf → archiviert, mit Zuordnungen → archiviert
  - direkter DELETE blockiert
  - letztes aktives Profil geschützt
  - keine Adminrechte
  - fremde Familie blockiert, Reaktivieren
- **Assignments:**
  - Validierungsfehler erhält die alte Zuordnung
  - exakte Ersetzung
  - gelöschtes Profil abgelehnt, archiviertes zulässig
  - parallele Ersetzungen
- **Korrektur:** confirmed → rejected, Punkte sinken, Datensatz bleibt, Kind-Handler blockiert, fremde Familie blockiert, Wieder bestätigen
- **Quittierung:** sichtbar, quittieren, `acknowledged_at`/`_by`, Punkte unverändert, Hinweis weg, fremde Familie blockiert, nicht manipulierbar
- **Browser:**
  - Login und PIN
  - Kind anlegen, bearbeiten, entfernen und wiederherstellen
  - Aufgabe anlegen, bearbeiten, nur für ein Kind
  - Kategorie anlegen, Löschen blockiert
  - Belohnung nur für eine Teilmenge
  - Reihenfolge
  - Einstellungen
  - Korrektur und Wieder-Bestätigen
  - Quittieren
  - Zuordnungen in der Spieleransicht
  - Reload mit erhaltenen Daten
  - Archiv
  - Timeout mit Verlängerung
  - kein horizontales Scrollen, keine Entwicklerdaten, keine PIN im Log, keine JS-Fehler

Testdaten: Wegwerf-Konten `wc-p4c2b1-…@example.com` mit Alex, Sam, Kim und Robin. Danach aufgeräumt; im Testprojekt verbleiben nur „Testfamilie A/B“.

## 14. Legacy Regression

- `legacy-reg.mjs` (Baseline vor 4C1: Start, Champion, Erledigen, Undo, Einlösen, Statistik, PIN, Bestätigen) → identisch
- `legacy-reg2.mjs` (gegen 4C1-Build: Einstellungen, PIN ändern, Datenverlust-Fix) → identisch
- **Neu** `legacy-reg3.mjs` (gegen 4C1-Build: Aufgaben, Belohnungen, Mitglieder und Kategorien anlegen, bearbeiten und löschen, Punkte-Manager-Rücknahmen; 15 Screens, 14 Schreib-Payloads) → identisch. Dabei gefunden und behoben: Neue Legacy-Einträge hätten ein zusätzliches Feld `active: true` bekommen; jetzt nur im FAMILY-Modus.
- Datum: feste Uhr Europe/Berlin. Alles läuft mit simulierter API, ohne Produktionsverbindung.
- Bundle-Prüfung:
  - FAMILY ohne Entwicklernamen, Legacy-Defaults, `adminPin`, Produktions-Ref und Secrets; einziger Treffer sind die Prüftexte der Konfigurationsvalidierung
  - LEGACY ohne RPC- und Tabellennamen des FAMILY-Backends

## 15. Voraussetzungen 4C2B2

1. Champion-RPC idempotent (`unique(family_id, week_start)`) plus `last_champion_week`; Champion-Effekt der gemeinsamen UI für FAMILY über eine RPC statt `update`
2. Realtime pro `family_id` (completions, redemptions, tasks, rewards, categories, assignments, profiles, family_settings) → `loadFamilyData` (entprellt) statt vollständigem Polling
3. Mehrgeräte-Konflikte: Aktionen sind bereits serverseitig atomar (Einlösen, Zuordnungen, letztes Kind); UI-Hinweis bei veralteten Daten
4. App-Rückkehr aus dem Hintergrund: `visibilitychange` ist bereits für das PIN-Gate vorhanden, fürs Neuladen erweitern
5. Offen aus 4C2B1: Profilfotos und Aufgabenbilder (Storage), Löschen und Rückbuchen von Einlösungen, Anzeige, wer eine Korrektur vorgenommen hat
6. Migrationshistorie des Testprojekts: `family_admin_crud` plus Delta `family_admin_crud_assignment_safety` (Repo-Datei = Endstand); vor der Produktion ein frisches Projekt aus den Repo-Dateien aufsetzen
