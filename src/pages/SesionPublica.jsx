import { colorTipoPaso, labelTipoPaso, duracionPaso, distanciaPaso, fmtDuracionPaso, fmtDistancia, objetivoPersonal, etiquetaObjetivo } from '../lib/zonas'
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import FeedbackForm from '../components/FeedbackForm'
import PasosCompactos, { GraficaPasos } from '../components/PasosCompactos'
import { DiagramaCampo, metricasDiagrama } from '../components/TareaCampo'
import { es } from 'date-fns/locale'

const T = {
  ink: '#15171C', ink2: '#5A6270', ink3: '#929BA8',
  paper: '#EEF0F3', card: '#FFFFFF', line: '#E4E6EB',
  accent: '#E0481F', accentD: '#C13A14', hero: '#181B21',
}

const RPE_LABELS = ['Nada de esfuerzo','Muy, muy suave','Muy suave','Suave','Moderada','Algo exigente','Exigente','Muy exigente','Muy dura','Extremadamente dura','Máximo esfuerzo']
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

function FeedbackResumen({ data, submittedAt, onEditar }) {
  const d = data || {}
  const status = d.completion?.status
  const reasons = d.completion?.reasons || []
  const statusCfg = {
    completed: { label: 'Sesión completada al 100%', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', icon: '✅' },
    partial:   { label: 'Sesión parcialmente completada', color: '#b45309', bg: '#fffbeb', border: '#fde68a', icon: '🔄' },
    missed:    { label: 'Sesión no realizada', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', icon: '❌' },
  }
  const cfg = statusCfg[status] || {}

  function Row({ label, value }) {
    if (!value && value !== 0) return null
    return (
      <div style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.line}` }}>
        <span style={{ fontSize: 11.5, color: T.ink3, minWidth: 140, flexShrink: 0, paddingTop: 1 }}>{label}</span>
        <span style={{ fontSize: 13, color: T.ink, lineHeight: 1.55 }}>{value}</span>
      </div>
    )
  }

  const fechaHora = submittedAt
    ? (() => { try { return format(parseISO(submittedAt), "d MMM yyyy 'a las' HH:mm", { locale: es }) } catch { return null } })()
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {cfg.label && (
        <div style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>{cfg.icon}</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: cfg.color }}>{cfg.label}</div>
            {fechaHora && <div style={{ fontSize: 11, color: cfg.color, opacity: 0.75, marginTop: 2 }}>Enviado el {fechaHora}</div>}
          </div>
        </div>
      )}
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 12, padding: '0 14px' }}>
        {d.rpe?.value != null && <Row label="Esfuerzo percibido (RPE)" value={`${d.rpe.value} — ${RPE_LABELS[d.rpe.value]}`} />}
        {d.duration?.minutes && <Row label="Duración real" value={`${d.duration.minutes} min`} />}
        {reasons.length > 0 && <Row label={status === 'partial' ? 'Por qué no completó al 100%' : 'Por qué no la realizó'} value={reasons.join(', ')} />}
        {d.completion?.partialDetails && <Row label="Detalle / parte no realizada" value={d.completion.partialDetails} />}
        {/* Molestia — multi-entry (nuevo), single-entry y legado */}
        {d.pain?.hasPain === true && Array.isArray(d.pain?.entries) && d.pain.entries.length > 0
          ? d.pain.entries.map((e, i) => (
              <Row
                key={e.id ?? i}
                label={`Molestia${d.pain.entries.length > 1 ? ` ${i + 1}` : ''}${e.intensity != null ? ` · ${e.intensity}/10` : ''}`}
                value={e.details || '—'}
              />
            ))
          : d.pain?.hasPain === true
            ? <Row
                label={`Molestia reportada${d.pain.intensity != null ? ` · ${d.pain.intensity}/10` : ''}`}
                value={d.pain.details || '—'}
              />
            : null
        }
        {/* Legado: solo si no hay formato nuevo */}
        {d.pain?.hasPain !== true && d.pain?.mainPainDetails && (
          <Row label="Molestia principal" value={d.pain.mainPainDetails} />
        )}
        {d.pain?.hasPain !== true && d.pain?.additionalPainLevel && (
          <Row label="Molestia durante sesión" value={d.pain.additionalPainLevel} />
        )}
        {d.pain?.hasPain !== true && d.pain?.additionalPainDetails && (
          <Row label="Zona / ejercicio" value={d.pain.additionalPainDetails} />
        )}
        {d.technical?.mainTechnicalDetails && <Row label="Dificultad técnica" value={d.technical.mainTechnicalDetails} />}
        {d.technical?.additionalTechnicalDifficulty === true && <Row label="Ejercicio difícil" value={d.technical.additionalTechnicalDetails || 'Sí'} />}
        {d.equipment?.details && <Row label="Material no disponible" value={d.equipment.details} />}
        {d.understanding?.details && <Row label="Ejercicio no entendido" value={d.understanding.details} />}
        {d.generalComments && <Row label="Observaciones generales" value={d.generalComments} />}
      </div>
      {onEditar && (
        <button type="button" onClick={onEditar}
          style={{ alignSelf: 'flex-start', fontSize: 12.5, fontWeight: 500, padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.line}`, background: T.card, color: T.ink2, cursor: 'pointer' }}>
          ✏️ Modificar respuesta
        </button>
      )}
    </div>
  )
}

function ytId(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

const RIR_INFO = {
  '4+': {
    titulo: 'Muy lejos del fallo',
    desc: 'El ejercicio se siente cómodo. Todas las repeticiones son rápidas, con técnica perfecta y la sensación de que podrías hacer bastantes más sin problema.'
  },
  '2-3': {
    titulo: 'Esfuerzo moderado-alto',
    desc: 'Las últimas repeticiones ya requieren concentración, pero mantienes una buena velocidad y una técnica sólida. Notas que podrías hacer 2 o 3 repeticiones más.'
  },
  '1-0': {
    titulo: 'Muy cerca del fallo',
    desc: 'Máximo esfuerzo previsto. La velocidad disminuye claramente en las últimas repeticiones, pero la técnica debe mantenerse correcta. Solo podrías realizar 0 o 1 repetición más con buena ejecución.'
  },
}

function RirChip({ valor, colorMap, bgMap, T }) {
  const color = colorMap[valor] || '#888'
  const bg = bgMap[valor] || '#f5f5f5'
  const info = RIR_INFO[valor]
  return (
    <div style={{ display: 'inline-block' }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7, background: bg, borderRadius: 9, padding: '7px 12px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color }}>RIR</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color }}>{valor}</span>
      </span>
      {info && (
        <div style={{ marginTop: 6, background: bg, border: `1px solid ${color}33`, borderRadius: 10, padding: '10px 12px', maxWidth: 300 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 4 }}>{info.titulo}</div>
          <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5 }}>{info.desc}</div>
        </div>
      )}
    </div>
  )
}

const METODO_LABEL = {
  individual: 'Individual',
  superserie: 'Superserie',
  triserie:   'Triserie',
  circuito:   'Circuito',
  complejo:   'Complejo',
  contrast:   'Contrast',
  cluster:    'Cluster',
  emom:       'EMOM',
  amrap:      'AMRAP',
}

const METODOS_SERIES_BLOQUE = ['superserie','triserie','circuito','complejo','contrast','cluster','emom','amrap']

const EJEC_LABEL = { maxima: 'Máxima vel. contracción', medio: 'Ritmo medio', excentrico: 'Foco excéntrico' }
const RIR_COLOR = { '4+': '#16a34a', '2-3': '#ca8a04', '1-0': '#dc2626' }
const RIR_BG    = { '4+': '#f0fdf4', '2-3': '#fffbeb', '1-0': '#fef2f2' }

// Prescripción de un ejercicio en piezas cortas, en el mismo orden que el
// resumen compacto del editor: "3 × 10 · 80 kg · RIR 2-3 · ⏱ 90s"
function partesEjercicio(e, metodo) {
  const activas = e.variables_activas || []
  const seriesBloque = METODOS_SERIES_BLOQUE.includes(metodo)
  const lado = e.reps_por_lado ? ' c/lado' : ''
  const p = []
  if (!seriesBloque && e.series && e.reps) p.push({ t: `${e.series} × ${e.reps}${lado}`, principal: true })
  else if (!seriesBloque && e.series)      p.push({ t: `${e.series} series`, principal: true })
  else if (e.reps)                         p.push({ t: `${e.reps} reps${lado}`, principal: true })
  if (e.num_mini && e.reps_mini) p.push({ t: `${e.num_mini} × ${e.reps_mini} mini` })
  if (e.microdescanso_seg)       p.push({ t: `pausa ${e.microdescanso_seg}s` })
  if (activas.includes('Peso') && e.peso) p.push({ t: `${e.peso} kg` })
  if (activas.includes('Peso/lado') && (e.peso_der || e.peso_izq)) p.push({ t: `D ${e.peso_der || '–'} / I ${e.peso_izq || '–'} kg` })
  if (activas.includes('Duración') && e.duracion)   p.push({ t: `${e.duracion}s${lado}` })
  if (activas.includes('Distancia') && e.distancia) p.push({ t: `${e.distancia} m` })
  if (activas.includes('Altura') && e.altura)       p.push({ t: `${e.altura} cm` })
  if (activas.includes('RIR') && e.rpe)             p.push({ t: `RIR ${e.rpe}`, color: RIR_COLOR[e.rpe], bg: RIR_BG[e.rpe] })
  if (activas.includes('Descanso') && e.descanso)   p.push({ t: `⏱ ${e.descanso}` })
  const ejec = e.ejecucion_tipo === 'libre' ? e.ejecucion_texto : (EJEC_LABEL[e.ejecucion_tipo] || e.ejecucion_tipo)
  if (ejec) p.push({ t: ejec, texto: true })
  return p
}

function FilaPrescripcion({ e, metodo, size = 13 }) {
  const partes = partesEjercicio(e, metodo)
  if (!partes.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
      {partes.map((x, i) => (
        <span key={i} style={{
          fontSize: x.principal ? size + 1 : x.texto ? size - 1.5 : size,
          fontWeight: x.principal ? 800 : x.texto ? 600 : 700,
          fontFamily: x.texto ? 'inherit' : "'JetBrains Mono', monospace",
          color: x.color || T.ink, background: x.bg || T.paper,
          padding: '3px 8px', borderRadius: 6, lineHeight: 1.3, whiteSpace: x.texto ? 'normal' : 'nowrap',
        }}>{x.t}</span>
      ))}
    </div>
  )
}

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

const DESCRIPCIONES_METODO = {
  individual: 'Completa todas las series de cada ejercicio antes de pasar al siguiente. Descansa entre series el tiempo indicado.',
  superserie: 'Haz el ejercicio A y pasa directamente al B sin descansar. Cuando termines los dos, descansa el tiempo indicado y repite.',
  triserie:   'Haz A, luego B, luego C sin descansar entre ellos. Al terminar los tres, descansa y repite desde el principio.',
  circuito:   'Pasa de un ejercicio al siguiente sin descansar hasta completar todos. Al terminar la vuelta completa, descansa y repite.',
  complejo:   'Realiza todos los ejercicios seguidos sin soltar el implemento entre ellos. Solo descansas al completar la secuencia entera.',
  contrast:   'Haz el primer ejercicio (carga pesada), descansa brevemente y pasa al segundo (explosivo) del mismo patrón. Luego descansas completo y repites.',
  cluster:    'Dentro de cada serie, haz las repeticiones en mini-grupos con pausas cortas entre ellos. Por ejemplo: 2 reps, pausa 15", 2 reps, pausa 15", 2 reps. Luego descansa entre series.',
  emom:       'Al inicio de cada minuto realiza el trabajo indicado. El tiempo que sobre hasta el siguiente minuto es tu descanso. Repite durante el tiempo total.',
  amrap:      'Completa tantas rondas como puedas de los ejercicios indicados en el tiempo establecido. Anota las rondas completadas.',
}

export default function SesionPublica({ token }) {
  const [sesion, setSesion] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [bloques, setBloques] = useState([])
  const [ejercicios, setEjercicios] = useState({})
  const [fases, setFases] = useState([])
  const [fasesItems, setFasesItems] = useState([]) // lista combinada fases sueltas + grupos (sin bloque)
  const [fasesPorBloque, setFasesPorBloque] = useState({}) // bloqueId → fases sueltas + grupos
  const [perfilZonas, setPerfilZonas] = useState(null) // FC y ritmos del cliente para traducir las intensidades
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [feedbackEnviado, setFeedbackEnviado] = useState(null)
  const [enviandoFeedback, setEnviandoFeedback] = useState(false)
  const [editandoFeedback, setEditandoFeedback] = useState(false)
  // { [ejId]: { series: [bool,...], hecho: bool } }
  const [progreso, setProgreso] = useState({})
  // { [ejId]: { campo: valor } } — valores reales editados por el cliente
  const [valoresReales, setValoresReales] = useState({})
  // fecha (string) si la sesión flexible ya fue guardada como realizada en esta visita
  const [sesionFlexibleGuardada, setSesionFlexibleGuardada] = useState(null)
  const [guardandoSesion, setGuardandoSesion] = useState(false)
  const [sesionFijaGuardada, setSesionFijaGuardada] = useState(false)
  const [clonToken, setClonToken] = useState(null)
  // Si la entrenadora ha desactivado el feedback para este cliente, la sesión
  // es solo de lectura: sin series para marcar, sin "hecha" y sin cuestionario.
  const [interactiva, setInteractiva] = useState(true)
  const [comentarioVisto, setComentarioVisto] = useState(false)
  const [videoActivo, setVideoActivo] = useState({})

  useEffect(() => { cargar() }, [token])

  useEffect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap'
    document.head.appendChild(link)
    return () => { try { document.head.removeChild(link) } catch {} }
  }, [])

  async function cargar() {
    const [sesArr, fssArr, grpsArr, cliArr, blsArr, ejsArr, fbArr, pendingClonArr, permArr, perfilZ, diagArr] = await Promise.all([
      supabase.rpc('get_sesion_por_token',              { p_token: token }).then(r => r.data),
      supabase.rpc('get_pasos_por_token_sesion',         { p_token: token }).then(r => r.data),
      supabase.rpc('get_grupos_bloque_por_token_sesion', { p_token: token }).then(r => r.data),
      supabase.rpc('get_nombre_por_token_sesion',       { p_token: token }).then(r => r.data),
      supabase.rpc('get_bloques_por_token_sesion',      { p_token: token }).then(r => r.data),
      supabase.rpc('get_ejercicios_por_token_sesion',   { p_token: token }).then(r => r.data),
      supabase.rpc('get_feedback_por_token_sesion',     { p_token: token }).then(r => r.data),
      supabase.rpc('get_clon_pendiente_feedback_por_token_original', { p_token: token }).then(r => r.data),
      supabase.rpc('get_permisos_por_token_sesion',     { p_token: token }).then(r => r.data),
      supabase.rpc('get_perfil_zonas_por_token_sesion', { p_token: token }).then(r => r.data),
      supabase.rpc('get_diagramas_por_token_sesion', { p_token: token }).then(r => r.data),
    ])
    setPerfilZonas(perfilZ || null)
    const s = sesArr?.[0] ?? null
    if (!s) { setError(true); setLoading(false); return }
    setSesion(s)
    setInteractiva(permArr?.[0]?.feedback !== false)
    setComentarioVisto(!!s?.comentario_visto_at)
    setCliente(cliArr?.[0] ?? null)
    // Scroll automático al comentario si viene con el ancla #comentario
    if (s?.comentario_entrenadora && window.location.hash === '#comentario') {
      setTimeout(() => {
        document.getElementById('comentario')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
    }
    setFases(fssArr || [])
    // Build combined list for rendering
    // Fases y grupos de cada bloque de resistencia (bloque_id); los que no
    // tienen bloque (formato antiguo) se muestran arriba, como antes.
    const gruposMap = {}
    ;(grpsArr || []).forEach(g => { gruposMap[g.id] = { type: 'grupo', ...g, fases: [] } })
    const porBloque = {}
    const meter = (k, it) => { (porBloque[k || '_'] = porBloque[k || '_'] || []).push(it) }
    ;(fssArr || []).forEach(f => {
      if (f.grupo_id && gruposMap[f.grupo_id]) gruposMap[f.grupo_id].fases.push(f)
      else meter(f.bloque_id, { type: 'fase', ...f })
    })
    Object.values(gruposMap).forEach(g => meter(g.bloque_id, g))
    Object.values(porBloque).forEach(l => l.sort((a, b) => a.orden - b.orden))
    setFasesItems(porBloque['_'] || [])
    setFasesPorBloque(porBloque)
    const bls = blsArr || []
    setBloques(bls)
    const diagramas = Object.fromEntries((diagArr || []).map(x => [x.id, x.diagrama]))
    const ejsList = (ejsArr || []).map(e => diagramas[e.id] ? { ...e, diagrama: diagramas[e.id] } : e)
    const map = {}
    ejsList.forEach(e => { if (!map[e.bloque_id]) map[e.bloque_id] = []; map[e.bloque_id].push(e) })
    setEjercicios(map)
    const fb = fbArr?.[0] ?? null
    setFeedbackEnviado(fb || null)
    // Restaurar estado al recargar
    const pendingClon = pendingClonArr?.[0] ?? null
    if (pendingClon) {
      // Hay un clon ejecutado pero sin feedback aún: restaurar clonToken y mostrar el formulario
      setClonToken(pendingClon.clon_token)
      setSesion(prev => ({ ...prev, completada_el: pendingClon.completada_el }))
    } else if (s.completada_el && !s.fecha && fb) {
      // Sesión flexible con feedback ya enviado directamente al original (flujo antiguo)
      setSesionFlexibleGuardada(s.completada_el)
    }
    if (s.completada_el && s.fecha) setSesionFijaGuardada(true)
    const progInit = {}
    const vrInit = {}
    ejsList.forEach(e => {
      const n = parseInt(e.series) || 1
      const hecho = s.completada_el ? true : false
      progInit[e.id] = { series: Array(n).fill(hecho), hecho }
      vrInit[e.id] = e.valores_reales || {}
    })
    setProgreso(progInit)
    setValoresReales(vrInit)
    setLoading(false)
  }

  function marcarTodas() {
    setProgreso(p => {
      const next = { ...p }
      Object.keys(next).forEach(ejId => {
        const series = next[ejId].series.map(() => true)
        next[ejId] = { series, hecho: true }
      })
      return next
    })
  }

  function marcarEjercicio(ejId, numSeries) {
    setProgreso(p => {
      const prev = p[ejId] || { series: Array(numSeries).fill(false), hecho: false }
      const yaHecho = prev.hecho
      const series = prev.series.map(() => !yaHecho)
      return { ...p, [ejId]: { series, hecho: !yaHecho } }
    })
  }

  function marcarBloque(ejsDelBloque) {
    setProgreso(p => {
      const next = { ...p }
      const yaHechoTodo = ejsDelBloque.every(e => next[e.id]?.hecho)
      ejsDelBloque.forEach(e => {
        const n = next[e.id]?.series.length || parseInt(e.series) || 1
        next[e.id] = { series: Array(n).fill(!yaHechoTodo), hecho: !yaHechoTodo }
      })
      return next
    })
  }

  function estadoDesdeData(data) {
    const status = data?.completion?.status
    if (status === 'completed') return 'completada'
    if (status === 'partial')   return 'parcial'
    if (status === 'missed')    return 'no_realizada'
    return 'realizada'
  }

  function toggleSerie(ejId, serieIdx) {
    setProgreso(p => {
      const prev = p[ejId] || { series: [], hecho: false }
      const series = prev.series.map((v, i) => i === serieIdx ? !v : v)
      const hecho = series.every(Boolean)
      return { ...p, [ejId]: { series, hecho } }
    })
  }

  // Pasos de un bloque de resistencia: lista compacta, una línea por paso
  function renderFasesLista(items) {
    return <PasosCompactos items={items} perfil={perfilZonas} T={{ ...T, mono: "'JetBrains Mono', monospace" }} grande />
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper, fontFamily: 'sans-serif' }}>
      <p style={{ color: T.ink3 }}>Cargando sesión...</p>
    </div>
  )
  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.paper, fontFamily: 'sans-serif' }}>
      <p style={{ color: T.accent }}>Enlace no válido o sesión no encontrada.</p>
    </div>
  )

  const COLORES_TINT = c => c + '1f'

  return (
    <div style={{ background: T.paper, color: T.ink, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", minHeight: '100vh', fontSize: 15, lineHeight: 1.45 }}>
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '18px 14px 44px' }}>

        {/* HERO */}
        <header style={{ position: 'relative', overflow: 'hidden', background: T.hero, color: '#fff', borderRadius: 18, padding: '28px 20px 22px', marginBottom: 4 }}>
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 3, background: T.accent }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.accent, fontFamily: "'JetBrains Mono', monospace" }}>Ficha de entrenamiento</p>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,0.4)', flexShrink: 0, whiteSpace: 'nowrap' }}>{cliente?.nombre}</span>
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: 28, fontWeight: 400, fontFamily: "'DM Serif Display', Georgia, serif", lineHeight: 1.1 }}>{sesion.titulo}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {sesion.fecha && <span style={{ textTransform: 'capitalize' }}>{format(parseISO(sesion.fecha), 'EEEE d MMM yyyy', { locale: es })}</span>}
            {sesion.fecha && sesion.duracion_min && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />}
            {sesion.duracion_min && <span>{sesion.duracion_min} min</span>}
            {(sesion.fecha || sesion.duracion_min) && sesion.tipo_sesion && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.3)', flexShrink: 0 }} />}
            {sesion.tipo_sesion && <span style={{ textTransform: 'capitalize' }}>{sesion.tipo_sesion}</span>}
          </div>
          {sesion.objetivo && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 5, fontFamily: "'JetBrains Mono', monospace" }}>Objetivo</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)', whiteSpace: 'pre-wrap' }}>{sesion.objetivo}</p>
            </div>
          )}
          {sesion.comentario_entrenadora && (
            <div id="comentario" style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(255,255,255,0.07)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.accent, fontFamily: "'JetBrains Mono', monospace" }}>💬 Mensaje de tu entrenadora</div>
                {comentarioVisto && <span style={{ fontSize: 10, color: T.accent, opacity: 0.7 }}>👁 Leído</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-wrap' }}>{sesion.comentario_entrenadora}</p>
              {!comentarioVisto && (
                <button onClick={async () => {
                  await supabase.rpc('marcar_comentario_visto', { p_token: token })
                  setComentarioVisto(true)
                }} style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: T.accent, background: 'transparent', border: `1.5px solid ${T.accent}66`, borderRadius: 8, padding: '5px 14px', cursor: 'pointer' }}>
                  Marcar como leído
                </button>
              )}
            </div>
          )}
        </header>

        {/* BANNER COMPLETADA (solo cuando ya está guardada) */}
        {(sesionFlexibleGuardada || sesionFijaGuardada) && (
          <div style={{ marginTop: 14, width: '100%', padding: '13px 16px', borderRadius: 12, background: '#f0fdf4', border: '1.5px solid #16a34a', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>✓ Sesión completada y guardada</span>
            {sesionFlexibleGuardada && (
              <button onClick={async () => {
                await supabase.rpc('desmarcar_sesion_por_token', { p_token: token })
                setSesionFlexibleGuardada(null)
                setClonToken(null)
                setFeedbackEnviado(null)
                setSesion(s => ({ ...s, completada_el: null, estado: 'pendiente' }))
                const allEjs = Object.values(ejercicios).flat()
                const progInit = {}
                const vrInit = {}
                allEjs.forEach(e => { const n = parseInt(e.series) || 1; progInit[e.id] = { series: Array(n).fill(false), hecho: false }; vrInit[e.id] = {} })
                setProgreso(progInit)
                setValoresReales(vrInit)
              }} style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: '1.5px solid #16a34a', background: 'transparent', color: '#15803d', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Realizar de nuevo
              </button>
            )}
          </div>
        )}

        {sesion.material && (
          <div style={{ marginTop: 16, background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.ink3, marginBottom: 7 }}>🎒 Material necesario</div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: T.ink2, whiteSpace: 'pre-wrap' }}>{sesion.material}</p>
          </div>
        )}

        {sesion.indicaciones && (
          <div style={{ marginTop: 16, background: T.accent + '10', border: `1px solid ${T.accent}33`, borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, color: T.accent }}>✏️</span>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: T.accentD, fontWeight: 500, whiteSpace: 'pre-wrap' }}>{sesion.indicaciones}</p>
          </div>
        )}

        {/* FASES sin bloque (formato antiguo) */}
        {fasesItems.length > 0 && (
          <section style={{ marginTop: 22, background: T.card, borderRadius: 16, border: `1px solid ${T.line}`, padding: '4px 14px' }}>{renderFasesLista(fasesItems)}</section>
        )}

        {/* BLOQUES */}
        {bloques.map((b, idx) => {
          const ejsBloque = ejercicios[b.id] || []
          const bloqueHecho = ejsBloque.every(e => progreso[e.id]?.hecho)
          const bc = b.color || '#E29A2E'
          const metodoLabel = METODO_LABEL[b.metodo || 'individual']
          const fasesBloque = fasesPorBloque[b.id] || []
          // Bloque sin ejercicios (resistencia: pasos y/o descripción): sin método ni series
          const esResistencia = ejsBloque.length === 0
          const esCampo = ejsBloque.length > 0 && ejsBloque.every(e => e.diagrama)
          const descTexto = esResistencia || esCampo ? null : (b.descripcion_metodo || DESCRIPCIONES_METODO[b.metodo || 'individual'])

          function renderTareaCampo(e, eIdx) {
            const met = metricasDiagrama(e.diagrama)
            const pr = e.diagrama.presc || {}
            const series = parseInt(e.series) || 0, reps = parseInt(e.reps) || 0
            const fm = m => (m >= 100 ? Math.round(m) : Math.round(m * 2) / 2).toLocaleString('es-ES') + ' m'
            const chips = [
              series && reps ? `${series} × ${reps}${e.reps_por_lado ? ' por lado' : ''}` : reps ? `${reps} reps${e.reps_por_lado ? ' por lado' : ''}` : series ? `${series} series` : null,
              met.metros ? `${fm(met.metros)} / rep` : null,
              met.cod ? `${met.cod} COD` : null,
              pr.intensidad ? `⚡ ${pr.intensidad}` : null,
              pr.tiempo ? `⏱ ${pr.tiempo}` : null,
              e.descanso ? `Recup. ${e.descanso}` : null,
              pr.recup_series ? `Entre series ${pr.recup_series}` : null,
            ].filter(Boolean)
            return (
              <div key={e.id} style={{ padding: '10px 14px 12px', borderTop: eIdx ? `0.5px solid ${T.line}` : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 7 }}>{e.nombre}</div>
                <DiagramaCampo diagrama={e.diagrama} />
                {chips.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {chips.map(c => <span key={c} style={{ fontSize: 12, fontWeight: 600, color: '#1f2d8a', background: '#eef2ff', borderRadius: 6, padding: '3px 8px' }}>{c}</span>)}
                  </div>
                )}
                {e.notas && <div style={{ marginTop: 7, fontSize: 13, lineHeight: 1.45, color: T.ink2, whiteSpace: 'pre-wrap' }}>{e.notas}</div>}
              </div>
            )
          }

          function renderEj(e, eIdx, totalEjs) {
            if (e.diagrama) return renderTareaCampo(e, eIdx)
            const yid = e.media_tipo === 'youtube' ? ytId(e.media_url) : null
            const esVideoArchivo = e.media_tipo === 'video' && e.media_url
            const esImagen = (e.media_tipo === 'imagen' || e.media_tipo === 'gif') && e.media_url
            const videoLink = !yid && e.video_url ? e.video_url : null
            const prog = progreso[e.id] || { series: [false], hecho: false }
            const hecho = prog.hecho
            const label = `${idx + 1}${getLabelEjercicio(b.metodo, eIdx)}`
            const isLast = eIdx === totalEjs - 1
            const locked = sesionFlexibleGuardada || sesionFijaGuardada || clonToken
            const hasMedia = esVideoArchivo || yid || esImagen

            return (
              <div key={e.id}>
                {/* EMOM: minute badge above */}
                {b.metodo === 'emom' && (
                  <div style={{ padding: '5px 14px', background: `${bc}10`, borderBottom: `0.5px solid ${bc}22`, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 5, background: 'rgba(153,27,27,0.12)', color: '#991b1b', fontFamily: "'JetBrains Mono', monospace" }}>MIN {eIdx + 1}</span>
                  </div>
                )}
                {/* Name row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: `${bc}12`, borderBottom: `0.5px solid ${bc}30` }}>
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: bc, background: `${bc}20`, padding: '3px 8px', borderRadius: 4, flexShrink: 0, minWidth: 24, textAlign: 'center' }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1, lineHeight: 1.25, color: T.ink }}>{e.nombre}</span>
                  {!hasMedia && videoLink && (
                    <a href={videoLink} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, fontWeight: 700, color: T.accent, textDecoration: 'none', padding: '3px 9px', border: `1px solid ${T.accent}`, borderRadius: 6, flexShrink: 0 }}>
                      ▶ Ver vídeo
                    </a>
                  )}
                </div>
                {/* Con foto/vídeo: 2 columnas (media + datos). Sin media: solo datos, compacto */}
                <div style={{ display: 'flex', alignItems: 'stretch', background: hecho ? '#f6fef9' : T.card, transition: 'background 0.2s' }}>
                  {hasMedia && (
                  <div style={{ flex: '0 0 42%', borderRight: `0.5px solid ${T.line}`, overflow: 'hidden', position: 'relative' }}>
                    {esVideoArchivo ? (
                      <video src={e.media_url} controls muted preload="metadata"
                        style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                    ) : yid ? (
                      <div style={{ position: 'relative', width: '100%', paddingBottom: '133%', overflow: 'hidden' }}>
                        {videoActivo[e.id] ? (
                          <iframe src={`https://www.youtube-nocookie.com/embed/${yid}?autoplay=1`} title={e.nombre}
                            allow="autoplay; fullscreen"
                            allowFullScreen
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
                        ) : (
                          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                            onClick={() => setVideoActivo(v => ({ ...v, [e.id]: true }))}>
                            <img src={`https://img.youtube.com/vi/${yid}/hqdefault.jpg`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                            <div style={{ position: 'absolute', bottom: 8, left: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1.5px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><polygon points="2,1 9,5 2,9"/></svg>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : esImagen ? (
                      <img src={e.media_url} alt={e.nombre}
                        style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                    ) : null}
                  </div>
                  )}
                  {/* Datos */}
                  <div style={{ flex: 1, padding: hasMedia ? '10px 11px' : '9px 14px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    {/* Prescripción en una fila (como en el editor) */}
                    <FilaPrescripcion e={e} metodo={b.metodo} />
                    {/* Series — parte inferior separada */}
                    {interactiva && parseInt(e.series) > 0 && (
                      <div style={{ marginTop: 'auto', paddingTop: 6, marginTop: 6, borderTop: `0.5px solid ${T.line}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {!locked && (
                          <button onClick={() => marcarEjercicio(e.id, prog.series.length)}
                            style={{ width: '100%', padding: '4px 8px', borderRadius: 4, border: `1px solid ${T.line}`, background: 'transparent', color: T.ink2, fontSize: 10, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}>
                            ✓ Marcar todas las series
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {prog.series.map((hecha, sIdx) => (
                            <div key={sIdx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                              <span style={{ fontSize: 8, color: T.ink3, fontFamily: 'monospace' }}>{sIdx + 1}</span>
                              <input type="checkbox" checked={hecha} disabled={!!locked}
                                onChange={locked ? undefined : () => toggleSerie(e.id, sIdx)}
                                style={{ width: 14, height: 14, cursor: locked ? 'default' : 'pointer', accentColor: bc }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Nota */}
                    {e.notas && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: `0.5px solid ${T.line}`, display: 'flex', gap: 5, alignItems: 'flex-start', fontSize: 11.5, color: T.ink2, lineHeight: 1.4 }}>
                        <span style={{ flexShrink: 0, color: T.ink3 }}>📝</span>
                        <span>{e.notas}</span>
                      </div>
                    )}
                  </div>{/* /data col */}
                </div>
                {/* Separator between exercises (superserie / triserie) */}
                {!isLast && (b.metodo === 'superserie' || b.metodo === 'triserie') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', background: `${bc}08`, borderTop: `0.5px solid ${bc}22`, borderBottom: `0.5px solid ${bc}22` }}>
                    <div style={{ flex: 1, height: 0.5, background: `${bc}33` }} />
                    <span style={{ fontSize: 14, color: bc, opacity: 0.7 }}>{b.metodo === 'triserie' ? '↓' : '⇅'}</span>
                    <div style={{ flex: 1, height: 0.5, background: `${bc}33` }} />
                  </div>
                )}
              </div>
            )
          }

          return (
            <section key={b.id} style={{ marginTop: 22 }}>
              <div style={{ background: T.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(20,23,28,0.06), 0 1px 2px rgba(20,23,28,0.04)', border: `1px solid ${T.line}` }}>
                {/* Block header */}
                <div style={{ padding: '12px 14px', borderBottom: `0.5px solid ${T.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: bc, fontWeight: 700, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: `${bc}15`, border: `2px solid ${bc}` }}>
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, flex: 1, lineHeight: 1.2, color: T.ink }}>{b.nombre}</h2>
                    {metodoLabel && !esResistencia && !esCampo && (
                      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 99, background: `${bc}18`, color: bc, border: `1px solid ${bc}33`, flexShrink: 0, fontFamily: 'monospace' }}>
                        {metodoLabel}
                      </span>
                    )}
                  </div>
                  {fasesBloque.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <GraficaPasos items={fasesBloque} perfil={perfilZonas} T={{ ...T, mono: "'JetBrains Mono', monospace" }} />
                    </div>
                  )}
                  {b.nota && (esResistencia || esCampo ? (
                    <div style={{ marginTop: 8, fontSize: 14, lineHeight: 1.55, color: T.ink, whiteSpace: 'pre-wrap' }}>{b.nota}</div>
                  ) : (
                    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 8, padding: '8px 10px', borderRadius: 8, background: `${bc}18`, fontSize: 12, lineHeight: 1.4, color: bc }}>
                      <span>📝</span><span>{b.nota}</span>
                    </div>
                  ))}
                </div>

                {/* Descripción del método */}
                {descTexto && (
                  <div style={{ fontSize: 11, color: '#8B93A4', fontStyle: 'italic', padding: '8px 14px 10px 14px', lineHeight: 1.5, borderBottom: `0.5px solid ${T.line}` }}>
                    {descTexto}
                  </div>
                )}

                {fasesBloque.length > 0 && (
                  <div style={{ padding: '2px 14px 4px' }}>{renderFasesLista(fasesBloque)}</div>
                )}

                {!esResistencia && METODOS_SERIES_BLOQUE.includes(b.metodo) && (
                  b.metodo === 'amrap' ? (
                    <div style={{ borderTop: `0.5px solid ${T.line}`, borderBottom: `0.5px solid ${T.line}`, background: `${bc}08` }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 12px' }}>
                        <span style={{ fontSize: 8, color: bc, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>Tiempo</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: bc }}>{b.duracion_min ? `${b.duracion_min} min` : '—'}</span>
                      </div>
                      <div style={{ padding: '10px 14px', borderTop: `0.5px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, color: T.sub, flex: 1 }}>Rondas realizadas:</span>
                        <input type="number" min="0" placeholder="—"
                          defaultValue={(() => { try { return JSON.parse(b.nota || '{}').rondas || '' } catch { return '' } })()}
                          onBlur={async ev => {
                            const val = parseInt(ev.target.value)
                            if (!isNaN(val)) {
                              const notaActual = (() => { try { return JSON.parse(b.nota || '{}') } catch { return {} } })()
                              await supabase.rpc('actualizar_nota_bloque', { p_token: token, p_bloque_id: b.id, p_nota: JSON.stringify({ ...notaActual, rondas: val }) })
                            }
                          }}
                          style={{ width: 60, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.line}`, background: T.card, fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: bc, textAlign: 'center' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', borderTop: `0.5px solid ${T.line}`, borderBottom: `0.5px solid ${T.line}`, background: `${bc}08` }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 6px', borderRight: `0.5px solid ${T.line}` }}>
                        <span style={{ fontSize: 8, color: bc, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{getLabelVueltas(b.metodo)}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bc }}>{b.vueltas != null ? b.vueltas : '—'}</span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 6px', borderRight: `0.5px solid ${T.line}` }}>
                        <span style={{ fontSize: 8, color: bc, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{getLabelDescansoEntre(b.metodo)}</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bc }}>
                          {b.descanso_seg != null ? (b.descanso_seg >= 60 ? `${Math.floor(b.descanso_seg/60)}min` : `${b.descanso_seg}s`) : '—'}
                        </span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 6px' }}>
                        <span style={{ fontSize: 8, color: bc, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>Entre ejercicios</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: bc }}>
                          {b.descanso_ejercicios_seg != null ? (b.descanso_ejercicios_seg >= 60 ? `${Math.floor(b.descanso_ejercicios_seg/60)}min` : `${b.descanso_ejercicios_seg}s`) : '—'}
                        </span>
                      </div>
                    </div>
                  )
                )}

                {/* Exercises */}
                {b.metodo === 'contrast' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: `0.5px solid ${T.line}` }}>
                    {ejsBloque.map((e, eIdx) => {
                      const yid2 = e.media_tipo === 'youtube' ? ytId(e.media_url) : null
                      const esVideo2 = e.media_tipo === 'video' && e.media_url
                      const esImg2 = (e.media_tipo === 'imagen' || e.media_tipo === 'gif') && e.media_url
                      const prog2 = progreso[e.id] || { series: [false], hecho: false }
                      const hecho2 = prog2.hecho
                      const label2 = `${idx + 1}${getLabelEjercicio(b.metodo, eIdx)}`
                      const locked = sesionFlexibleGuardada || sesionFijaGuardada || clonToken
                      return (
                        <div key={e.id} style={{ borderRight: eIdx % 2 === 0 ? `0.5px solid ${T.line}` : 'none', padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, background: hecho2 ? '#f6fef9' : T.card }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: bc, flexShrink: 0 }}>{label2}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, lineHeight: 1.2, color: T.ink, minWidth: 0 }}>{e.nombre}</span>
                          </div>
                          <FilaPrescripcion e={e} metodo={b.metodo} size={12} />
                          {interactiva && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {prog2.series.map((hecha, sIdx) => (
                              <div key={sIdx}
                                onClick={locked ? undefined : () => toggleSerie(e.id, sIdx)}
                                style={{ width: 24, height: 24, borderRadius: 5, border: `1.5px solid ${hecha ? '#16a34a' : `${bc}44`}`, background: hecha ? '#16a34a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: locked ? 'default' : 'pointer', fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: hecha ? '#fff' : T.ink3, transition: 'all 0.15s' }}>
                                {hecha ? '✓' : sIdx + 1}
                              </div>
                            ))}
                          </div>}
                          {(esVideo2 || yid2 || esImg2) && (
                            <div style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: '9/16', position: 'relative', maxHeight: 190 }}>
                              {esVideo2 ? (
                                <video src={e.media_url} controls muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : yid2 ? (
                                <div style={{ position: 'relative', width: '100%', paddingBottom: '177%' }}>
                                  {videoActivo[e.id] ? (
                                    <iframe src={`https://www.youtube-nocookie.com/embed/${yid2}?autoplay=1`} title={e.nombre}
                                      allow="autoplay; fullscreen" allowFullScreen
                                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }} />
                                  ) : (
                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                                      onClick={() => setVideoActivo(v => ({ ...v, [e.id]: true }))}>
                                      <img src={`https://img.youtube.com/vi/${yid2}/hqdefault.jpg`}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                                      <div style={{ position: 'absolute', bottom: 8, left: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: '1.5px solid rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="white"><polygon points="2,1 9,5 2,9"/></svg>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <img src={e.media_url} alt={e.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              )}
                            </div>
                          )}
                          {e.notas && <div style={{ fontSize: 10.5, color: T.ink3, lineHeight: 1.4 }}>📝 {e.notas}</div>}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div>
                    {ejsBloque.map((e, eIdx) => renderEj(e, eIdx, ejsBloque.length))}
                  </div>
                )}

                {/* Block footer */}
                {interactiva && !esResistencia && !esCampo && <div style={{ padding: '9px 14px', borderTop: `0.5px solid ${T.line}`, background: `${bc}06`, display: 'flex', justifyContent: 'flex-end' }}>
                  {sesionFlexibleGuardada || sesionFijaGuardada || clonToken ? (
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#16a34a' }}>✓ Bloque hecho</span>
                  ) : (
                    <button onClick={() => marcarBloque(ejsBloque)}
                      style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${bloqueHecho ? '#16a34a' : bc}`, background: bloqueHecho ? '#f0fdf4' : 'transparent', color: bloqueHecho ? '#16a34a' : bc, cursor: 'pointer' }}>
                      {bloqueHecho ? '✓ Bloque hecho' : '✓ Todo el bloque'}
                    </button>
                  )}
                </div>}
              </div>
            </section>
          )
        })}

        {/* MARCAR SESIÓN COMPLETA — botón pequeño al final */}
        {interactiva && !sesionFlexibleGuardada && !sesionFijaGuardada && !feedbackEnviado && !clonToken && (() => {
          const todaMarcada = Object.keys(progreso).length > 0 && Object.values(progreso).every(p => p.hecho)
          return (
            <div style={{ marginTop: 20 }}>
              <button onClick={marcarTodas}
                style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${todaMarcada ? '#16a34a' : T.line}`, background: todaMarcada ? '#f0fdf4' : T.card, color: todaMarcada ? '#16a34a' : T.ink2, cursor: 'pointer' }}>
                {todaMarcada ? '✓ Todos los ejercicios y series completados' : '✓ Marcar todos los ejercicios y series como completados'}
              </button>
            </div>
          )
        })()}

        {/* FEEDBACK POST-SESIÓN (incluye el guardado de la sesión) */}
        {interactiva && sesion.con_feedback !== false && <div style={{ marginTop: 24 }}>
          {sesionFlexibleGuardada && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: '18px 16px', textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#15803d' }}>Sesión completada</p>
              <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#166534' }}>Registrada el {format(new Date(sesionFlexibleGuardada + 'T12:00:00'), 'dd MMM yyyy', { locale: es })}.</p>
              <button onClick={async () => {
                await supabase.rpc('desmarcar_sesion_por_token', { p_token: token })
                setSesionFlexibleGuardada(null)
                setClonToken(null)
                setFeedbackEnviado(null)
                setSesion(s => ({ ...s, completada_el: null, estado: 'pendiente' }))
                const allEjs = Object.values(ejercicios).flat()
                const progInit = {}
                const vrInit = {}
                allEjs.forEach(e => { const n = parseInt(e.series) || 1; progInit[e.id] = { series: Array(n).fill(false), hecho: false }; vrInit[e.id] = {} })
                setProgreso(progInit)
                setValoresReales(vrInit)
              }} style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 16px', borderRadius: 8, border: '1px solid #16a34a', background: 'transparent', color: '#15803d', cursor: 'pointer' }}>
                Realizar de nuevo
              </button>
            </div>
          )}

          {feedbackEnviado && !editandoFeedback ? (
            <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: 16, padding: '18px 16px' }}>
              <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800 }}>Feedback de la sesión</h2>
              <FeedbackResumen
                data={feedbackEnviado.data}
                submittedAt={feedbackEnviado.submitted_at}
                onEditar={() => setEditandoFeedback(true)}
              />
            </div>
          ) : !sesionFlexibleGuardada ? (
            <div style={{ background: '#fff', border: '1px solid #E4E6EB', borderRadius: 16, padding: '18px 16px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800 }}>{editandoFeedback ? 'Modificar feedback' : 'Feedback de la sesión'}</h2>
              <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#929BA8' }}>
                {editandoFeedback ? 'Se guardará la última versión.' : 'Cuéntame cómo te ha ido, lleva menos de un minuto.'}
              </p>
              <FeedbackForm
                tipoEditor={sesion.tipo_editor}
                initial={editandoFeedback ? feedbackEnviado.data : null}
                submitting={enviandoFeedback}
                submitLabel={editandoFeedback ? 'Guardar cambios' : '↑ Guardar y enviar sesión'}
                onSubmit={async (data) => {
                  setEnviandoFeedback(true)
                  const nuevoEstado = estadoDesdeData(data)
                  if (editandoFeedback) {
                    const tkn = clonToken || token
                    const { data: actArr, error: errAct } = await supabase.rpc('actualizar_feedback_por_token', { p_token: tkn, p_data: data })
                    if (errAct) { setEnviandoFeedback(false); alert('Error al guardar el feedback. Inténtalo de nuevo.'); return }
                    const { error: errEst } = await supabase.rpc('completar_sesion_por_token', { p_token: tkn, p_fecha: null, p_estado: nuevoEstado, p_fecha_realizada: nuevoEstado === 'no_realizada' ? null : format(new Date(), 'yyyy-MM-dd') })
                    if (errEst) { setEnviandoFeedback(false); alert('El feedback se ha guardado, pero no se pudo actualizar el estado. Inténtalo de nuevo.'); return }
                    setSesion(s => ({ ...s, estado: nuevoEstado }))
                    setEnviandoFeedback(false)
                    setEditandoFeedback(false)
                    if (actArr?.[0]) setFeedbackEnviado(actArr[0])
                  } else if (clonToken) {
                    // Sesión flexible ya guardada (dato antiguo): enviar feedback al clon
                    const { data: nuevoArr, error: errIns } = await supabase.rpc('insertar_feedback_por_token', { p_token: clonToken, p_data: data })
                    if (errIns) { setEnviandoFeedback(false); alert('Error al guardar el feedback. Inténtalo de nuevo.'); return }
                    const { error: errEst } = await supabase.rpc('completar_sesion_por_token', { p_token: clonToken, p_fecha: null, p_estado: nuevoEstado, p_fecha_realizada: nuevoEstado === 'no_realizada' ? null : format(new Date(), 'yyyy-MM-dd') })
                    if (errEst) { setEnviandoFeedback(false); alert('El feedback se ha guardado, pero no se pudo actualizar el estado. Inténtalo de nuevo.'); return }
                    setEnviandoFeedback(false)
                    if (nuevoArr?.[0]) setFeedbackEnviado(nuevoArr[0])
                    setSesionFlexibleGuardada(sesion.completada_el)
                  } else if (!sesion.fecha) {
                    // Sesión flexible: clonar + feedback en un solo paso
                    const { data: clonData, error } = await supabase.rpc('clonar_sesion_flexible_por_token', {
                      p_token: token, p_valores_reales: valoresReales, p_feedback_data: data, p_estado: nuevoEstado
                    })
                    if (error || !clonData?.[0]) { setEnviandoFeedback(false); alert('Error al guardar la sesión. Inténtalo de nuevo.'); return }
                    setEnviandoFeedback(false)
                    setValoresReales({})
                    setSesionFlexibleGuardada(clonData[0].fecha)
                  } else {
                    // Sesión fija: insertar feedback + marcar completada en un solo paso
                    const { data: nuevoArr, error: errIns } = await supabase.rpc('insertar_feedback_por_token', { p_token: token, p_data: data })
                    if (errIns) { setEnviandoFeedback(false); alert('Error al guardar el feedback. Inténtalo de nuevo.'); return }
                    const { error: errEst } = await supabase.rpc('completar_sesion_por_token', { p_token: token, p_fecha: sesion.fecha, p_estado: nuevoEstado, p_fecha_realizada: nuevoEstado === 'no_realizada' ? null : format(new Date(), 'yyyy-MM-dd') })
                    if (errEst) { setEnviandoFeedback(false); alert('El feedback se ha guardado, pero no se pudo actualizar el estado. Inténtalo de nuevo.'); return }
                    setSesion(s => ({ ...s, estado: nuevoEstado }))
                    setSesionFijaGuardada(true)
                    setEnviandoFeedback(false)
                    if (nuevoArr?.[0]) setFeedbackEnviado(nuevoArr[0])
                  }
                }}
              />
            </div>
          ) : null}
        </div>}

        {/* SESIONES SIN CUESTIONARIO: botón de guardar independiente */}
        {interactiva && sesion.con_feedback === false && !sesionFijaGuardada && !sesionFlexibleGuardada && (
          <div style={{ marginTop: 24 }}>
            <button
              onClick={async () => {
                setGuardandoSesion(true)
                if (!sesion.fecha) {
                  const { data: clonData, error } = await supabase.rpc('clonar_sesion_flexible_por_token', {
                    p_token: token, p_valores_reales: valoresReales, p_estado: 'realizada'
                  })
                  setGuardandoSesion(false)
                  if (error || !clonData?.[0]) { alert('Error al guardar. Inténtalo de nuevo.'); return }
                  setValoresReales({})
                  setSesionFlexibleGuardada(clonData[0].fecha)
                } else {
                  const { error: errGuardar } = await supabase.rpc('completar_sesion_por_token', { p_token: token, p_fecha: sesion.fecha, p_estado: 'realizada', p_fecha_realizada: format(new Date(), 'yyyy-MM-dd') })
                  setGuardandoSesion(false)
                  if (errGuardar) { alert('Error al guardar la sesión. Inténtalo de nuevo.'); return }
                  setSesion(s => ({ ...s, estado: 'realizada' }))
                  setSesionFijaGuardada(true)
                }
              }}
              disabled={guardandoSesion}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: `2px solid ${T.accent}`, background: 'transparent', color: T.accent, fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em' }}>
              {guardandoSesion ? 'Guardando...' : '↑ Guardar y enviar sesión'}
            </button>
          </div>
        )}
        {sesion.con_feedback === false && (sesionFijaGuardada || sesionFlexibleGuardada) && (
          <div style={{ marginTop: 24, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '13px 18px', textAlign: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>✓ Sesión guardada y enviada</span>
          </div>
        )}


      </div>
    </div>
  )
}
