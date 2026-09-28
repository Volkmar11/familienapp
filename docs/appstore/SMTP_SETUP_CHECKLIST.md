# SMTP-Einrichtung – Checkliste (externe GO-Voraussetzung für Phase 6B2)

- **Stand 6B1:** Kein Anbieter gebucht, keine Domain oder DNS geändert, keine Zugangsdaten gesetzt. Alles in diesem Dokument ist eine **menschliche Aufgabe**; Claude Code fragt nur den Status ab.
- **Warum Pflicht:** Der eingebaute Supabase-Mailversand ist nur für Tests gedacht. Er ist stark limitiert und stellt nur an Team-Adressen zu. Ohne eigenen SMTP kommen Bestätigungs- und Reset-Mails bei Familien nicht zuverlässig an.

## 1. Entscheidungen (Nutzer)

- [ ] Absender-Domain festgelegt, z. B. die spätere Produktions-Domain. **Noch offen.**
- [ ] SMTP-Anbieter gewählt, DSGVO-konform mit EU-Serverstandort und Auftragsverarbeitungsvertrag (AVV)
  - Kandidaten, unverbindlich und nicht gebucht: Brevo, Mailjet, Amazon SES (eu-central-1), Postmark
  - Die Entscheidung trifft der Nutzer.
- [ ] AVV mit dem Anbieter abgeschlossen; der Anbieter ist in der Datenschutzerklärung genannt.

## 2. DNS (beim Domain-Anbieter, Nutzer)

- [ ] SPF-Eintrag enthält den Anbieter (`v=spf1 include:<anbieter> ~all`)
- [ ] DKIM-Schlüssel des Anbieters eingetragen und beim Anbieter verifiziert
- [ ] DMARC mindestens `v=DMARC1; p=none; rua=mailto:<adresse>`, später `quarantine`
- [ ] Optional: eigene Return-Path- bzw. Bounce-Domain

## 3. Supabase (Produktionsprojekt, erst 6B2 / STOP 7)

Einzutragen unter Authentication → Emails → SMTP Settings. Das Passwort nur dort eintragen, nie im Chat oder in Dateien.

- [ ] Enable custom SMTP: AN
- [ ] Host, Port (587 STARTTLS bevorzugt), Benutzer, Passwort bzw. API-Key
- [ ] Absender: `no-reply@<domain>`, Name „Wochen Champion“
- [ ] Minimum interval between emails: Standard (60 s)
- [ ] Rate Limit „E-Mails pro Stunde“ an den Anbieter angepasst (siehe `PRODUCTION_AUTH_CONFIG.md`, Abschnitt 4)

## 4. Vorlagen (deutsch, im Dashboard)

**Confirm signup**

- Betreff: „Bitte bestätige deine E-Mail-Adresse für Wochen Champion“
- Text: „Hallo! Bitte bestätige deine E-Mail-Adresse, damit du deine Familie in Wochen Champion anlegen oder ihr beitreten kannst: {{ .ConfirmationURL }}. Wenn du dich nicht registriert hast, kannst du diese E-Mail ignorieren.“

**Reset password**

- Betreff: „Neues Passwort für Wochen Champion“
- Text: „Über diesen Link kannst du ein neues Passwort (mindestens 8 Zeichen) festlegen: {{ .ConfirmationURL }}. Der Link ist nur kurz gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail – dein Passwort bleibt unverändert.“

**Change email address**

- Betreff: „E-Mail-Adresse für Wochen Champion ändern“
- Text: „Bitte bestätige die Änderung deiner E-Mail-Adresse: {{ .ConfirmationURL }}“

Allgemein:

- Keine Tracking-Pixel und kein Link-Tracking; beim Anbieter deaktivieren, da Links sonst umgeschrieben werden.
- Keine personenbezogenen Daten außer der Empfängeradresse.

## 5. Abnahme (STOP 7)

- [ ] Testmail „Bestätigung“ an eine echte Adresse des Nutzers kommt an. Absender, SPF/DKIM „pass“ im Mail-Header, kein Spam-Ordner.
- [ ] Testmail „Passwort zurücksetzen“ kommt an; der Link führt auf die Produktions-Domain und das Setzen klappt.
- [ ] Mail-Tester (z. B. mail-tester.com) mit Wert ≥ 9/10 (optional)
- [ ] Danach den Release-Check mit `WC_GO_SMTP_CONFIRMED=yes` ausführen. Nur der Mensch setzt diesen Wert.

## 6. Status 6B1

| Punkt | Status |
|---|---|
| Anbieter | offen (menschliche Entscheidung) |
| Domain / DNS | offen |
| Supabase SMTP | nicht gesetzt (verboten in 6B1) |
| Vorlagen | Texte vorbereitet (oben) |
| PRE-GO-Check | `EXTERN` – blockiert 6B2-Start, bis erledigt |
