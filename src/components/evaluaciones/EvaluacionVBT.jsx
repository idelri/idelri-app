/**
 * Vista de entrenadora de un test VBT (Vitruve): ajustes, KPIs, perfil carga-velocidad,
 * zonas por %1RM, series (incluir/excluir), potencia y lo que verá el deportista.
 * Guarda los cambios en evaluacion_tests (ajustes, notas, informe, resultados).
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { computeVBT, resumenVBT, defaultMVT, ZONAS_PCT, autoStatus, statusOf, autoRef, autoSays, STATUS_LBL, num } from '../../lib/evaluaciones/vbt'

const C_ACC = '#2a78d6', C_MVT = '#eb6834'
const f2 = x => x == null || !isFinite(x) ? '–' : x.toFixed(2)
const f1 = x => x == null || !isFinite(x) ? '–' : x.toFixed(1)
const niceMax = (x, step) => Math.ceil(x / step) * step

export default function EvaluacionVBT({ test, onCambio }) {
  const [nombre, setNombre] = useState(test.nombre)
  const [notas, setNotas] = useState(test.notas || '')
  const [aj, setAj] = useState(test.ajustes || {})
  const [inf, setInf] = useState(test.informe || {})
  const [visible, setVisible] = useState(!!test.visible_cliente)
  const [estado, setEstado] = useState('')
  useEffect(() => { setNombre(test.nombre); setNotas(test.notas || ''); setAj(test.ajustes || {}); setInf(test.informe || {}); setVisible(!!test.visible_cliente) }, [test.id]) // eslint-disable-line

  const t = test.datos
  const C = useMemo(() => computeVBT(t, aj), [t, aj])
  const F = C.fit
  const vl = C.v === 'mpv' ? 'MPV' : 'MV'

  // Guardado automático
  const timer = useRef(null), primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    clearTimeout(timer.current)
    setEstado('Guardando…')
    timer.current = setTimeout(async () => {
      const campos = { nombre: nombre.trim() || test.nombre, notas: notas.trim() || null, ajustes: aj, informe: inf, visible_cliente: visible, resultados: resumenVBT(computeVBT(t, aj)) }
      const { error } = await supabase.from('evaluacion_tests').update(campos).eq('id', test.id)
      setEstado(error ? 'No se pudo guardar: ' + error.message : 'Guardado')
      if (!error) onCambio?.({ ...test, ...campos })
    }, 700)
    return () => clearTimeout(timer.current)
  }, [nombre, notas, aj, inf, visible]) // eslint-disable-line

  const setA = cambios => setAj(a => ({ ...a, ...cambios }))
  const st = statusOf(inf, C), auto = autoStatus(C)
  const loadsInc = [...new Set(C.pts.filter(p => p.inc).map(p => p.load))].sort((a, b) => a - b)

  const lbl = { fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 3 }
  const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minWidth: 0 }
  const input = { font: 'inherit', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px' }

  const kpis = [
    ['main', '1RM estimado', F ? f1(F.e1rm) : '–', 'kg', F && C.bw ? `${(F.e1rm / C.bw).toFixed(2)} × peso corporal` : `a ${vl} = ${C.mvt.toFixed(2)} m/s`],
    ['', 'L0 · carga a v = 0', F ? f1(F.L0) : '–', 'kg', 'corte con el eje de carga'],
    ['', 'V0 · velocidad a carga 0', F ? f2(F.V0) : '–', 'm/s', 'corte con el eje de velocidad'],
    ['', 'Pendiente', F ? F.b.toFixed(4) : '–', 'm/s·kg', 'velocidad que se pierde por kg'],
    ['', 'Ajuste lineal', F ? F.r2.toFixed(3) : '–', 'R²', F ? `${F.n} puntos${F.see != null ? ` · SEE ${F.see.toFixed(3)} m/s` : ''}` : 'faltan puntos'],
    ['', 'Pico de potencia', C.pmax?.r.pmpv != null ? Math.round(C.pmax.r.pmpv) : '–', 'W', C.pmax ? `con ${C.pmax.load} kg (serie ${C.pmax.set})` : ''],
  ]

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ ...panel, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'baseline' }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} style={{ ...input, fontSize: 17, fontWeight: 700, border: '1px solid transparent', padding: '2px 6px', flex: '1 1 260px' }} title="Nombre del test" />
          <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{t.exercise || '—'} · {t.sets.length} series · Vitruve</span>
          <span style={{ fontSize: 11, color: estado.startsWith('No') ? '#b91c1c' : 'var(--text3)', marginLeft: 'auto' }}>{estado}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'flex-end' }}>
          <div><div style={lbl}>Velocidad</div>
            <select value={C.v} onChange={e => setA({ vvar: e.target.value, mvt: null })} style={input}><option value="mv">Media (MV)</option><option value="mpv">Media propulsiva (MPV)</option></select></div>
          <div><div style={lbl}>Cargas repetidas</div>
            <select value={aj.rule || 'best'} onChange={e => setA({ rule: e.target.value, manual: e.target.value === 'manual' ? C.pts.map(p => p.inc) : null })} style={input}>
              <option value="best">Mejor serie por carga</option><option value="all">Todas las series</option><option value="manual">Selección manual</option></select></div>
          <div><div style={lbl}>MVT (m/s)</div>
            <input type="number" step="0.01" min="0.05" max="0.8" key={'mvt' + C.v + (aj.mvt ?? '')} defaultValue={C.mvt.toFixed(2)} onBlur={e => { const v = num(e.target.value); setA({ mvt: v && v > 0 && Math.abs(v - defaultMVT(t.kind, C.v)) > 1e-9 ? v : null }) }} style={{ ...input, width: 80 }} /></div>
          <div><div style={lbl}>Peso corporal (kg)</div>
            <input type="number" step="0.5" min="20" max="200" key={'bw' + (aj.bw ?? '')} defaultValue={aj.bw ?? ''} placeholder={t.bw ? String(t.bw) : '–'} onBlur={e => { const v = num(e.target.value); setA({ bw: v && v > 0 ? v : null }) }} style={{ ...input, width: 80 }} /></div>
        </div>
        <div><div style={lbl}>Notas (solo las ves tú)</div>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Material, condiciones, técnica… lo que ayude a interpretar el test" style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
        <details open style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Lo que verá el deportista
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500, fontSize: 12, color: visible ? 'var(--accent)' : 'var(--text3)' }} onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> {visible ? '👁 Visible en su portal' : 'Aún no se lo enseñamos'}
            </label>
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'flex-end', marginTop: 10 }}>
            <div><div style={lbl}>Estimación del máximo</div>
              <select value={inf.aStatus || 'auto'} onChange={e => setInf(x => ({ ...x, aStatus: e.target.value }))} style={input}>
                <option value="auto">Automática</option><option value="ok">Fiable</option><option value="ori">Orientativa</option><option value="none">Sin estimación este día</option></select></div>
            <div><div style={lbl}>Carga de referencia</div>
              <select value={inf.aRef ?? ''} onChange={e => setInf(x => ({ ...x, aRef: e.target.value === '' ? null : +e.target.value }))} style={input}>
                <option value="">Automática ({autoRef(C, st) ?? '–'} kg)</option>
                {loadsInc.map(l => <option key={l} value={l}>{l} kg</option>)}</select></div>
            <span style={{ fontSize: 12, color: 'var(--text3)', alignSelf: 'center' }}>Cálculo automático: estimación {STATUS_LBL[auto]}.</span>
          </div>
          <div style={{ marginTop: 10 }}><div style={lbl}>Qué nos dice (una frase por línea)</div>
            <textarea value={inf.aSays || ''} onChange={e => setInf(x => ({ ...x, aSays: e.target.value }))} rows={4} placeholder={autoSays(C, st).join('\n')} style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
          {st === 'none' && <div style={{ marginTop: 10 }}><div style={lbl}>En lugar del máximo, le explicamos…</div>
            <textarea value={inf.instead || ''} onChange={e => setInf(x => ({ ...x, instead: e.target.value }))} rows={3} style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>}
        </details>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {kpis.map(([c, l, v, u, s]) => (
          <div key={l} style={{ ...panel, padding: '10px 12px', borderColor: c === 'main' ? C_MVT : 'var(--border)' }}>
            <div style={lbl}>{l}</div>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{v}<small style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500, marginLeft: 3 }}>{u}</small></div>
            <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <section style={panel}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Velocidad vs carga</h3>
          <GraficaLV C={C} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11.5, color: 'var(--text2)', marginTop: 4 }}>
            <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: C_ACC, marginRight: 5 }} />Serie incluida en el ajuste</span>
            <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, border: '1.5px solid var(--text3)', marginRight: 5 }} />Serie excluida</span>
            <span><i style={{ display: 'inline-block', width: 14, height: 3, background: C_MVT, marginRight: 5, verticalAlign: 'middle' }} />MVT y 1RM estimado</span>
          </div>
        </section>
        <section style={panel}>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Zonas de entrenamiento</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 8px' }}>Velocidad objetivo de la primera repetición para cada %1RM, sacada del perfil de este test.</p>
          {!F || !isFinite(F.e1rm) ? <div style={{ fontSize: 13, color: 'var(--text3)' }}>Hacen falta al menos dos cargas distintas.</div> : (
            <table style={tabla}><thead><tr><th style={th}>%1RM</th><th style={th}>Carga</th><th style={th}>{vl} objetivo</th></tr></thead>
              <tbody>{ZONAS_PCT.map(p => { const L = F.e1rm * p / 100; return <tr key={p}><td style={td}>{p}%</td><td style={td}>{f1(L)} kg</td><td style={td}><b>{f2(F.a + F.b * L)}</b> m/s</td></tr> })}</tbody></table>
          )}
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <section style={panel}>
          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Series del test</h3>
          <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 8px' }}>Marca o desmarca series para recalcular. Los avisos señalan repeticiones con recorrido corto o caída de velocidad frente a la otra serie con la misma carga.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={tabla}>
              <thead><tr><th style={th}>Incluir</th><th style={th}>Serie</th><th style={th}>Carga</th><th style={th}>{vl}</th><th style={th}>{C.v === 'mpv' ? 'MV' : 'MPV'}</th><th style={th}>V pico</th><th style={th}>Pot. MPV</th><th style={th}>ROM</th><th style={{ ...th, textAlign: 'left' }}>Avisos</th></tr></thead>
              <tbody>{C.pts.map((p, i) => (
                <tr key={i} style={{ color: p.inc ? 'inherit' : 'var(--text3)' }}>
                  <td style={td}><input type="checkbox" checked={!!p.inc} onChange={e => { const m = C.pts.map(q => q.inc); m[i] = e.target.checked; setA({ rule: 'manual', manual: m }) }} /></td>
                  <td style={td}>{p.set}</td><td style={td}>{p.load} kg</td>
                  <td style={{ ...td, textDecoration: p.inc ? 'none' : 'line-through' }}><b>{f2(p.v)}</b></td>
                  <td style={td}>{f2(p.r[C.v === 'mpv' ? 'mv' : 'mpv'])}</td><td style={td}>{f2(p.r.pv)}</td>
                  <td style={td}>{p.r.pmpv != null ? Math.round(p.r.pmpv) + ' W' : '–'}</td><td style={td}>{f2(p.r.rom)}</td>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: 140 }}>{p.flags.map(f => <span key={f} style={{ display: 'inline-block', fontSize: 11, color: '#a86a00', background: '#fdf1d8', padding: '1px 6px', borderRadius: 4, margin: '1px 3px 1px 0' }}>⚠ {f}</span>)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>
        <section style={panel}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>Potencia media propulsiva vs carga</h3>
          <GraficaPotencia C={C} />
        </section>
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: 0, maxWidth: '80ch' }}>MVT por defecto: press banca 0,17 m/s; sentadilla 0,30 m/s (MV) / 0,33 m/s (MPV). Si tienes el MVT individual del deportista, escríbelo. «Mean Force» de Vitruve no se usa: es la carga × g, no una fuerza medida. El peso corporal que trae Vitruve es el de la cuenta, no el del deportista: escríbelo a mano.</p>
    </div>
  )
}

const tabla = { borderCollapse: 'collapse', width: '100%', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }
const th = { fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, textAlign: 'right', padding: '5px 7px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'transparent' }
const td = { textAlign: 'right', padding: '5px 7px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'transparent' }

function GraficaLV({ C }) {
  const W = 560, H = 340, m = { l: 48, r: 16, t: 16, b: 42 }, iw = W - m.l - m.r, ih = H - m.t - m.b
  const F = C.fit, loads = C.pts.map(p => p.load), vs = C.pts.map(p => p.v).filter(v => v != null)
  const xmax = niceMax(Math.max(...loads, F && isFinite(F.e1rm) && F.e1rm < 400 ? F.e1rm : 0) * 1.08, 10)
  const ymax = niceMax(Math.max(...vs, F ? Math.min(F.V0, 3) : 0) * 1.05, 0.2)
  const X = x => m.l + x / xmax * iw, Y = y => m.t + ih - y / ymax * ih
  const xstep = xmax > 120 ? 20 : 10
  const xs = []; for (let x = 0; x <= xmax + 1e-9; x += xstep) xs.push(x)
  const ys = []; for (let y = 0; y <= ymax + 1e-9; y += 0.2) ys.push(y)
  const inc = C.pts.filter(p => p.inc)
  const lo = inc.length ? Math.min(...inc.map(p => p.load)) : 0, hi = inc.length ? Math.max(...inc.map(p => p.load)) : 0
  const v = x => F.a + F.b * x
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Perfil carga-velocidad">
      {xs.map(x => <g key={'x' + x}><line x1={X(x)} x2={X(x)} y1={m.t} y2={m.t + ih} stroke="var(--border)" /><text x={X(x)} y={H - m.b + 18} textAnchor="middle" fontSize="12" fill="var(--text3)">{x}</text></g>)}
      {ys.map(y => <g key={'y' + y}><line x1={m.l} x2={m.l + iw} y1={Y(y)} y2={Y(y)} stroke="var(--border)" /><text x={m.l - 8} y={Y(y) + 4} textAnchor="end" fontSize="12" fill="var(--text3)">{y.toFixed(1)}</text></g>)}
      <text x={m.l + iw / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--text2)">Carga (kg)</text>
      <text transform={`translate(13 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--text2)">{C.v === 'mpv' ? 'MPV' : 'MV'} (m/s)</text>
      <line x1={m.l} x2={m.l + iw} y1={Y(C.mvt)} y2={Y(C.mvt)} stroke={C_MVT} strokeWidth="1.5" strokeDasharray="4 4" />
      <text x={m.l + 6} y={Y(C.mvt) - 6} fontSize="12" fill="var(--text2)">MVT {C.mvt.toFixed(2)} m/s</text>
      {F && <line x1={X(lo)} y1={Y(v(lo))} x2={X(hi)} y2={Y(v(hi))} stroke={C_ACC} strokeWidth="2" />}
      {F && isFinite(F.e1rm) && F.e1rm > hi && F.e1rm <= xmax && <>
        <line x1={X(hi)} y1={Y(v(hi))} x2={X(F.e1rm)} y2={Y(C.mvt)} stroke={C_ACC} strokeWidth="2" strokeDasharray="5 5" opacity=".8" />
        <line x1={X(F.e1rm)} x2={X(F.e1rm)} y1={Y(C.mvt)} y2={m.t + ih} stroke={C_MVT} strokeDasharray="2 3" />
        <circle cx={X(F.e1rm)} cy={Y(C.mvt)} r="6" fill={C_MVT} stroke="#fff" strokeWidth="2" />
        <text x={X(F.e1rm)} y={Y(C.mvt) - 12} textAnchor={X(F.e1rm) > W - 90 ? 'end' : 'middle'} fontSize="13" fontWeight="600" fill="var(--text)">1RM ≈ {F.e1rm.toFixed(1)} kg</text>
      </>}
      {C.pts.map((p, i) => p.v == null ? null : (
        <g key={i}>
          {p.inc ? <circle cx={X(p.load)} cy={Y(p.v)} r="6" fill={C_ACC} stroke="#fff" strokeWidth="2" /> : <circle cx={X(p.load)} cy={Y(p.v)} r="5" fill="#fff" stroke="var(--text3)" strokeWidth="1.5" />}
          <circle cx={X(p.load)} cy={Y(p.v)} r="14" fill="transparent" data-tip={`Serie ${p.set} · ${p.load} kg · ${f2(p.v)} m/s${p.inc ? '' : ' · excluida'}`} />
        </g>
      ))}
    </svg>
  )
}

function GraficaPotencia({ C }) {
  const W = 440, H = 280, m = { l: 50, r: 14, t: 20, b: 40 }, iw = W - m.l - m.r, ih = H - m.t - m.b
  const pts = C.pts.filter(p => p.r.pmpv != null)
  if (!pts.length) return <div style={{ fontSize: 13, color: 'var(--text3)' }}>Este archivo no trae potencia.</div>
  const xmax = niceMax(Math.max(...pts.map(p => p.load)) * 1.1, 10), ymax = niceMax(Math.max(...pts.map(p => p.r.pmpv)) * 1.1, 100)
  const X = x => m.l + x / xmax * iw, Y = y => m.t + ih - y / ymax * ih
  const xs = []; for (let x = 0; x <= xmax; x += 10) xs.push(x)
  const ys = []; for (let y = 0; y <= ymax; y += 100) ys.push(y)
  const F = C.fit
  return (<>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Potencia frente a carga">
      {xs.map(x => <text key={'x' + x} x={X(x)} y={H - m.b + 18} textAnchor="middle" fontSize="12" fill="var(--text3)">{x}</text>)}
      {ys.map(y => <g key={'y' + y}><line x1={m.l} x2={m.l + iw} y1={Y(y)} y2={Y(y)} stroke="var(--border)" /><text x={m.l - 8} y={Y(y) + 4} textAnchor="end" fontSize="12" fill="var(--text3)">{y}</text></g>)}
      <text x={m.l + iw / 2} y={H - 4} textAnchor="middle" fontSize="12" fill="var(--text2)">Carga (kg)</text>
      <text transform={`translate(13 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--text2)">Potencia (W)</text>
      {pts.map((p, i) => { const top = p === C.pmax; return (
        <g key={i}>
          <circle cx={X(p.load)} cy={Y(p.r.pmpv)} r={top ? 7 : 5} fill={p.inc ? C_ACC : '#fff'} stroke={p.inc ? '#fff' : 'var(--text3)'} strokeWidth={p.inc ? 2 : 1.5} />
          <circle cx={X(p.load)} cy={Y(p.r.pmpv)} r="14" fill="transparent" data-tip={`Serie ${p.set} · ${p.load} kg · ${Math.round(p.r.pmpv)} W`} />
        </g>) })}
      {C.pmax && <text x={X(C.pmax.load)} y={Y(C.pmax.r.pmpv) - 12} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text)">{Math.round(C.pmax.r.pmpv)} W</text>}
    </svg>
    {C.pmax && <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0 0' }}>Carga de máxima potencia medida: {C.pmax.load} kg{F && isFinite(F.e1rm) ? ` (≈${Math.round(C.pmax.load / F.e1rm * 100)}% del 1RM estimado)` : ''}.</p>}
  </>)
}
