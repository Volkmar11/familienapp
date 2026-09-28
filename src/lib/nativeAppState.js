// Nativer App-Zustand (FAMILY, Phase 7A): @capacitor/app → appStateChange.
// Nur auf der nativen Plattform wird ein Listener registriert; im Web passiert nichts.
import { App } from "@capacitor/app";
import { isNativePlatform } from "./nativePlatform.js";

// handler({ isActive }) · liefert eine synchrone Abmeldefunktion.
// addListener() ist asynchron: Wird vor der Registrierung abgemeldet, wird der Listener
// sofort nach dem Eintreffen wieder entfernt (kein verwaister Listener).
export function subscribeNativeAppState(handler, { isNative = isNativePlatform, app = App } = {}) {
  if (!isNative()) return () => {};
  let removed = false;
  let handle = null;
  Promise.resolve()
    .then(() => app.addListener("appStateChange", (state) => { if (!removed) handler(state); }))
    .then((h) => { handle = h; if (removed) h?.remove?.(); })
    .catch((e) => console.error("[lifecycle] appStateChange nicht verfügbar:", e?.message || e));
  return () => {
    if (removed) return;
    removed = true;
    handle?.remove?.();
  };
}
