// Zentrale Auth-Redirects (Phase 5C). Keine verstreuten window.location.origin-Aufrufe.
//
// Umgebungen:
//   localhost        http://localhost:<port> / 127.0.0.1 – lokale Entwicklung
//   vercel-preview   https://familienapp-…-volkmar11s-projects.vercel.app – FAMILY-Preview
//   production-web   feste Produktions-URL aus VITE_AUTH_REDIRECT_URL (noch nicht festgelegt)
//   native           spätere iOS-App (Capacitor). Redirect kommt aus VITE_NATIVE_AUTH_REDIRECT_URL;
//                    Bundle-ID/URL-Scheme sind bewusst noch NICHT festgelegt → ohne Konfiguration kein Redirect.
//
// Jede hier erzeugte URL muss in Supabase unter Authentication → URL Configuration → Redirect URLs
// erlaubt sein, sonst fällt Supabase auf die Site URL zurück.

const PREVIEW_HOST = /^familienapp-[a-z0-9-]+-volkmar11s-projects\.vercel\.app$/;
export const RECOVERY_PATH = "/";           // App-Wurzel; FamilyApp erkennt PASSWORD_RECOVERY

export function detectAuthEnvironment({ location = globalThis.location, isNative = defaultIsNative() } = {}) {
  if (isNative) return "native";
  const host = location?.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") return "localhost";
  if (PREVIEW_HOST.test(host)) return "vercel-preview";
  return "production-web";
}

function defaultIsNative() {
  try { return !!globalThis.Capacitor?.isNativePlatform?.(); } catch { return false; }
}

const cleanBase = (u) => {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol) && !/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) return null;
    return url.href.replace(/\/+$/, "");
  } catch { return null; }
};

// Redirect-URL für E-Mail-Links (Passwort-Reset; später ggf. Bestätigung/Einladung).
// env: { VITE_AUTH_REDIRECT_URL, VITE_NATIVE_AUTH_REDIRECT_URL }
export function getAuthRedirectUrl(kind = "recovery", { env = {}, location = globalThis.location, isNative } = {}) {
  const where = detectAuthEnvironment({ location, isNative: isNative ?? defaultIsNative() });
  const path = kind === "recovery" ? RECOVERY_PATH : "/";
  if (where === "native") {
    const base = cleanBase(env.VITE_NATIVE_AUTH_REDIRECT_URL || "");
    return base ? base + path.replace(/^\/$/, "") : null; // nicht konfiguriert → Supabase Site URL
  }
  if (where === "production-web" && env.VITE_AUTH_REDIRECT_URL) {
    const base = cleanBase(env.VITE_AUTH_REDIRECT_URL);
    if (base) return base + path;
  }
  const origin = location?.origin && cleanBase(location.origin);
  return origin ? origin + path : null;
}

// Fehler aus dem Redirect-Link (z. B. abgelaufener Reset-Link) → deutsche Meldung, sonst "".
// Supabase hängt sie als Hash oder Query an: #error=access_denied&error_code=otp_expired&…
export function readAuthRedirectError(location = globalThis.location) {
  const raw = `${location?.hash || ""}&${(location?.search || "").replace(/^\?/, "")}`.replace(/^#/, "");
  const p = new URLSearchParams(raw);
  const code = p.get("error_code") || p.get("error");
  if (!code) return "";
  if (/expired/i.test(code)) return "Der Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.";
  return "Der Link ist ungültig. Bitte fordere einen neuen Link an.";
}

// true, wenn die aktuelle URL ein Recovery-Link ist (Fallback, falls das Ereignis vor dem Listener kam)
export function isRecoveryRedirect(location = globalThis.location) {
  return /(^|[#&?])type=recovery(&|$)/.test(`${location?.hash || ""}&${location?.search || ""}`);
}

// Token-/Fehlerparameter nach der Verarbeitung aus der Adresszeile entfernen (kein Token im Verlauf)
export function clearAuthParamsFromUrl(win = globalThis.window) {
  try {
    if (!win?.history?.replaceState) return;
    const u = new URL(win.location.href);
    const hadHash = /access_token|error|type=recovery/.test(u.hash);
    ["code", "error", "error_code", "error_description", "type"].forEach((k) => u.searchParams.delete(k));
    if (hadHash) u.hash = "";
    win.history.replaceState(win.history.state, "", u.pathname + u.search + u.hash);
  } catch { /* ignore */ }
}
