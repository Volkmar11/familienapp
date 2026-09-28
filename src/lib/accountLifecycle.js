// Konto-Lebenszyklus im FAMILY-Modus (Phase 5C): Passwort ändern, Re-Authentifizierung,
// Account löschen, Familie löschen. Privilegierte Schritte laufen ausschließlich in den
// Edge Functions delete-account / delete-family (serverseitiger Schlüssel, nie im Browser).
// Passwörter werden nie gespeichert oder geloggt und NIE an die Edge Functions geschickt.
import { MIN_PASSWORD_LENGTH, toGermanAuthError } from "./auth.js";

export const DELETE_ACCOUNT_PHRASE = "LÖSCHEN";
export const DELETE_FAMILY_PHRASE = "FAMILIE LÖSCHEN";

export const LIFECYCLE_MESSAGES = Object.freeze({
  wrongPassword: "Das Passwort ist nicht korrekt.",
  phrase: (p) => `Bitte zur Bestätigung „${p}“ eingeben.`,
  reauth: "Aus Sicherheitsgründen bitte erneut mit dem Passwort bestätigen.",
  forbidden: "Dazu fehlt dir die Berechtigung. Nur die Inhaberin bzw. der Inhaber der Familie kann sie löschen.",
  pin: "Die Eltern-PIN ist nicht korrekt.",
  network: "Keine Verbindung zum Server. Es wurde nichts gelöscht – bitte erneut versuchen.",
  server: "Das Löschen konnte nicht abgeschlossen werden. Bitte erneut versuchen – bereits Erledigtes wird dabei nicht doppelt ausgeführt.",
  samePassword: "Das neue Passwort muss sich vom bisherigen unterscheiden.",
});

export function validateNewPassword(pw, pw2) {
  if (!pw || pw.length < MIN_PASSWORD_LENGTH) return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`;
  if (pw !== pw2) return "Die Passwörter stimmen nicht überein.";
  return "";
}

export const phraseMatches = (input, phrase) => String(input || "").trim().toLocaleUpperCase("de-DE") === phrase;

// Frische Anmeldung mit der E-Mail der AKTUELLEN Sitzung (keine Wahl eines anderen Kontos).
export async function reauthenticate(client, password) {
  const { data } = await client.auth.getSession();
  const email = data?.session?.user?.email;
  if (!email) return { ok: false, message: LIFECYCLE_MESSAGES.reauth };
  const r = await client.auth.signInWithPassword({ email, password });
  if (r.error) return { ok: false, message: /invalid/i.test(r.error.message || "") ? LIFECYCLE_MESSAGES.wrongPassword : toGermanAuthError(r.error) };
  if (r.data?.user?.id !== data.session.user.id) return { ok: false, message: LIFECYCLE_MESSAGES.reauth };
  return { ok: true };
}

// Eingeloggt: aktuelles Passwort bestätigen, dann neues setzen.
export async function changePassword(client, { currentPassword, newPassword, newPassword2 }) {
  const invalid = validateNewPassword(newPassword, newPassword2);
  if (invalid) return { ok: false, message: invalid };
  if (currentPassword === newPassword) return { ok: false, message: LIFECYCLE_MESSAGES.samePassword };
  const re = await reauthenticate(client, currentPassword);
  if (!re.ok) return re;
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: toGermanAuthError(error) };
  return { ok: true };
}

async function invoke(client, name, body) {
  let res;
  try { res = await client.functions.invoke(name, { body }); } catch { return { ok: false, reason: "network", message: LIFECYCLE_MESSAGES.network }; }
  if (!res.error && res.data?.ok) return { ok: true, ...res.data };
  let reason = res.data?.reason;
  if (!reason && res.error?.context && typeof res.error.context.json === "function") {
    try { reason = (await res.error.context.json())?.reason; } catch { /* ignore */ }
  }
  if (!reason && /fetch|network/i.test(String(res.error?.message || ""))) reason = "network";
  const message = { reauth_required: LIFECYCLE_MESSAGES.reauth, unauthorized: LIFECYCLE_MESSAGES.reauth, forbidden: LIFECYCLE_MESSAGES.forbidden,
    pin: LIFECYCLE_MESSAGES.pin, network: LIFECYCLE_MESSAGES.network }[reason] || LIFECYCLE_MESSAGES.server;
  return { ok: false, reason: reason || "server", message };
}

// Account löschen: 1. Bestätigungstext, 2. Passwort erneut (frische Sitzung), 3. Edge Function
// (ohne Passwort, ohne user_id – der Server nimmt ausschließlich die ID aus dem JWT).
export async function deleteAccount(client, { password, phrase }) {
  if (!phraseMatches(phrase, DELETE_ACCOUNT_PHRASE)) return { ok: false, reason: "phrase", message: LIFECYCLE_MESSAGES.phrase(DELETE_ACCOUNT_PHRASE) };
  const re = await reauthenticate(client, password);
  if (!re.ok) return { ...re, reason: "password" };
  const r = await invoke(client, "delete-account", {});
  if (r.ok) {
    // Konto existiert nicht mehr → nur lokale Sitzung entfernen (globaler Logout wäre nicht möglich)
    try { await client.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
  }
  return r;
}

// Familie löschen (nur owner): Bestätigungstext, Passwort (frische Sitzung), PIN (serverseitig geprüft).
export async function deleteFamily(client, { familyId, password, pin, phrase }) {
  if (!phraseMatches(phrase, DELETE_FAMILY_PHRASE)) return { ok: false, reason: "phrase", message: LIFECYCLE_MESSAGES.phrase(DELETE_FAMILY_PHRASE) };
  if (!/^[0-9]{4}$/.test(pin || "")) return { ok: false, reason: "pin", message: LIFECYCLE_MESSAGES.pin };
  const re = await reauthenticate(client, password);
  if (!re.ok) return { ...re, reason: "password" };
  return invoke(client, "delete-family", { familyId, pin });
}
