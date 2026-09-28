// Einladung annehmen (Phase 5D). Kein automatischer Beitritt: erst prüfen, dann bewusst annehmen.
// InviteScreen: offener Token (aus Link oder Code) → prüfen → „Einladung annehmen“ / „Abbrechen“.
// InviteCodeScreen: manuelle Eingabe des Einladungscodes.
import { useEffect, useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import * as Inv from "../lib/familyInvitations.js";
import { S, C, Shell, Header, Spinner, Message } from "./ui.jsx";

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return ""; } };

export function InviteScreen({ token, email, onJoined, onCancel }) {
  const [st, setSt] = useState({ status: "checking" }); // checking | valid | invalid | accepting | joined | member
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await Inv.inspectInvitation(getFamilyClient(), token);
      if (!active) return;
      if (!r.ok) setSt({ status: "invalid", error: r.error });
      else if (r.alreadyMember) setSt({ status: "member", familyId: r.familyId, familyName: r.familyName });
      else setSt({ status: "valid", familyId: r.familyId, familyName: r.familyName, expiresAt: r.expiresAt });
    })();
    return () => { active = false; };
  }, [token]);

  const accept = async () => {
    setError(""); setSt((s) => ({ ...s, status: "accepting" }));
    const r = await Inv.acceptInvitation(getFamilyClient(), token);
    if (!r.ok) { setSt({ status: "invalid", error: r.error }); return; }
    setSt({ status: r.status === "already_member" ? "member" : "joined", familyId: r.familyId, familyName: r.familyName });
  };

  return (
    <Shell>
      <Header subtitle={email ? `Angemeldet als ${email}` : undefined} />
      <div style={S.card} data-testid="invite-screen">
        {st.status === "checking" && <Spinner label="Einladung wird geprüft …" />}
        {(st.status === "valid" || st.status === "accepting") && <>
          <div style={{ fontSize: 22, fontWeight: 800 }}><span aria-hidden="true">✉️ </span>Einladung zu {st.familyName}</div>
          <p style={{ fontSize: 15, marginTop: 8 }}>Du trittst dieser Familie als Elternteil bei.</p>
          <p style={{ fontSize: 13, color: C.muted }}>Gültig bis {fmtDate(st.expiresAt)}. {Inv.PIN_HINT}</p>
          <Message kind="error">{error}</Message>
          <button style={S.btn()} onClick={accept} disabled={st.status === "accepting"}>{st.status === "accepting" ? "Bitte warten …" : "Einladung annehmen"}</button>
          <button style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), marginTop: 8 }} onClick={onCancel} disabled={st.status === "accepting"}>Abbrechen</button>
        </>}
        {(st.status === "joined" || st.status === "member") && <>
          <div style={{ fontSize: 22, fontWeight: 800 }}><span aria-hidden="true">🎉 </span>{st.status === "joined" ? "Du bist der Familie beigetreten." : "Du bist bereits Mitglied dieser Familie."}</div>
          <p style={{ fontSize: 15, marginTop: 8 }}>{st.familyName}</p>
          <p style={{ fontSize: 13, color: C.muted }}>{Inv.PIN_HINT}</p>
          <button style={S.btn()} onClick={() => onJoined(st.familyId)}>Familie öffnen</button>
        </>}
        {st.status === "invalid" && <>
          <div style={{ fontSize: 22, fontWeight: 800 }}><span aria-hidden="true">⚠️ </span>Einladung</div>
          <Message kind="error">{st.error || Inv.INVALID_INVITE_MESSAGE}</Message>
          <p style={{ fontSize: 13, color: C.muted }}>Bitte lass dir bei Bedarf eine neue Einladung schicken.</p>
          <button style={S.btn()} onClick={onCancel}>Weiter</button>
        </>}
      </div>
    </Shell>
  );
}

export function InviteCodeScreen({ email, onSubmit, onCancel }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    const t = Inv.normalizeInviteToken(code);
    if (!t) { setError("Bitte gib den vollständigen Einladungscode ein (32 Zeichen)."); return; }
    onSubmit(t);
  };
  return (
    <Shell>
      <Header subtitle={email ? `Angemeldet als ${email}` : undefined} />
      <form style={S.card} onSubmit={submit} noValidate data-testid="invite-code-form">
        <div style={{ fontSize: 20, fontWeight: 800 }}>Einladungscode eingeben</div>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>Den Code bekommst du von einem Elternteil der Familie. Groß-/Kleinschreibung und Bindestriche spielen keine Rolle.</p>
        <label style={S.label} htmlFor="wc-invite-code">Einladungscode</label>
        <input id="wc-invite-code" style={S.input} autoComplete="off" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-…" />
        <Message kind="error">{error}</Message>
        <button type="submit" style={S.btn()}>Einladung prüfen</button>
        <button type="button" style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), marginTop: 8 }} onClick={onCancel}>Abbrechen</button>
      </form>
    </Shell>
  );
}
