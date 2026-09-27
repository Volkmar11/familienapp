// Einstieg im FAMILY-Modus: Session prüfen → Anmeldung → Familienmitgliedschaft.
// Phase 4A: noch keine Familie anlegen, kein Onboarding, keine Familien-App.
import { useEffect, useState, useCallback } from "react";
import { getSession, onAuthStateChange, signOut, updatePassword, MIN_PASSWORD_LENGTH } from "../lib/auth.js";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { fetchMemberships, classifyMemberships } from "../lib/familyMembership.js";
import AuthScreen from "./AuthScreen.jsx";
import { S, C, Shell, Header, Spinner, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in (owner)" : r === "parent" ? "Elternteil (parent)" : r);

export default function FamilyApp() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [membership, setMembership] = useState({ status: "idle", list: [], error: "" }); // idle|loading|ready|error
  const [activeFamilyId, setActiveFamilyId] = useState(null);
  const userId = session?.user?.id ?? null;

  // 1) Session beim Start wiederherstellen + Auth-Änderungen verfolgen.
  // Im Listener nur State setzen (keine weiteren Supabase-Aufrufe → keine Deadlocks).
  useEffect(() => {
    let active = true;
    getSession().then((r) => { if (active) { setSession(r.session); setAuthReady(true); } });
    const unsubscribe = onAuthStateChange((event, s) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setSession(s ?? null);
      setAuthReady(true);
    });
    return () => { active = false; unsubscribe(); };
  }, []);

  // 2) Mitgliedschaften laden, sobald ein Nutzer angemeldet ist.
  const loadMemberships = useCallback(async () => {
    if (!userId) return;
    setMembership({ status: "loading", list: [], error: "" });
    const r = await fetchMemberships(getFamilyClient(), userId);
    if (!r.ok) { setMembership({ status: "error", list: [], error: "Deine Familiendaten konnten nicht geladen werden." }); return; }
    setMembership({ status: "ready", list: r.memberships, error: "" });
    setActiveFamilyId(r.memberships.length === 1 ? r.memberships[0].familyId : null);
  }, [userId]);

  useEffect(() => {
    if (userId) loadMemberships();
    else { setMembership({ status: "idle", list: [], error: "" }); setActiveFamilyId(null); }
  }, [userId, loadMemberships]);

  if (!authReady) return <Shell><Spinner label="Anmeldung wird geprüft …" /></Shell>;
  if (recovery && session) return <NewPasswordScreen onDone={() => setRecovery(false)} />;
  if (!session) return <AuthScreen />;

  const email = session.user?.email ?? "";
  if (membership.status === "idle" || membership.status === "loading") return <Shell><Spinner label="Familie wird geladen …" /></Shell>;
  if (membership.status === "error") {
    return (
      <Screen email={email} title="Verbindungsproblem">
        <Message kind="error">{membership.error}</Message>
        <button style={S.btn()} onClick={loadMemberships}>Erneut versuchen</button>
      </Screen>
    );
  }

  const kind = classifyMemberships(membership.list);
  if (kind === "none") {
    return (
      <Screen email={email} title="Willkommen bei Wochen Champion" emoji="👋">
        <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.5, margin: "8px 0 0" }}>Deine Familie wird im nächsten Schritt eingerichtet.</p>
        <button style={S.btn()} disabled title="Folgt in Phase 4B">Familie einrichten</button>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8, textAlign: "center" }}>Die Einrichtung wird gerade vorbereitet.</div>
      </Screen>
    );
  }

  const activeFamily = membership.list.find((m) => m.familyId === activeFamilyId);
  if (!activeFamily) {
    return (
      <Screen email={email} title="Familie auswählen" emoji="🏠">
        <p style={{ color: C.muted, fontSize: 15, margin: "8px 0 4px" }}>Du gehörst zu mehreren Familien. Welche möchtest du öffnen?</p>
        {membership.list.map((m) => (
          <button key={m.familyId} style={{ ...S.btn("rgba(255,255,255,0.1)", C.text), textAlign: "left", marginTop: 10 }} onClick={() => setActiveFamilyId(m.familyId)}>
            {m.familyName || "Familie"} <span style={{ color: C.muted, fontWeight: 500, fontSize: 13 }}>· {roleLabel(m.role)}</span>
          </button>
        ))}
      </Screen>
    );
  }

  return (
    <Screen email={email} title="Familie gefunden" emoji="🏆">
      <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.7 }}>
        <div><span style={{ color: C.muted }}>Familie:</span> <b>{activeFamily.familyName || "–"}</b></div>
        <div><span style={{ color: C.muted }}>Deine Rolle:</span> <b>{roleLabel(activeFamily.role)}</b></div>
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>Übergangsansicht – die neue Familien-App folgt in einer späteren Phase.</div>
      {membership.list.length > 1 && <button style={S.link} onClick={() => setActiveFamilyId(null)}>Andere Familie wählen</button>}
    </Screen>
  );
}

function Screen({ email, title, emoji, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const logout = async () => {
    setBusy(true); setError("");
    const r = await signOut();
    if (!r.ok) { setError(r.error); setBusy(false); }
  };
  return (
    <Shell>
      <Header subtitle={email ? `Angemeldet als ${email}` : undefined} />
      <div style={S.card}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{emoji && <span aria-hidden="true">{emoji} </span>}{title}</div>
        {children}
      </div>
      <Message kind="error">{error}</Message>
      <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={logout} disabled={busy}>{busy ? "Abmelden …" : "Abmelden"}</button>
    </Shell>
  );
}

function NewPasswordScreen({ onDone }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setError("");
    if (pw.length < MIN_PASSWORD_LENGTH) { setError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`); return; }
    if (pw !== pw2) { setError("Die Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    const r = await updatePassword(pw);
    setBusy(false);
    if (!r.ok) setError(r.error); else setOk(true);
  };
  return (
    <Shell>
      <Header subtitle="Neues Passwort festlegen" />
      <form style={S.card} onSubmit={submit} noValidate>
        <label style={S.label} htmlFor="wc-newpw">Neues Passwort</label>
        <input id="wc-newpw" style={S.input} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} disabled={busy || ok} />
        <label style={S.label} htmlFor="wc-newpw2">Passwort wiederholen</label>
        <input id="wc-newpw2" style={S.input} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={busy || ok} />
        <Message kind="error">{error}</Message>
        <Message kind="info">{ok ? "Dein Passwort wurde geändert." : ""}</Message>
        {ok
          ? <button type="button" style={S.btn()} onClick={onDone}>Weiter</button>
          : <button type="submit" style={S.btn()} disabled={busy}>{busy ? "Bitte warten …" : "Passwort speichern"}</button>}
      </form>
    </Shell>
  );
}
