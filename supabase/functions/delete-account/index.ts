// Edge Function delete-account (Phase 5C): löscht das Konto des AUFRUFERS.
// Ablauf (idempotent wiederholbar):
//   1. Aufrufer verifizieren (JWT beim Auth-Server) + frische Passwort-Anmeldung (≤ 5 min)
//   2. Löschplan bestimmen (account_deletion_plan): Familie löschen / austreten / owner übertragen
//   3. Medien der zu löschenden Familien entfernen (families/<id>/…)
//   4. DB: execute_account_deletion (Familien löschen, Ownership übertragen, Mitgliedschaften entfernen)
//   5. Auth-User löschen (hart, keine Deaktivierung)
// Ein Request-Body wird ignoriert – insbesondere kann KEINE fremde user_id übergeben werden.
import { adminClient, authenticate, corsHeaders, json, logAction, removeFamilyMediaTree } from "../_shared/lifecycle.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405, origin);

  const admin = adminClient();
  const auth = await authenticate(req, admin);
  if (!auth.ok) return json({ ok: false, reason: auth.reason }, auth.status, origin);
  const userId = auth.user.id;

  try {
    const plan = await admin.rpc("account_deletion_plan", { p_user_id: userId });
    if (plan.error) throw new Error("plan");
    const rows = (plan.data || []) as Array<{ family_id: string; action: string }>;
    let media = 0;
    for (const r of rows.filter((x) => x.action === "delete_family")) media += await removeFamilyMediaTree(admin, r.family_id);

    const exec = await admin.rpc("execute_account_deletion", { p_user_id: userId });
    if (exec.error) throw new Error("execute");

    const del = await admin.auth.admin.deleteUser(userId, false);
    if (del.error) throw new Error("auth-delete");

    const d = exec.data as { deleted_families: string[]; left_families: string[]; ownership_transferred: string[] };
    logAction("delete-account", { families_deleted: d.deleted_families.length, families_left: d.left_families.length, ownership_transferred: d.ownership_transferred.length, media_removed: media });
    return json({ ok: true, deletedFamilies: d.deleted_families.length, leftFamilies: d.left_families.length, ownershipTransferred: d.ownership_transferred.length, mediaRemoved: media }, 200, origin);
  } catch (e) {
    // Zustand bleibt nachvollziehbar; erneuter Aufruf setzt an derselben Stelle fort.
    logAction("delete-account-failed", { step: e instanceof Error ? e.message : "unknown" });
    return json({ ok: false, reason: "server" }, 500, origin);
  }
});
