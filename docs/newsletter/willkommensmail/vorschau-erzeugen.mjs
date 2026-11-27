// Erzeugt die lokale Vorschau der Willkommensmail mit sicheren Beispieldaten.
// Aufruf (im Repository-Hauptordner):  node docs/newsletter/willkommensmail/vorschau-erzeugen.mjs
// Versendet nichts, ruft nichts im Netz ab und ändert die Vorlagen nicht.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ordner = dirname(fileURLToPath(import.meta.url));
const vorschauOrdner = join(ordner, "vorschau");
mkdirSync(vorschauOrdner, { recursive: true });

// Sichere Beispieldaten: keine echten Links, keine private Anschrift.
// Links zeigen auf Sprungmarken (#…), die bewusst ins Leere gehen.
const beispiel = {
  LOGO_URL: "../assets/wochen-champion-logo-mail.png",
  UNSUBSCRIBE_URL: "#platzhalter-abmeldelink",
  IMPRESSUM_URL: "#platzhalter-impressum",
  DATENSCHUTZ_URL: "#platzhalter-datenschutz",
  ABSENDER_NAME: "Volkmar Solutions",
  ABSENDER_ANSCHRIFT: "[Postanschrift – wird erst beim Versand eingesetzt]",
};
const beispielText = {
  ...beispiel,
  UNSUBSCRIBE_URL: "[Abmeldelink – wird vom Versanddienst eingesetzt]",
  IMPRESSUM_URL: "[Impressum-Adresse – noch nicht veröffentlicht]",
  DATENSCHUTZ_URL: "[Datenschutz-Adresse – noch nicht veröffentlicht]",
};

const ersetzen = (vorlage, werte) =>
  vorlage.replace(/\{\{([A-Z_]+)\}\}/g, (treffer, name) => {
    if (!(name in werte)) throw new Error(`Unbekannte Variable ${treffer}`);
    return werte[name];
  });

const hinweis = `
<div style="background:#fff7d6; border-bottom:2px solid #fbbf24; color:#3b2f00; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:14px; line-height:20px; padding:10px 16px; text-align:center;">
  <strong>Lokale Vorschau – Entwurf, kein Versand.</strong> Abmelde-, Impressums- und Datenschutzlinks sind Platzhalter und funktionieren hier bewusst nicht.
</div>`;

const html = readFileSync(join(ordner, "willkommensmail.html"), "utf8");
const text = readFileSync(join(ordner, "willkommensmail.txt"), "utf8");

const vorschauHtml = ersetzen(html, beispiel).replace(/(<body[^>]*>)/, `$1${hinweis}`);
const vorschauText = ersetzen(text, beispielText);

for (const [name, inhalt] of [["HTML", vorschauHtml], ["Text", vorschauText]]) {
  if (/\{\{|\}\}/.test(inhalt)) throw new Error(`${name}-Vorschau enthält noch Variablen`);
}

writeFileSync(join(vorschauOrdner, "willkommensmail-vorschau.html"), vorschauHtml);
writeFileSync(join(vorschauOrdner, "willkommensmail-vorschau.txt"), vorschauText);

const variablen = (s) => [...new Set(s.match(/\{\{[A-Z_]+\}\}/g))].sort();
console.log("Vorschau erzeugt in", vorschauOrdner);
console.log("Variablen HTML:", variablen(html).join(", "));
console.log("Variablen Text:", variablen(text).join(", "));
