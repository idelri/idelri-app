/**
 * Vista de entrenadora de un test isométrico (Tindeq): resumen por lado, asimetría,
 * curvas fuerza-tiempo alineadas e intentos (uso y lado). Guarda en evaluacion_tests.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { montarIso, isoUnit, isoBest, isoAsym, isoCV, ifmt, SIDE, USE_MAX, USE_RFD, isoAutoSays, resumenIso } from '../../lib/evaluaciones/iso'
import { num } from '../../lib/evaluaciones/vbt'

const OK = ['#e3f4ea', '#1f8a4c'], WARN = ['#fdf1d8', '#a86a00'], BAD = ['#fbe4e3', '#c23b3a'], NEU = ['var(--bg2)', 'var(--text2)']
const exName = n => n.includes(' · ') ? n.split(' · ').slice(1).join(' · ').trim() : n

export default function EvaluacionIso({ test, onCambio }) {
  const [nombre, setNombre] = useState(test.nombre)
  const [notas, setNotas] = useState(test.notas || '')
  const [aj, setAj] = useState(test.ajustes || {})
  const [inf, setInf] = useState(test.informe || {})
  const [visible, setVisible] = useState(!!test.visible_cliente)
  const [estado, setEstado] = useState('')
  const [hl, setHl] = useState(null)
  useEffect(() => { setNombre(test.nombre); setNotas(test.notas || ''); setAj(test.ajustes || {}); setInf(test.informe || {}); setVisible(!!test.visible_cliente) }, [test.id]) // eslint-disable-line

  const T = useMemo(() => montarIso(test.datos, aj), [test.datos, aj])
  const U = isoUnit(T)
  const B = { I: isoBest(T, 'I'), D: isoBest(T, 'D') }

  const timer = useRef(null), primera = useRef(true)
  useEffect(() => {
    if (primera.current) { primera.current = false; return }
    clearTimeout(timer.current); setEstado('Guardando…')
    timer.current = setTimeout(async () => {
      const campos = { nombre: nombre.trim() || test.nombre, notas: notas.trim() || null, ajustes: aj, informe: inf, visible_cliente: visible, resultados: resumenIso(montarIso(test.datos, aj)) }
      const { error } = await supabase.from('evaluacion_tests').update(campos).eq('id', test.id)
      setEstado(error ? 'No se pudo guardar: ' + error.message : 'Guardado')
      if (!error) onCambio?.({ ...test, ...campos })
    }, 700)
    return () => clearTimeout(timer.current)
  }, [nombre, notas, aj, inf, visible]) // eslint-disable-line

  const setA = c => setAj(a => ({ ...a, ...c }))
  const lbl = { fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 3 }
  const panel = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, minWidth: 0 }
  const input = { font: 'inherit', fontSize: 13, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 8px' }
  const nI = T.attempts.filter(a => a.side === 'I').length, nD = T.attempts.filter(a => a.side === 'D').length
  const pill = ([bg, fg], txt) => <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, padding: '1px 8px', borderRadius: 99, background: bg, color: fg }}>{txt}</span>

  const tarjetaLado = s => {
    const b = B[s], sd = SIDE[s]
    return (
      <div key={s} style={{ ...panel, borderTop: `4px solid ${sd.c}`, display: 'grid', gap: 8, alignContent: 'start' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b style={{ fontSize: 15 }}>{sd.name}</b><span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{b.n} intento{b.n === 1 ? '' : 's'} válido{b.n === 1 ? '' : 's'}</span></div>
        <div><div style={lbl}>Pico</div><div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>{b.pk ? ifmt(U.f(b.pk.r.pk), U.d) : '–'}<small style={{ fontSize: 14, color: 'var(--text2)', fontWeight: 500, marginLeft: 4 }}>{U.u}</small></div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)' }}>{b.pk ? b.pk.name : 'sin intentos válidos para el pico'}</div></div>
        <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 10px', fontSize: 12.5, margin: 0 }}>
          <dt style={{ color: 'var(--text2)' }}>Mejor 1 s</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{b.b1 ? ifmt(U.f(b.b1.r.best1), U.d) + ' ' + U.u : '–'}</dd>
          <dt style={{ color: 'var(--text2)' }}>RFD 0-100 ms</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{b.r100 ? ifmt(U.f(b.r100.r.rfd100), 0) + ' ' + U.ru : '–'}</dd>
          <dt style={{ color: 'var(--text2)' }}>RFD 0-200 ms</dt><dd style={{ margin: 0, textAlign: 'right', fontWeight: 600 }}>{b.r200 ? ifmt(U.f(b.r200.r.rfd200), 0) + ' ' + U.ru : '–'}</dd>
        </dl>
      </div>
    )
  }
  const filasAsim = [['Pico', 'pk', true, 'bands'], ['Mejor 1 s', 'best1', true, 'bands'], ['RFD 0-100 ms', 'rfd100', false, 'cv'], ['RFD 0-200 ms', 'rfd200', false, 'cv']].map(([l, key, maxOnly, mode]) => {
    const pick = { pk: 'pk', best1: 'b1', rfd100: 'r100', rfd200: 'r200' }[key]
    const A = isoAsym(B.I[pick]?.r[key], B.D[pick]?.r[key])
    if (!A) return <div key={key} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 10, fontSize: 12.5 }}><span>{l}</span><span style={{ color: 'var(--text3)' }}>Faltan datos de un lado</span></div>
    const cI = isoCV(T, 'I', key, maxOnly), cD = isoCV(T, 'D', key, maxOnly)
    const known = [cI.cv, cD.cv].filter(x => x != null), maxCV = known.length ? Math.max(...known) : null
    const cvTxt = `CV izda ${cI.cv != null ? ifmt(cI.cv, 0) + ' %' : '–'} · dcha ${cD.cv != null ? ifmt(cD.cv, 0) + ' %' : '–'}`
    const within = maxCV != null && A.pct <= maxCV
    let cls, cap
    if (mode === 'bands') { cls = A.pct < 10 ? OK : A.pct < 15 ? WARN : BAD; cap = `${cvTxt}${within ? ' · dentro de la variabilidad entre intentos' : ''}${known.length < 2 ? ' · faltan intentos válidos para el CV de un lado' : ''}` }
    else { cls = maxCV == null || within ? NEU : WARN; cap = `${cvTxt} · ${maxCV == null ? 'sin intentos suficientes para valorarla' : within ? 'dentro de la variabilidad: no es una asimetría real' : 'supera la variabilidad entre intentos'}` }
    const W = 300, mid = W / 2, max = 30, len = Math.min(A.pct, max) / max * mid, x = A.side === 'D' ? mid : mid - len
    const band = (p, c) => { p = Math.min(p, max); return <rect x={mid - p / max * mid} y="5" width={2 * p / max * mid} height="8" fill={c} /> }
    return (
      <div key={key} style={{ display: 'grid', gridTemplateColumns: '100px minmax(0,1fr) 80px', gap: '2px 10px', alignItems: 'center', fontSize: 12.5 }}>
        <span>{l}</span>
        <svg viewBox={`0 0 ${W} 18`} preserveAspectRatio="none" style={{ width: '100%', height: 18, display: 'block' }}>
          {mode === 'bands' ? <><rect x="0" y="5" width={W} height="8" rx="4" fill={BAD[0]} />{band(15, WARN[0])}{band(10, OK[0])}</> : <><rect x="0" y="5" width={W} height="8" rx="4" fill="var(--bg2)" />{maxCV != null && band(maxCV, 'var(--border)')}</>}
          <rect x={x} y="3" width={Math.max(len, 1.5)} height="12" rx="2" fill={A.side === 'I' ? SIDE.I.c : SIDE.D.c} />
          <line x1={mid} x2={mid} y1="0" y2="18" stroke="var(--text3)" strokeWidth="1.5" />
        </svg>
        <span style={{ textAlign: 'right' }}>{pill(cls, ifmt(A.pct, 1) + ' %')}</span>
        <span style={{ gridColumn: '2 / -1', fontSize: 11, color: 'var(--text3)' }}>{cap}</span>
      </div>
    )
  })
  const pkA = isoAsym(B.I.pk?.r.pk, B.D.pk?.r.pk)
  const ordenados = [...T.attempts].sort((a, b) => -a.side.localeCompare(b.side) || a.name.localeCompare(b.name, 'es', { numeric: true }))

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ ...panel, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'baseline' }}>
          <input value={nombre} onChange={e => setNombre(e.target.value)} style={{ ...input, fontSize: 17, fontWeight: 700, border: '1px solid transparent', padding: '2px 6px', flex: '1 1 260px' }} title="Nombre del test" />
          <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>Isometría con Tindeq · {nI} intentos izquierda · {nD} derecha</span>
          <span style={{ fontSize: 11, color: estado.startsWith('No') ? '#b91c1c' : 'var(--text3)', marginLeft: 'auto' }}>{estado}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'flex-end' }}>
          <div><div style={lbl}>Unidades</div><select value={T.unit} onChange={e => setA({ unit: e.target.value })} style={input}><option value="N">N</option><option value="kg">kg</option><option value="Nm">N·m</option><option value="Nmkg">N·m/kg</option></select></div>
          <div><div style={lbl}>Brazo de palanca (m)</div><input type="number" step="0.01" min="0.1" max="0.8" key={'lv' + (aj.lever ?? '')} defaultValue={aj.lever ?? ''} placeholder="–" onBlur={e => { const v = num(e.target.value); setA({ lever: v && v > 0 ? v : null }) }} style={{ ...input, width: 80 }} /></div>
          <div><div style={lbl}>Peso corporal (kg)</div><input type="number" step="0.5" min="20" max="200" key={'bw' + (aj.bw ?? '')} defaultValue={aj.bw ?? ''} placeholder="–" onBlur={e => { const v = num(e.target.value); setA({ bw: v && v > 0 ? v : null }) }} style={{ ...input, width: 80 }} /></div>
        </div>
        <div><div style={lbl}>Notas (solo las ves tú)</div>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Posición, material, anclaje, cómo lo hizo…" style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
        <details open style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Lo que verá el deportista
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 500, fontSize: 12, color: visible ? 'var(--accent)' : 'var(--text3)' }} onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} /> {visible ? '👁 Visible en su portal' : 'Aún no se lo enseñamos'}
            </label>
          </summary>
          <div style={{ marginTop: 10 }}><div style={lbl}>Qué nos dice (una frase por línea)</div>
            <textarea value={inf.aSays || ''} onChange={e => setInf(x => ({ ...x, aSays: e.target.value }))} rows={3} placeholder={isoAutoSays(T, exName(nombre)).join('\n')} style={{ ...input, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} /></div>
        </details>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {tarjetaLado('I')}{tarjetaLado('D')}
        <div style={{ ...panel, display: 'grid', gap: 10, alignContent: 'start', gridColumn: 'span 2', minWidth: 300 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}><b style={{ fontSize: 15 }}>Asimetría</b><span style={{ fontSize: 11.5, color: 'var(--text3)' }}>← izquierda más fuerte · derecha más fuerte →</span></div>
          {filasAsim}
          <p style={{ fontSize: 11.5, color: 'var(--text2)', margin: 0 }}>{!pkA ? '' : pkA.pct < 1 ? 'Los dos lados están igualados en el pico. ' : `${SIDE[pkA.side].name} más fuerte en el pico, ${ifmt(pkA.pct, 1)} %. `}Pico y mejor segundo: franjas del 10 % y el 15 %. RFD: la zona gris es la variabilidad entre intentos y la asimetría solo cuenta si la supera.{U.warn ? ' ' + U.warn + '.' : ''}</p>
        </div>
      </div>

      <section style={panel}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <h3 style={{ fontSize: 14, margin: 0 }}>Curvas fuerza-tiempo alineadas al inicio de la contracción</h3>
          <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>La franja sombreada son los primeros 200 ms, donde se mide el RFD.</span>
        </div>
        <Curvas T={T} U={U} B={B} hl={hl} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 11.5, color: 'var(--text2)' }}>
          <span><i style={{ display: 'inline-block', width: 16, borderTop: `3px solid ${SIDE.I.c}`, marginRight: 5, verticalAlign: 'middle' }} />Izquierda · mejor intento</span>
          <span><i style={{ display: 'inline-block', width: 16, borderTop: `1.5px solid ${SIDE.I.c}`, marginRight: 5, verticalAlign: 'middle' }} />Izquierda · resto</span>
          <span><i style={{ display: 'inline-block', width: 16, borderTop: `3px solid ${SIDE.D.c}`, marginRight: 5, verticalAlign: 'middle' }} />Derecha · mejor intento</span>
          <span><i style={{ display: 'inline-block', width: 16, borderTop: `1.5px solid ${SIDE.D.c}`, marginRight: 5, verticalAlign: 'middle' }} />Derecha · resto</span>
          <span><i style={{ display: 'inline-block', width: 16, borderTop: '2px dashed var(--text3)', marginRight: 5, verticalAlign: 'middle' }} />Excluido o con aviso</span>
        </div>
      </section>

      <section style={panel}>
        <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Intentos</h3>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 8px' }}>En la columna Uso decides qué cuenta de cada intento: pico y RFD, solo pico, solo RFD o nada. Por defecto: intentos fallidos o con tirón al inicio, en Nada; rebote al inicio (tirón o holgura de la correa), en Solo pico; posible compensación, tirón tardío o curva cortada, en Solo RFD. Si al revisar la curva no estás de acuerdo con el aviso, cámbialo. Pasa el ratón por una fila para resaltar su curva.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={tabla}>
            <thead><tr>{['Uso', 'Lado', 'Intento'].map(h => <th key={h} style={{ ...th, textAlign: 'left' }}>{h}</th>)}{['Pretensión', 'Pico', 'Mejor 1 s', 'RFD 0-100', 'RFD 0-200', 'RFD pico'].map(h => <th key={h} style={th}>{h}</th>)}<th style={{ ...th, textAlign: 'left' }}>Avisos</th></tr></thead>
            <tbody>{ordenados.map(a => { const r = a.r; const mut = c => c ? {} : { color: 'var(--text3)' }; return (
              <tr key={a.id} onMouseEnter={() => setHl(a.id)} onMouseLeave={() => setHl(null)} style={{ background: hl === a.id ? 'var(--bg2)' : 'transparent', color: a.inc ? 'inherit' : 'var(--text3)' }}>
                <td style={{ ...td, textAlign: 'left' }}><select value={a.use} onChange={e => setA({ uso: { ...(aj.uso || {}), [a.id]: e.target.value } })} style={{ ...input, padding: '2px 5px', fontSize: 12 }}><option value="all">Pico y RFD</option><option value="max">Solo pico</option><option value="rfd">Solo RFD</option><option value="none">Nada</option></select></td>
                <td style={{ ...td, textAlign: 'left' }}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9, background: SIDE[a.side].c, marginRight: 5 }} /><select value={a.side} onChange={e => setA({ lado: { ...(aj.lado || {}), [a.id]: e.target.value } })} style={{ ...input, padding: '2px 5px', fontSize: 12 }}><option value="I">Izda</option><option value="D">Dcha</option></select></td>
                <td style={{ ...td, textAlign: 'left' }}>{a.name}{B[a.side].pk === a ? ' ★' : ''}</td>
                <td style={td}>{r.pre != null ? ifmt(U.f(r.pre), U.d) : '–'}</td>
                <td style={{ ...td, ...mut(USE_MAX(a.use)) }}>{ifmt(U.f(r.pk), U.d)}</td>
                <td style={{ ...td, ...mut(USE_MAX(a.use)) }}>{r.best1 != null ? ifmt(U.f(r.best1), U.d) : '–'}</td>
                <td style={{ ...td, ...mut(USE_RFD(a.use)) }}>{r.rfd100 != null ? ifmt(U.f(r.rfd100), 0) : '–'}</td>
                <td style={{ ...td, ...mut(USE_RFD(a.use)) }}>{r.rfd200 != null ? ifmt(U.f(r.rfd200), 0) : '–'}</td>
                <td style={{ ...td, ...mut(USE_RFD(a.use)) }}>{r.rfdPeak != null ? ifmt(U.f(r.rfdPeak), 0) : '–'}</td>
                <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: 200 }}>{r.flags.map(f => <span key={f.text} style={{ display: 'inline-block', fontSize: 11, color: '#a86a00', background: '#fdf1d8', padding: '1px 6px', borderRadius: 4, margin: '1px 3px 1px 0' }}>⚠ {f.text}</span>)}</td>
              </tr>) })}</tbody>
          </table>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: '8px 0 0' }}>Fuerza en {U.u}, RFD en {U.ru}. ★ = mejor intento válido del lado. En gris: valores que no cuentan según el uso elegido. «Pico» incluye el mejor segundo.</p>
      </section>
      <p style={{ fontSize: 11.5, color: 'var(--text3)', margin: 0, maxWidth: '80ch' }}>Cálculo: el inicio es el momento en que la fuerza supera la pretensión previa en 3 desviaciones estándar. RFD = fuerza ganada desde la pretensión ÷ tiempo. Asimetría = (lado fuerte − lado débil) ÷ lado fuerte, con el mejor intento válido de cada lado. En RFD no hay umbral fijo validado: solo se marca si supera el CV entre intentos. Haz al menos 3 intentos válidos por lado.</p>
    </div>
  )
}

const tabla = { borderCollapse: 'collapse', width: '100%', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }
const th = { fontSize: 10, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600, textAlign: 'right', padding: '5px 7px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'transparent' }
const td = { textAlign: 'right', padding: '5px 7px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'transparent' }

function Curvas({ T, U, B, hl }) {
  const [cursor, setCursor] = useState(null)
  const W = 760, H = 380, m = { l: 52, r: 12, t: 16, b: 44 }, iw = W - m.l - m.r, ih = H - m.t - m.b
  const T0 = -0.5, T1 = 3.5
  if (!T.attempts.length) return null
  const ymaxU = U.f(Math.max(...T.attempts.map(a => a.r.pk))) * 1.08
  const niceStep = x => { const p = Math.pow(10, Math.floor(Math.log10(x))), n = x / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p }
  const step = niceStep(ymaxU / 5), ymax = Math.ceil(ymaxU / step) * step
  const X = s => m.l + (s - T0) / (T1 - T0) * iw, Y = v => m.t + ih - v / ymax * ih
  const ys = []; for (let v = 0; v <= ymax + 1e-9; v += step) ys.push(v)
  const xs = []; for (let s = -0.5; s <= T1 + 1e-9; s += 0.5) xs.push(s)
  const isBest = a => B[a.side].pk === a
  const flagged = a => a.use !== 'all'
  const order = [...T.attempts].sort((a, b) => (isBest(a) - isBest(b)) || (flagged(b) - flagged(a)))
  const interp = (a, x) => { const t = a.t, w = a.w; if (x < t[0] || x > t[t.length - 1]) return null; let lo = 0, hi = t.length - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (t[md] <= x) lo = md; else hi = md } return w[lo] + (w[hi] - w[lo]) * (x - t[lo]) / (t[hi] - t[lo]) }
  const mover = e => { const r = e.currentTarget.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width; if (px < m.l || px > m.l + iw) { setCursor(null); return } setCursor({ px, s: T0 + (px - m.l) / iw * (T1 - T0), left: e.clientX - r.left, ancho: r.width }) }
  return (
    <div style={{ position: 'relative', margin: '6px 0' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} onPointerMove={mover} onPointerLeave={() => setCursor(null)} role="img" aria-label="Curvas fuerza-tiempo alineadas">
        <rect x={X(0)} y={m.t} width={X(0.2) - X(0)} height={ih} fill="#2a78d612" />
        {ys.map(v => <g key={'y' + v}><line x1={m.l} x2={m.l + iw} y1={Y(v)} y2={Y(v)} stroke="var(--border)" /><text x={m.l - 8} y={Y(v) + 4} textAnchor="end" fontSize="12" fill="var(--text3)">{ifmt(v, step < 1 ? 1 : 0)}</text></g>)}
        {xs.map(s => <text key={'x' + s} x={X(s)} y={H - m.b + 18} textAnchor="middle" fontSize="12" fill="var(--text3)">{ifmt(s, 1)}</text>)}
        <line x1={X(0)} x2={X(0)} y1={m.t} y2={m.t + ih} stroke="var(--text3)" strokeDasharray="3 3" />
        <text x={m.l + iw / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--text2)">Tiempo desde el inicio de la contracción (s)</text>
        <text transform={`translate(14 ${m.t + ih / 2}) rotate(-90)`} textAnchor="middle" fontSize="12" fill="var(--text2)">Fuerza ({U.u})</text>
        {order.map(a => {
          let d = ''
          for (let i = 0; i < a.t.length; i++) { const s = a.t[i] - a.r.t0; if (s < T0 || s > T1) continue; d += (d ? 'L' : 'M') + X(s).toFixed(1) + ' ' + Y(U.f(a.w[i])).toFixed(1) }
          const best = isBest(a) && a.inc, fl = flagged(a), on = hl === a.id
          return <path key={a.id} d={d} fill="none" stroke={fl ? 'var(--text3)' : SIDE[a.side].c} strokeWidth={on ? 3.5 : best ? 3 : 1.5} strokeDasharray={fl ? '5 4' : undefined} opacity={hl && !on ? 0.25 : best || fl ? 1 : 0.55} strokeLinejoin="round" />
        })}
        {cursor && <line x1={cursor.px} x2={cursor.px} y1={m.t} y2={m.t + ih} stroke="var(--text2)" />}
      </svg>
      {cursor && (
        <div style={{ position: 'absolute', top: 8, left: cursor.left > cursor.ancho / 2 ? undefined : cursor.left + 12, right: cursor.left > cursor.ancho / 2 ? cursor.ancho - cursor.left + 12 : undefined, pointerEvents: 'none', background: '#1f2a24', color: '#fff', fontSize: 12, padding: '7px 10px', borderRadius: 6, whiteSpace: 'nowrap' }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', opacity: .75 }}><span>{ifmt(cursor.s, 2)} s</span><span>{U.u}</span></div>
          {T.attempts.map(a => { const v = interp(a, a.r.t0 + cursor.s); return v == null ? null : <div key={a.id} style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}><span>{SIDE[a.side].short} {a.name}{a.inc ? '' : ' (excl.)'}</span><b>{ifmt(U.f(v), U.d)}</b></div> })}
        </div>
      )}
    </div>
  )
}
