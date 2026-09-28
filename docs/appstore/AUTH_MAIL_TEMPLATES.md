# Auth-Mail-Vorlagen (Deutsch) – Entwurf Phase 6A

- **Wo einstellen:** Supabase → Authentication → Email Templates. Erst nach Freigabe und nach der SMTP-Einrichtung; nichts ist eingestellt.
- **Platzhalter** (Supabase Go-Templates):
  - `{{ .ConfirmationURL }}`: vollständiger Bestätigungs- bzw. Reset-Link. Das Redirect-Ziel kommt aus `emailRedirectTo` bzw. `redirectTo` der App und muss in den Redirect URLs erlaubt sein.
  - `{{ .SiteURL }}`, `{{ .Email }}`: nur bei Bedarf.
- **Gestaltung:** Kurz, funktional, ohne Tracking-Pixel und ohne externe Bilder, damit die Mails keine Daten an Dritte übertragen.

---

## 1. E-Mail-Adresse bestätigen („Confirm signup“)

**Betreff:** Bitte bestätige deine E-Mail-Adresse für Wochen Champion

```html
<p>Hallo,</p>
<p>du hast ein Konto bei <strong>Wochen Champion</strong> erstellt. Bitte bestätige deine E-Mail-Adresse:</p>
<p><a href="{{ .ConfirmationURL }}">E-Mail-Adresse bestätigen</a></p>
<p>Falls du dich über eine Einladung registriert hast, geht es danach direkt mit der Einladung weiter.</p>
<p>Du hast kein Konto erstellt? Dann kannst du diese Nachricht ignorieren – es passiert nichts.</p>
<p>Viele Grüße<br>Wochen Champion</p>
```

**Textversion:**

```
Hallo,

du hast ein Konto bei Wochen Champion erstellt. Bitte bestätige deine E-Mail-Adresse:
{{ .ConfirmationURL }}

Falls du dich über eine Einladung registriert hast, geht es danach direkt mit der Einladung weiter.
Du hast kein Konto erstellt? Dann kannst du diese Nachricht ignorieren – es passiert nichts.

Viele Grüße
Wochen Champion
```

## 2. Passwort zurücksetzen („Reset password“)

**Betreff:** Passwort für Wochen Champion zurücksetzen

```html
<p>Hallo,</p>
<p>für dein Konto bei <strong>Wochen Champion</strong> wurde ein neues Passwort angefordert.</p>
<p><a href="{{ .ConfirmationURL }}">Neues Passwort festlegen</a></p>
<p>Der Link ist nur kurze Zeit gültig und kann nur einmal verwendet werden.</p>
<p>Du hast das nicht angefordert? Dann ignoriere diese Nachricht – dein Passwort bleibt unverändert.</p>
<p>Viele Grüße<br>Wochen Champion</p>
```

**Textversion:**

```
Hallo,

für dein Konto bei Wochen Champion wurde ein neues Passwort angefordert.
Neues Passwort festlegen: {{ .ConfirmationURL }}

Der Link ist nur kurze Zeit gültig und kann nur einmal verwendet werden.
Du hast das nicht angefordert? Dann ignoriere diese Nachricht – dein Passwort bleibt unverändert.

Viele Grüße
Wochen Champion
```

## Hinweise

- **Absender:** From-Name „Wochen Champion“, From-Adresse z. B. `no-reply@<eigene-domain>`. Das setzt SPF, DKIM und DMARC der Domain voraus.
- **Optional später:** Vorlage „Change email address“ (E-Mail ändern). Die App bietet das in v1 nicht an.
- **Einladungen:** versenden in v1 **keine** Mails (Link bzw. Code werden geteilt).
