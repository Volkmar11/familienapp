# Phase 4C2B2 – Champion und Realtime

Stand: 28.09.2026 · Branch `feature/appstore-v1` · neue Migration `20260928300000_champion_realtime.sql` (nur Testprojekt `wochen-champion-test`) · Produktion unverändert

FAMILY ist jetzt mehrgerätefähig:

- Der Wochen-Champion wird serverseitig ermittelt (idempotent, mit Catch-up).
- Die bestehende Zeremonie erscheint genau einmal.
- Änderungen erreichen alle Geräte über ein Realtime-Signal pro Familie.
- Reconnect nach Verbindungsabbruch sowie Vordergrund-Rückkehr (PIN-Prüfung, Neuladen, Champion-Sync) sind abgedeckt.
- Bearbeitungskonflikte werden per `updated_at` erkannt statt still überschrieben.

---

## 1. Champion-Logik

Analyse der bisherigen LEGACY-Logik (`ChampionApp.jsx`, Effekt auf `lastChampionWeek`):

| Frage | LEGACY | FAMILY (neu) |
|---|---|---|
| Wochenwechsel erkannt | beim Laden, wenn `lastChampionWeek` < aktueller lokaler Montag | beim Laden, bei Rückkehr in den Vordergrund, nach Reconnect: RPC `sync_weekly_champion` |
| ausgewertete Woche | nur die Woche direkt vor der aktuellen (`prevWeekStart…prevWeekEnd`) | alle vollständig abgeschlossenen, noch nicht verarbeiteten Wochen (Catch-up) |
| Wochenpunkte | Erledigungen mit `confirmed !== false` in der Woche, Summe `points` | `status = 'confirmed'`, Summe der Punkte-Momentaufnahme `completions.points`, `completion_date` in der Woche |
| Gleichstand | stabile Sortierung → das Mitglied, das in der Mitgliederreihenfolge zuerst kommt | kleinere `profiles.sort_order`, danach `profiles.id` (deterministisch, entspricht LEGACY) |
| Woche ohne Punkte | kein Champion (`scores[0].pts > 0`) | kein Champion; Woche gilt trotzdem als verarbeitet |
| Zeremonie | wenn ein Champion für die ausgewertete Woche gespeichert wird | nur wenn DIESER RPC-Aufruf den Champion der zuletzt abgeschlossenen Woche neu angelegt hat |
| gespeichert | `{memberId, name, emoji, pts, week}`; `week` war dabei der alte Marker | `champion_history (profile_id, profile_name, profile_avatar, week_start = lokaler Montag, points)` |
| Marker | `lastChampionWeek` = aktueller Montag | `family_settings.last_champion_week` = Montag der letzten **vollständig verarbeiteten** Woche |

Unterschiede zu LEGACY sind bewusst:

- FAMILY holt verpasste Wochen nach. LEGACY übersprang sie und speicherte den Champion unter dem alten Marker; das war ein Fehler bei mehrwöchiger Abwesenheit.
- Der Marker bedeutet in FAMILY „zuletzt verarbeitete Woche“. Bei der späteren Migration von `family-main` muss er umgerechnet werden (LEGACY-Marker − 7 Tage).

## 2. Zeitzone / Wochenbeginn

- `private.local_week_start(ts, tz)` rechnet den lokalen Montag aus `family_settings.timezone` (Standard `Europe/Berlin`), per `at time zone`, ohne UTC-Versatz.
- Aktuelle Woche = `local_week_start(now())`; zuletzt abgeschlossene Woche = aktuelle Woche − 7 Tage.
- Beispiel (getestet): Montag 28.09.2026, Europe/Berlin → abgeschlossene Woche ab 21.09.2026.
- Grenztest (lokal, fester Zeitpunkt):
  - Sonntag 27.09.2026 23:59 Berlin → Woche 21.09. noch nicht verarbeitet
  - Montag 00:01 Berlin → verarbeitet
  - mit Zeitzone America/New York ist zum selben UTC-Zeitpunkt noch Sonntag → nicht verarbeitet
- Wochenpunkte nutzen `completion_date`, den vom Client per `dateUtils` gespeicherten lokalen Kalendertag.

## 3. Catch-up

- Start ist `last_champion_week + 7`. Ohne Marker ist es die Woche der Familiengründung bzw. der ersten Erledigung (die frühere von beiden).
- Ende ist die zuletzt abgeschlossene Woche. Höchstens 104 Wochen werden rückwirkend geprüft.
- Jede Woche wird einzeln ausgewertet. `champion_history` wird mit `on conflict (family_id, week_start) do nothing` geschrieben; bereits vorhandene Wochen bleiben unverändert.
- Danach gilt `last_champion_week` = letzte abgeschlossene Woche.
- UI: Höchstens die Zeremonie der **zuletzt** abgeschlossenen Woche wird gezeigt (`new_champion`), ältere nachgeholte Wochen landen nur in der Historie.

## 4. Gleichstand / Woche ohne Aktivität

- Gleichstand: höhere Punkte → kleinere `sort_order` → kleinere `id` (getestet: 10:10 → Profil mit Reihenfolge 0).
- 0 bestätigte Punkte (auch wenn nur `pending`/`rejected` vorliegen) bedeuten keinen Champion. Die Woche ist trotzdem verarbeitet, weil der Marker weiterrückt, und wird deshalb nicht bei jedem Start erneut geprüft.

## 5. Champion-RPC

`public.sync_weekly_champion(p_family_id) → jsonb` (SECURITY INVOKER, `search_path = ''`, `EXECUTE` nur `authenticated`) ruft `private.sync_weekly_champion_at(p_family_id, now())` auf. Den Kern mit explizitem Zeitpunkt nutzen die Tests; er ist nicht über die API erreichbar.

- `require_family_admin` (Rolle owner/parent), sonst 42501
- Ergebnis:

  ```text
  { ok, processed_weeks, created[{week_start, profile_id, points}], last_champion_week,
    new_champion, latest: { week_start, ranking[{profile_id, points}] } | null }
  ```

  Es enthält keine Namen oder anderen sensiblen Daten; der Client lädt danach ohnehin neu.
- Schreibrechte: `champion_history` INSERT und `family_settings` UPDATE laufen unter RLS (owner/parent).

## 6. Idempotenz / Race-Schutz

- `SELECT … FROM family_settings … FOR UPDATE` serialisiert alle Aufrufe einer Familie. Ein wartender zweiter Aufruf sieht danach den neuen Marker und verarbeitet nichts mehr.
- Zusätzlich `unique(family_id, week_start)` + `on conflict do nothing`.
- Getestet:
  - lokal drei parallele Sitzungen → genau ein `new_champion = true`, ein Eintrag
  - Testprojekt drei Geräte parallel → genau ein „neu“, ein Eintrag pro Woche
  - erneuter Aufruf → `processed_weeks = 0`

## 7. Zeremonie

- `FamilyChampion` ruft `syncWeeklyChampion` nach dem ersten Laden, bei Rückkehr in den Vordergrund und nach einem Reconnect auf, jeweils mit Single-Flight-Sperre, also nie bei normalen Renders.
- Bei `newChampion` wird die Prop `ceremony = { id, weekStart, ranking }` an die bestehende Zeremonie der gemeinsamen UI übergeben. Sie zeigt Name, Emoji, Punkte und die weiteren Plätze; Profile ohne Punkte erscheinen mit 0.
- Nach Reload oder auf einem zweiten Gerät meldet der Server `new_champion = false`, es gibt keine zweite Zeremonie (Browser getestet).
- Die LEGACY-Champion-Logik ist unverändert; im FAMILY-Modus bleibt sie deaktiviert, weil der FAMILY-Wrapper keine `update`-Prop übergibt.

## 8. Realtime-Architektur

- `src/lib/familyRealtime.js`: ein Channel pro aktiver Familie, abonniert **nur** `public.family_sync` (Postgres Changes, `event: *`, `filter: family_id=eq.<id>`), zusätzlich RLS.
- `src/lib/reloadScheduler.js`: ein zentraler Scheduler für alle Anlässe zum Neuladen.
- `src/lib/appLifecycle.js`: Vordergrund-Ereignisse.
- `FamilyChampion.jsx` verbindet alles; die UI enthält keinen Realtime-Code.
- Strategie Version 1: Ereignis → entprelltes `loadFamilyData` (1 Abfrage) der gesamten Familie. Keine inkrementelle Patch-Engine.

## 9. Tabellen / Filter

Die Publikation `supabase_realtime` enthielt bereits 8 Familientabellen:

- `family_settings`
- `profiles`
- `categories`
- `tasks`
- `rewards`
- `completions`
- `redemptions`
- `champion_history`

Die Assignment-Tabellen fehlten.

**Neu hinzugefügt:** nur `public.family_sync`, eine Zeile pro Familie mit Versionszähler.

- Der Trigger `bump_family_sync` (AFTER INSERT/UPDATE/DELETE, SECURITY DEFINER) erhöht den Zähler bei jeder Änderung an 12 Tabellen:
  - `families`
  - `family_settings`
  - `profiles`
  - `categories`
  - `category_assignments`
  - `tasks`
  - `task_assignments`
  - `rewards`
  - `reward_assignments`
  - `completions`
  - `redemptions`
  - `champion_history`
- Warum ein Signal statt der Einzeltabellen:
  - DELETE-Ereignisse sind in Supabase Realtime weder filterbar noch RLS-geprüft; sie kämen als ID-Ereignisse fremder Familien an.
  - Die Assignment-Tabellen waren nicht publiziert.
  - Ein Kanal mit einem Filter ist einfacher und robuster.
- `family_sync`: RLS-Select nur für Mitglieder, Clients können nicht schreiben (getestet). Ein fremder Nutzer, der auf die fremde `family_id` filtert, erhält nichts (echter WebSocket-Test).
- Beim Löschen einer ganzen Familie wird nichts signalisiert (Existenzprüfung); die Kaskade funktioniert.

## 10. Reload-Scheduler

- **Debounce** 200 ms: mehrere Ereignisse einer Aktion ergeben einen Reload.
- **Single Flight:** höchstens ein Reload gleichzeitig.
- **Trailing:** Anlässe während eines laufenden Reloads lösen genau **einen** weiteren Reload aus; keine verlorenen Änderungen.
- `request({ immediate })` liefert ein Promise, das erst nach einem Reload auflöst, der *nach* dem Anlass startete.
- Eigene Mutationen: `mutate()` wartet auf `request({ immediate: true })`. Das zusätzlich eintreffende Realtime-Signal wird gebündelt; getestet mit höchstens 2 Reloads je Bestätigung. Keine Ereignis-Unterdrückung über lokale IDs.
- Nach Unmount (Familienwechsel/Logout) werden verspätete Ergebnisse verworfen (`disposedRef`), der Scheduler ist gestoppt.

## 11. Reconnect

- `SUBSCRIBED` → Status `connected` und **immer** vollständiger Reload. Damit kommen Änderungen aus der Zeit ohne Verbindung und aus dem kurzen Anlauf der Postgres-Changes an.
- `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED` → Status `disconnected`. Die App bleibt sichtbar, Daten werden nicht verworfen.
- Neuaufbau mit Wartezeiten 1 s, 2 s, 5 s, 10 s, 30 s. Rückmeldungen alter Channels werden ignoriert.
- `reconnectNow()` bei Vordergrund oder `online`.
- Hinweis erst nach 6 s Unterbrechung: „Verbindung unterbrochen – Daten werden nach dem Wiederverbinden aktualisiert.“ Er ist klick-durchlässig, keine technische Fehlermeldung, und verschwindet nach dem Reconnect automatisch. Danach läuft auch der Champion-Sync.

## 12. Foreground Lifecycle

- `onAppForeground()` in `appLifecycle.js` reagiert auf `visibilitychange` (sichtbar), `focus` und `online`, entprellt über 800 ms (visibilitychange + focus ergeben ein Ereignis, getestet: genau ein Reload).
- Ablauf:
  1. PIN-Timeout prüfen (abgelaufen → sperren)
  2. neu laden
  3. Realtime prüfen (`reconnectNow`)
  4. Champion-Sync
- Capacitor ist vorbereitet: Kommentar mit `App.addListener("appStateChange", …)` an genau dieser Stelle. **Nicht installiert.**

## 13. Konflikterkennung

- `updated_at` existiert mit Trigger bereits für `profiles`, `categories`, `tasks`, `rewards` und `family_settings`. **Keine Schemaergänzung nötig.**
- Mapping und Laden enthalten nun `updatedAt`. Speichern schreibt nur, wenn `updated_at` noch dem Stand beim Öffnen entspricht (`UPDATE … WHERE id = … AND updated_at = …`). Bei 0 Zeilen und vorhandenem Eintrag erscheint: „Dieser Eintrag wurde auf einem anderen Gerät geändert. Bitte lade die aktuellen Daten neu.“ Es gibt **kein Last-Writer-Wins**.
- Offenes, geändertes Formular plus Realtime-Änderung desselben Eintrags:
  - Der Formularinhalt bleibt, es erscheint „Dieser Eintrag wurde inzwischen auf einem anderen Gerät geändert.“ mit dem Knopf „Aktuellen Stand übernehmen“.
  - Gelöschte oder archivierte Einträge werden ebenfalls gemeldet.
- Einstellungen: Die Schalter senden `expectedUpdatedAt` mit.
- Hinweis: Auch Sortieren und Archivieren ändern `updated_at`. Ein gleichzeitig geöffnetes Formular meldet dann einen Konflikt. Das ist bewusst die sichere Seite.

## 14. Mehrgeräte-Tests

In dieser Sandbox lässt der Egress-Proxy **keine WebSocket-Upgrades aus Chromium** zu (dokumentierte Proxy-Grenze, bewusst nicht umgangen). Node erreicht Realtime dagegen. Deshalb:

- **Echte Realtime-Synchronisation** (`tests/supabase/family-two-device.test.mjs`): zwei „Geräte“ in Node mit genau den App-Bausteinen Realtime-Service → Scheduler → `loadFamilyData` über echte WebSockets. Geprüft:
  - Pending erscheint auf B, Bestätigung erscheint auf A (entprellt)
  - Einlösung und Quittierung
  - neue Aufgabe und Punkteänderung
  - Profil, Kategorie, Belohnung, Assignments
  - Tageskrone aus und an
  - Konflikt
  - gleichzeitig erledigen und einlösen
  - Verbindungsabbruch → Reconnect → verpasste Änderung
  - gleicher Endzustand
  - nach Stop keine Reloads
- **Zwei-Browser-Test** (Chromium 393×852, zwei Kontexte, dasselbe Konto, `ui4c2b2.mjs`). Die Weitergabe kommt hier über den Vordergrund-Reload bzw. das `online`-Ereignis. Geprüft:
  - Zeremonie nur auf dem ersten Gerät, nicht nach Reload
  - degradierter Modus (Hinweis, Reconnect-Versuche mit Backoff)
  - Pending, Bestätigung, Einlösen, Quittieren
  - CRUD und Tageskrone geräteübergreifend
  - Konflikt im offenen Formular
  - gleichzeitig erledigen und einlösen
  - Offline/Online
  - Vordergrund mit PIN-Timeout
  - identischer Endzustand
  - Familienwechsel und Logout ohne weitere Abfragen
- **Empfehlung:** Die Live-Realtime zwischen zwei echten Geräten einmal in der Vercel-Preview prüfen (siehe Handoff).

## 15. End-to-End-Test

`e2e4c2b2.mjs` (Chromium, neuer Wegwerfnutzer):

1. Registrierung
2. Onboarding: Familie, 2 Kinder, PIN, Aufgaben, Belohnungen, Einstellungen
3. Hauptansicht mit Champion-Sync beim Start (keine Zeremonie bei neuer Familie)
4. Aufgabe erledigen (pending)
5. PIN und Bestätigung
6. Verwaltung: Belohnung anlegen
7. Einlösen
8. Logout und Login
9. alle Daten wieder da (Punkte, Erledigung, Einlösung, Belohnung)

## 16. Legacy Regression

- Alle drei LEGACY-Skripte sind identisch zu ihren Baselines:
  - Start/Champion/Erledigen/Undo/Einlösen/PIN/Bestätigen
  - Einstellungen/PIN ändern/Datenverlust-Fix
  - Verwaltung
- LEGACY-Bundle: kein `family_sync`, `sync_weekly_champion`, FAMILY-RPCs oder Realtime-Kanal des FAMILY-Codes; keine Auth-Abhängigkeit (statischer Test: `src/App.jsx` importiert keines der neuen Module).
- FAMILY-Bundle: keine Entwicklernamen, kein `family-main`, keine Legacy-PIN, keine Produktions-Ref, keine Secrets.

## 17. Voraussetzungen für nächste Phase

1. `family-main`-Sicherung (`local-backups/…json`) **im Testprojekt** in die neue Struktur migrieren (Mitglieder → profiles, Aufgaben/Kategorien/Belohnungen inkl. Assignments, Erledigungen mit Status, Einlösungen, Champion-Historie); `lastChampionWeek` nach FAMILY-Semantik (−7 Tage) übertragen.
2. Punkte je Kind (gesamt, Woche, Monat, verfügbar) zwischen LEGACY-Berechnung und FAMILY vergleichen; jede Abweichung erklären.
3. Namen und Fotos: LEGACY-Fotos sind Base64 → später Storage; bis dahin Emoji-Fallback.
4. Realtime live auf zwei echten Geräten in der Vercel-Preview prüfen (Preview-Variablen siehe Preview-Anleitung).
5. Weiterhin keine Produktionsumstellung ohne Freigabe.
