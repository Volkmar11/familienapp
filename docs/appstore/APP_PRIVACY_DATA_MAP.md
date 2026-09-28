# App Privacy Data Map – Wochen Champion (FAMILY / iOS), Stand Phase 6A

- **Zweck:** technische Grundlage für
  - die Datenschutzerklärung
  - die App-Store-Datenschutzangaben („App Privacy“ / Privacy Nutrition Label)
- Das ist **keine** Rechtsberatung und **keine** endgültige Einreichung.
- Es enthält keine personenbezogenen Nutzerdaten.
- **Grundlage:** Code-Stand `feature/appstore-v1`, Supabase-Schema aus `supabase/migrations/` und die Edge Functions.

## 1. Keine Werbung, keine Analytics, kein Tracking

- **Im Code geprüft:**
  - keine Analytics- oder Werbe-SDKs (keine Abhängigkeiten außer React, supabase-js und Build-Werkzeugen)
  - keine Tracking-Pixel, keine Drittanbieter-Cookies
  - kein Fingerprinting
  - keine Weitergabe an Datenbroker
- **Einzige Drittanfrage aus dem Client neben Supabase:** Google Fonts (Fredoka) von `fonts.googleapis.com` bzw. `fonts.gstatic.com`. Dabei gehen die **IP-Adresse** und der User-Agent an Google.
  - **Empfehlung (Pflicht vor Produktion):** Schrift lokal bündeln; danach entfällt diese Übertragung.
- **App-Store-Einordnung:** „Data Used to Track You“ → **Nein**. Keine Nutzung für Werbung oder Tracking.

## 2. Datenkategorien

| Datenkategorie | Konkrete Felder | Zweck | mit Identität verknüpft | Tracking | Speicherort | Löschung |
|---|---|---|---|---|---|---|
| **Kontaktinfo – E-Mail** | Auth-E-Mail des Elternkontos | Anmeldung, Passwort-Reset, Bestätigung | ja (Konto) | nein | Supabase Auth | Account löschen (sofort) |
| **Identifikatoren – User ID** | Auth-User-ID (UUID) | Zuordnung Konto ↔ Familie | ja | nein | Supabase Auth / `family_members` | Account löschen |
| **Zugangsdaten** | Passwort (nur als Hash beim Auth-Dienst), Eltern-PIN (nur bcrypt-Hash in `private.family_security`) | Anmeldung, Elternbereich | ja | nein | Supabase | mit Konto bzw. Familie |
| **Familie** | Familienname, Rollen (owner/parent), Beitrittsdatum | Familienorganisation, Rechte | ja | nein | `families`, `family_members` | Familie löschen bzw. Konto löschen (letztes Elternkonto) |
| **Andere Eltern sehen** | **E-Mail-Adresse und Rolle der anderen Elternkonten derselben Familie** (Liste „Eltern & Einladungen“) | Verwaltung mehrerer Eltern | ja | nein | über RPC `list_family_adults` | Entfernen, Verlassen, Löschen |
| **Einladungen** | SHA-256-Hash des Tokens, Ersteller, Zeitpunkte (Erstellung, Ablauf, Verwendung, Widerruf); Fehlversuchs-Zeitstempel (Rate-Limit) | Beitritt weiterer Eltern, Missbrauchsschutz | ja | nein | `private.family_invitations`, `private.invitation_attempts` | mit Familie; Fehlversuche nach 1 Tag bereinigt |
| **Kinderprofile** (Kinder haben **kein** Konto) | Name (frei wählbar, auch Spitzname), Emoji, Farbe, optional **Foto** | Darstellung in der App | ja (über die Familie) | nein | `profiles`, Storage `family-media` (privat) | Profil löschen bzw. archivieren, Familie löschen |
| **Fotos** | Profil- und Aufgabenbilder, clientseitig verkleinert, JPEG, **ohne EXIF/GPS** | Darstellung | ja | nein | privater Bucket, Zugriff nur per signierter URL (60 min) | beim Ersetzen, Entfernen oder Familie löschen |
| **App-Nutzungsinhalte** | Aufgaben, Kategorien, Punkte, Erledigungen (Datum, Status), Einlösungen, Belohnungen, Wochen-Champion-Historie | Kernfunktion | ja | nein | Tabellen der Familie | Familie löschen |
| **Audit-Felder** | wer bestätigt bzw. quittiert hat (User-ID), Zeitpunkte | Nachvollziehbarkeit in der Familie | ja | nein | `completions`, `redemptions` | wird bei Kontolöschung auf NULL gesetzt |
| **Lokale Speicherung (Gerät)** | Sitzungstoken (supabase-js, `localStorage`); offener Einladungs-Token (`sessionStorage`, nur bis Annahme bzw. Abbruch) | Angemeldet bleiben; Einladungsfluss | ja | nein | Gerät | Abmelden, Account löschen bzw. Ende der Sitzung |
| **Technische Daten / Logs** | IP-Adresse, Zeitstempel, User-Agent in den Server-Logs von Supabase (API, Auth, Storage, Functions) und Vercel (Webauslieferung); Edge-Function-Logs nur mit Aktion und Anzahlen | Betrieb, Sicherheit, Fehleranalyse | Supabase-Auth-Logs mit Konto verknüpfbar | nein | Supabase, Vercel (Aufbewahrung laut Anbieter bzw. Plan) | automatisch durch die Anbieter |
| **Nicht erhoben** | Standort, Kontakte, Gesundheit, Finanzen/Zahlungen, Browserverlauf, Suchverlauf, Werbe-IDs, Diagnose- bzw. Crash-SDK | – | – | – | – | – |

**Hinweise zu Kinderdaten:**

- Die App wird von Eltern bedient, Kinder haben kein Konto.
- Kinderprofile enthalten nur, was Eltern eintragen. Empfehlung in der App bzw. Datenschutzerklärung: Spitznamen oder Vornamen, Fotos sind optional.
- Im App Store **nicht** die Kategorie „Kids“ wählen, ohne deren Zusatzanforderungen zu prüfen. Die Zielgruppe sind Eltern (Kategorie z. B. „Lifestyle“ oder „Produktivität“).

## 3. Dienstleister (Auftragsverarbeiter, für Datenschutzerklärung und AV-Verträge)

| Dienst | Zweck | Daten | Hinweis |
|---|---|---|---|
| Supabase (Datenbank, Auth, Storage, Realtime, Edge Functions) | Backend | alle App-Daten | Region des Produktionsprojekts im Dashboard prüfen und nennen; DPA abschließen |
| Vercel | Auslieferung der Web-App | IP, Request-Metadaten | DPA; nur statische Auslieferung, keine App-Daten |
| SMTP-Anbieter (noch offen) | Bestätigungs- und Reset-Mails | E-Mail-Adresse, Mailinhalt | Anbieterwahl offen (EU bevorzugt); DPA |
| Google Fonts | Schriftart | IP-Adresse | **vor Produktion entfernen** (lokal bündeln) |
| Apple (später) | App-Vertrieb, ggf. StoreKit | laut Apple | erst ab iOS-Release |

## 4. App-Store-Angaben (Vorschlag, Einordnung nach heutigem Stand)

**Data Linked to You:**

- Contact Info → Email Address (App Functionality)
- Identifiers → User ID (App Functionality)
- User Content → Photos (App Functionality, optional)
- User Content → Other User Content: Aufgaben, Punkte, Profilnamen (App Functionality)

**Weitere Angaben:**

- **Data Not Linked to You:** keine.
- **Data Used to Track You:** keine.
- **Diagnostics:** keine eigene Erhebung. Server-Logs der Anbieter dienen dem Betrieb; Einordnung in Phase 9 final prüfen.

## 5. Rechte der Nutzer (technisch umgesetzt)

| Recht | Umsetzung |
|---|---|
| Löschung | Konto & Sicherheit → „Account dauerhaft löschen“ (sofort; Familien ohne weitere Eltern samt Bildern). Familie löschen nur durch owner (PIN plus Passwort). |
| Berichtigung | Profile, Aufgaben usw. sind in der App änderbar. E-Mail-Änderung ist in v1 nicht in der App; per Support. |
| Auskunft / Datenexport | in v1 **per Support** (kein Export-Knopf); Datenexport steht als Punkt C (nach v1) im Feature-Freeze |
| Widerruf der Einladung, Entfernen | in der App (owner) |

## 6. Offene Angaben vom Nutzer (für die Datenschutzerklärung)

- **Verantwortlicher:** Name, ladungsfähige Anschrift, Kontakt-E-Mail
- **Supabase-Region** des Produktionsprojekts
- **SMTP-Anbieter**
- **Speicherdauer der Logs:** laut Anbieter-Plan
- **Support-Kontakt**
- ob ein Datenschutzbeauftragter nötig ist; bei privatem bzw. kleinem Anbieter in der Regel nicht, bitte prüfen
