/**
 * PlanPortal — cabecera de la pestaña "Mi plan" del portal del cliente.
 *
 *  1. Cuenta atrás hasta el objetivo (competición) y progreso del plan.
 *  2. Línea de tiempo por semanas: fases con su color, semanas hechas,
 *     "estás aquí" y las competiciones colocadas en su semana.
 *  3. Al tocar una semana de la línea de tiempo se ve desarrollada debajo.
 *  4. Competiciones / partidos que vienen.
 *
 * El objetivo de la cuenta atrás es la primera competición visible para el
 * cliente que cae en la última semana del plan o después; si no hay, la
 * última competición del plan; y si tampoco, el final del plan.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import TextoEstructurado, { textoPlano } from './TextoEstructurado'
import { format, startOfWeek, addWeeks, addDays, differenceInCalendarDays, parseISO, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'

const fechaLocal = s => parseISO(s + 'T12:00:00')
const key = d => format(d, 'yyyy-MM-dd')

export default function PlanPortal({ T, isDesktop, plan, bloques, semanas, competiciones, card }) {
  const scRef = useRef(null)
  const [semSel, setSemSel] = useState(null)   // semana abierta en la línea de tiempo (índice); null = la actual
  const hoy = new Date()
  const lunesHoy = startOfWeek(hoy, { weekStartsOn: 1 })

  /* ── Semanas del plan (una entrada por lunes) ── */
  const fases = useMemo(() => bloques
    .filter(b => b.fecha_inicio && b.semanas > 0)
    .slice().sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)), [bloques])

  const lista = useMemo(() => {
    const out = []
    fases.forEach(b => {
      const ini = startOfWeek(fechaLocal(b.fecha_inicio), { weekStartsOn: 1 })
      for (let i = 0; i < b.semanas; i++) {
        const lunes = addWeeks(ini, i)
        if (out.some(w => isSameDay(w.lunes, lunes))) continue
        const sem = semanas.find(s => s.fecha_inicio_semana === key(lunes)) || null
        out.push({ lunes, bloque: b, sem })
      }
    })
    out.sort((a, b) => a.lunes - b.lunes)
    out.forEach((w, i) => { w.numero = w.sem?.numero_cliente || i + 1 })
    return out
  }, [fases, semanas])

  const visibles = useMemo(() => competiciones
    .filter(c => c.fecha && (c.visibilidad == null || c.visibilidad === 'cliente'))
    .slice().sort((a, b) => a.fecha.localeCompare(b.fecha)), [competiciones])

  // Centrar la semana actual si la línea tiene scroll
  useEffect(() => {
    const c = scRef.current
    if (!c) return
    const el = c.querySelector('[data-actual="1"]')
    if (el) c.scrollLeft = Math.max(0, el.offsetLeft - c.clientWidth / 2)
  })

  if (lista.length === 0) return null

  const iniPlan = lista[0].lunes
  const finPlan = addDays(lista[lista.length - 1].lunes, 6)
  const idxHoy = lista.findIndex(w => isSameDay(w.lunes, lunesHoy))
  const antes = hoy < iniPlan
  const despues = hoy > finPlan
  // Igual que la cabecera del portal: semana en curso / total
  const pct = Math.round(((antes ? 0 : despues ? lista.length : idxHoy + 1) / lista.length) * 100)

  /* ── Objetivo de la cuenta atrás ── */
  const ultimaSemana = lista[lista.length - 1].lunes
  const objetivo =
    visibles.find(c => fechaLocal(c.fecha) >= ultimaSemana) ||
    [...visibles].reverse().find(c => fechaLocal(c.fecha) >= iniPlan && fechaLocal(c.fecha) <= finPlan) ||
    null
  const fechaObjetivo = objetivo ? fechaLocal(objetivo.fecha) : finPlan
  const dias = differenceInCalendarDays(fechaObjetivo, hoy)
  const actual = idxHoy >= 0 ? lista[idxHoy] : null
  const color = actual?.bloque?.color || (antes ? lista[0].bloque.color : lista[lista.length - 1].bloque.color) || T.green

  // Competiciones colocadas en su semana (o al final si caen después del plan)
  const compsPorSemana = {}
  const compsDespues = []
  visibles.forEach(c => {
    const f = fechaLocal(c.fecha)
    const i = lista.findIndex(w => f >= w.lunes && f < addDays(w.lunes, 7))
    if (i >= 0) (compsPorSemana[i] = compsPorSemana[i] || []).push(c)
    else if (f > finPlan) compsDespues.push(c)
  })

  // Semana desarrollada bajo la línea de tiempo: la que toque el cliente, o la actual (o la primera)
  const iSel = semSel ?? (idxHoy >= 0 ? idxHoy : antes ? 0 : lista.length - 1)
  const wSel = lista[iSel]
  const proxComps = visibles.filter(c => fechaLocal(c.fecha) >= startOfWeek(hoy, { weekStartsOn: 1 })).slice(0, 8)

  const anchoSem = isDesktop ? 0 : 34       // móvil: ancho mínimo por semana
  const mono = { fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isDesktop ? 16 : 12 }}>

      {/* ── 1. Cuenta atrás + progreso ── */}
      <div style={{ ...card, background: color, border: 'none', color: '#fff' }}>
        <div style={{ padding: isDesktop ? '20px 22px' : '16px 16px', display: 'flex', flexDirection: isDesktop ? 'row' : 'column', gap: isDesktop ? 28 : 14, alignItems: isDesktop ? 'center' : 'stretch' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...mono, color: 'rgba(255,255,255,.75)' }}>{objetivo ? 'Hacia' : 'Tu plan'}</div>
            <div style={{ fontSize: isDesktop ? 22 : 19, fontWeight: 700, marginTop: 3, lineHeight: 1.2 }}>{objetivo ? objetivo.nombre : plan?.nombre}</div>
            <div style={{ fontSize: 12, opacity: .85, marginTop: 3 }}>
              {objetivo ? format(fechaObjetivo, "EEEE d 'de' MMMM", { locale: es }) : plan?.nombre ? `Termina el ${format(finPlan, "d 'de' MMMM", { locale: es })}` : ''}
              {objetivo?.objetivo ? ` · ${objetivo.objetivo}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0 }}>
            {dias > 0 ? (
              <>
                <span style={{ fontSize: isDesktop ? 48 : 40, fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>{dias}</span>
                <span style={{ fontSize: 13, opacity: .9 }}>{dias === 1 ? 'día' : 'días'}<br />{objetivo ? 'para el objetivo' : 'para terminar'}</span>
              </>
            ) : dias === 0 ? (
              <span style={{ fontSize: 22, fontWeight: 800 }}>¡Es hoy!</span>
            ) : (
              <span style={{ fontSize: 16, fontWeight: 700 }}>Plan completado</span>
            )}
          </div>
        </div>
        <div style={{ padding: isDesktop ? '0 22px 18px' : '0 16px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: .9, marginBottom: 5 }}>
            <span>
              {antes ? `Empieza el ${format(iniPlan, "EEEE d 'de' MMMM", { locale: es })}`
                : despues ? `${lista.length} semanas completadas`
                : `Semana ${actual?.numero} de ${lista.length} · ${actual?.bloque?.nombre}`}
            </span>
            <span style={{ fontFamily: T.mono, fontWeight: 600 }}>{Math.min(100, Math.max(0, pct))}%</span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.25)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: '#fff', borderRadius: 3 }} />
          </div>
        </div>
      </div>

      {/* ── 2. Línea de tiempo ── */}
      <div style={card}>
        <div style={{ padding: '14px 14px 12px' }}>
          <div style={{ ...mono, marginBottom: 12 }}>Línea de tiempo · {lista.length} semanas</div>
          <div ref={scRef} style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div style={{ minWidth: anchoSem ? (lista.length + (compsDespues.length ? 1 : 0)) * anchoSem : 0 }}>
              {/* Fases */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                {fases.map(b => {
                  const n = lista.filter(w => w.bloque.id === b.id).length
                  if (!n) return null
                  return (
                    <div key={b.id} style={{ flex: n, minWidth: 0, borderBottom: `3px solid ${b.color || T.green}`, paddingBottom: 3 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: b.color || T.green, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.nombre}</div>
                    </div>
                  )
                })}
                {compsDespues.length > 0 && <div style={{ flex: 1 }} />}
              </div>
              {/* "Estás aquí" */}
              <div style={{ display: 'flex', gap: 3, height: 18, alignItems: 'flex-end' }}>
                {lista.map((w, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                    {i === idxHoy && <span style={{ fontSize: 8.5, fontFamily: T.mono, fontWeight: 700, color: '#fff', background: T.ink, padding: '1px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>AQUÍ ▾</span>}
                  </div>
                ))}
                {compsDespues.length > 0 && <div style={{ flex: 1 }} />}
              </div>
              {/* Semanas */}
              <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                {lista.map((w, i) => {
                  const c = w.bloque.color || T.green
                  const pasada = antes ? false : despues ? true : i < idxHoy
                  const esHoy = i === idxHoy
                  const comps = compsPorSemana[i]
                  return (
                    <div key={i} data-actual={esHoy ? '1' : undefined} title={textoPlano(w.sem?.objetivo)}
                      onClick={() => setSemSel(i)}
                      style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 6, background: pasada || esHoy ? c : `${c}2e`, color: pasada || esHoy ? '#fff' : c, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', outline: i === iSel ? `2px solid ${T.ink}` : 'none', outlineOffset: 1, position: 'relative', cursor: 'pointer', boxShadow: i === iSel ? '0 3px 8px rgba(0,0,0,.18)' : 'none', transform: i === iSel ? 'translateY(-1px)' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>S{w.numero}</span>
                      {pasada && !esHoy && <span style={{ fontSize: 9, lineHeight: 1 }}>✓</span>}
                      {comps && <span title={comps.map(x => x.nombre).join(', ')} style={{ position: 'absolute', top: -7, right: -3, fontSize: 12 }}>🏆</span>}
                    </div>
                  )
                })}
                {compsDespues.length > 0 && (
                  <div title={compsDespues.map(x => x.nombre).join(', ')}
                    style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 6, background: '#fde9c4', border: '1px solid #f3c77a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏆</div>
                )}
              </div>
              {/* Fechas */}
              <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                {lista.map((w, i) => {
                  const mostrar = isDesktop ? lista.length <= 16 || i % 2 === 0 : i === 0 || w.bloque.id !== lista[i - 1].bloque.id
                  return (
                    <div key={i} style={{ flex: 1, minWidth: 0, fontFamily: T.mono, fontSize: 8.5, color: T.ink3, whiteSpace: 'nowrap', overflow: 'visible' }}>
                      {mostrar ? format(w.lunes, 'd MMM', { locale: es }) : ''}
                    </div>
                  )
                })}
                {compsDespues.length > 0 && (
                  <div style={{ flex: 1, minWidth: 0, fontFamily: T.mono, fontSize: 8.5, color: '#9a5b00', whiteSpace: 'nowrap', textAlign: 'center' }}>{format(fechaLocal(compsDespues[0].fecha), 'd MMM', { locale: es })}</div>
                )}
              </div>
            </div>
          </div>
          {/* Semana elegida, desarrollada */}
          {wSel && (() => {
            const c = wSel.bloque.color || T.green
            const comps = compsPorSemana[iSel] || []
            return (
              <div style={{ marginTop: 12, borderTop: `1px solid ${T.bg2}`, paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: c }}>Semana {wSel.numero}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: c }}>{wSel.bloque.nombre}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3 }}>{format(wSel.lunes, 'd MMM', { locale: es })} – {format(addDays(wSel.lunes, 6), 'd MMM', { locale: es })}</span>
                  {iSel === idxHoy && <span style={{ fontSize: 8.5, fontFamily: T.mono, fontWeight: 700, color: '#fff', background: c, padding: '1px 6px', borderRadius: 6 }}>ESTA SEMANA</span>}
                </div>
                <div style={{ borderLeft: `3px solid ${c}`, paddingLeft: 10 }}>
                  {wSel.sem?.objetivo
                    ? <TextoEstructurado texto={wSel.sem.objetivo} T={T} color={c} size={12.5} conTitulo />
                    : <div style={{ fontSize: 12.5, color: T.ink3 }}>{wSel.bloque.objetivo || 'Sin descripción para esta semana.'}</div>}
                  {wSel.sem?.nota_cliente && <div style={{ fontSize: 11.5, color: T.ink2, lineHeight: 1.4, marginTop: 5, fontStyle: 'italic' }}>{wSel.sem.nota_cliente}</div>}
                  {comps.map(cp => (
                    <div key={cp.id} style={{ fontSize: 11.5, fontWeight: 600, color: '#7a4a00', marginTop: 5 }}>🏆 {cp.nombre} · {format(fechaLocal(cp.fecha), 'EEE d', { locale: es })}</div>
                  ))}
                </div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 8 }}>Toca otra semana de la línea de tiempo para verla.</div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Competiciones ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isDesktop ? 16 : 12, alignItems: 'start' }}>
        {proxComps.length > 0 && (
          <div style={card}>
            <div style={{ padding: '13px 14px' }}>
              <div style={{ ...mono, marginBottom: 8 }}>Competiciones</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {proxComps.map(c => {
                  const f = fechaLocal(c.fecha)
                  const d = differenceInCalendarDays(f, hoy)
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: c.id === objetivo?.id ? '#fde9c4' : T.bg, borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ width: 38, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1 }}>{format(f, 'd')}</div>
                        <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.ink3, textTransform: 'uppercase' }}>{format(f, 'MMM', { locale: es })}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>🏆 {c.nombre}</div>
                        {c.objetivo && <div style={{ fontSize: 11, color: T.ink2, marginTop: 1 }}>{c.objetivo}</div>}
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.ink3, flexShrink: 0 }}>{d > 0 ? `en ${d} d` : d === 0 ? 'hoy' : ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
