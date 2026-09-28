# Phase 5A – Legacy Migration Test

Stand 28.09.2026. Migration ausschließlich in das Testprojekt `wochen-champion-test` (`otejitifgcrrwmudrnhs`).
Die Produktion (`gkkzjmszcjivtaygbmfw`) wurde nur gelesen. Dieses Dokument enthält keine personenbezogenen Daten.
Profile heißen Profil 1–5 in der Reihenfolge der Legacy-Mitglieder.

## 1. Quelle

- Backup-Datei: `local-backups/family-main-20260927-195206.json` (ignoriert, nicht committet, nicht verändert)
- Wrapper: `source_project = gkkzjmszcjivtaygbmfw`, `source_table = app_state`, `record.id = family-main`
- `updated_at` des Datensatzes: `2026-09-27T17:46:45.392+00:00`
- Größe: 265.457 Bytes
- SHA-256: `9540cdf78748c0c0a637188ec6ccc51b45ac4c1c22367f3679c60df1cb981e5c`
- Hinweis: Eine READ-ONLY-Kontrolle am 28.09. zeigt `updated_at = 2026-09-27 22:09 UTC` in der Produktion. Die Familie hat die LEGACY-App nach dem Backup also weiter benutzt. Für die echte Migration ist deshalb zwingend ein frisches Backup nötig (siehe `PRODUCTION_MIGRATION_PLAN.md`).

## 2. Legacy Counts

| Bereich | Anzahl |
|---|---|
| Mitglieder | 5 (davon `isAdmin = true`: 2) |
| Aufgaben | 33 (daily 29, weekly 3, once 1; 19 mit Teilzuordnung) |
| Eigene Kategorien | 6 (2 mit Teilzuordnung); von Aufgaben zusätzlich genutzt, aber nicht gelistet: 2 Namen (7 Aufgaben) |
| Erledigungen | 361 (bestätigt 361, pending 0, abgelehnt: gibt es in Legacy nicht) |
| Belohnungen | 13 (7 mit Teilzuordnung) |
| Einlösungen | 25 |
| Champion-Einträge | 23 (17 als Sonntag gespeichert, 6 Wochen doppelt) |
| Benachrichtigungen | 28 (alle Typ `reward`; gelesen 23, ungelesen 5) |
| Profilbilder / Aufgabenbilder | 5 / 0 |
| `needsConfirmation` | `false` |
| `lastChampionWeek` | `2026-09-20` (Sonntag) |
| `adminPin` | vorhanden, nicht ausgegeben, nicht migriert |

Integrität: 0 unbekannte Profil- oder Aufgabenreferenzen in Erledigungen, 0 unbekannte Referenzen in Einlösungen und Historie, 0 Dubletten (Profil, Aufgabe, lokaler Tag), 0 doppelte IDs.

## 3. Mapping

Vollständig in `PHASE_05A_MIGRATION_MAPPING.md`. Die Umsetzung besteht aus drei Teilen:

- `scripts/lib/legacyMigration.mjs`: reine Funktionen
- `scripts/migrate-legacy-family.mjs`: Ablauf mit `--dry-run`, `--reference`, `--apply`, `--verify` und `--sync-test`
- `supabase/test-support/legacy_import_redemptions.sql`: Test-Hilfsfunktion, nur im Testprojekt

Schreibweg:

- Familie, owner, Einstellungen, PIN-Hash und Profile entstehen über die Onboarding-RPC.
- Alles Weitere schreibt der Wegwerf-owner `wc-p5a-migration-…@example.com` unter RLS.
- Die Einlösungen laufen über die Hilfsfunktion, die nur für den owner, nur für „Migration Test“ und nur einmalig gilt.
- Es wird kein `service_role` verwendet.

Wiederholbarkeit: Vor jedem Apply wird nur die Familie „Migration Test“ gelöscht, die dieser owner angelegt hat, und dann neu importiert. Das wurde dreimal ausgeführt, andere Familien werden nie angefasst.

## 4. Profile

| Profil | Legacy `isAdmin` | FAMILY `is_parent` | Foto vorhanden (nicht migriert) |
|---|---|---|---|
| Profil 1 | ja | true | ja |
| Profil 2 | ja | true | ja |
| Profil 3 | nein | false | ja |
| Profil 4 | nein | false | ja |
| Profil 5 | nein | false | ja |

- Die Reihenfolge bleibt über `sort_order` 0–4 erhalten, Emoji und Farbe sind übernommen (5/5 gültige Hex-Farben).
- `is_parent` kennzeichnet nur Eltern-Spielerprofile, weil beide Eltern in Legacy tatsächlich Punkte gesammelt haben. Adminrechte gibt `is_parent` nicht: Die hängen an `family_members.role` plus PIN.

## 5. Tasks / Kategorien

- Aufgaben: 33 → 33. Aufgabenzuordnungen: 29 Zeilen.
- Kategorien: 6 → **8**. Die 2 Namen, die Aufgaben nutzen, die aber nicht in `customCategories` stehen, werden ergänzt; das sind Legacy-Standardkategorien. So verliert keine Aufgabe ihre Kategorie, und Badges und Statistiken, die am Namen hängen, bleiben gleich. In der Legacy-Oberfläche waren diese Aufgaben nur unter „Alle“ sichtbar; in FAMILY gibt es für die beiden Kategorien je einen eigenen Filter. Kategoriezuordnungen: 4 Zeilen. Doppelte Namen: 0.
- Belohnungszuordnungen: 11 Zeilen.
- Titel: 1 Aufgabentitel hatte 81 Zeichen und wurde auf 80 gekürzt („…“). Der Titel-Snapshot in den Erledigungen bleibt ungekürzt.
- Ungeklärte Referenzen: 0.

## 6. Completions

- 361 → 361 (confirmed 361, pending 0, rejected 0)
- Punkte stammen aus dem **Snapshot** der Erledigung. 4 Erledigungen weichen vom heutigen Aufgabenwert ab und werden korrekt mit dem historischen Wert übernommen.
- `completion_date` ist der lokale Tag Europe/Berlin des Zeitstempels. Bei 0 Einträgen unterscheidet sich der lokale vom UTC-Tag, eine SQL-Gegenprüfung (`completed_at at time zone 'Europe/Berlin'`) ergibt ebenfalls 0 Abweichungen. **Datumskorrekturen: 0**, denn der frühere UTC-Fehler betraf nur Wochenschlüssel, nicht die Zeitstempel.
- `confirmed_at = completed_at`, weil der tatsächliche Bestätigungszeitpunkt in Legacy nicht gespeichert ist.

## 7. Rewards / Redemptions

- Belohnungen: 13 → 13
- Einlösungen: 25 → 25. `points_spent` und `reward_title` sind Momentaufnahmen, `redeemed_at` ist das Originaldatum. Ausgegebene Punkte je Profil stimmen exakt überein (Profil 1: 150, Profil 3: 1.250, Profil 4: 2.000, sonst 0).
- Zuordnung der Benachrichtigungen: Von 28 wurden 23 eindeutig zugeordnet (18 gelesen → quittiert, 5 ungelesen → offen).
- **5 Notifications konnten nicht eindeutig zugeordnet werden.** Bei keiner lag eine Einlösung innerhalb von 2 s. Es wurde nicht geraten.
- **2 Einlösungen haben keine passende Benachrichtigung** und bleiben deshalb unquittiert.
- Folge: In FAMILY erscheinen 7 offene Eltern-Hinweise statt 5 ungelesener Hinweise in Legacy. Die Eltern können sie mit einem Tippen quittieren; auf die Punkte hat das keinen Einfluss.

## 8. Champion History

- Legacy 23 → FAMILY **17**. 17 Einträge waren als UTC-Sonntag gespeichert und wurden mit `normalizeWeekKey` auf den lokalen Montag gehoben.
- 6 Wochen waren nach der Normalisierung doppelt. Regel: Der Eintrag, dessen Rohwert schon ein Montag ist, gewinnt; sonst der zuletzt gespeicherte.
- Kontrolle: In allen 6 Fällen entspricht der behaltene Eintrag dem Wochensieger, der sich aus den Erledigungen neu berechnen lässt. Der verworfene Sonntagseintrag trug jeweils die Punkte der Vorwoche, ein Artefakt der alten Wochen-Logik.
- Champion-Anzahl je Profil: 5 / 0 / 7 / 5 / 0.

## 9. last_champion_week

- Legacy `2026-09-20` (Sonntag) → normalisiert `2026-09-21` → FAMILY **`2026-09-14`** (Marker − 7 Tage).
- Gegenprüfung:
  - Jüngster Historieneintrag ist `2026-08-17` ≤ `2026-09-14`, also kein Widerspruch.
  - In den Wochen `2026-08-24` bis `2026-09-14` hat Legacy keinen Champion gespeichert. In einer davon (`2026-08-24`) gab es Punkte, weil Legacy nur die jeweilige Vorwoche auswertet.
  - Ein früherer Wert (z. B. `NULL` oder die letzte Historienwoche) würde diese Woche nachträglich als **neuen** Champion erzeugen, also eine falsche Zeremonie auslösen. Die Regel „Marker − 7“ verhindert das.

## 10. Nicht migrierte Daten

- **Klartext-PIN:** nicht migriert, nicht geloggt. Die Testfamilie hat eine neue, zufällige Test-PIN (nur als bcrypt-Hash in `private.family_security`; Klartext nur lokal in der ignorierten Datei `local-backups/migration-owner.json`).
- **Bilder:** 5 Profilbilder (Base64) und 0 Aufgabenbilder nicht migriert. Das folgt in einer späteren Storage-Phase; die Profile nutzen ihr Emoji.
- `notifications` als eigene Liste: FAMILY leitet Hinweise aus unquittierten Einlösungen ab.
- `memberName` und `memberEmoji` in Erledigungen: redundant.

## 11. Punkteabgleich

Stichtag `2026-09-28T07:20:34Z` (Europe/Berlin). Es wurde über dieselbe Datenschicht der App geladen: `loadFamilyData` → `mapFamilyToChampionData` → `memberPointSummary`.

| Profil | Heute Diff | Woche Diff | Monat Diff | Gesamt Diff | Verfügbar Diff |
|---|---|---|---|---|---|
| Profil 1 | 0 | 0 | 0 | 0 | 0 |
| Profil 2 | 0 | 0 | 0 | 0 | 0 |
| Profil 3 | 0 | 0 | 0 | 0 | 0 |
| Profil 4 | 0 | 0 | 0 | 0 | 0 |
| Profil 5 | 0 | 0 | 0 | 0 | 0 |

- Ebenfalls 0: eingelöste Punkte, Anzahl bestätigter und offener Erledigungen, Champion-Anzahl.
- Der Stichtag hat für Heute, Woche und Monat nur Nullen, weil die letzte Erledigung vom 24.08. stammt. Deshalb gibt es eine **Zeitreihe**: 18 historische Prüfzeitpunkte (je Woche die letzte Erledigung) × 5 Profile × Heute/Woche/Monat = **270 Prüfungen, 0 Abweichungen**.
- Serverseitige Gegenprüfung per SQL: bestätigte Summe − Einlösungen (Grundlage von `redeem_reward`) = verfügbare Punkte, für alle 5 Profile.
- Es waren keine Korrekturen am Mapping nötig.

## 12. Count-Abgleich

| Bereich | Legacy | FAMILY | Erklärung |
|---|---|---|---|
| Profile | 5 | 5 | – |
| Eltern-Spielerprofile | 2 | 2 | `isAdmin` → `is_parent` |
| Aufgaben | 33 | 33 | – |
| Kategorien | 6 | 8 | 2 von Aufgaben genutzte Standardkategorien ergänzt |
| Kategorie-/Aufgaben-/Belohnungszuordnungen | 4 / 29 / 11 | 4 / 29 / 11 | – |
| Erledigungen | 361 | 361 | – |
| davon confirmed / pending | 361 / 0 | 361 / 0 | – |
| Belohnungen | 13 | 13 | – |
| Einlösungen | 25 | 25 | – |
| quittierte Einlösungen | (23 gelesene Hinweise) | 18 | nur eindeutige Treffer mit `read = true` |
| Champion-Historie | 23 | 17 | 6 doppelte Wochen zusammengeführt |

## 13. Champion Sync Test

`sync_weekly_champion` direkt nach der Migration (Montag, 28.09.):

- `last_champion_week`: `2026-09-14` → `2026-09-21`. Genau eine Woche wurde verarbeitet (`2026-09-21`, ohne Erledigungen, daher kein Eintrag).
- Neu erzeugte Einträge: 0. `new_champion = false`, also **keine Zeremonie**.
- Historie vorher und nachher 17, alle alten Wochen unverändert, keine Dubletten.
- Ein zweiter Aufruf verarbeitet 0 Wochen und erzeugt nichts.
- Im UI-Test lief der Sync beim App-Start ebenfalls ohne Zeremonie.

## 14. UI-Test

Lokaler FAMILY-Build gegen das Testprojekt (Chromium, iPhone-Viewport, Europe/Berlin), Anmeldung als Migrations-owner. Anonym ausgewertet, ohne Screenshots. Ergebnis **11/11**:

- genau eine Familie für dieses Konto
- alle 5 Profile sichtbar
- Sync beim Start, keine Zeremonie
- verfügbare Punkte je Profil wie in der Referenz (5/5)
- Aufgaben sichtbar, Zuordnungen wirken (sichtbare Aufgaben je Profil 14/14/26/24/21)
- Belohnungen vorhanden
- Statistik lädt
- „Bisherige Champions“ zeigt 10 Zeilen (Limit der Oberfläche)
- eine neue Erledigung zählt sofort (Bestätigung aus, wie in Legacy)
- keine JS-Fehler

Funktions- und Realtime-Kurztest in Node über echte WebSockets. Der Browser-Proxy dieser Umgebung unterstützt keine WebSocket-Upgrades, siehe Phase 4C2B2. Ergebnis **9/9**:

- Realtime verbunden
- Bestätigungspflicht temporär an
- neue Erledigung → pending
- Realtime-Signal am zweiten Client
- pending zählt nicht
- Bestätigung → Punkte + Snapshot
- Einlösung mit serverseitiger Punkteprüfung
- verfügbare Punkte korrekt

Danach wurden alle Testaktionen durch einen Neuimport entfernt. Anschließend liefen Verify (alle Diffs 0) und Sync-Test erneut, beide OK.

## 15. Erkenntnisse für Produktionsmigration

1. Das Mapping ist verlustfrei: Punkte, Einlösungen und Historie stimmen exakt.
2. Unmittelbar vor der Umstellung ist ein **frisches** Backup Pflicht, denn die Produktion hat sich seit dem Backup geändert. Referenz und Verify laufen dann auf diesem Backup.
3. Einlösungen brauchen einen privilegierten, temporären Importweg, weil der Client-INSERT gesperrt ist. Die Entscheidung dazu steht im Produktionsplan.
4. `last_champion_week = Marker − 7` ist entscheidend. Jede frühere Einstellung erzeugt falsche Champions für Wochen, die Legacy übersprungen hat.
5. Umstellung am besten an einem Montag, nachdem Legacy die Vorwoche ausgewertet hat.
6. Die 2 zusätzlichen Kategorien und die 7 offenen Eltern-Hinweise vorher mit der Familie besprechen, beides ist harmlos.
7. Die Profilbilder (5) brauchen vor dem Go-Live die Storage-Migration, sonst zeigen die Profile nur ihr Emoji.
8. Das Skript braucht für die Produktion einen eigenen Modus: echter owner, kein Delete/Recreate, doppelte Bestätigung. Der heutige Schutz blockiert die Produktion hart.
