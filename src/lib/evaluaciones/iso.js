/**
 * Evaluación isométrica (Tindeq) — curvas fuerza-tiempo, pico, mejor segundo, RFD y asimetría.
 * Lógica portada tal cual del artefacto «Evaluaciones de Fuerza».
 * datos = { attempts: [{ id, side: 'I'|'D', name, t: [s], w: [kg] }] }
 * ajustes = { unit, lever, bw, uso: { [id]: 'all'|'max'|'rfd'|'none' }, lado: { [id]: 'I'|'D' } }
 */
import JSZip from 'jszip'

/* Análisis de una contracción isométrica a partir de la curva en bruto (t en s, w en kg) */
export function analyzeAttempt(t, w){
  const n = t.length, dts = [];
  for (let i = 1; i < n; i++) dts.push(t[i] - t[i-1]);
  dts.sort((a,b)=>a-b);
  const dt = dts[Math.floor(dts.length/2)], fs = 1/dt;
  let ip = 0; for (let i = 1; i < n; i++) if (w[i] > w[ip]) ip = i;
  const pk = w[ip];
  const F = x => {
    if (x <= t[0]) return w[0]; if (x >= t[n-1]) return w[n-1];
    let a = 0, b = n-1; while (b - a > 1){ const m = (a+b)>>1; if (t[m] <= x) a = m; else b = m; }
    return w[a] + (w[b]-w[a])*(x-t[a])/(t[b]-t[a]);
  };
  const mean = (a,b) => { let s=0,c=0; for (let i=0;i<n;i++) if (t[i]>=a && t[i]<=b){ s+=w[i]; c++; } return c ? s/c : null; };
  const median = (a,b) => { const v=[]; for (let i=0;i<n;i++) if (t[i]>=a && t[i]<=b) v.push(w[i]); v.sort((x,y)=>x-y); return v.length ? v[Math.floor(v.length/2)] : null; };
  const flags = [];
  // subida principal (la que contiene el pico)
  let i50 = ip; while (i50 > 0 && w[i50-1] >= 0.5*pk) i50--;
  let started = i50 === 0 || w[0] >= 0.5*pk;   // la contracción ya estaba en marcha al empezar la grabación
  let t0, bm = null, onIdx = 0;
  if (started){
    t0 = t[0];
    flags.push({code:'start', text:'Empezó a empujar antes de que arrancara la grabación: sin RFD'});
  } else {
    let j = i50; while (j > 0 && w[j-1] < w[j]) j--;
    const nb = Math.max(5, Math.round(0.3*fs));
    const base = w.slice(Math.max(0, j-nb), j+1);
    bm = base.reduce((a,b)=>a+b,0)/base.length;
    const bs = Math.max(Math.sqrt(base.reduce((a,b)=>a+(b-bm)**2,0)/base.length), 0.05);
    const thr = bm + 3*bs;
    let k = i50;
    for (let q = Math.max(1, j-nb); q <= i50; q++){
      let ok = true; for (let r = q; r <= i50; r++) if (w[r] <= thr){ ok = false; break; }
      if (ok){ k = q; break; }
    }
    onIdx = k;
    t0 = w[k] === w[k-1] ? t[k] : t[k-1] + (thr - w[k-1])/(w[k]-w[k-1])*(t[k]-t[k-1]);
    if (t0 - t[0] < 0.15 || j <= 1){ started = true; t0 = t[0]; bm = null; flags.push({code:'start', text:'Empezó a empujar antes de que arrancara la grabación: sin RFD'}); }
    // otro esfuerzo antes de la contracción principal
    let mxb = 0; for (let i = 0; i < Math.max(0, j-nb); i++) mxb = Math.max(mxb, w[i]);
    if (mxb > 0.4*pk) flags.push({code:'extra', text:'Hay otro esfuerzo antes en la ventana (se analiza el principal)'});
  }
  let ie = -1; for (let i = ip; i < n; i++) if (w[i] < 0.3*pk){ ie = i; break; }
  const truncated = ie < 0;
  const tEnd = truncated ? t[n-1] : t[ie];
  const dur = tEnd - t0;
  let best1 = null; const n1 = Math.round(fs);
  for (let i = 0; i + n1 <= n; i++){
    if (t[i] < t0 - 1e-9 || t[i+n1-1] > tEnd + 1e-9) continue;
    let s = 0; for (let r = i; r < i+n1; r++) s += w[r];
    if (best1 == null || s/n1 > best1) best1 = s/n1;
  }
  if (dur < 1) best1 = null;
  let rfd100 = null, rfd200 = null, rfdPeak = null;
  if (!started){
    rfd100 = (F(t0+0.1) - bm)/0.1; rfd200 = (F(t0+0.2) - bm)/0.2;
    rfdPeak = 0; for (let s = 0; s <= 0.3; s += 0.005){ const v = (F(t0+s+0.05)-F(t0+s))/0.05; if (v > rfdPeak) rfdPeak = v; }
  }
  // tiempo por encima del 92 % del pico: un pico muy breve es un tirón
  let above = 0; for (let i = 1; i < n; i++) if (w[i] >= 0.92*pk) above += t[i]-t[i-1];
  const spike = above < 0.25 && best1 != null && pk > 1.1*best1;
  const early = mean(t0+0.15, t0+0.4);
  const late = tEnd - t[ip] > 0.8 ? median(t[ip]+0.3, tEnd) : null;
  if (truncated) flags.push({code:'cut', text:'Curva cortada: la ventana terminó durante el esfuerzo'});
  if (spike) flags.push({code:'spike', text:`Pico muy breve (tirón): ${(pk/best1*100-100).toFixed(0)} % por encima del mejor segundo`});
  else if (!started && t[ip]-t0 > 0.5 && early && late && Math.abs(F(t0+0.35)-F(t0+0.15)) < 0.08*pk && pk > 1.15*early && pk > 1.12*late)
    flags.push({code:'comp', text:`Posible compensación: pico ${((pk/early-1)*100).toFixed(0)} % por encima del nivel inicial y luego se pierde`});
  if (bm != null && bm > 0.25*pk) flags.push({code:'pre', text:'Pretensión alta: RFD menos fiable'});
  if (!truncated){ let mx = 0; for (let i = ie; i < n; i++) mx = Math.max(mx, w[i]); if (mx > 0.4*pk) flags.push({code:'extra', text:'Hay otro esfuerzo después en la ventana (se analiza el principal)'}); }
  // rebote al inicio: sube, cae más de un 15 % y vuelve a subir (tirón o holgura de la correa)
  let jolt = false;
  if (!started){
    let im = -1; for (let i = onIdx; i < n && t[i] <= t0 + 0.3; i++) if (im < 0 || w[i] > w[im]) im = i;
    if (im > 0){ let mn = w[im], imn = im; for (let i = im; i < n && t[i] <= t[im] + 0.2; i++) if (w[i] < mn){ mn = w[i]; imn = i; }
      let rec = false; for (let i = imn; i < n && t[i] <= t[imn] + 0.5; i++) if (w[i] > mn + 0.5*(w[im]-mn)) { rec = true; break; }
      jolt = (w[im] - mn) > 0.15*w[im] && rec; }
  }
  if (jolt) flags.push({code:'jolt', text:'Rebote al inicio (posible tirón o holgura de la correa): RFD no fiable'});
  const noMax = truncated || spike || flags.some(f => f.code === 'comp');
  return {fs, pk, tPk:t[ip], t0, pre:bm, best1, dur, truncated, started, early, late, rfd100, rfd200, rfdPeak, flags, noMax, jolt};
}

export const G = 9.81
export const SIDE = { I: { name: 'Izquierda', short: 'Izda', c: '#2a78d6', lower: 'izquierdo' }, D: { name: 'Derecha', short: 'Dcha', c: '#eb6834', lower: 'derecho' } }
export function isoDefaultUse(r) {
  const spikeEarly = r.flags.some(f => f.code === 'spike') && r.tPk - r.t0 < 0.3
  if (spikeEarly || (r.noMax && r.jolt)) return 'none'
  if (r.jolt) return 'max'
  if (r.noMax) return 'rfd'
  return 'all'
}
export const USE_MAX = u => u === 'all' || u === 'max', USE_RFD = u => u === 'all' || u === 'rfd'

/** Monta el test analizado: cada intento con su análisis r, lado y uso (los del ajuste o los automáticos) */
export function montarIso(datos, ajustes) {
  const aj = ajustes || {}
  const T = { unit: aj.unit || 'N', lever: aj.lever ?? null, bw: aj.bw ?? null, attempts: [] }
  ;(datos?.attempts || []).forEach(a => {
    const r = analyzeAttempt(a.t, a.w)
    const flags = r.flags.slice()
    T.attempts.push({ id: a.id, name: a.name, t: a.t, w: a.w, side: aj.lado?.[a.id] || a.side, r: { ...r, flags }, autoUse: isoDefaultUse(r) })
  })
  // intentos fallidos (menos de la mitad del mejor pico de su lado): excluidos por defecto
  ;['I', 'D'].forEach(s => {
    const A = T.attempts.filter(a => a.side === s); const mx = Math.max(0, ...A.map(a => a.r.pk))
    A.forEach(a => { if (a.r.pk < 0.5 * mx) { a.autoUse = 'none'; if (!a.r.flags.some(f => f.code === 'low')) a.r.flags.push({ code: 'low', text: 'Intento fallido: menos de la mitad del mejor de su lado' }) } })
  })
  T.attempts.forEach(a => { a.use = aj.uso?.[a.id] || a.autoUse; a.inc = a.use !== 'none' })
  return T
}
export function isoUnit(T) {
  const u = T.unit
  if ((u === 'Nm' || u === 'Nmkg') && !T.lever) return { f: x => x * G, u: 'N', ru: 'N/s', d: 0, warn: 'Escribe el brazo de palanca para ver N·m' }
  if (u === 'Nmkg' && !T.bw) return { f: x => x * G * T.lever, u: 'N·m', ru: 'N·m/s', d: 1, warn: 'Escribe el peso corporal para ver N·m/kg' }
  if (u === 'kg') return { f: x => x, u: 'kg', ru: 'kg/s', d: 1 }
  if (u === 'N') return { f: x => x * G, u: 'N', ru: 'N/s', d: 0 }
  if (u === 'Nm') return { f: x => x * G * T.lever, u: 'N·m', ru: 'N·m/s', d: 1 }
  return { f: x => x * G * T.lever / T.bw, u: 'N·m/kg', ru: 'N·m/kg/s', d: 2 }
}
export const ifmt = (x, d) => x == null || !isFinite(x) ? '–' : x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })
export function isoBest(T, side) {
  const A = T.attempts.filter(a => a.side === side && a.inc)
  const full = A.filter(a => USE_MAX(a.use))
  const pick = (arr, key) => arr.reduce((b, a) => (a.r[key] ?? -1) > (b?.r[key] ?? -1) ? a : b, null)
  const withR = A.filter(a => a.r.rfd100 != null && USE_RFD(a.use))
  return { n: A.length, pk: pick(full, 'pk'), b1: pick(full.filter(a => a.r.best1 != null), 'best1'), r100: pick(withR, 'rfd100'), r200: pick(withR, 'rfd200') }
}
export function isoAsym(a, b) {
  if (a == null || b == null) return null
  const hi = Math.max(a, b), lo = Math.min(a, b)
  return { pct: (hi - lo) / hi * 100, side: a > b ? 'I' : a < b ? 'D' : null }
}
export function isoCV(T, side, key, maxOnly) {
  const v = T.attempts.filter(a => a.side === side && a.inc && (maxOnly ? USE_MAX(a.use) : USE_RFD(a.use)) && a.r[key] != null).map(a => a.r[key])
  if (v.length < 2) return { n: v.length, cv: null }
  const m = v.reduce((s, x) => s + x, 0) / v.length, sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
  return { n: v.length, cv: sd / m * 100 }
}
export const isoPeakAsym = T => isoAsym(isoBest(T, 'I').pk?.r.pk, isoBest(T, 'D').pk?.r.pk)
export function isoAutoSays(T, ex) {
  const A = isoPeakAsym(T), out = []
  if (!A) out.push(`${ex}: faltan intentos válidos de un lado para comparar.`)
  else if (A.pct < 10) out.push(`${ex}: tus dos lados están equilibrados (diferencia del ${ifmt(A.pct, 0)} %).`)
  else out.push(`${ex}: tu lado ${SIDE[A.side].lower} es un ${ifmt(A.pct, 0)} % más fuerte que el ${SIDE[A.side === 'I' ? 'D' : 'I'].lower}.${A.pct >= 15 ? ' Es una diferencia que vamos a trabajar.' : ''}`)
  return out
}
/** Resumen para la base de datos (en kg y N) */
export function resumenIso(T) {
  const B = { I: isoBest(T, 'I'), D: isoBest(T, 'D') }, A = isoPeakAsym(T)
  const lado = s => ({ pico_kg: B[s].pk ? +B[s].pk.r.pk.toFixed(2) : null, mejor1s_kg: B[s].b1 ? +B[s].b1.r.best1.toFixed(2) : null, rfd100_kgs: B[s].r100 ? Math.round(B[s].r100.r.rfd100) : null, rfd200_kgs: B[s].r200 ? Math.round(B[s].r200.r.rfd200) : null })
  return { izquierda: lado('I'), derecha: lado('D'), asimetria_pico_pct: A ? +A.pct.toFixed(1) : null, lado_fuerte: A?.side || null }
}

/* ---------- Lectura de exportaciones Tindeq ---------- */
export function isoParseCsv(text) {
  const lines = text.split(/\r?\n/); let name = null, i0 = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^Name,/.test(lines[i]) && lines[i + 1]) name = lines[i + 1].split(',')[0].trim()
    if (/^Time,/.test(lines[i])) { i0 = i; break }
  }
  if (i0 < 0) return null
  const t = [], w = []
  for (let i = i0 + 1; i < lines.length; i++) { const p = lines[i].split(','); if (p.length < 2 || p[0] === '') continue; const a = parseFloat(p[0]), b = parseFloat(p[1]); if (isFinite(a) && isFinite(b)) { t.push(a); w.push(b) } }
  return t.length > 50 ? { name, t, w } : null
}
function isoSettings(text) {
  const L = text.split(/\r?\n/).filter(Boolean); if (L.length < 2) return null
  const h = L[0].split(','), v = L[1].split(','); const o = {}; h.forEach((kk, i) => { o[kk.trim()] = (v[i] || '').trim() }); return o
}
export function isoSide(s) {
  s = (s || '').toLowerCase()
  if (/(izq|izd|izquierd|left)/.test(s)) return 'I'
  if (/(dch|derech|right)/.test(s)) return 'D'
  return null
}
export const isoMuscle = tag => {
  const m = (tag || '').replace(/\b(izq\w*|izd\w*|dch\w*|derech\w*|left|right)\b/gi, '').replace(/[_\s]+/g, ' ').trim()
  const map = { isq: 'Isquios', isquio: 'Isquios', isqui: 'Isquios', abd: 'Abductores', add: 'Aductores', rot: 'Rotadores', cuad: 'Cuádriceps', quad: 'Cuádriceps' }
  const kk = m.toLowerCase(); return map[kk] || (m ? m[0].toUpperCase() + m.slice(1) : 'Isometría')
}
async function isoReadZip(z, fname, groups) {
  let settings = null; const curves = []
  for (const [p, e] of Object.entries(z.files)) {
    if (e.dir) continue
    if (/settings\.csv$/i.test(p)) settings = isoSettings(await e.async('string')) || settings
    else if (/data\.zip$/i.test(p)) {
      const inner = await JSZip.loadAsync(await e.async('arraybuffer'))
      for (const [q, f] of Object.entries(inner.files)) if (!f.dir && /\.csv$/i.test(q)) { const c = isoParseCsv(await f.async('string')); if (c) curves.push({ ...c, file: q }) }
    } else if (/\.csv$/i.test(p) && !/reps\.csv$|timeline/i.test(p)) { const c = isoParseCsv(await e.async('string')); if (c) curves.push({ ...c, file: p }) }
  }
  groups.push({ settings, curves, fname })
}
/** Devuelve grupos { musculo, fecha, intentos: [{side, name, t, w}] } a partir de archivos .zip / .csv de Tindeq */
export async function leerTindeq(files) {
  const groups = []; const loose = { settings: null, curves: [], fname: files.map(f => f.name).join(' ') }
  for (const f of files) {
    try {
      if (/\.zip$/i.test(f.name)) await isoReadZip(await JSZip.loadAsync(await f.arrayBuffer()), f.name, groups)
      else if (/settings\.csv$/i.test(f.name)) loose.settings = isoSettings(await f.text())
      else if (/\.csv$/i.test(f.name) && !/timeline|reps/i.test(f.name)) { const c = isoParseCsv(await f.text()); if (c) loose.curves.push({ ...c, file: f.name }) }
    } catch (e) { /* archivo no reconocido */ }
  }
  const lone = groups.filter(g => !g.settings)
  if (loose.settings && lone.length === 1 && !loose.curves.length) lone[0].settings = loose.settings
  else if (loose.curves.length) groups.push(loose)
  const out = []
  for (const g of groups) {
    if (!g.curves.length) continue
    const tag = g.settings?.Tag || g.settings?.Comment || ''
    const side = isoSide(tag) || isoSide(g.settings?.Comment) || isoSide(g.fname) || 'I'
    const fecha = (g.settings?.Date || '').slice(0, 10) || new Date().toISOString().slice(0, 10)
    const musculo = isoMuscle(tag || g.fname.replace(/^.*PM_|\.zip$/g, ''))
    g.curves.sort((a, b) => (a.name || a.file).localeCompare(b.name || b.file, 'es', { numeric: true }))
    let grupo = out.find(x => x.musculo === musculo && x.fecha === fecha)
    if (!grupo) { grupo = { musculo, fecha, intentos: [] }; out.push(grupo) }
    g.curves.forEach(c => grupo.intentos.push({ side, name: (c.name || c.file.replace(/^.*\//, '').replace(/\.csv$/, '')).replace(/^work/i, 'int').toLowerCase(), t: c.t, w: c.w }))
  }
  return out
}
