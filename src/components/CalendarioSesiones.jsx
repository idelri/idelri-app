import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const TIPOS_ACTIVIDAD = [
  { value: 'fuerza',     label: 'Fuerza',     icono: '💪' },
  { value: 'correr',     label: 'Correr',     icono: '🏃' },
  { value: 'caminar',    label: 'Caminar',    icono: '🚶' },
  { value: 'bicicleta',  label: 'Bicicleta',  icono: '🚴' },
  { value: 'nadar',      label: 'Nadar',      icono: '🏊' },
  { value: 'movilidad',  label: 'Movilidad',  icono: '🤸' },
  { value: 'futbol',     label: 'Fútbol',     icono: '⚽' },
  { value: 'padel',      label: 'Pádel',      icono: '🎾' },
]
const ICONO_ACTIVIDAD = Object.fromEntries(TIPOS_ACTIVIDAD.map(t => [t.value, t.icono]))
function iconoSesion(s) {
  if (s?.icono) return s.icono
  const tipos = s?.tipos_actividad?.length > 0 ? s.tipos_actividad : (s?.tipo_actividad ? [s.tipo_actividad] : ['fuerza'])
  return tipos.map(t => ICONO_ACTIVIDAD[t] || '💪').join(' ')
}

function DiaMenu({ fecha, onNuevaSesion, onNuevaCompeticion, onNuevaValoracion, onNuevaNota }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, lineHeight: 1, padding: '0 2px', borderRadius: 4 }}>+</button>
      {open && (
        <div style={{ position: 'absolute', top: 20, right: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 130, overflow: 'hidden' }}>
          <button onClick={() => { onNuevaSesion(fecha); setOpen(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            💪 Sesión
          </button>
          <button onClick={() => { onNuevaCompeticion(fecha); setOpen(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            🏆 Competición
          </button>
          <button onClick={() => { onNuevaValoracion(fecha); setOpen(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            🔬 Evaluación
          </button>
          <button onClick={() => { onNuevaNota(fecha); setOpen(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            📝 Nota
          </button>
        </div>
      )}
    </div>
  )
}

export default function CalendarioSesiones({
  sesiones, competiciones = [], controles = [], notas = [],
  bloquesPlan, subbloquesPlan, packs = [],
  onAbrirSesion, onNuevaSesion, onNuevaCompeticion, onNuevaValoracion, onNuevaNota, onAbrirNota,
  onEliminar, onMoverSesion,
  clipboard, onCopiar, onPegar, onPegarOtroCliente,
  clipboardSemana, onCopiarSemana, onPegarSemana, onPegarSemanaOtroCliente,
  arrastrando: arrastandoExterno, setArrastrando: setArrastrandoExterno,
  semanasMap = {}, semanaSeleccionada, onSemanaClick,
  feedbacksMap = {},
  // 5.6D: array de semanas del plan (con fecha_inicio_semana, numero_cliente, bloque_id)
  semanasAll = [],
  // Drag & drop mode: 'mover' | 'copiar'
  modoDrag = 'mover', setModoDrag,
}) {
  const [vista, setVista] = useState('mes')
  const [cursor, setCursor] = useState(new Date())
  const [arrastandoInterno, setArrastrandoInterno] = useState(null)
  const arrastrando = arrastandoExterno !== undefined ? arrastandoExterno : arrastandoInterno
  const setArrastrando = setArrastrandoExterno || setArrastrandoInterno
  const [seleccionados, setSeleccionados] = useState(new Set()) // ids seleccionados con Cmd/Ctrl
  const [menu, setMenu] = useState(null)
  const [tooltip, setTooltip] = useState(null) // { x, y, sesionId, data }
  const [fbTooltip, setFbTooltip] = useState(null) // { x, y, sesion, fb }
  const [dragOver, setDragOver] = useState(null) // { itemId, pos: 'before'|'after' }
  const [localOrder, setLocalOrder] = useState({}) // { fecha: id[] } orden optimista
  const dragWithinRef = useRef(null) // { itemId, fecha } — síncrono, evita stale closure
  const fbTooltipTimer = useRef(null)
  const itemsMapRef = useRef({}) // id→item para recuperar objetos al soltar selección múltiple

  function mostrarFbTooltip(e, sesion, fb) {
    const rect = e.currentTarget.getBoundingClientRect()
    clearTimeout(fbTooltipTimer.current)
    fbTooltipTimer.current = setTimeout(() => {
      setFbTooltip({ x: rect.right + 8, y: rect.top, sesion, fb })
    }, 200)
  }
  function ocultarFbTooltip() {
    clearTimeout(fbTooltipTimer.current)
    setFbTooltip(null)
  }

  async function reordenarEnDia(fecha, fromId, toId, pos) {
    const rawItems = sesionPorDia[fecha] || []
    const sortable = rawItems.filter(s => s._tipo === 'sesion' || s._tipo === 'nota')
    const rawIds = sortable.map(s => s.id)
    const ids = localOrder[fecha] || rawIds
    const sin = ids.filter(id => id !== fromId)
    const idx = sin.indexOf(toId)
    if (idx < 0) return
    sin.splice(pos === 'before' ? idx : idx + 1, 0, fromId)
    setLocalOrder(prev => ({ ...prev, [fecha]: sin }))
    await Promise.all(sin.map((id, i) => {
      const it = rawItems.find(s => s.id === id)
      if (!it) return Promise.resolve()
      const tabla = it._tipo === 'sesion' ? 'sesiones' : 'sesion_notas'
      return supabase.from(tabla).update({ orden: i }).eq('id', id)
    }))
  }
  const tooltipTimer = useRef(null)

  // Contenido del tooltip cacheado por sesión: solo se pide a la base de datos
  // la primera vez que pasas el ratón por cada sesión.
  const tooltipCache = useRef(new Map())
  const tooltipPeticion = useRef(0)

  async function cargarContenidoTooltip(sesion) {
    const cache = tooltipCache.current
    if (cache.has(sesion.id)) return cache.get(sesion.id)
    let contenido
    if (sesion.tipo_editor === 'carrera') {
      const [{ data: fases }, { data: grupos }] = await Promise.all([
        supabase.from('sesion_fases').select('nombre, descripcion, orden, grupo_id').eq('sesion_id', sesion.id).order('orden'),
        supabase.from('sesion_fase_grupos').select('id, repeticiones, orden').eq('sesion_id', sesion.id).order('orden'),
      ])
      contenido = { fases: fases || [], grupos: grupos || [], bloques: [] }
    } else {
      const { data: bloques } = await supabase.from('sesion_bloques').select('id, nombre, color, sesion_ejercicios(nombre, orden)').eq('sesion_id', sesion.id).order('orden')
      contenido = { bloques: bloques || [], fases: [] }
    }
    cache.set(sesion.id, contenido)
    return contenido
  }

  async function mostrarTooltip(e, sesion) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = rect.right + 8
    const y = rect.top
    clearTimeout(tooltipTimer.current)
    const peticion = ++tooltipPeticion.current
    tooltipTimer.current = setTimeout(async () => {
      if (sesion._tipo === 'nota') {
        setTooltip({ x, y, sesion, bloques: [], fases: [] })
        return
      }
      const contenido = await cargarContenidoTooltip(sesion)
      // Si el ratón ya se ha ido (o ha pasado a otra sesión), no mostrar
      if (peticion !== tooltipPeticion.current) return
      setTooltip({ x, y, sesion, ...contenido })
    }, 300)
  }

  function ocultarTooltip() {
    clearTimeout(tooltipTimer.current)
    tooltipPeticion.current++
    setTooltip(null)
  }

  const inicioMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const inicioSemana = new Date(cursor)
  inicioSemana.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7))

  const diasMes = () => {
    const dias = []
    const inicio = new Date(inicioMes)
    inicio.setDate(1 - ((inicioMes.getDay() + 6) % 7))
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicio); d.setDate(inicio.getDate() + i); dias.push(d)
    }
    return dias
  }

  const diasSemana = () => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemana); d.setDate(inicioSemana.getDate() + i); return d
  })

  const dias = vista === 'mes' ? diasMes() : diasSemana()
  const hoy = new Date()
  const lunesHoy = new Date(hoy); lunesHoy.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  // Columna de la franja de semana + 7 días
  const COLUMNAS = '140px repeat(7, minmax(0, 1fr))'
  const fKey = d => format(d, 'yyyy-MM-dd')

  // 5.6D: resolución de info de semana desde semanasAll (fuente de verdad)
  // Devuelve { semanaCliente, semanaData, bloque?, sub?, bloqueNum?, subNum?, semanaNum? }
  function infoSemana(lunes) {
    const lunKey = format(lunes, 'yyyy-MM-dd')
    // Buscar en semanasAll por fecha_inicio_semana (preferir filas con bloque_id si hay solapados)
    const candidates = semanasAll.filter(s => s.fecha_inicio_semana === lunKey)
    if (candidates.length === 0) return null
    // Preferir la que tiene bloque_id si existe (más información)
    const sem = candidates.find(s => s.bloque_id) || candidates[0]

    const result = { semanaCliente: sem.numero_cliente, semanaData: sem }

    if (sem.bloque_id) {
      const bloque = (bloquesPlan || []).find(b => b.id === sem.bloque_id)
      if (bloque) {
        const bloqueIdx = (bloquesPlan || []).findIndex(b => b.id === sem.bloque_id)
        const subs = (subbloquesPlan || {})[sem.bloque_id] || []
        const msInicio = new Date(bloque.fecha_inicio + 'T12:00:00').getTime()
        const msLunes = new Date(lunKey + 'T12:00:00').getTime()
        const semanaNumBloque = Math.floor((msLunes - msInicio) / (7 * 86400000)) + 1
        const sub = subs.find(s => semanaNumBloque >= s.semana_inicio && semanaNumBloque <= s.semana_fin)
        const subIdx = subs.findIndex(s => s.id === sub?.id)
        result.bloque = bloque
        result.bloqueNum = bloqueIdx + 1
        result.semanaNum = semanaNumBloque // compatibilidad legacy
        result.sub = sub
        result.subNum = subIdx + 1
      }
    }
    return result
  }

  // Fallback legacy: cuando no hay semanasAll, usar bloques directamente
  function bloqueDeFecha(fecha) {
    for (const b of (bloquesPlan || [])) {
      const inicio = new Date(b.fecha_inicio + 'T12:00:00')
      const fin = new Date(inicio); fin.setDate(fin.getDate() + b.semanas * 7 - 1)
      if (fecha >= inicio && fecha <= fin) {
        const diasDesdeInicio = Math.floor((fecha - inicio) / 86400000)
        const semanaNum = Math.floor(diasDesdeInicio / 7) + 1
        const subs = (subbloquesPlan || {})[b.id] || []
        const sub = subs.find(s => semanaNum >= s.semana_inicio && semanaNum <= s.semana_fin)
        const subIdx = subs.findIndex(s => s.id === sub?.id)
        const bloqueIdx = (bloquesPlan || []).findIndex(bb => bb.id === b.id)
        return { bloque: b, sub, bloqueNum: bloqueIdx + 1, subNum: subIdx + 1, semanaNum }
      }
    }
    return null
  }

  // Si semanasAll está vacío, fallback a lógica legacy por bloques
  function resolverInfoSemana(lunes) {
    if (semanasAll.length > 0) return infoSemana(lunes)
    const jueves = new Date(lunes); jueves.setDate(jueves.getDate() + 3)
    const legacy = bloqueDeFecha(jueves)
    if (!legacy) return null
    return { ...legacy, semanaCliente: null, semanaData: null }
  }

  const sesionPorDia = {}
  sesiones.filter(s => s.fecha || s._fechaVisual).forEach(s => {
    const key = s._fechaVisual || s.fecha
    if (!sesionPorDia[key]) sesionPorDia[key] = []
    sesionPorDia[key].push({ ...s, _tipo: 'sesion' })
  })
  competiciones.filter(c => c.fecha).forEach(c => {
    if (!sesionPorDia[c.fecha]) sesionPorDia[c.fecha] = []
    sesionPorDia[c.fecha].push({ ...c, _tipo: 'competicion' })
  })
  controles.filter(c => c.fecha).forEach(c => {
    if (!sesionPorDia[c.fecha]) sesionPorDia[c.fecha] = []
    sesionPorDia[c.fecha].push({ ...c, _tipo: 'control' })
  })
  notas.filter(n => n.fecha).forEach(n => {
    if (!sesionPorDia[n.fecha]) sesionPorDia[n.fecha] = []
    sesionPorDia[n.fecha].push({ ...n, _tipo: 'nota' })
  })

  const navPrev = () => {
    if (vista === 'mes') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
    else { const d = new Date(cursor); d.setDate(d.getDate() - 7); setCursor(d) }
  }
  const navNext = () => {
    if (vista === 'mes') setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
    else { const d = new Date(cursor); d.setDate(d.getDate() + 7); setCursor(d) }
  }

  const titulo = vista === 'mes'
    ? format(cursor, 'MMMM yyyy', { locale: es })
    : `${format(inicioSemana, 'dd MMM', { locale: es })} — ${format(dias[6], 'dd MMM yyyy', { locale: es })}`

  function cerrarMenu() { setMenu(null) }

  return (
    <div onClick={e => { cerrarMenu(); if (!e.metaKey && !e.ctrlKey) setSeleccionados(new Set()) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={navPrev}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize', minWidth: 160, textAlign: 'center' }}>{titulo}</span>
        <button className="btn btn-ghost btn-sm" onClick={navNext}>›</button>
        {clipboard && (
          <>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', background: 'var(--accent-light)', padding: '3px 8px', borderRadius: 6 }}>📋 {clipboard.titulo || clipboard.nombre || clipboard.texto} copiada</span>
            {onPegarOtroCliente && <button className="btn btn-ghost btn-sm" onClick={onPegarOtroCliente}>→ Otro cliente</button>}
          </>
        )}
        {clipboardSemana && (
          <>
            <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--mono)', background: 'var(--accent-light)', padding: '3px 8px', borderRadius: 6 }}>📅 Semana copiada ({clipboardSemana.items.length})</span>
            {onPegarSemanaOtroCliente && <button className="btn btn-ghost btn-sm" onClick={onPegarSemanaOtroCliente}>→ Otro cliente</button>}
          </>
        )}
        <div className="flex gap-1" style={{ marginLeft: 'auto', alignItems: 'center' }}>
          {seleccionados.size > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: 'var(--accent)', color: '#fff', whiteSpace: 'nowrap' }}>
              {seleccionados.size} seleccionada{seleccionados.size > 1 ? 's' : ''}
            </span>
          )}
          {setModoDrag && (
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg2)', borderRadius: 8, padding: '2px', gap: 2, marginRight: 6 }}>
              {[
                { key: 'mover', label: '✂️ Mover', title: 'Mover: la sesión se quita del día original' },
                { key: 'copiar', label: '📋 Copiar', title: 'Copiar: la sesión queda en ambos días' },
              ].map(opt => (
                <button
                  key={opt.key}
                  title={opt.title}
                  onClick={() => setModoDrag(opt.key)}
                  style={{
                    padding: '3px 10px',
                    fontSize: 11,
                    fontWeight: modoDrag === opt.key ? 700 : 400,
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: modoDrag === opt.key ? 'var(--accent)' : 'transparent',
                    color: modoDrag === opt.key ? '#fff' : 'var(--text3)',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {['mes', 'semana'].map(v => (
            <button key={v} className="btn btn-ghost btn-sm" style={vista === v ? { background: 'var(--bg2)', fontWeight: 600 } : {}} onClick={() => setVista(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
        {/* Cabecera: columna de semana + días */}
        <div style={{ display: 'grid', gridTemplateColumns: COLUMNAS, background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '7px 10px', fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Semana</div>
          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(d => (
            <div key={d} style={{ padding: '7px 8px', fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.5px', borderLeft: '1px solid var(--border)' }}>{d}</div>
          ))}
        </div>

        {Array.from({ length: Math.ceil(dias.length / 7) }, (_, semIdx) => {
          const diasSem = dias.slice(semIdx * 7, semIdx * 7 + 7)
          const lunes = diasSem[0]
          const info = resolverInfoSemana(lunes)
          const semanaDotKey = info?.semanaData?.fecha_inicio_semana
            || (info?.bloque ? `${info.bloque.id}_${info.semanaNum}` : null)
          const colorFase = info?.bloque?.color || null
          const esSemanaActual = fKey(lunes) === fKey(lunesHoy)
          const seleccionada = !!(info && semanaSeleccionada && (semanaSeleccionada.semanaCliente === info.semanaCliente || (semanaSeleccionada.bloqueId === info.bloque?.id && semanaSeleccionada.semanaNum === info.semanaNum)))
          const objetivoSemana = info?.semanaData?.objetivo
          const tieneComentario = semanaDotKey && semanasMap[semanaDotKey]?.comentario
          // En la vista mes, saltar semanas enteras de otro mes
          if (vista === 'mes' && diasSem.every(d => d.getMonth() !== cursor.getMonth())) return null
          return (
            <div key={semIdx} style={{ display: 'grid', gridTemplateColumns: COLUMNAS, borderTop: semIdx > 0 ? '1px solid var(--border)' : 'none', outline: esSemanaActual ? `2px solid ${colorFase || 'var(--accent)'}` : 'none', outlineOffset: -2 }}>
              {/* Franja de fase */}
              <div onClick={() => info && onSemanaClick && onSemanaClick(info, diasSem)}
                style={{ background: colorFase || 'var(--bg2)', color: colorFase ? '#fff' : 'var(--text3)', padding: '9px 9px 8px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, cursor: info && onSemanaClick ? 'pointer' : 'default', boxShadow: seleccionada ? 'inset 0 0 0 3px rgba(255,255,255,.75)' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                    {info ? `S${info.semanaCliente != null ? info.semanaCliente : info.semanaNum}` : format(lunes, 'd MMM', { locale: es })}
                  </span>
                  {tieneComentario && <span title="Tiene observaciones" style={{ width: 7, height: 7, borderRadius: '50%', background: colorFase ? '#fff' : 'var(--accent)', flexShrink: 0 }} />}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 1 }}>
                    {onCopiarSemana && (
                      <button title="Copiar semana" onClick={e => { e.stopPropagation(); onCopiarSemana(diasSem) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.75, padding: '0 1px', lineHeight: 1 }}>📋</button>
                    )}
                    {clipboardSemana && onPegarSemana && (
                      <button title="Pegar semana aquí" onClick={e => { e.stopPropagation(); onPegarSemana(diasSem[0]) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.75, padding: '0 1px', lineHeight: 1 }}>📌</button>
                    )}
                  </span>
                </div>
                {info?.bloque && (
                  <div style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.25 }}>{info.bloque.nombre}</div>
                )}
                {info?.bloque && (
                  <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', opacity: .85 }}>
                    sem {info.semanaNum}/{info.bloque.semanas}{info.sub ? ` · ${info.sub.nombre}` : ''}
                  </div>
                )}
                {objetivoSemana && (
                  <div title={objetivoSemana} style={{ fontSize: 10, opacity: .9, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: vista === 'mes' ? 3 : 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{objetivoSemana}</div>
                )}
              </div>

              {/* Días */}
              {diasSem.map((dia, i) => {
                const key = fKey(dia)
                const esMesActual = vista === 'semana' || dia.getMonth() === cursor.getMonth()
                const esHoy = fKey(dia) === fKey(hoy)
                const rawSesDia = (sesionPorDia[key] || []).slice().sort((a, b) => {
                  const ao = a.orden ?? 9999
                  const bo = b.orden ?? 9999
                  return ao - bo
                })
                const orderOverride = localOrder[key]
                const sesDia = orderOverride
                  ? [
                      ...orderOverride.map(id => rawSesDia.find(s => s.id === id)).filter(Boolean),
                      ...rawSesDia.filter(s => !orderOverride.includes(s.id)),
                    ]
                  : rawSesDia
                const packDia = packs.find(p => key >= p.fecha_inicio && key <= p.fecha_fin)
                return (
                  <div key={i}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      if (!arrastrando) return
                      if (seleccionados.has(arrastrando.id) && seleccionados.size > 1) {
                        const items = [...seleccionados].map(id => itemsMapRef.current[id]).filter(Boolean)
                        onMoverSesion(items, key, modoDrag)
                        setSeleccionados(new Set())
                      } else {
                        onMoverSesion(arrastrando, key, modoDrag)
                      }
                      // Limpiar el estado de arrastre aquí: la sesión se mueve al
                      // instante y su elemento original desaparece, así que su
                      // onDragEnd ya no llega (y se quedaría semitransparente).
                      dragWithinRef.current = null
                      setDragOver(null)
                      setArrastrando(null)
                    }}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, fecha: key }) }}
                    style={{ background: packDia ? '#f0f9ff' : esMesActual ? 'var(--bg)' : 'var(--bg2)', borderLeft: '1px solid var(--border)', minHeight: vista === 'mes' ? 104 : 170, padding: '5px 5px 7px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, opacity: esMesActual ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: esHoy ? 700 : 500, color: esHoy ? '#fff' : 'var(--text2)', background: esHoy ? (colorFase || 'var(--accent)') : 'transparent', borderRadius: 10, minWidth: 20, height: 20, padding: esHoy ? '0 6px' : 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {dia.getDate()}
                      </span>
                      <DiaMenu fecha={key} onNuevaSesion={onNuevaSesion} onNuevaCompeticion={onNuevaCompeticion} onNuevaValoracion={onNuevaValoracion} onNuevaNota={onNuevaNota} />
                    </div>
                    {packDia && <span style={{ fontSize: 8.5, color: '#0369a1', fontWeight: 600, letterSpacing: '0.03em', lineHeight: 1, paddingBottom: 1 }}>📦 {packDia.nombre}</span>}
                    {sesDia.map(item => {
                      const estadoColor = item._tipo === 'sesion' ? (item._estadoColor || null) : null
                      const tipoEstilo = {
                        sesion:      estadoColor
                          ? { background: estadoColor + '1f', color: 'var(--text)', border: `1px solid ${estadoColor}66`, borderLeft: `3px solid ${colorFase || 'var(--accent)'}` }
                          : { background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderLeft: `3px solid ${colorFase || 'var(--accent)'}` },
                        competicion: { background: '#fde9c4', color: '#7a4a00', border: '1px solid #f3c77a', fontWeight: 700 },
                        control:     { background: '#eef2ff', color: '#3730a3', border: '1px solid transparent' },
                        nota:        { background: '#fef6c7', color: '#5a3600', border: '1px solid transparent', fontWeight: 400 },
                      }[item._tipo]
                      const icono = item._tipo === 'sesion' ? iconoSesion(item) : { competicion: '🏆', control: '🔬', nota: '' }[item._tipo]
                      const texto = item._tipo === 'nota' ? item.texto : (item.nombre || item.titulo)
                      const isDragTarget = dragOver?.itemId === item.id
                      const lineStyle = { height: 2, background: '#2d6a4f', borderRadius: 1, flexShrink: 0, pointerEvents: 'none' }
                      const els = []
                      if (isDragTarget && dragOver.pos === 'before') els.push(<div key={`lb-${item.id}`} style={lineStyle} />)
                      itemsMapRef.current[item.id] = item
                      const estaSeleccionado = seleccionados.has(item.id)
                      els.push(
                        <div key={item.id}
                          draggable={true}
                          onDragStart={() => {
                            const sortable = item._tipo === 'sesion' || item._tipo === 'nota'
                            const dw = sortable ? { itemId: item.id, fecha: key } : null
                            dragWithinRef.current = dw
                            setArrastrando(item); ocultarTooltip()
                          }}
                          onDragEnd={() => { dragWithinRef.current = null; setArrastrando(null); setDragOver(null) }}
                          onDragOver={e => {
                            e.preventDefault()
                            const dw = dragWithinRef.current
                            const sortable = item._tipo === 'sesion' || item._tipo === 'nota'
                            if (sortable && dw && dw.fecha === key && dw.itemId !== item.id) {
                              e.stopPropagation()
                              const rect = e.currentTarget.getBoundingClientRect()
                              setDragOver({ itemId: item.id, pos: e.clientY < rect.top + rect.height / 2 ? 'before' : 'after' })
                            }
                          }}
                          onDrop={e => {
                            e.preventDefault()
                            const dw = dragWithinRef.current
                            const sortable = item._tipo === 'sesion' || item._tipo === 'nota'
                            if (sortable && dw && dw.fecha === key && dw.itemId !== item.id) {
                              e.stopPropagation()
                              reordenarEnDia(key, dw.itemId, item.id, dragOver?.pos || 'after')
                              dragWithinRef.current = null; setArrastrando(null); setDragOver(null)
                            }
                          }}
                          onClick={e => {
                            if ((e.metaKey || e.ctrlKey) && item._tipo === 'sesion') {
                              e.stopPropagation()
                              setSeleccionados(prev => {
                                const next = new Set(prev)
                                if (next.has(item.id)) next.delete(item.id)
                                else next.add(item.id)
                                return next
                              })
                              return
                            }
                            setSeleccionados(new Set())
                            if (item._tipo === 'sesion') onAbrirSesion(item)
                            else if (item._tipo === 'nota' && onAbrirNota) onAbrirNota(item)
                          }}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, fecha: key, item }) }}
                          onMouseEnter={e => {
                            const fb = item._tipo === 'sesion' ? feedbacksMap[item.id] : null
                            if (fb) { ocultarTooltip(); mostrarFbTooltip(e, item, fb) }
                            else if (item._tipo === 'sesion' || item._tipo === 'nota') mostrarTooltip(e, item)
                          }}
                          onMouseLeave={() => { ocultarTooltip(); ocultarFbTooltip() }}
                          style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.3, padding: '4px 5px', borderRadius: 6, ...tipoEstilo, cursor: 'grab', display: 'flex', alignItems: 'flex-start', gap: 4, width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', position: 'relative', opacity: dragWithinRef.current?.itemId === item.id ? 0.4 : 1, userSelect: 'none', outline: estaSeleccionado ? '2px solid var(--accent)' : 'none', outlineOffset: '1px' }}>
                          {icono && <span style={{ flexShrink: 0 }}>{icono}</span>}
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }} title={item._prevista ? `Prevista: ${item._prevista}` : texto}>
                            {texto}{item._prevista ? <span style={{ opacity: 0.6, marginLeft: 2 }}>↩</span> : null}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, marginTop: 2 }}>
                            {item._tipo === 'sesion' && (
                              <span title={item.publicada === false ? 'Oculta al cliente 🔒' : item.lista ? 'Sesión lista ✅' : 'En preparación 📝'}
                                style={{ width: 6, height: 6, borderRadius: '50%', background: item.publicada === false ? '#94a3b8' : item.lista ? '#16a34a' : '#f97316', display: 'inline-block', flexShrink: 0 }} />
                            )}
                            {item._tipo === 'sesion' && feedbacksMap[item.id] && (
                              <span title="Tiene feedback" style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308', display: 'inline-block', flexShrink: 0 }} />
                            )}
                            <span onClick={e => { e.stopPropagation(); onEliminar(item) }} style={{ opacity: 0.5, cursor: 'pointer', lineHeight: 1, marginTop: -2 }}>×</span>
                          </span>
                        </div>
                      )
                      if (isDragTarget && dragOver.pos === 'after') els.push(<div key={`la-${item.id}`} style={lineStyle} />)
                      return els
                    }).flat()}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {menu && (
        <div onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: menu.y, left: menu.x, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 14px rgba(0,0,0,0.18)', zIndex: 100, minWidth: 160, overflow: 'hidden' }}>
          {menu.item && (
            <button onClick={() => { onCopiar(menu.item); cerrarMenu() }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              📋 Copiar
            </button>
          )}
          {menu.item?._tipo === 'sesion' && menu.item?.token_publico && (
            <button onClick={() => {
              const url = `${window.location.origin}/sesion/${menu.item.token_publico}`
              navigator.clipboard.writeText(url).catch(() => {})
              alert(`Enlace copiado:\n${url}`)
              cerrarMenu()
            }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              🔗 Compartir enlace
            </button>
          )}
          {clipboard && (
            <button onClick={() => { onPegar(clipboard, menu.fecha); cerrarMenu() }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              📌 Pegar aquí
            </button>
          )}
        </div>
      )}

      {tooltip && (
        <div onMouseEnter={() => clearTimeout(tooltipTimer.current)} onMouseLeave={ocultarTooltip}
          style={{ position: 'fixed', top: Math.min(tooltip.y, window.innerHeight - 300), left: Math.min(tooltip.x, window.innerWidth - 240), zIndex: 200, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', minWidth: 200, maxWidth: 260, padding: '10px 12px', pointerEvents: tooltip.sesion._tipo === 'nota' ? 'auto' : 'none', cursor: tooltip.sesion._tipo === 'nota' ? 'pointer' : 'default' }}
          onClick={() => { if (tooltip.sesion._tipo === 'nota' && onAbrirNota) { onAbrirNota(tooltip.sesion); ocultarTooltip() } }}>
          {tooltip.sesion._tipo === 'nota' ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#854d0e', marginBottom: 6 }}>📝 Nota</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{tooltip.sesion.texto || '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>Clic para editar</div>
            </>
          ) : (
          <>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>{iconoSesion(tooltip.sesion)}</span>
            <span>{tooltip.sesion.titulo}</span>
          </div>
          {tooltip.sesion.duracion_min && (
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>⏱ {tooltip.sesion.duracion_min} min</div>
          )}
          {tooltip.fases?.length > 0 ? (() => {
            const gruposMap = {}
            for (const g of tooltip.grupos || []) gruposMap[g.id] = { ...g, fases: [] }
            const sueltas = []
            for (const f of tooltip.fases) {
              if (f.grupo_id && gruposMap[f.grupo_id]) gruposMap[f.grupo_id].fases.push(f)
              else sueltas.push(f)
            }
            const items = [
              ...Object.values(gruposMap).sort((a, b) => a.orden - b.orden),
              ...sueltas,
            ].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999))
            return items.map((item, i) => item.fases ? (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>🔁 {item.repeticiones}×</div>
                {item.fases.map((f, j) => (
                  <div key={j} style={{ paddingLeft: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>▸ {f.nombre || 'Fase'}</div>
                    {f.descripcion && <div style={{ fontSize: 10.5, color: 'var(--text2)', paddingLeft: 10, lineHeight: 1.5 }}>{f.descripcion}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>▸ {item.nombre || 'Fase'}</div>
                {item.descripcion && <div style={{ fontSize: 10.5, color: 'var(--text2)', paddingLeft: 10, lineHeight: 1.5 }}>{item.descripcion}</div>}
              </div>
            ))
          })() : tooltip.bloques.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Sin contenido</div>
          ) : (
            tooltip.bloques.map(b => (
              <div key={b.id} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: b.color || '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{b.nombre || 'Bloque'}</span>
                </div>
                {(b.sesion_ejercicios || []).sort((a,z) => a.orden - z.orden).map((e, i) => (
                  <div key={i} style={{ fontSize: 10.5, color: 'var(--text2)', paddingLeft: 13, lineHeight: 1.6 }}>· {e.nombre || '—'}</div>
                ))}
              </div>
            ))
          )}
          </>
          )}
        </div>
      )}

      {fbTooltip && (() => {
        const { sesion, fb } = fbTooltip
        const d = fb.data || {}
        const status = d.completion?.status
        const rpe = d.rpe?.value
        const comentario = d.comentario_libre || d.comentario || d.notas_cliente || ''
        const statusLabel = { completed: '✅ Completada', partial: '⚠️ Parcial', missed: '❌ No realizada' }[status] || null
        const statusBg = { completed: '#dcfce7', partial: '#fef9c3', missed: '#fee2e2' }[status] || 'var(--bg2)'
        const statusFg = { completed: '#16a34a', partial: '#ca8a04', missed: '#dc2626' }[status] || 'var(--text2)'
        return (
          <div
            onMouseEnter={() => clearTimeout(fbTooltipTimer.current)}
            onMouseLeave={ocultarFbTooltip}
            style={{ position: 'fixed', top: Math.min(fbTooltip.y, window.innerHeight - 220), left: Math.min(fbTooltip.x, window.innerWidth - 240), zIndex: 300, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.15)', minWidth: 200, maxWidth: 240, padding: '10px 12px', pointerEvents: 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              💬 Feedback del cliente
            </div>
            {statusLabel && (
              <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: statusBg, color: statusFg, marginBottom: 6 }}>
                {statusLabel}
              </div>
            )}
            {rpe != null && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Esfuerzo percibido (RPE)</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${rpe * 10}%`, height: '100%', background: rpe >= 8 ? '#ef4444' : rpe >= 6 ? '#eab308' : '#22c55e', borderRadius: 3 }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', minWidth: 22, textAlign: 'right' }}>{rpe}/10</span>
                </div>
              </div>
            )}
            {comentario ? (
              <div style={{ fontSize: 10.5, color: 'var(--text2)', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, fontStyle: 'italic' }}>
                "{comentario.length > 80 ? comentario.slice(0, 80) + '…' : comentario}"
              </div>
            ) : null}
            {!statusLabel && !rpe && !comentario && (
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>Sin detalles</div>
            )}
            <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 6 }}>Clic en la sesión para ver completo</div>
          </div>
        )
      })()}
    </div>
  )
}
