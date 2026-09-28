// Native iOS-App (Phase 7A) – Identität und Laufzeit-Schutz.
// Die native App ist in 7A ausschließlich eine TEST-App gegen „wochen-champion-test“.
// Bewusst steht hier NUR die Test-Ref (Allowlist); die Produktions-Ref kommt im Client-Code
// nicht vor. Der Build-Schutz mit Produktions-Sperrliste liegt in scripts/lib/iosTestGuard.mjs.

export const NATIVE_APP_ID = "de.volkmarsolutions.wochenchampion";
export const NATIVE_APP_NAME = "Wochen Champion";
export const NATIVE_TEST_PROJECT_REF = "otejitifgcrrwmudrnhs";
export const NATIVE_TEST_BUILD_MODE = "ios-test"; // vite --mode ios-test

export const projectRefOfUrl = (u) => {
  try {
    const url = new URL(String(u || "").trim());
    if (url.protocol !== "https:") return null;
    return /^([a-z0-9]{20})\.supabase\.co$/i.exec(url.host)?.[1]?.toLowerCase() ?? null;
  } catch { return null; }
};

// Laufzeitprüfung beim Start (main.jsx, nur FAMILY-Build). Liefert eine Fehlermeldung oder null.
//   isNative        – läuft im Capacitor-Container
//   nativeTestRef   – im nativen Test-Build fest eingebaute Test-Ref ("" in normalen Web-Builds)
//   familyUrl       – konfigurierte VITE_FAMILY_SUPABASE_URL
export function checkNativeRuntime({ isNative, nativeTestRef, familyUrl }) {
  if (isNative && !nativeTestRef) {
    return "Diese Web-Version ist kein nativer Test-Build. Die iOS-App darf nur mit „npm run ios:test“ gebaut werden.";
  }
  if (!nativeTestRef) return null; // normaler Web-Build (Preview/Produktion): unverändert
  if (nativeTestRef !== NATIVE_TEST_PROJECT_REF) {
    return "Nativer Test-Build mit unbekanntem Projekt. Erlaubt ist nur das Testprojekt „wochen-champion-test“.";
  }
  if (projectRefOfUrl(familyUrl) !== NATIVE_TEST_PROJECT_REF) {
    return "Der native Test-Build darf ausschließlich das Testprojekt „wochen-champion-test“ verwenden. Start abgebrochen.";
  }
  return null;
}
