// FAMILY-Wrapper (Phase 4C1): echte Wochen-Champion-Oberfläche mit relationalen Daten, READ-ONLY.
// Lädt die aktive Familie über src/lib/familyData.js und übergibt sie an die gemeinsame UI.
// Keine Schreibvorgänge, kein Realtime; Elternbereich gesperrt (Auth-Rolle ≠ PIN-verifiziert, siehe unten).
import { useCallback, useEffect, useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { loadFamilyData } from "../lib/familyData.js";
import ChampionApp from "../shared/ChampionApp.jsx";
import { S, C, Shell, Header, Spinner, Message } from "./ui.jsx";

const roleLabel = (r) => (r === "owner" ? "Inhaber:in" : r === "parent" ? "Elternteil" : r);

export default function FamilyChampion({ familyId, role, email, canSwitchFamily, onSwitchFamily, onLogout }) {
  const [state, setState] = useState({ status: "loading", model: null, error: "" }); // loading | loaded | error

  // Erstes Laden und „Erneut versuchen“ zeigen den Ladezustand; „Daten neu laden“ (refresh)
  // behält die Oberfläche samt aktueller Ansicht und tauscht nur die Daten aus.
  const load = useCallback(async ({ refresh = false } = {}) => {
    if (!refresh) setState({ status: "loading", model: null, error: "" });
    const r = await loadFamilyData(getFamilyClient(), familyId);
    setState(r.ok ? { status: "loaded", model: r.model, error: "" } : { status: "error", model: null, error: r.error });
  }, [familyId]);

  useEffect(() => { load(); }, [load]);

  if (state.status === "loading") return <Shell><Spinner label="Familie wird geladen …" /></Shell>;
  if (state.status === "error") {
    return (
      <Shell>
        <Header subtitle={email ? `Angemeldet als ${email}` : undefined} />
        <div style={S.card} data-testid="family-data-error">
          <div style={{ fontSize: 22, fontWeight: 800 }}><span aria-hidden="true">⚠️ </span>Daten konnten nicht geladen werden</div>
          <Message kind="error">{state.error}</Message>
          <button style={S.btn()} onClick={() => load()}>Erneut versuchen</button>
        </div>
        {canSwitchFamily && <button style={S.link} onClick={onSwitchFamily}>Andere Familie wählen</button>}
        <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={onLogout}>Abmelden</button>
      </Shell>
    );
  }

  const { model } = state;
  // Architektur: "Auth-Rolle" (owner/parent aus family_members) und "PIN-verifiziert"
  // (verify_parent_pin, Phase 4C2) sind getrennte Voraussetzungen. In 4C1 ist der
  // Elternbereich unabhängig von beiden gesperrt; es wird nur die Rolle angezeigt.
  const parentAccess = { authRole: role, pinVerified: false };
  const adminLockedView = (
    <div style={lockedCard} data-testid="admin-locked">
      <div style={{ fontSize: 44, textAlign: "center" }} aria-hidden="true">🔒</div>
      <div style={{ fontWeight: 800, fontSize: 17, textAlign: "center", marginTop: 6 }}>Der Eltern-Bereich wird gerade vorbereitet.</div>
      <div style={{ fontSize: 14, color: C.muted, textAlign: "center", marginTop: 6 }}>Aufgaben bestätigen, Belohnungen verwalten und Einstellungen ändern folgen im nächsten Schritt.</div>
      <div style={infoRow}><span>Familie</span><b>{model.family.name}</b></div>
      <div style={infoRow}><span>Deine Rolle</span><b>{roleLabel(parentAccess.authRole)}</b></div>
      <div style={infoRow}><span>Angemeldet als</span><b style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{email}</b></div>
      <div style={infoRow}><span>Tageskrone</span><b>{model.settings.showDailyCrown ? "an" : "aus"}</b></div>
      <div style={infoRow}><span>Bestätigung nötig</span><b>{model.settings.requireConfirmation ? "ja" : "nein"}</b></div>
      <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={() => load({ refresh: true })}>Daten neu laden</button>
      {canSwitchFamily && <button style={S.btn("rgba(255,255,255,0.12)", C.text)} onClick={onSwitchFamily}>Familie wechseln</button>}
      <button style={S.btn()} onClick={onLogout}>Abmelden</button>
    </div>
  );

  return (
    <ChampionApp
      data={model.data}
      readOnly
      showDailyCrown={model.settings.showDailyCrown}
      adminLockedView={adminLockedView}
      rewardSuggestions={[]}
    />
  );
}

const lockedCard = { background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 18, margin: "0 16px 16px", border: "1px solid rgba(255,255,255,0.1)", color: C.text };
const infoRow = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#c7d2fe", minWidth: 0 };
