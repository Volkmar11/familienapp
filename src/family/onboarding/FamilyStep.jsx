import StepLayout from "./StepLayout.jsx";
import { S } from "../ui.jsx";
import { LIMITS } from "./options.js";

export default function FamilyStep({ nav, value, onChange }) {
  return (
    <StepLayout {...nav} title="Wie heißt eure Familie?" intro="Der Name erscheint in der App, z. B. „Familie Müller“.">
      <div style={S.card}>
        <label style={S.label} htmlFor="ob-family">Familienname</label>
        <input id="ob-family" style={S.input} type="text" autoComplete="off" maxLength={LIMITS.FAMILY_NAME_MAX}
          placeholder="Familie Müller" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </StepLayout>
  );
}
