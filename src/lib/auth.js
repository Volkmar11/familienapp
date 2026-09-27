// Auth-Service für den FAMILY-Modus. Nutzt ausschließlich den FAMILY-Client.
// Im LEGACY-Modus wird diese Datei nicht geladen.
import { getFamilyClient } from "./supabaseFamily.js";

export const MIN_PASSWORD_LENGTH = 6; // Supabase-Standard-Mindestlänge

// Supabase-Fehler → verständliches Deutsch (ohne technische Details oder Tokens)
export function toGermanAuthError(error) {
  if (!error) return "";
  const msg = String(error.message || error).toLowerCase();
  const code = String(error.code || "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "E-Mail-Adresse oder Passwort ist falsch.";
  if (code === "user_already_exists" || msg.includes("already registered") || msg.includes("already exists")) return "Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melde dich an.";
  if (code === "weak_password" || msg.includes("password should be") || msg.includes("password is too")) return `Das Passwort ist zu schwach. Bitte mindestens ${MIN_PASSWORD_LENGTH} Zeichen verwenden.`;
  if (code === "email_address_invalid" || msg.includes("invalid email") || msg.includes("unable to validate email") || msg.includes("is invalid")) return "Bitte eine gültige E-Mail-Adresse eingeben.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  if (code.includes("rate_limit") || msg.includes("rate limit") || msg.includes("too many")) return "Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.";
  if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("fetch")) return "Keine Verbindung zum Server. Bitte Internetverbindung prüfen.";
  if (code === "signup_disabled" || msg.includes("signups not allowed")) return "Registrierungen sind derzeit nicht möglich.";
  return "Das hat leider nicht geklappt. Bitte versuche es erneut.";
}

export function createAuthService(getClient) {
  const sb = () => getClient();
  return {
    async signUp(email, password) {
      const { data, error } = await sb().auth.signUp({ email: email.trim(), password });
      if (error) return { ok: false, error: toGermanAuthError(error) };
      // Bei aktiver E-Mail-Bestätigung gibt es keine sofortige Session.
      return { ok: true, session: data.session ?? null, needsEmailConfirmation: !data.session };
    },
    async signIn(email, password) {
      const { data, error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, error: toGermanAuthError(error) };
      return { ok: true, session: data.session };
    },
    async signOut() {
      const { error } = await sb().auth.signOut();
      if (error) return { ok: false, error: toGermanAuthError(error) };
      return { ok: true };
    },
    async getSession() {
      const { data, error } = await sb().auth.getSession();
      if (error) return { ok: false, error: toGermanAuthError(error), session: null };
      return { ok: true, session: data.session ?? null };
    },
    onAuthStateChange(callback) {
      const { data } = sb().auth.onAuthStateChange((event, session) => callback(event, session));
      return () => data.subscription.unsubscribe();
    },
    // redirectTo muss in Supabase unter Authentication → URL Configuration erlaubt sein
    // (Web: Vercel-Domain/Preview; iOS später: Deep Link / Universal Link).
    async requestPasswordReset(email, redirectTo) {
      const { error } = await sb().auth.resetPasswordForEmail(email.trim(), redirectTo ? { redirectTo } : undefined);
      if (error) return { ok: false, error: toGermanAuthError(error) };
      return { ok: true };
    },
    // Nach Klick auf den Reset-Link (Ereignis PASSWORD_RECOVERY) neues Passwort setzen.
    async updatePassword(newPassword) {
      const { error } = await sb().auth.updateUser({ password: newPassword });
      if (error) return { ok: false, error: toGermanAuthError(error) };
      return { ok: true };
    },
  };
}

const auth = createAuthService(getFamilyClient);
export const { signUp, signIn, signOut, getSession, onAuthStateChange, requestPasswordReset, updatePassword } = auth;
