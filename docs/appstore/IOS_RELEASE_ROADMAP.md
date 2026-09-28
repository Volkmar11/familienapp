# iOS Release Roadmap – Wochen Champion (Stand Phase 6A)

**Erwartete Reihenfolge** (aus dem Auftrag) mit Bewertung. Die Grundreihenfolge passt. Zwei Anpassungen sind empfohlen:

1. **Entscheidungen vorziehen:** Domain, SMTP-Anbieter, Bundle-ID und Rechtstexte sind Voraussetzungen für 6B (SMTP braucht eine Absenderdomain) **und** für 7B (Universal Links). Sie sollten noch vor bzw. zu Beginn von 6B fallen, nicht erst in 7.
2. **Phase 7A kann parallel zu 6B beginnen:** Capacitor-Grundgerüst, Xcode-Projekt, Simulator-Test gegen das **Testprojekt**. Das hängt nicht von der Produktionsumstellung ab und verkürzt die Gesamtzeit. Der Geräte-Test gegen Produktion (7B) kommt nach dem Cutover.

## Phase 6B – Produktionsbackend vorbereiten / kontrollierter Cutover

- **Vorbereitung im Code:**
  - Bootstrap-Generator
  - Produktionsmodus des Migrationsskripts
  - Produktionsvariante der temporären Importfunktion
  - Fonts lokal bündeln
  - `MIN_PASSWORD_LENGTH` 8
  - CORS-Dev-Origins abschaltbar machen
  - `create_family` einschränken
- **Konfiguration:**
  - Auth (Confirm Email, Leaked Password Protection, Redirects)
  - SMTP plus Templates
  - Edge Functions plus Secrets
  - Rechtslinks
- **Ausführung:** strikt nach `PRODUCTION_CUTOVER_RUNBOOK.md`, STOP 1–8.
- **Ergebnis:** `https://familienapp.vercel.app` (bzw. die eigene Domain) läuft als FAMILY auf Produktion; LEGACY bleibt Rollback-Ziel.

## Phase 7A – Capacitor und Xcode-Projekt

- Capacitor installieren, Plattform `ios`, `appId` = gewählte Bundle-ID, `webDir` = `dist`.
- Build-Profil für native Builds:
  - `VITE_BACKEND_MODE=family`
  - `VITE_INVITE_BASE_URL` gesetzt
  - `VITE_NATIVE_AUTH_REDIRECT_URL` vorerst leer
- Info.plist: Kamera- und Fotomediathek-Texte (Deutsch).
- `App.appStateChange` → bestehender Vordergrund-Handler.
- Externe Links per `@capacitor/browser`; Tastatur-Resize-Modus festlegen.
- Icons und Splash (Nutzerentscheidung).
- Simulator-Test gegen das Testprojekt: Login, Realtime, Bilder, Teilen, Lebenszyklus.

## Phase 7B – Deep Links, echte iPhone-Funktionen, Geräte-Test

- **Associated Domains** (`applinks:<domain>`) und `apple-app-site-association` auf der Domain.
- Adapter `appUrlOpen` → bestehende Einladungs- und Recovery-Logik (Konzept: Audit 6A, Abschnitt 22). PKCE für den nativen Reset prüfen.
- Supabase-Redirect-URLs um die iOS-Links erweitern.
- **Gerätetest auf dem eigenen iPhone** (Development- bzw. Ad-hoc-Build):
  - Safe Area, Tastatur, Kamera und Mediathek
  - Teilen, Zwischenablage
  - Hintergrund und Vordergrund, Realtime nach dem Aufwachen
  - Einladungs- und Reset-Link aus Mail bzw. Nachrichten
  - Account-Löschung (Wegwerf-Konto)
- Tippziele 44 pt im Elternbereich (FAMILY-Stil).

## Phase 8 – Premium / Trial / StoreKit

- **Geschäftsmodell festlegen:**
  - was ist kostenlos, was Premium
  - Testzeitraum
  - Familien- bzw. Kontobezug (wer zahlt, gilt es für alle Eltern der Familie?)
- StoreKit 2 (z. B. über ein Capacitor-Plugin bzw. RevenueCat), serverseitige Belegprüfung (Edge Function) und Status je Familie in der DB.
- Web-Version: Umgang mit Käufen (Apple-Regeln zu externen Käufen beachten).
- **Hinweis:** Wer ohne Premium in den Store geht, kann Phase 8 nach dem ersten Release machen. Dann sind 9 und 8 tauschbar. Die Entscheidung liegt beim Nutzer; technisch ist v1 ohne Premium release-fähig.

## Phase 9 – TestFlight, App-Store-Assets, Einreichung

- App Store Connect:
  - App-Datensatz, Kategorie (Lifestyle bzw. Produktivität, nicht „Kids“ ohne Prüfung)
  - Altersfreigabe
  - Datenschutzangaben (Grundlage: `APP_PRIVACY_DATA_MAP.md`)
  - Support-, Privacy- und Marketing-URL
- Screenshots (6,9"/6,5", ggf. iPad, falls unterstützt), Beschreibung, Keywords.
- Review-Hinweise:
  - Demo-Konto mit Demo-Familie und Demo-PIN
  - Pfad zur Account-Löschung
  - Hinweis, dass Kinder kein Konto haben
- TestFlight intern (Familie), dann Einreichung.
