import StepLayout from "./StepLayout.jsx";
import { S } from "../ui.jsx";

const HINTS = [
  ["🧒", "Kinder wählen ihr Profil und erledigen Aufgaben."],
  ["🔒", "Eltern verwalten Aufgaben, Punkte und Kategorien im geschützten Elternbereich."],
  ["🎁", "Punkte können für Belohnungen eingelöst werden."],
  ["⚙️", "Tageskrone und weitere Einstellungen können jederzeit angepasst werden."],
];

export default function IntroStep({ nav }) {
  return (
    <StepLayout {...nav} title="So funktioniert’s">
      <div style={S.card}>
        {HINTS.map(([icon, text], i) => (
          <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", fontSize: 15, lineHeight: 1.45 }}>
            <span aria-hidden="true" style={{ fontSize: 22, flex: "0 0 auto" }}>{icon}</span><span>{text}</span>
          </div>
        ))}
      </div>
    </StepLayout>
  );
}
