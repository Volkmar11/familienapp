// Plattform-Abstraktion (FAMILY, Phase 7A) – einzige Stelle, die Capacitor nach der Plattform fragt.
// Wird nur aus FAMILY-Code importiert; der LEGACY-Build enthält kein Capacitor.
//   Web (Browser, Vercel-Preview): isNativePlatform() === false, keine Plugin-Aufrufe
//   iOS (Capacitor-WKWebView):     isNativePlatform() === true
import { Capacitor } from "@capacitor/core";

export function isNativePlatform() {
  try { return !!Capacitor.isNativePlatform(); } catch { return false; }
}

export function getPlatform() {
  try { return Capacitor.getPlatform(); } catch { return "web"; }
}
