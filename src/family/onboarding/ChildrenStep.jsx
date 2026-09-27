import StepLayout from "./StepLayout.jsx";
import { S, C } from "../ui.jsx";
import { AVATARS, COLORS, LIMITS } from "./options.js";
import { newChild } from "../../lib/onboarding.js";

export default function ChildrenStep({ nav, kids, onChange }) {
  const update = (id, patch) => onChange(kids.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const remove = (id) => onChange(kids.filter((c) => c.id !== id));
  const move = (i, d) => { const a = [...kids]; [a[i], a[i + d]] = [a[i + d], a[i]]; onChange(a); };
  return (
    <StepLayout {...nav} title="Wer macht mit?" intro="Legt für jedes Kind ein Profil an. Die Reihenfolge könnt ihr mit den Pfeilen ändern.">
      {kids.map((c, i) => (
        <div key={c.id} style={{ ...S.card, borderLeft: `5px solid ${c.color}` }} data-testid="child-card">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span aria-hidden="true" style={{ fontSize: 34, flex: "0 0 auto" }}>{c.avatar}</span>
            <input aria-label={`Name von Kind ${i + 1}`} style={{ ...S.input, flex: 1, minWidth: 0 }} type="text" autoComplete="off"
              maxLength={LIMITS.CHILD_NAME_MAX} placeholder="Name" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} />
          </div>
          <div style={{ fontSize: 12, color: C.muted, margin: "10px 0 4px" }}>Avatar</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {AVATARS.map((a) => (
              <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={c.avatar === a} onClick={() => update(c.id, { avatar: a })}
                style={{ fontSize: 22, width: 40, height: 40, borderRadius: 10, cursor: "pointer", background: c.avatar === a ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.06)",
                  border: c.avatar === a ? `2px solid ${C.accent}` : "2px solid transparent" }}>{a}</button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: C.muted, margin: "10px 0 4px" }}>Farbe</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLORS.map((col) => (
              <button key={col} type="button" aria-label={`Farbe ${col}`} aria-pressed={c.color === col} onClick={() => update(c.id, { color: col })}
                style={{ width: 32, height: 32, borderRadius: 99, background: col, cursor: "pointer", border: c.color === col ? "3px solid #fff" : "3px solid transparent" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={S.link} aria-label={`Kind ${i + 1} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
              <button type="button" style={S.link} aria-label={`Kind ${i + 1} nach unten`} disabled={i === kids.length - 1} onClick={() => move(i, 1)}>▼</button>
            </div>
            {kids.length > LIMITS.CHILDREN_MIN && (
              <button type="button" style={{ ...S.link, color: "#fca5a5" }} onClick={() => remove(c.id)}>Entfernen</button>
            )}
          </div>
        </div>
      ))}
      {kids.length < LIMITS.CHILDREN_MAX && (
        <button type="button" style={S.btn("rgba(255,255,255,0.1)", C.text)} onClick={() => onChange([...kids, newChild(kids.length)])}>+ Kind hinzufügen</button>
      )}
    </StepLayout>
  );
}
