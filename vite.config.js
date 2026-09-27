import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveBackendMode, BACKEND_MODES } from './src/config/backend.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  // Build-Zeit-Schalter: Der nicht benötigte App-Zweig wird aus dem Bundle entfernt
  // (FAMILY-Builds enthalten so keinen Legacy-Code mit alten Standarddaten).
  // Ungültige Werte werden zur Laufzeit in main.jsx als Konfigurationsfehler angezeigt.
  let isFamilyBuild = false
  try { isFamilyBuild = resolveBackendMode(env) === BACKEND_MODES.FAMILY } catch { /* Fehleranzeige zur Laufzeit */ }
  return {
    plugins: [react()],
    define: { __WC_FAMILY_BUILD__: JSON.stringify(isFamilyBuild) },
  }
})
