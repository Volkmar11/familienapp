import StepLayout from "./StepLayout.jsx";
import { S, C } from "../ui.jsx";

export default function FinishStep({ familyName, kids, onStart }) {
  return (
    <StepLayout title="Alles eingerichtet! 🎉" onNext={onStart} nextLabel="Los geht’s">
      <div style={{ ...S.card, textAlign: "center" }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{familyName}</div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 14 }}>
          {kids.map((c) => (
            <div key={c.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 64 }}>
              <span aria-hidden="true" style={{ fontSize: 36, width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: `3px solid ${c.color}` }}>{c.avatar}</span>
              <span style={{ fontSize: 13, fontWeight: 700, marginTop: 4, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </div>
          ))}
        </div>
        <p style={{ color: C.muted, fontSize: 14, marginTop: 14 }}>Eure Familie ist startklar.</p>
      </div>
    </StepLayout>
  );
}
