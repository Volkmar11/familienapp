// CORS-Regeln der Edge Functions (Phase 6B1). Reines ES-Modul ohne Deno-/Node-APIs:
// Die Functions importieren es, die Node-Tests (tests/edgeCors.test.mjs) prüfen es direkt.
//
// Konfiguration (Supabase → Edge Functions → Secrets):
//   WC_APP_ORIGIN         Produktions-Web-Origin, z. B. https://<produktions-domain> (genau ein Origin)
//   WC_ALLOWED_ORIGINS    weitere exakte Origins, kommagetrennt (später z. B. capacitor://localhost)
//   WC_ALLOW_DEV_ORIGINS  "true" erlaubt localhost/127.0.0.1 und die Vercel-Previews dieses Projekts.
//                         Nicht gesetzt: nur im Testprojekt automatisch an, sonst (Produktion) AUS.
// Ein Origin wird nur exakt verglichen (Schema + Host + Port), nie per Präfix oder Teilstring.

export const TEST_PROJECT_REF = "otejitifgcrrwmudrnhs";

export const DEV_ORIGIN_PATTERNS = [
  /^http:\/\/localhost(:\d{1,5})?$/,
  /^http:\/\/127\.0\.0\.1(:\d{1,5})?$/,
  /^https:\/\/familienapp-[a-z0-9-]+-volkmar11s-projects\.vercel\.app$/,
];

const list = (v) => String(v || "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);

function parseBool(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "ja"].includes(s)) return true;
  if (["false", "0", "no", "nein"].includes(s)) return false;
  return null; // nicht gesetzt / unklar
}

// env: Funktion name → Wert (Deno.env.get bzw. ein Objekt im Test)
export function corsConfig(env) {
  const get = typeof env === "function" ? env : (k) => env?.[k];
  const supabaseUrl = String(get("SUPABASE_URL") || "");
  const isTestProject = supabaseUrl.includes(`${TEST_PROJECT_REF}.supabase.co`);
  const explicit = parseBool(get("WC_ALLOW_DEV_ORIGINS"));
  return {
    allowDev: explicit ?? isTestProject,
    exact: [...list(get("WC_APP_ORIGIN")), ...list(get("WC_ALLOWED_ORIGINS"))],
  };
}

export function isAllowedOrigin(origin, config) {
  if (!origin || typeof origin !== "string" || origin === "null") return false;
  if (config.exact.includes(origin)) return true;
  return config.allowDev && DEV_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

export function corsHeaders(origin, config) {
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (isAllowedOrigin(origin, config)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
