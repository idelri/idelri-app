import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Plus, X, Pencil } from 'lucide-react'
import PortalClienteModal from '../components/PortalClienteModal'
import Avatar from '../components/Avatar'
import { ResumenCuestionario, RespuestasCompletas } from '../components/CuestionarioViewer'

const EMPTY_CLIENTE = {
  nombre: '', email: '', telefono: '', estado: 'activo',
  fecha_inicio: '', objetivo: '', tipo_cliente: 'estandar', perfil_planificacion: 'resistencia'
}
const EMPTY_SERVICIO = {
  modalidad: 'online',
  deporte: '', deporte_complementario: '', dispositivo: ''
}

function getVistaInicial() {
  try { return localStorage.getItem('clientes_vista') || 'lista' } catch { return 'lista' }
}

export default function Clientes({ setPage, setClientePlanificacion, onAbrirFicha }) {
  const [clientes, setClientes] = useState([])
  const [perfilMap, setPerfilMap] = useState({})
  const [objetivoMap, setObjetivoMap] = useState({})
  const [planMap, setPlanMap] = useState({})
  const [loading, setLoading] = useState(true)

  // Filtros y vista
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')
  const [vista, setVista] = useState(getVistaInicial)

  // Modales
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_CLIENTE)
  const [servicio, setServicio] = useState(EMPTY_SERVICIO)
  const [saving, setSaving] = useState(false)
  const [cuestionarioModal, setCuestionarioModal] = useState(null)
  const [cuestionarioTab, setCuestionarioTab] = useState('resumen')
  const [cuestionarios, setCuestionarios] = useState({})
  const [generandoEnlace, setGenerandoEnlace] = useState(false)
  const [portalModal, setPortalModal] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    const hoy = format(new Date(), 'yyyy-MM-dd')
    const [{ data: cls }, { data: cues }, { data: perfiles }, { data: objetivos }, { data: planes }] = await Promise.all([
      supabase.from('clientes').select('*, servicios(*)').order('estado').order('nombre'),
      supabase.from('cuestionario_inicial').select('id, cliente_id, submitted_at, token_publico'),
      supabase.from('cliente_perfil').select('cliente_id, nombre_preferido, deportes_actuales'),
      supabase.from('cliente_objetivos').select('cliente_id, objetivo_principal').eq('estado', 'activo'),
      supabase.from('planificaciones')
        .select('cliente_id, nombre, fecha_inicio, fecha_fin')
        .lte('fecha_inicio', hoy)
        .or(`fecha_fin.is.null,fecha_fin.gte.${hoy}`),
    ])
    setClientes(cls || [])
    const cuesMap = {}
    ;(cues || []).forEach(c => { cuesMap[c.cliente_id] = c })
    setCuestionarios(cuesMap)
    const pm = {}
    ;(perfiles || []).forEach(p => { pm[p.cliente_id] = p })
    setPerfilMap(pm)
    const om = {}
    ;(objetivos || []).forEach(o => { om[o.cliente_id] = o })
    setObjetivoMap(om)
    const plm = {}
    ;(planes || []).forEach(p => { plm[p.cliente_id] = p })
    setPlanMap(plm)
    setLoading(false)
  }

  // ── Cuestionario ────────────────────────────────────────────────────────────

  async function abrirCuestionarioCompleto(cliente) {
    let cue = cuestionarios[cliente.id]
    if (cue?.submitted_at && !cue.objetivo_principal) {
      // cargar datos completos si solo tenemos partial
      const { data } = await supabase.from('cuestionario_inicial').select('*').eq('cliente_id', cliente.id).single()
      if (data) {
        cue = data
        setCuestionarios(prev => ({ ...prev, [cliente.id]: data }))
      }
    }
    setCuestionarioTab('resumen')
    setCuestionarioModal({ cliente, cuestionario: cue || null })
  }

  async function generarEnlaceCuestionario(cliente) {
    setGenerandoEnlace(true)
    const { data } = await supabase.from('cuestionario_inicial').insert({ cliente_id: cliente.id }).select().single()
    setCuestionarios(prev => ({ ...prev, [cliente.id]: data }))
    setCuestionarioModal({ cliente, cuestionario: data })
    setGenerandoEnlace(false)
  }

  // ── Crear / Editar cliente ──────────────────────────────────────────────────

  function abrirNuevo() {
    setForm(EMPTY_CLIENTE)
    setServicio(EMPTY_SERVICIO)
    setModal('nuevo')
  }

  function abrirEditar(c) {
    setForm({
      nombre: c.nombre || '', email: c.email || '', telefono: c.telefono || '',
      estado: c.estado || 'activo', fecha_inicio: c.fecha_inicio || '', objetivo: c.objetivo || '',
      tipo_cliente: c.tipo_cliente || 'estandar',
      perfil_planificacion: c.perfil_planificacion || 'resistencia'
    })
    const s = c.servicios?.[0]
    setServicio(s ? {
      modalidad: s.modalidad || 'online',
      deporte: s.deporte || '',
      deporte_complementario: s.deporte_complementario || '',
      dispositivo: s.dispositivo || ''
    } : EMPTY_SERVICIO)
    setModal({ cliente: c, servicioId: s?.id })
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const datosCliente = {
      nombre: form.nombre.trim(),
      email: form.email || null,
      telefono: form.telefono || null,
      estado: form.estado,
      fecha_inicio: form.fecha_inicio || null,
      tipo_cliente: form.tipo_cliente || 'estandar',
      perfil_planificacion: form.perfil_planificacion || 'resistencia',
    }
    let clienteId
    if (modal === 'nuevo') {
      const { data } = await supabase.from('clientes').insert(datosCliente).select().single()
      clienteId = data?.id
    } else {
      await supabase.from('clientes').update(datosCliente).eq('id', modal.cliente.id)
      clienteId = modal.cliente.id
    }
    if (clienteId) {
      const datosServicio = {
        modalidad: servicio.modalidad,
        deporte: servicio.deporte || null,
        deporte_complementario: servicio.deporte_complementario || null,
        dispositivo: servicio.dispositivo || null,
      }
      const { data: existing } = await supabase.from('servicios').select('id').eq('cliente_id', clienteId).order('created_at', { ascending: false })
      if (existing?.[0]) {
        await supabase.from('servicios').update(datosServicio).eq('id', existing[0].id)
      } else {
        await supabase.from('servicios').insert({ ...datosServicio, cliente_id: clienteId })
      }
    }
    setSaving(false)
    setModal(null)
    cargar()
  }

  // ── Vista toggle ────────────────────────────────────────────────────────────

  function cambiarVista(v) {
    setVista(v)
    try { localStorage.setItem('clientes_vista', v) } catch {}
  }

  // ── Filtrado ────────────────────────────────────────────────────────────────

  const clientesFiltrados = clientes.filter(c => {
    const matchEstado = filtroEstado === 'todos' || c.estado === filtroEstado
    const q = busqueda.toLowerCase().trim()
    if (!q) return matchEstado
    const p = perfilMap[c.id]
    const matchNombre = c.nombre.toLowerCase().includes(q)
    const matchPreferido = (p?.nombre_preferido || '').toLowerCase().includes(q)
    const matchEmail = (c.email || '').toLowerCase().includes(q)
    return matchEstado && (matchNombre || matchPreferido || matchEmail)
  })

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getActividad(c) {
    const s = c.servicios?.[0]
    if (s?.deporte) return s.deporte
    const p = perfilMap[c.id]
    if (p?.deportes_actuales?.length) return p.deportes_actuales[0]
    return null
  }

  function getModalidadBadge(modalidad) {
    const cfg = { online: { label: 'Online', color: 'var(--info)', bg: 'var(--info-light)' }, hibrido: { label: 'Híbrido', color: 'var(--accent)', bg: 'var(--accent-light)' } }
    return cfg[modalidad] || { label: modalidad, color: 'var(--text3)', bg: 'var(--bg2)' }
  }

  if (loading) return <div className="empty"><p>Cargando...</p></div>

  const totalActivos = clientes.filter(c => c.estado === 'activo').length
  const totalBajas = clientes.filter(c => c.estado === 'baja').length

  return (
    <div>
      {/* ── Cabecera ──────────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Clientes</h2>
          <p className="page-subtitle">{totalActivos} activos · {totalBajas} inactivos</p>
        </div>
        <button className="btn btn-primary" onClick={abrirNuevo}>
          <Plus size={14} /> Nuevo cliente
        </button>
      </div>

      {/* ── Barra de búsqueda + filtros + vista ───────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="Buscar cliente..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{ width: 220, height: 34, fontSize: 13 }}
        />

        <div className="flex gap-1" style={{ flex: 1 }}>
          {[
            { value: 'todos', label: 'Todos' },
            { value: 'activo', label: 'Activos' },
            { value: 'baja', label: 'Inactivos' },
          ].map(f => (
            <button key={f.value} className="btn btn-ghost btn-sm"
              style={filtroEstado === f.value ? { background: 'var(--bg2)', fontWeight: 600 } : {}}
              onClick={() => setFiltroEstado(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Toggle de vista */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          {[
            { v: 'lista', label: '☷ Lista' },
            { v: 'fichas', label: '▦ Fichas' },
          ].map(({ v, label }) => (
            <button key={v} onClick={() => cambiarVista(v)}
              style={{
                padding: '5px 12px', fontSize: 12.5, fontWeight: vista === v ? 600 : 400,
                background: vista === v ? 'var(--bg2)' : 'var(--surface)',
                color: vista === v ? 'var(--text)' : 'var(--text3)',
                border: 'none', cursor: 'pointer',
                borderRight: v === 'lista' ? '1px solid var(--border)' : 'none',
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sin resultados ────────────────────────────────────────────────────── */}
      {clientesFiltrados.length === 0 && (
        <div className="empty" style={{ padding: '40px 0' }}>
          <p style={{ color: 'var(--text3)' }}>No hay clientes que coincidan con el filtro.</p>
        </div>
      )}

      {/* ── Vista Lista ───────────────────────────────────────────────────────── */}
      {vista === 'lista' && clientesFiltrados.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Objetivo</th>
                <th>Actividad</th>
                <th>Modalidad</th>
                <th>Plan activo</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map(c => {
                const s = c.servicios?.[0]
                const p = perfilMap[c.id]
                const obj = objetivoMap[c.id]
                const plan = planMap[c.id]
                const actividad = getActividad(c)
                const modalBadge = getModalidadBadge(s?.modalidad)
                const nombrePreferido = p?.nombre_preferido
                const esBaja = c.estado === 'baja'

                return (
                  <tr key={c.id}
                    style={{ cursor: 'pointer', opacity: esBaja ? 0.65 : 1 }}
                    onClick={() => onAbrirFicha?.(c.id)}>

                    {/* Cliente */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar url={c.foto_url} nombre={c.nombre} size={30} />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 13.5, lineHeight: 1.3 }}>{c.nombre}</div>
                          {nombrePreferido && nombrePreferido.toLowerCase() !== c.nombre.split(' ')[0].toLowerCase() && (
                            <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.2 }}>"{nombrePreferido}"</div>
                          )}
                          {c.tipo_cliente === 'familia_gratis' && (
                            <span style={{ fontSize: 10, color: 'var(--text3)', background: 'var(--bg2)', padding: '1px 5px', borderRadius: 4 }}>Gratis</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Objetivo */}
                    <td style={{ maxWidth: 200 }}>
                      {obj?.objetivo_principal ? (
                        <span style={{ fontSize: 12.5, color: 'var(--text2)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {obj.objetivo_principal}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Actividad */}
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>
                      {actividad || <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>

                    {/* Modalidad */}
                    <td>
                      {s?.modalidad ? (
                        <span style={{ fontSize: 11.5, fontWeight: 500, padding: '2px 8px', borderRadius: 5, background: modalBadge.bg, color: modalBadge.color }}>
                          {modalBadge.label}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>—</span>}
                    </td>

                    {/* Plan activo */}
                    <td style={{ fontSize: 12.5, color: 'var(--text2)', maxWidth: 160 }}>
                      {plan ? (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                          {plan.nombre}
                        </span>
                      ) : <span style={{ color: 'var(--text3)', fontSize: 12 }}>Sin plan</span>}
                    </td>

                    {/* Estado */}
                    <td>
                      {esBaja
                        ? <span className="badge badge-gray">Inactivo</span>
                        : <span className="badge badge-green">Activo</span>}
                    </td>

                    {/* Acciones — stopPropagation para no abrir ficha */}
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn btn-ghost btn-sm" title="Editar" onClick={() => abrirEditar(c)}>
                        <Pencil size={12} />
                      </button>
                      {c.token_cliente && (
                        <button className="btn btn-ghost btn-sm" title="Portal del cliente"
                          onClick={() => setPortalModal(c)}>🔗</button>
                      )}
                      <button className="btn btn-ghost btn-sm" title="Cuestionario inicial"
                        onClick={() => abrirCuestionarioCompleto(c)}
                        style={{ position: 'relative' }}>
                        📋
                        {cuestionarios[c.id]?.submitted_at && (
                          <span style={{ position: 'absolute', top: 2, right: 2, width: 7, height: 7, borderRadius: '50%', background: '#2d6a4f', border: '1.5px solid #fff' }} />
                        )}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Vista Fichas ──────────────────────────────────────────────────────── */}
      {vista === 'fichas' && clientesFiltrados.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
          {clientesFiltrados.map(c => {
            const s = c.servicios?.[0]
            const p = perfilMap[c.id]
            const obj = objetivoMap[c.id]
            const plan = planMap[c.id]
            const actividad = getActividad(c)
            const esBaja = c.estado === 'baja'

            return (
              <div key={c.id}
                onClick={() => onAbrirFicha?.(c.id)}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '16px', cursor: 'pointer',
                  opacity: esBaja ? 0.6 : 1,
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(45,106,79,0.1)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none' }}
              >
                {/* Cabecera de ficha */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Avatar url={c.foto_url} nombre={c.nombre} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p?.nombre_preferido || c.nombre.split(' ')[0]}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nombre}
                    </div>
                  </div>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: esBaja ? 'var(--text3)' : 'var(--accent)', flexShrink: 0 }} />
                </div>

                {/* Actividad + modalidad */}
                {(actividad || s?.modalidad) && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
                    {[actividad, s?.modalidad && (s.modalidad === 'online' ? 'Online' : 'Híbrido')].filter(Boolean).join(' · ')}
                  </div>
                )}

                {/* Objetivo */}
                {obj?.objetivo_principal && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {obj.objetivo_principal}
                  </div>
                )}

                {/* Plan activo */}
                {plan && (
                  <div style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 500, marginBottom: 4 }}>
                    {plan.nombre}
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>Ver ficha →</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal cuestionario ────────────────────────────────────────────────── */}
      {cuestionarioModal && (
        <div className="modal-backdrop" onClick={() => setCuestionarioModal(null)}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Cuestionario inicial · {cuestionarioModal.cliente.nombre}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setCuestionarioModal(null)}><X size={14} /></button>
            </div>

            {!cuestionarioModal.cuestionario ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 20 }}>Genera el enlace del cuestionario para enviárselo al cliente.</p>
                <button className="btn btn-primary" onClick={() => generarEnlaceCuestionario(cuestionarioModal.cliente)} disabled={generandoEnlace}>
                  {generandoEnlace ? 'Generando...' : '📋 Generar enlace del cuestionario'}
                </button>
              </div>
            ) : !cuestionarioModal.cuestionario.submitted_at ? (
              <div style={{ padding: '20px 0' }}>
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
                  ⏳ Pendiente de respuesta por el cliente
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>Enlace para enviar al cliente:</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={`${window.location.origin}/cuestionario/${cuestionarioModal.cuestionario.token_publico}`}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 12.5, color: 'var(--text2)', fontFamily: 'monospace' }} />
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/cuestionario/${cuestionarioModal.cuestionario.token_publico}`).catch(() => {})
                    alert('Enlace copiado')
                  }}>Copiar</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ background: 'var(--bg2)', color: 'var(--accent)', border: '1px solid var(--accent-light)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
                    ✓ Completado · {format(new Date(cuestionarioModal.cuestionario.submitted_at), 'dd/MM/yyyy')}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/cuestionario/${cuestionarioModal.cuestionario.token_publico}`).catch(() => {})
                    alert('Enlace copiado')
                  }}>🔗 Copiar enlace</button>
                </div>
                <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
                  {[['resumen','Resumen práctico'],['respuestas','Respuestas completas']].map(([id, label]) => (
                    <button key={id} onClick={() => setCuestionarioTab(id)}
                      style={{ padding: '8px 14px', fontSize: 13, fontWeight: cuestionarioTab === id ? 600 : 400, color: cuestionarioTab === id ? 'var(--accent)' : 'var(--text2)', background: 'none', border: 'none', borderBottom: cuestionarioTab === id ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>
                      {label}
                    </button>
                  ))}
                </div>
                {cuestionarioTab === 'resumen'
                  ? <ResumenCuestionario data={cuestionarioModal.cuestionario} />
                  : <RespuestasCompletas data={cuestionarioModal.cuestionario} />
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal crear / editar cliente ──────────────────────────────────────── */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'nuevo' ? 'Nuevo cliente' : `Editar · ${modal.cliente.nombre}`}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={14} /></button>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14 }}>Datos personales</p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select className="form-select" value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value }))}>
                  <option value="activo">Activo</option>
                  <option value="baja">Inactivo</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de cliente</label>
                <select className="form-select" value={form.tipo_cliente} onChange={e => setForm(f => ({ ...f, tipo_cliente: e.target.value }))}>
                  <option value="estandar">Estándar</option>
                  <option value="familia_gratis">Familia / Gratis</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Perfil de planificación</label>
                <select className="form-select" value={form.perfil_planificacion} onChange={e => setForm(f => ({ ...f, perfil_planificacion: e.target.value }))}>
                  <option value="resistencia">Resistencia</option>
                  <option value="fuerza_salud">Fuerza y salud</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha inicio</label>
                <input className="form-input" type="date" value={form.fecha_inicio} onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))} />
              </div>
            </div>

            <p style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '20px 0 14px' }}>Servicio</p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Modalidad</label>
                <select className="form-select" value={servicio.modalidad} onChange={e => setServicio(s => ({ ...s, modalidad: e.target.value }))}>
                  <option value="online">Online</option>
                  <option value="hibrido">Híbrido</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Actividad principal</label>
                <input className="form-input" value={servicio.deporte || ''} onChange={e => setServicio(s => ({ ...s, deporte: e.target.value }))} placeholder="Ej: Running, Triatlón..." />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Actividades complementarias</label>
                <input className="form-input" value={servicio.deporte_complementario || ''} onChange={e => setServicio(s => ({ ...s, deporte_complementario: e.target.value }))} placeholder="Ej: Fuerza, Yoga..." />
              </div>
              <div className="form-group">
                <label className="form-label">Dispositivo / wearable</label>
                <input className="form-input" value={servicio.dispositivo || ''} onChange={e => setServicio(s => ({ ...s, dispositivo: e.target.value }))} placeholder="Garmin, Apple Watch..." />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PortalClienteModal
        cliente={portalModal}
        abierto={!!portalModal}
        onCerrar={() => setPortalModal(null)}
        onGuardado={config => {
          setClientes(prev => prev.map(c => c.id === portalModal?.id ? { ...c, portal_config: config } : c))
          setPortalModal(prev => prev ? { ...prev, portal_config: config } : null)
        }}
      />
    </div>
  )
}
