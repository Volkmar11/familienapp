// iOS-Test-Build-Schutz (Phase 7A) – nur Node (vite.config.js, Build-/Hook-/Readiness-Skripte).
// Landet NIE im Client-Bundle. Hier steht bewusst die Produktions-Ref als Sperrliste.
//
// Regeln für den nativen Test-Build (vite --mode ios-test):
//   • VITE_BACKEND_MODE=family
//   • VITE_FAMILY_SUPABASE_URL = exakt https://<test-ref>.supabase.co
//   • Publishable Key, nie Secret/service_role (JWT: role=anon und ref=test-ref)
//   • LEGACY-Variablen (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY) leer – Vite bettet ALLE
//     VITE_-Werte in das Bundle ein, sie würden sonst in der App landen
//   • kein VITE_-Wert enthält die Produktions-Ref, family-main oder die LEGACY-Web-Domain
//   • URL-Werte nur https:// (Support zusätzlich mailto:)
import fs from "node:fs";
import path from "node:path";
import { NATIVE_TEST_PROJECT_REF, NATIVE_TEST_BUILD_MODE, NATIVE_APP_ID, NATIVE_APP_NAME, projectRefOfUrl } from "../../src/config/nativeTarget.js";

export { NATIVE_TEST_PROJECT_REF, NATIVE_TEST_BUILD_MODE, NATIVE_APP_ID, NATIVE_APP_NAME };
export const PRODUCTION_PROJECT_REF = "gkkzjmszcjivtaygbmfw";
export const PRODUCTION_WEB_HOSTS = ["familienapp.vercel.app"]; // heute LEGACY-Produktion
export const NATIVE_MARKER_FILE = "wc-native-build.json";
export const NATIVE_MARKER_TARGET = "ios-test";

const clean = (v) => (typeof v === "string" ? v.trim() : "");
const URL_VARS = ["VITE_AUTH_REDIRECT_URL", "VITE_INVITE_BASE_URL", "VITE_PRIVACY_URL", "VITE_IMPRINT_URL", "VITE_NATIVE_AUTH_REDIRECT_URL"];

function jwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try { return JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { return null; }
}

// env: alle VITE_-Werte (loadEnv bzw. process.env). Liefert { ok, errors[] } – nie Werte in Meldungen.
export function validateIosTestEnv(env = {}) {
  const errors = [];
  const vite = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("VITE_")));

  if (clean(vite.VITE_BACKEND_MODE).toLowerCase() !== "family") errors.push("VITE_BACKEND_MODE muss \"family\" sein (die native App ist ausschließlich FAMILY).");

  const url = clean(vite.VITE_FAMILY_SUPABASE_URL).replace(/\/+$/, "");
  const ref = projectRefOfUrl(url);
  if (!url) errors.push("VITE_FAMILY_SUPABASE_URL fehlt.");
  else if (ref === PRODUCTION_PROJECT_REF) errors.push("VITE_FAMILY_SUPABASE_URL zeigt auf das PRODUKTIONSPROJEKT. Der native Test-Build ist nur gegen das Testprojekt erlaubt.");
  else if (ref !== NATIVE_TEST_PROJECT_REF || url !== `https://${NATIVE_TEST_PROJECT_REF}.supabase.co`) errors.push("VITE_FAMILY_SUPABASE_URL muss exakt die Projekt-URL des Testprojekts „wochen-champion-test“ sein.");

  const key = clean(vite.VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY);
  if (!key) errors.push("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY fehlt.");
  else if (/service_role|^sb_secret_/i.test(key)) errors.push("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY ist ein Secret-/service_role-Key – verboten.");
  else if (key.startsWith("eyJ")) {
    const p = jwtPayload(key);
    if (!p || p.role !== "anon") errors.push("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY: JWT ist kein anon-Key.");
    else if (p.ref !== NATIVE_TEST_PROJECT_REF) errors.push("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY gehört nicht zum Testprojekt.");
  } else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) errors.push("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY hat kein gültiges Format (erwartet sb_publishable_…).");

  for (const k of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    if (clean(vite[k])) errors.push(`${k} (LEGACY) muss im nativen Test-Build leer sein – in .env.ios-test.local „${k}=“ setzen.`);
  }

  for (const k of URL_VARS) {
    const v = clean(vite[k]);
    if (!v) continue;
    let u = null;
    try { u = new URL(v); } catch { /* unten */ }
    if (!u || u.protocol !== "https:") errors.push(`${k} muss eine https://-Adresse sein (kein HTTP im nativen Build).`);
    else if (PRODUCTION_WEB_HOSTS.includes(u.host.toLowerCase())) errors.push(`${k} zeigt auf die Produktions-Web-Domain – im Test-Build nicht erlaubt.`);
  }
  const support = clean(vite.VITE_SUPPORT_URL);
  if (support && !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(support) && !/^https:\/\//i.test(support)) errors.push("VITE_SUPPORT_URL muss https:// oder mailto: sein.");

  for (const [k, v] of Object.entries(vite)) {
    const s = String(v ?? "");
    if (s.toLowerCase().includes(PRODUCTION_PROJECT_REF)) errors.push(`${k} enthält die Produktions-Ref – verboten.`);
    if (/family-main/i.test(s)) errors.push(`${k} enthält „family-main“ – verboten.`);
    if (/^http:\/\//i.test(s.trim())) errors.push(`${k}: HTTP ist im nativen Build nicht erlaubt.`);
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

// ------------------------------------------------------------------ Bundle-Scan
const walk = (d) => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]) : [];

// Statischer Scan eines gebauten Web-Bundles (dist/ oder ios/App/App/public).
// legacyNames: persönliche LEGACY-Standardnamen (aus src/legacy/legacyDefaults.js; werden nie ausgegeben).
export function scanNativeWebBundle(dir, { legacyNames = [] } = {}) {
  const files = walk(dir);
  const textFiles = files.filter((f) => /\.(js|mjs|html|css|json|txt|map)$/i.test(f));
  const text = textFiles.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const findings = [];
  const add = (name, hit) => { if (hit) findings.push(name); };
  add("Produktions-Ref", text.toLowerCase().includes(PRODUCTION_PROJECT_REF));
  add("family-main", /family-main/.test(text));
  add("app_state (LEGACY-Tabelle)", /\bapp_state\b/.test(text));
  add("LEGACY-Web-Domain", PRODUCTION_WEB_HOSTS.some((h) => text.includes(h)));
  add("Secret-/service_role-Key", /sb_secret_[A-Za-z0-9_-]{8,}/.test(text) || [...text.matchAll(/eyJhbGciOi[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{20,}/g)].some((m) => {
    try { return JSON.parse(Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")).role !== "anon"; } catch { return true; }
  }));
  add("Testkonten (@example.com / wc-test)", /@example\.com|wc-(test|p[0-9])/.test(text));
  add("Test-Hintertüren", /test_add_family_member|legacy_import_redemptions/.test(text));
  add("HTTP-Backend", /http:\/\/[a-z0-9]{20}\.supabase\.co/i.test(text));
  add("LEGACY-Umgebungswerte im Bundle", /VITE_SUPABASE_(URL|ANON_KEY)"?\s*:\s*"[^"]+"/.test(text));
  add("Testprojekt fehlt", !text.includes(`${NATIVE_TEST_PROJECT_REF}.supabase.co`));
  const nameHits = legacyNames.filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text));
  add("persönliche LEGACY-Standarddaten", nameHits.length > 0);
  // große eingebettete Bilder (persönliche Fotos als Base64) – kleine SVG-/Icon-Daten sind erlaubt
  add("eingebettete Bilddaten (Base64 > 2 kB)", /data:image\/(png|jpe?g|webp|heic);base64,[A-Za-z0-9+/=]{2048,}/.test(text));
  const images = files.filter((f) => /\.(jpe?g|heic|webp)$/i.test(f)).map((f) => path.relative(dir, f));
  add("Fotodateien im Bundle", images.length > 0);
  return { files: files.length, findings };
}

export async function loadLegacyNames(root) {
  try {
    const { pathToFileURL } = await import("node:url");
    const d = await import(pathToFileURL(path.join(root, "src/legacy/legacyDefaults.js")).href);
    return (d.DEFAULT_MEMBERS || []).map((m) => m?.name).filter((n) => typeof n === "string" && n.length >= 3);
  } catch { return []; }
}

export function readNativeMarker(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, NATIVE_MARKER_FILE), "utf8")); } catch { return null; }
}

export function isValidNativeMarker(m) {
  return !!m && m.target === NATIVE_MARKER_TARGET && m.projectRef === NATIVE_TEST_PROJECT_REF && m.backendMode === "family" && m.appId === NATIVE_APP_ID;
}
