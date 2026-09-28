// App-Lebenszyklus (FAMILY, Phase 4C2B2 / nativ seit 7A) – zentral gekapselt.
// Web: visibilitychange (sichtbar), focus und online lösen „Vordergrund“ aus.
// iOS (Capacitor): zusätzlich @capacitor/app appStateChange({ isActive: true }).
// Alle Quellen laufen durch dieselbe Entprellung: Kommen beim Zurückholen der App
// appStateChange + visibilitychange + focus kurz hintereinander, gibt es GENAU EINEN
// Vordergrund-Zyklus (ein Reload-Anlass, ein Champion-Sync, ein Realtime-Reconnect).
// Die Aufrufer bleiben unverändert.
import { subscribeNativeAppState } from "./nativeAppState.js";

export function onAppForeground(callback, {
  debounceMs = 800,
  doc = globalThis.document,
  win = globalThis.window,
  now = () => Date.now(),
  subscribeNative = subscribeNativeAppState,
} = {}) {
  if (!doc || !win) return () => {};
  let last = -Infinity;
  const fire = (source, { trustSource = false } = {}) => {
    // Das native Signal ist maßgeblich; die WebView kann ihren Sichtbarkeitsstatus
    // erst Millisekunden später aktualisieren.
    if (!trustSource && doc.visibilityState && doc.visibilityState !== "visible") return;
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
  const stopNative = subscribeNative(({ isActive } = {}) => { if (isActive) fire("native", { trustSource: true }); });
  return () => {
    doc.removeEventListener("visibilitychange", onVisible);
    win.removeEventListener("focus", onFocus);
    win.removeEventListener("online", onOnline);
    stopNative();
  };
}
