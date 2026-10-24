/**
 * ConstructorResistencia — constructor de bloques de resistencia (estilo
 * TrainingPeaks).
 *
 * Un bloque de resistencia es una lista de pasos (sesion_fases) y grupos de
 * repetición (sesion_fase_grupos con sus pasos). Cada paso tiene:
 *   tipo_paso   calentamiento · activo · recuperación · vuelta a la calma · descanso
 *   duración    duracion_seg  ó  distancia_m
 *   intensidad  objetivo_tipo (% FC máx, % FC umbral, % ritmo umbral,
 *               % ritmo maratón, zona de FC, zona de ritmo, RPE) + min–max
 * Con el perfil del cliente (clientes.perfil_zonas) se muestran sus
 * pulsaciones y ritmos. Los campos antiguos (volumen_min/km, fc_zona,
 * ritmo_inicio/fin, rpe, pendiente) se siguen leyendo.
 *
 * Los cambios se guardan al momento en la base de datos.
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  TIPOS_PASO, OBJETIVOS, colorTipoPaso, labelTipoPaso, duracionPaso, distanciaPaso,
  fmtDuracionPaso, parseDuracionPaso, fmtDistancia, objetivoPersonal, intensidadPaso, segundosEstimados,
} from '../lib/zonas'

const AZUL = '#4C82E8'

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
    default:              return { tipo_paso: 'descanso', duracion_seg: 60, objetivo_tipo: null, objetivo_min: null, objetivo_max: null }
  }
}

// Campos de un paso que se copian al duplicar
const CAMPOS_PASO = ['nombre', 'descripcion', 'tipo_paso', 'duracion_seg', 'distancia_m', 'objetivo_tipo', 'objetivo_min', 'objetivo_max',
  'volumen_min', 'volumen_km', 'fc_zona', 'ritmo_inicio', 'ritmo_fin', 'rpe', 'pendiente_cualitativa', 'pendiente_pct_min', 'pendiente_pct_max']
const copiaPaso = f => Object.fromEntries(CAMPOS_PASO.map(k => [k, f[k] ?? null]))

export default function ConstructorResistencia({ sesionId, bloqueId, items, setItems, perfil, onDirty }) {
  const [abierto, setAbierto] = useState(null) // paso con "más opciones" abiertas
  const sucio = () => onDirty && onDirty()
  const siguienteOrden = () => items.reduce((m, it) => Math.max(m, it.orden ?? 0), -1) + 1

  async function insertarPaso(campos, grupoId, orden) {
    const { data, error } = await supabase.from('sesion_fases').insert({
      sesion_id: sesionId, bloque_id: bloqueId, grupo_id: grupoId || null, orden, nombre: '', ...campos,
    }).select().single()
    if (error) { alert('No se pudo guardar el paso: ' + error.message); return null }
    return data
  }

  async function anadirPaso(tipo) {
    const p = await insertarPaso(valoresPorDefecto(tipo, perfil), null, siguienteOrden())
    if (p) { setItems(xs => [...xs, { type: 'fase', ...p }]); sucio() }
  }

  async function anadirGrupo() {
    const { data: g, error } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionId, bloque_id: bloqueId, repeticiones: 5, orden: siguienteOrden() }).select().single()
    if (error || !g) { alert('No se pudo crear el grupo: ' + (error?.message || '')); return }
    const activo = { ...valoresPorDefecto('activo', perfil), duracion_seg: 180 }
    const rec = { ...valoresPorDefecto('recuperacion', perfil), duracion_seg: 90 }
    const p1 = await insertarPaso(activo, g.id, 0)
    const p2 = await insertarPaso(rec, g.id, 1)
    setItems(xs => [...xs, { type: 'grupo', ...g, fases: [p1, p2].filter(Boolean) }]); sucio()
  }

  async function anadirPasoAGrupo(grupoId) {
    const g = items.find(it => it.id === grupoId)
    const p = await insertarPaso(valoresPorDefecto('recuperacion', perfil), grupoId, g?.fases.length || 0)
    if (p) { setItems(xs => xs.map(it => it.id === grupoId ? { ...it, fases: [...it.fases, p] } : it)); sucio() }
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
    sucio()
    await supabase.from('sesion_fases').delete().eq('id', id)
  }

  async function duplicarPaso(f, grupoId) {
    if (grupoId) {
      const g = items.find(it => it.id === grupoId)
      const idx = g.fases.findIndex(x => x.id === f.id)
      const p = await insertarPaso(copiaPaso(f), grupoId, (f.orden ?? idx) + 1)
      if (!p) return
      const nuevas = [...g.fases]; nuevas.splice(idx + 1, 0, p)
      await reordenarGrupo(grupoId, nuevas)
    } else {
      const idx = items.findIndex(it => it.id === f.id)
      const p = await insertarPaso(copiaPaso(f), null, siguienteOrden())
      if (!p) return
      const nuevos = [...items]; nuevos.splice(idx + 1, 0, { type: 'fase', ...p })
      await reordenar(nuevos)
    }
  }

  async function cambiarRepeticiones(grupoId, n) {
    const rep = Math.max(1, Math.min(50, n || 1))
    setItems(xs => xs.map(it => it.id === grupoId ? { ...it, repeticiones: rep } : it)); sucio()
    await supabase.from('sesion_fase_grupos').update({ repeticiones: rep }).eq('id', grupoId)
  }

  async function eliminarGrupo(grupoId) {
    if (!window.confirm('¿Eliminar este grupo de repeticiones y sus pasos?')) return
    setItems(xs => xs.filter(it => it.id !== grupoId)); sucio()
    await supabase.from('sesion_fases').delete().eq('grupo_id', grupoId)
    await supabase.from('sesion_fase_grupos').delete().eq('id', grupoId)
  }

  async function duplicarGrupo(grupoId) {
    const g = items.find(it => it.id === grupoId)
    const { data: ng } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionId, bloque_id: bloqueId, repeticiones: g.repeticiones, orden: siguienteOrden() }).select().single()
    if (!ng) return
    const fases = []
    for (let i = 0; i < g.fases.length; i++) { const p = await insertarPaso(copiaPaso(g.fases[i]), ng.id, i); if (p) fases.push(p) }
    const idx = items.findIndex(it => it.id === grupoId)
    const nuevos = [...items]; nuevos.splice(idx + 1, 0, { type: 'grupo', ...ng, fases })
    await reordenar(nuevos)
  }

  async function reordenar(nuevos) {
    const conOrden = nuevos.map((it, i) => ({ ...it, orden: i }))
    setItems(conOrden); sucio()
    await Promise.all(conOrden.map(it => it.type === 'grupo'
      ? supabase.from('sesion_fase_grupos').update({ orden: it.orden }).eq('id', it.id)
      : supabase.from('sesion_fases').update({ orden: it.orden }).eq('id', it.id)))
  }
  async function reordenarGrupo(grupoId, fases) {
    const conOrden = fases.map((f, i) => ({ ...f, orden: i }))
    setItems(xs => xs.map(it => it.id === grupoId ? { ...it, fases: conOrden } : it)); sucio()
    await Promise.all(conOrden.map(f => supabase.from('sesion_fases').update({ orden: f.orden }).eq('id', f.id)))
  }
  function mover(idx, d) {
    const j = idx + d
    if (j < 0 || j >= items.length) return
    const n = [...items]; [n[idx], n[j]] = [n[j], n[idx]]; reordenar(n)
  }
  function moverEnGrupo(grupoId, idx, d) {
    const g = items.find(it => it.id === grupoId)
    const j = idx + d
    if (!g || j < 0 || j >= g.fases.length) return
    const n = [...g.fases]; [n[idx], n[j]] = [n[j], n[idx]]; reordenarGrupo(grupoId, n)
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Gráfica */}
      {barras.length > 0 && (
        <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '10px 10px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 74, gap: 1 }}>
            {barras.map((b, i) => {
              const primeroDeGrupo = b.grupo && b.rep === 0 && b.f.id === b.grupo.fases[0]?.id
              return (
                <div key={i} title={`${labelTipoPaso(b.f.tipo_paso)}${b.f.nombre ? ' · ' + b.f.nombre : ''} · ${fmtDuracionPaso(duracionPaso(b.f)) || fmtDistancia(distanciaPaso(b.f))}`}
                  style={{ flex: `${segs[i]} 1 0`, minWidth: 2, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative', background: b.grupo ? 'rgba(76,130,232,.08)' : 'transparent' }}>
                  {primeroDeGrupo && <span style={{ position: 'absolute', top: 0, left: 2, fontSize: 10, fontWeight: 800, color: AZUL, fontFamily: 'var(--mono)' }}>{b.grupo.repeticiones}×</span>}
                  <div style={{ height: `${Math.round(intensidadPaso(b.f) * 100)}%`, background: colorTipoPaso(b.f.tipo_paso), borderRadius: '3px 3px 0 0', opacity: b.rep > 0 ? 0.75 : 1 }} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 11.5, color: 'var(--text2)', alignItems: 'center' }}>
            {totalSeg > 0 && <span><strong>{hayEstimados ? '~' : ''}{fmtDuracionPaso(totalSeg)}</strong></span>}
            {totalM > 0 && <span><strong>{fmtDistancia(totalM)}</strong></span>}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TIPOS_PASO.filter(t => barras.some(b => b.f.tipo_paso === t.key)).map(t => (
                <span key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--text3)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: t.color }} />{t.label}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}

      {/* Pasos */}
      {items.map((it, idx) => it.type === 'fase' ? (
        <Paso key={it.id} f={it} perfil={perfil} abierto={abierto === it.id} setAbierto={v => setAbierto(v ? it.id : null)}
          onCambio={patch => cambiarPaso(it.id, patch, null)}
          onEliminar={() => eliminarPaso(it.id, null)} onDuplicar={() => duplicarPaso(it, null)}
          onSubir={idx > 0 ? () => mover(idx, -1) : null} onBajar={idx < items.length - 1 ? () => mover(idx, 1) : null} />
      ) : (
        <div key={it.id} style={{ border: `1.5px solid ${AZUL}`, borderRadius: 12, background: '#f3f6ff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#e3ebff' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: AZUL }}>Repetir</span>
            <button className="btn btn-ghost btn-sm" onClick={() => cambiarRepeticiones(it.id, (it.repeticiones || 1) - 1)} style={{ padding: '0 7px' }}>−</button>
            <input type="number" value={it.repeticiones || 1} min={1} onChange={e => cambiarRepeticiones(it.id, parseInt(e.target.value, 10))}
              style={{ width: 44, textAlign: 'center', fontSize: 14, fontWeight: 800, color: AZUL, border: `1px solid ${AZUL}55`, borderRadius: 6, padding: '2px 4px', background: '#fff' }} />
            <button className="btn btn-ghost btn-sm" onClick={() => cambiarRepeticiones(it.id, (it.repeticiones || 1) + 1)} style={{ padding: '0 7px' }}>+</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: AZUL }}>veces</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              {idx > 0 && <button className="btn btn-ghost btn-sm" title="Subir" onClick={() => mover(idx, -1)} style={{ padding: '2px 6px' }}>↑</button>}
              {idx < items.length - 1 && <button className="btn btn-ghost btn-sm" title="Bajar" onClick={() => mover(idx, 1)} style={{ padding: '2px 6px' }}>↓</button>}
              <button className="btn btn-ghost btn-sm" title="Duplicar grupo" onClick={() => duplicarGrupo(it.id)} style={{ padding: '2px 6px' }}>⎘</button>
              <button className="btn btn-ghost btn-sm" title="Eliminar grupo" onClick={() => eliminarGrupo(it.id)} style={{ padding: '2px 6px', color: 'var(--danger)' }}>×</button>
            </span>
          </div>
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {it.fases.map((f, fi) => (
              <Paso key={f.id} f={f} perfil={perfil} abierto={abierto === f.id} setAbierto={v => setAbierto(v ? f.id : null)}
                onCambio={patch => cambiarPaso(f.id, patch, it.id)}
                onEliminar={() => eliminarPaso(f.id, it.id)} onDuplicar={() => duplicarPaso(f, it.id)}
                onSubir={fi > 0 ? () => moverEnGrupo(it.id, fi, -1) : null} onBajar={fi < it.fases.length - 1 ? () => moverEnGrupo(it.id, fi, 1) : null} />
            ))}
            <button className="btn btn-ghost btn-sm" onClick={() => anadirPasoAGrupo(it.id)} style={{ alignSelf: 'flex-start', color: AZUL }}>+ Paso en el grupo</button>
          </div>
        </div>
      ))}

      {/* Añadir */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TIPOS_PASO.filter(t => t.key !== 'descanso').map(t => (
          <button key={t.key} className="btn btn-ghost btn-sm" onClick={() => anadirPaso(t.key)}
            style={{ border: `1.5px solid ${t.color}`, color: 'var(--text)', background: `${t.color}14` }}>
            + {t.label}
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={anadirGrupo} style={{ border: `1.5px solid ${AZUL}`, color: AZUL, background: '#eef2ff', fontWeight: 600 }}>
          + Repeticiones
        </button>
      </div>
      {!perfil?.fc_max && !perfil?.fc_umbral && !perfil?.ritmo_umbral_seg && (
        <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Rellena la ficha «Perfil y zonas» del cliente para ver sus pulsaciones y ritmos en cada paso.</div>
      )}
    </div>
  )
}

/* ── Un paso ─────────────────────────────────────────────────────────── */
function Paso({ f, perfil, abierto, setAbierto, onCambio, onEliminar, onDuplicar, onSubir, onBajar }) {
  const color = colorTipoPaso(f.tipo_paso)
  const dist = distanciaPaso(f)
  const modo = dist && !f.duracion_seg ? 'dist' : 'tiempo'
  const [txtDur, setTxtDur] = useState(fmtDuracionPaso(duracionPaso(f)))
  const [txtDist, setTxtDist] = useState(dist ? String(dist) : '')
  const [nombre, setNombre] = useState(f.nombre || '')
  const [notas, setNotas] = useState(f.descripcion || '')
  const [min, setMin] = useState(f.objetivo_min ?? '')
  const [max, setMax] = useState(f.objetivo_max ?? '')
  useEffect(() => { setTxtDur(fmtDuracionPaso(duracionPaso(f))) }, [f.duracion_seg, f.volumen_min]) // eslint-disable-line
  useEffect(() => { setTxtDist(distanciaPaso(f) ? String(distanciaPaso(f)) : '') }, [f.distancia_m, f.volumen_km]) // eslint-disable-line
  useEffect(() => { setMin(f.objetivo_min ?? ''); setMax(f.objetivo_max ?? '') }, [f.objetivo_min, f.objetivo_max, f.objetivo_tipo])

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
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderLeft: `5px solid ${color}`, borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* Tipo */}
        <select value={f.tipo_paso || ''} onChange={e => onCambio({ tipo_paso: e.target.value || null })}
          style={{ ...inp, fontWeight: 700, color, borderColor: `${color}66`, background: `${color}12` }}>
          {!f.tipo_paso && <option value="">Paso</option>}
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
              style={{ ...inp, width: 70, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }} />
          ) : (
            <input value={txtDist} onChange={e => setTxtDist(e.target.value)} placeholder="400 m · 1,5 km"
              onBlur={() => { const m = parseDistancia(txtDist); if (m !== distanciaPaso(f)) onCambio({ distancia_m: m, volumen_km: null }); setTxtDist(m ? String(m) : '') }}
              style={{ ...inp, width: 82, textAlign: 'center', fontFamily: 'var(--mono)', fontWeight: 600 }} />
          )}
          {modo === 'dist' && dist ? <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDistancia(dist)}</span> : null}
        </div>

        {/* Intensidad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <select value={f.objetivo_tipo || ''} onChange={e => {
            const t = e.target.value || null
            const def = { fcmax: [70, 80], fcumbral: [85, 90], ritmo_umbral: [95, 100], ritmo_maraton: [100, 100], zona_fc: [2, 2], zona_ritmo: [2, 2], rpe: [5, 6] }[t] || [null, null]
            onCambio({ objetivo_tipo: t, objetivo_min: def[0], objetivo_max: def[1] })
          }} style={inp}>
            <option value="">Sin intensidad</option>
            {OBJETIVOS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
          {f.objetivo_tipo && (
            <>
              <input type="number" value={min} onChange={e => setMin(e.target.value)} onBlur={() => guardarRango(min, max)} style={{ ...inp, width: 52, textAlign: 'center' }} />
              <span style={{ color: 'var(--text3)' }}>–</span>
              <input type="number" value={max} onChange={e => setMax(e.target.value)} onBlur={() => guardarRango(min, max)} style={{ ...inp, width: 52, textAlign: 'center' }} />
            </>
          )}
          {personal && <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color, background: `${color}14`, borderRadius: 6, padding: '3px 7px' }}>{personal}</span>}
        </div>

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 1 }}>
          <button className="btn btn-ghost btn-sm" title="Nombre, notas y pendiente" onClick={() => setAbierto(!abierto)} style={{ padding: '2px 6px', color: abierto || f.descripcion || f.nombre ? 'var(--accent)' : 'var(--text3)' }}>✎</button>
          {onSubir && <button className="btn btn-ghost btn-sm" title="Subir" onClick={onSubir} style={{ padding: '2px 6px' }}>↑</button>}
          {onBajar && <button className="btn btn-ghost btn-sm" title="Bajar" onClick={onBajar} style={{ padding: '2px 6px' }}>↓</button>}
          <button className="btn btn-ghost btn-sm" title="Duplicar" onClick={onDuplicar} style={{ padding: '2px 6px' }}>⎘</button>
          <button className="btn btn-ghost btn-sm" title="Eliminar" onClick={onEliminar} style={{ padding: '2px 6px', color: 'var(--danger)' }}>×</button>
        </span>
      </div>

      {(f.nombre || f.descripcion) && !abierto && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5, lineHeight: 1.4 }}>
          {f.nombre && <strong style={{ color: 'var(--text)' }}>{f.nombre}</strong>}{f.nombre && f.descripcion ? ' · ' : ''}{f.descripcion}
        </div>
      )}

      {legado && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>
          Formato anterior: {[f.fc_zona && `Zona ${f.fc_zona}`, (f.ritmo_inicio || f.ritmo_fin) && `Ritmo ${f.ritmo_inicio || ''}${f.ritmo_fin ? '–' + f.ritmo_fin : ''}`, f.rpe && `RPE ${f.rpe}`].filter(Boolean).join(' · ')}
          {' '}(el cliente lo sigue viendo; elige una intensidad para sustituirlo)
        </div>
      )}

      {abierto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, marginTop: 8 }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} onBlur={() => nombre !== (f.nombre || '') && onCambio({ nombre })}
            placeholder="Nombre (opcional): «Series en cuesta»" style={inp} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}>
            Pendiente
            <input type="number" defaultValue={f.pendiente_pct_min ?? ''} onBlur={e => onCambio({ pendiente_pct_min: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inp, width: 50 }} />
            –
            <input type="number" defaultValue={f.pendiente_pct_max ?? ''} onBlur={e => onCambio({ pendiente_pct_max: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inp, width: 50 }} />
            %
          </div>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} onBlur={() => notas !== (f.descripcion || '') && onCambio({ descripcion: notas || null })}
            placeholder="Indicaciones para el cliente" rows={2} style={{ ...inp, gridColumn: '1 / -1', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
      )}
    </div>
  )
}
