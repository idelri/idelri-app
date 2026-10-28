/**
 * Evaluación de fuerza con encoder (Vitruve) — perfil carga-velocidad.
 * Lógica portada tal cual del artefacto «Evaluaciones de Fuerza» para dar los mismos números.
 */
const KEYMAP = {
  'Mean Velocity (m/s)': 'mv', 'Mean Propulsive Velocity (m/s)': 'mpv', 'Peak Velocity (m/s)': 'pv',
  'Mean Power [MPV] (W)': 'pmpv', 'Mean Power [MV] (W)': 'pmv', 'Peak Power (W)': 'ppk',
  'ROM (m)': 'rom', 'ROM (Range of Motion) (m)': 'rom', 'Weight / Body Weight (%)': 'bwPct', 'Time to Peak Velocity (ms)': 'ttpv', 'Repetition Duration (ms)': 'dur',
  '1RM (kg)': 'e1rmDev', 'Peak Force (N)': 'pf', 'Weight (kg)': 'load',
  'Acceleration Index (m/s2)': 'accIdx', 'Mean Acceleration (m/s2)': 'macc', 'Peak Acceleration (m/s2)': 'pacc',
}
export const num = s => { const n = parseFloat(String(s).replace(',', '.')); return isFinite(n) ? n : null }

/** aoa = filas de la primera hoja del .xlsx de Vitruve */
export function parseVitruve(aoa, file, sheet) {
  const rows = aoa.map(r => r.map(c => (c == null ? '' : String(c).trim())))
  const firstCol = Math.min(...rows.filter(r => r.some(c => c !== '')).map(r => r.findIndex(c => c !== '')))
  const R = rows.map(r => r.slice(firstCol))
  const meta = R.filter(r => r[0] && r.slice(1).every(c => !c)).slice(0, 3).map(r => r[0])
  const [dateRaw, name, exercise] = meta
  let date = dateRaw; const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(dateRaw || '')
  if (m) date = `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  const sets = []; let cur = null, hdr = null
  for (let i = 0; i < R.length; i++) {
    const r = R[i]
    if (r[0] === 'Set') continue
    if (/^\d+$/.test(r[0]) && /^[✔✓✗✘xX]$/.test(r[4] || '')) { cur = { set: +r[0], load: num(r[2]), reps: [] }; sets.push(cur); hdr = null; continue }
    if (r[0] === 'Reps') { hdr = r; continue }
    if (cur && hdr && /^\d+$/.test(r[0])) {
      const rep = { rep: +r[0], type: r[1] }
      hdr.forEach((h, j) => { if (j > 1 && h) { const kk = KEYMAP[h] || h; rep[kk] = num(r[j]) } })
      cur.reps.push(rep)
    }
  }
  sets.forEach(s => { if (s.load == null && s.reps[0]?.load != null) s.load = s.reps[0].load })
  const okSets = sets.filter(s => s.reps.length && s.load != null)
  let bw = null; for (const s of okSets) for (const r of s.reps) if (!bw && r.load && r.bwPct) bw = Math.round(r.load / (r.bwPct / 100) * 10) / 10
  let tname = name
  if (!tname || /^vbt workout$/i.test(tname)) tname = file.replace(/\.xlsx?$/i, '').replace(/^\d+_\d+_\d+_/, '').replace(/_?workout.*$/i, '').replace(/_/g, ' ').trim()
  const ex = (exercise || '').toLowerCase()
  const kind = /bench|press/.test(ex) ? 'bench' : /squat|sentad/.test(ex) ? 'squat' : 'other'
  return { file, account: sheet, date, name: tname || file, exercise: (exercise || '').trim(), kind, sets: okSets, bw }
}

export const defaultMVT = (kind, v) => kind === 'bench' ? 0.17 : kind === 'squat' ? (v === 'mpv' ? 0.33 : 0.30) : 0.25
export const AJUSTES_VBT = { vvar: 'mv', rule: 'best', mvt: null, bw: null, manual: null }
function bestRep(set, v) { return set.reps.reduce((a, b) => (b[v] ?? -1) > (a[v] ?? -1) ? b : a, set.reps[0]) }

/** t = datos del test; st = ajustes { vvar, rule, mvt, bw, manual } */
export function computeVBT(t, st0) {
  const st = { ...AJUSTES_VBT, ...(st0 || {}) }
  const v = st.vvar
  const mvt = st.mvt ?? defaultMVT(t.kind, v)
  const pts = t.sets.map(s => { const r = bestRep(s, v); return { set: s.set, load: s.load, v: r[v], r } })
  let inc
  if (st.rule === 'manual' && st.manual && st.manual.length === pts.length) inc = st.manual.slice()
  else if (st.rule === 'all') inc = pts.map(() => true)
  else { const best = {}; pts.forEach((p, i) => { if (best[p.load] == null || p.v > pts[best[p.load]].v) best[p.load] = i }); inc = pts.map((p, i) => best[p.load] === i) }
  const roms = pts.map(p => p.r.rom).filter(x => x != null).sort((a, b) => a - b)
  const medRom = roms.length ? roms[Math.floor(roms.length / 2)] : null
  pts.forEach((p, i) => {
    p.flags = []
    if (medRom && p.r.rom != null && p.r.rom < medRom * 0.9) p.flags.push(`ROM corto (${p.r.rom.toFixed(2)} m vs ${medRom.toFixed(2)})`)
    if (medRom && p.r.rom != null && p.r.rom > medRom * 1.1) p.flags.push(`ROM largo (${p.r.rom.toFixed(2)} m vs ${medRom.toFixed(2)})`)
    if (pts.some(q => q.load > p.load && q.v != null && p.v != null && q.v > p.v + 0.02)) p.flags.push('Más lenta que una carga mayor (¿calentamiento?)')
    const same = pts.filter(q => q.load === p.load && q !== p)
    if (same.length) { const mx = Math.max(...same.map(q => q.v)); if (mx - p.v >= 0.06) p.flags.push(`−${(mx - p.v).toFixed(2)} m/s vs otra serie`) }
    p.inc = inc[i]
  })
  const use = pts.filter(p => p.inc && p.v != null && p.load != null)
  let fit = null
  if (use.length >= 2 && new Set(use.map(p => p.load)).size >= 2) {
    const n = use.length, mx = use.reduce((a, p) => a + p.load, 0) / n, my = use.reduce((a, p) => a + p.v, 0) / n
    let sxy = 0, sxx = 0, syy = 0; use.forEach(p => { sxy += (p.load - mx) * (p.v - my); sxx += (p.load - mx) ** 2; syy += (p.v - my) ** 2 })
    const b = sxy / sxx, a = my - b * mx, r2 = syy ? (sxy * sxy) / (sxx * syy) : 1
    const see = n > 2 ? Math.sqrt(use.reduce((s, p) => s + (p.v - (a + b * p.load)) ** 2, 0) / (n - 2)) : null
    fit = { a, b, r2, see, n, e1rm: (mvt - a) / b, L0: -a / b, V0: a }
  }
  const pmax = pts.reduce((a, p) => (p.r.pmpv ?? 0) > (a?.r.pmpv ?? 0) ? p : a, null)
  return { pts, fit, mvt, v, pmax, bw: st.bw ?? t.bw ?? null }
}

/** Resumen para guardar en la base de datos (historial y evolución) */
export function resumenVBT(C) {
  const F = C.fit
  return {
    variable: C.v, mvt: C.mvt,
    e1rm: F && isFinite(F.e1rm) ? +F.e1rm.toFixed(1) : null,
    l0: F ? +F.L0.toFixed(1) : null, v0: F ? +F.V0.toFixed(3) : null, pendiente: F ? +F.b.toFixed(5) : null, r2: F ? +F.r2.toFixed(3) : null,
    pico_potencia_w: C.pmax?.r.pmpv != null ? Math.round(C.pmax.r.pmpv) : null, carga_pico_potencia: C.pmax?.load ?? null,
    series_incluidas: C.pts.filter(p => p.inc).map(p => p.set),
  }
}
export const ZONAS_PCT = [40, 50, 60, 70, 75, 80, 85, 90, 95]
export const kindName = k => ({ bench: 'Press banca', squat: 'Sentadilla', other: 'Ejercicio' })[k] || 'Ejercicio'

// ── Lo que verá el deportista ──
export const nf1 = x => x.toLocaleString('es-ES', { maximumFractionDigits: 1 })
export const nf2 = x => x.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const odd = p => p.flags.some(f => /ROM/.test(f))
export const STATUS_LBL = { ok: 'fiable', ori: 'orientativa', none: 'sin estimación' }
export function autoStatus(C) {
  if (!C.fit || !isFinite(C.fit.e1rm)) return 'none'
  const inc = C.pts.filter(p => p.inc && p.v != null)
  const minV = Math.min(...inc.map(p => p.v))
  return (minV - C.mvt > 0.35 || C.fit.r2 < 0.9) ? 'ori' : 'ok'
}
export const statusOf = (inf, C) => (inf?.aStatus && inf.aStatus !== 'auto') ? inf.aStatus : autoStatus(C)
export function autoRef(C, st) {
  const inc = C.pts.filter(p => p.inc && p.v != null); if (!inc.length) return null
  const target = st !== 'none' && C.fit ? C.fit.e1rm * 0.65 : Math.max(...inc.map(p => p.load)) * 0.9
  return inc.reduce((b, p) => Math.abs(p.load - target) < Math.abs(b.load - target) ? p : b).load
}
export function refOf(inf, C, st) {
  const loads = C.pts.filter(p => p.inc).map(p => p.load)
  return (inf?.aRef != null && loads.includes(inf.aRef)) ? inf.aRef : autoRef(C, st)
}
export function autoSays(C, st) {
  const inc = C.pts.filter(p => p.inc && p.v != null); if (!inc.length) return []
  const last = inc.reduce((b, p) => p.load > b.load ? p : b)
  const out = [`Con ${nf1(last.load)} kg, la carga más alta que probamos, la barra subía a ${nf2(last.v)} m/s.`]
  if (st === 'ok') out.push('Llegaste bastante cerca de tu máximo, así que la estimación es bastante precisa.')
  if (st === 'ori') out.push('Como no llegamos a cargas muy pesadas, el máximo es orientativo. En el próximo test subiremos más para afinarlo.')
  if (st === 'none') out.push('Este día las series no fueron del todo comparables entre sí, así que no calculamos tu máximo.')
  if (inc.some(odd)) out.push('Alguna serie tuvo un recorrido distinto al resto (puntos huecos). Lo cuidaremos en el próximo test.')
  return out
}
export function saysOf(inf, C, st) {
  const s = (inf?.aSays || '').split('\n').map(x => x.trim()).filter(Boolean)
  return s.length ? s : autoSays(C, st)
}
