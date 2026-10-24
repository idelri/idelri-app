/**
 * PasosCompactos — lista compacta de los pasos de un bloque de resistencia.
 * Se usa en la vista de sesión del cliente y en los pop-ups del calendario
 * (entrenadora y portal). Una línea por paso: nombre · volumen, y debajo la
 * intensidad con los valores personales del deportista (ppm o min/km).
 * Las repeticiones van agrupadas con "6×" y una barra azul a la izquierda.
 */
import {
  labelTipoPaso, duracionPaso, distanciaPaso, fmtDuracionPaso, fmtDistancia,
  etiquetaObjetivo, objetivoPersonal, intensidadPaso,
} from '../lib/zonas'

const AZUL = '#1f2d8a'
const PEND = { llano: 'Llano', suave: 'Pendiente suave', moderado: 'Pendiente moderada', fuerte: 'Pendiente fuerte', muy_fuerte: 'Pendiente muy fuerte' }

function volumen(f) {
  const d = duracionPaso(f), m = distanciaPaso(f)
  return [d ? fmtDuracionPaso(d) : '', m ? fmtDistancia(m) : ''].filter(Boolean).join(' · ')
}

function intensidad(f, perfil) {
  if (f.objetivo_tipo) return { personal: objetivoPersonal(f, perfil), etiqueta: etiquetaObjetivo(f) }
  const partes = []
  if (f.ritmo_inicio || f.ritmo_fin) partes.push(`${f.ritmo_inicio || '–'}${f.ritmo_fin ? `–${f.ritmo_fin}` : ''} /km`)
  if (f.fc_zona) partes.push(`Z${f.fc_zona} FC`)
  if (f.rpe) partes.push(`RPE ${f.rpe}`)
  return { personal: null, etiqueta: partes.join(' · ') }
}

function pendiente(f) {
  const pct = f.pendiente_pct_min != null
    ? (f.pendiente_pct_max != null && Number(f.pendiente_pct_max) !== Number(f.pendiente_pct_min) ? `${f.pendiente_pct_min}–${f.pendiente_pct_max} %` : `${f.pendiente_pct_min} %`)
    : ''
  const cual = f.pendiente_cualitativa ? PEND[f.pendiente_cualitativa] : ''
  if (!cual && !pct) return ''
  return cual ? (pct ? `${cual} (${pct})` : cual) : `Pendiente ${pct}`
}

function Paso({ f, perfil, T, grande }) {
  const nombre = (f.nombre || '').trim() || labelTipoPaso(f.tipo_paso)
  const vol = volumen(f)
  const { personal, etiqueta } = intensidad(f, perfil)
  const pend = pendiente(f)
  const alto = Math.round(6 + intensidadPaso(f) * (grande ? 16 : 10))
  return (
    <div style={{ display: 'flex', gap: grande ? 10 : 7, alignItems: 'flex-start', padding: grande ? '8px 0' : '3px 0' }}>
      {/* Mini barra: su altura indica la intensidad, como en la gráfica del constructor */}
      <div style={{ width: grande ? 22 : 14, height: grande ? 22 : 16, flexShrink: 0, display: 'flex', alignItems: 'flex-end', marginTop: 1 }}>
        <div style={{ width: '100%', height: alto, background: AZUL, opacity: .35 + intensidadPaso(f) * .65, borderRadius: 3 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: grande ? 14 : 12, fontWeight: grande ? 650 : 600, color: T.ink, lineHeight: 1.3 }}>{nombre}</span>
          {vol && <span style={{ fontFamily: T.mono, fontSize: grande ? 13 : 11, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>{vol}</span>}
        </div>
        {(personal || etiqueta) && (
          <div style={{ fontSize: grande ? 12.5 : 11, lineHeight: 1.35, marginTop: 1 }}>
            {personal && <span style={{ fontWeight: 700, color: AZUL, fontFamily: T.mono }}>{personal}</span>}
            {personal && etiqueta && <span style={{ color: T.ink3 }}> · </span>}
            {etiqueta && <span style={{ color: T.ink3 }}>{etiqueta}</span>}
          </div>
        )}
        {pend && <div style={{ fontSize: grande ? 12 : 10.5, color: T.ink3, marginTop: 1 }}>⛰ {pend}</div>}
        {f.descripcion && <div style={{ fontSize: grande ? 12.5 : 11, color: T.ink2, marginTop: 2, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{f.descripcion}</div>}
      </div>
    </div>
  )
}

export default function PasosCompactos({ items, perfil, T, grande = false }) {
  const sep = grande ? `1px solid ${T.line || '#E4E6EB'}` : 'none'
  return (
    <div>
      {items.map((it, i) => (
        <div key={it.id} style={{ borderTop: i > 0 ? sep : 'none' }}>
          {it.type === 'grupo' ? (
            <div style={{ borderLeft: `3px solid ${AZUL}`, paddingLeft: grande ? 10 : 7, margin: grande ? '8px 0' : '3px 0' }}>
              <div style={{ fontSize: grande ? 12 : 10.5, fontWeight: 800, color: AZUL, letterSpacing: '.02em', paddingTop: grande ? 2 : 0 }}>
                <span style={{ fontFamily: T.mono, fontSize: grande ? 15 : 12 }}>{it.repeticiones}×</span> repeticiones
              </div>
              {it.fases.map(f => <Paso key={f.id} f={f} perfil={perfil} T={T} grande={grande} />)}
            </div>
          ) : (
            <Paso f={it} perfil={perfil} T={T} grande={grande} />
          )}
        </div>
      ))}
    </div>
  )
}
