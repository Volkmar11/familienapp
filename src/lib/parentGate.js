// Eltern-PIN-Gate (FAMILY, Phase 4C2A) – reine Logik, testbar ohne React.
// Zugriff auf den Elternbereich erfordert BEIDES:
//   A) Auth-Rolle owner/parent (aus family_members) und
//   B) serverseitig verifizierte PIN (verify_parent_pin) innerhalb der letzten 10 Minuten.
// Der Entsperrzustand lebt ausschließlich im React-Speicher (kein localStorage/sessionStorage):
// Reload, App-Neustart, Logout und Familienwechsel sperren automatisch.
// Spielerprofile (auch isParentPlayer) spielen hier keine Rolle.

export const PARENT_UNLOCK_MS = 10 * 60 * 1000;
export const ADMIN_ROLES = ["owner", "parent"];

export const hasAdminRole = (role) => ADMIN_ROLES.includes(role);

// Neuer Ablaufzeitpunkt nach erfolgreicher PIN-Eingabe bzw. Elterninteraktion.
export const unlockUntil = (nowMs = Date.now(), ms = PARENT_UNLOCK_MS) => nowMs + ms;

export const isUnlocked = (unlockedUntil, nowMs = Date.now()) => typeof unlockedUntil === "number" && unlockedUntil > nowMs;

export const canAccessAdmin = (role, unlockedUntil, nowMs = Date.now()) => hasAdminRole(role) && isUnlocked(unlockedUntil, nowMs);
