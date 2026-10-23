import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Apartados visibles del portal y lo que el cliente puede hacer en él.
// Una clave que no existe vale true (así los clientes antiguos no cambian).
const VISTAS = [
  { key: 'mostrar_semana',     label: 'Esta semana' },
  { key: 'mostrar_calendario', label: 'Calendario' },
  { key: 'mostrar_plan',       label: 'Mi plan' },
  { key: 'mostrar_recursos',   label: 'Recursos (si tiene)' },
]
const PERMISOS = [
  { key: 'registrar_manual', label: 'Registrar sesiones manuales', ayuda: 'El cliente puede añadir sesiones que hace por su cuenta.' },
  { key: 'feedback',         label: 'Feedback de las sesiones',    ayuda: 'El cliente puede marcar sesiones como hechas y contarte cómo le fueron.' },
  { key: 'strava',           label: 'Conectar Strava',             ayuda: 'El cliente ve la opción de conectar su cuenta de Strava.' },
]
const CLAVES = [...VISTAS, ...PERMISOS].map(o => o.key)

function normalizar(config) {
  const out = {}
  CLAVES.forEach(k => { out[k] = config?.[k] ?? true })
  return out
}

export default function PortalClienteModal({ cliente, abierto, onCerrar, onGuardado }) {
  const [config, setConfig] = useState(() => normalizar(cliente?.portal_config))
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  if (!abierto || !cliente) return null

  const url = `${window.location.origin}/cliente/${cliente.token_cliente}`
  const activos = VISTAS.filter(o => config[o.key]).length

  function toggle(key) {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }))
    setMensaje('')
  }

  async function guardar() {
    if (activos === 0) {
      setMensaje('Debe haber al menos un apartado visible.')
      return false
    }
    setGuardando(true)
    const nuevo = { ...(cliente.portal_config || {}), ...config }
    const { error } = await supabase.from('clientes').update({ portal_config: nuevo }).eq('id', cliente.id)
    setGuardando(false)
    if (error) {
      setMensaje('Error al guardar. Inténtalo de nuevo.')
      return false
    }
    if (onGuardado) onGuardado(nuevo)
    return true
  }

  function copiarEnlace() {
    navigator.clipboard.writeText(url).catch(() => {})
    setMensaje('Enlace copiado.')
  }

  async function handleGuardar() {
    const ok = await guardar()
    if (ok) setMensaje('Configuración guardada.')
  }

  async function handleGuardarYCopiar() {
    const ok = await guardar()
    if (ok) {
      navigator.clipboard.writeText(url).catch(() => {})
      setMensaje('Guardado. Enlace copiado.')
      setTimeout(() => onCerrar(), 1200)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className="card" style={{ width: '100%', maxWidth: 420, padding: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px' }}>Configurar portal</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 20px' }}>{cliente.nombre}</p>

        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', margin: '0 0 10px' }}>Contenido visible</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {VISTAS.map(({ key, label }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={config[key]} onChange={() => toggle(key)}
                style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              {label}
            </label>
          ))}
        </div>

        <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', margin: '0 0 10px' }}>El cliente puede</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {PERMISOS.map(({ key, label, ayuda }) => (
            <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={config[key]} onChange={() => toggle(key)}
                style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
              <span>
                {label}
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{ayuda}</span>
              </span>
            </label>
          ))}
        </div>

        {activos === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 12 }}>
            Debe haber al menos un apartado visible.
          </p>
        )}

        {mensaje && (
          <p style={{ fontSize: 12.5, color: mensaje.startsWith('Error') ? 'var(--danger)' : 'var(--accent)', marginBottom: 12 }}>
            {mensaje}
          </p>
        )}

        <div style={{ fontSize: 11.5, color: 'var(--text3)', background: 'var(--bg2)', borderRadius: 6, padding: '7px 10px', marginBottom: 20, wordBreak: 'break-all' }}>
          {url}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn-ghost btn-sm" onClick={copiarEnlace}>🔗 Copiar enlace</button>
          <button className="btn btn-secondary btn-sm" onClick={handleGuardar}
            disabled={guardando || activos === 0}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleGuardarYCopiar}
            disabled={guardando || activos === 0}>
            {guardando ? 'Guardando...' : 'Guardar y copiar'}
          </button>
        </div>
      </div>
    </div>
  )
}
