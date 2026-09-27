# Phase 3 – Supabase-Testbackend und Datumslogik

Stand: 2026-09-27 · Branch `feature/appstore-v1` · Ausgangs-Commit `4b9c368`

> **In Phase 3 wurden keine Supabase-Projekte angesprochen**, weder das Produktiv- noch ein Testprojekt. Es gab keine Migration und keine Datenänderung.

---

## 1. Status Testprojekt

**TESTBACKEND BLOCKIERT – MANUELLE EINRICHTUNG ERFORDERLICH**

In der Umgebung wurde gezielt gesucht nach:

- Umgebungsvariablen mit `SUPABASE`, `PG` oder `DATABASE`
- Dateien `.env`, `.env.*`, `.env.local`
- einer Supabase-CLI-Verknüpfung (`supabase/.temp`, `supabase/config.toml`) und der Supabase CLI selbst

Ergebnis: **nichts vorhanden**. Es gibt also kein eindeutig als Test gekennzeichnetes Projekt, und deshalb wurde **keine Migration ausgeführt** (Sicherheitsregel).

Die Einrichtung ist beschrieben in [`SUPABASE_TESTPROJECT_SETUP.md`](SUPABASE_TESTPROJECT_SETUP.md).

**Erkenntnis zur Umgebung:** Die Claude-Code-Cloud-Umgebung erlaubt nur ausgehendes HTTPS über einen Proxy. Direkte Postgres-Verbindungen (Port 5432/6543) sind daher voraussichtlich nicht möglich. Empfohlener Ablauf:

1. Die Migration führt der Nutzer im **SQL-Editor des Testprojekts** aus.
2. Claude Code testet anschließend Auth, RLS und Realtime **über HTTPS** mit URL und Publishable Key des Testprojekts.
3. Dafür werden keine Admin-Zugänge (`service_role`, Datenbankpasswort, Access Token) in der Cloud-Umgebung benötigt.

## 2. Migration

Nicht ausgeführt. Grund: kein Testprojekt vorhanden.

Die Datei `supabase/migrations/20260927120000_family_architecture.sql` ist **unverändert**, die Schutzsperre `app.migration_target = 'test'` bleibt bestehen.

**Statische Nachprüfung, ohne Befund, der eine Änderung erfordert:**

- `ON DELETE SET NULL (spalte)` braucht PostgreSQL ≥ 15. Neue Supabase-Projekte laufen auf Postgres 15 bzw. 17.
- Keine Anweisungen gegen `app_state`.
- Alle `SECURITY DEFINER`-Funktionen haben `search_path = ''`.
- Grants und Revokes für `anon` sind vorhanden.
- Die Publikation wird nur ergänzt, wenn sie existiert.

Der lokale Funktionstest aus Phase 2 (PostgreSQL 16, nachgebildete Rollen) bleibt die aktuelle Validierung. Ein Test gegen echtes Supabase (Auth, Realtime) steht aus.

## 3. Tabellen und Funktionen

Keine Änderungen gegenüber Phase 2. Enthalten sind 13 Tabellen, `private.is_family_member`, `private.has_family_role`, `private.set_updated_at` und `public.create_family`. Details stehen in `PHASE_02_ARCHITECTURE.md`.

## 4. Auth-Test

Nicht durchgeführt (blockiert). Vorgesehen, sobald das Testprojekt steht:

- **Anlegen der Testkonten:** Zwei Konten per `supabase.auth.signUp` mit Platzhalter-Adressen wie `wc-test-a@example.com` und `wc-test-b@example.com` und zufällig erzeugten Passwörtern, die nur in der Sitzung existieren. Voraussetzung ist, dass „Confirm email“ im Testprojekt deaktiviert ist.
- **Alternative:** Der Nutzer legt die beiden Konten im Dashboard an (Authentication → Users → Add user → „Auto Confirm User“) und hinterlegt die Zugangsdaten als Umgebungsvariablen `SUPABASE_TEST_USER_A_EMAIL` / `…_PASSWORD` und `SUPABASE_TEST_USER_B_EMAIL` / `…_PASSWORD`.
- Keine echten persönlichen E-Mail-Adressen, keine Zugangsdaten im Repository.

## 5. create_family-Test

Nicht durchgeführt (blockiert). Die Testfälle liegen fest:

- User A und User B rufen jeweils `create_family` auf.
- Es entstehen zwei unterschiedliche UUIDs, jeweils mit owner-Mitgliedschaft und `family_settings` (`show_daily_crown = true`).
- Ein anonymer Aufruf muss abgewiesen werden.
- Atomarität: Schlägt ein Teilschritt fehl, bleibt nichts zurück. Die RPC ist eine einzelne Funktion und damit eine Transaktion.
- **Mehrere Familien pro Nutzer:** Das Datenmodell erlaubt sie. Eine harte Beschränkung ist **bewusst nicht** eingebaut; die erste UI arbeitet mit einer aktiven Familie.

## 6. RLS-Matrix

Gegen echtes Supabase **nicht getestet (blockiert)**. Die Tabelle zeigt die Ergebnisse aus dem lokalen PostgreSQL-16-Test von Phase 2 (nachgebildete `auth.uid()`, Rollen `anon` und `authenticated`) und kennzeichnet, was noch aussteht.

| Operation | User A eigene Familie | User A fremde Familie | User B eigene Familie | anon |
| --- | --- | --- | --- | --- |
| `create_family` | PASS (lokal) | – | PASS (lokal) | PASS (lokal): verweigert |
| Familie lesen | PASS (lokal) | PASS (lokal): 0 Zeilen | PASS (lokal) | PASS (lokal): verweigert |
| Profile anlegen/lesen | PASS (lokal) | PASS (lokal): RLS-Fehler / 0 Zeilen | offen | PASS (lokal): verweigert |
| Kategorien verwalten | PASS (lokal) | offen | offen | offen |
| Aufgaben verwalten | PASS (lokal) | PASS (lokal): UPDATE ohne Wirkung | offen | offen |
| Belohnungen verwalten | offen | offen | offen | offen |
| Completions verwalten | PASS (lokal) | PASS (lokal): DELETE ohne Wirkung | offen | offen |
| Settings lesen/ändern (`show_daily_crown`) | PASS (lokal) | offen | offen | offen |
| Selbst in fremde Familie einschreiben | – | PASS (lokal): RLS-Fehler | – | – |
| Cross-Family-Verknüpfung (FK) | – | PASS (lokal): FK-Fehler | – | – |

„offen“ bedeutet: Der Test wird im echten Testprojekt vollständig über die HTTPS-API ausgeführt.

## 7. Realtime-Test

Nicht durchgeführt (blockiert). Vorgesehen:

- User A abonniert `postgres_changes` auf `profiles`, `tasks`, `completions`, `rewards` und `family_settings`.
- User B ändert Daten seiner Familie. A darf **nichts** empfangen.
- A ändert eigene Daten. A empfängt die Ereignisse.

## 8. Gefundene und behobene SQL-Probleme

Keine. Die SQL-Datei wurde in Phase 3 nicht verändert.

## 9. Datumsfehler vorher

`src/App.jsx` nutzte `isoDate = new Date(d).toISOString().slice(0,10)`, also den **UTC**-Kalendertag. Folgen in Europe/Berlin (UTC+1/+2):

- **Wochenschlüssel:** Den lokalen Montag 00:00 speicherte `isoDate(weekStart())` als **Sonntag** davor. Aus Montag, dem 21.09.2026, wurde `"2026-09-20"`. Das betraf `lastChampionWeek` und `championHistory[].week`.
- **„Heute“:** Zwischen 0:00 und 1:00/2:00 Uhr Ortszeit galt noch der Vortag als heute. Eine Erledigung kurz vor Mitternacht sperrte deshalb die Aufgabe noch nach Mitternacht („schon erledigt“).
- **Wochen- und Monatsfilter** verglichen Zeitstempel mit lokalen `Date`-Objekten. Das hing von der Zeitzone des Geräts ab.
- **„Gestern“ für Streaks** wurde als `Date.now() − 24 h` berechnet und war an Sommerzeit-Tagen unscharf.

## 10. Neue Datumslogik

Neue Datei **`src/lib/dateUtils.js`** mit reinen Funktionen ohne Abhängigkeiten:

| Funktion | Zweck |
| --- | --- |
| `DEFAULT_TIME_ZONE` | `"Europe/Berlin"`; später durch `family_settings.timezone` ersetzbar |
| `toDateKey(zeitpunkt, tz)` | lokaler Kalendertag `YYYY-MM-DD` über `Intl.DateTimeFormat` (kein `toISOString`) |
| `addDays(key, n)` | Kalenderarithmetik auf Schlüsseln, sommerzeitsicher |
| `weekdayOfKey(key)` | Wochentag 0–6 |
| `weekStartKey(zeitpunkt, tz)` | Montag der lokalen Woche |
| `monthStartKey(zeitpunkt, tz)` | Erster des lokalen Monats |
| `normalizeWeekKey(key)` | alte UTC-Sonntags-Schlüssel → Montag; ein korrekter Wochenschlüssel ist nie ein Sonntag |

**Änderungen in `src/App.jsx`** (+23/−19 Zeilen, UI unverändert):

- `isoDate`, `today`, `weekStart`, `monthStart`, `prevWeekStart`, `prevWeekEnd` und `dayName` nutzen die neuen Helfer und liefern bzw. vergleichen `YYYY-MM-DD`-Schlüssel.
- Wochen- und Monatsfilter, die Badge „100er Club“, „Nur Wochenpunkte zurücksetzen“ und die Vorwochen-Auswertung vergleichen lokale Tagesschlüssel.
- „Gestern“ im Streak wird als `addDays(heute, -1)` berechnet, die „Letzte 7 Tage“ als `addDays(heute, -6 … 0)`.
- **Champion-Effekt:** `lastChampionWeek` und `championHistory[].week` werden beim Vergleich über `normalizeWeekKey` normalisiert. So löst ein alter Sonntags-Schlüssel nach dem Deploy **keine** falsche Zeremonie mitten in der Woche aus. Neue Einträge werden als Montag gespeichert.
- **Bewusst unverändert:** Zeitstempel (`completion.date`, `redeemedRewards[].date`, `updated_at`) bleiben echte Zeitpunkte (`toISOString()`). Nur der Kalendertag wird lokal abgeleitet. Die Anzeige „KW …“ zeigt wie bisher den gespeicherten Schlüssel. Alte Einträge der Historie erscheinen dort deshalb weiterhin mit dem Sonntags-Datum.

## 11. Datumstests

**Unit-Tests:** `tests/dateUtils.test.mjs` mit dem eingebauten `node:test`, keine neuen Pakete. Ausführen mit `node --test tests/dateUtils.test.mjs`.

| Test | Ergebnis |
| --- | --- |
| Standard-Zeitzone Europe/Berlin | PASS |
| Montag, 21.09.2026 → `2026-09-21` | PASS |
| Wochenbeginn Mo 21.09.2026 → `2026-09-21` | PASS |
| So 27.09.2026 (23:30) gehört zur Woche ab `2026-09-21` | PASS |
| Mo 28.09.2026 → neue Woche ab `2026-09-28` | PASS |
| Mo 21.09.2026, 00:30 lokal (UTC wäre `2026-09-20`) → `2026-09-21` | PASS |
| 01.01.2027, 00:15 MEZ (UTC wäre `2026-12-31`) → `2027-01-01`, Monatsbeginn korrekt | PASS |
| 27.09.2026, 23:59:59 bleibt `2026-09-27` | PASS |
| Sommerzeit-Ende 25.10.2026 verschiebt keine Tage bzw. Wochen | PASS |
| `addDays` über Monats-, Jahres- und Schaltjahresgrenzen | PASS |
| `weekdayOfKey` | PASS |
| Vorwoche für Champion (`2026-09-21` … `2026-09-27`) | PASS |
| `normalizeWeekKey`: `2026-09-20` → `2026-09-21`, Montag bleibt | PASS |
| Ungültige Eingabe → `""` | PASS |
| Andere Zeitzone per Parameter (Vorbereitung `family_settings.timezone`) | PASS |

Alle **15/15 PASS**, jeweils ausgeführt mit der Gerätezeitzone `Europe/Berlin`, `UTC`, `America/New_York` und `Asia/Tokyo`. Das Ergebnis hängt also nicht von der Zeitzone des Geräts ab.

**Integrationstest im Browser:** Chromium, Zeitzone Europe/Berlin, feste Uhrzeit, simulierte Supabase-API, keine echte Verbindung.

| Szenario | Neuer Code | Alter Code (`4b9c368`) |
| --- | --- | --- |
| Mi 30.09., gespeichert `lastChampionWeek = "2026-09-27"` (alter Schlüssel der laufenden Woche) → keine Zeremonie, kein Schreibzugriff | PASS | PASS |
| Mi 30.09., gespeichert `"2026-09-20"` (Vorwoche, alt) → Zeremonie; gespeichert `lastChampionWeek = "2026-09-28"`, Historie `"2026-09-21"` | PASS | FAIL (speichert `2026-09-27` / `2026-09-20`) |
| Mo 28.09., 00:30: Erledigung So 23:30 zählt zur Vorwoche, neuer Schlüssel Montag | PASS | FAIL (speichert `2026-09-27`) |
| Mi 23.09., 00:20: Erledigung von Di 23:50 sperrt die Aufgabe des neuen Tages nicht | PASS | FAIL (Aufgabe fälschlich gesperrt) |

## 12. Build

`npm run build` ist erfolgreich (Vite 6.4.2; JS 413 KB, gzip 115 KB; keine Warnungen). `package.json` und `package-lock.json` sind unverändert, es gibt keine neuen Abhängigkeiten.

## 13. Voraussetzungen für Phase 4

1. **Testprojekt einrichten** nach `SUPABASE_TESTPROJECT_SETUP.md`: Projekt `wochen-champion-test`, Confirm email aus, Migration im SQL-Editor ausführen.
2. **Umgebungsvariablen** `SUPABASE_TEST_PROJECT_REF`, `SUPABASE_TEST_URL` und `SUPABASE_TEST_PUBLISHABLE_KEY` in der Claude-Code-Cloud-Umgebung hinterlegen und `<ref>.supabase.co` in der Netzwerkfreigabe erlauben.
3. **Branch `feature/appstore-v1` nach GitHub pushen**, damit eine neue Sitzung ihn hat.
4. **Backup von `family-main`** aus dem Produktivprojekt erstellen. Es fehlt weiterhin.
5. Danach eine **Phase 3b**: echte Validierung von Auth, `create_family`, RLS und Realtime im Testprojekt. Erst dann folgt Phase 4 (Auth-Frontend, Onboarding, neue Datenschicht).
