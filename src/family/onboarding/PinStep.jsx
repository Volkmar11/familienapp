import StepLayout from "./StepLayout.jsx";
import { S, C } from "../ui.jsx";
import { LIMITS } from "./options.js";

// PIN nur im React-State (kein localStorage, kein Logging).
export default function PinStep({ nav, pin, pin2, onChange }) {
  const field = (id, label, value, key) => (
    <>
      <label style={S.label} htmlFor={id}>{label}</label>
      <input id={id} style={{ ...S.input, letterSpacing: 10, textAlign: "center", fontSize: 22 }} type="password"
        inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={LIMITS.PIN_LENGTH} value={value}
        onChange={(e) => onChange(key, e.target.value.replace(/\D/g, "").slice(0, LIMITS.PIN_LENGTH))} />
    </>
  );
  return (
    <StepLayout {...nav} title="Elternbereich schützen 🔒"
      intro="Mit der Eltern-PIN schützt ihr Einstellungen, Aufgaben und Belohnungen vor unbeabsichtigten Änderungen.">
      <div style={S.card}>
        {field("ob-pin", "4-stellige PIN", pin, "pin")}
        {field("ob-pin2", "PIN wiederholen", pin2, "pin2")}
      </div>
      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.45, marginTop: 12 }}>
        Die PIN ist eine zusätzliche Sperre auf eurem Familiengerät – euer Konto bleibt durch E-Mail und Passwort geschützt. Sie wird nur verschlüsselt (als Hash) gespeichert.
      </p>
    </StepLayout>
  );
}
