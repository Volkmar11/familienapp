# Produktionsmigration – Plan (NICHT ausgeführt)

- **Stand:** Phase 6A (28.09.2026). Ersetzt den Plan aus Phase 5A.
- Beschreibt die spätere, sichere Umstellung der LEGACY-Familie (`public.app_state`, `id = family-main`) auf das FAMILY-Modell im **selben** Supabase-Projekt `gkkzjmszcjivtaygbmfw`.
- **Nichts davon ist ausgeführt.** Die Produktion läuft unverändert als LEGACY.
- **Schritt-für-Schritt mit STOP/GO:** `PRODUCTION_CUTOVER_RUNBOOK.md`.

**Grundlagen:**

- Migrationstest 5A: Punkte-Diffs 0
- Fresh-DB-Rehearsal und Schema-Drift-Analyse 6A: Schema aus dem Repo reproduzierbar, einzige Drift ist die Testhilfe `legacy_import_redemptions`
- Release-Härtung 6A (`families_delete` entfernt)

**Ausgangslage Produktion** (lesend festgestellt, 6A):

- nur `public.app_state`, mit Policies für `public`: SELECT, INSERT, UPDATE
- Realtime auf `app_state`
- `pgcrypto` vorhanden; Supabase-Funktion `rls_auto_enable`
- 0 Auth-Nutzer, 0 Buckets, keine Edge Functions, kein `supabase_migrations`-Schema

---

## PRE-FLIGHT

1. **Code Freeze:**
   - `feature/appstore-v1` eingefroren, nur Blocker-Fixes
   - Release-Commit festgelegt und getaggt (z. B. `release-family-1.0.0`)
2. **Tests grün** auf dem Release-Commit:
   - Unit
   - alle Integrationssuites gegen das Testprojekt
   - Browser-, Zwei-Geräte- und Legacy-Regression
   - `node scripts/check-release-readiness.mjs --profile production` mit den Produktionswerten: 0 FAIL
3. **Frisches `family-main`-Backup** nach dem Einfrieren (Schritt 6):
   - READ-ONLY `select id, data, updated_at from public.app_state where id = 'family-main';`
   - speichern unter `local-backups/family-main-<timestamp>.json` (ignoriert, nie committen)
   - zusätzlich Supabase-Datenbank-Backup bzw. PITR-Zeitpunkt notieren
4. **Backup-Hash:** SHA-256, `updated_at` und Dateigröße notieren. Dry-Run: `node scripts/migrate-legacy-family.mjs --dry-run --backup <datei>` ohne Validierungsfehler.
5. **Punkte-Referenzexport** aus dem finalen Backup berechnen (`--reference`), lokal und ignoriert. Er enthält je Profil anonym: heute, Woche, Monat, gesamt, eingelöst, verfügbar, Champion-Anzahl.
6. **Wartungsfenster:**
   - Montag nach der Wochenauswertung, Familie vorab informiert, etwa 60 min
   - LEGACY-Schreibzugriffe einfrieren, bevorzugt per temporärem Wartungshinweis-Deployment bzw. Schreibsperre
   - Variante vorher festlegen und reviewen

## BACKEND

7. **Produktionsschema:**
   - über das **Produktions-Bootstrap** (siehe Audit 6A, Abschnitt 3): generiert aus den unveränderten Repo-Migrationen 1–9 inklusive `release_hardening`, eine Transaktion
   - eigener Guard (`app.migration_target = 'production'`, `families` existiert noch nicht, `app_state` existiert)
   - Vorher-/Nachher-Fingerabdruck von `app_state` gleich
   - Vorher: Bootstrap-Probelauf lokal und auf einem Wegwerf- bzw. Branch-Projekt mit identischem Fingerabdruck (`supabase/tests/schema_fingerprint.sql`)
   - Danach in Produktion:
     - `release_hardening_check.sql` und `rls_matrix_test.sql` (mit ROLLBACK)
     - Security Advisor
     - Fingerabdruck identisch zum Zielschema C
8. **Storage:** Der Bucket `family-media` (privat, Größen- und MIME-Grenzen) und seine Policies entstehen durch das Bootstrap (Migration 6). Prüfen: Bucket privat, Policies vorhanden.
9. **Realtime:**
   - `family_sync` und `user_membership_sync` sind in `supabase_realtime` (Bootstrap)
   - `app_state` bleibt vorerst in der Publikation (Rollback-Fähigkeit)
10. **Auth-Einstellungen** (Soll siehe Audit 6A, Abschnitt 11):
    - Confirm Email AN
    - Mindestpasswort 8
    - Leaked Password Protection AN
    - Site URL und Redirect URLs (Produktions-Domain inklusive `/?invite=*`)
    - Rate-Limits nach SMTP
11. **Edge Functions:**
    - `delete-account` und `delete-family` aus dem Release-Commit mit `verify_jwt = true`
    - Hash bzw. Version notieren
    - Probe: ohne Token 401, fremde Origin ohne CORS-Freigabe
12. **Secrets:**
    - `WC_ALLOWED_ORIGINS` = Produktions-Origin (später `capacitor://localhost`)
    - optional `WC_ALLOW_DEV_ORIGINS=0` (Code-Änderung 6B)
    - Supabase stellt `SUPABASE_*` bereit
    - **keine** Secrets in Vercel oder im Repo
13. **SMTP:**
    - Anbieter nach Nutzerentscheidung
    - Absenderdomain mit SPF, DKIM und DMARC
    - deutsche Templates aus `AUTH_MAIL_TEMPLATES.md`
    - Testmail „Bestätigung“ und „Reset“ an eine eigene Adresse

## MIGRATION

14. **Owner-Auth-Konto:**
    - Ein Elternteil registriert sich in der FAMILY-App (Preview, die auf Produktion zeigt, **oder** lokaler Build) mit echter E-Mail und bestätigt sie.
    - Neue Eltern-PIN; die alte Klartext-PIN wird nicht übernommen.
    - Zweites Elternkonto erst **nach** der Abnahme per Einladung.
15. **Datenimport:**
    - `scripts/migrate-legacy-family.mjs` bekommt in 6B einen eigenen **Produktionsmodus**:
      - explizite Ziel-Ref, doppelte Bestätigung
      - Anmeldung des echten owner-Kontos, **kein Delete/Recreate**
      - Abbruch, falls für das Konto schon eine Familie existiert
    - Reihenfolge wie im Test:
      1. Onboarding-RPC
      2. `is_parent`
      3. Kategorien, Aufgaben, Belohnungen und Zuordnungen
      4. Erledigungen
      5. Einlösungen (Schritt 17)
      6. Champion-Historie
      7. `last_champion_week`
    - Mapping-Datei lokal und ignoriert.
16. **Medienimport:** Profil- und Aufgabenbilder aus dem Backup (Base64) werden clientseitig zu JPEG, **ohne Metadaten**, verarbeitet und in den privaten Bucket geladen. Pfade werden gesetzt, Anzahl geprüft.
17. **Historische Einlösungen:**
    - über die **temporäre** Funktion `legacy_import_redemptions`, Produktionsvariante: feste `family_id`, Ablaufzeit, owner, einmalig
    - im Fenster anlegen → Import → **sofort `drop function`**
    - Nachweis per Fingerabdruck
    - Anzahl und `points_spent`-Summe gleich Backup
18. **Champions:**
    - `champion_history` importiert, `last_champion_week` gesetzt
    - `--sync-test`: kein Neuanlegen vorhandener Wochen, zweiter Aufruf wirkungslos, keine falsche Zeremonie
19. **Punktediff = 0:**
    - `--verify` gegen die Referenz (Schritt 5)
    - je Profil alle Kennzahlen, Zeitreihe aller Wochen
    - serverseitige Summe (bestätigt minus eingelöst) gleich verfügbar
    - Die FAMILY-App lädt die vollständige Historie (Paginierung seit 6A).
    - **Jede Abweichung ≠ 0 → kein Cutover.**

## CUTOVER

20. **Vercel FAMILY Production Env** (Werte vom Nutzer):
    - `VITE_BACKEND_MODE=family`
    - `VITE_FAMILY_SUPABASE_URL`, `VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY` (Produktion)
    - `VITE_AUTH_REDIRECT_URL`, `VITE_INVITE_BASE_URL`
    - `VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`, `VITE_SUPPORT_URL`
    - **`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` aus Production entfernen.** Der Guard in `backend.js` verweigert FAMILY, solange beide auf dasselbe Projekt zeigen.
    - Kein Secret-Key.
21. **Deploy:**
    - Merge `feature/appstore-v1` → `main` erst nach Review und Freigabe
    - bewusst ausgelöstes Production-Deployment
    - das letzte LEGACY-Deployment bleibt in Vercel als Rollback-Ziel markiert (Werte sind eingebacken)
22. **Smoke Test** (iPhone und Desktop), siehe Runbook:
    - Anmeldung, Profile und Punkte gleich Abgleich
    - Aufgabe erledigen
    - Elternbereich mit PIN
    - Einlösen und quittieren
    - Champion-Historie, keine neue Zeremonie
    - zweites Gerät (Realtime)
    - Offline-Hinweis
    - Bilder sichtbar
    - Passwort-Reset-Mail kommt an
    - Datenschutz- und Impressum-Links

**Nach erfolgreicher Abnahme:**

- `app_state` für anon **sperren**: Policies INSERT und UPDATE entziehen, SELECT nur noch für Owner bzw. Admin oder ganz entziehen.
- Tabelle mindestens 30 Tage unverändert als Archiv behalten.

## ROLLBACK

23. **Sofortige Rückschaltung auf LEGACY:**
    - Vercel Instant Rollback auf das markierte LEGACY-Deployment
    - Schreibsperre aus Schritt 6 aufheben
    - LEGACY arbeitet mit dem unveränderten `app_state` weiter
24. **`family-main` bleibt** bis zur erfolgreichen Abnahme unangetastet und ist die maßgebliche Quelle. Das Bootstrap und der Import verändern `app_state` nicht (Fingerabdruck-Nachweis).
25. **Kein vorschnelles Löschen:**
    - FAMILY-Daten eines gescheiterten Versuchs bleiben zur Analyse stehen.
    - Löschen nur nach Entscheidung, und dann über `delete-family` (Medien!).
    - `app_state` frühestens nach 30 Tagen archivieren, nie ohne Backup.
