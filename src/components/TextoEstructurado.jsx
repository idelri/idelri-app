/**
 * TextoEstructurado — muestra textos del plan (descripción del plan, textos
 * de semana) con un formato mínimo:
 *   ## Título       → sección (en la descripción del plan, cada día)
 *   - texto         → línea con viñeta (p. ej. un nivel por línea)
 *   **negrita**     → negrita
 *   línea en blanco → separa párrafos
 * Exporta también textoPlano() para los sitios donde el texto va recortado.
 */
import { Fragment } from 'react'

export function textoPlano(t) {
  return (t || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^##\s*/gm, '')
    .replace(/^-\s+/gm, '· ')
    .replace(/\n+/g, ' ')
    .trim()
}

// Primera frase / título corto de un texto de semana ("Toma de contacto · …")
export function tituloTexto(t) {
  const p = textoPlano(t)
  const i = p.indexOf(' · ')
  return i > 0 && i < 40 ? p.slice(0, i) : null
}

function Inline({ texto, colorNegrita }) {
  const partes = texto.split(/(\*\*.+?\*\*)/g)
  return partes.map((p, i) => p.startsWith('**') && p.endsWith('**')
    ? <strong key={i} style={{ fontWeight: 700, color: colorNegrita }}>{p.slice(2, -2)}</strong>
    : <Fragment key={i}>{p}</Fragment>)
}

/** Divide el texto en secciones: [{ titulo, lineas: [...] }] (la primera puede no tener título) */
export function seccionesTexto(t) {
  const secciones = [{ titulo: null, lineas: [] }]
  ;(t || '').split('\n').forEach(l => {
    const m = l.match(/^##\s*(.+)$/)
    if (m) secciones.push({ titulo: m[1].trim(), lineas: [] })
    else secciones[secciones.length - 1].lineas.push(l)
  })
  return secciones.filter(s => s.titulo || s.lineas.some(l => l.trim()))
}

export function Lineas({ lineas, T, color, size = 12.5 }) {
  // Agrupa en párrafos y listas
  const bloques = []
  lineas.forEach(l => {
    const t = l.trim()
    if (!t) { bloques.push({ tipo: 'sep' }); return }
    if (/^[-·•]\s+/.test(t)) {
      const ult = bloques[bloques.length - 1]
      const item = t.replace(/^[-·•]\s+/, '')
      if (ult && ult.tipo === 'lista') ult.items.push(item); else bloques.push({ tipo: 'lista', items: [item] })
      return
    }
    bloques.push({ tipo: 'p', texto: t })
  })
  const limpios = bloques.filter((b, i) => b.tipo !== 'sep' || (i > 0 && i < bloques.length - 1))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {limpios.map((b, i) => {
        if (b.tipo === 'sep') return <div key={i} style={{ height: 4 }} />
        if (b.tipo === 'lista') return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {b.items.map((it, j) => (
              <div key={j} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: color || T.ink3, flexShrink: 0, transform: 'translateY(-2px)' }} />
                <span style={{ fontSize: size, color: T.ink2, lineHeight: 1.5 }}><Inline texto={it} colorNegrita={T.ink} /></span>
              </div>
            ))}
          </div>
        )
        return <div key={i} style={{ fontSize: size, color: T.ink2, lineHeight: 1.55 }}><Inline texto={b.texto} colorNegrita={T.ink} /></div>
      })}
    </div>
  )
}

export default function TextoEstructurado({ texto, T, color, size, conTitulo }) {
  // Textos de semana "Título · resto": "**Título:** resto" (el título en negrita, seguido de su explicación)
  let t = texto || ''
  if (conTitulo) {
    const m = t.match(/^([^\n·*#]{3,40}?) · ([\s\S]*)$/)
    if (m) t = `**${m[1].trim()}:** ${m[2]}`
  }
  const secs = seccionesTexto(t)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {secs.map((s, i) => (
        <div key={i}>
          {s.titulo && <div style={{ fontSize: (size || 12.5) + 0.5, fontWeight: 700, color: T.ink, marginBottom: 3 }}>{s.titulo}</div>}
          <Lineas lineas={s.lineas} T={T} color={color} size={size} />
        </div>
      ))}
    </div>
  )
}

/**
 * ComoFuncionaPlan — tarjeta plegable con la descripción del plan. Plegada se
 * ve la introducción y los días como chips; desplegada, cada día por separado.
 */
export function ComoFuncionaPlan({ texto, T, card, color, abiertoInicial = false, abierto, onToggle }) {
  const secs = seccionesTexto(texto)
  const intro = secs[0] && !secs[0].titulo ? secs[0] : null
  const dias = secs.filter(s => s.titulo)
  const ab = abierto ?? abiertoInicial
  const col = color || T.green
  // Sin secciones: texto normal
  if (!dias.length) {
    return (
      <div style={card}>
        <div style={{ padding: '13px 14px' }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink3, marginBottom: 6 }}>Sobre el plan</div>
          <TextoEstructurado texto={texto} T={T} color={col} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ ...card, borderLeft: `3px solid ${col}` }}>
      <div onClick={onToggle} style={{ padding: '13px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🗓</span>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: T.ink }}>Cómo funciona el plan</div>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: col }}>{ab ? 'Ver menos ▲' : 'Ver más ▼'}</span>
        </div>
        {intro && <div style={{ marginTop: 6 }}><Lineas lineas={intro.lineas} T={T} color={col} size={12.5} /></div>}
        {!ab && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
            {dias.map((d, i) => {
              const [dia, que] = d.titulo.split(' · ')
              return <span key={i} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 99, background: T.bg2 || '#eee', color: T.ink2 }}><b style={{ color: T.ink }}>{dia}</b>{que ? ` · ${que}` : ''}</span>
            })}
          </div>
        )}
      </div>
      {ab && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          {dias.map((d, i) => {
            const [dia, que] = d.titulo.split(' · ')
            return (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '11px 14px', borderTop: i ? `1px solid ${T.border}` : 'none', flexWrap: 'wrap' }}>
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: T.mono, textTransform: 'uppercase', letterSpacing: '.4px', color: col, fontWeight: 700 }}>{dia}</div>
                  {que && <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginTop: 1 }}>{que}</div>}
                </div>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}><Lineas lineas={d.lineas} T={T} color={col} size={12.5} /></div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
