# Phase 2 – Stabilisierung und Familienarchitektur

Stand: 2026-09-27 · Branch `feature/appstore-v1`

> **In Phase 2 wurden keine produktiven Supabase-Daten, Tabellen oder RLS-Regeln verändert.** Der SQL-Entwurf wurde nicht auf Supabase ausgeführt. Getestet wurde er nur in einer lokalen Wegwerf-PostgreSQL-16-Instanz mit nachgebildeten Supabase-Rollen (Abschnitt 3.4).

---

## 1. Durchgeführte Codeänderungen

| Datei | Änderung |
| --- | --- |
| `src/App.jsx` | Lade- und Speicherablauf abgesichert (ca. +48/−6 Zeilen). UI, Geschäftslogik, PIN und Krone bleiben unverändert. Hinzugekommen ist nur ein Fehlerbildschirm für Ladefehler. |
| `src/config/starterContent.js` | neu: neutrale Starter-Vorschläge, noch nicht eingebunden |
| `supabase/migrations/20260927120000_family_architecture.sql` | neu: SQL-**Entwurf** der Zielarchitektur, nicht ausgeführt |
| `docs/appstore/PHASE_02_ARCHITECTURE.md` | neu: dieses Dokument |
| `docs/appstore/CHATGPT_HANDOFF_PHASE_02.md` | neu: Übergabe |

`package.json` und `package-lock.json` sind unverändert. Es wurden keine neuen Pakete installiert.

---

## 2. Behobener Datenverlust-Fehler

### Bisheriges Verhalten

1. `load()` fing jeden Fehler ab und lieferte `null`. `.single()` behandelte „keine Zeile“ ebenfalls als Fehler.
2. Der Start-Effekt setzte bei `null` die Standarddaten `DEFAULT_DATA`.
3. Der Wochen-Champion-Effekt sah `lastChampionWeek = null` und rief sofort `save()` auf.
4. `save()` machte ein `upsert` auf `family-main` und **überschrieb dort die echten Familiendaten**.
5. `save()` ignorierte außerdem Supabase-Fehler, weil `supabase-js` Fehler zurückgibt statt sie zu werfen.

### Neues Verhalten

- `load()` liefert jetzt drei eindeutige Zustände:
  - `{status:"loaded", data}`: der Datensatz wurde gefunden.
  - `{status:"empty"}`: es gibt nachweislich keinen Datensatz. Dafür wird `.maybeSingle()` verwendet ([Supabase-Doku](https://supabase.com/docs/reference/javascript/maybesingle)).
  - `{status:"error", error}`: Netzwerk- bzw. Supabase-Fehler oder ein Datensatz ohne gültiges `data`-Objekt. Der Fehler wird mit `console.error("[load] …")` protokolliert.
- Die App hat den Zustand `loadState` mit den Werten `loading`, `loaded` und `error`.
- **Speichersperre:** Die Modulvariable `persist.ready` steht auf `true` **nur** nach `loaded` oder `empty`. `save()` bricht ab, solange sie `false` ist, und protokolliert `[save] blockiert`.
- Nur bei `empty` wird mit `DEFAULT_DATA` gestartet. Das entspricht dem bisherigen Verhalten bei einer wirklich leeren Datenbank.
- Bei `error` zeigt die App einen Fehlerbildschirm mit dem Hinweis „Daten konnten nicht geladen werden … Es wurde nichts gespeichert“ und einem Button **„Erneut versuchen“**. `data` bleibt `null`. Dadurch laufen weder der Wochen-Effekt noch irgendeine Bedienung. Auch Realtime-Ereignisse werden ignoriert, solange `persist.ready` `false` ist.
- `save()` prüft den `error` des Upserts, protokolliert `[save] fehlgeschlagen` und zeigt einen Toast: „⚠️ Speichern fehlgeschlagen – bitte Verbindung prüfen“. Der Rückgabewert ist `true` bzw. `false`.

### Warum kein Überschreiben nach einem Ladefehler mehr möglich ist

Es gibt zwei unabhängige Sperren:

1. Im Fehlerzustand werden nie Standarddaten in `data` gesetzt. Kein Effekt und kein Bedienelement kann deshalb etwas speichern.
2. Selbst wenn ein Aufruf durchkäme, verweigert `save()` das Upsert, weil `persist.ready` nur nach einem erfolgreich abgeschlossenen Laden `true` wird.

### Geprüft

Getestet wurde in Chromium (Playwright) gegen simulierte Supabase-Antworten. Es gab keine Verbindung zum echten Projekt.

| Fall | Schreibzugriffe | Ergebnis |
| --- | --- | --- |
| Supabase antwortet mit HTTP 500 | **0** | Fehlerbildschirm |
| Netzwerkabbruch | **0** | Fehlerbildschirm, erscheint nach den eingebauten Wiederholungen von supabase-js (ca. 5–15 s) |
| Fehler, dann „Erneut versuchen“ erfolgreich | **0** | App wird mit den geladenen Daten angezeigt |
| Tabelle ohne Zeile (leer) | 1 | Start mit Standarddaten und Wochenmarker, wie bisher |
| Datensatz vorhanden | 0 | App normal |

**Nicht Teil dieser Phase:** „Letzter Schreiber gewinnt“ bleibt bestehen. Das bisherige Verhalten `save()` innerhalb des `setData`-Updaters (unter `StrictMode` im Dev-Modus doppelt) wurde nicht verändert.

---

## 3. Ziel-Datenmodell

```
auth.users ──< family_members >── families ──1:1── family_settings
                                     │
        ┌──────────────┬─────────────┼──────────────┬───────────────┐
     profiles      categories      tasks         rewards    champion_history
        │   ╲          │    ╲        │   ╲          │   ╲
        │  category_assignments  task_assignments  reward_assignments
        │                            │                │
        ├──────────< completions >───┘                │
        └──────────< redemptions >────────────────────┘
```

| Tabelle | Zweck |
| --- | --- |
| `families` | Mandant; alle Familiendaten hängen daran |
| `family_members` | Zuordnung von Elternkonten (`auth.users`) zu Familien, mit Rolle `owner` oder `parent` |
| `family_settings` | eine Zeile pro Familie mit den familienweiten Schaltern |
| `profiles` | Spielerprofile (Kinder und, wie bisher, auch Eltern als Mitspielende); **keine** Auth-Benutzer |
| `categories` | Aufgabenkategorien pro Familie |
| `category_assignments` | Sichtbarkeit einer Kategorie für bestimmte Profile (leer = für alle) |
| `tasks` | Aufgaben mit Punkten, Wiederholung und Kategorie |
| `task_assignments` | Sichtbarkeit einer Aufgabe für bestimmte Profile (leer = für alle) |
| `rewards` | Belohnungen mit Punktkosten |
| `reward_assignments` | Sichtbarkeit einer Belohnung für bestimmte Profile (leer = für alle) |
| `completions` | jede einzelne Erledigung, eigene Zeile statt JSON-Array |
| `redemptions` | eingelöste Belohnungen; ersetzt zusätzlich die Eltern-Benachrichtigung |
| `champion_history` | Wochen-Champions |

### 3.1 Integrität

- **Familientrennung auf Schlüsselebene:** Kindtabellen referenzieren über **zusammengesetzte Fremdschlüssel** `(family_id, …_id)`. Eine Aufgabe kann also nie auf die Kategorie einer anderen Familie verweisen, und ein Profil kann keiner fremden Aufgabe zugewiesen werden. Das ist lokal getestet.
- **Snapshots:** `completions.task_title` und `category_name`, `redemptions.reward_title` sowie `champion_history.profile_name` und `profile_avatar` bleiben erhalten, auch wenn die Aufgabe, Belohnung oder das Profil gelöscht wird. So zeigt die bisherige App heute schon `taskName`, `rewardName` und Ähnliches an.
- **`ON DELETE SET NULL (spalte)`:** Wird eine Aufgabe, Belohnung, Kategorie oder ein Profil gelöscht, wird nur die jeweilige ID auf `NULL` gesetzt. Erledigungen und Einlösungen bleiben erhalten, damit Punkte nicht verschwinden. Das erfordert PostgreSQL ≥ 15 ([Doku](https://www.postgresql.org/docs/15/sql-createtable.html)).
- **Löschen eines Profils** löscht dessen Erledigungen und Einlösungen per `CASCADE`. In der aktuellen App gibt es kein Löschen von Profilen. Später sollte stattdessen `profiles.active = false` genutzt werden.
- **CHECK-Regeln:**
  - Punkte liegen zwischen 0 und 10.000; `points_required` bzw. `points_spent` zwischen 0 und 100.000. Negative Werte sieht die Geschäftslogik nicht vor. Die heutige UI verhindert sie aber nicht, weil `parseInt(…)||0` negative Zahlen durchlässt.
  - `recurrence` ist einer der Werte `daily`, `weekly` oder `once`.
  - `status` ist einer der Werte `pending`, `confirmed` oder `rejected`.
  - Farbe im Format `#RRGGBB`.
  - Namen haben 1–40 bzw. 1–80 Zeichen.
  - `week_start` und `last_champion_week` müssen ein Montag sein.
- **Eindeutigkeit:**
  - Kategoriename pro Familie, ohne Beachtung von Groß- und Kleinschreibung. Die bisherige App nutzt den Namen als Schlüssel.
  - Eine nicht abgelehnte Erledigung pro Profil, Aufgabe und Tag. Das ist die bisherige „Doppelklick-Sperre“.
  - Ein Champion pro Familie und Woche.
- **Indizes:** für alle Fremdschlüssel sowie für Zeitachsen (`completed_at`, `redeemed_at`) und offene Vorgänge (`status = 'pending'`, `acknowledged_at is null`).

### 3.2 Schutzsperre im Entwurf

Die Datei bricht sofort ab, solange nicht vorher `set app.migration_target = 'test';` gesetzt wurde. Alles läuft in einer Transaktion (`begin … commit`), bei einem Fehler wird also nichts übernommen. Die Sperre muss vor einer späteren echten Übernahme bewusst entfernt werden.

### 3.3 Nicht verändert

`public.app_state` wird im Entwurf **nicht erwähnt** (außer im Kommentar). Es gibt kein `DROP`, kein `TRUNCATE` und kein `DELETE`/`UPDATE`/`INSERT` auf Bestandsdaten. `INSERT` kommt nur innerhalb der RPC `create_family` in neue Tabellen vor.

### 3.4 Lokaler Test des Entwurfs

Getestet in PostgreSQL 16.13 mit nachgebildeten Rollen `anon` und `authenticated`, `auth.users`, `auth.uid()` und der Publikation `supabase_realtime`. Die Instanz wurde danach gelöscht.

| # | Prüfung | Ergebnis |
| --- | --- | --- |
| 1 | Ohne `app.migration_target` | Abbruch, keine Tabelle angelegt ✔ |
| 2 | Mit Freigabe | 13 Tabellen, RLS überall aktiv, 47 Policies, simuliertes `app_state` unverändert ✔ |
| 3 | Nutzer A legt über `create_family` Familie, owner-Mitgliedschaft und Einstellungen an (`show_daily_crown = true`) | ✔ |
| 4 | Nutzer B sieht, ändert oder löscht nichts aus Familie A | ✔ |
| 5 | Nutzer B schreibt in Familie A oder trägt sich selbst als Mitglied ein | RLS-Fehler ✔ |
| 6 | Zuweisung über Familiengrenzen | FK-Fehler ✔ |
| 7 | Negative Punkte, doppelte Erledigung am selben Tag, doppelter Kategoriename | abgewiesen ✔ |
| 8 | owner tritt selbst aus | nicht möglich ✔ |
| 9 | `anon`: Tabellen, `create_family`, `private.*` | „permission denied“ ✔ |
| 10 | `create_family` ohne Anmeldung | Fehler „Nicht angemeldet“ ✔ |
| 11 | Aufgabe löschen | Erledigung bleibt, `task_id` wird `NULL` ✔ |

---

## 4. RLS-Konzept

- **Grundprinzip:** `auth.uid()` → `family_members` → `family_id`. Zugriff gibt es nur auf Zeilen, deren `family_id` zu einer eigenen Mitgliedschaft gehört.
- **Hilfsfunktionen** im Schema `private`, das nicht über die API erreichbar ist:
  - `private.is_family_member(family_id)`
  - `private.has_family_role(family_id, roles[])`
- Beide sind `SECURITY DEFINER`, `STABLE`, haben `set search_path = ''` und verwenden durchgehend voll qualifizierte Namen. `EXECUTE` gilt nur für `authenticated`, nicht für `public` oder `anon`.
- **Warum SECURITY DEFINER:** Eine Policy auf `family_members`, die selbst `family_members` abfragt, würde rekursiv laufen. Die Funktion liest `family_members` unter Umgehung der RLS. Das verhindert die Rekursion und ist zugleich schneller ([Supabase: RLS-Performance](https://supabase.com/docs/guides/database/postgres/row-level-security#use-security-definer-functions)).
- `auth.uid()` steht in `(select auth.uid())` und wird dadurch nur einmal pro Abfrage ausgewertet.
- **`anon`:** `REVOKE ALL` auf alle neuen Tabellen, und keine Policy für `anon`.

**Rechte je Tabelle:**

| Tabelle | SELECT | INSERT | UPDATE | DELETE |
| --- | --- | --- | --- | --- |
| `families` | Mitglied | – (nur `create_family`) | owner, parent | owner |
| `family_members` | Mitglied | – (nur RPC) | – (Rollenwechsel später per RPC) | owner entfernt andere; Nicht-owner tritt selbst aus |
| `family_settings` | Mitglied | – (nur `create_family`) | owner, parent | – (Cascade über `families`) |
| Inhaltstabellen¹ | Mitglied | owner, parent | owner, parent | owner, parent |

¹ `profiles`, `categories`, `tasks`, `rewards`, alle `*_assignments`, `completions`, `redemptions`, `champion_history`

**Realtime:** Die Inhaltstabellen und `family_settings` werden zur Publikation `supabase_realtime` hinzugefügt. RLS gilt auch für Realtime-Ereignisse ([Supabase: Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)).

**Offene Punkte:**

- Kinder haben keine Konten. Auf einem angemeldeten Familiengerät kann ein Kind technisch alles, was ein Elternteil kann. Die Trennung übernimmt die App bzw. später die Eltern-PIN. Getrennte Kindergeräte mit eigenen Rechten sind noch nicht gelöst.
- `profiles.linked_user_id` wird noch nicht darauf geprüft, ob der verknüpfte Nutzer Mitglied derselben Familie ist.
- Ein Punktestand-Check beim Einlösen findet noch nicht auf dem Server statt (heute nur im Client). Später wäre eine RPC `redeem_reward` sinnvoll.
- Einladungen (`family_invites` bzw. `accept_invite`), Übertragen der owner-Rolle und Kontolöschung (`delete_account`, Apple-Richtlinie 5.1.1(v)) folgen später.

---

## 5. Familienerstellung / `create_family`

**Bootstrapping-Problem:** Ein neuer Nutzer ist noch kein Mitglied und könnte deshalb per RLS weder eine Familie anlegen noch sich selbst eintragen.

**Lösung:** Die RPC `public.create_family(p_name text) returns uuid` ist `SECURITY DEFINER`, hat `search_path = ''` und ist nur für `authenticated` ausführbar. Sie läuft atomar:

1. `auth.uid()` muss gesetzt sein.
2. Der Name wird geprüft (1–80 Zeichen).
3. `families` wird angelegt, mit `created_by = auth.uid()`.
4. `family_members` erhält den Aufrufer mit der Rolle `owner`.
5. `family_settings` wird mit Standardwerten angelegt.

Aufruf im Client später: `supabase.rpc('create_family', { p_name: '…' })`.

**Offene Entscheidung:** Darf ein Nutzer mehrere Familien anlegen oder mehreren angehören (z. B. getrennt lebende Eltern)? Der Entwurf erlaubt das. Eine Begrenzung ließe sich in `create_family` ergänzen.

---

## 6. Kinderprofile

- `profiles` bildet die bisherigen `members` ab. Dazu gehören auch Eltern, denn heute sammeln auch Papa und Mama Punkte. `is_parent` entspricht dem bisherigen `isAdmin`: Erledigungen von Eltern brauchen keine Bestätigung.
- Kinder sind **keine** `auth.users`.
- `avatar_emoji` ersetzt das bisherige `emoji`. `avatar_url` ersetzt das bisherige Base64-`photo`; die Bilder sollen künftig in Supabase Storage liegen. `color` entspricht dem bisherigen Wert.
- `sort_order` und `active` ermöglichen Sortierung und Ausblenden statt Löschen.
- Es gibt keine Standardnamen. Die öffentliche App startet ohne Profile.

---

## 7. Aufgaben und Kategorien

- `categories` entspricht `customCategories` bzw. `DEFAULT_CATEGORIES`. `category_assignments` bildet `assignedTo` ab.
- `tasks`:
  - `title` (bisher `name`), `icon` (bisher `emoji`), `image_url` (bisher `photo`), `points`.
  - `recurrence` (bisher `recurring`: daily/weekly/once).
  - `category_id` statt Kategorie-Name.
  - neu hinzugekommen: `active` und `sort_order`.
- `task_assignments` bildet `task.assignedTo` ab.

**Hinweis zur bisherigen Logik:** Die App sperrt unabhängig von `recurring` jede Aufgabe einmal pro Profil und Tag. „weekly“ und „once“ werden heute nur angezeigt, aber nicht erzwungen. Das Schema übernimmt genau diese Tagessperre. Eine echte Wochen- bzw. Einmal-Logik wäre eine spätere fachliche Entscheidung.

---

## 8. Belohnungen

- `rewards`: `title` (bisher `name`), `icon` (bisher `emoji`), `points_required` (bisher `pointsCost`), `active`, `sort_order`.
- `reward_assignments` bildet `assignedTo` ab.
- `redemptions` bildet `redeemedRewards` ab. Das Zurücknehmen einer Einlösung wird wie bisher als Löschen umgesetzt.

---

## 9. Completions und Bestätigungen

**Bisher:** `needsConfirm` und `confirmed` im JSON.

- Ein Kind erledigt eine Aufgabe, und `needsConfirmation` ist aktiv: `needsConfirm: true, confirmed: false`. Das zählt nicht als Punkte.
- Ein Elternteil erledigt eine Aufgabe, oder `needsConfirmation` ist aus: `confirmed: true`.
- Eltern bestätigen mit `confirmed: true`. Ablehnen, Rückgängig und Zurücknehmen **löschen** den Eintrag.

**Neu:** `completions.status`

| Wert | Bedeutung |
| --- | --- |
| `pending` | wartet auf Bestätigung |
| `confirmed` | zählt als Punkte; `confirmed_at` und `confirmed_by` sind optional |
| `rejected` | vorgesehen, falls Ablehnungen künftig nachvollziehbar bleiben sollen, statt sie zu löschen. Wird von der Tagessperre ausgenommen, damit die Aufgabe erneut erledigt werden kann. |

**`completion_date`:** der Kalendertag der Familie (`family_settings.timezone`, Standard `Europe/Berlin`), getrennt von `completed_at` (Zeitstempel).

**Befund in der bestehenden App (nicht verändert):** `isoDate()` nutzt `toISOString()`, also UTC. In Deutschland gilt dadurch zwischen 0:00 und 1:00 bzw. 2:00 Uhr Ortszeit noch der Vortag als „heute“. Außerdem wird der Montag, den `weekStart()` in Ortszeit berechnet, als **Sonntag** gespeichert. Diese Werte landen in `lastChampionWeek` und `championHistory[].week`. Das betrifft die Migration (Abschnitt 14) und sollte in Phase 3 korrigiert werden.

---

## 10. Champion-Historie

- `champion_history` enthält `profile_id` (bei gelöschtem Profil `NULL`), die Snapshots `profile_name` und `profile_avatar`, `week_start` (Montag), `points` und `created_at`.
- Pro Familie und Woche gibt es genau einen Eintrag, `unique(family_id, week_start)`. Das entspricht dem bisherigen `alreadySaved`-Check.
- Der bisherige `lastChampionWeek`-Marker wandert nach `family_settings.last_champion_week`. Er wird auch in Wochen ohne Champion fortgeschrieben und lässt sich deshalb nicht aus der Historie ableiten.
- Die Champion-Auswertung läuft heute im Client beim ersten Start einer neuen Woche. Später wäre das serverseitig robuster (Cron bzw. Edge Function). Das ist hier nicht umgesetzt.

---

## 11. `family_settings`

| Spalte | Typ | Standard | Herkunft |
| --- | --- | --- | --- |
| `show_daily_crown` | boolean NOT NULL | `true` | **neu**; blendet die Tageskrone 👑 ein oder aus. Heute wird sie immer angezeigt, deshalb ist der Standard `true`. |
| `require_confirmation` | boolean NOT NULL | `true` | bisher `needsConfirmation` |
| `last_champion_week` | date (Montag) | `NULL` | bisher `lastChampionWeek` |
| `parent_pin_hash` | text | `NULL` | Platzhalter für die spätere PIN-Umstellung, **nur als Hash**, nie im Klartext |
| `timezone` | text NOT NULL | `Europe/Berlin` | neu, für den Kalendertag und den Wochenbeginn |

**Bewusst nicht enthalten:** ein Feld `premium boolean` (siehe Abschnitt 13).

---

## 12. Starter-Inhalte

- **Datei:** `src/config/starterContent.js`. Sie ist noch nicht in die UI eingebunden.
- **Kategorien:** Haushalt, Schule, Alltag.
- **Aufgaben (14):**
  - Haushalt: Zimmer aufräumen, Tisch decken, Tisch abräumen, Spülmaschine ausräumen, Müll rausbringen, Staubsaugen, Pflanzen gießen.
  - Schule: Hausaufgaben erledigen, Schulranzen packen, Lesen.
  - Alltag: Kleidung wegräumen, Zähne putzen, Schuhe wegräumen, Haustier versorgen.
- **Belohnungen (8):** Film aussuchen, Lieblingsessen aussuchen, gemeinsames Spiel aussuchen, zusätzliche Medienzeit, Ausschlafen, Ausflugsziel aussuchen, Eis essen gehen, gemeinsam backen.
- `suggestedPoints` sind ausdrücklich **unverbindliche Vorschläge**.
- Die Datei enthält keine persönlichen Namen. Die bisherigen `DEFAULT_MEMBERS` in `App.jsx` sind **unverändert**, weil die produktive App sie heute noch nutzt. Sie müssen spätestens mit dem Onboarding entfernt werden.

---

## 13. FREE / TRIAL / PREMIUM – Architekturkonzept (nicht implementiert)

**Zustände**

| Zustand | Bedeutung |
| --- | --- |
| `FREE` | Grundfunktionen mit Limits |
| `TRIAL` | Premium-Funktionen für eine Testzeit (diskutiert: ca. 14 Tage, nicht final) |
| `PREMIUM` | vollständige Freischaltung (diskutiert: ca. 2,99 €/Monat, nicht final) |

**Zentrale Definition, später z. B. in `src/config/plans.js`.** Sie ist bewusst **noch nicht angelegt**:

```
FREE:    { maxChildren, maxTasks, maxRewards, customCategories, advancedStatistics, … }  // Werte offen
TRIAL:   Premium-Funktionen, zeitlich begrenzt
PREMIUM: alle Funktionen
```

Die App fragt Funktionen nur über eine zentrale Funktion ab (z. B. `can(feature)` bzw. `limit(feature)`) und nie über verstreute `if (premium)`-Abfragen.

**Kaufquelle und Vertrauenskette**

1. Der Kauf erfolgt über Apple StoreKit bzw. In-App-Kauf ([StoreKit](https://developer.apple.com/storekit/)), direkt oder über eine Abstraktion wie RevenueCat.
2. Der Kaufnachweis wird **serverseitig** geprüft: App Store Server Notifications V2 ([Apple](https://developer.apple.com/documentation/appstoreservernotifications)) oder ein Webhook des Abo-Anbieters landet in einer Supabase Edge Function. Nur diese nutzt den `service_role`-Key, und zwar ausschließlich auf dem Server.
3. Die Edge Function schreibt in eine eigene Tabelle, z. B. `entitlements` (`family_id` bzw. `user_id`, `product_id`, `status`, `source`, `original_transaction_id`, `expires_at`, `updated_at`).
4. Der Client darf `entitlements` **nur lesen**. Es gibt keine INSERT- oder UPDATE-Policy für `authenticated`.
5. Ein selbst gesetztes Boolean in Supabase ist **nie** ein Kaufnachweis.

**Offene Entscheidungen:**

- Gilt das Abo pro Familie oder pro Elternkonto? Apple-Abos hängen an der Apple-ID. „Familienfreigabe“ ist optional.
- Trial über Apples Einführungsangebot oder über einen eigenen Server-Trial?
- Konkrete Limits und Preise.
- Umgang mit Web-Nutzern (Vercel): Apple-Richtlinie 3.1.1 bzw. 3.1.3 beachten.

---

## 14. Migration von `family-main` (Plan, nicht ausgeführt)

**Voraussetzungen, alle zwingend:**

1. Es gibt ein geprüftes Backup von `family-main` (JSON).
2. Es gibt ein separates Supabase-Testprojekt.
3. Die Migration war dort erfolgreich und wurde mit der App geprüft.

**Ablauf:**

1. Die Eltern registrieren sich mit Supabase Auth.
2. `create_family` legt die Familie an.
3. Ein Skript oder eine SQL-Funktion überträgt die Daten.
4. Die Punktestände werden verglichen.
5. `app_state` bleibt unverändert als Rückfallebene erhalten.

Alte IDs wie `m1`, `t3` oder zufällige Strings werden auf neue UUIDs abgebildet. Die Zuordnungstabelle alt → neu wird während der Migration im Skript geführt.

| Bisher (`app_state.data.…`) | Künftig | Transformation | Risiken |
| --- | --- | --- | --- |
| `members[]` | `profiles` | `name`; `emoji` → `avatar_emoji`; `color`; `isAdmin` → `is_parent`; Array-Index → `sort_order`; `photo` (Base64) → Upload in Storage → `avatar_url` | Fotos bei einem fehlgeschlagenen Upload verloren → vorher lokal sichern; Farbe nicht im Format `#RRGGBB` → Standardfarbe |
| `customCategories` (oder `null` → `DEFAULT_CATEGORIES`) | `categories`, `category_assignments` | `name`; `emoji` → `icon`; `assignedTo` (Mitglieds-IDs) → Profil-UUIDs | doppelte Namen (Unique-Index) → zusammenführen; unbekannte Mitglieds-IDs → verwerfen und protokollieren |
| `tasks[]` | `tasks`, `task_assignments` | `name` → `title`; `emoji` → `icon`; `photo` → Storage → `image_url`; `recurring` → `recurrence`; `category` (Name) → `category_id` über den Namen; `assignedTo` → Assignments | Kategorie-Name ohne passende Kategorie → Kategorie anlegen oder `NULL`; negative Punkte → CHECK schlägt fehl → auf 0 setzen und protokollieren |
| `completions[]` | `completions` | `memberId` → `profile_id`; `taskId` → `task_id` (unbekannt → `NULL`); `taskName` → `task_title`; `category` → `category_name`; `points`; `date` → `completed_at`; `completion_date` = `date` in `Europe/Berlin`; `needsConfirm && !confirmed` → `pending`, sonst `confirmed`. `memberName` und `memberEmoji` entfallen. | **Tagessperre:** Altdaten können mehrere Erledigungen derselben Aufgabe am selben Tag enthalten (UTC- bzw. Ortszeit-Verschiebung, ältere Versionen) → den zweiten Eintrag mit `task_id = NULL` übernehmen (fällt nicht unter den Unique-Index), **keine Punkte verwerfen**; `memberId` unbekannt → nicht übernehmbar, protokollieren und Punktesumme vergleichen |
| `rewards[]` | `rewards`, `reward_assignments` | `name` → `title`; `emoji` → `icon`; `pointsCost` → `points_required`; `assignedTo` → Assignments | gering |
| `redeemedRewards[]` | `redemptions` | `memberId` → `profile_id`; `rewardId` → `reward_id` (unbekannt → `NULL`); `rewardName` → `reward_title`; `pointsCost` → `points_spent`; `date` → `redeemed_at` | unbekanntes Mitglied → verfügbarer Punktestand ändert sich → vorher und nachher vergleichen |
| `notifications[]` | keine eigene Tabelle → `redemptions.acknowledged_at` | Es gibt nur den Typ `reward` (erzeugt beim Einlösen, mit `read`-Flag). Zuordnung zur Einlösung über `memberId` und den Zeitpunkt (gleiche Sekunde): `read = true` → `acknowledged_at` = Migrationszeitpunkt, `read = false` → `NULL`. Einlösungen ohne passende Benachrichtigung gelten als bestätigt. | Ungelesene Benachrichtigungen ohne passende Einlösung gehen verloren, weil sie rein informativ sind → protokollieren |
| `adminPin` | `family_settings.parent_pin_hash` | **Kein** Klartext übernehmen. Das Feld bleibt `NULL`, bis die PIN-Umstellung erfolgt ist; danach wird die PIN neu vergeben. | Eltern-Bereich bis dahin nur über das Elternkonto geschützt |
| `championHistory[]` | `champion_history` | `memberId` → `profile_id`; `name` → `profile_name`; `emoji` → `profile_avatar`; `pts` → `points`; `week` → `week_start` **auf den Montag normalisiert** (Sonntag + 1 Tag, siehe Abschnitt 9) | doppelte Wochen → nur den ersten Eintrag übernehmen; eine Woche ohne Normalisierung verletzt den CHECK |
| `needsConfirmation` | `family_settings.require_confirmation` | direkt | – |
| `lastChampionWeek` | `family_settings.last_champion_week` | auf den Montag normalisieren | falsche Normalisierung → Champion-Zeremonie doppelt oder gar nicht |
| (neu) | `family_settings.show_daily_crown` | `true` (heutiges Verhalten) | – |

**Kontrolle nach der Migration:** Anzahl je Tabelle sowie Gesamt-, Wochen- und verfügbare Punkte je Profil (Erledigungen minus Einlösungen) müssen mit den Werten der alten App übereinstimmen.

---

## 15. Voraussetzungen für Phase 3

1. Das **Backup von `family-main` liegt vor** und ist geprüft. Stand heute: **nicht vorhanden**.
2. Es gibt ein **separates Supabase-Testprojekt**. Stand heute: **nicht vorhanden bzw. unbekannt**.
3. Der Entwurf wurde im Testprojekt ausgeführt (mit `set app.migration_target = 'test';`).
4. Claude Code bekommt Zugangsdaten **ausschließlich für das Testprojekt**, z. B. als Umgebungsvariablen der Cloud-Umgebung oder in einer lokalen `.env.local`, die nie committet wird:
   - `VITE_SUPABASE_URL` (Testprojekt)
   - `VITE_SUPABASE_ANON_KEY` bzw. den Publishable Key (Testprojekt)
   - für das Anwenden von Migrationen **eines** der beiden: Datenbank-Verbindungs-URL des Testprojekts (`SUPABASE_DB_URL`) oder `SUPABASE_ACCESS_TOKEN` plus Projekt-Referenz für die Supabase CLI
   - **niemals** Zugangsdaten des Produktivprojekts
   - `service_role` nur, falls ein Migrationsskript es serverseitig braucht, und niemals im Client
5. Entscheidungen: Anmeldeart, eine oder mehrere Familien pro Nutzer, Umgang mit Kindergeräten.
6. Auth-Einstellungen im Testprojekt: E-Mail-Bestätigung sowie die Weiterleitungs-URLs für Vercel-Preview und später die App.
