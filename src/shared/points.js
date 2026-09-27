// Gemeinsame Punktelogik für LEGACY und FAMILY (reine Funktionen, keine UI).
// Erledigungen im gemeinsamen Format: { memberId, points, date (Zeitstempel), confirmed, needsConfirm }.
// Es zählt nur, was nicht ausdrücklich unbestätigt ist (confirmed !== false) – wie bisher in der App.
// FAMILY: confirmed → true, pending → false, rejected wird beim Mapping entfernt.
import { toDateKey, weekStartKey, monthStartKey } from "../lib/dateUtils.js";

export const countsAsPoints = (c) => c.confirmed !== false;

// Erledigungen ab (einschließlich) einem lokalen Kalendertag "YYYY-MM-DD"
export const completionsSince = (completions, fromKey) => completions.filter((c) => toDateKey(c.date) >= fromKey);
export const completionsOnDay = (completions, dayKey) => completions.filter((c) => toDateKey(c.date) === dayKey);

export const sumConfirmedPoints = (completions, memberId) =>
  completions.filter((c) => c.memberId === memberId && countsAsPoints(c)).reduce((s, c) => s + c.points, 0);

export const redeemedPoints = (redeemedRewards, memberId) =>
  (redeemedRewards || []).filter((r) => r.memberId === memberId).reduce((s, r) => s + r.pointsCost, 0);

export function memberPointSummary(data, memberId, now = new Date()) {
  const all = data.completions || [];
  const total = sumConfirmedPoints(all, memberId);
  return {
    today: sumConfirmedPoints(completionsOnDay(all, toDateKey(now)), memberId),
    week: sumConfirmedPoints(completionsSince(all, weekStartKey(now)), memberId),
    month: sumConfirmedPoints(completionsSince(all, monthStartKey(now)), memberId),
    total,
    available: total - redeemedPoints(data.redeemedRewards, memberId),
    pending: all.filter((c) => c.memberId === memberId && c.needsConfirm && !c.confirmed).length,
  };
}

// Tageskrone: Profile mit den meisten bestätigten Punkten am Tag (bei Gleichstand mehrere).
// showDailyCrown=false → niemand erhält eine Krone; Punkte bleiben unverändert.
export function dayLeaderIds(completions, members, dayKey, showDailyCrown = true) {
  if (!showDailyCrown) return [];
  const todayC = completionsOnDay(completions, dayKey).filter(countsAsPoints);
  const scores = members.map((m) => ({ id: m.id, pts: todayC.filter((c) => c.memberId === m.id).reduce((s, c) => s + c.points, 0) }));
  const max = Math.max(...scores.map((d) => d.pts), 0);
  return max > 0 ? scores.filter((d) => d.pts === max).map((d) => d.id) : [];
}
