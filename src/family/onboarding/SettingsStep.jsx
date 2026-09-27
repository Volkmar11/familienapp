import StepLayout, { Toggle } from "./StepLayout.jsx";
import { C } from "../ui.jsx";

export default function SettingsStep({ nav, settings, onChange }) {
  return (
    <StepLayout {...nav} title="Eure Einstellungen">
      <Toggle id="ob-crown" label="👑 Tageskrone anzeigen" checked={settings.showDailyCrown}
        onChange={(v) => onChange({ ...settings, showDailyCrown: v })}
        description="Der aktuell führende Spieler erhält auf der Startseite eine Krone." />
      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, margin: "8px 4px 0" }}>
        Wenn der direkte Wettbewerb bei euch für Streit sorgt, könnt ihr die Tageskrone jederzeit deaktivieren.
      </p>
      <Toggle id="ob-confirm" label="✅ Aufgaben bestätigen" checked={settings.requireConfirmation}
        onChange={(v) => onChange({ ...settings, requireConfirmation: v })}
        description="Wenn aktiviert, müssen erledigte Aufgaben von einem Elternteil bestätigt werden." />
    </StepLayout>
  );
}
