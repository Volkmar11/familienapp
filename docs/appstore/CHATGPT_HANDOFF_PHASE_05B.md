# CHATGPT HANDOFF – PHASE 5B

## 1. Ergebnis
- Phase erfolgreich: JA. Sichere Bildarchitektur mit privatem Supabase Storage, Profil- und Aufgabenbilder, Legacy-Bildimport im Testprojekt
- Branch: `feature/appstore-v1`
- Commit: `2e0d18b` („feat: add secure family media storage“), danach Handoff-Commit
- Push: normal nach `origin/feature/appstore-v1` (kein Force, kein Merge nach `main`)
- Legacy-Build: OK. Die 3 Legacy-Regressionen sind identisch; der neue Legacy-Fototest besteht 8/8.
- Family-Build: OK. Das Bundle enthält keine Base64-Bilder, keine Produktions-Referenz und keine Namen, PIN oder Foto-Fragmente.
- Produktionsdaten verändert: NEIN. Nur gelesen: 0 Buckets, 0 Objekte, 1 öffentliche Tabelle, 0 Storage-Policies.
- neue Migration: `supabase/migrations/20260929100000_family_media_storage.sql`, nur im Testprojekt angewandt (`family_media_storage`). Bestehende Migrationen sind unverändert.

## 2. Storage
- Bucket: `family-media`
- öffentlich: NEIN (`public = false`); eine öffentliche URL liefert HTTP 400
- Pfadstruktur:
  - `families/<family_id>/profiles/<profile_id>/<uuid>.jpg`
  - `families/<family_id>/tasks/<task_id>/<uuid>.jpg`

  Streng per Regex geprüft, identisch in DB und Client; Dateiname ist eine Zufalls-UUID.
- DB-Felder: `profiles.photo_path`, `tasks.image_path` (nur Storage-Pfade)
  - CHECK: Pfad gehört zur eigenen Familie und zum eigenen Datensatz
  - Trigger: das Objekt muss existieren
  - Die alten Felder `avatar_url` und `image_url` sind per CHECK auf NULL festgeschrieben
- erlaubte Dateitypen:
  - Eingabe: JPEG, PNG, WebP, HEIC/HEIF (wenn der Browser sie dekodieren kann)
  - Upload: nur JPEG (Bucket erlaubt `image/jpeg`, `image/webp`)
- Größenlimit: Original max. 10 MB (Client), gespeichert max. 2 MB (Bucket)
- Bildgrößen nach Verarbeitung:
  - Profil: quadratisch mittig zugeschnitten, max. 600 × 600
  - Aufgabe: längste Kante max. 1200
  - JPEG-Qualität 0,82 (bei Bedarf 0,72 bzw. 0,6); nie vergrößert
  - geschätzt: Profil ca. 40–90 KB, Aufgabe ca. 120–300 KB

## 3. Sicherheit
- SELECT: nur Mitglieder der Familie aus dem Pfad (`private.is_family_member(private.media_family_id(objects.name))`)
- INSERT: nur owner/parent dieser Familie, und nur für ein existierendes Profil bzw. eine existierende Aufgabe dieser Familie
- UPDATE: owner/parent; alte und neue `family_id` müssen erlaubt sein, kein Verschieben in fremde Familien
- DELETE: owner/parent; Supabase sperrt zusätzlich direkte SQL-DELETEs, gelöscht wird nur über die Storage-API
- anon: keine Policy, also kein Lesen und kein Schreiben (getestet)
- fremde Familie: kein Lesen, Signieren, Schreiben, Löschen, Umbenennen und keine Änderung von `photo_path` (getestet)
- manipulierte Pfade blockiert:
  - `..`, zusätzliches Segment, fremde `family_id`
  - eigene `family_id` mit fremdem Profil
  - Klartext-Dateiname, Großschreibung, führender `/`, falsche Endung, anderer Bucket
- RLS-Tests:
  - SQL-Check 32/32 (lokal und Testprojekt, zurückgerollte Subtransaktion, 0 Reste)
  - Storage-API-Integration 30/30
- Behobener Fehler: In der INSERT-Policy traf `name` in der Unterabfrage `profiles.name`. Jetzt steht überall `objects.name`.

## 4. Profilbilder
- Upload:
  - im PIN-geschützten Elternbereich (Kind bearbeiten) über `<input type="file" accept="image/*">`
  - sofortige Vorschau, Upload erst beim Speichern
- Resize: 600 × 600 JPEG; EXIF-Orientierung wird angewandt, Metadaten entfernt
- Replace: Upload → `photo_path` setzen (nur wenn der Pfad unverändert ist) → Reload → altes Objekt löschen. Bei einem DB-Fehler wird das neue Objekt entfernt und das alte Bild bleibt (getestet).
- Remove: `photo_path = null` → Reload → Objekt löschen. Ein Fehler beim Löschen ändert die App-Daten nicht; protokolliert wird nur ein technischer Code.
- Emoji-Fallback: ohne Foto, bei nicht signierbarem Pfad oder beim Ladefehler des Bildes (`Avatar` mit `onError`)
- Realtime: das `UPDATE` löst `bump_family_sync` aus; das Signal ist über Node-WebSocket bestätigt
- Mehrgeräte: A ändert, B aktualisiert automatisch; die alte URL wird nicht weiterverwendet (getestet)

## 5. Aufgabenbilder
- Upload: optional „Bild hinzufügen (optional)“ im FAMILY-Aufgabeneditor. Die Emoji-Auswahl entfernt das Bild im FAMILY-Modus nicht.
- Resize: längste Kante max. 1200, JPEG. Test: Foto mit Orientierung 6 → 900 × 1200; PNG → JPEG mit weißem Hintergrund
- Replace: wie beim Profil; das alte Objekt wird entfernt (getestet)
- Remove: `image_path = null`, dann Objekt löschen (getestet)
- Realtime: B ändert das Aufgabenbild, A zeigt es automatisch

## 6. Anzeige
- private URLs: keine Public-URLs; das DOM enthält nur signierte URLs
- signed URL: ein Sammelaufruf `createSignedUrls`, nur für fehlende oder bald ablaufende Pfade
- Laufzeit: 60 Minuten; Erneuerung ab 10 Minuten Restlaufzeit; Prüfung alle 5 Minuten
- Cache: im Speicher (`path → { url, expiresAt }`), kein `localStorage`; eine Instanz je Familie
- Logout/Familienwechsel: Unmount ruft `clear()` auf, alte Anfragen werden verworfen. Nach Logout und Login in eine andere Familie tauchen keine URLs der vorherigen Familie auf (getestet).

## 7. Datenschutz
- Base64 in DB: NEIN, per CHECK ausgeschlossen (getestet)
- EXIF: entfernt. Die Canvas-Neukodierung schreibt keine EXIF-Daten; der Legacy-Import entfernt APP1–APP15 und COM. Chromium schreibt nur ein sRGB-ICC-Profil (APP2), das keine personenbezogenen Daten enthält.
- GPS-Metadaten: nicht gespeichert. Ein Testfoto mit GPS-IFD ergibt ein gespeichertes Objekt ohne EXIF und ohne GPS. Die Legacy-Bilder hatten ohnehin kein GPS.
- persönliche Dateinamen: NEIN; Zufalls-UUID, der Originalname wird verworfen
- öffentliche URLs: NEIN

## 8. Legacy-Migration
- --include-media:
  - neue Option in `scripts/migrate-legacy-family.mjs` mit `scripts/lib/legacyMedia.mjs`
  - dekodiert und validiert JPEGs und entfernt Metadaten
  - überspringt andere Formate, Bilder über 1200 px und EXIF-Orientierung ≠ 1
  - ohne die Option bleibt das Verhalten unverändert
- Legacy Profilbilder gefunden: 5 (JPEG, 117–200 px, 11–19 KB; alle mit kleinem EXIF-Block, ohne GPS und ohne Orientierung)
- erfolgreich ins Testprojekt importiert: 5/5 Profile mit Storage-Pfad
  - 5 Objekte im Pfad der Migrationsfamilie, 0 Waisen, metadatenfrei
  - owner liest 5/5; fremder Nutzer und anon lesen 0
  - im UI werden 5 Bilder geladen
  - wiederholbar: die alten Medien werden vorher über die API entfernt
- Aufgabenbilder: im Backup 0; der Importweg ist vorbereitet und mit künstlichen Fixtures getestet
- Punkte nach Media-Migration: alle Diffs 0 (5 Profile × 9 Kennzahlen, dazu 270 Zeitreihenprüfungen), Counts identisch, Sync-Test OK, keine Zeremonie; ebenso ohne `--include-media`
- persönliche Bilder committed: NEIN. Nie ausgegeben, nie als Screenshot gespeichert. Im Repo liegt nur das synthetische Testbild `tests/fixtures/synthetic-8x8.jpg` (8 × 8, einfarbig).

## 9. Cleanup
- archivierte Profile/Tasks: Das Bild bleibt erhalten (getestet)
- physisch gelöschte: bei `mode = deleted` wird das Objekt best effort entfernt
- Familienlöschung vorbereitet: `removeFamilyMediaTree(client, familyId)` entfernt alle Objekte unter `families/<id>/` über die Storage-API (getestet). Es muss vor dem Löschen der Familie laufen.
- verwaiste Dateien:
  - Nach einem DB-Fehler wird das neue Objekt sofort entfernt.
  - Waisen lassen sich per SQL finden (Objekt ohne passenden Pfad) und über die API löschen; ein periodischer Job ist für später vorgesehen.
  - Aktuell im Testprojekt: 0 Waisen.

## 10. Tests
- Unit:
  - 113/113, neu darin: `familyMedia` 11, `legacyMedia` 4
  - `familyData` angepasst (`photo_path`/`image_path`)
- Storage/RLS: SQL 32/32 (lokal und Testprojekt); Storage-API 30/30 (alle 15 geforderten Punkte plus Realtime-Signal, Archiv, Familien-Cleanup)
- Integration: bestehende Suites nach der Schemaänderung grün
  - data 18/18, mutations 44/44, admin 60/60, champion-realtime 17/17
  - two-device 27/27, onboarding 29/29, auth 12/12
- Browser: 28/28 (Chromium mobil 393 × 852), nur generierte Bilder, keine Screenshots
  - Login, PIN, Foto wählen, Vorschau, Speichern, Reload, Ändern, Entfernen, Emoji-Fallback
  - Aufgabenbild hinzufügen, ändern, entfernen
  - HEIC, > 10 MB, falscher Typ, EXIF/GPS
  - Logout und Familienwechsel, kein horizontales Scrollen, keine JS-Fehler
- Zwei-Geräte: 8/8
  - A → B Profilbild, B → A Aufgabenbild, neue URL ersetzt die alte
  - Node-Realtime-Signal
  - migrierte Familie mit 5 Bildern, keine Zeremonie
- Migration: ohne und mit `--include-media` jeweils Verify „alle Diffs 0“ und Sync-Test OK; `--dry-run --include-media` ohne Client
- Legacy Regression: 3 Skripte identisch; Legacy-Fototest 8/8 (Base64-Profil- und Aufgabenbilder angezeigt, neues Foto weiterhin Base64-JPEG ≤ 200 px in `app_state`)
- Ergebnis: alles grün

## 11. Sicherheit / Produktion
- service_role: NEIN. Publishable Key, Wegwerf-Konten unter RLS; Schema über MCP nur im Testprojekt.
- Secrets: keine in Repo oder Doku; Zugangsdaten des Migrations-owners nur lokal und ignoriert
- Produktions-Bucket erstellt: NEIN
- Produktionsmutation: NEIN (nur SELECT zur Kontrolle)
- main verändert: NEIN
- Vercel Production verändert: NEIN

## 12. Geänderte Dateien
- neu:
  - `supabase/migrations/20260929100000_family_media_storage.sql`
  - `supabase/tests/media_storage_check.sql`
  - `src/lib/familyMedia.js`
  - `scripts/lib/legacyMedia.mjs`
  - `tests/familyMedia.test.mjs`
  - `tests/legacyMedia.test.mjs`
  - `tests/supabase/family-media.test.mjs`
  - `tests/fixtures/synthetic-8x8.jpg`
  - `docs/appstore/PHASE_05B_MEDIA_STORAGE.md`
  - `docs/appstore/CHATGPT_HANDOFF_PHASE_05B.md`
- geändert:
  - `src/family/FamilyChampion.jsx`: URL-Cache, Speichern mit Bild, Cleanup, `prepareMedia`
  - `src/shared/ChampionApp.jsx`: `FamPhotoPicker` nur für FAMILY; `Avatar` mit Emoji-Fallback; Hinweis bei Teil-Erfolg
  - `src/lib/familyData.js`, `src/lib/familyMapping.js`: `photo_path`/`image_path`
  - `scripts/migrate-legacy-family.mjs`: `--include-media`, Medien-Cleanup, Medienprüfung in `--verify`
  - `tests/familyData.test.mjs`

## 13. Offene Punkte
- Passwort-Reset-Redirects: offen (Phase 5C)
- Kontolöschung: offen. Der Medien-Cleanup-Pfad `removeFamilyMediaTree` ist vorbereitet.
- Eltern-Einladungen: offen
- Produktionsmigration: offen und nicht freigegeben
  - frisches Backup
  - Schema inklusive Media-Migration bewusst freigeben (Testsperre anpassen)
  - Bucket anlegen
  - `--include-media`
  - Entscheidung zum Einlöse-Importweg (siehe Phase 5A)
- Capacitor/iOS: offen. `prepareImage` nimmt File/Blob entgegen und ist damit für ein Kamera-Plugin vorbereitet.
- Premium/StoreKit: offen
- Weiteres:
  - periodischer Cleanup verwaister Objekte
  - HEIC in Nicht-Safari-Browsern ist bewusst nicht unterstützt (verständliche Meldung)
  - gelöschte Objekte bleiben für Berechtigte bis ca. 60 s im Supabase-CDN-Cache abrufbar
  - optional WebP-Ausgabe

## 14. Empfehlung nächste Phase
**Phase 5C – Account & App-Store-Basis**, noch nicht umsetzen:

1. Passwort-Reset mit Redirect-URLs (Web jetzt, iOS-Deep-Link vorbereitet), deutsche Texte, Ablauf- und Fehlerfälle
2. Kontolöschung in der App (App-Store-Pflicht): Bestätigung, Löschung des Auth-Kontos serverseitig (Edge Function oder RPC mit klarer Rechteprüfung)
3. Familie löschen: `removeFamilyMediaTree` vor dem DB-Delete, owner-only, doppelte Bestätigung, danach Logout
4. Auth-Lifecycle: Sitzungsablauf, Refresh, Abmelden auf allen Geräten, Verhalten bei gelöschter Familie oder Mitgliedschaft
5. E-Mail-Änderung mit Bestätigung (optional)
6. Datenschutzfunktionen: Datenexport (JSON) der eigenen Familie, Anzeige der gespeicherten Daten, Hinweise zu Bildern
7. Deep-Link-Vorbereitung für iOS (Universal Links bzw. URL-Scheme für Auth-Redirects), noch ohne Capacitor-Installation
8. Cleanup-Job für verwaiste Medien skizzieren (manuell auslösbar, nur Testprojekt)
9. Tests: Integration (Löschung, Isolation, Medien entfernt), Browser (Flows mobil), Legacy-Regression
10. Produktion weiterhin unverändert; die Produktionsmigration erst danach separat planen und freigeben
