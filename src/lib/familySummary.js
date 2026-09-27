// Kurzübersicht einer Familie für den Zwischen-Startbildschirm (Phase 4B).
// Nur lesend, ausschließlich über RLS.
export async function fetchFamilySummary(client, familyId) {
  const [fam, profiles, tasks, rewards, settings] = await Promise.all([
    client.from("families").select("name").eq("id", familyId).maybeSingle(),
    client.from("profiles").select("id, name, avatar_emoji, color, sort_order").eq("family_id", familyId).eq("active", true).order("sort_order"),
    client.from("tasks").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("active", true),
    client.from("rewards").select("id", { count: "exact", head: true }).eq("family_id", familyId).eq("active", true),
    client.from("family_settings").select("show_daily_crown, require_confirmation").eq("family_id", familyId).maybeSingle(),
  ]);
  const error = fam.error || profiles.error || tasks.error || rewards.error || settings.error;
  if (error) return { ok: false, error };
  return {
    ok: true,
    summary: {
      name: fam.data?.name ?? "",
      profiles: profiles.data ?? [],
      taskCount: tasks.count ?? 0,
      rewardCount: rewards.count ?? 0,
      showDailyCrown: settings.data?.show_daily_crown ?? true,
      requireConfirmation: settings.data?.require_confirmation ?? true,
    },
  };
}
