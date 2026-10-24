/**
 * CalendarioPortal — calendario del portal del cliente.
 *
 * Una fila por semana (lunes a domingo). A la izquierda (o arriba en móvil)
 * una franja con el color de la fase del plan, el número de semana y su
 * objetivo. En cada día se ve si hay sesión, nota, competición o control.
 *
 * Previsualizar una sesión:
 *   - Ordenador: al pasar el ratón por encima aparecen sus bloques y
 *     ejercicios; al hacer clic se abre la sesión completa.
 *   - Móvil / táctil: el primer toque en un día abre debajo el detalle con
 *     los ejercicios; el botón "Abrir sesión" lleva a la sesión completa.
 *
 * Los ejercicios se piden por el token público de la sesión (mismas RPC que
 * la vista de sesión), solo cuando hacen falta, y se guardan en memoria.
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import {
  format, startOfMonth, endOfMonth, startOfWeek, addDays, addWeeks, addMonths, subMonths,
  isSameDay, isSameMonth, isToday, parseISO,
} from 'date-fns'
import { estructurarPasos } from '../lib/zonas'
import PasosCompactos from './PasosCompactos'
import { es } from 'date-fns/locale'

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const DIAS_LARGO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

const key = d => format(d, 'yyyy-MM-dd')
const fechaLocal = s => parseISO(s + 'T12:00:00')

function puedeHover() {
  try { return window.matchMedia('(hover: hover) and (pointer: fine)').matches } catch { return true }
}

// La duración se guarda en segundos: 30 → "30 s", 120 → "2 min", 90 → "1:30 min"
function fmtDuracion(v) {
  const t = (v ?? '').toString().trim()
  if (!t) return ''
  if (!/^\d+$/.test(t)) return t
  const n = parseInt(t, 10)
  if (n < 60) return `${n} s`
  const m = Math.floor(n / 60), r = n % 60
  return r ? `${m}:${String(r).padStart(2, '0')} min` : `${m} min`
}

// Emoji con el que empieza una nota (⚽ Entreno…), para marcar el día en móvil
function emojiInicial(texto) {
  const m = (texto || '').match(/^\s*(\p{Extended_Pictographic}\uFE0F?)/u)
  return m ? m[1] : null
}

// Texto corto de prescripción: "3 × 10", "3 × 30 s", "2 × 8 /lado"...
function prescripcion(e) {
  const series = (e.series || '').toString().trim()
  const reps = (e.reps || '').toString().trim()
  const dur = fmtDuracion(e.duracion)
  const dist = (e.distancia || '').toString().trim()
  const carga = reps || dur || dist
  const lado = e.reps_por_lado && reps ? ' /lado' : ''
  if (series && carga) return `${series} × ${carga}${lado}`
  if (carga) return `${carga}${lado}`
  if (series) return `${series} series`
  return ''
}

/* ── Contenido de la previsualización (bloques + ejercicios) ─────────────── */
export function DetalleSesion({ T, detalle }) {
  if (!detalle) {
    return <div style={{ fontSize: 11.5, color: T.ink3, padding: '6px 0' }}>Cargando ejercicios…</div>
  }
  if (detalle.error) {
    return <div style={{ fontSize: 11.5, color: T.ink3, padding: '6px 0' }}>No se han podido cargar los ejercicios.</div>
  }
  const { bloques, ejercicios, fases = [], grupos = [], perfil = null } = detalle
  // Pasos en el mismo orden que en el constructor (las repeticiones en su sitio)
  const pasosPorBloque = estructurarPasos(fases, grupos)
  if (bloques.length === 0) {
    return <div style={{ fontSize: 11.5, color: T.ink3, padding: '6px 0' }}>Abre la sesión para ver el detalle.</div>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bloques.map(b => {
        const ejs = ejercicios.filter(e => e.bloque_id === b.id)
        const fs = pasosPorBloque[b.id] || []
        const color = b.color || T.green
        const vueltas = b.vueltas > 1 ? ` · ${b.vueltas} vueltas` : ''
        return (
          <div key={b.id} style={{ borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.3px' }}>
              {b.nombre || 'Bloque'}<span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: T.ink3 }}>{vueltas}</span>
            </div>
            {ejs.length === 0 && b.nota && (
              <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 2, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.nota}</div>
            )}
            {fs.length > 0 && <div style={{ marginTop: 2 }}><PasosCompactos items={fs} perfil={perfil} T={T} /></div>}
            {ejs.map(e => {
              const p = prescripcion(e)
              return (
                <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, lineHeight: 1.35, marginTop: 2 }}>
                  <span style={{ flex: 1, minWidth: 0, color: T.ink }}>{e.nombre}</span>
                  {p && <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink3, whiteSpace: 'nowrap' }}>{p}</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/* Texto completo de la fase y de la semana (al tocar o pasar por la franja) */
function InfoFase({ T, bloque, sem, numero }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {bloque?.color && <span style={{ width: 10, height: 10, borderRadius: 3, background: bloque.color, flexShrink: 0 }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{numero ? `Semana ${numero}` : 'Semana'}{bloque ? ` · ${bloque.nombre}` : ''}</span>
      </div>
      {bloque?.objetivo && <div style={{ fontSize: 12, color: T.ink2, lineHeight: 1.45, fontStyle: 'italic' }}>{bloque.objetivo}</div>}
      {sem?.objetivo && <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{sem.objetivo}</div>}
    </div>
  )
}

export default function CalendarioPortal({
  T, isDesktop, sesiones, notas, competiciones, controles, bloques, semanas,
  fechaVisualSesion, iconoSesion, abrirSesion, conEstado, colorEstado,
}) {
  const [mes, setMes] = useState(() => new Date())
  const [diaSelec, setDiaSelec] = useState(null)       // móvil: día abierto
  const [hover, setHover] = useState(null)             // escritorio: { id, rect }
  const [semInfo, setSemInfo] = useState(null)         // semana con el texto completo abierto (clave del lunes)
  const [semRect, setSemRect] = useState(null)         // escritorio: posición de la franja para el recuadro
  useEffect(() => {
    if (!semInfo) return
    const cerrarSem = () => setSemInfo(null)
    window.addEventListener('scroll', cerrarSem, { passive: true })
    return () => window.removeEventListener('scroll', cerrarSem)
  }, [semInfo])
  const [detalles, setDetalles] = useState({})         // token → { bloques, ejercicios } | { error }
  const pedidos = useRef(new Set())
  const cerrarTimer = useRef(null)
  const hoverReal = useMemo(() => puedeHover(), [])

  /* Pide (una vez) los bloques y ejercicios de una sesión */
  function cargarDetalle(token) {
    if (!token || pedidos.current.has(token)) return
    pedidos.current.add(token)
    Promise.all([
      supabase.rpc('get_bloques_por_token_sesion', { p_token: token }),
      supabase.rpc('get_ejercicios_por_token_sesion', { p_token: token }),
      supabase.rpc('get_pasos_por_token_sesion', { p_token: token }),
      supabase.rpc('get_grupos_bloque_por_token_sesion', { p_token: token }),
      supabase.rpc('get_perfil_zonas_por_token_sesion', { p_token: token }),
    ]).then(([b, e, f, g, pz]) => {
      if (b.error || e.error) {
        pedidos.current.delete(token)
        setDetalles(d => ({ ...d, [token]: { error: true } }))
        return
      }
      const bls = (b.data || []).slice().sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
      const ejs = (e.data || []).slice().sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
      const fases = (f.data || []).slice().sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
      setDetalles(d => ({ ...d, [token]: { bloques: bls, ejercicios: ejs, fases, grupos: g.data || [], perfil: pz.data || null } }))
    })
  }

  /* ── Índices por día ── */
  const porDia = useMemo(() => {
    const m = {}
    const add = (k, tipo, x) => { (m[k] = m[k] || { ses: [], notas: [], comps: [], ctrls: [] })[tipo].push(x) }
    sesiones.forEach(s => { const fv = fechaVisualSesion(s); if (fv) add(fv, 'ses', s) })
    notas.forEach(n => { if (n.fecha) add(n.fecha, 'notas', n) })
    competiciones.forEach(c => { if (c.fecha) add(c.fecha, 'comps', c) })
    controles.forEach(c => { if (c.fecha) add(c.fecha, 'ctrls', c) })
    Object.values(m).forEach(d => {
      d.ses.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999))
      d.notas.sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999))
    })
    return m
  }, [sesiones, notas, competiciones, controles, fechaVisualSesion])

  /* ── Fase y semana del plan para un lunes ── */
  function infoSemana(lunes) {
    const k = key(lunes)
    const sem = semanas.find(s => s.fecha_inicio_semana === k) || null
    const bloque = bloques.find(b => {
      if (!b.fecha_inicio) return false
      const ini = startOfWeek(fechaLocal(b.fecha_inicio), { weekStartsOn: 1 })
      return lunes >= ini && lunes < addWeeks(ini, b.semanas || 0)
    }) || (sem ? bloques.find(b => b.id === sem.bloque_id) : null) || null
    let numero = sem?.numero_cliente || null
    if (!numero && bloque) {
      // Respaldo: contar semanas desde el primer bloque
      const ordenados = bloques.filter(b => b.fecha_inicio).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
      const ini0 = startOfWeek(fechaLocal(ordenados[0].fecha_inicio), { weekStartsOn: 1 })
      numero = Math.round((lunes - ini0) / (7 * 86400000)) + 1
    }
    return { sem, bloque, numero }
  }

  /* ── Semanas visibles del mes ── */
  const filas = useMemo(() => {
    const out = []
    let lun = startOfWeek(startOfMonth(mes), { weekStartsOn: 1 })
    const fin = endOfMonth(mes)
    while (lun <= fin) { out.push(lun); lun = addWeeks(lun, 1) }
    return out
  }, [mes])

  const fases = useMemo(() => bloques
    .filter(b => b.fecha_inicio)
    .slice().sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)), [bloques])

  const lunesHoy = startOfWeek(new Date(), { weekStartsOn: 1 })

  // Al abrir un día en móvil, cargar los ejercicios de sus sesiones
  useEffect(() => {
    if (!diaSelec) return
    ;(porDia[key(diaSelec)]?.ses || []).forEach(s => cargarDetalle(s.token_publico))
  }, [diaSelec])

  useEffect(() => () => clearTimeout(cerrarTimer.current), [])

  // La previsualización flotante se cierra al hacer scroll
  useEffect(() => {
    if (!hover) return
    const cerrar = () => setHover(null)
    window.addEventListener('scroll', cerrar, { passive: true })
    return () => window.removeEventListener('scroll', cerrar)
  }, [hover])

  /* ── Escritorio: hover sobre una sesión ── */
  function entrarSesion(ev, s) {
    clearTimeout(cerrarTimer.current)
    const r = ev.currentTarget.getBoundingClientRect()
    setHover({ id: s.id, ses: s, rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width } })
    cargarDetalle(s.token_publico)
  }
  function salirSesion() {
    clearTimeout(cerrarTimer.current)
    cerrarTimer.current = setTimeout(() => setHover(null), 160)
  }
  function clicSesion(ev, s) {
    // Táctil en pantalla grande: primer toque enseña, segundo abre
    if (!hoverReal && hover?.id !== s.id) { entrarSesion(ev, s); return }
    abrirSesion(s)
  }

  const btnNav = { height: 28, minWidth: 30, padding: '0 9px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontSize: 12, color: T.ink2, fontFamily: T.font }

  /* ── Cabecera: mes + leyenda de fases ── */
  const cabecera = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, textTransform: 'capitalize' }}>{format(mes, 'MMMM yyyy', { locale: es })}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { setMes(m => subMonths(m, 1)); setDiaSelec(null) }} style={btnNav} aria-label="Mes anterior">‹</button>
          <button onClick={() => { setMes(new Date()); setDiaSelec(null) }} style={btnNav}>Hoy</button>
          <button onClick={() => { setMes(m => addMonths(m, 1)); setDiaSelec(null) }} style={btnNav} aria-label="Mes siguiente">›</button>
        </div>
      </div>
      {fases.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {fases.map(b => {
            const ini = fechaLocal(b.fecha_inicio)
            const fin = addDays(addWeeks(startOfWeek(ini, { weekStartsOn: 1 }), b.semanas || 0), -1)
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.ink2, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 20, padding: '3px 10px 3px 4px' }}>
                <span style={{ width: 14, height: 14, borderRadius: 7, background: b.color || T.green, flexShrink: 0 }} />
                <span style={{ fontWeight: 600, color: T.ink }}>{b.nombre}</span>
                <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>{format(ini, 'd MMM', { locale: es })} – {format(fin, 'd MMM', { locale: es })}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  /* ══════════════ ESCRITORIO ══════════════ */
  if (isDesktop) {
    return (
      <div style={{ padding: '20px 0 60px' }}>
        {cabecera}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(7, minmax(0, 1fr))', borderBottom: `1px solid ${T.border}`, background: T.bg }}>
            <div style={{ padding: '7px 10px', fontFamily: T.mono, fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '.5px' }}>Semana</div>
            {DIAS_LARGO.map(d => (
              <div key={d} style={{ padding: '7px 8px', fontFamily: T.mono, fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '.5px', borderLeft: `1px solid ${T.border}` }}>{d}</div>
            ))}
          </div>
          {filas.map((lun, fi) => {
            const { sem, bloque, numero } = infoSemana(lun)
            const color = bloque?.color || null
            const actual = isSameDay(lun, lunesHoy)
            return (
              <div key={key(lun)} style={{ display: 'grid', gridTemplateColumns: '150px repeat(7, minmax(0, 1fr))', borderTop: fi > 0 ? `1px solid ${T.border}` : 'none', outline: actual ? `2px solid ${color || T.green}` : 'none', outlineOffset: -2, position: 'relative' }}>
                {/* Franja de fase: al pasar el ratón o al hacer clic se ve el texto completo */}
                <div onMouseEnter={ev => { if (sem?.objetivo || bloque?.objetivo) { setSemRect(ev.currentTarget.getBoundingClientRect()); setSemInfo(key(lun)) } }} onMouseLeave={() => setSemInfo(null)}
                  onClick={ev => { if (sem?.objetivo || bloque?.objetivo) { setSemRect(ev.currentTarget.getBoundingClientRect()); setSemInfo(v => v === key(lun) ? null : key(lun)) } }}
                  style={{ background: color || T.bg, color: color ? '#fff' : T.ink3, padding: '10px 10px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, cursor: sem?.objetivo || bloque?.objetivo ? 'pointer' : 'default', position: 'relative' }}>
                  {numero ? (
                    <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>S{numero}{actual && <span style={{ marginLeft: 6, fontSize: 8.5, fontWeight: 600, background: 'rgba(255,255,255,.25)', padding: '2px 6px', borderRadius: 8, verticalAlign: 'middle', fontFamily: T.mono }}>ESTÁS AQUÍ</span>}</div>
                  ) : (
                    <div style={{ fontSize: 11, fontFamily: T.mono }}>{format(lun, 'd MMM', { locale: es })}</div>
                  )}
                  {bloque && <div style={{ fontSize: 10.5, fontWeight: 600, opacity: .95, lineHeight: 1.25 }}>{bloque.nombre}</div>}
                  {sem?.objetivo && <div style={{ fontSize: 10, opacity: .88, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{sem.objetivo}</div>}
                  {(sem?.objetivo || bloque?.objetivo) && <div style={{ fontSize: 9.5, fontWeight: 600, opacity: .8, marginTop: 1 }}>Ver más ›</div>}
                  {semInfo === key(lun) && semRect && createPortal(
                    // Fuera del calendario (en el body) para que no se corte
                    <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', left: Math.min(semRect.right + 6, window.innerWidth - 352), top: Math.max(8, Math.min(semRect.top, window.innerHeight - 340)), zIndex: 1000, width: 340, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', background: T.surface || '#fff', border: `1px solid ${T.border}`, borderLeft: `4px solid ${color || T.green}`, borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.15)', padding: '12px 14px', cursor: 'default', pointerEvents: 'none', fontFamily: 'inherit' }}>
                      <InfoFase T={T} bloque={bloque} sem={sem} numero={numero} />
                    </div>,
                    document.body
                  )}
                </div>
                {/* Días */}
                {[0, 1, 2, 3, 4, 5, 6].map(i => {
                  const dia = addDays(lun, i)
                  const d = porDia[key(dia)] || { ses: [], notas: [], comps: [], ctrls: [] }
                  const fuera = !isSameMonth(dia, mes)
                  const hoy = isToday(dia)
                  return (
                    <div key={i} style={{ borderLeft: `1px solid ${T.border}`, padding: '6px 6px 8px', minHeight: 104, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, background: fuera ? '#faf9f6' : T.surface }}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: hoy ? 700 : 500, color: hoy ? '#fff' : fuera ? T.ink3 : T.ink2, background: hoy ? (color || T.green) : 'transparent', borderRadius: 10, minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: hoy ? '0 6px' : 0 }}>{format(dia, 'd')}</span>
                      </div>
                      {d.comps.map(c => (
                        <div key={c.id} title={c.objetivo || c.nombre} style={{ fontSize: 11, fontWeight: 700, color: '#7a4a00', background: '#fde9c4', border: '1px solid #f3c77a', borderRadius: 6, padding: '4px 6px', lineHeight: 1.25 }}>🏆 {c.nombre}</div>
                      ))}
                      {d.ctrls.map(c => (
                        <div key={c.id} style={{ fontSize: 10.5, fontWeight: 600, color: '#3730a3', background: '#eef2ff', borderRadius: 6, padding: '3px 6px', lineHeight: 1.25 }}>📋 {c.nombre}</div>
                      ))}
                      {d.notas.map(n => (
                        <div key={n.id} title={n.texto} style={{ fontSize: 10.5, color: '#5a3600', background: '#fef6c7', borderRadius: 6, padding: '3px 6px', lineHeight: 1.3 }}>
                          <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.texto}</div>
                        </div>
                      ))}
                      {d.ses.map(s => {
                        const activa = hover?.id === s.id
                        return (
                          <div key={s.id}
                            onMouseEnter={hoverReal ? ev => entrarSesion(ev, s) : undefined}
                            onMouseLeave={hoverReal ? salirSesion : undefined}
                            onClick={ev => clicSesion(ev, s)}
                            style={{ fontSize: 11, fontWeight: 600, color: T.ink, background: activa ? `${color || T.green}1f` : T.surface, border: `1px solid ${activa ? (color || T.green) : T.border}`, borderLeft: `3px solid ${color || T.green}`, borderRadius: 6, padding: '4px 6px', cursor: 'pointer', lineHeight: 1.25, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0 }}>{iconoSesion(s)}</span>
                            <span style={{ flex: 1, minWidth: 0, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.titulo}</span>
                            {conEstado && colorEstado(s.estado_efectivo) && <span style={{ width: 7, height: 7, borderRadius: 4, background: colorEstado(s.estado_efectivo), flexShrink: 0, marginTop: 3 }} />}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Previsualización flotante */}
        {hover && (() => {
          const ancho = 320
          const vw = window.innerWidth, vh = window.innerHeight
          let left = hover.rect.left
          if (left + ancho > vw - 12) left = Math.max(12, hover.rect.right - ancho)
          const abajo = vh - hover.rect.bottom > 380 || hover.rect.top < vh - hover.rect.bottom
          const pos = abajo ? { top: hover.rect.bottom + 6 } : { bottom: vh - hover.rect.top + 6 }
          return (
            <div onMouseEnter={() => clearTimeout(cerrarTimer.current)} onMouseLeave={salirSesion}
              style={{ position: 'fixed', left, ...pos, width: ancho, maxHeight: Math.min(380, (abajo ? vh - hover.rect.bottom : hover.rect.top) - 16), overflowY: 'auto', background: T.surface, border: `1px solid ${T.border2}`, borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.14)', zIndex: 50, padding: '12px 14px', fontFamily: T.font }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{iconoSesion(hover.ses)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{hover.ses.titulo}</div>
                  <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, marginTop: 2, textTransform: 'capitalize' }}>{format(fechaLocal(fechaVisualSesion(hover.ses)), "EEEE d MMM", { locale: es })}</div>
                </div>
              </div>
              <DetalleSesion T={T} detalle={detalles[hover.ses.token_publico]} />
              <button onClick={() => abrirSesion(hover.ses)}
                style={{ marginTop: 10, width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font }}>
                Abrir sesión →
              </button>
            </div>
          )
        })()}
      </div>
    )
  }

  /* ══════════════ MÓVIL ══════════════ */
  return (
    <div style={{ padding: '14px 12px 80px' }}>
      {cabecera}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', marginBottom: 4 }}>
        {DIAS.map(d => <div key={d} style={{ textAlign: 'center', fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>{d}</div>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filas.map(lun => {
          const { sem, bloque, numero } = infoSemana(lun)
          const color = bloque?.color || null
          const actual = isSameDay(lun, lunesHoy)
          const selEnFila = diaSelec && diaSelec >= lun && diaSelec < addDays(lun, 7)
          const dSel = selEnFila ? (porDia[key(diaSelec)] || { ses: [], notas: [], comps: [], ctrls: [] }) : null
          return (
            <div key={key(lun)} style={{ background: T.surface, borderRadius: 10, overflow: 'hidden', border: actual ? `2px solid ${color || T.green}` : `1px solid ${T.border}` }}>
              {/* Franja de fase */}
              {(bloque || numero) && (
                <div onClick={() => (sem?.objetivo || bloque?.objetivo) && setSemInfo(v => v === key(lun) ? null : key(lun))}
                  style={{ background: color || T.bg2, color: color ? '#fff' : T.ink2, padding: '5px 10px', display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, cursor: 'pointer' }}>
                  {numero && <span style={{ fontSize: 12, fontWeight: 700 }}>S{numero}</span>}
                  {bloque && <span style={{ fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>{bloque.nombre}</span>}
                  {actual && <span style={{ fontSize: 8, fontFamily: T.mono, fontWeight: 600, background: 'rgba(255,255,255,.25)', padding: '1px 5px', borderRadius: 6 }}>AQUÍ</span>}
                  {sem?.objetivo && <span style={{ fontSize: 10, opacity: .88, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>· {sem.objetivo}</span>}
                  {(sem?.objetivo || bloque?.objetivo) && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{semInfo === key(lun) ? '▴' : 'ⓘ'}</span>}
                </div>
              )}
              {semInfo === key(lun) && (
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, background: color ? `${color}12` : T.bg }}>
                  <InfoFase T={T} bloque={bloque} sem={sem} numero={numero} />
                </div>
              )}
              {/* Días */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                {[0, 1, 2, 3, 4, 5, 6].map(i => {
                  const dia = addDays(lun, i)
                  const d = porDia[key(dia)] || { ses: [], notas: [], comps: [], ctrls: [] }
                  const fuera = !isSameMonth(dia, mes)
                  const hoy = isToday(dia)
                  const sel = diaSelec && isSameDay(dia, diaSelec)
                  const hayAlgo = d.ses.length + d.notas.length + d.comps.length + d.ctrls.length > 0
                  return (
                    <button key={i} onClick={() => setDiaSelec(sel ? null : dia)}
                      style={{ border: 'none', borderLeft: i > 0 ? `1px solid ${T.bg2}` : 'none', background: sel ? `${color || T.green}1f` : d.comps.length ? '#fff5e0' : 'transparent', minHeight: 62, padding: '5px 2px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: hayAlgo ? 'pointer' : 'default', fontFamily: T.font, opacity: fuera ? .45 : 1 }}>
                      <span style={{ fontSize: 11.5, fontWeight: hoy ? 700 : 500, color: hoy ? '#fff' : T.ink2, background: hoy ? (color || T.green) : 'transparent', borderRadius: 9, minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{format(dia, 'd')}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 1, fontSize: 13, lineHeight: 1 }}>
                        {d.comps.length > 0 && <span>🏆</span>}
                        {d.ses.slice(0, 2).map(s => <span key={s.id}>{iconoSesion(s).split(' ')[0]}</span>)}
                        {d.ses.length > 2 && <span style={{ fontSize: 9, color: T.ink3 }}>+{d.ses.length - 2}</span>}
                        {d.notas.map(n => emojiInicial(n.texto)).filter(Boolean).slice(0, 1).map((em, k) => <span key={'n' + k}>{em}</span>)}
                      </div>
                      {d.notas.length > 0 && <span style={{ width: 14, height: 3, borderRadius: 2, background: '#e9c84a' }} />}
                    </button>
                  )
                })}
              </div>
              {/* Detalle del día tocado */}
              {selEnFila && (
                <div style={{ borderTop: `1px solid ${T.bg2}`, padding: '10px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, background: T.bg }}>
                  <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, textTransform: 'uppercase', letterSpacing: '.5px' }}>{format(diaSelec, "EEEE d 'de' MMMM", { locale: es })}</div>
                  {dSel.ses.length + dSel.notas.length + dSel.comps.length + dSel.ctrls.length === 0 && (
                    <div style={{ fontSize: 12, color: T.ink3 }}>Día libre.</div>
                  )}
                  {dSel.comps.map(c => (
                    <div key={c.id} style={{ fontSize: 12.5, fontWeight: 700, color: '#7a4a00', background: '#fde9c4', borderRadius: 8, padding: '8px 10px' }}>🏆 {c.nombre}{c.objetivo && <div style={{ fontWeight: 400, fontSize: 11.5, marginTop: 2 }}>{c.objetivo}</div>}</div>
                  ))}
                  {dSel.ctrls.map(c => (
                    <div key={c.id} style={{ fontSize: 12, fontWeight: 600, color: '#3730a3', background: '#eef2ff', borderRadius: 8, padding: '7px 10px' }}>📋 {c.nombre}</div>
                  ))}
                  {dSel.notas.map(n => (
                    <div key={n.id} style={{ fontSize: 12, color: '#5a3600', background: '#fef6c7', borderRadius: 8, padding: '7px 10px', lineHeight: 1.4 }}>{n.texto}</div>
                  ))}
                  {dSel.ses.map(s => (
                    <div key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${color || T.green}`, borderRadius: 8, padding: '10px 11px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontSize: 17 }}>{iconoSesion(s)}</span>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{s.titulo}</div>
                        {conEstado && colorEstado(s.estado_efectivo) && <span style={{ width: 8, height: 8, borderRadius: 4, background: colorEstado(s.estado_efectivo), marginTop: 5 }} />}
                      </div>
                      <DetalleSesion T={T} detalle={detalles[s.token_publico]} />
                      <button onClick={() => abrirSesion(s)}
                        style={{ marginTop: 10, width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: color || T.green, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.font }}>
                        Abrir sesión →
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
