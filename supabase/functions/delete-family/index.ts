// Edge Function delete-family (Phase 5C): löscht EINE Familie inkl. aller Daten und Medien.
// Das Auth-Konto des Aufrufers bleibt bestehen.
// Voraussetzungen (alle serverseitig geprüft):
//   * gültiger, frischer Aufrufer (Passwort-Anmeldung ≤ 5 min)
//   * Aufrufer ist owner der Familie (family_owner_check) – parent darf nicht
//   * Eltern-PIN korrekt (verify_parent_pin im Namen des Aufrufers, inkl. Fehlversuchssperre)
// Body: { familyId, pin }
import { adminClient, authenticate, corsHeaders, isUuid, json, logAction, removeFamilyMediaTree, userClient } from "../_shared/lifecycle.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405, origin);

  const admin = adminClient();
  const auth = await authenticate(req, admin);
  if (!auth.ok) return json({ ok: false, reason: auth.reason }, auth.status, origin);

  let body: { familyId?: unknown; pin?: unknown } = {};
  try { body = await req.json(); } catch { /* leer */ }
  const familyId = body.familyId;
  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!isUuid(familyId) || !/^[0-9]{4}$/.test(pin)) return json({ ok: false, reason: "invalid" }, 400, origin);

  const owner = await admin.rpc("family_owner_check", { p_user_id: auth.user.id, p_family_id: familyId });
  if (owner.error) return json({ ok: false, reason: "server" }, 500, origin);
  if (owner.data !== true) return json({ ok: false, reason: "forbidden" }, 403, origin);

  const pinCheck = await userClient(auth.token).rpc("verify_parent_pin", { p_family_id: familyId, p_pin: pin });
  if (pinCheck.error || pinCheck.data !== true) return json({ ok: false, reason: "pin" }, 403, origin);

  try {
    const media = await removeFamilyMediaTree(admin, familyId);
    const del = await admin.rpc("delete_family_as_service", { p_family_id: familyId });
    if (del.error) throw new Error("delete");
    logAction("delete-family", { media_removed: media, deleted: Boolean((del.data as { deleted: boolean }).deleted) });
    return json({ ok: true, mediaRemoved: media }, 200, origin);
  } catch (e) {
    logAction("delete-family-failed", { step: e instanceof Error ? e.message : "unknown" });
    return json({ ok: false, reason: "server" }, 500, origin);
  }
});
