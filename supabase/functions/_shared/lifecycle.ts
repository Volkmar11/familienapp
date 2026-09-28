// Gemeinsame Logik der Edge Functions delete-account / delete-family (Phase 5C).
// Serverseitig: Der privilegierte Schlüssel wird von der Supabase-Laufzeit als Secret bereitgestellt
// (SUPABASE_SERVICE_ROLE_KEY bzw. SUPABASE_SECRET_KEYS) und verlässt die Function nie.
// Logs enthalten nur Aktionsnamen und Zähler – keine E-Mail-Adressen, keine Tokens, keine Passwörter.
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";
import { corsConfig, isAllowedOrigin as isAllowedOriginFor, corsHeaders as corsHeadersFor } from "./cors.js";

export const MEDIA_BUCKET = "family-media";
export const REAUTH_MAX_AGE_SECONDS = 300; // Passwort-Anmeldung höchstens 5 Minuten alt

// CORS: Regeln in ./cors.js (Produktions-Origin per WC_APP_ORIGIN/WC_ALLOWED_ORIGINS,
// localhost/Previews nur mit WC_ALLOW_DEV_ORIGINS=true bzw. automatisch im Testprojekt).
const CORS = corsConfig((k: string) => Deno.env.get(k));
export function isAllowedOrigin(origin: string | null): boolean {
  return isAllowedOriginFor(origin, CORS);
}
export function corsHeaders(origin: string | null): Record<string, string> {
  return corsHeadersFor(origin, CORS);
}
export function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}

function serviceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (k) return k;
  try { const all = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); return all.default || Object.values(all)[0] as string; } catch { return ""; }
}
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
// Client im Namen des Aufrufers (RLS/Funktionen wie verify_parent_pin mit dessen auth.uid())
export function userClient(token: string): SupabaseClient {
  const key = Deno.env.get("SUPABASE_ANON_KEY") || "";
  return createClient(Deno.env.get("SUPABASE_URL")!, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] || "";
  const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(b64));
}

export type AuthResult = { ok: true; user: User; token: string } | { ok: false; status: number; reason: string };

// 1. Token aus dem Authorization-Header, 2. serverseitig beim Auth-Server verifizieren (getUser),
// 3. Frische: letzte Passwort-Anmeldung (JWT-Claim amr) höchstens REAUTH_MAX_AGE_SECONDS alt.
// Die user_id stammt ausschließlich aus dem verifizierten Token – nie aus dem Request-Body.
export async function authenticate(req: Request, admin: SupabaseClient, { requireFresh = true } = {}): Promise<AuthResult> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") || "");
  if (!m) return { ok: false, status: 401, reason: "unauthorized" };
  const token = m[1].trim();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, reason: "unauthorized" };
  if (data.user.is_anonymous) return { ok: false, status: 403, reason: "forbidden" };
  if (requireFresh) {
    let fresh = false;
    try {
      const claims = decodeJwtPayload(token);
      const amr = Array.isArray(claims.amr) ? claims.amr as Array<{ method?: string; timestamp?: number }> : [];
      const ts = Math.max(0, ...amr.filter((a) => a.method === "password").map((a) => Number(a.timestamp) || 0));
      fresh = ts > 0 && Date.now() / 1000 - ts <= REAUTH_MAX_AGE_SECONDS;
    } catch { fresh = false; }
    if (!fresh) return { ok: false, status: 401, reason: "reauth_required" };
  }
  return { ok: true, user: data.user, token };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

// Alle Medien unter families/<familyId>/ entfernen (idempotent; fehlende Objekte werden ignoriert).
export async function removeFamilyMediaTree(admin: SupabaseClient, familyId: string): Promise<number> {
  if (!isUuid(familyId)) throw new Error("invalid family id");
  const root = `families/${familyId}`;
  const bucket = admin.storage.from(MEDIA_BUCKET);
  const paths: string[] = [];
  for (const folder of ["profiles", "tasks"]) {
    const ents = await bucket.list(`${root}/${folder}`, { limit: 1000 });
    if (ents.error) throw new Error("media list failed");
    for (const e of ents.data || []) {
      if (!isUuid(e.name)) continue;
      const files = await bucket.list(`${root}/${folder}/${e.name}`, { limit: 1000 });
      if (files.error) throw new Error("media list failed");
      for (const f of files.data || []) if (f.id) paths.push(`${root}/${folder}/${e.name}/${f.name}`);
    }
  }
  for (let i = 0; i < paths.length; i += 100) {
    const r = await bucket.remove(paths.slice(i, i + 100));
    if (r.error) throw new Error("media remove failed");
  }
  return paths.length;
}

export function logAction(action: string, info: Record<string, number | string | boolean> = {}) {
  // bewusst ohne user_id, E-Mail, Token
  console.log(JSON.stringify({ fn: "account-lifecycle", action, ...info }));
}
