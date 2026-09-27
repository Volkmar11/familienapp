# CHATGPT HANDOFF – PHASE 4C2B1

## 1. Ergebnis

* Phase erfolgreich: JA
* Branch: `feature/appstore-v1`
* Commit: `9340ffb` „feat: enable family administration“ (diese Übergabedatei folgt in einem eigenen Commit direkt danach)
* Push: JA (normal, kein Force, kein Merge nach `main`)
* Legacy-Build: erfolgreich (`npm run build`), Verhalten identisch (3 Regressionsskripte)
* Family-Build: erfolgreich (Testprojekt-Variablen), ohne Entwickler- und Legacy-Daten
* Produktionsdaten verändert: NEIN
* neue Migration: JA. `supabase/migrations/20260928200000_family_admin_crud.sql`, nur Testprojekt, Testsperre `app.migration_target = 'test'`. Im Testprojekt als `family_admin_crud` plus Delta `family_admin_crud_assignment_safety` angewendet; die Repo-Datei enthält den Endstand. Bestehende Migrationen sind unverändert.

## 2. Aufgaben

* Create: Titel (1–80), Punkte (0–10000), Kategorie (nur eigene Familie), Wiederholung, Emoji, aktiv, Zuordnung. Mit Teilmenge: erst inaktiv anlegen, dann atomar zuordnen, dann aktivieren (nie versehentlich „für alle“).
* Update: alle Felder inkl. Zuordnung und aktiv/inaktiv
* Aktiv/Inaktiv: Häkchen im Dialog. Inaktive Aufgaben erscheinen im Archiv mit „Wiederherstellen“.
* Löschen/Archivieren: RPC `remove_task`. In Erledigungen verwendet → `active = false`; unbenutzt → physisch gelöscht. Die UI sagt „Löschen“ und meldet „archiviert – Verlauf bleibt erhalten“.
* Historie erhalten: JA. Punkte- und Titel-Momentaufnahmen in `completions` bleiben unverändert (getestet: 15 bleibt 15 nach Änderung auf 40).
* Sortierung: ▲/▼ → RPC `reorder_items` (atomar), bleibt nach Reload
* Tests: Integration 15 Punkte (inkl. fremde Familie, anon, fremde Kategorie) + Unit + Browser

## 3. Kategorien

* Create: Name (1–40, eindeutig pro Familie), Emoji, Zuordnung, Reihenfolge
* Update: Name, Emoji, Zuordnung
* Delete: RPC `delete_category`
* Verhalten bei vorhandenen Aufgaben: Löschen blockiert, solange **aktive** Aufgaben darin liegen. Meldung: „… enthält noch N aktive Aufgaben. Bitte verschiebe sie zuerst …“. Ein DB-Trigger blockiert auch direkte DELETEs. Archivierte Aufgaben verlieren nur die Kategoriezuordnung; der Kategoriename der Erledigungen bleibt als Momentaufnahme erhalten.
* Assignments: für alle oder Teilmenge (atomare RPC); eine neue Kategorie mit gescheiterter Zuordnung wird wieder entfernt
* Tests: Integration 7 Punkte + Browser (Anlegen, Löschen blockiert)

## 4. Belohnungen

* Create: Titel (1–80), Punktkosten (0–100000), Emoji, Zuordnung, aktiv (Ablauf inaktiv → zuordnen → aktivieren)
* Update: alle Felder
* Aktiv/Inaktiv: Häkchen im Dialog; Archiv mit „Wiederherstellen“
* Löschen/Archivieren: RPC `remove_reward`. Bereits eingelöst → archiviert; unbenutzt → gelöscht
* historische Redemptions: `reward_title` und `points_spent` bleiben unverändert (getestet). `points_spent` ist per Spaltenrecht nicht änderbar.
* Assignments: für alle oder Teilmenge; Browser: nur ein Kind sieht die Belohnung
* Tests: Integration 7 Punkte + Browser

## 5. Profile

* Create: Kind hinzufügen (reine `profiles`-Zeile, kein Auth-Benutzer, `is_parent = false`), am Ende einsortiert
* Update: Name (1–40), Emoji, Farbe
* Avatar/Farbe: Emoji-Auswahl und Farbpalette; Foto-Upload im FAMILY-Modus ausgeblendet (Storage folgt)
* Sortierung: ▲/▼ → `reorder_items`; die Hauptansicht folgt der Reihenfolge (nach Reload getestet)
* Aktiv/Inaktiv: Häkchen im Dialog, 🗑️ „Entfernen“, Archiv mit „Wiederherstellen“; die Hauptansicht zeigt nur aktive Profile
* Löschregel: RPC `remove_profile`. Mit Verlauf (completions, redemptions, champion_history) **oder mit Zuordnungen** → archiviert; sonst gelöscht. Der Trigger blockiert auch direkte DELETEs. Hintergrund: Ein Löschen hätte Zuordnungen kaskadiert entfernt, und eine nur diesem Kind zugeordnete Aufgabe wäre plötzlich „für alle“ sichtbar.
* mindestens ein aktives Profil: JA. Durchgesetzt in der RPC und im Trigger (auch bei direktem Deaktivieren), mit Familien-Sperre gegen parallele Änderungen (lokal mit zwei Sitzungen getestet). Meldung: „Mindestens ein Kinderprofil muss aktiv bleiben.“
* Tests: Integration 14 Punkte (inkl. „keine Adminrechte durch Profil“, fremde Familie) + Browser

## 6. Assignments

* Semantik leer: keine Zuordnungszeilen bedeutet für alle Kinder sichtbar („👥 Alle“)
* Teilmenge: nur ausgewählte Kinder (Mehrfachauswahl im Dialog)
* technische Umsetzung: `set_task_assignments` / `set_category_assignments` / `set_reward_assignments(family_id, id, profile_ids[])`
* atomar: JA. Eine RPC ist eine Transaktion: Rolle prüfen, Zielobjekt sperren, Profil-IDs prüfen (eigene Familie, Duplikate entfernen), ersetzen.
* RPCs: `SECURITY INVOKER`, `search_path = ''`, `require_family_admin`, `EXECUTE` nur `authenticated`
* Fehlerfall erhält alten Zustand: JA (getestet mit fremdem und gelöschtem Profil). Archivierte Profile der Familie bleiben zuordenbar, damit bestehende Zuordnungen beim Bearbeiten nicht verloren gehen.
* Tests: 6 Integrationspunkte inkl. parallele Ersetzungen → genau eine Zuordnung, kein Mischzustand

## 7. Completion-Korrektur

* confirmed zurücknehmen: Punkte-Manager „⭐ Erledigungen korrigieren“ → „↩️ Zurücknehmen“ (mit Rückfrage)
* Speicherung: `status = rejected`, kein Löschen. Der Eintrag bleibt als „Zurückgenommen / abgelehnt“ sichtbar. `confirmed_at`/`confirmed_by` beschreiben die letzte Prüfentscheidung (Trigger aus 4C2A); die ursprüngliche Bestätigung wird dabei überschrieben (dokumentiert).
* Punkte danach: zählen nicht mehr (getestet −15)
* Re-Confirm: JA („✓ Wieder bestätigen“ → `confirmed`). Konflikt mit einer späteren Erledigung am selben Tag → verständliche Meldung.
* RLS: nur owner/parent der Familie. Der Kind-Weg (`undoCompletion`) kann nur pending löschen.
* Tests: Integration 6 Punkte + Browser

## 8. Redemption Acknowledgement

* acknowledged_at: serverseitig `now()` (neuer Trigger `redemptions_ack_stamp`); einmal quittiert bleibt quittiert
* acknowledged_by: serverseitig `auth.uid()`, nicht fälschbar (getestet)
* Punkte verändert: NEIN (`points_spent` ist per Spaltenrecht gesperrt; verfügbare Punkte unverändert, getestet)
* UI: „✓ Gesehen“ pro Hinweis bzw. „Alle als gesehen markieren“; der Hinweis verschwindet nach dem Neuladen; im Punkte-Manager steht pro Einlösung „✓ gesehen“ oder „🔔 neu“
* Tests: Integration 6 Punkte + Browser

## 9. Elternbereich

* PIN erforderlich: JA, für alle Verwaltungsaktionen (PIN-Gate aus 4C2A)
* Rollen: owner/parent (RLS + `require_family_admin` in jeder neuen RPC). Spielerprofile erzeugen nie Rechte.
* Timeout: 10 Minuten. Jede Verwaltungsaktion verlängert ihn. Nach Ablauf wird gesperrt, offene Dialoge werden geschlossen (Browser mit Playwright-Uhr getestet).
* Verwaltungsbereiche:
  * Benachrichtigungen (quittieren)
  * offene Bestätigungen
  * Punkte korrigieren
  * Aufgaben
  * Belohnungen
  * Kinder
  * Kategorien
  * Einstellungen
  * Eltern-PIN ändern
  * Familie/Abmelden
* mobile UX:
  * Eingabefelder 16 px im FAMILY-Modus
  * Speichern/Abbrechen
  * Buttons während Mutationen gesperrt
  * Rückfrage vor Löschen/Archivieren
  * deutsche Meldungen, keine DB-Fehler
  * kein horizontales Scrollen bei 393×852

## 10. Datenbankänderungen

* Migration: `20260928200000_family_admin_crud.sql`
* nur Testprojekt: JA (`wochen-champion-test`)
* neue RPCs (alle `SECURITY INVOKER`):
  * `set_task_assignments`, `set_category_assignments`, `set_reward_assignments`
  * `reorder_items`
  * `remove_task`, `remove_reward`, `remove_profile`
  * `delete_category`
  * private Helfer: `require_family_admin`, `valid_profile_ids`, `profile_has_history` (Letzteres `SECURITY DEFINER`, nur lesend)
* neue Policies: KEINE. Neu sind nur Trigger:
  * `profiles_guard_update` und `profiles_guard_delete` (Verlauf, Zuordnungen, letztes aktives Kind; Kaskade beim Familien-Löschen erlaubt)
  * `categories_guard_delete`
  * `redemptions_ack_stamp`
* Produktion verändert: NEIN

## 11. Tests

* Unit: 68/68 (davon 8 neu: Validierung, Reihenfolge, inaktiv→zuordnen→aktiv, Fehlerfall ohne Aktivierung, Lösch-Meldungen, Trigger-Hints, Korrektur/Quittierung)
* Integration:
  * Elternverwaltung 60/60 (`tests/supabase/family-admin.test.mjs`)
  * Regression Kernaktionen 44/44, Datenadapter 18/18
  * RLS-/Schutz-Matrix 24/24 (`supabase/tests/admin_crud_check.sql`)
  * lokale PostgreSQL-16-Prüfung inkl. Zwei-Sitzungen-Test
* Browser: Chromium 393×852, 37/37. Kinder, Aufgaben, Kategorien und Belohnungen inkl. Zuordnung, Reihenfolge, Einstellungen, Korrektur, Quittieren, Reload, Archiv, Timeout, kein horizontales Scrollen, keine JS-Fehler.
* Legacy Regression: 3 Skripte identisch
  * Baseline vor 4C1
  * Einstellungen/PIN/Datenverlust-Fix gegen 4C1-Build
  * neu: Legacy-Verwaltung gegen 4C1-Build
* Ergebnis: alles grün. Zwei Befunde beim Testen gefunden und behoben: Kind-Löschen hätte zugeordnete Aufgaben „für alle“ gemacht; neue Legacy-Einträge hätten ein zusätzliches Feld `active` bekommen.

## 12. Sicherheit

* service_role: NEIN
* Secrets: keine committet (nur die Wegwerf-Test-PIN im Testcode, wie seit 4C2A)
* PIN persistent: NEIN (nur React-State)
* RLS: weiterhin die Sicherheitsgrenze; die neuen RPCs laufen als Invoker unter RLS und prüfen zusätzlich die Rolle
* Profile erzeugen Adminrechte: NEIN (`is_parent` bleibt false, Adminzugang hängt nur an Rolle + PIN; getestet)
* Produktionsmutation: NEIN

## 13. Geänderte Dateien

* neu:
  * `supabase/migrations/20260928200000_family_admin_crud.sql`
  * `supabase/tests/admin_crud_check.sql`
  * `tests/supabase/family-admin.test.mjs`
  * `docs/appstore/PHASE_04C2B1_ADMIN_CRUD.md`
  * diese Datei
* geändert:
  * `src/lib/familyMutations.js`: CRUD, Validierung, Assignments, Reihenfolge, Korrektur, Quittierung
  * `src/lib/familyMapping.js`: Archiv, zurückgenommene Erledigungen, `redemptionId`
  * `src/family/FamilyChampion.jsx`: Aktionen, UI-Modell → Mutation
  * `src/shared/ChampionApp.jsx`: FAMILY-Zweige der bestehenden Verwaltung
  * `tests/familyMutations.test.mjs`

## 14. Offene Punkte vor Phase 4C2B2

* Bilder: Profilfotos und Aufgabenbilder (Supabase Storage) fehlen im FAMILY-Modus noch
* Einlösungen können noch nicht zurückgebucht werden (bewusst ausgeblendet)
* Nach einer Korrektur ist die ursprüngliche Bestätigung (`confirmed_by`) überschrieben; optional später ein eigenes Prüfprotokoll
* Migrationshistorie des Testprojekts: `family_admin_crud` plus Delta; vor der Produktion ein frisches Projekt aus den Repo-Dateien aufsetzen und testen
* Ohne Realtime sehen zwei Geräte Änderungen erst nach dem Neuladen („Daten neu laden“ oder nach eigener Aktion)
* Security-Advisor: `SECURITY DEFINER`-Hinweise zu bestehenden RPCs erwartet; die neuen RPCs sind Invoker

## 15. Empfehlung Phase 4C2B2

1. Idempotente Champion-RPC (`unique(family_id, week_start)`) inkl. `last_champion_week`, serverseitig aus bestätigten Punkten der Vorwoche
2. Champion-Zeremonie der gemeinsamen UI im FAMILY-Modus an diese RPC anbinden (statt `update`)
3. Realtime pro `family_id` für alle Familientabellen → entprelltes `loadFamilyData`
4. Mehrgeräte-Synchronisation und Konflikte: veraltete Daten erkennen, Hinweis und Neuladen
5. Reconnect-Verhalten: nach Verbindungsverlust neu abonnieren und neu laden
6. App-Rückkehr aus dem Hintergrund (`visibilitychange`/Focus) → neu laden, PIN-Gate prüfen (Vorbereitung Capacitor)
7. Vollständiger Zwei-Geräte-Test (zwei Browserkontexte: gleichzeitig erledigen, bestätigen, einlösen, verwalten)
8. Abschließende FAMILY-Funktionsprüfung (End-to-End: Onboarding → Alltag → Verwaltung → Champion)
9. Legacy-Regression (3 Skripte) und Bundle-Prüfung erneut
10. Weiterhin nur Testprojekt, keine Produktionsumstellung, kein Merge nach `main`
