# Phase 1 – Baseline „Wochen Champion“ (App-Store-Vorbereitung)

## 1. Datum

2026-09-27

## 2. Git-Ausgangslage

| Punkt | Befund |
| --- | --- |
| Branch vor Phase 1 | `claude/ios-app-strategy-analysis-ie67f7` (Stand identisch mit `main`) |
| Arbeitsbaum vor Phase 1 | sauber, keine uncommitteten Änderungen |
| Remote | `origin` → `https://github.com/Volkmar11/familienapp` |
| Letzter Commit vor Phase 1 | `803589611fa6f4c46a34fbded0966a1a65147896` (2026-09-19, „LehrerAssistent 2: Schullogo, leerer Start, pulsierendes Mikrofon“) |

## 3. Branch

`feature/appstore-v1`, neu angelegt von Commit `8035896`. Der Branch wurde nicht gepusht.

## 4. Commit-Hash vor Phase 1

`803589611fa6f4c46a34fbded0966a1a65147896`

## 5. Relevante Wochen-Champion-Dateien

| Datei | Zweck |
| --- | --- |
| `index.html` | HTML-Einstieg, iOS-Meta-Tags, Verweis auf das Manifest |
| `src/main.jsx` | React-Einstieg (`React.StrictMode`) |
| `src/App.jsx` | gesamte App mit 1.049 Zeilen (UI, Logik, Supabase-Zugriff) |
| `public/manifest.json` | Web-App-Manifest |
| `public/icon-180x180.png`, `icon-192x192.png`, `icon-512x512.png` | Icons |
| `vite.config.js` | Vite-Konfiguration (nur React-Plugin) |
| `package.json`, `package-lock.json` | Abhängigkeiten |

**Nicht Teil von Wochen Champion und in Phase 1 unverändert:** `lehrerassistent/`, `lehrerassistent-v2/`, `vermarktung.html`, `lehrerassistent.html` und `.github/workflows/deploy-pages.yml`.

## 6. Aktueller Technologie-Stack

Die installierten Versionen stammen aus `package-lock.json`.

| Paket | Version |
| --- | --- |
| react / react-dom | 18.3.1 |
| @supabase/supabase-js | 2.103.3 |
| vite | 6.4.2 |
| @vitejs/plugin-react | 4.7.0 |

- Die Build-Prüfung lief mit Node.js v22.22.2 und npm 10.9.7.
- Kein TypeScript, kein Router, keine Tests, kein Linter.

## 7. Supabase-Status

Die folgenden Angaben stammen **aus dem Code** (`src/App.jsx:5-8`, `:202-208`):

- Der Client wird mit `import.meta.env.VITE_SUPABASE_URL` und `import.meta.env.VITE_SUPABASE_ANON_KEY` erzeugt.
- Tabelle `public.app_state`, Zeile `id = 'family-main'`.
- Genutzte Spalten: `id`, `data` (JSON-Dokument mit dem gesamten Zustand) und `updated_at`.
- Schreiben: `upsert` des vollständigen Dokuments. Lesen: `select('data').eq('id','family-main').single()`.
- Realtime: Kanal `app_state_changes` mit `postgres_changes`, `event: '*'`, Filter `id=eq.family-main`.
- Supabase Auth und Supabase Storage werden nicht verwendet.

In der Arbeitsumgebung von Phase 1 **war kein Supabase-Zugang vorhanden**: keine `.env`-Datei, keine Umgebungsvariablen, keine Supabase-CLI-Verknüpfung. Deshalb gilt:

| Punkt | Status |
| --- | --- |
| Tabelle `app_state` existiert | im Code referenziert, in der Datenbank **NICHT PRÜFBAR** |
| Spaltenstruktur und Datentypen | **NICHT PRÜFBAR** |
| Primärschlüssel | **NICHT PRÜFBAR** (vermutlich `id`, weil `upsert` ohne `onConflict` den Primärschlüssel nutzt) |
| Supabase-Projekt-URL | **NICHT PRÜFBAR** (nicht im Repo, keine Umgebungsvariable) |
| Art des Client-Schlüssels | **unbekannt**. Der Variablenname `VITE_SUPABASE_ANON_KEY` deutet auf einen Legacy-Anon-Key hin, bewiesen ist das nicht. |

## 8. Status des family-main-Backups

**NICHT MÖGLICH.** Es gab keine Supabase-URL und keinen Client-Key in der Umgebung. Es wurde kein Zugriff versucht und kein Zugang umgangen.

Das Verzeichnis `local-backups/` wurde lokal angelegt und ist über `.gitignore` ausgeschlossen. Es ist leer.

**Manuelle Sicherung durch den Nutzer im Supabase-Dashboard (nur lesend):**

1. Unter https://supabase.com/dashboard das Projekt öffnen.
2. Links **SQL Editor** wählen und eine neue Abfrage anlegen.
3. Die folgende Abfrage ausführen. Sie liest nur und verändert nichts:

   ```sql
   select id, data, updated_at
   from public.app_state
   where id = 'family-main';
   ```

4. Im Ergebnis über **Export → JSON** (alternativ **Copy as JSON**) herunterladen.
5. Die Datei lokal speichern als `local-backups/family-main-JJJJMMTT-HHMMSS.json` und dabei in dieses Format einbetten:

   ```json
   {
     "backup_created_at": "…",
     "source_table": "app_state",
     "source_id": "family-main",
     "record": { "id": "family-main", "data": { … }, "updated_at": "…" }
   }
   ```

6. Zusätzlich außerhalb des Repos sichern, z. B. in iCloud Drive in einem privaten Ordner. Die Datei enthält Namen, Fotos und die PIN.
7. Optional als zweite Sicherung: **Table Editor → app_state → Export → CSV**.

## 9. RLS-Status

**NICHT PRÜFBAR.** Ohne Anmeldung muss der Anon- bzw. Client-Schlüssel die Zeile lesen **und** schreiben dürfen, sonst würde die App nicht funktionieren. Wahrscheinlich ist RLS deshalb entweder deaktiviert oder durch eine offene Policy für `anon` erlaubt. In Phase 1 wurde **nichts** geändert.

Zum Nachsehen (nur lesend) im SQL-Editor:

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class where oid = 'public.app_state'::regclass;

select policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename = 'app_state';
```

## 10. Realtime-Status

**NICHT PRÜFBAR.** Die App erwartet, dass `app_state` in der Publikation `supabase_realtime` enthalten ist. Zum Nachsehen (nur lesend):

```sql
select * from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'app_state';

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'app_state';
```

## 11. Vercel-Status

| Punkt | Befund |
| --- | --- |
| `.vercel/project.json` | nicht vorhanden (Projekt lokal nicht verknüpft) |
| `vercel.json` | nicht vorhanden |
| Weitere Vercel-Dateien (`api/`, `middleware.*`) | nicht vorhanden |
| Framework | laut Repo Vite. Vercel erkennt das automatisch, die Einstellung im Dashboard ist **NICHT PRÜFBAR**. |
| Build-Command | `npm run build` bzw. `vite build` (Vite-Standard); die Einstellung im Dashboard ist **NICHT PRÜFBAR** |
| Output-Verzeichnis | `dist` (Vite-Standard); die Einstellung im Dashboard ist **NICHT PRÜFBAR** |
| Root-Verzeichnis | Repo-Root (dort liegen `package.json` und `index.html`); die Einstellung im Dashboard ist **NICHT PRÜFBAR** |
| Projektname, Domain, Umgebungsvariablen | **NICHT PRÜFBAR** |

Die Vercel-Einstellungen wurden nicht verändert. `.vercel/` wurde vorsorglich in `.gitignore` aufgenommen, damit eine spätere lokale Verknüpfung nicht versehentlich committet wird.

## 12. Web-Build-Status

| Punkt | Ergebnis |
| --- | --- |
| `node_modules` vorhanden | nein, deshalb `npm ci` |
| `npm ci` | erfolgreich; `package.json` und `package-lock.json` unverändert (SHA-256 geprüft) |
| `npm run build` | **erfolgreich** (Vite 6.4.2, 66 Module, ca. 1,8 s) |
| Build-Warnungen | keine |
| Build-Fehler | keine |
| `dist/` erzeugt | ja, ca. 884 KB |
| JS-Bundle | `dist/assets/index-*.js` mit 411 KB (gzip 114 KB) |
| Größte weitere Dateien | `icon-512x512.png` 344 KB, `icon-192x192.png` 66 KB, `icon-180x180.png` 59 KB |

**Hinweise:**

- Der Build lief **ohne** Supabase-Umgebungsvariablen. Er gelingt trotzdem, aber das lokal erzeugte `dist/` würde im Browser beim Start fehlschlagen, weil `createClient` eine URL benötigt. Auf Vercel sind die Variablen vermutlich gesetzt. Das ist nicht prüfbar.
- `npm audit` meldet 7 Schwachstellen (1 niedrig, 1 mittel, 5 hoch), u. a. in `vite` ≤ 6.4.2, `postcss` und `ws`. Sie betreffen überwiegend den Dev-Server und die Build-Werkzeuge. Nichts wurde behoben, denn Abhängigkeiten sollten in Phase 1 nicht geändert werden.

## 13. Bekannte Risiken

1. **Gemeinsame feste Datenzeile:** `family-main` ist fest eingetragen. Alle Installationen teilen sich dieselben Daten, eine öffentliche Store-Version ist so nicht möglich.
2. **Datenverlust-Pfad:** `load()` gibt bei jedem Fehler `null` zurück. Die App setzt dann `DEFAULT_DATA`, und der Wochen-Effekt speichert diese sofort (`src/App.jsx:8`, `:200`, `:236-238`). Nach einem Ladefehler können so die echten Daten überschrieben werden.
3. **Letzter Schreiber gewinnt:** Jede Änderung schreibt das ganze Dokument. Gleichzeitige Änderungen von mehreren Geräten gehen verloren.
4. **Vermutlich offene Zugriffsrechte:** Ohne Auth muss `anon` lesen und schreiben dürfen. Wer den öffentlichen Client-Key aus dem JS-Bundle liest, könnte die Familiendaten lesen oder ändern.
5. **Eltern-PIN:** Sie steht im Klartext im JSON (Standard `1234`) und wird nur im Client geprüft.
6. **Base64-Fotos im JSON:** Das Dokument wächst, und Erledigungen sammeln sich unbegrenzt an.
7. **Google Fonts** werden zur Laufzeit aus dem Netz geladen.
8. **Abhängigkeiten** mit bekannten Schwachstellen (siehe `npm audit`).
9. **Vor Phase 1 gab es kein Backup** der Produktionsdaten. Es muss manuell nachgeholt werden (Abschnitt 8).

## 14. Noch nicht prüfbare Punkte

- Supabase: Projekt-URL, Schlüsseltyp (Legacy-Anon-Key oder Publishable Key), Existenz und Struktur von `app_state`, Primärschlüssel, RLS aktiv ja/nein, Policies, Realtime-Publikation, Größe des Dokuments `data`, `updated_at`, weitere Tabellen im Projekt und Backup- bzw. PITR-Einstellungen des Supabase-Plans.
- Vercel: Projektname, Domain(s), Framework-Preset, Build-, Output- und Install-Command, Root Directory, Node-Version, gesetzte Umgebungsvariablen (nur die Namen) und Git-Verknüpfung (welcher Branch in Produktion geht, Preview-Deployments).

## 15. Erklärung

**In Phase 1 wurden keine produktiven Datenbankänderungen vorgenommen.** Es gab auch keinen lesenden Datenbankzugriff, weil keine Zugangsdaten vorhanden waren. Der App-Code, die Abhängigkeiten, die LehrerAssistent-Dateien und der GitHub-Pages-Workflow blieben unverändert.
