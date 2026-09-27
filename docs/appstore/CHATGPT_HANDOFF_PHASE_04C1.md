# CHATGPT HANDOFF – PHASE 4C1

## 1. Ergebnis

* Phase erfolgreich: JA
* Branch: `feature/appstore-v1`
* Commit: `5d629e9` „feat: connect family data to champion interface“ (diese Übergabedatei folgt in einem eigenen Commit direkt danach)
* Push: JA (normal, kein Force, kein Merge nach `main`)
* Legacy-Build: erfolgreich (`npm run build`), enthält keinen Auth-, Onboarding- oder Family-Datencode
* Family-Build: erfolgreich (`VITE_BACKEND_MODE=family` + Testprojekt-Variablen), enthält keine Entwickler- oder Legacy-Daten
* Produktionsdaten verändert: NEIN
* Datenbankschema verändert: NEIN (keine Migration nötig)

## 2. Architektur

* App.jsx vorher: eine Komponente (≈ 1 000 Zeilen) mit UI, Punkte-Logik, `app_state`-Persistenz, Realtime, persönlichen Defaults und Legacy-PIN
* gemeinsame UI extrahiert: JA. `git mv` nach `src/shared/ChampionApp.jsx`, Persistenz/Defaults/Realtime entfernt, Markup unverändert. Props:
  * `data`
  * `update`
  * `readOnly`
  * `showDailyCrown`
  * `adminLockedView`
  * `rewardSuggestions`
  * `resetData`
  * `notice`
  * `checkAdminPin`
  * `changeAdminPin`

  Punkte-/Kronenlogik liegt in `src/shared/points.js`.
* Legacy Wrapper: `src/App.jsx`. Er übernimmt Laden/Speichern `app_state`/`family-main` (inkl. Datenverlust-Fix), Realtime, Lade- und Fehlerbildschirm sowie Legacy-PIN. Die Defaults liegen in `src/legacy/legacyDefaults.js`.
* Family Wrapper: `src/family/FamilyChampion.jsx`. Er lädt per Family Data Service, hat die Zustände loading, loaded und error, arbeitet `readOnly` und sperrt den Elternbereich.
* Code-Duplizierung: keine. Beide Modi nutzen dieselbe UI.
* Build-Trennung erhalten: JA. `__WC_FAMILY_BUILD__` wählt genau einen Wrapper. Der FAMILY-Bundle enthält weder `App.jsx` noch `legacyDefaults` noch `supabaseLegacy` (statischer Test plus `grep` im `dist`-Ordner).

## 3. Family Data Layer

* Datei(en):
  * `src/lib/familyData.js`: Laden, Integritätsprüfung, Fehlerarten
  * `src/lib/familyMapping.js`: reine Mapping-Funktionen
* geladene Tabellen:
  * `families`
  * `family_settings`
  * `profiles`
  * `categories`
  * `category_assignments`
  * `tasks`
  * `task_assignments`
  * `rewards`
  * `reward_assignments`
  * `completions`
  * `redemptions`
  * `champion_history`
* Anzahl Initial-Abfragen: 1 (`GET /rest/v1/families` mit PostgREST-Einbettung über Fremdschlüssel, RLS, Publishable Key)
* loading/error/retry: JA
  * Ladeanzeige
  * Fehlerbildschirm „Daten konnten nicht geladen werden“ mit „Erneut versuchen“
  * unvollständige Daten führen zum Fehler (`incomplete`), keine Defaults, keine Reparatur
  * „Daten neu laden“ behält die aktuelle Ansicht
* Writes in dieser Phase: KEINE

## 4. Domain Mapping

* profiles → members:
  * nur aktive Profile, sortiert
  * Felder: `{ id, name, emoji (Fallback 🙂), photo, color, sortOrder }`
  * `isAdmin` ist immer `false`
* parents als Spielerprofile: werden nicht automatisch angelegt. Ein optionales `is_parent`-Profil wird neutral als `isParentPlayer` markiert und gibt nie Zugang zum Elternbereich.
* categories/tasks:
  * `customCategories` (immer ein Array)
  * Tasks: `{ name: title, emoji: icon, points, category, categoryId, recurring, assignedTo }`, nur aktive
  * **keine Assignment-Zeilen = für alle sichtbar** (zentral dokumentiert)
* completions:
  * `rejected` wird entfernt
  * `pending` → `needsConfirm: true, confirmed: false`
  * `confirmed` → `confirmed: true`
  * `date = completed_at`
* rewards: `{ name: title, emoji, pointsCost: points_required, assignedTo }`, nur aktive
* redemptions:
  * `redeemedRewards { memberId, rewardName, pointsCost: points_spent, acknowledged }`
  * Eltern-Hinweise aus unquittierten Einlösungen
* champion_history: `{ memberId, name, emoji, pts, week: week_start }` (lokaler Montag), nur lesen
* settings:
  * `{ showDailyCrown, requireConfirmation, timezone }`
  * `needsConfirmation` = `requireConfirmation`
  * kein `adminPin`

## 5. Punkte

* bestätigte Erledigungen: zählen
* pending: sichtbar (⏳ bzw. „wartet auf Bestätigung“), zählen nicht
* rejected: ausgeblendet, zählen nicht
* Redemptions: reduzieren die verfügbaren Punkte
* Woche: Summe `confirmed` ab lokalem Montag (Europe/Berlin, `dateUtils`)
* Monat: Summe `confirmed` ab dem 1. des lokalen Monats
* Gesamt: Summe aller `confirmed`
* verfügbare Punkte: Gesamt minus Summe `points_spent`

## 6. Tageskrone

* show_daily_crown=true: 👑 für das Profil mit den meisten bestätigten Tagespunkten (Gleichstand: mehrere; 0 Punkte: keiner)
* show_daily_crown=false: keine Tageskrone
* Punkte davon beeinflusst: NEIN. Punkte, Wochen-Champion-Banner und Historie bleiben unverändert.
* Tests:
  * Unit: an, aus, Gleichstand, nur pending
  * Integration: Familie mit an und Familie mit aus
  * Browser: 1 Krone, nach Umschalten und Neuladen 0 Kronen, Punkte unverändert

## 7. Hauptoberfläche FAMILY

* Kinder: Profile mit Avatar, Farbe und Wochenpunkten
* Aufgaben: nach Kategorien gefiltert, Sichtbarkeit pro Profil (Assignments), bereits erledigt ✓, pending ⏳
* Punkte: Woche, Monat, gesamt und verfügbar (Profil-Popup, Statistik)
* Belohnungen: sichtbar mit Kosten und Sichtbarkeit; Einlösen zeigt „Diese Funktion wird gerade vorbereitet.“
* Statistiken: Wochen-, Monats- und Gesamtrangliste, 7-Tage-Verlauf, Aktivität
* Champion: aktueller Wochen-Champion und Champion-Historie
* Pending: ⏳ in Aufgabenliste und Statistik, Zähler am Tab „Verwalten“
* Adminbereich:
  * gesperrt; zeigt Hinweis, Familie, Rolle, E-Mail, Tageskrone und Bestätigung
  * Buttons: „Daten neu laden“, „Familie wechseln“ und „Abmelden“
  * Architektur: `authRole` (owner/parent) getrennt von `pinVerified` (in 4C1 immer `false`)
  * keine Umgehung über `isAdmin`

## 8. Schreibschutz 4C1

* Completion Write: gesperrt (`readOnly`, Hinweis-Toast)
* Confirmation Write: gesperrt
* Redemption Write: gesperrt
* CRUD: gesperrt (Elternbereich vollständig durch `adminLockedView` ersetzt; zentrale `update` gibt nichts weiter)
* Settings Write: gesperrt
* Champion Write: gesperrt (Champion-Effekt im Read-only-Modus deaktiviert)
* unbeabsichtigte Writes im Test: KEINE
  * Integration: nur GET
  * Browser: 0 POST/PATCH/DELETE außer Auth, kein Realtime
  * statischer Test: keine `insert`, `upsert`, `delete`, `rpc`, `update({`, `channel(` im Datenpfad oder in der UI

## 9. Mehrere Familien

* Wechsel: über die Familienauswahl aus 4A/4B oder „Familie wechseln“. `FamilyChampion key={familyId}` verwirft Daten und Ansicht und lädt neu.
* Datenisolation: JA
  * Integration: keine gemeinsamen IDs, fremde Familie per RLS nicht ladbar, anonym kein Zugriff
  * Browser: andere Nutzer sehen nur die eigene Familie
* Reload: Session bleibt, Auswahl erscheint, Daten werden neu geladen

## 10. Tests

* Unit: `tests/familyData.test.mjs` (14): Mapping, Sichtbarkeit, Status, Punkte, Redemptions, Historie, Krone an/aus, leere Listen, fehlende Referenzen, Service (1 Abfrage, Fehlerarten), statische Prüfungen
* Integration: `tests/supabase/family-data.test.mjs` (18) gegen `wochen-champion-test` mit Wegwerf-Familien (Alex, Sam, Kim); danach aufgeräumt
* Browser: Chromium 393×852, FAMILY-Build gegen das Testprojekt (27 Prüfungen):
  * Login
  * Auswahl
  * 3 Profile
  * Aufgaben
  * Assignments
  * Punkte
  * Statistik
  * Rewards
  * Historie
  * Krone an/aus
  * Pending
  * gesperrter Elternbereich
  * Wechsel
  * Reload
  * Logout/Login
  * Fehler und Retry
  * kein horizontales Scrollen
  * keine Entwicklerdaten
  * nur GET
* Legacy Regression: deterministisches Playwright-Skript mit simulierter API, verglichen mit der Baseline vor der Extraktion
* Ergebnisse:
  * Unit 47/47 (gesamt)
  * Integration 18/18
  * Browser 27/27
  * Legacy: identisch (13 Screens, 4 Schreib-Payloads)

## 11. Datenschutz/Sicherheit

* Entwicklernamen im FAMILY-Bundle: NEIN (`grep` ohne Treffer, statischer Test)
* persönliche Legacy-Daten im FAMILY-Bundle: NEIN (kein `DEFAULT_`, `adminPin`, `family-main`, `app_state`)
* service_role: nicht verwendet
* Secrets: keine committet; der Publishable Key des Testprojekts wurde nur zur Laufzeit in Befehlen verwendet
* Produktionsmutation: NEIN

## 12. Geänderte Dateien

* neu:
  * `src/shared/ChampionApp.jsx` (aus `src/App.jsx`)
  * `src/shared/points.js`
  * `src/legacy/legacyDefaults.js`
  * `src/lib/familyData.js`
  * `src/lib/familyMapping.js`
  * `src/family/FamilyChampion.jsx`
  * `tests/familyData.test.mjs`
  * `tests/supabase/family-data.test.mjs`
  * `docs/appstore/PHASE_04C1_FAMILY_DATA.md`
  * diese Datei
* geändert:
  * `src/App.jsx` (jetzt LEGACY-Wrapper)
  * `src/family/FamilyApp.jsx`
* entfernt:
  * `src/family/FamilyHome.jsx`
  * `src/lib/familySummary.js`

## 13. Technische Probleme / notwendige Schemaänderungen

Keine.

Hinweise:
* Anonyme Anfragen erhalten einen Rechtefehler statt einer leeren Liste, weil `anon` keine Tabellenrechte hat. Das ist gewollt.
* Die Zählkacheln der Statistik zählen wie bisher in LEGACY die Anzahl der Erledigungen inklusive pending. Punkte zählen nur `confirmed`.
* Der FAMILY-Build enthält wie seit 4A die Legacy-URL als Konfigurationswert (für die Prüfung „nicht dasselbe Projekt“), aber keinen Legacy-Code.

## 14. Offene Punkte vor Phase 4C2

* Handler-Schnittstelle pro Aktion für FAMILY festlegen (die UI arbeitet heute mit `update(prev → next)` auf dem Gesamtobjekt)
* RPC für sicheres Einlösen (Punkteprüfung serverseitig und atomar) entwerfen; die Migration nur im Testprojekt
* PIN-Gate-Zustand (`pinVerified`) nur im Speicher; Ablauf und Timeout festlegen
* Konflikte (409) aus `completions_once_per_day_uidx` in der UI behandeln
* Menge der Completions langfristig begrenzen (Zeitraum oder serverseitige Summen)

## 15. Empfehlung Phase 4C2

1. Aufgabe erledigen/rückgängig (Insert/Delete unter RLS; `require_confirmation` → `pending`/`confirmed`)
2. Eltern bestätigen/ablehnen (`status`, `confirmed_at`, `confirmed_by`)
3. Belohnung sicher einlösen über RPC (Punkte serverseitig prüfen)
4. PIN-Gate Elternbereich über `verify_parent_pin`, `adminLockedView` ersetzen
5. CRUD für Aufgaben, Kategorien, Rewards und Profile inkl. Assignments
6. Settings bearbeiten inkl. Tageskrone und Bestätigung; PIN ändern über `set_parent_pin`
7. Champion idempotent schreiben (`unique(family_id, week_start)`) + `last_champion_week`
8. Realtime pro `family_id` mit anschließendem Neuladen bzw. inkrementellem Update
9. Tests: Integration für jede Mutation + RLS, Browser-Durchlauf, Legacy-Regression
10. Danach: vollständige FAMILY-Funktionalität, weiterhin nur im Testprojekt, kein Produktionswechsel
