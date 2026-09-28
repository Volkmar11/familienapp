// Phase 5A – reine Abbildungslogik LEGACY (app_state.data) → FAMILY-Tabellen.
// Keine Netzwerkzugriffe, keine Ausgaben. Personenbezogene Inhalte (Namen, Texte, Fotos, PIN)
// werden nur in den Plan übernommen, der in die Zieldatenbank geschrieben wird – niemals in
// Statistiken, Warnungen oder die Referenz. Profile heißen dort ausschließlich „profile-N“.
import { createHash, randomUUID } from "node:crypto";
import { toDateKey, weekStartKey, addDays, normalizeWeekKey, weekdayOfKey, DEFAULT_TIME_ZONE } from "../../src/lib/dateUtils.js";
import { memberPointSummary, countsAsPoints, redeemedPoints } from "../../src/shared/points.js";

export const MIGRATION_FAMILY_NAME = "Migration Test";
// Legacy-Fallback-Emojis der Standardkategorien (wie CATEGORY_EMOJI_FALLBACK der Oberfläche)
export const LEGACY_CATEGORY_EMOJI = Object.freeze({ Ordnung: "🧹", Küche: "🍳", Haushalt: "🏠", Garten: "🌱", Sonstiges: "📦" });
// Zeitfenster für die Zuordnung Benachrichtigung ↔ Einlösung (beide entstehen im selben Klick)
export const NOTIFICATION_MATCH_WINDOW_MS = 2000;

const LIMIT = { profileName: 40, title: 80, categoryName: 40, icon: 16, taskPoints: 10000, rewardPoints: 100000 };
const HEX = /^#[0-9A-Fa-f]{6}$/;
const arr = (v) => (Array.isArray(v) ? v : []);
const chars = (s) => [...String(s ?? "")].length;
export const shortHash = (v) => createHash("sha256").update(String(v)).digest("hex").slice(0, 10);

// Kürzt auf höchstens max Zeichen (Unicode-sicher); gekürzte Texte enden auf „…“.
export function clampText(value, max) {
  const t = String(value ?? "").trim();
  const c = [...t];
  return c.length <= max ? t : c.slice(0, max - 1).join("").trimEnd() + "…";
}

const icon = (v) => (v && chars(v) <= LIMIT.icon ? v : null);

// Mehrere Einträge derselben (normalisierten) Woche → genau einer, deterministisch:
// 1. bevorzugt ein Eintrag, dessen Rohwert bereits ein Montag ist (korrekte lokale Berechnung;
//    Sonntagswerte stammen aus der früheren UTC-Speicherung),
// 2. sonst der zuletzt gespeicherte (höchster Array-Index).
export function normalizeChampionHistory(history) {
  const groups = new Map();
  arr(history).forEach((h, index) => {
    const week = normalizeWeekKey(h?.week);
    if (!week || !/^\d{4}-\d{2}-\d{2}$/.test(week)) return;
    const list = groups.get(week) || [];
    list.push({ ...h, index, week, rawIsMonday: weekdayOfKey(h.week) === 1 });
    groups.set(week, list);
  });
  const kept = [];
  let dropped = 0;
  for (const [, list] of groups) {
    const mondays = list.filter((e) => e.rawIsMonday);
    const pool = mondays.length ? mondays : list;
    kept.push(pool.reduce((a, b) => (b.index > a.index ? b : a)));
    dropped += list.length - 1;
  }
  kept.sort((a, b) => a.week.localeCompare(b.week));
  return { kept, dropped, invalid: arr(history).length - kept.length - dropped };
}

// Benachrichtigung → Einlösung nur bei eindeutigem Treffer (kein Raten):
// gleicher memberId, Typ „reward“, Zeitabstand ≤ Fenster, Nachricht enthält den Belohnungsnamen.
// Bei mehreren Kandidaten entscheidet nur ein exakt gleicher Zeitstempel. Wird eine Einlösung von
// mehreren Benachrichtigungen beansprucht, gilt keine davon als Treffer.
export function matchNotifications(notifications, redemptions) {
  const R = arr(redemptions);
  const picks = arr(notifications).map((n) => {
    if (n?.type !== "reward") return null;
    const t = Date.parse(n.date);
    const cands = R.filter((r) => r.memberId === n.memberId && Math.abs(Date.parse(r.date) - t) <= NOTIFICATION_MATCH_WINDOW_MS
      && typeof n.message === "string" && r.rewardName && n.message.includes(r.rewardName));
    if (cands.length === 1) return cands[0].id;
    const exact = cands.filter((r) => r.date === n.date);
    return exact.length === 1 ? exact[0].id : null;
  });
  const claims = new Map();
  picks.forEach((id) => id && claims.set(id, (claims.get(id) || 0) + 1));
  const byRedemption = new Map(); // redemptionId → { read }
  let ambiguous = 0, unmatched = 0;
  picks.forEach((id, i) => {
    if (!id) { unmatched++; return; }
    if (claims.get(id) > 1) { ambiguous++; return; }
    byRedemption.set(id, { read: arr(notifications)[i].read === true });
  });
  return {
    byRedemption,
    stats: {
      notifications: arr(notifications).length,
      matched: byRedemption.size,
      matchedRead: [...byRedemption.values()].filter((v) => v.read).length,
      matchedUnread: [...byRedemption.values()].filter((v) => !v.read).length,
      ambiguous,
      unmatched,
      redemptionsWithoutNotification: R.filter((r) => !byRedemption.has(r.id)).length,
    },
  };
}

// Letzte vollständig verarbeitete Woche (FAMILY) aus dem LEGACY-Marker.
// LEGACY speichert den Montag der Woche, in der zuletzt geprüft wurde (ggf. als UTC-Sonntag);
// FAMILY speichert die zuletzt ausgewertete, abgeschlossene Woche → Marker − 7 Tage.
export function deriveLastChampionWeek(legacyMarker, keptHistory, now = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const maxHistory = arr(keptHistory).map((h) => h.week).sort().at(-1) || null;
  const lastCompleted = addDays(weekStartKey(now, timeZone), -7);
  const normalized = legacyMarker ? normalizeWeekKey(legacyMarker) : null;
  let value, source;
  if (normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) && weekdayOfKey(normalized) === 1) {
    value = addDays(normalized, -7); source = "marker-7";
  } else {
    value = lastCompleted; source = "fallback-last-completed-week"; // keine Nachberechnung alter Wochen
  }
  const warnings = [];
  if (maxHistory && value < maxHistory) { warnings.push("last_champion_week lag vor dem jüngsten Historieneintrag – auf diesen angehoben"); value = maxHistory; source += "+history"; }
  if (value > lastCompleted) { warnings.push("last_champion_week lag in der Zukunft – auf die letzte abgeschlossene Woche gesetzt"); value = lastCompleted; source += "+capped"; }
  return { value, source, normalizedMarker: normalized, maxHistoryWeek: maxHistory, lastCompletedWeek: lastCompleted, warnings };
}

// Anonyme Strukturstatistik (nur Zahlen)
export function analyzeLegacy(data) {
  const d = data || {};
  const members = arr(d.members), tasks = arr(d.tasks), C = arr(d.completions), cats = arr(d.customCategories);
  const catNames = new Set(cats.map((c) => c.name));
  const memberIds = new Set(members.map((m) => m.id)), taskIds = new Set(tasks.map((t) => t.id));
  const hist = normalizeChampionHistory(d.championHistory);
  const dayKey = new Map();
  for (const c of C) { const k = `${c.memberId}|${c.taskId}|${toDateKey(c.date)}`; dayKey.set(k, (dayKey.get(k) || 0) + 1); }
  return {
    members: members.length, admins: members.filter((m) => m.isAdmin).length,
    memberPhotos: members.filter((m) => !!m.photo).length, taskPhotos: tasks.filter((t) => !!t.photo).length,
    tasks: tasks.length, rewards: arr(d.rewards).length, customCategories: cats.length,
    categoriesIsDefault: d.customCategories == null,
    tasksWithUnknownCategory: tasks.filter((t) => d.customCategories != null && !catNames.has(t.category)).length,
    completions: C.length,
    completionsConfirmed: C.filter((c) => countsAsPoints(c)).length,
    completionsPending: C.filter((c) => !countsAsPoints(c)).length,
    completionsUnknownMember: C.filter((c) => !memberIds.has(c.memberId)).length,
    completionsUnknownTask: C.filter((c) => !taskIds.has(c.taskId)).length,
    completionsLocalDayDiffersFromUtc: C.filter((c) => toDateKey(c.date) !== String(c.date).slice(0, 10)).length,
    completionsDuplicatePerDay: [...dayKey.values()].reduce((s, v) => s + Math.max(0, v - 1), 0),
    redemptions: arr(d.redeemedRewards).length, notifications: arr(d.notifications).length,
    notificationsUnread: arr(d.notifications).filter((n) => !n.read).length,
    championHistory: arr(d.championHistory).length,
    championHistorySundays: arr(d.championHistory).filter((h) => weekdayOfKey(h.week) === 0).length,
    championHistoryDuplicatesAfterNormalization: hist.dropped,
    needsConfirmation: d.needsConfirmation !== false,
    hasAdminPin: typeof d.adminPin === "string" && d.adminPin.length > 0,
  };
}

// Vollständiger Migrationsplan. uuid ist injizierbar (Tests). Profile tragen nur Referenzen
// „profile-N“; die echten Profil-IDs vergibt die Onboarding-RPC beim Anwenden.
export function buildMigrationPlan(data, { now = new Date(), timeZone = DEFAULT_TIME_ZONE, uuid = randomUUID } = {}) {
  const d = data || {};
  const warnings = [], errors = [];
  const warn = (m) => warnings.push(m);

  // ---- Profile ----
  const profiles = arr(d.members).map((m, i) => {
    const name = clampText(m.name, LIMIT.profileName);
    if (chars(String(m.name ?? "").trim()) > LIMIT.profileName) warn(`profile-${i + 1}: Name gekürzt`);
    if (!name) errors.push(`profile-${i + 1}: Name leer`);
    if (m.color && !HEX.test(m.color)) warn(`profile-${i + 1}: Farbe ungültig → Standard`);
    return { ref: `profile-${i + 1}`, legacyId: m.id, name, avatar_emoji: icon(m.emoji), color: HEX.test(m.color || "") ? m.color : null,
             is_parent: m.isAdmin === true, sort_order: i, hadPhoto: !!m.photo };
  });
  const refByLegacy = new Map(profiles.map((p) => [p.legacyId, p.ref]));
  const mapAssigned = (ids, what) => {
    const out = [];
    for (const id of arr(ids)) { const r = refByLegacy.get(id); if (r) out.push(r); else warn(`${what}: unbekannte Zuordnung entfernt`); }
    return [...new Set(out)];
  };

  // ---- Kategorien (eigene Liste; fehlende, aber von Aufgaben genutzte Namen werden ergänzt) ----
  const categories = [];
  const catByKey = new Map();
  const key = (n) => String(n ?? "").trim().toLowerCase();
  const source = d.customCategories == null ? Object.entries(LEGACY_CATEGORY_EMOJI).map(([name, emoji], i) => ({ id: `default-${i}`, name, emoji, assignedTo: [] })) : arr(d.customCategories);
  source.forEach((c, i) => {
    const name = clampText(c.name, LIMIT.categoryName);
    if (!name) { warn(`Kategorie ${i + 1}: ohne Namen übersprungen`); return; }
    if (catByKey.has(key(name))) { warn(`Kategorie ${i + 1}: doppelter Name zusammengeführt`); return; }
    const cat = { id: uuid(), legacyId: c.id ?? null, name, icon: icon(c.emoji), sort_order: categories.length, assignedRefs: mapAssigned(c.assignedTo, `Kategorie ${i + 1}`), derived: false };
    categories.push(cat); catByKey.set(key(name), cat);
  });
  for (const t of arr(d.tasks)) {
    const k = key(t.category);
    if (!k || catByKey.has(k)) continue;
    const name = clampText(t.category, LIMIT.categoryName);
    const cat = { id: uuid(), legacyId: null, name, icon: LEGACY_CATEGORY_EMOJI[name] || "📦", sort_order: categories.length, assignedRefs: [], derived: true };
    categories.push(cat); catByKey.set(k, cat);
  }
  const derivedCategories = categories.filter((c) => c.derived).length;
  if (derivedCategories) warn(`${derivedCategories} Kategorie(n) ergänzt, die von Aufgaben genutzt, aber nicht in customCategories geführt wurden`);

  // ---- Aufgaben ----
  const taskIdByLegacy = new Map();
  const tasks = arr(d.tasks).map((t, i) => {
    const title = clampText(t.name, LIMIT.title);
    if (chars(String(t.name ?? "").trim()) > LIMIT.title) warn(`Aufgabe ${i + 1}: Titel auf ${LIMIT.title} Zeichen gekürzt`);
    if (!title) errors.push(`Aufgabe ${i + 1}: Titel leer`);
    const points = Number(t.points);
    if (!Number.isInteger(points) || points < 0 || points > LIMIT.taskPoints) errors.push(`Aufgabe ${i + 1}: Punkte ungültig`);
    const recurrence = ["daily", "weekly", "once"].includes(t.recurring) ? t.recurring : "daily";
    if (recurrence !== t.recurring) warn(`Aufgabe ${i + 1}: Wiederholung unbekannt → daily`);
    const id = uuid(); taskIdByLegacy.set(t.id, id);
    return { id, legacyId: t.id, category_id: catByKey.get(key(t.category))?.id ?? null, title, icon: icon(t.emoji), points,
             recurrence, sort_order: i, assignedRefs: mapAssigned(t.assignedTo, `Aufgabe ${i + 1}`), hadPhoto: !!t.photo };
  });

  // ---- Belohnungen ----
  const rewardIdByLegacy = new Map();
  const rewards = arr(d.rewards).map((r, i) => {
    const title = clampText(r.name, LIMIT.title);
    if (chars(String(r.name ?? "").trim()) > LIMIT.title) warn(`Belohnung ${i + 1}: Titel gekürzt`);
    const points = Number(r.pointsCost);
    if (!Number.isInteger(points) || points < 0 || points > LIMIT.rewardPoints) errors.push(`Belohnung ${i + 1}: Punkte ungültig`);
    const id = uuid(); rewardIdByLegacy.set(r.id, id);
    return { id, legacyId: r.id, title, icon: icon(r.emoji), points_required: points, sort_order: i, assignedRefs: mapAssigned(r.assignedTo, `Belohnung ${i + 1}`) };
  });

  // ---- Erledigungen (Punkte-Momentaufnahme, lokaler Kalendertag Europe/Berlin) ----
  const seen = new Set();
  const completions = [];
  arr(d.completions).forEach((c, i) => {
    const profileRef = refByLegacy.get(c.memberId);
    if (!profileRef) { errors.push(`Erledigung ${i + 1}: unbekanntes Profil`); return; }
    const ts = Date.parse(c.date);
    if (Number.isNaN(ts)) { errors.push(`Erledigung ${i + 1}: Datum ungültig`); return; }
    const points = Number(c.points);
    if (!Number.isInteger(points) || points < 0 || points > LIMIT.taskPoints) { errors.push(`Erledigung ${i + 1}: Punkte ungültig`); return; }
    const status = countsAsPoints(c) ? "confirmed" : "pending";
    if (status === "pending" && !c.needsConfirm) warn(`Erledigung ${i + 1}: unbestätigt ohne needsConfirm → pending`);
    const task_id = taskIdByLegacy.get(c.taskId) ?? null;
    const completion_date = toDateKey(c.date, timeZone);
    if (task_id) {
      const k = `${profileRef}|${task_id}|${completion_date}`;
      if (seen.has(k)) { errors.push(`Erledigung ${i + 1}: doppelt am selben Tag`); return; }
      seen.add(k);
    }
    const completed_at = new Date(ts).toISOString();
    completions.push({ id: uuid(), legacyId: c.id, profileRef, task_id, task_title: String(c.taskName ?? "").trim() || "Aufgabe",
      category_name: c.category ?? null, points, completed_at, completion_date, status, confirmed_at: status === "confirmed" ? completed_at : null });
  });

  // ---- Einlösungen + Quittierung ----
  const match = matchNotifications(d.notifications, d.redeemedRewards);
  const redemptions = [];
  arr(d.redeemedRewards).forEach((r, i) => {
    const profileRef = refByLegacy.get(r.memberId);
    if (!profileRef) { errors.push(`Einlösung ${i + 1}: unbekanntes Profil`); return; }
    const ts = Date.parse(r.date);
    const points = Number(r.pointsCost);
    if (Number.isNaN(ts) || !Number.isInteger(points) || points < 0 || points > LIMIT.rewardPoints) { errors.push(`Einlösung ${i + 1}: ungültig`); return; }
    const m = match.byRedemption.get(r.id);
    redemptions.push({ id: uuid(), legacyId: r.id, profileRef, reward_id: rewardIdByLegacy.get(r.rewardId) ?? null,
      reward_title: String(r.rewardName ?? "").trim() || "Belohnung", points_spent: points, redeemed_at: new Date(ts).toISOString(),
      acknowledged: !!m?.read });
  });

  // ---- Champion-Historie ----
  const hist = normalizeChampionHistory(d.championHistory);
  const championHistory = [];
  for (const h of hist.kept) {
    const profileRef = refByLegacy.get(h.memberId) ?? null;
    if (!profileRef) warn(`Champion-Woche ${h.week}: Profil unbekannt → ohne Profilbezug`);
    const points = Number(h.pts);
    if (!Number.isInteger(points) || points < 0) { errors.push(`Champion-Woche ${h.week}: Punkte ungültig`); continue; }
    championHistory.push({ id: uuid(), profileRef, profile_name: clampText(h.name, LIMIT.profileName) || "Profil", profile_avatar: h.emoji || null, week_start: h.week, points });
  }
  if (hist.dropped) warn(`${hist.dropped} doppelte Champion-Einträge (gleiche normalisierte Woche) verworfen`);

  const lcw = deriveLastChampionWeek(d.lastChampionWeek, hist.kept, now, timeZone);
  lcw.warnings.forEach(warn);

  return {
    familyName: MIGRATION_FAMILY_NAME,
    profiles, categories, tasks, rewards, completions, redemptions, championHistory,
    settings: { require_confirmation: d.needsConfirmation !== false, show_daily_crown: true, last_champion_week: lcw.value },
    champion: { ...lcw, historyKept: hist.kept.length, historyDropped: hist.dropped },
    notifications: match.stats,
    photos: { members: profiles.filter((p) => p.hadPhoto).length, tasks: tasks.filter((t) => t.hadPhoto).length },
    warnings, errors,
  };
}

// Erwartete Zielzahlen (Tabellenzeilen) aus dem Plan
export function expectedCounts(plan) {
  return {
    profiles: plan.profiles.length,
    parentProfiles: plan.profiles.filter((p) => p.is_parent).length,
    categories: plan.categories.length,
    categoryAssignments: plan.categories.reduce((s, c) => s + c.assignedRefs.length, 0),
    tasks: plan.tasks.length,
    taskAssignments: plan.tasks.reduce((s, t) => s + t.assignedRefs.length, 0),
    rewards: plan.rewards.length,
    rewardAssignments: plan.rewards.reduce((s, r) => s + r.assignedRefs.length, 0),
    completions: plan.completions.length,
    completionsConfirmed: plan.completions.filter((c) => c.status === "confirmed").length,
    completionsPending: plan.completions.filter((c) => c.status === "pending").length,
    redemptions: plan.redemptions.length,
    redemptionsAcknowledged: plan.redemptions.filter((r) => r.acknowledged).length,
    championHistory: plan.championHistory.length,
  };
}

// Kennzahlen je Profil im gemeinsamen Datenformat (LEGACY-Daten oder FAMILY-Modell).
// championHistory muss bereits dedupliziert sein (FAMILY erlaubt je Woche genau einen Eintrag).
export function profileMetrics(shared, memberId, championHistory, asOf) {
  const s = memberPointSummary(shared, memberId, asOf);
  const own = arr(shared.completions).filter((c) => c.memberId === memberId);
  return {
    today: s.today, week: s.week, month: s.month, total: s.total,
    redeemed: redeemedPoints(shared.redeemedRewards, memberId), available: s.available,
    confirmedCount: own.filter((c) => countsAsPoints(c)).length,
    pendingCount: own.filter((c) => !countsAsPoints(c)).length,
    championCount: arr(championHistory).filter((h) => h.memberId === memberId).length,
  };
}

export const METRIC_KEYS = ["today", "week", "month", "total", "redeemed", "available", "confirmedCount", "pendingCount", "championCount"];

// Zusätzliche Prüfzeitpunkte: je Woche mit Erledigungen der Zeitpunkt der letzten Erledigung.
// So werden Heute/Woche/Monat auch für vergangene Tage verglichen (lokale Tagesgrenzen, Sommerzeit).
export function timelineCheckpoints(completions, timeZone = DEFAULT_TIME_ZONE) {
  const lastPerWeek = new Map();
  for (const c of arr(completions)) {
    const w = weekStartKey(c.date, timeZone);
    if (!lastPerWeek.has(w) || Date.parse(c.date) > Date.parse(lastPerWeek.get(w))) lastPerWeek.set(w, c.date);
  }
  return [...lastPerWeek.keys()].sort().map((w) => new Date(lastPerWeek.get(w)).toISOString());
}

const TIMELINE_KEYS = ["today", "week", "month"];
// Stand zum Zeitpunkt t: nur Erledigungen bis einschließlich t (wie die App sie damals sah)
const upTo = (shared, t) => ({ ...shared, completions: arr(shared.completions).filter((c) => Date.parse(c.date) <= Date.parse(t)) });

// Referenz aus dem Backup (anonym: nur profile-N, gekürzter Hash der Legacy-ID)
export function computeReference(data, plan, asOf) {
  const hist = normalizeChampionHistory(data.championHistory).kept;
  const shared = { completions: arr(data.completions), redeemedRewards: arr(data.redeemedRewards) };
  const pick = (m) => Object.fromEntries(TIMELINE_KEYS.map((k) => [k, m[k]]));
  return {
    asOf: new Date(asOf).toISOString(),
    timeZone: DEFAULT_TIME_ZONE,
    profiles: plan.profiles.map((p) => ({ ref: p.ref, legacyIdHash: shortHash(p.legacyId), isParent: p.is_parent, ...profileMetrics(shared, p.legacyId, hist, asOf) })),
    timeline: timelineCheckpoints(data.completions).map((t) => ({
      asOf: t, profiles: plan.profiles.map((p) => ({ ref: p.ref, ...pick(profileMetrics(upTo(shared, t), p.legacyId, hist, new Date(t))) })),
    })),
    counts: expectedCounts(plan),
    champion: { lastChampionWeek: plan.settings.last_champion_week, source: plan.champion.source, maxHistoryWeek: plan.champion.maxHistoryWeek, historyKept: plan.champion.historyKept, historyDropped: plan.champion.historyDropped },
    notifications: plan.notifications,
    photosNotMigrated: plan.photos,
  };
}

// Vergleich Referenz ↔ FAMILY-Modell (model.data aus loadFamilyData). profileIdByRef: Map ref → uuid.
export function compareWithReference(reference, familyData, profileIdByRef) {
  const asOf = new Date(reference.asOf);
  const all = [...arr(familyData.members), ...arr(familyData.archived?.members)];
  const rows = reference.profiles.map((ref) => {
    const id = profileIdByRef.get(ref.ref);
    const exists = all.some((m) => m.id === id);
    const actual = exists ? profileMetrics(familyData, id, familyData.championHistory, asOf) : null;
    const diff = Object.fromEntries(METRIC_KEYS.map((k) => [k, actual ? actual[k] - ref[k] : null]));
    return { ref: ref.ref, expected: Object.fromEntries(METRIC_KEYS.map((k) => [k, ref[k]])), actual, diff, ok: !!actual && METRIC_KEYS.every((k) => diff[k] === 0) };
  });
  // Zeitreihe: Heute/Woche/Monat zu jedem Prüfzeitpunkt
  let timelineChecks = 0;
  const timelineDiffs = [];
  for (const point of arr(reference.timeline)) {
    for (const ref of point.profiles) {
      const id = profileIdByRef.get(ref.ref);
      const m = profileMetrics(upTo(familyData, point.asOf), id, familyData.championHistory, new Date(point.asOf));
      for (const k of TIMELINE_KEYS) {
        timelineChecks++;
        if (m[k] !== ref[k]) timelineDiffs.push({ asOf: point.asOf, ref: ref.ref, key: k, expected: ref[k], actual: m[k] });
      }
    }
  }
  return { rows, timelineChecks, timelineDiffs, ok: rows.every((r) => r.ok) && timelineDiffs.length === 0 };
}
