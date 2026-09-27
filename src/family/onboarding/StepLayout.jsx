import { S, C, Shell, Message } from "../ui.jsx";

// Gemeinsamer Rahmen: Fortschritt, Titel, Inhalt, Zurück/Weiter.
export default function StepLayout({ step, total, title, intro, error, onBack, onNext, nextLabel = "Weiter", nextDisabled, busy, children }) {
  return (
    <Shell>
      {step && (
        <div aria-label={`Schritt ${step} von ${total}`}>
          <div style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Schritt {step} von {total}</div>
          <div style={{ height: 6, background: "rgba(255,255,255,0.12)", borderRadius: 99, marginTop: 6, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(step / total) * 100}%`, background: C.accent, borderRadius: 99, transition: "width .3s" }} />
          </div>
        </div>
      )}
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: "18px 0 4px", lineHeight: 1.2 }}>{title}</h1>
      {intro && <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.45, margin: "4px 0 0" }}>{intro}</p>}
      <div style={{ flex: 1 }}>{children}</div>
      <Message kind="error">{error}</Message>
      <div style={{ display: "flex", gap: 10, position: "sticky", bottom: 0, zIndex: 5, margin: "8px -16px 0", padding: "4px 16px calc(env(safe-area-inset-bottom,0px) + 4px)",
        background: "linear-gradient(to top, #1e1b4b 75%, rgba(30,27,75,0))" }}>
        {onBack && (
          <button type="button" style={{ ...S.btn("rgba(255,255,255,0.12)", C.text), flex: "0 0 34%" }} onClick={onBack} disabled={busy}>Zurück</button>
        )}
        {onNext && (
          <button type="button" style={{ ...S.btn(), flex: 1 }} onClick={onNext} disabled={busy || nextDisabled} aria-busy={busy}>{nextLabel}</button>
        )}
      </div>
    </Shell>
  );
}

export function Toggle({ id, checked, onChange, label, description }) {
  return (
    <div style={{ ...S.card, display: "flex", gap: 14, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <label htmlFor={id} style={{ fontWeight: 700, fontSize: 16, cursor: "pointer" }}>{label}</label>
        <div style={{ color: C.muted, fontSize: 14, lineHeight: 1.45, marginTop: 4 }}>{description}</div>
      </div>
      <button id={id} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        style={{ flex: "0 0 auto", width: 56, height: 32, borderRadius: 99, border: "none", cursor: "pointer", position: "relative",
          background: checked ? "#22c55e" : "rgba(255,255,255,0.25)", transition: "background .2s" }}>
        <span style={{ position: "absolute", top: 3, left: checked ? 27 : 3, width: 26, height: 26, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
        <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{checked ? "An" : "Aus"}</span>
      </button>
    </div>
  );
}

// Auswahlzeile mit Checkbox und editierbaren Punkten (Aufgaben/Belohnungen).
export function PickRow({ id, icon, title, selected, points, onToggle, onPoints, pointsLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
      <input id={id} type="checkbox" checked={selected} onChange={(e) => onToggle(e.target.checked)}
        style={{ width: 22, height: 22, accentColor: C.accent, flex: "0 0 auto" }} />
      <label htmlFor={id} style={{ flex: 1, minWidth: 0, fontSize: 15, opacity: selected ? 1 : 0.55, cursor: "pointer" }}>
        <span aria-hidden="true">{icon} </span>{title}
      </label>
      <input aria-label={`${pointsLabel} für ${title}`} type="text" inputMode="numeric" pattern="[0-9]*" value={points} disabled={!selected}
        onChange={(e) => onPoints(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
        style={{ ...S.input, width: 72, padding: "8px 6px", textAlign: "center", flex: "0 0 auto", opacity: selected ? 1 : 0.5 }} />
      <span aria-hidden="true" style={{ fontSize: 14, flex: "0 0 auto" }}>⭐</span>
    </div>
  );
}
