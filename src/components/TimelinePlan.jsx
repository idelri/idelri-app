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
  not: { label: 'Notas',           color: '#64748b', bg: '#eef1f5', soft: '#f7f8fa', icono: '✎' },
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
function EditorContenidos({ abierto, onCerrar, items, sugerencias, onAnadir, onQuitar, modoSemana, catGrupos = [], catEtiquetas = [], tipoPlan }) {
  const [texto, setTexto] = useState('')
  const [alcance, setAlcance] = useState(modoSemana ? 'ses_semana' : 'dia')
  // Navegación: grupo general → grupo de categorías → etiquetas
  const secciones = useMemo(() => {
    const m = new Map(); catGrupos.forEach(g => { const key = g._seccion?.id || 'sin'; if (!m.has(key)) m.set(key, { id: key, nombre: g._seccion?.nombre || 'Otros', color: g._seccion?.color || '#64748b', grupos: [] }); m.get(key).grupos.push(g) })
    return [...m.values()].filter(x => x.grupos.some(g => catEtiquetas.some(e => e.grupo_id === g.id)))
  }, [catGrupos, catEtiquetas])
  const secPorTipo = () => { const t = (tipoPlan || '').toLowerCase(); const want = /deport|resist|carrera/.test(t) ? /resist/i : /salud|fuerza/.test(t) ? /fuerza/i : null; return want ? secciones.find(x => want.test(x.nombre))?.id : null }
  const [secSel, setSecSel] = useState(() => { try { return localStorage.getItem('tlContSec') || null } catch { return null } })
  const [grupoAbierto, setGrupoAbierto] = useState(() => { try { return localStorage.getItem('tlContGrupo') || null } catch { return null } })
  const [verOtros, setVerOtros] = useState(false)
  const ref = useRef(null)
  useEffect(() => { setTexto(''); setAlcance(modoSemana ? 'ses_semana' : 'dia') }, [abierto?.clave, modoSemana])
  useEffect(() => {
    if (!abierto) return
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onCerrar() }
    const t = setTimeout(() => document.addEventListener('mousedown', fn), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fn) }
  }, [abierto, onCerrar])
  if (!abierto) return null
  const sec = secciones.find(x => x.id === secSel) || secciones.find(x => x.id === secPorTipo()) || secciones[0]
  const elegirSec = id => { setSecSel(id); try { localStorage.setItem('tlContSec', id) } catch {} }
  const abrirGrupo = id => { const v = grupoAbierto === id ? null : id; setGrupoAbierto(v); try { localStorage.setItem('tlContGrupo', v || '') } catch {} }
  const enviar = (t, et) => { const v = (t ?? texto).trim(); if (!v) return; onAnadir(v, alcance, et); setTexto('') }
  const yaEsta = n => items.some(i => i.texto.toLowerCase() === n.toLowerCase())
  const q = texto.trim().toLowerCase()
  const coincidencias = q ? catEtiquetas.filter(e => e.nombre.toLowerCase().includes(q)).slice(0, 12) : []
  const sug = sugerencias.filter(x => !catEtiquetas.some(e => e.nombre.toLowerCase() === x.toLowerCase()) && !yaEsta(x) && (!q || x.toLowerCase().includes(q))).slice(0, 14)
  const left = Math.min(abierto.x, window.innerWidth - 350), top = Math.max(10, Math.min(abierto.y, window.innerHeight - 520))
  const opciones = modoSemana
    ? [['ses_semana', 'Días con sesión'], ['semana', 'Toda la semana']]
    : [['dia', 'Este día'], ['ses_semana', 'Días con sesión'], ['semana', 'Toda la semana']]
  const FilaEt = ({ e, sub }) => {
    const esta = yaEsta(e.nombre)
    return (
      <div onClick={() => !esta && enviar(e.nombre, e)} title={esta ? 'Ya está' : 'Añadir'}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 6px', paddingLeft: sub ? 22 : 6, borderRadius: 6, cursor: esta ? 'default' : 'pointer', opacity: esta ? .45 : 1 }}
        onMouseEnter={ev => { if (!esta) ev.currentTarget.style.background = 'var(--bg2)' }} onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
        <span style={{ width: sub ? 7 : 9, height: sub ? 7 : 9, borderRadius: 2, background: e.color || '#94a3b8', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: sub ? 11.5 : 12, color: sub ? 'var(--text2)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nombre}</span>
        {esta ? <span style={{ fontSize: 10, color: 'var(--text3)' }}>✓</span> : <span style={{ fontSize: 12, color: 'var(--text3)' }}>+</span>}
      </div>
    )
  }
  const tit = { fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', margin: '0 0 4px' }
  return (
    <div ref={ref} style={{ position: 'fixed', left, top, width: 336, maxHeight: 'calc(100vh - 20px)', display: 'flex', flexDirection: 'column', zIndex: 80, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.16)', fontFamily: 'var(--font)' }}>
      <div style={{ padding: '11px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{abierto.titulo.charAt(0).toUpperCase() + abierto.titulo.slice(1)}</div>
            {abierto.plan && <div style={{ fontSize: 10.5, color: 'var(--text3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Plan · {abierto.plan}</div>}
          </div>
          <button onClick={onCerrar} style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
        </div>
        {/* Lo que ya hay */}
        <div style={{ marginTop: 8 }}>
          {items.length ? items.map(i => (
            <div key={i.texto} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '2px 0' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: i.color || colorContenido(i.texto), flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.texto}</span>
              <button onClick={() => onQuitar(i.ids)} title="Quitar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text3)', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>
          )) : <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>Todavía no hay contenidos.</div>}
        </div>
      </div>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input autoFocus value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') onCerrar() }}
            placeholder="Buscar o escribir uno nuevo…" style={{ flex: 1, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, fontFamily: 'inherit', background: 'var(--bg)' }} />
          <button onClick={() => enviar()} disabled={!texto.trim()} style={{ padding: '0 11px', borderRadius: 8, border: 'none', background: texto.trim() ? 'var(--accent)' : 'var(--bg3)', color: '#fff', fontWeight: 600, fontSize: 12, cursor: texto.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>Añadir</button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {opciones.map(([v, l]) => (
            <button key={v} onClick={() => setAlcance(v)} style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${alcance === v ? 'var(--accent)' : 'var(--border)'}`, background: alcance === v ? 'var(--accent-light)' : 'transparent', color: alcance === v ? 'var(--accent-text)' : 'var(--text2)', fontWeight: alcance === v ? 600 : 400 }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowY: 'auto', padding: '8px 8px 10px', minHeight: 0 }}>
        {q ? (<>
          {coincidencias.length > 0 && <div style={{ ...tit, padding: '0 6px' }}>De tus categorías</div>}
          {coincidencias.map(e => <FilaEt key={e.id} e={e} sub={!!e.padre_id} />)}
          {sug.length > 0 && <div style={{ ...tit, padding: '6px 6px 0' }}>Usados en este plan</div>}
          {sug.map(x => <FilaEt key={x} e={{ id: x, nombre: x, color: colorContenido(x) }} />)}
          {!coincidencias.length && !sug.length && <div style={{ fontSize: 11.5, color: 'var(--text3)', padding: '2px 6px' }}>Pulsa «Añadir» para crear «{texto.trim()}».</div>}
        </>) : (<>
          {secciones.length > 0 && (
            <div style={{ display: 'flex', gap: 4, padding: '0 4px 8px', flexWrap: 'wrap' }}>
              {secciones.map(x => {
                const on = sec?.id === x.id
                return <button key={x.id} onClick={() => elegirSec(x.id)} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: `1px solid ${on ? x.color : 'var(--border)'}`, background: on ? x.color + '18' : 'transparent', color: on ? x.color : 'var(--text3)' }}>{x.nombre}</button>
              })}
            </div>
          )}
          {sec && sec.grupos.map(g => {
            const ets = catEtiquetas.filter(e => e.grupo_id === g.id)
            if (!ets.length) return null
            const abiertoG = grupoAbierto === g.id || sec.grupos.filter(x => catEtiquetas.some(e => e.grupo_id === x.id)).length === 1
            const padres = ets.filter(e => !e.padre_id)
            const nUsadas = ets.filter(e => yaEsta(e.nombre)).length
            return (
              <div key={g.id} style={{ borderTop: '1px solid var(--border)' }}>
                <div onClick={() => abrirGrupo(g.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 6px', cursor: 'pointer' }}>
                  <span style={{ fontSize: 8, color: 'var(--text3)', transform: abiertoG ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{g.nombre}</span>
                  {nUsadas > 0 && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{nUsadas} ✓</span>}
                  <span style={{ fontSize: 10, color: 'var(--text3)' }}>{padres.length}</span>
                </div>
                {abiertoG && <div style={{ paddingBottom: 6 }}>
                  {padres.map(e => [<FilaEt key={e.id} e={e} />, ...ets.filter(x => x.padre_id === e.id).map(sb => <FilaEt key={sb.id} e={sb} sub />)])}
                </div>}
              </div>
            )
          })}
          {sug.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <div onClick={() => setVerOtros(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 6px', cursor: 'pointer' }}>
                <span style={{ fontSize: 8, color: 'var(--text3)', transform: verOtros ? 'rotate(90deg)' : 'none' }}>▶</span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Otros usados en este plan</span>
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{sug.length}</span>
              </div>
              {verOtros && sug.map(x => <FilaEt key={x} e={{ id: x, nombre: x, color: colorContenido(x) }} />)}
            </div>
          )}
        </>)}
      </div>
    </div>
  )
}

// Editor flotante de textos (notas del día y textos de la semana)
function EditorTexto({ cfg, onCerrar }) {
  const [vals, setVals] = useState({})
  const [vis, setVis] = useState('entrenadora')
  const ref = useRef(null)
  useEffect(() => { if (cfg) { setVals(Object.fromEntries(cfg.campos.map(c => [c.key, c.valor || '']))); setVis(cfg.vis || 'entrenadora') } }, [cfg])
  useEffect(() => {
    if (!cfg) return
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) onCerrar() }
    const t = setTimeout(() => document.addEventListener('mousedown', fn), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', fn) }
  }, [cfg, onCerrar])
  if (!cfg) return null
  const guardar = () => { cfg.onGuardar(Object.fromEntries(cfg.campos.map(c => [c.key, vals[c.key] ?? ''])), vis); onCerrar() }
  const left = Math.min(cfg.x, window.innerWidth - 370), top = Math.max(10, Math.min(cfg.y, window.innerHeight - 380))
  return (
    <div ref={ref} style={{ position: 'fixed', left, top, width: 356, zIndex: 85, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.16)', padding: 12, fontFamily: 'var(--font)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{cfg.titulo.charAt(0).toUpperCase() + cfg.titulo.slice(1)}</div>
          {cfg.sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{cfg.sub}</div>}
        </div>
        <button onClick={onCerrar} style={{ border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: 'var(--text3)', lineHeight: 1 }}>×</button>
      </div>
      {cfg.vis && (
        <div style={{ display: 'flex', padding: 2, gap: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', marginBottom: 8 }}>
          {[['cliente', '👁 La ve el cliente'], ['entrenadora', '🔒 Interna']].map(([v, l]) => (
            <button key={v} onClick={() => setVis(v)} style={{ flex: 1, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: vis === v ? 600 : 500, background: vis === v ? 'var(--surface)' : 'transparent', boxShadow: vis === v ? '0 1px 2px rgba(0,0,0,.1)' : 'none', color: vis === v ? 'var(--text)' : 'var(--text3)' }}>{l}</button>
          ))}
        </div>
      )}
      {cfg.campos.map((c, i) => (
        <div key={c.key} style={{ marginBottom: 8 }}>
          {c.label && <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 3 }}>{c.label}</div>}
          <textarea autoFocus={i === 0} value={vals[c.key] ?? ''} onChange={e => setVals(v => ({ ...v, [c.key]: e.target.value }))} placeholder={c.ph} rows={c.filas || 3}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar(); if (e.key === 'Escape') onCerrar() }}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, lineHeight: 1.45, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }} />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {cfg.onBorrar && <button onClick={() => { cfg.onBorrar(); onCerrar() }} style={{ border: 'none', background: 'transparent', color: '#b91c1c', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Eliminar</button>}
        <span style={{ flex: 1, fontSize: 10.5, color: 'var(--text3)' }}>⌘/Ctrl + Enter para guardar</span>
        <button onClick={onCerrar} className="btn btn-ghost btn-sm">Cancelar</button>
        <button onClick={guardar} className="btn btn-primary btn-sm">Guardar</button>
      </div>
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────────
export default function TimelinePlan({
  planificacion, bloques, subbloques, semanasAll, sesiones, competiciones, controles, notas, feedbacks,
  clienteNombre, onAbrirSesion, onNuevaSesion, onEditarBloque, onEditarSubbloque, onAbrirComp, onAbrirControl, onAbrirNota,
  onNuevoBloque, onNuevoSubbloque, onRecargar,
  modoDrag = 'mover', setModoDrag, onMoverItems, clipboard, onCopiar, onPegar, onEliminar, onNuevaCompeticion, onNuevaValoracion, onNuevaNota,
}) {
  const planIni = useMemo(() => parseISO(planificacion.fecha_inicio), [planificacion.fecha_inicio])
  const planFin = useMemo(() => parseISO(planificacion.fecha_fin), [planificacion.fecha_fin])
  const hoy = startOfDay(new Date())

  const [vision, setVision] = useState(() => { try { return localStorage.getItem('tlVision') || 'meso' } catch { return 'meso' } })
  const cambiarVision = v => { setVision(v); try { localStorage.setItem('tlVision', v) } catch {} }
  const [grupos, setGrupos] = useState({ cal: true, per: true, pla: true, pro: true, not: true })
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

  // Notas del día (sesion_notas): copia local para editar al momento
  const [notasLoc, setNotasLoc] = useState(notas || [])
  useEffect(() => { setNotasLoc(notas || []) }, [notas])
  // ── Índices por día ──
  const fbMap = useMemo(() => new Map((feedbacks || []).map(f => [f.sesion_id, f])), [feedbacks])
  const porDia = useMemo(() => {
    const m = new Map()
    const add = (fecha, tipo, item) => { if (!fecha) return; const kk = fecha.slice(0, 10); if (!m.has(kk)) m.set(kk, { ses: [], comps: [], ctrls: [], notas: [] }); m.get(kk)[tipo].push(item) }
    ;(sesiones || []).filter(s => s.fecha && !s.recurso).forEach(s => add(s.fecha, 'ses', s))
    ;(competiciones || []).forEach(c => add(c.fecha, 'comps', c))
    ;(controles || []).forEach(c => add(c.fecha, 'ctrls', c))
    ;(notasLoc || []).forEach(n => add(n.fecha, 'notas', n))
    m.forEach(v => v.ses.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''))))
    return m
  }, [sesiones, competiciones, controles, notasLoc])
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
  const contenidosPlan = pid => {
    const lista = agruparCont(contenidos.filter(c => c.planificacion_id === pid))
    const et = id => catEtiquetas.find(e => e.id === id)
    const gOrd = id => { const i = catGrupos.findIndex(g => g.id === id); return i < 0 ? 999 : i }
    const clave = (c, i) => {
      const e = c.etiqueta_id && et(c.etiqueta_id)
      if (!e) return [1000, 0, 0, i]
      const p = e.padre_id ? et(e.padre_id) : null
      return [gOrd(e.grupo_id), (p || e).orden ?? 0, p ? 1 + (e.orden ?? 0) : 0, i]
    }
    return lista.map((c, i) => ({ c, k: clave(c, i) })).sort((a, b) => { for (let j = 0; j < 4; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j]; return 0 })
      .map(({ c }) => infoCont(c))
  }
  // Datos de la etiqueta de un contenido: si es subcontenido, de qué etiqueta cuelga, y texto para el pop-up
  function infoCont(c) {
    const e = c.etiqueta_id && catEtiquetas.find(x => x.id === c.etiqueta_id)
    const padre = e?.padre_id ? catEtiquetas.find(x => x.id === e.padre_id) : null
    const g = e ? catGrupos.find(x => x.id === e.grupo_id) : null
    const ruta = [g?._seccion?.nombre, g?.nombre, padre?.nombre].filter(Boolean).join(' › ')
    return { ...c, _sub: !!padre, _padreId: padre?.id || null, _padreNombre: padre?.nombre || null, _info: c.texto + (ruta ? '\n' + ruta : '\nContenido libre (sin categoría)') + (padre ? '\nSubcontenido de ' + padre.nombre : '') }
  }
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
  // Filas de un contenido en unos días + sus subcontenidos (van anclados a él)
  const filasAncladas = (pid, c, diasL) => {
    const t = c.texto.trim().toLowerCase()
    return diasL.flatMap(d => contDia(d, pid).filter(x => x.texto.trim().toLowerCase() === t
      || (c.etiqueta_id && x.etiqueta_id && catEtiquetas.find(e => e.id === x.etiqueta_id)?.padre_id === c.etiqueta_id)))
  }
  // Mueve o copia filas de contenidos desplazando su fecha 'delta' días
  async function moverContenidos(filas, delta, modo) {
    if (!filas.length || (!delta && modo === 'mover')) return
    const nueva = r => k(addDays(parseISO(String(r.fecha).slice(0, 10)), delta))
    const yaEn = r => contenidos.some(x => x.id !== r.id && x.planificacion_id === r.planificacion_id && String(x.fecha).slice(0, 10) === nueva(r) && x.texto.trim().toLowerCase() === r.texto.trim().toLowerCase())
    if (modo === 'copiar') {
      const ins = filas.filter(r => !yaEn(r)).map(r => ({ planificacion_id: r.planificacion_id, fecha: nueva(r), texto: r.texto, color: r.color, etiqueta_id: r.etiqueta_id || null, orden: r.orden ?? 0 }))
      if (!ins.length) return
      const { data, error } = await supabase.from('planificacion_contenidos').insert(ins).select()
      if (error) { alert('No se pudo copiar: ' + error.message); return }
      setContenidos(cs => [...cs, ...(data || [])])
      return
    }
    const dup = filas.filter(yaEn).map(r => r.id)
    const mov = filas.filter(r => !dup.includes(r.id))
    setContenidos(cs => cs.filter(x => !dup.includes(x.id)).map(x => { const r = mov.find(y => y.id === x.id); return r ? { ...x, fecha: nueva(r) } : x }))
    if (dup.length) await supabase.from('planificacion_contenidos').delete().in('id', dup)
    const porFecha = new Map(); mov.forEach(r => { const f = nueva(r); if (!porFecha.has(f)) porFecha.set(f, []); porFecha.get(f).push(r.id) })
    for (const [f, ids] of porFecha) { const { error } = await supabase.from('planificacion_contenidos').update({ fecha: f }).in('id', ids); if (error) { alert('No se pudo mover: ' + error.message); break } }
  }
  // Quitar con opción de deshacer
  const [deshacer, setDeshacer] = useState(null) // { texto, filas }
  const timerDeshacer = useRef(null)
  async function quitarConDeshacer(filas, etiquetaTexto) {
    if (!filas.length) return
    await quitarContenido(filas.map(r => r.id))
    setDeshacer({ texto: etiquetaTexto, filas })
    clearTimeout(timerDeshacer.current); timerDeshacer.current = setTimeout(() => setDeshacer(null), 7000)
  }
  async function hacerDeshacer() {
    const d = deshacer; if (!d) return
    setDeshacer(null)
    const { data, error } = await supabase.from('planificacion_contenidos').insert(d.filas.map(r => ({ planificacion_id: r.planificacion_id, fecha: String(r.fecha).slice(0, 10), texto: r.texto, color: r.color, etiqueta_id: r.etiqueta_id || null, orden: r.orden ?? 0 }))).select()
    if (error) { alert('No se pudo deshacer: ' + error.message); return }
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
  // Altura extra de filas que acumulan cosas (se estira arrastrando su borde inferior)
  const [extraAlto, setExtraAlto] = useState(() => { try { return JSON.parse(localStorage.getItem('tlExtraAlto') || '{}') } catch { return {} } })
  const ex = clave => extraAlto[clave] || 0
  function iniciarEstirar(ev, clave) {
    ev.preventDefault()
    const y0 = ev.clientY, e0 = ex(clave)
    let v = e0
    const mover = e => { v = Math.max(0, Math.min(600, Math.round(e0 + e.clientY - y0))); setExtraAlto(x => ({ ...x, [clave]: v })) }
    const soltar = () => { window.removeEventListener('mousemove', mover); window.removeEventListener('mouseup', soltar); document.body.style.cursor = ''; setExtraAlto(x => { const n = { ...x, [clave]: v }; try { localStorage.setItem('tlExtraAlto', JSON.stringify(n)) } catch {} ; return n }) }
    window.addEventListener('mousemove', mover); window.addEventListener('mouseup', soltar)
    document.body.style.cursor = 'ns-resize'
  }
  const resetEstirar = clave => setExtraAlto(x => { const n = { ...x, [clave]: 0 }; try { localStorage.setItem('tlExtraAlto', JSON.stringify(n)) } catch {} ; return n })
  // Subcontenidos desplegados por plan y etiqueta padre ('pid|etiquetaId'); por defecto plegados
  const [subsAb, setSubsAb] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem('tlSubsAbiertos') || '[]')) } catch { return new Set() } })
  const guardarSubs = n => { try { localStorage.setItem('tlSubsAbiertos', JSON.stringify([...n])) } catch {} ; return n }
  const alternarSubs = (pid, eid) => setSubsAb(s0 => { const n = new Set(s0); const key = pid + '|' + eid; n.has(key) ? n.delete(key) : n.add(key); return guardarSubs(n) })
  const todosSubs = (pid, ids, abrir) => setSubsAb(s0 => { const n = new Set(s0); ids.forEach(id => abrir ? n.add(pid + '|' + id) : n.delete(pid + '|' + id)); return guardarSubs(n) })
  // Filas visibles de un plan: contenidos principales y, si su etiqueta está desplegada, sus subcontenidos
  const filasPlan = pid => {
    const conts = contenidosPlan(pid)
    const padres = new Set(conts.filter(c => !c._sub && c.etiqueta_id).map(c => c.etiqueta_id))
    const conSubs = [...new Set(conts.filter(c => c._sub && padres.has(c._padreId)).map(c => c._padreId))]
    const filas = conts.filter(c => !c._sub || !padres.has(c._padreId) || subsAb.has(pid + '|' + c._padreId))
      .map(c => ({ ...c, _nSubs: !c._sub && c.etiqueta_id ? conts.filter(x => x._padreId === c.etiqueta_id).length : 0, _subsAbiertos: subsAb.has(pid + '|' + c.etiqueta_id) }))
    return { filas, conSubs, todosAbiertos: conSubs.length > 0 && conSubs.every(id => subsAb.has(pid + '|' + id)) }
  }
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

  // ── Arrastrar / copiar elementos del calendario (sesiones, eventos, notas) y días de la cuadrícula ──
  // Sin estado de React durante el arrastre (las vistas se vuelven a montar en cada render): ref + clases en el DOM.
  const arrRef = useRef(null) // { clase: 'items', items } | { clase: 'dia', fecha }
  const editableCal = !!onMoverItems
  const limpiarDrop = () => document.querySelectorAll('.tl-drop-on').forEach(el => el.classList.remove('tl-drop-on'))
  // ── Selección múltiple (Ctrl/⌘+clic, Mayús+clic para un tramo, o la semana entera) ──
  const [sel, setSel] = useState(() => new Map()) // clave 'tipo:id' → item con _tipo
  const ultimoSel = useRef(null)
  const claveSel = (tipo, id) => tipo + ':' + id
  const fechaDeItem = it => String(it.fecha || '').slice(0, 10)
  const estaSel = (tipo, id) => sel.has(claveSel(tipo, id))
  const limpiarSel = () => setSel(new Map())
  useEffect(() => { const f = e => { if (e.key === 'Escape') setSel(m => m.size ? new Map() : m) }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [])
  // Clic sobre un elemento: true si se ha usado para seleccionar (y no hay que abrirlo)
  function clicSeleccion(e, item, tipo) {
    if (!editableCal) return false
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault(); e.stopPropagation()
      setSel(m => { const n = new Map(m); const kk = claveSel(tipo, item.id); n.has(kk) ? n.delete(kk) : n.set(kk, { ...item, _tipo: tipo }); return n })
      ultimoSel.current = { ...item, _tipo: tipo }
      return true
    }
    if (e.shiftKey && ultimoSel.current) {
      e.preventDefault(); e.stopPropagation()
      const a = fechaDeItem(ultimoSel.current), b = fechaDeItem(item)
      const [ini, fin] = a <= b ? [a, b] : [b, a]
      if (tipo === 'dia' || tipo === 'cont') {
        const nuevos = []
        for (let d = parseISO(ini); k(d) <= fin; d = addDays(d, 1)) {
          if (tipo === 'dia') nuevos.push({ id: k(d), fecha: k(d), _tipo: 'dia' })
          else { const filas = filasAncladas(item._pid, item._c, [d]); if (filas.some(r => r.texto.trim().toLowerCase() === item._c.texto.trim().toLowerCase())) nuevos.push({ ...item, id: `${item._pid}|${item._c.texto}|${k(d)}`, fecha: k(d), filas, _tipo: 'cont' }) }
        }
        setSel(m => { const n = new Map(m); nuevos.forEach(z => n.set(claveSel(tipo, z.id), z)); return n })
        return true
      }
      const lista = tipo === 'sesion' ? (sesiones || []).filter(z => z.fecha && !z.recurso) : tipo === 'nota' ? notasLoc : tipo === 'competicion' ? (competiciones || []) : (controles || [])
      setSel(m => { const n = new Map(m); lista.filter(z => { const f = fechaDeItem(z); return f >= ini && f <= fin }).forEach(z => n.set(claveSel(tipo, z.id), { ...z, _tipo: tipo })); return n })
      return true
    }
    if (sel.size) limpiarSel()
    return false
  }
  // Seleccionar todas las sesiones de unos días (semana entera); con Ctrl/⌘ se añaden a lo ya seleccionado
  function seleccionarSesionesDe(diasL, añadir) {
    const fs = new Set(diasL.map(k))
    setSel(m => {
      const n = añadir ? new Map(m) : new Map()
      ;(sesiones || []).filter(z => z.fecha && !z.recurso && fs.has(fechaDeItem(z))).forEach(z => n.set(claveSel('sesion', z.id), { ...z, _tipo: 'sesion' }))
      notasLoc.filter(z => fs.has(fechaDeItem(z))).forEach(z => n.set(claveSel('nota', z.id), { ...z, _tipo: 'nota' }))
      const porDiaPlan = new Map()
      contenidos.filter(c => fs.has(String(c.fecha).slice(0, 10))).forEach(c => { const kk = c.planificacion_id + '|*|' + String(c.fecha).slice(0, 10); if (!porDiaPlan.has(kk)) porDiaPlan.set(kk, []); porDiaPlan.get(kk).push(c) })
      porDiaPlan.forEach((filas, kk) => n.set(claveSel('cont', kk), { id: kk, fecha: String(filas[0].fecha).slice(0, 10), filas, _tipo: 'cont', texto: filas.map(f => f.texto).join(', ') }))
      return n
    })
  }
  const arrastrableItem = (item, tipo) => !editableCal ? {} : {
    draggable: true,
    onDragStart: e => {
      e.stopPropagation()
      const varios = sel.size > 1 && sel.has(claveSel(tipo, item.id))
      arrRef.current = varios ? { clase: 'items', items: [...sel.values()], ancla: { ...item, _tipo: tipo } } : { clase: 'items', items: [{ ...item, _tipo: tipo }] }
      e.dataTransfer.effectAllowed = 'copyMove'; try { e.dataTransfer.setData('text/plain', item.id) } catch {}
    },
    onDragEnd: () => { arrRef.current = null; limpiarDrop() },
  }
  // Mueve o copia una selección mezclada (sesiones, eventos, notas, contenidos y días) desplazándola 'delta' días
  async function moverSeleccion(items, delta, modo) {
    if (!delta && modo === 'mover') return
    const normales = items.filter(x => ['sesion', 'nota', 'competicion', 'control'].includes(x._tipo))
    if (normales.length) moverConDesplazamiento(normales, delta, modo)
    const filas = []; const vistos = new Set()
    items.filter(x => x._tipo === 'cont').forEach(x => (x.filas || []).forEach(r => { if (!vistos.has(r.id)) { vistos.add(r.id); filas.push(r) } }))
    if (filas.length) await moverContenidos(filas, delta, modo)
    const dias = items.filter(x => x._tipo === 'dia').map(x => x.fecha).sort()
    if (delta > 0) dias.reverse()
    for (const f of dias) await moverDia(f, k(addDays(parseISO(f), delta)), modo)
  }
  // Pegar / mover varios elementos conservando su separación en días respecto a una referencia
  function moverConDesplazamiento(items, delta, modo) {
    if (!delta && modo === 'mover') return
    const porFecha = new Map()
    items.forEach(it => { const f = k(addDays(parseISO(fechaDeItem(it)), delta)); if (!porFecha.has(f)) porFecha.set(f, []); porFecha.get(f).push(it) })
    porFecha.forEach((its, f) => onMoverItems(its, f, modo))
  }
  const [portaVarios, setPortaVarios] = useState(null) // varios elementos copiados
  function pegarVarios(d) {
    const its = portaVarios; if (!its?.length) return
    const base = its.map(fechaDeItem).sort()[0]
    moverSeleccion(its, differenceInCalendarDays(d, parseISO(base)), 'copiar')
  }
  async function eliminarSeleccion() {
    const its = [...sel.values()]; if (!its.length) return
    const nDias = its.filter(x => x._tipo === 'dia').length
    if (!window.confirm(`¿Eliminar ${its.length - nDias} elemento${its.length - nDias === 1 ? '' : 's'} seleccionado${its.length - nDias === 1 ? '' : 's'}?${nDias ? ' (Los días de la cuadrícula no se eliminan: se pueden mover o copiar.)' : ''} No se puede deshacer.`)) return
    const tablas = { sesion: 'sesiones', competicion: 'competiciones', control: 'controles', nota: 'sesion_notas' }
    for (const [tipo, tabla] of Object.entries(tablas)) {
      const ids = its.filter(x => x._tipo === tipo).map(x => x.id)
      if (ids.length) { const { error } = await supabase.from(tabla).delete().in('id', ids); if (error) { alert('No se pudo eliminar: ' + error.message); break } }
    }
    const filasC = [...new Set(its.filter(x => x._tipo === 'cont').flatMap(x => (x.filas || []).map(r => r.id)))]
    if (filasC.length) await quitarContenido(filasC)
    limpiarSel(); await onRecargar?.()
  }
  const modoDe = e => (e.altKey || modoDrag === 'copiar') ? 'copiar' : 'mover'
  // destino: fechaDe(item) → 'yyyy-MM-dd' donde cae cada elemento
  const destinoItems = fechaDe => !editableCal ? {} : {
    onDragOver: e => { if (arrRef.current?.clase !== 'items') return; e.preventDefault(); e.dataTransfer.dropEffect = modoDe(e) === 'copiar' ? 'copy' : 'move'; e.currentTarget.classList.add('tl-drop-on') },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('tl-drop-on') },
    onDrop: e => {
      const a = arrRef.current; if (a?.clase !== 'items') return
      e.preventDefault(); e.stopPropagation(); limpiarDrop(); arrRef.current = null
      const modo = modoDe(e)
      if (a.ancla) { // varios: todos se desplazan lo mismo que el que se arrastra
        const f = fechaDe(a.ancla); if (!f) return
        moverSeleccion(a.items, differenceInCalendarDays(parseISO(f), parseISO(fechaDeItem(a.ancla))), modo)
        limpiarSel(); return
      }
      const porFecha = new Map()
      a.items.forEach(it => { const f = fechaDe(it); if (!f || (modo === 'mover' && String(it.fecha).slice(0, 10) === f)) return; if (!porFecha.has(f)) porFecha.set(f, []); porFecha.get(f).push(it) })
      porFecha.forEach((its, f) => onMoverItems(its, f, modo))
    },
  }
  // Cuadrícula: mover / copiar un día entero (contenidos, notas y sesiones)
  async function moverDia(origen, destino, modo) {
    if (origen === destino) return
    const o = parseISO(origen)
    const conts = contenidos.filter(c => String(c.fecha).slice(0, 10) === origen)
    const x = dia(o)
    const items = [...x.ses.map(z => ({ ...z, _tipo: 'sesion' })), ...x.notas.map(z => ({ ...z, _tipo: 'nota' }))]
    if (!conts.length && !items.length) return
    if (items.length) onMoverItems?.(items, destino, modo)
    if (!conts.length) return
    const yaEn = (pid, t) => contenidos.some(c => c.planificacion_id === pid && String(c.fecha).slice(0, 10) === destino && c.texto.trim().toLowerCase() === t.trim().toLowerCase())
    if (modo === 'copiar') {
      const filas = conts.filter(c => !yaEn(c.planificacion_id, c.texto)).map(c => ({ planificacion_id: c.planificacion_id, fecha: destino, texto: c.texto, color: c.color, etiqueta_id: c.etiqueta_id || null, orden: c.orden ?? 0 }))
      if (!filas.length) return
      const { data, error } = await supabase.from('planificacion_contenidos').insert(filas).select()
      if (error) { alert('No se pudo copiar: ' + error.message); return }
      setContenidos(cs => [...cs, ...(data || [])])
    } else {
      const duplic = conts.filter(c => yaEn(c.planificacion_id, c.texto)).map(c => c.id)
      const mover = conts.filter(c => !duplic.includes(c.id)).map(c => c.id)
      setContenidos(cs => cs.filter(c => !duplic.includes(c.id)).map(c => mover.includes(c.id) ? { ...c, fecha: destino } : c))
      if (duplic.length) await supabase.from('planificacion_contenidos').delete().in('id', duplic)
      if (mover.length) { const { error } = await supabase.from('planificacion_contenidos').update({ fecha: destino }).in('id', mover); if (error) alert('No se pudo mover: ' + error.message) }
    }
  }
  const arrastrableDia = d => ({
    draggable: true,
    onDragStart: e => {
      const varios = sel.size > 1 && sel.has(claveSel('dia', k(d)))
      arrRef.current = varios ? { clase: 'items', items: [...sel.values()], ancla: { id: k(d), fecha: k(d), _tipo: 'dia' } } : { clase: 'dia', fecha: k(d) }
      e.dataTransfer.effectAllowed = 'copyMove'; try { e.dataTransfer.setData('text/plain', k(d)) } catch {}
    },
    onDragEnd: () => { arrRef.current = null; limpiarDrop() },
    onDragOver: e => { const a = arrRef.current; if (a?.clase !== 'dia' && !(a?.clase === 'items' && a.ancla)) return; e.preventDefault(); e.dataTransfer.dropEffect = modoDe(e) === 'copiar' ? 'copy' : 'move'; e.currentTarget.classList.add('tl-drop-on') },
    onDragLeave: e => e.currentTarget.classList.remove('tl-drop-on'),
    onDrop: e => {
      const a = arrRef.current; if (!a) return
      if (a.clase === 'items' && a.ancla) { e.preventDefault(); limpiarDrop(); arrRef.current = null; moverSeleccion(a.items, differenceInCalendarDays(d, parseISO(fechaDeItem(a.ancla))), modoDe(e)); limpiarSel(); return }
      if (a.clase !== 'dia') return
      e.preventDefault(); limpiarDrop(); arrRef.current = null; moverDia(a.fecha, k(d), modoDe(e))
    },
  })
  // Contenidos: arrastrar una píldora (con sus subcontenidos) a otro día / semana del mismo plan
  const arrastrableCont = (pid, filas, fechaOrigen, claveC) => ({
    draggable: true,
    onDragStart: e => {
      e.stopPropagation()
      const varios = claveC && sel.size > 1 && sel.has(claveSel('cont', claveC))
      arrRef.current = varios ? { clase: 'items', items: [...sel.values()], ancla: { id: claveC, fecha: k(fechaOrigen), _tipo: 'cont' } } : { clase: 'cont', pid, filas, origen: fechaOrigen }
      e.dataTransfer.effectAllowed = 'copyMove'; try { e.dataTransfer.setData('text/plain', 'cont') } catch {}
    },
    onDragEnd: () => { arrRef.current = null; limpiarDrop() },
  })
  const destinoCont = (pid, fechaDestino) => ({
    onDragOver: e => { const a = arrRef.current; if (!((a?.clase === 'cont' && a.pid === pid) || (a?.clase === 'items' && a.ancla))) return; e.preventDefault(); e.dataTransfer.dropEffect = modoDe(e) === 'copiar' ? 'copy' : 'move'; e.currentTarget.classList.add('tl-drop-on') },
    onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove('tl-drop-on') },
    onDrop: e => {
      const a = arrRef.current
      if (a?.clase === 'items' && a.ancla) { e.preventDefault(); e.stopPropagation(); limpiarDrop(); arrRef.current = null; moverSeleccion(a.items, differenceInCalendarDays(fechaDestino, parseISO(fechaDeItem(a.ancla))), modoDe(e)); limpiarSel(); return }
      if (a?.clase !== 'cont' || a.pid !== pid) return
      e.preventDefault(); e.stopPropagation(); limpiarDrop(); arrRef.current = null
      moverContenidos(a.filas, differenceInCalendarDays(fechaDestino, a.origen), modoDe(e))
    },
  })

  // Edición directa de km objetivo y nota en la cuadrícula
  const [semEdit, setSemEdit] = useState({})
  const semVal = (sem, f) => !sem ? null : (semEdit[sem.id] && f in semEdit[sem.id]) ? semEdit[sem.id][f] : sem[f]
  const [edTexto, setEdTexto] = useState(null) // { x, y, titulo, sub, campos, vis, onGuardar, onBorrar }
  const abrirEdTexto = (ev, cfg) => { const r = ev.currentTarget.getBoundingClientRect(); setEdTexto({ x: r.left, y: r.bottom + 6, ...cfg }) }
  async function crearNota(fecha, texto, vis) {
    if (!texto.trim() || !planificacion.cliente_id) return
    const { data, error } = await supabase.from('sesion_notas').insert({ cliente_id: planificacion.cliente_id, fecha, texto: texto.trim(), visibilidad: vis, orden: (dia(parseISO(fecha)).notas || []).length }).select().single()
    if (error) { alert('No se pudo guardar la nota: ' + error.message); return }
    setNotasLoc(ns => [...ns, data])
  }
  async function actualizarNota(n, campos) {
    setNotasLoc(ns => ns.map(x => x.id === n.id ? { ...x, ...campos } : x))
    const { error } = await supabase.from('sesion_notas').update(campos).eq('id', n.id)
    if (error) alert('No se pudo guardar la nota: ' + error.message)
  }
  async function borrarNota(n) {
    if (!window.confirm('¿Eliminar esta nota?')) return
    setNotasLoc(ns => ns.filter(x => x.id !== n.id))
    await supabase.from('sesion_notas').delete().eq('id', n.id)
  }
  const editarNotaDia = (ev, n) => abrirEdTexto(ev, {
    titulo: format(parseISO(String(n.fecha).slice(0, 10)), "EEEE d 'de' MMMM", { locale: es }), sub: 'Nota del día',
    campos: [{ key: 'texto', valor: n.texto, ph: 'Escribe la nota…', filas: 5 }], vis: n.visibilidad === 'cliente' ? 'cliente' : 'entrenadora',
    onGuardar: (v, vis) => { if (!v.texto.trim()) return borrarNota(n); actualizarNota(n, { texto: v.texto.trim(), visibilidad: vis }) }, onBorrar: () => borrarNota(n),
  })
  const nuevaNotaDia = (ev, d, vis) => abrirEdTexto(ev, {
    titulo: format(d, "EEEE d 'de' MMMM", { locale: es }), sub: 'Nueva nota del día',
    campos: [{ key: 'texto', valor: '', ph: 'Escribe la nota…', filas: 5 }], vis,
    onGuardar: (v, vis2) => crearNota(k(d), v.texto, vis2),
  })
  const editarSemanaCliente = (ev, l, sem) => abrirEdTexto(ev, {
    titulo: `Semana ${numSemana(l) || ''} · ${format(l, 'd MMM', { locale: es })} – ${format(addDays(l, 6), 'd MMM', { locale: es })}`, sub: '👁 Lo ve el cliente en su semana',
    campos: [
      { key: 'objetivo', label: 'Texto de la semana', valor: semVal(sem, 'objetivo') || '', ph: 'Título: explicación de la semana…', filas: 6 },
      { key: 'nota_cliente', label: 'Nota destacada (sale resaltada)', valor: semVal(sem, 'nota_cliente') || '', ph: 'Opcional', filas: 2 },
    ],
    onGuardar: v => guardarSemana(sem, { objetivo: v.objetivo.trim() || null, nota_cliente: v.nota_cliente.trim() || null }),
  })
  const editarSemanaInterna = (ev, l, sem) => abrirEdTexto(ev, {
    titulo: `Semana ${numSemana(l) || ''} · ${format(l, 'd MMM', { locale: es })} – ${format(addDays(l, 6), 'd MMM', { locale: es })}`, sub: '🔒 Nota interna (solo tú)',
    campos: [{ key: 'notas', valor: semVal(sem, 'notas') || '', ph: 'Nota interna de la semana…', filas: 5 }],
    onGuardar: v => guardarSemana(sem, { notas: v.notas.trim() || null }),
  })
  async function guardarSemana(sem, campos) {
    if (!sem?.id) return
    setSemEdit(x => ({ ...x, [sem.id]: { ...(x[sem.id] || {}), ...campos } }))
    const { error } = await supabase.from('semanas').update(campos).eq('id', sem.id)
    if (error) alert('No se pudo guardar la semana: ' + error.message)
  }

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
      {editableCal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {sel.size > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '3px 4px 3px 9px', borderRadius: 8, background: 'var(--accent)', color: '#fff' }}>
              <b>{sel.size} seleccionada{sel.size === 1 ? '' : 's'}</b>
              <button onClick={() => { setPortaVarios([...sel.values()]); onCopiar?.(null); limpiarSel() }} title="Copiar: luego pulsa 📋 en el día donde quieras que empiece" style={btnSel}>⧉ Copiar</button>
              <button onClick={eliminarSeleccion} title="Eliminar las seleccionadas" style={btnSel}>🗑</button>
              <button onClick={limpiarSel} title="Quitar la selección (Esc)" style={btnSel}>✕</button>
            </span>
          )}
          {portaVarios?.length > 0 && !sel.size && (
            <span title="Pulsa 📋 en el día donde quieras que empiece: se pegan en el mismo orden" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-text)' }}>
              📋 {portaVarios.length} copiada{portaVarios.length === 1 ? '' : 's'}
              <span onClick={() => setPortaVarios(null)} style={{ cursor: 'pointer', opacity: .7 }} title="Vaciar">×</span>
            </span>
          )}
          {clipboard && (
            <span title="Pulsa 📋 en un día para pegarla" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 8px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent-text)', maxWidth: 220 }}>
              📋 <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{clipboard.titulo || clipboard.nombre || clipboard.texto || 'Copiado'}</span>
              <span onClick={() => onCopiar?.(null)} style={{ cursor: 'pointer', opacity: .7 }} title="Vaciar">×</span>
            </span>
          )}
          <div title="Qué hace arrastrar. Con la tecla Alt pulsada al soltar, siempre copia." style={{ display: 'flex', padding: 2, gap: 2, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)' }}>
            {[['mover', '↔ Mover'], ['copiar', '⧉ Copiar']].map(([v, l]) => (
              <button key={v} onClick={() => setModoDrag?.(v)} style={{ height: 26, padding: '0 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: modoDrag === v ? 600 : 500, background: modoDrag === v ? 'var(--surface)' : 'transparent', boxShadow: modoDrag === v ? '0 1px 2px rgba(0,0,0,.1)' : 'none', color: modoDrag === v ? 'var(--text)' : 'var(--text3)' }}>{l}</button>
            ))}
          </div>
        </div>
      )}
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
      <style>{`.tl-celda-ses .tl-mas,.tl-cont .tl-mas-cont{opacity:0;transition:opacity .15s}.tl-celda-ses:hover .tl-mas,.tl-cont:hover .tl-mas-cont{opacity:1}.tl-cont:hover{background:rgba(193,143,5,.08)}.tl-hueco{opacity:.35;transition:opacity .15s}.tl-hueco:hover{opacity:1;background:rgba(207,70,70,.06)!important}.tl-asa{opacity:.6}.tl-asa:hover{opacity:1}.tl-drop-on{outline:2px dashed var(--accent)!important;outline-offset:-2px;background:rgba(45,106,79,.07)!important}.tl-tarj .tl-acc{opacity:0;transition:opacity .12s}.tl-tarj:hover .tl-acc{opacity:1}.tl-ev .tl-mas{opacity:0}.tl-ev:hover .tl-mas{opacity:1}.tl-estirar .tl-grip{opacity:.35;transition:opacity .12s}.tl-estirar:hover .tl-grip{opacity:1;background:var(--accent)!important}.tl-pild .tl-x{opacity:0;transition:opacity .12s}.tl-pild:hover .tl-x{opacity:1}`}</style>
      {deshacer && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 90, display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderRadius: 10, background: '#1f2a24', color: '#fff', fontSize: 12.5, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
          <span>Quitado {deshacer.texto}{deshacer.filas.length > 1 ? ` (${deshacer.filas.length})` : ''}</span>
          <button onClick={hacerDeshacer} style={{ border: 'none', background: 'transparent', color: '#8fd3b0', fontWeight: 700, cursor: 'pointer', fontSize: 12.5, fontFamily: 'inherit' }}>Deshacer</button>
          <span onClick={() => setDeshacer(null)} style={{ cursor: 'pointer', opacity: .6 }}>×</span>
        </div>
      )}
      <EditorTexto cfg={edTexto} onCerrar={() => setEdTexto(null)} />
      <EditorContenidos abierto={editorCont} onCerrar={() => setEditorCont(null)} items={itemsEditor} sugerencias={sugerencias}
        onAnadir={anadirContenido} onQuitar={quitarContenido} modoSemana={!!editorCont?.modoSemana} catGrupos={catGrupos} catEtiquetas={catEtiquetas} tipoPlan={planes.find(x => x.id === editorCont?.planId)?.tipo} />
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
                {datosSemana.map(s => {
                  const lista = s.dias.flatMap(x => x.ses)
                  const caben = Math.max(1, Math.floor((COL - 6) / 15) * 2)
                  return (
                    <div key={k(s.d)} {...destinoItems(it => { const off = differenceInCalendarDays(parseISO(String(it.fecha).slice(0, 10)), lunes(parseISO(String(it.fecha).slice(0, 10)))); return k(addDays(s.d, off)) })}
                      onClick={e => { if (editableCal && (e.metaKey || e.ctrlKey || e.shiftKey)) seleccionarSesionesDe(Array.from({ length: 7 }, (_, i) => addDays(s.d, i)), true) }}
                      title={editableCal ? 'Arrastra una sesión a otra semana: cae el mismo día de la semana\nCtrl/⌘+clic en un icono: seleccionar varias · Ctrl/⌘+clic en el hueco: toda la semana' : ''}
                      style={{ width: COL - 3, margin: '0 1.5px', minHeight: 36, padding: '3px 0', display: 'flex', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'center', gap: 2, borderRadius: 6 }}>
                      {lista.length <= caben
                        ? lista.map(z => <span key={z.id} {...arrastrableItem(z, 'sesion')} onClick={e => { e.stopPropagation(); if (!clicSeleccion(e, z, 'sesion')) onAbrirSesion?.(z) }} title={`${format(parseISO(String(z.fecha).slice(0, 10)), 'EEE d', { locale: es })} · ${z.titulo || 'Sesión'}`}
                            style={{ boxShadow: estaSel('sesion', z.id) ? '0 0 0 2px var(--accent)' : 'none', width: 13, height: 15, borderRadius: 4, background: z.tipo_sesion === 'opcional' ? 'transparent' : GRUPOS.pro.color + '22', border: `1px ${z.tipo_sesion === 'opcional' ? 'dashed' : 'solid'} ${GRUPOS.pro.color}66`, fontSize: 8.5, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: editableCal ? 'grab' : 'pointer' }}>{iconoSesion(z)}</span>)
                        : lista.length > 0 && <span style={{ minWidth: 20, height: 20, padding: '0 4px', borderRadius: 6, background: GRUPOS.pro.color + 'cc', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{lista.length}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {grupos.not && ['cliente', 'entrenadora'].map(vis => <FilaNotasMacro key={vis} vis={vis} semanasCols={semanasCols} COL={COL} W={W} />)}
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
    const usadas = gColor ? catEtiquetas.filter(e => e.grupo_id === gColor.id && !e.padre_id && contenidos.some(c => c.etiqueta_id === e.id)) : []
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
          <style>{`table.tl-cuad{width:auto!important;margin:0}.tl-inl{font:inherit;font-size:11.5px;color:var(--text);border:1px solid transparent;background:transparent;border-radius:5px;padding:3px 5px;-moz-appearance:textfield}.tl-inl::-webkit-inner-spin-button{-webkit-appearance:none}.tl-inl:hover{border-color:var(--border)}.tl-inl:focus{outline:none;border-color:var(--accent);background:var(--surface)}.tl-inl::placeholder{color:var(--text3)}.tl-cuad th,.tl-cuad td{border:none;background:none;padding:0;height:auto;font-family:inherit;text-transform:none;letter-spacing:0}.tl-cuad thead th{font-size:10px;color:var(--text3);font-weight:600;padding-bottom:3px}`}</style>
          <table className="tl-cuad" style={{ borderCollapse: 'separate', borderSpacing: 3, fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                <th style={{ width: 22 }} /><th style={{ textAlign: 'left', padding: '0 4px' }}>SEM.</th><th />
                {DIAS.map(dd => <th key={dd} style={{ fontWeight: 600 }}>{dd.slice(0, 1)}</th>)}
                <th style={{ textAlign: 'right', padding: '0 6px' }}>KM OBJ.</th><th style={{ textAlign: 'left', padding: '0 8px' }} title="El texto de la semana que ve el cliente en su vista semanal">👁 TEXTO PARA EL CLIENTE</th><th style={{ textAlign: 'left', padding: '0 8px' }} title="Solo la ves tú">🔒 NOTA INTERNA</th>
              </tr>
            </thead>
            <tbody>
              {semanas.map((l, wi) => {
                const b = bloqueDe(addDays(l, 3))
                const primeraDelBloque = b && (wi === 0 || bloqueDe(addDays(semanas[wi - 1], 3))?.id !== b.id)
                const nFilas = b ? semanas.filter(x => bloqueDe(addDays(x, 3))?.id === b.id).length : 1
                const sem = semanaPorLunes.get(k(l))
                const semE = (sem?.id && semEdit[sem.id]) || {}
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
                      const ccTodos = delGrupo(d, gColor), cod = delGrupo(d, gCod)
                      const principales = ccTodos.filter(c => !etiq(c.etiqueta_id)?.padre_id)
                      const padresSub = [...new Set(ccTodos.filter(c => etiq(c.etiqueta_id)?.padre_id).map(c => etiq(c.etiqueta_id).padre_id))].map(id => etiq(id)).filter(Boolean)
                      const cc = principales.length ? principales : padresSub.slice(0, 1).map(e => ({ id: e.id, etiqueta_id: e.id, texto: e.nombre, color: e.color }))
                      const secund = [...cc.slice(1).map(c => etiq(c.etiqueta_id)), ...padresSub.filter(e => !cc.some(c => c.etiqueta_id === e.id))].filter(Boolean)
                      const col = cc[0] ? (etiq(cc[0].etiqueta_id)?.color || cc[0].color) : null
                      const x = dia(d)
                      const todos = agruparCont(contDia(d))
                      const tip = [format(d, "EEEE d 'de' MMMM", { locale: es }), ...todos.map(c => '· ' + c.texto), ...x.notas.map(n => '📝 ' + n.texto), ...x.ses.map(z => '◉ ' + (z.titulo || 'Sesión'))].join('\n')
                      const claro = col && (() => { const n = parseInt(col.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 165 })()
                      const pid = (planesVisibles(d, d)[0] || planificacion).id
                      return (
                        <td key={k(d)} style={{ padding: 0 }}>
                          <div onClick={ev => { if (!clicSeleccion(ev, { id: k(d), fecha: k(d) }, 'dia')) abrirEditorDia(ev, d, pid) }} title={tip + (editableCal ? '\n\nArrastra a otro día para mover el día entero (Alt: copiar)' : '')} {...(editableCal ? arrastrableDia(d) : {})}
                            style={{ width: CW, height: CHh, borderRadius: 5, background: col || (todos.length || x.notas.length ? 'var(--bg3)' : 'var(--bg2)'), color: claro ? '#18232b' : '#fff', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, fontSize: 11, fontWeight: 800, outline: estaSel('dia', k(d)) ? '3px solid var(--accent)' : isSameDay(d, hoy) ? `2px solid ${GRUPOS.cal.color}` : 'none', outlineOffset: 1 }}>
                            {cc[0] && <span style={{ opacity: .9 }}>{codigoEtiqueta(cc[0].texto).charAt(0)}</span>}
                            {cod.slice(0, 2).map(c => <span key={c.id} style={{ fontSize: 10, padding: '0 2px', borderRadius: 3, background: col ? 'rgba(0,0,0,.2)' : 'transparent', color: col ? 'inherit' : 'var(--text2)' }}>{codigoEtiqueta(c.texto)}</span>)}
                            {secund[0] && <span title={'Secundario: ' + secund.map(e => e.nombre).join(', ')} style={{ position: 'absolute', left: 0, top: 0, borderStyle: 'solid', borderWidth: '10px 10px 0 0', borderColor: `${secund[0].color} transparent transparent transparent`, borderRadius: '5px 0 0 0' }} />}
                            {secund[1] && <span style={{ position: 'absolute', right: 0, top: 0, borderStyle: 'solid', borderWidth: '0 10px 10px 0', borderColor: `transparent ${secund[1].color} transparent transparent`, borderRadius: '0 5px 0 0' }} />}
                            {x.notas.length > 0 && <span style={{ position: 'absolute', right: 3, bottom: 3, width: 4, height: 4, borderRadius: 9, background: col ? 'currentColor' : 'var(--text3)', opacity: .8 }} />}
                          </div>
                        </td>
                      )
                    })}
                    <td style={{ padding: '0 4px' }}>
                      {sem?.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <input key={'km' + sem.id + (semE.km_objetivo ?? sem.km_objetivo ?? '')} type="number" min="0" defaultValue={semE.km_objetivo ?? sem.km_objetivo ?? ''} placeholder="—" className="tl-inl"
                            onBlur={e => { const v = e.target.value === '' ? null : parseInt(e.target.value, 10); if (v !== (semE.km_objetivo ?? sem.km_objetivo ?? null)) guardarSemana(sem, { km_objetivo: v }) }}
                            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} style={{ width: 44, textAlign: 'right', fontWeight: 600 }} />
                          <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>km</span>
                        </div>
                      ) : null}
                    </td>
                    <td style={{ padding: '0 4px', maxWidth: 240 }}>
                      {sem?.id ? (() => { const t = semVal(sem, 'objetivo'); return (
                        <div className="tl-inl" onClick={ev => editarSemanaCliente(ev, l, sem)} title={t ? 'Lo ve el cliente en su semana:\n\n' + textoPlano(t) + '\n\nClic para editar' : 'Clic para escribir el texto de la semana'}
                          style={{ cursor: 'text', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 230, color: t ? 'var(--text2)' : 'var(--text3)' }}>
                          {t ? textoPlano(t).replace(/\n/g, ' · ') : 'Texto para el cliente…'}
                        </div>) })() : null}
                    </td>
                    <td style={{ padding: '0 6px', minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {sem?.id && <input key={'nt' + sem.id + (semE.notas ?? sem.notas ?? '')} defaultValue={semE.notas ?? sem.notas ?? ''} placeholder="Nota interna…" className="tl-inl" title={semE.notas ?? sem.notas ?? ''}
                          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (semE.notas ?? sem.notas ?? null)) guardarSemana(sem, { notas: v }) }}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = semE.notas ?? sem.notas ?? ''; e.currentTarget.blur() } }} style={{ flex: 1, minWidth: 160 }} />}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', margin: '8px 2px 0' }}>Clic en un día para editar sus contenidos · Ctrl/⌘+clic (o Mayús+clic) selecciona varios días · arrastra un día a otro para moverlo entero (Alt o modo Copiar: copiar) · km y nota de la semana se editan ahí mismo · el punto indica que hay nota · la esquina, un segundo valor del grupo de color · clic en el nº de semana para abrirla.</div>
      </div>
    )
  }

  function notaVis(n) { return n.visibilidad === 'cliente' ? 'cliente' : 'entrenadora' }
  function FilaNotas({ vis, lunesList, dias, WS, GAP, COL, W, micro }) {
    const cli = vis === 'cliente'
    const clave = cli ? 'notc' : 'noti'
    const maxN = Math.max(0, ...dias.map(d => dia(d).notas.filter(n => notaVis(n) === vis).length))
    const altoDias = Math.max(micro ? 46 : 40, maxN * (micro ? 40 : 34) + 24) + ex(clave)
    const color = cli ? '#2563eb' : '#64748b'
    return (<>
      <div style={{ display: 'flex', marginTop: cli ? 6 : 4 }}>
        <Etiqueta g="not" texto={cli ? 'Para el cliente' : 'Notas internas'} icono={cli ? '👁' : '🔒'} alto={28 + altoDias} sub={cli ? 'Semana y días · lo ve en su vista' : 'Solo las ves tú'} />
        <div style={{ display: 'flex', gap: GAP, width: W }}>
          {lunesList.map(l => {
            const sem = semanaPorLunes.get(k(l))
            const tSem = cli ? [semVal(sem, 'objetivo'), semVal(sem, 'nota_cliente')].filter(Boolean).map(t => textoPlano(t)).join(' · ') : (semVal(sem, 'notas') ? textoPlano(semVal(sem, 'notas')) : '')
            return (
              <div key={k(l)} style={{ width: WS, background: GRUPOS.not.soft, borderRadius: 8, overflow: 'hidden' }}>
                <div onClick={ev => sem?.id ? (cli ? editarSemanaCliente(ev, l, sem) : editarSemanaInterna(ev, l, sem)) : null} className="tl-cont"
                  title={sem?.id ? (tSem ? `${cli ? 'Texto de la semana (lo ve el cliente)' : 'Nota interna de la semana'}\n\n${tSem}\n\nClic para editar` : 'Clic para escribir la ' + (cli ? 'explicación de la semana para el cliente' : 'nota interna de la semana')) : 'Esta semana no está en la planificación'}
                  style={{ height: 26, margin: '1px 3px', padding: '0 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, cursor: sem?.id ? 'pointer' : 'default', background: tSem ? color + '12' : 'transparent', border: `1px ${tSem ? 'solid' : 'dashed'} ${color}${tSem ? '44' : '33'}` }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>Semana</span>
                  <span style={{ fontSize: 11, color: tSem ? 'var(--text2)' : 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tSem || (sem?.id ? '+ Añadir' : '')}</span>
                </div>
                <div style={{ display: 'flex', height: altoDias }}>
                  {Array.from({ length: 7 }, (_, i) => addDays(l, i)).map((d, i) => {
                    const ns = dia(d).notas.filter(n => notaVis(n) === vis)
                    return (
                      <div key={k(d)} className="tl-celda-ses" {...destinoItems(() => k(d))} style={{ width: COL, borderLeft: i ? '1px solid rgba(0,0,0,.05)' : 'none', padding: 3, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 3, background: isSameDay(d, hoy) ? 'rgba(45,106,79,.06)' : 'transparent' }}>
                        {ns.map(n => (
                          <div key={n.id} {...arrastrableItem(n, 'nota')} onClick={ev => { if (!clicSeleccion(ev, n, 'nota')) editarNotaDia(ev, n) }} title={`${cli ? '👁 La ve el cliente' : '🔒 Nota interna'}\n\n${n.texto}\n\nClic para editar · arrastra para mover`}
                            style={{ fontSize: micro ? 11 : 9.5, lineHeight: 1.3, color: 'var(--text2)', background: '#fff', border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: 5, padding: '3px 5px', cursor: 'pointer', boxShadow: estaSel('nota', n.id) ? '0 0 0 2px var(--accent)' : 'none', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: Math.max(2, Math.floor(((micro ? 40 : 34) + ex(clave) / Math.max(1, ns.length) - 8) / (micro ? 14 : 12.5))), WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }}>{n.texto}</div>
                        ))}
                        <button className="tl-mas" onClick={ev => nuevaNotaDia(ev, d, vis)} title={`Nueva nota ${cli ? 'para el cliente' : 'interna'}`}
                          style={{ marginTop: 'auto', alignSelf: 'center', border: `1px dashed ${color}88`, background: 'transparent', color, borderRadius: 6, fontSize: 12, width: 24, height: 18, cursor: 'pointer', lineHeight: 1 }}>+</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <BarraEstirar clave={clave} W={W} />
    </>)
  }
  function FilaNotasMacro({ vis, semanasCols, COL, W }) {
    const cli = vis === 'cliente'
    const color = cli ? '#2563eb' : '#64748b'
    return (
      <div style={{ display: 'flex', marginTop: cli ? 6 : 3 }}>
        <Etiqueta g="not" texto={cli ? 'Para el cliente' : 'Notas internas'} icono={cli ? '👁' : '🔒'} alto={34} />
        <div style={{ display: 'flex', width: W, background: GRUPOS.not.soft, borderRadius: 8 }}>
          {semanasCols.map(l => {
            const sem = semanaPorLunes.get(k(l))
            const tSem = cli ? [semVal(sem, 'objetivo'), semVal(sem, 'nota_cliente')].filter(Boolean).map(t => textoPlano(t)).join(' · ') : (semVal(sem, 'notas') ? textoPlano(semVal(sem, 'notas')) : '')
            const ns = Array.from({ length: 7 }, (_, i) => addDays(l, i)).flatMap(d => dia(d).notas.filter(n => notaVis(n) === vis))
            const lineas = [tSem ? 'Semana: ' + tSem : null, ...ns.map(n => `${format(parseISO(String(n.fecha).slice(0, 10)), 'EEE d', { locale: es })} · ${n.texto}`)].filter(Boolean)
            return (
              <div key={k(l)} onClick={() => { setCursor(l); cambiarVision('meso') }} title={lineas.length ? `${cli ? '👁 Para el cliente' : '🔒 Notas internas'}\n\n${lineas.join('\n')}\n\nClic para abrir la semana` : ''}
                style={{ width: COL - 3, margin: '0 1.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: lineas.length ? 'pointer' : 'default' }}>
                {tSem && <span style={{ width: 8, height: 8, borderRadius: 2, background: color, opacity: .8 }} />}
                {ns.length > 0 && <span style={{ minWidth: 16, height: 16, padding: '0 3px', borderRadius: 5, border: `1px solid ${color}66`, color, fontSize: 9.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>{ns.length}</span>}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function BarraEstirar({ clave, W }) {
    return (
      <div className="tl-estirar" onMouseDown={e => iniciarEstirar(e, clave)} onDoubleClick={() => resetEstirar(clave)}
        title={ex(clave) ? 'Arrastra para cambiar la altura · doble clic para volver a la altura automática' : 'Arrastra hacia abajo para ampliar esta fila'}
        style={{ display: 'flex', height: 9, cursor: 'ns-resize', alignItems: 'center', width: LABEL_W + W }}>
        <div style={{ width: LABEL_W, minWidth: LABEL_W, position: 'sticky', left: 0 }} />
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><span className="tl-grip" style={{ width: 42, height: 3, borderRadius: 3, background: 'var(--border2, #cbd5e1)' }} /></div>
      </div>
    )
  }

  // ════════════════════════════ PLANES ════════════════════════════
  function estiloPildora(c, alto, fs) {
    const col = c.color || GRUPOS.pla.color
    return c._sub
      ? { width: '88%', marginLeft: '6%', height: Math.max(13, alto - 2), borderRadius: 99, background: col + '1a', color: col, border: `1px dashed ${col}aa`, fontSize: fs - .5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', boxSizing: 'border-box' }
      : { width: '100%', height: alto, borderRadius: 99, background: col + 'cc', color: '#fff', fontSize: fs, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', whiteSpace: 'nowrap', boxSizing: 'border-box' }
  }
  function planesVisibles(ini, fin) { return planes.filter(p => parseISO(p.fecha_inicio) <= fin && parseISO(p.fecha_fin) >= ini) }
  function tituloPlan(p) { return `${p.nombre} · ${format(parseISO(p.fecha_inicio), 'd MMM yyyy', { locale: es })} – ${format(parseISO(p.fecha_fin), 'd MMM yyyy', { locale: es })}${p.notas ? '\n\n' + p.notas : ''}` }
  function EtiquetaPlan({ p, n, alto }) {
    const abierto = !plegados.has(p.id)
    const { conSubs, todosAbiertos } = filasPlan(p.id)
    return (
      <div style={{ width: LABEL_W, minWidth: LABEL_W, height: alto, display: 'flex', alignItems: 'stretch', position: 'sticky', left: 0, zIndex: 5, background: 'var(--surface)' }}>
        <div style={{ width: 4, background: GRUPOS.pla.color, borderRadius: 2, margin: '2px 0' }} />
        <div onClick={() => alternarPlegado(p.id)} title={tituloPlan(p) + '\n\nClic para ' + (abierto ? 'ver solo el plan' : 'ver sus contenidos')}
          style={{ flex: 1, margin: '3px 8px', borderRadius: 99, background: '#e9d98f', display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px 0 10px', minWidth: 0, cursor: 'pointer' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#5c4a06' }}>P{n}</span>
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</span>
          {abierto && conSubs.length > 0 && (
            <span onClick={e => { e.stopPropagation(); todosSubs(p.id, conSubs, !todosAbiertos) }} title={todosAbiertos ? 'Ocultar todos los subcontenidos' : 'Mostrar todos los subcontenidos'}
              style={{ fontSize: 9.5, fontWeight: 800, color: '#5c4a06', border: '1px solid #5c4a0655', borderRadius: 5, padding: '0 3px', lineHeight: '14px', background: todosAbiertos ? '#5c4a061a' : 'transparent' }}>{todosAbiertos ? '−' : '+'}sub</span>
          )}
          <span style={{ fontSize: 9, color: '#5c4a06', transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>
        </div>
      </div>
    )
  }
  function EtiquetaCont({ texto, alto, color, tenue, sub, info, nSubs, subsAbiertos, onSubs }) { return (
    <div style={{ width: LABEL_W, minWidth: LABEL_W, height: alto, display: 'flex', alignItems: 'stretch', position: 'sticky', left: 0, zIndex: 5, background: 'var(--surface)' }}>
      <div style={{ width: 4, background: GRUPOS.pla.color, opacity: .35, margin: '0' }} />
      <div title={info || texto} style={{ flex: 1, margin: sub ? '2px 8px 2px 36px' : '2px 8px 2px 22px', borderRadius: 99, background: tenue || sub ? 'transparent' : GRUPOS.pla.bg, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, padding: '0 10px', minWidth: 0 }}>
        {nSubs > 0 && <span onClick={onSubs} title={(subsAbiertos ? 'Ocultar' : 'Mostrar') + ` sus ${nSubs} subcontenido${nSubs === 1 ? '' : 's'}`}
          style={{ marginRight: 'auto', fontSize: 8.5, color: 'var(--text3)', cursor: 'pointer', padding: '2px 3px', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ display: 'inline-block', transform: subsAbiertos ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▶</span>{nSubs}</span>}
        {color && <span style={{ width: sub ? 5 : 7, height: sub ? 5 : 7, borderRadius: 99, background: sub ? 'transparent' : color, border: sub ? `1.5px solid ${color}` : 'none', flexShrink: 0 }} />}
        <span style={{ fontSize: sub ? 10.5 : 11, color: tenue || sub ? 'var(--text3)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span>
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
      const conts = filasPlan(p.id).filas
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
                <EtiquetaCont texto={c.texto} color={c.color} sub={c._sub} info={c._info} nSubs={c._nSubs} subsAbiertos={c._subsAbiertos} onSubs={() => alternarSubs(p.id, c.etiqueta_id)} alto={22} />
                <div style={{ display: 'flex', width: W, height: 22, background: '#fffdf4' }}>
                  {semanasCols.map(d => { const nd = semCont(d, c.texto); return (
                    <div key={k(d)} className="tl-cont" {...destinoCont(p.id, d)} onClick={ev => abrirEditorSemana(ev, d, p.id)} style={{ width: COL - 3, margin: '0 1.5px', display: 'flex', alignItems: 'center', cursor: 'pointer', borderRadius: 5 }}>
                      {nd > 0 && <span {...arrastrableCont(p.id, filasAncladas(p.id, c, Array.from({ length: 7 }, (_, i) => addDays(d, i))), d, `${p.id}|${c.texto}|w${k(d)}`)}
                        onClick={e => { e.stopPropagation(); clicSeleccion(e, { id: `${p.id}|${c.texto}|w${k(d)}`, fecha: k(d), filas: filasAncladas(p.id, c, Array.from({ length: 7 }, (_, i) => addDays(d, i))), texto: c.texto, _pid: p.id, _c: c }, 'cont') }}
                        title={`${c._info}\n${nd} día${nd === 1 ? '' : 's'} esta semana\n\nArrastra a otra semana para ${modoDrag === 'copiar' ? 'copiarla' : 'moverla'} (mismos días; Alt: copiar) · Ctrl/⌘+clic para seleccionar`} style={{ ...estiloPildora(c, 15, 9), cursor: 'grab', boxShadow: estaSel('cont', `${p.id}|${c.texto}|w${k(d)}`) ? '0 0 0 2px var(--accent)' : 'none' }}>{COL >= 56 ? c.texto : nd > 1 ? '×' + nd : ''}</span>}
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
          </> : null}
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
      const conts = filasPlan(p.id).filas
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
                <EtiquetaCont texto={c.texto} color={c.color} sub={c._sub} info={c._info} nSubs={c._nSubs} subsAbiertos={c._subsAbiertos} onSubs={() => alternarSubs(p.id, c.etiqueta_id)} alto={altoFila} />
                <Celdas alto={altoFila} fondo="#fffdf4" render={d => {
                  const esta = contDia(d, p.id).some(x => x.texto.trim().toLowerCase() === c.texto.trim().toLowerCase())
                  const filas = esta ? filasAncladas(p.id, c, [d]) : []
                  const nSub = filas.length - filas.filter(x => x.texto.trim().toLowerCase() === c.texto.trim().toLowerCase()).length
                  return (
                    <div className="tl-cont" {...destinoCont(p.id, d)} onClick={() => !esta && alternarContenido(p.id, c, d)} title={esta ? null : `Añadir «${c.texto}» a este día`}
                      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 4px', cursor: esta ? 'default' : 'pointer' }}>
                      {esta ? (
                        <span className="tl-pild" {...arrastrableCont(p.id, filas, d, `${p.id}|${c.texto}|${k(d)}`)}
                          onClick={e => { e.stopPropagation(); clicSeleccion(e, { id: `${p.id}|${c.texto}|${k(d)}`, fecha: k(d), filas, texto: c.texto, _pid: p.id, _c: c }, 'cont') }} title={`${c._info}${nSub ? `\nLleva ${nSub} subcontenido${nSub === 1 ? '' : 's'} anclado${nSub === 1 ? '' : 's'}` : ''}\n\nArrastra para ${modoDrag === 'copiar' ? 'copiar' : 'mover'} (Alt: copiar) · Ctrl/⌘+clic para seleccionar · × para quitar`}
                          style={{ ...estiloPildora(c, altoFila - 7, micro ? 10.5 : 9.5), padding: '0 6px', position: 'relative', cursor: 'grab', boxShadow: estaSel('cont', `${p.id}|${c.texto}|${k(d)}`) ? '0 0 0 2px var(--accent), 0 0 0 4px #fff' : 'none' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.texto}</span>
                          <span className="tl-x" onClick={e => { e.stopPropagation(); quitarConDeshacer(filas, `«${c.texto}» del ${format(d, "EEEE d", { locale: es })}`) }} title={`Quitar «${c.texto}» de este día${nSub ? ' (y sus subcontenidos)' : ''}`}
                            style={{ position: 'absolute', right: 1, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, borderRadius: 99, background: '#fff', color: '#b91c1c', fontSize: 10, lineHeight: '13px', textAlign: 'center', boxShadow: '0 0 0 1px rgba(0,0,0,.15)', cursor: 'pointer' }}>×</span>
                        </span>
                      ) : <span className="tl-mas-cont" style={{ margin: '0 auto', fontSize: 11, color: GRUPOS.pla.color }}>＋</span>}
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
          </> : null}
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
                title={`${it.nombre} · ${format(it._ini, 'd MMM', { locale: es })} – ${format(it._fin, 'd MMM', { locale: es })} (${semanasTxt} sem.)${(it.objetivo || it.notas) ? '\n\n' + (it.objetivo || it.notas) : ''}${editable ? '\nClic para editar · arrastra para mover · arrastra el borde derecho para cambiar la duración' : ''}`}
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
                        {editableCal && <button onClick={e => seleccionarSesionesDe(Array.from({ length: 7 }, (_, i) => addDays(l, i)), e.metaKey || e.ctrlKey || e.shiftKey)} title="Seleccionar todo lo de esta semana: sesiones, contenidos y notas"
                          style={{ marginLeft: 8, verticalAlign: 'middle', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--text3)', padding: '2px 6px', cursor: 'pointer' }}>☐ semana</button>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text2)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        Semana {n || '—'}
                        {editableCal && <button onClick={e => seleccionarSesionesDe(Array.from({ length: 7 }, (_, i) => addDays(l, i)), e.metaKey || e.ctrlKey || e.shiftKey)} title="Seleccionar todo lo de esta semana: sesiones, contenidos y notas (con Ctrl/⌘ o Mayús se suman a la selección)"
                          style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 5, fontSize: 9.5, fontWeight: 600, color: 'var(--text3)', padding: '1px 5px', cursor: 'pointer', letterSpacing: 0, textTransform: 'none' }}>☐ semana</button>}
                      </div>
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
            {(() => { const nMax = Math.max(0, ...dias.map(d => { const x = dia(d); return x.comps.length + x.ctrls.length + (x.ses.length ? 1 : 0) + (x.ses.some(z => z.tipo_sesion === 'opcional') ? 1 : 0) })); const multi = ex('ev') > 0; const altoEv = Math.max(micro ? 64 : 58, nMax * 21 + 10) + ex('ev'); return (<>
            <div style={{ display: 'flex', marginTop: 4 }}>
              <Etiqueta g="cal" texto="Eventos" icono="⚑" alto={altoEv} />
              <Celdas alto={altoEv} fondo={GRUPOS.cal.soft} render={d => {
                const x = dia(d)
                const entreno = x.ses.filter(s => s.tipo_sesion !== 'opcional').length
                const opc = x.ses.length - entreno
                return (
                  <div className="tl-ev" {...destinoItems(() => k(d))} style={{ position: 'relative', padding: 4, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'stretch', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
                    {x.comps.map(c => <Chip key={c.id} onClick={e => { if (!clicSeleccion(e, c, 'competicion')) onAbrirComp?.(c) }} style={estaSel('competicion', c.id) ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined} bg="#fef3c7" color="#92400e" titulo={c.nombre} multi={multi} {...arrastrableItem(c, 'competicion')}>🏆 {c.nombre}</Chip>)}
                    {x.ctrls.map(c => <Chip key={c.id} onClick={e => { if (!clicSeleccion(e, c, 'control')) onAbrirControl?.(c) }} style={estaSel('control', c.id) ? { boxShadow: '0 0 0 2px var(--accent)' } : undefined} bg={GRUPOS.cal.bg} color={GRUPOS.cal.color} titulo={c.nombre} multi={multi} {...arrastrableItem(c, 'control')}>🔬 {c.nombre}</Chip>)}
                    {entreno > 0 && <Chip bg="var(--accent)" color="#fff" titulo={`${entreno} sesión(es)`}>Entreno{entreno > 1 ? ` ×${entreno}` : ''}</Chip>}
                    {opc > 0 && <Chip bg="transparent" color="var(--accent)" borde={`1px dashed var(--accent)`} titulo="Sesión opcional">☆{COL >= 90 ? ' Opcional' : ''}{opc > 1 ? ` ×${opc}` : ''}</Chip>}
                    {(onNuevaCompeticion || onNuevaValoracion || onNuevaNota) && (
                      <div className="tl-mas" style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', gap: 2 }}>
                        {[[onNuevaCompeticion, '🏆', 'Nueva competición'], [onNuevaValoracion, '🔬', 'Nueva valoración']].filter(([f]) => f).map(([f, ic, t]) => (
                          <button key={t} onClick={() => f(k(d))} title={t} style={{ border: '1px dashed var(--border2)', background: 'var(--surface)', borderRadius: 5, fontSize: 10, padding: '0 3px', cursor: 'pointer', lineHeight: '16px' }}>{ic}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              }} />
            </div>
            <BarraEstirar clave="ev" W={W} />
            </>) })()}
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
              <Etiqueta g="pla" texto="Carga día" icono="📈" alto={CH + ex('carga')} extra={<SelectorVar />} />
              <Celdas alto={CH + ex('carga')} fondo={GRUPOS.pla.soft} render={d => {
                if (!varActiva) return null
                const v = valorCarga(varActiva.key, dia(d).ses, fbMap)
                if (v == null) return null
                const h = Math.max(3, (CH + ex('carga') - 26) * (v / maxC))
                return (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 6 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: '#8a6a07', fontFamily: 'var(--mono)', marginBottom: 2 }}>{fmtVal(varActiva.key, v)}</span>
                    <div style={{ width: Math.min(28, COL * 0.45), height: h, borderRadius: '5px 5px 2px 2px', background: GRUPOS.pla.color, opacity: .75 }} />
                  </div>
                )
              }} />
            </div>
          )}
          {grupos.pla && <BarraEstirar clave="carga" W={W} />}

          {/* Programación: sesiones */}
          {grupos.pro && (() => {
            const maxSes = Math.max(1, ...dias.map(d => dia(d).ses.length))
            const altoCard = (micro ? 74 : 58) + Math.floor(ex('ses') / maxSes)
            const alto = Math.max(micro ? 200 : 84, maxSes * (altoCard + 5) + 30)
            return (<>
              <div style={{ display: 'flex', marginTop: 6 }}>
                <Etiqueta g="pro" texto="Sesiones" icono="◉" alto={alto} />
                <Celdas alto={alto} fondo={GRUPOS.pro.soft} render={d => (
                  <div className="tl-celda-ses" {...destinoItems(() => k(d))} style={{ padding: 4, display: 'flex', flexDirection: 'column', gap: 5, height: '100%', boxSizing: 'border-box' }}>
                    {dia(d).ses.map(s => <TarjetaSesion key={s.id} s={s} micro={micro} alto={altoCard} />)}
                    <div style={{ marginTop: 'auto', alignSelf: 'center', display: 'flex', gap: 3 }}>
                      {onNuevaSesion && <button className="tl-mas" onClick={() => onNuevaSesion(k(d))} title="Nueva sesión"
                        style={{ border: '1px dashed ' + GRUPOS.pro.color + '88', background: 'transparent', color: GRUPOS.pro.color, borderRadius: 6, fontSize: 12, width: 24, height: 20, cursor: 'pointer', lineHeight: 1 }}>+</button>}
                      {portaVarios?.length > 0 && <button className="tl-mas" onClick={() => pegarVarios(d)} title={`Pegar ${portaVarios.length} elemento${portaVarios.length === 1 ? '' : 's'} empezando aquí (en el mismo orden)`}
                        style={{ border: '1px dashed ' + GRUPOS.pro.color + '88', background: 'transparent', borderRadius: 6, fontSize: 11, height: 20, padding: '0 4px', cursor: 'pointer', lineHeight: 1 }}>📋{portaVarios.length}</button>}
                      {!portaVarios?.length && clipboard && onPegar && <button className="tl-mas" onClick={() => onPegar(clipboard, k(d))} title={`Pegar «${clipboard.titulo || clipboard.nombre || clipboard.texto || ''}» aquí`}
                        style={{ border: '1px dashed ' + GRUPOS.pro.color + '88', background: 'transparent', borderRadius: 6, fontSize: 11, width: 24, height: 20, cursor: 'pointer', lineHeight: 1 }}>📋</button>}
                    </div>
                  </div>
                )} />
              </div>
              <BarraEstirar clave="ses" W={W} />
            </>)
          })()}

          {/* Notas: para el cliente e internas (semana + días) */}
          {grupos.not && ['cliente', 'entrenadora'].map(vis => <FilaNotas key={vis} vis={vis} lunesList={lunesList} dias={dias} WS={WS} GAP={GAP} COL={COL} W={W} micro={micro} />)}
          
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
                    <div key={it.id} onClick={() => onClick?.(it)} title={`${it.nombre}${(it.objetivo || it.notas) ? '\n\n' + (it.objetivo || it.notas) : ''}`}
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
      <div className="tl-tarj" {...arrastrableItem(s, 'sesion')} onClick={e => { if (!clicSeleccion(e, s, 'sesion')) onAbrirSesion?.(s) }} title={[[s.titulo, s.duracion_min ? s.duracion_min + ' min' : null, opc ? 'Opcional' : null].filter(Boolean).join(' · '), s.indicaciones ? '\n👁 ' + textoPlano(s.indicaciones).slice(0, 220) : null, s.notas_entrenador ? '\n🔒 ' + textoPlano(s.notas_entrenador).slice(0, 220) : null, editableCal ? '\nArrastra para mover (Alt: copiar) · Ctrl/⌘+clic para seleccionar varias' : null].filter(Boolean).join('\n')}
        style={{ position: 'relative', height: alto, flexShrink: 0, borderRadius: 8, background: estaSel('sesion', s.id) ? 'var(--accent-light, #e7f5ed)' : '#fff', border: `1px ${opc ? 'dashed' : 'solid'} ${GRUPOS.pro.color}${opc ? '88' : '55'}`, boxShadow: estaSel('sesion', s.id) ? '0 0 0 2px var(--accent)' : '0 1px 2px rgba(0,0,0,.05)', padding: micro ? '7px 9px' : '5px 6px', cursor: 'pointer', overflow: 'hidden', boxSizing: 'border-box', opacity: opc ? .85 : 1 }}>
        {est && <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 4, background: est }} />}
        {editableCal && (onCopiar || onEliminar) && (
          <div className="tl-acc" style={{ position: 'absolute', right: 3, bottom: 3, display: 'flex', gap: 2, background: '#fff', borderRadius: 5, boxShadow: '0 0 0 1px var(--border)' }}>
            {onCopiar && <button onClick={e => { e.stopPropagation(); onCopiar({ ...s, _tipo: 'sesion' }) }} title="Copiar (luego 📋 en otro día para pegar)" style={btnMini}>⧉</button>}
            {onEliminar && <button onClick={e => { e.stopPropagation(); onEliminar({ ...s, _tipo: 'sesion' }) }} title="Eliminar" style={{ ...btnMini, color: '#dc2626' }}>🗑</button>}
          </div>
        )}
        {micro ? (
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: Math.max(2, Math.floor((alto - 34) / 15)), WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingRight: 8 }}>
            <span style={{ marginRight: 3 }}>{iconoSesion(s)}</span>{s.titulo}
          </div>
        ) : (<>
          <div style={{ fontSize: 11, lineHeight: 1 }}>{iconoSesion(s)}</div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.2, marginTop: 2, display: '-webkit-box', WebkitLineClamp: Math.max(2, Math.floor((alto - 34) / 11.5)), WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', hyphens: 'auto' }} lang="es">{s.titulo}</div>
        </>)}
        <div style={{ fontSize: micro ? 10.5 : 9.5, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[s.hora_inicio ? String(s.hora_inicio).slice(0, 5) : null, s.duracion_min ? s.duracion_min + "'" : null, opc && micro ? '☆ opcional' : opc ? '☆' : null].filter(Boolean).join(' · ')}
        </div>
      </div>
    )
  }
}

const btnSel = { border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', borderRadius: 6, fontSize: 11, padding: '2px 7px', cursor: 'pointer', fontFamily: 'inherit' }
const btnMini = { border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 10.5, padding: '1px 3px', lineHeight: 1, color: 'var(--text2)' }

function Chip({ children, bg, color, borde, titulo, onClick, multi, style: extra, ...rest }) {
  return (
    <div onClick={onClick} title={titulo} {...rest}
      style={{ ...(extra || {}), fontSize: 9.5, fontWeight: 700, padding: '3px 4px', borderRadius: 6, background: bg, color, border: borde || 'none', whiteSpace: multi ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: onClick ? 'pointer' : 'default', textAlign: multi ? 'left' : 'center', lineHeight: multi ? 1.3 : 'normal', overflowWrap: 'anywhere', flexShrink: 0 }}>
      {children}
    </div>
  )
}
