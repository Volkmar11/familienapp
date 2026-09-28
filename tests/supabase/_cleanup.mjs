// Gemeinsames Aufräumen der Integrationstests (Phase 6A).
// Seit der Release-Härtung gibt es kein direktes DELETE auf public.families mehr. Wegwerf-Konten
// werden deshalb über den echten Lifecycle-Pfad entfernt: Edge Function delete-account löscht
// Familien, in denen das Konto das letzte Elternkonto ist (inkl. Bilder über die Storage-API),
// verlässt geteilte Familien und löscht den Auth-User. Nur für @example.com-Wegwerfkonten.
import { createClient } from "@supabase/supabase-js";
import { deleteAccount, DELETE_ACCOUNT_PHRASE } from "../../src/lib/accountLifecycle.js";

export async function deleteTestAccounts(cfg, users) {
  const out = { ok: true, deletedFamilies: 0, accounts: 0, failed: 0 };
  for (const u of users) {
    if (!u?.email || !u?.password) { out.ok = false; out.failed++; continue; }
    if (!/@example\.com$/i.test(u.email)) throw new Error("Aufräumen nur für @example.com-Wegwerfkonten.");
    const c = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const s = await c.auth.signInWithPassword({ email: u.email, password: u.password });
    if (s.error) { out.ok = false; out.failed++; continue; }
    const r = await deleteAccount(c, { password: u.password, phrase: DELETE_ACCOUNT_PHRASE });
    if (!r.ok) { out.ok = false; out.failed++; continue; }
    out.accounts++; out.deletedFamilies += r.deletedFamilies || 0;
  }
  return out;
}
