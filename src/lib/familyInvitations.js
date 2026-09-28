// Einladungen für weitere Elternkonten (Phase 5D, FAMILY).
//
// Token: 128 Bit (32 Hex-Zeichen), serverseitig erzeugt; in der DB liegt nur SHA-256(Token).
// Der Klartext-Token wird genau einmal angezeigt (Link/Code) und nie geloggt.
//
// Warum sessionStorage (und NICHT localStorage) für einen offenen Einladungslink?
//   – Der Token muss den Weg über Anmeldung/Registrierung überleben (Seitenwechsel, Reload im
//     selben Tab), soll aber nicht dauerhaft auf dem Gerät liegen oder in andere Tabs/Sitzungen
//     „mitwandern“. sessionStorage endet mit dem Tab; localStorage bliebe unbegrenzt erhalten.
//   – Zusätzlich wird ?invite= sofort per history.replaceState aus der Adresszeile entfernt
//     (kein Token im Verlauf, in Lesezeichen oder beim Teilen der URL).
//   – Nach Annehmen, Abbrechen oder bei „bereits Mitglied“ wird der Token sofort gelöscht.

import { detectAuthEnvironment, getAuthRedirectUrl } from "./authRedirects.js";

export const INVITE_PARAM = "invite";
export const PENDING_INVITE_KEY = "wc.pendingInvite";
export const INVALID_INVITE_MESSAGE = "Diese Einladung ist ungültig oder nicht mehr verfügbar.";
export const RATE_LIMIT_MESSAGE = "Zu viele Versuche. Bitte warte einige Minuten und versuche es erneut.";
export const PIN_HINT = "Für den geschützten Elternbereich benötigt ihr zusätzlich eure Familien-PIN.";

// Groß-/Kleinschreibung egal, Bindestriche und Leerzeichen werden ignoriert.
export function normalizeInviteToken(raw) {
  if (typeof raw !== "string" || raw.length > 200) return null;
  const v = raw.toLowerCase().replace(/[\s-]/g, "");
  return /^[0-9a-f]{32}$/.test(v) ? v : null;
}

// Lesbarer Code: 8 Vierergruppen, z. B. „ab12-cd34-…“
export function formatInviteCode(token) {
  const t = normalizeInviteToken(token);
  return t ? t.toUpperCase().match(/.{4}/g).join("-") : "";
}

const cleanBase = (u) => {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch { return null; }
};

// Basis-URL für Einladungslinks: VITE_INVITE_BASE_URL (z. B. feste Produktions-Domain) oder
// die aktuelle App-Herkunft. Bewusst keine fest eingetragene Preview-URL.
export function getInviteBaseUrl({ env = {}, location = globalThis.location, isNative } = {}) {
  const configured = env.VITE_INVITE_BASE_URL && cleanBase(env.VITE_INVITE_BASE_URL);
  if (configured) return configured;
  // In der nativen App ist die Herkunft z. B. capacitor://localhost – nicht teilbar → nur mit Konfiguration
  if (detectAuthEnvironment({ location, isNative: isNative ?? false }) === "native") return null;
  // Vertrauenswürdige App-Herkunft aus dem zentralen Redirect-Helfer (Phase 5C)
  const trusted = getAuthRedirectUrl("invite", { env, location, isNative: false });
  return trusted ? cleanBase(trusted) : null;
}

export function buildInviteLink(token, opts = {}) {
  const t = normalizeInviteToken(token);
  const base = getInviteBaseUrl(opts);
  if (!t || !base) return null;
  return `${base}/?${INVITE_PARAM}=${t}`;
}

// Registrierung aus einer Einladung: E-Mail-Bestätigung führt zurück in den Einladungsfluss.
export function getInviteSignupRedirect(token, opts = {}) {
  return buildInviteLink(token, opts);
}

const storage = (win) => { try { return win?.sessionStorage ?? null; } catch { return null; } };

// Beim App-Start: ?invite= lesen → validieren → sessionStorage → aus URL entfernen.
// Rückgabe: normalisierter Token (neu oder bereits gespeichert) oder null.
export function capturePendingInvite(win = globalThis.window) {
  let token = null;
  try {
    const url = new URL(win.location.href);
    if (url.searchParams.has(INVITE_PARAM)) {
      token = normalizeInviteToken(url.searchParams.get(INVITE_PARAM) || "");
      url.searchParams.delete(INVITE_PARAM);
      win.history?.replaceState?.(win.history.state, "", url.pathname + url.search + url.hash);
      const s = storage(win);
      if (token) s?.setItem(PENDING_INVITE_KEY, token);
      else return { token: getPendingInvite(win), invalidParam: true };
    }
  } catch { /* ignore */ }
  return { token: token || getPendingInvite(win), invalidParam: false };
}

export function getPendingInvite(win = globalThis.window) {
  try { return normalizeInviteToken(storage(win)?.getItem(PENDING_INVITE_KEY) || ""); } catch { return null; }
}

export function setPendingInvite(token, win = globalThis.window) {
  const t = normalizeInviteToken(token);
  if (!t) return null;
  try { storage(win)?.setItem(PENDING_INVITE_KEY, t); } catch { /* ignore */ }
  return t;
}

export function clearPendingInvite(win = globalThis.window) {
  try { storage(win)?.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------
// RPC-Wrapper (deutsche Meldungen, keine Tokens in Fehlermeldungen)
// ---------------------------------------------------------------------
const rpcError = (error, fallback) => {
  const msg = String(error?.message || "");
  if (/failed to fetch|network/i.test(msg)) return "Keine Verbindung zum Server. Bitte Internetverbindung prüfen.";
  // Serverseitige Meldungen sind bereits deutsch und frei von Details
  if (/[äöüÄÖÜß]|Einladung|Familie|Elternkonto|Inhaber|Berechtigung|angemeldet|Mitglied/.test(msg)) return msg;
  return fallback;
};

const inviteResult = (data) => {
  if (data?.ok) return { ok: true, ...data };
  if (data?.error === "rate_limited") return { ok: false, error: RATE_LIMIT_MESSAGE, code: "rate_limited" };
  return { ok: false, error: INVALID_INVITE_MESSAGE, code: "invalid" };
};

export async function createInvitation(client, familyId) {
  const { data, error } = await client.rpc("create_family_invitation", { p_family_id: familyId });
  if (error) return { ok: false, error: rpcError(error, "Die Einladung konnte nicht erstellt werden.") };
  return { ok: true, id: data.id, token: data.token, expiresAt: data.expires_at };
}

export async function inspectInvitation(client, token) {
  const t = normalizeInviteToken(token);
  if (!t) return { ok: false, error: INVALID_INVITE_MESSAGE, code: "invalid" };
  const { data, error } = await client.rpc("inspect_family_invitation", { p_token: t });
  if (error) return { ok: false, error: rpcError(error, INVALID_INVITE_MESSAGE), code: "error" };
  const r = inviteResult(data);
  return r.ok ? { ok: true, familyId: data.family_id, familyName: data.family_name, expiresAt: data.expires_at, alreadyMember: !!data.already_member } : r;
}

export async function acceptInvitation(client, token) {
  const t = normalizeInviteToken(token);
  if (!t) return { ok: false, error: INVALID_INVITE_MESSAGE, code: "invalid" };
  const { data, error } = await client.rpc("accept_family_invitation", { p_token: t });
  if (error) return { ok: false, error: rpcError(error, INVALID_INVITE_MESSAGE), code: "error" };
  const r = inviteResult(data);
  return r.ok ? { ok: true, status: data.status, familyId: data.family_id, familyName: data.family_name } : r;
}

export async function revokeInvitation(client, invitationId) {
  const { error } = await client.rpc("revoke_family_invitation", { p_invitation_id: invitationId });
  if (error) return { ok: false, error: rpcError(error, "Die Einladung konnte nicht widerrufen werden.") };
  return { ok: true };
}

export async function listInvitations(client, familyId) {
  const { data, error } = await client.rpc("list_family_invitations", { p_family_id: familyId });
  if (error) return { ok: false, error: rpcError(error, "Einladungen konnten nicht geladen werden."), list: [] };
  return { ok: true, list: (data || []).map((r) => ({ id: r.id, createdAt: r.created_at, expiresAt: r.expires_at, createdByEmail: r.created_by_email, createdBySelf: r.created_by_self })) };
}

export async function listAdults(client, familyId) {
  const { data, error } = await client.rpc("list_family_adults", { p_family_id: familyId });
  if (error) return { ok: false, error: rpcError(error, "Elternkonten konnten nicht geladen werden."), list: [] };
  return { ok: true, list: (data || []).map((r) => ({ userId: r.user_id, email: r.email, role: r.role, createdAt: r.created_at, isSelf: r.is_self })) };
}

export async function promoteParent(client, familyId, userId) {
  const { error } = await client.rpc("promote_family_parent", { p_family_id: familyId, p_user_id: userId });
  if (error) return { ok: false, error: rpcError(error, "Die Rolle konnte nicht geändert werden.") };
  return { ok: true };
}

export async function removeParent(client, familyId, userId) {
  const { error } = await client.rpc("remove_family_parent", { p_family_id: familyId, p_user_id: userId });
  if (error) return { ok: false, error: rpcError(error, "Das Elternkonto konnte nicht entfernt werden.") };
  return { ok: true };
}

export async function leaveFamily(client, familyId) {
  const { data, error } = await client.rpc("leave_family", { p_family_id: familyId });
  if (error) return { ok: false, error: rpcError(error, "Du konntest die Familie nicht verlassen.") };
  return { ok: true, ownershipTransferred: !!data?.ownership_transferred };
}

// Teilen: Web Share API, sonst Zwischenablage (keine zusätzliche Bibliothek)
export async function shareInvite({ link, familyName }, nav = globalThis.navigator) {
  const text = `Einladung zu „${familyName || "unserer Familie"}“ bei Wochen Champion. Der Link ist 7 Tage gültig und nur einmal verwendbar.`;
  if (nav?.share) {
    try { await nav.share({ title: "Wochen Champion – Einladung", text, url: link }); return { ok: true, via: "share" }; }
    catch (e) { if (e?.name === "AbortError") return { ok: false, via: "share", aborted: true }; }
  }
  return copyText(link, nav);
}

export async function copyText(text, nav = globalThis.navigator) {
  try { await nav.clipboard.writeText(text); return { ok: true, via: "clipboard" }; }
  catch { return { ok: false, via: "clipboard", error: "Kopieren nicht möglich. Bitte markiere den Text und kopiere ihn manuell." }; }
}
