/* KI-Anbindung.
   Standardweg ohne Schluessel: die App baut einen fertigen Prompt, den Sie kopieren
   oder direkt in Claude/ChatGPT oeffnen. Wer einen eigenen API-Schluessel hinterlegt,
   laesst die Anfrage direkt vom Geraet aus laufen. */

import { state, MODELLE } from './state.js';

export function modellLabel(id) { return MODELLE.find((m) => m.id === id)?.label || id; }

export function promptMaterial(k) {
  const opt = k.optionen || {};
  const teile = [];
  teile.push(`Du bist erfahrene Lehrkraft an einer kaufmännischen Berufsschule in Deutschland und erstellst Unterrichtsmaterial.`);
  teile.push(`\n## Auftrag\nErstelle: ${k.typ}\nThema: ${k.thema}`);
  teile.push(`Bildungsgang/Klasse: ${k.klasseLabel || '—'}`);
  if (k.lernfeld) teile.push(`Lernfeld: ${k.lernfeld}`);
  teile.push(`Zielniveau: ${k.niveau}`);
  teile.push(`Umfang: ${opt.umfang || '1–2 Seiten'}`);
  teile.push(`\n## Vorgaben`);
  const v = [];
  v.push(`Sprache: ${opt.sprache || 'Deutsch, fachsprachlich korrekt, Niveau Berufsschule'}`);
  v.push(`Verwende die KMK-Operatoren (nennen, beschreiben, erläutern, analysieren, beurteilen) und weise jeder Aufgabe einen Anforderungsbereich (AFB I–III) zu.`);
  if (opt.handlungsorientiert) v.push(`Rahme die Aufgaben in eine vollständige berufliche Handlungssituation (Ausgangssituation, Auftrag, Material, Ergebnis) ein.`);
  if (opt.differenzierung) v.push(`Biete drei Niveaustufen an (Basis, Standard, Erweiterung) – gleiches Lernziel, unterschiedliche Hilfen.`);
  if (opt.musterloesung) v.push(`Ergänze eine vollständige Musterlösung.`);
  if (opt.erwartungshorizont) v.push(`Ergänze einen Erwartungshorizont mit Bewertungsraster und Punkteverteilung.`);
  if (opt.quellen) v.push(`Nenne am Ende die verwendeten Rechtsgrundlagen bzw. Quellen (z. B. §§ BGB/HGB) mit Paragraphenangabe.`);
  if (opt.qr) v.push(`Sieh am Seitenende ein Feld für einen QR-Code zur digitalen Fassung vor.`);
  if (opt.dsgvo) v.push(`Füge den Hinweis „Keine personenbezogenen Daten enthalten“ in die Fußzeile ein.`);
  teile.push(v.map((x) => `- ${x}`).join('\n'));
  teile.push(`\n## Layout\n${k.layout || 'Schulkopfzeile, klare Nummerierung, Platz für Schülerlösungen'}`);
  if (k.zusatz) teile.push(`\n## Zusätzliche Hinweise\n${k.zusatz}`);
  teile.push(`\n## Ausgabeformat\nGib das Material direkt aus (Markdown, klar gegliedert, Überschriften, nummerierte Aufgaben mit Punktangabe). Keine Rückfragen, keine Vorrede.`);
  return teile.join('\n');
}

export function promptMail(k) {
  return `Du formulierst eine dienstliche E-Mail für eine Lehrkraft an einer kaufmännischen Berufsschule.

## Empfänger
${k.empfaenger}

## Anlass / Stichpunkte
${k.inhalt}

## Vorgaben
- Ton: ${k.ton}
- Länge: ${k.laenge}
- Deutsche Anrede- und Grußformeln, korrekte Rechtschreibung
- Betreffzeile vorschlagen
- ${k.vertraulich ? 'Vertraulich: keine personenbezogenen Details nennen, neutral formulieren.' : 'Sachlich konkret bleiben.'}
${k.unterschrift ? `- Unterschrift: ${k.unterschrift}` : ''}

Gib nur Betreff und E-Mail-Text aus.`;
}

export function promptAnalyse(k) {
  return `Du unterstützt eine Lehrkraft bei der pädagogischen Auswertung einer Lerngruppe.
Alle Personen sind pseudonymisiert – verwende ausschließlich die Pseudonyme.

## Datengrundlage
${k.daten}

## Auftrag
${k.auftrag}

## Vorgaben
- Sachlich, wertschätzend, keine Spekulation über Persönliches
- Konkrete, im Unterricht umsetzbare Fördervorschläge
- Wo Daten fehlen, benenne die Lücke statt zu raten
- Gliederung: Überblick, Auffälligkeiten, Fördervorschläge, nächste Schritte`;
}

export function promptOrganisation(k) {
  return `Du bist Organisationsassistent einer Lehrkraft an einer Berufsschule.

## Aufgabenlage
${k.daten}

## Auftrag
${k.auftrag}

## Vorgaben
- Priorisiere nach Frist und Wichtigkeit (Eisenhower)
- Schlage eine realistische Tagesreihenfolge mit Zeitblöcken vor
- Benenne, was delegiert oder gestrichen werden kann`;
}

/* Prompt extern oeffnen */
export function claudeLink(prompt) { return 'https://claude.ai/new?q=' + encodeURIComponent(prompt.slice(0, 6000)); }
export function chatgptLink(prompt) { return 'https://chatgpt.com/?q=' + encodeURIComponent(prompt.slice(0, 6000)); }

/* Direkter API-Aufruf (nur wenn eigener Schluessel hinterlegt ist) */
export async function anfragen(prompt, modellId) {
  const p = state().profil;
  const key = (p.apiKey || '').trim();
  if (!key) throw new Error('Kein API-Schlüssel hinterlegt. Nutzen Sie „Prompt kopieren“ oder hinterlegen Sie im Profil einen Schlüssel.');
  const modell = MODELLE.find((m) => m.id === (modellId || p.modell));
  if (!modell?.api) throw new Error(`Für ${modell?.label || modellId} gibt es keine direkte Anbindung. Bitte Prompt kopieren.`);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: modell.api, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Die KI-Anfrage schlug fehl (${res.status}). ${t.slice(0, 180)}`);
  }
  const daten = await res.json();
  return (daten.content || []).map((c) => c.text || '').join('\n').trim();
}

export function hatSchluessel() { return !!(state().profil.apiKey || '').trim(); }
