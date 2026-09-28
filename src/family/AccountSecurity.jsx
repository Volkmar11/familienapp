// „Konto & Sicherheit“ (Phase 5C): E-Mail, Passwort ändern, Reset-Link, Abmelden, Account löschen.
// Account löschen hängt NICHT an der Eltern-PIN, sondern an einer echten Re-Authentifizierung
// (Passwort) + Bestätigungstext. Passwörter bleiben nur im Formular-State und werden nie geloggt.
import { useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { requestPasswordReset } from "../lib/auth.js";
import { getAuthRedirectUrl } from "../lib/authRedirects.js";
import { runtimeEnv } from "../config/backend.js";
import { changePassword, deleteAccount, DELETE_ACCOUNT_PHRASE, phraseMatches } from "../lib/accountLifecycle.js";
import { S, C, Shell, Header, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in" : r === "parent" ? "Elternteil" : r);
const danger = "#b91c1c";

// Verständliche Folgen je Familie (aus den eigenen Mitgliedschaften; der Server entscheidet verbindlich)
export function describeDeletionImpact(memberships) {
  return (memberships || []).map((m) => ({
    familyName: m.familyName || "Familie",
    text: m.role === "owner"
      ? "Bist du die einzige erwachsene Person, wird die Familie mit allen Kindern, Aufgaben, Punkten, Belohnungen und Bildern gelöscht. Gibt es weitere Eltern, bleibt die Familie für sie erhalten; wenn nötig, wird das dienstälteste Elternteil Inhaber:in."
      : "Du wirst aus der Familie entfernt. Die Familie und alle Daten bleiben für die anderen Eltern erhalten.",
  }));
}

export default function AccountSecurity({ email, memberships = [], onClose, onLogout, onDeleted }) {
  const [view, setView] = useState("overview"); // overview | password | delete
  const [msg, setMsg] = useState({ kind: "", text: "" });
  const [busy, setBusy] = useState(false);
  const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [delPw, setDelPw] = useState(""); const [phrase, setPhrase] = useState(""); const [understood, setUnderstood] = useState(false);

  const go = (v) => { setView(v); setMsg({ kind: "", text: "" }); setCur(""); setPw(""); setPw2(""); setDelPw(""); setPhrase(""); setUnderstood(false); };

  const submitPassword = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setMsg({ kind: "", text: "" });
    const r = await changePassword(getFamilyClient(), { currentPassword: cur, newPassword: pw, newPassword2: pw2 });
    setBusy(false); setCur(""); setPw(""); setPw2("");
    setMsg(r.ok ? { kind: "info", text: "Dein Passwort wurde geändert." } : { kind: "error", text: r.message });
  };
  const sendReset = async () => {
    if (busy) return; setBusy(true);
    await requestPasswordReset(email, getAuthRedirectUrl("recovery", { env: runtimeEnv }));
    setBusy(false);
    setMsg({ kind: "info", text: "Wir haben dir einen Link zum Zurücksetzen des Passworts geschickt, falls die Adresse registriert ist." });
  };
  const submitDelete = async (e) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setMsg({ kind: "", text: "" });
    const r = await deleteAccount(getFamilyClient(), { password: delPw, phrase });
    setDelPw("");
    if (r.ok) { onDeleted?.(); return; } // Komponente wird beim Abmelden entfernt – Button bleibt gesperrt
    setBusy(false);
    setMsg({ kind: "error", text: r.message });
  };

  const canDelete = understood && delPw.length > 0 && phraseMatches(phrase, DELETE_ACCOUNT_PHRASE) && !busy;
  return (
    <Shell>
      <Header subtitle="Konto & Sicherheit" />
      <div style={S.card} data-testid="account-security">
        <div style={{ fontSize: 22, fontWeight: 800 }}><span aria-hidden="true">👤 </span>Konto & Sicherheit</div>
        <div style={{ marginTop: 12, fontSize: 14, color: C.muted }}>Angemeldet als</div>
        <div style={{ fontWeight: 700, overflowWrap: "anywhere" }} data-testid="account-email">{email}</div>
        {memberships.length > 0 && <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>
          {memberships.map((m) => <div key={m.familyId}>{m.familyName || "Familie"} · {roleLabel(m.role)}</div>)}
        </div>}
      </div>

      {view === "overview" && <>
        <div style={S.card}>
          <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={() => go("password")}>🔑 Passwort ändern</button>
          <button style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), marginTop: 10 }} onClick={sendReset} disabled={busy}>✉️ Passwort vergessen – Link per E-Mail</button>
          <button style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), marginTop: 10 }} onClick={onLogout}>Abmelden</button>
          <Message kind={msg.kind || "info"}>{msg.text}</Message>
        </div>
        <div style={{ ...S.card, border: "1px solid rgba(239,68,68,0.45)" }}>
          <div style={{ fontWeight: 800 }}>Account löschen</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>Dein Konto wird dauerhaft gelöscht – nicht nur deaktiviert.</div>
          <button style={{ ...S.btn(danger, "#fff"), marginTop: 12 }} onClick={() => go("delete")}>Account dauerhaft löschen …</button>
        </div>
      </>}

      {view === "password" && <form style={S.card} onSubmit={submitPassword} noValidate>
        <div style={{ fontWeight: 800, fontSize: 18 }}>Passwort ändern</div>
        <label style={S.label} htmlFor="acc-cur">Aktuelles Passwort</label>
        <input id="acc-cur" style={S.input} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} disabled={busy} />
        <label style={S.label} htmlFor="acc-new">Neues Passwort</label>
        <input id="acc-new" style={S.input} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy} />
        <label style={S.label} htmlFor="acc-new2">Neues Passwort wiederholen</label>
        <input id="acc-new2" style={S.input} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={busy} />
        <Message kind={msg.kind || "info"}>{msg.text}</Message>
        <button type="submit" style={S.btn()} disabled={busy}>{busy ? "Bitte warten …" : "Passwort speichern"}</button>
        <button type="button" style={S.link} onClick={() => go("overview")} disabled={busy}>← Zurück</button>
      </form>}

      {view === "delete" && <form style={{ ...S.card, border: "1px solid rgba(239,68,68,0.6)" }} onSubmit={submitDelete} noValidate data-testid="delete-account-form">
        <div style={{ fontWeight: 800, fontSize: 18, color: "#fecaca" }}>⚠️ Account dauerhaft löschen</div>
        <ul style={{ fontSize: 14, lineHeight: 1.5, paddingLeft: 18, margin: "10px 0" }}>
          <li>Dein Konto ({email}) wird endgültig gelöscht. Das kann nicht rückgängig gemacht werden.</li>
          <li>Du kannst dich danach nicht mehr anmelden.</li>
          {describeDeletionImpact(memberships).map((d, i) => <li key={i}><b>{d.familyName}:</b> {d.text}</li>)}
        </ul>
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, marginTop: 6 }}>
          <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} disabled={busy} style={{ marginTop: 3 }} data-testid="delete-understood" />
          <span>Ich habe die Folgen gelesen und verstanden.</span>
        </label>
        <label style={S.label} htmlFor="acc-del-pw">Aktuelles Passwort</label>
        <input id="acc-del-pw" style={S.input} type="password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} disabled={busy} />
        <label style={S.label} htmlFor="acc-del-phrase">Zur Bestätigung „{DELETE_ACCOUNT_PHRASE}“ eingeben</label>
        <input id="acc-del-phrase" style={S.input} autoComplete="off" autoCapitalize="characters" value={phrase} onChange={(e) => setPhrase(e.target.value)} disabled={busy} />
        <Message kind="error">{msg.text}</Message>
        <button type="submit" style={S.btn(danger, "#fff")} disabled={!canDelete} aria-busy={busy}>{busy ? "Account wird gelöscht …" : "Account endgültig löschen"}</button>
        <button type="button" style={S.link} onClick={() => go("overview")} disabled={busy}>Abbrechen</button>
      </form>}

      {view === "overview" && <button style={S.link} onClick={onClose}>← Zurück zur App</button>}
    </Shell>
  );
}
