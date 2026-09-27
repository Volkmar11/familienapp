// Ermittelt die Familien-Mitgliedschaften des angemeldeten Nutzers.
// Zugriff ausschließlich über RLS (family_members_select: nur eigene Familien).
// Die RLS-Policy liefert auch Mitgliedschaften anderer Eltern derselben Familie,
// daher wird zusätzlich explizit auf user_id = eigener Nutzer gefiltert.

export async function fetchMemberships(client, userId) {
  const { data, error } = await client
    .from("family_members")
    .select("family_id, role, created_at, families(id, name)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error };
  const memberships = (data || []).map((m) => ({
    familyId: m.family_id,
    role: m.role,
    familyName: m.families?.name ?? null,
  }));
  return { ok: true, memberships };
}

// none → Onboarding (Phase 4B) · single → aktive Familie · multiple → Auswahl
export function classifyMemberships(memberships) {
  if (!memberships || memberships.length === 0) return "none";
  return memberships.length === 1 ? "single" : "multiple";
}
