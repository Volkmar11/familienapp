# Supabase-Testprojekt einrichten (einmalig, manuell)

Diese Anleitung richtet ein **separates** Supabase-Projekt ausschließlich für Tests von „Wochen Champion“ ein. Das produktive Projekt mit `app_state` / `family-main` wird dabei **nicht** berührt.

> Schreibe keine Schlüssel, Passwörter oder Verbindungs-URLs in dieses Repository, in Commits oder in den Chat.

Die Oberfläche von Supabase ändert sich gelegentlich. Wenn ein Menüpunkt anders heißt, hilft die Supabase-Dokumentation: https://supabase.com/docs

---

## 1. Neues Projekt erstellen

1. https://supabase.com/dashboard öffnen und anmelden.
2. **New project** wählen. Nimm dieselbe Organisation wie beim Produktivprojekt oder, noch sauberer, eine eigene Organisation „Wochen Champion Test“.
3. **Name:** `wochen-champion-test`. Das Wort **test** muss im Namen stehen, weil Claude Code das Projekt daran als Testprojekt erkennt.
4. **Region:** Frankfurt (`eu-central-1`) oder eine andere EU-Region. Das ist datenschutzfreundlich und liegt nah an Deutschland.
5. **Database Password:** über **Generate a password** erzeugen und sofort in einem Passwortmanager speichern, z. B. im Apple-Passwörter-App bzw. iCloud-Schlüsselbund. Es wird nur für direkte Datenbankverbindungen gebraucht, nicht für die App.
6. **Plan:** Free reicht für Tests.
7. **Create new project** klicken und warten, bis das Projekt bereit ist (ca. 1–2 Minuten).

## 2. Authentifizierung (E-Mail + Passwort)

1. Links **Authentication** öffnen, dann **Sign In / Providers** (je nach Version auch *Providers*), dann **Email**.
2. **Enable Email provider** muss aktiv sein.
3. **Confirm email:** für das **reine Testprojekt deaktivieren**. Dann können Testkonten ohne echten E-Mail-Versand angelegt werden, und Claude Code kann Testnutzer selbst per `signUp` erzeugen.
   - Das gilt nur für das Testprojekt. Im späteren Produktivbetrieb bleibt die E-Mail-Bestätigung **aktiv**.
   - Ist die Bestätigung aktiv, braucht jeder Testnutzer eine echte, erreichbare E-Mail-Adresse. Außerdem gilt dann das stark begrenzte Mail-Kontingent des eingebauten Mailversands.
4. Unter **URL Configuration** vorerst nichts ändern. Die Weiterleitungs-URLs folgen in Phase 4.

## 3. Datenbank-Migration im Testprojekt ausführen

Empfohlener Weg, ganz ohne Datenbank-Zugangsdaten für Claude Code:

1. Links **SQL Editor** öffnen, dann **New query**.
2. **Oben rechts prüfen, dass das Projekt `wochen-champion-test` ausgewählt ist** – nicht das Produktivprojekt.
3. In die erste Zeile schreiben:
   ```sql
   set app.migration_target = 'test';
   ```
4. Darunter den **kompletten Inhalt** der Datei `supabase/migrations/20260927120000_family_architecture.sql` aus dem Repository einfügen, von `begin;` bis `commit;`.
5. **Run** klicken. Erwartet wird „Success. No rows returned“.
6. Zur Kontrolle eine neue Abfrage ausführen:
   ```sql
   select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
   ```
   Erwartet werden 13 Tabellen, alle mit `rowsecurity = true`.

Fehlt Zeile 3, bricht das Skript absichtlich mit „Abbruch: Entwurf nur für ein Testprojekt …“ ab. Das ist die Schutzsperre gegen versehentliches Ausführen in der Produktion.

## 4. Project URL und öffentlichen Schlüssel finden

1. Links **Project Settings** (Zahnrad) öffnen.
2. Die **Project URL** steht unter **Data API** bzw. oben über **Connect**. Sie hat die Form `https://<projekt-ref>.supabase.co`.
   - `<projekt-ref>` ist die ca. 20-stellige Projekt-Referenz. Sie steht auch in der Browser-Adresszeile: `…/project/<projekt-ref>/…`.
3. Den Schlüssel findest du unter **API Keys**:
   - bevorzugt den **Publishable key**, beginnend mit `sb_publishable_…`
   - alternativ unter „Legacy API keys“ den **anon public** key
   - **Nicht** verwenden und niemals weitergeben: `secret` bzw. `service_role`.

Der Publishable bzw. Anon Key ist für den Client-Einsatz gedacht. Er gehört trotzdem nicht ins Repository, damit Test- und Produktivumgebung sauber getrennt bleiben.

## 5. Werte für Claude Code hinterlegen (Cloud-Umgebung)

Claude Code liest die Werte aus Umgebungsvariablen der Cloud-Umgebung. **Nicht in den Chat kopieren.**

1. In der Claude-Code-Sitzung oben in der Titelleiste das Menü der **Cloud-Umgebung** öffnen und **Edit** wählen.
2. Unter **Environment variables** (bzw. „API credentials“) diese Variablen anlegen:

   | Variable | Wert |
   | --- | --- |
   | `SUPABASE_TEST_PROJECT_REF` | die Projekt-Referenz aus Schritt 4 |
   | `SUPABASE_TEST_URL` | `https://<projekt-ref>.supabase.co` |
   | `SUPABASE_TEST_PUBLISHABLE_KEY` | der Publishable Key (oder Legacy-Anon-Key) |

   Die Präfixe `SUPABASE_TEST_…` kennzeichnen die Werte eindeutig als Testprojekt. Claude Code prüft zusätzlich, dass die URL die Referenz enthält.
3. Unter **Network access** die Domain **`<projekt-ref>.supabase.co`** erlauben, oder allgemein `*.supabase.co`. Sonst blockiert die Umgebung die Verbindung. Die Zugriffsstufen sind hier beschrieben: https://code.claude.com/docs/en/claude-code-on-the-web
4. Speichern und eine **neue Sitzung** starten. Neue Variablen gelten erst in einer neuen Sitzung.
5. Der Branch `feature/appstore-v1` muss dafür auf GitHub liegen, siehe Abschnitt 8.

**Nicht hinterlegen:** `service_role` bzw. `secret`-Keys, das Datenbankpasswort oder ein Supabase Personal Access Token. Ein Personal Access Token gilt für **alle** Projekte deines Kontos, also auch für die Produktion.

## 6. Lokale Entwicklung auf dem Mac (optional, für Phase 4)

Im Projektordner eine Datei **`.env.local`** anlegen. Sie ist über `.gitignore` ausgeschlossen (`*.local`, `.env.*`).

```
VITE_SUPABASE_URL=https://<projekt-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable-oder-anon-key-des-testprojekts>
```

- Die Platzhalter durch die Werte des **Testprojekts** ersetzen.
- `npm run dev` nutzt dann das Testprojekt.
- Mit `git status` prüfen, dass `.env.local` **nicht** als neue Datei auftaucht.

## 7. Direkte Datenbankverbindung (nur falls später nötig)

Die Migration läuft über den SQL-Editor (Abschnitt 3), dafür ist keine direkte Verbindung nötig.

Falls doch einmal eine Verbindung gebraucht wird, z. B. für `psql` oder die Supabase CLI **auf dem eigenen Mac**:

1. Im Dashboard oben auf **Connect** klicken, dann **Connection string**.
2. Den **Session pooler** wählen (IPv4-fähig, Port 5432). Die „Direct connection“ ist oft nur über IPv6 erreichbar.
3. Das Passwort aus Schritt 1.5 einsetzen und die Verbindung nur lokal nutzen, z. B. `psql "<connection-string>"`.

Aus der Claude-Code-Cloud-Umgebung sind direkte Postgres-Verbindungen voraussichtlich **nicht** möglich, weil dort nur ausgehendes HTTPS über einen Proxy erlaubt ist. Deshalb laufen alle Tests von Claude Code über die HTTPS-API mit dem Publishable Key.

## 8. Wichtige Regeln

- **Ausschließlich** das Projekt `wochen-champion-test` für Migrationen und Tests verwenden.
- Keine Kopie von `family-main` mit echten Namen oder Fotos ins Testprojekt laden, solange das nicht ausdrücklich für den Migrationstest geplant ist.
- Den Branch `feature/appstore-v1` nach GitHub pushen lassen. Sonst sind die Phasen 1–3 in einer neuen Sitzung nicht vorhanden.
- Unabhängig davon das **Backup von `family-main`** aus dem Produktivprojekt erstellen (siehe `PHASE_01_BASELINE.md`, Abschnitt 8). Nur mit der SELECT-Abfrage und dem Export, ohne irgendetwas zu ändern.
