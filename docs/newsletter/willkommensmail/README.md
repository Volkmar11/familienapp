# Willkommensmail für bestätigte Newsletter-Abonnenten – Entwurf 1

> **Status:** überarbeitbarer erster Entwurf vom 27.11.2026. **Keine Versandfreigabe.**
> Es ist nichts versendet, keine Automatik aktiviert, keine App und keine Datenbank geändert.
> Die Mail **ersetzt nicht** die sachliche Double-Opt-in-Bestätigungsmail. Sie folgt erst *nach* der Bestätigung.

## Dateien

| Datei | Zweck |
| --- | --- |
| `willkommensmail.html` | HTML-Vorlage mit Variablen (Tabellenlayout, Inline-CSS, max. 600 px) |
| `willkommensmail.txt` | vollständige Textversion (gleiche Inhalte, gleiche Variablen außer `LOGO_URL`) |
| `assets/wochen-champion-logo-mail.png` | Logo für die Mail: Kopie des bestehenden App-Icons `public/icon-512x512.png`, nur mit transparenten Ecken, 240 × 240 px (Anzeige 120 px), 21 KB. Kein neues Logo. |
| `vorschau-erzeugen.mjs` | erzeugt die lokale Vorschau aus den Vorlagen mit sicheren Beispieldaten |
| `vorschau/willkommensmail-vorschau.html` | lokale Vorschau im Browser (mit gelbem Hinweisbalken „Entwurf“) |
| `vorschau/willkommensmail-vorschau.txt` | Textversion mit Beispieldaten |
| `vorschau/screenshots/` | Bildschirmfotos: 390 px, 1280 px, 390 px ohne Bilder |

**Vorschau neu erzeugen** (nach Textänderungen an den Vorlagen), auf dem Mac im Terminal:

```bash
cd ~/wochenchampion-website
node newsletter/willkommensmail/vorschau-erzeugen.mjs
open newsletter/willkommensmail/vorschau/willkommensmail-vorschau.html
```

Der Ordner `newsletter/` gehört nicht zur Website und wird beim Upload nicht mitgenommen (das Upload-ZIP enthält nur die Seitendateien).

## Überarbeitung mit ChatGPT (Paket für Carmen)

Ordner `paket-carmen/` (auch als ZIP weitergegeben):

- `0-Anleitung-fuer-Carmen.txt`: Schritt-für-Schritt-Anleitung
- `1-Prompt-fuer-ChatGPT.txt`: Start-Prompt mit inhaltlichen und technischen Regeln (Tabellenlayout, Inline-CSS, Platzhalter unverändert, keine Preise oder Versprechen); ChatGPT öffnet die Datei in Canvas mit Vorschau
- `willkommensmail-entwurf-1.html`: die Vorlage. `{{LOGO_URL}}` ist hier durch eine öffentliche, auf den Commit festgelegte GitHub-Adresse des Logos ersetzt, damit das Logo in der Vorschau erscheint. Alle anderen Platzhalter bleiben.
- `so-sieht-sie-aus.png`: Referenzbild bei 390 px

**Rückweg:** Carmen schickt `willkommensmail-carmen.html` zurück. Vor der Übernahme: Unterschiede zur Vorlage prüfen, Logo-Adresse wieder durch `{{LOGO_URL}}` ersetzen, Platzhalter und Tabellenlayout kontrollieren, Textversion `willkommensmail.txt` angleichen, Vorschau neu erzeugen und bei 390 px und Desktopbreite ansehen.

## Betreff und Vorschauzeile

**Betreff (Vorschlag):** Willkommen bei Wochen Champion – so gelingt der Start

Alternativen:
- Schön, dass du da bist: deine ersten Schritte mit Wochen Champion
- Willkommen! Kleine Aufgaben, gemeinsame Erfolge

**Vorschauzeile** (steht als versteckter Text oben in der HTML-Datei):
Drei einfache Schritte für den Start und Ideen für Aufgaben und Belohnungen – passend für jedes Alter.

## Variablen

Schreibweise `{{NAME}}` ist neutral gewählt. Vor dem Versand an die Platzhalter-Syntax des gewählten Versanddienstes anpassen.

| Variable | Inhalt | Vorschau-Wert | Hinweis |
| --- | --- | --- | --- |
| `{{LOGO_URL}}` | **öffentliche HTTPS-Adresse** der Datei `assets/wochen-champion-logo-mail.png` | `../assets/wochen-champion-logo-mail.png` (lokal) | Noch keine Adresse festgelegt. Muss `https://` sein und ohne Anmeldung abrufbar. Ohne Bild bleibt die Mail lesbar (Alternativtext „Wochen Champion“, Überschrift ist echter Text). |
| `{{UNSUBSCRIBE_URL}}` | persönlicher Abmeldelink | `#platzhalter-abmeldelink` | setzt in der Regel der Versanddienst je Empfänger ein |
| `{{IMPRESSUM_URL}}` | Impressum | `#platzhalter-impressum` | Impressum ist auf www.wochenchampion.de live, aber nur als Fenster (`<dialog>`) per Knopf, ohne eigene Adresse. Für die Mail eine direkt aufrufbare Adresse schaffen (z. B. eigene Unterseite) – noch nicht vorhanden. |
| `{{DATENSCHUTZ_URL}}` | Datenschutzerklärung inkl. Newsletter-Abschnitt | `#platzhalter-datenschutz` | wie Impressum: live nur als Fenster ohne eigene Adresse; ein Newsletter-Abschnitt fehlt dort bisher. |
| `{{ABSENDER_NAME}}` | Anbieter laut Impressum | `Volkmar Solutions` | aus den Projektunterlagen (Bundle-ID `de.volkmarsolutions…`, `docs/appstore/APPLE_BUSINESS_NEXT_STEPS.md`). Bei einem Einzelunternehmen zusätzlich Vor- und Nachname des Inhabers prüfen. |
| `{{ABSENDER_ANSCHRIFT}}` | ladungsfähige Anschrift bzw. Geschäftsadresse | `[Postanschrift – wird erst beim Versand eingesetzt]` | **nicht in Git** (Projektregel: keine persönlichen Daten im Repository). Nur im Versanddienst hinterlegen. |

Fest im Text: Kontaktadresse `info@wochenchampion.de` (als `mailto:`-Link).

## Inhaltlicher Aufbau

1. Kopf: Logo, drei goldene Sterne, „Willkommen bei Wochen Champion!“, „Schön, dass du dabei bist.“
2. Anrede „Hallo und herzlich willkommen!“ und persönliche Begrüßung von Marcus (Alltagserfolge sichtbar machen, ohne Perfektionsdruck)
3. „In drei Schritten zum Start“ (1. wenige klare Aufgaben, 2. Belohnungen gemeinsam wählen, 3. loben und anpassen)
4. „Ideen für jedes Alter“: 4–6, 7–10, 11–14 Jahre; je drei Aufgaben und zwei Belohnungsideen (gemeinsame Zeit, Mitbestimmung, kleine Erlebnisse; keine Anschaffungen)
5. „Vier Tipps für einen entspannten Start“
6. Abschluss mit Antwortmöglichkeit und Gruß „Viel Freude beim gemeinsamen Ausprobieren! / Marcus von Wochen Champion“
7. Fußzeile: Grund des Empfangs, Abmeldelink, Impressum, Datenschutz, Absender

Bewusst **nicht** enthalten: Preise, Gratisphase oder deren Enddatum, App-Store- oder Download-Links, Funktionsversprechen, Aussagen über garantierte pädagogische Wirkungen.

## Technik

- Tabellenlayout mit `role="presentation"`, Inline-CSS, Breite fließend bis max. 600 px; zusätzlich ein kleiner `<style>`-Block mit Mobil-Anpassungen (der Inhalt funktioniert auch ohne ihn).
- Systemschriften, kein JavaScript, keine externen Schriften, kein Trackingpixel, keine Klickverfolgung; einzige externe Ressource beim Versand ist das Logo.
- `color-scheme: light`, damit Mailprogramme die Farben möglichst nicht umkehren. Das hängt aber vom Programm ab.
- HTML-Größe ca. 27 KB, also deutlich unter der Grenze von etwa 102 KB, ab der Gmail lange Mails erfahrungsgemäß kürzt (Erfahrungswert aus der Praxis, nicht offiziell belegt).
- Kontraste: Fließtext `#2a2550` auf Weiß, Links `#4338ca` unterstrichen, Fußzeile `#4b4870` auf `#f4f3fa`; Gold nur als Fläche bzw. Akzent, nicht als Textfarbe auf Weiß.

## Was geprüft wurde – und was nicht

- **Geprüft:** lokal in Chromium (Playwright) bei 390 px und 1280 px Breite und bei 390 px mit blockierten Bildern. Kein waagerechtes Scrollen, Container 374 px bzw. 600 px breit, keine externen Anfragen, kleinste Schrift 13 px.
- **Nicht geprüft:** Apple Mail, iOS Mail, Gmail (Web/App), Outlook (Windows/Mac/Web), Dunkelmodus der Mailprogramme. Dafür vor dem Versand Testmails an eigene Postfächer schicken oder ein Vorschau-Werkzeug des Versanddienstes nutzen.

## Offene Angaben vor einem echten Versand

1. **Newsletter-Ergebnis aus Baustein 58 abgleichen.** Weder im GitHub-Stand noch im Supabase-Testprojekt ist ein Newsletter zu finden. Auf dem Mac (`~/familienapp/docs/appstore/AKTUELLER_PROJEKTSTAND.md`, nur gelesen) steht: Willkommensmail verbindlich vorgemerkt, Newsletter nur freiwillig mit Double-Opt-in, Hostinger-SMTP ungeprüft. Ein Ergebnisdokument zu Baustein 58 wurde nicht gefunden. Prüfen: Versanddienst, Wortlaut der Einwilligung, Absender.
2. **Logo öffentlich hosten** und `{{LOGO_URL}}` setzen (HTTPS, ohne Anmeldung erreichbar). Naheliegend wäre www.wochenchampion.de – erst nach deinem Upload-Befehl.
3. **Impressum und Datenschutz direkt verlinkbar machen.** Beide sind live, aber nur als Fenster auf der Startseite. Die Datenschutzerklärung braucht zusätzlich einen Newsletter-Abschnitt (Versanddienst, Double-Opt-in-Protokoll, Widerruf).
4. **Absenderangaben vervollständigen:** Name laut Impressum, Anschrift (empfohlen: Geschäfts- oder Postfachadresse statt Privatanschrift) – nur im Versanddienst, nicht in Git.
5. **Reply-To setzen:** Das Postfach `info@wochenchampion.de` ist laut Website-Unterlagen aktiv. Als Antwortadresse eintragen, sonst stimmt „Antworte einfach auf diese E-Mail“ nicht.
6. **Absenderdomain authentifizieren:** SPF, DKIM, DMARC (siehe `docs/appstore/AUTH_MAIL_TEMPLATES.md`, Abschnitt Hinweise, auf dem App-Store-Zweig).
7. **Abmeldung:** Abmeldelink des Versanddienstes einsetzen; zusätzlich den Header `List-Unsubscribe` mit One-Click (RFC 8058) aktivieren, falls der Dienst das anbietet.
8. **Versandauslöser** im Versanddienst festlegen (z. B. einmalig direkt nach erfolgreicher Bestätigung). Erst nach Freigabe aktivieren.
9. **Textprüfung durch Marcus:** besonders die persönliche Begrüßung („selbst Familienvater“) und die Altersbeispiele.
10. **Testversand** an eigene Postfächer (iPhone Mail, Gmail, ggf. Outlook), Bilder an und aus.

## Quellen

Die Quellen sind Hinweise, **keine Rechtsberatung**. Die Links konnten aus der Cloud-Umgebung nicht abgerufen werden; bitte einmal anklicken.

- Impressumspflicht: [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html)
- Einwilligung in Werbe-E-Mails und Abbestellmöglichkeit: [§ 7 UWG](https://www.gesetze-im-internet.de/uwg_2004/__7.html)
- Widerruf so einfach wie Einwilligung: [Art. 7 DSGVO](https://dsgvo-gesetz.de/art-7-dsgvo/), Widerspruch gegen Direktwerbung: [Art. 21 DSGVO](https://dsgvo-gesetz.de/art-21-dsgvo/)
- Absender-Anforderungen von Gmail (Authentifizierung, One-Click-Abmeldung): [Google – E-Mail-Absenderrichtlinien](https://support.google.com/a/answer/81126)
- One-Click-Abmeldung: [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058)
