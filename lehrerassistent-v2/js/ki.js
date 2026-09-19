/* KI-Schicht: Prompts bauen, Lernprofile ableiten, Modelle direkt anfragen. */

import { state, schnitt, note, anzeige, klasse, lernstand } from './store.js';

/* ---------- Modellanbindung ---------- */
export const hatZugang = () => !!(state().profil.ki?.key || '').trim() || state().profil.ki?.anbieter === 'kompatibel' && !!state().profil.ki?.basisUrl;

export async function anfragen(prompt, { system = '', maxTokens = 4000, signal } = {}) {
  const ki = state().profil.ki || {};
  const key = (ki.key || '').trim();
  const modell = (ki.modell || '').trim();
  if (!modell) throw new Error('Kein Modell hinterlegt. Bitte im Profil unter „KI-Anbindung" eintragen.');

  if (ki.anbieter === 'anthropic') {
    if (!key) throw new Error('Kein API-Schlüssel hinterlegt.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: modell, max_tokens: maxTokens, system: system || undefined, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!r.ok) throw new Error(await fehlerText(r));
    const d = await r.json();
    return (d.content || []).map((c) => c.text || '').join('\n').trim();
  }

  const basis = ki.anbieter === 'openai' ? 'https://api.openai.com/v1' : (ki.basisUrl || '').replace(/\/+$/, '');
  if (!basis) throw new Error('Keine Server-Adresse hinterlegt.');
  const r = await fetch(basis + '/chat/completions', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) },
    body: JSON.stringify({
      model: modell, max_completion_tokens: maxTokens,
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(await fehlerText(r));
  const d = await r.json();
  return (d.choices?.[0]?.message?.content || '').trim();
}

async function fehlerText(r) {
  let t = '';
  try { const j = await r.json(); t = j.error?.message || JSON.stringify(j).slice(0, 200); } catch { t = await r.text().catch(() => ''); }
  if (r.status === 401) return 'Der API-Schlüssel wurde abgelehnt (401). Bitte im Profil prüfen.';
  if (r.status === 429) return 'Zu viele Anfragen oder Kontingent aufgebraucht (429).';
  return `Anfrage fehlgeschlagen (${r.status}). ${String(t).slice(0, 220)}`;
}

export const claudeLink = (p) => 'https://claude.ai/new?q=' + encodeURIComponent(p.slice(0, 5500));
export const gptLink = (p) => 'https://chatgpt.com/?q=' + encodeURIComponent(p.slice(0, 5500));

const SYSTEM = 'Du bist eine erfahrene Lehrkraft für BWL und Recht an einer kaufmännischen Berufsschule in Deutschland. Du schreibst unterrichtsfertige Materialien in korrekter deutscher Fachsprache, orientiert an den KMK-Operatoren und den Anforderungsbereichen AFB I–III. Du lieferst das Ergebnis direkt, ohne Rückfragen und ohne Vorrede.';
export const system = () => SYSTEM;

/* ---------- Lernprofil & abgeleitete Anpassung ---------- */

export function ableitung(s) {
  const d = schnitt(s);
  const fehl = parseInt(String(s.fehlzeiten || '0'), 10) || 0;
  const mit = (s.mitarbeit || '').toLowerCase();
  const verh = (s.verhalten || '').toLowerCase();
  const text = [s.foerder || '', ...(s.notizen || []).map((n) => n.text)].join(' ').toLowerCase();
  const a = { niveau: '', umfang: '', hilfen: [], zusatz: [], schwerpunkt: [] };

  if (d === null) { a.niveau = 'Standardniveau (noch keine Noten hinterlegt)'; a.umfang = '4–5 Aufgaben'; }
  else if (d <= 2.0) { a.niveau = 'Erweiterungsniveau, Transfer und Beurteilung (AFB II–III)'; a.umfang = '4–5 Aufgaben, davon zwei offene Transferaufgaben'; a.hilfen.push('keine Lösungshilfen im Aufgabenteil'); a.zusatz.push('Zusatzaufgabe auf IHK-Niveau'); }
  else if (d <= 3.0) { a.niveau = 'Standardniveau mit gezielter Sicherung (AFB I–II)'; a.umfang = '5 Aufgaben'; a.hilfen.push('ein kurzes Beispiel als Musteranfang bei der schwierigsten Aufgabe'); }
  else if (d < 4.0) { a.niveau = 'Standardniveau kleinschrittig, mit Strukturhilfen (AFB I, Einstieg AFB II)'; a.umfang = '4 Aufgaben in klar getrennten Teilschritten'; a.hilfen.push('Strukturhilfe: Lösungsschritte als Gerüst vorgeben', 'Wortspeicher mit den zentralen Fachbegriffen'); }
  else { a.niveau = 'Basisniveau, stark kleinschrittig (AFB I)'; a.umfang = '3 Aufgaben mit je zwei Teilschritten'; a.hilfen.push('jede Aufgabe mit vorgegebenem Lösungsweg beginnen', 'Wortspeicher und Satzanfänge vorgeben', 'eine Aufgabe als Zuordnungs- oder Multiple-Choice-Format'); }

  if (/zurückhaltend|gering|passiv/.test(mit)) a.hilfen.push('schriftliche Vorentlastung, damit ein Beitrag ohne spontanes Melden gelingt');
  if (/wechselhaft|schwankend/.test(mit)) a.hilfen.push('kurze Aufgabenpakete mit Zeitangabe und Abhakliste');
  if (/ablenkbar|unruhig/.test(verh)) a.hilfen.push('klare Gliederung, pro Aufgabe nur ein Arbeitsauftrag');
  if (/selbstständig|engagiert|wissbegierig/.test(verh)) a.zusatz.push('freiwillige Vertiefungsaufgabe mit eigener Recherche');
  if (fehl >= 5) a.hilfen.push(`Kurzzusammenfassung des Stoffs voranstellen (${fehl} Fehltage)`);
  if (/fachbegriff|rechtsbegriff|fachsprache/.test(text)) a.schwerpunkt.push('Fachbegriffe sichern (Begriffs-Definitions-Zuordnung)');
  if (/struktur/.test(text)) a.schwerpunkt.push('klare Aufgabenstruktur mit nummerierten Teilschritten');
  if (/lücken|grundlagen/.test(text)) a.schwerpunkt.push('Grundlagenwiederholung vor der Anwendung');
  if (/tutor|moderation|hilft/.test(text)) a.zusatz.push('Aufgabe zum Erklären für Mitlernende (Peer-Tutoring)');
  if (/prüfung|ihk|klausur/.test(text)) a.zusatz.push('eine Aufgabe im Prüfungsformat');
  return a;
}

export function profilText(s, { anonym = true } = {}) {
  const name = anonym ? s.pseudonym : (s.name || s.pseudonym);
  const d = schnitt(s);
  const z = [`Bezeichnung: ${name}`];
  const n = Object.entries(s.noten || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
  if (n) z.push(`Notenstand: ${n}${d !== null ? ` (Durchschnitt ${note(d)})` : ''}`);
  if (s.mitarbeit) z.push(`Mitarbeit: ${s.mitarbeit}`);
  if (s.verhalten) z.push(`Arbeitsweise: ${s.verhalten}`);
  if (s.fehlzeiten) z.push(`Fehlzeiten: ${s.fehlzeiten}`);
  if (s.notizen?.length) z.push(`Beobachtungen im Unterricht:\n${s.notizen.map((x) => `  - ${x.text}`).join('\n')}`);
  if (s.kollegen?.length) z.push(`Rückmeldungen aus anderen Fächern:\n${s.kollegen.map((x) => `  - ${x.fach}: ${x.text}`).join('\n')}`);
  if (s.foerder) z.push(`Förderhinweis der Lehrkraft: ${s.foerder}`);
  return z.join('\n');
}

/* ---------- Prompt-Bau ---------- */

function kopfzeile(k, lf, thema) {
  const kl = k ? `${k.code} (${k.typ === 'BM' ? 'Kaufleute für Büromanagement' : 'Öffentlicher Dienst / Arbeitsmarktdienstleistungen'}, ${k.jahr}. Ausbildungsjahr)` : 'kaufmännische Berufsschule';
  const lfName = k?.lernfelder.find((l) => l.code === lf)?.name;
  return `Klasse: ${kl}\nLernfeld: ${lf || '—'}${lfName ? ' – ' + lfName : ''}\nThema: ${thema || '—'}`;
}

/* Klassen-Arbeitsblatt (9-Schritt-Assistent) */
export function promptArbeitsblatt(c) {
  const k = klasse(c.klasseId);
  const o = c.optionen || [];
  const zeilen = [
    `## Auftrag`,
    `Erstelle: ${c.typ || 'Arbeitsblatt'}`,
    kopfzeile(k, c.lf, c.thema),
    `Zielniveau: ${c.niveau || 'Standard'}`,
    `Umfang: ${{ kurz: '1 Seite, 3 Aufgaben', mittel: '1–2 Seiten, 5 Aufgaben', ausführlich: '2–3 Seiten, 8 Aufgaben' }[c.umfang] || c.umfang}`,
    `Sprachniveau: ${c.sprache || 'normal'}`,
    ``, `## Vorgaben`,
    `- Berufsbezug: realistische Situation aus einem Ausbildungsbetrieb (Büro, Beschaffung, Verwaltung)`,
    `- Jede Aufgabe mit KMK-Operator und Angabe des Anforderungsbereichs (AFB I–III)`,
  ];
  if (o.includes('Musterlösung erstellen')) zeilen.push('- Vollständige Musterlösung am Ende, klar abgetrennt');
  if (o.includes('Erwartungshorizont erstellen')) zeilen.push('- Erwartungshorizont mit Teilkompetenzen');
  if (o.includes('Bewertungspunkte vorschlagen')) zeilen.push('- Punkteverteilung je Teilaufgabe');
  if (o.includes('Operatoren einbauen')) zeilen.push('- Operatoren konsequent verwenden (nennen, beschreiben, erläutern, analysieren, beurteilen)');
  if (o.includes('Quellenfeld einfügen')) zeilen.push('- Quellenfeld mit Rechtsgrundlagen (§§ BGB/HGB) am Seitenende');
  if (o.includes('QR-Code-Feld für digitale Abgabe')) zeilen.push('- Platzhalterfeld für einen QR-Code zur digitalen Abgabe');
  if (o.includes('DSGVO-Hinweis einfügen')) zeilen.push('- Fußzeilenhinweis „Keine personenbezogenen Daten enthalten"');
  if (o.includes('barrierearme Sprache verwenden')) zeilen.push('- Barrierearme Sprache: kurze Sätze, keine verschachtelten Nebensätze');
  if (o.includes('Differenzierungsstufen automatisch erzeugen')) zeilen.push('- Drei Niveaustufen (Basis / Standard / Erweiterung) zum selben Lernziel');
  if (c.vorlage) zeilen.push(`- Layout: ${c.vorlage}`);
  if (o.includes('Layout aus Gedächtnis übernehmen')) zeilen.push(`- Layoutvorgabe der Lehrkraft: ${state().profil.layout}`);
  if (c.zusatz) zeilen.push(``, `## Zusätzliche Hinweise`, c.zusatz);
  zeilen.push(``, `## Ausgabeformat`,
    `Markdown. Kopf mit Titel, Klasse, Lernfeld, Bearbeitungszeit. Danach die Ausgangssituation, dann nummerierte Aufgaben mit Punkten.`);
  return zeilen.join('\n');
}

/* Individuelles Arbeitsblatt für EINE Person – Kern der App */
export function promptIndividuell(c, s) {
  const k = klasse(c.klasseId);
  const a = ableitung(s);
  const anonym = c.anonym !== false;
  const z = [
    `## Auftrag`,
    `Erstelle ein individuelles Arbeitsblatt für genau eine lernende Person: ${anonym ? s.pseudonym : (s.name || s.pseudonym)}`,
    kopfzeile(k, c.lf, c.thema),
    c.ziel ? `Lernziel der Stunde: ${c.ziel}` : '',
    ``,
    `## Lernprofil dieser Person`,
    profilText(s, { anonym }),
    ``,
    `## Verbindliche Anpassung (aus dem Lernprofil abgeleitet)`,
    `- Niveau: ${a.niveau}`,
    `- Umfang: ${a.umfang}`,
    ...(a.schwerpunkt.length ? [`- Schwerpunkt: ${a.schwerpunkt.join('; ')}`] : []),
    ...(a.hilfen.length ? [`- Hilfen: ${a.hilfen.join('; ')}`] : []),
    ...(a.zusatz.length ? [`- Zusatzangebot: ${a.zusatz.join('; ')}`] : []),
    ``,
    `## Vorgaben`,
    `- Das Arbeitsblatt muss eigenständig bearbeitbar sein; die Person arbeitet allein damit.`,
    `- Sprich die Person nicht mit Namen an und erwähne weder Noten noch Beobachtungen im Text – die Anpassung zeigt sich ausschließlich in Auswahl, Reihenfolge und Hilfen der Aufgaben.`,
    `- Realistischer Berufsbezug aus dem Büroalltag; jede Aufgabe mit Operator und AFB-Angabe.`,
    c.musterloesung ? `- Am Ende eine vollständige Musterlösung mit Lösungsweg.` : `- Keine Lösungen abdrucken.`,
    c.hinweisLehrkraft ? `- Ganz am Schluss ein kurzer Abschnitt „Hinweis für die Lehrkraft" mit der pädagogischen Begründung der Anpassung (3–4 Sätze).` : '',
    c.zusatz ? `- Zusätzlich beachten: ${c.zusatz}` : '',
    ``,
    `## Ausgabeformat`,
    `Markdown. Kopfzeile mit Thema, Lernfeld und der Bezeichnung ${anonym ? s.pseudonym : (s.name || s.pseudonym)}. Danach kurze Ausgangssituation, dann die nummerierten Aufgaben, dann – falls gefordert – Musterlösung und Lehrkraft-Hinweis.`,
  ];
  return z.filter(Boolean).join('\n');
}

export function promptFoerderplan(s, { anonym = true } = {}) {
  const a = ableitung(s);
  return `## Auftrag
Erstelle einen individuellen Förderplan für eine lernende Person an einer kaufmännischen Berufsschule.

## Lernprofil
${profilText(s, { anonym })}

## Abgeleitete Ausgangslage
- Niveau: ${a.niveau}
${a.schwerpunkt.length ? '- Schwerpunkte: ' + a.schwerpunkt.join('; ') : ''}
${a.hilfen.length ? '- Bewährte Hilfen: ' + a.hilfen.join('; ') : ''}

## Vorgaben
- Gliederung: Ausgangslage, Förderziele (maximal drei, überprüfbar formuliert), Maßnahmen im Unterricht, Aufgaben für die Selbstarbeit, Überprüfung nach sechs Wochen
- Sachlich, wertschätzend, ohne Spekulation über Persönliches
- Konkret und im Schulalltag umsetzbar`;
}

export function promptKlassenanalyse(klasseId, { anonym = true } = {}) {
  const k = klasse(klasseId);
  const sus = state().schueler.filter((x) => x.klasseId === klasseId);
  const zeilen = sus.map((s) => {
    const l = lernstand(s);
    return `- ${anonym ? s.pseudonym : s.name}: Ø ${note(l.schnitt)}, Mitarbeit ${s.mitarbeit || '–'}${l.gruende.length ? ', auffällig: ' + l.gruende.join(' / ') : ''}`;
  }).join('\n');
  return `## Auftrag
Werte die Lerngruppe aus und leite konkrete Unterrichtsmaßnahmen ab.

## Datengrundlage
Klasse ${k?.code} · ${sus.length} Lernende
${zeilen}

## Vorgaben
- Gliederung: Gesamtbild, auffällige Gruppen, Differenzierungsvorschläge je Lernfeld, nächste Schritte
- Nur Pseudonyme verwenden, keine Rückschlüsse auf Personen außerhalb der Gruppe
- Konkrete, im Unterricht umsetzbare Maßnahmen statt allgemeiner Empfehlungen`;
}

export function promptMail(c) {
  const p = state().profil;
  return `## Auftrag
Formuliere eine dienstliche E-Mail für eine Lehrkraft an einer kaufmännischen Berufsschule.

## Rahmen
Empfänger: ${c.empfaenger}
Anlass: ${c.anlass}
Betreff (Vorschlag der Lehrkraft): ${c.betreff || '— bitte vorschlagen —'}
Inhalt / Stichpunkte:
${c.inhalt || '—'}

## Vorgaben
- Ton: ${c.ton}
- Länge: ${c.laenge}
- Vertraulichkeit: ${c.vertraulich}${c.vertraulich !== 'normal' ? ' – keine personenbezogenen Details nennen' : ''}
- Korrekte deutsche Anrede und Grußformel
- Unterschrift: ${[p.name, p.kuerzel && '(' + p.kuerzel + ')', p.schule].filter(Boolean).join(' ')}

## Ausgabeformat
Zuerst „Betreff: …", dann der E-Mail-Text. Keine Erklärungen.`;
}

export function promptTagesplan() {
  const d = state();
  const stunden = d.stunden.map((s) => `- ${s.zeit} ${klasse(s.klasseId)?.code || ''} ${s.lf || ''} (${s.ort || ''})`).join('\n');
  const auf = d.aufgaben.filter((a) => !a.erledigt).map((a) => `- ${a.titel} (Priorität ${a.prio}${a.faellig ? ', fällig ' + a.faellig : ''})`).join('\n');
  const term = d.termine.map((t) => `- ${t.datum} ${t.zeit || ''} ${t.titel}`).join('\n');
  return `## Auftrag
Plane den Arbeitstag einer Lehrkraft mit vollem Deputat realistisch durch.

## Unterricht
${stunden || '- keiner eingetragen'}

## Termine
${term || '- keine'}

## Offene Aufgaben
${auf || '- keine'}

## Vorgaben
- Priorisiere nach Frist und Wichtigkeit
- Ordne die Aufgaben konkreten Zeitfenstern zwischen den Stunden zu
- Benenne, was heute realistisch entfällt oder delegiert werden kann
- Kurze, klare Liste statt Fließtext`;
}

export function promptNotizen(notizen) {
  return `## Auftrag
Werte die folgenden Unterrichtsnotizen aus und leite Konsequenzen für die nächsten Stunden ab.

## Notizen
${notizen.map((n) => `- [${n.datum}${n.lf ? ', ' + n.lf : ''}${n.typ ? ', ' + n.typ : ''}] ${n.text}`).join('\n')}

## Vorgaben
- Wiederkehrende Themen und Stolperstellen benennen
- Konkrete Maßnahme je Stolperstelle vorschlagen
- Am Ende drei Sätze Gesamteinschätzung`;
}

export function promptLernsituation(c) {
  const k = klasse(c.klasseId);
  return `## Auftrag
Erstelle eine handlungsorientierte Lernsituation.

${kopfzeile(k, c.lf, c.thema)}
Zeitumfang: ${c.umfang || '90 Minuten'}

## Vorgaben
- Vollständige Handlung: Informieren, Planen, Entscheiden, Ausführen, Kontrollieren, Bewerten
- Berufliche Ausgangssituation aus einem Ausbildungsbetrieb, mit Rollen und Materialien
- Handlungsauftrag klar formuliert, Kompetenzerwartung ausgewiesen
- Hinweise zur Differenzierung und zum Stundenverlauf (Zeitraster)`;
}
