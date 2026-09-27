// Auswahl und technische Grenzen für das Onboarding.
// Die Grenzen sind Integritäts-/Sicherheitsgrenzen (identisch zur RPC),
// ausdrücklich KEINE FREE-/PREMIUM-Limits.

export const AVATARS = ["🙂", "😎", "🤩", "🦊", "🐼", "🦁", "🚀", "⭐", "🐯", "🦄", "🐸", "🐙"];

export const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#eab308", "#f97316", "#8b5cf6", "#ec4899", "#0891b2"];

export const LIMITS = Object.freeze({
  FAMILY_NAME_MAX: 80,
  CHILD_NAME_MAX: 40,
  CHILDREN_MIN: 1,
  CHILDREN_MAX: 20,
  TASK_POINTS_MAX: 10000,
  REWARD_POINTS_MAX: 100000,
  PIN_LENGTH: 4,
});
