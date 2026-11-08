# KI-Fortbildung in Moodle – Einrichtung

Ziel: Kolleginnen und Kollegen melden sich in Moodle an, sehen eine schöne Übersicht der drei Module und buchen einen Termin. Die Platzzahl pro Termin legen Sie selbst fest.

**Wichtig vorab:** Eine HTML-Seite allein kann keine Buchungen speichern. Die schöne Seite (`moodle-kursseite.html`) ist das „Schaufenster“. Die Buchung selbst macht Moodle. Die Buttons auf der Seite verlinken auf die Buchungs-Aktivität.

## Weg A – ohne Plugin (sofort machbar, empfohlen für den Start)

Sie brauchen nur Trainer-Rechte in einem Kurs.

1. **Kurs anlegen lassen**, z. B. „KI-Fortbildung“ (macht die Moodle-Administration, falls Sie keine Kurse anlegen dürfen).
2. **Selbsteinschreibung einschalten**: Kurs → Teilnehmer/innen → Einschreibemethoden → „Selbsteinschreibung“ aktivieren. So kommen alle Kollegen allein in den Kurs.
3. **Pro Modul eine „Abstimmung“ anlegen** (Aktivität hinzufügen → Abstimmung):
   - Name: „Modul 1 – Termin buchen“
   - Optionen: je Termin eine Option, z. B. „Mi 25.11.2026, 14:30–16:00“
   - **„Anzahl der Antworten begrenzen“ → Ja**, und bei jeder Option die Höchstzahl eintragen (z. B. 12). Das ist Ihre einstellbare Teilnehmerzahl.
   - „Abstimmung ändern erlauben“ → Ja (dann kann man umbuchen)
   - Ergebnisse: „Ergebnisse nicht anzeigen“ oder „nach der Antwort“, je nachdem, ob Namen sichtbar sein sollen
   - Moodle zeigt bei jeder Option automatisch „Antworten / Begrenzung“ an, also die belegten Plätze.
   - Optional: Abstimmungsende = Vortag des letzten Termins
4. **Link kopieren**: Die Abstimmung öffnen, die Adresse aus der Browserzeile kopieren (sieht aus wie `https://…/mod/choice/view.php?id=123`).
5. **Kursseite einfügen**: Aktivität „Textfeld“ (oben im Kurs) oder „Textseite“ anlegen → im Editor auf Quelltext/HTML (`</>`) umschalten → Inhalt von `moodle-kursseite.html` einfügen → `#LINK-MODUL-1` usw. durch die kopierten Links ersetzen → Termine/Platzzahlen im Text anpassen → speichern.
6. **Teilnehmerliste**: In jeder Abstimmung oben rechts „Antworten ansehen“ → Download als Excel/ODS.

Vorteile: kein Admin nötig, Plätze werden automatisch gesperrt, wenn voll.
Grenzen: keine Warteliste, keine automatische Erinnerungs-Mail, kein Teilnahme-Zertifikat.

## Weg B – Plugin „Booking“ (mod_booking, Wunderbyte)

Wenn die Moodle-Administration ein Plugin installiert: echtes Buchungssystem mit Platzzahl, **Warteliste**, Bestätigungs- und Erinnerungsmails, Kalendereintrag, Anwesenheit, Zertifikat. Wird an vielen Schulen und Hochschulen im deutschsprachigen Raum genutzt.
Benötigt zuerst `local_wunderbyte_table`, dann `mod_booking`.

## Wenn das Layout nach dem Speichern „kaputt“ aussieht

Moodle filtert HTML beim Speichern. Die Seite ist bewusst so gebaut, dass sie das meist übersteht (nur Inline-Styles und Bootstrap-Klassen, kein `<style>`, kein JavaScript). Falls Farbverläufe oder Spalten fehlen:
- Die Administration kann „Vertrauenswürdige Inhalte“ (`enabletrusttext`) aktivieren; dann bleibt das HTML von Trainer/innen unverändert.
- Ohne Bootstrap-Spalten stehen die drei Module untereinander – das bleibt trotzdem gut lesbar.

## Dateien

- `moodle-kursseite.html` – zum Einfügen in Moodle
- `vorschau.html` – dieselbe Seite zum Ansehen im Browser

## Quellen

- Moodle Docs, Abstimmung FAQ (Begrenzung der Antworten): https://docs.moodle.org/de/Abstimmung_FAQ
- ZHAW, Moodle-4.4-Anleitung Abstimmung (Beispiel „max. 15 Teilnehmende“): https://moodle.zhaw.ch/pluginfile.php/238914/mod_resource/content/9/Moodle_44_Anleitung_Abstimmung.pdf
- Moodle Docs, Selbsteinschreibung: https://docs.moodle.org/de/Selbsteinschreibung
- Plugin Booking: https://moodle.org/plugins/mod_booking · Doku: https://docs.moodle.org/en/Booking_module
- Moodle Docs, Trusted content: https://docs.moodle.org/en/Trusted_content
- Inhalt Modul 3 – KMK-Handlungsempfehlung KI (10.10.2024): https://www.kmk.org/fileadmin/veroeffentlichungen_beschluesse/2024/2024_10_10-Handlungsempfehlung-KI.pdf
- Inhalt Modul 3 – EU-KI-Verordnung 2024/1689: https://eur-lex.europa.eu/eli/reg/2024/1689/oj
