/**
 * RecursosPortal — pestaña "Recursos" del portal del cliente.
 * Sesiones sin fecha agrupadas en los grupos que la entrenadora crea para
 * cada cliente (recurso_grupos)
 * que el cliente puede abrir cuando las necesite.
 */
import { CATEGORIAS_RECURSO } from './RecursosEntrenadora'

export default function RecursosPortal({ T, isDesktop, recursos, grupos: gruposCliente = [], card, abrirSesion }) {
  // Grupos propios del cliente; los recursos sin grupo caen en su categoría antigua
  const propios = gruposCliente.map(g => ({ key: g.id, label: g.nombre, icono: g.icono || '📋', color: g.color || '#4C82E8', descripcion: g.descripcion, items: recursos.filter(r => r.recurso_grupo_id === g.id) }))
  const sueltos = recursos.filter(r => !r.recurso_grupo_id || !gruposCliente.some(g => g.id === r.recurso_grupo_id))
  const antiguos = CATEGORIAS_RECURSO.map(cat => ({ ...cat, items: sueltos.filter(r => r.recurso === cat.key) }))
  const otros = sueltos.filter(r => !CATEGORIAS_RECURSO.some(c => c.key === r.recurso))
  const grupos = [...propios, ...antiguos, ...(otros.length ? [{ key: '_otros', label: 'Otros', icono: '📋', color: '#6b7280', items: otros }] : [])]
    .filter(g => g.items.length > 0)

  return (
    <div style={isDesktop
      ? { padding: '20px 0 60px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }
      : { padding: '14px 16px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {grupos.length === 0 && (
        <div style={{ fontSize: 13, color: T.ink3, padding: 20, textAlign: 'center' }}>Todavía no hay recursos.</div>
      )}
      {grupos.map(g => (
        <div key={g.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{g.icono}</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '.6px', textTransform: 'uppercase', color: T.ink2, fontWeight: 600 }}>{g.label}</span>
          </div>
          {g.descripcion && <div style={{ fontSize: 12, color: T.ink2, margin: '-2px 0 8px', lineHeight: 1.4 }}>{g.descripcion}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.items.map(r => (
              <div key={r.id} onClick={() => abrirSesion(r)}
                style={{ ...card, borderLeft: `4px solid ${g.color}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${g.color}1f`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{r.icono || g.icono}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{r.titulo}</div>
                  {r.objetivo && <div style={{ fontSize: 12, color: T.ink2, marginTop: 2, lineHeight: 1.4 }}>{r.objetivo}</div>}
                  {r.duracion_min && <div style={{ fontFamily: T.mono, fontSize: 10, color: T.ink3, marginTop: 3 }}>{r.duracion_min} min</div>}
                </div>
                <span style={{ fontSize: 18, color: T.ink3 }}>›</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
