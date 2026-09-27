// FAMILY-Mutationsschicht (Phase 4C2A). Einziger Ort mit Schreibzugriffen des FAMILY-Modus.
// Alle Funktionen erhalten den FAMILY-Client (RLS, Publishable Key) und liefern
//   { ok: true, ...daten } | { ok: false, reason, message }
// „message“ ist eine deutsche, nutzerfreundliche Meldung (keine rohen DB-Fehler).
// PINs werden weder geloggt noch gespeichert; sie gehen nur an die RPCs.
import { toDateKey } from "./dateUtils.js";

export const PIN_PATTERN = /^[0-9]{4}$/;

export const MESSAGES = {
  generic: "Das hat leider nicht geklappt. Bitte versucht es erneut.",
  network: "Keine Verbindung zum Server. Bitte Internetverbindung prüfen und erneut versuchen.",
  forbidden: "Dafür fehlt die Berechtigung.",
  duplicate: "Diese Aufgabe wurde heute bereits erledigt.",
  taskUnavailable: "Diese Aufgabe ist nicht mehr verfügbar.",
  profileUnavailable: "Dieses Profil ist nicht mehr verfügbar.",
  alreadyConfirmed: "Diese Aufgabe wurde schon bestätigt. Nur Eltern können sie korrigieren.",
  notFound: "Dieser Eintrag wurde nicht gefunden. Die Anzeige wird aktualisiert.",
  notPending: "Dieser Eintrag wartet nicht mehr auf Bestätigung.",
  rewardUnavailable: "Diese Belohnung ist nicht mehr verfügbar.",
  rewardNotAssigned: "Diese Belohnung ist für dieses Profil nicht vorgesehen.",
  pinFormat: "Die PIN muss aus genau 4 Ziffern bestehen.",
  pinWrong: "Falsche PIN.",
  pinCurrentWrong: "Die aktuelle PIN ist falsch.",
  pinMismatch: "Die neuen PINs stimmen nicht überein.",
  pinLocked: "Zu viele Fehlversuche. Bitte versucht es in einer Minute erneut.",
  invalid: "Die Eingaben sind ungültig. Bitte prüfen (z. B. Länge, Punkte, Zuordnung).",
  categoryDuplicate: "Eine Kategorie mit diesem Namen gibt es schon.",
  lastActive: "Mindestens ein Kinderprofil muss aktiv bleiben.",
  notConfirmed: "Nur bestätigte Erledigungen können zurückgenommen werden.",
  notRejected: "Dieser Eintrag ist nicht zurückgenommen.",
  reconfirmDuplicate: "Für diesen Tag gibt es diese Aufgabe schon als Erledigung.",
};

export const missingPointsMessage = (missing) => `Dafür fehlen noch ${missing} ${missing === 1 ? "Punkt" : "Punkte"}.`;

// Meldungen der DB-Schutz-Trigger (Hint) → Nutzertext
const HINT_MESSAGES = {
  last_active_profile: "Mindestens ein Kinderprofil muss aktiv bleiben.",
  profile_has_history: "Dieses Profil hat bereits Punkte oder Verlauf und wird deshalb nur archiviert.",
  profile_has_assignments: "Dieses Profil ist Aufgaben, Kategorien oder Belohnungen zugeordnet und wird deshalb nur archiviert.",
  category_has_tasks: "Diese Kategorie enthält noch aktive Aufgaben. Bitte verschiebe sie zuerst.",
};

// Supabase-/Netzwerkfehler → { reason, message }. Intern nur Code und Kurztext loggen.
// dupMessage: aktionsspezifische Meldung für Eindeutigkeitskonflikte (23505).
export function toMutationError(error, action, dupMessage = MESSAGES.duplicate) {
  const code = error?.code ?? "";
  const msg = String(error?.message ?? "");
  console.error(`[familyMutations] ${action} fehlgeschlagen`, code || msg.slice(0, 120));
  if (HINT_MESSAGES[error?.hint]) return { ok: false, reason: error.hint, message: HINT_MESSAGES[error.hint] };
  if (code === "23505") return { ok: false, reason: "duplicate", message: dupMessage };
  if (code === "23514" || code === "22023" || code === "22P02") return { ok: false, reason: "invalid", message: MESSAGES.invalid };
  if (code === "P0002") return { ok: false, reason: "not_found", message: MESSAGES.notFound };
  if (code === "42501" || code === "PGRST301" || /permission denied|row-level security/i.test(msg)) return { ok: false, reason: "forbidden", message: MESSAGES.forbidden };
  if (/Failed to fetch|NetworkError|fetch failed|ECONN|timeout/i.test(msg)) return { ok: false, reason: "network", message: MESSAGES.network };
  return { ok: false, reason: "error", message: MESSAGES.generic };
}

async function run(action, fn) {
  try { return await fn(); } catch (e) { return toMutationError(e, action); }
}

// ---------------------------------------------------------------------------
// Aufgabe erledigen: Status, Punkte und Titel werden frisch aus der DB gelesen
// (nicht aus evtl. veraltetem UI-Zustand). Datum = lokaler Kalendertag (dateUtils).
// require_confirmation=true → pending (außer Eltern-Spielerprofil), sonst confirmed.
// ---------------------------------------------------------------------------
export function completeTask(client, { familyId, profileId, taskId, now = new Date() }) {
  return run("completeTask", async () => {
    const [settings, task, profile] = await Promise.all([
      client.from("family_settings").select("require_confirmation").eq("family_id", familyId).maybeSingle(),
      client.from("tasks").select("id, title, points, active, categories ( name )").eq("family_id", familyId).eq("id", taskId).maybeSingle(),
      client.from("profiles").select("id, active, is_parent").eq("family_id", familyId).eq("id", profileId).maybeSingle(),
    ]);
    for (const r of [settings, task, profile]) if (r.error) return toMutationError(r.error, "completeTask");
    if (!settings.data) return { ok: false, reason: "forbidden", message: MESSAGES.forbidden };
    if (!profile.data || !profile.data.active) return { ok: false, reason: "profile", message: MESSAGES.profileUnavailable };
    if (!task.data || !task.data.active) return { ok: false, reason: "task", message: MESSAGES.taskUnavailable };
    const status = settings.data.require_confirmation && !profile.data.is_parent ? "pending" : "confirmed";
    const ins = await client.from("completions").insert({
      family_id: familyId,
      profile_id: profileId,
      task_id: taskId,
      task_title: task.data.title,
      category_name: task.data.categories?.name ?? null,
      points: task.data.points,
      completed_at: now.toISOString(),
      completion_date: toDateKey(now),
      status,
    }).select("id, status, points, completion_date").single();
    if (ins.error) return toMutationError(ins.error, "completeTask");
    return { ok: true, completion: ins.data, status, points: ins.data.points };
  });
}

// ---------------------------------------------------------------------------
// Rückgängig: nur die passende, noch offene (pending) Erledigung von heute.
// Bestätigte Einträge nimmt das Kind nicht selbst zurück (Version 1).
// ---------------------------------------------------------------------------
export function undoCompletion(client, { familyId, profileId, taskId, completionDate }) {
  return run("undoCompletion", async () => {
    const del = await client.from("completions").delete()
      .eq("family_id", familyId).eq("profile_id", profileId).eq("task_id", taskId)
      .eq("completion_date", completionDate).eq("status", "pending")
      .select("id");
    if (del.error) return toMutationError(del.error, "undoCompletion");
    if (del.data.length === 1) return { ok: true, deletedId: del.data[0].id };
    const rest = await client.from("completions").select("id, status")
      .eq("family_id", familyId).eq("profile_id", profileId).eq("task_id", taskId)
      .eq("completion_date", completionDate).neq("status", "rejected");
    if (!rest.error && rest.data.some((c) => c.status === "confirmed")) return { ok: false, reason: "confirmed", message: MESSAGES.alreadyConfirmed };
    return { ok: false, reason: "not_found", message: MESSAGES.notFound };
  });
}

// ---------------------------------------------------------------------------
// Bestätigen / Ablehnen (Elternbereich). confirmed_at/confirmed_by setzt der
// DB-Trigger (confirmed_by = auth.uid()); nur offene Einträge werden geändert.
// ---------------------------------------------------------------------------
function reviewCompletion(client, { familyId, completionId }, status, action) {
  return run(action, async () => {
    const upd = await client.from("completions").update({ status })
      .eq("family_id", familyId).eq("id", completionId).eq("status", "pending")
      .select("id, status, confirmed_at, confirmed_by");
    if (upd.error) return toMutationError(upd.error, action);
    if (upd.data.length !== 1) return { ok: false, reason: "not_pending", message: MESSAGES.notPending };
    return { ok: true, completion: upd.data[0] };
  });
}
export const confirmCompletion = (client, args) => reviewCompletion(client, args, "confirmed", "confirmCompletion");
export const rejectCompletion = (client, args) => reviewCompletion(client, args, "rejected", "rejectCompletion");

// ---------------------------------------------------------------------------
// Belohnung einlösen – ausschließlich über die RPC redeem_reward (serverseitige
// Punkteprüfung, Zeilensperre gegen parallele Einlösungen).
// ---------------------------------------------------------------------------
export function redeemReward(client, { familyId, profileId, rewardId }) {
  return run("redeemReward", async () => {
    const r = await client.rpc("redeem_reward", { p_family_id: familyId, p_profile_id: profileId, p_reward_id: rewardId });
    if (r.error) return toMutationError(r.error, "redeemReward");
    const d = r.data || {};
    if (d.ok) return { ok: true, redemptionId: d.redemption_id, pointsSpent: d.points_spent, available: d.available };
    switch (d.reason) {
      case "insufficient_points": return { ok: false, reason: d.reason, message: missingPointsMessage(d.required - d.available), available: d.available, required: d.required };
      case "not_assigned": return { ok: false, reason: d.reason, message: MESSAGES.rewardNotAssigned };
      case "profile_not_found": return { ok: false, reason: d.reason, message: MESSAGES.profileUnavailable };
      case "reward_not_found":
      case "reward_inactive": return { ok: false, reason: d.reason, message: MESSAGES.rewardUnavailable };
      default: return { ok: false, reason: "error", message: MESSAGES.generic };
    }
  });
}

// ---------------------------------------------------------------------------
// Familien-Einstellungen (RLS: nur owner/parent). Gilt nur für künftige Aktionen;
// bestehende pending-Einträge bleiben unverändert.
// ---------------------------------------------------------------------------
export function updateFamilySettings(client, { familyId, showDailyCrown, requireConfirmation }) {
  return run("updateFamilySettings", async () => {
    const patch = {};
    if (typeof showDailyCrown === "boolean") patch.show_daily_crown = showDailyCrown;
    if (typeof requireConfirmation === "boolean") patch.require_confirmation = requireConfirmation;
    if (!Object.keys(patch).length) return { ok: false, reason: "invalid", message: MESSAGES.generic };
    const upd = await client.from("family_settings").update(patch).eq("family_id", familyId)
      .select("show_daily_crown, require_confirmation");
    if (upd.error) return toMutationError(upd.error, "updateFamilySettings");
    if (upd.data.length !== 1) return { ok: false, reason: "forbidden", message: MESSAGES.forbidden };
    return { ok: true, settings: upd.data[0] };
  });
}

// ---------------------------------------------------------------------------
// Eltern-PIN prüfen – ausschließlich serverseitig über verify_parent_pin.
// Bei „false“ wird unterschieden: gesperrt (5 Fehlversuche/60 s) oder falsch.
// ---------------------------------------------------------------------------
async function pinLockSeconds(client, familyId) {
  const r = await client.rpc("parent_pin_lock_seconds", { p_family_id: familyId });
  return r.error ? 0 : Number(r.data) || 0;
}

export function verifyParentPin(client, { familyId, pin }) {
  return run("verifyParentPin", async () => {
    if (!PIN_PATTERN.test(pin ?? "")) return { ok: false, reason: "format", message: MESSAGES.pinFormat };
    const r = await client.rpc("verify_parent_pin", { p_family_id: familyId, p_pin: pin });
    if (r.error) return toMutationError(r.error, "verifyParentPin");
    if (r.data === true) return { ok: true };
    const locked = await pinLockSeconds(client, familyId);
    return locked > 0 ? { ok: false, reason: "locked", message: MESSAGES.pinLocked, retryAfter: locked } : { ok: false, reason: "wrong", message: MESSAGES.pinWrong };
  });
}

export function validateNewPin(currentPin, newPin, newPin2) {
  if (!PIN_PATTERN.test(currentPin ?? "") || !PIN_PATTERN.test(newPin ?? "")) return MESSAGES.pinFormat;
  if (newPin !== newPin2) return MESSAGES.pinMismatch;
  return "";
}

export function changeParentPin(client, { familyId, currentPin, newPin, newPin2 }) {
  return run("changeParentPin", async () => {
    const invalid = validateNewPin(currentPin, newPin, newPin2);
    if (invalid) return { ok: false, reason: "format", message: invalid };
    const r = await client.rpc("set_parent_pin", { p_family_id: familyId, p_current_pin: currentPin, p_new_pin: newPin });
    if (r.error) return toMutationError(r.error, "changeParentPin");
    if (r.data === true) return { ok: true };
    const locked = await pinLockSeconds(client, familyId);
    return locked > 0 ? { ok: false, reason: "locked", message: MESSAGES.pinLocked, retryAfter: locked } : { ok: false, reason: "wrong", message: MESSAGES.pinCurrentWrong };
  });
}

// =====================================================================
// Phase 4C2B1 – Elternverwaltung (CRUD, Assignments, Sortierung, Korrektur, Quittierung)
// Alle Aktionen laufen unter RLS (owner/parent); Mehrschritt-Änderungen über
// atomare RPCs (set_*_assignments, reorder_items, remove_*, delete_category).
// =====================================================================

export const LIMITS = { TITLE_MAX: 80, NAME_MAX: 40, ICON_MAX: 16, TASK_POINTS_MAX: 10000, REWARD_POINTS_MAX: 100000 };
export const RECURRENCES = ["daily", "weekly", "once"];
const HEX = /^#[0-9A-Fa-f]{6}$/;
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const clean = (v) => String(v ?? "").trim();
const iconOk = (v) => !v || [...String(v)].length <= LIMITS.ICON_MAX;

export function validateTask(t) {
  const title = clean(t?.title);
  if (!title) return "Bitte einen Namen für die Aufgabe eingeben.";
  if (title.length > LIMITS.TITLE_MAX) return `Der Name darf höchstens ${LIMITS.TITLE_MAX} Zeichen haben.`;
  if (!intIn(t.points, 0, LIMITS.TASK_POINTS_MAX)) return `Punkte müssen eine ganze Zahl zwischen 0 und ${LIMITS.TASK_POINTS_MAX} sein.`;
  if (!RECURRENCES.includes(t.recurrence)) return "Bitte eine Wiederholung wählen.";
  if (!iconOk(t.icon)) return "Das Symbol ist zu lang.";
  return "";
}
export function validateReward(r) {
  const title = clean(r?.title);
  if (!title) return "Bitte einen Namen für die Belohnung eingeben.";
  if (title.length > LIMITS.TITLE_MAX) return `Der Name darf höchstens ${LIMITS.TITLE_MAX} Zeichen haben.`;
  if (!intIn(r.pointsRequired, 0, LIMITS.REWARD_POINTS_MAX)) return `Punkte müssen eine ganze Zahl zwischen 0 und ${LIMITS.REWARD_POINTS_MAX} sein.`;
  if (!iconOk(r.icon)) return "Das Symbol ist zu lang.";
  return "";
}
export function validateCategory(c) {
  const name = clean(c?.name);
  if (!name) return "Bitte einen Namen für die Kategorie eingeben.";
  if (name.length > LIMITS.NAME_MAX) return `Der Name darf höchstens ${LIMITS.NAME_MAX} Zeichen haben.`;
  if (!iconOk(c.icon)) return "Das Symbol ist zu lang.";
  return "";
}
export function validateProfile(p) {
  const name = clean(p?.name);
  if (!name) return "Bitte einen Namen für das Kind eingeben.";
  if (name.length > LIMITS.NAME_MAX) return `Der Name darf höchstens ${LIMITS.NAME_MAX} Zeichen haben.`;
  if (!iconOk(p.avatarEmoji)) return "Das Symbol ist zu lang.";
  if (p.color && !HEX.test(p.color)) return "Bitte eine gültige Farbe wählen.";
  return "";
}

async function nextSortOrder(client, table, familyId) {
  const r = await client.from(table).select("sort_order").eq("family_id", familyId).order("sort_order", { ascending: false }).limit(1);
  if (r.error) throw r.error;
  return (r.data?.[0]?.sort_order ?? -1) + 1;
}
const invalid = (message) => ({ ok: false, reason: "invalid", message });

async function setAssignments(client, rpc, familyId, idKey, id, profileIds) {
  const r = await client.rpc(rpc, { p_family_id: familyId, [idKey]: id, p_profile_ids: profileIds ?? [] });
  if (r.error) return toMutationError(r.error, rpc);
  return { ok: true, assignedTo: r.data ?? [] };
}
export const setTaskAssignments = (client, { familyId, taskId, profileIds }) =>
  run("setTaskAssignments", () => setAssignments(client, "set_task_assignments", familyId, "p_task_id", taskId, profileIds));
export const setCategoryAssignments = (client, { familyId, categoryId, profileIds }) =>
  run("setCategoryAssignments", () => setAssignments(client, "set_category_assignments", familyId, "p_category_id", categoryId, profileIds));
export const setRewardAssignments = (client, { familyId, rewardId, profileIds }) =>
  run("setRewardAssignments", () => setAssignments(client, "set_reward_assignments", familyId, "p_reward_id", rewardId, profileIds));

// Gemeinsamer Ablauf für Aufgaben/Belohnungen: Neu mit Zuordnung wird zunächst INAKTIV angelegt,
// dann atomar zugeordnet und erst danach aktiviert. Scheitert ein Schritt, ist der Eintrag nie
// versehentlich „für alle sichtbar“.
async function saveWithAssignments(client, { table, familyId, id, row, active, assignedTo, assign, action }) {
  const wantsSubset = (assignedTo ?? []).length > 0;
  let itemId = id;
  if (!itemId) {
    const sort_order = await nextSortOrder(client, table, familyId);
    const ins = await client.from(table).insert({ ...row, family_id: familyId, sort_order, active: wantsSubset ? false : active })
      .select("id").single();
    if (ins.error) return toMutationError(ins.error, action);
    itemId = ins.data.id;
  } else {
    const upd = await client.from(table).update({ ...row, active }).eq("family_id", familyId).eq("id", itemId).select("id");
    if (upd.error) return toMutationError(upd.error, action);
    if (upd.data.length !== 1) return { ok: false, reason: "not_found", message: MESSAGES.notFound };
  }
  const a = await assign(itemId, assignedTo ?? []);
  if (!a.ok) return { ...a, id: itemId };
  if (!id && wantsSubset && active) {
    const act = await client.from(table).update({ active: true }).eq("family_id", familyId).eq("id", itemId);
    if (act.error) return toMutationError(act.error, action);
  }
  return { ok: true, id: itemId, created: !id };
}

// ---------------------------------------------------------------- Aufgaben
// Änderungen wirken nur auf künftige Erledigungen; gespeicherte Punkte/Titel der
// Historie (completions.points / task_title) bleiben unverändert.
export function saveTask(client, { familyId, task }) {
  return run("saveTask", async () => {
    const t = { ...task, title: clean(task?.title), points: Number(task?.points), recurrence: task?.recurrence || "daily" };
    const err = validateTask(t);
    if (err) return invalid(err);
    return saveWithAssignments(client, {
      table: "tasks", familyId, id: t.id || null, action: "saveTask", active: t.active !== false, assignedTo: t.assignedTo,
      row: { title: t.title, points: t.points, recurrence: t.recurrence, icon: t.icon || null, category_id: t.categoryId || null },
      assign: (taskId, profileIds) => setAssignments(client, "set_task_assignments", familyId, "p_task_id", taskId, profileIds),
    });
  });
}
async function removeVia(client, rpc, args, action, labels) {
  const r = await client.rpc(rpc, args);
  if (r.error) return toMutationError(r.error, action);
  const d = r.data || {};
  if (d.ok) return { ok: true, mode: d.mode, message: labels[d.mode] };
  if (d.reason === "last_active") return { ok: false, reason: d.reason, message: MESSAGES.lastActive };
  if (d.reason === "has_tasks") return { ok: false, reason: d.reason, count: d.count, message: `Diese Kategorie enthält noch ${d.count} aktive ${d.count === 1 ? "Aufgabe" : "Aufgaben"}. Bitte verschiebe sie zuerst in eine andere Kategorie.` };
  return { ok: false, reason: d.reason || "error", message: d.reason === "not_found" ? MESSAGES.notFound : MESSAGES.generic };
}
// „Löschen“ in der UI: benutzt → archivieren (active=false), unbenutzt → physisch löschen.
export const removeTask = (client, { familyId, taskId }) => run("removeTask", () =>
  removeVia(client, "remove_task", { p_family_id: familyId, p_task_id: taskId }, "removeTask",
    { archived: "Aufgabe archiviert – der Verlauf bleibt erhalten.", deleted: "Aufgabe gelöscht." }));

async function setActive(client, table, familyId, id, active, action) {
  const r = await client.from(table).update({ active }).eq("family_id", familyId).eq("id", id).select("id");
  if (r.error) return toMutationError(r.error, action);
  if (r.data.length !== 1) return { ok: false, reason: "not_found", message: MESSAGES.notFound };
  return { ok: true };
}
export const restoreTask = (client, { familyId, taskId }) => run("restoreTask", () => setActive(client, "tasks", familyId, taskId, true, "restoreTask"));

// ---------------------------------------------------------------- Kategorien
export function saveCategory(client, { familyId, category }) {
  return run("saveCategory", async () => {
    const c = { ...category, name: clean(category?.name) };
    const err = validateCategory(c);
    if (err) return invalid(err);
    const row = { name: c.name, icon: c.icon || null };
    let id = c.id || null;
    if (!id) {
      const sort_order = await nextSortOrder(client, "categories", familyId);
      const ins = await client.from("categories").insert({ ...row, family_id: familyId, sort_order }).select("id").single();
      if (ins.error) return toMutationError(ins.error, "saveCategory", MESSAGES.categoryDuplicate);
      id = ins.data.id;
    } else {
      const upd = await client.from("categories").update(row).eq("family_id", familyId).eq("id", id).select("id");
      if (upd.error) return toMutationError(upd.error, "saveCategory", MESSAGES.categoryDuplicate);
      if (upd.data.length !== 1) return { ok: false, reason: "not_found", message: MESSAGES.notFound };
    }
    const a = await setAssignments(client, "set_category_assignments", familyId, "p_category_id", id, c.assignedTo);
    if (!a.ok && !c.id) await client.rpc("delete_category", { p_family_id: familyId, p_category_id: id }); // neue Kategorie ohne gültige Zuordnung nicht stehen lassen
    return a.ok ? { ok: true, id, created: !c.id } : a;
  });
}
export const deleteCategory = (client, { familyId, categoryId }) => run("deleteCategory", () =>
  removeVia(client, "delete_category", { p_family_id: familyId, p_category_id: categoryId }, "deleteCategory", { deleted: "Kategorie gelöscht." }));

// ---------------------------------------------------------------- Belohnungen
// Einlösungen speichern Titel und points_spent als Momentaufnahme → spätere Änderungen wirken nicht zurück.
export function saveReward(client, { familyId, reward }) {
  return run("saveReward", async () => {
    const r = { ...reward, title: clean(reward?.title), pointsRequired: Number(reward?.pointsRequired) };
    const err = validateReward(r);
    if (err) return invalid(err);
    return saveWithAssignments(client, {
      table: "rewards", familyId, id: r.id || null, action: "saveReward", active: r.active !== false, assignedTo: r.assignedTo,
      row: { title: r.title, points_required: r.pointsRequired, icon: r.icon || null },
      assign: (rewardId, profileIds) => setAssignments(client, "set_reward_assignments", familyId, "p_reward_id", rewardId, profileIds),
    });
  });
}
export const removeReward = (client, { familyId, rewardId }) => run("removeReward", () =>
  removeVia(client, "remove_reward", { p_family_id: familyId, p_reward_id: rewardId }, "removeReward",
    { archived: "Belohnung archiviert – bisherige Einlösungen bleiben erhalten.", deleted: "Belohnung gelöscht." }));
export const restoreReward = (client, { familyId, rewardId }) => run("restoreReward", () => setActive(client, "rewards", familyId, rewardId, true, "restoreReward"));

// ---------------------------------------------------------------- Kinderprofile
// Reine profiles-Zeilen: keine Auth-Benutzer, niemals Adminrechte (is_parent bleibt false).
export function saveProfile(client, { familyId, profile }) {
  return run("saveProfile", async () => {
    const p = { ...profile, name: clean(profile?.name) };
    const err = validateProfile(p);
    if (err) return invalid(err);
    const row = { name: p.name, avatar_emoji: p.avatarEmoji || null, color: p.color || null };
    if (!p.id) {
      const sort_order = await nextSortOrder(client, "profiles", familyId);
      const ins = await client.from("profiles").insert({ ...row, family_id: familyId, sort_order, is_parent: false, active: true }).select("id").single();
      if (ins.error) return toMutationError(ins.error, "saveProfile");
      return { ok: true, id: ins.data.id, created: true };
    }
    const upd = await client.from("profiles").update({ ...row, ...(p.active === false ? { active: false } : {}) })
      .eq("family_id", familyId).eq("id", p.id).select("id");
    if (upd.error) return toMutationError(upd.error, "saveProfile");
    if (upd.data.length !== 1) return { ok: false, reason: "not_found", message: MESSAGES.notFound };
    return { ok: true, id: p.id, created: false };
  });
}
export const removeProfile = (client, { familyId, profileId }) => run("removeProfile", () =>
  removeVia(client, "remove_profile", { p_family_id: familyId, p_profile_id: profileId }, "removeProfile",
    { archived: "Profil archiviert – Punkte, Verlauf und Zuordnungen bleiben erhalten.", deleted: "Profil gelöscht." }));
export const restoreProfile = (client, { familyId, profileId }) => run("restoreProfile", () => setActive(client, "profiles", familyId, profileId, true, "restoreProfile"));

// ---------------------------------------------------------------- Reihenfolge
export function reorderItems(client, { familyId, kind, ids }) {
  return run("reorderItems", async () => {
    if (!["profiles", "tasks", "rewards", "categories"].includes(kind) || !ids?.length) return invalid(MESSAGES.invalid);
    const r = await client.rpc("reorder_items", { p_family_id: familyId, p_kind: kind, p_ids: ids });
    if (r.error) return toMutationError(r.error, "reorderItems");
    return { ok: true };
  });
}
// Nachbar tauschen (▲/▼) – liefert die neue ID-Reihenfolge oder null, wenn nicht verschiebbar.
export function moveInList(ids, id, delta) {
  const i = ids.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ---------------------------------------------------------------- Korrektur bestätigter Erledigungen
// Eltern nehmen eine bestätigte Erledigung zurück: status → rejected (kein Löschen, Historie bleibt).
// confirmed_at/confirmed_by beschreiben danach die letzte Prüfentscheidung (Trigger).
export function correctCompletion(client, { familyId, completionId }) {
  return run("correctCompletion", async () => {
    const upd = await client.from("completions").update({ status: "rejected" })
      .eq("family_id", familyId).eq("id", completionId).eq("status", "confirmed").select("id, status, confirmed_at, confirmed_by");
    if (upd.error) return toMutationError(upd.error, "correctCompletion");
    if (upd.data.length !== 1) return { ok: false, reason: "not_confirmed", message: MESSAGES.notConfirmed };
    return { ok: true, completion: upd.data[0] };
  });
}
// Irrtümlich abgelehnte bzw. zurückgenommene Erledigung wieder bestätigen.
export function reconfirmCompletion(client, { familyId, completionId }) {
  return run("reconfirmCompletion", async () => {
    const upd = await client.from("completions").update({ status: "confirmed" })
      .eq("family_id", familyId).eq("id", completionId).eq("status", "rejected").select("id, status, confirmed_at, confirmed_by");
    if (upd.error) return toMutationError(upd.error, "reconfirmCompletion", MESSAGES.reconfirmDuplicate);
    if (upd.data.length !== 1) return { ok: false, reason: "not_rejected", message: MESSAGES.notRejected };
    return { ok: true, completion: upd.data[0] };
  });
}

// ---------------------------------------------------------------- Einlösungen quittieren
// acknowledged_at/acknowledged_by setzt der Server (Trigger); Punkte bleiben unverändert.
export function acknowledgeRedemptions(client, { familyId, redemptionIds }) {
  return run("acknowledgeRedemptions", async () => {
    if (!redemptionIds?.length) return { ok: true, count: 0 };
    const upd = await client.from("redemptions").update({ acknowledged_at: new Date().toISOString() })
      .eq("family_id", familyId).in("id", redemptionIds).is("acknowledged_at", null).select("id");
    if (upd.error) return toMutationError(upd.error, "acknowledgeRedemptions");
    return { ok: true, count: upd.data.length };
  });
}
