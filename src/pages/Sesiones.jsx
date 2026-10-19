import { useState, useEffect, useRef, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { supabase } from '../lib/supabase'
import { clonarSesion } from '../lib/clonarSesion'
import { format, parseISO } from 'date-fns'
import EmojiPicker from '../components/EmojiPicker'
import ModalComentarioEntrenadora from '../components/ModalComentarioEntrenadora'
import { es } from 'date-fns/locale'
import { Plus, X, Trash2, Copy, Play } from 'lucide-react'

const COLORES = ['#E29A2E', '#4C82E8', '#2FAE76', '#8B6CE0', '#34AEB8', '#DD6F97']

const BORG_RPE = {
  1:  { label: 'Muy, muy leve',     desc: 'Esfuerzo casi inapreciable. Conversación completamente fluida.' },
  2:  { label: 'Leve',              desc: 'Esfuerzo ligero y cómodo. Puedes hablar sin ningún problema.' },
  3:  { label: 'Moderado',          desc: 'Esfuerzo controlado. Conversación fácil en frases largas. Zona aeróbica baja.' },
  4:  { label: 'Algo intenso',      desc: 'Esfuerzo notable pero sostenible. Puedes hablar en frases cortas.' },
  5:  { label: 'Intenso',           desc: 'Claramente exigente. Conversación posible pero entrecortada. Zona aeróbica-umbral.' },
  6:  { label: 'Intenso-alto',      desc: 'Esfuerzo elevado. Hablar cuesta. Solo frases muy cortas.' },
  7:  { label: 'Muy intenso',       desc: 'Muy exigente. Solo palabras sueltas. Cerca del umbral anaeróbico.' },
  8:  { label: 'Muy intenso-alto',  desc: 'Respiración forzada. Sin conversación posible. Difícil de sostener.' },
  9:  { label: 'Muy, muy intenso',  desc: 'Casi insostenible. Esfuerzo máximo sostenido solo unos pocos minutos.' },
  10: { label: 'Máximo absoluto',   desc: 'Esfuerzo total. No puedes más. Solo aguantable unos segundos.' },
}
const METODOS_SESION = [
  { id: 'individual', icono: '⬜', nombre: 'Individual',        desc: 'Completa todas las series de cada ejercicio antes de pasar al siguiente. Descansa entre series el tiempo indicado.' },
  { id: 'superserie', icono: '⇅',  nombre: 'Superserie',        desc: 'Haz el ejercicio A y pasa directamente al B sin descansar. Cuando termines los dos, descansa y repite.' },
  { id: 'triserie',   icono: '↓↓', nombre: 'Triserie',          desc: 'Haz A, B y C sin descansar entre ellos. Al terminar los tres, descansa y repite.' },
  { id: 'circuito',   icono: '🔄', nombre: 'Circuito',          desc: 'Pasa de ejercicio en ejercicio sin descansar hasta completar la vuelta. Luego descansa y repite.' },
  { id: 'complejo',   icono: '🔗', nombre: 'Complejo',          desc: 'Todos los ejercicios seguidos sin soltar el implemento. Solo descansas al completar la secuencia.' },
  { id: 'contrast',   icono: '↯',  nombre: 'Contrast Training', desc: 'Ejercicio pesado seguido de uno explosivo del mismo patrón. Luego descansas completo y repites.' },
  { id: 'cluster',    icono: '⏸',  nombre: 'Cluster',           desc: 'Series divididas en mini-grupos con microdescansos entre ellos.' },
  { id: 'emom',       icono: '⏱',  nombre: 'EMOM',              desc: 'Al inicio de cada minuto completa el trabajo. El tiempo restante es tu descanso.' },
  { id: 'amrap',      icono: '🔁', nombre: 'AMRAP',             desc: 'Máximo trabajo en el tiempo fijo. Anota las rondas completadas.' },
]
const DESCRIPCIONES_METODO = Object.fromEntries(METODOS_SESION.map(m => [m.id, m.desc]))
const METODO_COLOR = { individual: '#4a6fa5', superserie: '#3a8a6e', triserie: '#3a8a6e', circuito: '#4a6fa5', complejo: '#c07a3a', contrast: '#6b5b9e', cluster: '#c07a3a', emom: '#b04a4a', amrap: '#3a8a7e' }

const METODOS_SERIES_BLOQUE = ['superserie','triserie','circuito','complejo','contrast','cluster','emom','amrap']

const getLabelVueltas = (metodo) => {
  if (metodo === 'circuito' || metodo === 'amrap') return 'vueltas'
  if (metodo === 'emom') return 'min'
  return 'series'
}

const getLabelDescansoEntre = (metodo) => {
  if (metodo === 'circuito' || metodo === 'amrap') return 'Desc. entre vueltas'
  return 'Desc. entre series'
}

const getLabelEjercicio = (metodo, eIdx) => {
  const circ = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨']
  switch (metodo) {
    case 'circuito': return circ[eIdx] || `${eIdx+1}`
    case 'amrap':    return circ[eIdx] || `${eIdx+1}`
    case 'contrast': return ['P','E','V'][eIdx] || String.fromCharCode(65+eIdx)
    case 'emom':     return `M${eIdx+1}`
    default:         return String.fromCharCode(65+eIdx)
  }
}
const COLORES_BLOQUE = ['#4a6fa5','#3a8a6e','#c07a3a','#6b5b9e','#b04a4a','#3a8a7e','#7a6a3a','#4a8a8a','#8a4a6a','#6a7a4a']
const VARS_DEFAULT_METODO = {
  individual:  ['Peso', 'RIR'],
  superserie:  ['Peso', 'RIR'],
  triserie:    ['Peso', 'RIR'],
  circuito:    ['Peso', 'Duración'],
  complejo:    ['Peso'],
  contrast:    ['Peso', 'RIR'],
  cluster:     ['Peso', 'RIR', 'Descanso'],
  emom:        ['Duración'],
  amrap:       ['Duración'],
}
const EMPTY_SESION = { titulo: '', fecha: '', objetivo: '', notas_entrenador: '', duracion_min: '', sinFecha: false, tipo_sesion: 'programada', estado: 'pendiente', tipo_editor: 'fuerza', con_feedback: true, icono: '', tipo_sesion_detalle: null, modalidad: 'autonoma', lugar: '', lista: false, publicada: true }
function ytId(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

async function ytTitulo(url) {
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`)
    const data = await res.json()
    return data.title || null
  } catch {
    return null
  }
}

/* input que guarda solo, sin botones, al perder el foco o tras una pausa */
function InlineInput({ value, onSave, placeholder, style, textarea, fontSize, type }) {
  const [v, setV] = useState(value || '')
  const timer = useRef(null)
  useEffect(() => { setV(value || '') }, [value])
  function handleChange(e) {
    const val = e.target.value
    setV(val)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSave(val), 700)
  }
  function handleBlur() {
    clearTimeout(timer.current)
    onSave(v)
  }
  const Comp = textarea ? 'textarea' : 'input'
  return (
    <Comp
      type={textarea ? undefined : (type || 'text')}
      value={v}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      min={type === 'number' ? 0 : undefined}
      style={{
        border: 'none', background: 'transparent', outline: 'none', width: '100%',
        fontFamily: 'inherit', fontSize: fontSize || 13, color: 'inherit', padding: 0,
        resize: textarea ? 'vertical' : 'none', ...style,
      }}
      rows={textarea ? 2 : undefined}
    />
  )
}

export default function Sesiones({ clienteInicial, sesionInicialId, fechaNuevaSesion, esPlantilla, setPage, setClientePlanificacion, setRecargarPlan }) {
  const [clientes, setClientes] = useState([])
  const [clienteSeleccionado, setClienteSeleccionado] = useState(clienteInicial || null)
  const [sesiones, setSesiones] = useState([])
  const [loading, setLoading] = useState(false)
  const [sesionAbierta, setSesionAbierta] = useState(null)
  const sesionInicialCargada = useRef(false)
  const [bloques, setBloques] = useState([])

  const FORM_CREAR_EJ_EMPTY = { nombre: '', descripcion: '', notas: '', ejecucion_tipo: '', media_tipo: 'youtube', media_url: '', video_url: '' }
  const [modalCrearEj, setModalCrearEj] = useState(null) // { bloqueId, variablesDefault }
  const [formCrearEj, setFormCrearEj] = useState(FORM_CREAR_EJ_EMPTY)
  const [guardandoCrearEj, setGuardandoCrearEj] = useState(false)
  const [errorCrearEj, setErrorCrearEj] = useState(null)
  const [ejercicios, setEjercicios] = useState({})

  const [dirty, setDirty] = useState(false)
  const [mostrarSelectorMetodo, setMostrarSelectorMetodo] = useState(false)
  const [avisoSinGuardar, setAvisoSinGuardar] = useState(false)
  const [modalSesion, setModalSesion] = useState(null)
  const [modalComentario, setModalComentario] = useState(null) // { sesionId, sesionTitulo, clienteEmail, inicial }
  const [formSesion, setFormSesion] = useState(EMPTY_SESION)
  const [formCompletadaEl, setFormCompletadaEl] = useState('')
  const [saving, setSaving] = useState(false)
  const [draggingEj, setDraggingEj] = useState(null)
  const [ejExpandido, setEjExpandido] = useState(null)
  const [ytActivo, setYtActivo] = useState({})
  const [descansoEnMin, setDescansoEnMin] = useState({})
  const [descEjEnMin, setDescEjEnMin] = useState({})
  const [editandoMetodo, setEditandoMetodo] = useState(null)
  const [editandoDescripcion, setEditandoDescripcion] = useState(null)
  const [colorPickerBloque, setColorPickerBloque] = useState(null) // { bloqueId, x, y }
  const [vistaPrevia, setVistaPrevia] = useState(false)
  const [menuVariableAbierto, setMenuVariableAbierto] = useState(null)
  const [menuVariablePos, setMenuVariablePos] = useState({ x: 0, y: 0 })
  const [modalBiblioteca, setModalBiblioteca] = useState(null) // { bloqueId, variablesDefault }
  const [biblioteca, setBiblioteca] = useState(null) // null = no cargada aún
  const [panelBiblioteca, setPanelBiblioteca] = useState(false)
  const [guardandoEnBib, setGuardandoEnBib] = useState(false)
  const [busquedaBiblioteca, setBusquedaBiblioteca] = useState('')
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [mediaPreview, setMediaPreview] = useState(null) // { tipo, ytid, url, x, y }
  const [inputInlineBloque, setInputInlineBloque] = useState(null) // id del bloque con input abierto
  const mediaPreviewTimeout = useRef(null)
const [modalDuplicar, setModalDuplicar] = useState(null)
  const [fechaDuplicar, setFechaDuplicar] = useState('')
  const [clipboard, setClipboard] = useState(null)
  const [menuContextual, setMenuContextual] = useState(null)
  const [modalCompCal, setModalCompCal] = useState(false)
  const [formCompCal, setFormCompCal] = useState({ nombre: '', fecha: '', tipo: '', objetivo: '', notas: '' })
  const [editandoComp, setEditandoComp] = useState(null)
  const [modalNotaCal, setModalNotaCal] = useState(false)
  const [formNotaCal, setFormNotaCal] = useState({ texto: '', fecha: '' })
  const [editandoNota, setEditandoNota] = useState(null)
  const [packs, setPacks] = useState([])
  const [modalPack, setModalPack] = useState(null)
  const [formPack, setFormPack] = useState({ nombre: '', fecha_inicio: '', fecha_fin: '', descripcion: '' })
  const [savingPack, setSavingPack] = useState(false)
  const [feedbacks, setFeedbacks] = useState({}) // { sesion_id: feedback_data }
  useEffect(() => { cargarClientes() }, [])
  useEffect(() => { if (clienteSeleccionado) cargarSesiones() }, [clienteSeleccionado])
  useEffect(() => { if (sesionAbierta) { cargarDetalle(sesionAbierta.id); setDirty(false); setAvisoSinGuardar(false) } }, [sesionAbierta])
  useEffect(() => {
    if (esPlantilla && sesionInicialId && !sesionInicialCargada.current) {
      sesionInicialCargada.current = true
      supabase.from('sesiones').select('*').eq('id', sesionInicialId).single().then(({ data }) => {
        if (data) setSesionAbierta(data)
      })
    }
  }, [esPlantilla, sesionInicialId])
  useEffect(() => {
    if (!menuVariableAbierto) return
    function handler(ev) {
      if (ev.target.closest('[data-var-menu]')) return
      setMenuVariableAbierto(null)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [menuVariableAbierto])

  useEffect(() => {
    if (!colorPickerBloque) return
    function handler(ev) {
      if (ev.target.closest('[data-color-picker]')) return
      setColorPickerBloque(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colorPickerBloque])

  async function cargarClientes() {
    const { data } = await supabase.from('clientes').select('id, nombre').eq('estado', 'activo').order('nombre')
    setClientes(data || [])
  }

  const [notas, setNotas] = useState([])
  const [competicionesCal, setCompeticionesCal] = useState([])

  const [bloquesPlan, setBloquesPlan] = useState([])
  const [subbloquesPlan, setSubbloquesPlan] = useState({})

  const [controlesCal, setControlesCal] = useState([])
  const [fases, setFases] = useState([])
  const [carritoItems, setCarritoItems] = useState([]) // lista combinada fases sueltas + grupos para editor carrera
  const [draggingCarrito, setDraggingCarrito] = useState(null) // { idx, grupoId?, innerIdx? }
  const [ctxCarrito, setCtxCarrito] = useState(null) // { x, y, item, grupoId?, innerIdx? }
  const [clipboardBloque, setClipboardBloque] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('idelri_clipboardBloque') || 'null') } catch { return null }
  })
  const [toastCopiado, setToastCopiado] = useState(null)
  const [tabBiblioteca, setTabBiblioteca] = useState('ejercicios')
  const [bloquesBiblioteca, setBloquesBiblioteca] = useState(null)
  const [libDragActive, setLibDragActive] = useState(false)
  const [dragOverBloqueId, setDragOverBloqueId] = useState(null)
  const [draggingBloqueId, setDraggingBloqueId] = useState(null)

  // ── PORTAPAPELES DE BLOQUES ──
  function guardarEnPortapapeles(data) {
    setClipboardBloque(data)
    try { sessionStorage.setItem('idelri_clipboardBloque', JSON.stringify(data)) } catch {}
    setToastCopiado(data.nombre)
    setTimeout(() => setToastCopiado(null), 2200)
  }
  function limpiarPortapapeles() {
    setClipboardBloque(null)
    try { sessionStorage.removeItem('idelri_clipboardBloque') } catch {}
  }
  // Helpers de clonado — excluyen IDs y resultados del cliente
  function cloneEjercicioPayload(e) {
    const { id, bloque_id, valores_reales, ...p } = e
    return p
  }
  function cloneBloquePayload(b) {
    const { id, sesion_id, ...p } = b
    return p
  }
  function cloneFasePayload(f) {
    const { id, sesion_id, grupo_id, ...p } = f
    return p
  }
  // Copy
  function copiarFase(fase) {
    guardarEnPortapapeles({ tipo: 'bloque_carrera', nombre: fase.nombre || 'Bloque', payload: { fase: cloneFasePayload(fase) } })
  }
  function copiarGrupo(grupo) {
    guardarEnPortapapeles({ tipo: 'grupo_carrera', nombre: `${grupo.repeticiones}× grupo`, payload: { grupo: { repeticiones: grupo.repeticiones }, fases: grupo.fases.map(f => cloneFasePayload(f)) } })
  }
  function copiarBloqueFuerza(bloque) {
    const ejs = (ejercicios[bloque.id] || []).map(e => cloneEjercicioPayload(e))
    guardarEnPortapapeles({ tipo: 'bloque_fuerza', nombre: bloque.nombre || 'Bloque', payload: { bloque: cloneBloquePayload(bloque), ejercicios: ejs } })
  }
  // Paste
  async function pegarDesdePortapapeles() {
    if (!clipboardBloque || !sesionAbierta) return
    const { tipo, payload } = clipboardBloque
    if (tipo === 'bloque_carrera') {
      const orden = nextCarritoOrden(carritoItems)
      const { data } = await supabase.from('sesion_fases').insert({ ...payload.fase, sesion_id: sesionAbierta.id, orden, grupo_id: null }).select().single()
      if (data) { setCarritoItems(ci => [...ci, { type: 'fase', ...data }]); setDirty(true) }
    } else if (tipo === 'grupo_carrera') {
      const orden = nextCarritoOrden(carritoItems)
      const { data: grp } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionAbierta.id, repeticiones: payload.grupo.repeticiones, orden }).select().single()
      if (!grp) return
      const fases = []
      for (let i = 0; i < payload.fases.length; i++) {
        const { data: f } = await supabase.from('sesion_fases').insert({ ...payload.fases[i], sesion_id: sesionAbierta.id, orden: i, grupo_id: grp.id }).select().single()
        if (f) fases.push(f)
      }
      setCarritoItems(ci => [...ci, { type: 'grupo', ...grp, fases }]); setDirty(true)
    } else if (tipo === 'bloque_fuerza') {
      const orden = bloques.length
      const { data: nb } = await supabase.from('sesion_bloques').insert({ ...payload.bloque, sesion_id: sesionAbierta.id, orden }).select().single()
      if (!nb) return
      const nuevosEjs = []
      for (let i = 0; i < payload.ejercicios.length; i++) {
        const { data: e } = await supabase.from('sesion_ejercicios').insert({ ...payload.ejercicios[i], bloque_id: nb.id, orden: i }).select().single()
        if (e) nuevosEjs.push(e)
      }
      setBloques(bs => [...bs, nb]); setEjercicios(ej => ({ ...ej, [nb.id]: nuevosEjs })); setDirty(true)
    }
  }

  // ── BIBLIOTECA DE BLOQUES ──────────────────────────────────────────────
  async function cargarBloquesBiblioteca() {
    if (bloquesBiblioteca !== null) return
    const { data } = await supabase.from('bloques_biblioteca').select('*, bloques_biblioteca_ejercicios(*)').order('nombre')
    setBloquesBiblioteca((data || []).map(b => ({ ...b, ejercicios: (b.bloques_biblioteca_ejercicios || []).sort((a, z) => a.orden - z.orden) })))
  }

  async function guardarBloqueEnBiblioteca(bloque) {
    const ejs = ejercicios[bloque.id] || []
    const { data: nb } = await supabase.from('bloques_biblioteca').insert({
      nombre: bloque.nombre || 'Bloque sin nombre',
      descripcion: bloque.nota || null,
      color: bloque.color || '#2d6a4f',
    }).select().single()
    if (!nb) { alert('Error al guardar en biblioteca'); return }
    for (let i = 0; i < ejs.length; i++) {
      const { id, bloque_id, valores_reales, ...p } = ejs[i]
      await supabase.from('bloques_biblioteca_ejercicios').insert({ ...p, bloque_bib_id: nb.id, orden: i })
    }
    setBloquesBiblioteca(null) // forzar recarga la próxima vez
    setToastCopiado('guardado en biblioteca')
    setTimeout(() => setToastCopiado(null), 2200)
  }

  async function insertarEjercicioDesdePanel(libEj, bloqueId) {
    const lista = ejercicios[bloqueId] || []
    const { data: e } = await supabase.from('sesion_ejercicios').insert({
      bloque_id: bloqueId, nombre: libEj.nombre,
      series: '', reps: '', rpe: '', notas: '',
      media_tipo: libEj.media_tipo || 'youtube',
      media_url: libEj.media_url || '',
      video_url: libEj.video_url || '',
      orden: lista.length, variables_activas: VARS_DEFAULT_METODO[bloques.find(b => b.id === bloqueId)?.metodo || 'individual'] || VARS_DEFAULT_METODO.individual,
      biblioteca_id: libEj.id || null,
    }).select().single()
    if (e) { setEjercicios(ej => ({ ...ej, [bloqueId]: [...(ej[bloqueId] || []), e] })); setDirty(true) }
  }

  async function insertarBloqueDesdePanel(bibBloque) {
    const { data: nb } = await supabase.from('sesion_bloques').insert({
      sesion_id: sesionAbierta.id,
      nombre: bibBloque.nombre,
      color: bibBloque.color || COLORES[0],
      nota: bibBloque.descripcion || '',
      orden: bloques.length,
    }).select().single()
    if (!nb) return
    const bibEjs = bibBloque.ejercicios || []
    const nuevosEjs = []
    for (let i = 0; i < bibEjs.length; i++) {
      const { id, bloque_bib_id, ...p } = bibEjs[i]
      const { data: e } = await supabase.from('sesion_ejercicios').insert({ ...p, bloque_id: nb.id, orden: i, valores_reales: null }).select().single()
      if (e) nuevosEjs.push(e)
    }
    setBloques(bs => [...bs, nb])
    setEjercicios(ej => ({ ...ej, [nb.id]: nuevosEjs }))
    setDirty(true)
  }

  async function reordenarBloques(fromId, toId) {
    if (fromId === toId) return
    const lista = [...bloques]
    const fromIdx = lista.findIndex(b => b.id === fromId)
    const toIdx = lista.findIndex(b => b.id === toId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = lista.splice(fromIdx, 1)
    lista.splice(toIdx, 0, moved)
    const actualizados = lista.map((b, i) => ({ ...b, orden: i }))
    setBloques(actualizados)
    await Promise.all(actualizados.map(b => supabase.from('sesion_bloques').update({ orden: b.orden }).eq('id', b.id)))
    setDirty(true)
  }

  // Cerrar menú contextual del carrito al hacer clic fuera
  useEffect(() => {
    if (!ctxCarrito) return
    function handler() { setCtxCarrito(null) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [ctxCarrito])

  async function cargarSesiones() {
    setLoading(true)
    const [{ data: ses }, { data: nots }, { data: comps }, { data: ctrls }, { data: plan }, { data: pks }] = await Promise.all([
      supabase.from('sesiones').select('*').eq('cliente_id', clienteSeleccionado).order('fecha', { ascending: true }).order('orden', { ascending: true }),
      supabase.from('sesion_notas').select('*').eq('cliente_id', clienteSeleccionado).order('fecha'),
      supabase.from('competiciones').select('*').eq('cliente_id', clienteSeleccionado).order('fecha'),
      supabase.from('controles').select('*').eq('cliente_id', clienteSeleccionado).order('fecha'),
      supabase.from('planificaciones').select('id, fecha_inicio').eq('cliente_id', clienteSeleccionado).order('fecha_inicio', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('packs_flexibles').select('*').eq('cliente_id', clienteSeleccionado).order('fecha_inicio'),
    ])
    setSesiones(ses || [])
    // Cargar feedbacks de las sesiones de este cliente
    if (ses && ses.length > 0) {
      const sesIds = ses.map(s => s.id)
      const { data: fbs } = await supabase.from('sesion_feedback').select('sesion_id, data, submitted_at').in('sesion_id', sesIds)
      const fbMap = {}
      ;(fbs || []).forEach(f => { fbMap[f.sesion_id] = f })
      setFeedbacks(fbMap)
    } else {
      setFeedbacks({})
    }
    setNotas(nots || [])
    setCompeticionesCal(comps || [])
    setControlesCal(ctrls || [])
    setPacks(pks || [])
    if (sesionInicialId === 'nueva' && !sesionInicialCargada.current) {
      sesionInicialCargada.current = true
      if (fechaNuevaSesion) {
        setFormSesion({ ...EMPTY_SESION, fecha: fechaNuevaSesion })
        setModalSesion('nueva')
      } else {
        abrirNuevaSesion()
      }
    } else if (sesionInicialId && sesionInicialId !== 'nueva' && !sesionInicialCargada.current) {
      sesionInicialCargada.current = true
      const sesInicial = (ses || []).find(s => s.id === sesionInicialId)
      setSesionAbierta(sesInicial || null)
    } else {
      // Solo cerrar la sesión abierta si no hay ninguna actualmente
      setSesionAbierta(prev => prev ? prev : null)
    }

    if (plan) {
      const { data: bls } = await supabase.from('bloques').select('*').eq('planificacion_id', plan.id).order('orden')
      setBloquesPlan(bls || [])
      if (bls && bls.length > 0) {
        const { data: subs } = await supabase.from('subbloques').select('*').in('bloque_id', bls.map(b => b.id)).order('semana_inicio')
        const map = {}
        ;(subs || []).forEach(s => { if (!map[s.bloque_id]) map[s.bloque_id] = []; map[s.bloque_id].push(s) })
        setSubbloquesPlan(map)
      }
    } else {
      setBloquesPlan([])
      setSubbloquesPlan({})
    }
    setLoading(false)
  }
  async function cargarDetalle(sesionId) {
    const [{ data: bls }, { data: fs }, { data: grps }] = await Promise.all([
      supabase.from('sesion_bloques').select('*').eq('sesion_id', sesionId).order('orden'),
      supabase.from('sesion_fases').select('*').eq('sesion_id', sesionId).order('orden'),
      supabase.from('sesion_fase_grupos').select('*').eq('sesion_id', sesionId).order('orden'),
    ])
    setBloques(bls || [])
    setFases(fs || [])
    // Construir lista combinada para editor carrera
    const gruposMap = {}
    ;(grps || []).forEach(g => { gruposMap[g.id] = { type: 'grupo', ...g, fases: [] } })
    const fasesLibres = []
    ;(fs || []).forEach(f => {
      if (f.grupo_id && gruposMap[f.grupo_id]) gruposMap[f.grupo_id].fases.push(f)
      else fasesLibres.push({ type: 'fase', ...f })
    })
    const combined = [...fasesLibres, ...Object.values(gruposMap)].sort((a, b) => a.orden - b.orden)
    setCarritoItems(combined)
    if (bls && bls.length > 0) {
      const { data: ejs } = await supabase.from('sesion_ejercicios').select('*').in('bloque_id', bls.map(b => b.id)).order('orden')
      const map = {}
      ;(ejs || []).forEach(e => { if (!map[e.bloque_id]) map[e.bloque_id] = []; map[e.bloque_id].push(e) })
      setEjercicios(map)
    } else {
      setEjercicios({})
    }
  }

  // ── Carrito helpers ──────────────────────────────────────────────────
  function nextCarritoOrden(ci) {
    return ci.reduce((m, it) => Math.max(m, it.orden ?? 0), -1) + 1
  }

  async function añadirBloqueSuelto() {
    const orden = nextCarritoOrden(carritoItems)
    const { data } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: '', orden, grupo_id: null }).select().single()
    if (data) setCarritoItems(ci => [...ci, { type: 'fase', ...data }])
    setDirty(true)
  }

  async function añadirGrupoCarrera() {
    const orden = nextCarritoOrden(carritoItems)
    const { data: grp } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionAbierta.id, repeticiones: 3, orden }).select().single()
    if (!grp) return
    const { data: f1 } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: '', orden: 0, grupo_id: grp.id }).select().single()
    const { data: f2 } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: '', orden: 1, grupo_id: grp.id }).select().single()
    setCarritoItems(ci => [...ci, { type: 'grupo', ...grp, fases: [f1, f2].filter(Boolean) }])
    setDirty(true)
  }

  async function eliminarBloqueCarrito(id) {
    setCarritoItems(ci => ci.filter(it => it.id !== id))
    await supabase.from('sesion_fases').delete().eq('id', id)
    setDirty(true)
  }

  async function eliminarGrupoCarrito(id) {
    setCarritoItems(ci => ci.filter(it => it.id !== id))
    await supabase.from('sesion_fase_grupos').delete().eq('id', id)
    setDirty(true)
  }

  async function actualizarBloqueCarrito(id, campo, valor, grupoId) {
    setCarritoItems(ci => ci.map(it => {
      if (grupoId) return it.id === grupoId ? { ...it, fases: it.fases.map(f => f.id === id ? { ...f, [campo]: valor } : f) } : it
      return it.id === id ? { ...it, [campo]: valor } : it
    }))
    await supabase.from('sesion_fases').update({ [campo]: valor }).eq('id', id)
    setDirty(true)
  }

  async function cambiarRepeticionesGrupo(grupoId, delta) {
    const grupo = carritoItems.find(it => it.id === grupoId && it.type === 'grupo')
    if (!grupo) return
    const next = Math.max(2, grupo.repeticiones + delta)
    await supabase.from('sesion_fase_grupos').update({ repeticiones: next }).eq('id', grupoId)
    setCarritoItems(ci => ci.map(it => it.id === grupoId && it.type === 'grupo' ? { ...it, repeticiones: next } : it))
    setDirty(true)
  }

  async function añadirFaseAGrupoCarrito(grupoId) {
    const grp = carritoItems.find(it => it.id === grupoId)
    if (!grp) return
    const { data } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: '', orden: grp.fases.length, grupo_id: grupoId }).select().single()
    if (data) setCarritoItems(ci => ci.map(it => it.id === grupoId ? { ...it, fases: [...it.fases, data] } : it))
    setDirty(true)
  }

  async function eliminarFaseDeGrupoCarrito(faseId, grupoId) {
    setCarritoItems(ci => ci.map(it => it.id === grupoId ? { ...it, fases: it.fases.filter(f => f.id !== faseId) } : it))
    await supabase.from('sesion_fases').delete().eq('id', faseId)
    setDirty(true)
  }

  async function duplicarBloqueCarrito(id, grupoId) {
    if (grupoId) {
      const grp = carritoItems.find(it => it.id === grupoId)
      if (!grp) return
      const src = grp.fases.find(f => f.id === id)
      if (!src) return
      const { data } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: src.nombre, descripcion: src.descripcion, volumen_min: src.volumen_min, volumen_km: src.volumen_km, fc_zona: src.fc_zona, ritmo_inicio: src.ritmo_inicio, ritmo_fin: src.ritmo_fin, rpe: src.rpe, orden: grp.fases.length, grupo_id: grupoId }).select().single()
      if (data) setCarritoItems(ci => ci.map(it => {
        if (it.id !== grupoId) return it
        const idx = it.fases.findIndex(f => f.id === id)
        const nf = [...it.fases]; nf.splice(idx + 1, 0, data)
        return { ...it, fases: nf }
      }))
    } else {
      const src = carritoItems.find(it => it.id === id)
      if (!src) return
      const { data } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: src.nombre, descripcion: src.descripcion, volumen_min: src.volumen_min, volumen_km: src.volumen_km, fc_zona: src.fc_zona, ritmo_inicio: src.ritmo_inicio, ritmo_fin: src.ritmo_fin, rpe: src.rpe, orden: nextCarritoOrden(carritoItems), grupo_id: null }).select().single()
      if (data) setCarritoItems(ci => { const idx = ci.findIndex(it => it.id === id); const n = [...ci]; n.splice(idx + 1, 0, { type: 'fase', ...data }); return n })
    }
    setDirty(true)
  }

  async function duplicarGrupoCarrito(grupoId) {
    const src = carritoItems.find(it => it.id === grupoId)
    if (!src) return
    const { data: newGrp } = await supabase.from('sesion_fase_grupos').insert({ sesion_id: sesionAbierta.id, repeticiones: src.repeticiones, orden: nextCarritoOrden(carritoItems) }).select().single()
    if (!newGrp) return
    const newFases = []
    for (const f of src.fases) {
      const { data: nf } = await supabase.from('sesion_fases').insert({ sesion_id: sesionAbierta.id, nombre: f.nombre, descripcion: f.descripcion, volumen_min: f.volumen_min, volumen_km: f.volumen_km, fc_zona: f.fc_zona, ritmo_inicio: f.ritmo_inicio, ritmo_fin: f.ritmo_fin, rpe: f.rpe, orden: f.orden, grupo_id: newGrp.id }).select().single()
      if (nf) newFases.push(nf)
    }
    setCarritoItems(ci => { const idx = ci.findIndex(it => it.id === grupoId); const n = [...ci]; n.splice(idx + 1, 0, { type: 'grupo', ...newGrp, fases: newFases }); return n })
    setDirty(true)
  }

  async function reordenarCarrito(fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    const n = [...carritoItems]; const [m] = n.splice(fromIdx, 1); n.splice(toIdx, 0, m)
    setCarritoItems(n)
    await Promise.all(n.map((it, i) =>
      it.type === 'fase'
        ? supabase.from('sesion_fases').update({ orden: i }).eq('id', it.id)
        : supabase.from('sesion_fase_grupos').update({ orden: i }).eq('id', it.id)
    ))
    setDirty(true)
  }

  async function reordenarFasesEnGrupo(grupoId, fromIdx, toIdx) {
    if (fromIdx === toIdx) return
    setCarritoItems(ci => ci.map(it => {
      if (it.id !== grupoId) return it
      const f = [...it.fases]; const [m] = f.splice(fromIdx, 1); f.splice(toIdx, 0, m)
      f.forEach((fase, i) => supabase.from('sesion_fases').update({ orden: i }).eq('id', fase.id))
      return { ...it, fases: f }
    }))
    setDirty(true)
  }

  // legacy (kept for compatibility with old sessions that call actualizarFase directly)
  async function añadirFase() {
    await añadirBloqueSuelto()
  }
  async function actualizarFase(id, campo, valor) {
    await actualizarBloqueCarrito(id, campo, valor, null)
  }
  async function eliminarFase(id) {
    await eliminarBloqueCarrito(id)
  }

  function abrirNuevaSesion() {
    setFormSesion({ ...EMPTY_SESION, fecha: format(new Date(), 'yyyy-MM-dd') })
    setModalSesion('nueva')
  }

  function abrirEditarSesion(s) {
    setFormSesion({ titulo: s.titulo, fecha: s.fecha || '', sinFecha: !s.fecha, objetivo: s.objetivo || '', notas_entrenador: s.notas_entrenador || '', duracion_min: s.duracion_min || '', tipo_sesion: s.tipo_sesion || 'programada', estado: s.estado || 'pendiente', tipo_editor: s.tipo_editor || 'fuerza', con_feedback: s.con_feedback !== false, icono: s.icono || '', tipo_sesion_detalle: s.tipo_sesion_detalle || null, modalidad: s.modalidad || 'autonoma', lugar: s.lugar || '', lista: s.lista || false, publicada: s.publicada !== false })
    setFormCompletadaEl(s.completada_el || '')
    setModalSesion(s)
  }

  async function guardarEnBiblioteca(sesion) {
    if (!sesion) return
    setGuardandoEnBib(true)
    const { data: nueva } = await supabase.from('sesiones').insert({
      titulo: sesion.titulo, objetivo: sesion.objetivo, duracion_min: sesion.duracion_min,
      icono: sesion.icono, tipo_editor: sesion.tipo_editor || 'fuerza',
      es_plantilla: true, cliente_id: null,
    }).select().single()
    if (nueva) {
      const { data: bls } = await supabase.from('sesion_bloques').select('*').eq('sesion_id', sesion.id).order('orden')
      for (const b of bls || []) {
        const { data: nb } = await supabase.from('sesion_bloques').insert({ sesion_id: nueva.id, nombre: b.nombre, color: b.color, nota: b.nota, orden: b.orden }).select().single()
        const { data: ejs } = await supabase.from('sesion_ejercicios').select('*').eq('bloque_id', b.id).order('orden')
        for (const e of ejs || []) {
          await supabase.from('sesion_ejercicios').insert({ bloque_id: nb.id, nombre: e.nombre, series: e.series, reps: e.reps, rpe: e.rpe, notas: e.notas, media_tipo: e.media_tipo, media_url: e.media_url, video_url: e.video_url, orden: e.orden })
        }
      }
    }
    setGuardandoEnBib(false)
    alert('✅ Sesión guardada en la biblioteca.')
  }

async function guardarSesion() {
    if (!formSesion.titulo) return
    if (!formSesion.sinFecha && !formSesion.fecha) return
    setSaving(true)
    const datos = { titulo: formSesion.titulo, fecha: formSesion.sinFecha ? null : formSesion.fecha, objetivo: formSesion.objetivo || null, notas_entrenador: formSesion.notas_entrenador || null, duracion_min: formSesion.duracion_min ? parseInt(formSesion.duracion_min) : null, tipo_sesion: formSesion.tipo_sesion || 'programada', estado: formSesion.estado || 'pendiente', tipo_editor: formSesion.tipo_editor || 'fuerza', con_feedback: formSesion.con_feedback !== false, icono: formSesion.icono || null, tipo_sesion_detalle: formSesion.tipo_sesion_detalle || null, modalidad: formSesion.modalidad || 'autonoma', lugar: formSesion.lugar || null, lista: formSesion.lista || false, publicada: formSesion.publicada !== false }
    if (modalSesion?.id) {
      const fechaCambio = formSesion.fecha !== modalSesion.fecha
      // Si la entrenadora cambia la fecha, sincronizar completada_el y marcar el flag
      const completadaElFinal = fechaCambio
        ? (formSesion.fecha || null)
        : (formCompletadaEl || null)
      const datosConFecha = {
        ...datos,
        completada_el: completadaElFinal,
        ...(fechaCambio ? { fecha_editada_por_entrenadora: true } : {}),
      }
      await supabase.from('sesiones').update(datosConFecha).eq('id', modalSesion.id)
      setSesiones(ss => ss.map(s => s.id === modalSesion.id ? { ...s, ...datosConFecha } : s))
      setSesionAbierta(s => s ? { ...s, ...datosConFecha } : s)
      setSaving(false); setModalSesion(null)
      cargarSesiones() // refresca la lista para que el clipboard siempre tenga datos completos
      return
    }
    // Nueva sesión: se crea vacía, sin bloques ni ejercicios por defecto
    const { data: nueva } = await supabase.from('sesiones').insert({ ...datos, cliente_id: clienteSeleccionado }).select().single()
    if (nueva) {
      setSesionAbierta(nueva)
    }
    setSaving(false); setModalSesion(null); cargarSesiones()
  }

  async function eliminarSesion(id) {
    if (!window.confirm('¿Eliminar esta sesión?')) return
    await supabase.from('sesiones').delete().eq('id', id)
    if (sesionAbierta?.id === id) setSesionAbierta(null)
    cargarSesiones()
  }

  function volverAlCalendario() {
    localStorage.setItem('planVista', 'calendario')
    if (setRecargarPlan) setRecargarPlan(r => r + 1)
    if (setClientePlanificacion && clienteSeleccionado) setClientePlanificacion(clienteSeleccionado)
    if (setPage) setPage('planificacion')
    else setSesionAbierta(null)
  }

  async function actualizarBloque(id, campo, valor) {
    await supabase.from('sesion_bloques').update({ [campo]: valor }).eq('id', id)
    setBloques(bs => bs.map(b => b.id === id ? { ...b, [campo]: valor } : b))
    setDirty(true)
  }

  async function cambiarColorBloque(id, color) {
    await supabase.from('sesion_bloques').update({ color }).eq('id', id)
    setBloques(bs => bs.map(b => b.id === id ? { ...b, color } : b))
    setDirty(true)
  }

  function añadirBloque() {
    setMostrarSelectorMetodo(true)
  }

  async function crearBloqueConMetodo(metodo) {
    const def = METODOS_SESION.find(m => m.id === metodo)
    const { data: b } = await supabase.from('sesion_bloques').insert({
      sesion_id: sesionAbierta.id,
      nombre: def?.nombre || 'Bloque',
      color: COLORES[bloques.length % COLORES.length],
      nota: '',
      orden: bloques.length,
      metodo,
      descripcion_metodo: def?.desc || null,
    }).select().single()
    if (b) {
      setBloques(bs => [...bs, b])
      setEjercicios(e => ({ ...e, [b.id]: [] }))
      setDirty(true)
      setMostrarSelectorMetodo(false)
    }
  }

  async function eliminarBloque(id) {
    if (!window.confirm('¿Eliminar este bloque y sus ejercicios?')) return
    await supabase.from('sesion_bloques').delete().eq('id', id)
    setBloques(bs => bs.filter(b => b.id !== id))
    setDirty(true)
  }

  function abrirCrearEjercicio(bloqueId, variablesDefault = []) {
    setFormCrearEj(FORM_CREAR_EJ_EMPTY)
    setErrorCrearEj(null)
    setModalCrearEj({ bloqueId, variablesDefault })
  }

  async function abrirBiblioteca(bloqueId, variablesDefault = []) {
    setModalBiblioteca({ bloqueId, variablesDefault })
    setBusquedaBiblioteca('')
    if (!biblioteca) {
      const { data } = await supabase.from('ejercicios_biblioteca').select('*').order('nombre')
      setBiblioteca(data || [])
    }
  }

  async function añadirDesdeBiblioteca(item, bloqueIdOverride, variablesDefaultOverride) {
    const bloqueId = bloqueIdOverride || modalBiblioteca?.bloqueId
    const variablesDefault = variablesDefaultOverride !== undefined ? variablesDefaultOverride : (modalBiblioteca?.variablesDefault || [])
    if (!bloqueId) return
    const lista = ejercicios[bloqueId] || []
    const { data: e } = await supabase.from('sesion_ejercicios').insert({
      bloque_id: bloqueId,
      nombre: item.nombre,
      series: '', reps: '', rpe: '', notas: '',
      media_tipo: item.media_tipo || 'youtube',
      media_url: item.media_url || '',
      video_url: item.video_url || '',
      orden: lista.length,
      variables_activas: variablesDefault,
      biblioteca_id: item.id || null,
    }).select().single()
    if (e) { setEjercicios(ej => ({ ...ej, [bloqueId]: [...(ej[bloqueId] || []), e] })); setDirty(true) }
    if (!bloqueIdOverride) setModalBiblioteca(null)
  }

  async function actualizarEjercicio(bloqueId, id, campo, valor) {
    await supabase.from('sesion_ejercicios').update({ [campo]: valor }).eq('id', id)
    setEjercicios(ej => ({ ...ej, [bloqueId]: (ej[bloqueId] || []).map(e => e.id === id ? { ...e, [campo]: valor } : e) }))
    setDirty(true)
  }

  async function guardarEjercicioPersonalizado() {
    if (!formCrearEj.nombre?.trim()) return
    setGuardandoCrearEj(true)
    setErrorCrearEj(null)
    const { bloqueId } = modalCrearEj

    const insertBib = {
      nombre: formCrearEj.nombre.trim(),
      ...(formCrearEj.descripcion ? { descripcion: formCrearEj.descripcion } : {}),
      ...(formCrearEj.notas ? { notas: formCrearEj.notas } : {}),
      ...(formCrearEj.media_tipo ? { media_tipo: formCrearEj.media_tipo } : {}),
      ...(formCrearEj.media_url ? { media_url: formCrearEj.media_url } : {}),
      ...(formCrearEj.video_url ? { video_url: formCrearEj.video_url } : {}),
    }

    const { data: bib, error: bibError } = await supabase
      .from('ejercicios_biblioteca')
      .insert(insertBib)
      .select('id')
      .single()

    if (bibError || !bib) {
      setErrorCrearEj(bibError?.message || 'Error al crear ejercicio en Biblioteca')
      setGuardandoCrearEj(false)
      return
    }

    const orden = (ejercicios[bloqueId] || []).length
    const bloqueActual = bloques.find(b => b.id === bloqueId)
    const varsDefault = VARS_DEFAULT_METODO[bloqueActual?.metodo || 'individual'] || VARS_DEFAULT_METODO.individual
    const { data: ejRow, error: ejError } = await supabase
      .from('sesion_ejercicios')
      .insert({
        bloque_id: bloqueId,
        nombre: formCrearEj.nombre.trim(),
        biblioteca_id: bib.id,
        orden,
        variables_activas: varsDefault,
        ...(formCrearEj.media_tipo ? { media_tipo: formCrearEj.media_tipo } : {}),
        ...(formCrearEj.media_url ? { media_url: formCrearEj.media_url } : {}),
        ...(formCrearEj.video_url ? { video_url: formCrearEj.video_url } : {}),
        ...(formCrearEj.notas ? { notas: formCrearEj.notas } : {}),
        ...(formCrearEj.ejecucion_tipo ? { ejecucion_tipo: formCrearEj.ejecucion_tipo } : {}),
      })
      .select()
      .single()

    if (ejError || !ejRow) {
      await supabase.from('ejercicios_biblioteca').delete().eq('id', bib.id)
      setErrorCrearEj(ejError?.message || 'Error al añadir ejercicio a la sesión')
      setGuardandoCrearEj(false)
      return
    }

    setEjercicios(ej => ({ ...ej, [bloqueId]: [...(ej[bloqueId] || []), ejRow] }))
    setDirty(true)
    setModalCrearEj(null)
    setGuardandoCrearEj(false)
  }

  async function eliminarEjercicio(bloqueId, id) {
    await supabase.from('sesion_ejercicios').delete().eq('id', id)
    setEjercicios(ej => ({ ...ej, [bloqueId]: (ej[bloqueId] || []).filter(e => e.id !== id) }))
    setDirty(true)
  }

  async function pegarSesion(sesionOrigen, fechaDestino, clienteDestino) {
    setSaving(true)
    const { data: nuevaSesion, error } = await clonarSesion(supabase, sesionOrigen.id, {
      clienteDestino,
      fecha: fechaDestino,
    })
    if (error || !nuevaSesion) {
      alert('Error al copiar sesión: ' + (error?.message || 'sin datos'))
      setSaving(false)
      return
    }
    setSaving(false)
    if (clienteDestino !== clienteSeleccionado) setClienteSeleccionado(clienteDestino)
    else cargarSesiones()
  }

  async function duplicarSesion(s, fechaDestino) {
    setSaving(true)
    const { data: nuevaSesion, error } = await clonarSesion(supabase, s.id, {
      clienteDestino: s.cliente_id,
      fecha: fechaDestino || format(new Date(), 'yyyy-MM-dd'),
      titulo: (s.titulo || '') + ' (copia)',
    })
    if (error || !nuevaSesion) {
      alert('Error al duplicar sesión: ' + (error?.message || 'sin datos'))
      setSaving(false)
      return
    }
    setSaving(false)
    cargarSesiones()
  }

  async function guardarPack() {
    setSavingPack(true)
    if (modalPack?.id) {
      await supabase.from('packs_flexibles').update({ nombre: formPack.nombre, fecha_inicio: formPack.fecha_inicio, fecha_fin: formPack.fecha_fin, descripcion: formPack.descripcion || null }).eq('id', modalPack.id)
    } else {
      await supabase.from('packs_flexibles').insert({ cliente_id: clienteSeleccionado, nombre: formPack.nombre, fecha_inicio: formPack.fecha_inicio, fecha_fin: formPack.fecha_fin, descripcion: formPack.descripcion || null })
    }
    setSavingPack(false); setModalPack(null); cargarSesiones()
  }

  function copiarEnlacePack(pack) {
    const url = `${window.location.origin}/pack/${pack.token_publico}`
    navigator.clipboard.writeText(url).catch(() => {})
    alert(`Enlace del pack copiado:\n${url}`)
  }

  return (
    <>
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          {sesionAbierta && (
            <>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{sesionAbierta.titulo}</span>
              {sesionAbierta.fecha && (
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                  {new Date(sesionAbierta.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              )}
              {sesionAbierta.tipo_sesion && (
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  {sesionAbierta.tipo_sesion === 'programada' ? 'Programada' : sesionAbierta.tipo_sesion === 'flexible' ? 'Flexible' : 'Opcional'}
                </span>
              )}
              {sesionAbierta.tipo_sesion_detalle && (
                <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {sesionAbierta.tipo_sesion_detalle}
                </span>
              )}
              {sesionAbierta.duracion_min && (
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{sesionAbierta.duracion_min} min</span>
              )}
            </>
          )}
        </div>
        {sesionAbierta && (() => {
          const btnIcon = { width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--text2)' }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button title="Biblioteca" style={btnIcon}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={async () => { if (!biblioteca) { const { data } = await supabase.from('ejercicios_biblioteca').select('*').order('nombre'); setBiblioteca(data || []) } if (!panelBiblioteca && bloquesBiblioteca === null) cargarBloquesBiblioteca(); setPanelBiblioteca(v => !v) }}>
                📚
              </button>
              <button title="Guardar en biblioteca" style={{ ...btnIcon, opacity: guardandoEnBib ? 0.5 : 1 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => guardarEnBiblioteca(sesionAbierta)} disabled={guardandoEnBib}>
                {guardandoEnBib ? '⏳' : '🧱'}
              </button>
              <button title="Duplicar sesión" style={btnIcon}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => { setModalDuplicar(sesionAbierta); setFechaDuplicar(format(new Date(), 'yyyy-MM-dd')) }}>
                📋
              </button>
              <button title="Editar sesión" style={btnIcon}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => abrirEditarSesion(sesionAbierta)}>
                ✎
              </button>
              <button title={sesionAbierta.comentario_entrenadora ? 'Editar mensaje' : 'Mensaje al cliente'} style={btnIcon}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => { const cli = clientes.find(c => c.id === clienteSeleccionado); setModalComentario({ sesionId: sesionAbierta.id, sesionTitulo: sesionAbierta.titulo, clienteEmail: cli?.email || null, inicial: sesionAbierta.comentario_entrenadora || null }) }}>
                ✉
              </button>
              <button title="Compartir sesión" style={btnIcon}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => { if (sesionAbierta.token_publico) { navigator.clipboard.writeText(`${window.location.origin}/sesion/${sesionAbierta.token_publico}`).catch(() => {}) } }}>
                🔗
              </button>
              <button title="Volver" style={btnIcon}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => { if (dirty) { setAvisoSinGuardar(true) } else { volverAlCalendario() } }}>
                ←
              </button>
              <button title="Guardar"
                style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: guardadoOk ? '#16a34a' : 'var(--accent, #2d6a4f)', color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                onClick={() => { setDirty(false); setAvisoSinGuardar(false); setGuardadoOk(true); setTimeout(() => setGuardadoOk(false), 2500) }}>
                {guardadoOk ? '✓ Guardado' : 'Guardar'}
              </button>
            </div>
          )
        })()}
        {avisoSinGuardar && (
          <div style={{ margin: '8px 0 0', padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#713f12' }}>
            <span>⚠️ Tienes cambios sin guardar. Pulsa <strong>Guardar</strong> para confirmarlos.</span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: '#713f12' }} onClick={() => { setAvisoSinGuardar(false); volverAlCalendario() }}>Salir sin guardar</button>
            <button className="btn btn-primary btn-sm" style={{ minWidth: 90, background: guardadoOk ? '#16a34a' : undefined, borderColor: guardadoOk ? '#16a34a' : undefined }} onClick={() => { setDirty(false); setAvisoSinGuardar(false); setGuardadoOk(true); setTimeout(() => setGuardadoOk(false), 2500) }}>{guardadoOk ? '✓ Guardado' : 'Guardar'}</button>
          </div>
        )}
      </div>


      {toastCopiado && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#065f46', color: '#fff', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
          📋 Bloque copiado: "{toastCopiado}"
        </div>
      )}

      {sesionAbierta && (
        <div style={{ paddingRight: panelBiblioteca ? 306 : 0, transition: 'padding-right 0.2s' }}>

          {/* ── CAJA 2: Indicaciones + Material ── */}
          <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={{ padding: '8px 12px', borderRight: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Indicaciones</div>
                <InlineInput
                  value={sesionAbierta.indicaciones}
                  placeholder="Indicaciones generales..."
                  textarea
                  fontSize={11}
                  onSave={async v => { await supabase.from('sesiones').update({ indicaciones: v || null }).eq('id', sesionAbierta.id); setSesionAbierta(s => ({ ...s, indicaciones: v })); setSesiones(ss => ss.map(s => s.id === sesionAbierta.id ? { ...s, indicaciones: v } : s)); setDirty(true) }}
                />
              </div>
              <div style={{ padding: '8px 12px' }}>
                <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Material necesario</div>
                <InlineInput
                  value={sesionAbierta.material}
                  placeholder="Material necesario..."
                  textarea
                  fontSize={11}
                  onSave={async v => { await supabase.from('sesiones').update({ material: v || null }).eq('id', sesionAbierta.id); setSesionAbierta(s => ({ ...s, material: v })); setSesiones(ss => ss.map(s => s.id === sesionAbierta.id ? { ...s, material: v } : s)); setDirty(true) }}
                />
              </div>
            </div>
            {(sesionAbierta.objetivo || sesionAbierta.notas_entrenador) && (
              <div style={{ display: 'grid', gridTemplateColumns: sesionAbierta.objetivo && sesionAbierta.notas_entrenador ? '1fr 1fr' : '1fr', borderTop: '1px solid var(--border)' }}>
                {sesionAbierta.objetivo && (
                  <div style={{ padding: '8px 12px', borderRight: sesionAbierta.notas_entrenador ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Nota al cliente</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, fontStyle: 'italic' }}>{sesionAbierta.objetivo}</div>
                  </div>
                )}
                {sesionAbierta.notas_entrenador && (
                  <div style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>Notas internas</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, fontStyle: 'italic' }}>{sesionAbierta.notas_entrenador}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── EDITOR CARRERA ── */}
          {sesionAbierta.tipo_editor === 'carrera' && (() => {
            const FC_COLORS = ['#10b981','#84cc16','#f59e0b','#ef4444','#7c3aed']
            function rpeC(r) { return !r ? 'var(--text3)' : r <= 4 ? '#10b981' : r <= 6 ? '#f59e0b' : '#ef4444' }

            // Expanded blocks for chart (repetitions unrolled)
            const expanded = []
            carritoItems.forEach(item => {
              if (item.type === 'fase') expanded.push({ ...item, grupoId: null })
              else for (let r = 0; r < item.repeticiones; r++) item.fases.forEach(f => expanded.push({ ...f, grupoId: item.id }))
            })
            const widths = expanded.map(b => (b.volumen_min || 0) > 0 ? b.volumen_min : (b.volumen_km || 0) > 0 ? b.volumen_km * 2.5 : 2)
            const totalW = widths.reduce((a, b) => a + b, 0) || 1
            const maxH = 60

            // Totals
            const totMin = carritoItems.reduce((acc, it) => it.type === 'fase' ? acc + (it.volumen_min || 0) : acc + it.repeticiones * it.fases.reduce((a, f) => a + (f.volumen_min || 0), 0), 0)
            const totKm  = carritoItems.reduce((acc, it) => it.type === 'fase' ? acc + (it.volumen_km  || 0) : acc + it.repeticiones * it.fases.reduce((a, f) => a + (f.volumen_km  || 0), 0), 0)

            // Group bracket positions
            const groupPos = {}
            let cx = 0
            expanded.forEach((b, i) => {
              const w = Math.max(4, Math.round((widths[i] / totalW) * 560))
              if (b.grupoId) {
                if (!groupPos[b.grupoId]) groupPos[b.grupoId] = { startX: cx, endX: cx + w, grp: carritoItems.find(g => g.id === b.grupoId) }
                else groupPos[b.grupoId].endX = cx + w
              }
              cx += w + 2
            })

            function renderFaseFields(f, grupoId) {
              const rColor = rpeC(f.rpe)
              return (
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Descripción</div>
                    <InlineInput value={f.descripcion || ''} placeholder="Describe este bloque..." textarea fontSize={12.5}
                      onSave={v => actualizarBloqueCarrito(f.id, 'descripcion', v || null, grupoId)} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Duración / Distancia</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <InlineInput value={f.volumen_min != null ? String(f.volumen_min) : ''} placeholder="min" fontSize={12} style={{ width: 40 }}
                          onSave={v => actualizarBloqueCarrito(f.id, 'volumen_min', v ? parseInt(v) : null, grupoId)} />
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>min</span>
                        <span style={{ fontSize: 11, color: 'var(--border)' }}>/</span>
                        <InlineInput value={f.volumen_km != null ? String(f.volumen_km) : ''} placeholder="km" fontSize={12} style={{ width: 40 }}
                          onSave={v => actualizarBloqueCarrito(f.id, 'volumen_km', v ? parseFloat(v) : null, grupoId)} />
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>km</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>Ritmo (min/km)</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <InlineInput value={f.ritmo_inicio || ''} placeholder="4:00" fontSize={12} style={{ width: 44 }}
                          onSave={v => actualizarBloqueCarrito(f.id, 'ritmo_inicio', v || null, grupoId)} />
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>–</span>
                        <InlineInput value={f.ritmo_fin || ''} placeholder="4:30" fontSize={12} style={{ width: 44 }}
                          onSave={v => actualizarBloqueCarrito(f.id, 'ritmo_fin', v || null, grupoId)} />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>FC zona</div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[1,2,3,4,5].map(z => (
                          <button key={z} title={`Zona ${z}`} onClick={() => actualizarBloqueCarrito(f.id, 'fc_zona', f.fc_zona === z ? null : z, grupoId)}
                            style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${f.fc_zona >= z ? FC_COLORS[z-1] : 'var(--border)'}`, background: f.fc_zona >= z ? FC_COLORS[z-1] : 'var(--bg)', fontSize: 9, fontWeight: 700, color: f.fc_zona >= z ? '#fff' : 'var(--text3)', cursor: 'pointer' }}>{z}</button>
                        ))}
                      </div>
                      {f.fc_zona && <div style={{ fontSize: 10, color: FC_COLORS[f.fc_zona - 1], marginTop: 2 }}>Zona {f.fc_zona}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', marginBottom: 4 }}>RPE (1-10)</div>
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                        {[1,2,3,4,5,6,7,8,9,10].map(n => (
                          <button key={n} title={`${n} – ${BORG_RPE[n].label}`} onClick={() => actualizarBloqueCarrito(f.id, 'rpe', f.rpe === n ? null : n, grupoId)}
                            style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${f.rpe === n ? rColor : 'var(--border)'}`, background: f.rpe === n ? rColor : 'var(--bg)', color: f.rpe === n ? '#fff' : 'var(--text3)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{n}</button>
                        ))}
                      </div>
                      {f.rpe && (
                        <div style={{ marginTop: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: rColor }}>{f.rpe} – {BORG_RPE[f.rpe].label}</span>
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2, lineHeight: 1.4 }}>{BORG_RPE[f.rpe].desc}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── PENDIENTE / DESNIVEL ── */}
                  {(() => {
                    const PEND = {
                      llano:      { label: 'Llano',      ref: '0–1 %',   desc: 'Desplazamiento prácticamente natural. La inclinación apenas condiciona la técnica ni aumenta la exigencia respecto al llano.' },
                      suave:      { label: 'Suave',      ref: '2–4 %',   desc: 'Perceptible pero fluida. Aumenta ligeramente la exigencia muscular y cardiovascular.' },
                      moderado:   { label: 'Moderado',   ref: '5–7 %',   desc: 'Condiciona claramente el desplazamiento. Obliga a reducir algo el ritmo y aumenta de forma clara el trabajo de piernas.' },
                      fuerte:     { label: 'Fuerte',     ref: '8–12 %',  desc: 'Subida exigente. El ritmo debe reducirse claramente y aumenta mucho la demanda muscular y cardiovascular.' },
                      muy_fuerte: { label: 'Muy fuerte', ref: '>12 %',   desc: 'Pendiente muy pronunciada. Adecuada para esfuerzos cortos o trote muy lento. Mantener carrera continua puede ser muy exigente.' },
                    }
                    function inferirNivelPct(min, max) {
                      if (min == null) return null
                      const v = max != null ? (Number(min) + Number(max)) / 2 : Number(min)
                      if (v <= 1) return [{ key: 'llano', label: 'Llano' }]
                      if (v <= 4) return [{ key: 'suave', label: 'Suave' }]
                      if (v <= 7) return [{ key: 'moderado', label: 'Moderado' }]
                      if (v <= 12) return [{ key: 'fuerte', label: 'Fuerte' }]
                      return [{ key: 'muy_fuerte', label: 'Muy fuerte' }]
                    }
                    function inferirNivelRango(min, max) {
                      if (min == null || max == null) return inferirNivelPct(min, max)
                      const lo = inferirNivelPct(min, null)?.[0]?.key
                      const hi = inferirNivelPct(max, null)?.[0]?.key
                      if (lo === hi) return [{ key: lo, label: PEND[lo]?.label }]
                      return [{ key: lo, label: PEND[lo]?.label }, { key: hi, label: PEND[hi]?.label }]
                    }
                    const hasPendiente = f.pendiente_cualitativa || f.pendiente_pct_min != null
                    const [pendOpen, setPendOpen] = [hasPendiente, () => {}] // always open if has value
                    const niveles = inferirNivelRango(f.pendiente_pct_min, f.pendiente_pct_max)
                    const mostrarRefPct = f.pendiente_pct_min != null && niveles
                    const mostrarCueCinta = f.pendiente_pct_min != null && Number(f.pendiente_pct_min) >= 6

                    const [showPendForm, setShowPendForm] = [hasPendiente, (v) => {
                      if (!v) {
                        actualizarBloqueCarrito(f.id, 'pendiente_cualitativa', null, grupoId)
                        actualizarBloqueCarrito(f.id, 'pendiente_pct_min', null, grupoId)
                        actualizarBloqueCarrito(f.id, 'pendiente_pct_max', null, grupoId)
                      }
                    }]

                    return (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: hasPendiente ? 8 : 0 }}>
                          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>Pendiente / Desnivel</div>
                          <div style={{ position: 'relative', display: 'inline-block' }} className="tooltip-parent">
                            <span style={{ fontSize: 11, color: 'var(--text3)', cursor: 'help', border: '1px solid var(--border)', borderRadius: '50%', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>i</span>
                            <div className="tooltip-content" style={{ position: 'absolute', left: 0, top: 18, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, width: 240, zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', display: 'none' }}>
                              La pendiente indica la inclinación del terreno, no la intensidad total del ejercicio. Una misma pendiente puede resultar muy diferente según el ritmo, la duración y el nivel del deportista. Usa la opción cualitativa para indicar el tipo de terreno y el porcentaje cuando necesites una referencia más precisa, especialmente en cinta.
                            </div>
                          </div>
                          {!hasPendiente && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 8px', color: 'var(--text3)', marginLeft: 4 }}
                              onClick={() => actualizarBloqueCarrito(f.id, 'pendiente_cualitativa', 'moderado', grupoId)}>
                              + Añadir
                            </button>
                          )}
                          {hasPendiente && (
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: 'var(--text3)', marginLeft: 'auto' }}
                              onClick={() => { actualizarBloqueCarrito(f.id, 'pendiente_cualitativa', null, grupoId); actualizarBloqueCarrito(f.id, 'pendiente_pct_min', null, grupoId); actualizarBloqueCarrito(f.id, 'pendiente_pct_max', null, grupoId) }}>
                              × quitar
                            </button>
                          )}
                        </div>

                        {hasPendiente && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Pills cualitativo */}
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {Object.entries(PEND).map(([k, p]) => {
                                const sel = f.pendiente_cualitativa === k
                                return (
                                  <button key={k} onClick={() => actualizarBloqueCarrito(f.id, 'pendiente_cualitativa', sel ? null : k, grupoId)}
                                    style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: sel ? 700 : 400, border: `1.5px solid ${sel ? '#6366f1' : 'var(--border)'}`, background: sel ? '#6366f1' : 'var(--bg)', color: sel ? '#fff' : 'var(--text2)', cursor: 'pointer', transition: 'all 0.12s' }}>
                                    {p.label}
                                  </button>
                                )
                              })}
                            </div>
                            {/* Descripción del nivel seleccionado */}
                            {f.pendiente_cualitativa && PEND[f.pendiente_cualitativa] && (
                              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, fontStyle: 'italic', paddingLeft: 2 }}>
                                Ref. {PEND[f.pendiente_cualitativa].ref} — {PEND[f.pendiente_cualitativa].desc}
                              </div>
                            )}
                            {/* Porcentaje */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase' }}>%</span>
                              <InlineInput value={f.pendiente_pct_min != null ? String(f.pendiente_pct_min) : ''} placeholder="min" fontSize={12} style={{ width: 38 }}
                                onSave={v => actualizarBloqueCarrito(f.id, 'pendiente_pct_min', v !== '' && v != null ? parseFloat(v) : null, grupoId)} />
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>–</span>
                              <InlineInput value={f.pendiente_pct_max != null ? String(f.pendiente_pct_max) : ''} placeholder="max" fontSize={12} style={{ width: 38 }}
                                onSave={v => actualizarBloqueCarrito(f.id, 'pendiente_pct_max', v !== '' && v != null ? parseFloat(v) : null, grupoId)} />
                              <span style={{ fontSize: 11, color: 'var(--text3)' }}>%</span>
                            </div>
                            {/* Referencia orientativa del % */}
                            {mostrarRefPct && !f.pendiente_cualitativa && (
                              <div style={{ fontSize: 11, color: '#6366f1', fontStyle: 'italic', paddingLeft: 2 }}>
                                Referencia orientativa: {niveles.map(n => n.label).join('–').toLowerCase()}
                              </div>
                            )}
                            {/* Cue cinta */}
                            {mostrarCueCinta && (
                              <div style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.5, paddingLeft: 2, borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
                                💡 Selecciona una pendiente que puedas mantener con técnica estable y sin agarrarte a la cinta.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            }

            // Summary text
            function fmtV(it) { const p = []; if (it.volumen_min) p.push(`${it.volumen_min}'`); if (it.volumen_km) p.push(`${it.volumen_km}km`); return p.join('+') || '—' }
            function fmtR(it) { return it.ritmo_inicio ? (it.ritmo_fin ? ` @${it.ritmo_inicio}–${it.ritmo_fin}` : ` @${it.ritmo_inicio}`) : '' }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* ── GRÁFICA ── */}
                <div className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                    Estructura de la sesión
                    <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text3)' }}>Clic dcho. → opciones</span>
                  </div>
                  <div style={{ position: 'relative', height: 86, display: 'flex', alignItems: 'flex-end', gap: 2, paddingBottom: 26 }}
                    onContextMenu={e => e.preventDefault()}>
                    {expanded.map((b, i) => {
                      // RPE tiene prioridad sobre fc_zona cuando está presente
                      const usaRPE = b.rpe != null && b.rpe > 0
                      const zonaEq = usaRPE
                        ? (b.rpe <= 2 ? 1 : b.rpe <= 4 ? 2 : b.rpe <= 6 ? 3 : b.rpe <= 8 ? 4 : 5)
                        : (b.fc_zona || 1)
                      const h = usaRPE
                        ? Math.max(4, Math.round((b.rpe / 10) * maxH))
                        : Math.round((zonaEq / 5) * maxH)
                      const w = Math.max(4, Math.round((widths[i] / totalW) * 560))
                      const color = FC_COLORS[zonaEq - 1]
                      const tooltipLabel = usaRPE
                        ? `${b.nombre || 'Bloque'} — RPE ${b.rpe}${b.fc_zona ? ` (Z${b.fc_zona})` : ''}${b.volumen_min ? ` · ${b.volumen_min}min` : ''}${b.volumen_km ? ` · ${b.volumen_km}km` : ''}`
                        : `${b.nombre || 'Bloque'} — Z${zonaEq}${b.volumen_min ? ` · ${b.volumen_min}min` : ''}${b.volumen_km ? ` · ${b.volumen_km}km` : ''}`
                      return (
                        <div key={i} style={{ position: 'relative', flexShrink: 0, width: w, height: h, background: color, opacity: b.grupoId ? 0.72 : 0.92, borderRadius: '3px 3px 0 0', cursor: 'context-menu', transition: 'opacity 0.12s',
                          // Barra estriada cuando usa RPE para distinguirla visualmente
                          backgroundImage: usaRPE ? `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.15) 3px, rgba(255,255,255,0.15) 6px)` : 'none' }}
                          title={tooltipLabel}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = b.grupoId ? '0.72' : '0.92'}
                          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxCarrito({ x: e.clientX, y: e.clientY, item: b, grupoId: b.grupoId }) }} />
                      )
                    })}
                    {/* Group brackets */}
                    {Object.entries(groupPos).map(([gid, pos]) => (
                      <div key={gid} style={{ position: 'absolute', bottom: 0, left: pos.startX, width: pos.endX - pos.startX, pointerEvents: 'none' }}>
                        <div style={{ height: 6, border: '1.5px solid #4C82E8', borderTop: 'none', borderRadius: '0 0 4px 4px', marginBottom: 2 }} />
                        <div style={{ fontSize: 9, fontWeight: 800, color: '#4C82E8', textAlign: 'center', fontFamily: 'var(--mono)' }}>{pos.grp?.repeticiones}×</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, marginBottom: 8 }} />
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[['#10b981','Z1'],['#84cc16','Z2'],['#f59e0b','Z3'],['#ef4444','Z4'],['#7c3aed','Z5']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
                      </div>
                    ))}
                    {expanded.some(b => b.rpe != null && b.rpe > 0) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text3)', marginLeft: 4, paddingLeft: 8, borderLeft: '1px solid var(--border)' }}>
                        <div style={{ width: 14, height: 8, borderRadius: 2, background: '#f59e0b', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)' }} />
                        RPE
                      </div>
                    )}
                    {(totMin > 0 || totKm > 0) && <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>
                      {totMin > 0 && `${totMin} min`}{totMin > 0 && totKm > 0 && ' · '}{totKm > 0 && `${totKm.toFixed(1)} km`}
                    </div>}
                  </div>
                </div>

                {/* ── BLOQUES ── */}
                {carritoItems.map((item, idx) => {
                  if (item.type === 'fase') {
                    const zColor = item.fc_zona ? FC_COLORS[item.fc_zona - 1] : 'var(--border)'
                    return (
                      <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${zColor}`, cursor: 'default' }}
                        draggable onDragStart={() => setDraggingCarrito({ idx })} onDragEnd={() => setDraggingCarrito(null)}
                        onDragOver={e => e.preventDefault()} onDrop={() => { if (draggingCarrito && draggingCarrito.idx !== idx) reordenarCarrito(draggingCarrito.idx, idx) }}>
                        <div style={{ padding: '10px 14px', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text3)', cursor: 'grab', fontSize: 14, userSelect: 'none' }}>⠿</span>
                          <div style={{ flex: 1 }}>
                            <InlineInput value={item.nombre || ''} placeholder="Nombre del bloque..." fontSize={13} style={{ fontWeight: 600 }}
                              onSave={v => actualizarBloqueCarrito(item.id, 'nombre', v, null)} />
                          </div>
                          <button className="btn btn-ghost btn-sm" title="Duplicar" onClick={() => duplicarBloqueCarrito(item.id, null)} style={{ color: 'var(--text3)' }}><Copy size={12} /></button>
                          <button className="btn btn-ghost btn-sm" title="Copiar bloque a otra sesión" onClick={() => copiarFase(item)} style={{ color: 'var(--text3)', fontSize: 11 }}>📋</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => eliminarBloqueCarrito(item.id)}><Trash2 size={12} /></button>
                        </div>
                        {renderFaseFields(item, null)}
                      </div>
                    )
                  }
                  // GRUPO
                  return (
                    <div key={item.id} style={{ border: '2px solid #4C82E8', borderRadius: 12, background: '#f5f8ff', overflow: 'hidden' }}
                      draggable onDragStart={() => setDraggingCarrito({ idx })} onDragEnd={() => setDraggingCarrito(null)}
                      onDragOver={e => e.preventDefault()} onDrop={() => { if (draggingCarrito && draggingCarrito.idx !== idx) reordenarCarrito(draggingCarrito.idx, idx) }}>
                      {/* Group header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#eef2ff', borderBottom: '1px solid #dde6ff' }}>
                        <span style={{ color: '#8fa8e8', cursor: 'grab', fontSize: 14, userSelect: 'none' }}>⠿</span>
                        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#4C82E8', flex: 1 }}>Repetir</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => cambiarRepeticionesGrupo(item.id, -1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid #4C82E8', background: '#fff', color: '#4C82E8', fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>−</button>
                          <span style={{ fontSize: 18, fontWeight: 900, color: '#4C82E8', minWidth: 24, textAlign: 'center', fontFamily: 'var(--mono)' }}>{item.repeticiones}</span>
                          <button onClick={() => cambiarRepeticionesGrupo(item.id, +1)} style={{ width: 22, height: 22, borderRadius: 6, border: '1.5px solid #4C82E8', background: '#fff', color: '#4C82E8', fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>+</button>
                          <span style={{ fontSize: 11, color: '#7a98d8', fontWeight: 600 }}>veces</span>
                        </div>
                        <button className="btn btn-ghost btn-sm" title="Duplicar grupo" onClick={() => duplicarGrupoCarrito(item.id)} style={{ color: '#4C82E8' }}><Copy size={12} /></button>
                        <button className="btn btn-ghost btn-sm" title="Copiar grupo a otra sesión" onClick={() => copiarGrupo(item)} style={{ color: '#4C82E8', fontSize: 11 }}>📋</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => eliminarGrupoCarrito(item.id)}><Trash2 size={12} /></button>
                      </div>
                      {/* Fases dentro del grupo */}
                      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {item.fases.map((f, fi) => {
                          const zColor = f.fc_zona ? FC_COLORS[f.fc_zona - 1] : '#dde6ff'
                          return (
                            <div key={f.id} style={{ background: '#fff', border: '1.5px solid #dde6ff', borderLeft: `4px solid ${zColor}`, borderRadius: 10, overflow: 'hidden' }}
                              draggable onDragStart={e => { e.stopPropagation(); setDraggingCarrito({ idx, grupoId: item.id, innerIdx: fi }) }}
                              onDragEnd={() => setDraggingCarrito(null)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => { e.stopPropagation(); if (draggingCarrito?.grupoId === item.id && draggingCarrito.innerIdx !== fi) reordenarFasesEnGrupo(item.id, draggingCarrito.innerIdx, fi) }}>
                              <div style={{ padding: '8px 12px', background: '#f5f8ff', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: '#8fa8e8', cursor: 'grab', fontSize: 12, userSelect: 'none' }}>⠿</span>
                                <div style={{ flex: 1 }}>
                                  <InlineInput value={f.nombre || ''} placeholder="Nombre..." fontSize={12.5} style={{ fontWeight: 600 }}
                                    onSave={v => actualizarBloqueCarrito(f.id, 'nombre', v, item.id)} />
                                </div>
                                <button className="btn btn-ghost btn-sm" title="Duplicar" onClick={() => duplicarBloqueCarrito(f.id, item.id)} style={{ color: 'var(--text3)' }}><Copy size={11} /></button>
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => eliminarFaseDeGrupoCarrito(f.id, item.id)}><Trash2 size={11} /></button>
                              </div>
                              {renderFaseFields(f, item.id)}
                            </div>
                          )
                        })}
                        <button className="btn btn-ghost btn-sm" onClick={() => añadirFaseAGrupoCarrito(item.id)} style={{ border: '1.5px dashed #a8bcf0', borderRadius: 8, color: '#7a98d8', alignSelf: 'stretch', justifyContent: 'center' }}>
                          <Plus size={12} /> Añadir bloque al grupo
                        </button>
                      </div>
                    </div>
                  )
                })}

                {/* ── BOTONES AÑADIR ── */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" onClick={añadirBloqueSuelto} style={{ flex: 1, justifyContent: 'center', border: '1.5px dashed var(--border)' }}>
                    <Plus size={13} /> Añadir bloque
                  </button>
                  <button className="btn btn-ghost" onClick={añadirGrupoCarrera} style={{ flex: 1, justifyContent: 'center', border: '1.5px solid #c8d8f8', background: '#eef2ff', color: '#4C82E8' }}>
                    <Plus size={13} /> Añadir grupo de repeticiones
                  </button>
                  {clipboardBloque && (
                    <button className="btn btn-ghost" onClick={pegarDesdePortapapeles} style={{ flex: 1, justifyContent: 'center', border: '1.5px solid #d1fae5', background: '#ecfdf5', color: '#065f46', minWidth: 160 }}
                      title={`Pegar: "${clipboardBloque.nombre}"`}>
                      📋 Pegar: <em style={{ marginLeft: 4, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clipboardBloque.nombre}</em>
                      <button onClick={e => { e.stopPropagation(); limpiarPortapapeles() }} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#065f46', lineHeight: 1 }}>×</button>
                    </button>
                  )}
                </div>

                {/* ── RESUMEN ── */}
                {carritoItems.length > 0 && (
                  <div className="card" style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Resumen</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.9 }}>
                      {carritoItems.map((it, i) => it.type === 'fase'
                        ? <div key={i}>{fmtV(it)}{fmtR(it)}{it.fc_zona ? ` Z${it.fc_zona}` : ''}{it.rpe ? ` RPE${it.rpe}` : ''}</div>
                        : <div key={i}>
                            <span style={{ color: '#4C82E8', fontWeight: 700 }}>{it.repeticiones} × (</span>
                            {it.fases.map((f, fi) => <div key={fi} style={{ paddingLeft: 16, color: 'var(--text3)' }}>+ {fmtV(f)}{fmtR(f)}{f.fc_zona ? ` Z${f.fc_zona}` : ''}{f.rpe ? ` RPE${f.rpe}` : ''}</div>)}
                            <span style={{ color: '#4C82E8', fontWeight: 700 }}>)</span>
                          </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── MENÚ CONTEXTUAL (gráfica) ── */}
                {ctxCarrito && (
                  <div style={{ position: 'fixed', top: ctxCarrito.y, left: ctxCarrito.x, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.15)', zIndex: 9999, minWidth: 170, overflow: 'hidden' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ padding: '5px 14px 3px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {ctxCarrito.item.nombre || 'Bloque'}
                    </div>
                    {[
                      { label: '⎘ Duplicar bloque', action: () => { duplicarBloqueCarrito(ctxCarrito.item.id, ctxCarrito.grupoId); setCtxCarrito(null) } },
                      ctxCarrito.grupoId ? { label: '⎘ Duplicar grupo', action: () => { duplicarGrupoCarrito(ctxCarrito.grupoId); setCtxCarrito(null) } } : null,
                      ctxCarrito.grupoId ? { label: '+ Más repeticiones', action: () => { cambiarRepeticionesGrupo(ctxCarrito.grupoId, +1); setCtxCarrito(null) } } : null,
                      ctxCarrito.grupoId ? { label: '− Menos repeticiones', action: () => { cambiarRepeticionesGrupo(ctxCarrito.grupoId, -1); setCtxCarrito(null) } } : null,
                      { sep: true },
                      { label: '× Eliminar bloque', danger: true, action: () => { ctxCarrito.grupoId ? eliminarFaseDeGrupoCarrito(ctxCarrito.item.id, ctxCarrito.grupoId) : eliminarBloqueCarrito(ctxCarrito.item.id); setCtxCarrito(null) } },
                      ctxCarrito.grupoId ? { label: '× Eliminar grupo', danger: true, action: () => { eliminarGrupoCarrito(ctxCarrito.grupoId); setCtxCarrito(null) } } : null,
                    ].filter(Boolean).map((opt, i) => opt.sep
                      ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
                      : <button key={i} onClick={opt.action} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '9px 14px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer', color: opt.danger ? 'var(--danger)' : 'var(--text)', textAlign: 'left' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>{opt.label}</button>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── EDITOR FUERZA ── */}
          {sesionAbierta.tipo_editor !== 'carrera' && !vistaPrevia && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bloques.map((b, idx) => {
              function renderEjerciciosBloque(b, ejs, { toggleVariable, actualizarEjercicio, eliminarEjercicio, abrirCrearEjercicio, abrirBiblioteca, draggingEj, setDraggingEj, setEjercicios, ejercicios, menuVariableAbierto, setMenuVariableAbierto, menuVariablePos, setMenuVariablePos, mediaPreviewTimeout, setMediaPreview, VARS_MENU }) {
                const metodo = b.metodo || 'individual'

                const EJECUCION_LABEL = { maxima: 'Máx vel', medio: 'Ritmo med', excentrico: 'Foco exc' }
                function formatVarsCompacto(ej) {
                  const p = []
                  const seriesBloque = METODOS_SERIES_BLOQUE.includes(b.metodo)
                  if (!seriesBloque && ej.series && ej.reps) p.push(`${ej.series}×${ej.reps}${ej.reps_por_lado ? ' c/lado' : ''}`)
                  else if (!seriesBloque && ej.series) p.push(`${ej.series} series`)
                  else if (ej.reps) p.push(`${ej.reps}${ej.reps_por_lado ? ' c/lado' : ''}`)
                  if (ej.num_mini && ej.reps_mini) p.push(`${ej.num_mini}×${ej.reps_mini} mini`)
                  if (ej.microdescanso_seg) p.push(`⏸${ej.microdescanso_seg}s`)
                  if (ej.duracion) p.push(`${ej.duracion}s${ej.reps_por_lado ? ' c/lado' : ''}`)
                  if (ej.peso) p.push(`${ej.peso}kg`)
                  if (ej.peso_der || ej.peso_izq) p.push(`${ej.peso_der || '?'}/${ej.peso_izq || '?'}kg c/lado`)
                  if (ej.rpe) p.push(`RIR ${ej.rpe}`)
                  if (ej.distancia) p.push(`${ej.distancia}m`)
                  if (ej.altura) p.push(`${ej.altura}cm`)
                  if (ej.descanso) p.push(`⏱${ej.descanso}`)
                  const ejLabel = ej.ejecucion_tipo === 'libre' ? (ej.ejecucion_texto ? ej.ejecucion_texto.slice(0, 15) : null) : EJECUCION_LABEL[ej.ejecucion_tipo]
                  if (ejLabel) p.push(ejLabel)
                  return p.join(' · ')
                }

                function ejCard(e, eIdx, accentColor, isLast = false, prefixLabel = null) {
                  const expandido = ejExpandido === e.id
                  const getYtId = (url) => url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&\n?#]+)/)?.[1]
                  const ytEmbedId = e.media_tipo === 'youtube' ? (getYtId(e.video_url) || getYtId(e.media_url)) : null
                  const activas = e.variables_activas || []
                  const menuKey = `${b.id}-${e.id}`
                  const label = `${idx + 1}${getLabelEjercicio(b.metodo, eIdx)}`
                  const varsText = formatVarsCompacto(e)

                  const mediaMini = e.media_url || e.media_tipo === 'youtube' ? (
                    e.media_tipo === 'video'
                      ? <video src={e.media_url} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} autoPlay muted loop playsInline />
                      : e.media_tipo === 'youtube'
                        ? ytEmbedId
                          ? <div style={{ position: 'relative', width: expandido ? 120 : 56, height: expandido ? 160 : 56, borderRadius: expandido ? 8 : 4, flexShrink: 0, overflow: 'hidden' }}>
                              {expandido && ytActivo[e.id] ? (
                                <iframe src={`https://www.youtube.com/embed/${ytEmbedId}?autoplay=1`} style={{ width: '100%', height: '100%', border: 'none' }} allow="autoplay; fullscreen" allowFullScreen />
                              ) : (
                                <div onClick={expandido ? ev => { ev.stopPropagation(); setYtActivo(v => ({ ...v, [e.id]: true })) } : undefined} style={{ position: 'relative', width: '100%', height: '100%', cursor: expandido ? 'pointer' : 'default' }}>
                                  <img src={`https://img.youtube.com/vi/${ytEmbedId}/hqdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  <div style={{ position: 'absolute', bottom: expandido ? 8 : 4, left: expandido ? 8 : 4, width: expandido ? 28 : 18, height: expandido ? 28 : 18, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: `${expandido ? 1.5 : 1}px solid rgba(255,255,255,0.5)`, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                                    <svg width={expandido ? 10 : 6} height={expandido ? 10 : 6} viewBox="0 0 10 10" fill="white"><polygon points="2,1 9,5 2,9"/></svg>
                                  </div>
                                </div>
                              )}
                            </div>
                          : <div style={{ width: 56, height: 56, borderRadius: 4, flexShrink: 0, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 18, color: '#ff0000' }}>▶</span>
                            </div>
                        : <img src={e.media_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  ) : null

                  return (
                    <div key={e.id}
                      draggable
                      onDragStart={() => setDraggingEj({ e, bloqueId: b.id })}
                      onDragEnd={() => setDraggingEj(null)}
                      onDragOver={ev => ev.preventDefault()}
                      onDrop={async ev => {
                        ev.preventDefault()
                        if (!draggingEj || draggingEj.e.id === e.id) return
                        const bloqueOrigen = draggingEj.bloqueId
                        const bloqueDestino = b.id
                        const ejOrigen = [...(ejercicios[bloqueOrigen] || [])]
                        const fromIdx = ejOrigen.findIndex(x => x.id === draggingEj.e.id)
                        if (fromIdx === -1) return
                        const [moved] = ejOrigen.splice(fromIdx, 1)
                        const ejDestinoBase = bloqueOrigen === bloqueDestino ? ejOrigen : [...(ejercicios[bloqueDestino] || [])]
                        const toIdx = ejDestinoBase.findIndex(x => x.id === e.id)
                        ejDestinoBase.splice(toIdx >= 0 ? toIdx : ejDestinoBase.length, 0, { ...moved, bloque_id: bloqueDestino })
                        const origenFinal = ejOrigen.map((x, i) => ({ ...x, orden: i }))
                        const destinoFinal = bloqueOrigen === bloqueDestino ? origenFinal : ejDestinoBase.map((x, i) => ({ ...x, orden: i }))
                        const newEj = { ...ejercicios }
                        newEj[bloqueOrigen] = origenFinal
                        newEj[bloqueDestino] = destinoFinal
                        setEjercicios(newEj)
                        await supabase.from('sesion_ejercicios').update({ bloque_id: bloqueDestino, orden: toIdx >= 0 ? toIdx : ejDestinoBase.length - 1 }).eq('id', moved.id)
                        await Promise.all(origenFinal.map(x => supabase.from('sesion_ejercicios').update({ orden: x.orden }).eq('id', x.id)))
                        if (bloqueOrigen !== bloqueDestino) await Promise.all(destinoFinal.map(x => supabase.from('sesion_ejercicios').update({ orden: x.orden }).eq('id', x.id)))
                        setDraggingEj(null)
                      }}
                      onClick={() => setEjExpandido(ejExpandido === e.id ? null : e.id)}
                      onMouseEnter={ev => { if (!expandido) ev.currentTarget.style.background = 'var(--surface2, #f8f9fa)' }}
                      onMouseLeave={ev => { if (!expandido) ev.currentTarget.style.background = expandido ? 'var(--surface2, #f8f9fa)' : 'transparent' }}
                      style={{
                        borderBottom: isLast ? 'none' : '0.5px solid var(--border)',
                        borderLeft: accentColor ? `2px solid ${accentColor}` : 'none',
                        background: expandido ? 'var(--surface2, #f8f9fa)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                        fontFamily: "'Inter', system-ui, sans-serif",
                        position: 'relative',
                      }}>

                      {/* ── FILA COMPACTA ── */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', height: 32 }}>
                        <span style={{ fontSize: 11, color: 'var(--text4)', cursor: 'grab', flexShrink: 0, userSelect: 'none', lineHeight: 1 }}>⠿</span>
                        {prefixLabel && <span style={{ fontSize: 9, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{prefixLabel}</span>}
                        <span style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: accentColor, background: mC(accentColor || '#888', 0.12), padding: '2px 7px', borderRadius: 3, flexShrink: 0, letterSpacing: '.03em', minWidth: 22, textAlign: 'center' }}>{label}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
                          {e.nombre || <span style={{ color: 'var(--text3)', fontWeight: 400 }}>Sin nombre</span>}
                        </span>
                        {varsText && (
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: 'var(--text3)', background: 'var(--surface2, #f8f9fa)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{varsText}</span>
                        )}
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)', flexShrink: 0, opacity: expandido ? .7 : 0, transition: 'opacity 0.1s', pointerEvents: expandido ? 'auto' : 'none' }}
                          onClick={ev => { ev.stopPropagation(); eliminarEjercicio(b.id, e.id) }}>
                          <X size={12} />
                        </button>
                      </div>

                      {/* ── ZONA EXPANDIDA ── */}
                      {expandido && (
                        <div onClick={ev => ev.stopPropagation()} style={{ borderTop: '1px solid var(--border)', padding: '10px 12px 12px' }}>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {/* Nombre */}
                              <InlineInput value={e.nombre} placeholder="Nombre del ejercicio" fontSize={13} style={{ fontWeight: 600 }}
                                onSave={v => actualizarEjercicio(b.id, e.id, 'nombre', v)} />

                              {/* Series + Reps */}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                {!METODOS_SERIES_BLOQUE.includes(b.metodo) && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Series</span>
                                    <div style={{ width: 36 }}><InlineInput value={e.series} placeholder="—" fontSize={11} onSave={v => actualizarEjercicio(b.id, e.id, 'series', v)} /></div>
                                  </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Reps</span>
                                  <div style={{ width: 60 }}><InlineInput value={e.reps} placeholder="—" fontSize={11} onSave={v => actualizarEjercicio(b.id, e.id, 'reps', v)} /></div>
                                  <button onClick={() => actualizarEjercicio(b.id, e.id, 'reps_por_lado', !e.reps_por_lado)}
                                    style={{ fontSize: 10, padding: '2px 7px', borderRadius: 5, border: `1px solid ${e.reps_por_lado ? 'var(--accent)' : 'var(--border)'}`, background: e.reps_por_lado ? 'var(--accent)' : 'transparent', color: e.reps_por_lado ? '#fff' : 'var(--text3)', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                                    /lado
                                  </button>
                                </div>
                              </div>

                              {/* Variables activas */}
                              {activas.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 0 }}>
                                  {activas.includes('RIR') && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56 }}>RIR</span>
                                      <div style={{ display: 'flex', gap: 3 }}>
                                        {[['4+','#16a34a','#dcfce7'],['2-3','#ca8a04','#fef9c3'],['1-0','#dc2626','#fee2e2']].map(([val, color, bg]) => (
                                          <button key={val} onClick={() => actualizarEjercicio(b.id, e.id, 'rpe', e.rpe === val ? '' : val)}
                                            style={{ padding: '2px 6px', borderRadius: 8, border: `1.5px solid ${e.rpe === val ? color : 'var(--border)'}`, background: e.rpe === val ? bg : 'var(--bg)', color: e.rpe === val ? color : 'var(--text3)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                            {val}
                                          </button>
                                        ))}
                                      </div>
                                      <button onClick={() => toggleVariable(e, 'RIR')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px' }}>×</button>
                                    </div>
                                  )}
                                  {activas.includes('Peso') && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56 }}>Peso</span>
                                      <InlineInput value={e.peso} placeholder="80" fontSize={11} type="number" onSave={v => actualizarEjercicio(b.id, e.id, 'peso', v)} />
                                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>kg</span>
                                      <button onClick={() => toggleVariable(e, 'Peso')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px' }}>×</button>
                                    </div>
                                  )}
                                  {activas.includes('Peso/lado') && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56 }}>Peso/lado</span>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>D</span>
                                      <InlineInput value={e.peso_der} placeholder="20" fontSize={11} type="number" onSave={v => actualizarEjercicio(b.id, e.id, 'peso_der', v)} style={{ width: 36 }} />
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>I</span>
                                      <InlineInput value={e.peso_izq} placeholder="15" fontSize={11} type="number" onSave={v => actualizarEjercicio(b.id, e.id, 'peso_izq', v)} style={{ width: 36 }} />
                                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>kg</span>
                                      <button onClick={() => toggleVariable(e, 'Peso/lado')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px' }}>×</button>
                                    </div>
                                  )}
                                  {activas.includes('Duración') && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56 }}>Duración</span>
                                      <InlineInput value={e.duracion} placeholder="45" fontSize={11} type="number" onSave={v => actualizarEjercicio(b.id, e.id, 'duracion', v)} />
                                      <span style={{ fontSize: 10, color: 'var(--text3)' }}>s</span>
                                      <button onClick={() => toggleVariable(e, 'Duración')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px' }}>×</button>
                                    </div>
                                  )}
                                  {activas.includes('Descanso') && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56 }}>Descanso</span>
                                      <div style={{ flex: 1 }}><InlineInput value={e.descanso} placeholder="30 s · 60 s · 2 min" fontSize={11} onSave={v => actualizarEjercicio(b.id, e.id, 'descanso', v)} /></div>
                                      <button onClick={() => toggleVariable(e, 'Descanso')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px' }}>×</button>
                                    </div>
                                  )}
                                  {activas.includes('Velocidad') && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56, paddingTop: 4 }}>Velocidad</span>
                                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                          {[
                                            { value: 'maxima', label: 'Máxima vel.', desc: 'Impulso lo más rápido posible, vuelta controlada' },
                                            { value: 'medio', label: 'Ritmo medio', desc: 'Mismo ritmo en subida y bajada' },
                                            { value: 'excentrico', label: 'Foco exc.', desc: 'Vuelta lenta y controlada' },
                                            { value: 'libre', label: 'Libre', desc: null },
                                          ].map(op => {
                                            const activo = e.ejecucion_tipo === op.value
                                            return (
                                              <button key={op.value} title={op.desc || ''}
                                                onClick={() => {
                                                  if (activo) { actualizarEjercicio(b.id, e.id, 'ejecucion_tipo', ''); actualizarEjercicio(b.id, e.id, 'ejecucion_texto', '') }
                                                  else { actualizarEjercicio(b.id, e.id, 'ejecucion_tipo', op.value); if (op.value !== 'libre') actualizarEjercicio(b.id, e.id, 'ejecucion_texto', '') }
                                                }}
                                                style={{ padding: '2px 8px', borderRadius: 20, border: `1px solid ${activo ? 'var(--accent)' : 'var(--border)'}`, background: activo ? 'var(--accent)' : 'transparent', color: activo ? '#fff' : 'var(--text3)', fontSize: 10, cursor: 'pointer', fontWeight: activo ? 600 : 400 }}>
                                                {op.label}
                                              </button>
                                            )
                                          })}
                                        </div>
                                        {e.ejecucion_tipo === 'libre' && (
                                          <InlineInput value={e.ejecucion_texto} placeholder="Describe la ejecución..." fontSize={11}
                                            onSave={v => actualizarEjercicio(b.id, e.id, 'ejecucion_texto', v)} />
                                        )}
                                      </div>
                                      <button onClick={() => toggleVariable(e, 'Velocidad')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px', marginTop: 2 }}>×</button>
                                    </div>
                                  )}
                                  {activas.includes('Indicaciones') && (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                      <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 56, paddingTop: 2 }}>Notas</span>
                                      <div style={{ flex: 1 }}>
                                        <InlineInput value={e.notas} placeholder="Indicaciones para el ejercicio..." textarea fontSize={11.5} style={{ color: 'var(--text2)' }}
                                          onSave={v => actualizarEjercicio(b.id, e.id, 'notas', v)} />
                                      </div>
                                      <button onClick={() => toggleVariable(e, 'Indicaciones')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 11, padding: '0 2px' }}>×</button>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* + Variable */}
                              <div style={{ display: 'inline-block' }}>
                                <button onClick={ev => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); setMenuVariablePos({ x: r.left, y: r.bottom + 4 }); setMenuVariableAbierto(menuVariableAbierto === menuKey ? null : menuKey) }}
                                  style={{ fontSize: 10, color: 'var(--text3)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                                  ＋ Variable
                                </button>
                                {menuVariableAbierto === menuKey && (
                                  <div data-var-menu="1"
                                    style={{ position: 'fixed', top: menuVariablePos.y, left: menuVariablePos.x, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 200, minWidth: 180, overflow: 'hidden' }}>
                                    {VARS_MENU.map(({ grupo, items }) => (
                                      <div key={grupo}>
                                        <div style={{ padding: '5px 10px 2px', fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}>{grupo}</div>
                                        {items.map(item => {
                                          const isActive = activas.includes(item)
                                          return (
                                            <button key={item} onClick={() => { toggleVariable(e, item); setMenuVariableAbierto(null) }}
                                              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', color: isActive ? 'var(--accent)' : 'var(--text)' }}
                                              onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg2)'}
                                              onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                                              <span style={{ width: 14, flexShrink: 0 }}>{isActive ? '✓' : ''}</span>
                                              {item}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Media url */}
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <select className="form-select" style={{ fontSize: 11, padding: '3px 6px', width: 'auto' }} value={e.media_tipo} onChange={ev => actualizarEjercicio(b.id, e.id, 'media_tipo', ev.target.value)}>
                                  <option value="youtube">YouTube</option>
                                  <option value="imagen">Imagen</option>
                                  <option value="video">Vídeo</option>
                                  <option value="gif">GIF</option>
                                </select>
                                <div style={{ flex: 1 }}>
                                  <InlineInput value={e.media_url} placeholder={e.media_tipo === 'youtube' ? 'Enlace de YouTube...' : 'URL de la media...'} fontSize={11}
                                    onSave={async v => {
                                      await actualizarEjercicio(b.id, e.id, 'media_url', v)
                                      if (e.media_tipo === 'youtube' && v && !e.nombre) {
                                        const titulo = await ytTitulo(v)
                                        if (titulo) await actualizarEjercicio(b.id, e.id, 'nombre', titulo)
                                      }
                                    }} />
                                </div>
                                {e.media_tipo !== 'youtube' && (
                                  <label style={{ cursor: 'pointer', flexShrink: 0 }} title="Subir archivo desde tu ordenador">
                                    <input type="file" accept="image/*,video/*,.gif" style={{ display: 'none' }}
                                      onChange={async ev => {
                                        const file = ev.target.files?.[0]
                                        if (!file) return
                                        const ext = file.name.split('.').pop()
                                        const path = `ejercicios/${e.id}_${Date.now()}.${ext}`
                                        const { error } = await supabase.storage.from('media-ejercicios').upload(path, file, { upsert: true })
                                        if (error) { alert('Error al subir: ' + error.message); return }
                                        const { data: { publicUrl } } = supabase.storage.from('media-ejercicios').getPublicUrl(path)
                                        await actualizarEjercicio(b.id, e.id, 'media_url', publicUrl)
                                        ev.target.value = ''
                                      }} />
                                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', whiteSpace: 'nowrap' }}>📁 Subir</span>
                                  </label>
                                )}
                              </div>
                              {e.media_tipo !== 'youtube' && (
                                <InlineInput value={e.video_url} placeholder="Enlace 'Ver vídeo' (opcional)..." fontSize={11}
                                  onSave={v => actualizarEjercicio(b.id, e.id, 'video_url', v)} />
                              )}
                            </div>

                            {/* Miniatura de media */}
                            {mediaMini}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                const varsDefMetodo = VARS_DEFAULT_METODO[b.metodo || 'individual'] || VARS_DEFAULT_METODO.individual
                const addButtons = (
                  <>
                    {inputInlineBloque === b.id && (
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nombre del ejercicio..."
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            const nombre = e.target.value.trim()
                            e.target.value = ''
                            const { data } = await supabase
                              .from('sesion_ejercicios')
                              .insert({
                                bloque_id: b.id,
                                nombre,
                                orden: ejercicios[b.id]?.length || 0,
                                variables_activas: varsDefMetodo,
                              })
                              .select()
                              .single()
                            if (data) {
                              setEjercicios(ej => ({ ...ej, [b.id]: [...(ej[b.id] || []), data] }))
                              setDirty(true)
                            }
                          }
                          if (e.key === 'Escape') setInputInlineBloque(null)
                        }}
                        onBlur={() => setInputInlineBloque(null)}
                        style={{ width: '100%', padding: '7px 10px', border: 'none', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)', background: 'var(--surface2, #f8f9fa)', fontSize: 12, fontFamily: 'inherit', outline: 'none', color: 'var(--text)', boxSizing: 'border-box' }}
                      />
                    )}
                    <div style={{ display: 'flex', borderTop: '0.5px solid var(--border)' }}>
                      <button onClick={() => abrirCrearEjercicio(b.id, varsDefMetodo)}
                        onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface2, #f8f9fa)'}
                        onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                        style={{ flex: 1, padding: '6px 0', border: 'none', borderRight: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: 11, fontFamily: "'Inter', system-ui, sans-serif", cursor: 'pointer' }}>
                        + ejercicio
                      </button>
                      <button onClick={() => setInputInlineBloque(b.id)}
                        onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface2, #f8f9fa)'}
                        onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                        style={{ flex: 1, padding: '6px 0', border: 'none', borderRight: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text3)', fontSize: 11, cursor: 'pointer' }}>
                        ✏ escribir
                      </button>
                      <button onClick={() => abrirBiblioteca(b.id, varsDefMetodo)}
                        onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface2, #f8f9fa)'}
                        onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                        title="Añadir desde biblioteca"
                        style={{ flex: 1, padding: '6px 0', border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: 11, cursor: 'pointer' }}>
                        📚 biblioteca
                      </button>
                    </div>
                  </>
                )

                const saveDescanso = async v => {
                  const val = v === '' ? null : parseInt(v)
                  await supabase.from('sesion_bloques').update({ descanso_seg: val }).eq('id', b.id)
                  setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, descanso_seg: val } : bl))
                }
                const saveVueltas = async v => {
                  const val = v === '' ? null : parseInt(v)
                  await supabase.from('sesion_bloques').update({ vueltas: val }).eq('id', b.id)
                  setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, vueltas: val } : bl))
                }
                const saveDuracion = async v => {
                  const val = v === '' ? null : parseInt(v)
                  await supabase.from('sesion_bloques').update({ duracion_min: val }).eq('id', b.id)
                  setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, duracion_min: val } : bl))
                }

                const W = {}
                const mC = (hex, alpha) => {
                  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), bl = parseInt(hex.slice(5,7),16)
                  return `rgba(${r},${g},${bl},${alpha})`
                }

                // ── INDIVIDUAL ──
                if (metodo === 'individual') {
                  const c = b.color || METODO_COLOR.individual
                  return (
                    <div style={W}>
                      <div style={{ border: 'none', borderRadius: 0, overflow: 'visible', background: 'transparent' }}>
                        {ejs.map((e, eIdx) => ejCard(e, eIdx, c, eIdx === ejs.length - 1))}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                const footerStd = (labelMetodo, mc) => (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderTop: '1px solid var(--border)', background: `${mc}08` }}>
                    {/* Sección 1: vueltas/series/min */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 10px', borderRight: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{getLabelVueltas(b.metodo)}</span>
                      <input type="number" placeholder="—" defaultValue={b.vueltas || ''}
                        key={`v-${b.id}`}
                        onBlur={async ev => { const v = ev.target.value === '' ? null : parseInt(ev.target.value); const { error } = await supabase.from('sesion_bloques').update({ vueltas: v }).eq('id', b.id); if (error) console.error('[vueltas]', error); else setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, vueltas: v } : bl)) }}
                        style={{ width: 40, border: 'none', background: 'transparent', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: mc, textAlign: 'center', outline: 'none' }} />
                    </div>
                    {/* Sección 2: descanso entre series/vueltas */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 10px', borderRight: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3, textAlign: 'center' }}>{getLabelDescansoEntre(b.metodo)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" placeholder="—"
                          defaultValue={b.descanso_seg ? (descansoEnMin[b.id] ? Math.round(b.descanso_seg / 60) : b.descanso_seg) : ''}
                          key={`ds-${b.id}-${descansoEnMin[b.id]}`}
                          onBlur={async ev => { const v = ev.target.value === '' ? null : (descansoEnMin[b.id] ? parseInt(ev.target.value) * 60 : parseInt(ev.target.value)); const { error } = await supabase.from('sesion_bloques').update({ descanso_seg: v }).eq('id', b.id); if (error) console.error('[descanso_seg]', error); else setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, descanso_seg: v } : bl)) }}
                          style={{ width: 36, border: 'none', background: 'transparent', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: mc, textAlign: 'center', outline: 'none' }} />
                        <button onClick={() => setDescansoEnMin(prev => ({ ...prev, [b.id]: !(prev[b.id]) }))} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: `1px solid ${mc}44`, background: 'transparent', color: mc, cursor: 'pointer', fontFamily: 'monospace' }}>
                          {descansoEnMin[b.id] ? 'min' : 'seg'}
                        </button>
                      </div>
                    </div>
                    {/* Sección 3: descanso entre ejercicios */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 10px' }}>
                      <span style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Entre ejercicios</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" placeholder="—"
                          defaultValue={b.descanso_ejercicios_seg ? (descEjEnMin[b.id] ? Math.round(b.descanso_ejercicios_seg / 60) : b.descanso_ejercicios_seg) : ''}
                          key={`dej-${b.id}-${descEjEnMin[b.id]}`}
                          onBlur={async ev => { const v = ev.target.value === '' ? null : (descEjEnMin[b.id] ? parseInt(ev.target.value) * 60 : parseInt(ev.target.value)); const { error } = await supabase.from('sesion_bloques').update({ descanso_ejercicios_seg: v }).eq('id', b.id); if (error) console.error('[descanso_ejercicios_seg]', error); else setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, descanso_ejercicios_seg: v } : bl)) }}
                          style={{ width: 36, border: 'none', background: 'transparent', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: mc, textAlign: 'center', outline: 'none' }} />
                        <button onClick={() => setDescEjEnMin(prev => ({ ...prev, [b.id]: !(prev[b.id]) }))} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, border: `1px solid ${mc}44`, background: 'transparent', color: mc, cursor: 'pointer', fontFamily: 'monospace' }}>
                          {descEjEnMin[b.id] ? 'min' : 'seg'}
                        </button>
                      </div>
                    </div>
                  </div>
                )

                const BOX = {}

                // ── SUPERSERIE ──
                if (metodo === 'superserie') {
                  const c = b.color || METODO_COLOR.superserie
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        {ejs.map((e, eIdx) => (
                          <div key={e.id}>
                            {ejCard(e, eIdx, c, true)}
                            {eIdx < ejs.length - 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 12px', background: mC(c, 0.05) }}>
                                <div style={{ flex: 1, height: 0.5, background: mC(c, 0.20) }} />
                                <span style={{ fontSize: 12, color: c, opacity: .6 }}>⇅</span>
                                <div style={{ flex: 1, height: 0.5, background: mC(c, 0.20) }} />
                              </div>
                            )}
                          </div>
                        ))}
                        {footerStd('superseries', c)}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── TRISERIE ──
                if (metodo === 'triserie') {
                  const c = b.color || METODO_COLOR.triserie
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        {ejs.map((e, eIdx) => (
                          <div key={e.id}>
                            {ejCard(e, eIdx, c, true)}
                            {eIdx < ejs.length - 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 12px', background: mC(c, 0.05) }}>
                                <div style={{ flex: 1, height: 0.5, background: mC(c, 0.20) }} />
                                <span style={{ fontSize: 12, color: c, opacity: .6 }}>↓</span>
                                <div style={{ flex: 1, height: 0.5, background: mC(c, 0.20) }} />
                              </div>
                            )}
                          </div>
                        ))}
                        {footerStd('triseries', c)}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── CIRCUITO ──
                if (metodo === 'circuito') {
                  const c = b.color || METODO_COLOR.circuito
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        {ejs.map((e, eIdx) => ejCard(e, eIdx, c, eIdx === ejs.length - 1))}
                        {footerStd('vueltas', c)}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── COMPLEJO ──
                if (metodo === 'complejo') {
                  const c = b.color || METODO_COLOR.complejo
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        <div style={{ display: 'flex', alignItems: 'stretch' }}>
                          {ejs.map((e, eIdx) => (
                            <div key={e.id} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                              <div style={{ flex: 1, minWidth: 0, borderRight: eIdx < ejs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                {ejCard(e, eIdx, c, true)}
                              </div>
                              {eIdx < ejs.length - 1 && (
                                <span style={{ fontSize: 11, color: c, opacity: .6, padding: '0 4px', flexShrink: 0 }}>→</span>
                              )}
                            </div>
                          ))}
                        </div>
                        {footerStd('series', c)}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── CONTRAST TRAINING ──
                if (metodo === 'contrast') {
                  const c = b.color || METODO_COLOR.contrast
                  const badges = [
                    { label: '💪 Carga pesada', bg: mC(c, 0.07), color: c },
                    { label: '⚡ Explosivo', bg: 'rgba(196,122,46,.07)', color: '#c47a2e' },
                    { label: '🔥 Velocidad', bg: 'rgba(192,122,58,.07)', color: '#c07a3a' },
                  ]
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(ejs.length, 2)}, 1fr)` }}>
                          {ejs.map((e, eIdx) => {
                            const bg = badges[eIdx]
                            return (
                              <div key={e.id} style={{ borderRight: eIdx < ejs.length - 1 ? '1px solid var(--border)' : 'none' }}>
                                {bg && <div style={{ padding: '5px 12px', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', background: bg.bg, color: bg.color, borderBottom: '1px solid var(--border)' }}>{bg.label}</div>}
                                {ejCard(e, eIdx, bg?.color || c, true)}
                              </div>
                            )
                          })}
                        </div>
                        {footerStd('pares', c)}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── CLUSTER ──
                if (metodo === 'cluster') {
                  const c = b.color || METODO_COLOR.cluster
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        {ejs.map((e, eIdx) => ejCard(e, eIdx, c, eIdx === ejs.length - 1))}
                        {footerStd('series', c)}
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── EMOM ──
                if (metodo === 'emom') {
                  const c = b.color || METODO_COLOR.emom
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        {/* header compacto sin fondo de color */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '0.5px solid var(--border)' }}>
                          <span style={{ fontSize: 11, color: c }}>⏱</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>EMOM</span>
                          <InlineInput value={b.duracion_min != null ? String(b.duracion_min) : ''} placeholder="20" fontSize={11} type="number" onSave={saveDuracion} style={{ width: 32, color: c, fontFamily: "'JetBrains Mono', monospace" }} />
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>min · cada minuto en punto</span>
                        </div>
                        {ejs.map((e, eIdx) => ejCard(e, eIdx, c, eIdx === ejs.length - 1, `MIN ${eIdx + 1}`))}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderTop: '0.5px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
                          <span>⏱ Duración:</span>
                          <input type="number" defaultValue={b.duracion_min || ''} onBlur={ev => { const v = ev.target.value === '' ? null : parseInt(ev.target.value); supabase.from('sesion_bloques').update({ duracion_min: v }).eq('id', b.id); setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, duracion_min: v } : bl)) }}
                            style={{ width: 44, border: 'none', borderBottom: `1px solid ${c}66`, background: 'transparent', color: c, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 11, textAlign: 'center' }} placeholder="—" />
                          <span>min</span>
                          <span style={{ flex: 1 }} />
                          <span>Rondas:</span>
                          <input type="number" defaultValue={b.nota || ''} onBlur={ev => { const v = ev.target.value; supabase.from('sesion_bloques').update({ nota: v || null }).eq('id', b.id); setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, nota: v || null } : bl)) }}
                            style={{ width: 36, border: 'none', borderBottom: `1px solid ${c}66`, background: 'transparent', color: c, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500, fontSize: 11, textAlign: 'center' }} placeholder="—" />
                        </div>
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // ── AMRAP ──
                if (metodo === 'amrap') {
                  const c = b.color || METODO_COLOR.amrap
                  return (
                    <div style={W}>
                      <div style={BOX}>
                        {/* header compacto sin fondo de color */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderBottom: '0.5px solid var(--border)' }}>
                          <span style={{ fontSize: 11, color: c }}>⏱</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace" }}>AMRAP</span>
                          <InlineInput value={b.duracion_min != null ? String(b.duracion_min) : ''} placeholder="15" fontSize={11} type="number" onSave={saveDuracion} style={{ width: 32, color: c, fontFamily: "'JetBrains Mono', monospace" }} />
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>min · máximas rondas posibles</span>
                        </div>
                        {ejs.map((e, eIdx) => ejCard(e, eIdx, c, eIdx === ejs.length - 1))}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '0.5px solid var(--border)', background: `${c}08`, padding: '8px 12px', gap: 8 }}>
                          <span style={{ fontSize: 9, color: c, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Tiempo</span>
                          <input type="number" placeholder="—" defaultValue={b.duracion_min || ''}
                            onBlur={async ev => { const val = parseInt(ev.target.value); if (!isNaN(val)) { await supabase.from('sesion_bloques').update({ duracion_min: val }).eq('id', b.id); setBloques(bs => bs.map(blq => blq.id === b.id ? { ...blq, duracion_min: val } : blq)) } }}
                            style={{ width: 44, border: 'none', borderBottom: `1px solid ${c}66`, background: 'transparent', fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: c, textAlign: 'center', outline: 'none' }} />
                          <span style={{ fontSize: 12, color: c, fontWeight: 500 }}>min</span>
                        </div>
                        <div style={{ borderTop: '0.5px solid var(--border)', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Rondas realizadas:</span>
                          <input type="number" placeholder="—"
                            defaultValue={(() => { try { return JSON.parse(b.nota || '{}').rondas || '' } catch { return '' } })()}
                            onBlur={async ev => {
                              const val = parseInt(ev.target.value)
                              if (!isNaN(val)) {
                                const notaActual = (() => { try { return JSON.parse(b.nota || '{}') } catch { return {} } })()
                                const nuevaNota = JSON.stringify({ ...notaActual, rondas: val })
                                await supabase.from('sesion_bloques').update({ nota: nuevaNota }).eq('id', b.id)
                                setBloques(bs => bs.map(blq => blq.id === b.id ? { ...blq, nota: nuevaNota } : blq))
                              }
                            }}
                            style={{ width: 44, border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--text)', textAlign: 'center', outline: 'none' }} />
                        </div>
                        {addButtons}
                      </div>
                    </div>
                  )
                }

                // fallback
                return (
                  <div style={W}>
                    <div style={BOX}>
                      {ejs.map((e, eIdx) => ejCard(e, eIdx, b.color || METODO_COLOR.individual, eIdx === ejs.length - 1))}
                      {addButtons}
                    </div>
                  </div>
                )
              }
              const VARS_MENU = [
                { grupo: 'Carga', items: ['Peso', 'Peso/lado', 'Duración'] },
                { grupo: 'Ejecución', items: ['Velocidad', 'RIR', 'Descanso'] },
                { grupo: 'Notas', items: ['Indicaciones'] },
              ]
              async function toggleVariable(ej, varName) {
                const current = ej.variables_activas || []
                const next = current.includes(varName)
                  ? current.filter(v => v !== varName)
                  : [...current, varName]
                await actualizarEjercicio(b.id, ej.id, 'variables_activas', next)
              }
              const varsDefault = b.variables_default || []
              const TODAS_VARS = ['Peso','Peso/lado','Duración','RIR','Distancia','Altura','Descanso','Forma de ejecución','Indicaciones']
              return (
              <div key={b.id} className="card" draggable
                onDragStart={e => { setDraggingBloqueId(b.id); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnd={() => { setDraggingBloqueId(null); setDragOverBloqueId(null) }}
                style={{ padding: 0, overflow: 'hidden', opacity: draggingBloqueId === b.id ? 0.45 : 1, outline: dragOverBloqueId === b.id ? `2px solid ${METODO_COLOR[b.metodo || 'individual']}` : 'none', outlineOffset: 2, transition: 'opacity 0.15s' }}
                onDragOver={e => { e.preventDefault(); if (libDragActive) { e.dataTransfer.dropEffect = 'copy'; setDragOverBloqueId(b.id) } else if (draggingBloqueId && draggingBloqueId !== b.id) { e.dataTransfer.dropEffect = 'move'; setDragOverBloqueId(b.id) } }}
                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverBloqueId(null) }}
                onDrop={e => {
                  e.preventDefault(); setDragOverBloqueId(null)
                  if (libDragActive) {
                    try { const d = JSON.parse(e.dataTransfer.getData('application/json')); if (d.tipo === 'ejercicio_bib') insertarEjercicioDesdePanel(d.item, b.id) } catch {}
                  } else if (draggingBloqueId && draggingBloqueId !== b.id) {
                    reordenarBloques(draggingBloqueId, b.id)
                  }
                }}>
                {(() => {
                  const mc = METODO_COLOR[b.metodo || 'individual']
                  const bc = b.color || mc
                  const nombreMetodo = (METODOS_SESION.find(m => m.id === (b.metodo || 'individual'))?.nombre || b.metodo || 'Individual').toUpperCase()
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px', borderBottom: '0.5px solid var(--border)' }}>
                        <span style={{ color: 'var(--text4)', cursor: 'grab', fontSize: 13, userSelect: 'none', flexShrink: 0 }}>⠿</span>
                        <div
                          title="Cambiar color del bloque"
                          onClick={ev => { ev.stopPropagation(); const r = ev.currentTarget.getBoundingClientRect(); setColorPickerBloque(colorPickerBloque?.bloqueId === b.id ? null : { bloqueId: b.id, x: r.left, y: r.bottom + 6 }) }}
                          style={{ width: 30, height: 30, borderRadius: '50%', background: `${bc}15`, border: `2px solid ${bc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 12, fontFamily: 'monospace', fontWeight: 700, color: bc }}>
                          {idx + 1}
                        </div>
                        <span
                          title="Cambiar método"
                          onClick={ev => { ev.stopPropagation(); setEditandoMetodo(editandoMetodo === b.id ? null : b.id) }}
                          style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `${bc}18`, color: bc, border: `1px solid ${bc}33`, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.05em', cursor: 'pointer' }}>
                          {nombreMetodo}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <InlineInput value={b.nombre} placeholder={`Bloque ${idx + 1}`} fontSize={13}
                            style={{ fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif" }}
                            onSave={v => actualizarBloque(b.id, 'nombre', v)} />
                        </div>
                        <button className="btn btn-ghost btn-sm" title="Guardar en biblioteca" onClick={() => guardarBloqueEnBiblioteca(b)} style={{ color: 'var(--text3)', opacity: .5 }}>🧱</button>
                        <button className="btn btn-ghost btn-sm" title="Copiar bloque" onClick={() => copiarBloqueFuerza(b)} style={{ color: 'var(--text3)', opacity: .5 }}>📋</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', opacity: .5 }} onClick={() => eliminarBloque(b.id)}><Trash2 size={12} /></button>
                      </div>
                      {editandoMetodo === b.id && (
                        <div style={{ padding: '8px 10px', borderBottom: '0.5px solid var(--border)', background: 'var(--surface2, #f8f9fa)' }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 }}>Cambiar método</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                            {METODOS_SESION.map(m => (
                              <button key={m.id} type="button"
                                onClick={async () => {
                                  await supabase.from('sesion_bloques').update({ metodo: m.id, descripcion_metodo: DESCRIPCIONES_METODO[m.id] }).eq('id', b.id)
                                  setBloques(bs => bs.map(bl => bl.id === b.id ? { ...bl, metodo: m.id, descripcion_metodo: DESCRIPCIONES_METODO[m.id] } : bl))
                                  setEditandoMetodo(null)
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 7, border: b.metodo === m.id ? `1.5px solid ${bc}` : '1px solid var(--border)', background: b.metodo === m.id ? `${bc}12` : 'var(--bg)', cursor: 'pointer', fontSize: 10, fontWeight: b.metodo === m.id ? 700 : 400, color: b.metodo === m.id ? bc : 'var(--text2)' }}>
                                <span>{m.icono}</span><span>{m.nombre}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 9, color: 'var(--text3)', fontStyle: 'italic', padding: '0 10px 5px 18px', lineHeight: 1.4, cursor: 'text', fontFamily: "'Inter', system-ui, sans-serif", background: 'var(--surface2, #f8f9fa)', borderBottom: '0.5px solid var(--border)' }}>
                        {editandoDescripcion === b.id ? (
                          <textarea
                            autoFocus
                            defaultValue={b.descripcion_metodo || DESCRIPCIONES_METODO[b.metodo || 'individual']}
                            onBlur={async ev => {
                              const texto = ev.target.value.trim()
                              await supabase.from('sesion_bloques').update({ descripcion_metodo: texto || null }).eq('id', b.id)
                              setBloques(bs => bs.map(x => x.id === b.id ? { ...x, descripcion_metodo: texto || null } : x))
                              setEditandoDescripcion(null)
                            }}
                            style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 10, fontStyle: 'italic', color: 'var(--text3)', resize: 'none', outline: 'none', fontFamily: 'inherit', lineHeight: 1.4, padding: '4px 0 4px' }}
                            rows={2}
                          />
                        ) : (
                          <span style={{ display: 'block', padding: '4px 0' }} onClick={() => setEditandoDescripcion(b.id)}>
                            {b.descripcion_metodo || DESCRIPCIONES_METODO[b.metodo || 'individual']}
                          </span>
                        )}
                      </div>
                    </>
                  )
                })()}
                {renderEjerciciosBloque(b, ejercicios[b.id] || [], { toggleVariable, actualizarEjercicio, eliminarEjercicio, abrirCrearEjercicio, abrirBiblioteca, draggingEj, setDraggingEj, setEjercicios, ejercicios, menuVariableAbierto, setMenuVariableAbierto, menuVariablePos, setMenuVariablePos, mediaPreviewTimeout, setMediaPreview, VARS_MENU })}
              </div>
              )
            })}
            {/* Drop zone para bloque completo desde biblioteca */}
            {libDragActive && (
              <div
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
                onDrop={e => {
                  e.preventDefault(); setLibDragActive(false)
                  try {
                    const d = JSON.parse(e.dataTransfer.getData('application/json'))
                    if (d.tipo === 'bloque_bib') insertarBloqueDesdePanel(d.item)
                  } catch {}
                }}
                style={{ border: '2px dashed #6ee7b7', borderRadius: 10, padding: '14px', textAlign: 'center', fontSize: 12, color: '#065f46', background: '#ecfdf5', fontWeight: 600 }}>
                ↓ Suelta aquí para añadir el bloque completo
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              <button className="btn btn-ghost" onClick={añadirBloque}>
                <Plus size={13} /> Bloque
              </button>
              {clipboardBloque && clipboardBloque.tipo === 'bloque_fuerza' && (
                <button className="btn btn-ghost" onClick={pegarDesdePortapapeles}
                  style={{ border: '1.5px solid #d1fae5', background: '#ecfdf5', color: '#065f46' }}
                  title={`Pegar: "${clipboardBloque.nombre}"`}>
                  📋 Pegar: <em style={{ marginLeft: 4 }}>{clipboardBloque.nombre}</em>
                  <span onClick={e => { e.stopPropagation(); limpiarPortapapeles() }} style={{ marginLeft: 6, cursor: 'pointer' }}>×</span>
                </button>
              )}
            </div>
          </div>}

          {/* ── VISTA PREVIA CLIENTE (modo lectura) ── */}
          {sesionAbierta.tipo_editor !== 'carrera' && vistaPrevia && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#856404' }}>
                👁 Vista previa — así verá el cliente la sesión
              </div>
              {bloques.map((b, idx) => (
                <div key={b.id} style={{ background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ padding: '10px 14px', borderLeft: `4px solid ${b.color || COLORES[0]}`, fontWeight: 700, fontSize: 14 }}>
                    {b.nombre || `Bloque ${idx + 1}`}
                  </div>
                  {b.nota && <div style={{ padding: '0 14px 8px', fontSize: 12.5, color: 'var(--text2)' }}>{b.nota}</div>}
                  <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(ejercicios[b.id] || []).map((e, eIdx) => {
                      const activas = e.variables_activas || []
                      const rirColors = { '4+': '#16a34a', '2-3': '#ca8a04', '1-0': '#dc2626' }
                      return (
                        <div key={e.id} style={{ background: '#fff', borderRadius: 9, border: '1px solid var(--border)', padding: '10px 12px', borderLeft: `3px solid ${b.color || COLORES[0]}` }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginRight: 5 }}>{idx + 1}.{eIdx + 1}.</span>
                            {e.nombre || 'Sin nombre'}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {e.series && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>SERIES</span>{e.series}</span>}
                            {e.reps && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>REPS</span>{e.reps}{e.reps_por_lado ? '/lado' : ''}</span>}
                            {activas.includes('Peso') && e.peso && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>PESO</span>{e.peso} kg</span>}
                            {activas.includes('Peso/lado') && (e.peso_der || e.peso_izq) && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>PESO/LADO</span>D: {e.peso_der || '—'} · I: {e.peso_izq || '—'} kg</span>}
                            {activas.includes('Duración') && e.duracion && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>DURACIÓN</span>{e.duracion} s</span>}
                            {activas.includes('RIR') && e.rpe && <span style={{ background: rirColors[e.rpe] + '22', borderRadius: 7, padding: '4px 9px', fontSize: 11, color: rirColors[e.rpe] }}><span style={{ fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>RIR</span>{e.rpe}</span>}
                            {activas.includes('Distancia') && e.distancia && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>DISTANCIA</span>{e.distancia} m</span>}
                            {activas.includes('Altura') && e.altura && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>ALTURA</span>{e.altura} cm</span>}
                            {activas.includes('Descanso') && e.descanso && <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}><span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>DESCANSO</span>{e.descanso}</span>}
                            {activas.includes('Forma de ejecución') && e.ejecucion_tipo && (
                              <span style={{ background: 'var(--bg2)', borderRadius: 7, padding: '4px 9px', fontSize: 11 }}>
                                <span style={{ color: 'var(--text3)', fontSize: 9, fontFamily: 'var(--mono)', marginRight: 4 }}>EJECUCIÓN</span>
                                {e.ejecucion_tipo !== 'Personalizado' ? e.ejecucion_tipo : ''}{e.ejecucion_texto ? (e.ejecucion_tipo !== 'Personalizado' ? ` — ${e.ejecucion_texto}` : e.ejecucion_texto) : ''}
                              </span>
                            )}
                          </div>
                          {activas.includes('Indicaciones') && e.notas && (
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>📝 {e.notas}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal sesión: solo título, fecha, duración (lo mínimo que necesita una identidad) */}
      {mostrarSelectorMetodo && (
        <div className="modal-backdrop" onClick={() => setMostrarSelectorMetodo(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="modal-title">Elige el método del bloque</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setMostrarSelectorMetodo(false)}><X size={14} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: '4px 0 8px' }}>
              {METODOS_SESION.map(m => (
                <button key={m.id} type="button"
                  onClick={() => crearBloqueConMetodo(m.id)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 16 }}>{m.icono}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{m.nombre}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text3)', lineHeight: 1.4 }}>{m.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modalSesion && (
        <div className="modal-backdrop" onClick={() => setModalSesion(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modalSesion === 'nueva' ? 'Nueva sesión' : 'Editar sesión'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalSesion(null)}><X size={14} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de sesión</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['optimizadora', 'coadyuvante'].map(tipo => (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => setFormSesion(f => ({ ...f, tipo_sesion_detalle: tipo }))}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius)',
                      border: formSesion.tipo_sesion_detalle === tipo
                        ? '1.5px solid var(--accent)'
                        : '1px solid var(--border)',
                      background: formSesion.tipo_sesion_detalle === tipo
                        ? 'var(--accent-light)'
                        : 'transparent',
                      color: formSesion.tipo_sesion_detalle === tipo
                        ? 'var(--accent)'
                        : 'var(--text2)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: formSesion.tipo_sesion_detalle === tipo ? 500 : 400,
                      textTransform: 'capitalize',
                    }}
                  >
                    {tipo.charAt(0).toUpperCase() + tipo.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Estructura */}
            <div className="form-group">
              <label className="form-label">Tipo de editor</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[['fuerza','💪','Fuerza / salud'],['carrera','🏃','Carrera / resistencia']].map(([val, ico, label]) => {
                  const active = (formSesion.tipo_editor || 'fuerza') === val
                  return (
                    <button key={val} type="button" onClick={() => setFormSesion(f => ({ ...f, tipo_editor: val }))}
                      style={{ flex: 1, padding: '8px', borderRadius: 9, border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>{ico}</span> {label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Icono de sesión</label>
              <EmojiPicker value={formSesion.icono || ''} onChange={v => setFormSesion(f => ({ ...f, icono: v }))} />
            </div>
            <div className="form-group"><label className="form-label">Título *</label><input className="form-input" value={formSesion.titulo} onChange={e => setFormSesion(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Sesión 5 - Fuerza general" autoFocus /></div>
            <div className="form-group">
              <label className="form-label">Fecha</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input className="form-input" type="date" value={formSesion.fecha} disabled={formSesion.sinFecha} style={{ flex: 1, opacity: formSesion.sinFecha ? 0.4 : 1 }} onChange={e => setFormSesion(f => ({ ...f, fecha: e.target.value }))} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={!!formSesion.sinFecha} onChange={e => {
                    const checked = e.target.checked
                    setFormSesion(f => ({ ...f, sinFecha: checked, fecha: checked ? '' : f.fecha, tipo_sesion: checked ? (f.tipo_sesion === 'programada' ? 'flexible' : f.tipo_sesion) : (f.tipo_sesion === 'flexible' ? 'programada' : f.tipo_sesion) }))
                  }} />
                  Sin fecha asignada
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de sesión</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(formSesion.sinFecha
                  ? [['flexible', '🔄 Flexible'], ['opcional', '⭐ Opcional']]
                  : [['programada', '📅 Programada'], ['opcional', '⭐ Opcional']]
                ).map(([val, label]) => {
                  const active = (formSesion.tipo_sesion || 'programada') === val
                  return (
                    <button key={val} type="button" onClick={() => setFormSesion(f => ({ ...f, tipo_sesion: val }))}
                      style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--accent)' : 'var(--text2)' }}>
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
            {modalSesion !== 'nueva' && (
              <div className="form-group">
                <label className="form-label">Estado</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[['pendiente','Pendiente','#f3f4f6','#6b7280','#d1d5db'],['completada','✓ Completada','#dcfce7','#166534','#16a34a'],['parcial','〜 Parcial','#fef9c3','#713f12','#ca8a04'],['no_realizada','✗ No realizada','#fee2e2','#7f1d1d','#dc2626']].map(([val, label, bg, color, border]) => {
                    const active = (formSesion.estado || 'pendiente') === val
                    return (
                      <button key={val} type="button" onClick={() => setFormSesion(f => ({ ...f, estado: val }))}
                        style={{ padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${active ? border : 'var(--border)'}`, background: active ? bg : 'var(--bg)', color: active ? color : 'var(--text3)', fontSize: 11, fontWeight: active ? 700 : 400, cursor: 'pointer' }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            {modalSesion !== 'nueva' && ['completada','parcial','realizada'].includes(formSesion.estado) && (
              <div className="form-group">
                <label className="form-label">📅 Fecha realizada <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>(corrección manual)</span></label>
                <input className="form-input" type="date" value={formCompletadaEl} onChange={e => setFormCompletadaEl(e.target.value)} style={{ maxWidth: 180 }} />
                {formCompletadaEl && modalSesion?.fecha && formCompletadaEl !== modalSesion.fecha && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Planificada: {modalSesion.fecha}</div>
                )}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">📋 Observaciones para el cliente</label>
              <textarea className="form-textarea" value={formSesion.objetivo} onChange={e => setFormSesion(f => ({ ...f, objetivo: e.target.value }))} rows={2} placeholder="Descripción o notas que verá el cliente en su vista..." />
            </div>
            <div className="form-group">
              <label className="form-label">🔒 Notas de entrenadora <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>(solo tú)</span></label>
              <textarea className="form-textarea" value={formSesion.notas_entrenador} onChange={e => setFormSesion(f => ({ ...f, notas_entrenador: e.target.value }))} rows={2} placeholder="Notas internas, contexto, recordatorios..." />
            </div>
            <div className="form-group">
              <label className="form-label">Modalidad</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ val: 'presencial', label: '🏋️ Presencial' }, { val: 'online', label: '💻 Online' }, { val: 'autonoma', label: '🏃 Autónoma' }].map(({ val, label }) => (
                  <button key={val} type="button"
                    onClick={() => setFormSesion(f => ({ ...f, modalidad: val, lugar: val !== 'presencial' ? '' : f.lugar }))}
                    style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, border: '1px solid', cursor: 'pointer', background: (formSesion.modalidad || 'autonoma') === val ? 'var(--accent)' : 'transparent', color: (formSesion.modalidad || 'autonoma') === val ? '#fff' : 'var(--text2)', borderColor: (formSesion.modalidad || 'autonoma') === val ? 'var(--accent)' : 'var(--border)' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {(formSesion.modalidad || 'autonoma') === 'presencial' && (
              <div className="form-group">
                <label className="form-label">Lugar</label>
                <input className="form-input" type="text" value={formSesion.lugar} onChange={e => setFormSesion(f => ({ ...f, lugar: e.target.value }))} placeholder="Ej: Gym Norte, Centro Deportivo..." />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Duración (min)</label>
              <input className="form-input" type="number" min="1" value={formSesion.duracion_min} onChange={e => setFormSesion(f => ({ ...f, duracion_min: e.target.value }))} style={{ maxWidth: 120 }} placeholder="Ej: 45" />
            </div>
            <div className="form-group" style={{ marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div onClick={() => setFormSesion(f => ({ ...f, con_feedback: !f.con_feedback }))}
                  style={{ width: 36, height: 20, borderRadius: 10, background: formSesion.con_feedback !== false ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, cursor: 'pointer' }}>
                  <div style={{ position: 'absolute', top: 2, left: formSesion.con_feedback !== false ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>Feedback post-sesión</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formSesion.con_feedback !== false ? 'El cliente verá el cuestionario al terminar' : 'Sin cuestionario (sesión de activación, movilidad...)'}</div>
                </div>
              </label>
            </div>
            {/* Toggle: visibilidad cliente */}
            <div style={{ margin: '8px 0 4px', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${formSesion.publicada !== false ? 'var(--border)' : '#94a3b8'}`, background: formSesion.publicada !== false ? 'var(--bg2)' : '#f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => setFormSesion(f => ({ ...f, publicada: f.publicada === false ? true : false }))}>
              <div style={{ width: 38, height: 22, borderRadius: 11, background: formSesion.publicada !== false ? 'var(--accent)' : '#94a3b8', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: formSesion.publicada !== false ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: formSesion.publicada !== false ? 'var(--text)' : '#64748b' }}>{formSesion.publicada !== false ? '👁 Visible para el cliente' : '🔒 Oculta al cliente (borrador)'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formSesion.publicada !== false ? 'El cliente puede ver esta sesión' : 'Solo tú la ves, el cliente no'}</div>
              </div>
            </div>
            {/* Toggle: sesión lista */}
            <div style={{ margin: '4px 0 8px', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${formSesion.lista ? '#16a34a' : 'var(--border)'}`, background: formSesion.lista ? '#f0fdf4' : 'var(--bg2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => setFormSesion(f => ({ ...f, lista: !f.lista }))}>
              <div style={{ width: 38, height: 22, borderRadius: 11, background: formSesion.lista ? '#16a34a' : 'var(--border)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 3, left: formSesion.lista ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: formSesion.lista ? '#16a34a' : 'var(--text)' }}>{formSesion.lista ? '✅ Sesión lista para el cliente' : '📝 Sesión en preparación'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formSesion.lista ? 'Contenido completo, el cliente puede ejecutarla' : 'Pensada pero pendiente de desarrollar'}</div>
              </div>
            </div>
            {modalSesion === 'nueva' && (
              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{(formSesion.tipo_editor || 'fuerza') === 'carrera' ? 'Se crearán 3 fases de ejemplo (calentamiento, trabajo, vuelta a la calma).' : 'Se crearán 4 bloques con 3 ejercicios de ejemplo, listos para editar.'}</p>
            )}
            {modalSesion !== 'nueva' && (
              <div style={{ marginBottom: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                  const cli = clientes.find(c => c.id === clienteSeleccionado)
                  setModalComentario({ sesionId: modalSesion.id, sesionTitulo: modalSesion.titulo, clienteEmail: cli?.email || null, inicial: modalSesion.comentario_entrenadora || null })
                }}>
                  💬 {modalSesion.comentario_entrenadora ? 'Editar mensaje al cliente' : 'Enviar mensaje al cliente'}
                </button>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalSesion(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarSesion} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
     )}

      {/* Modal comentario entrenadora */}
      {modalComentario && (
        <ModalComentarioEntrenadora
          {...modalComentario}
          onGuardado={() => {
            cargarSesiones()
            if (modalSesion && modalSesion !== 'nueva') {
              setSesiones(ss => ss.map(s => s.id === modalComentario.sesionId ? { ...s, comentario_entrenadora: modalComentario.inicial } : s))
            }
          }}
          onClose={() => setModalComentario(null)}
        />
      )}

      {/* Modal competición desde calendario */}
      {modalCompCal && (
        <div className="modal-backdrop" onClick={() => setModalCompCal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
            <span className="modal-title">{editandoComp ? 'Editar competición' : 'Nueva competición'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalCompCal(false)}><X size={14} /></button>
            </div>
            <div className="form-group"><label className="form-label">Nombre *</label><input className="form-input" value={formCompCal.nombre} onChange={e => setFormCompCal(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Media maratón Sevilla" autoFocus /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Fecha</label><input className="form-input" type="date" value={formCompCal.fecha} onChange={e => setFormCompCal(f => ({ ...f, fecha: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Tipo</label><input className="form-input" value={formCompCal.tipo} onChange={e => setFormCompCal(f => ({ ...f, tipo: e.target.value }))} placeholder="Ej: Carrera, Triatlón..." /></div>
            </div>
            <div className="form-group"><label className="form-label">Objetivo</label><input className="form-input" value={formCompCal.objetivo} onChange={e => setFormCompCal(f => ({ ...f, objetivo: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Notas</label><textarea className="form-textarea" value={formCompCal.notas} onChange={e => setFormCompCal(f => ({ ...f, notas: e.target.value }))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalCompCal(false)}>Cancelar</button>
             <button className="btn btn-primary" disabled={saving} onClick={async () => {
                if (!formCompCal.nombre) return
                setSaving(true)
                const datos = { nombre: formCompCal.nombre, fecha: formCompCal.fecha, tipo: formCompCal.tipo || null, objetivo: formCompCal.objetivo || null, notas: formCompCal.notas || null }
                if (editandoComp) {
                  await supabase.from('competiciones').update(datos).eq('id', editandoComp.id)
                } else {
                  await supabase.from('competiciones').insert({ ...datos, cliente_id: clienteSeleccionado })
                }
                setSaving(false); setModalCompCal(false); cargarSesiones()
              }}>{saving ? 'Guardando...' : editandoComp ? 'Guardar cambios' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nota desde calendario */}
      {modalNotaCal && (
        <div className="modal-backdrop" onClick={() => setModalNotaCal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
            <span className="modal-title">{editandoNota ? 'Editar nota' : 'Nueva nota'} · {formNotaCal.fecha}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalNotaCal(false)}><X size={14} /></button>
            </div>
            <div className="form-group"><label className="form-label">Nota</label><textarea className="form-textarea" value={formNotaCal.texto} onChange={e => setFormNotaCal(f => ({ ...f, texto: e.target.value }))} placeholder="Escribe aquí tu nota..." style={{ minHeight: 100 }} autoFocus /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalNotaCal(false)}>Cancelar</button>
            <button className="btn btn-primary" disabled={saving} onClick={async () => {
                if (!formNotaCal.texto) return
                setSaving(true)
                if (editandoNota) {
                  await supabase.from('sesion_notas').update({ texto: formNotaCal.texto, fecha: formNotaCal.fecha }).eq('id', editandoNota.id)
                } else {
                  await supabase.from('sesion_notas').insert({ cliente_id: clienteSeleccionado, fecha: formNotaCal.fecha, texto: formNotaCal.texto })
                }
                setSaving(false); setModalNotaCal(false); cargarSesiones()
              }}>{saving ? 'Guardando...' : editandoNota ? 'Guardar cambios' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
   {/* Modal duplicar sesión */}
      {modalDuplicar && (
        <div className="modal-backdrop" onClick={() => setModalDuplicar(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Duplicar sesión</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalDuplicar(null)}><X size={14} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 10 }}>Se duplicará "{modalDuplicar.titulo}" con todos sus bloques y ejercicios.</p>
            <div className="form-group"><label className="form-label">Nueva fecha</label><input className="form-input" type="date" value={fechaDuplicar} onChange={e => setFechaDuplicar(e.target.value)} autoFocus /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModalDuplicar(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={saving} onClick={async () => {
                await duplicarSesion(modalDuplicar, fechaDuplicar)
                setModalDuplicar(null)
              }}>{saving ? 'Duplicando...' : 'Duplicar'}</button>
            </div>
          </div>
        </div>
      )}
      {modalPack && (
        <div className="modal-backdrop" onClick={() => setModalPack(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modalPack === 'nuevo' ? 'Nuevo pack flexible' : 'Editar pack'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalPack(null)}><X size={14} /></button>
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

      {modalBiblioteca && (() => {
        const textoBib = busquedaBiblioteca.toLowerCase()
        const bibFiltrada = !biblioteca ? [] : biblioteca.filter(item => !textoBib || item.nombre.toLowerCase().includes(textoBib))

        return (
          <div className="modal-backdrop" onClick={() => setModalBiblioteca(null)}>
            <div className="modal" style={{ maxWidth: 640, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">📚 Biblioteca de ejercicios</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setModalBiblioteca(null)}>✕</button>
              </div>

              {/* Búsqueda */}
              <div style={{ padding: '0 0 10px' }}>
                <input className="form-input" autoFocus placeholder="Buscar ejercicio..." value={busquedaBiblioteca} onChange={e => setBusquedaBiblioteca(e.target.value)} />
              </div>

              {/* Lista de ejercicios */}
              <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {!biblioteca ? (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Cargando...</div>
                ) : bibFiltrada.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 20 }}>Sin resultados</div>
                ) : bibFiltrada.map(item => {
                  const ytid = item.media_tipo === 'youtube' && item.media_url ? item.media_url.match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/)?.[1] : null
                  const thumb = ytid ? `https://img.youtube.com/vi/${ytid}/hqdefault.jpg` : (item.media_url && item.media_tipo !== 'youtube' ? item.media_url : null)
                  return (
                    <div key={item.id} onClick={() => añadirDesdeBiblioteca(item)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: '1px solid transparent' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--border)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}>
                      {thumb
                        ? <img src={thumb} alt="" loading="lazy" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} />
                        : <div style={{ width: 48, height: 36, borderRadius: 5, background: 'var(--bg2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💪</div>
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{item.nombre}</div>
                        {item.descripcion && <div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descripcion}</div>}
                      </div>
                      {item.media_tipo && <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{item.media_tipo === 'youtube' ? '▶' : '🖼'}</span>}
                    </div>
                  )
                })}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  const { bloqueId, variablesDefault } = modalBiblioteca
                  setModalBiblioteca(null)
                  abrirCrearEjercicio(bloqueId, variablesDefault)
                }}>
                  <Plus size={12} /> Crear ejercicio personalizado
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Panel lateral biblioteca (fixed) */}
      {panelBiblioteca && sesionAbierta && (
        <div style={{ position: 'fixed', top: 0, right: 0, width: 294, height: '100vh', background: 'var(--bg)', borderLeft: '1px solid var(--border)', zIndex: 400, display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
          {/* Header */}
          <div style={{ padding: '12px 14px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>📚 Biblioteca</span>
              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => setPanelBiblioteca(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 0 }}>
              {[['ejercicios', '🏋️ Ejercicios'], ['bloques', '🧱 Bloques']].map(([id, label]) => (
                <button key={id} onClick={() => { setTabBiblioteca(id); if (id === 'bloques' && bloquesBiblioteca === null) cargarBloquesBiblioteca() }}
                  style={{ flex: 1, fontSize: 12, padding: '6px 4px', border: 'none', background: 'transparent', borderBottom: `2px solid ${tabBiblioteca === id ? 'var(--accent)' : 'transparent'}`, color: tabBiblioteca === id ? 'var(--accent)' : 'var(--text2)', fontWeight: tabBiblioteca === id ? 600 : 400, cursor: 'pointer', marginBottom: -1 }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab ejercicios */}
          {tabBiblioteca === 'ejercicios' && (
            <>
              <div style={{ padding: '10px 14px 0' }}>
                <input className="form-input" autoFocus placeholder="Buscar ejercicio..." value={busquedaBiblioteca} onChange={e => setBusquedaBiblioteca(e.target.value)} style={{ marginBottom: 6, fontSize: 12 }} />
                <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>Arrastra al bloque destino</p>
              </div>
              {!biblioteca ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>Cargando...</p>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {biblioteca.filter(item => !busquedaBiblioteca || item.nombre.toLowerCase().includes(busquedaBiblioteca.toLowerCase())).map(item => (
                    <div key={item.id} draggable
                      onDragStart={e => { setLibDragActive(true); e.dataTransfer.setData('application/json', JSON.stringify({ tipo: 'ejercicio_bib', item })); e.dataTransfer.effectAllowed = 'copy' }}
                      onDragEnd={() => { setLibDragActive(false); setDragOverBloqueId(null) }}
                      style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 10px', cursor: 'grab', fontSize: 12, color: 'var(--text)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light,#e8f5f0)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
                      <div style={{ fontWeight: 500 }}>{item.nombre}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Tab bloques */}
          {tabBiblioteca === 'bloques' && (
            <>
              <div style={{ padding: '10px 14px 0' }}>
                <p style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>Arrastra a la sesión para insertar</p>
              </div>
              {bloquesBiblioteca === null ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '20px 0' }}>Cargando...</p>
              ) : bloquesBiblioteca.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', textAlign: 'center', padding: '20px 14px' }}>No hay bloques guardados. Usa 🧱 en un bloque de sesión para guardar.</p>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {bloquesBiblioteca.map(bb => (
                    <div key={bb.id} draggable
                      onDragStart={e => { setLibDragActive(true); e.dataTransfer.setData('application/json', JSON.stringify({ tipo: 'bloque_bib', item: bb })); e.dataTransfer.effectAllowed = 'copy' }}
                      onDragEnd={() => { setLibDragActive(false) }}
                      style={{ background: 'var(--bg2)', border: `1.5px solid ${bb.color || 'var(--border)'}22`, borderLeft: `4px solid ${bb.color || 'var(--accent)'}`, borderRadius: 8, padding: '8px 10px', cursor: 'grab', fontSize: 12 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light,#e8f5f0)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'var(--bg2)'}>
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{bb.nombre}</div>
                      {bb.descripcion && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{bb.descripcion}</div>}
                      {bb.ejercicios?.length > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
                          {bb.ejercicios.slice(0, 3).map(e => e.nombre).filter(Boolean).join(' · ')}
                          {bb.ejercicios.length > 3 ? ` +${bb.ejercicios.length - 3}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Modal: Crear ejercicio personalizado */}
      {modalCrearEj && (() => {
        return (
          <div className="modal-backdrop" onClick={() => setModalCrearEj(null)}>
            <div className="modal" style={{ maxWidth: 'min(96vw, 760px)', width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Crear ejercicio personalizado</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setModalCrearEj(null)}>✕</button>
              </div>

              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Columna izquierda */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                  <div className="form-group">
                    <label className="form-label">Nombre *</label>
                    <input className="form-input" autoFocus placeholder="Nombre del ejercicio" value={formCrearEj.nombre}
                      onChange={e => setFormCrearEj(f => ({ ...f, nombre: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Descripción</label>
                    <textarea className="form-input" placeholder="Descripción del ejercicio" value={formCrearEj.descripcion}
                      onChange={e => setFormCrearEj(f => ({ ...f, descripcion: e.target.value }))} rows={8} style={{ resize: 'vertical' }} />
                  </div>
                </div>

                {/* Columna derecha */}
                <div style={{ width: 264, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 0 }}>

                  {/* Vista previa 16:9 */}
                  <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: '#0f172a', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(!formCrearEj.media_url || !formCrearEj.media_tipo) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#334155' }}>
                        <Play size={30} strokeWidth={1.5} />
                        <span style={{ fontSize: 11 }}>Vista previa</span>
                      </div>
                    ) : formCrearEj.media_tipo === 'imagen' ? (
                      <img src={formCrearEj.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : formCrearEj.media_tipo === 'gif' ? (
                      <img src={formCrearEj.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : formCrearEj.media_tipo === 'video' ? (
                      <video src={formCrearEj.media_url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : formCrearEj.media_tipo === 'youtube' ? (() => {
                      const yId = formCrearEj.media_url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1]
                      return yId
                        ? <iframe src={`https://www.youtube.com/embed/${yId}`} style={{ width: '100%', height: '100%', border: 'none' }} title="preview" allowFullScreen />
                        : <span style={{ fontSize: 11, color: '#475569', padding: 12, textAlign: 'center' }}>URL no válida</span>
                    })() : null}
                  </div>

                  {/* Archivo */}
                  <div style={{ marginBottom: 10 }}>
                    <div className="form-label" style={{ marginBottom: 4 }}>Archivo</div>
                    <select className="form-select" value={formCrearEj.media_tipo}
                      onChange={e => setFormCrearEj(f => ({ ...f, media_tipo: e.target.value, media_url: '', video_url: '' }))}
                      style={{ marginBottom: 6 }}>
                      <option value="">Sin media</option>
                      <option value="youtube">YouTube</option>
                      <option value="imagen">Imagen</option>
                      <option value="video">Vídeo</option>
                      <option value="gif">GIF</option>
                    </select>
                    {formCrearEj.media_tipo && (
                      <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          <input className="form-input" value={formCrearEj.media_url}
                            onChange={e => setFormCrearEj(f => ({ ...f, media_url: e.target.value }))}
                            placeholder={formCrearEj.media_tipo === 'youtube' ? 'https://youtube.com/...' : 'https://...'}
                            style={{ flex: 1, fontSize: 12 }} />
                          {formCrearEj.media_tipo !== 'youtube' && (
                            <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                              <input type="file" accept="image/*,video/*,.gif" style={{ display: 'none' }}
                                onChange={async ev => {
                                  const file = ev.target.files?.[0]; if (!file) return
                                  const path = `biblioteca/${Date.now()}.${file.name.split('.').pop()}`
                                  const { error } = await supabase.storage.from('media-ejercicios').upload(path, file, { upsert: true })
                                  if (error) { alert('Error: ' + error.message); return }
                                  const { data: { publicUrl } } = supabase.storage.from('media-ejercicios').getPublicUrl(path)
                                  setFormCrearEj(f => ({ ...f, media_url: publicUrl }))
                                  ev.target.value = ''
                                }} />
                              <span className="btn btn-ghost btn-sm">📁</span>
                            </label>
                          )}
                        </div>
                        {formCrearEj.media_tipo !== 'youtube' && (
                          <input className="form-input" value={formCrearEj.video_url}
                            onChange={e => setFormCrearEj(f => ({ ...f, video_url: e.target.value }))}
                            placeholder='Enlace "Ver vídeo" (opcional)' style={{ fontSize: 12 }} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Notas de ejecución */}
                  <div style={{ marginBottom: 8 }}>
                    <div className="form-label" style={{ marginBottom: 4 }}>Notas de ejecución</div>
                    <textarea className="form-input" placeholder="Indicaciones técnicas..." value={formCrearEj.notas}
                      onChange={e => setFormCrearEj(f => ({ ...f, notas: e.target.value }))} rows={2} style={{ resize: 'vertical', fontSize: 12 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div className="form-label" style={{ marginBottom: 4 }}>Tipo de ejecución</div>
                    <input className="form-input" placeholder="Ej: Excéntrico lento, pausa..." value={formCrearEj.ejecucion_tipo}
                      onChange={e => setFormCrearEj(f => ({ ...f, ejecucion_tipo: e.target.value }))} style={{ fontSize: 12 }} />
                  </div>

                  {errorCrearEj && <p style={{ color: 'var(--error)', fontSize: 12, marginTop: 8 }}>{errorCrearEj}</p>}
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setModalCrearEj(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={guardandoCrearEj || !formCrearEj.nombre?.trim()} onClick={guardarEjercicioPersonalizado}>
                  {guardandoCrearEj ? 'Guardando...' : 'Guardar ejercicio'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Zona de drop para bloques de biblioteca (cuando la sesión es fuerza) */}
      {libDragActive && sesionAbierta?.tipo_editor !== 'carrera' && (
        <div style={{ position: 'fixed', bottom: 24, right: 310, background: '#1e3a2f', color: '#6ee7b7', border: '2px dashed #6ee7b7', borderRadius: 12, padding: '10px 18px', fontSize: 12, fontWeight: 600, zIndex: 500, pointerEvents: 'none' }}>
          ↓ Suelta sobre un bloque (ejercicio) o aquí (bloque completo)
        </div>
      )}

      {/* Panel flotante preview de media al pasar el ratón por el thumbnail */}
      {mediaPreview && (
        <div
          onMouseEnter={() => clearTimeout(mediaPreviewTimeout.current)}
          onMouseLeave={() => { mediaPreviewTimeout.current = setTimeout(() => setMediaPreview(null), 200) }}
          style={{
            position: 'fixed',
            left: Math.min(mediaPreview.x, window.innerWidth - 340),
            top: Math.max(8, Math.min(mediaPreview.y, window.innerHeight - 230)),
            width: 320,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            zIndex: 1200,
            overflow: 'hidden',
          }}>
          {mediaPreview.ytid ? (
            <iframe
              src={`https://www.youtube.com/embed/${mediaPreview.ytid}?autoplay=1&mute=0`}
              style={{ width: '100%', height: 210, border: 'none', display: 'block' }}
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : mediaPreview.tipo === 'video' ? (
            <video src={mediaPreview.url} controls autoPlay style={{ width: '100%', maxHeight: 210, display: 'block', background: '#000' }} />
          ) : (
            <img src={mediaPreview.url} alt="" style={{ width: '100%', maxHeight: 210, objectFit: 'contain', display: 'block', background: 'var(--bg2)' }} />
          )}
        </div>
      )}
    </div>
    {colorPickerBloque && ReactDOM.createPortal(
      <div data-color-picker="1"
        style={{ position: 'fixed', top: colorPickerBloque.y, left: colorPickerBloque.x, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.14)', zIndex: 300, padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6, width: 128 }}>
        {COLORES_BLOQUE.map(c => (
          <button key={c} onClick={async () => { await supabase.from('sesion_bloques').update({ color: c }).eq('id', colorPickerBloque.bloqueId); setBloques(bs => bs.map(b => b.id === colorPickerBloque.bloqueId ? { ...b, color: c } : b)); setColorPickerBloque(null) }}
            style={{ width: 18, height: 18, borderRadius: '50%', background: c, border: bloques.find(b => b.id === colorPickerBloque.bloqueId)?.color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0, boxSizing: 'border-box' }} />
        ))}
      </div>,
      document.body
    )}
    </>
  )
}
