// Rechtliche Links (Phase 6A) – Datenschutzerklärung, Impressum, Support.
// Werte kommen ausschließlich aus der Umgebung (Vercel/Build), nie fest im Code:
//   VITE_PRIVACY_URL   – öffentliche Datenschutzerklärung (ohne Login erreichbar)
//   VITE_IMPRINT_URL   – Impressum (ohne Login erreichbar)
//   VITE_SUPPORT_URL   – Support-Seite (https://…) oder mailto:…-Adresse
// Nur https:// (bzw. mailto: für Support) wird akzeptiert; alles andere wird ignoriert.
// Solange nichts konfiguriert ist, zeigt die App keine Links (kein Platzhalter-Link ins Leere).
// Vor Produktion/App Store prüft scripts/check-release-readiness.mjs, dass alle drei gesetzt sind.

const httpsUrl = (v) => {
  try { const u = new URL(String(v || "").trim()); return u.protocol === "https:" ? u.href : null; } catch { return null; }
};
const supportUrl = (v) => {
  const s = String(v || "").trim();
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s)) return s;
  return httpsUrl(s);
};

export const LEGAL_ENV_NAMES = Object.freeze(["VITE_PRIVACY_URL", "VITE_IMPRINT_URL", "VITE_SUPPORT_URL"]);

export function getLegalLinks(env = {}) {
  const links = [
    { key: "privacy", label: "Datenschutz", href: httpsUrl(env.VITE_PRIVACY_URL) },
    { key: "imprint", label: "Impressum", href: httpsUrl(env.VITE_IMPRINT_URL) },
    { key: "support", label: "Support", href: supportUrl(env.VITE_SUPPORT_URL) },
  ];
  return links.filter((l) => l.href);
}

export function missingLegalEnv(env = {}) {
  const have = new Set(getLegalLinks(env).map((l) => l.key));
  return [["privacy", "VITE_PRIVACY_URL"], ["imprint", "VITE_IMPRINT_URL"], ["support", "VITE_SUPPORT_URL"]]
    .filter(([k]) => !have.has(k)).map(([, n]) => n);
}
