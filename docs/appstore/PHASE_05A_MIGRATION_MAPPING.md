# Phase 5A – Migrationsmapping LEGACY → FAMILY

Quelle: `public.app_state` (`id = family-main`), Feld `data` (JSON). Ziel: relationale FAMILY-Tabellen.
Umsetzung: `scripts/lib/legacyMigration.mjs` (reine Funktionen) und `scripts/migrate-legacy-family.mjs` (Ablauf).
Dieses Dokument enthält keine personenbezogenen Daten.

## Tatsächliche Struktur des Backups (Analyse 28.09.2026)

| Legacy-Feld | Typ | Felder je Eintrag |
|---|---|---|
| `members` | Array | id, name, color, emoji, photo (Base64), isAdmin |
| `customCategories` | Array | id, name, emoji, assignedTo |
| `tasks` | Array | id, name, emoji, photo, points, category (**Name**, nicht ID), recurring, assignedTo |
| `completions` | Array | id, date (ISO-UTC), points, taskId, category, memberId, taskName, confirmed, memberName, memberEmoji, needsConfirm |
| `rewards` | Array | id, name, emoji, assignedTo, pointsCost |
| `redeemedRewards` | Array | id, date, memberId, rewardId, pointsCost, rewardName |
| `notifications` | Array | id, date, read, type, message, memberId |
| `championHistory` | Array | pts, name, week, emoji, memberId |
| `needsConfirmation` | Boolean | – |
| `lastChampionWeek` | String `YYYY-MM-DD` | – |
| `adminPin` | String (Klartext) | – |

Weitere Felder gibt es nicht. Legacy kennt kein Archiv (`active`) und keine abgelehnten Erledigungen (Ablehnen löscht dort).

## Feldzuordnung

| Legacy | FAMILY | Regel |
|---|---|---|
| `members[]` | `profiles` | Neue UUID (über die Onboarding-RPC), Reihenfolge → `sort_order`, `name` → `name` (max. 40), `emoji` → `avatar_emoji` (max. 16), `color` → `color` (nur `#RRGGBB`, sonst Standard) |
| `members[].isAdmin` | `profiles.is_parent` | **Nur für diese Migration**: `true` → Eltern-Spielerprofil. Gibt **keine** Adminrechte (die hängen an `family_members.role` + PIN). Neue App-Store-Familien legen Eltern weiterhin nicht als Spieler an. |
| `members[].photo` | – | Nicht migriert (Phase 5A), nur gezählt. `avatar_url` bleibt leer. |
| `customCategories[]` | `categories` | Name (max. 40) + Icon, Reihenfolge → `sort_order`. Doppelte Namen (Groß-/Kleinschreibung, Leerzeichen) → der erste gewinnt. |
| `customCategories = null` | `categories` | Legacy-Standardkategorien (Ordnung, Küche, Haushalt, Garten, Sonstiges) werden rekonstruiert. |
| Aufgabenkategorie ohne Eintrag in `customCategories` | `categories` (ergänzt) | Wird am Ende angehängt, Icon aus dem Legacy-Fallback (sonst 📦), damit keine Aufgabe ihre Kategorie verliert (Badges und Statistik hängen am Namen). |
| `customCategories[].assignedTo` | `category_assignments` | leer → keine Zeilen (= alle); Teilmenge → je Profil eine Zeile; unbekannte IDs werden verworfen (Hinweis). |
| `tasks[]` | `tasks` | Neue UUID; `name` → `title` (max. 80, sonst gekürzt mit „…“), `emoji` → `icon`, `points`, `recurring` → `recurrence` (unbekannt → daily), Reihenfolge → `sort_order`, `active = true`, Kategorie über den Namen. |
| `tasks[].assignedTo` | `task_assignments` | wie bei Kategorien |
| `tasks[].photo` | – | nicht migriert, gezählt |
| `completions[]` | `completions` | Neue UUID. `memberId` → `profile_id`; `taskId` → `task_id` (fehlt die Aufgabe → `NULL`, Historie bleibt); `taskName` → `task_title`; `category` → `category_name`; `points` → `points` (**Momentaufnahme**, nie der aktuelle Aufgabenwert); `date` → `completed_at`; lokaler Tag Europe/Berlin → `completion_date`. |
| `completions[].confirmed/needsConfirm` | `completions.status` | `confirmed !== false` → `confirmed` (`confirmed_at = completed_at`); sonst `pending`. `rejected` gibt es in Legacy nicht. |
| `rewards[]` | `rewards` | Neue UUID; `name` → `title`, `emoji` → `icon`, `pointsCost` → `points_required`, Reihenfolge, `active = true`. |
| `rewards[].assignedTo` | `reward_assignments` | wie bei Kategorien |
| `redeemedRewards[]` | `redemptions` | Neue UUID; `memberId` → `profile_id`, `rewardId` → `reward_id` (fehlt → `NULL`), `rewardName` → `reward_title` (Momentaufnahme), `pointsCost` → `points_spent` (Momentaufnahme), `date` → `redeemed_at`. |
| `notifications[]` | `redemptions.acknowledged_at/_by` | Nur bei **eindeutigem** Treffer: Typ `reward`, gleiches Profil, Zeitabstand ≤ 2 s, Nachricht enthält den Belohnungsnamen; bei mehreren Kandidaten nur ein exakt gleicher Zeitstempel; eine Einlösung, die von mehreren Hinweisen beansprucht wird, bekommt keinen. `read = true` → `acknowledged_at = Importzeit`, `acknowledged_by = owner`; `read = false` oder kein Treffer → `NULL`. Kein Raten. |
| `championHistory[]` | `champion_history` | `week` → `normalizeWeekKey` (Sonntag → Montag) → `week_start`; `memberId` → `profile_id`; `name`/`emoji` → `profile_name`/`profile_avatar` (Momentaufnahme); `pts` → `points`. |
| mehrere Einträge derselben normalisierten Woche | `champion_history` (1 Zeile) | Bevorzugt der Eintrag, dessen Rohwert schon ein Montag ist (korrekte lokale Berechnung); sonst der zuletzt gespeicherte. Die übrigen werden verworfen und gezählt. |
| `needsConfirmation` | `family_settings.require_confirmation` | 1:1 (fehlt → `true`) |
| – | `family_settings.show_daily_crown` | `true` (Legacy zeigt die Krone immer) |
| `lastChampionWeek` | `family_settings.last_champion_week` | Siehe unten. |
| `adminPin` | – | **Nicht migriert**, nicht geloggt. Die Testfamilie erhält eine neue, zufällige Test-PIN (bcrypt-Hash über die Onboarding-RPC). |
| `completions[].memberName/memberEmoji` | – | redundant (kommt aus dem Profil) |
| `notifications[]` selbst | – | FAMILY leitet Hinweise aus nicht quittierten Einlösungen ab. |

## lastChampionWeek

* LEGACY speichert den Montag der Woche, in der zuletzt geprüft wurde. Das ist die **aktuelle** Woche, ältere Versionen speicherten sie als UTC-Sonntag.
* FAMILY speichert die letzte **vollständig ausgewertete, abgeschlossene** Woche.
* Regel: `last_champion_week = normalizeWeekKey(lastChampionWeek) − 7 Tage`.
* Plausibilisierung:
  * Liegt der Wert vor dem jüngsten Historieneintrag, wird er auf diesen angehoben.
  * Liegt er nach der letzten abgeschlossenen Woche, wird er gekappt.
  * Fehlt der Marker, gilt die letzte abgeschlossene Woche. Es gibt keine Nachberechnung alter Wochen, da das falsche neue Champions für Wochen erzeugen würde, die LEGACY nie ausgewertet hat.
* Konkret: `2026-09-20` → `2026-09-21` → **`2026-09-14`**. Das ist konsistent mit der Historie (jüngster Eintrag `2026-08-17`).

## Datumsregel für Erledigungen

`completion_date = toDateKey(date, "Europe/Berlin")`: der lokale Kalendertag des gespeicherten Zeitstempels. Die Zeitstempel selbst sind korrekt, denn der frühere UTC-Fehler betraf nur Wochenschlüssel. Im Backup liegt bei 0 von 361 Erledigungen der lokale Tag anders als der UTC-Tag. Es wurden **0 Daten korrigiert**.

## Schreibweg im Testprojekt

* Familie, owner-Mitgliedschaft, Einstellungen, PIN-Hash und Profile entstehen über die Onboarding-RPC.
* Alles Weitere schreibt der Wegwerf-owner unter RLS.
* Ausnahme sind die Einlösungen: Der Client-INSERT ist seit Phase 4C2A gesperrt, und `redeem_reward` würde Datum, Titel und Kosten überschreiben. Dafür gibt es die Test-Hilfsfunktion `public.legacy_import_redemptions` (`supabase/test-support/legacy_import_redemptions.sql`). Sie gilt nur im Testprojekt, nur für den owner, nur für die Familie „Migration Test“ und nur einmalig.
* Es wird kein `service_role` verwendet.
