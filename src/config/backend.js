// Zentrale Backend-Auswahl für Wochen Champion.
// Umschaltung ausschließlich über VITE_BACKEND_MODE (keine automatische Erkennung).
//   legacy – bestehende Web-App mit public.app_state (Standard, wenn nicht gesetzt)
//   family – neue Auth-/Familienarchitektur (nur gegen das Testprojekt verwenden)

export const BACKEND_MODES = Object.freeze({ LEGACY: "legacy", FAMILY: "family" });

export class BackendConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackendConfigError";
  }
}

const clean = (v) => (typeof v === "string" ? v.trim() : "");

// Fehlender/leerer Wert → legacy. Ungültiger Wert → Fehler, nie stilles Umschalten.
export function resolveBackendMode(env = {}) {
  const raw = clean(env.VITE_BACKEND_MODE).toLowerCase();
  if (!raw) return BACKEND_MODES.LEGACY;
  if (raw === BACKEND_MODES.LEGACY || raw === BACKEND_MODES.FAMILY) return raw;
  throw new BackendConfigError(
    `Ungültiger Wert für VITE_BACKEND_MODE: "${env.VITE_BACKEND_MODE}". Erlaubt sind "legacy" oder "family".`
  );
}

export function getLegacyConfig(env = {}) {
  return { url: clean(env.VITE_SUPABASE_URL), key: clean(env.VITE_SUPABASE_ANON_KEY) };
}

const normalizeUrl = (u) => u.replace(/\/+$/, "").toLowerCase();

// FAMILY nutzt eine eigene, getrennte Konfiguration. Sie darf nie auf dasselbe
// Projekt zeigen wie die Legacy-Konfiguration (Schutz vor versehentlicher
// Verbindung der neuen Architektur mit dem Produktionsprojekt).
export function getFamilyConfig(env = {}) {
  const url = clean(env.VITE_FAMILY_SUPABASE_URL);
  const key = clean(env.VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY);
  const missing = [];
  if (!url) missing.push("VITE_FAMILY_SUPABASE_URL");
  if (!key) missing.push("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY");
  if (missing.length) {
    throw new BackendConfigError(`FAMILY-Modus ist aktiv, aber es fehlen: ${missing.join(", ")}.`);
  }
  if (!/^https:\/\/[^/]+$/i.test(url.replace(/\/+$/, "")) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.replace(/\/+$/, ""))) {
    throw new BackendConfigError("VITE_FAMILY_SUPABASE_URL ist keine gültige Projekt-URL (erwartet: https://<ref>.supabase.co).");
  }
  if (/service_role|^sb_secret_/i.test(key)) {
    throw new BackendConfigError("VITE_FAMILY_SUPABASE_PUBLISHABLE_KEY darf niemals ein Secret- oder service_role-Key sein.");
  }
  const legacyUrl = clean(env.VITE_SUPABASE_URL);
  if (legacyUrl && normalizeUrl(legacyUrl) === normalizeUrl(url)) {
    throw new BackendConfigError(
      "VITE_FAMILY_SUPABASE_URL zeigt auf dasselbe Projekt wie VITE_SUPABASE_URL (Legacy/Produktion). Der FAMILY-Modus darf nur mit dem separaten Testprojekt betrieben werden."
    );
  }
  return { url, key };
}

// Laufzeitwerte aus Vite (im Node-Test nicht vorhanden)
export const runtimeEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};
