# KI-Umfrage Engelbert-Bohn-Schule – Auswertungsschema & Umsetzungshinweise

Begleitdokument zur Microsoft-Forms-Umfrage „Künstliche Intelligenz an unserer Schule".

---

## 1. Kurzbeschreibung

Anonyme Online-Befragung des Kollegiums (ca. 55 Lehrkräfte) im Rahmen einer GLK.
22 Fragen in 8 Abschnitten, Bearbeitungszeit 10–15 Minuten. Ziel: Stimmungsbild
(Offenheit, Hoffnungen, Sorgen, Selbstsicherheit) **und** Entscheidungsgrundlage
(Vorerfahrung, Toolnutzung, Bezahlaccounts, gewünschte Unterstützung, Fortbildungsbedarf,
Anforderungen an eine schulische KI-Lösung). Freiwillige Angaben zu Fachbereich,
Funktion und Name am Ende.

---

## 2. So importieren Sie die Umfrage in Microsoft Forms

Microsoft Forms hat **kein** offenes „Formular-Dateiformat" zum direkten Upload.
Es gibt aber drei praktikable Wege – der erste ist am schnellsten:

**Weg A – KI-/Word-Import (empfohlen, wenn verfügbar):**
1. forms.office.com öffnen → **„Neues Formular"**.
2. Oben rechts auf **„Importieren"** bzw. die Copilot-Funktion **„Aus Word/PDF erstellen"**.
3. Die Datei `KI-Umfrage_Engelbert-Bohn-Schule.docx` hochladen.
4. Forms erkennt Fragen und Antwortoptionen automatisch – danach Fragetypen
   (Matrix/Likert, Mehrfachauswahl, Skala) und Pflichtfelder prüfen und nachjustieren.

> Hinweis: Der Word-/Copilot-Import ist je nach Microsoft-365-Lizenz unterschiedlich
> verfügbar und erkennt Matrixfragen nicht immer perfekt. Bitte das Ergebnis kurz prüfen.

**Weg B – „Fragen importieren" (Schnellimport):**
Forms bietet teilweise „Fragen importieren". Hier kann der reine Fragenkatalog
aus der Tabelle (Abschnitt 3) zeilenweise übernommen werden.

**Weg C – manuell anlegen (immer möglich, ca. 30–40 Min.):**
Die Word-Datei bzw. die Tabelle unten Frage für Frage in Forms eintragen.
Für die Likert-Blöcke den Fragetyp **„Likert"** wählen.

Anschließend: **„Teilen" → „Antworten sammeln"**, „Name aufzeichnen" auf
**„Anonym"** stellen, Link kopieren und an das Kollegium versenden.

---

## 3. Vollständige Fragenliste

| Nr. | Abschnitt | Frageformulierung | Fragetyp | Antwortoptionen | Pflicht | Auswertungshinweis |
|----|-----------|-------------------|----------|-----------------|---------|--------------------|
| 1 | A Bekanntheit | Wie gut kennen Sie die folgenden KI-Tools/Begriffe? | Matrix/Likert | je Zeile: Kenne ich nicht / Schon gehört / Schon ausprobiert / Nutze ich regelmäßig (Zeilen: ChatGPT, Claude, Gemini, Copilot, Perplexity, Fobizz, F13, schulKI, Eduhu, LLM, KI-Chatbots, KI-Agenten, Prompting) | Ja | Bekanntheitsgrad je Tool; gestapelte Balken; identifiziert „blinde Flecken" |
| 2 | A | Häufigkeit private KI-Nutzung | Einfachauswahl | Nie / Selten / Gelegentlich / Regelmäßig / Täglich | Ja | Nutzungsintensität privat; Kreisdiagramm |
| 3 | A | Welche KI-Tools nutzen Sie bereits? | Mehrfachauswahl | Toolliste + „Andere" (Freitext) + „keine" | Ja | Marktanteile der Tools; Balken; Basis für Lizenzentscheidung |
| 4 | A | Zugriffsweg (Browser/App/Desktop) | Mehrfachauswahl | Browser / App / Desktop / gar nicht | Nein | technische Rahmenbedingungen |
| 5 | A | Kostenlose oder kostenpflichtige Version? | Einfachauswahl | nur kostenlos / Abo privat bezahlt / Abo dienstlich / keine | Ja | **Zahlungsbereitschaft & vorhandene Bezahlaccounts** |
| 6 | B Beruflich | Häufigkeit beruflicher KI-Nutzung | Einfachauswahl | Nie … Täglich | Ja | Reifegrad beruflich; Vergleich mit Frage 2 |
| 7 | B | Für welche Aufgaben bereits genutzt? | Mehrfachauswahl | 13 Aufgaben + „Sonstiges" + „noch gar nicht" | Nein | Einsatzfelder; zeigt Quick-Win-Bereiche |
| 8 | C Selbsteinschätzung | Eigene Kompetenzen (Sicherheit, Prompting, Prüfen, Chancen/Grenzen, Datenschutz) | Matrix/Likert (5-stufig) | Trifft nicht zu … Trifft voll zu | Ja | Mittelwerte je Item; deckt Kompetenzlücken auf |
| 9 | D Einstellung | Offenheit, Nutzen, Entlastung, Qualität, Vorbehalte, Wunsch nach Regeln | Matrix/Likert (5-stufig) | Trifft nicht zu … Trifft voll zu | Ja | Mittelwerte; Vorbehalt-Item als Akzeptanz-Indikator |
| 10 | D | Hoffnungen/Erwartungen | Freitext lang | — | Nein | Cluster nach Themen (Entlastung, Qualität …) |
| 11 | E Bedenken | Wichtigkeit von 9 Aspekten (Datenschutz, Recht, Belastung, Zeit, Qualität, Täuschung, Prüfungen, Abhängigkeit, faire Nutzung) | Matrix/Likert (5-stufig) | Unwichtig … Sehr wichtig | Ja | Mittelwerte → Priorität der Sorgen; **indirekt** formuliert |
| 12 | E | Wichtigkeit klarer Leitlinien | Skala 1–5 | 1–5 | Ja | Mittelwert; Bedarf an Governance |
| 13 | E | Bedenken/offene Fragen | Freitext lang | — | Nein | Cluster; qualitative Tiefe |
| 14 | F Wünsche | Anforderungen an schulische KI-Lösung | Mehrfachauswahl | 13 Anforderungen + „Sonstiges" | Ja | Bedarfsranking; Balken |
| 15 | F | Top-3-Prioritäten | Mehrfachauswahl (max. 3) / Ranking | 10 Kernpunkte | Nein | gewichtete Priorisierung |
| 16 | G Fortbildung | Gewünschte Fortbildungsthemen | Mehrfachauswahl | 10 Themen + „Sonstiges" + „kein Bedarf" | Ja | Fortbildungsplanung; Balken |
| 17 | G | Bevorzugte Formate | Mehrfachauswahl | Workshop / Kurzformat / Selbstlern / ganztags / extern / Tandem + Sonstiges | Nein | Format-Mix für Fortbildungskonzept |
| 18 | G | Bereitschaft, Erfahrungen zu teilen | Einfachauswahl | Ja / eventuell / eher nicht / nein | Nein | Multiplikatoren-Pool identifizieren |
| 19 | H Freiwillig | Fachbereich | Einfachauswahl | 6 Bereiche + Sonstiges + keine Angabe | Nein | Kreuzauswertung nach Fachbereich |
| 20 | H | Funktion | Einfachauswahl | Lehrkraft / Funktionsstelle / SL / Ref / keine Angabe | Nein | Kreuzauswertung nach Funktion |
| 21 | H | Name | Freitext kurz | — | Nein | nur für freiwillige Rückfragen |
| 22 | H | Sonstige Anmerkungen | Freitext lang | — | Nein | Restkategorie; Cluster |

---

## 4. Verzweigungen (Branching) in Microsoft Forms

Forms erlaubt Verzweigungen über **„… → Verzweigung hinzufügen"**. Sparsam einsetzen,
da Matrixfragen ohnehin alle Antwortenden einbeziehen. Sinnvoll:

- **Frage 2 oder 6 = „Nie":** zu Frage 7 überspringen (Detailfragen zur Aufgaben­nutzung
  entfallen) → spart Zeit für Nicht-Nutzende.
- **Frage 3 = „Ich nutze bisher keine KI-Tools":** Fragen 4 und 5 überspringen → direkt zu Abschnitt B/C.
- **Frage 16 = „kein Fortbildungsbedarf":** Frage 17 überspringen → zu Abschnitt H.

> Empfehlung: Höchstens diese drei Verzweigungen. Zu viele Sprünge erschweren die
> Auswertung und können bei Matrixfragen nicht greifen.

---

## 5. Auswertungsschema (Kategorien)

| Kategorie | Speist sich aus Fragen | Auswertung |
|-----------|-----------------------|-----------|
| **Vorerfahrung** | 1, 2, 6 | Mittelwert/Verteilung Nutzungshäufigkeit; Bekanntheits-Heatmap |
| **Toolnutzung** | 1, 3, 4 | Balken je Tool; Cross-Check Bekannt vs. genutzt |
| **Berufliche Nutzung** | 6, 7 | Häufigkeit + Einsatzfelder-Balken |
| **Offenheit/Einstellung** | 9, 10 | Mittelwerte Likert; Freitext-Cluster |
| **Sorgen/Unterstützungsbedarf** | 11, 12, 13 | Mittelwerte (höchste = größte Sorgen); Cluster |
| **Fortbildungsbedarf** | 8, 16, 17, 18 | Lücken aus 8 + Wünsche aus 16; Format-Mix |
| **Wünsche an KI-Lösung** | 14, 15 | Bedarfsranking; Top-3-Gewichtung |
| **Zahlungsbereitschaft/Bezahlaccounts** | 5 | Anteil mit Abo → Hinweis auf „Early Adopter" & Lizenzbedarf |

---

## 6. Diagrammvorschläge

- **Kreisdiagramm:** Fragen 2, 5, 6 (Häufigkeit, Bezahlversion).
- **Balkendiagramm (horizontal):** Fragen 3, 7, 14, 16 (Tools, Aufgaben, Wünsche, Fortbildung) – nach Häufigkeit sortiert.
- **Gestapelte Balken:** Fragen 1, 8, 9, 11 (Matrix/Likert) – pro Zeile Verteilung der Stufen.
- **Mittelwert-Tabelle / Netzdiagramm:** Fragen 8, 9, 11 – ein Wert je Item, gut für GLK-Folie.
- **Ranking-Auswertung:** Frage 15 – gewichtete Punkte (1./2./3. Platz) oder Häufigkeit der Top-3-Nennungen.
- **Freitext-Cluster (Wortwolke + Themenkategorien):** Fragen 10, 13, 22.

> Forms liefert Kreis-/Balken automatisch. Für Mittelwerte und gestapelte Balken den
> Excel-Export nutzen (Antworten → „In Excel öffnen").

---

## 7. Hinweise zur Interpretation

**Nutzertypen erkennen (aus Fragen 2/6/8):**
- *Anfänger:* private/berufliche Nutzung „nie/selten" **und** Selbsteinschätzung (F8) niedrig (Ø < 2,5).
- *Fortgeschrittene:* „gelegentlich/regelmäßig", F8 mittel (2,5–3,5), erste Aufgabenfelder in F7.
- *Erfahrene Nutzer:* „regelmäßig/täglich", F8 hoch (> 3,5), Bezahlaccount (F5), viele Aufgaben in F7 → **potenzielle Multiplikatoren** (Abgleich mit F18).

**Fortbildungsbedarf erkennen:** Items in F8 mit niedrigem Mittelwert = Kompetenzlücke;
am häufigsten gewählte Themen in F16 = Nachfrage. Schnittmenge beider = klarer Startpunkt.
Besonders datenschutzbezogene Lücke (F8-Datenschutz niedrig + F11-Datenschutz hoch) zuerst adressieren.

**Akzeptanzprobleme erkennen:** F9 „Ich habe Vorbehalte" hoher Mittelwert, F9 „offen" niedrig,
hohe Werte bei F11 (Belastung, Zeit, Prüfungen) und starker Wunsch nach Regeln (F12).
→ Veränderungskommunikation, Freiwilligkeit und Entlastungsnachweis betonen.

**Quick Wins erkennen:** Aufgaben mit bereits hoher Nutzung in F7 + hoher Wunschnennung in F14
(z. B. Arbeitsblätter, Differenzierung, Elternbriefe) → geringe Hürde, schneller Nutzen.

**Nächste Schritte ableiten:** Top-3 aus F14/F15 = Lösungsanforderungen für Ausschreibung/Lizenzwahl;
Top-Themen F16 + Formate F17 = Fortbildungsplan; F18-„Ja"-Nennungen = AG/Steuergruppe;
F11/F12 = Inhalt der Leitlinie.

---

## 8. Vorschlag Berichtsgliederung (für die GLK / Schulleitung)

1. **Kurzfazit** (3–4 Sätze: Stimmung, Reifegrad, klarster Handlungsauftrag)
2. **Zentrale Ergebnisse** (5 Kernzahlen)
3. **Vorerfahrungen im Kollegium** (F1, 2, 6)
4. **Toolnutzung & Bezahlaccounts** (F3, 4, 5)
5. **Wünsche und Bedarfe** (F14, 15)
6. **Sorgen und offene Fragen** (F11, 12, 13 – sachlich, anonymisierte Zitate)
7. **Fortbildungsbedarf** (F8, 16, 17, 18)
8. **Handlungsempfehlungen für die Schulleitung**
9. **Mögliche nächste Schritte** (Zeitleiste: kurz-/mittel-/langfristig)

---

## 9. Die 5 für die Schulleitung wichtigsten Ergebnisse

1. **Reifegrad & Spannweite des Kollegiums** (F2/F6/F8): Wie groß ist der Abstand zwischen
   erfahrenen Nutzenden und Einsteigern? Bestimmt Tempo und Differenzierung der Einführung.
2. **Akzeptanz vs. Vorbehalte** (F9/F11/F12): Trägt das Kollegium die Einführung mit, und
   welche Sorgen müssen zuerst adressiert werden? Entscheidend für die Kommunikationsstrategie.
3. **Konkreter Tool- und Lizenzbedarf** (F3/F5/F14): Welche Tools sind verbreitet, wer hat
   bereits Bezahlaccounts, welche Anforderungen muss eine schulische Lösung erfüllen?
4. **Quick Wins** (F7 ∩ F14): Welche 2–3 Einsatzfelder bringen sofort spürbare Entlastung
   bei geringer Hürde – ideal für einen sichtbaren ersten Erfolg.
5. **Fortbildungs-Startpaket & Multiplikatoren** (F8/F16/F18): Welche 2–3 Fortbildungsthemen
   und Formate sind am dringendsten, und wer aus dem Kollegium kann als Multiplikator wirken?
