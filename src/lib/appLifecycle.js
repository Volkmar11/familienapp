// App-Lebenszyklus (FAMILY, Phase 4C2B2) – zentral gekapselt.
// Web: visibilitychange (sichtbar), focus und online lösen „Vordergrund“ aus; Doppel-
// ereignisse (z. B. visibilitychange + focus beim Tab-Wechsel) werden entprellt.
//
// Capacitor (später, noch NICHT installiert): hier ergänzen, z. B.
//   import { App } from "@capacitor/app";
//   App.addListener("appStateChange", ({ isActive }) => isActive && fire("capacitor"));
// Die Aufrufer bleiben unverändert.

export function onAppForeground(callback, { debounceMs = 800, doc = globalThis.document, win = globalThis.window, now = () => Date.now() } = {}) {
  if (!doc || !win) return () => {};
  let last = -Infinity;
  const fire = (source) => {
    if (doc.visibilityState && doc.visibilityState !== "visible") return;
    const t = now();
    if (t - last < debounceMs) return;
    last = t;
    callback(source);
  };
  const onVisible = () => fire("visibility");
  const onFocus = () => fire("focus");
  const onOnline = () => fire("online");
  doc.addEventListener("visibilitychange", onVisible);
  win.addEventListener("focus", onFocus);
  win.addEventListener("online", onOnline);
  return () => {
    doc.removeEventListener("visibilitychange", onVisible);
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("online", onOnline);
  };
}
