// Supabase-Client für den LEGACY-Modus (bestehende Web-App mit public.app_state).
// Wird nur geladen, wenn VITE_BACKEND_MODE nicht "family" ist.
import { createClient } from "@supabase/supabase-js";
import { getLegacyConfig, runtimeEnv } from "../config/backend.js";

const { url, key } = getLegacyConfig(runtimeEnv);
export const supabaseLegacy = createClient(url, key);
