// Start-Schutz der nativen App (Phase 7A). Wird in main.jsx nur im FAMILY-Build geladen.
// Wirft vor dem Laden der FAMILY-App, wenn die Kombination Plattform/Build/Backend unzulässig ist.
import { checkNativeRuntime } from "../config/nativeTarget.js";
import { isNativePlatform } from "../lib/nativePlatform.js";

export function assertNativeRuntime({ familyUrl, nativeTestRef }) {
  const message = checkNativeRuntime({ isNative: isNativePlatform(), nativeTestRef, familyUrl });
  if (message) throw new Error(message);
}
