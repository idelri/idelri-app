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
