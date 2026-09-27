// FAMILY-Datenschicht (Phase 4C1: nur lesen).
// Lädt eine Familie mit EINER Abfrage: PostgREST bettet alle familienbezogenen Tabellen
// über ihre Fremdschlüssel ein. Zugriff ausschließlich mit dem FAMILY-Client unter RLS.
import { mapFamilyToChampionData } from "./familyMapping.js";

export const FAMILY_SELECT = `
  id, name,
  family_settings ( show_daily_crown, require_confirmation, last_champion_week, timezone ),
  profiles ( id, name, avatar_emoji, avatar_url, color, sort_order, active, is_parent ),
  categories ( id, name, icon, sort_order, category_assignments ( profile_id ) ),
  tasks ( id, category_id, title, icon, image_url, points, recurrence, active, sort_order, task_assignments ( profile_id ) ),
  rewards ( id, title, icon, points_required, active, sort_order, reward_assignments ( profile_id ) ),
  completions ( id, profile_id, task_id, task_title, category_name, points, completed_at, completion_date, status ),
  redemptions ( id, profile_id, reward_id, reward_title, points_spent, redeemed_at, acknowledged_at ),
  champion_history ( id, profile_id, profile_name, profile_avatar, week_start, points )
`.replace(/\s+/g, " ").trim();

export class FamilyDataError extends Error {
  constructor(kind, message, cause) { super(message); this.kind = kind; this.cause = cause; }
}

// Rohdaten laden. Wirft FamilyDataError: "network" | "not_found" | "incomplete".
export async function fetchFamilyRaw(client, familyId) {
  let res;
  try {
    res = await client.from("families").select(FAMILY_SELECT).eq("id", familyId).maybeSingle();
  } catch (e) {
    throw new FamilyDataError("network", "Daten konnten nicht geladen werden.", e);
  }
  if (res.error) throw new FamilyDataError("network", "Daten konnten nicht geladen werden.", res.error);
  if (!res.data) throw new FamilyDataError("not_found", "Diese Familie wurde nicht gefunden oder du hast keinen Zugriff.");
  const problems = validateFamilyRaw(res.data);
  if (problems.length) throw new FamilyDataError("incomplete", `Die Familiendaten sind unvollständig (${problems.join(", ")}).`);
  return res.data;
}

const LISTS = ["profiles", "categories", "tasks", "rewards", "completions", "redemptions", "champion_history"];
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Integritätsprüfung: Unvollständige Daten führen zu einem Fehlerzustand statt zu
// stillschweigenden Standardwerten. Liefert eine Liste kurzer Problembeschreibungen.
export function validateFamilyRaw(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object") return ["keine Daten"];
  const settings = Array.isArray(raw.family_settings) ? raw.family_settings[0] : raw.family_settings;
  if (!settings) problems.push("Einstellungen fehlen");
  else if (typeof settings.show_daily_crown !== "boolean" || typeof settings.require_confirmation !== "boolean") problems.push("Einstellungen ungültig");
  for (const k of LISTS) if (!Array.isArray(raw[k])) problems.push(`${k} fehlt`);
  if (problems.length) return problems;
  const profileIds = new Set(raw.profiles.map((p) => p.id));
  const categoryIds = new Set(raw.categories.map((c) => c.id));
  if (raw.profiles.some((p) => !p.id || !p.name)) problems.push("Profil ohne Namen");
  if (raw.tasks.some((t) => !t.title || !isNum(t.points))) problems.push("Aufgabe unvollständig");
  if (raw.tasks.some((t) => t.category_id && !categoryIds.has(t.category_id))) problems.push("Aufgabe mit unbekannter Kategorie");
  if (raw.rewards.some((r) => !r.title || !isNum(r.points_required))) problems.push("Belohnung unvollständig");
  if (raw.completions.some((c) => !profileIds.has(c.profile_id) || !isNum(c.points) || !c.completed_at || !["pending", "confirmed", "rejected"].includes(c.status))) problems.push("Erledigung unvollständig");
  if (raw.redemptions.some((r) => !profileIds.has(r.profile_id) || !isNum(r.points_spent))) problems.push("Einlösung unvollständig");
  const assigned = [...raw.categories.flatMap((c) => c.category_assignments || []), ...raw.tasks.flatMap((t) => t.task_assignments || []), ...raw.rewards.flatMap((r) => r.reward_assignments || [])];
  if (assigned.some((a) => !profileIds.has(a.profile_id))) problems.push("Zuordnung zu unbekanntem Profil");
  return problems;
}

// Laden + Abbilden auf das gemeinsame Datenformat der Oberfläche.
export async function loadFamilyData(client, familyId) {
  try {
    const raw = await fetchFamilyRaw(client, familyId);
    return { ok: true, model: mapFamilyToChampionData(raw) };
  } catch (e) {
    const err = e instanceof FamilyDataError ? e : new FamilyDataError("network", "Daten konnten nicht geladen werden.", e);
    return { ok: false, kind: err.kind, error: err.message };
  }
}
