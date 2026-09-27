import StepLayout from "./StepLayout.jsx";
import { S, C } from "../ui.jsx";

const POINTS = [
  ["✅", "Aufgaben gemeinsam organisieren"],
  ["⭐", "Punkte sammeln"],
  ["🎁", "Belohnungen erreichen"],
  ["🏆", "Optional: spielerischer Wochen-Champion"],
];

export default function WelcomeStep({ onNext, onLogout }) {
  return (
    <StepLayout title="Willkommen bei Wochen Champion 👋" intro="In wenigen Schritten richtet ihr eure Familie ein." onNext={onNext} nextLabel="Los geht’s">
      <div style={S.card}>
        {POINTS.map(([icon, text]) => (
          <div key={text} style={{ display: "flex", gap: 12, alignItems: "center", padding: "8px 0", fontSize: 16 }}>
            <span aria-hidden="true" style={{ fontSize: 24 }}>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>
      <p style={{ color: C.muted, fontSize: 13, marginTop: 14 }}>Ihr könnt alles später im Elternbereich anpassen.</p>
      {onLogout && <button type="button" style={{ ...S.link, paddingLeft: 0 }} onClick={onLogout}>Mit einem anderen Konto anmelden</button>}
    </StepLayout>
  );
}
