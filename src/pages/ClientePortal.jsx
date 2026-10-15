import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, addDays, isToday, addMonths, subMonths, parseISO, differenceInWeeks, startOfDay, subWeeks, addWeeks } from 'date-fns'
import { calcWeekStart } from './CheckinPortal'
import { es } from 'date-fns/locale'

/* ---------- tokens de diseño ---------- */
const T = {
  bg: '#f5f4f0', bg2: '#eceae4', surface: '#ffffff',
  border: '#e0ddd8', border2: '#d0cdc8',
  ink: '#1a1916', ink2: '#5a5850', ink3: '#9a9890',
  green: '#2d6a4f', greenL: '#e3efe8', greenInk: '#1b4332',
  font: "'Sora', -apple-system, sans-serif", mono: "'DM Mono', 'Courier New', monospace",
}

const ICONOS_FALLBACK = { fuerza: '💪', correr: '🏃', caminar: '🚶', bicicleta: '🚴', nadar: '🏊', movilidad: '🤸', futbol: '⚽', padel: '🎾' }
function iconoSesion(s) {
  if (s?.icono) return s.icono
  const tipos = s?.tipos_actividad?.length > 0 ? s.tipos_actividad : [s?.tipo_actividad || 'fuerza']
  return tipos.map(t => ICONOS_FALLBACK[t] || '💪').join(' ')
}

function badgeEstado(e) {
  if (e === 'completed')  return { label: '✓ Completada',   bg: '#E1F5EE', color: '#0F6E56' }
  if (e === 'partial')    return { label: '◐ Parcial',      bg: '#FAEEDA', color: '#633806' }
  if (e === 'missed')     return { label: '✕ No realizada', bg: '#FCEBEB', color: '#A32D2D' }
  if (e === 'realizada')  return { label: '○ Realizada',    bg: '#DBEAFE', color: '#1D4ED8' }
  return { label: 'Pendiente', bg: T.bg2, color: T.ink3 }
}

function getFeedbackAt(s) {
  if ('feedback_submitted_at' in s) return s.feedback_submitted_at ?? null
  const fb = s.sesion_feedback
  if (!fb) return null
  if (Array.isArray(fb)) return fb[0]?.submitted_at ?? null
  return fb.submitted_at ?? null
}

function badgeFeedback(s) {
  const tieneFeedback = getFeedbackAt(s)
  if (tieneFeedback) return { label: '✓ Feedback', bg: '#EAF3DE', color: '#3B6D11' }
  const e = s.estado_efectivo
  if (e === 'missed') return null
  if (e === 'realizada') return { label: 'Falta tu feedback', bg: '#DBEAFE', color: '#1E40AF' }
  if (e === 'completed' || e === 'partial') return { label: 'Falta tu feedback', bg: '#FAEEDA', color: '#854F0B' }
  return { label: 'Pendiente', bg: '#ECEAE4', color: '#9A9890' }
}

function dotColor(e) {
  if (e === 'completed')  return '#1D9E75'
  if (e === 'partial')    return '#EF9F27'
  if (e === 'missed')     return '#E24B4A'
  if (e === 'realizada')  return '#3B82F6'
  return '#C8C5BC'
}

const TIPO_CONFIG = {
  nota:        { icono: '📝', label: 'Nota',        bg: '#F1EFE8', color: '#5F5E5A' },
  competicion: { icono: '🏆', label: 'Competición', bg: '#FAEEDA', color: '#633806' },
  control:     { icono: '📊', label: 'Evaluación',  bg: '#E6F1FB', color: '#0C447C' },
}
function ItemExtra({ item }) {
  const cfg = TIPO_CONFIG[item._tipo] || TIPO_CONFIG.nota

  // Evaluación — tarjeta rica con resultados estructurados
  if (item._tipo === 'control') {
    const resultados = Array.isArray(item.resultados) ? item.resultados : []
    return (
      <div style={{ borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.color}33`, overflow: 'hidden' }}>
        {/* Cabecera */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{cfg.icono}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: cfg.color, letterSpacing: '.5px', textTransform: 'uppercase', opacity: 0.7 }}>Evaluación</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{item.nombre}</div>
          </div>
          {item.fecha && (
            <span style={{ fontSize: 10, color: cfg.color, opacity: 0.6, flexShrink: 0 }}>
              {format(parseISO(item.fecha), 'd MMM', { locale: es })}
            </span>
          )}
        </div>
        {/* Resultados */}
        {resultados.length > 0 && (
          <div style={{ borderTop: `1px solid ${cfg.color}22`, padding: '6px 10px 6px' }}>
            {resultados.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '2px 0', fontSize: 11, color: cfg.color }}>
                <span style={{ opacity: 0.8 }}>{r.nombre}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                  {r.valor}{r.unidad ? <span style={{ fontWeight: 400, marginLeft: 3, opacity: 0.65 }}>{r.unidad}</span> : null}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Observaciones */}
        {item.notas && (
          <div style={{ borderTop: `1px solid ${cfg.color}22`, padding: '5px 10px 7px' }}>
            <div style={{ fontSize: 9, color: cfg.color, opacity: 0.6, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>Observaciones</div>
            <div style={{ fontSize: 11, color: cfg.color, opacity: 0.85, lineHeight: 1.4 }}>{item.notas}</div>
          </div>
        )}
      </div>
    )
  }

  // Resto de extras (competiciones, notas)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
      <span style={{ fontSize: 15, flexShrink: 0 }}>{cfg.icono}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: cfg.color }}>{item.nombre || item.texto}</div>
        {item.objetivo && <div style={{ fontSize: 11, color: cfg.color, opacity: 0.75, marginTop: 1 }}>{item.objetivo}</div>}
      </div>
      {item.fecha && <span style={{ fontSize: 10, color: cfg.color, opacity: 0.6, flexShrink: 0 }}>{format(parseISO(item.fecha), 'd MMM', { locale: es })}</span>}
    </div>
  )
}

/* ---- Línea de tiempo con zoom ---- */
function Timeline({ bloques, inicio, totalSemanas }) {
  const [zoom, setZoom] = useState(28)
  const scRef = useRef(null)
  const hoy = new Date()
  const diasTranscurridos = Math.max(0, (hoy - inicio) / 86400000)
  const posHoy = Math.min((diasTranscurridos / 7) * zoom, totalSemanas * zoom)
  const enCurso = hoy >= inicio

  useEffect(() => {
    const c = scRef.current
    if (c && enCurso) c.scrollLeft = Math.max(0, posHoy - c.clientWidth / 2)
  }, [posHoy, zoom])

  let acc = 0
  return (
    <div>
      <div ref={scRef} style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ width: totalSemanas * zoom, position: 'relative', paddingTop: 20 }}>
          {enCurso && (
            <>
              <div style={{ position: 'absolute', left: posHoy, top: 0, fontFamily: T.mono, fontSize: 8, background: T.ink, color: '#fff', padding: '1px 5px', borderRadius: 3, transform: 'translateX(-50%)', whiteSpace: 'nowrap', zIndex: 5 }}>HOY</div>
              <div style={{ position: 'absolute', left: posHoy, top: 16, width: 2, height: 50, background: T.ink, zIndex: 4 }} />
            </>
          )}
          <div style={{ display: 'flex', gap: 2 }}>
            {bloques.map((b, i) => {
              const w = (b.semanas || 0) * zoom - 2
              const esCurso = (() => {
                if (!b.fecha_inicio) return false
                const bi = parseISO(b.fecha_inicio + 'T12:00:00')
                const bf = addDays(bi, (b.semanas || 0) * 7)
                return hoy >= bi && hoy < bf
              })()
              acc += b.semanas || 0
              return (
                <div key={b.id} style={{ width: w, height: 44, borderRadius: 6, background: b.color || T.green, border: esCurso ? `2px solid ${T.ink}` : '2px solid transparent', padding: '5px 7px', overflow: 'hidden', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.nombre}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: 'rgba(255,255,255,0.75)' }}>{b.semanas} sem</div>
                </div>
              )
            })}
          </div>
          {/* eje de fechas */}
          <div style={{ display: 'flex', marginTop: 5 }}>
            {bloques.map(b => {
              if (!b.fecha_inicio) return null
              const w = (b.semanas || 0) * zoom
              return (
                <div key={b.id} style={{ width: w, flexShrink: 0, fontFamily: T.mono, fontSize: 8, color: T.ink3, paddingLeft: 2 }}>
                  {format(parseISO(b.fecha_inicio + 'T12:00:00'), 'MMM yy', { locale: es })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <button onClick={() => setZoom(z => Math.max(14, z - 7))} style={{ width: 24, height: 22, border: `1px solid ${T.border}`, background: T.surface, borderRadius: 5, cursor: 'pointer', fontSize: 14, color: T.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
        <button onClick={() => setZoom(z => Math.min(60, z + 7))} style={{ width: 24, height: 22, border: `1px solid ${T.border}`, background: T.surface, borderRadius: 5, cursor: 'pointer', fontSize: 14, color: T.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, marginLeft: 4 }}>zoom</span>
      </div>
    </div>
  )
}

export default function ClientePortal({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [plan, setPlan] = useState(null)
  const [bloques, setBloques] = useState([])
  const [subbloques, setSubbloques] = useState([])
  const [semanas, setSemanas] = useState([])
  const [sesiones, setSesiones] = useState([])
  const [notas, setNotas] = useState([])
  const [competiciones, setCompeticiones] = useState([])
  const [controles, setControles] = useState([])
  const [packs, setPacks] = useState([])
  const [packSesiones, setPackSesiones] = useState([])
  const [checkins, setCheckins] = useState([])
  const [tab, setTab] = useState('semana')
  const [tabInicializada, setTabInicializada] = useState(false)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [calMes, setCalMes] = useState(new Date())
  const [bloquesAbiertos, setBloquesAbiertos] = useState(new Set())
  const [subsAbiertos, setSubsAbiertos] = useState(new Set())
  const [vista, setVista] = useState(() => window.innerWidth >= 768 ? 'escritorio' : 'movil')
  const [stravaConectando, setStravaConectando] = useState(false)
  const [stravaConectado, setStravaConectado] = useState(false)
  const [stravaDesconectando, setStravaDesconectando] = useState(false)
  const [stravaConfirmDesc, setStravaConfirmDesc] = useState(false)
  const [modalRegistrar, setModalRegistrar] = useState(null) // null | { fecha: Date }

  useEffect(() => { cargar() }, [token])

  useEffect(() => {
    if (!cliente || tabInicializada) return
    const cfg = {
      mostrar_semana:     cliente.portal_config?.mostrar_semana     ?? true,
      mostrar_calendario: cliente.portal_config?.mostrar_calendario ?? true,
      mostrar_plan:       cliente.portal_config?.mostrar_plan       ?? true,
    }
    if (cfg.mostrar_semana) setTab('semana')
    else if (cfg.mostrar_calendario) setTab('calendario')
    else setTab('plan')
    setTabInicializada(true)
  }, [cliente])

  async function cargar() {
    setLoading(true)
    const { data: cliArr } = await supabase.rpc('get_cliente_por_token', { p_token: token })
    const cli = cliArr?.[0] ?? null
    if (!cli) { setError('Enlace no válido'); setLoading(false); return }
    setCliente(cli)

    const [planArr, blsArr, subsArr, semsArr] = await Promise.all([
      supabase.rpc('get_plan_activo_por_token_cliente',   { p_token: token }).then(r => r.data),
      supabase.rpc('get_bloques_por_token_cliente',       { p_token: token }).then(r => r.data),
      supabase.rpc('get_subbloques_por_token_cliente',    { p_token: token }).then(r => r.data),
      supabase.rpc('get_semanas_por_token_cliente',       { p_token: token }).then(r => r.data),
    ])
    setPlan(planArr?.[0] || null)
    const bls = blsArr || []
    setBloques(bls)
    setSubbloques(subsArr || [])
    setSemanas(semsArr || [])
    const activo = bls.find(b => esBloqueActivo(b))
    if (activo) setBloquesAbiertos(new Set([activo.id]))

    const { data: ses } = await supabase.rpc('get_sesiones_por_token_cliente', { p_token: token })
    const estadoMap = {
      completada: 'completed', parcial: 'partial', no_realizada: 'missed',
      realizada: 'realizada',
    }
    const hoy = new Date()
    setSesiones((ses || []).map(s => {
      const estadoEfectivo = s.estado_manual
        || (s.estado && s.estado !== 'pendiente' ? estadoMap[s.estado] || null : null)
        || (getFeedbackAt(s) ? 'completed' : null)
      const fechaPasada = s.fecha && new Date(s.fecha + 'T23:59:59') < hoy
      return { ...s, estado_efectivo: estadoEfectivo || (fechaPasada ? 'missed' : null) }
    }))
    const { data: nts } = await supabase.rpc('get_notas_por_token_cliente', { p_token: token })
    setNotas(nts || [])
    const { data: comps } = await supabase.rpc('get_competiciones_por_token_cliente', { p_token: token })
    setCompeticiones(comps || [])
    const { data: ctrls } = await supabase.rpc('get_controles_por_token_cliente', { p_token: token })
    setControles(ctrls || [])

    const { data: pks } = await supabase.rpc('get_packs_por_token_cliente', { p_token: token })
    setPacks(pks || [])
    const { data: pkSes } = await supabase.rpc('get_sesiones_packs_por_token_cliente', { p_token: token })
    setPackSesiones(pkSes || [])

    const { data: chks } = await supabase.rpc('get_checkins_por_token_cliente', { p_token: token })
    setCheckins(chks || [])

    // Estado de conexión Strava — RPC SECURITY DEFINER, nunca expone tokens
    const { data: stravaData } = await supabase.rpc('get_strava_estado_conexion', { p_token: token })
    setStravaConectado(stravaData?.conectado === true)

    setLoading(false)
  }

  async function conectarStrava() {
    setStravaConectando(true)
    try {
      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/strava-oauth-start`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ portal_token: token }),
        }
      )
      const data = await res.json()
      // Si ya existe conexión activa, actualizar estado local en lugar de mostrar error
      if (res.status === 409 && data.error === 'already_connected') {
        setStravaConectado(true)
        setStravaConectando(false)
        return
      }
      if (!res.ok || !data.auth_url) {
        alert(data.message || 'Error al iniciar conexión con Strava.')
        setStravaConectando(false)
        return
      }
      // Guardar URL completa de retorno antes de salir de la página
      sessionStorage.setItem('strava_oauth_return', window.location.href)
      // Redirigir a Strava para autorización
      window.location.href = data.auth_url
    } catch {
      alert('Error de red al contactar con el servidor.')
      setStravaConectando(false)
    }
  }

  async function desconectarStrava() {
    setStravaConfirmDesc(false)
    setStravaDesconectando(true)
    try {
      const res = await fetch(
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/strava-desconectar`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ portal_token: token }),
        }
      )
      const data = await res.json()
      if (!res.ok || !data.ok) {
        alert(data.message || 'Error al desconectar Strava.')
        setStravaDesconectando(false)
        return
      }
      // Desconexión confirmada — actualizar estado local
      setStravaConectado(false)
    } catch {
      alert('Error de red al desconectar Strava.')
    }
    setStravaDesconectando(false)
  }

  function esBloqueActivo(b) {
    if (!b.fecha_inicio) return false
    const ini = parseISO(b.fecha_inicio + 'T12:00:00')
    const fin = addDays(ini, (b.semanas || 0) * 7)
    const hoy = new Date()
    return hoy >= ini && hoy < fin
  }

  function getBloqueActivo() { return bloques.find(b => esBloqueActivo(b)) || null }

  function getSubbloqueActivo(bloque) {
    if (!bloque?.fecha_inicio) return null
    const hoy = new Date()
    const subs = subbloques.filter(s => s.bloque_id === bloque.id)
    return subs.find(s => {
      const ini = addDays(parseISO(bloque.fecha_inicio + 'T12:00:00'), (s.semana_inicio - 1) * 7)
      const fin = addDays(parseISO(bloque.fecha_inicio + 'T12:00:00'), s.semana_fin * 7)
      return hoy >= ini && hoy < fin
    }) || null
  }

  function getSemanaActual(bloque) {
    if (!bloque?.fecha_inicio) return null
    const hoy = new Date()
    return semanas.filter(s => s.bloque_id === bloque.id).find(s => {
      const ini = addDays(parseISO(bloque.fecha_inicio + 'T12:00:00'), (s.numero - 1) * 7)
      return hoy >= ini && hoy < addDays(ini, 7)
    }) || null
  }

  function getSemanaNumGlobal() {
    // 5.6E: usar numero_cliente de semanas (planificación base continua)
    const hoy = new Date()
    const dow = hoy.getDay()
    const offset = dow === 0 ? -6 : 1 - dow
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() + offset)
    const lunesKey = lunes.toISOString().slice(0, 10)
    const semHoy = semanas.find(s => s.fecha_inicio_semana === lunesKey)
    if (semHoy?.numero_cliente) return semHoy.numero_cliente
    // Fallback legacy: acumulado por bloques
    let total = 0
    for (const b of bloques) {
      if (!b.fecha_inicio) continue
      const ini = parseISO(b.fecha_inicio + 'T12:00:00')
      const fin = addDays(ini, (b.semanas || 0) * 7)
      if (hoy >= ini && hoy < fin) return total + Math.floor((hoy - ini) / (7 * 86400000)) + 1
      total += b.semanas || 0
    }
    return total
  }

  function getTotalSemanas() { return bloques.reduce((a, b) => a + (b.semanas || 0), 0) }

  function getProgresoPlan() {
    const num = getSemanaNumGlobal()
    const total = getTotalSemanas()
    if (!total) return 0
    return Math.min(100, Math.round((num / total) * 100))
  }

  function getSesionesSemanaActual() {
    const lun = startOfWeek(new Date(), { weekStartsOn: 1 })
    const dom = endOfWeek(new Date(), { weekStartsOn: 1 })
    return sesiones.filter(s => { if (!s.fecha) return false; const f = parseISO(s.fecha); return f >= lun && f <= dom })
  }

  function getSesionesCalMes() {
    const ini = startOfMonth(calMes), fin = endOfMonth(calMes)
    return sesiones.filter(s => {
      const fv = fechaVisualSesion(s)
      if (!fv) return false
      const f = parseISO(fv)
      return f >= ini && f <= fin
    })
  }

  function getItemsSemanaActual() {
    const lun = startOfWeek(new Date(), { weekStartsOn: 1 })
    const dom = endOfWeek(new Date(), { weekStartsOn: 1 })
    const enSem = arr => (arr || []).filter(x => { const f = parseISO(x.fecha); return f >= lun && f <= dom })
    return [
      ...enSem(notas).map(x => ({ ...x, _tipo: 'nota' })),
      ...enSem(competiciones).map(x => ({ ...x, _tipo: 'competicion' })),
      ...enSem(controles).map(x => ({ ...x, _tipo: 'control' })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  function getItemsCalMes() {
    const ini = startOfMonth(calMes), fin = endOfMonth(calMes)
    const enMes = arr => (arr || []).filter(x => { if (!x.fecha) return false; const f = parseISO(x.fecha); return f >= ini && f <= fin })
    return [
      ...enMes(notas).map(x => ({ ...x, _tipo: 'nota' })),
      ...enMes(competiciones).map(x => ({ ...x, _tipo: 'competicion' })),
      ...enMes(controles).map(x => ({ ...x, _tipo: 'control' })),
    ].sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  function abrirSesion(s) { if (s.token_publico) window.location.href = `/sesion/${s.token_publico}` }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: T.font }}>
      <p style={{ color: T.ink3 }}>Cargando...</p>
    </div>
  )
  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, fontFamily: T.font }}>
      <p style={{ color: T.ink3 }}>{error}</p>
    </div>
  )

  const bloqueActivo = getBloqueActivo()
  const subbloqueActivo = getSubbloqueActivo(bloqueActivo)
  const semanaActualData = getSemanaActual(bloqueActivo)
  const semanaNum = getSemanaNumGlobal()
  const totalSem = getTotalSemanas()
  const progreso = getProgresoPlan()
  const sesActuales = getSesionesSemanaActual()
  const colA = bloqueActivo?.color || T.green

  const portalConfig = {
    mostrar_semana:     cliente?.portal_config?.mostrar_semana     ?? true,
    mostrar_calendario: cliente?.portal_config?.mostrar_calendario ?? true,
    mostrar_plan:       cliente?.portal_config?.mostrar_plan       ?? true,
  }
  const TABS_TODAS = [['semana', 'Semana'], ['calendario', 'Calendario'], ['plan', 'Mi plan']]
  const TABS_VISIBLES = TABS_TODAS.filter(([id]) =>
    id === 'semana'     ? portalConfig.mostrar_semana :
    id === 'calendario' ? portalConfig.mostrar_calendario :
    portalConfig.mostrar_plan
  )

  const isDesktop = vista === 'escritorio'
  const card = { background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden' }

  // Sesiones con comentario nuevo (no visto aún)
  const sesionesConComentarioNuevo = sesiones.filter(s => s.comentario_entrenadora && !s.comentario_visto_at)
  const DIAS_SEM = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

  // Fecha visual de una sesión: fecha real (completada_el) para completadas/parciales; fecha planificada para el resto
  const fechaVisualSesion = s => {
    const est = s.estado_efectivo || s.estado
    if ((est === 'completada' || est === 'parcial' || est === 'realizada') && s.completada_el) {
      return s.completada_el
    }
    return s.fecha
  }

  /* ---- TAB: SEMANA ---- */
  function TabSemana() {
    // Semana navegada (semanaOffset=0 → semana actual)
    const lunNav = startOfWeek(addWeeks(new Date(), semanaOffset), { weekStartsOn: 1 })
    const domNav = addDays(lunNav, 6)
    const diasSemana = Array.from({ length: 7 }, (_, i) => addDays(lunNav, i))
    const esActual = semanaOffset === 0

    // Bloque/subbloque/semana de la semana navegada
    const jueNav = addDays(lunNav, 3)
    const bloqueNav = bloques.find(b => {
      if (!b.fecha_inicio) return false
      const ini = parseISO(b.fecha_inicio + 'T12:00:00')
      const fin = addDays(ini, (b.semanas || 0) * 7)
      return jueNav >= ini && jueNav < fin
    }) || null
    const subbloqueNav = bloqueNav ? (() => {
      const subs = subbloques.filter(s => s.bloque_id === bloqueNav.id)
      return subs.find(s => {
        const ini = addDays(parseISO(bloqueNav.fecha_inicio + 'T12:00:00'), (s.semana_inicio - 1) * 7)
        const fin = addDays(parseISO(bloqueNav.fecha_inicio + 'T12:00:00'), s.semana_fin * 7)
        return jueNav >= ini && jueNav < fin
      }) || null
    })() : null
    const semanaNav = bloqueNav ? semanas.filter(s => s.bloque_id === bloqueNav.id).find(s => {
      const ini = addDays(parseISO(bloqueNav.fecha_inicio + 'T12:00:00'), (s.numero - 1) * 7)
      return jueNav >= ini && jueNav < addDays(ini, 7)
    }) || null : null
    const semanaNumNav = bloqueNav ? (() => {
      const ini = parseISO(bloqueNav.fecha_inicio + 'T12:00:00')
      return Math.floor((jueNav - ini) / (7 * 86400000)) + 1
    })() : null
    const colNav = bloqueNav?.color || T.green

    // Sesiones de la semana navegada
    const sesNav = sesiones.filter(s => {
      const fv = fechaVisualSesion(s)
      return fv && parseISO(fv) >= lunNav && parseISO(fv) <= domNav
    })

    const packsSemana = packs.filter(p => {
      if (!p.fecha_inicio || !p.fecha_fin) return false
      const pi = parseISO(p.fecha_inicio + 'T12:00:00')
      const pf = parseISO(p.fecha_fin + 'T12:00:00')
      return pi <= domNav && pf >= lunNav
    })

    // Extras (competiciones, controles) de la semana navegada — sin notas, van integradas en cada día
    const extrasNav = [
      ...competiciones.map(x => ({ ...x, _tipo: 'comp' })),
      ...controles.map(x => ({ ...x, _tipo: 'control' })),
    ].filter(x => x.fecha && parseISO(x.fecha) >= lunNav && parseISO(x.fecha) <= domNav)

    // Notas de la semana navegada (separadas para integrarlas en cada día)
    const notasNavSem = notas
      .filter(x => x.fecha && parseISO(x.fecha) >= lunNav && parseISO(x.fecha) <= domNav)
      .slice().sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999))
      .map(x => ({ ...x, _tipo: 'nota' }))

    const hechas = sesNav.filter(s => ['completed', 'partial', 'realizada'].includes(s.estado_efectivo)).length

    const ENERGIA_LABEL = { 1: '😴 Muy baja', 2: '😕 Baja', 3: '😐 Normal', 4: '😊 Buena', 5: '🔥 Muy alta' }
    const DESCANSO_LABEL = { 1: '😴 Muy malo', 2: '😕 Malo', 3: '😐 Regular', 4: '😊 Bueno', 5: '⭐ Muy bueno' }
    const TOLERANCIA_LABEL = { 1: 'Muy baja', 2: 'Baja', 3: 'Normal', 4: 'Buena', 5: 'Muy alta' }

    /* Navegación de semana */
    const NavSemana = () => (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0 2px' }}>
        <button onClick={() => setSemanaOffset(o => o - 1)}
          style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 7, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: T.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <div style={{ textAlign: 'center', minWidth: 140 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
            {format(lunNav, 'd MMM', { locale: es })} – {format(domNav, 'd MMM yyyy', { locale: es })}
          </div>
          {esActual && <div style={{ fontSize: 9, fontFamily: T.mono, color: colNav, marginTop: 2 }}>Semana actual</div>}
          {!esActual && (
            <button onClick={() => setSemanaOffset(0)}
              style={{ fontSize: 9, fontFamily: T.mono, color: colNav, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, textDecoration: 'underline' }}>
              Volver a hoy
            </button>
          )}
        </div>
        <button onClick={() => setSemanaOffset(o => o + 1)}
          style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 7, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: T.ink2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>
    )

    /* Hero + nota + feedback — reutilizados en sidebar (desktop) o inline (móvil) */
    const HeroSemana = () => (
      <div style={{ ...card, borderLeft: `4px solid ${colNav}` }}>
        <div style={{ padding: '13px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: colNav }}>● {bloqueNav ? bloqueNav.nombre : 'Sin planificación'}</div>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>{format(lunNav, 'dd MMM', { locale: es })} – {format(domNav, 'dd MMM yyyy', { locale: es })}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {semanaNumNav ? `Semana ${semanaNumNav}` : 'Semana'}
              {esActual && <span style={{ marginLeft: 8, fontSize: 9, background: colNav, color: '#fff', padding: '2px 7px', borderRadius: 8, fontFamily: T.mono, verticalAlign: 'middle' }}>esta semana</span>}
            </div>
            {subbloqueNav && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3 }}>· {subbloqueNav.nombre}</div>}
          </div>
          {semanaNav?.objetivo && (
            <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 5, lineHeight: 1.45 }}>{semanaNav.objetivo}</div>
          )}
          {semanaNumNav && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>S{semanaNumNav} de {totalSem} · {hechas}/{sesNav.length} sesiones</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )

    const NotaEntrenadora = () => semanaNav?.nota_cliente ? (
      <div style={{ background: '#fffbe6', borderRadius: 10, padding: '10px 13px', border: '1px solid #f0e5a0' }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, color: '#8a7200', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 4 }}>📌 Nota de tu entrenadora</div>
        <div style={{ fontSize: 12.5, color: '#5a4e00', lineHeight: 1.5 }}>{semanaNav.nota_cliente}</div>
      </div>
    ) : null

    const FeedbackSemana = () => {
      const currentWeekStart = calcWeekStart()
      const previousWeekStart = calcWeekStart(subWeeks(new Date(), 1))
      const checkinActual   = checkins.find(c => c.week_start === currentWeekStart)
      const checkinAnterior = checkins.find(c => c.week_start === previousWeekStart)
      const diaSemana = new Date().getDay()
      const esLunMarMie = diaSemana >= 1 && diaSemana <= 3
      const mostrarAvisoAnt = esLunMarMie && !checkinActual && !checkinAnterior
      function irACheckin(weekStr) { window.location.href = `/checkin-portal/${token}?week=${weekStr}` }

      // Para semanas navegadas (pasadas o futuras)
      const esPasada = semanaOffset < 0
      const esFutura = semanaOffset > 0

      // No mostrar feedback para semanas futuras
      if (esFutura) return null

      // Semana navegada: buscar checkin por week_start
      const weekStartNav = calcWeekStart(lunNav)
      const checkinNav = checkins.find(c => c.week_start === weekStartNav)

      // Checkin a mostrar: el de la semana navegada (pasada o actual)
      const checkinMostrar = esPasada ? checkinNav : checkinActual

      function FeedbackCard({ checkin, weekStart }) {
        if (!checkin) return null
        return (
          <div style={card}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 10 }}>Feedback de semana</div>
              {checkin ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {checkin.energia && (
                      <div style={{ background: T.bg, borderRadius: 8, padding: '7px 10px', flex: 1, minWidth: 120 }}>
                        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 3 }}>ENERGÍA</div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{ENERGIA_LABEL[checkin.energia] || checkin.energia}</div>
                      </div>
                    )}
                    {checkin.descanso && (
                      <div style={{ background: T.bg, borderRadius: 8, padding: '7px 10px', flex: 1, minWidth: 120 }}>
                        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 3 }}>DESCANSO</div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{DESCANSO_LABEL[checkin.descanso] || checkin.descanso}</div>
                      </div>
                    )}
                    {checkin.horas_sueno && (
                      <div style={{ background: T.bg, borderRadius: 8, padding: '7px 10px', flex: 1, minWidth: 120 }}>
                        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 3 }}>SUEÑO</div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>~{checkin.horas_sueno}h/noche</div>
                      </div>
                    )}
                    {checkin.tolerancia_carga && (
                      <div style={{ background: T.bg, borderRadius: 8, padding: '7px 10px', flex: 1, minWidth: 120 }}>
                        <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 3 }}>TOLERANCIA</div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{TOLERANCIA_LABEL[checkin.tolerancia_carga] || checkin.tolerancia_carga}</div>
                      </div>
                    )}
                  </div>
                  {checkin.molestias && checkin.molestias !== 'No' && (
                    <div style={{ background: '#FAEEDA', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ fontFamily: T.mono, fontSize: 8, color: '#633806', marginBottom: 3 }}>MOLESTIAS</div>
                      <div style={{ fontSize: 12, color: '#633806' }}>{checkin.molestias}</div>
                    </div>
                  )}
                  {checkin.comentario_libre && (
                    <div style={{ borderLeft: `3px solid ${colNav}`, paddingLeft: 10 }}>
                      <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 3 }}>COMENTARIO</div>
                      <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.45 }}>{checkin.comentario_libre}</div>
                    </div>
                  )}
                  <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>✓ Enviado</div>
                </div>
              ) : null}
            </div>
          </div>
        )
      }

      return <FeedbackCard checkin={checkinMostrar} weekStart={esPasada ? weekStartNav : currentWeekStart} />
    }

    return (
      <div>
        <NavSemana />
        <div style={isDesktop
          ? { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, padding: '16px 0 60px', alignItems: 'start' }
          : { padding: '12px 16px 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {!isDesktop && <HeroSemana />}
          {!isDesktop && <NotaEntrenadora />}

          {/* Sesiones por día + packs flexibles integrados cronológicamente */}
          <div>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 7 }}>Sesiones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(() => {
                const coveredByPack = {}
                packsSemana.forEach(pack => {
                  const pi = startOfDay(parseISO(pack.fecha_inicio))
                  const pf = startOfDay(parseISO(pack.fecha_fin))
                  diasSemana.forEach((dia, i) => {
                    if (dia >= pi && dia <= pf) coveredByPack[i] = pack
                  })
                })
                const renderItems = []
                const addedPacks = new Set()
                diasSemana.forEach((dia, idx) => {
                  packsSemana.forEach(pack => {
                    if (addedPacks.has(pack.id)) return
                    const pi = startOfDay(parseISO(pack.fecha_inicio))
                    const effectiveStart = pi < lunNav ? lunNav : pi
                    if (isSameDay(effectiveStart, dia)) {
                      addedPacks.add(pack.id)
                      renderItems.push({ type: 'pack', pack })
                    }
                  })
                  if (!coveredByPack[idx]) renderItems.push({ type: 'day', idx, dia })
                })

                return renderItems.map((item) => {
                  if (item.type === 'pack') {
                    const { pack } = item
                    const pi = startOfDay(parseISO(pack.fecha_inicio))
                    const pf = startOfDay(parseISO(pack.fecha_fin))
                    const sesPack = packSesiones.filter(s => s.pack_id === pack.id)
                    const diasPack = diasSemana.filter(d => d >= pi && d <= pf)
                    return (
                      <div key={`pack-${pack.id}`} style={{ ...card, border: `1px solid ${colNav}55`, borderLeft: `4px solid ${colNav}` }}>
                        <div style={{ padding: '10px 13px', borderBottom: `1px solid ${T.bg2}` }}>
                          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.5px', textTransform: 'uppercase', color: colNav, marginBottom: 4 }}>📦 Pack flexible</div>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{pack.nombre}</div>
                          {pack.descripcion && <div style={{ fontSize: 12, color: T.ink2, marginBottom: 6, lineHeight: 1.4 }}>{pack.descripcion}</div>}
                          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, marginBottom: 8 }}>Haz las sesiones cuando puedas · {format(pi, 'd MMM', { locale: es })}–{format(pf, 'd MMM', { locale: es })}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {diasPack.map((d, di) => {
                              const esHoy = isToday(d)
                              return (
                                <div key={di} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, fontFamily: T.mono, background: esHoy ? colNav : T.bg2, color: esHoy ? '#fff' : T.ink2, fontWeight: esHoy ? 600 : 400 }}>
                                  {format(d, 'EEE d', { locale: es })}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                          {sesPack.map((s, si) => (
                            <div key={s.id} onClick={() => abrirSesion(s)}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderBottom: si < sesPack.length - 1 ? `1px solid ${T.bg2}` : 'none', cursor: s.token_publico ? 'pointer' : 'default' }}>
                              <div style={{ width: 32, height: 32, borderRadius: 7, background: `${colNav}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{iconoSesion(s)}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 500 }}>{s.titulo}</div>
                                {s.duracion_min && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, marginTop: 1 }}>{s.duracion_min} min</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }

                  const { idx, dia } = item
                  const sesDia = sesNav.filter(s => { const fv = fechaVisualSesion(s); return fv && isSameDay(parseISO(fv), dia) })
                  const notasDia = notasNavSem.filter(x => isSameDay(parseISO(x.fecha), dia))
                  const hoyDia = isToday(dia)
                  const nombreDia = DIAS_SEM[idx]
                  const fechaStr = format(dia, 'd MMM', { locale: es })

                  if (sesDia.length === 0 && notasDia.length === 0) {
                    return (
                      <div key={`day-${idx}`} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, overflow: 'hidden', opacity: hoyDia ? 1 : 0.75 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 7, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>😴</div>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: hoyDia ? 600 : 400, color: hoyDia ? T.ink : T.ink2 }}>{nombreDia}{hoyDia && <span style={{ marginLeft: 6, fontSize: 9, background: colNav, color: '#fff', padding: '1px 6px', borderRadius: 8, fontFamily: T.mono }}>hoy</span>}</div>
                            <div style={{ fontSize: 10, color: T.ink3 }}>Descanso</div>
                          </div>
                          <div style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>{fechaStr}</div>
                        </div>
                        <button onClick={() => setModalRegistrar({ fecha: dia })}
                          style={{ width: '100%', padding: '6px', border: 'none', borderTop: `1px dashed ${T.border2}`, background: 'transparent', color: T.ink3, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: T.font }}>
                          + registrar sesión
                        </button>
                      </div>
                    )
                  }

                  // Mezclar sesiones y notas en una lista ordenada por `orden` para respetar el arrastre del admin
                  const itemsDia = [
                    ...sesDia.map(s => ({ ...s, _tipo: 'sesion' })),
                    ...notasDia,
                  ].sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999))

                  return (
                    <div key={`day-${idx}`} style={{ ...card, border: hoyDia ? `1.5px solid ${colNav}` : `1px solid ${T.border}` }}>
                      <div style={{ background: hoyDia ? `${colNav}18` : T.bg, padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${hoyDia ? colNav + '30' : T.border}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: hoyDia ? colNav : T.ink }}>{nombreDia}</span>
                          {hoyDia && <span style={{ fontSize: 8.5, background: colNav, color: '#fff', padding: '1px 6px', borderRadius: 8, fontFamily: T.mono }}>hoy</span>}
                        </div>
                        <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>{fechaStr}</span>
                      </div>
                      {itemsDia.map((item, ii) => {
                        const isLast = ii === itemsDia.length - 1
                        if (item._tipo === 'nota') {
                          return (
                            <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderTop: ii > 0 ? `1px solid ${T.bg2}` : 'none', background: '#FEFCE8' }}>
                              <div style={{ width: 28, height: 28, borderRadius: 7, background: '#FEF08A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📝</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontFamily: T.mono, fontSize: 8, color: '#854d0e', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 3 }}>Nota</div>
                                <div style={{ fontSize: 12, color: '#5a3600', lineHeight: 1.45 }}>{item.texto}</div>
                              </div>
                            </div>
                          )
                        }
                        const bd = badgeEstado(item.estado_efectivo)
                        const bf = badgeFeedback(item)
                        return (
                          <div key={item.id} onClick={() => abrirSesion(item)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: !isLast ? `1px solid ${T.bg2}` : 'none', cursor: item.token_publico ? 'pointer' : 'default' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${colNav}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{iconoSesion(item)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: T.ink }}>{item.titulo}</div>
                              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, marginTop: 1 }}>
                                {item.duracion_min ? `${item.duracion_min} min` : ''}{item.duracion_min && item.tipo_sesion ? ' · ' : ''}{item.tipo_sesion === 'opcional' ? 'Opcional' : item.tipo_sesion === 'flexible' ? 'Flexible' : item.tipo_sesion === 'programada' ? 'Programada' : item.tipo_sesion === 'manual_cliente' ? 'Registrada por mí' : ''}
                              </div>
                              {item.completada_el && item.fecha && item.completada_el !== item.fecha && <div style={{ fontSize: 9, color: T.ink3, marginTop: 1 }}>Prevista: {format(parseISO(item.fecha), "EEE d MMM", { locale: es })}</div>}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                              <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 500, background: bd.bg, color: bd.color, whiteSpace: 'nowrap' }}>{bd.label}</span>
                              {bf && <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 500, background: bf.bg, color: bf.color, whiteSpace: 'nowrap' }}>{bf.label}</span>}
                              {item.comentario_entrenadora && !item.comentario_visto_at && (
                                <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: '#f5f3ff', color: '#7c3aed', whiteSpace: 'nowrap' }}>💬 Nuevo mensaje</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <button onClick={() => setModalRegistrar({ fecha: dia })}
                        style={{ width: '100%', padding: '6px', border: 'none', borderTop: `1px dashed ${T.border2}`, background: 'transparent', color: T.ink3, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: T.font }}>
                        + registrar sesión
                      </button>
                    </div>
                  )
                })
              })()}
            </div>
          </div>

          {!isDesktop && extrasNav.length > 0 && (
            <div style={card}>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>Notas y eventos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {extrasNav.map(x => <ItemExtra key={x.id} item={x} />)}
                </div>
              </div>
            </div>
          )}
          {!isDesktop && <FeedbackSemana />}

          {isDesktop && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <HeroSemana />
              <NotaEntrenadora />
              {extrasNav.length > 0 && (
                <div style={card}>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>Notas y eventos</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {extrasNav.map(x => <ItemExtra key={x.id} item={x} />)}
                    </div>
                  </div>
                </div>
              )}
              <FeedbackSemana />
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ---- TAB: CALENDARIO ---- */
  function TabCalendario() {
    const diasMes = eachDayOfInterval({ start: startOfMonth(calMes), end: endOfMonth(calMes) })
    const offset = (() => { const d = diasMes[0].getDay(); return d === 0 ? 6 : d - 1 })()
    const sesMes = getSesionesCalMes()
    const [diaSelec, setDiaSelec] = useState(new Date())
    const sesDia = sesMes.filter(s => { const fv = fechaVisualSesion(s); return fv && isSameDay(parseISO(fv), diaSelec) })
    const extras = getItemsCalMes()

    return (
      <div style={isDesktop
        ? { display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20, padding: '20px 0 60px', alignItems: 'start' }
        : { padding: '14px 16px 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={card}>
          <div style={{ padding: '13px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{format(calMes, 'MMMM yyyy', { locale: es })}</div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setCalMes(m => subMonths(m, 1))} style={{ width: 28, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.ink2 }}>‹</button>
                <button onClick={() => setCalMes(new Date())} style={{ padding: '0 8px', height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', fontSize: 10.5, color: T.ink2 }}>Hoy</button>
                <button onClick={() => setCalMes(m => addMonths(m, 1))} style={{ width: 28, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: 'transparent', cursor: 'pointer', fontSize: 12, color: T.ink2 }}>›</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
              {['L','M','X','J','V','S','D'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontFamily: T.mono, fontSize: 9, color: T.ink3, padding: '3px 0' }}>{d}</div>
              ))}
              {Array(offset).fill(null).map((_, i) => <div key={'p'+i} />)}
              {diasMes.map(dia => {
                const sesDia = sesMes.filter(s => { const fv = fechaVisualSesion(s); return fv && isSameDay(parseISO(fv), dia) })
                const hoyDia = isToday(dia)
                const selec = isSameDay(dia, diaSelec)
                return (
                  <div key={dia.toISOString()} onClick={() => setDiaSelec(dia)}
                    style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: hoyDia ? colA : selec ? T.bg2 : 'transparent', cursor: 'pointer', position: 'relative', padding: 2 }}>
                    <span style={{ fontSize: 11, color: hoyDia ? '#fff' : T.ink, fontWeight: hoyDia ? 600 : 400 }}>{format(dia, 'd')}</span>
                    {sesDia.length > 0 && (
                      <div style={{ display: 'flex', gap: 2, position: 'absolute', bottom: 3 }}>
                        {sesDia.slice(0, 3).map((s, i) => (
                          <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: hoyDia ? 'rgba(255,255,255,0.8)' : dotColor(s.estado_efectivo) }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Columna derecha en desktop: detalle día + notas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={card}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>
                {format(diaSelec, "EEEE d 'de' MMMM", { locale: es })}
              </div>
              {sesDia.length === 0 ? (
                <div style={{ fontSize: 12, color: T.ink3, padding: '8px 0' }}>Sin sesiones este día</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {sesDia.map((s, si) => {
                    const bd = badgeEstado(s.estado_efectivo)
                    return (
                      <div key={s.id} onClick={() => abrirSesion(s)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: si < sesDia.length - 1 ? `1px solid ${T.bg2}` : 'none', cursor: s.token_publico ? 'pointer' : 'default' }}>
                        <div style={{ width: 34, height: 34, borderRadius: 8, background: `${colA}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{iconoSesion(s)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{s.titulo}</div>
                          {s.duracion_min && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, marginTop: 1 }}>{s.duracion_min} min</div>}
                          {s.completada_el && s.fecha && s.completada_el !== s.fecha && <div style={{ fontSize: 9, color: T.ink3, marginTop: 1 }}>Prevista: {format(parseISO(s.fecha), "EEE d MMM", { locale: es })}</div>}
                        </div>
                        <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, fontWeight: 500, background: bd.bg, color: bd.color, flexShrink: 0 }}>{bd.label}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          {extras.length > 0 && (
            <div style={card}>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 8 }}>Notas y eventos · {format(calMes, 'MMMM', { locale: es })}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {extras.map(x => <ItemExtra key={x.id} item={x} />)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ---- TAB: MI PLAN ---- */
  function TabPlan() {
    const inicio = plan?.fecha_inicio ? parseISO(plan.fecha_inicio + 'T12:00:00') : null

    return (
      <div style={isDesktop
        ? { display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0 60px' }
        : { padding: '14px 16px 80px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Resumen del plan */}
        {plan && (
          <div style={card}>
            <div style={{ padding: '13px 14px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 5 }}>Tu planificación</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{plan.nombre}</div>
              {plan.notas && <div style={{ fontSize: 12.5, color: T.ink2, marginTop: 5, lineHeight: 1.45 }}>{plan.notas}</div>}
              <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.bg2}` }}>
                {plan.fecha_inicio && <div><div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 2 }}>INICIO</div><div style={{ fontSize: 12, fontWeight: 500 }}>{format(parseISO(plan.fecha_inicio + 'T12:00:00'), 'd MMM yyyy', { locale: es })}</div></div>}
                {plan.fecha_fin && <div><div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 2 }}>FIN</div><div style={{ fontSize: 12, fontWeight: 500 }}>{format(parseISO(plan.fecha_fin + 'T12:00:00'), 'd MMM yyyy', { locale: es })}</div></div>}
                <div><div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, marginBottom: 2 }}>SEMANAS</div><div style={{ fontSize: 12, fontWeight: 500 }}>{totalSem}</div></div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>Progreso · S{semanaNum} de {totalSem}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: colA, fontWeight: 600 }}>{progreso}%</span>
                </div>
                <div style={{ height: 5, background: T.bg2, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${progreso}%`, background: colA, borderRadius: 3 }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Línea de tiempo con zoom */}
        {bloques.length > 0 && inicio && (
          <div style={card}>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 10 }}>Línea de tiempo · {totalSem} sem</div>
              <Timeline bloques={bloques} inicio={inicio} totalSemanas={totalSem} />
            </div>
          </div>
        )}

        {/* Bloques */}
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 7 }}>Bloques de entrenamiento</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bloques.map(b => {
              const activo = esBloqueActivo(b)
              const abierto = bloquesAbiertos.has(b.id)
              const subsBl = subbloques.filter(s => s.bloque_id === b.id)
              const col = b.color || T.green

              const semCurr = (() => {
                if (!activo || !b.fecha_inicio) return null
                const ini = parseISO(b.fecha_inicio + 'T12:00:00')
                return Math.min(b.semanas || 0, Math.floor((new Date() - ini) / (7 * 86400000)) + 1)
              })()
              const pctBloque = semCurr ? Math.round((semCurr / (b.semanas || 1)) * 100) : 0

              return (
                <div key={b.id} style={{ ...card, border: activo ? `1px solid ${col}55` : `1px solid ${T.border}`, borderLeft: activo ? `3px solid ${col}` : `1px solid ${T.border}` }}>
                  <div onClick={() => setBloquesAbiertos(prev => { const s = new Set(prev); s.has(b.id) ? s.delete(b.id) : s.add(b.id); return s })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', cursor: 'pointer', userSelect: 'none' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{b.nombre}</div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, marginTop: 1 }}>{b.semanas} sem{b.fecha_inicio ? ` · ${format(parseISO(b.fecha_inicio + 'T12:00:00'), 'd MMM', { locale: es })}` : ''}</div>
                    </div>
                    {activo && <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: col + '22', color: col, fontWeight: 600, flexShrink: 0 }}>En curso</span>}
                    <span style={{ color: T.ink3, fontSize: 11 }}>{abierto ? '▲' : '▼'}</span>
                  </div>

                  {abierto && (
                    <div style={{ borderTop: `1px solid ${T.bg2}`, padding: '12px 13px', background: T.bg }}>
                      {b.objetivo && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: subsBl.length ? 12 : 0 }}>
                          {b.objetivo.split('\n').filter(l => l.trim()).map((l, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: col, flexShrink: 0, marginTop: 6 }} />
                              <span style={{ fontSize: 12.5, color: T.ink2, lineHeight: 1.5 }}>{l}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {activo && semCurr && (
                        <div style={{ marginBottom: subsBl.length ? 12 : 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>Semana {semCurr} de {b.semanas}</span>
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: col }}>{pctBloque}%</span>
                          </div>
                          <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pctBloque}%`, background: col, borderRadius: 2 }} />
                          </div>
                        </div>
                      )}
                      {subsBl.length > 0 && (
                        <>
                          <div style={{ fontFamily: T.mono, fontSize: 8, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 6 }}>Subbloques</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                            {subsBl.map(s => {
                              const esAct = getSubbloqueActivo(b)?.id === s.id
                              const subAb = subsAbiertos.has(s.id)
                              const toggleSub = e => { e.stopPropagation(); setSubsAbiertos(prev => { const ns = new Set(prev); ns.has(s.id) ? ns.delete(s.id) : ns.add(s.id); return ns }) }
                              const numSems = s.semana_fin - s.semana_inicio + 1
                              const semsDelSub = Array.from({ length: numSems }, (_, i) => {
                                const numSem = s.semana_inicio + i
                                const fi = addDays(parseISO(b.fecha_inicio + 'T12:00:00'), (numSem - 1) * 7)
                                const fiStr = fi.toISOString().slice(0, 10)
                                const semData = semanas.find(sw => sw.fecha_inicio_semana === fiStr) || null
                                const esHoy = (() => { const h = new Date(); return h >= fi && h < addDays(fi, 7) })()
                                return { numSem, fi, fiStr, semData, esHoy }
                              })
                              const CARGAS = { baja: { label: 'Baja', color: '#10b981' }, media: { label: 'Media', color: '#f59e0b' }, alta: { label: 'Alta', color: '#ef4444' }, muy_alta: { label: 'Muy alta', color: '#7c3aed' } }
                              return (
                                <div key={s.id} style={{ borderBottom: `1px solid ${T.bg2}` }}>
                                  {/* Cabecera subbloque */}
                                  <div onClick={toggleSub} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 0', cursor: 'pointer', userSelect: 'none' }}>
                                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: esAct ? col : T.border, flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: esAct ? 500 : 400, color: esAct ? col : T.ink2, flex: 1 }}>{s.nombre}</span>
                                    <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3 }}>S{s.semana_inicio}–{s.semana_fin}</span>
                                    {esAct && <span style={{ fontSize: 8.5, padding: '1px 6px', borderRadius: 8, background: col + '22', color: col, fontWeight: 600 }}>aquí</span>}
                                    <span style={{ color: T.ink3, fontSize: 10, marginLeft: 2 }}>{subAb ? '▲' : '▼'}</span>
                                  </div>
                                  {/* Semanas del subbloque */}
                                  {subAb && (
                                    <div style={{ paddingBottom: 8, paddingLeft: 12 }}>
                                      {s.objetivo && (
                                        <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.4, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${T.bg2}` }}>{s.objetivo}</div>
                                      )}
                                      {semsDelSub.map(({ numSem, fi, semData, esHoy }) => {
                                        const carga = semData?.carga ? CARGAS[semData.carga] : null
                                        const ff = addDays(fi, 6)
                                        const fechaStr = `${format(fi, 'd', { locale: es })}–${format(ff, 'd MMM', { locale: es })}`
                                        const esPasada = addDays(fi, 7) < new Date()

                                        // Km real vs objetivo
                                        const tieneKm = semData?.km_objetivo > 0 || semData?.km_real > 0
                                        const kmStr = tieneKm && esPasada
                                          ? `${semData?.km_real ?? '—'}/${semData?.km_objetivo ?? '—'} km`
                                          : semData?.km_objetivo > 0 && !esPasada
                                          ? `Obj: ${semData.km_objetivo} km`
                                          : null

                                        // Zonas reales (minutos) → % real vs % previsto del subbloque
                                        const z1r = semData?.zona1_2_real || 0
                                        const z3r = semData?.zona3_4_real || 0
                                        const z5r = semData?.zona5_real   || 0
                                        const totalZR = z1r + z3r + z5r
                                        const tieneZonas = esPasada && totalZR > 0
                                        // % previstos del subbloque (pueden ser null si no está configurado)
                                        const zPrev = (s.zona1_2 != null || s.zona3_4 != null || s.zona5 != null)
                                          ? { z1: s.zona1_2 ?? 0, z3: s.zona3_4 ?? 0, z5: s.zona5 ?? 0 }
                                          : null

                                        return (
                                          <div key={numSem} style={{ padding: '7px 0', borderBottom: `1px solid ${T.bg2}`, background: esHoy ? col + '0d' : 'transparent', borderRadius: esHoy ? 4 : 0, paddingLeft: esHoy ? 6 : 0 }}>
                                            {/* Fila principal: semana + fechas + objetivo */}
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                              <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 600, color: esHoy ? col : T.ink3, minWidth: 22 }}>S{numSem}</span>
                                              <span style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, minWidth: 70 }}>{fechaStr}</span>
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                {(semData?.objetivo || semData?.nota_cliente) ? (
                                                  <>
                                                    {semData.objetivo && <div style={{ fontSize: 11, color: T.ink, lineHeight: 1.4 }}>{semData.objetivo}</div>}
                                                    {semData.nota_cliente && <div style={{ fontSize: 10.5, color: T.ink2, lineHeight: 1.35, marginTop: semData.objetivo ? 2 : 0, fontStyle: 'italic' }}>{semData.nota_cliente}</div>}
                                                  </>
                                                ) : (
                                                  <span style={{ fontSize: 10.5, color: T.ink3, fontStyle: 'italic' }}>—</span>
                                                )}
                                              </div>
                                              {carga && <span style={{ fontSize: 8.5, padding: '1px 6px', borderRadius: 8, background: carga.color + '20', color: carga.color, fontWeight: 600, flexShrink: 0 }}>{carga.label}</span>}
                                            </div>
                                            {/* Fila de datos: km + zonas */}
                                            {(kmStr || tieneZonas) && (
                                              <div style={{ marginTop: 6, marginLeft: 30, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center' }}>
                                                {kmStr && (() => {
                                                  const hasObj = semData?.km_objetivo > 0 && semData?.km_real != null
                                                  const diff = hasObj ? Math.abs(semData.km_real - semData.km_objetivo) : null
                                                  const pct  = hasObj ? semData.km_real / semData.km_objetivo : null
                                                  const kmColor = diff == null ? T.ink2
                                                    : pct >= 0.9 && pct <= 1.1 ? '#10b981'
                                                    : pct >= 0.75 && pct <= 1.25 ? '#f59e0b'
                                                    : '#ef4444'
                                                  return (
                                                    <span style={{ fontFamily: T.mono, fontSize: 10, color: kmColor, fontWeight: hasObj ? 600 : 400 }}>{kmStr}</span>
                                                  )
                                                })()}
                                                {tieneZonas && (
                                                  <div style={{ display: 'flex', gap: 10 }}>
                                                    {[
                                                      { label: 'Z1-2', real: Math.round((z1r / totalZR) * 100), prev: zPrev?.z1, color: '#10b981' },
                                                      { label: 'Z3-4', real: Math.round((z3r / totalZR) * 100), prev: zPrev?.z3, color: '#f59e0b' },
                                                      { label: 'Z5',   real: Math.round((z5r / totalZR) * 100), prev: zPrev?.z5, color: '#ef4444' },
                                                    ].filter(z => z.real > 0 || (z.prev != null && z.prev > 0)).map(z => {
                                                      const diff = z.prev != null && z.prev > 0 ? Math.abs(z.real - z.prev) : null
                                                      const barColor = diff == null ? z.color : diff <= 10 ? '#10b981' : diff <= 20 ? '#f59e0b' : '#ef4444'
                                                      return (
                                                        <div key={z.label} style={{ minWidth: 48 }}>
                                                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 3 }}>
                                                            <span style={{ fontFamily: T.mono, fontSize: 8, color: z.color, fontWeight: 600 }}>{z.label}</span>
                                                            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.ink, fontWeight: 600 }}>{z.real}%</span>
                                                            {z.prev != null && z.prev > 0 && (
                                                              <span style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3 }}>/ {z.prev}%</span>
                                                            )}
                                                          </div>
                                                          {/* Barra: fondo = objetivo, relleno = real */}
                                                          <div style={{ position: 'relative', height: 4, borderRadius: 2, background: T.bg2, overflow: 'visible' }}>
                                                            {/* Marca del objetivo */}
                                                            {z.prev != null && z.prev > 0 && (
                                                              <div style={{ position: 'absolute', left: `${Math.min(z.prev, 100)}%`, top: -1, width: 2, height: 6, background: T.ink3, borderRadius: 1, transform: 'translateX(-50%)', zIndex: 2 }} />
                                                            )}
                                                            {/* Relleno real */}
                                                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(z.real, 100)}%`, background: barColor, borderRadius: 2, zIndex: 1 }} />
                                                          </div>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ---- MODAL REGISTRAR SESIÓN MANUAL ---- */
  const TIPOS_ACTIVIDAD = [
    { emoji: '💪', label: 'Fuerza',     placeholder: 'Entrenamiento de fuerza' },
    { emoji: '🏃', label: 'Correr',     placeholder: 'Salida a correr' },
    { emoji: '🚴', label: 'Bici',       placeholder: 'Salida en bici' },
    { emoji: '🤸', label: 'Movilidad',  placeholder: 'Sesión de movilidad' },
    { emoji: '⚽', label: 'Fútbol',     placeholder: 'Partido / entreno fútbol' },
    { emoji: '🎾', label: 'Pádel',      placeholder: 'Partido de pádel' },
    { emoji: '🏊', label: 'Nadar',      placeholder: 'Sesión de natación' },
    { emoji: '🚶', label: 'Caminar',    placeholder: 'Caminata' },
    { emoji: '💆', label: 'Otro',       placeholder: 'Describe la sesión' },
  ]
  function ModalRegistrar() {
    const fechaIni = modalRegistrar?.fecha ? format(modalRegistrar.fecha, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
    const [tipo, setTipo] = useState(TIPOS_ACTIVIDAD[0])
    const [titulo, setTitulo] = useState('')
    const [fecha, setFecha] = useState(fechaIni)
    const [duracion, setDuracion] = useState('')
    const [estado, setEstado] = useState('completed')
    const [sensaciones, setSensaciones] = useState(3)
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)

    async function guardar() {
      setGuardando(true)
      const { data, error } = await supabase.rpc('registrar_sesion_manual_cliente', {
        p_token:         token,
        p_titulo:        titulo || tipo.placeholder,
        p_fecha:         fecha,
        p_duracion_min:  duracion ? parseInt(duracion) : null,
        p_icono:         tipo.emoji,
        p_estado_manual: estado,
        p_sensaciones:   sensaciones,
        p_nota_cliente:  nota || null,
      })
      setGuardando(false)
      if (error || data?.error) { alert('Error al guardar: ' + (error?.message || data?.error)); return }
      // Añadir sesión al estado local sin recargar
      const estadoEfectivo = estado === 'completed' ? 'completed' : estado === 'partial' ? 'partial' : estado === 'missed' ? 'missed' : 'realizada'
      const nuevaSesion = {
        id: data.sesion_id,
        titulo: titulo || tipo.placeholder,
        fecha,
        duracion_min: duracion ? parseInt(duracion) : null,
        icono: tipo.emoji,
        estado_manual: estado,
        estado_efectivo: estadoEfectivo,
        completada_el: estado !== 'missed' ? fecha : null,
        token_publico: null,
        tipo_sesion: 'manual_cliente',
        sesion_feedback: sensaciones || nota ? [{ submitted_at: new Date().toISOString() }] : null,
      }
      setSesiones(prev => [...prev, nuevaSesion])
      setModalRegistrar(null)
    }

    const ESTADOS = [
      { value: 'completed', label: '✓ Completada' },
      { value: 'partial',   label: '◐ Parcial' },
      { value: 'missed',    label: '✕ No realizada' },
    ]

    return (
      <div onClick={() => setModalRegistrar(null)}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div onClick={e => e.stopPropagation()}
          style={{ background: T.surface, borderRadius: '18px 18px 0 0', padding: '20px 20px 36px', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>Registrar sesión</div>
            <button onClick={() => setModalRegistrar(null)} style={{ background: 'none', border: 'none', fontSize: 18, color: T.ink3, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>

          {/* Tipo */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 7 }}>Tipo</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TIPOS_ACTIVIDAD.map(t => (
                <button key={t.emoji} onClick={() => setTipo(t)}
                  style={{ padding: '5px 10px', borderRadius: 20, border: `1.5px solid ${tipo.emoji === t.emoji ? colA : T.border}`, background: tipo.emoji === t.emoji ? colA + '15' : 'transparent', cursor: 'pointer', fontSize: 12, color: tipo.emoji === t.emoji ? colA : T.ink2, fontFamily: T.font, fontWeight: tipo.emoji === t.emoji ? 600 : 400 }}>
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 5 }}>Título</div>
            <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder={tipo.placeholder}
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, fontFamily: T.font, color: T.ink, background: T.bg, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Fecha + duración */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 5 }}>Fecha</div>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                style={{ width: '100%', padding: '9px 10px', border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, fontFamily: T.font, color: T.ink, background: T.bg, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ width: 110 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 5 }}>Duración (min)</div>
              <input type="number" min="1" max="480" value={duracion} onChange={e => setDuracion(e.target.value)} placeholder="—"
                style={{ width: '100%', padding: '9px 10px', border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, fontFamily: T.font, color: T.ink, background: T.bg, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Estado */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 7 }}>Cómo fue</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {ESTADOS.map(e => (
                <button key={e.value} onClick={() => setEstado(e.value)}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 9, border: `1.5px solid ${estado === e.value ? colA : T.border}`, background: estado === e.value ? colA + '15' : 'transparent', cursor: 'pointer', fontSize: 11, color: estado === e.value ? colA : T.ink2, fontFamily: T.font, fontWeight: estado === e.value ? 600 : 400, textAlign: 'center' }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sensaciones */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 7 }}>Sensaciones</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setSensaciones(n)}
                  style={{ flex: 1, padding: '8px 0', borderRadius: 9, border: `1.5px solid ${sensaciones === n ? colA : T.border}`, background: sensaciones === n ? colA + '15' : 'transparent', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
                  {['😞','😕','😐','😊','🔥'][n-1]}
                </button>
              ))}
            </div>
          </div>

          {/* Nota libre */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 5 }}>Nota (opcional)</div>
            <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="¿Cómo te has sentido? ¿Algo a destacar?" rows={3}
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${T.border}`, borderRadius: 9, fontSize: 13, fontFamily: T.font, color: T.ink, background: T.bg, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
          </div>

          <button onClick={guardar} disabled={guardando}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: guardando ? T.bg2 : colA, color: guardando ? T.ink3 : '#fff', fontSize: 14, fontWeight: 700, fontFamily: T.font, cursor: guardando ? 'default' : 'pointer' }}>
            {guardando ? 'Guardando…' : 'Guardar sesión'}
          </button>
        </div>
      </div>
    )
  }

  /* ---- RENDER PRINCIPAL ---- */
  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: T.font, color: T.ink }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Sora:wght@300;400;500;600&display=swap" rel="stylesheet" />

      {/* HEADER sticky */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: isDesktop ? 1100 : 520, margin: '0 auto', padding: isDesktop ? '13px 24px 0' : '13px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, paddingBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3 }}>Planificación</div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.3px', marginTop: 2 }}>{cliente?.nombre}</div>
              <div style={{ fontSize: 11, color: T.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan?.nombre || 'Sin plan activo'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 600, color: colA }}>{semanaNum > 0 ? <>S{semanaNum}<span style={{ color: T.ink3, fontWeight: 400 }}>/{totalSem}</span></> : `${totalSem} sem`}</div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: T.ink3, marginTop: 1 }}>{progreso}% completado</div>
              </div>
              {/* Toggle vista */}
              <div style={{ display: 'flex', gap: 3 }}>
                <button onClick={() => setVista('movil')} title="Vista móvil"
                  style={{ width: 28, height: 26, borderRadius: 6, border: `1px solid ${!isDesktop ? colA : T.border}`, background: !isDesktop ? T.greenL : 'transparent', cursor: 'pointer', fontSize: 13, color: !isDesktop ? colA : T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📱</button>
                <button onClick={() => setVista('escritorio')} title="Vista escritorio"
                  style={{ width: 28, height: 26, borderRadius: 6, border: `1px solid ${isDesktop ? colA : T.border}`, background: isDesktop ? T.greenL : 'transparent', cursor: 'pointer', fontSize: 13, color: isDesktop ? colA : T.ink3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🖥</button>
              </div>
            </div>
          </div>
          {/* TABS */}
          <div style={{ display: 'flex', borderTop: `1px solid ${T.bg2}` }}>
            {TABS_VISIBLES.map(([id, label]) => (
              <div key={id} onClick={() => setTab(id)}
                style={{ flex: isDesktop ? 0 : 1, padding: isDesktop ? '8px 20px 7px' : '8px 4px 7px', textAlign: 'center', fontSize: 12, fontWeight: tab === id ? 600 : 400, color: tab === id ? colA : T.ink3, cursor: 'pointer', borderBottom: tab === id ? `2px solid ${colA}` : '2px solid transparent', transition: 'all .15s' }}>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BANNER — comentarios nuevos de la entrenadora */}
      {sesionesConComentarioNuevo.length > 0 && (
        <div style={{ maxWidth: isDesktop ? 1100 : 520, margin: '0 auto', padding: isDesktop ? '12px 24px 0' : '10px 12px 0' }}>
          {sesionesConComentarioNuevo.map(s => (
            <div key={s.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f5f3ff', border: `1.5px solid #7c3aed`, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>💬</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4c1d95' }}>Tu entrenadora te ha dejado un mensaje</div>
                <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.titulo}</div>
              </div>
              {s.token_publico && (
                <button onClick={() => { window.location.href = `/sesion/${s.token_publico}#comentario` }}
                  style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#7c3aed', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Ver →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ maxWidth: isDesktop ? 1100 : 520, margin: '0 auto', padding: isDesktop ? '0 24px' : '0' }}>
        {tab === 'semana'     && portalConfig.mostrar_semana     && <TabSemana />}
        {tab === 'calendario' && portalConfig.mostrar_calendario && <TabCalendario />}
        {tab === 'plan'       && portalConfig.mostrar_plan       && <TabPlan />}
      </div>

      {modalRegistrar && <ModalRegistrar />}

      {/* ── Conexión Strava ────────────────────────────────────────────── */}
      <div style={{
        maxWidth: isDesktop ? 1100 : 520, margin: '32px auto 48px',
        padding: isDesktop ? '0 24px' : '0 16px',
      }}>
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: '16px 20px',
        }}>
          {/* Fila principal */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🏃</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Strava</div>
                <div style={{ fontSize: 11, color: stravaConectado ? T.green : T.ink3 }}>
                  {stravaConectado ? '✓ Strava conectado' : 'Conecta tu cuenta para sincronizar actividades'}
                </div>
              </div>
            </div>
            {!stravaConectado && (
              <button
                onClick={conectarStrava}
                disabled={stravaConectando}
                style={{
                  background: stravaConectando ? T.bg2 : '#FC4C02',
                  color: stravaConectando ? T.ink3 : '#fff',
                  border: 'none', borderRadius: 8,
                  padding: '8px 16px', fontSize: 12, fontWeight: 600,
                  cursor: stravaConectando ? 'default' : 'pointer',
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}
              >
                {stravaConectando ? 'Redirigiendo…' : 'Conectar con Strava'}
              </button>
            )}
            {stravaConectado && (
              <span style={{
                background: T.greenL, color: T.green,
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>✓ Conectado</span>
            )}
          </div>

          {/* Acción discreta de desconexión — solo visible si conectado */}
          {stravaConectado && !stravaConfirmDesc && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
              <button
                onClick={() => setStravaConfirmDesc(true)}
                disabled={stravaDesconectando}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  fontSize: 11, color: T.ink3, cursor: 'pointer',
                  textDecoration: 'underline', textDecorationStyle: 'dotted',
                }}
              >
                {stravaDesconectando ? 'Desconectando…' : 'Desconectar Strava'}
              </button>
            </div>
          )}

          {/* Modal de confirmación inline */}
          {stravaConectado && stravaConfirmDesc && (
            <div style={{
              marginTop: 12, padding: '12px 14px',
              background: T.bg, border: `1px solid ${T.border2}`,
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, marginBottom: 4 }}>
                ¿Desconectar Strava?
              </div>
              <div style={{ fontSize: 11, color: T.ink2, marginBottom: 12, lineHeight: 1.5 }}>
                IdelRi dejará de recibir nuevas actividades de esta cuenta de Strava.
                Los datos de actividades que ya se hayan importado se conservarán.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setStravaConfirmDesc(false)}
                  style={{
                    background: T.surface, border: `1px solid ${T.border}`,
                    borderRadius: 6, padding: '6px 14px',
                    fontSize: 11, fontWeight: 600, color: T.ink, cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={desconectarStrava}
                  disabled={stravaDesconectando}
                  style={{
                    background: '#A32D2D', border: 'none',
                    borderRadius: 6, padding: '6px 14px',
                    fontSize: 11, fontWeight: 600, color: '#fff',
                    cursor: stravaDesconectando ? 'default' : 'pointer',
                    opacity: stravaDesconectando ? 0.7 : 1,
                  }}
                >
                  {stravaDesconectando ? 'Desconectando…' : 'Desconectar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
