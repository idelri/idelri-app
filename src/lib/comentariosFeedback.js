/** Comentarios escritos del feedback de una sesión, etiquetados por su origen. Lo usan el Timeline y el pop-up de sesión. */
// Comentarios del cliente: de dónde sale cada uno (feedback o añadido a mano)
export const TIPOS_COM = {
  no_completada: { label: 'No completada', icono: '⛔', color: '#b91c1c' },
  parcial:       { label: 'Parcial',       icono: '◐', color: '#d97706' },
  molestia:      { label: 'Molestia',      icono: '🔴', color: '#dc2626' },
  tecnica:       { label: 'Técnica',       icono: '🟣', color: '#7c3aed' },
  material:      { label: 'Material',      icono: '🧰', color: '#92400e' },
  comprension:   { label: 'No entendió',   icono: '❓', color: '#0e7490' },
  general:       { label: 'General',       icono: '💭', color: '#64748b' },
}
// Saca del feedback de una sesión los comentarios escritos (los números van a la fila de carga)
export function comentariosDeFeedback(fb, s) {
  const d = fb?.data || {}; const out = []
  const t = x => (typeof x === 'string' ? x.trim() : '')
  const base = { sesion: s, fecha: String(s.fecha).slice(0, 10), origen: 'feedback' }
  const c = d.completion || {}
  if (c.status === 'partial' || c.status === 'missed') {
    const motivos = (c.reasons || []).filter(Boolean)
    const texto = [motivos.join(' · '), t(c.partialDetails)].filter(Boolean).join(' — ')
    out.push({ ...base, tipo: c.status === 'missed' ? 'no_completada' : 'parcial', texto: texto || (c.status === 'missed' ? 'No la hizo' : 'La hizo en parte') })
  }
  ;((d.pain && d.pain.entries) || []).forEach(e => { if (t(e.details) || e.intensity != null) out.push({ ...base, tipo: 'molestia', texto: t(e.details) || 'Molestia', intensidad: e.intensity }) })
  const tec = d.technical || {}
  ;[tec.mainTechnicalDetails, tec.additionalTechnicalDetails].map(t).filter(Boolean).forEach(x => out.push({ ...base, tipo: 'tecnica', texto: x }))
  if (t(d.equipment?.details)) out.push({ ...base, tipo: 'material', texto: t(d.equipment.details) })
  if (t(d.understanding?.details)) out.push({ ...base, tipo: 'comprension', texto: t(d.understanding.details) })
  if (t(d.generalComments)) out.push({ ...base, tipo: 'general', texto: t(d.generalComments) })
  return out
}

