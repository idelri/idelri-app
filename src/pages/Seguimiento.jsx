import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, addWeeks, addDays, isWithinInterval, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Chart, BarController, LineController,
  BarElement, LineElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Legend, Filler,
} from 'chart.js'

Chart.register(
  BarController, LineController,
  BarElement, LineElement, PointElement,
  LinearScale, CategoryScale,
  Tooltip, Legend, Filler,
)

// ───────────────────────── Semáforo de colores ─────────────────────────
const VERDE = '#1baf7a', VERDE_BG = '#e8f5f0'
const AMARILLO = '#eda100', AMARILLO_BG = '#fef3c7'
const ROJO = '#e34948', ROJO_BG = '#fde8e8'
const GRIS = 'var(--text3)', GRIS_BG = 'var(--bg2)'
const AZUL = '#3b82f6', AZUL_BG = '#dbeafe'

const SIN_DATO = { color: GRIS, bg: GRIS_BG }

function claseMolestias(texto) {
  if (!texto) return SIN_DATO
  const t = texto.toLowerCase()
  if (t.includes('moderado') || t.includes('alto')) return { color: ROJO, bg: ROJO_BG }
  if (t.includes('leve')) return { color: AMARILLO, bg: AMARILLO_BG }
  if (t.startsWith('no')) return { color: VERDE, bg: VERDE_BG }
  return SIN_DATO
}

function claseEstadoSesion(status) {
  if (status === 'completed') return { color: VERDE, bg: VERDE_BG, label: 'Completada' }
  if (status === 'partial') return { color: AZUL, bg: AZUL_BG, label: 'Parcial' }
  if (status === 'missed') return { color: ROJO, bg: ROJO_BG, label: 'No realizada' }
  return { color: GRIS, bg: GRIS_BG, label: 'Sin feedback' }
}

function rpeMedioSemana(semana) {
  const vals = semana.sesiones.map(s => s.feedback?.data?.rpe?.value).filter(v => v != null)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}
function duracionMediaSemana(semana) {
  const vals = semana.sesiones.map(s => s.feedback?.data?.duration?.minutes).filter(v => v != null)
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
function resumenSesiones(semana) {
  const total = semana.sesiones.length
  const ok = semana.sesiones.filter(s => {
    const st = s.feedback?.data?.completion?.status
    return st === 'completed' || st === 'partial'
  }).length
  return { ok, total }
}

// ───────────────────────── Componentes pequeños ─────────────────────────
function Chip({ children, color, bg, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, padding: '1px 7px', borderRadius: 8,
      background: bg, color, fontWeight: 600, whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </span>
  )
}

function FilaDetalle({ label, valor }) {
  if (valor == null || valor === '' || valor === false) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '4px 0' }}>
      <span style={{ color: 'var(--text3)', minWidth: 170, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{valor === true ? 'Sí' : String(valor)}</span>
    </div>
  )
}

// ───────────────────────── Bloque de check-in semanal ─────────────────────────
function FilaSesion({ sesion }) {
  const [abierta, setAbierta] = useState(false)
  const fb = sesion.feedback?.data
  const estado = claseEstadoSesion(fb?.completion?.status)
  return (
    <>
      <tr onClick={() => setAbierta(o => !o)} style={{ cursor: 'pointer' }}>
        <td style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          <div>
            <div style={{ fontWeight: 500 }}>{sesion.titulo}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{sesion.fecha ? format(parseISO(sesion.fecha), 'dd MMM', { locale: es }) : '—'}</div>
          </div>
        </td>
        <td>{fb?.rpe?.value ?? <span style={{ color: 'var(--text3)' }}>—</span>}</td>
        <td>{fb?.duration?.minutes != null ? `${fb.duration.minutes} min` : <span style={{ color: 'var(--text3)' }}>—</span>}</td>
        <td>
          {fb ? (
            <span style={{ color: fb.pain?.hasPain ? (fb.pain.additionalPainLevel ? claseMolestias(fb.pain.additionalPainLevel).color : AMARILLO) : VERDE, fontWeight: 600 }}>
              {fb.pain?.hasPain ? 'Sí' : 'No'}
            </span>
          ) : <span style={{ color: 'var(--text3)' }}>—</span>}
        </td>
        <td>
          {fb ? (
            <span style={{ color: fb.technical?.hasDifficulty ? AMARILLO : VERDE, fontWeight: 600 }}>
              {fb.technical?.hasDifficulty ? 'Sí' : 'No'}
            </span>
          ) : <span style={{ color: 'var(--text3)' }}>—</span>}
        </td>
        <td><Chip color={estado.color} bg={estado.bg}>{estado.label}</Chip></td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg)' }}>
            {!fb ? (
              <div style={{ fontSize: 12.5, color: 'var(--text3)', padding: '6px 0' }}>Esta sesión no tiene feedback enviado por el cliente.</div>
            ) : (
              <div style={{ padding: '6px 0 10px' }}>
                <FilaDetalle label="Estado de finalización" valor={claseEstadoSesion(fb.completion?.status).label} />
                {fb.completion?.reasons?.length > 0 && <FilaDetalle label="Motivos" valor={fb.completion.reasons.join(', ')} />}
                <FilaDetalle label="Detalle parcial" valor={fb.completion?.partialDetails} />
                <FilaDetalle label="¿Dolor?" valor={fb.pain?.hasPain} />
                <FilaDetalle label="Detalle dolor principal" valor={fb.pain?.mainPainDetails} />
                <FilaDetalle label="¿Dolor adicional?" valor={fb.pain?.additionalPain} />
                <FilaDetalle label="Nivel dolor adicional" valor={fb.pain?.additionalPainLevel} />
                <FilaDetalle label="Detalle dolor adicional" valor={fb.pain?.additionalPainDetails} />
                <FilaDetalle label="¿Dificultad técnica?" valor={fb.technical?.hasDifficulty} />
                <FilaDetalle label="Detalle dificultad técnica" valor={fb.technical?.mainTechnicalDetails} />
                <FilaDetalle label="¿Dificultad técnica adicional?" valor={fb.technical?.additionalTechnicalDifficulty} />
                <FilaDetalle label="Detalle dificultad adicional" valor={fb.technical?.additionalTechnicalDetails} />
                <FilaDetalle label="¿Material faltante?" valor={fb.equipment?.missingEquipment} />
                <FilaDetalle label="Detalle material" valor={fb.equipment?.details} />
                <FilaDetalle label="¿Ejercicio poco claro?" valor={fb.understanding?.unclearExercise} />
                <FilaDetalle label="Detalle comprensión" valor={fb.understanding?.details} />
                <FilaDetalle label="Sensación post-sesión" valor={fb.postSessionFeeling} />
                {fb.generalComments && (
                  <div className="card" style={{ borderLeft: `3px solid ${VERDE}`, padding: '10px 14px', marginTop: 8, background: 'var(--surface)' }}>
                    <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>Comentarios generales</div>
                    <div style={{ fontSize: 13 }}>{fb.generalComments}</div>
                  </div>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// Convierte minutos reales de zona a porcentaje
function minZonasPct(z12, z34, z5) {
  const total = (z12 ?? 0) + (z34 ?? 0) + (z5 ?? 0)
  if (total === 0) return { z12: null, z34: null, z5: null }
  return {
    z12: Math.round((z12 ?? 0) / total * 100),
    z34: Math.round((z34 ?? 0) / total * 100),
    z5:  Math.round((z5  ?? 0) / total * 100),
  }
}

// ───────────────────────── Barras planificado vs real ─────────────────────────
function BarraZona({ label, color, obj, real }) {
  if (obj == null) return null
  // real y obj son ambos porcentajes (0-100)
  const pctReal = real != null ? Math.min(real, 100) : 0
  const pctObj  = Math.min(obj, 100)
  const diff    = real != null ? real - obj : null
  const barColor = real == null ? '#d1d5db' : Math.abs(diff) <= 10 ? VERDE : Math.abs(diff) <= 20 ? AMARILLO : ROJO
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 10, color: 'var(--text3)', width: 36, flexShrink: 0, fontFamily: 'var(--mono)' }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: 'var(--bg2)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(pctReal, 100)}%`, background: barColor, borderRadius: 4, transition: 'width 0.3s' }} />
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pctObj}%`, width: 2, background: '#6b7280', opacity: 0.6 }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: barColor, width: 52, flexShrink: 0, textAlign: 'right' }}>
        {real ?? '—'}<span style={{ color: 'var(--text3)' }}>/{obj}%</span>
      </span>
    </div>
  )
}

function BloqueCumplimiento({ semana }) {
  const { kmMin, kmMax, kmReal, zona1_2Obj, zona3_4Obj, zona5Obj, zona1_2Real, zona3_4Real, zona5Real } = semana
  const tienePlan = zona1_2Obj != null || kmMin != null
  const tieneReal = kmReal != null || zona1_2Real != null
  if (!tienePlan) return null

  // Convertir minutos reales a porcentajes para comparar con objetivos
  const pct = minZonasPct(zona1_2Real, zona3_4Real, zona5Real)

  const kmMedio   = kmMin != null ? (kmMin + (kmMax || kmMin)) / 2 : null
  const kmPct     = kmMedio && kmReal != null ? Math.min(kmReal / kmMedio * 100, 130) : 0
  const kmDiff    = kmMedio != null && kmReal != null ? Math.abs(kmReal - kmMedio) : null
  const kmColor   = kmReal == null ? '#d1d5db' : kmDiff == null ? '#d1d5db' : kmDiff <= 8 ? VERDE : kmDiff <= 12 ? AMARILLO : ROJO

  return (
    <div style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
        Planificado vs Real
      </div>

      {kmMin != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 10, borderBottom: zona1_2Obj ? '1px solid var(--border)' : 'none' }}>
          <span style={{ fontSize: 10, color: 'var(--text3)', width: 36, flexShrink: 0, fontFamily: 'var(--mono)' }}>Km</span>
          <div style={{ flex: 1, height: 8, background: 'var(--bg2)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
            {/* rango objetivo */}
            <div style={{ position: 'absolute', top: 0, height: '100%', left: `${(kmMin / ((kmMax || kmMin) * 1.3)) * 100}%`, width: `${((kmMax || kmMin) - kmMin) / ((kmMax || kmMin) * 1.3) * 100}%`, background: '#2d6a4f30', borderRadius: 2 }} />
            {kmReal != null && (
              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(kmReal / ((kmMax || kmMin) * 1.3) * 100, 100)}%`, background: kmColor, borderRadius: 4, transition: 'width 0.3s' }} />
            )}
          </div>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: kmColor, width: 80, flexShrink: 0, textAlign: 'right' }}>
            {kmReal ?? <span style={{ color: 'var(--text3)' }}>—</span>}
            <span style={{ color: 'var(--text3)' }}> / {kmMin}{kmMax && kmMax !== kmMin ? `–${kmMax}` : ''} km</span>
          </span>
        </div>
      )}

      {zona1_2Obj != null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <BarraZona label="Z1-Z2" color={AZUL}    obj={zona1_2Obj} real={pct.z12} />
          <BarraZona label="Z3-Z4" color={AMARILLO} obj={zona3_4Obj} real={pct.z34} />
          <BarraZona label="Z5"    color={ROJO}     obj={zona5Obj}   real={pct.z5}  />
        </div>
      )}

      {!tieneReal && (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', marginTop: 6 }}>Sin datos reales registrados esta semana.</div>
      )}
    </div>
  )
}

// ───────────────────────── Cabecera de semana ─────────────────────────
function CabeceraSemana({ semana, abierta, onToggle }) {
  const rpe = rpeMedioSemana(semana)
  const { ok, total } = resumenSesiones(semana)
  return (
    <div onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 36px',
      cursor: 'pointer', flexWrap: 'wrap', borderBottom: '1px solid var(--border)',
      background: abierta ? 'var(--bg2)' : 'transparent',
    }}>
      {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 150 }}>
        Semana {semana.numero} <span style={{ color: 'var(--text3)', fontWeight: 400, fontFamily: 'var(--mono)', fontSize: 11 }}>· {format(semana.inicio, 'dd MMM', { locale: es })}–{format(semana.fin, 'dd MMM', { locale: es })}</span>
      </span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip color={GRIS} bg={GRIS_BG}>RPE medio {rpe ?? '—'}</Chip>
        <Chip color={ok === total && total > 0 ? VERDE : GRIS} bg={ok === total && total > 0 ? VERDE_BG : GRIS_BG}>{ok}/{total} sesiones</Chip>
      </div>
    </div>
  )
}

// ───────────────────────── Sub-vista: Tabla ─────────────────────────
function SubvistaTabla({ semanasPorMes, semanasEnriquecidas, clienteData }) {
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroSemana, setFiltroSemana] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('todo')
  const [mesesAbiertos, setMesesAbiertos] = useState({})
  const [semanasAbiertas, setSemanasAbiertas] = useState({})

  function pasaFiltroTipo(semana) {
    if (filtroTipo === 'sesiones') return semana.sesiones.length > 0
    return true
  }

  const mesesFiltrados = semanasPorMes
    .filter(m => !filtroMes || m.key === filtroMes)
    .map(m => ({ ...m, semanas: m.semanas.filter(s => (!filtroSemana || s.id === filtroSemana) && pasaFiltroTipo(s)) }))
    .filter(m => m.semanas.length > 0)

  if (semanasEnriquecidas.length === 0) {
    return <div className="empty"><p>No hay semanas de planificación todavía.</p></div>
  }

  return (
    <div>
      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14, padding: '12px 16px' }}>
        <select className="form-select" style={{ maxWidth: 200 }} value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
          <option value="">Todos los meses</option>
          {semanasPorMes.map(m => <option key={m.key} value={m.key} style={{ textTransform: 'capitalize' }}>{m.label}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 220 }} value={filtroSemana} onChange={e => setFiltroSemana(e.target.value)}>
          <option value="">Todas las semanas</option>
          {semanasEnriquecidas.map(s => <option key={s.id} value={s.id}>Semana {s.numero} · {format(s.inicio, 'dd MMM', { locale: es })}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 180 }} value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="todo">Todo</option>
          <option value="sesiones">Solo sesiones</option>
        </select>
      </div>

      {mesesFiltrados.length === 0 && <div className="empty"><p>No hay datos con estos filtros.</p></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mesesFiltrados.map(mes => {
          const abierto = mesesAbiertos[mes.key] ?? true
          const numSesionesFb = mes.semanas.reduce((acc, s) => acc + s.sesiones.filter(se => se.feedback).length, 0)
          return (
            <div key={mes.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div onClick={() => setMesesAbiertos(m => ({ ...m, [mes.key]: !abierto }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', background: 'var(--bg2)', borderBottom: abierto ? '1px solid var(--border)' : 'none' }}>
                {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{mes.label}</span>
                <span style={{ fontSize: 11.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{numSesionesFb} sesiones con feedback</span>
              </div>
              {abierto && mes.semanas.map(semana => {
                const semAbierta = semanasAbiertas[semana.id] ?? false
                return (
                  <div key={semana.id}>
                    <CabeceraSemana semana={semana} abierta={semAbierta} onToggle={() => setSemanasAbiertas(s => ({ ...s, [semana.id]: !semAbierta }))} />
                    {semAbierta && (
                      <div style={{ padding: '14px 16px 16px 36px' }}>
                        <BloqueCumplimiento semana={semana} />
                        {semana.sesiones.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Sin sesiones esta semana.</div>
                        ) : (
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Sesión</th>
                                  <th>RPE</th>
                                  <th>Dur. real</th>
                                  <th>Dolor</th>
                                  <th>Técnica</th>
                                  <th>Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {semana.sesiones.map(s => <FilaSesion key={s.id} sesion={s} />)}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
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

// ───────────────────────── Variables y colores para el dashboard ─────────────────────────
const VARIABLES = [
  { id: 'rpe', label: 'RPE medio sesiones', color: '#e34948', getValor: s => rpeMedioSemana(s) },
  { id: 'duracion', label: 'Duración media sesiones (min)', color: '#8b5cf6', getValor: s => duracionMediaSemana(s) },
]

const TIPOS_GRAFICA = [
  { id: 'linea', label: 'Línea' },
  { id: 'barras', label: 'Barras' },
  { id: 'puntos', label: 'Puntos' },
]

function GraficaSeguimiento({ semanas, variablesActivas }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)
  const activas = VARIABLES.filter(v => variablesActivas[v.id]?.activo)

  useEffect(() => {
    if (!canvasRef.current) return
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    if (activas.length === 0) return

    const labels = semanas.map((s, i) => `S${i + 1}`)
    const datasets = activas.map(v => {
      const tipo = variablesActivas[v.id]?.tipo || 'linea'
      const data = semanas.map(s => v.getValor(s))
      const base = { label: v.label, data, borderColor: v.color, backgroundColor: v.color, spanGaps: false }
      if (tipo === 'barras') return { ...base, type: 'bar', backgroundColor: v.color + 'aa', borderWidth: 0 }
      if (tipo === 'puntos') return { ...base, type: 'line', showLine: false, pointRadius: 8, pointBackgroundColor: v.color, pointBorderColor: v.color }
      return { ...base, type: 'line', borderWidth: 2, pointRadius: 3, pointBackgroundColor: v.color, fill: false, tension: 0.25 }
    })

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#fff', titleColor: '#1a1916', bodyColor: '#1a1916', borderColor: 'var(--border)', borderWidth: 1, padding: 10 },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { font: { size: 11 } } },
        },
      },
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [semanas, variablesActivas])

  if (activas.length === 0) {
    return <div className="empty"><p>Selecciona al menos una variable para ver la gráfica.</p></div>
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        {activas.map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.color, display: 'inline-block' }} />
            <span>{v.label}</span>
            <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10.5 }}>({TIPOS_GRAFICA.find(t => t.id === (variablesActivas[v.id]?.tipo || 'linea'))?.label})</span>
          </div>
        ))}
      </div>
      <div style={{ position: 'relative', width: '100%', height: 320 }}>
        <canvas ref={canvasRef} role="img" aria-label="Gráfica de seguimiento" />
      </div>
    </div>
  )
}

// ───────────────────────── Sub-vista: Dashboard ─────────────────────────
function SubvistaDashboard({ semanasEnriquecidas }) {
  const [variablesActivas, setVariablesActivas] = useState({})

  function toggleVariable(id) {
    setVariablesActivas(v => ({ ...v, [id]: { tipo: v[id]?.tipo || 'linea', activo: !v[id]?.activo } }))
  }
  function setTipoVariable(id, tipo) {
    setVariablesActivas(v => ({ ...v, [id]: { ...v[id], tipo, activo: true } }))
  }

  if (semanasEnriquecidas.length === 0) {
    return <div className="empty"><p>No hay datos de seguimiento todavía.</p></div>
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14, padding: '14px 16px' }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Variables cuantitativas</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {VARIABLES.map(v => {
            const activo = variablesActivas[v.id]?.activo
            const tipo = variablesActivas[v.id]?.tipo || 'linea'
            return (
              <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, minWidth: 240, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!activo} onChange={() => toggleVariable(v.id)} />
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: v.color, display: 'inline-block' }} />
                  {v.label}
                </label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {TIPOS_GRAFICA.map(t => (
                    <button key={t.id} className="btn btn-ghost btn-sm"
                      style={tipo === t.id && activo ? { background: 'var(--bg2)', fontWeight: 600 } : {}}
                      onClick={() => setTipoVariable(v.id, t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ padding: '16px 16px 8px' }}>
        <GraficaSeguimiento semanas={semanasEnriquecidas} variablesActivas={variablesActivas} />
      </div>
    </div>
  )
}

// ───────────────────────── Componente principal ─────────────────────────
export default function Seguimiento({ clienteId, planificacionId, bloques, semanas, subbloques, clienteData }) {
  const [subvista, setSubvista] = useState('tabla')
  const [sesionesCliente, setSesionesCliente] = useState([])
  const [feedbacks, setFeedbacks] = useState({})
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (clienteId) cargarDatos() }, [clienteId])

  async function cargarDatos() {
    setLoading(true)
    const { data: sess } = await supabase.from('sesiones').select('*').eq('cliente_id', clienteId).order('fecha')
    setSesionesCliente(sess || [])
    if (sess && sess.length > 0) {
      const { data: fbs } = await supabase.from('sesion_feedback').select('*').in('sesion_id', sess.map(s => s.id))
      const map = {}
      ;(fbs || []).forEach(f => { map[f.sesion_id] = f })
      setFeedbacks(map)
    } else {
      setFeedbacks({})
    }
    setLoading(false)
  }

  const semanasEnriquecidas = useMemo(() => {
    const lista = []
    const bloquesOrdenados = [...(bloques || [])].sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
    bloquesOrdenados.forEach(b => {
      if (!b.fecha_inicio || !b.semanas) return
      const semsDB = (semanas?.[b.id] || [])
      const semsDBPorNumero = {}
      semsDB.forEach(s => { semsDBPorNumero[s.numero] = s })

      // Generar todas las semanas del bloque, con o sin fila en DB
      for (let num = 1; num <= b.semanas; num++) {
        const s = semsDBPorNumero[num] || null
        const inicio = addWeeks(parseISO(b.fecha_inicio + 'T12:00:00'), num - 1)
        const fin = addDays(inicio, 6)
        const sesionesSemana = sesionesCliente
          .filter(se => se.fecha && isWithinInterval(parseISO(se.fecha + 'T12:00:00'), { start: inicio, end: fin }))
          .map(se => ({ ...se, feedback: feedbacks[se.id] || null }))
        const subPlan = (subbloques?.[b.id] || []).find(sb => num >= sb.semana_inicio && num <= sb.semana_fin)
        lista.push({
          id: s?.id || `virtual-${b.id}-${num}`,
          virtual: !s,
          bloqueId: b.id,
          bloqueNombre: b.nombre,
          numero: num,
          inicio, fin,
          sesiones: sesionesSemana,
          kmReal:      s?.km_real      ?? null,
          kmObjetivo:  s?.km_objetivo  ?? null,
          kmMin:       subPlan?.km_min ?? null,
          kmMax:       subPlan?.km_max ?? null,
          zona1_2Obj:  subPlan?.zona1_2  ?? null,
          zona3_4Obj:  subPlan?.zona3_4  ?? null,
          zona5Obj:    subPlan?.zona5    ?? null,
          zona1_2Real: s?.zona1_2_real   ?? null,
          zona3_4Real: s?.zona3_4_real   ?? null,
          zona5Real:   s?.zona5_real     ?? null,
        })
      }
    })
    return lista
  }, [bloques, semanas, subbloques, sesionesCliente, feedbacks])

  const semanasPorMes = useMemo(() => {
    const map = {}
    semanasEnriquecidas.forEach(s => {
      const key = format(s.inicio, 'yyyy-MM')
      if (!map[key]) map[key] = { key, label: format(s.inicio, 'MMMM yyyy', { locale: es }), semanas: [] }
      map[key].semanas.push(s)
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [semanasEnriquecidas])

  return (
    <div>
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {['tabla', 'dashboard'].map(v => (
          <button key={v} className="btn btn-ghost btn-sm" style={subvista === v ? { background: 'var(--bg2)', fontWeight: 500 } : {}} onClick={() => setSubvista(v)}>
            {v === 'tabla' ? 'Tabla' : 'Dashboard'}
          </button>
        ))}
      </div>

      {loading && <div className="empty"><p>Cargando...</p></div>}

      {!loading && subvista === 'tabla' && (
        <SubvistaTabla semanasPorMes={semanasPorMes} semanasEnriquecidas={semanasEnriquecidas} clienteData={clienteData} />
      )}
      {!loading && subvista === 'dashboard' && (
        <SubvistaDashboard semanasEnriquecidas={semanasEnriquecidas} />
      )}
    </div>
  )
}
