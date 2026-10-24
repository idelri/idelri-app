/**
 * RecursosEntrenadora — pestaña "Recursos" de Planificación.
 *
 * Los recursos son sesiones sin fecha que el cliente tiene siempre a mano en
 * su portal (pestaña Recursos). Cada cliente tiene sus propios grupos
 * (tabla recurso_grupos: nombre, icono, color y descripción a elección de la
 * entrenadora). Un recurso es una sesión con `recurso` relleno y
 * `recurso_grupo_id` apuntando a su grupo.
 *
 * Desde aquí se crean, editan, ordenan y eliminan los grupos, y dentro de
 * cada grupo se añaden recursos (que se abren en el editor de sesiones), se
 * ocultan o muestran al cliente, se mueven de grupo y se eliminan.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Categorías antiguas (fijas). Se mantienen solo para leer recursos que aún
// no tengan grupo.
export const CATEGORIAS_RECURSO = [
  { key: 'activacion', label: 'Activaciones', icono: '⚡', color: '#E29A2E' },
  { key: 'movilidad',  label: 'Movilidad',    icono: '🤸', color: '#2FAE76' },
  { key: 'protocolo',  label: 'Protocolos',   icono: '🩹', color: '#E24B4A' },
  { key: 'compensatoria', label: 'Sesiones compensatorias', icono: '🔄', color: '#7C5CD6' },
]

export const ICONOS_GRUPO = ['⚡', '🔥', '🤸', '🧘', '🩹', '🦵', '🏃', '⚽', '🏋️', '💪', '🔄', '🛌', '❄️', '🫁', '❤️', '🧠', '🎯', '📋', '📹', '🍎', '💧', '⏱', '🚴', '🏊']
const COLORES_GRUPO = ['#E29A2E', '#2FAE76', '#E24B4A', '#7C5CD6', '#4C82E8', '#34AEB8', '#DD6F97', '#6b7280']

function FormGrupo({ inicial, onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(inicial?.nombre || '')
  const [icono, setIcono] = useState(inicial?.icono || '📋')
  const [color, setColor] = useState(inicial?.color || COLORES_GRUPO[4])
  const [descripcion, setDescripcion] = useState(inicial?.descripcion || '')
  return (
    <form onSubmit={e => { e.preventDefault(); if (nombre.trim()) onGuardar({ nombre: nombre.trim(), icono: icono.trim() || '📋', color, descripcion: descripcion.trim() || null }) }}
      style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={icono} onChange={e => setIcono(e.target.value)} title="Icono (puedes pegar cualquier emoji)" maxLength={4}
          className="form-input" style={{ width: 46, textAlign: 'center', fontSize: 18, padding: '4px' }} />
        <input className="form-input" autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del grupo (p. ej. Activaciones)" style={{ flex: 1, fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {ICONOS_GRUPO.map(i => (
          <button key={i} type="button" onClick={() => setIcono(i)}
            style={{ width: 28, height: 28, fontSize: 15, borderRadius: 6, cursor: 'pointer', border: `1px solid ${icono === i ? 'var(--accent)' : 'var(--border)'}`, background: icono === i ? 'var(--accent-light)' : 'transparent' }}>{i}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {COLORES_GRUPO.map(c => (
          <button key={c} type="button" onClick={() => setColor(c)} title={c}
            style={{ width: 22, height: 22, borderRadius: 6, background: c, cursor: 'pointer', border: color === c ? '2px solid var(--text)' : '1px solid var(--border)' }} />
        ))}
      </div>
      <textarea className="form-input" value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
        placeholder="Explicación para el cliente (opcional)" style={{ fontSize: 12, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!nombre.trim()}>Guardar</button>
      </div>
    </form>
  )
}

export default function RecursosEntrenadora({ clienteId, sesiones, setSesiones, onAbrir, onEliminar }) {
  const [grupos, setGrupos] = useState(null)
  const [creando, setCreando] = useState(null)       // id del grupo donde se añade un recurso
  const [titulo, setTitulo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState(null)     // id del grupo en edición | 'nuevo'

  useEffect(() => {
    let vivo = true
    supabase.from('recurso_grupos').select('*').eq('cliente_id', clienteId).order('orden').order('created_at')
      .then(({ data }) => { if (vivo) setGrupos(data || []) })
    return () => { vivo = false }
  }, [clienteId])

  const recursos = sesiones.filter(s => s.recurso)
  const sinGrupo = recursos.filter(s => !s.recurso_grupo_id || !(grupos || []).some(g => g.id === s.recurso_grupo_id))

  async function crearGrupo(campos) {
    const { data, error } = await supabase.from('recurso_grupos').insert({ ...campos, cliente_id: clienteId, orden: (grupos || []).length }).select().single()
    if (error) { alert('No se pudo crear el grupo: ' + error.message); return }
    setGrupos(gs => [...gs, data]); setEditando(null)
  }
  async function guardarGrupo(id, campos) {
    setGrupos(gs => gs.map(g => g.id === id ? { ...g, ...campos } : g)); setEditando(null)
    const { error } = await supabase.from('recurso_grupos').update(campos).eq('id', id)
    if (error) alert('No se pudo guardar el grupo: ' + error.message)
  }
  async function eliminarGrupo(g) {
    const n = recursos.filter(s => s.recurso_grupo_id === g.id).length
    if (!window.confirm(n ? `El grupo "${g.nombre}" tiene ${n} recurso(s). Se quedarán sin grupo (no se borran). ¿Eliminar el grupo?` : `¿Eliminar el grupo "${g.nombre}"?`)) return
    setGrupos(gs => gs.filter(x => x.id !== g.id))
    setSesiones(xs => xs.map(x => x.recurso_grupo_id === g.id ? { ...x, recurso_grupo_id: null } : x))
    const { error } = await supabase.from('recurso_grupos').delete().eq('id', g.id)
    if (error) alert('No se pudo eliminar: ' + error.message)
  }
  async function moverGrupo(i, dir) {
    const j = i + dir; if (j < 0 || j >= grupos.length) return
    const n = [...grupos];[n[i], n[j]] = [n[j], n[i]]
    const renum = n.map((g, k) => ({ ...g, orden: k }))
    setGrupos(renum)
    await Promise.all([renum[i], renum[j]].map(g => supabase.from('recurso_grupos').update({ orden: g.orden }).eq('id', g.id)))
  }

  async function crearRecurso(g) {
    const t = titulo.trim()
    if (!t) return
    setGuardando(true)
    const { data, error } = await supabase.from('sesiones').insert({
      cliente_id: clienteId, titulo: t, fecha: null, recurso: 'grupo', recurso_grupo_id: g.id, icono: g.icono,
      tipo_sesion: 'flexible', tipo_editor: 'fuerza', estado: 'pendiente',
      lista: false, publicada: true, con_feedback: false, modalidad: 'autonoma', orden: recursos.length,
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

  async function cambiarGrupo(s, grupoId) {
    const g = grupos.find(x => x.id === grupoId)
    // Si el icono era el del grupo anterior, pasa a ser el del nuevo
    const anterior = grupos.find(x => x.id === s.recurso_grupo_id)
    const icono = !s.icono || s.icono === anterior?.icono ? g.icono : s.icono
    setSesiones(xs => xs.map(x => x.id === s.id ? { ...x, recurso_grupo_id: grupoId, icono } : x))
    const { error } = await supabase.from('sesiones').update({ recurso_grupo_id: grupoId, icono }).eq('id', s.id)
    if (error) alert('No se pudo guardar: ' + error.message)
  }

  function filaRecurso(s, g) {
    const oculta = s.publicada === false
    return (
      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border)', opacity: oculta ? 0.6 : 1 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{s.icono || g?.icono || '📋'}</span>
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onAbrir(s)} title="Abrir en el editor">
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{s.titulo}</div>
          {s.objetivo && <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2, lineHeight: 1.35 }}>{s.objetivo}</div>}
          {oculta && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 2 }}>🔒 Oculta al cliente</div>}
        </div>
        {grupos.length > 1 && (
          <select value={s.recurso_grupo_id || ''} onChange={e => cambiarGrupo(s, e.target.value)} title="Mover a otro grupo"
            style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text2)', padding: '2px 4px', maxWidth: 92 }}>
            {!s.recurso_grupo_id && <option value="">Sin grupo</option>}
            {grupos.map(x => <option key={x.id} value={x.id}>{x.icono} {x.nombre}</option>)}
          </select>
        )}
        <button className="btn btn-ghost btn-sm" title={oculta ? 'Mostrar al cliente' : 'Ocultar al cliente'} onClick={() => cambiarVisible(s)} style={{ padding: '2px 6px' }}>
          {oculta ? '🔒' : '👁'}
        </button>
        <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={() => onEliminar(s)} style={{ padding: '2px 6px', color: 'var(--text3)' }}>×</button>
      </div>
    )
  }

  if (grupos === null) return <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Cargando recursos…</div>

  return (
    <div>
      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 16, lineHeight: 1.5 }}>
        Sesiones sin fecha que el cliente tiene siempre a mano en la pestaña <strong>Recursos</strong> de su portal.
        Organízalas en los grupos que quieras, con el nombre y el icono que elijas.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, alignItems: 'start' }}>
        {grupos.map((g, i) => {
          const lista = recursos.filter(s => s.recurso_grupo_id === g.id)
          const color = g.color || '#4C82E8'
          return (
            <div key={g.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {editando === g.id ? (
                <div style={{ borderTop: `3px solid ${color}` }}>
                  <FormGrupo inicial={g} onGuardar={c => guardarGrupo(g.id, c)} onCancelar={() => setEditando(null)} />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 10px 10px 14px', borderBottom: '1px solid var(--border)', borderTop: `3px solid ${color}` }}>
                    <span style={{ fontSize: 18 }}>{g.icono || '📋'}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{g.nombre}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginRight: 2 }}>{lista.length}</span>
                    <button className="btn btn-ghost btn-sm" title="Mover a la izquierda" onClick={() => moverGrupo(i, -1)} disabled={i === 0} style={{ padding: '2px 5px', opacity: i === 0 ? .25 : .6 }}>←</button>
                    <button className="btn btn-ghost btn-sm" title="Mover a la derecha" onClick={() => moverGrupo(i, 1)} disabled={i === grupos.length - 1} style={{ padding: '2px 5px', opacity: i === grupos.length - 1 ? .25 : .6 }}>→</button>
                    <button className="btn btn-ghost btn-sm" title="Editar nombre, icono y color" onClick={() => setEditando(g.id)} style={{ padding: '2px 6px', opacity: .7 }}>✎</button>
                    <button className="btn btn-ghost btn-sm" title="Eliminar grupo" onClick={() => eliminarGrupo(g)} style={{ padding: '2px 6px', color: 'var(--text3)' }}>×</button>
                  </div>
                  {g.descripcion && (
                    <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text3)', borderBottom: '1px solid var(--border)', lineHeight: 1.4 }}>{g.descripcion}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {lista.length === 0 && creando !== g.id && (
                      <div style={{ padding: '14px', fontSize: 12, color: 'var(--text3)' }}>Todavía no hay ninguno.</div>
                    )}
                    {lista.map(s => filaRecurso(s, g))}
                    {creando === g.id ? (
                      <form onSubmit={e => { e.preventDefault(); crearRecurso(g) }} style={{ display: 'flex', gap: 6, padding: '10px 14px' }}>
                        <input className="form-input" autoFocus value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nombre del recurso" style={{ flex: 1, fontSize: 12.5 }} />
                        <button className="btn btn-primary btn-sm" type="submit" disabled={guardando || !titulo.trim()}>{guardando ? '…' : 'Crear'}</button>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setCreando(null); setTitulo('') }}>✕</button>
                      </form>
                    ) : (
                      <button className="btn btn-ghost btn-sm" onClick={() => { setCreando(g.id); setTitulo('') }}
                        style={{ margin: '8px 10px', alignSelf: 'flex-start' }}>
                        + Añadir
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}

        {sinGrupo.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', borderTop: '3px solid var(--border)', fontSize: 14, fontWeight: 600 }}>Sin grupo</div>
            {sinGrupo.map(s => filaRecurso(s, null))}
          </div>
        )}

        <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1.5px dashed var(--border)', background: 'transparent', boxShadow: 'none' }}>
          {editando === 'nuevo'
            ? <FormGrupo onGuardar={crearGrupo} onCancelar={() => setEditando(null)} />
            : <button onClick={() => setEditando('nuevo')} style={{ width: '100%', padding: '22px 14px', border: 'none', background: 'transparent', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Nuevo grupo de recursos</button>}
        </div>
      </div>
    </div>
  )
}
