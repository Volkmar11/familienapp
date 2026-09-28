# Produktions-Auth-Konfiguration – Wochen Champion (Soll für Phase 6B2)

- **Stand 6B1:** Nur vorbereitet. In der Produktion wurde nichts geändert. Die Produktion hat heute 0 Auth-User; Auth wird dort erst mit dem FAMILY-Cutover genutzt.
- **Umsetzung:** In 6B2 bei STOP 7, im Supabase-Dashboard des Produktionsprojekts (Authentication).
- **Prüfung:** Jeder Punkt wird nach dem Setzen per Screenshot oder Probe belegt, ohne Secrets.

## 1. Anmeldung und Registrierung

| Einstellung | Soll | Begründung / Probe |
|---|---|---|
| E-Mail-Provider | aktiv | einzige Anmeldeart |
| Confirm email | **AN** | Konto erst nach Bestätigung nutzbar. Probe: Registrierung → „Bitte bestätige zuerst …“ |
| Secure email change | AN | Adresswechsel muss an beiden Adressen bestätigt werden |
| Minimum password length | **8** | entspricht `MIN_PASSWORD_LENGTH = 8` in `src/lib/auth.js`. Probe: 7 Zeichen → deutsche Meldung „mindestens 8 Zeichen“ |
| Password requirements | Kleinbuchstaben + Großbuchstaben + Ziffern **optional** – Empfehlung: keine Zusatzregeln, dafür Leaked Password Protection | Die App prüft nur die Länge. Strengere Regeln würden serverseitig mit `weak_password` abgelehnt und von `toGermanAuthError` als „Passwort ist zu schwach …“ angezeigt. |
| Leaked Password Protection (HaveIBeenPwned) | **AN** (Pro-Plan-Funktion; falls nicht verfügbar: dokumentiert AUS) | Meldung in der App: „Dieses Passwort ist aus Datenlecks bekannt …“ |
| Anonymous sign-ins | AUS | nicht benötigt; die Edge Functions lehnen anonyme Nutzer zusätzlich ab |
| Manual linking / Social Provider | AUS | nicht benötigt |
| Allow new users to sign up | AN | Familien registrieren sich selbst |

## 2. URLs

| Einstellung | Soll |
|---|---|
| Site URL | `https://<produktions-domain>` (Wert kommt vom Nutzer; noch nicht festgelegt) |
| Redirect URLs | `https://<produktions-domain>`, `https://<produktions-domain>/**` (Reset, Bestätigung, Einladung `?invite=`) |
| iOS (später) | Universal Link bzw. `VITE_NATIVE_AUTH_REDIRECT_URL`, erst in der iOS-Phase ergänzen |
| Vercel-Preview-URLs | **nicht** in der Produktions-Redirect-Liste. Previews nutzen das Testprojekt. |

## 3. Sitzungen und Tokens

| Einstellung | Soll |
|---|---|
| JWT expiry | Standard (3600 s) |
| Refresh token rotation | AN (Standard), Reuse interval Standard |
| Re-Authentifizierung für Löschen | wird in der App erzwungen (Edge Functions verlangen eine Passwort-Anmeldung ≤ 5 min, `REAUTH_MAX_AGE_SECONDS`) |

## 4. Rate Limits (Authentication → Rate Limits)

- Mit eigenem SMTP gelten die Supabase-Standardwerte.
- Empfehlung:
  - E-Mails pro Stunde auf die Kapazität des SMTP-Anbieters abstimmen (für eine Familie genügen ≤ 30/h)
  - Token-Verifizierung und Anmeldung auf Standard lassen
- Die App zeigt bei Überschreitung „Zu viele Versuche …“.

## 5. E-Mail-Vorlagen (deutsch)

Die Vorlagen werden im Dashboard gepflegt; Texte stehen in `SMTP_SETUP_CHECKLIST.md`, Abschnitt 4. Pflicht-Vorlagen:

- Confirm signup
- Reset password
- Change email address

Hinweise:

- Einladungen laufen über App-Links, nicht über Supabase-Invite-Mails.
- Magic Link wird nicht genutzt.

## 6. Nachweis nach dem Setzen (6B2, STOP 7)

1. Registrierung mit Wegwerfadresse des Nutzers (keine `@example.com`, sonst keine Zustellung) → Bestätigungsmail kommt über den eigenen SMTP an; Link führt auf die Produktions-Domain.
2. Passwort mit 7 Zeichen → Ablehnung im Client (deutsch). Direkt per API mit 7 Zeichen → Server lehnt ebenfalls ab.
3. „Passwort vergessen“ → Mail kommt an → neues Passwort (≥ 8) setzen → Anmeldung klappt.
4. Das Wegwerfkonto anschließend über „Konto löschen“ in der App entfernen.
5. Release-Check im Profil `production` mit `WC_GO_SMTP_CONFIRMED=yes` erst nach Punkt 1–3.
