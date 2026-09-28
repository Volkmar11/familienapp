// Gemeinsame Bausteine im Stil der bestehenden Wochen-Champion-Oberfläche.

export const C = {
  bg: "linear-gradient(160deg,#1e1b4b 0%,#312e81 30%,#1e1b4b 100%)",
  text: "#fff",
  muted: "#a5b4fc",
  accent: "#fbbf24",
  dark: "#1e1b4b",
  error: "#fca5a5",
  success: "#86efac",
};

export const S = {
  page: {
    fontFamily: "'Fredoka',sans-serif", background: C.bg, minHeight: "100vh", color: C.text,
    maxWidth: 480, margin: "0 auto", boxSizing: "border-box",
    padding: "calc(env(safe-area-inset-top,0px) + 24px) 16px calc(env(safe-area-inset-bottom,0px) + 24px)",
    display: "flex", flexDirection: "column",
  },
  card: {
    background: "rgba(255,255,255,0.08)", borderRadius: 20, padding: 20, marginTop: 16,
    border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 2px 12px rgba(0,0,0,0.1)",
  },
  label: { fontSize: 13, fontWeight: 700, color: C.muted, display: "block", margin: "12px 0 4px" },
  input: {
    width: "100%", padding: "12px 14px", borderRadius: 12, border: "2px solid #e2e8f0",
    fontSize: 16, fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "#1e293b",
  },
  btn: (bg = C.accent, clr = C.dark) => ({
    background: bg, color: clr, border: "none", borderRadius: 14, padding: "13px 24px", fontSize: 16,
    fontWeight: 700, fontFamily: "inherit", cursor: "pointer", width: "100%", marginTop: 16,
  }),
  link: {
    background: "none", border: "none", color: C.muted, fontFamily: "inherit", fontSize: 14,
    cursor: "pointer", padding: "10px 4px", textDecoration: "underline",
  },
  tab: (active) => ({
    flex: 1, padding: "10px 8px", borderRadius: 12, border: "none", fontFamily: "inherit", fontSize: 15,
    fontWeight: 700, cursor: "pointer", background: active ? C.accent : "rgba(255,255,255,0.1)",
    color: active ? C.dark : C.muted,
  }),
  msg: (kind) => ({
    marginTop: 12, padding: "10px 12px", borderRadius: 12, fontSize: 14, lineHeight: 1.4,
    background: kind === "error" ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.18)",
    color: kind === "error" ? C.error : C.success,
    border: `1px solid ${kind === "error" ? "rgba(239,68,68,0.4)" : "rgba(34,197,94,0.4)"}`,
  }),
};

export function Shell({ children }) {
  return (
    <div style={S.page}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
        body{margin:0;background:#1e1b4b}
        button:disabled{opacity:.55;cursor:default}
        button:active:not(:disabled){transform:scale(0.97)}
        input:focus{outline:none;border-color:#4338ca!important}
        @keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
      `}</style>
      {children}
    </div>
  );
}

export function Header({ subtitle }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 40 }} aria-hidden="true">🏆</span>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>Wochen Champion</div>
        {subtitle && <div style={{ fontSize: 14, color: C.muted }}>{subtitle}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div role="status" aria-live="polite" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, minHeight: "70vh" }}>
      <div style={{ fontSize: 52, animation: "spin 1s linear infinite" }} aria-hidden="true">🏆</div>
      {label && <div style={{ color: C.muted, fontSize: 15 }}>{label}</div>}
    </div>
  );
}

export function Message({ kind, children }) {
  if (!children) return null;
  return <div role={kind === "error" ? "alert" : "status"} style={S.msg(kind)}>{children}</div>;
}

// Rechtliche Links (Phase 6A): nur konfigurierte https-/mailto-Ziele, öffnen in neuem Tab bzw. extern.
// Ohne Konfiguration wird nichts angezeigt (siehe src/config/legal.js).
export function LegalLinks({ links = [] }) {
  if (!links.length) return null;
  return (
    <nav aria-label="Rechtliches" data-testid="legal-links" style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 16, marginTop: 20, fontSize: 13 }}>
      {links.map((l) => (
        <a key={l.key} href={l.href} target={l.href.startsWith("mailto:") ? undefined : "_blank"} rel="noopener noreferrer"
          style={{ color: C.muted, textDecoration: "underline", padding: "6px 2px" }}>{l.label}</a>
      ))}
    </nav>
  );
}
