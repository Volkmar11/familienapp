# Phase 4C1 – Family Data Adapter

Stand: 27.09.2026 · Branch `feature/appstore-v1` · keine Datenbankmigration · Produktion unverändert

Ziel: Im FAMILY-Modus wird nach dem Onboarding die echte Wochen-Champion-Oberfläche angezeigt, **read-only**, gespeist aus den relationalen Tabellen des Testprojekts. LEGACY (`app_state` / `family-main`) funktioniert unverändert.

---

## 1. Ausgangsarchitektur App.jsx

`src/App.jsx` (≈ 1 000 Zeilen) war eine einzige Komponente. Zuordnung vor der Extraktion:

| Bereich | Inhalt | Ziel nach 4C1 |
|---|---|---|
| A. reine UI | Home, Belohnungen, Statistik, Verwalten, Modals, Avatar, Konfetti, Badges | `src/shared/ChampionApp.jsx` |
| B. Punkte-/Champion-/Statistiklogik | Wochen-/Monats-/Gesamtpunkte, verfügbare Punkte, Tageskrone, Streaks | `src/shared/points.js` (Punkte, Krone) + Rest in `ChampionApp.jsx` |
| C. LEGACY-Persistenz | `load`/`save` (`app_state`, `family-main`), Ladezustand, Speicherfehler-Hinweis | `src/App.jsx` (LEGACY-Wrapper) |
| D. persönliche Defaultdaten | `DEFAULT_MEMBERS`, `DEFAULT_TASKS`, `DEFAULT_DATA` (inkl. `adminPin`), `REWARD_SUGGESTIONS` | `src/legacy/legacyDefaults.js` |
| E. Admin-/PIN-Logik | PIN-Vergleich mit `data.adminPin`, PIN ändern | LEGACY-Wrapper übergibt `checkAdminPin` / `changeAdminPin`; FAMILY: `adminLockedView` |
| F. Realtime | Kanal `app_state_changes` | `src/App.jsx` (nur LEGACY) |
| G. Schreiboperationen | alle `update(prev → next)` der UI | laufen über die `update`-Prop; im FAMILY-Modus gesperrt (`readOnly`) |

## 2. Trennung UI / Persistenz

- `git mv src/App.jsx src/shared/ChampionApp.jsx`, dann Persistenz, Realtime und persönliche Defaults entfernt. **Kein Rewrite**: Markup und Logik der Oberfläche sind unverändert.
- Props der gemeinsamen UI:
  - `data`: gemeinsames Datenformat
  - `update(fn)`: Schreibweg des Wrappers
  - `readOnly`
  - `showDailyCrown`
  - `adminLockedView`
  - `rewardSuggestions`
  - `resetData`
  - `notice`
  - `checkAdminPin`
  - `changeAdminPin`
- **LEGACY-Wrapper** `src/App.jsx`: Laden und Speichern (inkl. Datenverlust-Fix aus Phase 2), Realtime, Fehler- und Ladebildschirm, Legacy-Defaults, Legacy-PIN.
- **FAMILY-Wrapper** `src/family/FamilyChampion.jsx`: lädt über den Family Data Service, Zustände loading, loaded und error, `readOnly`, gesperrter Elternbereich.
- Build-Trennung aus 4A/4B bleibt erhalten: `main.jsx` wählt über `__WC_FAMILY_BUILD__` genau einen Wrapper. Der FAMILY-Build enthält `ChampionApp.jsx`, aber weder `src/App.jsx` noch `legacyDefaults.js` noch `supabaseLegacy.js`.

## 3. Neues Domain-Modell

`mapFamilyToChampionData(raw)` liefert `{ family, settings, data }`:

```text
family   { id, name }
settings { showDailyCrown, requireConfirmation, timezone }
data     { members, tasks, completions, rewards, redeemedRewards, championHistory,
           customCategories, needsConfirmation, notifications, lastChampionWeek }
```

`data` entspricht bewusst dem bisherigen `app_state`-Format, damit die gemeinsame UI ohne Sonderpfade funktioniert. Es gibt **kein** `adminPin`. `customCategories` ist immer ein Array, deshalb erscheinen im FAMILY-Modus nie Standardkategorien.

## 4. Family Data Service

- Dateien:
  - `src/lib/familyData.js`: Laden, Integritätsprüfung, Fehlerarten
  - `src/lib/familyMapping.js`: reine Mapping-Funktionen
- **1 Abfrage** beim initialen Laden: `GET /rest/v1/families?select=…&id=eq.<family_id>` mit PostgREST-Einbettung über die Fremdschlüssel. Geladen werden:
  - `families`
  - `family_settings`
  - `profiles`
  - `categories(category_assignments)`
  - `tasks(task_assignments)`
  - `rewards(reward_assignments)`
  - `completions`
  - `redemptions`
  - `champion_history`

  Das sind 12 Tabellen, ohne N+1.
- Zugriff ausschließlich über den FAMILY-Client (`supabaseFamily`, Publishable Key) unter RLS. Kein `service_role`, kein Secret Key.
- Ergebnis `{ ok: true, model }` oder `{ ok: false, kind, error }` mit den Fehlerarten:
  - `network`: Netzwerk-/PostgREST-Fehler
  - `not_found`: keine Zeile, also keine Mitgliedschaft
  - `incomplete`: Integritätsprüfung fehlgeschlagen
- `validateFamilyRaw` prüft:
  - Settings vorhanden und gültig
  - alle Listen vorhanden
  - Profilnamen vorhanden
  - Aufgaben und Belohnungen mit Titel und Punkten
  - Kategorie-Referenzen gültig
  - Erledigungen mit bekanntem Profil, Punkten, Zeitpunkt und gültigem Status
  - Einlösungen mit bekanntem Profil
  - Assignments auf bekannte Profile

  Bei unvollständigen Daten gibt es einen **Fehlerzustand statt Defaults**, keine automatische Reparatur.
- Mögliche spätere Optimierungen:
  - Completions zeitlich begrenzen (z. B. letzte 12 Monate plus serverseitige Summen)
  - eine RPC oder View für Punktesummen
  - inkrementelle Updates per Realtime (4C2)

## 5. Profile Mapping

- `profiles` → `members`: nur `active`, sortiert nach `sort_order` und Name.
- Felder:
  - `id`
  - `name`
  - `emoji` (Fallback 🙂)
  - `photo` (`avatar_url`)
  - `color`
  - `sortOrder`
- **Eltern werden nicht automatisch als Spieler angelegt.** Ein Auth-Benutzer wird kein Profil.
- `isAdmin` ist im FAMILY-Modus **immer `false`**. Ein optionales späteres Eltern-Spielerprofil (`is_parent`) wird neutral als `isParentPlayer` markiert. Die gemeinsame UI nutzt dafür den Helper `isParentProfile(m)` (LEGACY: `isAdmin`, FAMILY: `isParentPlayer`), und zwar nur für:
  - „braucht keine Bestätigung“
  - „zählt nicht als Kind in Statistiken“

  Der Zugang zum Elternbereich hängt im FAMILY-Modus nie an Profilen (siehe Abschnitt 13).

## 6. Tasks und Kategorien

- `tasks` → `{ id, name: title, emoji: icon, photo: image_url, points, categoryId, category: Kategoriename, recurring: recurrence, assignedTo }`. Nur `active`, sortiert.
- `categories` → `customCategories: { id, name, emoji: icon, assignedTo }`, sortiert.
- **Zentrale Sichtbarkeitsregel** (in `familyMapping.js` dokumentiert, identisch zur bisherigen App):
  - **Keine Assignment-Zeilen** bedeutet: sichtbar für alle Profile (`assignedTo: []`).
  - Sind Zeilen vorhanden, ist der Eintrag nur für diese Profile sichtbar.

  Das gilt für Kategorien, Aufgaben und Belohnungen. Das Onboarding legt bewusst keine Assignments an.

## 7. Completions

| Status | Anzeige | Punkte |
|---|---|---|
| `confirmed` | normal (`confirmed: true`) | zählt |
| `pending` | ⏳ „wartet auf Bestätigung“ (`needsConfirm: true, confirmed: false`); Zähler am Tab „Verwalten“ | zählt **nicht** |
| `rejected` | wird beim Mapping entfernt | zählt nicht |

`date = completed_at` (Zeitstempel) und `day = completion_date` (lokaler Tag). Wichtig für 4C2: `task_title` und `category_name` bleiben als Momentaufnahme erhalten.

## 8. Punkteberechnung

- `src/shared/points.js` gilt gemeinsam für LEGACY und FAMILY:
  - `sumConfirmedPoints`
  - `completionsSince`
  - `completionsOnDay`
  - `redeemedPoints`
  - `memberPointSummary`
  - `dayLeaderIds`
- Tage und Wochen kommen ausschließlich aus `dateUtils` (Europe/Berlin, Wochenstart Montag), ohne UTC-Rückfälle.
- `memberPointSummary(data, id, now)` → `{ today, week, month, total, available, pending }`:
  - heute, Woche, Monat und gesamt: Summe `confirmed`
  - verfügbar: gesamt minus Summe `redemptions.points_spent`
- Die Oberfläche zeigt weiterhin „Anzahl Erledigungen“ (inkl. pending) in den Zählkacheln. Das entspricht dem bisherigen Legacy-Verhalten. Punkte zählen nur `confirmed`.

## 9. Rewards und Redemptions

- `rewards` → `{ id, name: title, emoji: icon, pointsCost: points_required, assignedTo }`. Nur `active`.
- `redemptions` → `redeemedRewards: { id, rewardId, rewardName, memberId, pointsCost: points_spent, date, acknowledged }`.
- Eltern-Hinweise (`notifications`) werden aus Einlösungen mit `acknowledged_at IS NULL` abgeleitet.
- Einlösen ist im FAMILY-Modus sichtbar, aber gesperrt: Der Button zeigt „Diese Funktion wird gerade vorbereitet.“. In 4C2 muss nur ein Handler (RPC) ergänzt werden.

## 10. Champion History

- `champion_history` → `{ memberId, name: profile_name, emoji: profile_avatar, pts: points, week: week_start }`. `week_start` ist ein lokaler Montag (DB-Check).
- Wird nur gelesen. Die automatische Champion-Auswertung der UI (Wochenwechsel) ist im Read-only-Modus deaktiviert. Es entsteht also **keine** neue Zeile und kein `last_champion_week`-Update.

## 11. Daily Crown

- `family_settings.show_daily_crown` wird jetzt ausgewertet: `ChampionApp showDailyCrown={settings.showDailyCrown}` → `dayLeaderIds(…, showDailyCrown)`.
- `true`: Krone 👑 auf dem Profil mit den meisten **bestätigten** Tagespunkten; bei Gleichstand bekommen mehrere eine Krone, bei 0 Punkten niemand.
- `false`: keine Tageskrone. Punkte, Wochen-Champion-Banner und Historie bleiben unverändert.
- LEGACY: immer an (Standardwert der Prop), wie bisher.
- Tests:
  - Unit: an, aus, Gleichstand, nur pending
  - Integration: Familie mit an und aus
  - Browser: 1 Krone, dann Einstellung auf `false` und neu laden → 0 Kronen, Punkte unverändert

## 12. require_confirmation

`family_settings.require_confirmation` → `settings.requireConfirmation` und `data.needsConfirmation`. Wird im gesperrten Elternbereich angezeigt. In 4C2 entscheidet der Wert, ob neue Erledigungen `pending` oder `confirmed` sind. In 4C1 entstehen keine neuen Erledigungen.

## 13. Read-only-Modus

- `ChampionApp readOnly` ohne `update`-Prop. Die zentrale `update`-Funktion der UI gibt nichts weiter und zeigt stattdessen den Hinweis „Diese Funktion wird gerade vorbereitet.“.
- Zusätzlich gibt es explizite Sperren in:
  - `completeTask`
  - `undoTask`
  - `confirmC`
  - `rejectC`
  - `redeemReward`
- Der Champion-Effekt ist deaktiviert.
- Gesperrt sind damit:
  - Aufgabe erledigen oder rückgängig machen
  - bestätigen oder ablehnen
  - einlösen
  - Aufgaben-, Kategorien-, Belohnungs- und Profil-CRUD
  - Settings
  - PIN
  - Champion schreiben
- **Elternbereich**: `adminLockedView` ersetzt den PIN-Dialog vollständig. Er zeigt einen Hinweis, Familie, Rolle, angemeldete E-Mail, Tageskrone, Bestätigung, „Daten neu laden“, „Familie wechseln“ und „Abmelden“. Die Architektur trennt dabei `authRole` (owner/parent aus `family_members`) von `pinVerified` (künftig über `verify_parent_pin`). In 4C1 gilt `pinVerified = false`, und es gibt keine Umgehung über `isAdmin`.
- Kein Realtime in 4C1: nur initiales Laden, dazu „Daten neu laden“ (behält die aktuelle Ansicht).
- Nachweis:
  - statischer Test: keine `insert`, `upsert`, `delete`, `rpc`, `update({`, `channel(` im Datenpfad oder in der UI
  - Integrationstest: nur GET
  - Browsertest: keine POST/PATCH/DELETE außer Auth, kein Realtime

## 14. Mehrere Familien

- Die Familienauswahl aus 4A/4B bleibt. `FamilyChampion` bekommt genau die gewählte `family_id` und wird mit `key={familyId}` gerendert. Beim Wechsel werden deshalb Zustand, Daten, Ansicht und gewähltes Profil verworfen und neu geladen.
- „Familie wechseln“ im gesperrten Elternbereich erscheint nur bei mehreren Mitgliedschaften und führt zurück zur Auswahl.
- Getestet:
  - Integration: getrennte IDs, keine Vermischung, fremde Familie per RLS nicht ladbar
  - Browser: Wechsel, Reload, Logout und Login eines anderen Nutzers

## 15. Tests

| Test | Datei | Ergebnis |
|---|---|---|
| Unit Mapping/Punkte/Krone/Integrität/Service/statisch | `tests/familyData.test.mjs` (14 Tests) | bestanden |
| Unit gesamt | `node --test tests/*.test.mjs` | 47/47 |
| Integration Testprojekt | `tests/supabase/family-data.test.mjs` | 18/18 |
| Browser 393×852 (Chromium) | Scratchpad-Skript `ui4c1.mjs` (nicht im Repo) | 27/27 |
| Legacy-Regression | Scratchpad-Skript `legacy-reg.mjs` | identisch zur Baseline |

Der Integrationstest deckt die 12 geforderten Punkte ab:

1. Familie
2. Settings
3. Profile
4. Tasks
5. Kategorien
6. Completions
7. Rewards
8. Redemptions
9. Champion-Historie
10. RLS gegen fremde Familie
11. mehrere Familien
12. keine Writes

Außerdem: anonymer Zugriff wird abgelehnt, und der Datenbestand bleibt nach dem Laden unverändert.

Testdaten sind Wegwerf-Konten `wc-p4c1-…@example.com` mit Profilen Alex, Sam und Kim. Sie wurden per Onboarding-RPC angelegt, dazu kamen Inserts des Owners unter RLS (confirmed, pending und rejected Completions, Redemption, Champion-Historie, Task-Assignment). Danach wurde aufgeräumt. Im Testprojekt verbleiben nur „Testfamilie A/B“.

Build-Trennung (`grep` in den `dist`-Ordnern):
- FAMILY-Bundle: kein `Marlon|Clara|Jonah|Papa|Mama|family-main|app_state|DEFAULT_|adminPin`
- LEGACY-Bundle: kein `create_family_with_onboarding|verify_parent_pin|family_settings|champion_history|Familie wird geladen|Anmeldung wird geprüft|Eltern-Bereich wird gerade`

## 16. Legacy Regression

- Das deterministische Playwright-Skript (feste Uhr 30.09.2026 10:00 Berlin, simulierte API unter `test-dummy.supabase.co`, keine Produktionsverbindung) vergleicht 13 Screen-Texte und 4 Schreib-Payloads mit der Baseline vor der Extraktion. Ergebnis: **identisch**.
- Abgedeckt:
  - Start
  - bestehende UI
  - Datenladen
  - Datenverlust-Fix (Fehler → kein Speichern)
  - Datumsfix (Europe/Berlin)
  - Legacy-Schreiblogik (Erledigen, Bestätigen, Einlösen, PIN)
- `npm run build` (LEGACY) ist erfolgreich. Es gab keine Produktionsmutation.

## 17. Voraussetzungen Phase 4C2

1. Schreibpfad im FAMILY-Wrapper: statt `readOnly` gezielte Handler (`onCompleteTask`, `onUndo`, `onConfirm`, `onReject`, `onRedeem`, CRUD) an `ChampionApp` übergeben. Die UI ruft heute `update(prev → next)` auf. Für FAMILY wird eine Handler-Schnittstelle je Aktion nötig (kein Diff des Gesamtobjekts).
2. Einlösen und Punkteprüfung atomar per RPC (verfügbare Punkte serverseitig prüfen).
3. Erledigen mit `require_confirmation`: Kind → `pending`, Eltern-Spielerprofil → `confirmed`. Eindeutigkeit pro Tag und Aufgabe ist per `completions_once_per_day_uidx` bereits abgesichert; Konflikt (409) in der UI sauber behandeln.
4. PIN-Gate: `verify_parent_pin` → `pinVerified` im Wrapper-State (nur im Speicher, nie in Storage) → `adminLockedView` entfällt.
5. Champion idempotent schreiben (`unique(family_id, week_start)` ist vorhanden) + `last_champion_week`.
6. Realtime: Kanal pro `family_id` für completions/redemptions/tasks/rewards/profiles/settings, danach neu laden oder inkrementell aktualisieren.
7. Settings bearbeiten (Tageskrone, Bestätigung) und Profile, Kategorien, Aufgaben und Belohnungen per CRUD inkl. Assignments.
8. Menge der Completions langfristig begrenzen (Abschnitt 4).
