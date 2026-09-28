// „Eltern & Einladungen“ (Phase 5D) – nur im entsperrten Elternbereich sichtbar.
// Elternliste, Einladung erstellen/teilen/widerrufen, Rollen (owner), Parent entfernen (owner),
// Familie verlassen. Alle Regeln werden serverseitig in den RPCs durchgesetzt; die UI blendet
// nur aus, was ohnehin abgelehnt würde.
// Der Klartext-Token existiert nur im Zustand dieses Panels, bis „Fertig“ gedrückt wird.
import { useCallback, useEffect, useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { runtimeEnv } from "../config/backend.js";
import * as Inv from "../lib/familyInvitations.js";
import { S, C, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in" : "Elternteil");
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

export default function FamilyAdultsPanel({ familyId, familyName, role, onActivity, onMembershipChanged, onLeft }) {
  const client = getFamilyClient();
  const [adults, setAdults] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fresh, setFresh] = useState(null);      // { token, expiresAt } – nur einmal sichtbar
  const [confirm, setConfirm] = useState(null);  // { kind: remove|promote|leave, adult? }
  const isOwner = role === "owner";

  const refresh = useCallback(async () => {
    const [a, i] = await Promise.all([Inv.listAdults(client, familyId), Inv.listInvitations(client, familyId)]);
    if (!a.ok || !i.ok) { setLoadError(a.error || i.error); return; }
    setLoadError(""); setAdults(a.list); setInvites(i.list);
  }, [client, familyId]);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn, okText) => {
    if (busy) return null;
    onActivity?.();
    setBusy(true); setError(""); setInfo("");
    try {
      const r = await fn();
      if (!r.ok) setError(r.error); else if (okText) setInfo(okText);
      return r;
    } finally { setBusy(false); }
  };

  const create = async () => {
    const r = await run(() => Inv.createInvitation(client, familyId));
    if (r?.ok) { setFresh({ token: r.token, expiresAt: r.expiresAt }); refresh(); }
  };
  const revoke = async (id) => { const r = await run(() => Inv.revokeInvitation(client, id), "Einladung widerrufen."); if (r?.ok) refresh(); };
  const doConfirm = async () => {
    const c = confirm; setConfirm(null);
    if (c.kind === "promote") {
      const r = await run(() => Inv.promoteParent(client, familyId, c.adult.userId), "Rolle geändert: jetzt Inhaber:in.");
      if (r?.ok) { refresh(); onMembershipChanged?.(); }
    } else if (c.kind === "remove") {
      const r = await run(() => Inv.removeParent(client, familyId, c.adult.userId), "Elternkonto entfernt.");
      if (r?.ok) refresh();
    } else if (c.kind === "leave") {
      const r = await run(() => Inv.leaveFamily(client, familyId));
      if (r?.ok) onLeft?.();
    }
  };

  const link = fresh ? Inv.buildInviteLink(fresh.token, { env: runtimeEnv }) : null;
  const code = fresh ? Inv.formatInviteCode(fresh.token) : "";
  const copy = async (text, label) => { onActivity?.(); const r = await Inv.copyText(text); if (r.ok) { setError(""); setInfo(`${label} kopiert.`); } else setError(r.error); };
  const share = async () => {
    onActivity?.();
    const r = await Inv.shareInvite({ link, familyName });
    if (r.ok) { setError(""); setInfo(r.via === "share" ? "Einladung geteilt." : "Link kopiert."); }
    else if (!r.aborted) setError(r.error || "Teilen nicht möglich.");
  };

  return (
    <div style={box} data-testid="adults-panel">
      <div style={{ fontWeight: 800, fontSize: 17 }}><span aria-hidden="true">👪 </span>Eltern & Einladungen</div>
      <Message kind="error">{loadError}</Message>

      <div style={{ marginTop: 8 }} data-testid="adults-list">
        {adults.map((a) => (
          <div key={a.userId} style={row} data-testid="adult-row">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{a.email || "Elternkonto"}{a.isSelf ? " (du)" : ""}</div>
              <div style={{ fontSize: 12, color: C.muted }}>{roleLabel(a.role)} · seit {fmtDate(a.createdAt).split(",")[0]}</div>
            </div>
            {isOwner && !a.isSelf && a.role === "parent" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <button style={small} disabled={busy} onClick={() => setConfirm({ kind: "promote", adult: a })}>Zu Inhaber:in machen</button>
                <button style={{ ...small, color: "#fecaca" }} disabled={busy} onClick={() => setConfirm({ kind: "remove", adult: a })}>Entfernen</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {fresh ? (
        <div style={freshBox} data-testid="invite-fresh">
          <div style={{ fontWeight: 800 }}>Neue Einladung erstellt</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Gültig bis {fmtDate(fresh.expiresAt)} · nur einmal verwendbar · Rolle: Elternteil</div>
          <div style={{ fontSize: 13, color: "#fde68a", marginTop: 8 }}>Wichtig: Link und Code werden nur jetzt angezeigt und können später nicht erneut abgerufen werden. Bei Verlust einfach eine neue Einladung erstellen.</div>
          {link && <div style={mono} data-testid="invite-link">{link}</div>}
          <div style={{ ...mono, letterSpacing: 1 }} data-testid="invite-code">{code}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {link && <button style={small} onClick={share}>Teilen …</button>}
            {link && <button style={small} onClick={() => copy(link, "Link")}>Link kopieren</button>}
            <button style={small} onClick={() => copy(code, "Code")}>Code kopieren</button>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{Inv.PIN_HINT} Die PIN wird nicht mitgeschickt – teilt sie bei Bedarf persönlich.</div>
          <button style={{ ...S.btn(), marginTop: 10 }} onClick={() => { setFresh(null); setInfo(""); }}>Fertig</button>
        </div>
      ) : (
        <button style={{ ...S.btn(), marginTop: 12 }} disabled={busy} onClick={create}>+ Elternteil einladen</button>
      )}

      <div style={{ fontWeight: 700, marginTop: 14 }}>Offene Einladungen</div>
      {invites.length === 0
        ? <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }} data-testid="invites-empty">Keine offenen Einladungen.</div>
        : invites.map((i) => (
          <div key={i.id} style={row} data-testid="invite-row">
            <div style={{ fontSize: 13, minWidth: 0 }}>
              <div>Gültig bis {fmtDate(i.expiresAt)}</div>
              <div style={{ color: C.muted, overflow: "hidden", textOverflow: "ellipsis" }}>von {i.createdBySelf ? "dir" : (i.createdByEmail || "einem Elternkonto")}</div>
            </div>
            <button style={{ ...small, color: "#fecaca" }} disabled={busy} onClick={() => revoke(i.id)}>Widerrufen</button>
          </div>
        ))}

      <Message kind="error">{error}</Message>
      <Message kind="info">{info}</Message>

      <button style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), marginTop: 14 }} disabled={busy} onClick={() => setConfirm({ kind: "leave" })}>Familie verlassen …</button>

      {confirm && (
        <div style={confirmBox} role="dialog" aria-modal="true" data-testid="adults-confirm">
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>
            {confirm.kind === "promote" && <>„{confirm.adult.email}“ wird Inhaber:in. Inhaber:innen können Eltern verwalten und die Familie löschen. Das lässt sich in dieser Version nicht rückgängig machen.</>}
            {confirm.kind === "remove" && <>„{confirm.adult.email}“ aus der Familie entfernen? Das Konto verliert sofort den Zugriff; seine offenen Einladungen werden widerrufen.</>}
            {confirm.kind === "leave" && <>Familie „{familyName}“ verlassen? Du verlierst den Zugriff auf diese Familie. {isOwner ? "Bist du die letzte Inhaberin bzw. der letzte Inhaber, wird das am längsten beigetretene Elternkonto Inhaber:in." : ""}</>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={S.btn(confirm.kind === "promote" ? undefined : "#b91c1c", confirm.kind === "promote" ? undefined : "#fff")} onClick={doConfirm}>
              {confirm.kind === "promote" ? "Bestätigen" : confirm.kind === "remove" ? "Entfernen" : "Verlassen"}
            </button>
            <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={() => setConfirm(null)}>Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

const box = { marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.15)" };
const row = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" };
const small = { background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 10, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
const freshBox = { marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)" };
const mono = { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, wordBreak: "break-all", background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 8, marginTop: 8, userSelect: "all" };
const confirmBox = { marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.2)" };
