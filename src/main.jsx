import React from 'react'
import ReactDOM from 'react-dom/client'
import { BACKEND_MODES, resolveBackendMode, getFamilyConfig, runtimeEnv } from './config/backend.js'
import './assets/fonts/fonts.css' // Schrift lokal (Phase 6B1, keine Google-Fonts-Anfrage)

const root = ReactDOM.createRoot(document.getElementById('root'))
const render = (el) => root.render(<React.StrictMode>{el}</React.StrictMode>)

function ConfigError({ message }) {
  return (
    <div role="alert" style={{ minHeight: '100vh', background: '#1e1b4b', color: '#fff', fontFamily: 'system-ui,sans-serif', padding: 'calc(env(safe-area-inset-top,0px) + 32px) 20px 32px', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 44 }}>⚙️</div>
      <h1 style={{ fontSize: 20, margin: '12px 0 8px' }}>Konfigurationsfehler</h1>
      <p style={{ color: '#fca5a5', fontSize: 15, lineHeight: 1.5, wordBreak: 'break-word' }}>{message}</p>
      <p style={{ color: '#a5b4fc', fontSize: 13 }}>Siehe .env.example und docs/appstore/PHASE_04A_AUTH.md.</p>
    </div>
  )
}

// Backend-Modus ausschließlich aus der Konfiguration (Standard: legacy).
// Die jeweils andere App wird nicht geladen (dynamischer Import).
try {
  const mode = resolveBackendMode(runtimeEnv)
  // __WC_FAMILY_BUILD__ wird in vite.config.js aus demselben Wert gesetzt. Da der Zweig
  // nur von dieser Build-Konstante abhängt, entfernt Vite den jeweils anderen App-Code.
  if (__WC_FAMILY_BUILD__) {
    if (mode !== BACKEND_MODES.FAMILY) throw new Error('Build- und Laufzeitkonfiguration passen nicht zusammen (FAMILY-Build).')
    getFamilyConfig(runtimeEnv) // wirft bei fehlender/unzulässiger FAMILY-Konfiguration
    import('./family/FamilyApp.jsx').then((m) => render(<m.default />))
  } else {
    if (mode === BACKEND_MODES.FAMILY) throw new Error('Build- und Laufzeitkonfiguration passen nicht zusammen (LEGACY-Build).')
    import('./App.jsx').then((m) => render(<m.default />))
  }
} catch (e) {
  console.error('[config]', e.message)
  render(<ConfigError message={e.message} />)
}
