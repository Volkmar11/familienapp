import { useState } from "react";
import { signIn, signUp, requestPasswordReset, MIN_PASSWORD_LENGTH } from "../lib/auth.js";
import { getAuthRedirectUrl } from "../lib/authRedirects.js";
import { runtimeEnv } from "../config/backend.js";
import { S, C, Shell, Header, Message } from "./ui.jsx";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// notice: Hinweis von außen (z. B. „Dein Account wurde gelöscht.“ oder abgelaufener Reset-Link)
export default function AuthScreen({ notice = "", onNoticeShown }) {
  const [mode, setMode] = useState("login"); // login | register | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(notice);

  const switchTo = (m) => { setMode(m); setError(""); setInfo(""); setPassword(""); setPassword2(""); onNoticeShown?.(); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError(""); setInfo(""); onNoticeShown?.();
    if (!EMAIL_RE.test(email.trim())) { setError("Bitte eine gültige E-Mail-Adresse eingeben."); return; }
    if (mode !== "forgot" && !password) { setError("Bitte ein Passwort eingeben."); return; }
    if (mode === "register") {
      if (password.length < MIN_PASSWORD_LENGTH) { setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`); return; }
      if (password !== password2) { setError("Die Passwörter stimmen nicht überein."); return; }
    }
    setBusy(true);
    try {
      if (mode === "login") {
        const r = await signIn(email, password);
        if (!r.ok) setError(r.error);
        // Bei Erfolg übernimmt der Auth-Listener in FamilyApp.
      } else if (mode === "register") {
        const r = await signUp(email, password);
        if (!r.ok) setError(r.error);
        else if (r.needsEmailConfirmation) setInfo("Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link in der Mail und melde dich danach an.");
      } else {
        // Neutrale Meldung – unabhängig davon, ob die Adresse registriert ist (keine Benutzer-Enumeration).
        // Nur technische Fehler (Verbindung, zu viele Versuche) werden gemeldet.
        const r = await requestPasswordReset(email, getAuthRedirectUrl("recovery", { env: runtimeEnv }));
        if (!r.ok && /Verbindung|Zu viele/.test(r.error)) setError(r.error);
        else setInfo("Wenn ein Konto zu dieser E-Mail-Adresse existiert, haben wir dir einen Link zum Zurücksetzen des Passworts geschickt.");
      }
    } finally {
      setBusy(false);
    }
  };

  const title = mode === "login" ? "Anmelden" : mode === "register" ? "Konto erstellen" : "Passwort vergessen";
  const cta = mode === "login" ? "Anmelden" : mode === "register" ? "Konto erstellen" : "Link senden";

  return (
    <Shell>
      <Header subtitle="Familien-Aufgaben mit Punkten" />
      {mode !== "forgot" && (
        <div style={{ display: "flex", gap: 8, marginTop: 24 }} role="tablist">
          <button type="button" role="tab" aria-selected={mode === "login"} style={S.tab(mode === "login")} onClick={() => switchTo("login")} disabled={busy}>Anmelden</button>
          <button type="button" role="tab" aria-selected={mode === "register"} style={S.tab(mode === "register")} onClick={() => switchTo("register")} disabled={busy}>Registrieren</button>
        </div>
      )}
      <form style={S.card} onSubmit={submit} noValidate>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
        {mode === "forgot" && <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst.</div>}
        <label style={S.label} htmlFor="wc-email">E-Mail-Adresse</label>
        <input id="wc-email" style={S.input} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} disabled={busy} placeholder="name@beispiel.de" />
        {mode !== "forgot" && <>
          <label style={S.label} htmlFor="wc-password">Passwort</label>
          <input id="wc-password" style={S.input} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </>}
        {mode === "register" && <>
          <label style={S.label} htmlFor="wc-password2">Passwort wiederholen</label>
          <input id="wc-password2" style={S.input} type="password" autoComplete="new-password"
            value={password2} onChange={(e) => setPassword2(e.target.value)} disabled={busy} />
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Mindestens {MIN_PASSWORD_LENGTH} Zeichen.</div>
        </>}
        <Message kind="error">{error}</Message>
        <Message kind="info">{info}</Message>
        <button type="submit" style={S.btn()} disabled={busy} aria-busy={busy}>{busy ? "Bitte warten …" : cta}</button>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", marginTop: 4 }}>
          {mode === "login" && <button type="button" style={S.link} onClick={() => switchTo("forgot")} disabled={busy}>Passwort vergessen?</button>}
          {mode === "forgot" && <button type="button" style={S.link} onClick={() => switchTo("login")} disabled={busy}>← Zurück zur Anmeldung</button>}
        </div>
      </form>
    </Shell>
  );
}
