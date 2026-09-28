# Produktionsmigration – Plan (NICHT ausgeführt)

Stand: Phase 5A (28.09.2026). Dieses Dokument beschreibt die spätere, sichere Umstellung der
LEGACY-Familie (`public.app_state`, `id = family-main`) auf das FAMILY-Modell. **Nichts davon ist
ausgeführt.** Die Produktion läuft unverändert als LEGACY.

Voraussetzung ist der erfolgreiche Migrationstest (siehe `PHASE_05A_LEGACY_MIGRATION_TEST.md`):
alle Punkte-Diffs 0, alle Counts erklärt, Champion-Sync ohne falsche Zeremonie.

## 1. Finales frisches Backup

* Kurz vor der Umstellung READ-ONLY `select id, data, updated_at from public.app_state where id = 'family-main';` ausführen und unter `local-backups/family-main-<timestamp>.json` speichern (ignoriert).
* Zusätzlich einen Supabase-Datenbank-Export (Dashboard-Backup oder PITR-Zeitpunkt notieren).
* SHA-256 und `updated_at` notieren. Das Backup wird nicht verändert und nicht committet.
* Dry-Run mit diesem Backup: `node scripts/migrate-legacy-family.mjs --dry-run --backup <datei>`. Keine Validierungsfehler; neue Hinweise bewerten.

## 2. Wartungs-/Umstellungszeitpunkt

* Zeitfenster **Montag**, nachdem LEGACY die Vorwoche ausgewertet hat. Idealerweise hat die App in dieser Woche schon einmal geöffnet (Marker = aktuelle Woche). So ist `last_champion_week = Marker − 7` eindeutig und es gibt keine offene Champion-Woche.
* Die Familie vorab informieren: Während des Fensters (ca. 30 min) nichts eintragen.
* LEGACY-Schreibzugriffe einfrieren, z. B. mit einem Wartungshinweis im LEGACY-Deployment oder durch das Entziehen der anon-Schreibrechte auf `app_state` für die Dauer des Fensters. Die genaue Variante wird vorher festgelegt.
* Das finale Backup (Schritt 1) wird **nach** dem Einfrieren gezogen.

## 3. FAMILY-Schema in Produktion anwenden

* Die Migrationen `supabase/migrations/20260927120000…` bis `20260928300000…` der Reihe nach anwenden. Vorher `app.migration_target` bewusst auf den Produktionswert anpassen; die Schutzabfrage verlangt heute `test`, sie wird für die Produktion gezielt geändert und reviewt.
* `public.app_state` bleibt unangetastet: kein DROP, keine Änderung an RLS oder Realtime von `app_state`.
* Nach dem Anwenden:
  * Security Advisor prüfen.
  * RLS-Matrix-Test (`supabase/tests/rls_matrix_test.sql`) in einer Transaktion mit ROLLBACK ausführen.
  * Realtime-Publikation von `family_sync` prüfen.
* Für die Einlösungen ist ein **temporärer** Importweg nötig. Möglich ist entweder eine Variante von `legacy_import_redemptions` mit denselben Schutzregeln (owner, Zielfamilie, einmalig), die direkt nach dem Import wieder mit DROP entfernt wird, oder ein einmaliger privilegierter SQL-Import durch den Projektinhaber. Diese Entscheidung ist vor der Umstellung zu treffen und zu reviewen.

## 4. Eltern-Auth-Konto

* Ein Elternteil registriert sich in der FAMILY-App mit einer echten E-Mail-Adresse. Die E-Mail-Bestätigung und die Redirect-URLs sind vorher eingerichtet.
* Dieses Konto wird owner der migrierten Familie. Ein zweites Elternkonto folgt später über Einladungen.
* Eine neue Eltern-PIN wählt die Familie selbst. Die alte Klartext-PIN wird **nicht** übernommen.
* Familienname: echter Name statt „Migration Test“. Das Skript bekommt dafür einen expliziten Produktionsmodus mit anderem Namen und ohne Löschen. Es löscht in Produktion **nie** eine Familie.

## 5. Migration

* Das Skript für die Produktion erweitern:
  * eigener Modus mit doppelter Bestätigung
  * Ziel-Ref explizit per Parameter
  * kein Wegwerf-owner, sondern die Anmeldung des echten Elternkontos
  * kein Delete/Recreate: Abbruch, falls für dieses Konto schon eine Familie existiert
* Ablauf wie im Test:
  1. Onboarding-RPC
  2. `is_parent`
  3. Kategorien, Aufgaben, Belohnungen und Zuordnungen
  4. Erledigungen
  5. Einlösungen (temporärer Importweg)
  6. Champion-Historie
  7. `last_champion_week`
* Die Mapping-Datei (Legacy-ID → neue UUID) lokal und ignoriert sichern.

## 6. Validierung

* `--verify` gegen eine **frisch** aus dem finalen Backup berechnete Referenz (`--reference`).
* Count-Abgleich aller Tabellen. Erklärte Abweichungen wie im Test: ergänzte Kategorien und zusammengeführte Champion-Wochen.
* `--sync-test`: `sync_weekly_champion` erzeugt keine vorhandene Woche neu; ein zweiter Aufruf ist wirkungslos.
* Den temporären Einlöse-Importweg entfernen und die Entfernung prüfen.

## 7. Punkteabgleich

* Je Profil (anonym): heute, Woche, Monat, gesamt, eingelöst, verfügbar, bestätigte und offene Erledigungen, Champion-Anzahl. **Alle Diffs 0.**
* Zeitreihe über alle historischen Wochen ohne Abweichung.
* Serverseitige Summe (bestätigte Punkte − Einlösungen, Grundlage von `redeem_reward`) = verfügbare Punkte.
* Bei einer Abweichung ungleich 0: **kein Go-Live**, sondern Ursache analysieren oder Rückfall (Schritt 10).

## 8. Vercel-Konfiguration

* Production-Umgebungsvariablen:
  * `VITE_BACKEND_MODE=family`
  * `VITE_FAMILY_SUPABASE_URL=https://gkkzjmszcjivtaygbmfw.supabase.co`
  * `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY=<Publishable Key Produktion>`
* Kein Secret- oder `service_role`-Key.
* Merge von `feature/appstore-v1` nach `main` erst nach Review. Das Production-Deployment wird bewusst ausgelöst; das LEGACY-Deployment bleibt als Rollback-Ziel in Vercel erhalten.

## 9. Smoke Test

Auf dem Handy der Familie (iPhone) und am Desktop:

* Anmeldung, alle Profile sichtbar, verfügbare Punkte je Profil stimmen mit dem Abgleich überein
* Aufgabe erledigen, Punkte steigen
* Elternbereich mit PIN
* Belohnung einlösen, Hinweis quittieren
* Champion-Historie sichtbar, keine neue Zeremonie
* zweites Gerät synchronisiert (Realtime)
* Offline- und Reconnect-Hinweis

## 10. Rückfallplan

* Bis zum Ende des Smoke Tests bleibt `family-main` unverändert und ist die maßgebliche Quelle.
* Rückfall: das vorherige LEGACY-Deployment in Vercel wieder zu Production machen (Instant Rollback) und die Schreibsperre von Schritt 2 aufheben. LEGACY arbeitet mit dem unveränderten `app_state` weiter.
* Die FAMILY-Daten der gescheiterten Migration bleiben zur Analyse stehen und werden erst nach einer Entscheidung gelöscht.
* Nach dem erfolgreichen Go-Live bleibt `app_state` mindestens 30 Tage **read-only** erhalten, bevor über das Archivieren entschieden wird.
* Offene Punkte vor der Produktion: Bilder (Supabase Storage), Passwort-Reset-Redirects, Kontolöschung, Eltern-Einladungen und die Entscheidung zum Einlöse-Importweg.
