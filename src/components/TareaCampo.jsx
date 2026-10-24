/**
 * TareaCampo — dibujo de tareas de campo (sprints, cambios de dirección,
 * tareas con balón…).
 *
 * El dibujo (sesion_ejercicios.diagrama / ejercicios_biblioteca.diagrama):
 *   {
 *     v: 1,
 *     fondo: { tipo, ancho, alto, opacidad, rejilla },
 *     elementos: [ ... ],          // coordenadas en METROS
 *     presc: { intensidad, recup_series }   // prescripción extra
 *   }
 * Elementos:
 *   objeto:  { id, tipo: 'cono'|'atleta'|…, x, y, rot, escala, opacidad, color, texto? }
 *   zona:    { id, tipo: 'zona', x, y, w, h, rot, color, opacidad, discontinua }
 *   flecha:  { id, tipo: 'flecha', estilo, p0, p1, c?, color, grosor, opacidad, verMedida }
 *   medida:  { id, tipo: 'medida', p0, p1, valor, color, opacidad }
 *
 * Exporta:
 *   DiagramaCampo   — dibujo de solo lectura (miniaturas, vista del cliente)
 *   metricasDiagrama — metros por repetición y cambios de dirección
 *   nuevoDiagrama
 *   default EditorTareaCampo — editor a pantalla completa
 */
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

/* ── Fondos ─────────────────────────────────────────────────────────────── */
export const FONDOS = [
  { k: 'cuadricula', label: 'Cuadrícula', ancho: 30, alto: 20, editable: true, grupo: 'Liso' },
  { k: 'blanco',     label: 'Blanco',     ancho: 30, alto: 20, editable: true, grupo: 'Liso' },
  { k: 'cesped',     label: 'Césped',     ancho: 40, alto: 30, editable: true, grupo: 'Liso' },
  { k: 'campo',      label: 'Campo fútbol', ancho: 105, alto: 68, grupo: 'Fútbol' },
  { k: 'medio',      label: 'Medio campo',  ancho: 52.5, alto: 68, grupo: 'Fútbol' },
  { k: 'area',       label: 'Área',         ancho: 44, alto: 30, grupo: 'Fútbol' },
  { k: 'futsal',     label: 'Fútbol sala',  ancho: 40, alto: 20, grupo: 'Otros deportes' },
  { k: 'baloncesto', label: 'Baloncesto',   ancho: 28, alto: 15, grupo: 'Otros deportes' },
  { k: 'tenis',      label: 'Tenis',        ancho: 36.6, alto: 18.3, grupo: 'Otros deportes' },
  { k: 'padel',      label: 'Pádel',        ancho: 22, alto: 12, grupo: 'Otros deportes' },
  { k: 'pista',      label: 'Pista atletismo (recta)', ancho: 110, alto: 12, grupo: 'Otros deportes' },
]
const fondoDef = k => FONDOS.find(f => f.k === k) || FONDOS[0]

export function nuevoDiagrama(tipo = 'cuadricula') {
  const f = fondoDef(tipo)
  return { v: 1, fondo: { tipo: f.k, ancho: f.ancho, alto: f.alto, opacidad: 1, rejilla: f.k === 'cuadricula' }, elementos: [], presc: {} }
}

/* ── Paleta ─────────────────────────────────────────────────────────────── */
export const OBJETOS = [
  { k: 'atleta',       label: 'Deportista',   color: '#E0481F' },
  { k: 'jugador',      label: 'Jugador',      color: '#2563eb' },
  { k: 'cono',         label: 'Cono',         color: '#f97316' },
  { k: 'seta',         label: 'Seta',         color: '#facc15' },
  { k: 'pica',         label: 'Pica',         color: '#eab308' },
  { k: 'valla',        label: 'Valla',        color: '#ef4444' },
  { k: 'escalera',     label: 'Escalera',     color: '#f59e0b' },
  { k: 'foto',         label: 'Fotocélula',   color: '#0ea5e9' },
  { k: 'balon',        label: 'Balón',        color: '#ffffff' },
  { k: 'porteria',     label: 'Portería',     color: '#ffffff' },
  { k: 'miniporteria', label: 'Miniportería', color: '#ffffff' },
  { k: 'maniqui',      label: 'Maniquí',      color: '#374151' },
  { k: 'texto',        label: 'Texto',        color: '#111827' },
  { k: 'zona',         label: 'Zona',         color: '#3b82f6' },
]
export const ESTILOS = [
  { k: 'sprint',  label: 'Sprint',            color: '#1f2d8a', cuenta: true },
  { k: 'trote',   label: 'Trote',             color: '#1f2d8a', cuenta: true },
  { k: 'andar',   label: 'Andar / recuperar', color: '#6b7280', cuenta: false },
  { k: 'balon',   label: 'Conducción',        color: '#111827', cuenta: true },
  { k: 'lateral', label: 'Lateral',           color: '#7c3aed', cuenta: true },
  { k: 'espalda', label: 'De espaldas',       color: '#0f766e', cuenta: true },
  { k: 'pase',    label: 'Pase',              color: '#111827', cuenta: false },
]
const COLORES = ['#E0481F', '#2563eb', '#1f2d8a', '#16a34a', '#facc15', '#f97316', '#ef4444', '#8b5cf6', '#111827', '#6b7280', '#ffffff']

/* ── Geometría ──────────────────────────────────────────────────────────── */
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
function puntoCurva(f, t) {
  const { p0, p1, c } = f
  if (!c) return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t }
  const u = 1 - t
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y }
}
function largoCurva(f) {
  if (!f.c) return dist(f.p0, f.p1)
  let L = 0, prev = f.p0
  for (let i = 1; i <= 40; i++) { const p = puntoCurva(f, i / 40); L += dist(prev, p); prev = p }
  return L
}
const fmtM = m => (m >= 100 ? Math.round(m) : Math.round(m * 2) / 2).toLocaleString('es-ES') + ' m'
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
// Tamaño base de los iconos según el tamaño del terreno
const unidad = fondo => Math.max(fondo.ancho, fondo.alto) / 32

/** Metros por repetición (flechas que cuentan) y cambios de dirección */
export function metricasDiagrama(d) {
  const fl = (d?.elementos || []).filter(e => e.tipo === 'flecha')
  const cuentan = fl.filter(f => ESTILOS.find(s => s.k === f.estilo)?.cuenta !== false)
  const metros = cuentan.reduce((a, f) => a + largoCurva(f), 0)
  const u = unidad(d?.fondo || { ancho: 30, alto: 20 })
  const angulos = []
  cuentan.forEach(a => cuentan.forEach(b => {
    if (a === b || dist(a.p1, b.p0) > Math.max(1.2, u * 1.2)) return
    const ea = puntoCurva(a, 0.95), da = { x: a.p1.x - ea.x, y: a.p1.y - ea.y }
    const sb = puntoCurva(b, 0.05), db = { x: sb.x - b.p0.x, y: sb.y - b.p0.y }
    const ang = Math.abs(Math.atan2(da.x * db.y - da.y * db.x, da.x * db.x + da.y * db.y)) * 180 / Math.PI
    if (ang >= 30) angulos.push(Math.round(ang / 45) * 45)
  }))
  return { metros, cod: angulos.length, angulos }
}

/* ── Fondos dibujados ───────────────────────────────────────────────────── */
const LINEA = { fill: 'none', stroke: '#fff', strokeWidth: 0.12 }
function Rayas({ W, H, n = 12, c1 = '#3f8f3a', c2 = '#47a041' }) {
  const w = W / n
  return <>{Array.from({ length: n }, (_, i) => <rect key={i} x={i * w} y={0} width={w + 0.01} height={H} fill={i % 2 ? c1 : c2} />)}</>
}
function AreaFutbol({ x, y, dir, W }) {
  // dir: 1 = portería a la izquierda (abre a la derecha), -1 = a la derecha. y: centro
  const X = v => x + v * dir
  const pa = 16.5, pw = 40.32, ga = 5.5, gw = 18.32
  return (
    <g {...LINEA}>
      <rect x={Math.min(X(0), X(pa))} y={y - pw / 2} width={pa} height={pw} />
      <rect x={Math.min(X(0), X(ga))} y={y - gw / 2} width={ga} height={gw} />
      <circle cx={X(11)} cy={y} r={0.2} fill="#fff" />
      <path d={`M ${X(16.5)} ${y - 7.31} A 9.15 9.15 0 0 ${dir === 1 ? 1 : 0} ${X(16.5)} ${y + 7.31}`} />
      <rect x={Math.min(X(0), X(-1.8))} y={y - 3.66} width={1.8} height={7.32} fill="rgba(255,255,255,.25)" />
    </g>
  )
}
function FondoSVG({ fondo }) {
  const { tipo, ancho: W, alto: H } = fondo
  switch (tipo) {
    case 'blanco': return <rect width={W} height={H} fill="#fff" stroke="#d1d5db" strokeWidth={W / 400} />
    case 'cuadricula': return <rect width={W} height={H} fill="#fff" stroke="#d1d5db" strokeWidth={W / 400} />
    case 'cesped': return <Rayas W={W} H={H} n={Math.max(6, Math.round(W / 5))} />
    case 'campo': return (
      <g>
        <Rayas W={W} H={H} n={14} />
        <g {...LINEA}>
          <rect width={W} height={H} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
          <circle cx={W / 2} cy={H / 2} r={9.15} />
          <circle cx={W / 2} cy={H / 2} r={0.25} fill="#fff" />
        </g>
        <AreaFutbol x={0} y={H / 2} dir={1} />
        <AreaFutbol x={W} y={H / 2} dir={-1} />
      </g>
    )
    case 'medio': return (
      <g>
        <Rayas W={W} H={H} n={7} />
        <g {...LINEA}>
          <rect width={W} height={H} />
          <path d={`M ${W} ${H / 2 - 9.15} A 9.15 9.15 0 0 0 ${W} ${H / 2 + 9.15}`} />
        </g>
        <AreaFutbol x={0} y={H / 2} dir={1} />
      </g>
    )
    case 'area': {
      const cx = W / 2
      return (
        <g>
          <Rayas W={W} H={H} n={8} />
          <g {...LINEA}>
            <line x1={0} y1={0} x2={W} y2={0} />
            <rect x={cx - 20.16} y={0} width={40.32} height={16.5} />
            <rect x={cx - 9.16} y={0} width={18.32} height={5.5} />
            <circle cx={cx} cy={11} r={0.2} fill="#fff" />
            <path d={`M ${cx - 7.31} 16.5 A 9.15 9.15 0 0 0 ${cx + 7.31} 16.5`} />
            <rect x={cx - 3.66} y={-1.2} width={7.32} height={1.2} fill="rgba(255,255,255,.3)" />
          </g>
        </g>
      )
    }
    case 'futsal': return (
      <g>
        <rect width={W} height={H} fill="#2f6fb3" />
        <g {...LINEA}>
          <rect width={W} height={H} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
          <circle cx={W / 2} cy={H / 2} r={3} />
          <path d={`M 0 ${H / 2 - 7.58} A 6 6 0 0 1 6 ${H / 2 - 1.58} L 6 ${H / 2 + 1.58} A 6 6 0 0 1 0 ${H / 2 + 7.58}`} />
          <path d={`M ${W} ${H / 2 - 7.58} A 6 6 0 0 0 ${W - 6} ${H / 2 - 1.58} L ${W - 6} ${H / 2 + 1.58} A 6 6 0 0 0 ${W} ${H / 2 + 7.58}`} />
          <circle cx={6} cy={H / 2} r={0.15} fill="#fff" /><circle cx={W - 6} cy={H / 2} r={0.15} fill="#fff" />
        </g>
      </g>
    )
    case 'baloncesto': {
      const b = 1.575, r3 = 6.75
      const tres = dir => {
        const x0 = dir === 1 ? 0 : W, X = v => x0 + v * dir
        const yC = H / 2, dy = H / 2 - 0.9, dx = Math.sqrt(Math.max(0, r3 * r3 - dy * dy))
        return <path d={`M ${X(0)} ${0.9} L ${X(b + dx)} ${0.9} A ${r3} ${r3} 0 0 ${dir === 1 ? 1 : 0} ${X(b + dx)} ${H - 0.9} L ${X(0)} ${H - 0.9}`} key={dir} data-y={yC} />
      }
      return (
        <g>
          <rect width={W} height={H} fill="#d9a066" />
          <g {...LINEA} stroke="#fff">
            <rect width={W} height={H} />
            <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
            <circle cx={W / 2} cy={H / 2} r={1.8} />
            <rect x={0} y={H / 2 - 2.45} width={5.8} height={4.9} fill="rgba(192,57,43,.35)" />
            <rect x={W - 5.8} y={H / 2 - 2.45} width={5.8} height={4.9} fill="rgba(192,57,43,.35)" />
            <circle cx={5.8} cy={H / 2} r={1.8} /><circle cx={W - 5.8} cy={H / 2} r={1.8} />
            {tres(1)}{tres(-1)}
            <circle cx={b} cy={H / 2} r={0.23} stroke="#f97316" /><circle cx={W - b} cy={H / 2} r={0.23} stroke="#f97316" />
          </g>
        </g>
      )
    }
    case 'tenis': {
      const L = 23.77, D = 10.97, S = 8.23, x0 = (W - L) / 2, y0 = (H - D) / 2, ys = (H - S) / 2
      return (
        <g>
          <rect width={W} height={H} fill="#3a7d5c" />
          <rect x={x0} y={y0} width={L} height={D} fill="#2f6fb3" />
          <g {...LINEA}>
            <rect x={x0} y={y0} width={L} height={D} />
            <line x1={x0} y1={ys} x2={x0 + L} y2={ys} /><line x1={x0} y1={ys + S} x2={x0 + L} y2={ys + S} />
            <line x1={W / 2 - 6.4} y1={ys} x2={W / 2 - 6.4} y2={ys + S} /><line x1={W / 2 + 6.4} y1={ys} x2={W / 2 + 6.4} y2={ys + S} />
            <line x1={W / 2 - 6.4} y1={H / 2} x2={W / 2 + 6.4} y2={H / 2} />
            <line x1={W / 2} y1={y0 - 0.9} x2={W / 2} y2={y0 + D + 0.9} strokeWidth={0.2} stroke="#e5e7eb" />
          </g>
        </g>
      )
    }
    case 'padel': {
      const x0 = 1, y0 = 1, L = 20, A = 10
      return (
        <g>
          <rect width={W} height={H} fill="#1e3a5f" />
          <rect x={x0} y={y0} width={L} height={A} fill="#2563a8" />
          <g {...LINEA}>
            <rect x={x0} y={y0} width={L} height={A} />
            <line x1={x0 + L / 2 - 6.95} y1={y0} x2={x0 + L / 2 - 6.95} y2={y0 + A} />
            <line x1={x0 + L / 2 + 6.95} y1={y0} x2={x0 + L / 2 + 6.95} y2={y0 + A} />
            <line x1={x0 + L / 2 - 6.95} y1={y0 + A / 2} x2={x0 + L / 2 + 6.95} y2={y0 + A / 2} />
            <line x1={x0 + L / 2} y1={y0 - 0.4} x2={x0 + L / 2} y2={y0 + A + 0.4} strokeWidth={0.2} stroke="#e5e7eb" />
          </g>
        </g>
      )
    }
    case 'pista': {
      const y0 = 1.12, c = 1.22
      return (
        <g>
          <rect width={W} height={H} fill="#b5482f" />
          <g {...LINEA} strokeWidth={0.06}>
            {Array.from({ length: 9 }, (_, i) => <line key={i} x1={0} y1={y0 + i * c} x2={W} y2={y0 + i * c} />)}
            <line x1={5} y1={y0} x2={5} y2={y0 + 8 * c} strokeWidth={0.15} />
            <line x1={105} y1={y0} x2={105} y2={y0 + 8 * c} strokeWidth={0.15} />
          </g>
          {Array.from({ length: 8 }, (_, i) => <text key={i} x={2.5} y={y0 + i * c + c * 0.72} fontSize={0.7} fill="#fff" textAnchor="middle" fontWeight="700">{i + 1}</text>)}
        </g>
      )
    }
    default: return <rect width={W} height={H} fill="#fff" />
  }
}
function Rejilla({ fondo, fuerte }) {
  const { ancho: W, alto: H } = fondo
  const paso = W > 60 ? 5 : 1
  const lin = []
  for (let x = 0; x <= W + 0.001; x += paso) lin.push(<line key={'x' + x} x1={x} y1={0} x2={x} y2={H} strokeWidth={Math.round(x) % (paso * 5) === 0 ? W / 500 : W / 1100} />)
  for (let y = 0; y <= H + 0.001; y += paso) lin.push(<line key={'y' + y} x1={0} y1={y} x2={W} y2={y} strokeWidth={Math.round(y) % (paso * 5) === 0 ? W / 500 : W / 1100} />)
  const et = []
  for (let x = paso * 5; x < W; x += paso * 5) et.push(<text key={'tx' + x} x={x} y={-W / 160} fontSize={W / 70} textAnchor="middle" fill="#9ca3af">{x}</text>)
  for (let y = paso * 5; y < H; y += paso * 5) et.push(<text key={'ty' + y} x={-W / 160} y={y + W / 220} fontSize={W / 70} textAnchor="end" fill="#9ca3af">{y}</text>)
  return <g><g stroke={fuerte ? '#cbd5e1' : 'rgba(255,255,255,.45)'}>{lin}</g>{fuerte && et}</g>
}

/* ── Iconos (unidad 1 = tamaño base) ────────────────────────────────────── */
function oscurecer(hex, f = 0.65) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#333'
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`
}
export function IconoObjeto({ e }) {
  const c = e.color || OBJETOS.find(o => o.k === e.tipo)?.color || '#333'
  const sw = 0.06
  switch (e.tipo) {
    case 'cono': return <g><ellipse cx={0} cy={0.38} rx={0.5} ry={0.12} fill={oscurecer(c)} /><polygon points="-0.4,0.38 0.4,0.38 0,-0.5" fill={c} stroke={oscurecer(c)} strokeWidth={sw} /><line x1={-0.22} y1={0.02} x2={0.22} y2={0.02} stroke="#fff" strokeWidth={0.09} /></g>
    case 'seta': return <g><circle r={0.42} fill={c} stroke={oscurecer(c)} strokeWidth={sw} /><circle r={0.13} fill="rgba(255,255,255,.75)" /></g>
    case 'pica': return <g><ellipse cx={0} cy={0.45} rx={0.22} ry={0.08} fill="#555" /><rect x={-0.06} y={-0.85} width={0.12} height={1.3} rx={0.05} fill={c} stroke={oscurecer(c)} strokeWidth={0.03} /></g>
    case 'valla': return <g><rect x={-0.65} y={-0.1} width={1.3} height={0.2} rx={0.05} fill={c} stroke={oscurecer(c)} strokeWidth={sw} /><rect x={-0.7} y={-0.2} width={0.1} height={0.4} fill="#555" /><rect x={0.6} y={-0.2} width={0.1} height={0.4} fill="#555" /></g>
    case 'escalera': return <g fill="none" stroke={c} strokeWidth={0.08}><rect x={-0.4} y={-1.6} width={0.8} height={3.2} />{Array.from({ length: 7 }, (_, i) => <line key={i} x1={-0.4} x2={0.4} y1={-1.6 + (i + 1) * 0.4} y2={-1.6 + (i + 1) * 0.4} />)}</g>
    case 'foto': return <g><line x1={0} y1={0} x2={1.4} y2={0} stroke={c} strokeWidth={0.05} strokeDasharray="0.12 0.1" /><rect x={-0.16} y={-0.32} width={0.32} height={0.64} rx={0.08} fill={c} stroke={oscurecer(c)} strokeWidth={0.04} /><circle cx={0} cy={-0.12} r={0.08} fill="#fff" /></g>
    case 'balon': return <g><circle r={0.3} fill="#fff" stroke="#111" strokeWidth={0.05} /><polygon points="0,-0.12 0.11,-0.04 0.07,0.1 -0.07,0.1 -0.11,-0.04" fill="#111" /></g>
    case 'porteria': return <g><rect x={-1.25} y={-0.45} width={2.5} height={0.45} fill="rgba(255,255,255,.35)" stroke={c} strokeWidth={0.1} /><g stroke="rgba(255,255,255,.6)" strokeWidth={0.02}>{Array.from({ length: 9 }, (_, i) => <line key={i} x1={-1.25 + (i + 1) * 0.25} y1={-0.45} x2={-1.25 + (i + 1) * 0.25} y2={0} />)}</g><line x1={-1.25} y1={0} x2={1.25} y2={0} stroke={c} strokeWidth={0.14} /></g>
    case 'miniporteria': return <g><rect x={-0.6} y={-0.35} width={1.2} height={0.35} fill="rgba(255,255,255,.35)" stroke={c} strokeWidth={0.08} /><line x1={-0.6} y1={0} x2={0.6} y2={0} stroke={c} strokeWidth={0.12} /></g>
    case 'maniqui': return <g><ellipse cx={0} cy={0.15} rx={0.42} ry={0.24} fill={c} /><circle cx={0} cy={-0.18} r={0.2} fill={oscurecer(c, 0.8)} /></g>
    case 'jugador': return <g><circle r={0.48} fill={c} stroke="#fff" strokeWidth={0.08} />{e.texto != null && e.texto !== '' && <text y={0.17} fontSize={0.48} fontWeight="800" textAnchor="middle" fill={c === '#ffffff' || c === '#facc15' ? '#111' : '#fff'}>{e.texto}</text>}</g>
    case 'atleta': return <g stroke={c} strokeWidth={0.14} strokeLinecap="round" fill="none"><circle cx={0} cy={-0.62} r={0.17} fill={c} stroke="none" /><path d="M0 -0.42 L0 0.12 M-0.34 -0.22 L0.34 -0.22 M0 0.12 L-0.26 0.6 M0 0.12 L0.26 0.6" />{e.texto ? <text y={1.05} fontSize={0.4} fontWeight="700" textAnchor="middle" fill={c} stroke="none">{e.texto}</text> : null}</g>
    case 'texto': return <text y={0.18} fontSize={0.55} fontWeight="700" textAnchor="middle" fill={c} style={{ paintOrder: 'stroke' }} stroke="rgba(255,255,255,.85)" strokeWidth={0.12}>{e.texto || 'Texto'}</text>
    default: return <circle r={0.3} fill={c} />
  }
}

/* ── Flechas y medidas ──────────────────────────────────────────────────── */
function trazoFlecha(f) {
  const pts = []
  const N = 60, L = largoCurva(f)
  for (let i = 0; i <= N; i++) pts.push(puntoCurva(f, i / N))
  if (f.estilo === 'balon' || f.estilo === 'lateral') {
    const amp = f.estilo === 'balon' ? 0.22 : 0.3
    const ondas = Math.max(2, Math.round(L / (f.estilo === 'balon' ? 1.1 : 0.9)))
    const out = pts.map((p, i) => {
      if (i === 0 || i >= N - 3) return p
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)]
      const dx = b.x - a.x, dy = b.y - a.y, n = Math.hypot(dx, dy) || 1
      const s = f.estilo === 'balon' ? Math.sin(i / N * ondas * Math.PI * 2) : ((i % 4) < 2 ? 1 : -1)
      return { x: p.x - dy / n * amp * s, y: p.y + dx / n * amp * s }
    })
    return 'M ' + out.map(p => `${p.x.toFixed(3)} ${p.y.toFixed(3)}`).join(' L ')
  }
  return f.c ? `M ${f.p0.x} ${f.p0.y} Q ${f.c.x} ${f.c.y} ${f.p1.x} ${f.p1.y}` : `M ${f.p0.x} ${f.p0.y} L ${f.p1.x} ${f.p1.y}`
}
const DASH = { trote: '0.7 0.45', andar: '0.12 0.35', espalda: '0.9 0.3 0.15 0.3', pase: null }
function Etiqueta({ x, y, texto, color, u }) {
  const fs = u * 0.5, w = Math.max(texto.length * fs * 0.56 + fs * 0.7, fs * 2.2)
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-fs * 0.78} width={w} height={fs * 1.45} rx={fs * 0.72} fill="#fff" stroke={color} strokeWidth={fs * 0.09} />
      <text y={fs * 0.32} fontSize={fs} fontWeight="800" textAnchor="middle" fill={color}>{texto}</text>
    </g>
  )
}
function Flecha({ f, u }) {
  const color = f.color || ESTILOS.find(s => s.k === f.estilo)?.color || '#1f2d8a'
  const g = (f.grosor || 1) * u * (f.estilo === 'sprint' ? 0.16 : f.estilo === 'andar' || f.estilo === 'pase' ? 0.08 : 0.11)
  const e = puntoCurva(f, 0.96), dx = f.p1.x - e.x, dy = f.p1.y - e.y, n = Math.hypot(dx, dy) || 1
  const ah = Math.max(g * 3.2, u * 0.45), ux = dx / n, uy = dy / n
  const punta = `${f.p1.x},${f.p1.y} ${f.p1.x - ux * ah - uy * ah * 0.55},${f.p1.y - uy * ah + ux * ah * 0.55} ${f.p1.x - ux * ah + uy * ah * 0.55},${f.p1.y - uy * ah - ux * ah * 0.55}`
  const mid = puntoCurva(f, 0.5)
  const dash = DASH[f.estilo]
  return (
    <g opacity={f.opacidad ?? 1}>
      <path d={trazoFlecha(f)} fill="none" stroke={color} strokeWidth={g} strokeDasharray={dash ? dash.split(' ').map(v => v * u).join(' ') : undefined} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={punta} fill={color} />
      {f.verMedida && <Etiqueta x={mid.x - uy * u * 0.7} y={mid.y + ux * u * 0.7} texto={fmtM(largoCurva(f))} color={color} u={u} />}
    </g>
  )
}
function Medida({ m, u }) {
  const color = m.color || '#111827'
  const dx = m.p1.x - m.p0.x, dy = m.p1.y - m.p0.y, n = Math.hypot(dx, dy) || 1
  const px = -dy / n * u * 0.3, py = dx / n * u * 0.3
  const txt = m.valor != null && m.valor !== '' ? `${m.valor}${/[a-z%"']$/i.test(String(m.valor)) ? '' : ' m'}` : fmtM(n)
  const sw = u * 0.06
  return (
    <g opacity={m.opacidad ?? 1}>
      <line x1={m.p0.x} y1={m.p0.y} x2={m.p1.x} y2={m.p1.y} stroke={color} strokeWidth={sw} />
      <line x1={m.p0.x - px} y1={m.p0.y - py} x2={m.p0.x + px} y2={m.p0.y + py} stroke={color} strokeWidth={sw * 1.4} />
      <line x1={m.p1.x - px} y1={m.p1.y - py} x2={m.p1.x + px} y2={m.p1.y + py} stroke={color} strokeWidth={sw * 1.4} />
      <Etiqueta x={(m.p0.x + m.p1.x) / 2} y={(m.p0.y + m.p1.y) / 2} texto={txt} color={color} u={u} />
    </g>
  )
}
function Elemento({ e, u }) {
  if (e.tipo === 'flecha') return <Flecha f={e} u={u} />
  if (e.tipo === 'medida') return <Medida m={e} u={u} />
  if (e.tipo === 'zona') {
    const c = e.color || '#3b82f6'
    return (
      <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot || 0})`} opacity={e.opacidad ?? 1}>
        <rect x={-e.w / 2} y={-e.h / 2} width={e.w} height={e.h} fill={e.discontinua ? 'none' : c + '33'} stroke={c} strokeWidth={u * 0.07} strokeDasharray={e.discontinua ? `${u * 0.4} ${u * 0.25}` : undefined} />
        {e.texto ? <text y={-e.h / 2 + u * 0.7} fontSize={u * 0.5} fontWeight="700" textAnchor="middle" fill={c}>{e.texto}</text> : null}
      </g>
    )
  }
  return (
    <g transform={`translate(${e.x} ${e.y}) rotate(${e.rot || 0}) scale(${(e.escala || 1) * u})`} opacity={e.opacidad ?? 1}>
      <IconoObjeto e={e} />
    </g>
  )
}

/* ── Dibujo de solo lectura ─────────────────────────────────────────────── */
export function DiagramaCampo({ diagrama, style, className }) {
  const d = diagrama || nuevoDiagrama()
  const f = d.fondo, u = unidad(f), mg = Math.max(f.ancho, f.alto) * 0.035
  return (
    <svg viewBox={`${-mg} ${-mg} ${f.ancho + 2 * mg} ${f.alto + 2 * mg}`} className={className}
      style={{ display: 'block', width: '100%', height: 'auto', background: '#f3f4f6', borderRadius: 8, fontFamily: 'Inter, system-ui, sans-serif', ...style }}>
      <g opacity={f.opacidad ?? 1}><FondoSVG fondo={f} /></g>
      {(f.rejilla) && <Rejilla fondo={f} fuerte={f.tipo === 'cuadricula' || f.tipo === 'blanco'} />}
      {(d.elementos || []).map(e => <Elemento key={e.id} e={e} u={u} />)}
    </svg>
  )
}

/* ── Editor ─────────────────────────────────────────────────────────────── */
const btn = (activo, extra) => ({
  padding: '5px 9px', fontSize: 11.5, borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${activo ? 'var(--accent, #2d6a4f)' : 'var(--border, #e5e7eb)'}`,
  background: activo ? 'var(--accent, #2d6a4f)' : 'var(--bg, #fff)', color: activo ? '#fff' : 'var(--text, #111)',
  fontWeight: activo ? 650 : 500, ...extra,
})
const lbl = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3, #9ca3af)', margin: '10px 0 5px' }

function Deslizador({ label, value, min, max, step, onChange, fmt }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, margin: '5px 0' }}>
      <span style={{ width: 64, color: 'var(--text2, #555)' }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ flex: 1 }} />
      <span style={{ width: 40, textAlign: 'right', fontFamily: 'var(--mono, monospace)', fontSize: 11 }}>{fmt ? fmt(value) : value}</span>
    </label>
  )
}

export default function EditorTareaCampo({ inicial, titulo, onGuardar, onCerrar }) {
  const [d, setD] = useState(() => {
    const base = inicial && inicial.fondo ? inicial : nuevoDiagrama()
    return { ...base, elementos: [...(base.elementos || [])] }
  })
  const [sel, setSel] = useState([])
  const [herr, setHerr] = useState('mover')      // 'mover' | objeto | 'flecha:<estilo>' | 'medida'
  const [pestana, setPestana] = useState('elementos')
  const [ajustar, setAjustar] = useState(true)
  const [medidasAuto, setMedidasAuto] = useState(true)
  const [marco, setMarco] = useState(null)       // selección por recuadro
  const [guardando, setGuardando] = useState(false)
  const svgRef = useRef(null)
  const arrastre = useRef(null)
  const historia = useRef({ pasado: [], futuro: [] })
  const portapapeles = useRef([])
  const dRef = useRef(d); dRef.current = d
  const valorRef = useRef(null)

  const f = d.fondo, u = unidad(f), mg = Math.max(f.ancho, f.alto) * 0.035
  const elemSel = d.elementos.filter(e => sel.includes(e.id))
  const uno = elemSel.length === 1 ? elemSel[0] : null
  const met = useMemo(() => metricasDiagrama(d), [d])

  const snap = useCallback(v => (ajustar ? Math.round(v * 2) / 2 : Math.round(v * 100) / 100), [ajustar])
  const recordar = useCallback(prev => { historia.current.pasado.push(prev); if (historia.current.pasado.length > 80) historia.current.pasado.shift(); historia.current.futuro = [] }, [])
  const cambiar = useCallback(fn => setD(prev => { const next = fn(prev); if (next !== prev) recordar(prev); return next }), [recordar])
  const editarSel = (campos) => cambiar(p => ({ ...p, elementos: p.elementos.map(e => sel.includes(e.id) ? { ...e, ...(typeof campos === 'function' ? campos(e) : campos) } : e) }))

  function deshacer() { const h = historia.current; if (!h.pasado.length) return; h.futuro.push(dRef.current); setD(h.pasado.pop()) }
  function rehacer() { const h = historia.current; if (!h.futuro.length) return; h.pasado.push(dRef.current); setD(h.futuro.pop()) }

  function punto(ev) {
    const svg = svgRef.current; const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY
    const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return { x: p.x, y: p.y }
  }
  const mover = (e, dx, dy) => {
    if (e.tipo === 'flecha' || e.tipo === 'medida') {
      const m = p => ({ x: p.x + dx, y: p.y + dy })
      return { ...e, p0: m(e.p0), p1: m(e.p1), ...(e.c ? { c: m(e.c) } : {}) }
    }
    return { ...e, x: e.x + dx, y: e.y + dy }
  }
  function duplicados(ids, desfase) {
    const nuevos = dRef.current.elementos.filter(e => ids.includes(e.id)).map(e => ({ ...mover(e, desfase, desfase), id: uid() }))
    return nuevos
  }
  function duplicar() {
    if (!sel.length) return
    const nuevos = duplicados(sel, u)
    cambiar(p => ({ ...p, elementos: [...p.elementos, ...nuevos] }))
    setSel(nuevos.map(n => n.id))
  }
  function copiar() { portapapeles.current = dRef.current.elementos.filter(e => sel.includes(e.id)) }
  function pegar() {
    if (!portapapeles.current.length) return
    const nuevos = portapapeles.current.map(e => ({ ...mover(e, u, u), id: uid() }))
    portapapeles.current = nuevos
    cambiar(p => ({ ...p, elementos: [...p.elementos, ...nuevos] })); setSel(nuevos.map(n => n.id))
  }
  function eliminar() { if (!sel.length) return; cambiar(p => ({ ...p, elementos: p.elementos.filter(e => !sel.includes(e.id)) })); setSel([]) }
  function girar(g) {
    editarSel(e => {
      if (e.tipo === 'flecha' || e.tipo === 'medida') {
        const cx = (e.p0.x + e.p1.x) / 2, cy = (e.p0.y + e.p1.y) / 2, r = g * Math.PI / 180
        const rot = p => ({ x: cx + (p.x - cx) * Math.cos(r) - (p.y - cy) * Math.sin(r), y: cy + (p.x - cx) * Math.sin(r) + (p.y - cy) * Math.cos(r) })
        return { p0: rot(e.p0), p1: rot(e.p1), ...(e.c ? { c: rot(e.c) } : {}) }
      }
      return { rot: (((e.rot || 0) + g) % 360 + 360) % 360 }
    })
  }
  function ordenar(alFrente) {
    cambiar(p => {
      const a = p.elementos.filter(e => sel.includes(e.id)), r = p.elementos.filter(e => !sel.includes(e.id))
      return { ...p, elementos: alFrente ? [...r, ...a] : [...a, ...r] }
    })
  }

  // Teclado
  useEffect(() => {
    function onKey(ev) {
      const t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      const mod = ev.metaKey || ev.ctrlKey
      if (ev.key === 'Escape') { setHerr('mover'); setSel([]); return }
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); eliminar(); return }
      if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); ev.shiftKey ? rehacer() : deshacer(); return }
      if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); rehacer(); return }
      if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicar(); return }
      if (mod && ev.key.toLowerCase() === 'c') { copiar(); return }
      if (mod && ev.key.toLowerCase() === 'v') { ev.preventDefault(); pegar(); return }
      if (mod && ev.key.toLowerCase() === 'a') { ev.preventDefault(); setSel(dRef.current.elementos.map(e => e.id)); return }
      if (!mod && ev.key.toLowerCase() === 'r') { girar(ev.shiftKey ? -15 : 15); return }
      const flechas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (flechas[ev.key] && sel.length) {
        ev.preventDefault(); const paso = ev.shiftKey ? 2 : 0.5
        editarSel(e => mover(e, flechas[ev.key][0] * paso, flechas[ev.key][1] * paso))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* Ratón sobre el lienzo */
  function onDown(ev) {
    if (ev.button !== 0) return
    const p = punto(ev)
    const hEl = ev.target.closest('[data-h]')
    const elEl = ev.target.closest('[data-id]')
    svgRef.current.setPointerCapture(ev.pointerId)
    // Asas de la selección
    if (hEl && herr === 'mover') {
      arrastre.current = { modo: hEl.dataset.h, id: hEl.dataset.hid, inicio: p, previo: dRef.current, movido: false }
      return
    }
    // Herramientas de dibujo
    if (herr !== 'mover') {
      const sp = { x: snap(p.x), y: snap(p.y) }
      if (herr.startsWith('flecha:') || herr === 'medida') {
        const e = herr === 'medida'
          ? { id: uid(), tipo: 'medida', p0: sp, p1: sp, valor: '', color: '#111827' }
          : { id: uid(), tipo: 'flecha', estilo: herr.slice(7), p0: sp, p1: sp, color: ESTILOS.find(s => s.k === herr.slice(7))?.color, grosor: 1, verMedida: medidasAuto }
        arrastre.current = { modo: 'p1', id: e.id, inicio: p, previo: dRef.current, nuevo: true, movido: false }
        setD(prev => ({ ...prev, elementos: [...prev.elementos, e] })); setSel([e.id])
        return
      }
      if (herr === 'zona') {
        const e = { id: uid(), tipo: 'zona', x: sp.x, y: sp.y, w: 0.1, h: 0.1, rot: 0, color: '#3b82f6', opacidad: 1 }
        arrastre.current = { modo: 'zonaNueva', id: e.id, inicio: sp, previo: dRef.current, nuevo: true, movido: false }
        setD(prev => ({ ...prev, elementos: [...prev.elementos, e] })); setSel([e.id])
        return
      }
      // Objeto: cada clic añade uno (la herramienta sigue activa)
      const def = OBJETOS.find(o => o.k === herr)
      const nJug = dRef.current.elementos.filter(e => e.tipo === 'jugador').length
      const e = { id: uid(), tipo: herr, x: sp.x, y: sp.y, rot: 0, escala: 1, opacidad: 1, color: def?.color, ...(herr === 'jugador' ? { texto: String(nJug + 1) } : {}), ...(herr === 'texto' ? { texto: 'Texto' } : {}) }
      cambiar(prev => ({ ...prev, elementos: [...prev.elementos, e] })); setSel([e.id])
      arrastre.current = { modo: 'mover', ids: [e.id], inicio: p, ultimo: p, previo: null, movido: false }
      return
    }
    // Mover / seleccionar
    if (elEl) {
      const id = elEl.dataset.id
      let ids = sel.includes(id) ? sel : [id]
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) { ids = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; setSel(ids); return }
      const previo = dRef.current
      if (ev.altKey) { // Alt + arrastrar = duplicar
        const copias = duplicados(ids, 0)
        setD(prev => ({ ...prev, elementos: [...prev.elementos, ...copias] }))
        ids = copias.map(c => c.id)
      }
      setSel(ids)
      arrastre.current = { modo: 'mover', ids, inicio: p, ultimo: p, previo, movido: !!ev.altKey }
      return
    }
    setSel([]); setMarco({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
    arrastre.current = { modo: 'marco' }
  }
  function onMove(ev) {
    const a = arrastre.current; if (!a) return
    const p = punto(ev)
    if (a.modo === 'marco') { setMarco(m => m && { ...m, x1: p.x, y1: p.y }); return }
    a.movido = true
    if (a.modo === 'mover') {
      // desplazamiento ajustado a la rejilla desde el punto inicial
      const dx = snap(p.x - a.inicio.x), dy = snap(p.y - a.inicio.y)
      const ddx = dx - (a.dx || 0), ddy = dy - (a.dy || 0)
      if (!ddx && !ddy) return
      a.dx = dx; a.dy = dy
      setD(prev => ({ ...prev, elementos: prev.elementos.map(e => a.ids.includes(e.id) ? mover(e, ddx, ddy) : e) }))
      return
    }
    const sp = { x: snap(p.x), y: snap(p.y) }
    setD(prev => ({
      ...prev, elementos: prev.elementos.map(e => {
        if (e.id !== a.id) return e
        switch (a.modo) {
          case 'p0': return { ...e, p0: sp }
          case 'p1': return { ...e, p1: sp }
          case 'c': return { ...e, c: { x: p.x, y: p.y } }
          case 'rot': {
            const ang = Math.atan2(p.y - e.y, p.x - e.x) * 180 / Math.PI + 90
            const r = ev.shiftKey ? Math.round(ang) : Math.round(ang / 15) * 15
            return { ...e, rot: ((r % 360) + 360) % 360 }
          }
          case 'esc': {
            if (e.tipo === 'zona') {
              const r = -(e.rot || 0) * Math.PI / 180, lx = (p.x - e.x) * Math.cos(r) - (p.y - e.y) * Math.sin(r), ly = (p.x - e.x) * Math.sin(r) + (p.y - e.y) * Math.cos(r)
              return { ...e, w: Math.max(0.5, snap(Math.abs(lx) * 2)), h: Math.max(0.5, snap(Math.abs(ly) * 2)) }
            }
            const dd = Math.hypot(p.x - e.x, p.y - e.y) / (u * 0.75 * Math.SQRT2)
            return { ...e, escala: Math.max(0.25, Math.min(4, Math.round(dd * 20) / 20)) }
          }
          case 'zonaNueva': {
            const x0 = a.inicio.x, y0 = a.inicio.y
            return { ...e, x: (x0 + sp.x) / 2, y: (y0 + sp.y) / 2, w: Math.max(0.5, Math.abs(sp.x - x0)), h: Math.max(0.5, Math.abs(sp.y - y0)) }
          }
          default: return e
        }
      }),
    }))
  }
  function onUp() {
    const a = arrastre.current; arrastre.current = null
    if (!a) return
    if (a.modo === 'marco') {
      setMarco(m => {
        if (m) {
          const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1)
          if (x1 - x0 > 0.2 || y1 - y0 > 0.2) {
            const dentro = q => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1
            setSel(dRef.current.elementos.filter(e => (e.p0 ? dentro(e.p0) && dentro(e.p1) : dentro(e))).map(e => e.id))
          }
        }
        return null
      })
      return
    }
    if (a.nuevo) {
      // Flecha/medida/zona sin arrastre: se descarta; si no, queda con su historia
      const e = dRef.current.elementos.find(x => x.id === a.id)
      const vacia = e && ((e.p0 && dist(e.p0, e.p1) < 0.3) || (e.tipo === 'zona' && e.w < 0.6 && e.h < 0.6))
      if (vacia) { setD(a.previo); setSel([]); return }
      recordar(a.previo)
      if (e?.tipo === 'medida') setTimeout(() => valorRef.current?.focus(), 30)
      return
    }
    if (a.movido && a.previo) recordar(a.previo)
  }

  function cambiarFondo(campos) { cambiar(p => ({ ...p, fondo: { ...p.fondo, ...campos } })) }
  function elegirFondo(k) {
    const def = fondoDef(k)
    cambiar(p => ({ ...p, fondo: { ...p.fondo, tipo: k, ancho: def.editable && fondoDef(p.fondo.tipo).editable ? p.fondo.ancho : def.ancho, alto: def.editable && fondoDef(p.fondo.tipo).editable ? p.fondo.alto : def.alto, rejilla: k === 'cuadricula' } }))
  }

  async function guardar() {
    setGuardando(true)
    try { await onGuardar({ ...d, v: 1 }) } finally { setGuardando(false) }
  }

  // Asas de la selección
  function Asas() {
    if (!uno || herr !== 'mover') return null
    const r = u * 0.28, est = { fill: '#fff', stroke: '#2563eb', strokeWidth: u * 0.06, cursor: 'pointer' }
    if (uno.tipo === 'flecha' || uno.tipo === 'medida') {
      const mid = uno.c ? puntoCurva(uno, 0.5) : { x: (uno.p0.x + uno.p1.x) / 2, y: (uno.p0.y + uno.p1.y) / 2 }
      return (
        <g>
          <circle data-h="p0" data-hid={uno.id} cx={uno.p0.x} cy={uno.p0.y} r={r} {...est} />
          <circle data-h="p1" data-hid={uno.id} cx={uno.p1.x} cy={uno.p1.y} r={r} {...est} />
          {uno.tipo === 'flecha' && <rect data-h="c" data-hid={uno.id} x={mid.x - r * 0.8} y={mid.y - r * 0.8} width={r * 1.6} height={r * 1.6} transform={`rotate(45 ${mid.x} ${mid.y})`} {...est} stroke="#f59e0b" />}
        </g>
      )
    }
    const rot = (uno.rot || 0) * Math.PI / 180
    const tam = uno.tipo === 'zona' ? null : (uno.escala || 1) * u
    const alto = uno.tipo === 'zona' ? uno.h / 2 + u * 0.8 : tam * 1.25
    const hx = uno.x + Math.sin(rot) * alto, hy = uno.y - Math.cos(rot) * alto
    const ex = uno.tipo === 'zona' ? uno.w / 2 : tam * 0.75, ey = uno.tipo === 'zona' ? uno.h / 2 : tam * 0.75
    const cx = uno.x + ex * Math.cos(rot) - ey * Math.sin(rot), cy = uno.y + ex * Math.sin(rot) + ey * Math.cos(rot)
    return (
      <g>
        <line x1={uno.x} y1={uno.y} x2={hx} y2={hy} stroke="#2563eb" strokeWidth={u * 0.04} strokeDasharray={`${u * 0.12} ${u * 0.1}`} />
        <circle data-h="rot" data-hid={uno.id} cx={hx} cy={hy} r={r} {...est} />
        <rect data-h="esc" data-hid={uno.id} x={cx - r * 0.85} y={cy - r * 0.85} width={r * 1.7} height={r * 1.7} {...est} />
      </g>
    )
  }
  // Recuadro de los seleccionados
  function Marcas() {
    return elemSel.map(e => {
      if (e.tipo === 'flecha' || e.tipo === 'medida') return null
      const s = e.tipo === 'zona' ? null : (e.escala || 1) * u * 0.75
      const w = e.tipo === 'zona' ? e.w / 2 + u * 0.15 : s, h = e.tipo === 'zona' ? e.h / 2 + u * 0.15 : s
      return <rect key={e.id} x={-w} y={-h} width={w * 2} height={h * 2} transform={`translate(${e.x} ${e.y}) rotate(${e.rot || 0})`} fill="none" stroke="#2563eb" strokeWidth={u * 0.05} strokeDasharray={`${u * 0.15} ${u * 0.1}`} pointerEvents="none" />
    })
  }

  const cursor = herr === 'mover' ? 'default' : 'crosshair'
  const fdef = fondoDef(f.tipo)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div style={{ background: 'var(--bg, #fff)', borderRadius: 14, width: 'min(1400px, 100%)', height: 'min(900px, 100%)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        {/* Cabecera + barra de herramientas */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginRight: 8 }}>⚽ {titulo || 'Tarea de campo'}</div>
          <button style={btn(herr === 'mover')} onClick={() => setHerr('mover')} title="Seleccionar y mover (Esc)">↖ Mover</button>
          <span style={{ width: 1, height: 22, background: 'var(--border, #e5e7eb)' }} />
          <button style={btn(false)} onClick={deshacer} title="Deshacer (Ctrl+Z)">↶</button>
          <button style={btn(false)} onClick={rehacer} title="Rehacer (Ctrl+Y)">↷</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45 })} onClick={duplicar} title="Duplicar (Ctrl+D · o Alt + arrastrar)">⧉ Duplicar</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45 })} onClick={copiar} title="Copiar (Ctrl+C)">Copiar</button>
          <button style={btn(false)} onClick={pegar} title="Pegar (Ctrl+V)">Pegar</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45 })} onClick={() => girar(-15)} title="Girar 15° (Shift+R)">⟲ 15°</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45 })} onClick={() => girar(15)} title="Girar 15° (R)">15° ⟳</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45 })} onClick={() => ordenar(true)} title="Traer al frente">Al frente</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45 })} onClick={() => ordenar(false)} title="Enviar al fondo">Al fondo</button>
          <button style={btn(false, { opacity: sel.length ? 1 : .45, color: '#dc2626' })} onClick={eliminar} title="Eliminar (Supr)">✕ Eliminar</button>
          <span style={{ flex: 1 }} />
          <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}><input type="checkbox" checked={ajustar} onChange={e => setAjustar(e.target.checked)} /> Ajustar a 0,5 m</label>
          <button style={btn(false)} onClick={onCerrar}>Cancelar</button>
          <button style={btn(true)} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar dibujo'}</button>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Paleta */}
          <div style={{ width: 196, borderRight: '1px solid var(--border, #e5e7eb)', padding: '8px 10px', overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
              {[['elementos', 'Elementos'], ['flechas', 'Flechas'], ['fondo', 'Fondo']].map(([k, l]) => (
                <button key={k} style={btn(pestana === k, { flex: 1, padding: '5px 4px' })} onClick={() => setPestana(k)}>{l}</button>
              ))}
            </div>
            {pestana === 'elementos' && (
              <>
                <div style={{ fontSize: 10.5, color: 'var(--text3, #9ca3af)', lineHeight: 1.35, margin: '2px 0 6px' }}>Elige uno y haz clic en el campo: cada clic añade otro. Esc para terminar.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {OBJETOS.map(o => (
                    <button key={o.k} onClick={() => setHerr(herr === o.k ? 'mover' : o.k)} title={o.label}
                      style={{ ...btn(false, { padding: '5px 3px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }), borderColor: herr === o.k ? 'var(--accent, #2d6a4f)' : 'var(--border, #e5e7eb)', background: herr === o.k ? 'var(--accent-light, #e8f3ee)' : 'var(--bg, #fff)', boxShadow: herr === o.k ? 'inset 0 0 0 1px var(--accent, #2d6a4f)' : 'none' }}>
                      <svg viewBox="-1.1 -1.1 2.2 2.2" width={30} height={30} style={{ background: o.k === 'balon' || o.k === 'porteria' || o.k === 'miniporteria' ? '#47a041' : '#f3f4f6', borderRadius: 6 }}>
                        {o.k === 'zona' ? <rect x={-0.8} y={-0.55} width={1.6} height={1.1} fill="#3b82f633" stroke="#3b82f6" strokeWidth={0.08} />
                          : <g transform={`scale(${o.k === 'escalera' ? 0.55 : o.k === 'porteria' ? 0.75 : 1})`}><IconoObjeto e={{ tipo: o.k, color: o.color, texto: o.k === 'jugador' ? '7' : undefined }} /></g>}
                      </svg>
                      <span style={{ fontSize: 10, color: 'var(--text2, #555)' }}>{o.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            {pestana === 'flechas' && (
              <>
                <div style={{ fontSize: 10.5, color: 'var(--text3, #9ca3af)', lineHeight: 1.35, margin: '2px 0 6px' }}>Arrastra en el campo de inicio a fin. Con el rombo naranja la curvas.</div>
                {ESTILOS.map(s => {
                  const k = 'flecha:' + s.k, on = herr === k
                  return (
                    <button key={s.k} onClick={() => setHerr(on ? 'mover' : k)}
                      style={{ ...btn(false, { width: '100%', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, textAlign: 'left' }), borderColor: on ? 'var(--accent, #2d6a4f)' : 'var(--border, #e5e7eb)', background: on ? 'var(--accent-light, #e8f3ee)' : 'var(--bg, #fff)' }}>
                      <svg viewBox="0 -1 8 2" width={52} height={14}><Flecha f={{ estilo: s.k, p0: { x: 0.3, y: 0 }, p1: { x: 7.6, y: 0 }, color: s.color }} u={1.4} /></svg>
                      <span style={{ fontSize: 11.5 }}>{s.label}</span>
                    </button>
                  )
                })}
                <div style={lbl}>Medidas</div>
                <button onClick={() => setHerr(herr === 'medida' ? 'mover' : 'medida')}
                  style={{ ...btn(false, { width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }), borderColor: herr === 'medida' ? 'var(--accent, #2d6a4f)' : 'var(--border, #e5e7eb)', background: herr === 'medida' ? 'var(--accent-light, #e8f3ee)' : 'var(--bg, #fff)' }}>
                  <svg viewBox="0 -1 8 2" width={52} height={14}><Medida m={{ p0: { x: 0.4, y: 0 }, p1: { x: 7.6, y: 0 }, valor: '5' }} u={1.6} /></svg>
                  <span style={{ fontSize: 11.5 }}>Cota (medida)</span>
                </button>
                <div style={{ fontSize: 10.5, color: 'var(--text3, #9ca3af)', lineHeight: 1.35, marginTop: 5 }}>Arrástrala entre dos puntos y escribe el número a la derecha. Se mueve como cualquier objeto.</div>
                <label style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5, marginTop: 10 }}>
                  <input type="checkbox" checked={medidasAuto} onChange={e => setMedidasAuto(e.target.checked)} /> Metros en las flechas nuevas
                </label>
              </>
            )}
            {pestana === 'fondo' && (
              <>
                {['Liso', 'Fútbol', 'Otros deportes'].map(g => (
                  <div key={g}>
                    <div style={lbl}>{g}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                      {FONDOS.filter(x => x.grupo === g).map(x => (
                        <button key={x.k} onClick={() => elegirFondo(x.k)} title={x.label}
                          style={{ ...btn(false, { padding: 3, display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'stretch' }), borderColor: f.tipo === x.k ? 'var(--accent, #2d6a4f)' : 'var(--border, #e5e7eb)', boxShadow: f.tipo === x.k ? 'inset 0 0 0 1px var(--accent, #2d6a4f)' : 'none' }}>
                          <DiagramaCampo diagrama={{ fondo: { tipo: x.k, ancho: x.ancho, alto: x.alto, opacidad: 1, rejilla: x.k === 'cuadricula' }, elementos: [] }} style={{ borderRadius: 4, background: '#e5e7eb' }} />
                          <span style={{ fontSize: 9.5, textAlign: 'center', lineHeight: 1.15 }}>{x.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Lienzo */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#eef0f3' }}>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              <svg ref={svgRef} viewBox={`${-mg} ${-mg} ${f.ancho + 2 * mg} ${f.alto + 2 * mg}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ width: '100%', height: '100%', cursor, touchAction: 'none', userSelect: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
                <g opacity={f.opacidad ?? 1} pointerEvents="none"><FondoSVG fondo={f} /></g>
                {f.rejilla && <g pointerEvents="none"><Rejilla fondo={f} fuerte={f.tipo === 'cuadricula' || f.tipo === 'blanco'} /></g>}
                {d.elementos.map(e => (
                  <g key={e.id} data-id={e.id} style={{ cursor: herr === 'mover' ? 'move' : 'crosshair' }} pointerEvents={herr === 'mover' ? 'visiblePainted' : 'none'}>
                    {/* zona de clic más ancha en flechas y medidas */}
                    {(e.tipo === 'flecha' || e.tipo === 'medida') && <path d={e.tipo === 'flecha' ? trazoFlecha({ ...e, estilo: 'sprint' }) : `M ${e.p0.x} ${e.p0.y} L ${e.p1.x} ${e.p1.y}`} stroke="transparent" strokeWidth={u * 0.8} fill="none" />}
                    {e.tipo !== 'flecha' && e.tipo !== 'medida' && e.tipo !== 'zona' && <circle cx={e.x} cy={e.y} r={(e.escala || 1) * u * 0.7} fill="transparent" />}
                    <Elemento e={e} u={u} />
                  </g>
                ))}
                <Marcas />
                <Asas />
                {elemSel.filter(e => e.p0).map(e => <path key={'s' + e.id} d={e.tipo === 'flecha' ? trazoFlecha({ ...e, estilo: 'sprint' }) : `M ${e.p0.x} ${e.p0.y} L ${e.p1.x} ${e.p1.y}`} stroke="#2563eb" strokeOpacity={0.35} strokeWidth={u * 0.35} fill="none" pointerEvents="none" />)}
                {marco && <rect x={Math.min(marco.x0, marco.x1)} y={Math.min(marco.y0, marco.y1)} width={Math.abs(marco.x1 - marco.x0)} height={Math.abs(marco.y1 - marco.y0)} fill="rgba(37,99,235,.08)" stroke="#2563eb" strokeWidth={u * 0.04} strokeDasharray={`${u * 0.2} ${u * 0.12}`} pointerEvents="none" />}
              </svg>
            </div>
            <div style={{ padding: '6px 14px', fontSize: 11.5, color: 'var(--text2, #555)', borderTop: '1px solid var(--border, #e5e7eb)', background: 'var(--bg, #fff)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <span>Metros por repetición: <b style={{ color: '#1f2d8a' }}>{met.metros ? fmtM(met.metros) : '—'}</b></span>
              <span>Cambios de dirección: <b style={{ color: '#1f2d8a' }}>{met.cod}{met.angulos.length ? ` (${[...new Set(met.angulos)].map(a => a + '°').join(', ')})` : ''}</b></span>
              <span style={{ marginLeft: 'auto', color: 'var(--text3, #9ca3af)' }}>Alt + arrastrar = duplicar · Shift + clic = varios · R = girar · flechas del teclado = mover</span>
            </div>
          </div>

          {/* Propiedades */}
          <div style={{ width: 236, borderLeft: '1px solid var(--border, #e5e7eb)', padding: '10px 12px', overflowY: 'auto', flexShrink: 0, fontSize: 12 }}>
            {!elemSel.length && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Fondo · {fdef.label}</div>
                {fdef.editable ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '6px 0' }}>
                    <input type="number" min={5} max={150} value={f.ancho} onChange={e => cambiarFondo({ ancho: Math.max(5, Math.min(150, Number(e.target.value) || 5)) })} style={{ width: 60, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }} />
                    <span>×</span>
                    <input type="number" min={5} max={150} value={f.alto} onChange={e => cambiarFondo({ alto: Math.max(5, Math.min(150, Number(e.target.value) || 5)) })} style={{ width: 60, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }} />
                    <span>m</span>
                  </div>
                ) : <div style={{ color: 'var(--text3, #9ca3af)', fontSize: 11.5 }}>{f.ancho} × {f.alto} m (medidas reales)</div>}
                <Deslizador label="Opacidad" value={f.opacidad ?? 1} min={0.1} max={1} step={0.05} onChange={v => cambiarFondo({ opacidad: v })} fmt={v => Math.round(v * 100) + '%'} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginTop: 4 }}><input type="checkbox" checked={!!f.rejilla} onChange={e => cambiarFondo({ rejilla: e.target.checked })} /> Mostrar cuadrícula de metros</label>
                <div style={{ ...lbl, marginTop: 18 }}>Atajos</div>
                <div style={{ fontSize: 11, color: 'var(--text2, #555)', lineHeight: 1.6 }}>
                  Arrastrar en vacío: seleccionar varios<br />Alt + arrastrar: duplicar<br />Ctrl+D duplicar · Ctrl+C / Ctrl+V<br />R / Shift+R: girar 15°<br />Supr: eliminar · Ctrl+Z: deshacer
                </div>
              </>
            )}
            {elemSel.length > 1 && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{elemSel.length} elementos</div>
                <div style={lbl}>Color</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{COLORES.map(c => <button key={c} onClick={() => editarSel({ color: c })} style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid #d1d5db', background: c, cursor: 'pointer' }} />)}</div>
                <Deslizador label="Opacidad" value={elemSel[0].opacidad ?? 1} min={0.1} max={1} step={0.05} onChange={v => editarSel({ opacidad: v })} fmt={v => Math.round(v * 100) + '%'} />
                <div style={{ fontSize: 11, color: 'var(--text3, #9ca3af)', marginTop: 8 }}>Arrástralos juntos, gíralos con R o duplícalos con Alt + arrastrar.</div>
              </>
            )}
            {uno && (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {uno.tipo === 'flecha' ? `Flecha · ${ESTILOS.find(s => s.k === uno.estilo)?.label || ''}` : uno.tipo === 'medida' ? 'Cota (medida)' : OBJETOS.find(o => o.k === uno.tipo)?.label}
                </div>
                {uno.tipo === 'medida' && (
                  <>
                    <div style={lbl}>Valor</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input ref={valorRef} value={uno.valor ?? ''} placeholder={String(Math.round(dist(uno.p0, uno.p1) * 2) / 2).replace('.', ',')}
                        onChange={e => editarSel({ valor: e.target.value })}
                        style={{ width: 90, padding: '6px 8px', borderRadius: 7, border: '1.5px solid var(--accent, #2d6a4f)', fontSize: 14, fontWeight: 700 }} />
                      <span style={{ color: 'var(--text3, #9ca3af)' }}>m (vacío = automático)</span>
                    </div>
                  </>
                )}
                {uno.tipo === 'flecha' && (
                  <>
                    <div style={lbl}>Tipo de desplazamiento</div>
                    <select value={uno.estilo} onChange={e => editarSel({ estilo: e.target.value, color: ESTILOS.find(s => s.k === e.target.value)?.color })} style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }}>
                      {ESTILOS.map(s => <option key={s.k} value={s.k}>{s.label}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginTop: 8 }}><input type="checkbox" checked={!!uno.verMedida} onChange={e => editarSel({ verMedida: e.target.checked })} /> Mostrar metros ({fmtM(largoCurva(uno))})</label>
                    <Deslizador label="Grosor" value={uno.grosor || 1} min={0.4} max={3} step={0.1} onChange={v => editarSel({ grosor: v })} fmt={v => v.toFixed(1)} />
                    <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                      <button style={btn(false, { flex: 1 })} onClick={() => editarSel(e => ({ p0: e.p1, p1: e.p0 }))}>⇄ Invertir</button>
                      {uno.c && <button style={btn(false, { flex: 1 })} onClick={() => editarSel(() => ({ c: undefined }))}>Recta</button>}
                    </div>
                  </>
                )}
                {(uno.tipo === 'texto' || uno.tipo === 'jugador' || uno.tipo === 'atleta' || uno.tipo === 'zona') && (
                  <>
                    <div style={lbl}>{uno.tipo === 'jugador' ? 'Número' : uno.tipo === 'texto' ? 'Texto' : 'Nombre (opcional)'}</div>
                    <input value={uno.texto || ''} onChange={e => editarSel({ texto: e.target.value })} style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)', boxSizing: 'border-box' }} />
                  </>
                )}
                {uno.tipo === 'zona' && (
                  <>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                      <input type="number" step={0.5} value={uno.w} onChange={e => editarSel({ w: Math.max(0.5, Number(e.target.value) || 0.5) })} style={{ width: 58, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }} />×
                      <input type="number" step={0.5} value={uno.h} onChange={e => editarSel({ h: Math.max(0.5, Number(e.target.value) || 0.5) })} style={{ width: 58, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border, #e5e7eb)' }} />m
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3, #9ca3af)', marginTop: 3 }}>{Math.round(uno.w * uno.h)} m²</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, marginTop: 6 }}><input type="checkbox" checked={!!uno.discontinua} onChange={e => editarSel({ discontinua: e.target.checked })} /> Solo borde discontinuo</label>
                  </>
                )}
                <div style={lbl}>Color</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {COLORES.map(c => <button key={c} onClick={() => editarSel({ color: c })} title={c} style={{ width: 20, height: 20, borderRadius: 5, border: (uno.color || '') === c ? '2px solid #2563eb' : '1px solid #d1d5db', background: c, cursor: 'pointer' }} />)}
                </div>
                {uno.tipo !== 'flecha' && uno.tipo !== 'medida' && uno.tipo !== 'zona' && (
                  <>
                    <Deslizador label="Tamaño" value={uno.escala || 1} min={0.25} max={4} step={0.05} onChange={v => editarSel({ escala: v })} fmt={v => Math.round(v * 100) + '%'} />
                    <div style={{ display: 'flex', gap: 4 }}>{[0.5, 1, 1.5, 2].map(v => <button key={v} style={btn((uno.escala || 1) === v, { flex: 1, padding: '3px 2px', fontSize: 10.5 })} onClick={() => editarSel({ escala: v })}>{v * 100}%</button>)}</div>
                  </>
                )}
                {uno.tipo !== 'flecha' && uno.tipo !== 'medida' && (
                  <Deslizador label="Rotación" value={uno.rot || 0} min={0} max={359} step={1} onChange={v => editarSel({ rot: v })} fmt={v => v + '°'} />
                )}
                <Deslizador label="Opacidad" value={uno.opacidad ?? 1} min={0.1} max={1} step={0.05} onChange={v => editarSel({ opacidad: v })} fmt={v => Math.round(v * 100) + '%'} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
