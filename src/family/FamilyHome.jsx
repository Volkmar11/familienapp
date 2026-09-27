// Zwischen-Startbildschirm nach dem Onboarding (Phase 4B).
// Die vollständige Wochen-Champion-Oberfläche folgt in Phase 4C.
import { useEffect, useState } from "react";
import { getFamilyClient } from "../lib/supabaseFamily.js";
import { fetchFamilySummary } from "../lib/familySummary.js";
import { S, C, Spinner, Message } from "./ui.jsx";

export default function FamilyHome({ familyId, role }) {
  const [state, setState] = useState({ loading: true, summary: null, error: "" });
  const load = () => {
    setState({ loading: true, summary: null, error: "" });
    fetchFamilySummary(getFamilyClient(), familyId).then((r) =>
      setState(r.ok ? { loading: false, summary: r.summary, error: "" } : { loading: false, summary: null, error: "Die Familiendaten konnten nicht geladen werden." }));
  };
  useEffect(load, [familyId]);

  if (state.loading) return <Spinner label="Familie wird geladen …" />;
  if (state.error) return <><Message kind="error">{state.error}</Message><button style={S.btn()} onClick={load}>Erneut versuchen</button></>;
  const s = state.summary;
  const stat = (label, value) => (
    <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "10px 8px", textAlign: "center", flex: "1 1 40%" }}>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div>
    </div>
  );
  return (
    <div style={S.card} data-testid="family-home">
      <div style={{ fontSize: 22, fontWeight: 800 }}>{s.name}</div>
      <div style={{ fontSize: 13, color: C.muted }}>Deine Rolle: {role === "owner" ? "Inhaber:in" : "Elternteil"}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        {s.profiles.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 99, background: "rgba(255,255,255,0.08)", border: `2px solid ${p.color || C.muted}`, maxWidth: "100%" }}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>{p.avatar_emoji || "🙂"}</span>
            <span style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: "14px 0 2px", fontSize: 15 }}>Eure Familie ist eingerichtet.</p>
      <p style={{ margin: 0, fontSize: 14, color: C.muted }}>Aufgaben und Belohnungen wurden vorbereitet.</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
        {stat("Kinder", s.profiles.length)}
        {stat("Aufgaben", s.taskCount)}
        {stat("Belohnungen", s.rewardCount)}
        {stat("Tageskrone", s.showDailyCrown ? "an" : "aus")}
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 12 }}>Die vollständige App folgt im nächsten Entwicklungsschritt.</div>
    </div>
  );
}
