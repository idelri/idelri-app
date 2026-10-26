/**
 * TimelinePlan — vista Timeline de la planificación con el formato de la app FCB:
 * Visión Macro (semanas agrupadas por mes), Meso (3 semanas día a día) y Micro
 * (una semana en detalle). Filas agrupadas por colores:
 *   Calendarización (fechas y eventos) · Periodización (bloque y subbloque)
 *   Planificación (carga del día) · Programación (sesiones)
 * Arriba: grupos visibles, Hoy, selector de periodo con calendario y selector de visión.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { format, parseISO, addDays, addWeeks, startOfWeek, differenceInCalendarDays, isSameDay, isSameMonth, startOfMonth, endOfMonth, addMonths, eachDayOfInterval, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { textoPlano, tituloTexto } from './TextoEstructurado'
import { supabase } from '../lib/supabase'
import { useCategorias } from './Categorias'

const GRUPOS = {
  cal: { label: 'Calendarización', color: '#2f6fdb', bg: '#eef3fd', soft: '#f6f9fe', icono: '▣' },
  per: { label: 'Periodización',   color: '#cf4646', bg: '#fdeeee', soft: '#fff7f7', icono: '⚑' },
  pla: { label: 'Planificación',   color: '#c18f05', bg: '#fdf5dc', soft: '#fffbec', icono: '▤' },
  pro: { label: 'Programación',    color: '#2f9e63', bg: '#e7f5ed', soft: '#f3faf6', icono: '◉' },
}

const VARS = [
  { key: 'carga_interna', label: 'RPE × min', corto: 'RPE×min', agr: 'suma' },
  { key: 'duracion_real', label: 'Duración realizada', corto: 'min', agr: 'suma' },
  { key: 'duracion_plan', label: 'Duración planificada', corto: 'min', agr: 'suma' },
  { key: 'rpe',           label: 'RPE', corto: 'RPE', agr: 'media' },
  { key: 'km_real',       label: 'Km realizados', corto: 'km', agr: 'suma' },
  { key: 'km_objetivo',   label: 'Km planificados', corto: 'km', agr: 'suma' },
]

const k = d => format(d, 'yyyy-MM-dd')
const lunes = d => startOfWeek(d, { weekStartsOn: 1 })
const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']

function iconoSesion(s) {
  if (s.icono) return s.icono
  const t = (s.titulo || '').toLowerCase()
  if (/fuerza|gym|pesas|core|funcional/.test(t)) return '💪'
  if (/rodaje|carrera|run|trote|series|tempo/.test(t)) return '🏃'
  if (/movilidad|yoga|estiram/.test(t)) return '🧘'
  if (/bici|ciclis/.test(t)) return '🚴'
  if (/nadar|piscina/.test(t)) return '🏊'
  if (/partido|fútbol|futbol/.test(t)) return '⚽'
  return '⚡'
}

function estadoColor(s, fb) {
  const st = fb?.data?.completion?.status
  if (st === 'completed' || st === 'completada' || s.estado === 'completada') return '#16a34a'
  if (st === 'partial' || s.estado === 'parcial') return '#ca8a04'
  if (st === 'missed' || s.estado === 'no_realizada') return '#dc2626'
  return null
}

/** Valor de una variable de carga para una lista de sesiones (un día) */
function valorCarga(key, ses, fbMap) {
  if (!ses.length) return null
  const fbs = ses.map(s => fbMap.get(s.id)).filter(Boolean)
  if (key === 'duracion_plan') { const v = ses.reduce((a, s) => a + (Number(s.duracion_min) || 0), 0); return v || null }
  if (key === 'duracion_real') { const v = fbs.reduce((a, f) => a + (Number(f.data?.duration?.minutes) || 0), 0); return v || null }
  if (key === 'rpe') { const v = fbs.map(f => f.data?.rpe?.value).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null }
  if (key === 'carga_interna') { const v = fbs.reduce((a, f) => { const r = f.data?.rpe?.value, m = f.data?.duration?.minutes; return r != null && m ? a + r * m : a }, 0); return v || null }
  if (key === 'km_real') { const v = ses.reduce((a, s) => a + (Number(s.km_real) || 0), 0); return v || null }
  if (key === 'km_objetivo') { const v = ses.reduce((a, s) => a + (Number(s.km_objetivo) || 0), 0); return v || null }
  return null
}
function agregar(key, vals) {
  const v = vals.filter(x => x != null)
  if (!v.length) return null
  const def = VARS.find(x => x.key === key)
  return def?.agr === 'media' ? v.reduce((a, b) => a + b, 0) / v.length : v.reduce((a, b) => a + b, 0)
}
const fmtVal = (key, v) => v == null ? '' : key === 'rpe' ? (Math.round(v * 10) / 10).toString().replace('.', ',') : String(Math.round(v))

// ── Selector de periodo con calendario ─────────────────────────────────────
function SelectorPeriodo({ rango, onCambiar, planIni, planFin }) {
  const [abierto, setAbierto] = useState(false)
  const [mesVista, setMesVista] = useState(startOfMonth(rango.ini))
  const [seleccion, setSeleccion] = useState(null) // primer clic
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) { setAbierto(false); setSeleccion(null) } }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [abierto])

  const clicDia = d => {
    if (!seleccion) { setSeleccion(d); return }
    const [a, b] = d < seleccion ? [d, seleccion] : [seleccion, d]
    onCambiar({ ini: a, fin: b }); setSeleccion(null); setAbierto(false)
  }
  const hoy = startOfDay(new Date())
  const presets = [
    ['Todo el plan', { ini: planIni, fin: planFin }],
    ['Este mes', { ini: startOfMonth(hoy), fin: endOfMonth(hoy) }],
    ['Próximas 4 semanas', { ini: lunes(hoy), fin: addDays(lunes(hoy), 27) }],
    ['Próximos 3 meses', { ini: startOfMonth(hoy), fin: endOfMonth(addMonths(hoy, 2)) }],
  ]
  const Mes = ({ base }) => {
    const ini = lunes(startOfMonth(base))
    const dias = eachDayOfInterval({ start: ini, end: addDays(lunes(endOfMonth(base)), 6) })
    return (
      <div style={{ width: 224 }}>
        <div style={{ textAlign: 'center', fontSize: 12.5, fontWeight: 600, marginBottom: 6, textTransform: 'capitalize' }}>{format(base, 'MMMM yyyy', { locale: es })}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => <span key={x} style={{ fontSize: 9.5, color: 'var(--text3)', textAlign: 'center', fontFamily: 'var(--mono)' }}>{x}</span>)}
          {dias.map(d => {
            const fuera = !isSameMonth(d, base)
            const sel = seleccion ? isSameDay(d, seleccion) : false
            const enRango = !seleccion && d >= rango.ini && d <= rango.fin
            const extremo = !seleccion && (isSameDay(d, rango.ini) || isSameDay(d, rango.fin))
            const enPlan = d >= planIni && d <= planFin
            return (
              <button key={k(d)} onClick={() => clicDia(d)}
                style={{ height: 27, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit',
                  background: sel || extremo ? 'var(--text)' : enRango ? 'var(--accent-light)' : 'transparent',
                  color: sel || extremo ? '#fff' : fuera ? 'var(--border2)' : 'var(--text)',
                  fontWeight: isSameDay(d, hoy) ? 700 : 400, textDecoration: enPlan && !fuera ? 'none' : 'none',
                  boxShadow: isSameDay(d, hoy) && !(sel || extremo) ? 'inset 0 0 0 1px var(--accent)' : 'none' }}>
                {format(d, 'd')}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => { setAbierto(a => !a); setMesVista(startOfMonth(rango.ini)) }}
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12.5, fontFamily: 'inherit', color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
        <span style={{ opacity: .6 }}>📅</span>
        {format(rango.ini, 'd MMM yyyy', { locale: es })} – {format(rango.fin, 'd MMM yyyy', { locale: es })}
        <span style={{ opacity: .5, fontSize: 10 }}>▾</span>
      </button>
      {abierto && (
        <div style={{ position: 'absolute', top: 40, right: 0, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.14)', padding: 14, display: 'flex', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 140, borderRight: '1px solid var(--border)', paddingRight: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>Periodo</div>
            {presets.map(([l, r]) => (
              <button key={l} onClick={() => { onCambiar(r); setAbierto(false); setSeleccion(null) }}
                style={{ textAlign: 'left', border: 'none', background: 'transparent', padding: '6px 8px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>{l}</button>
            ))}
            <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 'auto', lineHeight: 1.4 }}>{seleccion ? 'Ahora elige el día final' : 'O marca en el calendario el día de inicio y el de fin'}</div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <button onClick={() => setMesVista(m => addMonths(m, -1))} style={btnFlecha}>‹</button>
              <button onClick={() => setMesVista(m => addMonths(m, 1))} style={btnFlecha}>›</button>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <Mes base={mesVista} />
              <Mes base={addMonths(mesVista, 1)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
const btnFlecha = { width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: 'var(--text2)' }


// ── Contenidos de planificación ─────────────────────────────────────────────
const PALETA_CONT = ['#b7791f', '#2f6fdb', '#2f9e63', '#cf4646', '#7c5cd6', '#0e8a8a', '#c2185b', '#5d6b7a', '#e07a1f', '#3f7d20']
export function colorContenido(texto) {
  let h = 0; const t = (texto || '').trim().toLowerCase()
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return PALETA_CONT[h % PALETA_CONT.length]
}
function ChipContenido({ texto, color, peque, onQuitar }) {
  const c = color || colorContenido(texto)
  return (
    <span title={texto} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, maxWidth: '100%', fontSize: peque ? 9 : 10, fontWeight: 700, lineHeight: 1.3, padding: peque ? '1px 5px' : '2px 6px', borderRadius: 6, background: c + '1a', color: c, border: `1px solid ${c}55`, boxSizing: 'border-box' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
      {onQuitar && <span onClick={e => { e.stopPropagation(); onQuitar() }} style={{ cursor: 'pointer', opacity: .7, fontSize: 11, lineHeight: 1 }} title="Quitar">×</span>}
    </span>
  )
}
function EditorContenidos({ abierto, onCerrar, items, sugerencias, onAnadir, onQuitar, modoSemana, catGrupos = [], catEtiquetas = [] }) {
  const [texto, setTexto] = useState('')
  const [alcance, setAlcance] = useState(modoSemana ? 'ses_semana' : 'dia')
  const ref = useRef(null)
  useEffect(() => { setTexto(''); setAlcance(modoSemana ? 'ses_semana' : 'dia') }, [abierto?.clave, modoSemana])
  useEffect(() => {
    if (!abierto) return
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onCerrar() }
    const t = setTimeout(() => document.addEventListener('mousedown', fn), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fn) }
  }, [abierto, onCerrar])
  if (!abierto) return null
  const enviar = (t, et) => { const v = (t ?? texto).trim(); if (!v) return; onAnadir(v, alcance, et); setTexto('') }
  const yaEsta = n => items.some(i => i.texto.toLowerCase() === n.toLowerCase())
  const catFiltradas = catEtiquetas.filter(e => !yaEsta(e.nombre) && (!texto || e.nombre.toLowerCase().includes(texto.toLowerCase())))
  const sug = sugerencias.filter(x => !catEtiquetas.some(e => e.nombre.toLowerCase() === x.toLowerCase())).filter(x => !items.some(i => i.texto.toLowerCase() === x.toLowerCase()) && (!texto || x.toLowerCase().includes(texto.toLowerCase()))).slice(0, 12)
  const left = Math.min(abierto.x, window.innerWidth - 330), top = Math.max(10, Math.min(abierto.y, window.innerHeight - 470))
  const opciones = modoSemana
    ? [['ses_semana', 'Días con sesión'], ['semana', 'Toda la semana']]
    : [['dia', 'Este día'], ['ses_semana', 'Días con sesión de la semana'], ['semana', 'Toda la semana']]
  return (
    <div ref={ref} style={{ position: 'fixed', left, top, width: 310, maxHeight: 'calc(100vh - 20px)', overflowY: 'auto', zIndex: 80, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.16)', padding: 12, fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.05em', color: GRUPOS.pla.color }}>Contenidos</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{abierto.titulo}</div>
          {abierto.plan && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Plan · {abierto.plan}</div>}
        </div>
        <button onClick={onCerrar} style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: 'var(--text3)' }}>×</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10, minHeight: 20 }}>
        {items.length ? items.map(i => <ChipContenido key={i.texto} texto={i.texto} color={i.color} onQuitar={() => onQuitar(i.ids)} />)
          : <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>Todavía no hay contenidos.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onCerrar() }}
          placeholder="p. ej. Fuerza máxima, Umbral, Técnica…" style={{ flex: 1, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'inherit', background: 'var(--bg)' }} />
        <button onClick={() => enviar()} disabled={!texto.trim()} style={{ padding: '0 12px', borderRadius: 8, border: 'none', background: texto.trim() ? 'var(--accent)' : 'var(--bg3)', color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: texto.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>Añadir</button>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
        {opciones.map(([v, l]) => (
          <button key={v} onClick={() => setAlcance(v)} style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${alcance === v ? 'var(--accent)' : 'var(--border)'}`, background: alcance === v ? 'var(--accent-light)' : 'transparent', color: alcance === v ? 'var(--accent-text)' : 'var(--text2)', fontWeight: alcance === v ? 600 : 400 }}>{l}</button>
        ))}
      </div>
      {catFiltradas.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8, maxHeight: 190, overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 5 }}>De tus categorías (clic para añadir)</div>
          {catGrupos.map(g => {
            const ets = catFiltradas.filter(e => e.grupo_id === g.id)
            if (!ets.length) return null
            return (
              <div key={g.id} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text2)', marginBottom: 3 }}>{g.nombre}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {ets.map(e => <span key={e.id} onClick={() => enviar(e.nombre, e)} style={{ cursor: 'pointer' }}><ChipContenido texto={e.nombre} color={e.color} peque /></span>)}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {sug.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 5 }}>Otros usados en este plan</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {sug.map(x => <span key={x} onClick={() => enviar(x)} style={{ cursor: 'pointer' }}><ChipContenido texto={x} peque /></span>)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────────
export default function TimelinePlan({
  planificacion, bloques, subbloques, semanasAll, sesiones, competiciones, controles, notas, feedbacks,
  clienteNombre, onAbrirSesion, onNuevaSesion, onEditarBloque, onEditarSubbloque, onAbrirComp, onAbrirControl, onAbrirNota,
  onNuevoBloque, onNuevoSubbloque, onRecargar,
}) {
  const planIni = useMemo(() => parseISO(planificacion.fecha_inicio), [planificacion.fecha_inicio])
  const planFin = useMemo(() => parseISO(planificacion.fecha_fin), [planificacion.fecha_fin])
  const hoy = startOfDay(new Date())

  const [vision, setVision] = useState(() => { try { return localStorage.getItem('tlVision') || 'meso' } catch { return 'meso' } })
  const cambiarVision = v => { setVision(v); try { localStorage.setItem('tlVision', v) } catch {} }
  const [grupos, setGrupos] = useState({ cal: true, per: true, pla: true, pro: true })
  const [rango, setRango] = useState({ ini: planIni, fin: planFin })
  useEffect(() => { setRango({ ini: planIni, fin: planFin }) }, [planIni, planFin])
  const semanaInicial = () => (hoy >= rango.ini && hoy <= rango.fin) ? lunes(hoy) : lunes(rango.ini)
  const [cursor, setCursor] = useState(semanaInicial)
  useEffect(() => { setCursor(semanaInicial()) }, [rango.ini.getTime(), rango.fin.getTime()])

  // Ancho disponible (para repartir columnas)
  const contRef = useRef(null)
  const [ancho, setAncho] = useState(1100)
  useEffect(() => {
    const el = contRef.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width))
    ro.observe(el); return () => ro.disconnect()
  }, [])

  // ── Índices por día ──
  const fbMap = useMemo(() => new Map((feedbacks || []).map(f => [f.sesion_id, f])), [feedbacks])
  const porDia = useMemo(() => {
    const m = new Map()
    const add = (fecha, tipo, item) => { if (!fecha) return; const kk = fecha.slice(0, 10); if (!m.has(kk)) m.set(kk, { ses: [], comps: [], ctrls: [], notas: [] }); m.get(kk)[tipo].push(item) }
    ;(sesiones || []).filter(s => s.fecha && !s.recurso).forEach(s => add(s.fecha, 'ses', s))
    ;(competiciones || []).forEach(c => add(c.fecha, 'comps', c))
    ;(controles || []).forEach(c => add(c.fecha, 'ctrls', c))
    ;(notas || []).forEach(n => add(n.fecha, 'notas', n))
    m.forEach(v => v.ses.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''))))
    return m
  }, [sesiones, competiciones, controles, notas])
  const vacio = { ses: [], comps: [], ctrls: [], notas: [] }
  const dia = d => porDia.get(k(d)) || vacio

  // ── Planes del deportista (todas sus planificaciones) y sus contenidos ──
  const [planes, setPlanes] = useState([planificacion])
  useEffect(() => {
    let vivo = true
    if (!planificacion.cliente_id) { setPlanes([planificacion]); return }
    supabase.from('planificaciones').select('id, nombre, fecha_inicio, fecha_fin, notas, tipo, cliente_id').eq('cliente_id', planificacion.cliente_id).order('fecha_inicio')
      .then(({ data }) => { if (vivo) setPlanes((data && data.length ? data : [planificacion]).filter(x => x.fecha_inicio && x.fecha_fin)) })
    return () => { vivo = false }
  }, [planificacion])
  const planIds = planes.map(x => x.id).join(',')
  const [contenidos, setContenidos] = useState([])
  const { grupos: catGrupos, etiquetas: catEtiquetas } = useCategorias()
  const [editorCont, setEditorCont] = useState(null) // { clave, titulo, x, y, fecha, lunes, modoSemana, planId }
  useEffect(() => {
    let vivo = true
    const ids = planIds ? planIds.split(',') : [planificacion.id]
    supabase.from('planificacion_contenidos').select('*').in('planificacion_id', ids).order('fecha').order('orden')
      .then(({ data }) => { if (vivo) setContenidos(data || []) })
    return () => { vivo = false }
  }, [planIds, planificacion.id])
  const contPorDia = useMemo(() => {
    const m = new Map(); contenidos.forEach(c => { const kk = c.planificacion_id + '|' + String(c.fecha).slice(0, 10); if (!m.has(kk)) m.set(kk, []); m.get(kk).push(c) }); return m
  }, [contenidos])
  const contDia = (d, pid) => pid ? (contPorDia.get(pid + '|' + k(d)) || []) : planes.flatMap(p => contPorDia.get(p.id + '|' + k(d)) || [])
  const agruparCont = lista => {
    const g = new Map(); lista.forEach(c => { const key = c.texto.trim().toLowerCase(); if (!g.has(key)) g.set(key, { texto: c.texto, color: c.color, etiqueta_id: c.etiqueta_id, ids: [] }); g.get(key).ids.push(c.id) }); return [...g.values()]
  }
  // Contenidos distintos de cada plan (filas cuando el plan está desplegado), por orden de aparición
  const contenidosPlan = pid => agruparCont(contenidos.filter(c => c.planificacion_id === pid))
  const sugerencias = useMemo(() => [...new Set(contenidos.map(c => c.texto.trim()))].sort((a, b) => a.localeCompare(b, 'es')), [contenidos])
  const colorDe = (texto, etiqueta) => etiqueta?.color || contenidos.find(c => c.texto.trim().toLowerCase() === texto.toLowerCase())?.color || colorContenido(texto)
  async function anadirContenido(texto, alcance, etiqueta) {
    const ed = editorCont; if (!ed) return
    const pid = ed.planId || planificacion.id
    const l = ed.lunes
    let fechas = []
    if (alcance === 'dia' && ed.fecha) fechas = [ed.fecha]
    else if (alcance === 'semana') fechas = Array.from({ length: 7 }, (_, i) => addDays(l, i))
    else { fechas = Array.from({ length: 7 }, (_, i) => addDays(l, i)).filter(d => dia(d).ses.length); if (!fechas.length) fechas = [ed.fecha || l] }
    const filas = fechas.filter(d => !contDia(d, pid).some(c => c.texto.trim().toLowerCase() === texto.toLowerCase()))
      .map(d => ({ planificacion_id: pid, fecha: k(d), texto, etiqueta_id: etiqueta?.id || null, color: colorDe(texto, etiqueta), orden: contDia(d, pid).length }))
    if (!filas.length) return
    const { data, error } = await supabase.from('planificacion_contenidos').insert(filas).select()
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setContenidos(cs => [...cs, ...(data || [])])
  }
  async function quitarContenido(ids) {
    setContenidos(cs => cs.filter(c => !ids.includes(c.id)))
    await supabase.from('planificacion_contenidos').delete().in('id', ids)
  }
  // Fila de un contenido (plan desplegado): clic en un día lo pone o lo quita
  async function alternarContenido(pid, c, d) {
    const ya = contDia(d, pid).filter(x => x.texto.trim().toLowerCase() === c.texto.trim().toLowerCase())
    if (ya.length) return quitarContenido(ya.map(x => x.id))
    const { data, error } = await supabase.from('planificacion_contenidos').insert({ planificacion_id: pid, fecha: k(d), texto: c.texto, etiqueta_id: c.etiqueta_id || null, color: c.color || colorContenido(c.texto), orden: contDia(d, pid).length }).select()
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setContenidos(cs => [...cs, ...(data || [])])
  }
  const nombrePlan = pid => planes.find(x => x.id === pid)?.nombre || ''
  const abrirEditorDia = (ev, d, pid) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setEditorCont({ clave: 'd' + k(d) + pid, titulo: format(d, "EEEE d 'de' MMMM", { locale: es }), plan: nombrePlan(pid), x: r.left, y: r.bottom + 6, fecha: d, lunes: lunes(d), modoSemana: false, planId: pid })
  }
  const abrirEditorSemana = (ev, l, pid) => {
    const r = ev.currentTarget.getBoundingClientRect()
    setEditorCont({ clave: 's' + k(l) + pid, titulo: `Semana ${numSemana(l) || ''} · ${format(l, 'd MMM', { locale: es })} – ${format(addDays(l, 6), 'd MMM', { locale: es })}`, plan: nombrePlan(pid), x: r.left, y: r.bottom + 6, fecha: null, lunes: l, modoSemana: true, planId: pid })
  }
  const itemsEditor = editorCont ? agruparCont(editorCont.modoSemana ? Array.from({ length: 7 }, (_, i) => contDia(addDays(editorCont.lunes, i), editorCont.planId)).flat() : contDia(editorCont.fecha, editorCont.planId)) : []
  const [cuadColor, setCuadColorS] = useState(() => { try { return localStorage.getItem('tlCuadColor') || null } catch { return null } })
  const [cuadCod, setCuadCodS] = useState(() => { try { const v = localStorage.getItem('tlCuadCod'); return v === null ? null : v } catch { return null } })
  const setCuadColor = v => { setCuadColorS(v); try { localStorage.setItem('tlCuadColor', v) } catch {} }
  const setCuadCod = v => { setCuadCodS(v); try { localStorage.setItem('tlCuadCod', v) } catch {} }
  // Planes desplegados (por defecto todos)
  const [plegados, setPlegados] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('tlPlanesPlegados') || '[]')) } catch { return new Set() } })
  const alternarPlegado = pid => setPlegados(s => { const n = new Set(s); n.has(pid) ? n.delete(pid) : n.add(pid); try { localStorage.setItem('tlPlanesPlegados', JSON.stringify([...n])) } catch {} ; return n })

  // Variables de carga con datos para este cliente
  const varsDisponibles = useMemo(() => {
    const ses = (sesiones || []).filter(s => s.fecha && !s.recurso)
    return VARS.filter(v => valorCarga(v.key, ses, fbMap) != null)
  }, [sesiones, fbMap])
  const [varCarga, setVarCarga] = useState(null)
  const varActiva = varsDisponibles.find(v => v.key === varCarga) || varsDisponibles[0] || null

  // Bloques y subbloques con fechas
  const bloquesF = useMemo(() => (bloques || []).filter(b => b.fecha_inicio).map(b => {
    const ini = parseISO(b.fecha_inicio)
    return { ...b, _ini: ini, _fin: addDays(ini, (b.semanas || 1) * 7 - 1) }
  }), [bloques])
  const subsF = useMemo(() => bloquesF.flatMap(b => (subbloques?.[b.id] || []).map(s => ({
    ...s, _bloque: b, _ini: addDays(b._ini, ((s.semana_inicio || 1) - 1) * 7), _fin: addDays(b._ini, (s.semana_fin || s.semana_inicio || 1) * 7 - 1),
  }))), [bloquesF, subbloques])
  // ── Redimensionar periodos (bloques) y subperiodos arrastrando su borde derecho ──
  const [arrastre, setArrastre] = useState(null) // { tipo, id, dW }
  const [guardandoPer, setGuardandoPer] = useState(false)
  const ordenados = lista => [...lista].sort((a, b) => a._ini - b._ini)
  const siguienteDe = (tipo, it) => {
    const lista = tipo === 'bloque' ? bloquesF : subsF.filter(x => x._bloque.id === it._bloque.id)
    return ordenados(lista).find(x => x.id !== it.id && x._ini > it._ini) || null
  }
  const semanasDe = it => Math.round((differenceInCalendarDays(it._fin, it._ini) + 1) / 7)
  function limitesArrastre(tipo, it) {
    const sig = siguienteDe(tipo, it)
    const hueco = sig ? Math.max(0, Math.round((differenceInCalendarDays(sig._ini, it._fin) - 1) / 7)) : 0 // semanas libres entre ambos
    let min = 1 - semanasDe(it)
    if (tipo === 'bloque') {
      const maxIniSub = Math.max(1, ...subsF.filter(x => x._bloque.id === it.id).map(x => x.semana_inicio || 1))
      min = maxIniSub - semanasDe(it)
    }
    let max
    if (sig) max = hueco + (semanasDe(sig) - 1)
    else max = tipo === 'bloque' ? 104 : (it._bloque.semanas - (it.semana_fin || 1))
    return { min, max }
  }
  // Vista previa durante el arrastre
  const anterioresDe = (tipo, it) => ordenados(tipo === 'bloque' ? bloquesF : subsF.filter(x => x._bloque.id === it._bloque.id)).filter(x => x.id !== it.id && x._ini < it._ini)
  const posterioresDe = (tipo, it) => ordenados(tipo === 'bloque' ? bloquesF : subsF.filter(x => x._bloque.id === it._bloque.id)).filter(x => x.id !== it.id && x._ini > it._ini)
  // Al mover un elemento dW semanas: lo que viene detrás se empuja (consumiendo huecos) → { id: semanasDesplazadas }
  function empujes(tipo, it, dW) {
    const out = {}
    if (dW <= 0) return out
    let cursor = addDays(it._fin, dW * 7)
    for (const x of posterioresDe(tipo, it)) {
      if (x._ini > cursor) break
      const n = Math.round((differenceInCalendarDays(cursor, x._ini) + 1) / 7)
      out[x.id] = n
      cursor = addDays(x._fin, n * 7)
    }
    return out
  }
  function limitesMover(tipo, it) {
    const prev = anterioresDe(tipo, it).slice(-1)[0]
    let min
    if (prev) min = -Math.max(0, Math.round((differenceInCalendarDays(it._ini, prev._fin) - 1) / 7))
    else min = tipo === 'bloque' ? -52 : -((it.semana_inicio || 1) - 1)
    let max = 104
    if (tipo === 'sub') {
      // lo empujado no puede salirse del periodo
      const total = it._bloque.semanas || 1
      max = 0
      for (let d = 1; d <= total; d++) {
        const e = empujes(tipo, it, d)
        const finIt = (it.semana_fin || 1) + d
        const finUlt = Math.max(finIt, ...posterioresDe(tipo, it).filter(x => e[x.id]).map(x => (x.semana_fin || 1) + e[x.id]))
        if (finUlt > total) break
        max = d
      }
    }
    return { min, max }
  }
  const conArrastre = (tipo, lista) => {
    if (!arrastre || arrastre.tipo !== tipo || !arrastre.dW) return lista
    const it = lista.find(x => x.id === arrastre.id); if (!it) return lista
    if (arrastre.modo === 'mover') {
      const e = empujes(tipo, it, arrastre.dW)
      return lista.map(x => {
        if (x.id === it.id) return { ...x, _ini: addDays(x._ini, arrastre.dW * 7), _fin: addDays(x._fin, arrastre.dW * 7) }
        if (e[x.id]) return { ...x, _ini: addDays(x._ini, e[x.id] * 7), _fin: addDays(x._fin, e[x.id] * 7), _empujado: true }
        return x
      })
    }
    const nuevoFin = addDays(it._fin, arrastre.dW * 7)
    const sig = siguienteDe(tipo, it)
    return lista.map(x => {
      if (x.id === it.id) return { ...x, _fin: nuevoFin }
      if (sig && x.id === sig.id && nuevoFin >= sig._ini) return { ...x, _ini: addDays(nuevoFin, 1) }
      return x
    })
  }
  // Al mover periodos, sus subperiodos se desplazan con ellos (vista previa)
  const subsConBloquesMovidos = () => {
    if (!arrastre || arrastre.tipo !== 'bloque' || arrastre.modo !== 'mover' || !arrastre.dW) return subsF
    const bm = new Map(conArrastre('bloque', bloquesF).map(b => [b.id, b]))
    return subsF.map(x => {
      const b = bm.get(x._bloque.id); const d = b ? differenceInCalendarDays(b._ini, x._bloque._ini) : 0
      return d ? { ...x, _ini: addDays(x._ini, d), _fin: addDays(x._fin, d) } : x
    })
  }
  async function asignarSemanasABloque(bloqueId, ini, nSem) {
    const lunesL = Array.from({ length: nSem }, (_, i) => k(addDays(ini, i * 7)))
    await supabase.from('semanas').update({ bloque_id: null }).eq('bloque_id', bloqueId).not('fecha_inicio_semana', 'in', `(${lunesL.map(d => `"${d}"`).join(',')})`)
    await supabase.from('semanas').update({ bloque_id: bloqueId }).eq('planificacion_id', planificacion.id).in('fecha_inicio_semana', lunesL)
  }
  async function confirmarArrastre(tipo, it, dW) {
    if (!dW) return
    setGuardandoPer(true)
    try {
      const sig = siguienteDe(tipo, it)
      if (tipo === 'bloque') {
        const nuevasSem = (it.semanas || semanasDe(it)) + dW
        const nuevoFin = addDays(it._ini, nuevasSem * 7 - 1)
        if (sig && nuevoFin >= sig._ini) {
          const recorte = Math.round((differenceInCalendarDays(nuevoFin, sig._ini) + 1) / 7)
          const subsSig = subsF.filter(x => x._bloque.id === sig.id)
          const seBorran = subsSig.filter(x => (x.semana_fin || 1) - recorte < 1)
          if (seBorran.length && !window.confirm(`Al alargar «${it.nombre}», «${sig.nombre}» empieza ${recorte} semana${recorte === 1 ? '' : 's'} más tarde y se quedarían fuera estos subperiodos: ${seBorran.map(x => x.nombre).join(', ')}.\n\n¿Eliminarlos y continuar?`)) { setGuardandoPer(false); setArrastre(null); return }
          const nIni = addDays(sig._ini, recorte * 7)
          const { error } = await supabase.from('bloques').update({ fecha_inicio: k(nIni), semanas: sig.semanas - recorte }).eq('id', sig.id)
          if (error) throw error
          for (const sb of subsSig) {
            const ini = (sb.semana_inicio || 1) - recorte, fin = (sb.semana_fin || 1) - recorte
            if (fin < 1) await supabase.from('subbloques').delete().eq('id', sb.id)
            else await supabase.from('subbloques').update({ semana_inicio: Math.max(1, ini), semana_fin: fin }).eq('id', sb.id)
          }
          await asignarSemanasABloque(sig.id, nIni, sig.semanas - recorte)
        }
        const { error } = await supabase.from('bloques').update({ semanas: nuevasSem }).eq('id', it.id)
        if (error) throw error
        if (dW < 0) for (const sb of subsF.filter(x => x._bloque.id === it.id && (x.semana_fin || 1) > nuevasSem)) await supabase.from('subbloques').update({ semana_fin: nuevasSem }).eq('id', sb.id)
        await asignarSemanasABloque(it.id, it._ini, nuevasSem)
      } else {
        const nuevoFinSem = (it.semana_fin || 1) + dW
        if (sig && nuevoFinSem >= (sig.semana_inicio || 1)) {
          const { error } = await supabase.from('subbloques').update({ semana_inicio: nuevoFinSem + 1 }).eq('id', sig.id)
          if (error) throw error
        }
        const { error } = await supabase.from('subbloques').update({ semana_fin: nuevoFinSem }).eq('id', it.id)
        if (error) throw error
      }
      await onRecargar?.()
    } catch (e) {
      alert('No se pudo cambiar la duración: ' + (e.message || e))
    }
    setArrastre(null); setGuardandoPer(false)
  }
  async function confirmarMover(tipo, it, dW) {
    if (!dW) return
    setGuardandoPer(true)
    try {
      const e = empujes(tipo, it, dW)
      const lista = posterioresDe(tipo, it).filter(x => e[x.id]).reverse() // del último al primero (evita solapes)
      if (tipo === 'bloque') {
        const cambios = []
        for (const x of lista) cambios.push({ x, n: e[x.id] })
        cambios.push({ x: it, n: dW })
        for (const { x, n } of cambios) {
          const { error } = await supabase.from('bloques').update({ fecha_inicio: k(addDays(x._ini, n * 7)) }).eq('id', x.id)
          if (error) throw error
        }
        for (const { x, n } of cambios) await asignarSemanasABloque(x.id, addDays(x._ini, n * 7), x.semanas || semanasDe(x))
      } else {
        const cambios = lista.map(x => ({ x, n: e[x.id] })).concat([{ x: it, n: dW }])
        for (const { x, n } of cambios) {
          const { error } = await supabase.from('subbloques').update({ semana_inicio: (x.semana_inicio || 1) + n, semana_fin: (x.semana_fin || 1) + n }).eq('id', x.id)
          if (error) throw error
        }
      }
      await onRecargar?.()
    } catch (err) {
      alert('No se pudo mover: ' + (err.message || err))
    }
    setArrastre(null); setGuardandoPer(false)
  }
  // Pulsar y arrastrar el cuerpo de la barra: mover. Sin movimiento = clic (abrir).
  function iniciarMover(ev, tipo, it, pxSemana, onClic) {
    if (ev.button !== 0) return
    ev.preventDefault()
    const x0 = ev.clientX, { min, max } = limitesMover(tipo, it)
    let dW = 0, movido = false
    const mover = e => {
      if (!movido && Math.abs(e.clientX - x0) < 5) return
      if (!movido) { movido = true; document.body.style.cursor = 'grabbing' }
      dW = Math.max(min, Math.min(max, Math.round((e.clientX - x0) / pxSemana)))
      setArrastre({ tipo, id: it.id, dW, modo: 'mover' })
    }
    const soltar = () => {
      window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); document.body.style.cursor = ''
      if (!movido) { setArrastre(null); onClic?.(it); return }
      if (dW) confirmarMover(tipo, it, dW); else setArrastre(null)
    }
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar)
  }
  function iniciarArrastre(ev, tipo, it, pxSemana) {
    ev.preventDefault(); ev.stopPropagation()
    const x0 = ev.clientX, { min, max } = limitesArrastre(tipo, it)
    let dW = 0
    setArrastre({ tipo, id: it.id, dW: 0, modo: 'borde' })
    const mover = e => { dW = Math.max(min, Math.min(max, Math.round((e.clientX - x0) / pxSemana))); setArrastre({ tipo, id: it.id, dW, modo: 'borde' }) }
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); document.body.style.cursor = ''; if (dW) confirmarArrastre(tipo, it, dW); else setArrastre(null) }
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar)
    document.body.style.cursor = 'ew-resize'
  }
  // Huecos sin periodo (para el botón +)
  const huecosBloques = useMemo(() => {
    const ls = ordenados(bloquesF), out = []
    let cursorD = planIni
    ls.forEach(b => { if (differenceInCalendarDays(b._ini, cursorD) >= 7) out.push({ ini: cursorD, fin: addDays(b._ini, -1) }); if (b._fin >= cursorD) cursorD = addDays(b._fin, 1) })
    if (differenceInCalendarDays(planFin, cursorD) >= 6) out.push({ ini: cursorD, fin: planFin })
    return out
  }, [bloquesF, planIni, planFin])
  const huecosSubs = useMemo(() => bloquesF.flatMap(b => {
    const ocup = new Set(); subsF.filter(x => x._bloque.id === b.id).forEach(x => { for (let w = x.semana_inicio || 1; w <= (x.semana_fin || 1); w++) ocup.add(w) })
    const out = []; let ini = null
    for (let w = 1; w <= (b.semanas || 1) + 1; w++) {
      const libre = w <= (b.semanas || 1) && !ocup.has(w)
      if (libre && ini == null) ini = w
      if (!libre && ini != null) { out.push({ bloque: b, semana_inicio: ini, semana_fin: w - 1, ini: addDays(b._ini, (ini - 1) * 7), fin: addDays(b._ini, (w - 1) * 7 - 1) }); ini = null }
    }
    return out
  }), [bloquesF, subsF])

  const semanaPorLunes = useMemo(() => new Map((semanasAll || []).map(s => [s.fecha_inicio_semana, s])), [semanasAll])
  const numSemana = d => {
    const s = semanaPorLunes.get(k(lunes(d)))
    if (s?.numero_cliente) return s.numero_cliente
    const n = Math.floor(differenceInCalendarDays(lunes(d), lunes(planIni)) / 7) + 1
    return n >= 1 ? n : null
  }
  const tituloSemana = d => { const s = semanaPorLunes.get(k(lunes(d))); return s?.objetivo ? (tituloTexto(s.objetivo) || textoPlano(s.objetivo).slice(0, 60)) : null }
  const bloqueDe = d => bloquesF.find(b => d >= b._ini && d <= b._fin)

  // ── Barra superior ──
  const Toolbar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {Object.entries(GRUPOS).map(([key, g]) => {
          const on = grupos[key]
          return (
            <button key={key} onClick={() => setGrupos(x => ({ ...x, [key]: !x[key] }))}
              style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 10px 0 6px', borderRadius: 8, border: `1px solid ${on ? g.color + '55' : 'var(--border)'}`, background: on ? g.bg : 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit' }}>
              <span style={{ width: 19, height: 19, borderRadius: 5, background: on ? g.color : 'var(--bg3)', color: '#fff', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{g.icono}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: on ? g.color : 'var(--text3)' }}>{g.label}</span>
              <span style={{ width: 7, height: 7, borderRadius: 4, border: `1.5px solid ${on ? g.color : 'var(--border2)'}`, background: on ? g.color + '55' : 'transparent' }} />
            </button>
          )
        })}
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={() => { setCursor(lunes(hoy)); if (hoy < rango.ini || hoy > rango.fin) setRango({ ini: planIni < hoy ? planIni : lunes(hoy), fin: planFin > hoy ? planFin : addDays(lunes(hoy), 27) }) }}
        style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: 'var(--text2)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Hoy</button>
      <SelectorPeriodo rango={rango} onCambiar={setRango} planIni={planIni} planFin={planFin} />
      <div style={{ display: 'flex', padding: 3, gap: 2, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg)' }}>
        {[['macro', 'Visión Macro'], ['meso', 'Visión Meso'], ['micro', 'Visión Micro'], ['cuadricula', 'Cuadrícula']].map(([v, l]) => (
          <button key={v} onClick={() => cambiarVision(v)}
            style={{ height: 28, padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: vision === v ? 600 : 500,
              background: vision === v ? 'var(--accent)' : 'transparent', color: vision === v ? '#fff' : 'var(--text2)' }}>{l}</button>
        ))}
      </div>
    </div>
  )

  // Etiqueta de fila (columna izquierda) con el color del grupo
  const LABEL_W = 150
  const Etiqueta = ({ g, texto, icono, alto, extra, sub }) => (
    <div style={{ width: LABEL_W, minWidth: LABEL_W, height: alto, display: 'flex', alignItems: 'stretch', position: 'sticky', left: 0, zIndex: 5, background: 'var(--surface)' }}>
      <div style={{ width: 4, background: GRUPOS[g].color, borderRadius: 2, margin: '3px 0' }} />
      <div style={{ flex: 1, margin: '4px 8px', borderRadius: 9, background: GRUPOS[g].bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '4px 9px', gap: 3, minWidth: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--text)' }}>
          {icono && <span style={{ color: GRUPOS[g].color, fontSize: 12 }}>{icono}</span>}{texto}
        </div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.3 }}>{sub}</div>}
        {extra}
      </div>
    </div>
  )

  const SelectorVar = () => varsDisponibles.length > 1 ? (
    <select value={varActiva?.key || ''} onChange={e => setVarCarga(e.target.value)}
      style={{ fontSize: 10.5, padding: '2px 3px', borderRadius: 5, border: '1px solid ' + GRUPOS.pla.color + '55', background: '#fff', color: 'var(--text2)', fontFamily: 'inherit', maxWidth: '100%' }}>
      {varsDisponibles.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
    </select>
  ) : varActiva ? <div style={{ fontSize: 10, color: 'var(--text3)' }}>{varActiva.label}</div> : <div style={{ fontSize: 10, color: 'var(--text3)' }}>Sin datos de carga</div>

  return (
    <div className="card" style={{ padding: 0, overflow: 'visible', fontFamily: 'var(--font)' }}>
      {Toolbar}
      <div ref={contRef} style={{ padding: '6px 0 14px' }}>
        {vision === 'macro' && <VistaMacro />}
        {vision === 'meso' && <VistaSemanas semanas={3} />}
        {vision === 'micro' && <VistaSemanas semanas={1} micro />}
        {vision === 'cuadricula' && <VistaCuadricula />}
      </div>
      <style>{`.tl-celda-ses .tl-mas,.tl-cont .tl-mas-cont{opacity:0;transition:opacity .15s}.tl-celda-ses:hover .tl-mas,.tl-cont:hover .tl-mas-cont{opacity:1}.tl-cont:hover{background:rgba(193,143,5,.08)}.tl-hueco{opacity:.35;transition:opacity .15s}.tl-hueco:hover{opacity:1;background:rgba(207,70,70,.06)!important}.tl-asa{opacity:.6}.tl-asa:hover{opacity:1}`}</style>
      <EditorContenidos abierto={editorCont} onCerrar={() => setEditorCont(null)} items={itemsEditor} sugerencias={sugerencias}
        onAnadir={anadirContenido} onQuitar={quitarContenido} modoSemana={!!editorCont?.modoSemana} catGrupos={catGrupos} catEtiquetas={catEtiquetas} />
    </div>
  )

  // ════════════════════════════ MACRO ════════════════════════════
  function VistaMacro() {
    const semanasCols = []
    for (let d = lunes(rango.ini); d <= rango.fin; d = addWeeks(d, 1)) semanasCols.push(d)
    const disponible = ancho - LABEL_W - 16
    const COL = Math.max(26, Math.min(120, Math.floor(disponible / Math.max(1, semanasCols.length))))
    const W = COL * semanasCols.length
    const ini0 = semanasCols[0]
    const xDe = d => differenceInCalendarDays(d, ini0) / 7 * COL
    // Meses
    const meses = []
    semanasCols.forEach((d, i) => {
      const m0 = format(addDays(d, 3), 'MMMM yyyy', { locale: es }); const m = m0.charAt(0).toUpperCase() + m0.slice(1)
      if (!meses.length || meses[meses.length - 1].m !== m) meses.push({ m, i, n: 1 }); else meses[meses.length - 1].n++
    })
    const datosSemana = semanasCols.map(d => {
      const dias = Array.from({ length: 7 }, (_, i) => dia(addDays(d, i)))
      return {
        d, dias,
        ses: dias.reduce((a, x) => a + x.ses.length, 0),
        comps: dias.flatMap(x => x.comps), ctrls: dias.flatMap(x => x.ctrls),
        carga: varActiva ? agregar(varActiva.key, dias.map(x => valorCarga(varActiva.key, x.ses, fbMap))) : null,
      }
    })
    const tot = { ses: datosSemana.reduce((a, s) => a + s.ses, 0), comps: datosSemana.reduce((a, s) => a + s.comps.length, 0), ctrls: datosSemana.reduce((a, s) => a + s.ctrls.length, 0) }
    const maxC = Math.max(1, ...datosSemana.map(s => s.carga || 0))
    const CH = 92

    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: LABEL_W + W + 8 }}>
          {grupos.cal && <>
            {/* Meses */}
            <div style={{ display: 'flex' }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 5 }} />
              <div style={{ position: 'relative', width: W, height: 24 }}>
                {meses.map(m => (
                  <div key={m.m + m.i} style={{ position: 'absolute', left: m.i * COL, width: m.n * COL, top: 4, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'var(--text2)', borderLeft: m.i ? '1px solid var(--border)' : 'none', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.n * COL > 60 ? m.m.split(' ')[0] : m.m.slice(0, 3)}</div>
                ))}
              </div>
            </div>
            {/* Semanas */}
            <div style={{ display: 'flex' }}>
              <Etiqueta g="cal" texto="Semanas" icono="📅" alto={118} sub={<>
                <span style={{ color: GRUPOS.pro.color, fontWeight: 600 }}>{tot.ses} sesiones</span><br />
                {tot.comps > 0 && <><span style={{ color: '#b45309', fontWeight: 600 }}>{tot.comps} 🏆</span><br /></>}
                {tot.ctrls > 0 && <span style={{ color: GRUPOS.cal.color, fontWeight: 600 }}>{tot.ctrls} 🔬</span>}
              </>} />
              <div style={{ display: 'flex', width: W }}>
                {datosSemana.map(s => {
                  const esHoy = hoy >= s.d && hoy <= addDays(s.d, 6)
                  const n = numSemana(s.d)
                  const fueraPlan = addDays(s.d, 6) < planIni || s.d > planFin
                  return (
                    <div key={k(s.d)} title={`Semana ${n || '—'} · ${format(s.d, 'd MMM', { locale: es })}–${format(addDays(s.d, 6), 'd MMM', { locale: es })}${tituloSemana(s.d) ? ' · ' + tituloSemana(s.d) : ''}`}
                      onClick={() => { setCursor(s.d); cambiarVision('meso') }}
                      style={{ width: COL - 3, margin: '0 1.5px', borderRadius: 7, background: esHoy ? GRUPOS.cal.bg : fueraPlan ? 'var(--bg)' : GRUPOS.cal.soft, boxShadow: esHoy ? `inset 0 0 0 1.5px ${GRUPOS.cal.color}` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0', cursor: 'pointer', gap: 2, opacity: fueraPlan ? .55 : 1 }}>
                      <span style={{ fontSize: 8.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{n ? 'S' + n : ''}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: esHoy ? GRUPOS.cal.color : 'var(--text)', lineHeight: 1 }}>{format(s.d, 'd')}</span>
                      <span style={{ fontSize: 8.5, color: 'var(--text3)' }}>{format(s.d, 'MMM', { locale: es }).replace('.', '')}</span>
                      <div style={{ height: 20, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
                        {s.comps.length > 0 && <span title={s.comps.map(c => c.nombre).join(', ')} style={{ fontSize: 12, lineHeight: 1 }}>🏆</span>}
                        {s.comps.length === 0 && s.ctrls.length > 0 && <span title={s.ctrls.map(c => c.nombre).join(', ')} style={{ fontSize: 11, lineHeight: 1 }}>🔬</span>}
                      </div>
                      {/* Días de la semana */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '64%' }}>
                        {s.dias.map((x, i) => (
                          <span key={i} style={{ height: 3, borderRadius: 2, background: x.comps.length ? '#d97706' : x.ses.length ? GRUPOS.cal.color : 'var(--bg3)', opacity: x.ses.length || x.comps.length ? (x.ses.every(z => z.tipo_sesion === 'opcional') && !x.comps.length ? .4 : 1) : .7 }} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>}

          {grupos.per && <FilaBarras alto={30} etiqueta={<Etiqueta g="per" texto="Periodo" icono="⇄" alto={30} />} W={W} items={conArrastre('bloque', bloquesF)} xDe={xDe} escala={COL / 7} rIni={ini0} grande onClick={onEditarBloque}
            tipo="bloque" huecos={huecosBloques} onHueco={h => onNuevoBloque?.({ fecha_inicio: k(h.ini), semanas: Math.max(1, Math.round((differenceInCalendarDays(h.fin, h.ini) + 1) / 7)) })} />}
          {grupos.per && (subsF.length
            ? <FilaBarras alto={26} etiqueta={<Etiqueta g="per" texto="Subperiodo" icono="⇄" alto={26} />} W={W} items={conArrastre('sub', subsConBloquesMovidos())} xDe={xDe} escala={COL / 7} rIni={ini0} onClick={s => onEditarSubbloque(s)}
              tipo="sub" huecos={huecosSubs} onHueco={h => onNuevoSubbloque?.({ bloque_id: h.bloque.id, semana_inicio: h.semana_inicio, semana_fin: h.semana_fin })} />
            : <FilaSemanasTitulo alto={26} W={W} cols={semanasCols} COL={COL} />)}

          {grupos.pla && <PlanesMacro semanasCols={semanasCols} COL={COL} W={W} xDe={xDe} ini0={ini0} />}

          {grupos.pla && (
            <div style={{ display: 'flex', marginTop: 6 }}>
              <Etiqueta g="pla" texto="Carga" icono="📈" alto={CH + 22} extra={<SelectorVar />} />
              <div style={{ width: W, height: CH + 22, background: GRUPOS.pla.soft, borderRadius: 8, position: 'relative' }}>
                {varActiva ? (() => {
                  const pts = datosSemana.map((s, i) => s.carga == null ? null : [i * COL + COL / 2, 8 + (CH - 16) * (1 - s.carga / maxC)])
                  const segs = []; let cur = []
                  pts.forEach(p => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = [] } }); if (cur.length) segs.push(cur)
                  return (
                    <svg width={W} height={CH + 22} style={{ display: 'block' }}>
                      {segs.map((sg, i) => (
                        <g key={i}>
                          {sg.length > 1 && <path d={`M${sg[0][0]},${CH} ` + sg.map(p => `L${p[0]},${p[1]}`).join(' ') + ` L${sg[sg.length - 1][0]},${CH} Z`} fill={GRUPOS.pla.color} opacity={.1} />}
                          <polyline points={sg.map(p => p.join(',')).join(' ')} fill="none" stroke={GRUPOS.pla.color} strokeWidth={2} strokeLinejoin="round" />
                        </g>
                      ))}
                      {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={2.6} fill="#fff" stroke={GRUPOS.pla.color} strokeWidth={1.5} />)}
                      {datosSemana.map((s, i) => s.carga != null && (
                        <text key={i} x={i * COL + COL / 2} y={CH + 15} textAnchor="middle" fontSize={9} fontWeight={600} fill="#8a6a07" fontFamily="var(--mono)">{fmtVal(varActiva.key, s.carga)}</text>
                      ))}
                    </svg>
                  )
                })() : <div style={{ fontSize: 11, color: 'var(--text3)', padding: 10 }}>Sin datos de carga en este periodo.</div>}
              </div>
            </div>
          )}

          {grupos.pro && (
            <div style={{ display: 'flex', marginTop: 6 }}>
              <Etiqueta g="pro" texto="Sesiones" icono="◉" alto={40} />
              <div style={{ display: 'flex', width: W, background: GRUPOS.pro.soft, borderRadius: 8, alignItems: 'center' }}>
                {datosSemana.map(s => (
                  <div key={k(s.d)} style={{ width: COL, display: 'flex', justifyContent: 'center' }}>
                    {s.ses > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 4px', borderRadius: 6, background: GRUPOS.pro.color + 'cc', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.ses}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ════════════════════════════ CUADRÍCULA ════════════════════════════
  // Semanas en filas × días en columnas. Color = etiqueta de un grupo de categorías; código = etiqueta de otro.
  function codigoEtiqueta(nombre) {
    const t = (nombre || '').trim()
    const m = t.match(/^[≥<>]?\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*%/)
    if (m) return (t.startsWith('≥') ? '≥' : '') + (m[2] || m[1])
    const z = t.match(/^(Z\d(?:[–-]\d)?)/i); if (z) return z[1].toUpperCase()
    const w = t.split(/[\s·(/]/)[0]
    return w.length <= 3 ? w : w.charAt(0).toUpperCase()
  }
  function VistaCuadricula() {
    const gruposConDatos = catGrupos.filter(g => contenidos.some(c => c.etiqueta_id && catEtiquetas.find(e => e.id === c.etiqueta_id)?.grupo_id === g.id))
    const defColor = gruposConDatos.find(g => g.seleccion === 'unica') || gruposConDatos[0]
    const defCod = gruposConDatos.find(g => g.id !== defColor?.id && /ritmo/i.test(g.nombre)) || gruposConDatos.find(g => g.id !== defColor?.id)
    const gColor = catGrupos.find(g => g.id === cuadColor) || defColor
    const gCod = cuadCod === '' ? null : (catGrupos.find(g => g.id === cuadCod) || defCod)
    const etiq = id => catEtiquetas.find(e => e.id === id)
    const delGrupo = (d, g) => g ? contDia(d).filter(c => c.etiqueta_id && etiq(c.etiqueta_id)?.grupo_id === g.id) : []
    const semanas = []
    for (let d = lunes(rango.ini); d <= rango.fin; d = addWeeks(d, 1)) semanas.push(d)
    const CW = 46, CHh = 34
    const selStyle = { fontSize: 11.5, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontFamily: 'inherit', color: 'var(--text)' }
    // leyenda: etiquetas del grupo color usadas
    const usadas = gColor ? catEtiquetas.filter(e => e.grupo_id === gColor.id && contenidos.some(c => c.etiqueta_id === e.id)) : []
    return (
      <div style={{ padding: '6px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 10, fontSize: 12, color: 'var(--text2)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Color
            <select value={gColor?.id || ''} onChange={e => setCuadColor(e.target.value)} style={selStyle}>
              {catGrupos.map(g => <option key={g.id} value={g.id}>{g._seccion ? g._seccion.nombre + ' · ' : ''}{g.nombre}</option>)}
            </select></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Código
            <select value={cuadCod === '' ? '' : (gCod?.id || '')} onChange={e => setCuadCod(e.target.value)} style={selStyle}>
              <option value="">— Ninguno —</option>
              {catGrupos.map(g => <option key={g.id} value={g.id}>{g._seccion ? g._seccion.nombre + ' · ' : ''}{g.nombre}</option>)}
            </select></label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginLeft: 'auto' }}>
            {usadas.map(e => <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: e.color }} />{e.nombre}</span>)}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <style>{`table.tl-cuad{width:auto!important;margin:0}.tl-cuad th,.tl-cuad td{border:none;background:none;padding:0;height:auto;font-family:inherit;text-transform:none;letter-spacing:0}.tl-cuad thead th{font-size:10px;color:var(--text3);font-weight:600;padding-bottom:3px}`}</style>
          <table className="tl-cuad" style={{ borderCollapse: 'separate', borderSpacing: 3, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <th style={{ width: 22 }} /><th style={{ textAlign: 'left', padding: '0 4px' }}>SEM.</th><th />
                {DIAS.map(dd => <th key={dd} style={{ fontWeight: 600 }}>{dd.slice(0, 1)}</th>)}
                <th style={{ textAlign: 'right', padding: '0 6px' }}>KM OBJ.</th><th style={{ textAlign: 'left', padding: '0 8px' }}>NOTA DE LA SEMANA</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((l, wi) => {
                const b = bloqueDe(addDays(l, 3))
                const primeraDelBloque = b && (wi === 0 || bloqueDe(addDays(semanas[wi - 1], 3))?.id !== b.id)
                const nFilas = b ? semanas.filter(x => bloqueDe(addDays(x, 3))?.id === b.id).length : 1
                const sem = semanaPorLunes.get(k(l))
                const esHoy = hoy >= l && hoy <= addDays(l, 6)
                return (
                  <tr key={k(l)}>
                    {b ? (primeraDelBloque && (
                      <td rowSpan={nFilas} onClick={() => onEditarBloque?.(b)} title={b.nombre} style={{ width: 22, background: (b.color || '#2d6a4f') + '30', borderRadius: 4, cursor: 'pointer', verticalAlign: 'middle', padding: 0 }}>
                        <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: b.color || '#2d6a4f', whiteSpace: 'nowrap', margin: '0 auto', overflow: 'hidden', maxHeight: nFilas * (CHh + 3) }}>{b.nombre}</div>
                      </td>)) : <td />}
                    <td onClick={() => { setCursor(l); cambiarVision('meso') }} title="Abrir la semana en Visión Meso" style={{ fontWeight: 700, fontSize: 14, padding: '0 4px', cursor: 'pointer', color: esHoy ? GRUPOS.cal.color : 'var(--text)' }}>{numSemana(l) || ''}</td>
                    <td style={{ fontSize: 10.5, color: 'var(--text3)', whiteSpace: 'nowrap', paddingRight: 4 }}>{format(l, 'd MMM', { locale: es }).replace('.', '')}</td>
                    {Array.from({ length: 7 }, (_, i) => addDays(l, i)).map(d => {
                      const cc = delGrupo(d, gColor), cod = delGrupo(d, gCod)
                      const col = cc[0] ? (etiq(cc[0].etiqueta_id)?.color || cc[0].color) : null
                      const x = dia(d)
                      const todos = agruparCont(contDia(d))
                      const tip = [format(d, "EEEE d 'de' MMMM", { locale: es }), ...todos.map(c => '· ' + c.texto), ...x.notas.map(n => '📝 ' + n.texto), ...x.ses.map(z => '◉ ' + (z.titulo || 'Sesión'))].join('\n')
                      const claro = col && (() => { const n = parseInt(col.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 165 })()
                      const pid = (planesVisibles(d, d)[0] || planificacion).id
                      return (
                        <td key={k(d)} style={{ padding: 0 }}>
                          <div onClick={ev => abrirEditorDia(ev, d, pid)} title={tip}
                            style={{ width: CW, height: CHh, borderRadius: 5, background: col || (todos.length || x.notas.length ? 'var(--bg3)' : 'var(--bg2)'), color: claro ? '#18232b' : '#fff', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11, fontWeight: 800, outline: isSameDay(d, hoy) ? `2px solid ${GRUPOS.cal.color}` : 'none', outlineOffset: 1 }}>
                            {cc[0] && <span style={{ opacity: .9 }}>{codigoEtiqueta(cc[0].texto).charAt(0)}</span>}
                            {cod.slice(0, 2).map(c => <span key={c.id} style={{ fontSize: 10, padding: '0 2px', borderRadius: 3, background: col ? 'rgba(0,0,0,.2)' : 'transparent', color: col ? 'inherit' : 'var(--text2)' }}>{codigoEtiqueta(c.texto)}</span>)}
                            {cc.length > 1 && <span style={{ position: 'absolute', left: 0, top: 0, borderStyle: 'solid', borderWidth: '9px 9px 0 0', borderColor: `${etiq(cc[1].etiqueta_id)?.color || cc[1].color} transparent transparent transparent`, borderRadius: '5px 0 0 0' }} />}
                            {x.notas.length > 0 && <span style={{ position: 'absolute', right: 3, bottom: 3, width: 4, height: 4, borderRadius: 9, background: col ? 'currentColor' : 'var(--text3)', opacity: .8 }} />}
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'right', fontSize: 12, padding: '0 6px', color: 'var(--text2)', fontWeight: 600 }}>{sem?.km_objetivo ? sem.km_objetivo + ' km' : ''}</td>
                    <td title={[sem?.objetivo, sem?.notas].filter(Boolean).join('\n')} style={{ fontSize: 11.5, color: 'var(--text2)', padding: '0 8px', maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[tituloSemana(l), sem?.notas ? textoPlano(sem.notas).replace(/\n/g, ' · ') : null].filter(Boolean).join(' · ')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', margin: '8px 2px 0' }}>Clic en un día para editar sus contenidos · el punto indica que hay nota · la esquina, un segundo valor del grupo de color · clic en el nº de semana para abrirla.</div>
      </div>
    )
  }

  // ════════════════════════════ PLANES ════════════════════════════
  function planesVisibles(ini, fin) { return planes.filter(p => parseISO(p.fecha_inicio) <= fin && parseISO(p.fecha_fin) >= ini) }
  function tituloPlan(p) { return `${p.nombre} · ${format(parseISO(p.fecha_inicio), 'd MMM yyyy', { locale: es })} – ${format(parseISO(p.fecha_fin), 'd MMM yyyy', { locale: es })}${p.notas ? '\n\n' + p.notas : ''}` }
  function EtiquetaPlan({ p, n, alto }) {
    const abierto = !plegados.has(p.id)
    return (
      <div style={{ width: LABEL_W, minWidth: LABEL_W, height: alto, display: 'flex', alignItems: 'stretch', position: 'sticky', left: 0, zIndex: 5, background: 'var(--surface)' }}>
        <div style={{ width: 4, background: GRUPOS.pla.color, borderRadius: 2, margin: '2px 0' }} />
        <div onClick={() => alternarPlegado(p.id)} title={tituloPlan(p) + '\n\nClic para ' + (abierto ? 'plegar' : 'desplegar') + ' los contenidos'}
          style={{ flex: 1, margin: '3px 8px', borderRadius: 99, background: '#e9d98f', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 10px', minWidth: 0, cursor: 'pointer' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#5c4a06' }}>P{n}</span>
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
          <span style={{ fontSize: 9, color: '#5c4a06', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        </div>
      </div>
    )
  }
  function EtiquetaCont({ texto, alto, color, tenue }) { return (
    <div style={{ width: LABEL_W, minWidth: LABEL_W, height: alto, display: 'flex', alignItems: 'stretch', position: 'sticky', left: 0, zIndex: 5, background: 'var(--surface)' }}>
      <div style={{ width: 4, background: GRUPOS.pla.color, opacity: .35, margin: '0' }} />
      <div title={texto} style={{ flex: 1, margin: '2px 8px 2px 22px', borderRadius: 99, background: tenue ? 'transparent' : GRUPOS.pla.bg, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, padding: '0 10px', minWidth: 0 }}>
        {color && <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }} />}
        <span style={{ fontSize: 11, color: tenue ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>
      </div>
    </div>
  ) }

  function PlanesMacro({ semanasCols, COL, W, xDe, ini0 }) {
    const finR = addDays(semanasCols[semanasCols.length - 1], 6)
    const vis = planesVisibles(ini0, finR)
    if (!vis.length) return null
    return vis.map(p => {
      const n = planes.indexOf(p) + 1
      const pI = parseISO(p.fecha_inicio), pF = parseISO(p.fecha_fin)
      const a = pI < ini0 ? ini0 : pI, b = pF > finR ? finR : pF
      const abierto = !plegados.has(p.id)
      const conts = contenidosPlan(p.id)
      const semCont = (d, txt) => Array.from({ length: 7 }, (_, i) => addDays(d, i)).filter(x => contDia(x, p.id).some(c => c.texto.trim().toLowerCase() === txt.toLowerCase())).length
      return (
        <div key={p.id} style={{ marginTop: 6 }}>
          <div style={{ display: 'flex' }}>
            <EtiquetaPlan p={p} n={n} alto={28} />
            <div style={{ position: 'relative', width: W, height: 28, background: GRUPOS.pla.soft, borderRadius: 8 }}>
              <div title={tituloPlan(p)} style={{ position: 'absolute', left: xDe(a) + 1.5, width: Math.max(4, (differenceInCalendarDays(b, a) + 1) / 7 * COL - 3), top: 3, bottom: 3, borderRadius: 7, background: GRUPOS.pla.color + '26', border: `1px solid ${GRUPOS.pla.color}77`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 8px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5b04', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
              </div>
            </div>
          </div>
          {abierto ? <>
            {conts.map(c => (
              <div key={c.texto} style={{ display: 'flex' }}>
                <EtiquetaCont texto={c.texto} color={c.color} alto={22} />
                <div style={{ display: 'flex', width: W, height: 22, background: '#fffdf4' }}>
                  {semanasCols.map(d => { const nd = semCont(d, c.texto); return (
                    <div key={k(d)} className="tl-cont" onClick={ev => abrirEditorSemana(ev, d, p.id)} style={{ width: COL - 3, margin: '0 1.5px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 5 }}>
                      {nd > 0 && <span title={`${c.texto} · ${nd} día${nd === 1 ? '' : 's'}`} style={{ width: '100%', height: 15, borderRadius: 99, background: (c.color || GRUPOS.pla.color) + 'cc', color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>{COL >= 56 ? c.texto : nd > 1 ? '×' + nd : ''}</span>}
                    </div>
                  ) })}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex' }}>
              <EtiquetaCont texto="+ Añadir contenido" alto={20} tenue />
              <div style={{ display: 'flex', width: W, height: 20 }}>
                {semanasCols.map(d => (
                  <div key={k(d)} className="tl-cont" onClick={ev => abrirEditorSemana(ev, d, p.id)} title="Añadir contenidos a esta semana" style={{ width: COL - 3, margin: '0 1.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', borderRadius: 5 }}>
                    <span className="tl-mas-cont" style={{ fontSize: 11, color: GRUPOS.pla.color }}>＋</span>
                  </div>
                ))}
              </div>
            </div>
          </> : (() => {
            const porSem = semanasCols.map(d => agruparCont(Array.from({ length: 7 }, (_, i) => contDia(addDays(d, i), p.id)).flat()))
            const maxN = Math.max(1, ...porSem.map(x => x.length))
            const alto = Math.max(34, Math.min(6, maxN) * 19 + 12)
            return (
              <div style={{ display: 'flex', marginTop: 2 }}>
                <EtiquetaCont texto="Contenidos" alto={alto} tenue />
                <div style={{ display: 'flex', width: W, height: alto, background: GRUPOS.pla.soft, borderRadius: 8 }}>
                  {semanasCols.map((d, i) => (
                    <div key={k(d)} onClick={ev => abrirEditorSemana(ev, d, p.id)} className="tl-cont"
                      style={{ width: COL - 3, margin: '0 1.5px', padding: '5px 0', display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center', cursor: 'pointer', borderRadius: 6, overflow: 'hidden' }}>
                      {porSem[i].slice(0, 6).map(c => <span key={c.texto} style={{ width: '92%', display: 'flex' }}><ChipContenido texto={COL < 44 ? c.texto.slice(0, 3) : c.texto} color={c.color} peque /></span>)}
                      {porSem[i].length > 6 && <span style={{ fontSize: 9, color: 'var(--text3)' }}>+{porSem[i].length - 6}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )
    })
  }

  function PlanesDias({ lunesList, dias, WS, GAP, COL, W, micro, Celdas }) {
    const ini = lunesList[0], fin = addDays(lunesList[lunesList.length - 1], 6)
    const vis = planesVisibles(ini, fin)
    if (!vis.length) return null
    return vis.map(p => {
      const n = planes.indexOf(p) + 1
      const pI = parseISO(p.fecha_inicio), pF = parseISO(p.fecha_fin)
      const abierto = !plegados.has(p.id)
      const conts = contenidosPlan(p.id)
      const altoFila = micro ? 26 : 22
      return (
        <div key={p.id} style={{ marginTop: 6 }}>
          <div style={{ display: 'flex' }}>
            <EtiquetaPlan p={p} n={n} alto={28} />
            <div style={{ display: 'flex', gap: GAP, width: W }}>
              {lunesList.map(l => {
                const f = addDays(l, 6)
                const dentro = pI <= f && pF >= l
                const a = pI < l ? l : pI, b = pF > f ? f : pF
                return (
                  <div key={k(l)} style={{ position: 'relative', width: WS, height: 28, background: GRUPOS.pla.soft, borderRadius: 8 }}>
                    {dentro && <div title={tituloPlan(p)} style={{ position: 'absolute', left: differenceInCalendarDays(a, l) * COL + 3, width: (differenceInCalendarDays(b, a) + 1) * COL - 6, top: 3, bottom: 3, borderRadius: 7, background: GRUPOS.pla.color + '26', border: `1px solid ${GRUPOS.pla.color}77`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 8px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#7a5b04', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
                    </div>}
                  </div>
                )
              })}
            </div>
          </div>
          {abierto ? <>
            {conts.map(c => (
              <div key={c.texto} style={{ display: 'flex', marginTop: 1 }}>
                <EtiquetaCont texto={c.texto} color={c.color} alto={altoFila} />
                <Celdas alto={altoFila} fondo="#fffdf4" render={d => {
                  const esta = contDia(d, p.id).some(x => x.texto.trim().toLowerCase() === c.texto.trim().toLowerCase())
                  return (
                    <div className="tl-cont" onClick={() => alternarContenido(p.id, c, d)} title={esta ? `Quitar «${c.texto}» de este día` : `Añadir «${c.texto}» a este día`}
                      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 4px', cursor: 'pointer' }}>
                      {esta ? <span style={{ width: '100%', height: altoFila - 7, borderRadius: 99, background: (c.color || GRUPOS.pla.color) + 'cc', color: '#fff', fontSize: micro ? 10.5 : 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 6px' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texto}</span></span>
                        : <span className="tl-mas-cont" style={{ margin: '0 auto', fontSize: 11, color: GRUPOS.pla.color }}>＋</span>}
                    </div>
                  )
                }} />
              </div>
            ))}
            <div style={{ display: 'flex', marginTop: 1 }}>
              <EtiquetaCont texto="+ Añadir contenido" alto={20} tenue />
              <Celdas alto={20} fondo="transparent" borde={false} render={d => (
                <div className="tl-cont" onClick={ev => abrirEditorDia(ev, d, p.id)} title="Añadir contenidos a este día" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <span className="tl-mas-cont" style={{ fontSize: 11, color: GRUPOS.pla.color }}>＋</span>
                </div>
              )} />
            </div>
          </> : (() => {
            const maxN = Math.max(1, ...dias.map(d => agruparCont(contDia(d, p.id)).length))
            const alto = Math.max(micro ? 40 : 34, maxN * (micro ? 23 : 21) + 12)
            return (
              <div style={{ display: 'flex', marginTop: 2 }}>
                <EtiquetaCont texto="Contenidos" alto={alto} tenue />
                <Celdas alto={alto} fondo={GRUPOS.pla.soft} render={d => (
                  <div className="tl-cont" onClick={ev => abrirEditorDia(ev, d, p.id)} style={{ position: 'absolute', inset: 0, padding: 4, display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer', overflow: 'hidden' }}>
                    {agruparCont(contDia(d, p.id)).map(c => <ChipContenido key={c.texto} texto={c.texto} color={c.color} peque={!micro} />)}
                    <span className="tl-mas-cont" style={{ marginTop: 'auto', alignSelf: 'center', fontSize: 11, color: GRUPOS.pla.color }}>＋</span>
                  </div>
                )} />
              </div>
            )
          })()}
        </div>
      )
    })
  }

  // Barras de bloques / subbloques sobre una escala de días
  function FilaBarras({ alto, etiqueta, W, items, xDe, escala, rIni, grande, onClick, tipo, huecos = [], onHueco }) {
    const editable = !!tipo && !!onRecargar
    return (
      <div style={{ display: 'flex', marginTop: 4 }}>
        {etiqueta}
        <div style={{ position: 'relative', width: W, height: alto, background: GRUPOS.per.soft, borderRadius: 8, opacity: guardandoPer ? .6 : 1 }}>
          {editable && !arrastre && huecos.map(h => {
            const iniV = h.ini < rIni ? rIni : h.ini
            const x = xDe(iniV), w = (differenceInCalendarDays(h.fin, iniV) + 1) * escala
            if (x + w <= 0 || x >= W || w < 14) return null
            return (
              <button key={k(h.ini)} onClick={() => onHueco?.(h)} title={`Añadir ${tipo === 'bloque' ? 'periodo' : 'subperiodo'} · ${format(h.ini, 'd MMM', { locale: es })} – ${format(h.fin, 'd MMM', { locale: es })}`}
                className="tl-hueco" style={{ position: 'absolute', left: x + 2, width: Math.min(w, W - x) - 4, top: 3, bottom: 3, borderRadius: 7, border: `1px dashed ${GRUPOS.per.color}66`, background: 'transparent', color: GRUPOS.per.color, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>+</button>
            )
          })}
          {items.map(it => {
            const iniV = it._ini < rIni ? rIni : it._ini
            const x = xDe(iniV), w = (differenceInCalendarDays(it._fin, iniV) + 1) * escala
            if (x + w <= 0 || x >= W) return null
            const col = (it._bloque?.color || it.color || '#2d6a4f')
            const activo = arrastre && arrastre.id === it.id
            const semanasTxt = Math.round((differenceInCalendarDays(it._fin, it._ini) + 1) / 7)
            return (
              <div key={it.id} onClick={editable ? undefined : () => onClick?.(it)} onMouseDown={editable ? ev => iniciarMover(ev, tipo, it, escala * 7, onClick) : undefined}
                title={`${it.nombre} · ${format(it._ini, 'd MMM', { locale: es })} – ${format(it._fin, 'd MMM', { locale: es })} (${semanasTxt} sem.)${it.objetivo ? '\n' + it.objetivo : ''}${editable ? '\nClic para editar · arrastra para mover · arrastra el borde derecho para cambiar la duración' : ''}`}
                style={{ position: 'absolute', left: x + 1.5, width: Math.max(4, Math.min(w, W - x) - 3), top: 3, bottom: 3, borderRadius: 7, cursor: activo && arrastre.modo === 'mover' ? 'grabbing' : editable ? 'grab' : 'pointer', overflow: 'hidden', userSelect: 'none',
                  background: grande ? col + '26' : col + '14', border: `1px ${it._empujado ? 'dashed' : 'solid'} ${activo || it._empujado ? col : col + '66'}`, boxShadow: activo ? `0 0 0 2px ${col}33` : 'none', zIndex: activo ? 2 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 10px 0 6px' }}>
                <span style={{ fontSize: grande ? 11 : 10, fontWeight: grande ? 700 : 600, color: col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nombre}{activo ? (arrastre.modo === 'mover' ? ` · ${format(it._ini, 'd MMM', { locale: es })}` : ` · ${semanasTxt} sem.`) : ''}</span>
                {editable && (
                  <span onMouseDown={ev => iniciarArrastre(ev, tipo, it, escala * 7)} onClick={ev => ev.stopPropagation()} className="tl-asa"
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 9, cursor: 'ew-resize', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 3, height: '55%', borderRadius: 2, background: col, opacity: .55 }} />
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Sin subbloques: el título de cada semana (texto de la semana)
  function FilaSemanasTitulo({ alto, W, cols, COL }) {
    return (
      <div style={{ display: 'flex', marginTop: 4 }}>
        <Etiqueta g="per" texto="Subperiodo" icono="⇄" alto={alto} />
        <div style={{ display: 'flex', width: W, height: alto, background: GRUPOS.per.soft, borderRadius: 8 }}>
          {cols.map(d => {
            const t = tituloSemana(d); const b = bloqueDe(d); const col = b?.color || '#cf4646'
            return (
              <div key={k(d)} title={t || ''} style={{ width: COL - 3, margin: '3px 1.5px', borderRadius: 6, background: t ? col + '12' : 'transparent', border: t ? `1px solid ${col}40` : 'none', fontSize: 9, color: col, fontWeight: 600, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', padding: '0 3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {t && COL >= 50 ? t : t ? '•' : ''}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ════════════════════════════ MESO / MICRO ════════════════════════════
  function VistaSemanas({ semanas: nSem, micro }) {
    const lunesList = Array.from({ length: nSem }, (_, i) => addWeeks(cursor, i))
    const GAP = micro ? 0 : 14
    const disponible = ancho - LABEL_W - 50 - GAP * (nSem - 1)
    const COL = Math.max(micro ? 120 : 56, Math.floor(disponible / (7 * nSem)))
    const WS = COL * 7
    const W = WS * nSem + GAP * (nSem - 1)
    const dias = lunesList.flatMap(l => Array.from({ length: 7 }, (_, i) => addDays(l, i)))
    const xDia = d => {
      const si = lunesList.findIndex(l => d >= l && d <= addDays(l, 6))
      return si * (WS + GAP) + differenceInCalendarDays(d, lunesList[si]) * COL
    }
    const cargaDias = varActiva ? dias.map(d => valorCarga(varActiva.key, dia(d).ses, fbMap)) : []
    const maxC = Math.max(1, ...cargaDias.map(v => v || 0))
    const CH = micro ? 110 : 90

    const Celdas = ({ alto, fondo, render, borde = true }) => (
      <div style={{ display: 'flex', gap: GAP, width: W }}>
        {lunesList.map(l => (
          <div key={k(l)} style={{ display: 'flex', width: WS, height: alto, background: fondo, borderRadius: 8, overflow: 'hidden' }}>
            {Array.from({ length: 7 }, (_, i) => addDays(l, i)).map((d, i) => (
              <div key={k(d)} style={{ width: COL, height: '100%', borderLeft: borde && i ? '1px solid rgba(0,0,0,.05)' : 'none', position: 'relative', background: isSameDay(d, hoy) ? 'rgba(45,106,79,.06)' : 'transparent' }}>{render(d)}</div>
            ))}
          </div>
        ))}
      </div>
    )

    return (
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: LABEL_W + W + 8 }}>
          {/* Navegación + cabecera de semanas */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
            <div style={{ width: LABEL_W, minWidth: LABEL_W, display: 'flex', justifyContent: 'flex-end', paddingRight: 8, position: 'sticky', left: 0, background: 'var(--surface)', zIndex: 5 }}>
              <button onClick={() => setCursor(c => addWeeks(c, -1))} style={btnFlecha} title="Semana anterior">‹</button>
            </div>
            <div style={{ display: 'flex', gap: GAP, width: W, alignItems: 'center' }}>
              {lunesList.map(l => {
                const n = numSemana(l); const t = tituloSemana(l)
                return (
                  <div key={k(l)} style={{ width: WS, textAlign: 'center', padding: '4px 0 6px', borderBottom: '1px solid var(--border)' }}>
                    {micro ? (
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                        Programación{clienteNombre ? ` · ${clienteNombre}` : ''} <span style={{ color: 'var(--text3)', fontWeight: 500 }}>({format(l, 'd MMM', { locale: es })} – {format(addDays(l, 6), 'd MMM', { locale: es })})</span>
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text2)', textTransform: 'uppercase' }}>Semana {n || '—'}</div>
                    )}
                    {t && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</div>}
                  </div>
                )
              })}
            </div>
            <button onClick={() => setCursor(c => addWeeks(c, 1))} style={{ ...btnFlecha, marginLeft: 6 }} title="Semana siguiente">›</button>
          </div>

          {/* Calendarización: fecha y eventos */}
          {grupos.cal && <>
            <div style={{ display: 'flex', marginTop: 6 }}>
              <Etiqueta g="cal" texto="Fecha" icono="📅" alto={micro ? 58 : 54} />
              <Celdas alto={micro ? 58 : 54} fondo={GRUPOS.cal.soft} borde={false} render={d => {
                const esHoy = isSameDay(d, hoy), fuera = d < planIni || d > planFin
                return (
                  <div onClick={() => { if (!micro) { setCursor(lunes(d)); cambiarVision('micro') } }} style={{ height: '100%', display: 'flex', flexDirection: micro ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: micro ? 6 : 1, cursor: micro ? 'default' : 'pointer', opacity: fuera ? .45 : 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', letterSpacing: '.04em' }}>{DIAS[(d.getDay() + 6) % 7]}</span>
                    <span style={{ fontSize: micro ? 22 : 18, fontWeight: 700, lineHeight: 1, color: esHoy ? '#fff' : 'var(--text)', background: esHoy ? GRUPOS.cal.color : 'transparent', borderRadius: 8, padding: esHoy ? '2px 6px' : 0 }}>{format(d, 'd')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase' }}>{format(d, 'MMM', { locale: es }).replace('.', '')}</span>
                  </div>
                )
              }} />
            </div>
            {(() => { const nMax = Math.max(0, ...dias.map(d => { const x = dia(d); return x.comps.length + x.ctrls.length + x.notas.length + (x.ses.length ? 1 : 0) + (x.ses.some(z => z.tipo_sesion === 'opcional') ? 1 : 0) })); const altoEv = Math.max(micro ? 64 : 58, nMax * 21 + 10); return (
            <div style={{ display: 'flex', marginTop: 4 }}>
              <Etiqueta g="cal" texto="Eventos" icono="⚑" alto={altoEv} />
              <Celdas alto={altoEv} fondo={GRUPOS.cal.soft} render={d => {
                const x = dia(d)
                const entreno = x.ses.filter(s => s.tipo_sesion !== 'opcional').length
                const opc = x.ses.length - entreno
                return (
                  <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
                    {x.comps.map(c => <Chip key={c.id} onClick={() => onAbrirComp?.(c)} bg="#fef3c7" color="#92400e" titulo={c.nombre}>🏆 {c.nombre}</Chip>)}
                    {x.ctrls.map(c => <Chip key={c.id} onClick={() => onAbrirControl?.(c)} bg={GRUPOS.cal.bg} color={GRUPOS.cal.color} titulo={c.nombre}>🔬 {c.nombre}</Chip>)}
                    {entreno > 0 && <Chip bg="var(--accent)" color="#fff" titulo={`${entreno} sesión(es)`}>Entreno{entreno > 1 ? ` ×${entreno}` : ''}</Chip>}
                    {opc > 0 && <Chip bg="transparent" color="var(--accent)" borde={`1px dashed var(--accent)`} titulo="Sesión opcional">☆{COL >= 90 ? ' Opcional' : ''}{opc > 1 ? ` ×${opc}` : ''}</Chip>}
                    {x.notas.map(n => <Chip key={n.id} onClick={() => onAbrirNota?.(n)} bg="#f1f5f9" color="#475569" borde="1px solid #cbd5e1" titulo={n.texto}>📝 {n.texto}</Chip>)}
                  </div>
                )
              }} />
            </div>
            ) })()}
          </>}

          {/* Periodización */}
          {grupos.per && <>
            <FilaBarrasDias alto={30} texto="Periodo" items={bloquesF} lunesList={lunesList} WS={WS} GAP={GAP} COL={COL} W={W} grande onClick={onEditarBloque} />
            {subsF.length
              ? <FilaBarrasDias alto={26} texto="Subperiodo" items={subsF} lunesList={lunesList} WS={WS} GAP={GAP} COL={COL} W={W} onClick={onEditarSubbloque} />
              : (
                <div style={{ display: 'flex', marginTop: 4 }}>
                  <Etiqueta g="per" texto="Subperiodo" icono="⇄" alto={26} sub={null} />
                  <div style={{ display: 'flex', gap: GAP, width: W }}>
                    {lunesList.map(l => { const t = tituloSemana(l); const col = bloqueDe(l)?.color || '#cf4646'; return (
                      <div key={k(l)} style={{ width: WS, height: 26, background: GRUPOS.per.soft, borderRadius: 8, display: 'flex', alignItems: 'center', padding: 3, boxSizing: 'border-box' }}>
                        {t && <div title={t} style={{ flex: 1, height: '100%', borderRadius: 6, background: col + '14', border: `1px solid ${col}55`, color: col, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>Semana {numSemana(l)} · {t}</div>}
                      </div>
                    ) })}
                  </div>
                </div>
              )}
          </>}

          {/* Planes y sus contenidos */}
          {grupos.pla && <PlanesDias lunesList={lunesList} dias={dias} WS={WS} GAP={GAP} COL={COL} W={W} micro={micro} Celdas={Celdas} />}

          {/* Planificación: carga del día */}
          {grupos.pla && (
            <div style={{ display: 'flex', marginTop: 6 }}>
              <Etiqueta g="pla" texto="Carga día" icono="📈" alto={CH} extra={<SelectorVar />} />
              <Celdas alto={CH} fondo={GRUPOS.pla.soft} render={d => {
                if (!varActiva) return null
                const v = valorCarga(varActiva.key, dia(d).ses, fbMap)
                if (v == null) return null
                const h = Math.max(3, (CH - 26) * (v / maxC))
                return (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8a6a07', fontFamily: 'var(--mono)', marginBottom: 2 }}>{fmtVal(varActiva.key, v)}</span>
                    <div style={{ width: Math.min(28, COL * 0.45), height: h, borderRadius: '5px 5px 2px 2px', background: GRUPOS.pla.color, opacity: .75 }} />
                  </div>
                )
              }} />
            </div>
          )}

          {/* Programación: sesiones */}
          {grupos.pro && (() => {
            const maxSes = Math.max(1, ...dias.map(d => dia(d).ses.length))
            const altoCard = micro ? 74 : 58
            const alto = Math.max(micro ? 200 : 84, maxSes * (altoCard + 5) + 30)
            return (
              <div style={{ display: 'flex', marginTop: 6 }}>
                <Etiqueta g="pro" texto="Sesiones" icono="◉" alto={alto} />
                <Celdas alto={alto} fondo={GRUPOS.pro.soft} render={d => (
                  <div className="tl-celda-ses" style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 5, height: '100%', boxSizing: 'border-box' }}>
                    {dia(d).ses.map(s => <TarjetaSesion key={s.id} s={s} micro={micro} alto={altoCard} />)}
                    {onNuevaSesion && <button className="tl-mas" onClick={() => onNuevaSesion(k(d))} title="Nueva sesión"
                      style={{ marginTop: 'auto', alignSelf: 'center', border: '1px dashed ' + GRUPOS.pro.color + '88', background: 'transparent', color: GRUPOS.pro.color, borderRadius: 6, fontSize: 12, width: 24, height: 20, cursor: 'pointer', lineHeight: 1 }}>+</button>}
                  </div>
                )} />
              </div>
            )
          })()}
          
        </div>
      </div>
    )
  }

  function FilaBarrasDias({ alto, texto, items, lunesList, WS, GAP, COL, W, grande, onClick }) {
    return (
      <div style={{ display: 'flex', marginTop: 4 }}>
        <Etiqueta g="per" texto={texto} icono="⇄" alto={alto} />
        <div style={{ display: 'flex', gap: GAP, width: W }}>
          {lunesList.map(l => {
            const fin = addDays(l, 6)
            return (
              <div key={k(l)} style={{ position: 'relative', width: WS, height: alto, background: GRUPOS.per.soft, borderRadius: 8 }}>
                {items.filter(it => it._ini <= fin && it._fin >= l).map(it => {
                  const a = it._ini < l ? l : it._ini, b = it._fin > fin ? fin : it._fin
                  const x = differenceInCalendarDays(a, l) * COL, w = (differenceInCalendarDays(b, a) + 1) * COL
                  const col = it._bloque?.color || it.color || '#2d6a4f'
                  return (
                    <div key={it.id} onClick={() => onClick?.(it)} title={`${it.nombre}${it.objetivo ? '\n' + it.objetivo : ''}`}
                      style={{ position: 'absolute', left: x + 3, width: w - 6, top: 3, bottom: 3, borderRadius: 7, cursor: 'pointer', background: grande ? col + '26' : col + '14', border: `1px solid ${col}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '0 6px' }}>
                      <span style={{ fontSize: grande ? 11 : 10, fontWeight: grande ? 700 : 600, color: col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nombre}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function TarjetaSesion({ s, micro, alto }) {
    const fb = fbMap.get(s.id)
    const est = estadoColor(s, fb)
    const opc = s.tipo_sesion === 'opcional'
    return (
      <div onClick={() => onAbrirSesion?.(s)} title={[s.titulo, s.duracion_min ? s.duracion_min + ' min' : null, opc ? 'Opcional' : null].filter(Boolean).join(' · ')}
        style={{ position: 'relative', height: alto, flexShrink: 0, borderRadius: 8, background: '#fff', border: `1px ${opc ? 'dashed' : 'solid'} ${GRUPOS.pro.color}${opc ? '88' : '55'}`, boxShadow: '0 1px 2px rgba(0,0,0,.05)', padding: micro ? '7px 9px' : '5px 6px', cursor: 'pointer', overflow: 'hidden', boxSizing: 'border-box', opacity: opc ? .85 : 1 }}>
        {est && <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, background: est }} />}
        {micro ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: 8 }}>
            <span style={{ marginRight: 3 }}>{iconoSesion(s)}</span>{s.titulo}
          </div>
        ) : (<>
          <div style={{ fontSize: 11, lineHeight: 1 }}>{iconoSesion(s)}</div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', hyphens: 'auto' }} lang="es">{s.titulo}</div>
        </>)}
        <div style={{ fontSize: micro ? 10.5 : 9.5, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[s.hora_inicio ? String(s.hora_inicio).slice(0, 5) : null, s.duracion_min ? s.duracion_min + "'" : null, opc && micro ? '☆ opcional' : opc ? '☆' : null].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
  }
}

function Chip({ children, bg, color, borde, titulo, onClick }) {
  return (
    <div onClick={onClick} title={titulo}
      style={{ fontSize: 9.5, fontWeight: 700, padding: '3px 4px', borderRadius: 6, background: bg, color, border: borde || 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onClick ? 'pointer' : 'default', textAlign: 'center', flexShrink: 0 }}>
      {children}
    </div>
  )
}
