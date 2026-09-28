# Phase 5B – Family Media Storage

Stand 28.09.2026. Umsetzung ausschließlich im Supabase-Testprojekt `wochen-champion-test` (`otejitifgcrrwmudrnhs`).
Produktion (`gkkzjmszcjivtaygbmfw`) unverändert: kein Bucket, keine Migration, keine Bilder. Dieses Dokument enthält keine Bilder, Namen oder Base64-Daten.

## 1. Architektur

```
<input type="file" accept="image/*">   (später: Capacitor-Kamera → File/Blob)
        │  File/Blob
        ▼
familyMedia.prepareImage()             Browser: dekodieren (createImageBitmap, EXIF-Orientierung),
        │  JPEG-Blob ohne Metadaten      zuschneiden/verkleinern (Canvas), JPEG neu kodieren
        ▼  (erst beim Speichern)
familyMedia.replaceEntityMedia()       1. Upload → family-media (privat)
        │                              2. DB: profiles.photo_path / tasks.image_path (nur Pfad)
        │                              3. altes Objekt löschen
        ▼
Realtime-Signal (family_sync) → Reload auf allen Geräten → loadFamilyData (nur Pfade)
        ▼
createSignedUrlCache().resolve()       signierte URLs (60 min, Sammelaufruf, Cache im Speicher)
        ▼
ChampionApp: member.photo / task.photo = signierte URL, sonst Emoji
```

* **Storage-Schicht:** `src/lib/familyMedia.js`. Die UI enthält keine Storage-Details; ein statischer Test prüft, dass `FamilyChampion.jsx` weder `storage.from` noch `createSignedUrl(s)` aufruft.
* **Verdrahtung:** `src/family/FamilyChampion.jsx`, pro Familie ein URL-Cache, `actions.prepareMedia`, Speichern mit Bild.
* **UI:** `src/shared/ChampionApp.jsx` mit `FamPhotoPicker`. Der nur in FAMILY aktive Picker erscheint im Profil- und im Aufgaben-Editor. LEGACY nutzt unverändert `PhotoUpload` mit Base64.

## 2. Bucket

| Eigenschaft | Wert |
|---|---|
| Name | `family-media` |
| öffentlich | **nein** (`public = false`), keine Public-URLs |
| Dateigröße | max. 2 MB je Objekt (serverseitig) |
| MIME-Typen | `image/jpeg`, `image/webp` (serverseitig); der Client lädt nur JPEG hoch |
| Anlage | Migration `supabase/migrations/20260929100000_family_media_storage.sql` (Testsperre `app.migration_target = 'test'`), nur im Testprojekt angewandt |

## 3. Pfadstruktur

```
families/<family_id>/profiles/<profile_id>/<zufalls-uuid>.jpg
families/<family_id>/tasks/<task_id>/<zufalls-uuid>.jpg
```

* Streng per Regex geprüft, in der DB (`private.is_media_path`) und im Client (`isMediaPath`) identisch:
  * genau 5 Segmente
  * UUIDs in Kleinbuchstaben
  * Endung `jpg` oder `webp`
  * kein `..`, kein führender `/`, keine Klartextnamen
* Dateinamen sind `crypto.randomUUID()`. Namen und Aufgabentitel kommen nie im Pfad vor. Jede Änderung erzeugt einen neuen Pfad (Cache-Busting ohne Query-Parameter).
* Die `family_id` wird serverseitig aus dem Pfad gelesen: `private.media_family_id(name)` → `(storage.foldername(name))[2]::uuid`, nur wenn der Pfad gültig ist.

## 4. RLS

Policies auf `storage.objects`, nur für `bucket_id = 'family-media'` und nur für die Rolle `authenticated`:

| Aktion | Regel |
|---|---|
| SELECT | `private.is_family_member(media_family_id(objects.name))` |
| INSERT | `has_family_role(…, owner/parent)` und der Datensatz (Profil bzw. Aufgabe aus Segment 4) existiert in genau dieser Familie |
| UPDATE | owner/parent für die alte (USING) und die neue (WITH CHECK) `family_id`, kein Verschieben in fremde Familien |
| DELETE | owner/parent der Familie; Supabase sperrt zusätzlich direkte SQL-DELETEs (`storage.protect_delete`), gelöscht wird nur über die Storage-API |
| anon | keine Policy, also kein Zugriff |

* Es werden die vorhandenen Helfer `private.is_family_member` und `private.has_family_role` (SECURITY DEFINER) wiederverwendet.
* **Gefundener und behobener Fehler:** In der Unterabfrage der INSERT-Policy traf das unqualifizierte `name` die Spalte `profiles.name` statt `storage.objects.name`. Dadurch wäre jeder Upload abgelehnt worden. Alle Verweise lauten jetzt `objects.name`.

## 5. DB-Felder

| Tabelle | Neu | Regel |
|---|---|---|
| `profiles` | `photo_path text null` | CHECK: gültiger Medienpfad, Segment 2 = eigene `family_id`, Segment 3 = `profiles`, Segment 4 = eigene `id` |
| `tasks` | `image_path text null` | analog mit `tasks` |
| `profiles.avatar_url` / `tasks.image_url` | – | nie genutzt; per CHECK auf NULL festgeschrieben, damit dort weder Base64 noch URLs landen |

* Zusätzlich prüft der Trigger `private.check_media_reference` (SECURITY INVOKER), dass ein neuer Pfad auf ein **existierendes** Objekt im Bucket zeigt.
* In der Datenbank stehen damit nur stabile Pfade: keine URL, keine signierte URL, kein Base64. Geprüft ist das per SQL-Check und im Integrationstest.
* Indizes: keine neuen. Die Pfade werden nur über den Primärschlüssel geladen, und Storage indiziert `(bucket_id, name)` selbst.

## 6. Bildverarbeitung

| | Profilbild | Aufgabenbild |
|---|---|---|
| Zuschnitt | quadratisch, mittig | proportional |
| max. Größe | 600 × 600 | längste Kante 1200 |
| vergrößern | nie | nie |
| Ausgabe | JPEG, Qualität 0,82 (bei Bedarf 0,72, 0,6) | JPEG, dieselben Qualitätsstufen |
| Eingabe | JPEG, PNG, WebP, HEIC/HEIF (wenn dekodierbar); max. 10 MB | dieselben Formate und Grenzen |

* **Dekodieren:** `createImageBitmap(file, { imageOrientation: "from-image" })`. Die EXIF-Drehung wird angewandt; im Test wird ein Foto mit Orientierung 6 korrekt hochkant (900 × 1200). Als Fallback dient `HTMLImageElement.decode()`.
* **Transparenz:** PNG-Transparenz wird auf weißen Hintergrund gelegt, nicht schwarz.
* **HEIC:** Safari auf iPhone und iPad dekodiert HEIC nativ und liefert bei `<input type="file">` in der Regel ohnehin JPEG. Chrome und Firefox auf dem Desktop können HEIC meist nicht dekodieren; dann erscheint eine verständliche deutsche Meldung (Einstellung „Maximale Kompatibilität“ oder als JPEG teilen). Es wurde bewusst **keine** HEIC-Bibliothek hinzugefügt, weil sie mehrere hundert KB groß wäre und Safari das Format selbst kann. Der Browsertest prüft die Meldung für nicht dekodierbares HEIC.
* **Fehler ohne Absturz:** zu groß (> 10 MB), falscher Typ, leer oder unlesbar führen jeweils zu einer deutschen Meldung im Editor. Das bisherige Bild bleibt unverändert.

## 7. Profilbilder

* Die Bearbeitung liegt im PIN-geschützten Elternbereich unter Kind bearbeiten:
  * „Foto wählen“ öffnet `accept="image/*"`; iOS bietet dann Mediathek oder Kamera an.
  * Es erscheint sofort eine Vorschau (`blob:`-URL).
  * „Foto ändern“ und „Foto entfernen“ sind möglich; das Emoji bleibt wählbar.
* **Hochgeladen wird erst beim Speichern.** Reihenfolge beim Ersetzen:
  1. Bild vorbereiten
  2. neues Objekt hochladen
  3. `photo_path` setzen. Das Update ist geschützt: es greift nur, wenn der Pfad noch dem Stand beim Öffnen entspricht; sonst gibt es eine Konfliktmeldung.
  4. Reload
  5. altes Objekt löschen

  Scheitert Schritt 3, wird das neue Objekt entfernt und das alte Bild bleibt erhalten (getestet).
* **Entfernen:** erst `photo_path = null`, dann Reload, dann das Objekt löschen. Scheitert das Löschen, bleiben die App-Daten korrekt; protokolliert wird nur der technische Code (`[media] remove fehlgeschlagen <code>`), ohne personenbezogene Daten.
* Scheitert nur das Bild, bleibt das Profil gespeichert. Dann erscheint der Hinweis „Gespeichert – aber: …“.
* **Anzeige:** Das Foto wird bevorzugt angezeigt, sonst das Emoji. Lädt eine URL nicht (abgelaufen oder Fehler), fällt `Avatar` per `onError` auf das Emoji zurück.

## 8. Aufgabenbilder

* Im FAMILY-Aufgabeneditor gibt es „Bild hinzufügen (optional)“ mit Vorschau, Ändern und Entfernen. Ein Bild ist keine Pflicht.
* Die Auswahl eines Emojis entfernt im FAMILY-Modus nicht mehr das Bild; LEGACY verhält sich unverändert.
* Anzeige in der Aufgabenliste und in der Verwaltung: Bild (36 bzw. 24 px) statt Emoji. Ohne Bild bleibt die Darstellung unverändert.
* Upload-Reihenfolge und Fehlerbehandlung wie bei Profilbildern (`image_path`).

## 9. Signed URLs / Cache

* Laufzeit **60 Minuten**. Erneuert wird, sobald weniger als 10 Minuten übrig sind.
* Nach jedem Laden wird **ein** Sammelaufruf `createSignedUrls` gemacht, nur für fehlende oder bald ablaufende Pfade. Zusätzlich wird alle 5 Minuten geprüft.
* Der Cache `path → { url, expiresAt }` liegt **nur im Speicher**, ohne `localStorage`. Pro Familie gibt es eine Instanz im Lebenszyklus von `FamilyChampion` (`key = familyId`). Bei Logout oder Familienwechsel wird die Komponente entfernt und `clear()` aufgerufen; laufende Anfragen der alten Generation werden verworfen.
* Nach einem Ersetzen wird der alte Pfad invalidiert. Neue Pfade bekommen neue URLs, alte URLs werden nicht weiterverwendet (getestet).
* Hinweis: Supabase liefert gelöschte Objekte bis zu etwa 60 Sekunden aus dem CDN-Cache, aber nur an Berechtigte. Maßgeblich ist die Objektliste; die signierte URL für einen gelöschten Pfad wird sofort verweigert.

## 10. Realtime

* Die Bildänderung ist ein `UPDATE` auf `profiles` bzw. `tasks`. Der bestehende Trigger `bump_family_sync` erhöht dabei `family_sync.version`, das Realtime-Signal wird über Node-WebSockets bestätigt. Danach folgt der Reload auf allen Geräten, und die signierte URL wird für den **neuen** Pfad aufgelöst.
* **Mehrgeräte-Test:**
  * A ändert das Profilbild, B zeigt es automatisch.
  * B ändert das Aufgabenbild, A zeigt es automatisch.
  * A ersetzt erneut, B zeigt die neue URL; die alte taucht nicht mehr auf.
* In Chromium läuft die Aktualisierung über den Vordergrund-Reload, weil der Egress-Proxy dieser Umgebung keine WebSocket-Upgrades erlaubt (bekannt seit Phase 4C2B2). Das Realtime-Signal selbst ist in Node geprüft.

## 11. Legacy-Migration

* `scripts/migrate-legacy-family.mjs --include-media`, nur im Testprojekt; die Produktionssperre gilt wie in Phase 5A. Ohne die Option bleibt das Verhalten unverändert.
* `scripts/lib/legacyMedia.mjs`: Data-URL dekodieren, JPEG validieren (SOI, SOF, EOS, Abmessungen), Metadaten-Segmente APP1–APP15 und COM entfernen. Die Bilddaten werden unverändert übernommen, weil Node keinen Canvas hat. Übersprungen werden:
  * andere Formate als JPEG
  * Bilder mit mehr als 1200 px Kantenlänge
  * Bilder mit EXIF-Orientierung ≠ 1, weil das Entfernen sie sonst kippen würde
* Danach wird hochgeladen und `photo_path` bzw. `image_path` gesetzt. Beim Wiederholen werden zuerst die Medien der alten Testfamilie über die API entfernt, dann wird neu importiert.
* **Ergebnis (nur Zahlen):**

  | Kennzahl | Wert |
  |---|---|
  | Legacy-Profilbilder | 5 (JPEG, 117–200 px, 11–19 KB) |
  | davon mit EXIF-Block | 5, alle ohne GPS und ohne Orientierung |
  | EXIF nach Bereinigung | 0 |
  | importiert | 5/5 Profile mit Storage-Pfad |
  | Objekte im Bucket | 5, alle unter `families/<migrationsfamilie>/profiles/` |
  | Waisen | 0 |
  | owner kann lesen | 5/5 |
  | fremder Nutzer / anon | 0 |
  | öffentliche URL | HTTP 400 |
  | im UI geladen | 5 verschiedene Bilder |

* Aufgabenbilder: im Backup 0. Der Importweg ist vorbereitet und mit künstlichen Fixtures getestet.
* **Punkte nach Medienmigration:** alle Diffs 0 (5 Profile × 9 Kennzahlen, dazu 270 Zeitreihenprüfungen), Counts identisch, Sync-Test OK, keine Zeremonie. Das gilt mit und ohne `--include-media`.
* Private Bilder wurden nie committet, ausgegeben oder als Screenshot gespeichert.

## 12. Datenschutz / EXIF

* Die Canvas-Neukodierung schreibt **keine EXIF-, GPS- oder Kameradaten**. Das ist geprüft mit einem Testfoto mit EXIF-GPS-IFD und Orientierung 6: Das gespeicherte Objekt enthält kein APP1/EXIF und kein GPS.
* Chromium schreibt ein APP2-sRGB-Farbprofil (ICC). Das enthält keine personenbezogenen Daten.
* Legacy-Import: Metadaten werden serverfern im Skript entfernt (Ergebnis: 0 Segmente).
* Es werden keine Metadaten absichtlich gespeichert. Dateinamen sind Zufalls-UUIDs, `contentType` ist fest `image/jpeg`, und der ursprüngliche Dateiname wird verworfen.
* Es gibt keine öffentlichen URLs. Signierte URLs leben nur im Speicher, 60 Minuten lang.

## 13. Storage Cleanup

| Fall | Verhalten |
|---|---|
| Ersetzen | altes Objekt wird nach erfolgreichem DB-Update gelöscht |
| Entfernen | DB-Pfad wird geleert, dann das Objekt gelöscht; ein Fehler beim Löschen ändert die App-Daten nicht |
| Profil/Aufgabe archiviert | Bild **bleibt** (Historie, Wiederherstellen) – getestet |
| Profil/Aufgabe physisch gelöscht | bei `mode = deleted` entfernt `FamilyChampion` das Objekt best effort |
| DB-Update scheitert | das neue Objekt wird sofort wieder entfernt |
| Familie löschen (Phase 5C) | `removeFamilyMediaTree(client, familyId)` listet und entfernt alle Objekte unter `families/<id>/` über die Storage-API – getestet. Muss **vor** dem Löschen der Familie laufen, weil danach die Berechtigung fehlt. |

* **Verwaiste Objekte**, etwa nach einem Absturz zwischen Upload und DB-Update, lassen sich per SQL finden: Objekte ohne passenden `photo_path` bzw. `image_path`. Gelöscht werden sie über die Storage-API. Ein periodischer Cleanup-Job ist für später vorgesehen; aktueller Stand im Testprojekt: 0 Waisen.

## 14. Tests

| Bereich | Ergebnis |
|---|---|
| Unit: `familyMedia` (Pfade, Validierung, Zuschnitt, Ersetzen/Entfernen inkl. Fehlerpfade, URL-Cache, Mapping, statische Prüfungen) | 11/11 |
| Unit: `legacyMedia` (Dekodieren, EXIF/GPS entfernen, Importplan inkl. künstlicher Aufgabenbilder, Dry-Run ohne Client) | 4/4 |
| Unit gesamt | 113/113 |
| SQL-RLS-Check `supabase/tests/media_storage_check.sql` (lokal und Testprojekt; Subtransaktion wird zurückgerollt, 0 Reste) | 32/32 |
| Storage-Integration `tests/supabase/family-media.test.mjs` (echte Storage-API; alle 15 geforderten Punkte plus Realtime-Signal, Archiv, Familien-Cleanup) | 30/30 |
| Browser `ui5b` (Login, PIN, Profil- und Aufgabenbild wählen/Vorschau/speichern/Reload/ändern/entfernen, Emoji-Fallback, HEIC, > 10 MB, falscher Typ, EXIF/GPS, Logout/Familienwechsel, kein horizontales Scrollen) | 28/28 |
| Zwei Geräte und Realtime (inkl. Anzeige der 5 migrierten Profilbilder) | 8/8 |
| Migration ohne Medien / mit Medien: Verify und Sync-Test | OK / OK |
| Bestehende Integrationssuites nach der Schemaänderung (data, mutations, admin, champion-realtime, two-device, onboarding, auth) | 18/18 · 44/44 · 60/60 · 17/17 · 27/27 · 29/29 · 12/12 |

## 15. Legacy Regression

* Die drei Legacy-Regressionsskripte liefern identische Ergebnisse zur Baseline.
* Neuer Legacy-Fototest mit synthetischen Bildern, 8/8:
  * Base64-Profil- und Aufgabenbilder werden weiter angezeigt.
  * Der Editor nutzt weiter `PhotoUpload`.
  * Ein neues Foto wird weiterhin als Base64-JPEG mit max. 200 px in `app_state` gespeichert.
  * Andere Fotos bleiben unverändert.
  * Im LEGACY gibt es keine Storage-URLs.
* Das Produktionsformat ist unverändert.

## 16. Voraussetzungen nächste Phase

* **Phase 5C – Account & App-Store-Basis:**
  * Kontolöschung und Familie löschen, mit `removeFamilyMediaTree` vor dem Löschen der Familie
  * Passwort-Reset-Redirects
  * Auth-Lifecycle
* Produktion (erst mit der Produktionsmigration):
  * Migration `20260929100000_family_media_storage.sql` bewusst freigeben (Testsperre anpassen)
  * Bucket anlegen
  * `--include-media` mit einem frischen Backup
* Offen und später:
  * periodischer Cleanup verwaister Objekte
  * optional WebP-Ausgabe, sobald alle Ziel-Safaris sie zuverlässig kodieren
  * natives Kamera-Plugin (Capacitor), das File/Blob an `prepareImage` übergibt
* **Speicherabschätzung** (typische Handyfotos; synthetische Testbilder sind kleiner):

  | Posten | Größe |
  |---|---|
  | Profilbild 600 × 600 | ca. 40–90 KB |
  | Aufgabenbild bis 1200 px | ca. 120–300 KB |
  | Familie mit 5 Profilbildern und 30 Aufgabenbildern | ca. 0,5 MB + 6–9 MB, also unter 10 MB |
  | 100 Familien | unter 1 GB, im Rahmen des Supabase-Free-Kontingents |

  Ersetzte Bilder werden gelöscht, Speicher wächst also nicht durch Änderungen. Archivierte Einträge behalten ihr Bild.
