// Abbildung der relationalen FAMILY-Daten auf das gemeinsame Datenformat der
// Wochen-Champion-Oberfläche (reine Funktionen, keine Standard- oder Beispieldaten).
//
// Sichtbarkeit: KEINE Assignment-Zeilen = für alle Profile sichtbar (entspricht
// assignedTo: [] der bisherigen App). Zeilen vorhanden = nur für diese Profile.
// Status: confirmed zählt; pending wird angezeigt („wartet auf Bestätigung“), zählt nicht;
// rejected wird nicht angezeigt und zählt nicht.

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name ?? a.title ?? "").localeCompare(String(b.name ?? b.title ?? ""));
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const assignedIds = (rows) => asArray(rows).map((r) => r.profile_id).filter(Boolean);

export function mapProfiles(profiles) {
  return asArray(profiles).filter((p) => p.active !== false).sort(bySort).map((p) => ({
    id: p.id,
    name: p.name,
    emoji: p.avatar_emoji || "🙂",
    photo: p.avatar_url || null,
    color: p.color || "#6366f1",
    sortOrder: p.sort_order ?? 0,
    // Neutraler Wert: optionales Eltern-Spielerprofil (Phase 4C1 legt keine an).
    // isAdmin wird im FAMILY-Modus NIE gesetzt – der Elternbereich hängt an Auth-Rolle + PIN.
    isAdmin: false,
    isParentPlayer: p.is_parent === true,
  }));
}

export function mapCategories(categories) {
  return asArray(categories).sort(bySort).map((c) => ({
    id: c.id, name: c.name, emoji: c.icon || "📦", assignedTo: assignedIds(c.category_assignments),
  }));
}

export function mapTasks(tasks, categoryById) {
  return asArray(tasks).filter((t) => t.active !== false).sort(bySort).map((t) => ({
    id: t.id,
    name: t.title,
    emoji: t.icon || "✅",
    photo: t.image_url || null,
    points: t.points,
    categoryId: t.category_id ?? null,
    category: (t.category_id && categoryById.get(t.category_id)?.name) || "",
    recurring: t.recurrence || "daily",
    assignedTo: assignedIds(t.task_assignments),
  }));
}

export function mapRewards(rewards) {
  return asArray(rewards).filter((r) => r.active !== false).sort(bySort).map((r) => ({
    id: r.id, name: r.title, emoji: r.icon || "🎁", pointsCost: r.points_required, assignedTo: assignedIds(r.reward_assignments),
  }));
}

export function mapCompletions(completions, memberById) {
  return asArray(completions)
    .filter((c) => c.status !== "rejected")
    .sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)))
    .map((c) => {
      const m = memberById.get(c.profile_id);
      const pending = c.status === "pending";
      return {
        id: c.id,
        taskId: c.task_id,
        taskName: c.task_title,
        memberId: c.profile_id,
        memberName: m?.name ?? "",
        memberEmoji: m?.emoji ?? "🙂",
        points: c.points,
        date: c.completed_at,
        day: c.completion_date,
        category: c.category_name || "",
        needsConfirm: pending,
        confirmed: c.status === "confirmed",
        status: c.status,
      };
    });
}

export function mapRedemptions(redemptions) {
  return asArray(redemptions)
    .sort((a, b) => String(a.redeemed_at).localeCompare(String(b.redeemed_at)))
    .map((r) => ({
      id: r.id, rewardId: r.reward_id, rewardName: r.reward_title, memberId: r.profile_id,
      pointsCost: r.points_spent, date: r.redeemed_at, acknowledged: !!r.acknowledged_at,
    }));
}

// Eltern-Hinweise = noch nicht bestätigte Einlösungen (ersetzt notifications[] der alten App).
export function deriveNotifications(redeemedRewards, memberById) {
  return redeemedRewards.filter((r) => !r.acknowledged).map((r) => {
    const m = memberById.get(r.memberId);
    return { id: `redemption-${r.id}`, type: "reward", message: `${m?.emoji ?? "🙂"} ${m?.name ?? "Profil"} hat "${r.rewardName}" (${r.pointsCost}⭐) eingelöst!`, date: r.date, read: false, memberId: r.memberId };
  });
}

export function mapChampionHistory(rows) {
  return asArray(rows).sort((a, b) => String(a.week_start).localeCompare(String(b.week_start))).map((h) => ({
    memberId: h.profile_id, name: h.profile_name, emoji: h.profile_avatar || "🏆", pts: h.points, week: h.week_start,
  }));
}

export function mapFamilyToChampionData(raw) {
  const settingsRow = Array.isArray(raw.family_settings) ? raw.family_settings[0] : raw.family_settings;
  const members = mapProfiles(raw.profiles);
  const memberById = new Map(members.map((m) => [m.id, m]));
  const categories = mapCategories(raw.categories);
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const redeemedRewards = mapRedemptions(raw.redemptions);
  const settings = {
    showDailyCrown: settingsRow?.show_daily_crown !== false,
    requireConfirmation: settingsRow?.require_confirmation !== false,
    timezone: settingsRow?.timezone || "Europe/Berlin",
  };
  return {
    family: { id: raw.id, name: raw.name },
    settings,
    data: {
      members,
      tasks: mapTasks(raw.tasks, categoryById),
      completions: mapCompletions(raw.completions, memberById),
      rewards: mapRewards(raw.rewards),
      redeemedRewards,
      championHistory: mapChampionHistory(raw.champion_history),
      customCategories: categories, // nie null → keine Standardkategorien der alten App
      needsConfirmation: settings.requireConfirmation,
      notifications: deriveNotifications(redeemedRewards, memberById),
      lastChampionWeek: settingsRow?.last_champion_week ?? null,
      // kein adminPin: der FAMILY-Elternbereich nutzt verify_parent_pin (ab Phase 4C2)
    },
  };
}
