/**
 * ConstructorResistencia — constructor de bloques de resistencia (estilo
 * TrainingPeaks).
 *
 * Arriba, 8 piezas que se arrastran (o se pulsan) al bloque:
 *   Calentamiento · Activo · Recuperación · Vuelta a la calma ·
 *   Repetir 2 pasos · Repetir 3 pasos · Aumento progresivo · Reducción gradual
 *
 * Un bloque de resistencia es una lista de pasos (sesion_fases) y grupos de
 * repetición (sesion_fase_grupos con sus pasos). Cada paso tiene:
 *   tipo_paso   calentamiento · activo · recuperacion · vuelta_calma ·
 *               descanso · rampa_sube · rampa_baja
 *   duración    duracion_seg  ó  distancia_m
 *   intensidad  objetivo_tipo + objetivo_min–objetivo_max (en las rampas,
 *               valor inicial → final)
 * Los pasos se pueden arrastrar para reordenarlos o meterlos/sacarlos de un
 * grupo, y varios pasos seleccionados se convierten en "Repetir N veces".
 * Con el perfil del cliente (clientes.perfil_zonas) se muestran sus
 * pulsaciones y ritmos. Los campos antiguos se siguen leyendo.
 *
 * Los cambios se guardan al momento en la base de datos.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  TIPOS_PASO, OBJETIVOS, colorTipoPaso, labelTipoPaso, duracionPaso, distanciaPaso, esRampa,
  fmtDuracionPaso, parseDuracionPaso, fmtDistancia, objetivoPersonal, intensidadesRampa, segundosEstimados,
} from '../lib/zonas'

const AZUL = '#4C82E8'
const TIPO_DND = 'application/x-idelri-paso'

function parseDistancia(txt) {
  const t = String(txt ?? '').trim().toLowerCase().replace(',', '.')
  if (!t) return null
  let m
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(km|k)$/))) return Math.round(parseFloat(m[1]) * 1000)
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*m$/))) return Math.round(parseFloat(m[1]))
  if ((m = t.match(/^(\d+(?:\.\d+)?)$/))) { const n = parseFloat(m[1]); return n < 50 ? Math.round(n * 1000) : Math.round(n) }
  return null
}

const LIMITES = { zona_fc: [1, 5], zona_ritmo: [1, 5], rpe: [1, 10] }

function valoresPorDefecto(tipo, perfil) {
  const ritmo = !!perfil?.ritmo_umbral_seg
  switch (tipo) {
    case 'calentamiento': return { tipo_paso: tipo, duracion_seg: 600, objetivo_tipo: 'zona_fc', objetivo_min: 1, objetivo_max: 2 }
    case 'activo':        return ritmo
      ? { tipo_paso: tipo, duracion_seg: 300, objetivo_tipo: 'ritmo_umbral', objetivo_min: 95, objetivo_max: 100 }
      : { tipo_paso: tipo, duracion_seg: 300, objetivo_tipo: 'zona_fc', objetivo_min: 3, objetivo_max: 4 }
    case 'recuperacion':  return { tipo_paso: tipo, duracion_seg: 120, objetivo_tipo: 'zona_fc', objetivo_min: 1, objetivo_max: 1 }
    case 'vuelta_calma':  return { tipo_paso: tipo, duracion_seg: 600, objetivo_tipo: 'zona_fc', objetivo_min: 1, objetivo_max: 1 }
    case 'rampa_sube':    return ritmo
      ? { tipo_paso: tipo, duracion_seg: 600, objetivo_tipo: 'ritmo_umbral', objetivo_min: 80, objetivo_max: 100 }
      : { tipo_paso: tipo, duracion_seg: 600, objetivo_tipo: 'zona_fc', objetivo_min: 2, objetivo_max: 4 }
    case 'rampa_baja':    return ritmo
      ? { tipo_paso: tipo, duracion_seg: 600, objetivo_tipo: 'ritmo_umbral', objetivo_min: 100, objetivo_max: 80 }
      : { tipo_paso: tipo, duracion_seg: 600, objetivo_tipo: 'zona_fc', objetivo_min: 4, objetivo_max: 2 }
    default:              return { tipo_paso: 'descanso', duracion_seg: 60, objetivo_tipo: null, objetivo_min: null, objetivo_max: null }
  }
}

/* Las 8 piezas de la paleta (como en TrainingPeaks) */
// Pasos que crea cada pieza. Las de progresivo/gradual crean 4 pasos.
function escalon(perfil, i, sube) {
  const ritmo = !!perfil?.ritmo_umbral_seg
  const n = sube ? i : 3 - i
  return ritmo
    ? { tipo_paso: 'activo', duracion_seg: 300, objetivo_tipo: 'ritmo_umbral', objetivo_min: 80 + n * 5, objetivo_max: 85 + n * 5 }
    : { tipo_paso: 'activo', duracion_seg: 300, objetivo_tipo: 'zona_fc', objetivo_min: n + 1, objetivo_max: n + 1 }
}
const PIEZAS = [
  { key: 'calentamiento', label: 'Calentamiento',     barras: [[1, 0.42]],
    crear: p => [valoresPorDefecto('calentamiento', p)] },
  { key: 'activo',        label: 'Activo',            barras: [[1, 0.8]],
    crear: p => [valoresPorDefecto('activo', p)] },
  { key: 'recuperacion',  label: 'Recuperación',      barras: [[1, 0.58]],
    crear: p => [valoresPorDefecto('recuperacion', p)] },
  { key: 'vuelta_calma',  label: 'Vuelta a la calma', barras: [[1, 0.24]],
    crear: p => [valoresPorDefecto('vuelta_calma', p)] },
  { key: 'rep2',          label: 'Repetir 2 pasos',   barras: [[1.4, 0.8], [1, 0.45]], grupo: 5,
    crear: p => [{ ...valoresPorDefecto('activo', p), duracion_seg: 180 }, { ...valoresPorDefecto('recuperacion', p), duracion_seg: 90 }] },
  { key: 'rep3',          label: 'Repetir 3 pasos',   barras: [[1, 0.6], [0.8, 0.85], [0.7, 0.4]], grupo: 4,
    crear: p => {
      const a = valoresPorDefecto('activo', p)
      const medio = a.objetivo_tipo === 'zona_fc' ? { objetivo_min: 3, objetivo_max: 3 } : { objetivo_min: 90, objetivo_max: 95 }
      return [{ ...a, ...medio, duracion_seg: 180 }, { ...a, duracion_seg: 120 }, { ...valoresPorDefecto('recuperacion', p), duracion_seg: 90 }]
    } },
  { key: 'progresivo',    label: 'Aumento progresivo', barras: [[1, 0.42], [1, 0.56], [1, 0.7], [1, 0.84]],
    crear: p => [0, 1, 2, 3].map(i => escalon(p, i, true)) },
  { key: 'gradual',       label: 'Reducción gradual',  barras: [[1, 0.84], [1, 0.7], [1, 0.56], [1, 0.42]],
    crear: p => [0, 1, 2, 3].map(i => escalon(p, i, false)) },
]

// Icono como en TrainingPeaks: bloques azul oscuro sobre fondo gris claro
function IconoPieza({ barras }) {
  const total = barras.reduce((a, [w]) => a + w, 0)
  const gap = barras.length > 1 ? 1.2 : 0
  let x = 0
  return (
    <svg width="60" height="34" viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true" style={{ display: 'block', borderRadius: 5 }}>
      <rect x="0" y="0" width="100" height="56" fill="#c9cfdb" />
      {barras.map(([w, h], i) => {
        const ancho = (100 - gap * (barras.length - 1)) * w / total
        const r = <rect key={i} x={x} y={56 - h * 56} width={ancho} height={h * 56} fill="#1f2d8a" />
        x += ancho + gap
        return r
      })}
    </svg>
  )
}

// Campos de un paso que se copian al duplicar
const CAMPOS_PASO = ['nombre', 'descripcion', 'tipo_paso', 'duracion_seg', 'distancia_m', 'objetivo_tipo', 'objetivo_min', 'objetivo_max',
  'volumen_min', 'volumen_km', 'fc_zona', 'ritmo_inicio', 'ritmo_fin', 'rpe', 'pendiente_cualitativa', 'pendiente_pct_min', 'pendiente_pct_max']
const copiaPaso = f => Object.fromEntries(CAMPOS_PASO.map(k => [k, f[k] ?? null]))

function leerArrastre(e) {
  try { return JSON.parse(e.dataTransfer.getData(TIPO_DND) || 'null') } catch { return null }
}

export default function ConstructorResistencia({ sesionId, bloqueId, items, setItems, perfil, onDirty }) {
  const [abierto, setAbierto] = useState(null)        // paso con notas/pendiente abiertas
  const [hoverPieza, setHoverPieza] = useState(null)  // nombre de la pieza bajo el ratón
  const [seleccion, setSeleccion] = useState([])      // ids de pasos sueltos seleccionados
  const [veces, setVeces] = useState(8)
  const [arrastrando, setArrastrando] = useState(false)
  const [zonaActiva, setZonaActiva] = useState(null)  // 'g:<grupo>:<idx>' | 't:<idx>'
  const sucio = () => onDirty && onDirty()

  async function insertarPaso(campos, grupoId, orden) {
    const { data, error } = await supabase.from('sesion_fases').insert({
      sesion_id: sesionId, bloque_id: bloqueId, grupo_id: grupoId || null, orden, nombre: '', ...campos,
    }).select().single()
    if (error) { alert('No se pudo guardar el paso: ' + error.message); return null }
    return data
  }

  /* Guarda el orden de la lista principal y de los grupos tal como estén */
  async function guardarOrden(lista) {
    const conOrden = lista.map((it, i) => it.type === 'grupo'
      ? { ...it, orden: i, fases: it.fases.map((f, j) => ({ ...f, orden: j, grupo_id: it.id })) }
      : { ...it, orden: i, grupo_id: null })
    setItems(conOrden); sucio()
    const ops = []
    conOrden.forEach(it => {
      if (it.type === 'grupo') {
        ops.push(supabase.from('sesion_fase_grupos').update({ orden: it.orden }).eq('id', it.id))
        it.fases.forEach(f => ops.push(supabase.from('sesion_fases').update({ orden: f.orden, grupo_id: it.id }).eq('id', f.id)))
      } else ops.push(supabase.from('sesion_fases').update({ orden: it.orden, grupo_id: null }).eq('id', it.id))
    })
    await Promise.all(ops)
  }

  /* Añade una pieza de la paleta en la posición indicada */
  async function soltarPieza(clave, destino) {
    const pieza = PIEZAS.find(p => p.key === clave)
    if (!pieza) return
    const valores = pieza.crear(perfil)
    if (pieza.grupo && !destino.grupoId) {
      const { data: g, error } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionId, bloque_id: bloqueId, repeticiones: pieza.grupo, orden: destino.idx }).select().single()
      if (error || !g) { alert('No se pudo crear la repetición: ' + (error?.message || '')); return }
      const fases = []
      for (let i = 0; i < valores.length; i++) { const p = await insertarPaso(valores[i], g.id, i); if (p) fases.push(p) }
      const n = [...items]; n.splice(destino.idx, 0, { type: 'grupo', ...g, fases })
      await guardarOrden(n)
      return
    }
    // Pasos sueltos (o los pasos de la pieza dentro de una repetición existente)
    const nuevos = []
    for (const v of valores) { const p = await insertarPaso(v, destino.grupoId || null, 0); if (p) nuevos.push(p) }
    if (destino.grupoId) {
      await guardarOrden(items.map(it => {
        if (it.id !== destino.grupoId) return it
        const f = [...it.fases]; f.splice(destino.idx, 0, ...nuevos); return { ...it, fases: f }
      }))
    } else {
      const n = [...items]; n.splice(destino.idx, 0, ...nuevos.map(p => ({ type: 'fase', ...p })))
      await guardarOrden(n)
    }
  }

  /* Mueve un paso o grupo ya existente */
  async function moverElemento(origen, destino) {
    let lista = items.map(it => it.type === 'grupo' ? { ...it, fases: [...it.fases] } : it)
    let elemento
    if (origen.grupoId) {
      const g = lista.find(it => it.id === origen.grupoId)
      const i = g.fases.findIndex(f => f.id === origen.id)
      if (i < 0) return
      ;[elemento] = g.fases.splice(i, 1)
      if (destino.grupoId === origen.grupoId && destino.idx > i) destino = { ...destino, idx: destino.idx - 1 }
    } else {
      const i = lista.findIndex(it => it.id === origen.id)
      if (i < 0) return
      ;[elemento] = lista.splice(i, 1)
      if (!destino.grupoId && destino.idx > i) destino = { ...destino, idx: destino.idx - 1 }
    }
    if (destino.grupoId) {
      if (elemento.type === 'grupo') return // un grupo no se mete dentro de otro
      const g = lista.find(it => it.id === destino.grupoId)
      const { type, ...f } = elemento
      g.fases.splice(destino.idx, 0, f)
    } else {
      lista.splice(destino.idx, 0, elemento.type ? elemento : { type: 'fase', ...elemento })
    }
    await guardarOrden(lista)
  }

  function alSoltar(e, destino) {
    e.preventDefault(); e.stopPropagation()
    setZonaActiva(null); setArrastrando(false)
    const d = leerArrastre(e)
    if (!d) return
    if (d.pieza) soltarPieza(d.pieza, destino)
    else if (d.mover) moverElemento(d.mover, destino)
  }

  async function cambiarPaso(id, patch, grupoId) {
    setItems(xs => xs.map(it => {
      if (grupoId) return it.id === grupoId ? { ...it, fases: it.fases.map(f => f.id === id ? { ...f, ...patch } : f) } : it
      return it.id === id ? { ...it, ...patch } : it
    }))
    sucio()
    const { error } = await supabase.from('sesion_fases').update(patch).eq('id', id)
    if (error) alert('No se pudo guardar: ' + error.message)
  }

  async function eliminarPaso(id, grupoId) {
    setItems(xs => grupoId ? xs.map(it => it.id === grupoId ? { ...it, fases: it.fases.filter(f => f.id !== id) } : it) : xs.filter(it => it.id !== id))
    setSeleccion(s => s.filter(x => x !== id)); sucio()
    await supabase.from('sesion_fases').delete().eq('id', id)
  }

  async function duplicarPaso(f, grupoId) {
    const p = await insertarPaso(copiaPaso(f), grupoId || null, 0)
    if (!p) return
    if (grupoId) {
      await guardarOrden(items.map(it => {
        if (it.id !== grupoId) return it
        const i = it.fases.findIndex(x => x.id === f.id); const n = [...it.fases]; n.splice(i + 1, 0, p); return { ...it, fases: n }
      }))
    } else {
      const i = items.findIndex(it => it.id === f.id); const n = [...items]; n.splice(i + 1, 0, { type: 'fase', ...p })
      await guardarOrden(n)
    }
  }

  async function cambiarRepeticiones(grupoId, n) {
    const rep = Math.max(1, Math.min(99, n || 1))
    setItems(xs => xs.map(it => it.id === grupoId ? { ...it, repeticiones: rep } : it)); sucio()
    await supabase.from('sesion_fase_grupos').update({ repeticiones: rep }).eq('id', grupoId)
  }

  async function eliminarGrupo(grupoId) {
    if (!window.confirm('¿Eliminar esta repetición y sus pasos?')) return
    setItems(xs => xs.filter(it => it.id !== grupoId)); sucio()
    await supabase.from('sesion_fases').delete().eq('grupo_id', grupoId)
    await supabase.from('sesion_fase_grupos').delete().eq('id', grupoId)
  }

  async function desagrupar(grupoId) {
    const i = items.findIndex(it => it.id === grupoId)
    const g = items[i]
    const n = [...items]; n.splice(i, 1, ...g.fases.map(f => ({ type: 'fase', ...f, grupo_id: null })))
    await guardarOrden(n)
    await supabase.from('sesion_fase_grupos').delete().eq('id', grupoId)
  }

  async function duplicarGrupo(grupoId) {
    const i = items.findIndex(it => it.id === grupoId)
    const g = items[i]
    const { data: ng } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionId, bloque_id: bloqueId, repeticiones: g.repeticiones, orden: i + 1 }).select().single()
    if (!ng) return
    const fases = []
    for (let j = 0; j < g.fases.length; j++) { const p = await insertarPaso(copiaPaso(g.fases[j]), ng.id, j); if (p) fases.push(p) }
    const n = [...items]; n.splice(i + 1, 0, { type: 'grupo', ...ng, fases })
    await guardarOrden(n)
  }

  /* Convierte los pasos seleccionados en "Repetir N veces" */
  async function repetirSeleccion() {
    const idxs = items.map((it, i) => seleccion.includes(it.id) && it.type === 'fase' ? i : -1).filter(i => i >= 0)
    if (!idxs.length) return
    const { data: g, error } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionId, bloque_id: bloqueId, repeticiones: Math.max(1, veces || 1), orden: idxs[0] }).select().single()
    if (error || !g) { alert('No se pudo crear la repetición: ' + (error?.message || '')); return }
    const fases = idxs.map(i => items[i]).map(({ type, ...f }) => f)
    const n = items.filter((_, i) => !idxs.includes(i))
    n.splice(idxs[0], 0, { type: 'grupo', ...g, fases })
    setSeleccion([])
    await guardarOrden(n)
  }

  /* ── Gráfica y totales ── */
  const barras = []
  items.forEach(it => {
    if (it.type === 'fase') barras.push({ f: it, grupo: null })
    else for (let r = 0; r < (it.repeticiones || 1); r++) it.fases.forEach(f => barras.push({ f, grupo: it, rep: r }))
  })
  const segs = barras.map(b => Math.max(segundosEstimados(b.f, perfil), 20))
  const totalSeg = barras.reduce((a, b) => a + segundosEstimados(b.f, perfil), 0)
  const totalM = barras.reduce((a, b) => a + (distanciaPaso(b.f) || 0), 0)
  const hayEstimados = barras.some(b => !duracionPaso(b.f) && distanciaPaso(b.f))

  const Zona = ({ id, destino, alto }) => (
    <div onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (zonaActiva !== id) setZonaActiva(id) }}
      onDragLeave={() => setZonaActiva(z => z === id ? null : z)}
      onDrop={e => alSoltar(e, destino)}
      style={{ height: arrastrando ? (zonaActiva === id ? 30 : (alto || 10)) : 2, transition: 'height .12s', borderRadius: 6,
        background: zonaActiva === id ? `${AZUL}22` : 'transparent', border: zonaActiva === id ? `1.5px dashed ${AZUL}` : '1.5px dashed transparent' }} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      onDragEnd={() => { setArrastrando(false); setZonaActiva(null) }}>

      {/* Paleta de piezas */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 60px)', gap: 6 }}>
          {PIEZAS.map(p => (
            <div key={p.key} draggable title={`${p.label} · arrastra o pulsa para añadir`}
              onDragStart={e => { e.dataTransfer.setData(TIPO_DND, JSON.stringify({ pieza: p.key })); e.dataTransfer.effectAllowed = 'copy'; setArrastrando(true) }}
              onClick={() => soltarPieza(p.key, { grupoId: null, idx: items.length })}
              onMouseEnter={() => setHoverPieza(p.label)} onMouseLeave={() => setHoverPieza(null)}
              style={{ cursor: 'grab', borderRadius: 6, outline: hoverPieza === p.label ? '2px solid #1f2d8a' : 'none', outlineOffset: 1 }}>
              <IconoPieza barras={p.barras} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.4, paddingTop: 2, maxWidth: 260 }}>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>{hoverPieza || 'Haz clic o arrastra bloques para crear el entrenamiento'}</div>
          {!hoverPieza && <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 2 }}>Suéltalos donde quieras del bloque, dentro de una repetición o sobre la gráfica.</div>}
        </div>
      </div>

      {/* Gráfica (también acepta piezas al final) */}
      <div onDragOver={e => e.preventDefault()} onDrop={e => alSoltar(e, { grupoId: null, idx: items.length })}
        style={{ background: 'var(--bg2)', borderRadius: 10, padding: '10px 10px 8px', minHeight: barras.length ? 0 : 70, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {barras.length === 0 ? (
          <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--text3)' }}>Suelta aquí la primera pieza</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 74, gap: 1 }}>
              {barras.map((b, i) => {
                const primeroDeGrupo = b.grupo && b.rep === 0 && b.f.id === b.grupo.fases[0]?.id
                const [ini, fin] = intensidadesRampa(b.f)
                const alto = Math.max(ini, fin)
                const clip = esRampa(b.f.tipo_paso) ? `polygon(0 100%, 0 ${100 - (ini / alto) * 100}%, 100% ${100 - (fin / alto) * 100}%, 100% 100%)` : undefined
                return (
                  <div key={i} title={`${b.f.nombre || labelTipoPaso(b.f.tipo_paso)} · ${fmtDuracionPaso(duracionPaso(b.f)) || fmtDistancia(distanciaPaso(b.f))}`}
                    style={{ flex: `${segs[i]} 1 0`, minWidth: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', background: b.grupo ? 'rgba(76,130,232,.08)' : 'transparent' }}>
                    {primeroDeGrupo && <span style={{ position: 'absolute', top: 0, left: 2, fontSize: 10, fontWeight: 800, color: AZUL, fontFamily: 'var(--mono)' }}>{b.grupo.repeticiones}×</span>}
                    <div style={{ height: `${Math.round(alto * 100)}%`, background: colorTipoPaso(b.f.tipo_paso), borderRadius: clip ? 0 : '3px 3px 0 0', opacity: b.rep > 0 ? 0.75 : 1, clipPath: clip }} />
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11.5, color: 'var(--text2)', alignItems: 'center' }}>
              {totalSeg > 0 && <span><strong>{hayEstimados ? '~' : ''}{fmtDuracionPaso(totalSeg)}</strong></span>}
              {totalM > 0 && <span><strong>{fmtDistancia(totalM)}</strong></span>}
            </div>
          </>
        )}
      </div>

      {/* Barra de selección → repetir */}
      {seleccion.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#eef2ff', border: `1px solid ${AZUL}55`, borderRadius: 8, padding: '6px 10px' }}>
          <span style={{ fontSize: 12.5, color: AZUL, fontWeight: 600 }}>{seleccion.length} paso{seleccion.length > 1 ? 's' : ''} seleccionado{seleccion.length > 1 ? 's' : ''}</span>
          <span style={{ fontSize: 12.5 }}>Repetir</span>
          <input type="number" min={1} value={veces} onChange={e => setVeces(parseInt(e.target.value, 10) || '')}
            style={{ width: 48, textAlign: 'center', fontWeight: 700, padding: '3px 4px', border: `1px solid ${AZUL}66`, borderRadius: 6 }} />
          <span style={{ fontSize: 12.5 }}>veces</span>
          <button className="btn btn-primary btn-sm" onClick={repetirSeleccion}>Crear repetición</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSeleccion([])}>Cancelar</button>
        </div>
      )}

      {/* Pasos */}
      <Zona id="t:0" destino={{ grupoId: null, idx: 0 }} />
      {items.map((it, idx) => (
        <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {it.type === 'fase' ? (
            <Paso f={it} perfil={perfil} abierto={abierto === it.id} setAbierto={v => setAbierto(v ? it.id : null)}
              seleccionado={seleccion.includes(it.id)} onSeleccionar={v => setSeleccion(s => v ? [...s, it.id] : s.filter(x => x !== it.id))}
              onArrastrar={e => { e.dataTransfer.setData(TIPO_DND, JSON.stringify({ mover: { id: it.id, grupoId: null } })); e.dataTransfer.effectAllowed = 'move'; setArrastrando(true) }}
              onCambio={patch => cambiarPaso(it.id, patch, null)}
              onEliminar={() => eliminarPaso(it.id, null)} onDuplicar={() => duplicarPaso(it, null)} />
          ) : (
            <div style={{ border: `1.5px solid ${AZUL}`, borderRadius: 12, background: '#f3f6ff', overflow: 'hidden' }}>
              <div draggable onDragStart={e => { e.dataTransfer.setData(TIPO_DND, JSON.stringify({ mover: { id: it.id, grupoId: null } })); e.dataTransfer.effectAllowed = 'move'; setArrastrando(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#e3ebff', cursor: 'grab' }}>
                <span style={{ color: AZUL, opacity: .6 }}>⠿</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: AZUL }}>Repetir</span>
                <button className="btn btn-ghost btn-sm" onClick={() => cambiarRepeticiones(it.id, (it.repeticiones || 1) - 1)} style={{ padding: '0 7px' }}>−</button>
                <input type="number" value={it.repeticiones || 1} min={1} onChange={e => cambiarRepeticiones(it.id, parseInt(e.target.value, 10))}
                  style={{ width: 46, textAlign: 'center', fontSize: 15, fontWeight: 800, color: AZUL, border: `1px solid ${AZUL}55`, borderRadius: 6, padding: '2px 4px', background: '#fff' }} />
                <button className="btn btn-ghost btn-sm" onClick={() => cambiarRepeticiones(it.id, (it.repeticiones || 1) + 1)} style={{ padding: '0 7px' }}>+</button>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: AZUL }}>veces</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                  <button className="btn btn-ghost btn-sm" title="Quitar la repetición (los pasos se quedan)" onClick={() => desagrupar(it.id)} style={{ padding: '2px 8px', fontSize: 11.5 }}>Desagrupar</button>
                  <button className="btn btn-ghost btn-sm" title="Duplicar repetición" onClick={() => duplicarGrupo(it.id)} style={{ padding: '2px 6px' }}>⎘</button>
                  <button className="btn btn-ghost btn-sm" title="Eliminar repetición" onClick={() => eliminarGrupo(it.id)} style={{ padding: '2px 6px', color: 'var(--danger)' }}>×</button>
                </span>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Zona id={`g:${it.id}:0`} destino={{ grupoId: it.id, idx: 0 }} />
                {it.fases.map((f, fi) => (
                  <div key={f.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Paso f={f} perfil={perfil} abierto={abierto === f.id} setAbierto={v => setAbierto(v ? f.id : null)}
                      onArrastrar={e => { e.stopPropagation(); e.dataTransfer.setData(TIPO_DND, JSON.stringify({ mover: { id: f.id, grupoId: it.id } })); e.dataTransfer.effectAllowed = 'move'; setArrastrando(true) }}
                      onCambio={patch => cambiarPaso(f.id, patch, it.id)}
                      onEliminar={() => eliminarPaso(f.id, it.id)} onDuplicar={() => duplicarPaso(f, it.id)} />
                    <Zona id={`g:${it.id}:${fi + 1}`} destino={{ grupoId: it.id, idx: fi + 1 }} />
                  </div>
                ))}
                {!arrastrando && <span style={{ fontSize: 11, color: AZUL, opacity: .7 }}>Arrastra aquí más pasos o piezas para añadirlos a la repetición</span>}
              </div>
            </div>
          )}
          <Zona id={`t:${idx + 1}`} destino={{ grupoId: null, idx: idx + 1 }} />
        </div>
      ))}

      {items.some(it => it.type === 'fase') && seleccion.length === 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Marca la casilla de varios pasos para repetirlos N veces sin tener que añadirlos uno a uno.</div>
      )}
      {!perfil?.fc_max && !perfil?.fc_umbral && !perfil?.ritmo_umbral_seg && (
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Rellena la ficha «Perfil y zonas» del cliente para ver sus pulsaciones y ritmos en cada paso.</div>
      )}
    </div>
  )
}

/* ── Un paso ─────────────────────────────────────────────────────────── */
function Paso({ f, perfil, abierto, setAbierto, seleccionado, onSeleccionar, onArrastrar, onCambio, onEliminar, onDuplicar }) {
  const color = colorTipoPaso(f.tipo_paso)
  const dist = distanciaPaso(f)
  const modo = dist && !f.duracion_seg ? 'dist' : 'tiempo'
  const rampa = esRampa(f.tipo_paso)
  const [txtDur, setTxtDur] = useState(fmtDuracionPaso(duracionPaso(f)))
  const [txtDist, setTxtDist] = useState(dist ? String(dist) : '')
  const [nombre, setNombre] = useState(f.nombre || '')
  const [notas, setNotas] = useState(f.descripcion || '')
  const [min, setMin] = useState(f.objetivo_min ?? '')
  const [max, setMax] = useState(f.objetivo_max ?? '')
  useEffect(() => { setTxtDur(fmtDuracionPaso(duracionPaso(f))) }, [f.duracion_seg, f.volumen_min]) // eslint-disable-line
  useEffect(() => { setTxtDist(distanciaPaso(f) ? String(distanciaPaso(f)) : '') }, [f.distancia_m, f.volumen_km]) // eslint-disable-line
  useEffect(() => { setMin(f.objetivo_min ?? ''); setMax(f.objetivo_max ?? '') }, [f.objetivo_min, f.objetivo_max, f.objetivo_tipo])
  useEffect(() => { setNombre(f.nombre || '') }, [f.nombre])

  const personal = objetivoPersonal(f, perfil)
  const legado = !f.objetivo_tipo && (f.fc_zona || f.ritmo_inicio || f.ritmo_fin || f.rpe)
  const lim = LIMITES[f.objetivo_tipo]
  const inp = { padding: '4px 6px', fontSize: 12.5, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }

  function guardarRango(a, b) {
    const n = v => (v === '' || v == null ? null : Number(v))
    let x = n(a), y = n(b)
    if (x != null && y == null) y = x
    if (y != null && x == null) x = y
    if (lim) { if (x != null) x = Math.min(lim[1], Math.max(lim[0], x)); if (y != null) y = Math.min(lim[1], Math.max(lim[0], y)) }
    onCambio({ objetivo_min: x, objetivo_max: y })
  }

  return (
    <div style={{ background: 'var(--bg)', border: `1px solid ${seleccionado ? AZUL : 'var(--border)'}`, borderLeft: `5px solid ${color}`, borderRadius: 10, padding: '8px 10px', boxShadow: seleccionado ? `0 0 0 2px ${AZUL}33` : 'none' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <span draggable onDragStart={onArrastrar} title="Arrastrar" style={{ cursor: 'grab', color: 'var(--text3)', userSelect: 'none', padding: '0 2px' }}>⠿</span>
        {onSeleccionar && (
          <input type="checkbox" checked={!!seleccionado} onChange={e => onSeleccionar(e.target.checked)} title="Seleccionar para repetir" style={{ accentColor: AZUL, cursor: 'pointer' }} />
        )}

        {/* Nombre (por defecto, el del tipo) + tipo */}
        <input value={nombre} onChange={e => setNombre(e.target.value)} onBlur={() => nombre !== (f.nombre || '') && onCambio({ nombre })}
          placeholder={labelTipoPaso(f.tipo_paso)}
          style={{ ...inp, width: 150, fontWeight: 700, color, borderColor: `${color}55`, background: `${color}10` }} />
        <select value={f.tipo_paso || ''} onChange={e => onCambio({ tipo_paso: e.target.value || null })} title="Tipo de paso"
          style={{ ...inp, fontSize: 11.5, color: 'var(--text3)', maxWidth: 130 }}>
          {!f.tipo_paso && <option value="">Tipo</option>}
          {TIPOS_PASO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>

        {/* Duración / distancia */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 6, padding: 1 }}>
            {[['tiempo', '⏱'], ['dist', '📏']].map(([k, ic]) => (
              <button key={k} title={k === 'tiempo' ? 'Por tiempo' : 'Por distancia'}
                onClick={() => {
                  if (k === modo) return
                  if (k === 'tiempo') onCambio({ distancia_m: null, volumen_km: null, duracion_seg: 300 })
                  else onCambio({ duracion_seg: null, volumen_min: null, distancia_m: 1000 })
                }}
                style={{ border: 'none', borderRadius: 5, padding: '2px 6px', fontSize: 11, cursor: 'pointer', background: modo === k ? 'var(--bg)' : 'transparent', boxShadow: modo === k ? '0 1px 2px rgba(0,0,0,.1)' : 'none' }}>{ic}</button>
            ))}
          </div>
          {modo === 'tiempo' ? (
            <input value={txtDur} onChange={e => setTxtDur(e.target.value)} placeholder="10:00" title="min:seg (o 45s, o 1:05:00)"
              onBlur={() => { const s = parseDuracionPaso(txtDur); if (s !== duracionPaso(f)) onCambio({ duracion_seg: s, volumen_min: null }); setTxtDur(fmtDuracionPaso(s)) }}
              style={{ ...inp, width: 66, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }} />
          ) : (
            <input value={txtDist} onChange={e => setTxtDist(e.target.value)} placeholder="400 · 1,5 km"
              onBlur={() => { const m = parseDistancia(txtDist); if (m !== distanciaPaso(f)) onCambio({ distancia_m: m, volumen_km: null }); setTxtDist(m ? String(m) : '') }}
              style={{ ...inp, width: 76, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }} />
          )}
          {modo === 'dist' && dist ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDistancia(dist)}</span> : null}
        </div>

        {/* Intensidad (en las rampas: inicio → final) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <select value={f.objetivo_tipo || ''} onChange={e => {
            const t = e.target.value || null
            const def = { fcmax: [70, 80], fcumbral: [85, 90], ritmo_umbral: [95, 100], ritmo_maraton: [100, 100], zona_fc: [2, 2], zona_ritmo: [2, 2], rpe: [5, 6] }[t] || [null, null]
            const v = rampa && f.tipo_paso === 'rampa_baja' ? [def[1], def[0]] : def
            onCambio({ objetivo_tipo: t, objetivo_min: v[0], objetivo_max: v[1] })
          }} style={inp}>
            <option value="">Sin intensidad</option>
            {OBJETIVOS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {f.objetivo_tipo && (
            <>
              <input type="number" value={min} onChange={e => setMin(e.target.value)} onBlur={() => guardarRango(min, max)} style={{ ...inp, width: 52, textAlign: 'center' }} title={rampa ? 'Al empezar' : 'Mínimo'} />
              <span style={{ color: 'var(--text3)' }}>{rampa ? '→' : '–'}</span>
              <input type="number" value={max} onChange={e => setMax(e.target.value)} onBlur={() => guardarRango(min, max)} style={{ ...inp, width: 52, textAlign: 'center' }} title={rampa ? 'Al terminar' : 'Máximo'} />
            </>
          )}
          {personal && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color, background: `${color}14`, borderRadius: 6, padding: '3px 7px' }}>{personal}</span>}
        </div>

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 1 }}>
          <button className="btn btn-ghost btn-sm" title="Indicaciones y pendiente" onClick={() => setAbierto(!abierto)} style={{ padding: '2px 6px', color: abierto || f.descripcion ? 'var(--accent)' : 'var(--text3)' }}>✎</button>
          <button className="btn btn-ghost btn-sm" title="Duplicar" onClick={onDuplicar} style={{ padding: '2px 6px' }}>⎘</button>
          <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={onEliminar} style={{ padding: '2px 6px', color: 'var(--danger)' }}>×</button>
        </span>
      </div>

      {f.descripcion && !abierto && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5, lineHeight: 1.4 }}>{f.descripcion}</div>
      )}

      {legado && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
          Formato anterior: {[f.fc_zona && `Zona ${f.fc_zona}`, (f.ritmo_inicio || f.ritmo_fin) && `Ritmo ${f.ritmo_inicio || ''}${f.ritmo_fin ? '–' + f.ritmo_fin : ''}`, f.rpe && `RPE ${f.rpe}`].filter(Boolean).join(' · ')}
          {' '}(el cliente lo sigue viendo; elige una intensidad para sustituirlo)
        </div>
      )}

      {abierto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => notas !== (f.descripcion || '') && onCambio({ descripcion: notas || null })}
            placeholder="Indicaciones para el cliente" rows={2} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}>
            Pendiente
            <input type="number" defaultValue={f.pendiente_pct_min ?? ''} onBlur={e => onCambio({ pendiente_pct_min: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inp, width: 50 }} />
            –
            <input type="number" defaultValue={f.pendiente_pct_max ?? ''} onBlur={e => onCambio({ pendiente_pct_max: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inp, width: 50 }} />
            %
          </div>
        </div>
      )}
    </div>
  )
}
