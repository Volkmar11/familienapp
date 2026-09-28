// Einstieg im FAMILY-Modus: Session prüfen → Anmeldung → Familienmitgliedschaft.
// Ohne Familie → Onboarding (Phase 4B). Mit Familie → Wochen-Champion-Oberfläche (Phase 4C1: read-only).
import { useEffect, useState, useCallback, useRef } from "react";
import { getSession, onAuthStateChange, signOut, updatePassword, MIN_PASSWORD_LENGTH } from "../lib/auth.js";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { fetchMemberships, classifyMemberships } from "../lib/familyMembership.js";
import { capturePendingInvite, clearPendingInvite, setPendingInvite, INVALID_INVITE_MESSAGE } from "../lib/familyInvitations.js";
import { createMembershipRealtime } from "../lib/familyRealtime.js";
import { onAppForeground } from "../lib/appLifecycle.js";
import AuthScreen from "./AuthScreen.jsx";
import AccountSecurity from "./AccountSecurity.jsx";
import { InviteScreen, InviteCodeScreen } from "./InviteScreen.jsx";
import { isRecoveryRedirect, readAuthRedirectError, clearAuthParamsFromUrl } from "../lib/authRedirects.js";
import OnboardingWizard from "./onboarding/OnboardingWizard.jsx";
import FamilyChampion from "./FamilyChampion.jsx";
import { S, C, Shell, Header, Spinner, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in (owner)" : r === "parent" ? "Elternteil (parent)" : r);

export default function FamilyApp() {
  const [authReady, setAuthReady] = useState(false);
  const [session, setSession] = useState(null);
  // Fallback: Recovery-Link erkannt, auch falls das Ereignis vor dem Listener kam
  const [recovery, setRecovery] = useState(() => isRecoveryRedirect());
  const [authNotice, setAuthNotice] = useState(() => readAuthRedirectError()); // z. B. abgelaufener Link
  const [accountOpen, setAccountOpen] = useState(false); // „Konto & Sicherheit“
  const [membership, setMembership] = useState({ status: "idle", list: [], error: "" }); // idle|loading|ready|error
  const [activeFamilyId, setActiveFamilyId] = useState(null);
  const [onboarding, setOnboarding] = useState(null); // { familyId|null } solange der Assistent inkl. Erfolgsseite sichtbar ist
  // Einladung (5D): ?invite= wird beim Start gelesen, in sessionStorage abgelegt und aus der URL entfernt
  const [invite, setInvite] = useState(() => capturePendingInvite());
  const [codeEntry, setCodeEntry] = useState(false);
  const [familyNotice, setFamilyNotice] = useState("");
  const activeRef = useRef(null);
  activeRef.current = activeFamilyId;
  const userId = session?.user?.id ?? null;
  const inviteToken = invite?.token ?? null;
  const dropInvite = () => { clearPendingInvite(); setInvite({ token: null, invalidParam: false }); };

  // 1) Session beim Start wiederherstellen + Auth-Änderungen verfolgen.
  // Im Listener nur State setzen (keine weiteren Supabase-Aufrufe → keine Deadlocks).
  useEffect(() => {
    let active = true;
    getSession().then((r) => { if (active) { setSession(r.session); setAuthReady(true); } });
    const unsubscribe = onAuthStateChange((event, s) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") { setRecovery(false); setAccountOpen(false); }
      setSession(s ?? null);
      setAuthReady(true);
    });
    // Fehlerparameter (abgelaufener Link) nicht im Verlauf stehen lassen
    if (readAuthRedirectError()) clearAuthParamsFromUrl();
    return () => { active = false; unsubscribe(); };
  }, []);

  // 2) Mitgliedschaften laden, sobald ein Nutzer angemeldet ist.
  // keepActive: aktive Familie beibehalten, sofern der Nutzer noch Mitglied ist. Fehlt sie
  // (entfernt, Familie gelöscht), wird FamilyChampion ausgehängt → Realtime, PIN-Gate und
  // Bild-Cache dieser Familie werden verworfen; es folgt Auswahl bzw. Onboarding.
  const loadMemberships = useCallback(async ({ silent = false, preferFamilyId = null, keepActive = false } = {}) => {
    if (!userId) return;
    if (!silent) setMembership({ status: "loading", list: [], error: "" });
    const r = await fetchMemberships(getFamilyClient(), userId);
    if (!r.ok) {
      if (silent) return; // stilles Nachladen: bisherigen Stand behalten
      setMembership({ status: "error", list: [], error: "Deine Familiendaten konnten nicht geladen werden." }); return;
    }
    setMembership({ status: "ready", list: r.memberships, error: "" });
    const wanted = preferFamilyId ?? (keepActive ? activeRef.current : null);
    const preferred = wanted && r.memberships.some((m) => m.familyId === wanted) ? wanted : null;
    if (keepActive && activeRef.current && !preferred) {
      // Aktive Familie weg → nicht still in eine andere Familie springen, sondern Hinweis + Auswahl
      setFamilyNotice("Du hast keinen Zugriff mehr auf diese Familie.");
      setActiveFamilyId(null);
      return;
    }
    setActiveFamilyId(preferred ?? (r.memberships.length === 1 ? r.memberships[0].familyId : null));
  }, [userId]);
  const loadRef = useRef(loadMemberships);
  loadRef.current = loadMemberships;

  useEffect(() => {
    if (userId) loadMemberships();
    else { setMembership({ status: "idle", list: [], error: "" }); setActiveFamilyId(null); setOnboarding(null); setCodeEntry(false); setFamilyNotice(""); }
  }, [userId, loadMemberships]);

  // Mitgliedschafts-Realtime (5D): eigenes Signal je Nutzer (public.user_membership_sync).
  // Beitritt, Rollenwechsel, Entfernen, Austritt, gelöschte Familie → Mitgliedschaften still neu laden.
  useEffect(() => {
    if (!userId) return undefined;
    let timer = null;
    const request = () => { clearTimeout(timer); timer = setTimeout(() => loadRef.current({ silent: true, keepActive: true }), 250); };
    const rt = createMembershipRealtime({ client: getFamilyClient(), userId, onChange: request });
    const stopForeground = onAppForeground(() => { rt.reconnectNow(); request(); });
    return () => { clearTimeout(timer); rt.stop(); stopForeground(); };
  }, [userId]);

  if (!authReady) return <Shell><Spinner label="Anmeldung wird geprüft …" /></Shell>;
  if (recovery && session) return <NewPasswordScreen onDone={() => { setRecovery(false); clearAuthParamsFromUrl(); }} />;
  if (!session) {
    const notice = authNotice || (invite?.invalidParam ? INVALID_INVITE_MESSAGE : "");
    return <AuthScreen notice={notice} onNoticeShown={() => { setAuthNotice(""); if (invite?.invalidParam) setInvite({ token: inviteToken, invalidParam: false }); }}
      inviteToken={inviteToken} onDiscardInvite={dropInvite} />;
  }

  const email = session.user?.email ?? "";
  if (invite?.invalidParam && !inviteToken) {
    return (
      <Screen email={email} title="Einladung" emoji="⚠️">
        <Message kind="error">{INVALID_INVITE_MESSAGE}</Message>
        <button style={S.btn()} onClick={() => setInvite({ token: null, invalidParam: false })}>Weiter</button>
      </Screen>
    );
  }
  // Offene Einladung hat Vorrang vor Onboarding/Familienansicht – kein automatischer Beitritt.
  if (inviteToken && !accountOpen) {
    return (
      <InviteScreen
        key={inviteToken}
        token={inviteToken}
        email={email}
        onCancel={dropInvite}
        onJoined={(familyId) => { dropInvite(); setOnboarding(null); setFamilyNotice(""); loadMemberships({ preferFamilyId: familyId }); }}
      />
    );
  }
  if (codeEntry && !accountOpen) {
    return <InviteCodeScreen email={email} onCancel={() => setCodeEntry(false)}
      onSubmit={(t) => { setCodeEntry(false); setInvite({ token: setPendingInvite(t), invalidParam: false }); }} />;
  }
  // Konto & Sicherheit: überall erreichbar (Onboarding, Familienauswahl, Elternbereich)
  if (accountOpen) {
    return (
      <AccountSecurity
        email={email}
        memberships={membership.list}
        onClose={() => setAccountOpen(false)}
        onLogout={() => signOut()}
        onDeleted={() => { setAuthNotice("Dein Account wurde gelöscht."); setAccountOpen(false); }}
      />
    );
  }
  const wizard = (
    <OnboardingWizard
      onCreated={(familyId) => { setOnboarding({ familyId }); loadMemberships({ silent: true, preferFamilyId: familyId }); }}
      onFinish={(familyId) => {
        setOnboarding(null);
        // Falls das stille Neuladen noch nicht fertig ist: gezielt nachladen statt den Assistenten neu zu starten.
        if (membership.list.some((m) => m.familyId === familyId)) setActiveFamilyId(familyId);
        else loadMemberships({ preferFamilyId: familyId });
      }}
      onLogout={() => signOut()}
      onAccount={() => setAccountOpen(true)}
      onJoinWithCode={() => setCodeEntry(true)}
    />
  );
  // Assistent bleibt inkl. Erfolgsseite sichtbar, auch während Mitgliedschaften neu geladen werden.
  if (onboarding) return wizard;
  if (membership.status === "idle" || membership.status === "loading") return <Shell><Spinner label="Familie wird geladen …" /></Shell>;
  if (membership.status === "error") {
    return (
      <Screen email={email} title="Verbindungsproblem" onAccount={() => setAccountOpen(true)}>
        <Message kind="error">{membership.error}</Message>
        <button style={S.btn()} onClick={() => loadMemberships()}>Erneut versuchen</button>
      </Screen>
    );
  }

  const kind = classifyMemberships(membership.list);
  if (kind === "none") {
    return familyNotice
      ? <Screen email={email} title="Familie" emoji="🏠" onAccount={() => setAccountOpen(true)}>
          <Message kind="info">{familyNotice}</Message>
          <button style={S.btn()} onClick={() => setFamilyNotice("")}>Weiter</button>
        </Screen>
      : wizard;
  }

  const activeFamily = membership.list.find((m) => m.familyId === activeFamilyId);
  if (!activeFamily) {
    return (
      <Screen email={email} title="Familie auswählen" emoji="🏠" onAccount={() => setAccountOpen(true)}>
        <Message kind="info">{familyNotice}</Message>
        <p style={{ color: C.muted, fontSize: 15, margin: "8px 0 4px" }}>{membership.list.length > 1 ? "Du gehörst zu mehreren Familien. Welche möchtest du öffnen?" : "Welche Familie möchtest du öffnen?"}</p>
        {membership.list.map((m) => (
          <button key={m.familyId} style={{ ...S.btn("rgba(255,255,255,0.1)", C.text), textAlign: "left", marginTop: 10 }} onClick={() => { setFamilyNotice(""); setActiveFamilyId(m.familyId); }}>
            {m.familyName || "Familie"} <span style={{ color: C.muted, fontWeight: 500, fontSize: 13 }}>· {roleLabel(m.role)}</span>
          </button>
        ))}
        <button style={{ ...S.link, marginTop: 10 }} onClick={() => setCodeEntry(true)}>Einladungscode eingeben</button>
      </Screen>
    );
  }

  // key: Beim Familienwechsel wird der gesamte Zustand (Daten, Ansicht, Auswahl) verworfen und neu geladen.
  return (
    <FamilyChampion
      key={activeFamily.familyId}
      familyId={activeFamily.familyId}
      role={activeFamily.role}
      email={email}
      userId={userId}
      canSwitchFamily={membership.list.length > 1}
      onSwitchFamily={() => setActiveFamilyId(null)}
      onLogout={() => signOut()}
      onOpenAccount={() => setAccountOpen(true)}
      // Rolle/Mitgliedschaft geändert (z. B. Ownership-Übergabe, Austritt, Familie gelöscht) → neu laden
      onMembershipChanged={() => loadMemberships({ silent: true, preferFamilyId: activeFamily.familyId })}
      onFamilyDeleted={() => { setActiveFamilyId(null); loadMemberships(); }}
      onEnterInviteCode={() => setCodeEntry(true)}
      onFamilyLeft={() => { setActiveFamilyId(null); setFamilyNotice("Du hast die Familie verlassen."); loadMemberships(); }}
    />
  );
}

function Screen({ email, title, emoji, children, onAccount }) {
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
      {title ? (
        <div style={S.card}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{emoji && <span aria-hidden="true">{emoji} </span>}{title}</div>
          {children}
        </div>
      ) : children}
      <Message kind="error">{error}</Message>
      {onAccount && <button style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), marginBottom: 10 }} onClick={onAccount}>👤 Konto & Sicherheit</button>}
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
