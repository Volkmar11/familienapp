# Apple: nächste Schritte nach Eröffnung des Geschäftskontos

> Stand: 27.11.2026. Erstellt aus dem Git-Stand von `feature/appstore-v1` und einer **nur lesenden** Prüfung des Supabase-Testprojekts `wochen-champion-test`.
> Enthält keine Secrets, Kontonummern, Steuernummern oder persönlichen Daten.

## 1. Ausgangslage

### 1.1 GitHub ist rund zwei Monate hinter dem echten Stand

- **Auf GitHub:** Der letzte Commit auf `feature/appstore-v1` ist `47c9391` vom 29.09.2026 (Abnahme von Phase 7A auf dem Mac).
- **Im Testprojekt:** 39 Migrationen sind neuer, die letzten vom **24.11.2026**:
  - Push-Benachrichtigungen (`push_redemption_notifications`, `push_tables_rls`)
  - Extraspiele (`special_games`)
  - Geräteverknüpfung (`device_links`) und Kinder-API (`child_api`)
  - Abo-Logik: `store_access_poc`, `store_sandbox_status`, `store_sandbox_status_fix`
- **Folgerung:** Der aktuelle Code liegt vermutlich nur lokal auf dem Mac.
  - Er sollte zuerst gepusht werden. Das ist eine Sicherung, und erst danach können Cloud-Sitzungen weiterarbeiten.
  - Befehl: `git push origin feature/appstore-v1`

### 1.2 Was das Testprojekt zur Abo-Logik zeigt

| Punkt | Befund |
|---|---|
| Bundle ID | `de.volkmarsolutions.wochenchampion` |
| Produkt-IDs (genau 2, per Check erzwungen) | `de.volkmarsolutions.wochenchampion.family.monthly`, `de.volkmarsolutions.wochenchampion.family.yearly` |
| Testzeitraum | 14 Tage, serverseitig verwaltet (`private.family_access`), nicht als Apple-Einführungsangebot |
| Zugelassene Umgebung | nur `Sandbox` |
| Erfasste Abos / Store-Ereignisse | **0 / 0**: Es gab noch keinen echten Sandbox-Kauf |
| Edge Functions | `child-media`, `push-redemption`, `delete-account`, `delete-family` |
| Store-Prüfung | eine Funktion `store-verify` ist in der SQL-Logik vorgesehen, aber **nicht deployt** |
| Push | 1 iOS-Gerät registriert (10.11.2026) |

### 1.3 Warum das Geschäftskonto jetzt den Weg freimacht

- **Ohne Geschäftsbereich kein Sandbox-Kauf:** Sandbox-Käufe funktionieren erst, wenn das **Paid Apps Agreement** aktiv ist. Dazu gehören Vertrag, Steuerformulare und Bankkonto.
  - Quelle: [WWDC23 – Explore testing in-app purchases](https://developer.apple.com/videos/play/wwdc2023/10142/)
  - Forenbericht: Produkte kamen erst nach vollständig ausgefülltem „Business“-Bereich zurück, siehe [Apple Developer Forums](https://developer.apple.com/forums/thread/808757)
- **Folge im Testprojekt:** Genau das passt zum Befund „0 Abos“: Die Abo-Logik ist gebaut, konnte gegen Apple aber noch nicht getestet werden.

## 2. Checkliste in der richtigen Reihenfolge

Die Schritte A bis E erledigt der **Account Holder** (du) selbst unter <https://appstoreconnect.apple.com> bzw. <https://developer.apple.com/account>. Claude hat dort keinen Zugriff.

### A. Mitgliedschaft prüfen (5 Minuten)

- [ ] **Status prüfen:** developer.apple.com/account → *Membership details*
  - Ist das Apple Developer Program (99 USD/Jahr) aktiv?
  - Ist es als **Einzelperson** oder als **Organisation** angemeldet?
- **Einzelunternehmen:** Ein Einzelunternehmen (auch mit Namen wie „Volkmar Solutions“) ist für Apple **keine juristische Person**.
  - Apple verlangt dann die Anmeldung als Einzelperson.
  - Im Store steht als Anbieter dein bürgerlicher Name.
- **Organisation:** Nur eine eingetragene Gesellschaft (z. B. UG, GmbH) kann sich als Organisation mit D-U-N-S-Nummer anmelden.
- Quellen:
  - [Enrollment](https://developer.apple.com/help/account/membership/program-enrollment/)
  - [D-U-N-S Number](https://developer.apple.com/help/account/membership/D-U-N-S/)

### B. Paid Apps Agreement, Steuer, Bank (30–45 Minuten, danach Wartezeit)

1. [ ] App Store Connect → **Business** → Zeile *Paid Apps* → **View and Agree to Terms**. Die Annahme lässt sich nicht rückgängig machen.
   - Quelle: [Sign and update agreements](https://developer.apple.com/help/app-store-connect/manage-agreements/sign-and-update-agreements/)
2. [ ] **Steuerformulare:** Der Fragebogen führt zum passenden US-Formular. Für Anbieter außerhalb der USA ist das ein **W-8** (Einzelperson: W-8BEN, Gesellschaft: W-8BEN-E).
   - Du brauchst die deutsche Steuer-Identifikationsnummer bzw. die Steuernummer.
   - Über das Doppelbesteuerungsabkommen DE–USA wird der US-Quellensteuerabzug reduziert. Bitte von Steuerberatung bestätigen lassen.
   - Quelle: [Provide tax information](https://developer.apple.com/help/app-store-connect/manage-tax-information/provide-tax-information/)
3. [ ] **Bankkonto:** Business → *Bank Accounts* → **Add Bank Account**.
   - Eintragen: IBAN des Geschäftskontos und die Daten der kontoführenden Bank, nicht die einer Zwischenbank.
   - Der Kontoinhaber muss **exakt** wie der Name im Apple-Konto geschrieben sein.
   - Apple verarbeitet die Bankdaten erst, wenn die Steuerformulare vollständig sind.
   - Quelle: [Enter banking information](https://developer.apple.com/help/app-store-connect/manage-banking-information/enter-banking-information/)
4. [ ] Warten, bis *Paid Apps* den Status **Active** zeigt. Erst dann laden Sandbox-Produkte.

### C. EU-Händlerstatus nach dem Digital Services Act (10 Minuten)

- [ ] Business → *Compliance* → **Trader Status**.
  - Mit Abos bist du **Trader**.
  - Adresse, Telefon und E-Mail werden auf der EU-Produktseite **öffentlich angezeigt**.
  - Einzelpersonen dürfen statt der Wohnadresse ein **Postfach** angeben. Das ist empfehlenswert.
- Ohne verifizierten Händlerstatus wird die App im EU-Store nicht angeboten.
- Quellen:
  - [DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)
  - [Apps without trader status will be removed](https://developer.apple.com/news/?id=einwn76m)

### D. App Store Small Business Program (5 Minuten)

- [ ] Anmelden: Dann beträgt die Provision **15 % statt 30 %**. Das gilt für neue Entwickler und bis 1 Mio. USD Erlös pro Jahr.
- Quelle: [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/)

### E. Identifier und App-Datensatz (15 Minuten)

- [ ] **App ID prüfen:** developer.apple.com/account → *Certificates, IDs & Profiles* → *Identifiers*.
  - Die explizite App ID `de.volkmarsolutions.wochenchampion` muss vorhanden sein.
  - Capabilities: **Push Notifications** (läuft offenbar schon), **In-App Purchase**, später **Associated Domains** (Phase 7B).
  - Quelle: [Register an App ID](https://developer.apple.com/help/account/identifiers/register-an-app-id/)
- [ ] **App-Datensatz anlegen:** App Store Connect → *Apps* → **+** → *New App*.
  - Plattform iOS, Name „Wochen Champion“ (falls belegt, Alternative wählen), Primärsprache Deutsch, Bundle ID wie oben, SKU frei (z. B. `wochenchampion-ios`).
  - Quelle: [Add a new app](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)

### F. Abos anlegen, genau passend zur Datenbank (20 Minuten)

- [ ] App → *Monetization* → **Subscriptions**.
  - **Eine** Abo-Gruppe anlegen, z. B. „Wochen Champion Familie“.
  - Darin zwei Abos mit **exakt** diesen Produkt-IDs:
    - `de.volkmarsolutions.wochenchampion.family.monthly` (1 Monat)
    - `de.volkmarsolutions.wochenchampion.family.yearly` (1 Jahr)
  - Für jedes Abo: Preis, deutscher Anzeigename, Beschreibung, Review-Screenshot.
- **Wichtig:** Die erste Abo-Gruppe und das erste Abo müssen zusammen mit einer neuen App-Version eingereicht werden.
- Quelle: [Offer auto-renewable subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions/)

### G. Sandbox-Tester (5 Minuten)

- [ ] App Store Connect → *Users and Access* → **Sandbox** → neuen Tester anlegen.
  - Die E-Mail-Adresse darf **noch kein Apple-Account** sein.
  - Am iPhone: Einstellungen → Entwickler → Sandbox-Apple-Account anmelden, **nicht** im normalen Apple-Account.
- In der Sandbox läuft 1 Abo-Monat ≈ 5 Minuten, maximal 12 Verlängerungen.
- Quellen:
  - [Create a Sandbox Apple Account](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/create-a-sandbox-apple-account/)
  - [Manage Sandbox settings](https://developer.apple.com/help/app-store-connect/test-in-app-purchases/manage-sandbox-apple-account-settings/)

### H. Server-Anbindung für `store-verify` (zusammen mit Claude)

- [ ] **In-App-Purchase-Key:** App Store Connect → *Users and Access* → *Integrations* → *In-App Purchase* → **Generate**.
  - Die `.p8`-Datei lässt sich **nur einmal** herunterladen. Sie gehört in den Passwortmanager, nie ins Repo und nie in den Chat.
  - Notieren: **Key ID** und **Issuer ID**.
  - Quelle: [Generate keys for In-App Purchases](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases/)
- [ ] **Als Secrets hinterlegen:** Key und IDs als Edge-Function-Secrets im **Testprojekt** speichern, im Supabase-Dashboard → Edge Functions → Secrets. Dann `store-verify` deployen.
- [ ] **Server-Benachrichtigungen:** App → *App Information* → *App Store Server Notifications*.
  - Eine **Sandbox-URL** setzen, Version 2, auf die Benachrichtigungs-Funktion des Testprojekts.
  - Die Produktions-URL bleibt zunächst leer. Ohne eigene Sandbox-URL schickt Apple beide Umgebungen an die Produktions-URL.
  - Quelle: [Enter server URLs for App Store Server Notifications](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/enter-server-urls-for-app-store-server-notifications/)

### I. Erster Sandbox-Kauf am iPhone

- [ ] **Scheme prüfen:** In Xcode muss im Scheme *StoreKit Configuration* auf **None** stehen. Sonst testest du lokal statt in der Sandbox.
- [ ] **Kaufen und prüfen:** Monatsabo kaufen. Danach müssen in `private.store_subscriptions` eine Zeile mit `environment = 'Sandbox'` und in `private.store_events` Ereignisse stehen.
- [ ] **Weitere Fälle:** Verlängerung (5 Minuten), Kündigung, Wiederherstellen, zweites Elternkonto derselben Familie.

## 3. Offene Entscheidungen, die vor der Einreichung fallen müssen

1. **Testzeitraum:** Die 14 Tage werden heute serverseitig verwaltet.
   - Laut Richtlinien bieten Apps mit automatisch verlängerbaren Abos einen Gratiszeitraum **über App Store Connect** an, also als Einführungsangebot.
   - Ein eigener Testzeitraum kann im Review beanstandet werden.
   - Empfehlung: 14 Tage zusätzlich bzw. stattdessen als Einführungsangebot (*Free Trial*) an beiden Abos einrichten.
   - Quelle: [App Review Guidelines 3.1.1/3.1.2](https://developer.apple.com/app-store/review/guidelines/#in-app-purchase)
2. **Preise:** Die Werbeseite (`vermarktung.html`) nennt 2,99 €/Monat und 29,99 € einmalig.
   - Die Datenbank kennt nur Monats- und Jahresabo, keinen Einmalkauf.
   - Entscheiden: Jahrespreis festlegen, Einmalkauf streichen oder als drittes Produkt aufnehmen. Für ein drittes Produkt ist eine Migration nötig, weil `cardinality(product_ids) = 2` erzwungen wird.
3. **„Webshop“:** Die Werbeseite verweist für Abos auf einen Webshop.
   - Innerhalb der iOS-App darf nicht ohne Weiteres auf externe Kaufwege verwiesen werden (Richtlinie 3.1.1 / 3.1.3).
   - In der App deshalb nur Apple-Käufe anbieten.
4. **Altersfreigabe:** Seit 2026 gibt es neue Pflichtfragen. Die neuen Deskriptoren („Shared Location“, „Dating and Relationships“) müssen bis **12.01.2027** beantwortet sein.
   - Kategorie: Lifestyle bzw. Produktivität, nicht „Kids“ (siehe `IOS_RELEASE_ROADMAP.md`).
   - Quellen:
     - [Updated age ratings](https://developer.apple.com/news/?id=ks775ehf)
     - [App Store Connect release notes](https://developer.apple.com/help/app-store-connect/release-notes/)
5. **Rechtliches in Deutschland:** Impressum, Datenschutzerklärung und eine Support-URL müssen vor der Einreichung öffentlich erreichbar sein (Release-Check `production`). Steuerliche Einordnung der Einnahmen und, als Lehrkraft, die Anzeige bzw. Genehmigung der Nebentätigkeit beim Dienstherrn bitte vorab klären.

## 4. Danach (Fahrplan unverändert, siehe `IOS_RELEASE_ROADMAP.md`)

- **7B:** Universal Links und Associated Domains (braucht eigene Domain), Gerätetest
- **6B2:** Produktionsumstellung nach `PRODUCTION_CUTOVER_RUNBOOK.md`
  - In `private.access_config` dann `allowed_environments` um `Production` erweitern
- **9:** TestFlight intern, Screenshots, Datenschutzangaben (`APP_PRIVACY_DATA_MAP.md`), Review-Hinweise mit Demo-Konto, Einreichung zusammen mit den Abos
