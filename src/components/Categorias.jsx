/**
 * Categorías de la biblioteca (formato de la app FCB): grupos de selección única
 * o múltiple con sus etiquetas. Las etiquetas se asignan a los ejercicios, sirven
 * de filtro en la biblioteca y se pueden usar como contenidos en el Timeline.
 *   - useCategorias()        → { grupos, etiquetas, recargar }
 *   - <CategoriasEditor />   → gestión de grupos y etiquetas
 *   - <SelectorEtiquetas />  → elegir etiquetas (ficha del ejercicio, filtros)
 *   - <ChipEtiqueta />
 */
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useCategorias() {
  const [grupos, setGrupos] = useState([])
  const [etiquetas, setEtiquetas] = useState([])
  const [cargado, setCargado] = useState(false)
  const recargar = useCallback(async () => {
    const [g, e] = await Promise.all([
      supabase.from('categoria_grupos').select('*').order('orden').order('created_at'),
      supabase.from('categoria_etiquetas').select('*').order('orden').order('created_at'),
    ])
    setGrupos(g.data || []); setEtiquetas(e.data || []); setCargado(true)
  }, [])
  useEffect(() => { recargar() }, [recargar])
  return { grupos, etiquetas, recargar, cargado }
}

export function ChipEtiqueta({ etiqueta, activa = true, peque, onClick, onQuitar }) {
  const c = etiqueta.color || '#6b7280'
  return (
    <span onClick={onClick} title={etiqueta.nombre}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: peque ? 10 : 11, fontWeight: 700, lineHeight: 1.35, padding: peque ? '1px 6px' : '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
        background: activa ? c + '1f' : 'transparent', color: activa ? c : 'var(--text3)', border: `1px solid ${activa ? c + '66' : 'var(--border)'}`, cursor: onClick ? 'pointer' : 'default' }}>
      {etiqueta.nombre}
      {onQuitar && <span onClick={e => { e.stopPropagation(); onQuitar() }} style={{ cursor: 'pointer', opacity: .7 }}>×</span>}
    </span>
  )
}

/** Selector de etiquetas por grupos. En los grupos de selección única solo queda una marcada. */
export function SelectorEtiquetas({ grupos, etiquetas, value = [], onChange, compacto }) {
  const toggle = (g, et) => {
    const sel = new Set(value)
    if (sel.has(et.id)) sel.delete(et.id)
    else {
      if (g.seleccion === 'unica') etiquetas.filter(x => x.grupo_id === g.id).forEach(x => sel.delete(x.id))
      sel.add(et.id)
    }
    onChange([...sel])
  }
  if (!grupos.length) return <div style={{ fontSize: 12, color: 'var(--text3)' }}>Aún no hay categorías. Créalas en Biblioteca → Categorías.</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compacto ? 8 : 10 }}>
      {grupos.map(g => {
        const ets = etiquetas.filter(e => e.grupo_id === g.id)
        if (!ets.length) return null
        return (
          <div key={g.id}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text2)', marginBottom: 5 }}>
              {g.nombre} <span style={{ fontWeight: 500, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>{g.seleccion === 'unica' ? 'una' : 'varias'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {ets.map(et => <ChipEtiqueta key={et.id} etiqueta={et} activa={value.includes(et.id)} peque={compacto} onClick={() => toggle(g, et)} />)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const btnIco = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text2)', padding: '2px 4px', lineHeight: 1 }

export default function CategoriasEditor() {
  const { grupos, etiquetas, recargar, cargado } = useCategorias()
  const [usos, setUsos] = useState({})
  const [nuevoGrupo, setNuevoGrupo] = useState('')
  const [nuevas, setNuevas] = useState({})
  const [editando, setEditando] = useState(null) // { tipo, id, valor }

  const cargarUsos = useCallback(async () => {
    const { data } = await supabase.from('ejercicio_etiquetas').select('etiqueta_id')
    const m = {}; (data || []).forEach(r => { m[r.etiqueta_id] = (m[r.etiqueta_id] || 0) + 1 }); setUsos(m)
  }, [])
  useEffect(() => { cargarUsos() }, [cargarUsos])

  async function crearGrupo() {
    const n = nuevoGrupo.trim(); if (!n) return
    await supabase.from('categoria_grupos').insert({ nombre: n, seleccion: 'multiple', orden: grupos.length })
    setNuevoGrupo(''); recargar()
  }
  async function actualizarGrupo(id, campos) { await supabase.from('categoria_grupos').update(campos).eq('id', id); recargar() }
  async function borrarGrupo(g) {
    const n = etiquetas.filter(e => e.grupo_id === g.id).length
    if (!window.confirm(`¿Eliminar el grupo "${g.nombre}"${n ? ` y sus ${n} etiquetas` : ''}? Se quitarán de los ejercicios que las tengan.`)) return
    await supabase.from('categoria_grupos').delete().eq('id', g.id); recargar(); cargarUsos()
  }
  async function moverGrupo(i, dir) {
    const j = i + dir; if (j < 0 || j >= grupos.length) return
    const a = grupos[i], b = grupos[j]
    await Promise.all([supabase.from('categoria_grupos').update({ orden: j }).eq('id', a.id), supabase.from('categoria_grupos').update({ orden: i }).eq('id', b.id)])
    recargar()
  }
  async function crearEtiqueta(g) {
    const n = (nuevas[g.id] || '').trim(); if (!n) return
    const ets = etiquetas.filter(e => e.grupo_id === g.id)
    const color = ets[ets.length - 1]?.color || '#2f6fdb'
    await supabase.from('categoria_etiquetas').insert({ grupo_id: g.id, nombre: n, color, orden: ets.length })
    setNuevas(x => ({ ...x, [g.id]: '' })); recargar()
  }
  async function actualizarEtiqueta(id, campos) { await supabase.from('categoria_etiquetas').update(campos).eq('id', id); recargar() }
  async function borrarEtiqueta(et) {
    const n = usos[et.id] || 0
    if (!window.confirm(`¿Eliminar la etiqueta "${et.nombre}"?${n ? ` Se quitará de ${n} ejercicio${n === 1 ? '' : 's'}.` : ''}`)) return
    await supabase.from('categoria_etiquetas').delete().eq('id', et.id); recargar(); cargarUsos()
  }
  async function moverEtiqueta(ets, i, dir) {
    const j = i + dir; if (j < 0 || j >= ets.length) return
    const lista = [...ets];[lista[i], lista[j]] = [lista[j], lista[i]]
    await Promise.all(lista.map((e, k) => supabase.from('categoria_etiquetas').update({ orden: k }).eq('id', e.id)))
    recargar()
  }
  const guardarEdicion = async () => {
    if (!editando) return
    const v = editando.valor.trim()
    if (v) editando.tipo === 'grupo' ? await actualizarGrupo(editando.id, { nombre: v }) : await actualizarEtiqueta(editando.id, { nombre: v })
    setEditando(null)
  }
  const inputEd = (
    <input autoFocus value={editando?.valor || ''} onChange={e => setEditando(x => ({ ...x, valor: e.target.value }))}
      onBlur={guardarEdicion} onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }}
      style={{ fontSize: 12.5, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--accent)', fontFamily: 'inherit', minWidth: 0, flex: 1 }} />
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>Categorías</div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>Grupos de categorías y sus etiquetas</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5, maxWidth: 760 }}>
            Las etiquetas se asignan en la ficha de cada ejercicio, sirven de filtro en la biblioteca y se pueden usar como contenidos en el Timeline de la planificación. En un grupo de selección <b>única</b>, cada ejercicio lleva como mucho una etiqueta del grupo.
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 300 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text3)' }}>Nuevo grupo</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" value={nuevoGrupo} onChange={e => setNuevoGrupo(e.target.value)} onKeyDown={e => e.key === 'Enter' && crearGrupo()} placeholder="p. ej. Material, Nivel…" />
            <button className="btn btn-primary" onClick={crearGrupo} disabled={!nuevoGrupo.trim()} style={{ whiteSpace: 'nowrap' }}>+ Crear grupo</button>
          </div>
        </div>
      </div>

      {!cargado ? <div className="empty"><p>Cargando…</p></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {grupos.map((g, gi) => {
            const ets = etiquetas.filter(e => e.grupo_id === g.id)
            return (
              <div key={g.id} className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  {editando?.tipo === 'grupo' && editando.id === g.id ? inputEd
                    : <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nombre}</div>}
                  <div style={{ display: 'flex', borderRadius: 7, border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                    {[['unica', 'Única'], ['multiple', 'Múltiple']].map(([v, l]) => (
                      <button key={v} onClick={() => g.seleccion !== v && actualizarGrupo(g.id, { seleccion: v })}
                        style={{ fontSize: 10.5, fontWeight: 600, padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: g.seleccion === v ? 'var(--accent)' : 'transparent', color: g.seleccion === v ? '#fff' : 'var(--text2)' }}>{l}</button>
                    ))}
                  </div>
                  <button style={btnIco} title="Renombrar" onClick={() => setEditando({ tipo: 'grupo', id: g.id, valor: g.nombre })}>✎</button>
                  <button style={{ ...btnIco, opacity: gi ? 1 : .3 }} title="Subir" onClick={() => moverGrupo(gi, -1)}>↑</button>
                  <button style={{ ...btnIco, opacity: gi < grupos.length - 1 ? 1 : .3 }} title="Bajar" onClick={() => moverGrupo(gi, 1)}>↓</button>
                  <button style={{ ...btnIco, color: '#dc2626' }} title="Eliminar grupo" onClick={() => borrarGrupo(g)}>🗑</button>
                </div>
                {ets.map((et, i) => (
                  <div key={et.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <label title="Cambiar color" style={{ width: 18, height: 18, borderRadius: 4, background: et.color, border: '1px solid rgba(0,0,0,.15)', cursor: 'pointer', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
                      <input type="color" value={et.color} onChange={e => actualizarEtiqueta(et.id, { color: e.target.value })} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </label>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                      {editando?.tipo === 'etiqueta' && editando.id === et.id ? inputEd
                        : <span onDoubleClick={() => setEditando({ tipo: 'etiqueta', id: et.id, valor: et.nombre })} title="Doble clic para renombrar"><ChipEtiqueta etiqueta={et} /></span>}
                    </div>
                    <span style={{ fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 16, textAlign: 'right' }} title="Ejercicios con esta etiqueta">{usos[et.id] || 0}</span>
                    <button style={{ ...btnIco, opacity: i ? 1 : .3 }} onClick={() => moverEtiqueta(ets, i, -1)}>↑</button>
                    <button style={{ ...btnIco, opacity: i < ets.length - 1 ? 1 : .3 }} onClick={() => moverEtiqueta(ets, i, 1)}>↓</button>
                    <button style={{ ...btnIco, color: '#dc2626' }} title="Eliminar etiqueta" onClick={() => borrarEtiqueta(et)}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input className="form-input" style={{ fontSize: 12.5 }} value={nuevas[g.id] || ''} onChange={e => setNuevas(x => ({ ...x, [g.id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && crearEtiqueta(g)} placeholder="Nueva etiqueta" />
                  <button className="btn btn-ghost" onClick={() => crearEtiqueta(g)} disabled={!(nuevas[g.id] || '').trim()} style={{ whiteSpace: 'nowrap', border: '1px solid var(--border)' }}>+ Añadir</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
