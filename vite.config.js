import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveBackendMode, BACKEND_MODES } from './src/config/backend.js'
import { validateIosTestEnv, NATIVE_TEST_BUILD_MODE, NATIVE_TEST_PROJECT_REF } from './scripts/lib/iosTestGuard.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Build-Zeit-Schalter: Der nicht benötigte App-Zweig wird aus dem Bundle entfernt
  // (FAMILY-Builds enthalten so keinen Legacy-Code mit alten Standarddaten).
  // Ungültige Werte werden zur Laufzeit in main.jsx als Konfigurationsfehler angezeigt.
  let isFamilyBuild = false
  try { isFamilyBuild = resolveBackendMode(env) === BACKEND_MODES.FAMILY } catch { /* Fehleranzeige zur Laufzeit */ }

  // Phase 7A: nativer iOS-Test-Build (vite build --mode ios-test, siehe scripts/build-ios-test.mjs).
  // Harter Abbruch bei Produktions-Ref, LEGACY-Werten, Secrets oder HTTP – kein Build, kein Bundle.
  const isNativeTestBuild = mode === NATIVE_TEST_BUILD_MODE
  if (isNativeTestBuild) {
    const check = validateIosTestEnv(env)
    if (!check.ok) {
      throw new Error(`[ios-test] Nativer Test-Build abgebrochen:\n  - ${check.errors.join('\n  - ')}\nSiehe .env.ios-test.example und docs/appstore/PHASE_07A_CAPACITOR_XCODE.md.`)
    }
  }

  return {
    plugins: [react()],
    define: {
      __WC_FAMILY_BUILD__: JSON.stringify(isFamilyBuild),
      // Nur im nativen Test-Build gesetzt (Allowlist = Testprojekt); sonst leer
      __WC_NATIVE_TEST_REF__: JSON.stringify(isNativeTestBuild ? NATIVE_TEST_PROJECT_REF : ''),
    },
  }
})
