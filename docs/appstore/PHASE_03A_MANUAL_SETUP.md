# Phase 3a – einmalige Supabase-Testeinrichtung

Diese Anleitung erledigst du **einmalig selbst**. Sie dauert etwa 20–30 Minuten. Danach kann Claude Code in Phase 3b das neue Backend gefahrlos testen.

> **Grundregeln**
> - Alles in den Abschnitten A–E passiert **nur im neuen Projekt `wochen-champion-test`**.
> - Im **Produktionsprojekt** wird ausschließlich gelesen (Abschnitt F).
> - Schlüssel, Passwörter und URLs **nie** in den Chat, in E-Mails oder ins Repository kopieren.

Supabase passt seine Oberfläche gelegentlich an. Wenn ein Menüpunkt etwas anders heißt, suche nach dem sinngemäß passenden Eintrag oder schaue in die Supabase-Dokumentation: https://supabase.com/docs

---

## A. Neues Supabase-Projekt

1. **https://supabase.com** im Browser öffnen, am Mac z. B. in Safari.
2. Oben rechts anmelden (**Sign in**), mit demselben Konto wie für das bestehende Projekt.
3. Im Dashboard **New project** wählen.
4. **Name:** `wochen-champion-test` (genau so; das Wort *test* muss enthalten sein).
5. **Organisation:** deine bestehende Organisation auswählen.
6. **Region:** eine EU-Region wählen, bevorzugt **Frankfurt** (Central EU), sonst eine andere EU-Region.
7. **Datenbankpasswort:** über die Schaltfläche zum Generieren ein starkes Passwort erzeugen lassen.
8. Das Passwort **sofort im Passwortmanager speichern**, z. B. in der App „Passwörter“ auf Mac/iPhone, Eintrag „Supabase wochen-champion-test DB“. Es wird für die weiteren Schritte **nicht** gebraucht und darf nirgendwo sonst notiert werden.
9. **Plan:** Free genügt. Dann auf **Create new project** klicken und warten, bis das Projekt fertig eingerichtet ist (1–2 Minuten).

## B. Authentication konfigurieren – NUR TESTPROJEKT

1. Im Projekt `wochen-champion-test` in der linken Leiste **Authentication** öffnen.
2. Den Bereich für die Anmeldemethoden öffnen, je nach Version „Sign In / Providers“ bzw. „Providers“, und dort **Email** wählen.
3. Sicherstellen, dass der **E-Mail-Provider aktiviert** ist (E-Mail + Passwort).
4. Die Option **„Confirm email“** (E-Mail-Bestätigung) **ausschalten** und speichern.

> ⚠️ **NUR IM TESTPROJEKT.** Ohne Bestätigung kann Claude Code in Phase 3b Testkonten wie `wc-test-a@example.com` anlegen, ohne dass echte Mails verschickt werden. Im Produktionsprojekt bleibt die E-Mail-Bestätigung später **eingeschaltet**.

## C. Migration ausführen

1. **Oben im Dashboard prüfen, dass `wochen-champion-test` ausgewählt ist.**
2. In der linken Leiste den **SQL Editor** öffnen und eine neue, leere Abfrage anlegen.
3. Die Datei [`docs/appstore/SUPABASE_TEST_MIGRATION_SQL.md`](SUPABASE_TEST_MIGRATION_SQL.md) auf GitHub öffnen: https://github.com/Volkmar11/familienapp/blob/feature/appstore-v1/docs/appstore/SUPABASE_TEST_MIGRATION_SQL.md
4. Den **gesamten** SQL-Codeblock kopieren (auf GitHub gibt es oben rechts am Codeblock ein Kopier-Symbol) und in den SQL Editor einfügen.
5. **Prüfen, dass ganz oben steht:**
   ```sql
   set app.migration_target = 'test';
   ```
6. **Run** (Ausführen) klicken.
   - Erwartet wird eine Erfolgsmeldung ohne Ergebniszeilen.
   - Falls Supabase vorher einen Warnhinweis zeigt: Er ist nur zu bestätigen, wenn wirklich `wochen-champion-test` ausgewählt ist.
   - Die Meldung „Abbruch: Entwurf nur für ein Testprojekt …“ bedeutet, dass die erste Zeile fehlt. Dann ist nichts passiert, und der Block kann vollständig neu eingefügt werden.
7. **Kontrolle** in einer neuen Abfrage (nur lesend):
   ```sql
   select tablename, rowsecurity
   from pg_tables
   where schemaname = 'public'
   order by tablename;
   ```
   Erwartet werden genau diese **13 Tabellen**, alle mit `rowsecurity = true`:

   | | | |
   | --- | --- | --- |
   | `families` | `family_members` | `family_settings` |
   | `profiles` | `categories` | `category_assignments` |
   | `tasks` | `task_assignments` | `rewards` |
   | `reward_assignments` | `completions` | `redemptions` |
   | `champion_history` | | |

   Weitere Tabellen legt die Migration nicht an. Zusätzlich entstehen nur die Funktionen `public.create_family`, `private.is_family_member`, `private.has_family_role` und `private.set_updated_at`.

   Alternativ sind die Tabellen im **Table Editor** (linke Leiste) sichtbar.

## D. API-Daten des TESTPROJEKTS

Du brauchst **zwei Werte** plus die **Projekt-Referenz**:

| Wert | Wo zu finden | Aussehen |
| --- | --- | --- |
| **Projekt-Referenz** | in der Browser-Adresszeile: `supabase.com/dashboard/project/<REFERENZ>/…`; außerdem in den Projekteinstellungen (Zahnrad) unter „General“ | ca. 20 Kleinbuchstaben |
| **Project URL** | Projekteinstellungen (Zahnrad) bzw. über die Schaltfläche **Connect** oben im Projekt; Bereich zur API bzw. Data API | `https://<REFERENZ>.supabase.co` |
| **Publishable Key** | Projekteinstellungen → Bereich **API Keys** | beginnt mit `sb_publishable_` |

- **Fallback:** Bietet das Projekt nur die älteren Schlüssel an („Legacy API keys“), ist der **anon / public** Key zulässig. Er beginnt mit `eyJ`.
- **NIEMALS** für das Frontend oder für Claude Code verwenden oder weitergeben:
  - den `service_role`-Key
  - einen **Secret Key** (`sb_secret_…`)
  - das **Datenbankpasswort**

## E. Claude-Code-Environment

1. In der Claude-Code-Sitzung (Web oder App) oben in der **Titelleiste** auf den Namen der **Cloud-Umgebung** klicken und dort **Edit** wählen.
2. Im Bereich für Umgebungsvariablen diese drei Einträge anlegen:

   | Name | Wert |
   | --- | --- |
   | `SUPABASE_TEST_PROJECT_REF` | die Projekt-Referenz (nur die Zeichenfolge) |
   | `SUPABASE_TEST_URL` | `https://<REFERENZ>.supabase.co` |
   | `SUPABASE_TEST_PUBLISHABLE_KEY` | der Publishable Key (oder als Fallback der anon Key) |

3. Im Bereich **Network access** die Domain des Testprojekts erlauben:
   ```
   <REFERENZ>.supabase.co
   ```
   Nur diese eine Domain, keine weiteren. Darüber laufen REST-API, Auth und Realtime. Hintergrund zu den Zugriffsstufen: https://code.claude.com/docs/en/claude-code-on-the-web
4. Speichern. **Neue Werte gelten erst in einer neuen Sitzung.** Phase 3b deshalb in einer neuen Sitzung auf dem Branch `feature/appstore-v1` starten.

> Keine Werte in das Repository schreiben. Die `.gitignore` schützt zwar `.env`-Dateien, aber für die Cloud-Umgebung sind die Umgebungsvariablen der richtige und einzige Ort.

## F. family-main Produktionsbackup

> ⚠️ **Im PRODUKTIONSPROJEKT darf ausschließlich READ-ONLY gearbeitet werden.**
> **NIEMALS** `UPDATE`, `DELETE`, `INSERT` oder `UPSERT` ausführen und nichts in Tabellen bearbeiten.

1. Im Dashboard oben das **bisherige Produktionsprojekt** auswählen, nicht `wochen-champion-test`.
2. **SQL Editor** öffnen, neue Abfrage anlegen und einfügen:
   ```sql
   select id, data, updated_at
   from public.app_state
   where id = 'family-main';
   ```
3. Ausführen. Es erscheint **eine** Zeile.
4. Das Ergebnis über die Export- bzw. Kopierfunktion des Ergebnisbereichs **als JSON** sichern und als Datei speichern, z. B. `family-main-2026-09-27.json`.

   **Falls ein JSON-Export fehlt oder der Inhalt abgeschnitten wirkt** (große Fotos), diese ebenfalls nur lesende Abfrage verwenden. Sie liefert die komplette Sicherung als eine einzige Textzelle:
   ```sql
   select jsonb_build_object(
     'backup_created_at', now(),
     'source_table', 'app_state',
     'source_id', 'family-main',
     'record', to_jsonb(a)
   )::text as backup
   from public.app_state a
   where a.id = 'family-main';
   ```
   Den Zellinhalt vollständig kopieren, in TextEdit einfügen (Format → „In reinen Text umwandeln“) und als `.json` speichern.

5. **Speichern an zwei Orten, beide außerhalb des Repositorys:**
   1. lokal auf dem Mac, z. B. `Dokumente/WochenChampion-Backups/`
   2. an einem zweiten sicheren Ort, z. B. einem privaten iCloud-Drive-Ordner oder einem USB-Stick

   Die Datei enthält Namen, Fotos und die Eltern-PIN der Familie. Also nicht per Mail verschicken und nicht in geteilte Ordner legen.
6. **Prüfen:**
   - Die Datei öffnet sich, z. B. in Safari per Drag & Drop oder in TextEdit.
   - Sie enthält `family-main`.
   - Sie enthält `"data"` mit Inhalt, z. B. `"members"` und `"completions"`.
   - Sie enthält `updated_at`.
   - Optional die Größe gegenprüfen, wieder nur lesend:
     ```sql
     select id, updated_at, length(data::text) as zeichen
     from public.app_state where id = 'family-main';
     ```
     Die Datei sollte mindestens so viele Zeichen groß sein.

## G. Fertig-Kriterien

Du bist bereit für Phase 3b, wenn alles abgehakt ist:

- [x] Branch ist auf GitHub (erledigt durch Claude Code: `feature/appstore-v1`)
- [ ] Projekt `wochen-champion-test` existiert
- [ ] Migration erfolgreich ausgeführt
- [ ] 13 Zieltabellen sichtbar (alle mit RLS)
- [ ] E-Mail/Passwort-Auth aktiv
- [ ] „Confirm email“ im Testprojekt ausgeschaltet
- [ ] `SUPABASE_TEST_PROJECT_REF` gesetzt
- [ ] `SUPABASE_TEST_URL` gesetzt
- [ ] `SUPABASE_TEST_PUBLISHABLE_KEY` gesetzt
- [ ] `<REFERENZ>.supabase.co` unter Network access erlaubt
- [ ] `family-main`-Produktionsbackup existiert (an zwei Orten, geprüft)

Danach eine **neue** Claude-Code-Sitzung auf dem Branch `feature/appstore-v1` starten und Phase 3b beauftragen.
