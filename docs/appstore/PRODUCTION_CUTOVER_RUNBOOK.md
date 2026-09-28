# Production Cutover Runbook – Wochen Champion (LEGACY → FAMILY)

- Diese Checkliste arbeitet Claude Code **Schritt für Schritt** ab.
- Jeder **STOP** ist ein harter Haltepunkt:
  - Weiter nur, wenn die GO-Bedingung erfüllt **und** (wo verlangt) die **ausdrückliche menschliche Freigabe** im Chat erteilt ist, etwa „GO STOP 3“.
  - Ohne diese Freigabe endet der Lauf dort.
- Hintergrund und Begründungen: `PRODUCTION_MIGRATION_PLAN.md`, Audit `PHASE_06A_PRODUCTION_IOS_AUDIT.md`.

**Grundregeln:**

- Kein Force-Push, kein `reset --hard`, keine Secrets in Logs oder Chat.
- Keine personenbezogenen Daten ausgeben (nur Anzahlen, Hashes, anonymisierte Profile „Profil 1…“).
- `app_state` wird bis nach der Abnahme **nicht** verändert.
- Jede Produktionsänderung erfolgt nur im jeweils freigegebenen Schritt.

**Vorher festzuhalten (Werte vom Nutzer, nicht im Repo):**

- Produktions-Domain
- SMTP-Anbieter
- Rechtslinks
- owner-E-Mail
- Wartungsfenster

---

## Phase 1 – Vorbereitung (ohne Produktionsänderung)

1. Release-Commit bestimmen und taggen. `git status` sauber, Branch aktuell.
2. Tests auf dem Release-Commit:
   - Unit
   - Integrationssuites (Testprojekt)
   - Browser, zwei Geräte
   - Legacy-Regression
3. Release-Check:
   ```
   node scripts/check-release-readiness.mjs --profile production
   ```
   mit den Produktionswerten.

> **STOP 1 – Tests und Release-Check**
> GO nur wenn: alle Suites grün **und** der Release-Check 0 FAIL meldet. Ergebnis tabellarisch berichten.
> Menschliche Freigabe: **ja**.

4. Produktions-Bootstrap generieren (Generator aus 6B) und SHA-256 notieren.
5. Probelauf auf einer frischen lokalen DB und einem Wegwerf- bzw. Branch-Projekt:
   - Fingerabdruck (`supabase/tests/schema_fingerprint.sql`) identisch zu den Einzelmigrationen
   - `app_state`-Attrappe unverändert
   - alle SQL-Prüfungen grün

> **STOP 2 – Bootstrap geprüft?**
> GO nur wenn: Fingerabdruck identisch, alle SQL-Prüfungen grün, `app_state`-Fingerabdruck vorher gleich nachher.
> Menschliche Freigabe: **ja**.

## Phase 2 – Wartungsfenster und Backup

6. Familie informieren; LEGACY-Schreibzugriffe einfrieren (vereinbarte Variante).
7. Finales Backup `family-main` (READ-ONLY-SELECT) nach `local-backups/`:
   - SHA-256, `updated_at`, Bytes notieren
   - PITR-Zeitpunkt bzw. Datenbank-Backup notieren
8. Dry-Run mit dem Backup; Referenzexport (`--reference`) erzeugen.

> **STOP 3 – Backup geprüft?**
> GO nur wenn: Backup-Hash notiert, Dry-Run ohne Fehler, Referenz erzeugt, Schreibsperre aktiv (Probe: Schreibversuch schlägt fehl bzw. Wartungsseite aktiv).
> Menschliche Freigabe: **ja**.

## Phase 3 – Produktionsbackend

9. Bootstrap in Produktion ausführen (eine Transaktion). Danach:
   - `release_hardening_check.sql`
   - `rls_matrix_test.sql` (ROLLBACK)
   - Security Advisor
   - Fingerabdruck gleich Zielschema C
   - `app_state` unverändert
10. Auth-Einstellungen setzen:
    - Confirm Email AN
    - Passwort mindestens 8
    - Leaked Password Protection AN
    - Site URL und Redirect URLs
11. SMTP und Templates eintragen (Nutzer bzw. Dashboard). Testmails „Bestätigung“ und „Reset“ kommen an.
12. Edge Functions deployen (`verify_jwt=true`) und `WC_ALLOWED_ORIGINS` setzen. Probe: ohne Token 401, fremde Origin ohne CORS.

> **STOP 4 – Backend bereit?**
> GO nur wenn: alle Prüfungen aus 9–12 grün, keine Advisor-Fehler (Warnungen bewertet), `app_state` unverändert.
> Menschliche Freigabe: **ja**.

## Phase 4 – Datenmigration

13. owner-Konto registrieren und bestätigen (echte E-Mail); neue PIN.
14. Import im Produktionsmodus:
    - Onboarding
    - Stammdaten, Erledigungen
    - Medien (ohne Metadaten)
    - Champion-Historie
15. Temporäre `legacy_import_redemptions` anlegen (feste `family_id`, Ablaufzeit) → Einlösungen importieren → **`drop function`**.

> **STOP 5 – Import-Funktion entfernt?**
> GO nur wenn: die Funktion existiert nicht mehr (Fingerabdruck), Anzahl Einlösungen und Summe `points_spent` gleich Backup.

16. `--verify` gegen die Referenz, `--sync-test`.

> **STOP 6 – Punktediff = 0?**
> GO nur wenn: **alle** Diffs je Profil und Woche 0 sind, alle Counts erklärt, keine falsche Zeremonie.
> Bei ≠ 0: **ABBRUCH** → Rollback (Phase 6).
> Menschliche Freigabe: **ja**.

## Phase 5 – Cutover

17. Vercel Production Env setzen:
    - FAMILY-Werte, Rechtslinks, Redirect- und Invite-URL
    - **Legacy-`VITE_SUPABASE_*` aus Production entfernen**
    - letztes LEGACY-Deployment als Rollback-Ziel notieren (ID/URL)

> **STOP 7 – Nutzerfreigabe für Vercel-Cutover?**
> GO nur mit ausdrücklicher Freigabe „GO STOP 7“ **und** notiertem Rollback-Ziel.

18. Merge nach `main` (nach Review) bzw. bewusst ausgelöstes Production-Deployment.
19. Smoke Test (iPhone und Desktop):
    - Login
    - Punkte gleich Referenz
    - Aufgabe erledigen
    - PIN-Bereich
    - Einlösen und quittieren
    - Champion-Historie
    - Realtime auf dem zweiten Gerät
    - Bilder
    - Reset-Mail
    - Rechtslinks
    - Account-Löschung **nur** mit einem Wegwerf-Testkonto

> **STOP 8 – Abnahme?**
> GO nur wenn: Smoke Test vollständig grün und die Familie bestätigt die Punktestände.
> Menschliche Freigabe: **ja**.

20. Nach der Abnahme:
    - Schreibsperre aus Schritt 6 endgültig lassen
    - `app_state` für anon sperren (nur nach Freigabe „GO app_state lock“)
    - 30 Tage Archiv, dann erneute Entscheidung
21. Zweites Elternkonto per Einladung.

## Phase 6 – Rollback (jederzeit bis STOP 8)

- **R1:** Vercel Instant Rollback auf das notierte LEGACY-Deployment.
- **R2:** Schreibsperre für LEGACY aufheben; LEGACY arbeitet mit dem unveränderten `app_state`.
- **R3:** FAMILY-Daten **nicht** löschen. Analyse; ein späterer neuer Versuch läuft über `delete-family` (Medien).
- **R4:** Kurzbericht, was fehlschlug, mit welcher Prüfung und welchem Wert (ohne Personendaten).

| Checkpoint | Frage | menschliche Freigabe |
|---|---|---|
| STOP 1 | Tests und Release-Check grün? | ja |
| STOP 2 | Bootstrap geprüft? | ja |
| STOP 3 | Backup geprüft, Schreibsperre aktiv? | ja |
| STOP 4 | Backend bereit? | ja |
| STOP 5 | Import-Funktion entfernt? | nein (automatisch prüfbar) |
| STOP 6 | Punktediff = 0? | ja |
| STOP 7 | Vercel-Cutover freigegeben? | **ja, ausdrücklich** |
| STOP 8 | Abnahme? | ja |
