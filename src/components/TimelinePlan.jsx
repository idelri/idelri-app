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

// ── Componente principal ────────────────────────────────────────────────────
export default function TimelinePlan({
  planificacion, bloques, subbloques, semanasAll, sesiones, competiciones, controles, notas, feedbacks,
  clienteNombre, onAbrirSesion, onNuevaSesion, onEditarBloque, onEditarSubbloque, onAbrirComp, onAbrirControl, onAbrirNota,
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
        {[['macro', 'Visión Macro'], ['meso', 'Visión Meso'], ['micro', 'Visión Micro']].map(([v, l]) => (
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
      </div>
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

          {grupos.per && <FilaBarras alto={30} etiqueta={<Etiqueta g="per" texto="Periodo" icono="⇄" alto={30} />} W={W} items={bloquesF} xDe={xDe} escala={COL / 7} rIni={ini0} grande onClick={onEditarBloque} />}
          {grupos.per && (subsF.length
            ? <FilaBarras alto={26} etiqueta={<Etiqueta g="per" texto="Subperiodo" icono="⇄" alto={26} />} W={W} items={subsF} xDe={xDe} escala={COL / 7} rIni={ini0} onClick={s => onEditarSubbloque(s)} />
            : <FilaSemanasTitulo alto={26} W={W} cols={semanasCols} COL={COL} />)}

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

  // Barras de bloques / subbloques sobre una escala de días
  function FilaBarras({ alto, etiqueta, W, items, xDe, escala, rIni, grande, onClick }) {
    return (
      <div style={{ display: 'flex', marginTop: 4 }}>
        {etiqueta}
        <div style={{ position: 'relative', width: W, height: alto, background: GRUPOS.per.soft, borderRadius: 8 }}>
          {items.map(it => {
            const iniV = it._ini < rIni ? rIni : it._ini
            const x = xDe(iniV), w = (differenceInCalendarDays(it._fin, iniV) + 1) * escala
            if (x + w <= 0 || x >= W) return null
            const col = (it._bloque?.color || it.color || '#2d6a4f')
            return (
              <div key={it.id} onClick={() => onClick?.(it)} title={`${it.nombre} · ${format(it._ini, 'd MMM', { locale: es })} – ${format(it._fin, 'd MMM', { locale: es })}${it.objetivo ? '\n' + it.objetivo : ''}`}
                style={{ position: 'absolute', left: x + 1.5, width: Math.max(4, Math.min(w, W - x) - 3), top: 3, bottom: 3, borderRadius: 7, cursor: 'pointer', overflow: 'hidden',
                  background: grande ? col + '26' : col + '14', border: `1px solid ${col}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>
                <span style={{ fontSize: grande ? 11 : 10, fontWeight: grande ? 700 : 600, color: col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nombre}</span>
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
            <div style={{ display: 'flex', marginTop: 4 }}>
              <Etiqueta g="cal" texto="Eventos" icono="⚑" alto={micro ? 64 : 58} />
              <Celdas alto={micro ? 64 : 58} fondo={GRUPOS.cal.soft} render={d => {
                const x = dia(d)
                const entreno = x.ses.filter(s => s.tipo_sesion !== 'opcional').length
                const opc = x.ses.length - entreno
                return (
                  <div style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
                    {x.comps.map(c => <Chip key={c.id} onClick={() => onAbrirComp?.(c)} bg="#fef3c7" color="#92400e" titulo={c.nombre}>🏆 {c.nombre}</Chip>)}
                    {x.ctrls.map(c => <Chip key={c.id} onClick={() => onAbrirControl?.(c)} bg={GRUPOS.cal.bg} color={GRUPOS.cal.color} titulo={c.nombre}>🔬 {c.nombre}</Chip>)}
                    {entreno > 0 && <Chip bg="var(--accent)" color="#fff" titulo={`${entreno} sesión(es)`}>Entreno{entreno > 1 ? ` ×${entreno}` : ''}</Chip>}
                    {opc > 0 && <Chip bg="transparent" color="var(--accent)" borde={`1px dashed var(--accent)`} titulo="Sesión opcional">☆{COL >= 90 ? ' Opcional' : ''}{opc > 1 ? ` ×${opc}` : ''}</Chip>}
                  </div>
                )
              }} />
            </div>
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
          <style>{`.tl-celda-ses .tl-mas{opacity:0;transition:opacity .15s}.tl-celda-ses:hover .tl-mas{opacity:1}`}</style>
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
