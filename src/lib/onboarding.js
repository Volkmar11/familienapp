// Onboarding-Logik ohne UI: Anfangszustand, Validierung, RPC-Payload, RPC-Aufruf.
// Die Eltern-PIN lebt nur im React-State und wird nie gespeichert oder geloggt.
import { STARTER_CATEGORIES, STARTER_TASKS, STARTER_REWARDS } from "../config/starterContent.js";
import { AVATARS, COLORS, LIMITS } from "../family/onboarding/options.js";

let childSeq = 0;
export const newChild = (index = 0) => ({
  id: `child-${Date.now()}-${childSeq++}`,
  name: "",
  avatar: AVATARS[index % AVATARS.length],
  color: COLORS[index % COLORS.length],
});

export function initialOnboardingState() {
  return {
    familyName: "",
    children: [newChild(0)],
    pin: "",
    pin2: "",
    tasks: Object.fromEntries(STARTER_TASKS.map((t) => [t.key, { selected: true, points: String(t.suggestedPoints) }])),
    rewards: Object.fromEntries(STARTER_REWARDS.map((r) => [r.key, { selected: true, points: String(r.suggestedPoints) }])),
    settings: { showDailyCrown: true, requireConfirmation: true },
  };
}

const isIntString = (v) => /^\d+$/.test(String(v).trim());

// Jede Funktion liefert "" (ok) oder eine deutsche Fehlermeldung.
export function validateFamilyName(name) {
  const n = (name || "").trim();
  if (!n) return "Bitte gebt einen Familiennamen ein.";
  if (n.length > LIMITS.FAMILY_NAME_MAX) return `Der Familienname darf höchstens ${LIMITS.FAMILY_NAME_MAX} Zeichen lang sein.`;
  return "";
}

export function validateChildren(children) {
  if (!children || children.length < LIMITS.CHILDREN_MIN) return "Bitte legt mindestens ein Kinderprofil an.";
  if (children.length > LIMITS.CHILDREN_MAX) return `Es sind höchstens ${LIMITS.CHILDREN_MAX} Profile möglich.`;
  if (children.some((c) => !c.name.trim())) return "Bitte gebt jedem Kind einen Namen.";
  if (children.some((c) => c.name.trim().length > LIMITS.CHILD_NAME_MAX)) return `Namen dürfen höchstens ${LIMITS.CHILD_NAME_MAX} Zeichen lang sein.`;
  return "";
}

export function validatePin(pin, pin2) {
  if (!new RegExp(`^\\d{${LIMITS.PIN_LENGTH}}$`).test(pin || "")) return `Die PIN muss aus genau ${LIMITS.PIN_LENGTH} Ziffern bestehen.`;
  if (pin !== pin2) return "Die beiden PIN-Eingaben stimmen nicht überein.";
  return "";
}

export function validatePoints(selection, max, label) {
  for (const s of Object.values(selection)) {
    if (!s.selected) continue;
    if (!isIntString(s.points) || Number(s.points) > max) return `Bitte bei allen ausgewählten ${label} ganze Punkte zwischen 0 und ${max} eintragen.`;
  }
  return "";
}

export function buildOnboardingPayload(state) {
  const catByKey = Object.fromEntries(STARTER_CATEGORIES.map((c) => [c.key, c]));
  return {
    p_family_name: state.familyName.trim(),
    p_pin: state.pin,
    p_children: state.children.map((c) => ({ name: c.name.trim(), avatar_emoji: c.avatar, color: c.color })),
    p_tasks: STARTER_TASKS.filter((t) => state.tasks[t.key]?.selected).map((t) => ({
      title: t.title,
      points: Number(state.tasks[t.key].points),
      icon: t.icon,
      recurrence: t.recurrence,
      category: catByKey[t.category].name,
      category_icon: catByKey[t.category].icon,
    })),
    p_rewards: STARTER_REWARDS.filter((r) => state.rewards[r.key]?.selected).map((r) => ({
      title: r.title,
      points_required: Number(state.rewards[r.key].points),
      icon: r.icon,
    })),
    p_settings: { show_daily_crown: !!state.settings.showDailyCrown, require_confirmation: !!state.settings.requireConfirmation },
  };
}

export function toGermanOnboardingError(error) {
  const msg = String(error?.message || error || "");
  if (/fetch|network/i.test(msg)) return "Keine Verbindung zum Server. Eure Eingaben bleiben erhalten – bitte erneut versuchen.";
  if (/PIN/.test(msg)) return "Die Eltern-PIN muss aus genau 4 Ziffern bestehen.";
  if (/Kinderprofil/.test(msg)) return "Bitte prüft die Kinderprofile.";
  if (/Familienname/.test(msg)) return "Bitte prüft den Familiennamen.";
  if (/Aufgabe/.test(msg)) return "Bitte prüft die Punkte der Aufgaben.";
  if (/Belohnung/.test(msg)) return "Bitte prüft die Punkte der Belohnungen.";
  if (/Nicht angemeldet|JWT/i.test(msg)) return "Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.";
  return "Die Einrichtung konnte nicht abgeschlossen werden. Eure Eingaben bleiben erhalten – bitte erneut versuchen.";
}

// Atomare Anlage. requestId bleibt pro Wizard konstant → Wiederholungen sind idempotent.
export async function createFamilyWithOnboarding(client, requestId, payload) {
  const { data, error } = await client.rpc("create_family_with_onboarding", { p_request_id: requestId, ...payload });
  if (error) return { ok: false, error: toGermanOnboardingError(error) };
  if (!data?.family_id) return { ok: false, error: toGermanOnboardingError("unbekannt") };
  return { ok: true, familyId: data.family_id, replayed: !!data.replayed };
}
