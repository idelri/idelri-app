/**
 * RecursosEntrenadora — pestaña "Recursos" de Planificación.
 *
 * Los recursos son sesiones sin fecha que el cliente tiene siempre a mano en
 * su portal (pestaña Recursos): activaciones, movilidad y protocolos
 * individuales. Se guardan en `sesiones` con la columna `recurso` rellena.
 *
 * Desde aquí se crean (y se abren en el editor de sesiones), se ocultan o se
 * muestran al cliente y se eliminan.
 */
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export const CATEGORIAS_RECURSO = [
  { key: 'activacion', label: 'Activaciones', icono: '⚡', color: '#E29A2E', ejemplo: 'Activación pre-partido' },
  { key: 'movilidad',  label: 'Movilidad',    icono: '🤸', color: '#2FAE76', ejemplo: 'Movilidad y estiramientos' },
  { key: 'protocolo',  label: 'Protocolos',   icono: '🩹', color: '#E24B4A', ejemplo: 'Protocolo individual · Tobillo' },
]

export default function RecursosEntrenadora({ clienteId, sesiones, setSesiones, onAbrir, onEliminar }) {
  const [creando, setCreando] = useState(null)   // key de categoría
  const [titulo, setTitulo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const recursos = sesiones.filter(s => s.recurso)

  async function crear(cat) {
    const t = titulo.trim()
    if (!t) return
    setGuardando(true)
    const orden = recursos.length
    const { data, error } = await supabase.from('sesiones').insert({
      cliente_id: clienteId, titulo: t, fecha: null, recurso: cat.key, icono: cat.icono,
      tipo_sesion: 'flexible', tipo_editor: 'fuerza', estado: 'pendiente',
      lista: false, publicada: true, con_feedback: false, modalidad: 'autonoma', orden,
    }).select().single()
    setGuardando(false)
    if (error) { alert('No se pudo crear el recurso: ' + error.message); return }
    setSesiones(xs => [...xs, data])
    setCreando(null); setTitulo('')
    onAbrir(data)
  }

  async function cambiarVisible(s) {
    const publicada = s.publicada === false
    setSesiones(xs => xs.map(x => x.id === s.id ? { ...x, publicada } : x))
    const { error } = await supabase.from('sesiones').update({ publicada }).eq('id', s.id)
    if (error) {
      alert('No se pudo guardar: ' + error.message)
      setSesiones(xs => xs.map(x => x.id === s.id ? { ...x, publicada: !publicada } : x))
    }
  }

  async function cambiarCategoria(s, key) {
    const cat = CATEGORIAS_RECURSO.find(c => c.key === key)
    const icono = CATEGORIAS_RECURSO.some(c => c.icono === s.icono) || !s.icono ? cat.icono : s.icono
    setSesiones(xs => xs.map(x => x.id === s.id ? { ...x, recurso: key, icono } : x))
    const { error } = await supabase.from('sesiones').update({ recurso: key, icono }).eq('id', s.id)
    if (error) alert('No se pudo guardar: ' + error.message)
  }

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
        Sesiones sin fecha que el cliente tiene siempre a mano en la pestaña <strong>Recursos</strong> de su portal.
        Para protocolos individuales de un jugador, créalo como cliente propio y añade aquí su protocolo.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
        {CATEGORIAS_RECURSO.map(cat => {
          const lista = recursos.filter(s => s.recurso === cat.key)
          return (
            <div key={cat.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--border)', borderTop: `3px solid ${cat.color}` }}>
                <span style={{ fontSize: 18 }}>{cat.icono}</span>
                <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{cat.label}</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{lista.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {lista.length === 0 && creando !== cat.key && (
                  <div style={{ padding: '14px', fontSize: 12, color: 'var(--text3)' }}>Todavía no hay ninguna.</div>
                )}
                {lista.map(s => {
                  const oculta = s.publicada === false
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', opacity: oculta ? 0.6 : 1 }}>
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icono || cat.icono}</span>
                      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onAbrir(s)} title="Abrir en el editor">
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{s.titulo}</div>
                        {s.objetivo && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2, lineHeight: 1.35 }}>{s.objetivo}</div>}
                        {oculta && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>🔒 Oculta al cliente</div>}
                      </div>
                      <select value={s.recurso} onChange={e => cambiarCategoria(s, e.target.value)} title="Mover a otra categoría"
                        style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text2)', padding: '2px 4px', maxWidth: 92 }}>
                        {CATEGORIAS_RECURSO.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" title={oculta ? 'Mostrar al cliente' : 'Ocultar al cliente'} onClick={() => cambiarVisible(s)} style={{ padding: '2px 6px' }}>
                        {oculta ? '🔒' : '👁'}
                      </button>
                      <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => onEliminar(s)} style={{ padding: '2px 6px', color: 'var(--text3)' }}>×</button>
                    </div>
                  )
                })}
                {creando === cat.key ? (
                  <form onSubmit={e => { e.preventDefault(); crear(cat) }} style={{ display: 'flex', gap: 6, padding: '10px 14px' }}>
                    <input className="form-input" autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={cat.ejemplo} style={{ flex: 1, fontSize: 12.5 }} />
                    <button className="btn btn-primary btn-sm" type="submit" disabled={guardando || !titulo.trim()}>{guardando ? '…' : 'Crear'}</button>
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setCreando(null); setTitulo('') }}>✕</button>
                  </form>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => { setCreando(cat.key); setTitulo('') }}
                    style={{ margin: '8px 10px', alignSelf: 'flex-start' }}>
                    + Añadir {cat.key === 'activacion' ? 'activación' : cat.key === 'movilidad' ? 'movilidad' : 'protocolo'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
