/**
 * zonas.js — perfil fisiológico del cliente y cálculo de zonas.
 *
 * Se guarda en clientes.perfil_zonas (jsonb):
 * {
 *   fc_max, fc_reposo, fc_umbral,          // ppm
 *   ritmo_umbral_seg, ritmo_maraton_seg,   // segundos por km
 *   metodo_fc: 'fcmax' | 'reserva' | 'umbral',
 *   zonas_fc:    [{ nombre, min, max }],   // % según metodo_fc
 *   zonas_ritmo: [{ nombre, min, max }],   // % de la VELOCIDAD de umbral
 *   ritmos_maraton: [pct, ...],            // % de la velocidad de ritmo maratón
 * }
 *
 * Los porcentajes de ritmo van sobre la velocidad (no sobre el tiempo):
 * 110 % = más rápido que el ritmo de referencia. Así 105 % de ritmo maratón
 * es "un 5 % más rápido", como en el método de John Davis.
 */

export const METODOS_FC = [
  { key: 'fcmax',   label: '% FC máx' },
  { key: 'reserva', label: '% FC reserva (Karvonen)' },
  { key: 'umbral',  label: '% FC umbral' },
]

export const ZONAS_FC_DEFECTO = {
  fcmax: [
    { nombre: 'Z1 · Recuperación', min: 50, max: 60 },
    { nombre: 'Z2 · Aeróbico',     min: 60, max: 70 },
    { nombre: 'Z3 · Tempo',        min: 70, max: 80 },
    { nombre: 'Z4 · Umbral',       min: 80, max: 90 },
    { nombre: 'Z5 · VO2máx',       min: 90, max: 100 },
  ],
  reserva: [
    { nombre: 'Z1 · Recuperación', min: 50, max: 60 },
    { nombre: 'Z2 · Aeróbico',     min: 60, max: 70 },
    { nombre: 'Z3 · Tempo',        min: 70, max: 80 },
    { nombre: 'Z4 · Umbral',       min: 80, max: 90 },
    { nombre: 'Z5 · VO2máx',       min: 90, max: 100 },
  ],
  umbral: [
    { nombre: 'Z1 · Recuperación', min: 65, max: 85 },
    { nombre: 'Z2 · Aeróbico',     min: 85, max: 89 },
    { nombre: 'Z3 · Tempo',        min: 90, max: 94 },
    { nombre: 'Z4 · Umbral',       min: 95, max: 100 },
    { nombre: 'Z5 · VO2máx',       min: 101, max: 106 },
  ],
}

export const ZONAS_RITMO_DEFECTO = [
  { nombre: 'Z1 · Recuperación', min: 65, max: 78 },
  { nombre: 'Z2 · Aeróbico',     min: 78, max: 88 },
  { nombre: 'Z3 · Tempo',        min: 88, max: 95 },
  { nombre: 'Z4 · Umbral',       min: 95, max: 101 },
  { nombre: 'Z5 · VO2máx',       min: 101, max: 112 },
]

export const RITMOS_MARATON_DEFECTO = [80, 85, 90, 95, 100, 103, 105, 108, 110]

export function perfilConDefectos(p) {
  const metodo = p?.metodo_fc || 'fcmax'
  return {
    fc_max: p?.fc_max ?? '', fc_reposo: p?.fc_reposo ?? '', fc_umbral: p?.fc_umbral ?? '',
    ritmo_umbral_seg: p?.ritmo_umbral_seg ?? null, ritmo_maraton_seg: p?.ritmo_maraton_seg ?? null,
    metodo_fc: metodo,
    zonas_fc: p?.zonas_fc?.length ? p.zonas_fc : ZONAS_FC_DEFECTO[metodo],
    zonas_ritmo: p?.zonas_ritmo?.length ? p.zonas_ritmo : ZONAS_RITMO_DEFECTO,
    ritmos_maraton: p?.ritmos_maraton?.length ? p.ritmos_maraton : RITMOS_MARATON_DEFECTO,
  }
}

/** % → pulsaciones según el método. Devuelve null si faltan datos. */
export function pctAPulsaciones(pct, perfil) {
  const max = Number(perfil.fc_max), rep = Number(perfil.fc_reposo), umb = Number(perfil.fc_umbral)
  if (perfil.metodo_fc === 'umbral') return umb ? Math.round(umb * pct / 100) : null
  if (perfil.metodo_fc === 'reserva') return max && rep ? Math.round(rep + (max - rep) * pct / 100) : null
  return max ? Math.round(max * pct / 100) : null
}

/** % de la velocidad de referencia → segundos por km */
export function pctARitmo(pct, ritmoSeg) {
  if (!ritmoSeg || !pct) return null
  return Math.round(ritmoSeg * 100 / pct)
}

/** 245 → "4:05" */
export function fmtRitmo(seg) {
  if (seg == null || isNaN(seg)) return '—'
  const m = Math.floor(seg / 60), s = Math.round(seg % 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

/** "4:05" / "4.05" / "245" → 245 (segundos). Vacío o inválido → null */
export function parseRitmo(txt) {
  const t = String(txt ?? '').trim().replace(/[.,']/g, ':').replace(/"/g, '')
  if (!t) return null
  if (/^\d+$/.test(t)) { const n = parseInt(t, 10); return n > 20 ? n : n * 60 }
  const m = t.match(/^(\d{1,2}):(\d{1,2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
}

/** Tiempo de maratón a partir del ritmo (s/km) → "3:05:12" */
export function fmtTiempoMaraton(ritmoSeg) {
  if (!ritmoSeg) return '—'
  const t = Math.round(ritmoSeg * 42.195)
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ── Pasos de los bloques de resistencia ──────────────────────────────── */

export const TIPOS_PASO = [
  { key: 'calentamiento', label: 'Calentamiento',     color: '#60a5fa' },
  { key: 'activo',        label: 'Activo',            color: '#ef4444' },
  { key: 'recuperacion',  label: 'Recuperación',      color: '#34d399' },
  { key: 'vuelta_calma',  label: 'Vuelta a la calma', color: '#a78bfa' },
  { key: 'descanso',      label: 'Descanso',          color: '#cbd5e1' },
]
export const colorTipoPaso = t => (TIPOS_PASO.find(x => x.key === t)?.color) || '#4C82E8'
export const labelTipoPaso = t => (TIPOS_PASO.find(x => x.key === t)?.label) || 'Paso'

export const OBJETIVOS = [
  { key: 'fcmax',         label: '% FC máx',        corto: '% FCmáx' },
  { key: 'fcumbral',      label: '% FC umbral',     corto: '% FCumbral' },
  { key: 'ritmo_umbral',  label: '% ritmo umbral',  corto: '% R.umbral' },
  { key: 'ritmo_maraton', label: '% ritmo maratón', corto: '% RM' },
  { key: 'zona_fc',       label: 'Zona de FC',      corto: 'Zona FC' },
  { key: 'zona_ritmo',    label: 'Zona de ritmo',   corto: 'Zona ritmo' },
  { key: 'rpe',           label: 'RPE',             corto: 'RPE' },
]

/** Duración del paso en segundos (o null), aceptando los campos antiguos */
export function duracionPaso(f) {
  if (f.duracion_seg) return Number(f.duracion_seg)
  if (f.volumen_min) return Number(f.volumen_min) * 60
  return null
}
/** Distancia del paso en metros (o null), aceptando los campos antiguos */
export function distanciaPaso(f) {
  if (f.distancia_m) return Number(f.distancia_m)
  if (f.volumen_km) return Math.round(Number(f.volumen_km) * 1000)
  return null
}

/** "1:05:00", "12:30", "45 s" */
export function fmtDuracionPaso(seg) {
  if (!seg) return ''
  seg = Math.round(seg)
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  if (!m) return `${s}"`
  return s ? `${m}:${String(s).padStart(2, '0')}` : `${m}'`
}
/** "1:05:00" / "12:30" / "12" (minutos) / "45s" → segundos */
export function parseDuracionPaso(txt) {
  const t = String(txt ?? '').trim().toLowerCase().replace(/[.,]/g, ':').replace(/['′]/g, ':').replace(/["″]/g, 's')
  if (!t) return null
  let m
  if ((m = t.match(/^(\d+)\s*s$/))) return parseInt(m[1], 10)
  if ((m = t.match(/^(\d+)\s*(min|m)?$/))) return parseInt(m[1], 10) * 60
  if ((m = t.match(/^(\d+):(\d{1,2})s?$/))) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10)
  if ((m = t.match(/^(\d+):(\d{1,2}):(\d{1,2})$/))) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
  if ((m = t.match(/^(\d+):$/))) return parseInt(m[1], 10) * 60
  return null
}
/** 1500 → "1,5 km", 400 → "400 m" */
export function fmtDistancia(m) {
  if (!m) return ''
  return m >= 1000 ? `${(m / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 })} km` : `${m} m`
}

/** Texto del objetivo: "75–80 % FC máx", "Z2–Z3", "RPE 6" */
export function etiquetaObjetivo(f) {
  const t = f.objetivo_tipo
  if (!t) return ''
  const a = f.objetivo_min, b = f.objetivo_max
  const rango = a != null && b != null && Number(a) !== Number(b) ? `${a}–${b}` : `${a ?? b ?? ''}`
  if (t === 'zona_fc' || t === 'zona_ritmo') {
    const z = a != null && b != null && Number(a) !== Number(b) ? `Z${a}–Z${b}` : `Z${a ?? b}`
    return `${z} ${t === 'zona_fc' ? 'FC' : 'ritmo'}`
  }
  if (t === 'rpe') return `RPE ${rango}`
  return `${rango} ${OBJETIVOS.find(o => o.key === t)?.label || ''}`
}

/**
 * Objetivo traducido a este deportista: "142–154 ppm" o "4:30–4:18 /km".
 * perfil: clientes.perfil_zonas (puede venir incompleto). Devuelve null si
 * no se puede calcular.
 */
export function objetivoPersonal(f, perfilRaw) {
  if (!perfilRaw || !f.objetivo_tipo) return null
  const p = perfilConDefectos(perfilRaw)
  const a = f.objetivo_min != null ? Number(f.objetivo_min) : null
  const b = f.objetivo_max != null ? Number(f.objetivo_max) : a
  const lo = a ?? b
  if (lo == null) return null
  const ppm = (x, y) => x && y ? (x === y ? `${x} ppm` : `${Math.min(x, y)}–${Math.max(x, y)} ppm`) : null
  const ritmo = (x, y) => x && y ? (x === y ? `${fmtRitmo(x)} /km` : `${fmtRitmo(Math.max(x, y))}–${fmtRitmo(Math.min(x, y))} /km`) : null
  switch (f.objetivo_tipo) {
    case 'fcmax':    return p.fc_max ? ppm(Math.round(p.fc_max * lo / 100), Math.round(p.fc_max * b / 100)) : null
    case 'fcumbral': return p.fc_umbral ? ppm(Math.round(p.fc_umbral * lo / 100), Math.round(p.fc_umbral * b / 100)) : null
    case 'ritmo_umbral':  return ritmo(pctARitmo(lo, p.ritmo_umbral_seg), pctARitmo(b, p.ritmo_umbral_seg))
    case 'ritmo_maraton': return ritmo(pctARitmo(lo, p.ritmo_maraton_seg), pctARitmo(b, p.ritmo_maraton_seg))
    case 'zona_fc': {
      const z1 = p.zonas_fc[lo - 1], z2 = p.zonas_fc[b - 1]
      if (!z1 || !z2) return null
      return ppm(pctAPulsaciones(Number(z1.min), p), pctAPulsaciones(Number(z2.max), p))
    }
    case 'zona_ritmo': {
      const z1 = p.zonas_ritmo[lo - 1], z2 = p.zonas_ritmo[b - 1]
      if (!z1 || !z2) return null
      return ritmo(pctARitmo(Number(z1.min), p.ritmo_umbral_seg), pctARitmo(Number(z2.max), p.ritmo_umbral_seg))
    }
    default: return null
  }
}

/** Intensidad relativa 0–1 para la gráfica (también con campos antiguos) */
export function intensidadPaso(f) {
  const a = f.objetivo_min != null ? Number(f.objetivo_min) : null
  const b = f.objetivo_max != null ? Number(f.objetivo_max) : a
  const mid = a != null ? (a + (b ?? a)) / 2 : null
  if (mid != null) {
    switch (f.objetivo_tipo) {
      case 'fcmax': return Math.max(0.1, Math.min(1, (mid - 45) / 55))
      case 'fcumbral': return Math.max(0.1, Math.min(1, (mid - 60) / 50))
      case 'ritmo_umbral': return Math.max(0.1, Math.min(1, (mid - 60) / 52))
      case 'ritmo_maraton': return Math.max(0.1, Math.min(1, (mid - 65) / 55))
      case 'zona_fc': case 'zona_ritmo': return Math.max(0.1, Math.min(1, mid / 5))
      case 'rpe': return Math.max(0.1, Math.min(1, mid / 10))
      default: break
    }
  }
  if (f.fc_zona) return f.fc_zona / 5
  if (f.rpe) return f.rpe / 10
  return { calentamiento: 0.35, activo: 0.75, recuperacion: 0.3, vuelta_calma: 0.3, descanso: 0.12 }[f.tipo_paso] || 0.45
}

/** Segundos estimados de un paso (si va por distancia, a ~5:30/km o su ritmo objetivo) */
export function segundosEstimados(f, perfilRaw) {
  const d = duracionPaso(f)
  if (d) return d
  const m = distanciaPaso(f)
  if (!m) return 0
  let ritmo = 330
  if (perfilRaw && (f.objetivo_tipo === 'ritmo_umbral' || f.objetivo_tipo === 'ritmo_maraton')) {
    const p = perfilConDefectos(perfilRaw)
    const ref = f.objetivo_tipo === 'ritmo_umbral' ? p.ritmo_umbral_seg : p.ritmo_maraton_seg
    const pct = f.objetivo_min != null ? (Number(f.objetivo_min) + Number(f.objetivo_max ?? f.objetivo_min)) / 2 : null
    if (ref && pct) ritmo = pctARitmo(pct, ref)
  }
  return Math.round(m / 1000 * ritmo)
}
