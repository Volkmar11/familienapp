# Phase 5D – Mehrere Eltern / Einladungen

Stand: Branch `feature/appstore-v1`. Umgesetzt und getestet **nur im Supabase-Testprojekt** (`wochen-champion-test`).
Produktion (`gkkzjmszcjivtaygbmfw`) unverändert.

## 1. Membership-Modell

- `public.family_members (family_id, user_id, role ∈ {owner, parent}, created_at)`; eine Zeile je Elternkonto und Familie. Kinder sind keine Auth-Nutzer.
- Clients dürfen `family_members` **nur lesen** (eigene Familien). Direktes INSERT/UPDATE war nie erlaubt. Ab 5D ist auch das direkte DELETE entfernt (Policy `family_members_delete` gelöscht). Alle Änderungen laufen über RPCs, damit Regeln wie „owner nicht entfernbar“ und der Invite-Widerruf nicht umgangen werden können.
- Mehrere owner sind erlaubt. Ein Downgrade owner → parent gibt es in v1 nicht.

## 2. Invitation Token

- Serverseitig erzeugt mit `extensions.gen_random_bytes(16)` → 128 Bit, 32 Hex-Zeichen.
- Der Klartext verlässt die Datenbank genau einmal als Rückgabe von `create_family_invitation`. Er wird nicht gespeichert und nicht geloggt; in der UI ist er nur sichtbar, bis „Fertig“ gedrückt wird.
- Kanonisierung (Server `private.invite_token_hash`, Client `normalizeInviteToken`):
  - Kleinschreibung; Leerzeichen und Bindestriche werden entfernt.
  - Danach muss der Wert genau `^[0-9a-f]{32}$` entsprechen. Alles andere ist ungültig.
- Anzeigeformat als Code: 8 Vierergruppen (`ABCD-EF01-…`). Link: `<Basis-URL>/?invite=<token>`.

## 3. Hash/TTL

- `private.family_invitations`:
  - Spalten: `id, family_id, token_hash (unique, SHA-256 hex), role = 'parent', created_by, created_at, expires_at, used_at, used_by, revoked_at`
  - RLS ist aktiv, es gibt keine Policy und keine Grants → nur über RPCs erreichbar.
- TTL 7 Tage (`expires_at = now() + 7 days`). Jede Einladung ist nur einmal verwendbar (`used_at/used_by`) und lässt sich widerrufen (`revoked_at`).
- FK auf die Familie mit `on delete cascade`. `created_by` und `used_by` sind FKs auf `auth.users` mit `on delete set null`.

## 4. Invitation RPCs

Alle Funktionen sind `SECURITY DEFINER` mit `search_path = ''` und prüfen `auth.uid()`. EXECUTE hat nur `authenticated`; `anon` und `public` sind entzogen.

| RPC | Wer | Wirkung |
|---|---|---|
| `create_family_invitation(p_family_id)` | owner/parent | erzeugt Token, gibt `{id, token, expires_at, role}` zurück |
| `inspect_family_invitation(p_token)` | angemeldet | `{ok, family_id, family_name, expires_at, role, already_member}` oder `{ok:false, error: invalid\|rate_limited}` |
| `accept_family_invitation(p_token)` | angemeldet | atomar, einmalig: `joined` \| `already_member` \| Fehler |
| `revoke_family_invitation(p_invitation_id)` | owner/parent derselben Familie | setzt `revoked_at` (idempotent) |
| `list_family_invitations(p_family_id)` | Mitglied | nur aktive Einladungen, **ohne token_hash** |
| `list_family_adults(p_family_id)` | Mitglied | `user_id, email, role, created_at, is_self` |
| `promote_family_parent(p_family_id, p_user_id)` | owner | parent → owner |
| `remove_family_parent(p_family_id, p_user_id)` | owner | entfernt einen parent (keine owner, nicht sich selbst) und widerruft dessen offene Einladungen |
| `leave_family(p_family_id)` | Mitglied | siehe Abschnitt 11 |

Ungültige, abgelaufene, verwendete und widerrufene Einladungen erhalten dieselbe Antwort. Die UI zeigt dafür „Diese Einladung ist ungültig oder nicht mehr verfügbar.“

## 5. Einladung erzeugen

- Ort: Elternbereich (Rolle plus Familien-PIN) → Karte „Eltern & Einladungen“ (`src/family/FamilyAdultsPanel.jsx`).
- „+ Elternteil einladen“ zeigt Link und Code **einmalig** an. Dazu gibt es:
  - „Teilen …“ über `navigator.share`, mit Fallback auf die Zwischenablage
  - „Link kopieren“ und „Code kopieren“
  - den Hinweis, dass der Link später nicht wieder abrufbar ist
  - Keine zusätzliche Bibliothek.
- Basis-URL für den Link: `VITE_INVITE_BASE_URL`, sonst die aktuelle App-Herkunft (`src/lib/familyInvitations.js#getInviteBaseUrl`). Es gibt keine fest eingetragene Preview-URL. In der nativen App gibt es ohne Konfiguration keinen Link, dann nur den Code.
- PIN-Hinweis: „Für den geschützten Elternbereich benötigt ihr zusätzlich eure Familien-PIN.“ Die PIN wird nie mitgeschickt.

## 6. Login/Registrierung über Einladung

- Beim App-Start liest `capturePendingInvite()` den Parameter `?invite=`. Ablauf:
  1. Format prüfen.
  2. Token in `sessionStorage` (`wc.pendingInvite`) ablegen.
  3. Parameter sofort per `history.replaceState` aus der URL entfernen.
- Warum `sessionStorage` und nicht `localStorage`:
  - Der Token muss Anmeldung und Registrierung überstehen (Reload im selben Tab).
  - Er soll aber nicht dauerhaft auf dem Gerät bleiben und nicht in andere Tabs übergehen.
  - Nach Annehmen, Abbrechen oder „bereits Mitglied“ wird er sofort gelöscht.
- Nicht angemeldet: Die App zeigt „Du wurdest zu einer Familie eingeladen.“ mit „Anmelden“ / „Konto erstellen“ und „Einladung verwerfen“. Nach der Anmeldung geht der Einladungsfluss weiter.
- Registrierung aus einer Einladung: `signUp(..., { emailRedirectTo: <App-Herkunft>/?invite=<token> })`.
  - Ist „Confirm Email“ aktiv, führt der Bestätigungslink direkt zurück in den Fluss.
  - Im Testprojekt ist „Confirm Email“ AUS. Der Codepfad wird per Browsertest simuliert (siehe 15).
  - Die URL muss in Supabase als Redirect-URL erlaubt sein.
- Ein ungültiger `?invite=`-Parameter erzeugt einen Hinweis. Es wird nichts gespeichert.
- Manuelle Code-Eingabe ist möglich über:
  - Onboarding („Ich habe eine Einladung (Code eingeben)“)
  - Familienauswahl
  - Elternbereich („Einladungscode eingeben“)

## 7. Einladung annehmen

- Es gibt keinen automatischen Beitritt. Die App zeigt „Einladung zu <Familienname>“, „Du trittst dieser Familie als Elternteil bei.“, den PIN-Hinweis und die Buttons „Einladung annehmen“ / „Abbrechen“.
- `accept_family_invitation` läuft so ab:
  1. Hash bilden.
  2. Familienzeile `FOR UPDATE` sperren.
  3. Einladungszeile `FOR UPDATE` sperren.
  4. Prüfen: Ist der Nutzer schon Mitglied, lautet das Ergebnis `already_member`. Die Einladung wird dann **nicht** verbraucht.
  5. Prüfen: verwendet, widerrufen oder abgelaufen → generischer Fehler.
  6. INSERT `family_members(role='parent')` und `used_at/used_by` setzen.
- Bei parallelen Annahmen wartet der zweite Aufruf auf die Sperre. Danach sieht er `used_at` und erhält den Fehler. Genau ein Aufruf ist erfolgreich (getestet mit 5 Nutzern).
- Bei Erfolg zeigt die App „Du bist der Familie beigetreten.“. „Familie öffnen“ lädt die Mitgliedschaften neu und wählt die neue Familie aus.

## 8. Mitgliederliste

- Der Elternbereich zeigt alle Elternkonten mit E-Mail, Rolle, Beitrittsdatum und „(du)“.
- Aktive Einladungen erscheinen mit Ablaufzeit, Ersteller:in und „Widerrufen“.
- Die Daten kommen ausschließlich über `list_family_adults` und `list_family_invitations`. `auth.users` ist für Clients nicht lesbar.

## 9. Rollenverwaltung

- Nur owner können befördern („Zu Inhaber:in machen“, mit Bestätigung).
- In v1 gibt es kein Zurückstufen. Mehrere owner sind erlaubt.
- Die Rollenänderung erreicht das andere Gerät ohne Neuanmeldung über die Membership-Realtime (Abschnitt 13).

## 10. Parent entfernen

- Nur owner können entfernen. owner-Konten und das eigene Konto lassen sich nicht entfernen; die Fehlermeldungen sind deutsch.
- Beim Entfernen werden die offenen Einladungen des Entfernten widerrufen.
- Der Entfernte verliert sofort den Datenzugriff (RLS). Seine App bekommt das Signal über `user_membership_sync`:
  - FamilyChampion wird ausgehängt; damit stoppen Realtime, PIN-Gate und Bild-Cache.
  - Hinweis: „Du hast keinen Zugriff mehr auf diese Familie.“
  - Danach folgt die Auswahl bzw. das Onboarding.

## 11. Familie verlassen

`leave_family` sperrt die Familienzeile `FOR UPDATE` und ist damit rennsicher. Die Regeln:

| Fall | Ergebnis |
|---|---|
| parent verlässt | Austritt |
| owner verlässt, weiterer owner vorhanden | Austritt, keine Rollenänderung |
| letzter owner, weitere parents | ältester parent (`created_at`, dann `user_id`) wird owner, danach Austritt |
| letztes Elternkonto | blockiert: „Du bist das letzte Elternkonto dieser Familie. Lösche die Familie stattdessen über die Gefahrenzone.“ |
| Nicht-Mitglied | Fehler |

- In jedem Fall werden die offenen Einladungen des Austretenden widerrufen.
- Paralleles Verlassen der letzten zwei Konten: Genau eines ist erfolgreich; das verbleibende Konto ist owner.

## 12. Ownership Transfer

- Gleiche Regel wie bei der Account-Löschung (5C): Der älteste verbleibende parent wird owner.
- `execute_account_deletion` wurde rennsicher gemacht:
  - Zuerst werden **alle** betroffenen Familien gesperrt (feste Reihenfolge `family_id`, keine Deadlocks), dann wird der Plan berechnet.
  - Zusätzlich werden die offenen Einladungen des gelöschten Nutzers widerrufen.
- Alle Mitgliedschaftsänderungen (accept, remove, leave, promote, Account-Löschung) sperren zuerst die Familienzeile und serialisieren sich damit gegenseitig.

## 13. Membership Realtime

- `public.user_membership_sync (user_id PK → auth.users on delete cascade, version, changed_at)`.
  - RLS: Nur die eigene Zeile ist lesbar.
  - Clients haben kein INSERT/UPDATE/DELETE.
  - Die Tabelle ist in der Publikation `supabase_realtime`.
- Der Trigger `family_members_bump_user_sync` erhöht bei INSERT/UPDATE/DELETE die Version des betroffenen Nutzers (bei DELETE `OLD.user_id`).
  - Wird der Auth-User gerade per Kaskade gelöscht, entfällt das Signal. Das verhindert FK-Fehler.
- Warum ein eigenes Signal: Ein entfernter Nutzer darf `family_sync` der Familie nicht mehr lesen und bekäme sonst nichts mit.
- Client: `createMembershipRealtime` ist ein generischer `createRowSyncRealtime`, dieselbe Retry-Logik wie `family_sync`.
  - FamilyApp abonniert das Signal und lädt die Mitgliedschaften entprellt (250 ms) still neu, auch bei Rückkehr in den Vordergrund.
  - Fehlt die aktive Familie, folgen Hinweis und Auswahl/Onboarding.
  - Ändert sich die Rolle, bekommt FamilyChampion die neue Rolle ohne Remount.

## 14. Anti-Abuse

- Höchstens 10 aktive Einladungen je Familie.
- Höchstens 20 neue Einladungen je Nutzer und Stunde (familienübergreifend, serialisiert per Advisory Lock).
- Höchstens 20 ungültige inspect/accept-Versuche je Nutzer in 10 Minuten.
  - Danach sind auch gültige Tokens gesperrt; die Meldung lautet „Zu viele Versuche. Bitte warte einige Minuten …“.
  - Fehlversuche stehen in `private.invitation_attempts`. Einträge älter als 1 Tag werden beim nächsten Versuch aufgeräumt.
- Die Fehlerantworten verraten nicht, ob ein Token existiert, abgelaufen, verwendet oder widerrufen ist.
- Direktes INSERT in `family_members` bleibt unmöglich (getestet).

## 15. Tests

| Suite | Ergebnis |
|---|---|
| Unit (`node --test tests/*.test.mjs`, davon neu `tests/familyInvitations.test.mjs`) | 134/134 |
| SQL `supabase/tests/family_invitations_check.sql` – lokal und im Testprojekt | 31/31 |
| SQL `account_lifecycle_check.sql` (5C) – lokal | 22/22 |
| Integration `tests/supabase/family-invitations.test.mjs` | 49/49 |
| Integration `account-lifecycle.test.mjs` (jetzt über echte Einladungen, ohne `STALE`) | 34/34 |
| Ältere Integrations-Suites: data, mutations, admin, champion-realtime, two-device, onboarding, auth, media | 18, 44, 60, 17, 27, 29, 12, 30 – alle grün |
| Browser 393×852 (Einladung erzeugen/teilen/widerrufen, Link ohne Login, Registrierung, Confirm-Email-Codepfad simuliert, Code-Eingabe, Befördern, Entfernen, Verlassen) | 40/40 |
| Zwei Geräte (Beförderung ohne Neuanmeldung; entfernter parent wird automatisch hinausgeworfen) | 10/10 |
| Browser-Regression 5C (`ui5c`, `ui5c-2dev`, jetzt über Einladungen) | 34/34, 8/8 |

Abgedeckt sind unter anderem:
- paralleles Annehmen (5 Nutzer, genau einer erfolgreich) und paralleles Verlassen (genau einer erfolgreich)
- Rate-Limits inklusive Ablauf der Zeitfenster (per SQL zurückdatiert)
- direktes INSERT/UPDATE/DELETE auf `family_members` wirkungslos
- Realtime-Signal an ein gerade entferntes Konto (Node, echte WebSockets)

Der Confirm-Email-Codepfad ist simuliert: Die Signup-Antwort ohne Session wird abgefangen. Geprüft werden `redirect_to = <Herkunft>/?invite=<token>` und die Rückkehr über den Bestätigungslink in einem neuen Tab.

Browser- und Zwei-Geräte-Skripte liegen nicht im Repo, weil sie Wegwerf-Konten anlegen. Chromium bekommt im Proxy keine WebSockets; der Browser aktualisiert deshalb über das Vordergrund-Ereignis, das Realtime-Signal ist in Node geprüft.

`auth-rls-realtime.test.mjs` (Phase 3) wurde nicht ausgeführt, weil die Passwörter der festen Testkonten in dieser Sitzung nicht vorliegen.

## 16. Legacy Regression

- Der LEGACY-Build ist byte-identisch zum Stand nach Phase 5C.
- Regressionsläufe 1 und 2 sind identisch zu den Referenzen.
- Lauf 3 wich beim ersten Mal nur durch einen kurzlebigen Toast („Gespeichert!“) ab; die Wiederholung ist identisch.
- Fototest 8/8.
- Bundle: keine Tokens, keine Testkonten, kein `service_role`-Schlüssel (einziger Treffer ist die Schutzregel in `backend.js`), keine Test-Hintertür.

## 17. Voraussetzungen Produktion

Noch **nicht** umgesetzt, bewusst:

1. Migration `20260929300000_family_invitations.sql` in Produktion (erst nach allen Vorgänger-Migrationen, Guard anpassen).
2. SMTP-Anbieter für Auth-Mails (Registrierung, Reset) und „Confirm Email“ in Produktion aktivieren.
3. Redirect-Allowlist: Produktions-Domain inkl. `/?invite=*`. `VITE_INVITE_BASE_URL` auf die feste Domain setzen (nötig für die native App).
4. Leaked-Password-Protection aktivieren (Advisor).
5. Datenschutzerklärung/Impressum: E-Mail-Adressen der Eltern sind für andere Eltern derselben Familie sichtbar.
6. Offene Altlast: Die RLS-Policy `families_delete` erlaubt owners weiterhin das direkte Löschen ohne Medienbereinigung. Empfehlung: nur noch über die Edge Function `delete-family`.
