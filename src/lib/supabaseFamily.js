// Supabase-Client für den FAMILY-Modus (Auth + Familienarchitektur).
// Sessions verwaltet supabase-js selbst (persistSession/autoRefreshToken);
// es werden keine Tokens oder Passwörter eigenständig gespeichert oder geloggt.
import { createClient } from "@supabase/supabase-js";
import { getFamilyConfig, runtimeEnv } from "../config/backend.js";

export function createFamilyClient(config, options = {}) {
  return createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, ...(options.auth || {}) },
  });
}

let client = null;
// Wirft BackendConfigError, wenn die FAMILY-Konfiguration fehlt oder unzulässig ist.
export function getFamilyClient() {
  if (!client) client = createFamilyClient(getFamilyConfig(runtimeEnv));
  return client;
}
