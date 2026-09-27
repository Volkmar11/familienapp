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
};

export const missingPointsMessage = (missing) => `Dafür fehlen noch ${missing} ${missing === 1 ? "Punkt" : "Punkte"}.`;

// Supabase-/Netzwerkfehler → { reason, message }. Intern nur Code und Kurztext loggen.
export function toMutationError(error, action) {
  const code = error?.code ?? "";
  const msg = String(error?.message ?? "");
  console.error(`[familyMutations] ${action} fehlgeschlagen`, code || msg.slice(0, 120));
  if (code === "23505") return { ok: false, reason: "duplicate", message: MESSAGES.duplicate };
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
