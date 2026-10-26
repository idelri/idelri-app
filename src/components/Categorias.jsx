/**
 * Categorías de la biblioteca (formato de la app FCB): grupos generales (secciones)
 * → grupos de selección única o múltiple → etiquetas. Las etiquetas se asignan a los ejercicios, sirven
 * de filtro en la biblioteca y se pueden usar como contenidos en el Timeline.
 *   - useCategorias()        → { grupos, etiquetas, recargar }
 *   - <CategoriasEditor />   → gestión de grupos y etiquetas
 *   - <SelectorEtiquetas />  → elegir etiquetas (ficha del ejercicio, filtros)
 *   - <ChipEtiqueta />
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useCategorias() {
  const [grupos, setGrupos] = useState([])
  const [etiquetas, setEtiquetas] = useState([])
  const [secciones, setSecciones] = useState([])
  const [cargado, setCargado] = useState(false)
  const recargar = useCallback(async () => {
    const [s, g, e] = await Promise.all([
      supabase.from('categoria_secciones').select('*').order('orden').order('created_at'),
      supabase.from('categoria_grupos').select('*').order('orden').order('created_at'),
      supabase.from('categoria_etiquetas').select('*').order('orden').order('created_at'),
    ])
    const secs = s.data || []
    const pos = new Map(secs.map((x, i) => [x.id, i]))
    const gs = (g.data || []).map(x => ({ ...x, _seccion: secs.find(y => y.id === x.seccion_id) || null }))
      .sort((a, b) => (pos.has(a.seccion_id) ? pos.get(a.seccion_id) : 999) - (pos.has(b.seccion_id) ? pos.get(b.seccion_id) : 999) || (a.orden - b.orden))
    setSecciones(secs); setGrupos(gs); setEtiquetas(e.data || []); setCargado(true)
  }, [])
  useEffect(() => { recargar() }, [recargar])
  return { secciones, grupos, etiquetas, recargar, cargado }
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
      {grupos.map((g, gi) => {
        const ets = etiquetas.filter(e => e.grupo_id === g.id)
        if (!ets.length) return null
        const nuevaSec = g._seccion && grupos.slice(0, gi).filter(x => etiquetas.some(e => e.grupo_id === x.id)).slice(-1)[0]?.seccion_id !== g.seccion_id
        return (
          <div key={g.id}>
            {nuevaSec && (
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: g._seccion.color || 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: 3, margin: gi ? '6px 0 8px' : '0 0 8px' }}>{g._seccion.nombre}</div>
            )}
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

const btnIco = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text3)', padding: '1px 3px', lineHeight: 1, flexShrink: 0 }
const asa = { cursor: 'grab', color: 'var(--text3)', fontSize: 11, letterSpacing: -2, padding: '0 3px 0 0', userSelect: 'none', flexShrink: 0, lineHeight: 1 }
const PALETA = ['#2f6fdb', '#0f766e', '#4d7c0f', '#a16207', '#c2410c', '#b4234a', '#6d28d9', '#475569']

function Color({ value, onChange, size = 12, redondo }) {
  return (
    <label title="Cambiar color" style={{ width: size, height: size, borderRadius: redondo ? 99 : 3, background: value || '#94a3b8', cursor: 'pointer', flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
      <input type="color" value={value || '#94a3b8'} onChange={e => onChange(e.target.value)} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
    </label>
  )
}

function TextoEditable({ valor, editando, onEditar, onGuardar, onCancelar, estilo }) {
  const [v, setV] = useState(valor)
  useEffect(() => { if (editando) setV(valor) }, [editando, valor])
  if (!editando) return <span onDoubleClick={onEditar} title="Doble clic para renombrar" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...estilo }}>{valor}</span>
  const ok = () => { const t = v.trim(); t && t !== valor ? onGuardar(t) : onCancelar() }
  return <input autoFocus value={v} onChange={e => setV(e.target.value)} onBlur={ok} onKeyDown={e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') onCancelar() }}
    style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--accent)', fontFamily: 'inherit', ...estilo }} />
}

function NuevoInline({ texto, onCrear, peque }) {
  const [abierto, setAbierto] = useState(false)
  const [v, setV] = useState('')
  const ok = () => { const t = v.trim(); if (t) onCrear(t); setV(''); setAbierto(false) }
  if (!abierto) return <button onClick={() => setAbierto(true)} style={{ ...btnIco, fontSize: peque ? 11.5 : 12, fontWeight: 600, color: 'var(--text3)', padding: '3px 2px', textAlign: 'left' }}>+ {texto}</button>
  return <input autoFocus value={v} onChange={e => setV(e.target.value)} onBlur={ok} onKeyDown={e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { setV(''); setAbierto(false) } }}
    placeholder={texto} style={{ fontSize: 12, padding: '3px 7px', borderRadius: 5, border: '1px solid var(--accent)', fontFamily: 'inherit', width: '100%' }} />
}

const porOrden = xs => [...xs].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
// Inserta `item` en `lista` antes de `antesDeId` (o al final) y devuelve la nueva lista
const recolocar = (lista, item, antesDeId) => {
  const sin = lista.filter(x => x.id !== item.id)
  const i = antesDeId ? sin.findIndex(x => x.id === antesDeId) : -1
  if (i < 0) sin.push(item); else sin.splice(i, 0, item)
  return sin
}

export default function CategoriasEditor() {
  const [secciones, setSecciones] = useState([])
  const [grupos, setGrupos] = useState([])
  const [etiquetas, setEtiquetas] = useState([])
  const [cargado, setCargado] = useState(false)
  const [editando, setEditando] = useState(null) // 'tipo:id'
  const [drag, setDragS] = useState(null)   // { tipo, id }
  const dragRef = useRef(null)
  const setDrag = v => { dragRef.current = v; setDragS(v) }
  const [sobre, setSobre] = useState(null) // { tipo, id }  destino (antes de) — id null = al final del contenedor `cont`

  const cargar = useCallback(async () => {
    const [s, g, e] = await Promise.all([
      supabase.from('categoria_secciones').select('*').order('orden').order('created_at'),
      supabase.from('categoria_grupos').select('*').order('orden').order('created_at'),
      supabase.from('categoria_etiquetas').select('*').order('orden').order('created_at'),
    ])
    setSecciones(s.data || []); setGrupos(g.data || []); setEtiquetas(e.data || []); setCargado(true)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const tabla = { seccion: 'categoria_secciones', grupo: 'categoria_grupos', etiqueta: 'categoria_etiquetas' }
  async function actualizar(tipo, id, campos) {
    const set = { seccion: setSecciones, grupo: setGrupos, etiqueta: setEtiquetas }[tipo]
    set(xs => xs.map(x => x.id === id ? { ...x, ...campos } : x))
    const { error } = await supabase.from(tabla[tipo]).update(campos).eq('id', id)
    if (error) { alert('No se pudo guardar: ' + error.message); cargar() }
  }
  async function crear(tipo, fila) {
    const { error } = await supabase.from(tabla[tipo]).insert(fila)
    if (error) alert('No se pudo crear: ' + error.message)
    cargar()
  }
  async function borrar(tipo, x) {
    let msg = `¿Eliminar «${x.nombre}»?`
    if (tipo === 'seccion') { const n = grupos.filter(g => g.seccion_id === x.id).length; if (n) msg += ` Sus ${n} grupo${n === 1 ? '' : 's'} de categorías pasarán a «Sin grupo general».` }
    if (tipo === 'grupo') { const n = etiquetas.filter(e => e.grupo_id === x.id).length; if (n) msg += ` Se borrarán sus ${n} etiquetas y se quitarán de los ejercicios.` }
    if (tipo === 'etiqueta') msg += ' Se quitará de los ejercicios que la tengan.'
    if (!window.confirm(msg)) return
    await supabase.from(tabla[tipo]).delete().eq('id', x.id); cargar()
  }
  // Guarda el nuevo orden (y el contenedor si cambia)
  async function guardarOrden(tipo, lista, campoPadre, padreId) {
    await Promise.all(lista.map((x, i) => {
      const campos = { orden: i }; if (campoPadre) campos[campoPadre] = padreId
      return (x.orden !== i || (campoPadre && x[campoPadre] !== padreId)) ? supabase.from(tabla[tipo]).update(campos).eq('id', x.id) : null
    }))
  }
  async function soltar(destino) { // destino: { tipo, antesDe, padre }
    const d = dragRef.current; setDrag(null); setSobre(null)
    if (!d || d.tipo !== destino.tipo || d.id === destino.antesDe) return
    if (d.tipo === 'seccion') {
      const nueva = recolocar(porOrden(secciones), secciones.find(x => x.id === d.id), destino.antesDe)
      setSecciones(nueva.map((x, i) => ({ ...x, orden: i }))); await guardarOrden('seccion', nueva)
    } else if (d.tipo === 'grupo') {
      const it = { ...grupos.find(x => x.id === d.id), seccion_id: destino.padre }
      const hermanos = recolocar(porOrden(grupos.filter(x => x.seccion_id === destino.padre)), it, destino.antesDe)
      setGrupos(gs => gs.map(x => { const j = hermanos.findIndex(h => h.id === x.id); return j >= 0 ? { ...x, seccion_id: destino.padre, orden: j } : x }))
      await guardarOrden('grupo', hermanos.map(h => h.id === it.id ? grupos.find(x => x.id === d.id) : h), 'seccion_id', destino.padre)
    } else {
      const orig = etiquetas.find(x => x.id === d.id)
      const it = { ...orig, grupo_id: destino.padre }
      const hermanos = recolocar(porOrden(etiquetas.filter(x => x.grupo_id === destino.padre)), it, destino.antesDe)
      setEtiquetas(es => es.map(x => { const j = hermanos.findIndex(h => h.id === x.id); return j >= 0 ? { ...x, grupo_id: destino.padre, orden: j } : x }))
      await guardarOrden('etiqueta', hermanos.map(h => h.id === it.id ? orig : h), 'grupo_id', destino.padre)
    }
  }
  // Props de arrastre para un elemento (se suelta "antes de" él)
  const arrastrable = (tipo, x, padre) => ({
    draggable: editando !== `${tipo}:${x.id}`,
    onDragStart: e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', x.id) } catch {} ; setDrag({ tipo, id: x.id }) },
    onDragEnd: () => { setDrag(null); setSobre(null) },
    onDragOver: e => { if (dragRef.current?.tipo !== tipo) return; e.preventDefault(); e.stopPropagation(); if (sobre?.id !== x.id) setSobre({ tipo, id: x.id }) },
    onDrop: e => { if (dragRef.current?.tipo !== tipo) return; e.preventDefault(); e.stopPropagation(); soltar({ tipo, antesDe: x.id, padre }) },
  })
  // Zona "al final" de un contenedor
  const zonaFinal = (tipo, padre) => ({
    onDragOver: e => { if (dragRef.current?.tipo !== tipo) return; e.preventDefault(); if (sobre?.id !== 'fin:' + padre) setSobre({ tipo, id: 'fin:' + padre }) },
    onDrop: e => { if (dragRef.current?.tipo !== tipo) return; e.preventDefault(); soltar({ tipo, antesDe: null, padre }) },
  })
  const marca = (tipo, id, vertical = true) => sobre && drag && sobre.tipo === tipo && sobre.id === id && drag.id !== id
    ? (vertical ? { boxShadow: '0 -2px 0 0 var(--accent)' } : { boxShadow: '-3px 0 0 0 var(--accent)' }) : {}
  const ed = (tipo, x) => ({ editando: editando === `${tipo}:${x.id}`, onEditar: () => setEditando(`${tipo}:${x.id}`), onCancelar: () => setEditando(null), onGuardar: v => { setEditando(null); actualizar(tipo, x.id, { nombre: v }) } })

  const sinSeccion = grupos.filter(g => !g.seccion_id || !secciones.some(s => s.id === g.seccion_id))
  const columnas = [...porOrden(secciones).map(s => ({ s, gs: porOrden(grupos.filter(g => g.seccion_id === s.id)) })), ...(sinSeccion.length ? [{ s: null, gs: porOrden(sinSeccion) }] : [])]

  if (!cargado) return <div className="empty"><p>Cargando…</p></div>
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Categorías</div>
        <button className="btn btn-primary" onClick={() => crear('seccion', { nombre: 'Nuevo grupo general', color: PALETA[secciones.length % PALETA.length], orden: secciones.length })}>+ Grupo general</button>
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8 }}>
        {columnas.map(({ s, gs }) => (
          <div key={s?.id || 'sin'} {...(s ? arrastrable('seccion', s) : {})}
            style={{ flex: '0 0 270px', background: 'var(--bg2, #f6f7f5)', border: '1px solid var(--border)', borderRadius: 10, padding: 8, opacity: drag?.id === s?.id ? .4 : 1, ...(s ? marca('seccion', s.id, false) : {}) }}>
            {/* Cabecera del grupo general */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 2px 8px', borderBottom: `2px solid ${s?.color || 'var(--border)'}`, marginBottom: 8 }}>
              {s ? <>
                <span style={asa} title="Arrastra para reordenar">⋮⋮</span>
                <Color value={s.color} onChange={c => actualizar('seccion', s.id, { color: c })} size={12} redondo />
                <TextoEditable valor={s.nombre} {...ed('seccion', s)} estilo={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: s.color }} />
                <button style={btnIco} title="Renombrar" onClick={() => setEditando('seccion:' + s.id)}>✎</button>
                <button style={btnIco} title="Eliminar" onClick={() => borrar('seccion', s)}>🗑</button>
              </> : <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text3)' }}>Sin grupo general</span>}
            </div>

            {/* Grupos de categorías, uno encima de otro */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {gs.map(g => {
                const ets = porOrden(etiquetas.filter(e => e.grupo_id === g.id))
                return (
                  <div key={g.id} {...arrastrable('grupo', g, s?.id || null)}
                    style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', opacity: drag?.id === g.id ? .4 : 1, ...marca('grupo', g.id) }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={asa} title="Arrastra para reordenar o llevar a otro grupo general">⋮⋮</span>
                      <Color value={g.color || s?.color} onChange={c => actualizar('grupo', g.id, { color: c })} size={10} redondo />
                      <TextoEditable valor={g.nombre} {...ed('grupo', g)} estilo={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }} />
                      <button onClick={() => actualizar('grupo', g.id, { seleccion: g.seleccion === 'unica' ? 'multiple' : 'unica' })} title="Selección única: cada ejercicio lleva como mucho una etiqueta del grupo. Clic para cambiar."
                        style={{ ...btnIco, fontSize: 10, fontWeight: 600, border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px' }}>{g.seleccion === 'unica' ? 'una' : 'varias'}</button>
                      <button style={btnIco} title="Renombrar" onClick={() => setEditando('grupo:' + g.id)}>✎</button>
                      <button style={btnIco} title="Eliminar" onClick={() => borrar('grupo', g)}>🗑</button>
                    </div>
                    <div style={{ marginTop: 4, paddingLeft: 4 }}>
                      {ets.map(et => (
                        <div key={et.id} {...arrastrable('etiqueta', et, g.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', opacity: drag?.id === et.id ? .4 : 1, ...marca('etiqueta', et.id) }}>
                          <span style={{ ...asa, fontSize: 10 }}>⋮⋮</span>
                          <Color value={et.color} onChange={c => actualizar('etiqueta', et.id, { color: c })} size={10} />
                          <TextoEditable valor={et.nombre} {...ed('etiqueta', et)} estilo={{ fontSize: 12, color: 'var(--text2)' }} />
                          <button style={btnIco} title="Renombrar" onClick={() => setEditando('etiqueta:' + et.id)}>✎</button>
                          <button style={btnIco} title="Eliminar" onClick={() => borrar('etiqueta', et)}>🗑</button>
                        </div>
                      ))}
                      <div {...zonaFinal('etiqueta', g.id)} style={{ minHeight: 6, ...(sobre?.id === 'fin:' + g.id ? { boxShadow: '0 -2px 0 0 var(--accent)' } : {}) }}>
                        <NuevoInline peque texto="Etiqueta" onCrear={n => crear('etiqueta', { grupo_id: g.id, nombre: n, color: ets[ets.length - 1]?.color || g.color || s?.color || '#2f6fdb', orden: ets.length })} />
                      </div>
                    </div>
                  </div>
                )
              })}
              <div {...zonaFinal('grupo', s?.id || null)} style={{ minHeight: 8, borderRadius: 6, ...(sobre?.id === 'fin:' + (s?.id || null) ? { boxShadow: '0 -2px 0 0 var(--accent)' } : {}) }}>
                <NuevoInline texto="Grupo de categorías" onCrear={n => crear('grupo', { nombre: n, seleccion: 'multiple', seccion_id: s?.id || null, orden: gs.length })} />
              </div>
            </div>
          </div>
        ))}
        <div {...zonaFinal('seccion', null)} style={{ flex: '0 0 30px', alignSelf: 'stretch', minHeight: 80, borderRadius: 8, ...(sobre?.id === 'fin:null' && drag?.tipo === 'seccion' ? { boxShadow: '-3px 0 0 0 var(--accent)' } : {}) }} />
      </div>
    </div>
  )
}
