/**
 * Pop-up de sesión al pasar el ratón (Timeline y Calendario).
 * Arriba: qué es la sesión (bloques y ejercicios). Abajo: el feedback del cliente,
 * o «sin feedback» si no lo ha hecho.
 *
 * Se maneja desde fuera con mostrarPopupSesion / ocultarPopupSesion y se pinta con un
 * único <PopupSesionHost />, que tiene su propio estado: pasar el ratón no vuelve a
 * pintar el Timeline entero.
 */
import { useState, useEffect, useRef } from 'react'
import { format, parseISO, isAfter, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import { DetalleSesion } from './CalendarioPortal'
import { TIPOS_COM, comentariosDeFeedback } from '../lib/comentariosFeedback'

const T = { ink: 'var(--text)', ink2: 'var(--text2)', ink3: 'var(--text3)', green: 'var(--accent)', mono: 'var(--mono)' }
const ANCHO = 320

// ── pequeño almacén: quien pasa el ratón llama a mostrar/ocultar, el host escucha ──
let actual = null
const oyentes = new Set()
let timerMostrar = null, timerOcultar = null
const emitir = () => oyentes.forEach(f => f(actual))

export function mostrarPopupSesion(e, sesion, { fb = null, onAbrir = null, retardo = 280 } = {}) {
  if (!sesion) return
  const r = e.currentTarget.getBoundingClientRect()
  clearTimeout(timerMostrar); clearTimeout(timerOcultar)
  timerMostrar = setTimeout(() => { actual = { sesion, fb, onAbrir, r: { left: r.left, right: r.right, top: r.top, bottom: r.bottom } }; emitir() }, retardo)
}
export function ocultarPopupSesion(inmediato) {
  clearTimeout(timerMostrar)
  clearTimeout(timerOcultar)
  if (inmediato) { actual = null; emitir(); return }
  timerOcultar = setTimeout(() => { actual = null; emitir() }, 160)
}
const mantener = () => clearTimeout(timerOcultar)

// Bloques y ejercicios de la sesión (se guardan un minuto para no repetir peticiones)
const cache = new Map()
async function cargarDetalle(sesionId) {
  const c = cache.get(sesionId)
  if (c && Date.now() - c.t < 60000) return c.d
  const [{ data: bloques }, { data: fases }, { data: grupos }] = await Promise.all([
    supabase.from('sesion_bloques').select('id, nombre, color, nota, orden, vueltas, sesion_ejercicios(id, bloque_id, nombre, series, reps, duracion, distancia, reps_por_lado, orden)').eq('sesion_id', sesionId).order('orden'),
    supabase.from('sesion_fases').select('id, nombre, orden, bloque_id, volumen_min, volumen_km, tipo_paso, duracion_seg, distancia_m, objetivo_tipo, objetivo_min, objetivo_max, grupo_id, descripcion, ritmo_inicio, ritmo_fin, fc_zona, rpe, pendiente_cualitativa, pendiente_pct_min, pendiente_pct_max').eq('sesion_id', sesionId).order('orden'),
    supabase.from('sesion_fase_grupos').select('id, bloque_id, repeticiones, orden').eq('sesion_id', sesionId).order('orden'),
  ])
  const d = {
    bloques: bloques || [],
    ejercicios: (bloques || []).flatMap(b => (b.sesion_ejercicios || []).slice().sort((a, z) => (a.orden ?? 0) - (z.orden ?? 0))),
    fases: fases || [], grupos: grupos || [], perfil: null,
  }
  cache.set(sesionId, { t: Date.now(), d })
  return d
}

const ESTADO = {
  completed: { txt: 'Completada', fg: '#15803d', bg: '#dcfce7' },
  partial:   { txt: 'Parcial',    fg: '#b45309', bg: '#fef3c7' },
  missed:    { txt: 'No la hizo', fg: '#b91c1c', bg: '#fee2e2' },
}

function Metrica({ label, valor, max, color }) {
  if (valor == null || valor === '') return null
  return (
    <div style={{ flex: 1, minWidth: 0, background: 'var(--bg2)', borderRadius: 7, padding: '3px 6px' }}>
      <div style={{ fontSize: 9, color: T.ink3, textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: color || T.ink, lineHeight: 1.2 }}>{valor}{max ? <span style={{ fontSize: 9.5, fontWeight: 500, color: T.ink3 }}>/{max}</span> : null}</div>
    </div>
  )
}

function BloqueFeedback({ sesion, fb }) {
  const d = fb?.data || null
  const fecha = sesion.fecha ? parseISO(String(sesion.fecha).slice(0, 10)) : null
  if (!d) {
    const futura = !fecha || isAfter(fecha, startOfDay(new Date()))
    return <div style={{ fontSize: 11.5, color: T.ink3, background: 'var(--bg2)', borderRadius: 8, padding: '7px 9px' }}>{futura ? '⏳ Aún no le toca: sin feedback' : '— Feedback no realizado'}</div>
  }
  const est = ESTADO[d.completion?.status]
  const rpe = d.rpe?.value
  const coms = comentariosDeFeedback(fb, sesion)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {est && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: est.bg, color: est.fg }}>{est.txt}</span>}
        {fb.submitted_at && <span style={{ fontSize: 10, color: T.ink3 }}>enviado {format(new Date(fb.submitted_at), "d MMM · HH:mm", { locale: es })}</span>}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <Metrica label="RPE" valor={rpe} max={10} color={rpe >= 8 ? '#dc2626' : rpe >= 6 ? '#ca8a04' : undefined} />
        <Metrica label="Duración" valor={d.duration?.minutes ? d.duration.minutes + "'" : null} />
        <Metrica label="Sueño" valor={d.sueno?.value} max={5} />
        <Metrica label="Recuperación" valor={d.tqr?.value} max={10} />
      </div>
      {coms.map((c, i) => {
        const x = TIPOS_COM[c.tipo] || TIPOS_COM.general
        return (
          <div key={i} style={{ borderLeft: `3px solid ${x.color}`, background: c.tipo === 'molestia' && c.intensidad >= 5 ? '#fef2f2' : 'transparent', padding: '1px 0 1px 7px' }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: x.color }}>{x.icono} {x.label}{c.intensidad != null ? ` · ${c.intensidad}/10` : ''}</div>
            <div style={{ fontSize: 10.5, color: T.ink2, lineHeight: 1.35 }}>{c.texto}</div>
          </div>
        )
      })}
      {!coms.length && <div style={{ fontSize: 10.5, color: T.ink3 }}>Sin comentarios escritos.</div>}
    </div>
  )
}

export function PopupSesionHost() {
  const [p, setP] = useState(actual)
  const [detalle, setDetalle] = useState(null)
  const ref = useRef(null)
  useEffect(() => { const f = v => setP(v); oyentes.add(f); return () => { oyentes.delete(f) } }, [])
  useEffect(() => {
    if (!p) return
    let vivo = true
    setDetalle(null)
    cargarDetalle(p.sesion.id).then(d => { if (vivo) setDetalle(d) }).catch(() => { if (vivo) setDetalle({ error: true }) })
    return () => { vivo = false }
  }, [p])
  // Se cierra si se desplaza la página, pero no al hacer scroll dentro del propio pop-up
  useEffect(() => { const f = e => { if (ref.current && ref.current.contains(e.target)) return; ocultarPopupSesion(true) }; window.addEventListener('scroll', f, true); return () => window.removeEventListener('scroll', f, true) }, [])
  if (!p) return null
  const { sesion, fb, onAbrir, r } = p
  const izq = r.right + 8 + ANCHO > window.innerWidth - 8 ? Math.max(8, r.left - ANCHO - 8) : r.right + 8
  const maxH = Math.min(520, window.innerHeight - 24)
  const top = Math.max(12, Math.min(r.top - 8, window.innerHeight - maxH - 12))
  const fecha = sesion.fecha ? parseISO(String(sesion.fecha).slice(0, 10)) : null
  const titulo = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, color: T.ink }}>{sesion.titulo || 'Sesión'}</div>
        <div style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>
          <span style={{ textTransform: 'capitalize' }}>{fecha ? format(fecha, "EEEE d MMM", { locale: es }) : 'Sin fecha'}</span>
          {sesion.duracion_min ? ` · ${sesion.duracion_min} min` : ''}
          {sesion.tipo_sesion === 'opcional' ? ' · Opcional' : ''}
          {sesion._prevista ? ` · prevista el ${format(parseISO(sesion._prevista), 'd MMM', { locale: es })}` : ''}
        </div>
      </div>
    </div>
  )
  const seccion = (txt, extra) => <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: T.ink3, display: 'flex', alignItems: 'center', gap: 6 }}>{txt}{extra}</div>
  return (
    <div ref={ref} onMouseEnter={mantener} onMouseLeave={() => ocultarPopupSesion()}
      style={{ position: 'fixed', left: izq, top, width: ANCHO, maxHeight: maxH, zIndex: 900, display: 'flex', flexDirection: 'column', background: 'var(--bg, #fff)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 34px rgba(0,0,0,.16)', overflow: 'hidden', fontFamily: 'var(--font)' }}>
      <div style={{ padding: '9px 12px 7px', borderBottom: '1px solid var(--border)' }}>{titulo}</div>
      <div className="popup-ses-cuerpo" style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '8px 12px 9px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {seccion('Sesión', fb ? <button onClick={() => ref.current?.querySelector('#popup-ses-fb')?.scrollIntoView({ block: 'start', behavior: 'smooth' })} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer', padding: 0, textTransform: 'none', letterSpacing: 0 }}>Ir al feedback ↓</button> : null)}
        {sesion.objetivo && <div style={{ fontSize: 10.5, color: T.ink2, lineHeight: 1.35, fontStyle: 'italic' }}>{sesion.objetivo}</div>}
        <div style={{ zoom: 0.84 }}><DetalleSesion T={T} detalle={detalle} /></div>
        <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
        <div id="popup-ses-fb">{seccion('Feedback del cliente')}</div>
        <BloqueFeedback sesion={sesion} fb={fb} />
      </div>
      {onAbrir && (
        <button onClick={() => { ocultarPopupSesion(true); onAbrir(sesion) }}
          style={{ border: 'none', borderTop: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--accent)', fontSize: 11.5, fontWeight: 600, padding: '7px', cursor: 'pointer', fontFamily: 'inherit' }}>
          Abrir en el editor →
        </button>
      )}
    </div>
  )
}
