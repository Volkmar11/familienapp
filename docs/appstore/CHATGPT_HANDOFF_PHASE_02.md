# CHATGPT HANDOFF – PHASE 2

## 1. Ergebnis

- Phase erfolgreich: JA
- Branch: `feature/appstore-v1` (lokal, nicht gepusht)
- Commit: `4cc6134` „feat: prepare family architecture and safe data loading“. Diese Übergabedatei folgt in einem eigenen Commit direkt danach. Vorheriger Stand: `005f351` (Phase 1).
- Arbeitsbaum sauber: JA
- Web-Build erfolgreich: JA (Vite 6.4.2, JS-Bundle 413 KB, gzip 114 KB, keine Warnungen)

## 2. Datenverlust-Fix

- Ursache vorher: `load()` lieferte bei jedem Fehler `null`, und auch „keine Zeile“ galt über `.single()` als Fehler. Die App setzte dann `DEFAULT_DATA`, und der Wochen-Champion-Effekt rief sofort `save()` auf. Das Upsert konnte so `family-main` überschreiben. `save()` ignorierte außerdem Supabase-Fehler.
- Durchgeführte Änderung:
  - `load()` liefert jetzt `loaded`, `empty` oder `error` (per `.maybeSingle()`).
  - Neuer UI-Zustand `loadState` mit `loading`, `loaded` und `error`.
  - Speichersperre `persist.ready`, die nur nach `loaded` oder `empty` auf `true` steht.
  - `save()` prüft den `error` des Upserts, protokolliert ihn und zeigt einen Toast. Realtime-Ereignisse werden vor dem erfolgreichen Laden ignoriert.
- Verhalten bei erfolgreichem Load: wie bisher; die Daten werden angezeigt, Speichern ist erlaubt.
- Verhalten bei leerer Datenbank: Start mit `DEFAULT_DATA`, danach wird wie bisher gespeichert.
- Verhalten bei Ladefehler: Fehlerbildschirm „Daten konnten nicht geladen werden“ mit dem Button „Erneut versuchen“. Es werden keine Standarddaten gesetzt, und es gibt kein Upsert. Der Fehler wird per `console.error` protokolliert.
- Automatisches Überschreiben nach Ladefehler verhindert: JA. Getestet in Chromium mit simulierter Supabase-API: HTTP 500 und Netzwerkabbruch führten zu 0 Schreibzugriffen; nach „Erneut versuchen“ mit Erfolg wurde die App normal angezeigt.
- Betroffene Dateien: `src/App.jsx` (+48/−6 Zeilen; übrige UI, Logik, PIN und Krone unverändert)

## 3. Neue Datenbankarchitektur

- `families`: Mandant; eine Zeile pro Familie.
- `family_members`: ordnet Elternkonten (`auth.users`) einer Familie mit der Rolle `owner` oder `parent` zu.
- `family_settings`: eine Zeile pro Familie mit familienweiten Schaltern.
- `profiles`: Spielerprofile (Kinder und Eltern als Mitspielende), keine Auth-Benutzer.
- `categories`: Aufgabenkategorien pro Familie; Name pro Familie eindeutig.
- `category_assignments`: begrenzt die Sichtbarkeit einer Kategorie auf bestimmte Profile.
- `tasks`: Aufgaben mit Punkten, Wiederholung (daily/weekly/once), Kategorie, Icon bzw. Bild, aktiv und Sortierung.
- `task_assignments`: begrenzt die Sichtbarkeit einer Aufgabe auf bestimmte Profile.
- `rewards`: Belohnungen mit Punktkosten.
- `reward_assignments`: begrenzt die Sichtbarkeit einer Belohnung auf bestimmte Profile.
- `completions`: jede Erledigung als eigene Zeile mit Status `pending`, `confirmed` oder `rejected` und Snapshots.
- `redemptions`: eingelöste Belohnungen; `acknowledged_at` ersetzt die bisherigen Eltern-Benachrichtigungen.
- `champion_history`: Wochen-Champion je Familie und Woche (Montag).

## 4. Familien- und Benutzerkonzept

- Eltern: Supabase-Auth-Benutzer, über `family_members` einer Familie zugeordnet.
- Kinder: nur Einträge in `profiles`, keine Konten. Sie nutzen ein angemeldetes Familiengerät.
- `family_members`: `(family_id, user_id)` eindeutig; kein direktes INSERT oder UPDATE durch Clients, sondern nur über RPCs.
- Rollen: `owner` (Familie löschen, andere entfernen) und `parent` (alles verwalten, kann selbst austreten).
- Familienerstellung: RPC `public.create_family(p_name)`; legt atomar die Familie, die owner-Mitgliedschaft und `family_settings` an.
- Mehrgerätefähigkeit: Alle Eltern-Geräte melden sich mit ihrem Konto an. Realtime ist auf den neuen Tabellen vorbereitet und durch RLS gefiltert. Einladungen für weitere Eltern (`family_invites` bzw. `accept_invite`) kommen erst später.

## 5. RLS-Konzept

- Grundprinzip: `auth.uid()` → `family_members` → `family_id`. Zugriff nur auf Zeilen der eigenen Familie(n). `anon` hat keinen Zugriff (`REVOKE ALL`, keine Policies).
- Helper-Funktionen:
  - `private.is_family_member(uuid)` und `private.has_family_role(uuid, text[])`.
  - Beide sind `SECURITY DEFINER`, `STABLE`, haben `set search_path = ''` und liegen im nicht öffentlich erreichbaren Schema `private`.
  - `EXECUTE` gilt nur für `authenticated`.
- Besondere Sicherheitsaspekte:
  - Die Helper-Funktionen verhindern rekursive Policies auf `family_members`.
  - Zusammengesetzte Fremdschlüssel `(family_id, id)` verhindern Verknüpfungen über Familiengrenzen.
  - `create_family` prüft die Anmeldung.
  - Kein `service_role` nötig.
  - Lokal in PostgreSQL 16 mit nachgebildeten Supabase-Rollen getestet: Familientrennung, Schreibversuche in fremde Familien, Selbst-Einschreiben, Cross-Family-FK, anon und owner-Austritt verhalten sich korrekt.
- Bekannte offene Punkte:
  - Auf einem Familiengerät hat ein Kind technisch Elternrechte; die Trennung übernimmt die App bzw. später die PIN.
  - Punktestand-Check beim Einlösen noch nicht serverseitig (später RPC `redeem_reward`).
  - `profiles.linked_user_id` wird nicht auf Familienzugehörigkeit geprüft.
  - Einladungen, owner-Übertragung und `delete_account` fehlen noch.

## 6. Family Settings

- `show_daily_crown` vorgesehen: JA, `boolean NOT NULL DEFAULT true`
- Weitere vorgesehene Einstellungen:
  - `require_confirmation` (bisher `needsConfirmation`, Standard `true`)
  - `last_champion_week` (Montag)
  - `parent_pin_hash` (nur Hash, noch ungenutzt)
  - `timezone` (Standard `Europe/Berlin`)
  - kein Premium-Boolean

## 7. Starter-Inhalte

- Datei: `src/config/starterContent.js` (noch nicht in die UI eingebunden)
- Aufgabenkategorien: Haushalt, Schule, Alltag (14 Aufgaben, z. B. Zimmer aufräumen, Tisch decken, Hausaufgaben, Schulranzen packen, Lesen, Kleidung wegräumen, Haustier versorgen)
- Belohnungsvorschläge: 8 (z. B. Film aussuchen, Lieblingsessen aussuchen, gemeinsames Spiel aussuchen, zusätzliche Medienzeit); `suggestedPoints` sind unverbindlich.
- Persönliche Namen enthalten: NEIN. Die bisherigen `DEFAULT_MEMBERS` in `App.jsx` sind unverändert und müssen mit dem Onboarding entfernt werden.

## 8. FREE / TRIAL / PREMIUM

- Architektur vorgesehen: JA, nur dokumentiert:
  - zentrale spätere Konfiguration `src/config/plans.js` mit einer Abfrage `can`/`limit`
  - Kauf über StoreKit/IAP oder eine Abstraktion wie RevenueCat
  - serverseitige Prüfung über App Store Server Notifications bzw. Webhook, verarbeitet in einer Supabase Edge Function
  - eigene Tabelle `entitlements`, die der Client nur lesen darf
  - nie ein selbst gesetztes Boolean als Kaufnachweis
- Bereits implementiert: NEIN
- Konkrete Limits festgelegt: NEIN
- StoreKit bereits integriert: NEIN
- Offene Entscheidungen:
  - Abo pro Familie oder pro Elternkonto?
  - Trial über Apples Einführungsangebot oder eigener Server-Trial (diskutiert: ca. 14 Tage)?
  - Preis (diskutiert: ca. 2,99 €/Monat)
  - Limits für FREE
  - Umgang mit Web-Nutzern (Apple 3.1.1 bzw. 3.1.3)

## 9. family-main Migration

- members
  - bisher: JSON-Array `members`
  - künftig: `profiles`
  - notwendige Transformation: alte ID → UUID; `isAdmin` → `is_parent`; `emoji` → `avatar_emoji`; Base64-Foto → Storage → `avatar_url`
- customCategories
  - bisher: JSON bzw. `null` (dann Standardkategorien)
  - künftig: `categories` und `category_assignments`
  - notwendige Transformation: Name und Icon übernehmen; `assignedTo` → Profil-UUIDs; doppelte Namen zusammenführen
- tasks
  - bisher: JSON-Array
  - künftig: `tasks` und `task_assignments`
  - notwendige Transformation: Kategorie-Name → `category_id`; `recurring` → `recurrence`; Foto → Storage; negative Punkte → 0 (protokollieren)
- completions
  - bisher: JSON-Array
  - künftig: `completions`
  - notwendige Transformation: `memberId`/`taskId` → UUIDs; `needsConfirm && !confirmed` → `pending`, sonst `confirmed`; `completion_date` in `Europe/Berlin`; doppelte Einträge am selben Tag mit `task_id = NULL` übernehmen (keine Punkte verlieren)
- rewards
  - bisher: JSON-Array
  - künftig: `rewards` und `reward_assignments`
  - notwendige Transformation: `pointsCost` → `points_required`
- redeemedRewards
  - bisher: JSON-Array
  - künftig: `redemptions`
  - notwendige Transformation: IDs → UUIDs; `pointsCost` → `points_spent`
- notifications
  - bisher: JSON-Array (nur Typ „reward“)
  - künftig: keine eigene Tabelle, sondern `redemptions.acknowledged_at`
  - notwendige Transformation: `read = true` → bestätigt; Zuordnung über `memberId` und Zeitpunkt
- adminPin
  - bisher: Klartext im JSON
  - künftig: `family_settings.parent_pin_hash`
  - notwendige Transformation: nicht übernehmen; bleibt `NULL` bis zur PIN-Umstellung
- championHistory
  - bisher: JSON-Array
  - künftig: `champion_history`
  - notwendige Transformation: `week` auf den Montag normalisieren (siehe Befund unten); doppelte Wochen → nur den ersten Eintrag übernehmen
- needsConfirmation
  - bisher: JSON-Boolean
  - künftig: `family_settings.require_confirmation`
  - notwendige Transformation: direkt
- lastChampionWeek
  - bisher: JSON-Datum
  - künftig: `family_settings.last_champion_week`
  - notwendige Transformation: auf den Montag normalisieren
- Befund: `isoDate()` rechnet in UTC. In Deutschland wird der Wochenbeginn deshalb als Sonntag gespeichert (verifiziert: Montag 21.09.2026 → „2026-09-20“), und zwischen 0 und 2 Uhr gilt noch der Vortag als „heute“. In der bestehenden App nicht verändert.
- Voraussetzungen: Backup, Testprojekt, erfolgreicher Testlauf. `app_state` bleibt als Rückfallebene erhalten. Nach der Migration werden die Punkte je Profil verglichen.

## 10. SQL-Migrationsentwurf

- Dateiname: `supabase/migrations/20260927120000_family_architecture.sql`
- Ausgeführt: NEIN (nicht auf Supabase; nur lokal in einer Wegwerf-PostgreSQL-16-Instanz getestet)
- Verändert bestehende app_state: NEIN (kein DROP, TRUNCATE, DELETE, UPDATE oder INSERT auf Bestandsdaten)
- RLS enthalten: JA (13 Tabellen, 47 Policies)
- create_family/RPC enthalten: JA
- Sicherheitsrelevante Hinweise:
  - Schutzsperre: Die Datei bricht ohne vorheriges `set app.migration_target = 'test';` ab. Die Sperre muss vor einer späteren echten Übernahme bewusst entfernt werden.
  - Alles läuft in einer Transaktion.
  - Erfordert PostgreSQL ≥ 15 (`ON DELETE SET NULL (spalte)`).
  - Fügt Tabellen zur Publikation `supabase_realtime` hinzu.
  - Alle SECURITY-DEFINER-Funktionen haben `search_path = ''`.
  - Liegt im Supabase-CLI-Pfad: Ein `supabase db push` gegen das Produktivprojekt würde nur durch die Schutzsperre gestoppt. Das Repo deshalb nie mit dem Produktivprojekt verknüpfen.

## 11. Noch fehlende Voraussetzungen vor Phase 3

- Status des family-main-Backups: NICHT VORHANDEN. Muss manuell im Supabase-Dashboard erstellt werden (SQL-Editor, Abfrage `select id, data, updated_at from public.app_state where id = 'family-main';`, Export als JSON). Die Anleitung steht in `docs/appstore/PHASE_01_BASELINE.md`, Abschnitt 8.
- Separates Supabase-Testprojekt: NICHT VORHANDEN bzw. unbekannt; muss angelegt werden.
- Zugangsdaten für Claude Code, ausschließlich für das Testprojekt, als Umgebungsvariablen der Cloud-Umgebung oder in einer lokalen `.env.local`, die nie committet wird:
  - `VITE_SUPABASE_URL` (Testprojekt)
  - `VITE_SUPABASE_ANON_KEY` bzw. Publishable Key (Testprojekt)
  - für Migrationen: `SUPABASE_DB_URL` (Datenbank-Verbindung des Testprojekts) oder `SUPABASE_ACCESS_TOKEN` plus Projekt-Referenz
  - keine Produktivzugänge; `service_role` höchstens serverseitig für Skripte, nie im Client
- Die Netzwerkfreigabe der Cloud-Umgebung muss die Supabase-Domain des Testprojekts erlauben.
- Entscheidungen:
  - Anmeldeart (Empfehlung: E-Mail + Passwort)
  - eine oder mehrere Familien pro Nutzer
  - Umgang mit Kindergeräten
- Branch `feature/appstore-v1` nach GitHub pushen; sonst geht er mit der Cloud-Sitzung verloren.

## 12. Empfehlung für Phase 3

1. Backup von `family-main` erstellen und prüfen (Datei vorhanden, gültiges JSON, `id` und `data` vorhanden).
2. Supabase-Testprojekt anlegen und die Zugangsdaten nur dafür in der Claude-Code-Umgebung hinterlegen.
3. Den SQL-Entwurf im Testprojekt ausführen und die RLS-Tests dort mit zwei echten Testkonten wiederholen.
4. Supabase Auth (E-Mail + Passwort) im Frontend einbauen, zunächst nur gegen das Testprojekt bzw. Vercel-Preview.
5. Onboarding: Registrierung → `create_family` → Profile anlegen → Starter-Inhalte auswählen. Keine persönlichen Standarddaten.
6. Eine neue Datenschicht (z. B. `src/lib/familyData.js`) für die neuen Tabellen einführen; die UI in `App.jsx` möglichst unverändert lassen.
7. Die UTC-Datumslogik (`isoDate`, `today`, `weekStart`) auf Ortszeit umstellen, abgestimmt mit `completion_date` und `week_start`.
8. `show_daily_crown` in der UI an `family_settings` anbinden.
9. Ein Migrationsskript für `family-main` im Testprojekt mit einer Kopie des Backups entwickeln und die Punkte je Profil abgleichen.
10. Die produktive Umstellung erst nach erfolgreichem Test und mit einem Rückfallplan (`app_state` bleibt erhalten) durchführen.
