import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { clonarSesion } from '../lib/clonarSesion'
import { format, addWeeks, addDays, parseISO, differenceInWeeks, differenceInDays, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameDay, isSameMonth, getISOWeek, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X, ChevronDown, ChevronRight, Trophy, Calendar, Layers, Pencil, Lock } from 'lucide-react'
import CalendarioSesiones from '../components/CalendarioSesiones'
import EmojiPicker from '../components/EmojiPicker'
import Seguimiento from './Seguimiento'
import PortalClienteModal from '../components/PortalClienteModal'
import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

// ─── HELPERS ────────────────────────────────────────────────────────────────

function calcFechaInicioSemana(bloque, numSemana) {
  return addWeeks(parseISO(bloque.fecha_inicio), numSemana - 1)
}
function calcFechaFinSemana(bloque, numSemana) {
  return addWeeks(parseISO(bloque.fecha_inicio), numSemana)
}
function calcTotalSemanas(bloques) {
  return bloques.reduce((s, b) => s + b.semanas, 0)
}
function calcOffsetSemanaGlobal(bloques, bloqueId, numSemanaLocal) {
  let offset = 0
  for (const b of bloques) {
    if (b.id === bloqueId) return offset + numSemanaLocal
    offset += b.semanas
  }
  return offset + numSemanaLocal
}
// Estado visual de una sesión (pura: no depende del componente)
function calcEstadoSesion(s, feedbackPorSesion, packPorId) {
  const estadoPersistido = s.estado

  const hoy = new Date(new Date().toDateString())
  const esFutura = s.fecha ? new Date(s.fecha) > hoy : false

  // 1. Estado persistido (no pendiente) — ignorar completados en sesiones futuras
  if (estadoPersistido && estadoPersistido !== 'pendiente') {
    if (esFutura && ['completada', 'parcial', 'realizada'].includes(estadoPersistido)) return 'pendiente'
    return estadoPersistido
  }

  const fbStatus = feedbackPorSesion.get(s.id)?.data?.completion?.status

  // 2. Feedback directo del cliente — tiene prioridad sobre todo lo demás (si no es futura)
  if (!esFutura && fbStatus) {
    if (fbStatus === 'completed') return 'completada'
    if (fbStatus === 'partial')   return 'parcial'
    if (fbStatus === 'missed')    return 'no_realizada'
  }

  // 3. Cliente guardó la sesión (completada_el set) — solo si no es futura
  if (s.completada_el && !esFutura) return 'realizada'

  // 4. Fecha expirada sin acción — estado visual solo, no se persiste
  const fechaExpira = s.fecha
    ? new Date(s.fecha)
    : s.pack_id
      ? (() => { const p = packPorId.get(s.pack_id); return p ? new Date(p.fecha_fin) : null })()
      : null

  if (fechaExpira && fechaExpira < hoy) return 'vencida'

  return 'pendiente'
}

function colorDeEstado(e) {
  if (e === 'completada')   return '#16a34a'
  if (e === 'parcial')      return '#ca8a04'
  if (e === 'realizada')    return '#3b82f6'
  if (e === 'no_realizada') return '#dc2626'
  if (e === 'vencida')      return '#dc2626'
  return '#64748b'
}

function iconoSesion(s) {
  if (s.icono) return s.icono
  const t = (s.titulo || '').toLowerCase()
  if (/fuerza|gym|pesas|pesa|musculac|core|funcional/.test(t)) return '💪'
  if (/rodaje|carrera|run|correr|trote|fondo|series|tempo|interval/.test(t)) return '🏃'
  if (/movilidad|yoga|stretching|flexibilidad|estiram/.test(t)) return '🧘'
  if (/bici|ciclis|spinning|cycling/.test(t)) return '🚴'
  if (/nadar|natación|piscina|swim/.test(t)) return '🏊'
  return '⚡'
}

// ─── CONSTANTES ─────────────────────────────────────────────────────────────

const CARGAS = {
  baja:     { label: 'Baja',     color: '#10b981' },
  media:    { label: 'Media',    color: '#f59e0b' },
  alta:     { label: 'Alta',     color: '#ef4444' },
  muy_alta: { label: 'Muy alta', color: '#7c3aed' },
}
const COLORES = [
  '#2d6a4f', '#3b82f6', '#ef4444', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6b7280',
]
const ENFOQUES = ['Movilidad', 'Estabilidad y control', 'Fuerza base', 'Potencia y velocidad', 'Especificidad deportiva']

// ─── HELPERS DE VARIABLES ──────────────────────────────────────────────────

const VARS_TIMELINE = (esResistencia) => [
  { key: 'carga_interna', label: 'RPE×min' },
  { key: 'rpe',           label: 'RPE' },
  { key: 'duracion',      label: 'Duración' },
  ...(esResistencia ? [{ key: 'fc_zonas', label: 'FC Zonas' }] : []),
]

// Mapa sesion_id → feedback, cacheado por array (se reconstruye solo si cambian los feedbacks)
const _cacheMapaFeedbacks = new WeakMap()
function mapaFeedbacks(feedbacks) {
  let m = _cacheMapaFeedbacks.get(feedbacks)
  if (!m) { m = new Map(feedbacks.map(f => [f.sesion_id, f])); _cacheMapaFeedbacks.set(feedbacks, m) }
  return m
}

function calcValorVar(varKey, col, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques) {
  const colFin = col.fechaFin || col.fecha
  const sesDia = sesiones.filter(s => {
    if (!s.fecha) return false
    const f = parseISO(s.fecha)
    if (tlAgrup === 'dia') return isSameDay(f, col.fecha)
    return f >= col.fecha && f <= colFin
  })
  const fbMap = mapaFeedbacks(feedbacks)
  const fbsDia = sesDia.map(s => fbMap.get(s.id)).filter(Boolean)
  if (varKey === 'rpe') {
    const vals = fbsDia.map(f => f.data?.rpe?.value).filter(v => v != null)
    return { real: vals.length ? Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10 : null, obj: null }
  }
  if (varKey === 'duracion') {
    const realSum = fbsDia.reduce((s,f) => s+(f.data?.duration?.minutes||0),0) || null
    const sesDuracion = sesDia.filter(ses => ses.duracion_min != null && ses.duracion_min > 0)
    const planned = sesDuracion.length ? sesDuracion.reduce((s,ses) => s+ses.duracion_min, 0) : null
    return { real: realSum || planned || null, obj: null }
  }
  if (varKey === 'carga_interna') {
    const real = fbsDia.reduce((s,f) => {
      const rpe = f.data?.rpe?.value; const dur = f.data?.duration?.minutes
      return rpe!=null&&dur ? s+rpe*dur : s
    }, 0) || null
    return { real: real||null, obj: null }
  }
  if (varKey === 'fc_zonas') {
    const sem = todasLasSemanas.find(s => s.fi<=colFin && s.ff>col.fecha)
    const sd  = sem?.semData
    const real = sd ? sd.zona1_2_real||sd.zona3_4_real||sd.zona5_real ? (sd.zona1_2_real+sd.zona3_4_real+sd.zona5_real)||null : null : null
    const blq  = sem ? bloques.find(b => b.id===sem.bloque.id) : null
    const subMatch = blq ? (subbloques[blq.id]||[]).find(sub => sem.numLocal>=sub.semana_inicio&&sem.numLocal<=sub.semana_fin) : null
    const obj  = subMatch ? (subMatch.zona1_2+subMatch.zona3_4+subMatch.zona5)||null : null
    return { real, obj }
  }
  return { real: null, obj: null }
}

function tickFmt(varKey) {
  if (varKey === 'rpe') return v => v
  if (varKey === 'duracion') return v => v + 'min'
  if (varKey === 'fc_zonas') return v => v + '%'
  return v => v
}

function tickSfx(varKey) {
  if (varKey === 'duracion') return 'min'
  if (varKey === 'fc_zonas') return '%'
  return ''
}

// Devuelve 5 ticks de arriba (max) a abajo (0) para mostrar en Zona C
function calcTicksForVar(varKey, columnas, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques) {
  if (varKey === 'rpe')     return ['10', '8', '6', '4', '2', '0']
  if (varKey === 'fc_zonas') return ['100%', '75%', '50%', '25%', '0%']
  const vals = columnas.map(col => {
    const { real } = calcValorVar(varKey, col, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques)
    return typeof real === 'number' ? real : 0
  })
  const maxVal = Math.max(0, ...vals)
  if (maxVal === 0) return ['0', '0', '0', '0', '0']
  const niceCeil = v => {
    if (v <= 10) return Math.ceil(v)
    const mag = Math.pow(10, Math.floor(Math.log10(v)))
    return Math.ceil(v / mag) * mag
  }
  const top = niceCeil(maxVal)
  const sfx = tickSfx(varKey)
  return [top, Math.round(top * 0.75), Math.round(top * 0.5), Math.round(top * 0.25), 0].map(v => v + sfx)
}

function GraficaTimeline({ varPrincipal, varSecundaria, columnas, totalW, colW: colWProp, chartH, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques }) {
  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)

  const dataPrin    = columnas.map(col => { const { real } = calcValorVar(varPrincipal,  col, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques); return typeof real === 'number' ? real : null })
  const dataObjPrin = columnas.map(col => { const { obj }  = calcValorVar(varPrincipal,  col, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques); return typeof obj  === 'number' ? obj  : null })
  const dataSec     = varSecundaria ? columnas.map(col => { const { real } = calcValorVar(varSecundaria, col, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques); return typeof real === 'number' ? real : null }) : []
  const dataObjSec  = varSecundaria ? columnas.map(col => { const { obj }  = calcValorVar(varSecundaria, col, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques); return typeof obj  === 'number' ? obj  : null }) : []
  const hayObjPrin  = dataObjPrin.some(v => v !== null)
  const hayObjSec   = dataObjSec.some(v => v !== null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const existing = Chart.getChart(canvas)
    if (existing) existing.destroy()

    const labels = columnas.map((_, i) => i)

    const colW = colWProp || (tlAgrup === 'dia' ? 52 : tlAgrup === 'semana' ? 80 : 120)
    const barW = Math.max(4, colW - 14)

    const datasets = [
      { type: 'bar',  label: VARS_TIMELINE(true).find(v=>v.key===varPrincipal)?.label  || varPrincipal,  data: dataPrin,   backgroundColor: '#3b82f6cc', borderRadius: 2, yAxisID: 'y1', barThickness: barW, categoryPercentage: 0.5, barPercentage: 0.8, _isObj: false, _tipo: 'bar' },
      ...(hayObjPrin  ? [{ type: 'line', label: 'Obj ' + (VARS_TIMELINE(true).find(v=>v.key===varPrincipal)?.label ||''), data: dataObjPrin, borderColor: '#3b82f680', borderDash: [4,4], borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false, yAxisID: 'y1', _isObj: true, _tipo: 'line-obj' }] : []),
      ...(varSecundaria ? [{ type: 'line', label: VARS_TIMELINE(true).find(v=>v.key===varSecundaria)?.label || varSecundaria, data: dataSec, borderColor: '#f97316', pointBackgroundColor: '#f97316', pointRadius: 5, pointHoverRadius: 7, showLine: false, fill: false, yAxisID: 'y2', _isObj: false, _tipo: 'line' }] : []),
      ...(varSecundaria && hayObjSec ? [{ type: 'line', label: 'Obj ' + (VARS_TIMELINE(true).find(v=>v.key===varSecundaria)?.label||''), data: dataObjSec, borderColor: '#f9731640', borderDash: [4,4], borderWidth: 1.5, pointRadius: 0, tension: 0, fill: false, yAxisID: 'y2', _isObj: true, _tipo: 'line-obj' }] : []),
    ]

    chartRef.current = new Chart(canvas, {
      data: { labels, datasets },
      options: {
        responsive: false,
        animation: {
          onComplete: () => {
            const c = chartRef.current
            if (!c) return
            const ctx2d = canvasRef.current?.getContext('2d')
            if (!ctx2d) return
            ctx2d.save()
            ctx2d.font = '8px Arial'
            ctx2d.textAlign = 'center'
            c.data.datasets.forEach((ds, di) => {
              if (ds._isObj || ds._tipo !== 'bar') return
              const meta = c.getDatasetMeta(di)
              meta.data.forEach((bar, i) => {
                const val = ds.data[i]
                if (val == null) return
                ctx2d.fillStyle = '#555'
                ctx2d.fillText(Math.round(val), bar.x, bar.y - 4)
              })
            })
            ctx2d.restore()
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#fff', borderColor: '#e1e0d9', borderWidth: 1,
            titleColor: '#0b0b0b', bodyColor: '#52514e', padding: 10,
            callbacks: {
              title: items => {
                const idx = items[0].dataIndex
                const col = columnas[idx]
                if (!col) return ''
                if (tlAgrup === 'dia') return format(col.fecha, "d 'de' MMM", { locale: es })
                if (tlAgrup === 'semana') return `S${getISOWeek(col.fecha)} (${format(col.fecha, 'd MMM', { locale: es })})`
                return format(col.fecha, 'MMMM yyyy', { locale: es })
              },
              label: item => {
                const sfx = item.dataset.yAxisID === 'y2' ? ' (sec)' : ''
                return item.dataset.label + ': ' + Math.round(item.parsed.y) + sfx
              }
            }
          }
        },
        scales: {
          x:  { display: false, offset: true, categoryPercentage: 0.5, barPercentage: 0.8 },
          // Ejes ocultos dentro del canvas — el plot area ocupa el 100% del ancho
          // Los ticks se renderizan fuera como overlays absolutos (ver JSX)
          y1: { position: 'left',  display: false, grid: { color: 'rgba(0,0,0,0.05)' } },
          y2: { position: 'right', display: false, grid: { drawOnChartArea: false } }
        }
      }
    })

    return () => {
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      else { const c = Chart.getChart(canvas); if (c) c.destroy() }
    }
  }, [varPrincipal, varSecundaria, columnas, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques])

  const colW    = colWProp || (tlAgrup === 'dia' ? 52 : tlAgrup === 'semana' ? 80 : 120)
  const canvasW = columnas.length * colW

  return (
    <div style={{ height: chartH, minWidth: totalW, overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={canvasW} height={chartH} style={{ display: 'block' }} />
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

export default function Planificacion({ clientePlanificacion, setPage, setSesionesContext, recargarPlan, planificacionFechaInicial, setPlanificacionFechaInicial }) {
  // ── Datos ──
  const [clientes,            setClientes]            = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [clienteData,         setClienteData]         = useState(null)
  const [planificacion,       setPlanificacion]       = useState(null)
  const [planificaciones,     setPlanificaciones]     = useState([])
  const [bloques,             setBloques]             = useState([])
  const [subbloques,          setSubbloques]          = useState({})
  const [semanas,             setSemanas]             = useState({})  // legacy: map bloque_id → rows
  const [semanasAll,          setSemanasAll]          = useState([])  // 5.6D: todas las semanas del plan
  const [sesiones,            setSesiones]            = useState([])
  const [competiciones,       setCompeticiones]       = useState([])
  const [controles,           setControles]           = useState([])
  const [notas,               setNotas]               = useState([])
  const [feedbacks,           setFeedbacks]           = useState([])
  const [packs,               setPacks]               = useState([])
  const [clipboardSesion,     setClipboardSesion]     = useState(null)

  // ── UI ──
  const [vista,      setVista]      = useState(() => localStorage.getItem('planVista') || 'timeline')
  const cambiarVista = v => { setVista(v); localStorage.setItem('planVista', v) }
  const [zoomTL,     setZoomTL]     = useState(44)   // px por semana en el timeline
  const [loading,    setLoading]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [filtros,    setFiltros]    = useState({ bloques: true, sub: true, semanas: true, sesiones: true, eventos: false })
  const [tooltip,    setTooltip]    = useState({ visible: false, tipo: null, item: null, x: 0, y: 0 })
  const [menuAnadir, setMenuAnadir] = useState(false)
  const [portalModal, setPortalModal] = useState(false)
  const [modalPack, setModalPack] = useState(null)
  const [formPack, setFormPack] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', descripcion: '' })
  const [modalCopiarPack, setModalCopiarPack] = useState(null)
  const [copiarPackForm, setCopiarPackForm] = useState({ cliente_id: '', fecha_inicio: '', fecha_fin: '' })
  const [savingPack, setSavingPack] = useState(false)
  const [packsAbiertos, setPacksAbiertos] = useState(new Set())
  const [arrastrando, setArrastrando] = useState(null)
  const [modoDrag, setModoDrag] = useState('mover') // 'mover' | 'copiar'
  const [dropPackId, setDropPackId] = useState(null)
  const [semanaSeleccionada, setSemanaSeleccionada] = useState(null)
  const [notasSemanaText, setNotasSemanaText] = useState('')
  const [savingNotaSemana, setSavingNotaSemana] = useState(false)
  const notasTimer = useRef(null)

  // ── Timeline nuevo ──
  const [tlRows,            setTlRows]            = useState({ cal: true, per: true, pla: true, pro: true, com: true })
  const [tlAgrup,           setTlAgrup]           = useState('dia')
  const [varCarga,          setVarCarga]          = useState('carga_interna')
  const [var2Carga,         setVar2Carga]         = useState(null)
  const [alturaPlanificacion, setAlturaPlanificacion] = useState(106)
  const [tlTooltip,         setTlTooltip]         = useState({ visible: false, x: 0, y: 0, data: null })
  const tlTodayRef  = useRef(null)
  const tlZonaBRef  = useRef(null)
  const tlZonaCRef  = useRef(null)
  const tlZonaDRef  = useRef(null)
  const cargaIdRef        = useRef(0)     // descarta respuestas de cargas antiguas
  const clienteCargadoRef = useRef(null)  // cliente ya cargado → recargas silenciosas

  // ── Modal unificado ──
  const [modalTipo,      setModalTipo]      = useState(null)
  const [modalItem,      setModalItem]      = useState(null)
  const [formData,       setFormData]       = useState({})
  const [formResultados, setFormResultados] = useState([])

  // ── Modal copiar (flujo especial) ──
  const [modalCopiar, setModalCopiar] = useState(false)
  const [formCopiar,  setFormCopiar]  = useState({ cliente_id: '', fecha_inicio: '', nombre: '' })

  // ── Estado visual de sesión ──
  // Mapas memoizados: buscar feedback/pack por id es instantáneo en lugar de
  // recorrer los arrays enteros para cada sesión en cada render.
  const feedbackPorSesion = useMemo(() => new Map(feedbacks.map(f => [f.sesion_id, f])), [feedbacks])
  const packPorId = useMemo(() => new Map(packs.map(p => [p.id, p])), [packs])

  // Datos ya preparados para el calendario (solo se recalculan si cambian)
  const sesionesCalendario = useMemo(() => sesiones.map(s => {
    const esRealizada = s.estado === 'completada' || s.estado === 'parcial' || s.estado === 'realizada'
    const _fechaVisual = (esRealizada && s.completada_el) ? s.completada_el : s.fecha
    const _prevista = (esRealizada && s.completada_el && s.fecha && s.completada_el !== s.fecha) ? s.fecha : null
    return { ...s, _estadoColor: colorDeEstado(calcEstadoSesion(s, feedbackPorSesion, packPorId)), _fechaVisual, _prevista }
  }), [sesiones, feedbackPorSesion, packPorId])
  const feedbacksObj = useMemo(() => Object.fromEntries(feedbacks.map(f => [f.sesion_id, f])), [feedbacks])
  const semanasPorFecha = useMemo(() => Object.fromEntries(semanasAll.map(s => [s.fecha_inicio_semana, s])), [semanasAll])
  function estadoSesion(s) {
    return calcEstadoSesion(s, feedbackPorSesion, packPorId)
  }
  function colorEstado(s) {
    return colorDeEstado(estadoSesion(s))
  }
  function iconoEstado(s) {
    const e = estadoSesion(s)
    if (e === 'completada')   return { icono: '✓', bg: '#dcfce7', border: '#16a34a', color: '#166534' }
    if (e === 'parcial')      return { icono: '〜', bg: '#fef9c3', border: '#ca8a04', color: '#713f12' }
    if (e === 'realizada')    return { icono: '○', bg: '#dbeafe', border: '#3b82f6', color: '#1d4ed8' }
    if (e === 'no_realizada') return { icono: '✗', bg: '#fee2e2', border: '#dc2626', color: '#7f1d1d' }
    if (e === 'vencida')      return { icono: '✗', bg: '#fee2e2', border: '#dc2626', color: '#7f1d1d' }
    return null
  }

  // ── Effects ──
  useEffect(() => { cargarClientes() }, [])
  useEffect(() => {
    if (clientePlanificacion) {
      setClienteSeleccionado(clientePlanificacion)
      cambiarVista('calendario')
    }
  }, [clientePlanificacion])
  useEffect(() => {
    if (clienteSeleccionado) { cargarPlanificacion(); cargarClienteData(clienteSeleccionado) }
  }, [clienteSeleccionado, recargarPlan])
  useEffect(() => {
    if (tlTodayRef.current && tlZonaDRef.current && vista === 'timeline') {
      const el = tlTodayRef.current
      const d  = tlZonaDRef.current
      const target = el.offsetLeft - d.clientWidth / 2 + el.offsetWidth / 2
      d.scrollLeft = Math.max(0, target)
    }
  }, [tlAgrup, planificacion?.id, vista])

  useEffect(() => {
    const d = tlZonaDRef.current
    if (!d) return
    const fn = () => {
      if (tlZonaBRef.current) tlZonaBRef.current.scrollLeft = d.scrollLeft
      if (tlZonaCRef.current) tlZonaCRef.current.scrollTop  = d.scrollTop
    }
    d.addEventListener('scroll', fn, { passive: true })
    return () => d.removeEventListener('scroll', fn)
  }, [vista, tlAgrup])



  // ─────────────────────────────────────────────────────────────────────────
  // CARGA DE DATOS
  // ─────────────────────────────────────────────────────────────────────────

  async function cargarClientes() {
    const { data } = await supabase.from('clientes').select('id, nombre').eq('estado', 'activo').order('nombre')
    setClientes(data || [])
  }

  async function cargarClienteData(id) {
    const { data } = await supabase.from('clientes').select('id, nombre, semana_tipo, disponibilidad, consideraciones, perfil_planificacion, token_cliente, portal_config').eq('id', id).single()
    setClienteData(data || null)
  }

  // Recarga los datos del cliente seleccionado.
  // - Las consultas van en paralelo (2 tandas en lugar de 9 en serie).
  // - Solo muestra "Cargando..." la primera vez que se abre un cliente; las
  //   recargas posteriores (tras guardar, mover, copiar...) son silenciosas y
  //   no desmontan la vista, así el calendario mantiene el mes que estabas viendo.
  // - Si cambias de cliente a mitad de una carga, la respuesta antigua se descarta.
  async function cargarPlanificacion() {
    const clienteId = clienteSeleccionado
    if (!clienteId) return
    const cargaId = ++cargaIdRef.current
    const silencioso = clienteCargadoRef.current === clienteId
    if (!silencioso) setLoading(true)

    const [
      { data: planes },
      { data: sess },
      { data: fbs },
      { data: comps },
      { data: ctrls },
      { data: nts },
      { data: pks },
    ] = await Promise.all([
      supabase.from('planificaciones').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('sesiones').select('*').eq('cliente_id', clienteId).order('fecha', { ascending: true, nullsFirst: false }).order('orden', { ascending: true }),
      supabase.from('sesion_feedback').select('sesion_id, submitted_at, data, sesiones!inner(cliente_id)').eq('sesiones.cliente_id', clienteId),
      supabase.from('competiciones').select('*').eq('cliente_id', clienteId).order('fecha'),
      supabase.from('controles').select('*, controles_resultados(*)').eq('cliente_id', clienteId).order('fecha'),
      supabase.from('sesion_notas').select('*').eq('cliente_id', clienteId).order('fecha').order('orden', { ascending: true }),
      supabase.from('packs_flexibles').select('*').eq('cliente_id', clienteId).order('fecha_inicio'),
    ])
    if (cargaId !== cargaIdRef.current) return

    const plan = planes?.[0] || null
    let bls = [], subs = [], semsAll = []
    if (plan) {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('bloques').select('*').eq('planificacion_id', plan.id).order('orden'),
        supabase.from('subbloques').select('*, bloques!inner(planificacion_id)').eq('bloques.planificacion_id', plan.id).order('semana_inicio'),
        supabase.from('semanas').select('*').eq('planificacion_id', plan.id).order('fecha_inicio_semana', { ascending: true }),
      ])
      if (cargaId !== cargaIdRef.current) return
      bls = r1.data || []
      subs = (r2.data || []).map(({ bloques: _b, ...s }) => s)
      semsAll = r3.data || []
    }

    const subsMap = {}
    subs.forEach(s => { if (!subsMap[s.bloque_id]) subsMap[s.bloque_id] = []; subsMap[s.bloque_id].push(s) })

    // Todo se aplica de golpe → React pinta una sola vez
    setPlanificaciones(planes || [])
    setPlanificacion(plan)
    setBloques(bls)
    setSubbloques(subsMap)
    aplicarSemanas(semsAll)
    setSesiones(plan ? (sess || []) : [])
    setFeedbacks(plan ? (fbs || []).map(({ sesiones: _s, ...f }) => f) : [])
    setCompeticiones(comps || [])
    setControles(ctrls || [])
    setNotas(nts || [])
    setPacks(pks || [])
    clienteCargadoRef.current = clienteId
    setLoading(false)

    // 5.6D: asegurar horizonte de semanas (idempotente). Si inserta semanas
    // nuevas, se recargan solo las semanas.
    if (plan) {
      supabase.rpc('asegurar_horizonte_planificacion', { p_planificacion_id: plan.id })
        .then(({ data, error }) => {
          if (error) { console.warn('asegurar_horizonte_planificacion:', error); return }
          if (!(data?.insertadas > 0)) return
          supabase.from('semanas').select('*')
            .eq('planificacion_id', plan.id)
            .order('fecha_inicio_semana', { ascending: true })
            .then(({ data: reloaded }) => {
              if (reloaded && cargaId === cargaIdRef.current) aplicarSemanas(reloaded)
            })
        })
    }
  }

  // semanasAll (todas las del plan) + mapa legacy bloque_id → semanas
  function aplicarSemanas(allSems) {
    setSemanasAll(allSems)
    const semsMap = {}
    allSems.filter(s => s.bloque_id).forEach(s => {
      if (!semsMap[s.bloque_id]) semsMap[s.bloque_id] = []
      semsMap[s.bloque_id].push(s)
    })
    setSemanas(semsMap)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SISTEMA DE MODALES UNIFICADO
  // ─────────────────────────────────────────────────────────────────────────

  function getInitialForm(tipo, item) {
    switch (tipo) {
      case 'plan_nuevo':
        return { cliente_id: clienteSeleccionado || '', nombre: '', fecha_inicio: '', fecha_fin: '', notas: '', tipo: 'deportiva' }
      case 'plan_editar':
        return { nombre: planificacion?.nombre || '', fecha_inicio: planificacion?.fecha_inicio || '', fecha_fin: planificacion?.fecha_fin || '', notas: planificacion?.notas || '', tipo: planificacion?.tipo || 'deportiva' }
      case 'bloque': {
        const fechaInicioDefault = item?.fecha_inicio || (
          bloques.length > 0
            ? format(addWeeks(parseISO(bloques[bloques.length - 1].fecha_inicio), bloques[bloques.length - 1].semanas), 'yyyy-MM-dd')
            : planificacion?.fecha_inicio || ''
        )
        const semanasDefault = item?.semanas || 4
        const fechaFinDefault = item?.fecha_inicio
          ? format(addWeeks(parseISO(item.fecha_inicio), item.semanas), 'yyyy-MM-dd')
          : (fechaInicioDefault ? format(addWeeks(parseISO(fechaInicioDefault), semanasDefault), 'yyyy-MM-dd') : '')
        return {
          nombre:             item?.nombre             || '',
          color:              item?.color              || '#2d6a4f',
          fecha_inicio:       fechaInicioDefault,
          fecha_fin:          fechaFinDefault,
          objetivo:           item?.objetivo           || '',
          sesiones_min:       item?.sesiones_min       || '',
          sesiones_max:       item?.sesiones_max       || '',
          duracion_media_min: item?.duracion_media_min || '',
          exigencia:          item?.exigencia          || '',
          enfoque_prioridad:  item?.enfoque_prioridad  || {},
          enfoque:            item?.enfoque            || [],
        }
      }
      case 'subbloque':
        return {
          bloque_id:          item?.bloque_id          || bloques[0]?.id || '',
          nombre:             item?.nombre             || '',
          semana_inicio:      item?.semana_inicio      || 1,
          semana_fin:         item?.semana_fin         || 1,
          notas:              item?.notas              || '',
          zona1_2:            item?.zona1_2            || 0,
          zona3_4:            item?.zona3_4            || 0,
          zona5:              item?.zona5              || 0,
          km_min:             item?.km_min             || '',
          km_max:             item?.km_max             || '',
          sesiones_min:       item?.sesiones_min       || '',
          sesiones_max:       item?.sesiones_max       || '',
          duracion_media_min: item?.duracion_media_min || '',
          exigencia:          item?.exigencia          || '',
          enfoque:            item?.enfoque            || [],
          enfoque_prioridad:  item?.enfoque_prioridad  || {},
        }
      case 'semana': {
        // item = { bloque, numero, semanaData }
        const sem = item?.semanaData
        return {
          objetivo:     sem?.objetivo     || '',
          carga:        sem?.carga        || 'media',
          km_objetivo:  sem?.km_objetivo  || '',
          km_real:      sem?.km_real      || '',
          zona1_2_real: sem?.zona1_2_real || 0,
          zona3_4_real: sem?.zona3_4_real || 0,
          zona5_real:   sem?.zona5_real   || 0,
          notas:        sem?.notas        || '',
          nota_cliente: sem?.nota_cliente || '',
          comentario:   sem?.comentario   || '',
        }
      }
      case 'comp':
        return { nombre: item?.nombre || '', fecha: item?.fecha || '', tipo: item?.tipo || '', objetivo: item?.objetivo || '', notas: item?.notas || '', visibilidad: item?.visibilidad || 'entrenadora' }
      case 'control':
        return { nombre: item?.nombre || '', fecha: item?.fecha || '', tipo: item?.tipo || '', notas: item?.notas || '', visibilidad: item?.visibilidad || 'entrenadora' }
      case 'nota':
        return { texto: item?.texto || '', fecha: item?.fecha || format(new Date(), 'yyyy-MM-dd'), visibilidad: item?.visibilidad || 'entrenadora' }
      case 'sesion':
        return { titulo: '', fecha: item?.fecha || '', sinFecha: false, tipo_sesion: 'programada', tipo_sesion_detalle: null, tipo_editor: 'fuerza', estado: 'pendiente', modalidad: 'autonoma', lugar: '', objetivo: '', notas_entrenador: '', duracion_min: '', con_feedback: true, icono: '', lista: false, publicada: true }
      default:
        return {}
    }
  }

  function openModal(tipo, item = null) {
    if (tipo === 'pack') { setFormPack({ nombre: '', fecha_inicio: '', fecha_fin: '', descripcion: '' }); setModalPack('nuevo'); return }
    if (tipo === 'control') {
      const res = (item?.controles_resultados || [])
        .slice().sort((a, b) => (a.orden || 0) - (b.orden || 0))
        .map(r => ({ nombre: r.nombre, valor: r.valor, unidad: r.unidad || '' }))
      setFormResultados(res.length > 0 ? res : [{ nombre: '', valor: '', unidad: '' }])
    }
    setModalTipo(tipo)
    setModalItem(item)
    setFormData(getInitialForm(tipo, item))
  }

  function closeModal() {
    setModalTipo(null)
    setModalItem(null)
    setFormData({})
    setFormResultados([])
  }

  // Atajo para actualizar un campo de formData
  function fd(key, val) {
    setFormData(f => ({ ...f, [key]: val }))
  }

  async function guardarPack() {
    setSavingPack(true)
    if (modalPack?.id) {
      await supabase.from('packs_flexibles').update({ nombre: formPack.nombre, fecha_inicio: formPack.fecha_inicio, fecha_fin: formPack.fecha_fin, descripcion: formPack.descripcion || null }).eq('id', modalPack.id)
    } else {
      await supabase.from('packs_flexibles').insert({ cliente_id: clienteSeleccionado, nombre: formPack.nombre, fecha_inicio: formPack.fecha_inicio, fecha_fin: formPack.fecha_fin, descripcion: formPack.descripcion || null })
    }
    setSavingPack(false); setModalPack(null); cargarPlanificacion()
  }

  function copiarEnlacePack(pack) {
    const url = `${window.location.origin}/pack/${pack.token_publico}`
    navigator.clipboard.writeText(url).catch(() => {})
    alert(`Enlace del pack copiado:\n${url}`)
  }

  async function eliminarPack(pack) {
    if (!window.confirm(`¿Eliminar el pack "${pack.nombre}" y todas sus sesiones?`)) return
    await supabase.from('sesiones').delete().eq('pack_id', pack.id)
    await supabase.from('packs_flexibles').delete().eq('id', pack.id)
    cargarPlanificacion()
  }

  async function moverAPack(sesion, packId) {
    setSesiones(ss => ss.map(x => x.id === sesion.id ? { ...x, pack_id: packId, fecha: null } : x))
    const { error } = await supabase.from('sesiones').update({ pack_id: packId, fecha: null }).eq('id', sesion.id)
    if (error) { alert('No se pudo mover la sesión al pack: ' + error.message); cargarPlanificacion() }
  }

  async function copiarPackAOtroCliente() {
    const { cliente_id, fecha_inicio, fecha_fin } = copiarPackForm
    if (!cliente_id || !fecha_inicio || !fecha_fin) return
    const pack = modalCopiarPack
    const { data: nuevoPack } = await supabase.from('packs_flexibles').insert({
      cliente_id, nombre: pack.nombre, fecha_inicio, fecha_fin, descripcion: pack.descripcion || null,
    }).select().single()
    if (!nuevoPack) { alert('No se pudo crear el pack en el cliente destino'); return }
    // Copia completa de cada sesión (en paralelo) y la asigna al pack nuevo
    const packSesiones = sesiones.filter(s => s.pack_id === pack.id)
    const resultados = await Promise.all(packSesiones.map(async s => {
      const { data: nueva, error } = await clonarSesion(supabase, s.id, { clienteDestino: cliente_id, fecha: null })
      if (error || !nueva) return error || new Error('sin datos')
      const { error: errPack } = await supabase.from('sesiones').update({ pack_id: nuevoPack.id }).eq('id', nueva.id)
      return errPack
    }))
    const fallo = resultados.find(Boolean)
    if (fallo) alert('Algunas sesiones no se pudieron copiar: ' + fallo.message)
    setModalCopiarPack(null)
    const nombreDestino = clientes.find(c => c.id === cliente_id)?.nombre || 'el cliente'
    alert(`Pack "${pack.nombre}" copiado a ${nombreDestino}`)
  }

  async function sacarDePack(sesion, fecha) {
    setSesiones(ss => ss.map(x => x.id === sesion.id ? { ...x, pack_id: null, fecha } : x))
    const { error } = await supabase.from('sesiones').update({ pack_id: null, fecha }).eq('id', sesion.id)
    if (error) { alert('No se pudo sacar la sesión del pack: ' + error.message); cargarPlanificacion() }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CALENDARIO: MOVER / COPIAR / PEGAR (al instante)
  // La pantalla se actualiza primero y se guarda en segundo plano. Si algo
  // falla, se avisa y se recargan los datos reales.
  // ─────────────────────────────────────────────────────────────────────────

  const TABLA_POR_TIPO = { sesion: 'sesiones', competicion: 'competiciones', control: 'controles', nota: 'sesion_notas' }
  const SETTER_POR_TIPO = { sesion: setSesiones, competicion: setCompeticiones, control: setControles, nota: setNotas }
  const tipoItem = item => (TABLA_POR_TIPO[item._tipo] ? item._tipo : 'nota')

  // Campos que se guardan al mover un elemento a otra fecha
  function payloadMover(item, fecha) {
    if (tipoItem(item) !== 'sesion') return { fecha }
    const e = estadoSesion(item)
    const yaRealizada = ['completada', 'parcial', 'realizada', 'no_realizada'].includes(e)
    // Realizada: se mueve también la fecha de realización (es la que pinta el calendario).
    // Pendiente: solo cambia la fecha prevista y sigue pendiente.
    return yaRealizada
      ? { fecha, completada_el: fecha, fecha_editada_por_entrenadora: true }
      : { fecha, completada_el: null, fecha_editada_por_entrenadora: true }
  }

  // Copia un elemento a una fecha. Devuelve el error (o null).
  async function copiarItem(item, fecha) {
    const tipo = tipoItem(item)
    if (tipo === 'sesion') {
      const { data, error } = await clonarSesion(supabase, item.id, { clienteDestino: clienteSeleccionado, fecha })
      if (!error && data) setSesiones(ss => [...ss, data])
      return error
    }
    // eslint-disable-next-line no-unused-vars
    const { id, created_at, token_publico, _tipo, _estadoColor, _fechaVisual, _prevista, controles_resultados, ...resto } = item
    const { data, error } = await supabase.from(TABLA_POR_TIPO[tipo]).insert({ ...resto, cliente_id: clienteSeleccionado, fecha }).select().single()
    if (error || !data) return error || new Error('sin datos')
    let nuevo = data
    if (tipo === 'control' && controles_resultados?.length) {
      const filas = controles_resultados.map(({ id: _rid, control_id: _cid, created_at: _rca, ...r }) => ({ ...r, control_id: data.id }))
      const { data: res } = await supabase.from('controles_resultados').insert(filas).select()
      nuevo = { ...data, controles_resultados: res || [] }
    } else if (tipo === 'control') {
      nuevo = { ...data, controles_resultados: [] }
    }
    SETTER_POR_TIPO[tipo](xs => [...xs, nuevo])
    return null
  }

  async function moverItemsCalendario(itemOrItems, fechaDestino, modo) {
    const modoEfectivo = modo || modoDrag
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems]

    if (modoEfectivo === 'copiar') {
      const errores = (await Promise.all(items.map(it => copiarItem(it, fechaDestino)))).filter(Boolean)
      if (errores.length) { alert('Error al copiar: ' + errores[0].message); cargarPlanificacion() }
      return
    }

    // Mover: primero en pantalla…
    items.forEach(item => {
      const tipo = tipoItem(item)
      const cambios = tipo === 'sesion' && item.pack_id
        ? { pack_id: null, fecha: fechaDestino }
        : payloadMover(item, fechaDestino)
      SETTER_POR_TIPO[tipo](xs => xs.map(x => x.id === item.id ? { ...x, ...cambios } : x))
    })
    // …y después en la base de datos
    const resultados = await Promise.all(items.map(item => {
      const tipo = tipoItem(item)
      const cambios = tipo === 'sesion' && item.pack_id
        ? { pack_id: null, fecha: fechaDestino }
        : payloadMover(item, fechaDestino)
      return supabase.from(TABLA_POR_TIPO[tipo]).update(cambios).eq('id', item.id)
    }))
    const fallo = resultados.find(r => r.error)
    if (fallo) { alert('No se pudo mover: ' + fallo.error.message); cargarPlanificacion() }
  }

  async function pegarItemCalendario(item, fecha) {
    const error = await copiarItem(item, fecha)
    if (error) { alert('Error al copiar: ' + error.message); cargarPlanificacion() }
  }

  async function guardarModal() {
    setSaving(true)
    try {
      switch (modalTipo) {

        case 'plan_nuevo': {
          if (!formData.cliente_id || !formData.nombre || !formData.fecha_inicio || !formData.fecha_fin) break
          await supabase.from('planificaciones').insert({ cliente_id: formData.cliente_id, nombre: formData.nombre, fecha_inicio: formData.fecha_inicio, fecha_fin: formData.fecha_fin, notas: formData.notas || null, tipo: formData.tipo || 'deportiva' })
          closeModal()
          setClienteSeleccionado(formData.cliente_id)
          break
        }

        case 'plan_editar': {
          if (!formData.nombre || !formData.fecha_inicio || !formData.fecha_fin) break
          await supabase.from('planificaciones').update({ nombre: formData.nombre, fecha_inicio: formData.fecha_inicio, fecha_fin: formData.fecha_fin, notas: formData.notas || null, tipo: formData.tipo || 'deportiva' }).eq('id', planificacion.id)
          closeModal(); cargarPlanificacion()
          break
        }

        case 'bloque': {
          if (!formData.nombre || !formData.fecha_inicio || !formData.fecha_fin) break
          const semanasCalculadas = Math.max(1, differenceInWeeks(parseISO(formData.fecha_fin), parseISO(formData.fecha_inicio)))

          // 5.6: Validar no-solapamiento con otros bloques de la misma planificación
          let cascadeExtraSemanas = 0
          {
            const inicioNuevo = parseISO(formData.fecha_inicio)
            const finNuevo = addDays(inicioNuevo, semanasCalculadas * 7) // exclusivo
            const conflicto = bloques.find(b => {
              if (!b.fecha_inicio || !b.semanas) return false
              if (modalItem?.id && b.id === modalItem.id) return false // excluir propio bloque
              const ini = parseISO(b.fecha_inicio)
              const fin = addDays(ini, b.semanas * 7) // exclusivo
              return inicioNuevo < fin && ini < finNuevo
            })
            if (conflicto) {
              // Si el bloque se extendió (más semanas que antes), ofrecer desplazar los siguientes
              const extraSemanas = semanasCalculadas - (modalItem?.semanas || 0)
              if (modalItem?.id && extraSemanas > 0) {
                const ok = window.confirm(
                  `Este bloque se solapa con «${conflicto.nombre}» porque lo has alargado ${extraSemanas} semana${extraSemanas === 1 ? '' : 's'}.\n\n¿Desplazar todos los bloques posteriores ${extraSemanas} semana${extraSemanas === 1 ? '' : 's'} hacia adelante?`
                )
                if (!ok) break
                cascadeExtraSemanas = extraSemanas
              } else {
                const finConflicto = format(addDays(parseISO(conflicto.fecha_inicio), conflicto.semanas * 7 - 1), 'd MMM yyyy', { locale: es })
                alert(`Este bloque se solapa con «${conflicto.nombre}» (${format(parseISO(conflicto.fecha_inicio), 'd MMM yyyy', { locale: es })} – ${finConflicto}).\n\nModifica la fecha de inicio o la duración.`)
                break
              }
            }
          }
          const esSaludGuardar = planificacion?.tipo === 'salud'
          const datos = { planificacion_id: planificacion.id, nombre: formData.nombre, color: formData.color || '#2d6a4f', fecha_inicio: formData.fecha_inicio, semanas: semanasCalculadas, objetivo: formData.objetivo || null, orden: modalItem?.orden ?? bloques.length,
            ...(esSaludGuardar ? {
              sesiones_min:       formData.sesiones_min       ? parseInt(formData.sesiones_min)       : null,
              sesiones_max:       formData.sesiones_max       ? parseInt(formData.sesiones_max)       : null,
              duracion_media_min: formData.duracion_media_min ? parseInt(formData.duracion_media_min) : null,
              exigencia:          formData.exigencia          || null,
              enfoque_prioridad:  Object.keys(formData.enfoque_prioridad || {}).length > 0 ? formData.enfoque_prioridad : null,
              enfoque:            formData.enfoque?.length    > 0 ? formData.enfoque : null,
            } : {}),
          }

          // 5.6D: función para asignar semanas existentes a un bloque por rango de fechas
          // (ya no crea semanas nuevas — solo asocia las existentes del plan)
          async function asignarSemanasABloque(bloqueId, fechaInicio, numSemanas) {
            // Semanas que caen en el rango del bloque
            const lunes = Array.from({ length: numSemanas }, (_, i) => {
              const d = addDays(parseISO(fechaInicio), i * 7)
              return format(d, 'yyyy-MM-dd')
            })
            // Desasignar semanas que ya no pertenecen al bloque (SET NULL)
            await supabase.from('semanas')
              .update({ bloque_id: null })
              .eq('bloque_id', bloqueId)
              .not('fecha_inicio_semana', 'in', `(${lunes.map(d => `"${d}"`).join(',')})`)
            // Asignar semanas del rango (solo las del mismo plan)
            await supabase.from('semanas')
              .update({ bloque_id: bloqueId })
              .eq('planificacion_id', planificacion.id)
              .in('fecha_inicio_semana', lunes)
          }

          // ORDEN CRÍTICO: primero desplazar los bloques siguientes (de atrás hacia adelante)
          // para que el trigger anti-solapamiento no rechace ningún UPDATE intermedio.
          // Luego guardar el bloque extendido (A), que ya no solapa con nadie.
          if (cascadeExtraSemanas > 0 && modalItem?.id) {
            const bloquesADesplazar = bloques
              .filter(b => b.id !== modalItem.id && parseISO(b.fecha_inicio) > parseISO(modalItem.fecha_inicio))
              .sort((a, x) => parseISO(x.fecha_inicio) - parseISO(a.fecha_inicio)) // DESC: últimos primero
            for (const b of bloquesADesplazar) {
              const nuevaFecha = format(addWeeks(parseISO(b.fecha_inicio), cascadeExtraSemanas), 'yyyy-MM-dd')
              const { error: errCasc } = await supabase.from('bloques').update({ fecha_inicio: nuevaFecha }).eq('id', b.id)
              if (errCasc) { alert('Error al desplazar bloques: ' + errCasc.message); setSaving(false); return }
              await asignarSemanasABloque(b.id, nuevaFecha, b.semanas)
            }
          }

          if (modalItem?.id) {
            const { error: errUpd } = await supabase.from('bloques').update(datos).eq('id', modalItem.id)
            if (errUpd) { alert('Error al guardar el bloque: ' + errUpd.message); setSaving(false); return }
            await asignarSemanasABloque(modalItem.id, formData.fecha_inicio, semanasCalculadas)
          } else {
            const { data: nb } = await supabase.from('bloques').insert(datos).select().single()
            if (nb) {
              await asignarSemanasABloque(nb.id, formData.fecha_inicio, semanasCalculadas)
            }
          }

          closeModal(); cargarPlanificacion()
          break
        }

        case 'subbloque': {
          if (!formData.nombre || !formData.bloque_id) break
          const datos = {
            bloque_id:          formData.bloque_id,
            nombre:             formData.nombre,
            semana_inicio:      parseInt(formData.semana_inicio),
            semana_fin:         parseInt(formData.semana_fin),
            notas:              formData.notas || null,
            zona1_2:            parseInt(formData.zona1_2) || 0,
            zona3_4:            parseInt(formData.zona3_4) || 0,
            zona5:              parseInt(formData.zona5) || 0,
            km_min:             formData.km_min ? parseInt(formData.km_min) : null,
            km_max:             formData.km_max ? parseInt(formData.km_max) : null,
            sesiones_min:       formData.sesiones_min ? parseInt(formData.sesiones_min) : null,
            sesiones_max:       formData.sesiones_max ? parseInt(formData.sesiones_max) : null,
            duracion_media_min: formData.duracion_media_min ? parseInt(formData.duracion_media_min) : null,
            exigencia:          formData.exigencia || null,
            enfoque:            formData.enfoque?.length ? formData.enfoque : null,
            enfoque_prioridad:  Object.keys(formData.enfoque_prioridad || {}).length ? formData.enfoque_prioridad : null,
          }
          if (modalItem?.id) await supabase.from('subbloques').update(datos).eq('id', modalItem.id)
          else await supabase.from('subbloques').insert(datos)
          closeModal(); cargarPlanificacion()
          break
        }

        case 'semana': {
          const bloque_id       = modalItem?.bloque?.id || modalItem?.bloque_id
          const numero          = modalItem?.numero     ?? modalItem?.numeroSemana
          const semanaExistente = modalItem?.semanaData
          const datos = {
            objetivo:     formData.objetivo || null,
            carga:        formData.carga,
            km_objetivo:  formData.km_objetivo  ? parseInt(formData.km_objetivo)  : null,
            km_real:      formData.km_real      ? parseInt(formData.km_real)      : null,
            zona1_2_real: parseInt(formData.zona1_2_real) || 0,
            zona3_4_real: parseInt(formData.zona3_4_real) || 0,
            zona5_real:   parseInt(formData.zona5_real)   || 0,
            notas:        formData.notas        || null,
            nota_cliente: formData.nota_cliente || null,
            comentario:   formData.comentario   || null,
          }
          let semErr
          if (semanaExistente?.id) {
            // semana encontrada en estado local: UPDATE normal + asegurar bloque_id si falta
            const updatePayload = semanaExistente.bloque_id ? datos : { ...datos, bloque_id }
            const { error } = await supabase.from('semanas').update(updatePayload).eq('id', semanaExistente.id)
            semErr = error
          } else {
            // semana no encontrada en estado local (p.ej. bloque_id null o fuera de rango)
            // buscar en BD por fecha antes de insertar
            const fIniStr = modalItem?.fechaIni || null
            if (fIniStr && planificacion?.id) {
              const { data: semBD } = await supabase.from('semanas').select('id, bloque_id').eq('planificacion_id', planificacion.id).eq('fecha_inicio_semana', fIniStr).maybeSingle()
              if (semBD?.id) {
                // fila existe pero sin bloque_id — actualizar datos Y asignar bloque
                const updatePayload = semBD.bloque_id ? datos : { ...datos, bloque_id }
                const { error } = await supabase.from('semanas').update(updatePayload).eq('id', semBD.id)
                semErr = error
              } else {
                const { error } = await supabase.from('semanas').insert({ bloque_id, numero, planificacion_id: planificacion.id, fecha_inicio_semana: fIniStr, ...datos })
                semErr = error
              }
            } else {
              const { error } = await supabase.from('semanas').insert({ bloque_id, numero, planificacion_id: planificacion?.id, fecha_inicio_semana: fIniStr, ...datos })
              semErr = error
            }
          }
          if (semErr) { console.error('guardarModal semana:', semErr); alert('Error al guardar: ' + semErr.message); break }
          closeModal(); cargarPlanificacion()
          break
        }

        case 'comp': {
          if (!formData.nombre || !formData.fecha) break
          const datos = { nombre: formData.nombre, fecha: formData.fecha, tipo: formData.tipo || null, objetivo: formData.objetivo || null, notas: formData.notas || null, visibilidad: formData.visibilidad || 'entrenadora' }
          if (modalItem?.id) await supabase.from('competiciones').update(datos).eq('id', modalItem.id)
          else await supabase.from('competiciones').insert({ cliente_id: clienteSeleccionado, ...datos })
          closeModal(); cargarPlanificacion()
          break
        }

        case 'control': {
          if (!formData.nombre || !formData.fecha) break
          const resultadosValidos = formResultados
            .filter(r => r.nombre.trim() && r.valor.trim())
            .map((r, i) => ({ nombre: r.nombre.trim(), valor: r.valor.trim(), unidad: r.unidad.trim() || null, orden: i }))
          const datos = { nombre: formData.nombre, fecha: formData.fecha, tipo: formData.tipo || null, notas: formData.notas || null, visibilidad: formData.visibilidad || 'entrenadora' }
          let controlId
          if (modalItem?.id) {
            await supabase.from('controles').update(datos).eq('id', modalItem.id)
            await supabase.from('controles_resultados').delete().eq('control_id', modalItem.id)
            controlId = modalItem.id
          } else {
            const { data: nc } = await supabase.from('controles').insert({ cliente_id: clienteSeleccionado, ...datos }).select('id').single()
            controlId = nc.id
          }
          if (resultadosValidos.length > 0) {
            await supabase.from('controles_resultados').insert(resultadosValidos.map(r => ({ ...r, control_id: controlId })))
          }
          closeModal(); cargarPlanificacion()
          break
        }

        case 'nota': {
          if (!formData.texto) break
          const datos = { texto: formData.texto, fecha: formData.fecha || null, visibilidad: formData.visibilidad || 'entrenadora' }
          if (modalItem?.id) await supabase.from('sesion_notas').update(datos).eq('id', modalItem.id)
          else await supabase.from('sesion_notas').insert({ cliente_id: clienteSeleccionado, ...datos })
          closeModal(); cargarPlanificacion()
          break
        }

        case 'sesion': {
          if (!formData.titulo) break
          const datosSesion = {
            cliente_id: clienteSeleccionado,
            titulo: formData.titulo,
            fecha: formData.sinFecha ? null : (formData.fecha || null),
            tipo_sesion: formData.tipo_sesion || 'programada',
            tipo_sesion_detalle: formData.tipo_sesion_detalle || null,
            tipo_editor: formData.tipo_editor || 'fuerza',
            estado: formData.estado || 'pendiente',
            modalidad: formData.modalidad || 'autonoma',
            lugar: formData.lugar || null,
            objetivo: formData.objetivo || null,
            notas_entrenador: formData.notas_entrenador || null,
            duracion_min: formData.duracion_min ? parseInt(formData.duracion_min) : null,
            con_feedback: formData.con_feedback !== false,
            icono: formData.icono || null,
            lista: formData.lista || false,
            publicada: formData.publicada !== false,
            token_publico: crypto.randomUUID(),
          }
          await supabase.from('sesiones').insert(datosSesion)
          closeModal(); cargarPlanificacion()
          break
        }

        default: break
      }
    } finally {
      setSaving(false)
    }
  }

  async function eliminarItem(tipoArg, idArg) {
    const tipo = tipoArg || modalTipo
    const id   = idArg   || modalItem?.id
    const mensajes = {
      bloque:    '¿Eliminar este bloque? Se eliminarán también sus sub bloques y semanas.',
      subbloque: '¿Eliminar este sub bloque?',
      sesion:    '¿Eliminar esta sesión?',
      comp:      '¿Eliminar esta competición?',
      control:   '¿Eliminar este control?',
      nota:      '¿Eliminar esta nota?',
    }
    if (!window.confirm(mensajes[tipo] || '¿Eliminar?')) return
    const tablas = { bloque: 'bloques', subbloque: 'subbloques', sesion: 'sesiones', comp: 'competiciones', control: 'controles', nota: 'sesion_notas' }
    // Elementos del calendario: desaparecen al instante
    const setters = { sesion: setSesiones, comp: setCompeticiones, control: setControles, nota: setNotas }
    if (setters[tipo]) setters[tipo](xs => xs.filter(x => x.id !== id))
    if (!tipoArg) closeModal()
    const { error } = await supabase.from(tablas[tipo]).delete().eq('id', id)
    if (error) alert('No se pudo eliminar: ' + error.message)
    cargarPlanificacion()
  }

  const esSalud       = planificacion?.tipo === 'salud'
  const esResistencia = !esSalud && clienteData?.perfil_planificacion !== 'fuerza_salud'

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS DE MODAL: TÍTULOS Y FORMULARIO
  // ─────────────────────────────────────────────────────────────────────────

  function getTituloModal() {
    const esEditar = !!modalItem?.id || (modalTipo === 'semana' && !!modalItem?.semanaData?.id)
    return {
      plan_nuevo:  'Nueva planificación',
      plan_editar: 'Editar planificación',
      bloque:      esEditar ? 'Editar bloque'              : 'Nuevo bloque',
      subbloque:   esEditar ? 'Editar sub bloque'          : 'Nuevo sub bloque',
      semana:      (() => {
        const b   = modalItem?.bloque
        const num = modalItem?.numero
        if (b && num) {
          const fi = format(calcFechaInicioSemana(b, num), 'dd MMM', { locale: es })
          const ff = format(calcFechaFinSemana(b, num), 'dd MMM', { locale: es })
          return `Semana ${num} · ${fi} – ${ff}`
        }
        return `Semana ${num || ''}`
      })(),
      sesion:      esEditar ? 'Editar sesión'              : 'Nueva sesión',
      comp:        esEditar ? 'Editar competición'         : 'Nueva competición',
      control:     esEditar ? 'Editar evaluación' : 'Nueva evaluación',
      nota:        esEditar ? 'Editar nota'                : 'Nueva nota',
      ver_bloque:    'Detalle del bloque',
      ver_subbloque: 'Detalle del sub-bloque',
    }[modalTipo] || ''
  }

  function getTituloCrear() {
    return { plan_nuevo: 'Crear planificación', bloque: 'Crear bloque', subbloque: 'Crear sub bloque', semana: 'Guardar semana', sesion: 'Añadir sesión', comp: 'Añadir competición', control: 'Añadir control', nota: 'Añadir nota' }[modalTipo] || 'Guardar'
  }

  function renderFormulario() {
    const perfil = clienteData?.perfil_planificacion

    switch (modalTipo) {

      // ── PLAN ──────────────────────────────────────────────────────────────
      case 'plan_nuevo':
      case 'plan_editar':
        return (
          <div style={{ padding: '0 20px 4px' }}>
            {modalTipo === 'plan_nuevo' && (
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <select className="form-select" value={formData.cliente_id || ''} onChange={e => fd('cliente_id', e.target.value)}>
                  <option value="">Selecciona...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            {(modalTipo === 'plan_nuevo' || modalTipo === 'plan_editar') && (
              <div className="form-group">
                <label className="form-label">Tipo de planificación</label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {[
                    { val: 'deportiva', label: 'Deportiva / Competición', desc: 'Bloques · Sub-bloques · Semanas · Sesiones con zonas' },
                    { val: 'salud',     label: 'Salud / Progresión',      desc: 'Bloques · Semanas · Sin sub-bloques' },
                  ].map(({ val, label, desc }) => {
                    const active = (formData.tipo || 'deportiva') === val
                    return (
                      <button key={val} onClick={() => fd('tipo', val)}
                        style={{ flex: 1, padding: '12px 10px', borderRadius: 10, border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', textAlign: 'left', transition: 'border 0.15s' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.4 }}>{desc}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={formData.nombre || ''} onChange={e => fd('nombre', e.target.value)} placeholder="Ej: Temporada 2025-2026" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha inicio *</label>
                <input className="form-input" type="date" value={formData.fecha_inicio || ''} onChange={e => fd('fecha_inicio', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha fin *</label>
                <input className="form-input" type="date" value={formData.fecha_fin || ''} onChange={e => fd('fecha_fin', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" value={formData.notas || ''} onChange={e => fd('notas', e.target.value)} />
            </div>
          </div>
        )

      // ── BLOQUE ────────────────────────────────────────────────────────────
      case 'bloque':
        return (
          <div style={{ padding: '0 20px 4px' }}>
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={formData.nombre || ''} onChange={e => fd('nombre', e.target.value)} placeholder="Ej: Base aeróbica" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {COLORES.map(c => (
                  <div key={c} onClick={() => fd('color', c)}
                    style={{ width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer', border: formData.color === c ? '3px solid var(--text)' : '3px solid transparent', transition: 'border 0.15s' }} />
                ))}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha inicio *</label>
                <input className="form-input" type="date" value={formData.fecha_inicio || ''} onChange={e => fd('fecha_inicio', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha fin *</label>
                <input className="form-input" type="date" value={formData.fecha_fin || ''} onChange={e => fd('fecha_fin', e.target.value)} />
              </div>
            </div>
            {formData.fecha_inicio && formData.fecha_fin && parseISO(formData.fecha_fin) > parseISO(formData.fecha_inicio) && (
              <div style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, marginTop: -8, marginBottom: 12 }}>
                → {Math.max(1, differenceInWeeks(parseISO(formData.fecha_fin), parseISO(formData.fecha_inicio)))} semanas
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Objetivo</label>
              <textarea className="form-textarea" value={formData.objetivo || ''} onChange={e => fd('objetivo', e.target.value)} placeholder="Ej: Desarrollar base aeróbica" />
            </div>
            {esSalud && (() => {
              const prioridadB   = formData.enfoque_prioridad || {}
              const totalPuntosB = Object.values(prioridadB).reduce((s, v) => s + v, 0)
              return (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Sesiones/sem mín</label>
                      <input className="form-input" type="number" min="1" max="7" value={formData.sesiones_min || ''} onChange={e => fd('sesiones_min', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sesiones/sem máx</label>
                      <input className="form-input" type="number" min="1" max="7" value={formData.sesiones_max || ''} onChange={e => fd('sesiones_max', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duración media (min)</label>
                    <input className="form-input" type="number" min="1" value={formData.duracion_media_min || ''} onChange={e => fd('duracion_media_min', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Exigencia</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['Baja', '#10b981'], ['Moderada', '#f59e0b'], ['Alta', '#ef4444']].map(([op, col]) => {
                        const active = formData.exigencia === op
                        return (
                          <button key={op} onClick={() => fd('exigencia', active ? '' : op)}
                            style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${active ? col : 'var(--border)'}`, background: active ? col + '20' : 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? col : 'var(--text2)' }}>
                            {op}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Enfoque / Contenidos</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                      {ENFOQUES.map(op => {
                        const puntos = prioridadB[op] || 0
                        const pct    = totalPuntosB > 0 ? Math.round((puntos / totalPuntosB) * 100) : 0
                        return (
                          <div key={op} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: puntos > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: puntos > 0 ? 500 : 400, minWidth: 170, flexShrink: 0 }}>{op}</span>
                            <div style={{ display: 'flex', gap: 3 }}>
                              {[0, 1, 2, 3, 4, 5].map(n => (
                                <button key={n} onClick={() => {
                                  const np = { ...(formData.enfoque_prioridad || {}), [op]: n }
                                  if (n === 0) delete np[op]
                                  setFormData(f => ({ ...f, enfoque_prioridad: np, enfoque: Object.entries(np).filter(([, v]) => v > 0).map(([k]) => k) }))
                                }} style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${puntos >= n && n > 0 ? 'var(--accent)' : 'var(--border)'}`, background: puntos >= n && n > 0 ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: puntos >= n && n > 0 ? 'var(--accent)' : 'var(--text3)' }}>
                                  {n === 0 ? '✕' : n}
                                </button>
                              ))}
                            </div>
                            {puntos > 0 && (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                                </div>
                                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600, minWidth: 30 }}>{pct}%</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {totalPuntosB > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                          {Object.entries(prioridadB).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / totalPuntosB) * 100)}%`).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )
            })()}
            {modalItem?.id && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={eliminarItem}>Eliminar bloque</button>
              </div>
            )}
          </div>
        )

      // ── SUB BLOQUE ────────────────────────────────────────────────────────
      case 'subbloque': {
        const prioridad   = formData.enfoque_prioridad || {}
        const totalPuntos = Object.values(prioridad).reduce((s, v) => s + v, 0)
        return (
          <div style={{ padding: '0 20px 4px' }}>
            {bloques.length > 1 && (
              <div className="form-group">
                <label className="form-label">Bloque</label>
                <select className="form-select" value={formData.bloque_id || ''} onChange={e => fd('bloque_id', e.target.value)}>
                  {bloques.map((b, i) => <option key={b.id} value={b.id}>B{i + 1} {b.nombre}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={formData.nombre || ''} onChange={e => fd('nombre', e.target.value)} placeholder="Ej: Adaptación" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Semana inicio *</label>
                <input className="form-input" type="number" min="1" value={formData.semana_inicio || 1} onChange={e => fd('semana_inicio', e.target.value)} />
                {(() => {
                  const b = bloques.find(x => x.id === formData.bloque_id)
                  if (!b || !formData.semana_inicio) return null
                  const f = calcFechaInicioSemana(b, parseInt(formData.semana_inicio))
                  return <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3, display: 'block' }}>{format(f, 'dd MMM yyyy', { locale: es })}</span>
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Semana fin *</label>
                <input className="form-input" type="number" min="1" value={formData.semana_fin || 1} onChange={e => fd('semana_fin', e.target.value)} />
                {(() => {
                  const b = bloques.find(x => x.id === formData.bloque_id)
                  if (!b || !formData.semana_fin) return null
                  const f = calcFechaFinSemana(b, parseInt(formData.semana_fin))
                  return <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 3, display: 'block' }}>{format(f, 'dd MMM yyyy', { locale: es })}</span>
                })()}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Objetivos / Contenidos</label>
              <textarea className="form-textarea" value={formData.notas || ''} onChange={e => fd('notas', e.target.value)} style={{ minHeight: 72 }} />
            </div>

            {perfil !== 'fuerza_salud' ? (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Km/sem mín</label>
                    <input className="form-input" type="number" min="0" value={formData.km_min || ''} onChange={e => fd('km_min', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Km/sem máx</label>
                    <input className="form-input" type="number" min="0" value={formData.km_max || ''} onChange={e => fd('km_max', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Distribución de zonas</label>
                  {[{ key: 'zona1_2', label: 'Z1-Z2', color: '#10b981' }, { key: 'zona3_4', label: 'Z3-Z4', color: '#f59e0b' }, { key: 'zona5', label: 'Z5+', color: '#ef4444' }].map(zona => (
                    <div key={zona.key} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: zona.color }}>{zona.label}</span>
                        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>{formData[zona.key] || 0}%</span>
                      </div>
                      <input type="range" min="0" max="100" value={formData[zona.key] || 0}
                        onChange={e => {
                          const val     = parseInt(e.target.value)
                          const otras   = ['zona1_2', 'zona3_4', 'zona5'].filter(k => k !== zona.key)
                          const totOtra = otras.reduce((s, k) => s + (formData[k] || 0), 0)
                          const resto   = 100 - val
                          if (resto < 0) return
                          const nuevas  = {}
                          if (totOtra === 0) otras.forEach(k => { nuevas[k] = Math.round(resto / otras.length) })
                          else otras.forEach(k => { nuevas[k] = Math.round((formData[k] / totOtra) * resto) })
                          setFormData(f => ({ ...f, [zona.key]: val, ...nuevas }))
                        }}
                        style={{ width: '100%', accentColor: zona.color }} />
                    </div>
                  ))}
                  {((formData.zona1_2 || 0) + (formData.zona3_4 || 0) + (formData.zona5 || 0)) > 0 && (
                    <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 4 }}>
                      {(formData.zona1_2 || 0) > 0 && <div style={{ width: `${formData.zona1_2}%`, background: '#10b981' }} />}
                      {(formData.zona3_4 || 0) > 0 && <div style={{ width: `${formData.zona3_4}%`, background: '#f59e0b' }} />}
                      {(formData.zona5   || 0) > 0 && <div style={{ width: `${formData.zona5}%`,   background: '#ef4444' }} />}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Sesiones/sem mín</label>
                    <input className="form-input" type="number" min="1" max="7" value={formData.sesiones_min || ''} onChange={e => fd('sesiones_min', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sesiones/sem máx</label>
                    <input className="form-input" type="number" min="1" max="7" value={formData.sesiones_max || ''} onChange={e => fd('sesiones_max', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Duración media (min)</label>
                  <input className="form-input" type="number" min="1" value={formData.duracion_media_min || ''} onChange={e => fd('duracion_media_min', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Exigencia</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[['Baja', '#10b981'], ['Moderada', '#f59e0b'], ['Alta', '#ef4444']].map(([op, col]) => {
                      const active = formData.exigencia === op
                      return (
                        <button key={op} onClick={() => fd('exigencia', active ? '' : op)}
                          style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${active ? col : 'var(--border)'}`, background: active ? col + '20' : 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? col : 'var(--text2)' }}>
                          {op}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Enfoque / Contenidos</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                    {ENFOQUES.map(op => {
                      const puntos = prioridad[op] || 0
                      const pct    = totalPuntos > 0 ? Math.round((puntos / totalPuntos) * 100) : 0
                      return (
                        <div key={op} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: puntos > 0 ? 'var(--text)' : 'var(--text3)', fontWeight: puntos > 0 ? 500 : 400, minWidth: 170, flexShrink: 0 }}>{op}</span>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {[0, 1, 2, 3, 4, 5].map(n => (
                              <button key={n} onClick={() => {
                                const np = { ...(formData.enfoque_prioridad || {}), [op]: n }
                                if (n === 0) delete np[op]
                                setFormData(f => ({ ...f, enfoque_prioridad: np, enfoque: Object.entries(np).filter(([, v]) => v > 0).map(([k]) => k) }))
                              }} style={{ width: 24, height: 24, borderRadius: 6, border: `1.5px solid ${puntos >= n && n > 0 ? 'var(--accent)' : 'var(--border)'}`, background: puntos >= n && n > 0 ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: puntos >= n && n > 0 ? 'var(--accent)' : 'var(--text3)' }}>
                                {n === 0 ? '✕' : n}
                              </button>
                            ))}
                          </div>
                          {puntos > 0 && (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
                              </div>
                              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600, minWidth: 30 }}>{pct}%</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {totalPuntos > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                        {Object.entries(prioridad).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / totalPuntos) * 100)}%`).join(' · ')}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {modalItem?.id && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={eliminarItem}>Eliminar sub bloque</button>
              </div>
            )}
          </div>
        )
      }

      // ── SEMANA ────────────────────────────────────────────────────────────
      case 'semana': {
        return (
          <div style={{ padding: '0 20px 4px' }}>
            <div className="form-group">
              <label className="form-label">Objetivo de la semana</label>
              <input className="form-input" value={formData.objetivo || ''} onChange={e => fd('objetivo', e.target.value)} placeholder="Ej: Aumentar volumen" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Carga</label>
              <select className="form-select" value={formData.carga || 'media'} onChange={e => fd('carga', e.target.value)}>
                {Object.entries(CARGAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Nota para el cliente</label>
              <textarea className="form-textarea" value={formData.nota_cliente || ''} onChange={e => fd('nota_cliente', e.target.value)} placeholder="Mensaje que verá el cliente en su vista semanal..." style={{ minHeight: 70 }} />
            </div>

            {!esSalud && perfil !== 'fuerza_salud' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Km objetivo</label>
                    <input className="form-input" type="number" min="0" value={formData.km_objetivo || ''} onChange={e => fd('km_objetivo', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Km real</label>
                    <input className="form-input" type="number" min="0" value={formData.km_real || ''} onChange={e => fd('km_real', e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Zonas reales (min)</label>
                  {[
                    { key: 'zona1_2_real', label: 'Z1-Z2', color: '#10b981' },
                    { key: 'zona3_4_real', label: 'Z3-Z4', color: '#f59e0b' },
                    { key: 'zona5_real',   label: 'Z5+',   color: '#ef4444' },
                  ].map(zona => {
                    const total = (parseInt(formData.zona1_2_real) || 0) + (parseInt(formData.zona3_4_real) || 0) + (parseInt(formData.zona5_real) || 0)
                    const pct   = total > 0 ? Math.round(((parseInt(formData[zona.key]) || 0) / total) * 100) : 0
                    return (
                      <div key={zona.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: zona.color }}>{zona.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {total > 0 && <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: zona.color }}>{pct}%</span>}
                            <input type="number" min="0" max="600" value={formData[zona.key] || 0} onChange={e => fd(zona.key, parseInt(e.target.value) || 0)} style={{ width: 60, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 13, textAlign: 'right' }} />
                            <span style={{ fontSize: 11, color: 'var(--text3)' }}>min</span>
                          </div>
                        </div>
                        {total > 0 && (
                          <div style={{ height: 5, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: zona.color, borderRadius: 3 }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Notas internas</label>
              <textarea className="form-textarea" value={formData.notas || ''} onChange={e => fd('notas', e.target.value)} placeholder="Solo visible para ti..." style={{ minHeight: 70 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Comentario post-semana</label>
              <textarea className="form-textarea" value={formData.comentario || ''} onChange={e => fd('comentario', e.target.value)} style={{ minHeight: 56 }} />
            </div>

          </div>
        )
      }

      // ── COMPETICIÓN ───────────────────────────────────────────────────────
      case 'comp':
        return (
          <div style={{ padding: '0 20px 4px' }}>
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={formData.nombre || ''} onChange={e => fd('nombre', e.target.value)} placeholder="Ej: Media Maratón Barcelona" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input className="form-input" type="date" value={formData.fecha || ''} onChange={e => fd('fecha', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <input className="form-input" value={formData.tipo || ''} onChange={e => fd('tipo', e.target.value)} placeholder="Ej: Carrera, Hyrox..." />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Objetivo</label>
              <input className="form-input" value={formData.objetivo || ''} onChange={e => fd('objetivo', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Notas</label>
              <textarea className="form-textarea" value={formData.notas || ''} onChange={e => fd('notas', e.target.value)} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 4px' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Visible para:</span>
              {[['entrenadora', '🔒 Solo yo'], ['cliente', '👁 Entrenadora + cliente']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => fd('visibilidad', v)}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${(formData.visibilidad || 'entrenadora') === v ? 'var(--accent)' : 'var(--border)'}`, background: (formData.visibilidad || 'entrenadora') === v ? 'var(--accent)' : 'transparent', color: (formData.visibilidad || 'entrenadora') === v ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: (formData.visibilidad || 'entrenadora') === v ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
            {modalItem?.id && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={eliminarItem}>Eliminar competición</button>
              </div>
            )}
          </div>
        )

      // ── EVALUACIÓN ───────────────────────────────────────────────────────
      case 'control':
        return (
          <div style={{ padding: '0 20px 4px' }}>
            <div className="form-group">
              <label className="form-label">Nombre de la evaluación *</label>
              <input className="form-input" value={formData.nombre || ''} onChange={e => fd('nombre', e.target.value)} placeholder="Ej: CMJ, Test 5 km..." autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Tipo de evaluación</label>
                <select className="form-select" value={formData.tipo || ''} onChange={e => fd('tipo', e.target.value)}>
                  <option value="">Sin categoría</option>
                  <option value="Fuerza">Fuerza</option>
                  <option value="Resistencia">Resistencia</option>
                  <option value="Movilidad">Movilidad</option>
                  <option value="Composición corporal">Composición corporal</option>
                  <option value="Recuperación">Recuperación</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input className="form-input" type="date" value={formData.fecha || ''} onChange={e => fd('fecha', e.target.value)} />
              </div>
            </div>

            {/* Resultados */}
            <div style={{ marginBottom: 6 }}>
              <label className="form-label" style={{ marginBottom: 8 }}>Resultados</label>
              {formResultados.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <input placeholder="Nombre del valor"
                    value={r.nombre} onChange={e => setFormResultados(prev => prev.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                    className="form-input" style={{ flex: 2 }} />
                  <input placeholder="Valor"
                    value={r.valor} onChange={e => setFormResultados(prev => prev.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))}
                    className="form-input" style={{ flex: 1.2 }} />
                  <input placeholder="Unidad"
                    value={r.unidad} onChange={e => setFormResultados(prev => prev.map((x, j) => j === i ? { ...x, unidad: e.target.value } : x))}
                    className="form-input" style={{ flex: 0.8 }} />
                  {formResultados.length > 1 && (
                    <button type="button" onClick={() => setFormResultados(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setFormResultados(prev => [...prev, { nombre: '', valor: '', unidad: '' }])}
                style={{ fontSize: 12.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                + Añadir otro resultado
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Observaciones</label>
              <textarea className="form-textarea" value={formData.notas || ''} onChange={e => fd('notas', e.target.value)} placeholder="Observaciones opcionales..." />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 4px' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Visible para:</span>
              {[['entrenadora', '🔒 Solo yo'], ['cliente', '👁 Entrenadora + cliente']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => fd('visibilidad', v)}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${(formData.visibilidad || 'entrenadora') === v ? 'var(--accent)' : 'var(--border)'}`, background: (formData.visibilidad || 'entrenadora') === v ? 'var(--accent)' : 'transparent', color: (formData.visibilidad || 'entrenadora') === v ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: (formData.visibilidad || 'entrenadora') === v ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
            {modalItem?.id && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={eliminarItem}>Eliminar evaluación</button>
              </div>
            )}
          </div>
        )

      // ── SESIÓN ────────────────────────────────────────────────────────────
      case 'sesion':
        return (
          <div style={{ padding: '0 20px 4px' }}>
            <div className="form-group">
              <label className="form-label">Tipo de sesión</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['optimizadora', 'coadyuvante'].map(tipo => (
                  <button key={tipo} type="button" onClick={() => fd('tipo_sesion_detalle', formData.tipo_sesion_detalle === tipo ? null : tipo)}
                    style={{ padding: '6px 14px', borderRadius: 'var(--radius)', border: formData.tipo_sesion_detalle === tipo ? '1.5px solid var(--accent)' : '1px solid var(--border)', background: formData.tipo_sesion_detalle === tipo ? 'var(--accent-light)' : 'transparent', color: formData.tipo_sesion_detalle === tipo ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontSize: 13, fontWeight: formData.tipo_sesion_detalle === tipo ? 500 : 400, textTransform: 'capitalize' }}>
                    {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de editor</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['fuerza','💪','Fuerza / salud'],['carrera','🏃','Carrera / resistencia']].map(([val, ico, label]) => {
                  const active = (formData.tipo_editor || 'fuerza') === val
                  return (
                    <button key={val} type="button" onClick={() => fd('tipo_editor', val)}
                      style={{ flex: 1, padding: '8px', borderRadius: 9, border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>{ico}</span> {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Icono de sesión</label>
              <EmojiPicker value={formData.icono || ''} onChange={v => fd('icono', v)} />
            </div>
            <div className="form-group">
              <label className="form-label">Título *</label>
              <input className="form-input" value={formData.titulo || ''} onChange={e => fd('titulo', e.target.value)} placeholder="Ej: Sesión 5 - Fuerza general" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input className="form-input" type="date" value={formData.fecha || ''} disabled={!!formData.sinFecha} style={{ flex: 1, opacity: formData.sinFecha ? 0.4 : 1 }} onChange={e => fd('fecha', e.target.value)} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!formData.sinFecha} onChange={e => {
                    const checked = e.target.checked
                    setFormData(f => ({ ...f, sinFecha: checked, fecha: checked ? '' : f.fecha, tipo_sesion: checked ? (f.tipo_sesion === 'programada' ? 'flexible' : f.tipo_sesion) : (f.tipo_sesion === 'flexible' ? 'programada' : f.tipo_sesion) }))
                  }} />
                  Sin fecha asignada
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(formData.sinFecha
                  ? [['flexible', '🔄 Flexible'], ['opcional', '⭐ Opcional']]
                  : [['programada', '📅 Programada'], ['opcional', '⭐ Opcional']]
                ).map(([val, label]) => {
                  const active = (formData.tipo_sesion || 'programada') === val
                  return (
                    <button key={val} type="button" onClick={() => fd('tipo_sesion', val)}
                      style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text2)' }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">📋 Observaciones para el cliente</label>
              <textarea className="form-textarea" value={formData.objetivo || ''} onChange={e => fd('objetivo', e.target.value)} rows={2} placeholder="Descripción o notas que verá el cliente..." />
            </div>
            <div className="form-group">
              <label className="form-label">🔒 Notas de entrenadora <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>(solo tú)</span></label>
              <textarea className="form-textarea" value={formData.notas_entrenador || ''} onChange={e => fd('notas_entrenador', e.target.value)} rows={2} placeholder="Notas internas, contexto, recordatorios..." />
            </div>
            <div className="form-group">
              <label className="form-label">Modalidad</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ val: 'presencial', label: '🏋️ Presencial' }, { val: 'online', label: '💻 Online' }, { val: 'autonoma', label: '🏃 Autónoma' }].map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => setFormData(f => ({ ...f, modalidad: val, lugar: val !== 'presencial' ? '' : f.lugar }))}
                    style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer', background: (formData.modalidad || 'autonoma') === val ? 'var(--accent)' : 'transparent', color: (formData.modalidad || 'autonoma') === val ? '#fff' : 'var(--text2)', borderColor: (formData.modalidad || 'autonoma') === val ? 'var(--accent)' : 'var(--border)' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(formData.modalidad || 'autonoma') === 'presencial' && (
              <div className="form-group">
                <label className="form-label">Lugar</label>
                <input className="form-input" type="text" value={formData.lugar || ''} onChange={e => fd('lugar', e.target.value)} placeholder="Ej: Gym Norte, Centro Deportivo..." />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Duración (min)</label>
              <input className="form-input" type="number" min="1" value={formData.duracion_min || ''} onChange={e => fd('duracion_min', e.target.value)} style={{ maxWidth: 120 }} placeholder="Ej: 45" />
            </div>
            <div className="form-group" style={{ marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div onClick={() => fd('con_feedback', formData.con_feedback === false ? true : false)}
                  style={{ width: 36, height: 20, borderRadius: 10, background: formData.con_feedback !== false ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                  <div style={{ position: 'absolute', top: 2, left: formData.con_feedback !== false ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Feedback post-sesión</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formData.con_feedback !== false ? 'El cliente verá el cuestionario al terminar' : 'Sin cuestionario (sesión de activación, movilidad...)'}</div>
                </div>
              </label>
            </div>
            <div style={{ margin: '8px 0 4px', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${formData.publicada !== false ? 'var(--border)' : '#94a3b8'}`, background: formData.publicada !== false ? 'var(--bg2)' : '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => fd('publicada', formData.publicada === false ? true : false)}>
              <div style={{ width: 38, height: 22, borderRadius: 11, background: formData.publicada !== false ? 'var(--accent)' : '#94a3b8', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: formData.publicada !== false ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: formData.publicada !== false ? 'var(--text)' : '#64748b' }}>{formData.publicada !== false ? '👁 Visible para el cliente' : '🔒 Oculta al cliente (borrador)'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formData.publicada !== false ? 'El cliente puede ver esta sesión' : 'Solo tú la ves, el cliente no'}</div>
              </div>
            </div>
            <div style={{ margin: '4px 0 8px', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${formData.lista ? '#16a34a' : 'var(--border)'}`, background: formData.lista ? '#f0fdf4' : 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => fd('lista', !formData.lista)}>
              <div style={{ width: 38, height: 22, borderRadius: 11, background: formData.lista ? '#16a34a' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: formData.lista ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: formData.lista ? '#16a34a' : 'var(--text)' }}>{formData.lista ? '✅ Sesión lista para el cliente' : '📝 Sesión en preparación'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formData.lista ? 'Contenido completo, el cliente puede ejecutarla' : 'Pensada pero pendiente de desarrollar'}</div>
              </div>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{(formData.tipo_editor || 'fuerza') === 'carrera' ? 'Se crearán 3 fases de ejemplo (calentamiento, trabajo, vuelta a la calma).' : 'Se crearán 4 bloques con 3 ejercicios de ejemplo, listos para editar.'}</p>
          </div>
        )

      // ── NOTA ──────────────────────────────────────────────────────────────
      case 'nota':
        return (
          <div style={{ padding: '0 20px 4px' }}>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input className="form-input" type="date" value={formData.fecha || ''} onChange={e => fd('fecha', e.target.value)} style={{ maxWidth: 180 }} />
            </div>
            <div className="form-group">
              <label className="form-label">Nota *</label>
              <textarea className="form-textarea" value={formData.texto || ''} onChange={e => fd('texto', e.target.value)} style={{ minHeight: 100 }} autoFocus />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 4px' }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Visible para:</span>
              {[['entrenadora', '🔒 Solo yo'], ['cliente', '👁 Entrenadora + cliente']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => fd('visibilidad', v)}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${(formData.visibilidad || 'entrenadora') === v ? 'var(--accent)' : 'var(--border)'}`, background: (formData.visibilidad || 'entrenadora') === v ? 'var(--accent)' : 'transparent', color: (formData.visibilidad || 'entrenadora') === v ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: (formData.visibilidad || 'entrenadora') === v ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>
            {modalItem?.id && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <button className="btn btn-ghost" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={eliminarItem}>Eliminar nota</button>
              </div>
            )}
          </div>
        )

      // ── VER DETALLE BLOQUE ────────────────────────────────────────────────
      case 'ver_bloque': {
        const b = modalItem
        if (!b) return null
        const subs = (subbloques[b.id] || []).slice().sort((a, x) => a.semana_inicio - x.semana_inicio)
        const TextoLista = ({ texto }) => {
          if (!texto) return null
          const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)
          if (lineas.length <= 1) return <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{texto}</span>
          return (
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lineas.map((l, i) => <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{l}</li>)}
            </ul>
          )
        }
        const fIni = format(parseISO(b.fecha_inicio), "d MMM yyyy", { locale: es })
        const fFin = format(addWeeks(parseISO(b.fecha_inicio), b.semanas), "d MMM yyyy", { locale: es })
        const COLOR = b.color || '#2d6a4f'

        const Campo = ({ label, valor }) => valor ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>{label}</span>
            <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{valor}</span>
          </div>
        ) : null

        return (
          <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* ── BLOQUE ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: COLOR + '15', borderRadius: 10, marginBottom: 16 }}>
              <div style={{ width: 4, height: 40, borderRadius: 2, background: COLOR, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{b.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fIni} – {fFin} · {b.semanas} semanas</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {b.objetivo && (
                <div style={{ paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 6 }}>Objetivo</div>
                  <TextoLista texto={b.objetivo} />
                </div>
              )}
              {esSalud && <>
                <Campo label="Frecuencia semanal" valor={(b.sesiones_min || b.sesiones_max) ? `${b.sesiones_min ?? '?'}–${b.sesiones_max ?? '?'} sesiones/sem` : null} />
                <Campo label="Duración media" valor={b.duracion_media_min ? `${b.duracion_media_min} min` : null} />
                <Campo label="Exigencia" valor={b.exigencia} />
                {b.enfoque_prioridad && Object.keys(b.enfoque_prioridad).length > 0 && (() => {
                  const total = Object.values(b.enfoque_prioridad).reduce((s, v) => s + v, 0)
                  return (
                    <div style={{ paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 8 }}>Enfoque / contenidos</div>
                      {Object.entries(b.enfoque_prioridad).filter(([, v]) => v > 0).sort((a, x) => x[1] - a[1]).map(([k, v]) => {
                        const pct = Math.round(v / total * 100)
                        return (
                          <div key={k} style={{ marginBottom: 7 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, color: 'var(--text)' }}>{k}</span>
                              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: COLOR, fontWeight: 600 }}>{pct}%</span>
                            </div>
                            <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: COLOR, borderRadius: 2 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </>}
            </div>

            {/* ── SUB-BLOQUES ── */}
            {!esSalud && subs.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Sub-bloques ({subs.length})</span>
                  <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {subs.map((sub, si) => {
                    const fIS = format(calcFechaInicioSemana(b, sub.semana_inicio), 'd MMM', { locale: es })
                    const fFS = format(calcFechaFinSemana(b, sub.semana_fin), 'd MMM yyyy', { locale: es })
                    const totalPrior = Object.values(sub.enfoque_prioridad || {}).reduce((s, v) => s + v, 0)
                    return (
                      <div key={sub.id} style={{ border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                        {/* Cabecera sub-bloque */}
                        <div style={{ padding: '8px 12px', background: COLOR + '10', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 3, height: 28, borderRadius: 2, background: COLOR + 'aa', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{si + 1} · {sub.nombre}</div>
                            <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fIS} – {fFS}</div>
                          </div>
                        </div>
                        {/* Contenido sub-bloque */}
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {sub.notas && (
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 6 }}>Objetivo / contenidos</div>
                              <TextoLista texto={sub.notas} />
                            </div>
                          )}
                          {esResistencia && (sub.km_min || sub.km_max) && (
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 3 }}>Volumen</div>
                              <div style={{ fontSize: 12, color: 'var(--text)' }}>{sub.km_min ?? '?'}–{sub.km_max ?? '?'} km/sem</div>
                            </div>
                          )}
                          {esResistencia && (sub.zona1_2 > 0 || sub.zona3_4 > 0 || sub.zona5 > 0) && (
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 6 }}>Zonas</div>
                              <div style={{ display: 'flex', gap: 10 }}>
                                {[{ l: 'Z1-Z2', v: sub.zona1_2, c: '#10b981' }, { l: 'Z3-Z4', v: sub.zona3_4, c: '#f59e0b' }, { l: 'Z5+', v: sub.zona5, c: '#ef4444' }].map(z => (
                                  <div key={z.l} style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: z.c }}>{z.l}</span>
                                      <span style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{z.v || 0}%</span>
                                    </div>
                                    <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                                      <div style={{ height: '100%', width: `${z.v || 0}%`, background: z.c, borderRadius: 2 }} />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {!esResistencia && (sub.sesiones_min || sub.sesiones_max || sub.duracion_media_min || sub.exigencia) && (
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              {(sub.sesiones_min || sub.sesiones_max) && (
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 2 }}>Sesiones</div>
                                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{sub.sesiones_min}–{sub.sesiones_max}/sem</div>
                                </div>
                              )}
                              {sub.duracion_media_min && (
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 2 }}>Duración</div>
                                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{sub.duracion_media_min} min</div>
                                </div>
                              )}
                              {sub.exigencia && (
                                <div>
                                  <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 2 }}>Exigencia</div>
                                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{sub.exigencia}</div>
                                </div>
                              )}
                            </div>
                          )}
                          {!esResistencia && totalPrior > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {Object.entries(sub.enfoque_prioridad).filter(([, v]) => v > 0).sort((a, x) => x[1] - a[1]).map(([k, v]) => {
                                const pct = Math.round(v / totalPrior * 100)
                                return <span key={k} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: COLOR + '20', color: COLOR, fontWeight: 500 }}>{k} {pct}%</span>
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
            {!esSalud && subs.length === 0 && <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>Sin sub-bloques añadidos.</div>}
          </div>
        )
      }

      // ── VER DETALLE SUB-BLOQUE ────────────────────────────────────────────
      case 'ver_subbloque': {
        const sub = modalItem
        if (!sub) return null
        const b = bloques.find(x => x.id === sub.bloque_id)
        const COLOR = b?.color || '#2d6a4f'
        const fIS = b ? format(calcFechaInicioSemana(b, sub.semana_inicio), "d MMM yyyy", { locale: es }) : ''
        const fFS = b ? format(calcFechaFinSemana(b, sub.semana_fin), "d MMM yyyy", { locale: es }) : ''
        const totalPrior = Object.values(sub.enfoque_prioridad || {}).reduce((s, v) => s + v, 0)
        const TextoListaSub = ({ texto }) => {
          if (!texto) return null
          const lineas = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0)
          if (lineas.length <= 1) return <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{texto}</span>
          return (
            <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {lineas.map((l, i) => <li key={i} style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{l}</li>)}
            </ul>
          )
        }

        const F = ({ label, children }) => (
          <div style={{ paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{children}</div>
          </div>
        )
        return (
          <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Cabecera */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: COLOR + '15', borderRadius: 10 }}>
              <div style={{ width: 3, height: 36, borderRadius: 2, background: COLOR, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 2 }}>{sub.nombre}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fIS} – {fFS}</div>
              </div>
            </div>

            {/* Objetivo / contenidos */}
            {sub.notas && (
              <div style={{ paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 6 }}>Objetivo / contenidos</div>
                <TextoListaSub texto={sub.notas} />
              </div>
            )}

            {/* Resistencia: volumen */}
            {esResistencia && (sub.km_min || sub.km_max) && (
              <F label="Volumen objetivo">{sub.km_min ?? '?'}–{sub.km_max ?? '?'} km/sem</F>
            )}

            {/* Resistencia: zonas */}
            {esResistencia && (sub.zona1_2 > 0 || sub.zona3_4 > 0 || sub.zona5 > 0) && (
              <div style={{ paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 10 }}>Distribución de zonas</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[{ key: 'zona1_2', label: 'Z1-Z2', color: '#10b981' }, { key: 'zona3_4', label: 'Z3-Z4', color: '#f59e0b' }, { key: 'zona5', label: 'Z5+', color: '#ef4444' }].map(z => (
                    <div key={z.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: z.color }}>{z.label}</span>
                        <span style={{ fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 600 }}>{sub[z.key] || 0}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${sub[z.key] || 0}%`, background: z.color, borderRadius: 3 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fuerza/salud */}
            {!esResistencia && (sub.sesiones_min || sub.sesiones_max) && (
              <F label="Frecuencia semanal">{sub.sesiones_min ?? '?'}–{sub.sesiones_max ?? '?'} sesiones/sem</F>
            )}
            {!esResistencia && sub.duracion_media_min && (
              <F label="Duración media">{sub.duracion_media_min} min</F>
            )}
            {!esResistencia && sub.exigencia && (
              <F label="Exigencia">{sub.exigencia}</F>
            )}
            {!esResistencia && totalPrior > 0 && (
              <div style={{ paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 10 }}>Enfoque / contenidos</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(sub.enfoque_prioridad).filter(([, v]) => v > 0).sort((a, x) => x[1] - a[1]).map(([k, v]) => {
                    const pct = Math.round(v / totalPrior * 100)
                    return (
                      <div key={k}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 12, color: 'var(--text)' }}>{k}</span>
                          <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: COLOR, fontWeight: 600 }}>{pct}%</span>
                        </div>
                        <div style={{ height: 4, background: 'var(--bg2)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: COLOR, borderRadius: 2 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      }

      default: return null
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CÁLCULOS DERIVADOS
  // ─────────────────────────────────────────────────────────────────────────

  const totalSemanas = calcTotalSemanas(bloques)

  const todasLasSemanas = bloques.flatMap((b, bidx) =>
    Array.from({ length: b.semanas }, (_, i) => {
      const numLocal  = i + 1
      const numGlobal = calcOffsetSemanaGlobal(bloques, b.id, numLocal)
      const fi        = calcFechaInicioSemana(b, numLocal)
      const ff        = calcFechaFinSemana(b, numLocal)
      const hoy       = new Date()
      const esActual  = hoy >= fi && hoy < ff
      const fiStr     = format(fi, 'yyyy-MM-dd')
      const semData   = (semanas[b.id] || []).find(s => s.fecha_inicio_semana === fiStr) || null
      return { bloque: b, bidx, numLocal, numGlobal, fi, ff, esActual, semData }
    })
  )

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // Dropdown de variable con position:fixed — se renderiza fuera de Zona C para no quedar cortado
  return (
    <div>
      {/* ── CABECERA ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Planificación</h2>
          {planificacion && <p className="page-subtitle">{planificacion.nombre}</p>}
        </div>
        <div className="flex gap-2" style={{ position: 'relative' }}>
          {planificacion && <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>🖨️ Imprimir</button>}
          {clienteData?.token_cliente && (
            <button className="btn btn-ghost btn-sm" title="Configurar y compartir portal" onClick={() => setPortalModal(true)}>🔗 Portal</button>
          )}
          {planificacion && <button className="btn btn-ghost" onClick={() => openModal('plan_editar')}>Editar</button>}
          {planificacion && (
            <button className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={async () => {
              if (!window.confirm(`¿Eliminar la planificación "${planificacion.nombre}"?`)) return
              await supabase.from('planificaciones').delete().eq('id', planificacion.id)
              setPlanificacion(null); setBloques([]); setSemanas({}); setSubbloques({}); setCompeticiones([]); setSesiones([])
              cargarPlanificacion()
            }}><X size={13} /> Eliminar</button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary" onClick={() => setMenuAnadir(v => !v)}>
              <Plus size={13} /> Añadir
            </button>
            {menuAnadir && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--surface, var(--bg))', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 200, minWidth: 200, overflow: 'hidden' }}
                onMouseLeave={() => setMenuAnadir(false)}>
                <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, padding: '10px 16px', fontSize: 13 }}
                  onClick={() => { setMenuAnadir(false); openModal('plan_nuevo') }}>
                  + Nueva planificación
                </button>
                {planificacion && (<>
                  {[
                    ['bloque',   '+ Bloque'],
                    ['sesion',   '+ Sesión'],
                    ['pack',     '📦 Pack flexible'],
                    ['comp',     '🏆 Competición'],
                    ['control',  '🔬 Evaluación'],
                    ['nota',     '📝 Nota'],
                  ].map(([tipo, label]) => (
                    <button key={tipo} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, padding: '10px 16px', fontSize: 13 }}
                      onClick={() => { setMenuAnadir(false); openModal(tipo) }}>
                      {label}
                    </button>
                  ))}
                  {bloques.length > 0 && (
                    <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, padding: '10px 16px', fontSize: 13 }}
                      onClick={() => { setMenuAnadir(false); openModal('subbloque', { bloque_id: bloques[0]?.id }) }}>
                      + Sub bloque
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, padding: '10px 16px', fontSize: 13 }}
                    onClick={() => { setMenuAnadir(false); setFormCopiar({ cliente_id: '', fecha_inicio: planificacion.fecha_inicio, nombre: planificacion.nombre + ' (copia)' }); setModalCopiar(true) }}>
                    📋 Copiar planificación
                  </button>
                </>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SELECTOR CLIENTE + PLAN + VISTAS ── */}
      <div className="flex gap-3 items-center" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="form-select" style={{ maxWidth: 260 }} value={clienteSeleccionado || ''}
          onChange={e => { setClienteSeleccionado(e.target.value || null); setPlanificacion(null); setBloques([]) }}>
          <option value="">Selecciona un cliente...</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {planificaciones.length > 1 && (
          <select className="form-select" style={{ maxWidth: 260 }} value={planificacion?.id || ''}
            onChange={e => { const p = planificaciones.find(x => x.id === e.target.value); setPlanificacion(p || null); setBloques([]); setSemanas({}); setSubbloques({}) }}>
            {planificaciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        )}
        {planificacion && (
          <div className="flex gap-2">
            {[['timeline','Timeline'],['lista','Lista'],['calendario','Calendario'],['seguimiento','Seguimiento']].map(([v, label]) => (
              <button key={v} className="btn btn-ghost btn-sm"
                style={vista === v ? { background: 'var(--bg2)', fontWeight: 600 } : {}}
                onClick={() => cambiarVista(v)}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="empty"><p>Cargando...</p></div>}

      {!loading && clienteSeleccionado && !planificacion && (
        <div className="empty">
          <Calendar size={40} />
          <p>No hay planificación para este cliente.</p>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => openModal('plan_nuevo')}>
            <Plus size={13} /> Crear planificación
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  CONTENIDO PRINCIPAL                                              */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {!loading && planificacion && (
        <>
          {vista === 'calendario' && (
            <div>
              {sesiones.filter(s => !s.fecha && !s.pack_id).length > 0 && (
                <div style={{ marginBottom: 20, padding: 16, background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 10 }}>Sesiones sin fecha asignada</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {sesiones.filter(s => !s.fecha && !s.pack_id).map(s => (
                      <div key={s.id}
                        draggable
                        onDragStart={() => setArrastrando({ ...s, _tipo: 'sesion' })}
                        onDragEnd={() => setArrastrando(null)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: clipboardSesion?.id === s.id ? 'var(--accent)' : 'var(--accent-light)', color: clipboardSesion?.id === s.id ? '#fff' : 'var(--accent)', fontWeight: 500, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}>{iconoSesion(s)} {s.titulo}</span>
                        <span title="Copiar" onClick={e => { e.stopPropagation(); setClipboardSesion({ ...s, _tipo: 'sesion' }) }} style={{ opacity: 0.6, cursor: 'pointer', fontSize: 10 }}>📋</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {packs.length > 0 && (
                <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {packs.map(pack => {
                    const packSesiones = sesiones.filter(s => s.pack_id === pack.id)
                    const abierto = packsAbiertos.has(pack.id)
                    const esDrop = dropPackId === pack.id
                    return (
                      <div key={pack.id}
                        onDragOver={e => { e.preventDefault(); if (arrastrando?._tipo === 'sesion') setDropPackId(pack.id) }}
                        onDragLeave={() => setDropPackId(null)}
                        onDrop={e => { e.preventDefault(); setDropPackId(null); if (arrastrando?._tipo === 'sesion') { moverAPack(arrastrando, pack.id); setArrastrando(null) } }}
                        style={{ borderRadius: 10, border: esDrop ? '2px dashed #0369a1' : '1px solid #bae6fd', background: esDrop ? '#e0f2fe' : '#f0f9ff', transition: 'border 0.15s, background 0.15s' }}>
                        <div
                          onClick={() => setPacksAbiertos(prev => { const s = new Set(prev); s.has(pack.id) ? s.delete(pack.id) : s.add(pack.id); return s })}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}>
                          <span style={{ fontSize: 13, transition: 'transform 0.15s', display: 'inline-block', transform: abierto ? 'rotate(90deg)' : 'rotate(0deg)', color: '#0369a1' }}>▶</span>
                          <span style={{ fontSize: 14 }}>📦</span>
                          <span style={{ fontWeight: 600, fontSize: 13, color: '#0369a1' }}>{pack.nombre}</span>
                          <span style={{ fontSize: 11, color: '#0369a1', opacity: 0.7 }}>{pack.fecha_inicio} – {pack.fecha_fin}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#0369a1', opacity: 0.6 }}>{packSesiones.length} sesión{packSesiones.length !== 1 ? 'es' : ''}</span>
                          <button onClick={e => { e.stopPropagation(); copiarEnlacePack(pack) }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #0369a1', background: '#0369a1', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>🔗 Compartir</button>
                          <button onClick={e => { e.stopPropagation(); setModalCopiarPack(pack); setCopiarPackForm({ cliente_id: '', fecha_inicio: pack.fecha_inicio, fecha_fin: pack.fecha_fin }) }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #94a3b8', background: 'transparent', color: '#475569', cursor: 'pointer' }}>📋 Copiar</button>
                          <button onClick={e => { e.stopPropagation(); setFormPack({ nombre: pack.nombre, fecha_inicio: pack.fecha_inicio, fecha_fin: pack.fecha_fin, descripcion: pack.descripcion || '' }); setModalPack(pack) }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #94a3b8', background: 'transparent', color: '#475569', cursor: 'pointer' }}>✏️ Editar</button>
                          <button onClick={e => { e.stopPropagation(); eliminarPack(pack) }} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, border: '1px solid #fca5a5', background: 'transparent', color: '#dc2626', cursor: 'pointer' }}>🗑️ Eliminar</button>
                          {esDrop && <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>Suelta aquí</span>}
                        </div>
                        {abierto && (
                          <div style={{ padding: '0 14px 12px', borderTop: '1px solid #bae6fd' }}>
                            {packSesiones.length === 0 ? (
                              <div style={{ fontSize: 12, color: '#0369a1', opacity: 0.6, paddingTop: 10, textAlign: 'center' }}>
                                Arrastra sesiones del calendario aquí
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 10 }}>
                                {packSesiones.map(s => (
                                  <div key={s.id}
                                    draggable
                                    onDragStart={() => setArrastrando({ ...s, _tipo: 'sesion' })}
                                    onDragEnd={() => setArrastrando(null)}
                                    style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: clipboardSesion?.id === s.id ? '#0369a1' : '#e0f2fe', color: clipboardSesion?.id === s.id ? '#fff' : '#0369a1', fontWeight: 500, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}>{iconoSesion(s)} {s.titulo}</span>
                                    <span title="Copiar" onClick={e => { e.stopPropagation(); setClipboardSesion({ ...s, _tipo: 'sesion' }) }} style={{ opacity: 0.7, cursor: 'pointer', fontSize: 10 }}>📋</span>
                                    <span onClick={e => { e.stopPropagation(); eliminarItem('sesion', s.id) }} style={{ opacity: 0.5, cursor: 'pointer' }}>×</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              <CalendarioSesiones
                semanasAll={semanasAll}
                semanasMap={semanasPorFecha}
                semanaSeleccionada={semanaSeleccionada}
                onSemanaClick={info => setSemanaSeleccionada(info ? { semanaCliente: info.semanaCliente, bloqueId: info.bloque?.id, semanaNum: info.semanaNum } : null)}
                sesiones={sesionesCalendario}
                feedbacksMap={feedbacksObj}
                competiciones={competiciones}
                controles={controles}
                notas={notas}
                packs={packs}
                bloquesPlan={bloques}
                subbloquesPlan={subbloques}
                onAbrirSesion={s => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                onNuevaSesion={fecha => openModal('sesion', { fecha })}
                onNuevaCompeticion={fecha => openModal('comp', { fecha })}
                onNuevaValoracion={fecha => openModal('control', { fecha })}
                onNuevaNota={fecha => openModal('nota', { fecha })}
                onAbrirNota={item => openModal('nota', item)}
                onEliminar={item => eliminarItem(item._tipo === 'sesion' ? 'sesion' : item._tipo === 'competicion' ? 'comp' : item._tipo === 'control' ? 'control' : 'nota', item.id)}
                arrastrando={arrastrando}
                setArrastrando={setArrastrando}
                modoDrag={modoDrag}
                setModoDrag={setModoDrag}
                onMoverSesion={moverItemsCalendario}
                clipboard={clipboardSesion}
                onCopiar={setClipboardSesion}
                onPegar={pegarItemCalendario}
              />
            </div>
          )}
          {vista === 'seguimiento' && (
            <Seguimiento clienteId={clienteSeleccionado} planificacionId={planificacion?.id} bloques={bloques} semanas={semanas} subbloques={subbloques} clienteData={clienteData} />
          )}
          {vista === 'lista' && (
            <VistaLista bloques={bloques} subbloques={subbloques} semanas={semanas} sesiones={sesiones} clienteData={clienteData} esSalud={esSalud} openModal={openModal} setVista={setVista} eliminarItem={eliminarItem} cargarPlanificacion={cargarPlanificacion} planificacion={planificacion} clienteSeleccionado={clienteSeleccionado} setSesionesContext={setSesionesContext} setPage={setPage} />
          )}

          {/* ══ TIMELINE ══════════════════════════════════════════════════ */}
          {vista === 'timeline' && totalSemanas > 0 && (() => {
            if (!planificacion?.fecha_inicio || !planificacion?.fecha_fin) return null
            const planIni   = parseISO(planificacion.fecha_inicio)
            const planFin   = parseISO(planificacion.fecha_fin)
            if (isNaN(planIni) || isNaN(planFin) || planFin < planIni) return null
            const totalDias = Math.max(differenceInDays(planFin, planIni) + 1, 1)
            const hoy       = startOfDay(new Date())

            // Columns
            const COL_W = tlAgrup === 'dia' ? 52 : tlAgrup === 'semana' ? 80 : 120
            let columnas = []
            if (tlAgrup === 'dia') {
              columnas = eachDayOfInterval({ start: planIni, end: planFin }).map(d => ({ key: d.toISOString(), fecha: d }))
            } else if (tlAgrup === 'semana') {
              columnas = eachWeekOfInterval({ start: planIni, end: planFin }, { weekStartsOn: 1 }).map(d => {
                const fin = endOfWeek(d, { weekStartsOn: 1 })
                return { key: d.toISOString(), fecha: d, fechaFin: fin }
              })
            } else {
              columnas = eachMonthOfInterval({ start: planIni, end: planFin }).map(d => {
                return { key: d.toISOString(), fecha: d, fechaFin: endOfMonth(d) }
              })
            }
            const totalCols = columnas.length
            const totalW    = totalCols * COL_W

            // Pill config
            const PILLS = [
              { key: 'cal', label: '🗓 Calendarización', color: '#3b82f6', bg: '#eff6ff' },
              { key: 'per', label: '📊 Periodización',   color: '#ef4444', bg: '#fff5f5' },
              { key: 'pla', label: '📈 Planificación',   color: '#f59e0b', bg: '#fffbeb' },
              { key: 'pro', label: '🏋️ Programación',    color: '#10b981', bg: '#f0fdf4' },
              { key: 'com', label: '💬 Comentarios',     color: '#64748b', bg: '#f8fafc' },
            ]

            // Helper: etiqueta izquierda fija
            const LabelCol = ({ lines, color = 'var(--text3)', height }) => (
              <div style={{ width: 110, minWidth: 110, flexShrink: 0, position: 'sticky', left: 0, zIndex: 20, background: 'var(--bg)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: height, alignSelf: 'stretch', gap: 4, padding: '4px 8px' }}>
                {lines.map((l, i) => (
                  <span key={i} style={{ fontSize: 10, color: l.color || color, fontWeight: 600, textAlign: 'center', letterSpacing: '0.03em' }}>{l.text}</span>
                ))}
              </div>
            )

            // Helper: % position in the timeline
            const pctLeft  = dias => Math.max(0, Math.min(dias / totalDias * 100, 100))
            const pctWidth = dias => Math.max(0, Math.min(dias / totalDias * 100, 100))

            // Is today in the column?
            const colEsHoy = col => {
              if (tlAgrup === 'dia')    return isSameDay(col.fecha, hoy)
              if (tlAgrup === 'semana') return hoy >= col.fecha && hoy <= col.fechaFin
              return isSameMonth(col.fecha, hoy)
            }

            const sesionesSinFecha = sesiones.filter(s => !s.fecha)
            const COLOR_TIPO = { programada: 'var(--accent)', flexible: '#8b5cf6', opcional: '#94a3b8' }

            return (
            <div>
              {/* ── Barra superior ── */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {/* Pills toggleables */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PILLS.map(p => {
                    const on = tlRows[p.key]
                    return (
                      <button key={p.key}
                        onClick={() => setTlRows(r => ({ ...r, [p.key]: !r[p.key] }))}
                        style={{ padding: '5px 13px', borderRadius: 20, border: `1.5px solid ${on ? p.color : 'var(--border)'}`, background: on ? p.bg : 'var(--bg)', color: on ? p.color : 'var(--text3)', fontSize: 12, fontWeight: on ? 600 : 400, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
                        {p.label}
                      </button>
                    )
                  })}
                </div>
                {/* Selector agrupación */}
                <div style={{ display: 'flex', gap: 2, background: 'var(--bg2)', borderRadius: 8, padding: 3 }}>
                  {[['dia','Día'],['semana','Semana'],['mes','Mes']].map(([v, l]) => (
                    <button key={v} onClick={() => setTlAgrup(v)}
                      style={{ padding: '4px 14px', borderRadius: 6, border: 'none', background: tlAgrup === v ? 'var(--bg)' : 'transparent', color: tlAgrup === v ? 'var(--text)' : 'var(--text3)', fontSize: 12, fontWeight: tlAgrup === v ? 600 : 400, cursor: 'pointer', boxShadow: tlAgrup === v ? '0 1px 4px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.15s' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Sesiones sin fecha ── */}
              {sesionesSinFecha.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', flexShrink: 0, fontWeight: 600 }}>Sin fecha:</span>
                  {sesionesSinFecha.map(s => (
                    <div key={s.id} title={s.titulo}
                      onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                      style={{ flexShrink: 0, background: 'var(--bg)', border: `1.5px dashed ${COLOR_TIPO[s.tipo_sesion] || 'var(--accent)'}`, borderRadius: 6, padding: '3px 8px', fontSize: 10, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {iconoSesion(s)} {s.titulo}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Grid de timeline ── */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gridTemplateRows: '56px 1fr', height: 'calc(100vh - 320px)', overflow: 'hidden' }}>

                  {/* ── ZONA A — esquina superior izquierda ── */}
                  <div style={{ gridColumn: 1, gridRow: 1, background: 'var(--bg)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', zIndex: 30 }} />

                  {/* ── ZONA B — cabecera de fechas (scroll horizontal sincronizado) ── */}
                  <div ref={tlZonaBRef} style={{ gridColumn: 2, gridRow: 1, overflowX: 'hidden', overflowY: 'hidden', background: 'var(--bg)', borderBottom: '1px solid var(--border)', zIndex: 20 }}>
                    <div style={{ display: 'flex', height: 56, minWidth: totalW }}>
                      {columnas.map((col, ci) => {
                        const esHoy    = colEsHoy(col)
                        const compsCol = competiciones.filter(c => {
                          const f = parseISO(c.fecha)
                          if (tlAgrup === 'dia')    return isSameDay(f, col.fecha)
                          if (tlAgrup === 'semana') return f >= col.fecha && f <= col.fechaFin
                          return isSameMonth(f, col.fecha)
                        })
                        const ctrlsCol = controles.filter(c => {
                          const f = parseISO(c.fecha)
                          if (tlAgrup === 'dia')    return isSameDay(f, col.fecha)
                          if (tlAgrup === 'semana') return f >= col.fecha && f <= col.fechaFin
                          return isSameMonth(f, col.fecha)
                        })
                        return (
                          <div key={col.key} ref={esHoy ? tlTodayRef : null}
                            style={{ width: COL_W, minWidth: COL_W, flexShrink: 0, borderRight: '1px solid var(--border)', background: esHoy ? 'rgba(59,130,246,0.06)' : 'transparent', padding: '5px 4px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, boxSizing: 'border-box' }}>
                            {tlAgrup === 'dia' && <>
                              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>{format(col.fecha, 'EEEEEE', { locale: es })}</span>
                              <span style={{ fontSize: 13, fontWeight: esHoy ? 700 : 500, color: esHoy ? '#3b82f6' : 'var(--text)', lineHeight: 1 }}>{format(col.fecha, 'd')}</span>
                              <span style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1 }}>{format(col.fecha, 'MMM', { locale: es })}</span>
                            </>}
                            {tlAgrup === 'semana' && <>
                              <span style={{ fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 600, color: esHoy ? '#3b82f6' : 'var(--text)', lineHeight: 1 }}>S{getISOWeek(col.fecha)}</span>
                              <span style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1 }}>{format(col.fecha, 'd', { locale: es })}–{format(col.fechaFin, 'd MMM', { locale: es })}</span>
                            </>}
                            {tlAgrup === 'mes' && <>
                              <span style={{ fontSize: 12, fontWeight: 600, color: esHoy ? '#3b82f6' : 'var(--text)', lineHeight: 1 }}>{format(col.fecha, 'MMMM', { locale: es })}</span>
                              <span style={{ fontSize: 9, color: 'var(--text3)', lineHeight: 1 }}>{format(col.fecha, 'yyyy')}</span>
                            </>}
                            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', marginTop: 1 }}>
                              {compsCol.slice(0, 2).map(c => (
                                <span key={c.id} title={c.nombre} style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: '1px 4px', fontSize: 8, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis' }}>🏆 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span></span>
                              ))}
                              {ctrlsCol.slice(0, 2).map(c => (
                                <span key={c.id} title={c.nombre} style={{ background: '#eff6ff', border: '1px solid #3b82f6', borderRadius: 8, padding: '1px 4px', fontSize: 8, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap', maxWidth: 44, overflow: 'hidden', textOverflow: 'ellipsis' }}>🔬 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span></span>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── ZONA C — columna de etiquetas (scroll vertical sincronizado) ── */}
                  <div ref={tlZonaCRef} style={{ gridColumn: 1, gridRow: 2, overflowX: 'hidden', overflowY: 'hidden', background: 'var(--bg)', borderRight: '1px solid var(--border)', zIndex: 20 }}>
                    {tlRows.per && (
                      <div style={{ height: 45, borderBottom: '1px solid var(--border)', background: '#fff5f5', display: 'flex', flexDirection: 'column', justifyContent: 'space-around', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>Bloque</span>
                        <div style={{ height: 1, background: 'var(--border)', width: '100%' }} />
                        <span style={{ fontSize: 10, color: '#fca5a5', fontWeight: 600 }}>Sub bloque</span>
                      </div>
                    )}
                    {tlRows.pla && (() => {
                      const VARS_OPT = [
                        { key: 'carga_interna', label: 'RPE×min' },
                        { key: 'rpe',           label: 'RPE' },
                        { key: 'duracion',      label: 'Duración' },
                        ...(esResistencia ? [{ key: 'fc_zonas', label: 'FC Zonas' }] : []),
                      ]
                      const TicksCol = ({ ticks, color, h }) => (
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: h, padding: '2px 0', flexShrink: 0 }}>
                          {ticks.map((t, i) => (
                            <span key={i} style={{ fontSize: 7, color, lineHeight: 1, textAlign: 'right', whiteSpace: 'nowrap' }}>{t}</span>
                          ))}
                        </div>
                      )

                      const mitad = Math.floor(alturaPlanificacion / 2)
                      const rowH  = var2Carga ? mitad - 1 : alturaPlanificacion
                      const tp1 = calcTicksForVar(varCarga,  columnas, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques)
                      const tp2 = var2Carga ? calcTicksForVar(var2Carga, columnas, tlAgrup, sesiones, feedbacks, todasLasSemanas, bloques, subbloques) : null

                      return (
                        <div style={{ height: alturaPlanificacion, borderBottom: '1px solid var(--border)', background: '#fffef0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          {/* Fila 1: selector gráfica principal + ticks */}
                          <div style={{ height: rowH, display: 'flex', flexDirection: 'row', overflowX: 'hidden' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 4px 4px 5px', overflowY: 'auto', overflowX: 'hidden' }}>
                              <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 3 }}>Carga</span>
                              {VARS_OPT.map(op => (
                                <button key={op.key} onClick={() => setVarCarga(op.key)}
                                  style={{ display: 'block', width: '100%', padding: '2px 4px', marginBottom: 2, fontSize: 9, borderRadius: 4,
                                    border: varCarga === op.key ? '1px solid #eda100' : '1px solid var(--border)',
                                    background: varCarga === op.key ? '#fef3c7' : 'transparent',
                                    color: varCarga === op.key ? '#854f0b' : 'var(--text3)',
                                    cursor: 'pointer', textAlign: 'left' }}>
                                  {op.label}
                                </button>
                              ))}
                              {var2Carga === null ? (
                                <button onClick={() => { setVar2Carga(VARS_OPT.find(v => v.key !== varCarga)?.key || 'rpe'); setAlturaPlanificacion(240) }}
                                  style={{ display: 'block', width: '100%', marginTop: 3, padding: '2px 4px', fontSize: 9, borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', textAlign: 'left' }}>
                                  + 2ª gráfica
                                </button>
                              ) : (
                                <button onClick={(e) => { e.stopPropagation(); setVar2Carga(null); setAlturaPlanificacion(106) }}
                                  style={{ display: 'block', width: '100%', marginTop: 3, padding: '2px 4px', fontSize: 9, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', textAlign: 'left' }}>
                                  × 2ª gráfica
                                </button>
                              )}
                            </div>
                            <TicksCol ticks={tp1} color="#aaa" h={rowH} />
                          </div>
                          {/* Fila 2: selector gráfica secundaria + ticks (si existe) */}
                          {var2Carga !== null && <>
                            <div style={{ height: 1, flexShrink: 0, background: 'var(--border)' }} />
                            <div style={{ height: rowH, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 4px 4px 5px', overflow: 'hidden' }}>
                                <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, display: 'block', marginBottom: 3 }}>Carga 2</span>
                                {VARS_OPT.map(op => (
                                  <button key={op.key} onClick={() => setVar2Carga(op.key)}
                                    style={{ display: 'block', width: '100%', padding: '2px 4px', marginBottom: 2, fontSize: 9, borderRadius: 4,
                                      border: var2Carga === op.key ? '1px solid #3b82f6' : '1px solid var(--border)',
                                      background: var2Carga === op.key ? '#dbeafe' : 'transparent',
                                      color: var2Carga === op.key ? '#1e40af' : 'var(--text3)',
                                      cursor: 'pointer', textAlign: 'left' }}>
                                    {op.label}
                                  </button>
                                ))}
                              </div>
                              {tp2 && <TicksCol ticks={tp2} color="#2a78d6" h={rowH} />}
                            </div>
                          </>}
                        </div>
                      )
                    })()}
                    {tlRows.pro && (
                      <div style={{ height: 120, borderBottom: '1px solid var(--border)', background: '#f0fff4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: '#2d6a4f', fontWeight: 600 }}>Sesiones</span>
                      </div>
                    )}
                    {tlRows.com && (
                      <div style={{ height: 80, borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Comentarios</span>
                      </div>
                    )}
                  </div>

                  {/* ── ZONA D — contenido (scrollea en ambos ejes) ── */}
                  <div ref={tlZonaDRef} style={{ gridColumn: 2, gridRow: 2, overflowX: 'auto', overflowY: 'auto' }}>

                    {/* ── FILA 2 — PERIODIZACIÓN ── */}
                    {tlRows.per && (
                      <div style={{ height: 45, minWidth: totalW, position: 'relative', borderBottom: '1px solid var(--border)', background: '#fff5f5' }}>
                        <div style={{ height: 24, position: 'relative', overflow: 'hidden' }}>
                          {bloques.map((b, bidx) => {
                            const bIni = parseISO(b.fecha_inicio)
                            const lPct = pctLeft(differenceInDays(bIni, planIni))
                            const wPct = pctWidth(b.semanas * 7)
                            const subs = subbloques[b.id] || []
                            return (
                              <div key={b.id}
                                onClick={() => openModal('bloque', b)}
                                onMouseEnter={e => setTooltip({ visible: true, tipo: 'bloque', item: b, bidx, numSubs: subs.length, x: e.clientX, y: e.clientY })}
                                onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
                                style={{ position: 'absolute', left: `${lPct}%`, top: 1, width: `${wPct}%`, height: 22, background: (b.color || '#2d6a4f') + 'd9', borderRadius: 5, display: 'flex', alignItems: 'center', paddingLeft: 7, cursor: 'pointer', overflow: 'hidden', zIndex: 2 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.nombre}</span>
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ height: 1, background: 'rgba(239,68,68,0.15)' }} />
                        <div style={{ height: 20, position: 'relative', overflow: 'hidden' }}>
                          {bloques.map((b, bidx) => {
                            const bIni = parseISO(b.fecha_inicio)
                            const subs = subbloques[b.id] || []
                            return subs.map(sub => {
                              const subIni = addDays(bIni, (sub.semana_inicio - 1) * 7)
                              const subW   = (sub.semana_fin - sub.semana_inicio + 1) * 7
                              const slPct  = pctLeft(differenceInDays(subIni, planIni))
                              const swPct  = pctWidth(subW)
                              return (
                                <div key={sub.id}
                                  onClick={() => openModal('subbloque', { ...sub, bloque_id: b.id })}
                                  onMouseEnter={e => setTooltip({ visible: true, tipo: 'subbloque', item: sub, bloque: b, bidx, x: e.clientX, y: e.clientY })}
                                  onMouseLeave={() => setTooltip(t => ({ ...t, visible: false }))}
                                  style={{ position: 'absolute', left: `${slPct}%`, top: 2, width: `${swPct}%`, height: 16, background: (b.color || '#2d6a4f') + '77', borderRadius: 3, display: 'flex', alignItems: 'center', paddingLeft: 4, cursor: 'pointer', overflow: 'hidden', zIndex: 2 }}>
                                  <span style={{ fontSize: 9, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub.nombre}</span>
                                </div>
                              )
                            })
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── FILA 3 — PLANIFICACIÓN (Chart.js) ── */}
                    {tlRows.pla && (() => {
                      const mitad = Math.floor(alturaPlanificacion / 2)
                      const rowH  = var2Carga ? mitad - 1 : alturaPlanificacion
                      return (
                        <div style={{ height: alturaPlanificacion, minWidth: totalW, background: '#fffef0', borderBottom: '1px solid var(--border)' }}>
                          <GraficaTimeline
                            varPrincipal={varCarga} varSecundaria={null}
                            columnas={columnas} totalW={totalW} colW={COL_W} chartH={rowH}
                            tlAgrup={tlAgrup} sesiones={sesiones} feedbacks={feedbacks}
                            todasLasSemanas={todasLasSemanas} bloques={bloques} subbloques={subbloques}
                          />
                          {var2Carga && <>
                            <div style={{ height: 1, background: 'var(--border)', minWidth: totalW }} />
                            <div style={{ position: 'relative', minWidth: totalW }}>
                              <GraficaTimeline
                                varPrincipal={var2Carga} varSecundaria={null}
                                columnas={columnas} totalW={totalW} colW={COL_W} chartH={rowH}
                                tlAgrup={tlAgrup} sesiones={sesiones} feedbacks={feedbacks}
                                todasLasSemanas={todasLasSemanas} bloques={bloques} subbloques={subbloques}
                              />
                              <button
                                onClick={() => { setVar2Carga(null); setAlturaPlanificacion(106) }}
                                style={{ position: 'absolute', top: 4, right: 4, padding: '1px 6px', fontSize: 10, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text3)', cursor: 'pointer', zIndex: 2 }}>
                                × eliminar
                              </button>
                            </div>
                          </>}
                        </div>
                      )
                    })()}

                    {/* Tooltip flotante gráfica */}
                    {tlTooltip.visible && tlTooltip.data && (
                      <div style={{ position: 'fixed', top: tlTooltip.y + 12, left: Math.min(tlTooltip.x + 12, window.innerWidth - 220), background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 2000, pointerEvents: 'none', fontSize: 11, lineHeight: 1.6, maxWidth: 210 }}>
                        {tlTooltip.data.tipo === 'fc_zonas' ? (
                          <>
                            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>FC Zonas</div>
                            {[['Z1-Z2','z12','#10b981'],['Z3-Z4','z34','#f59e0b'],['Z5+','z5','#ef4444']].map(([lbl,k,c]) => (
                              <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: c, display: 'inline-block', flexShrink: 0 }} />
                                <span style={{ color: 'var(--text2)' }}>{lbl}:</span>
                                <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{tlTooltip.data.rd[k]||0}%</span>
                                <span style={{ color: 'var(--text3)', fontSize: 10 }}>obj {tlTooltip.data.od[k]||0}%</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <div style={{ color: 'var(--text2)' }}>{tlTooltip.data.tipLabel}</div>
                        )}
                      </div>
                    )}

                    {/* ── FILA 4 — PROGRAMACIÓN (sesiones) ── */}
                    {tlRows.pro && (() => {

                      // Badge de estado feedback
                      const badgeFb = s => {
                        const fb = feedbackPorSesion.get(s.id)
                        if (!fb) return { icono: '○', color: '#cbd5e1' }
                        const status = fb.data?.completion?.status
                        if (status === 'completed') return { icono: '●', color: '#16a34a' }
                        if (status === 'partial')   return { icono: '◐', color: '#3b82f6' }
                        if (status === 'missed')    return { icono: '●', color: '#dc2626' }
                        return { icono: '●', color: '#16a34a' }
                      }

                      // Card individual de sesión
                      const SesCard = ({ s, colW }) => {
                        const bd = badgeFb(s)
                        const borde = COLOR_TIPO[s.tipo_sesion] || 'var(--accent)'
                        const tip = [
                          s.titulo,
                          s.fecha ? format(parseISO(s.fecha), "d 'de' MMMM yyyy", { locale: es }) : 'Sin fecha',
                          s.tipo_sesion,
                          s.duracion_min ? `${s.duracion_min} min` : null,
                        ].filter(Boolean).join(' · ')
                        return (
                          <div title={tip}
                            onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                            style={{ position: 'relative', width: '100%', height: 52, borderRadius: 8, background: 'var(--bg)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderLeft: `3px solid ${borde}`, padding: '6px 8px', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, boxSizing: 'border-box' }}>
                            {/* Badge estado */}
                            <span style={{ position: 'absolute', top: 5, right: 6, fontSize: 8, color: bd.color }}>{bd.icono}</span>
                            {/* Línea 1: icono + título */}
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 12, lineHeight: 1.3 }}>
                              {iconoSesion(s)} {s.titulo}
                            </div>
                            {/* Línea 2: duración */}
                            {s.duracion_min && (
                              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, lineHeight: 1.2 }}>{s.duracion_min} min</div>
                            )}
                          </div>
                        )
                      }

                      // Card de competición
                      const CompCard = ({ c }) => (
                        <div title={c.nombre} onClick={() => openModal('comp', c)}
                          style={{ width: '100%', height: 52, borderRadius: 8, background: '#fff5f5', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: '3px solid #ef4444', padding: '6px 8px', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, boxSizing: 'border-box' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🏆 {c.nombre}</div>
                        </div>
                      )

                      // Card de control
                      const CtrlCard = ({ c }) => (
                        <div title={c.nombre} onClick={() => openModal('control', c)}
                          style={{ width: '100%', height: 52, borderRadius: 8, background: '#eff6ff', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: '3px solid #3b82f6', padding: '6px 8px', cursor: 'pointer', overflow: 'hidden', flexShrink: 0, boxSizing: 'border-box' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🔬 {c.nombre}</div>
                        </div>
                      )

                      return (
                        <div style={{ height: 120, minWidth: totalW, display: 'flex', background: '#f0fff4', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
                            {columnas.map((col, ci) => {
                              const esHoy = colEsHoy(col)
                              const colFin = col.fechaFin || col.fecha

                              if (tlAgrup === 'mes') {
                                // Modo mes: solo contador, clic cambia a semana
                                const sesMes = sesiones.filter(s => {
                                  if (!s.fecha) return false
                                  const f = parseISO(s.fecha)
                                  return isSameMonth(f, col.fecha)
                                })
                                return (
                                  <div key={col.key}
                                    onClick={() => setTlAgrup('semana')}
                                    style={{ width: COL_W, minWidth: COL_W, flexShrink: 0, borderRight: '1px solid var(--border)', background: esHoy ? 'rgba(16,185,129,0.06)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                    {sesMes.length > 0
                                      ? <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{sesMes.length} sesiones</span>
                                      : <span style={{ fontSize: 10, color: 'var(--text3)' }}>—</span>}
                                  </div>
                                )
                              }

                              // Modo día o semana
                              const sesDia = sesiones.filter(s => {
                                if (!s.fecha) return false
                                const f = parseISO(s.fecha)
                                if (tlAgrup === 'dia') return isSameDay(f, col.fecha)
                                return f >= col.fecha && f <= colFin
                              })
                              const compsDia = competiciones.filter(c => {
                                const f = parseISO(c.fecha)
                                if (tlAgrup === 'dia') return isSameDay(f, col.fecha)
                                return f >= col.fecha && f <= colFin
                              })
                              const ctrlsDia = controles.filter(c => {
                                const f = parseISO(c.fecha)
                                if (tlAgrup === 'dia') return isSameDay(f, col.fecha)
                                return f >= col.fecha && f <= colFin
                              })
                              const items = [...compsDia.map(c => ({ _t: 'comp', _d: c })), ...ctrlsDia.map(c => ({ _t: 'ctrl', _d: c })), ...sesDia.map(s => ({ _t: 'ses', _d: s }))]
                              const MAX_VIS = tlAgrup === 'semana' ? 3 : 99
                              const visibles = items.slice(0, MAX_VIS)
                              const resto   = items.length - visibles.length

                              return (
                                <div key={col.key}
                                  style={{ width: COL_W, minWidth: COL_W, flexShrink: 0, borderRight: '1px solid rgba(0,0,0,0.05)', background: esHoy ? 'rgba(16,185,129,0.06)' : 'transparent', padding: '5px 3px', display: 'flex', flexDirection: 'column', gap: 4, boxSizing: 'border-box' }}>
                                  {visibles.map((item, ii) => (
                                    item._t === 'comp' ? <CompCard key={item._d.id} c={item._d} /> :
                                    item._t === 'ctrl' ? <CtrlCard key={item._d.id} c={item._d} /> :
                                    <SesCard key={item._d.id} s={item._d} colW={COL_W} />
                                  ))}
                                  {resto > 0 && (
                                    <div style={{ fontSize: 9, color: 'var(--text3)', textAlign: 'center', fontFamily: 'var(--mono)', padding: '2px 0' }}>+{resto} más</div>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      )
                    })()}

                    {/* ═══ FILA 5 — COMENTARIOS ═══ */}
                    {tlRows.com && (() => {
                      return (
                        <div style={{ height: 80, minWidth: totalW, display: 'flex', background: '#fff', borderBottom: '1px solid var(--border)' }}>
                            {columnas.map((col) => {
                              const colFin = col.fechaFin || col.fecha
                              const esHoy = colEsHoy(col)

                              // Sesiones del periodo con comentario o feedback
                              const sesPeriodo = sesiones.filter(s => {
                                if (!s.fecha) return false
                                const f = parseISO(s.fecha)
                                if (tlAgrup === 'dia') return isSameDay(f, col.fecha)
                                if (tlAgrup === 'mes') return isSameMonth(f, col.fecha)
                                return f >= col.fecha && f <= colFin
                              })

                              const comentCards = sesPeriodo
                                .filter(s => s.comentario_entrenadora)
                                .map(s => ({ type: 'coach', s }))

                              const feedbackCards = sesPeriodo
                                .filter(s => {
                                  const fb = feedbackPorSesion.get(s.id)
                                  return fb && fb.data?.generalComments
                                })
                                .map(s => {
                                  const fb = feedbackPorSesion.get(s.id)
                                  return { type: 'client', s, fb }
                                })

                              const allCards = [...comentCards, ...feedbackCards]

                              return (
                                <div key={col.key}
                                  style={{ width: COL_W, minWidth: COL_W, flexShrink: 0, borderRight: '1px solid rgba(0,0,0,0.05)', background: esHoy ? 'rgba(16,185,129,0.04)' : 'transparent', padding: '5px 3px', display: 'flex', flexDirection: 'column', gap: 4, boxSizing: 'border-box', minHeight: 80 }}>
                                  {comentCards.map(({ s }) => (
                                    <div key={`ce-${s.id}`}
                                      onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                                      title={s.comentario_entrenadora}
                                      style={{ borderRadius: 6, background: '#f0fdf4', border: '2px solid #86efac', padding: '4px 6px', cursor: 'pointer', fontSize: 10, lineHeight: 1.3, overflow: 'hidden', flexShrink: 0 }}>
                                      <div style={{ fontSize: 9, color: '#16a34a', fontWeight: 600, marginBottom: 2 }}>📝 {s.titulo}</div>
                                      <div style={{ color: '#166534', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.comentario_entrenadora}</div>
                                    </div>
                                  ))}
                                  {feedbackCards.map(({ s, fb }) => {
                                    const rpe = fb.data?.rpe?.value
                                    const status = fb.data?.completion?.status
                                    return (
                                      <div key={`fb-${s.id}`}
                                        onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                                        title={fb.data.generalComments}
                                        style={{ borderRadius: 6, background: '#f8fafc', border: '1.5px solid #cbd5e1', padding: '4px 6px', cursor: 'pointer', fontSize: 10, lineHeight: 1.3, overflow: 'hidden', flexShrink: 0 }}>
                                        <div style={{ fontSize: 9, color: '#475569', fontWeight: 600, marginBottom: 2, display: 'flex', gap: 4 }}>
                                          <span>💬 {s.titulo}</span>
                                          {rpe && <span style={{ color: '#7c3aed' }}>RPE {rpe}</span>}
                                          {status === 'completada' && <span style={{ color: '#059669' }}>✓</span>}
                                        </div>
                                        <div style={{ color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fb.data.generalComments}</div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}
                        </div>
                      )
                    })()}

                  </div>{/* end Zona D */}
                </div>{/* end grid */}
              </div>{/* end card */}
            </div>
            )
          })()}


          {vista === 'timeline' && totalSemanas === 0 && (
            <div className="empty">
              <Layers size={40} />
              <p>Añade bloques para ver el timeline.</p>
              <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => openModal('bloque')}><Plus size={13} /> Añadir bloque</button>
            </div>
          )}

        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  TOOLTIP GLOBAL                                                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {tooltip.visible && (
        <div style={{ position: 'fixed', top: tooltip.y + 14, left: Math.min(tooltip.x + 14, window.innerWidth - 300), background: 'var(--bg, #fff)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', boxShadow: '0 6px 24px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 200, maxWidth: 280, pointerEvents: 'none', fontSize: 12, lineHeight: 1.5 }}>
          {tooltip.tipo === 'bloque' && tooltip.item && (() => {
            const b     = tooltip.item
            const subs  = (subbloques[b.id] || []).slice().sort((a, x) => a.semana_inicio - x.semana_inicio)
            const fIni  = format(parseISO(b.fecha_inicio), "dd 'de' MMMM yyyy", { locale: es })
            const fFin  = format(addWeeks(parseISO(b.fecha_inicio), b.semanas), "dd 'de' MMMM yyyy", { locale: es })
            return (<>
              <div style={{ fontWeight: 700, color: b.color || 'var(--accent)', marginBottom: 6 }}>B{(tooltip.bidx ?? 0) + 1} {b.nombre}</div>
              <div style={{ color: 'var(--text2)', marginBottom: 3, fontFamily: 'var(--mono)', fontSize: 11 }}>{fIni} – {fFin}</div>
              <div style={{ color: 'var(--text3)', marginBottom: 3 }}>{b.semanas} sem · {subs.length} sub bloque{subs.length !== 1 ? 's' : ''}</div>
              {b.objetivo && <div style={{ color: 'var(--text2)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>{b.objetivo.slice(0, 120)}{b.objetivo.length > 120 ? '…' : ''}</div>}
              {subs.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {subs.map((sub, si) => {
                    const fS = b ? format(calcFechaInicioSemana(b, sub.semana_inicio), 'd MMM', { locale: es }) : ''
                    const fE = b ? format(calcFechaFinSemana(b, sub.semana_fin), 'd MMM', { locale: es }) : ''
                    return (
                      <div key={sub.id} style={{ paddingTop: si > 0 ? 5 : 0, borderTop: si > 0 ? '0.5px solid var(--border)' : 'none' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                          <span style={{ color: b.color || 'var(--accent)', marginRight: 4 }}>▸</span>
                          {(tooltip.bidx ?? 0) + 1}.{si + 1} {sub.nombre}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginLeft: 12 }}>{fS} – {fE}</div>
                        {sub.notas && <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', marginLeft: 12, marginTop: 1 }}>{sub.notas.slice(0, 80)}{sub.notas.length > 80 ? '…' : ''}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>)
          })()}
          {tooltip.tipo === 'subbloque' && tooltip.item && (() => {
            const sub  = tooltip.item
            const b    = tooltip.bloque
            const fIni = b ? format(calcFechaInicioSemana(b, sub.semana_inicio), 'dd MMM', { locale: es }) : ''
            const fFin = b ? format(calcFechaFinSemana(b, sub.semana_fin), 'dd MMM yyyy', { locale: es }) : ''
            return (<>
              <div style={{ fontWeight: 700, color: b?.color || 'var(--accent)', marginBottom: 6 }}>SB{(tooltip.bidx ?? 0) + 1}.{(tooltip.subidx ?? 0) + 1} {sub.nombre}</div>
              <div style={{ color: 'var(--text2)', marginBottom: 3, fontFamily: 'var(--mono)', fontSize: 11 }}>{fIni} – {fFin}</div>
              {(sub.km_min || sub.km_max) && <div style={{ color: 'var(--text3)' }}>Volumen: {sub.km_min}{sub.km_max ? `–${sub.km_max}` : '+'} km/sem</div>}
              {sub.exigencia && <div style={{ color: 'var(--text3)' }}>Exigencia: {sub.exigencia}</div>}
              {sub.notas && <div style={{ color: 'var(--text2)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>{sub.notas.slice(0, 100)}{sub.notas.length > 100 ? '…' : ''}</div>}
            </>)
          })()}
          {tooltip.tipo === 'semana' && (() => {
            const sem   = tooltip.item
            const b     = tooltip.bloque
            const carga = sem?.carga ? CARGAS[sem.carga] : null
            const fIni  = b ? calcFechaInicioSemana(b, tooltip.numLocal) : null
            const fFin  = fIni ? addDays(fIni, 6) : null
            const sesionesSem = fIni && fFin ? sesiones.filter(s => {
              if (!s.fecha) return false
              const f = parseISO(s.fecha)
              return f >= fIni && f <= fFin
            }) : []
            return (<>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>S{tooltip.numGlobal} · {fIni ? format(fIni, 'dd MMM', { locale: es }) : ''}</div>
              {sem?.objetivo ? <div style={{ color: 'var(--text2)', marginBottom: 4 }}>{sem.objetivo}</div> : <div style={{ color: 'var(--text3)', fontStyle: 'italic', marginBottom: 4 }}>Sin objetivo</div>}
              {carga && <div style={{ marginBottom: 4 }}><span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: carga.color + '20', color: carga.color, fontWeight: 600 }}>{carga.label}</span></div>}
              {sem?.km_objetivo && <div style={{ color: 'var(--text3)', marginBottom: 4 }}>Obj: {sem.km_objetivo} km{sem?.km_real ? ` · Real: ${sem.km_real} km` : ''}</div>}
              {sesionesSem.length > 0 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {sesionesSem.map((s, si) => (
                    <div key={s.id} style={{ paddingTop: si > 0 ? 5 : 0, paddingBottom: 5, borderTop: si > 0 ? '0.5px solid var(--border)' : 'none' }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)' }}>{s.icono || iconoSesion(s)} {s.titulo}</div>
                      {s.objetivo && <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', marginLeft: 16, marginTop: 1 }}><span style={{ fontStyle: 'normal', marginRight: 3 }}>·</span>{s.objetivo.slice(0, 70)}{s.objetivo.length > 70 ? '…' : ''}</div>}
                    </div>
                  ))}
                </div>
              )}
            </>)
          })()}
          {tooltip.tipo === 'sesion' && tooltip.item && (() => {
            const s = tooltip.item
            return (<>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{iconoSesion(s)} {s.titulo}</div>
              <div style={{ color: 'var(--text3)', marginBottom: 3 }}>{s.fecha ? format(parseISO(s.fecha), 'dd MMM yyyy', { locale: es }) : 'Sin fecha asignada'}</div>
              <div style={{ color: 'var(--text3)', marginBottom: 3, textTransform: 'capitalize' }}>{s.tipo_sesion || 'programada'}</div>
              {s.duracion_min && <div style={{ color: 'var(--text3)' }}>{s.duracion_min} min</div>}
              {s.objetivo && <div style={{ color: 'var(--text2)', marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontStyle: 'italic' }}>{s.objetivo.slice(0, 100)}</div>}
            </>)
          })()}
          {tooltip.tipo === 'comp' && tooltip.item && (() => {
            const c = tooltip.item
            return (<>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>🏆 {c.nombre}</div>
              <div style={{ color: 'var(--text2)', marginBottom: 3 }}>{format(parseISO(c.fecha), "dd 'de' MMMM yyyy", { locale: es })}</div>
              {c.tipo && <div style={{ color: 'var(--text3)' }}>{c.tipo}</div>}
              {c.objetivo && <div style={{ color: 'var(--text2)', marginTop: 4, fontStyle: 'italic' }}>{c.objetivo}</div>}
            </>)
          })()}
          {tooltip.tipo === 'control' && tooltip.item && (() => {
            const c = tooltip.item
            return (<>
              <div style={{ fontWeight: 700, color: '#3b82f6', marginBottom: 6 }}>🔬 {c.nombre}</div>
              <div style={{ color: 'var(--text2)', marginBottom: 3 }}>{format(parseISO(c.fecha), "dd 'de' MMMM yyyy", { locale: es })}</div>
              {c.tipo && <div style={{ color: 'var(--text3)' }}>{c.tipo}</div>}
            </>)
          })()}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/*  MODAL UNIFICADO                                                  */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {modalTipo && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{getTituloModal()}</span>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}><X size={14} /></button>
            </div>
            {renderFormulario()}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={closeModal}>{modalTipo?.startsWith('ver_') ? 'Cerrar' : 'Cancelar'}</button>
              {!modalTipo?.startsWith('ver_') && (
                <button className="btn btn-primary" onClick={guardarModal} disabled={saving}>
                  {saving ? 'Guardando...' : (modalItem?.id || modalItem?.semanaData?.id) ? 'Guardar cambios' : getTituloCrear()}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL COPIAR PLANIFICACIÓN ────────────────────────────────── */}
      {modalCopiar && (
        <div className="modal-backdrop" onClick={() => setModalCopiar(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Copiar planificación</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalCopiar(false)}><X size={14} /></button>
            </div>
            <div style={{ padding: '0 20px 4px' }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, padding: '10px 14px', background: 'var(--bg2)', borderRadius: 'var(--radius)' }}>
                Copiando: <strong>{planificacion?.nombre}</strong><br />
                <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Se copiarán bloques y sub bloques. Los datos reales no se copian.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Cliente destino *</label>
                <select className="form-select" value={formCopiar.cliente_id} onChange={e => setFormCopiar(f => ({ ...f, cliente_id: e.target.value }))}>
                  <option value="">Selecciona...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={formCopiar.nombre} onChange={e => setFormCopiar(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Nueva fecha de inicio *</label>
                <input className="form-input" type="date" value={formCopiar.fecha_inicio} onChange={e => setFormCopiar(f => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalCopiar(false)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving || !formCopiar.cliente_id || !formCopiar.fecha_inicio || !formCopiar.nombre}
                onClick={async () => {
                  setSaving(true)
                  try {
                    const offsetDias = (new Date(formCopiar.fecha_inicio) - new Date(planificacion.fecha_inicio)) / (1000 * 60 * 60 * 24)
                    const nuevaFin   = new Date(planificacion.fecha_fin); nuevaFin.setDate(nuevaFin.getDate() + offsetDias)
                    const { data: nuevaPlan } = await supabase.from('planificaciones').insert({ cliente_id: formCopiar.cliente_id, nombre: formCopiar.nombre, fecha_inicio: formCopiar.fecha_inicio, fecha_fin: nuevaFin.toISOString().split('T')[0], notas: planificacion.notas || null }).select().single()
                    for (const b of bloques) {
                      const nfb = new Date(b.fecha_inicio); nfb.setDate(nfb.getDate() + offsetDias)
                      const { data: nb } = await supabase.from('bloques').insert({ planificacion_id: nuevaPlan.id, nombre: b.nombre, fase: b.fase, carga: b.carga, semanas: b.semanas, fecha_inicio: nfb.toISOString().split('T')[0], objetivo: b.objetivo || null, contenidos: b.contenidos || null, color: b.color || '#2d6a4f', orden: b.orden }).select().single()
                      for (const s of (subbloques[b.id] || [])) await supabase.from('subbloques').insert({ bloque_id: nb.id, nombre: s.nombre, semana_inicio: s.semana_inicio, semana_fin: s.semana_fin, objetivo: s.objetivo || null, notas: s.notas || null, zona1_2: s.zona1_2 || 0, zona3_4: s.zona3_4 || 0, zona5: s.zona5 || 0, km_min: s.km_min || null, km_max: s.km_max || null })
                    }
                    setModalCopiar(false); alert('Planificación copiada.'); setClienteSeleccionado(formCopiar.cliente_id)
                  } catch { alert('Error al copiar.') } finally { setSaving(false) }
                }}>
                {saving ? 'Copiando...' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCopiarPack && (
        <div className="modal-backdrop" onClick={() => setModalCopiarPack(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Copiar pack a otro cliente</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalCopiarPack(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginBottom: 14 }}>
              📦 <strong>{modalCopiarPack.nombre}</strong> · {sesiones.filter(s => s.pack_id === modalCopiarPack.id).length} sesiones
            </div>
            <div className="form-group">
              <label className="form-label">Cliente destino *</label>
              <select className="form-select" value={copiarPackForm.cliente_id} onChange={e => setCopiarPackForm(f => ({ ...f, cliente_id: e.target.value }))} autoFocus>
                <option value="">Selecciona un cliente...</option>
                {clientes.filter(c => c.id !== clienteSeleccionado).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha inicio</label>
                <input className="form-input" type="date" value={copiarPackForm.fecha_inicio} onChange={e => setCopiarPackForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha fin</label>
                <input className="form-input" type="date" value={copiarPackForm.fecha_fin} onChange={e => setCopiarPackForm(f => ({ ...f, fecha_fin: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalCopiarPack(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!copiarPackForm.cliente_id || !copiarPackForm.fecha_inicio || !copiarPackForm.fecha_fin} onClick={copiarPackAOtroCliente}>
                Copiar pack
              </button>
            </div>
          </div>
        </div>
      )}

      {modalPack && (
        <div className="modal-backdrop" onClick={() => setModalPack(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modalPack === 'nuevo' ? 'Nuevo pack flexible' : 'Editar pack'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalPack(null)}>✕</button>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre del pack *</label>
              <input className="form-input" value={formPack.nombre} onChange={e => setFormPack(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Plan de vacaciones" autoFocus />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha inicio *</label>
                <input className="form-input" type="date" value={formPack.fecha_inicio} onChange={e => setFormPack(f => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha fin *</label>
                <input className="form-input" type="date" value={formPack.fecha_fin} onChange={e => setFormPack(f => ({ ...f, fecha_fin: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descripción para el cliente</label>
              <textarea className="form-input" value={formPack.descripcion} onChange={e => setFormPack(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Durante estos días puedes realizar estas sesiones de forma flexible según disponibilidad..." rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalPack(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={savingPack || !formPack.nombre || !formPack.fecha_inicio || !formPack.fecha_fin} onClick={guardarPack}>{savingPack ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      <PortalClienteModal
        cliente={clienteData}
        abierto={portalModal}
        onCerrar={() => setPortalModal(false)}
        onGuardado={config => setClienteData(prev => prev ? { ...prev, portal_config: config } : prev)}
      />

    </div>
  )
}

// ─── VISTA LISTA ─────────────────────────────────────────────────────────────

function VistaLista({ bloques, subbloques, semanas, sesiones, clienteData, esSalud, openModal, setVista, eliminarItem, cargarPlanificacion, planificacion, clienteSeleccionado, setSesionesContext, setPage }) {
  const [editMode,         setEditMode]         = useState(false)
  const [bloqueAbierto,    setBloqueAbierto]    = useState(new Set())
  const [subBloqueAbierto, setSubBloqueAbierto] = useState(new Set())
  const [semanaAbierta,    setSemanaAbierta]    = useState(new Set())
  const [inlineEdits,      setInlineEdits]      = useState({})

  function toggleBloque(id) {
    setBloqueAbierto(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSubBloque(id) {
    setSubBloqueAbierto(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function toggleSemana(key) {
    setSemanaAbierta(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })
  }

  function handleInlineChange(tipo, id, campo, valor) {
    setInlineEdits(prev => ({ ...prev, [`${tipo}-${id}-${campo}`]: valor }))
  }
  function getInlineValue(tipo, id, campo, fallback) {
    const key = `${tipo}-${id}-${campo}`
    return inlineEdits[key] !== undefined ? inlineEdits[key] : (fallback ?? '')
  }
  async function handleInlineBlur(tipo, id, campo, valor) {
    if (tipo === 'bloque')    await supabase.from('bloques').update({ [campo]: valor || null }).eq('id', id)
    if (tipo === 'subbloque') await supabase.from('subbloques').update({ [campo]: valor || null }).eq('id', id)
    if (tipo === 'semana')    await supabase.from('semanas').update({ [campo]: valor || null }).eq('id', id)
    cargarPlanificacion()
  }

  const esResistencia = !esSalud && clienteData?.perfil_planificacion !== 'fuerza_salud'

  if (bloques.length === 0) {
    return (
      <div className="empty">
        <Layers size={40} />
        <p>Sin bloques. Añade el primero con el botón "Añadir".</p>
      </div>
    )
  }

  return (
    <div>
      {/* Barra superior */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button
          onClick={() => { setEditMode(!editMode); setInlineEdits({}) }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${editMode ? 'var(--accent)' : 'var(--border)'}`, background: editMode ? 'var(--accent-light)' : 'var(--bg)', color: editMode ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', fontSize: 12, fontWeight: editMode ? 600 : 400, transition: 'all 0.15s' }}>
          {editMode ? <><Lock size={13} /> Bloquear edición</> : <><Pencil size={13} /> Modo edición</>}
        </button>
      </div>

      {/* ACORDEÓN */}
      {bloques.map((b, bidx) => {
        const subsDelBloque = (subbloques[b.id] || []).slice().sort((a, x) => a.semana_inicio - x.semana_inicio)
        const semsDelBloque = semanas[b.id] || []
        const bAb = bloqueAbierto.has(b.id)
        const fFin = addWeeks(parseISO(b.fecha_inicio), b.semanas)

        return (
          <div key={b.id} style={{ border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden', borderLeft: `4px solid ${b.color || '#2d6a4f'}`, marginBottom: 8 }}>

            {/* ── NIVEL 1: BLOQUE ────────────────────────────────────── */}
            <div onClick={() => toggleBloque(b.id)}
              style={{ padding: '10px 16px', background: 'var(--bg)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              {bAb ? <ChevronDown size={15} /> : <ChevronRight size={15} />}

              {!editMode ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{b.nombre}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {b.semanas} sem · {format(parseISO(b.fecha_inicio), 'd MMM yyyy', { locale: es })} – {format(fFin, 'd MMM yyyy', { locale: es })}
                    </span>
                  </div>
                  {b.objetivo && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 3 }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', flex: 1 }}>{b.objetivo}</span>
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openModal('ver_bloque', b) }} style={{ flexShrink: 0, fontSize: 10, padding: '1px 7px', color: 'var(--accent)', borderColor: 'var(--accent)' }}>Ver más</button>
                    </div>
                  )}
                  {!b.objetivo && (
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openModal('ver_bloque', b) }} style={{ marginTop: 2, fontSize: 10, padding: '1px 7px', color: 'var(--text3)' }}>Ver detalle</button>
                  )}
                </div>
              ) : (
                <input
                  value={getInlineValue('bloque', b.id, 'nombre', b.nombre)}
                  onChange={e => { e.stopPropagation(); handleInlineChange('bloque', b.id, 'nombre', e.target.value) }}
                  onBlur={e => handleInlineBlur('bloque', b.id, 'nombre', e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{ flex: 1, fontSize: 13, fontWeight: 500, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-light)', outline: 'none', minWidth: 0 }}
                />
              )}

              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-ghost btn-sm" onClick={() => openModal('bloque', b)}>Editar</button>
                {!esSalud && <button className="btn btn-ghost btn-sm" onClick={() => openModal('subbloque', { bloque_id: b.id, semana_inicio: 1, semana_fin: 1 })}>+ Sub bloque</button>}
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '4px 6px' }} onClick={() => eliminarItem('bloque', b.id)}><X size={13} /></button>
              </div>
            </div>

            {/* ── CONTENIDO DEL BLOQUE ───────────────────────────────── */}
            {bAb && (
              <div style={{ borderTop: '0.5px solid var(--border)' }}>

                {/* SALUD: semanas directamente bajo el bloque */}
                {esSalud && (() => {
                  const allNums = Array.from({ length: b.semanas }, (_, i) => i + 1)
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '36px 72px 1fr 50px 30px', padding: '6px 16px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', gap: 6 }}>
                        {['Sem', 'Semana', 'Objetivo', 'Carga', ''].map((h, i) => (
                          <span key={i} style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                        ))}
                      </div>
                      {allNums.map(numSem => {
                        const semKey  = `${b.id}-${numSem}`
                        const fIniSem = calcFechaInicioSemana(b, numSem)
                        const fIniSemStr = format(fIniSem, 'yyyy-MM-dd')
                        const semData = semsDelBloque.find(s => s.fecha_inicio_semana === fIniSemStr) || null
                        const fFinSem = calcFechaFinSemana(b, numSem)
                        const fechaStr = `${format(fIniSem, 'd', { locale: es })}–${format(addDays(fIniSem, 6), 'd MMM', { locale: es })}`
                        const carga   = semData?.carga ? CARGAS[semData.carga] : CARGAS.media
                        const hoy     = new Date()
                        const esActual = hoy >= fIniSem && hoy < fFinSem
                        const semAb   = semanaAbierta.has(semKey)
                        const sesionesSem = sesiones.filter(s => {
                          if (!s.fecha) return false
                          const f = parseISO(s.fecha)
                          return f >= fIniSem && f < fFinSem
                        })
                        return (
                          <div key={semKey}>
                            <div onClick={() => toggleSemana(semKey)}
                              style={{ display: 'grid', gridTemplateColumns: '36px 72px 1fr 50px 30px', padding: '8px 16px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', gap: 6, alignItems: 'start', background: esActual ? 'var(--accent-light)' : editMode ? 'var(--bg2)' : 'var(--bg)' }}
                              onMouseOver={e => { if (!esActual) e.currentTarget.style.background = 'var(--bg2)' }}
                              onMouseOut={e => { if (!esActual) e.currentTarget.style.background = esActual ? 'var(--accent-light)' : editMode ? 'var(--bg2)' : 'var(--bg)' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: esActual ? 'var(--accent)' : 'var(--text2)' }}>S{numSem}</span>
                              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fechaStr}</span>
                              {!editMode ? (
                                <span style={{ fontSize: 12, color: semData?.objetivo ? 'var(--text)' : 'var(--text3)', fontStyle: semData?.objetivo ? 'normal' : 'italic' }}>{semData?.objetivo || 'Sin objetivo'}</span>
                              ) : (
                                <input
                                  value={getInlineValue('semana', semData?.id || semKey, 'objetivo', semData?.objetivo || '')}
                                  onChange={e => { e.stopPropagation(); handleInlineChange('semana', semData?.id || semKey, 'objetivo', e.target.value) }}
                                  onBlur={async e => { e.stopPropagation(); const val = e.target.value; if (semData?.id) { await supabase.from('semanas').update({ objetivo: val || null }).eq('id', semData.id) } else { await supabase.from('semanas').insert({ bloque_id: b.id, planificacion_id: planificacion?.id, fecha_inicio_semana: fIniSemStr, numero: numSem, objetivo: val || null, carga: 'media' }) }; cargarPlanificacion() }}
                                  onClick={e => e.stopPropagation()}
                                  placeholder="Añadir objetivo..."
                                  style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-light)', outline: 'none', width: '100%' }}
                                />
                              )}
                              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: carga.color + '20', color: carga.color, width: 'fit-content' }}>{carga.label}</span>
                              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={e => { e.stopPropagation(); openModal('semana', { bloque_id: b.id, semanaData: semData, numeroSemana: numSem, fechaIni: fIniSemStr }) }}><Pencil size={11} /></button>
                            </div>
                            {semAb && sesionesSem.length > 0 && (
                              <div style={{ padding: '8px 16px 8px 24px', background: 'var(--bg2)', borderBottom: '0.5px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {sesionesSem.map(s => (
                                  <button key={s.id} className="btn btn-ghost btn-sm" onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                                    style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                                    {s.titulo || 'Sesión'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )
                })()}

                {!esSalud && subsDelBloque.length === 0 && (
                  <div style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: 13, fontStyle: 'italic' }}>
                    Sin sub bloques — añade el primero con "+ Sub bloque".
                  </div>
                )}

                {!esSalud && subsDelBloque.map((sub, subidx) => {
                  const sAb     = subBloqueAbierto.has(sub.id)
                  const fIniSub = calcFechaInicioSemana(b, sub.semana_inicio)
                  const fFinSub = calcFechaFinSemana(b, sub.semana_fin)
                  const semsDelSub = Array.from({ length: sub.semana_fin - sub.semana_inicio + 1 }, (_, i) => sub.semana_inicio + i)

                  return (
                    <div key={sub.id} style={{ borderBottom: '0.5px solid var(--border)' }}>

                      {/* ── NIVEL 2: SUB BLOQUE ──────────────────────── */}
                      <div onClick={() => toggleSubBloque(sub.id)}
                        style={{ padding: '9px 16px 9px 28px', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                        {sAb ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: b.color || '#2d6a4f', flexShrink: 0 }} />

                        {!editMode ? (
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 500 }}>{bidx + 1}.{subidx + 1} · {sub.nombre}</span>
                              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                                {format(fIniSub, 'd MMM', { locale: es })} – {format(fFinSub, 'd MMM', { locale: es })}
                              </span>
                              {esResistencia && (sub.km_min || sub.km_max) && (
                                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8, background: 'var(--bg)', color: 'var(--text2)' }}>
                                  {sub.km_min ?? '?'}–{sub.km_max ?? '?'} km/sem
                                </span>
                              )}
                              {!esResistencia && sub.exigencia && (
                                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 8,
                                  background: sub.exigencia === 'Baja' ? '#10b98120' : sub.exigencia === 'Moderada' ? '#f59e0b20' : '#ef444420',
                                  color:      sub.exigencia === 'Baja' ? '#10b981'   : sub.exigencia === 'Moderada' ? '#f59e0b'   : '#ef4444' }}>
                                  {sub.exigencia}
                                </span>
                              )}
                            </div>
                            {sub.notas ? (
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 3 }}>
                                <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', flex: 1 }}>{sub.notas}</span>
                                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openModal('ver_subbloque', { ...sub, bloque_id: b.id }) }} style={{ flexShrink: 0, fontSize: 10, padding: '1px 7px', color: 'var(--accent)', borderColor: 'var(--accent)' }}>Ver más</button>
                              </div>
                            ) : (
                              <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openModal('ver_subbloque', { ...sub, bloque_id: b.id }) }} style={{ marginTop: 2, fontSize: 10, padding: '1px 7px', color: 'var(--text3)' }}>Ver detalle</button>
                            )}
                          </div>
                        ) : (
                          <input
                            value={getInlineValue('subbloque', sub.id, 'nombre', sub.nombre)}
                            onChange={e => { e.stopPropagation(); handleInlineChange('subbloque', sub.id, 'nombre', e.target.value) }}
                            onBlur={e => handleInlineBlur('subbloque', sub.id, 'nombre', e.target.value)}
                            onClick={e => e.stopPropagation()}
                            style={{ flex: 1, fontSize: 12, fontWeight: 500, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-light)', outline: 'none', minWidth: 0 }}
                          />
                        )}

                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openModal('subbloque', { ...sub, bloque_id: b.id })}>Editar</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', padding: '4px 6px' }} onClick={() => eliminarItem('subbloque', sub.id)}><X size={12} /></button>
                        </div>
                      </div>

                      {/* ── CONTENIDO DEL SUB BLOQUE ─────────────────── */}
                      {sAb && (
                        <div style={{ borderTop: '0.5px solid var(--border)' }}>

                          {/* Cabecera de tabla de semanas */}
                          <div style={{ display: 'grid', gridTemplateColumns: esResistencia ? '36px 72px 1fr 48px 56px 100px 20px 28px' : '36px 72px 1fr 50px 28px', padding: '6px 16px 6px 44px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', gap: 8 }}>
                            {(esResistencia
                              ? ['Sem', 'Semana', 'Objetivo', 'Carga', 'Km', 'Zonas (obj→real)', '', '']
                              : ['Sem', 'Semana', 'Objetivo', 'Carga', '']
                            ).map((h, i) => (
                              <span key={i} style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                            ))}
                          </div>

                          {/* ── NIVEL 3: SEMANAS ───────────────────────── */}
                          {semsDelSub.map(numSem => {
                            const semKey  = `${b.id}-${numSem}`
                            const fIniSem = calcFechaInicioSemana(b, numSem)
                            const fIniSemStr = format(fIniSem, 'yyyy-MM-dd')
                            const semData = semsDelBloque.find(s => s.fecha_inicio_semana === fIniSemStr) || null
                            const fFinSem = calcFechaFinSemana(b, numSem)
                            const fechaStr = `${format(fIniSem, 'd', { locale: es })}–${format(addDays(fIniSem, 6), 'd MMM', { locale: es })}`
                            const carga   = semData?.carga ? CARGAS[semData.carga] : CARGAS.media
                            const hoy     = new Date()
                            const esActual = hoy >= fIniSem && hoy < fFinSem
                            const semAb   = semanaAbierta.has(semKey)
                            const sesionesSem = sesiones.filter(s => {
                              if (!s.fecha) return false
                              const f = parseISO(s.fecha)
                              return f >= fIniSem && f < fFinSem
                            })

                            const kmReal     = semData?.km_real     ?? null
                            const kmObjetivo = semData?.km_objetivo  ?? null
                            const kmDiff2    = kmObjetivo != null && kmReal != null ? Math.abs(kmReal - kmObjetivo) : null
                            const kmOK       = kmDiff2 != null && kmDiff2 <= 8
                            const kmColor    = kmReal == null ? 'var(--text3)' : kmDiff2 == null ? 'var(--text3)' : kmDiff2 <= 8 ? '#16a34a' : kmDiff2 <= 12 ? '#ca8a04' : '#dc2626'
                            const estadoBg   = kmReal == null ? 'var(--bg2)' : kmDiff2 == null ? 'var(--bg2)' : kmDiff2 <= 8 ? '#bbf7d0' : kmDiff2 <= 12 ? '#fef9c3' : '#fca5a5'
                            const estadoColor = kmReal == null ? 'var(--text3)' : kmDiff2 == null ? 'var(--text3)' : kmDiff2 <= 8 ? '#166534' : kmDiff2 <= 12 ? '#713f12' : '#7f1d1d'

                            return (
                              <div key={semKey}>
                                {/* Fila de semana */}
                                <div
                                  onClick={() => toggleSemana(semKey)}
                                  style={{ display: 'grid', gridTemplateColumns: esResistencia ? '36px 72px 1fr 48px 56px 100px 20px 28px' : '36px 72px 1fr 50px 28px', padding: '8px 16px 8px 44px', borderBottom: '0.5px solid var(--border)', cursor: 'pointer', gap: 8, alignItems: 'center', background: esActual ? 'var(--accent-light)' : editMode ? 'var(--bg2)' : 'var(--bg)' }}
                                  onMouseOver={e => { if (!esActual) e.currentTarget.style.background = 'var(--bg2)' }}
                                  onMouseOut={e => { if (!esActual) e.currentTarget.style.background = esActual ? 'var(--accent-light)' : editMode ? 'var(--bg2)' : 'var(--bg)' }}>

                                  <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--mono)', color: esActual ? 'var(--accent)' : 'var(--text2)' }}>
                                    S{numSem}
                                  </span>

                                  <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{fechaStr}</span>

                                  {!editMode ? (
                                    <span style={{ fontSize: 12, color: semData?.objetivo ? 'var(--text)' : 'var(--text3)', fontStyle: semData?.objetivo ? 'normal' : 'italic' }}>
                                      {semData?.objetivo || 'Sin objetivo'}
                                    </span>
                                  ) : (
                                    <input
                                      value={getInlineValue('semana', semData?.id || semKey, 'objetivo', semData?.objetivo || '')}
                                      onChange={e => { e.stopPropagation(); handleInlineChange('semana', semData?.id || semKey, 'objetivo', e.target.value) }}
                                      onBlur={async e => {
                                        e.stopPropagation()
                                        const val = e.target.value
                                        if (semData?.id) {
                                          await supabase.from('semanas').update({ objetivo: val || null }).eq('id', semData.id)
                                        } else {
                                          await supabase.from('semanas').insert({ bloque_id: b.id, planificacion_id: planificacion?.id, fecha_inicio_semana: fIniSemStr, numero: numSem, objetivo: val || null, carga: 'media' })
                                        }
                                        cargarPlanificacion()
                                      }}
                                      onClick={e => e.stopPropagation()}
                                      placeholder="Añadir objetivo..."
                                      style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-light)', outline: 'none', width: '100%' }}
                                    />
                                  )}

                                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 8, background: carga.color + '20', color: carga.color, width: 'fit-content' }}>
                                    {carga.label}
                                  </span>

                                  {esResistencia && (
                                    editMode ? (
                                      <input type="number" min="0"
                                        value={getInlineValue('semana', semData?.id || semKey, 'km_real', semData?.km_real || '')}
                                        onChange={e => { e.stopPropagation(); handleInlineChange('semana', semData?.id || semKey, 'km_real', e.target.value) }}
                                        onBlur={async e => {
                                          e.stopPropagation()
                                          if (semData?.id) await supabase.from('semanas').update({ km_real: e.target.value ? parseInt(e.target.value) : null }).eq('id', semData.id)
                                          cargarPlanificacion()
                                        }}
                                        onClick={e => e.stopPropagation()}
                                        style={{ fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--accent-light)', outline: 'none', width: 64, fontFamily: 'var(--mono)' }}
                                      />
                                    ) : (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: kmColor, fontFamily: 'var(--mono)' }}>
                                          {kmReal != null ? `${kmReal} km` : '—'}
                                        </span>
                                        {kmObjetivo != null && <span style={{ fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>obj {kmObjetivo}</span>}
                                      </div>
                                    )
                                  )}

                                  {esResistencia && (() => {
                                    const z12o = sub?.zona1_2, z34o = sub?.zona3_4, z5o = sub?.zona5
                                    const totalMin = (semData?.zona1_2_real ?? 0) + (semData?.zona3_4_real ?? 0) + (semData?.zona5_real ?? 0)
                                    const toPct = min => totalMin > 0 ? Math.round(min / totalMin * 100) : null
                                    const z12r = semData?.zona1_2_real != null ? toPct(semData.zona1_2_real) : null
                                    const z34r = semData?.zona3_4_real != null ? toPct(semData.zona3_4_real) : null
                                    const z5r  = semData?.zona5_real   != null ? toPct(semData.zona5_real)   : null
                                    if (!z12o) return <span style={{ fontSize: 10, color: 'var(--text3)' }}>—</span>
                                    return (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }} onClick={e => e.stopPropagation()}>
                                        {[[z12o, z12r, '#3b82f6'], [z34o, z34r, '#f59e0b'], [z5o, z5r, '#ef4444']].map(([obj, real, col], i) => {
                                          if (!obj) return null
                                          const barW = real != null ? Math.min(real, 100) : 0
                                          const tickW = Math.min(obj, 100)
                                          const barCol = real == null ? '#d1d5db' : Math.abs(real - obj) <= 10 ? '#16a34a' : Math.abs(real - obj) <= 20 ? '#f59e0b' : '#ef4444'
                                          return (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                              <div style={{ width: 36, height: 5, background: '#f3f4f6', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barW}%`, background: barCol, borderRadius: 3 }} />
                                                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${tickW}%`, width: 1.5, background: '#6b7280' }} />
                                              </div>
                                              <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text)', flexShrink: 0 }}>{real != null ? `${real}%` : '—'}</span>
                                              <span style={{ fontSize: 9, fontFamily: 'monospace', color: 'var(--text3)', flexShrink: 0 }}>{obj != null ? `(${obj}%)` : ''}</span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  })()}


                                  <button
                                    style={{ fontSize: 13, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
                                    onClick={e => { e.stopPropagation(); openModal('semana', { bloque: b, numero: numSem, semanaData: semData, fechaIni: fIniSemStr }) }}
                                    title="Editar semana">✎</button>
                                </div>

                                {/* ── NIVEL 4: SESIONES ────────────────── */}
                                {semAb && (
                                  <div style={{ padding: '10px 16px 12px 60px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg)' }}>

                                    {/* Cabecera sesiones */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 96px 96px 64px 36px', padding: '4px 0 8px', borderBottom: '0.5px solid var(--border)', gap: 8, marginBottom: 4 }}>
                                      {['', 'Sesión', 'Día', 'Tipo', 'Dur.', ''].map((h, i) => (
                                        <span key={i} style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
                                      ))}
                                    </div>

                                    {sesionesSem.length === 0 && (
                                      <p style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', margin: '6px 0 10px' }}>Sin sesiones esta semana.</p>
                                    )}

                                    {sesionesSem.map(s => {
                                      const tipoBg    = s.tipo_sesion === 'flexible' ? '#eeedfe' : s.tipo_sesion === 'opcional' ? '#f1efe8' : '#e6f1fb'
                                      const tipoColor = s.tipo_sesion === 'flexible' ? '#4a3aa7' : s.tipo_sesion === 'opcional' ? '#52514e' : '#185fa5'
                                      const tipoLabel = s.tipo_sesion === 'flexible' ? 'Flexible' : s.tipo_sesion === 'opcional' ? 'Opcional' : 'Programada'
                                      return (
                                        <div key={s.id}
                                          onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}
                                          onMouseOver={e => e.currentTarget.style.background = 'var(--bg2)'}
                                          onMouseOut={e => e.currentTarget.style.background = ''}
                                          style={{ display: 'grid', gridTemplateColumns: '20px 1fr 96px 96px 64px 36px', padding: '7px 0', borderBottom: '0.5px solid var(--border)', gap: 8, alignItems: 'center', cursor: 'pointer', borderRadius: 4 }}>
                                          <span style={{ fontSize: 14 }}>
                                            {s.icono || iconoSesion(s)}
                                          </span>
                                          <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                                              {s.titulo}
                                              {s.estado === 'completada'   && <span title="Completada"    style={{ fontSize: 12 }}>✅</span>}
                                              {s.estado === 'parcial'      && <span title="Parcial"       style={{ fontSize: 12 }}>〜</span>}
                                              {s.estado === 'realizada'    && <span title="Realizada"     style={{ fontSize: 12 }}>🔵</span>}
                                              {s.estado === 'no_realizada' && <span title="No realizada"  style={{ fontSize: 12 }}>❌</span>}
                                            </div>
                                            {s.objetivo && <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}><span style={{ fontStyle: 'normal', marginRight: 4, color: 'var(--text3)' }}>·</span>{s.objetivo}</div>}
                                          </div>
                                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                                            {s.fecha ? format(parseISO(s.fecha), 'EEE d MMM', { locale: es }) : 'Sin día'}
                                          </span>
                                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, width: 'fit-content', background: tipoBg, color: tipoColor, border: s.tipo_sesion === 'flexible' ? `0.5px dashed ${tipoColor}66` : undefined }}>
                                            {tipoLabel}
                                          </span>
                                          <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{s.duracion_min ? `${s.duracion_min} min` : '—'}</span>
                                          <button
                                            style={{ fontSize: 13, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                                            onClick={e => { e.stopPropagation(); if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: s.id }); if (setPage) setPage('sesiones') }}>✎</button>
                                        </div>
                                      )
                                    })}

                                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                                      onClick={() => { if (setSesionesContext) setSesionesContext({ clienteId: clienteSeleccionado, sesionId: 'nueva', fechaNueva: format(fIniSem, 'yyyy-MM-dd') }); if (setPage) setPage('sesiones') }}>
                                      <Plus size={12} /> Añadir sesión
                                    </button>
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
            )}
          </div>
        )
      })}
    </div>
  )
}
