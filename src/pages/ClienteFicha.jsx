import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MODALIDADES_SERVICIO, labelModalidad } from '../lib/servicio'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import Avatar from '../components/Avatar'
import { ResumenCuestionario, RespuestasCompletas } from '../components/CuestionarioViewer'
import PortalClienteModal from '../components/PortalClienteModal'
import PerfilEditor from '../components/PerfilEditor'
import TabSeguimientoCliente from '../components/TabSeguimientoCliente'
import { calcularSeguimiento, CAT_LABEL } from '../lib/seguimientoMotor'
import { cargarSeguimientoCliente } from '../lib/seguimientoService'

// ── Constantes ────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'resumen',       label: 'Resumen' },
  { id: 'planificacion', label: 'Planificación' },
  { id: 'seguimiento',   label: 'Seguimiento' },
  { id: 'evaluaciones',  label: 'Evaluaciones' },
  { id: 'informacion',   label: 'Información' },
]

function getTabInicial(clienteId) {
  try { return localStorage.getItem(`ficha_tab_${clienteId}`) || 'resumen' } catch { return 'resumen' }
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClienteFicha({ clienteId, onVolver, setPage, setClientePlanificacion }) {
  const [cliente, setCliente]             = useState(null)
  const [perfil, setPerfil]               = useState(null)
  const [objetivos, setObjetivos]         = useState([])
  const [servicios, setServicios]         = useState([])
  const [planes, setPlanes]               = useState([])
  const [cuestionario, setCuestionario]   = useState(null)
  const [controles, setControles]         = useState([])
  const [feedbacks, setFeedbacks]         = useState([])
  const [competiciones, setCompeticiones]     = useState([])
  const [episodiosActivos, setEpisodiosActivos] = useState([])

  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState(() => getTabInicial(clienteId))

  const [menuAnadir, setMenuAnadir]       = useState(false)
  const [menuMas, setMenuMas]             = useState(false)
  const [modalEditar, setModalEditar]     = useState(false)
  const [formEdit, setFormEdit]           = useState({})
  const [savingEdit, setSavingEdit]       = useState(false)
  const [portalModal, setPortalModal]     = useState(null)
  const [cueTab, setCueTab]               = useState('resumen')
  const [verCuestionario, setVerCuestionario] = useState(false)
  const [triggerNuevaMolestia, setTriggerNuevaMolestia] = useState(false)

  const refAnadir = useRef(null)
  const refMas    = useRef(null)

  useEffect(() => {
    function handler(e) {
      if (refAnadir.current && !refAnadir.current.contains(e.target)) setMenuAnadir(false)
      if (refMas.current    && !refMas.current.contains(e.target))    setMenuMas(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => { cargar() }, [clienteId])

  function cambiarTab(id) {
    setTab(id)
    try { localStorage.setItem(`ficha_tab_${clienteId}`, id) } catch {}
  }

  // ── Carga de datos ──────────────────────────────────────────────────────────

  async function cargar() {
    setLoading(true)
    const hoy = format(new Date(), 'yyyy-MM-dd')

    const [cliRes, perfilRes, objRes, srvRes, planesRes, cueRes, controlesRes, compRes, episActRes] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', clienteId).single(),
      supabase.from('cliente_perfil').select('*').eq('cliente_id', clienteId).maybeSingle(),
      supabase.from('cliente_objetivos').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('servicios').select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false }),
      supabase.from('planificaciones')
        .select('id, nombre, fecha_inicio, fecha_fin, bloques(id, nombre, fase, carga, fecha_inicio, semanas, orden)')
        .eq('cliente_id', clienteId)
        .order('fecha_inicio', { ascending: false }),
      supabase.from('cuestionario_inicial').select('*').eq('cliente_id', clienteId).maybeSingle(),
      supabase.from('controles').select('*, controles_resultados(*)').eq('cliente_id', clienteId).order('fecha', { ascending: false }).limit(10),
      supabase.from('competiciones').select('id, nombre, fecha, deporte, objetivo, resultado, notas, estado').eq('cliente_id', clienteId).order('fecha', { ascending: false }),
      supabase.from('molestia_episodios').select('id, zona, lateralidad, fecha_inicio').eq('cliente_id', clienteId).eq('estado', 'activo').order('fecha_inicio', { ascending: false }),
    ])

    if (cliRes.error || !cliRes.data) { setLoading(false); return }

    setCliente(cliRes.data)
    setPerfil(perfilRes.data || null)
    setObjetivos(objRes.data || [])
    setServicios(srvRes.data || [])
    setPlanes(planesRes.data || [])
    setCuestionario(cueRes.data || null)
    setControles(controlesRes.data || [])
    setCompeticiones(compRes.data || [])
    setEpisodiosActivos(episActRes.data || [])

    const { data: sesiones } = await supabase
      .from('sesiones')
      .select('id, titulo, fecha, duracion_min')
      .eq('cliente_id', clienteId)
      .not('fecha', 'is', null)
      .order('fecha', { ascending: false })
      .limit(8)

    if (sesiones?.length) {
      const { data: fbs } = await supabase
        .from('sesion_feedback')
        .select('id, sesion_id, data, submitted_at')
        .in('sesion_id', sesiones.map(s => s.id))
        .order('submitted_at', { ascending: false })
        .limit(6)
      const sesMap = Object.fromEntries(sesiones.map(s => [s.id, s]))
      setFeedbacks((fbs || []).map(fb => ({ ...fb, sesion: sesMap[fb.sesion_id] })))
    }

    setLoading(false)
  }

  async function recargarControles() {
    const { data } = await supabase
      .from('controles')
      .select('*, controles_resultados(*)')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false })
    setControles(data || [])
  }

  // ── Editar datos básicos ────────────────────────────────────────────────────

  async function guardarEdicion() {
    if (!formEdit.nombre?.trim()) return
    setSavingEdit(true)
    await supabase.from('clientes').update({
      nombre:               formEdit.nombre.trim(),
      email:                formEdit.email || null,
      telefono:             formEdit.telefono || null,
      fecha_inicio:         formEdit.fecha_inicio || null,
      perfil_planificacion: formEdit.perfil_planificacion || 'resistencia',
    }).eq('id', clienteId)
    // Servicio (modalidad + servicio y tarifa, solo visible para la entrenadora)
    const datosServicio = {
      modalidad:   formEdit.modalidad || 'online',
      condiciones: formEdit.condiciones?.trim() || null,
    }
    const servicioActual = servicios[0]
    if (servicioActual) await supabase.from('servicios').update(datosServicio).eq('id', servicioActual.id)
    else await supabase.from('servicios').insert({ ...datosServicio, cliente_id: clienteId })
    setSavingEdit(false)
    setModalEditar(false)
    cargar()
  }

  async function cambiarEstado() {
    if (!cliente) return
    const nuevo = cliente.estado === 'activo' ? 'baja' : 'activo'
    const label = nuevo === 'baja' ? 'dar de baja' : 'reactivar'
    if (!window.confirm(`¿Seguro que quieres ${label} a ${cliente.nombre}?`)) return
    await supabase.from('clientes').update({ estado: nuevo }).eq('id', clienteId)
    cargar()
  }

  // ── Derivados ───────────────────────────────────────────────────────────────

  if (loading) return <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>Cargando...</div>
  if (!cliente) return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
      Cliente no encontrado.
      <br />
      <button className="btn btn-ghost btn-sm" onClick={onVolver} style={{ marginTop: 12 }}>← Volver</button>
    </div>
  )

  const hoy            = format(new Date(), 'yyyy-MM-dd')
  const servicio       = servicios[0]
  const objetivoActivo = objetivos.find(o => o.estado === 'activo')
  const compProxima    = competiciones.find(c => c.fecha >= hoy && c.estado !== 'cancelada') || null
  const planActivo     = planes.find(p => p.fecha_inicio <= hoy && (!p.fecha_fin || p.fecha_fin >= hoy))
  const esBaja         = cliente.estado === 'baja'

  const actividad      = servicio?.deporte || perfil?.deportes_actuales?.[0] || null
  const modalidad      = servicio?.modalidad
  const modalidadLabel = labelModalidad(modalidad)

  const primerNombre = cliente.nombre.split(' ')[0]
  const nombrePref   = perfil?.nombre_preferido
  const mostrarPref  = nombrePref && nombrePref.toLowerCase() !== primerNombre.toLowerCase()

  const subtituloParts = [actividad, modalidadLabel].filter(Boolean)

  // Línea de contexto: competición próxima > objetivo activo
  let contextoLabel = null
  if (compProxima) {
    const fechaComp = format(parseISO(compProxima.fecha), 'd MMM yyyy', { locale: es })
    contextoLabel = `🏁 ${compProxima.nombre} · ${fechaComp}`
  } else if (objetivoActivo?.objetivo_principal) {
    const t = objetivoActivo.objetivo_principal
    contextoLabel = t.length > 72 ? t.slice(0, 69) + '…' : t
  }

  function irAPlanificacion() {
    setClientePlanificacion?.(cliente)
    setPage?.('planificacion')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>

      {/* ── CABECERA ─────────────────────────────────────────────────────────── */}
      <button className="btn btn-ghost btn-sm" onClick={onVolver}
        style={{ marginBottom: 10, fontSize: 12, color: 'var(--text3)', paddingLeft: 0 }}>
        ← Clientes
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: contextoLabel ? 4 : 14 }}>
        <Avatar url={cliente.foto_url} nombre={cliente.nombre} size={42} style={{ flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', lineHeight: 1.25 }}>
              {cliente.nombre}
            </span>
            {mostrarPref && (
              <span style={{ fontSize: 12.5, color: 'var(--text3)', fontStyle: 'italic' }}>"{nombrePref}"</span>
            )}
            <EstadoBadge baja={esBaja} />
          </div>
          {subtituloParts.length > 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
              {subtituloParts.join(' · ')}
            </div>
          )}
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0 }}>

          {/* + Añadir */}
          <div ref={refAnadir} style={{ position: 'relative' }}>
            <button className="btn btn-primary btn-sm" style={{ fontSize: 12.5 }}
              onClick={() => { setMenuAnadir(v => !v); setMenuMas(false) }}>
              + Añadir
            </button>
            {menuAnadir && (
              <Dropdown onClose={() => setMenuAnadir(false)}>
                <DropItem label="Sesión" onClick={() => { setMenuAnadir(false); irAPlanificacion() }} />
                <DropItem label="Evaluación"              disabled />
                <DropItem label="Objetivo / competición"  disabled />
                <DropItem label="Molestia" onClick={() => { setMenuAnadir(false); cambiarTab('informacion'); setTriggerNuevaMolestia(true) }} />
                <DropItem label="Nota"                    disabled />
                <DropItem label="Tarea"                   disabled />
              </Dropdown>
            )}
          </div>

          {/* ··· */}
          <div ref={refMas} style={{ position: 'relative' }}>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 15, padding: '4px 10px', letterSpacing: 2 }}
              onClick={() => { setMenuMas(v => !v); setMenuAnadir(false) }}>
              ···
            </button>
            {menuMas && (
              <Dropdown align="right" onClose={() => setMenuMas(false)}>
                <DropItem label="Editar datos básicos" onClick={() => {
                  setFormEdit({
                    nombre:               cliente.nombre || '',
                    email:                cliente.email || '',
                    telefono:             cliente.telefono || '',
                    fecha_inicio:         cliente.fecha_inicio || '',
                    perfil_planificacion: cliente.perfil_planificacion || 'resistencia',
                    modalidad:            servicios[0]?.modalidad || 'online',
                    condiciones:          servicios[0]?.condiciones || '',
                  })
                  setMenuMas(false)
                  setModalEditar(true)
                }} />
                <DropItem
                  label={esBaja ? 'Reactivar cliente' : 'Dar de baja'}
                  onClick={() => { setMenuMas(false); cambiarEstado() }}
                  danger={!esBaja}
                />
                {cliente.token_cliente && (
                  <DropItem label="Portal del cliente" onClick={() => { setMenuMas(false); setPortalModal(cliente) }} />
                )}
              </Dropdown>
            )}
          </div>
        </div>
      </div>

      {/* Contexto (competición o objetivo) */}
      {contextoLabel && (
        <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 14, paddingLeft: 54, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contextoLabel}
        </div>
      )}

      {/* ── TABS ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 22, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => cambiarTab(t.id)}
            style={{
              padding: '8px 14px', fontSize: 13.5,
              fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? 'var(--accent)' : 'var(--text2)',
              background: 'none', border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENIDO ────────────────────────────────────────────────────────── */}

      {tab === 'resumen' && (
        <TabResumen
          cliente={cliente} perfil={perfil} objetivoActivo={objetivoActivo}
          planActivo={planActivo} servicio={servicio} compProxima={compProxima}
          controles={controles} feedbacks={feedbacks} irAPlanificacion={irAPlanificacion}
          episodiosActivos={episodiosActivos}
          clienteId={clienteId}
          onVerSeguimiento={() => cambiarTab('seguimiento')}
        />
      )}
      {tab === 'planificacion' && <TabPlanificacion planes={planes} hoy={hoy} irAPlanificacion={irAPlanificacion} />}
      {tab === 'seguimiento'   && <TabSeguimientoCliente clienteId={clienteId} clienteEmail={cliente?.email || null} onNavSalud={() => cambiarTab('informacion')} />}
      {tab === 'evaluaciones'  && <TabEvaluaciones controles={controles} clienteId={clienteId} onRecargar={recargarControles} />}
      {tab === 'informacion' && (
        <PerfilEditor
          clienteId={clienteId}
          cliente={cliente} setCliente={setCliente}
          perfil={perfil} setPerfil={setPerfil}
          objetivos={objetivos} setObjetivos={setObjetivos}
          competiciones={competiciones} setCompeticiones={setCompeticiones}
          cuestionario={cuestionario}
          verCuestionario={verCuestionario} setVerCuestionario={setVerCuestionario}
          cueTab={cueTab} setCueTab={setCueTab}
          abrirNuevaMolestia={triggerNuevaMolestia}
          onAbrirMolestiaConsumido={() => setTriggerNuevaMolestia(false)}
        />
      )}

      {/* ── MODAL EDITAR ─────────────────────────────────────────────────────── */}
      {modalEditar && (
        <Modal titulo="Editar datos básicos" onClose={() => setModalEditar(false)}>
          <CampoEdit label="Nombre *" value={formEdit.nombre} onChange={v => setFormEdit(p => ({ ...p, nombre: v }))} />
          <CampoEdit label="Email"    value={formEdit.email}  onChange={v => setFormEdit(p => ({ ...p, email: v }))}  type="email" />
          <CampoEdit label="Teléfono" value={formEdit.telefono} onChange={v => setFormEdit(p => ({ ...p, telefono: v }))} />
          <CampoEdit label="Fecha inicio" value={formEdit.fecha_inicio} onChange={v => setFormEdit(p => ({ ...p, fecha_inicio: v }))} type="date" />
          <div style={{ display: 'flex', gap: 10 }}>
            <CampoSelect label="Modalidad" value={formEdit.modalidad} onChange={v => setFormEdit(p => ({ ...p, modalidad: v }))}
              options={MODALIDADES_SERVICIO} />
            <CampoSelect label="Perfil" value={formEdit.perfil_planificacion} onChange={v => setFormEdit(p => ({ ...p, perfil_planificacion: v }))}
              options={[{ value: 'resistencia', label: 'Resistencia' }, { value: 'fuerza_salud', label: 'Fuerza y salud' }]} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Servicio y tarifa · solo lo ves tú</label>
            <textarea value={formEdit.condiciones || ''} onChange={e => setFormEdit(p => ({ ...p, condiciones: e.target.value }))} rows={2}
              placeholder="Ej: Online mensual + 1 sesión presencial al mes · 120 €/mes"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font)', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setModalEditar(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={guardarEdicion} disabled={savingEdit || !formEdit.nombre?.trim()}>
              {savingEdit ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── PORTAL ───────────────────────────────────────────────────────────── */}
      <PortalClienteModal
        cliente={portalModal}
        abierto={!!portalModal}
        onCerrar={() => setPortalModal(null)}
        onGuardado={config => {
          setPortalModal(prev => prev ? { ...prev, portal_config: config } : null)
          cargar()
        }}
      />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB RESUMEN
// ══════════════════════════════════════════════════════════════════════════════

function TabResumen({ cliente, perfil, objetivoActivo, planActivo, servicio, compProxima, controles, feedbacks, irAPlanificacion, episodiosActivos = [], clienteId, onVerSeguimiento }) {
  const infoBloque = getBloqueInfo(planActivo)

  // 5.6E: numero_cliente de la semana actual
  const [semanaGlobal, setSemanaGlobal] = useState(null)
  useEffect(() => {
    if (!planActivo?.id) return
    const hoy = new Date()
    const dow = hoy.getDay() // 0=dom
    const offset = dow === 0 ? -6 : 1 - dow
    const lunes = new Date(hoy)
    lunes.setDate(hoy.getDate() + offset)
    const lunesKey = lunes.toISOString().slice(0, 10)
    supabase.from('semanas').select('numero_cliente')
      .eq('planificacion_id', planActivo.id)
      .eq('fecha_inicio_semana', lunesKey)
      .limit(1)
      .then(({ data }) => {
        if (data?.[0]?.numero_cliente) setSemanaGlobal(data[0].numero_cliente)
      })
  }, [planActivo?.id])

  // Seguimiento reciente — pendientes via motor (max 3)
  const [pendientesSeg, setPendientesSeg] = useState(null)
  useEffect(() => {
    if (!clienteId) return
    let vivo = true
    async function loadSeg() {
      const datos = await cargarSeguimientoCliente(clienteId)
      if (!vivo) return
      const items = calcularSeguimiento({
        feedbacks:    datos.feedbacks,
        sesiones:     datos.sesiones,
        revisadas:    datos.revisadas,
        molestiaReps: datos.molestiaReps,
      })
      setPendientesSeg(items.filter(i => i.isPendiente).slice(0, 3))
    }
    loadSeg()
    return () => { vivo = false }
  }, [clienteId])

  const tieneDisponibilidad = perfil && (perfil.dias_semana || perfil.tiempo_sesion || perfil.horarios_preferentes?.length || perfil.lugares_entrenamiento?.length)

  return (
    <div className="resumen-grid">

      {/* ── Columna izquierda ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        <SeccionResumen titulo="Objetivo actual">
          {objetivoActivo ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>
                {objetivoActivo.objetivo_principal}
              </div>
              {objetivoActivo.objetivos_secundarios?.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}>
                  {objetivoActivo.objetivos_secundarios.join(' · ')}
                </div>
              )}
              {compProxima && (
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
                  ⚑ {compProxima.nombre} · {format(parseISO(compProxima.fecha), 'd MMM', { locale: es })}
                </div>
              )}
            </div>
          ) : <EmptyInline texto="Sin objetivo activo" />}
        </SeccionResumen>

        <SeccionResumen titulo="Entrenamiento actual">
          {planActivo ? (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>Plan actual</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{planActivo.nombre}</span>
                <button className="btn btn-ghost btn-sm" onClick={irAPlanificacion}
                  style={{ fontSize: 11.5, color: 'var(--accent)', padding: '1px 6px' }}>Ver →</button>
              </div>
              {(semanaGlobal || infoBloque) && (
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4 }}>
                  {semanaGlobal && <strong>Semana {semanaGlobal}</strong>}
                  {infoBloque && (
                    <>
                      {semanaGlobal && <span style={{ color: 'var(--text3)' }}> · </span>}
                      {infoBloque.bloque.nombre}
                      {infoBloque.totalSemanas && (
                        <span style={{ color: 'var(--text3)' }}> · Sem. {infoBloque.semanaActual}/{infoBloque.totalSemanas}</span>
                      )}
                      {infoBloque.bloque.carga && (
                        <span style={{ color: 'var(--text3)' }}> · Carga {infoBloque.bloque.carga}</span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <EmptyInline texto="Sin plan activo" accion="Ir a planificación →" onAccion={irAPlanificacion} />
          )}
        </SeccionResumen>

        <SeccionResumen titulo="Seguimiento reciente">
          {pendientesSeg === null ? (
            <EmptyInline texto="Cargando…" gris />
          ) : pendientesSeg.length === 0 ? (
            <EmptyInline texto="Sin aspectos pendientes de revisión." gris />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pendientesSeg.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span style={{ color: 'var(--text3)', fontSize: 11.5, width: 44, flexShrink: 0 }}>
                    {item.fecha ? format(parseISO(item.fecha), 'd MMM', { locale: es }) : '—'}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.sesionTitulo || 'Sesión'}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)', flexShrink: 0 }}>
                    {item.categoriasPendientes.map(c => CAT_LABEL[c] || c).join(' · ')}
                  </span>
                </div>
              ))}
              <button onClick={onVerSeguimiento}
                style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit', fontWeight: 500 }}>
                Ver seguimiento →
              </button>
            </div>
          )}
        </SeccionResumen>

      </div>

      {/* ── Columna derecha ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

        <SeccionResumen titulo="A tener en cuenta">
          {episodiosActivos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {episodiosActivos.map(ep => (
                <div key={ep.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--text1)' }}>
                      {ep.zona}{ep.lateralidad && ep.lateralidad !== 'no especificada' ? ` · ${ep.lateralidad}` : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>desde {format(parseISO(ep.fecha_inicio), 'd MMM', { locale: es })}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyInline texto="✓ Sin molestias activas." gris />
          )}
        </SeccionResumen>

        <SeccionResumen titulo="Información clave">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {servicio?.deporte            && <FilaMini label="Deporte"    value={servicio.deporte} />}
            {servicio?.modalidad          && <FilaMini label="Modalidad"  value={labelModalidad(servicio.modalidad)} />}
            {servicio?.condiciones        && <FilaMini label="Servicio y tarifa" value={servicio.condiciones} />}
            {cliente.perfil_planificacion && <FilaMini label="Perfil"     value={cliente.perfil_planificacion === 'fuerza_salud' ? 'Fuerza y salud' : 'Resistencia'} />}
          </div>
        </SeccionResumen>

        {tieneDisponibilidad && (
          <SeccionResumen titulo="Disponibilidad">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {perfil.dias_semana                       && <FilaMini label="Días/sem."  value={perfil.dias_semana} />}
              {perfil.tiempo_sesion                     && <FilaMini label="Duración"   value={perfil.tiempo_sesion} />}
              {perfil.horarios_preferentes?.length > 0  && <FilaMini label="Horarios"   value={perfil.horarios_preferentes.join(', ')} />}
              {perfil.lugares_entrenamiento?.length > 0 && <FilaMini label="Lugar"      value={perfil.lugares_entrenamiento.join(', ')} />}
            </div>
          </SeccionResumen>
        )}

      </div>

      {/* ── Ancho completo ── */}
      <div style={{ gridColumn: '1 / -1' }}>
        <SeccionResumen titulo="Última evaluación">
          {controles.length > 0 ? (() => {
            const c = controles[0]
            const resultados = (c.controles_resultados || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0))
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{c.nombre}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {format(parseISO(c.fecha + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
                  </span>
                </div>
                {resultados.map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0', color: 'var(--text2)' }}>
                    <span>{r.nombre}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text)', fontWeight: 500 }}>
                      {r.valor}{r.unidad ? ` ${r.unidad}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )
          })() : <EmptyInline texto="Sin evaluaciones registradas" />}
        </SeccionResumen>
      </div>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB PLANIFICACIÓN
// ══════════════════════════════════════════════════════════════════════════════

function TabPlanificacion({ planes, hoy, irAPlanificacion }) {
  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-primary" onClick={irAPlanificacion}>📋 Abrir planificación completa</button>
      </div>

      {planes.length === 0 ? (
        <EmptyState mensaje="Este cliente no tiene planificaciones todavía." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {planes.map(p => {
            const esActivo = p.fecha_inicio <= hoy && (!p.fecha_fin || p.fecha_fin >= hoy)
            return (
              <div key={p.id} style={{
                background: 'var(--surface)', borderRadius: 10, padding: '12px 16px',
                border: `1px solid ${esActivo ? 'var(--accent)' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{p.nombre}</span>
                    {esActivo && <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 5, background: 'var(--accent-light)', color: 'var(--accent-text)' }}>Activo</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                    {p.fecha_inicio && format(parseISO(p.fecha_inicio), 'd MMM yyyy', { locale: es })}
                    {p.fecha_fin ? ` → ${format(parseISO(p.fecha_fin), 'd MMM yyyy', { locale: es })}` : p.fecha_inicio ? ' → en curso' : ''}
                  </div>
                  {p.bloques?.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 1 }}>
                      {p.bloques.length} bloque{p.bloques.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={irAPlanificacion}
                  style={{ fontSize: 12, color: 'var(--accent)', flexShrink: 0 }}>Ver →</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB SEGUIMIENTO
// ══════════════════════════════════════════════════════════════════════════════

function TabSeguimiento({ feedbacks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      <SeccionResumen titulo="Pendientes de revisión">
        <EmptyInline texto="Las alertas y pendientes se implementarán en la siguiente fase." gris />
      </SeccionResumen>

      <SeccionResumen titulo="Historial de seguimiento">
        {feedbacks.length === 0 ? (
          <EmptyInline texto="Sin feedbacks de sesión registrados." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {feedbacks.map(fb => {
              const d = fb.data || {}
              const status = d.completion?.status
              const statusIcon  = { completed: '✓', partial: '~', missed: '✗' }[status]
              const statusColor = { completed: 'var(--accent)', partial: 'var(--text2)', missed: 'var(--text3)' }[status]
              return (
                <div key={fb.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9 }}>
                  {statusIcon && <span style={{ fontSize: 13, fontWeight: 700, color: statusColor, flexShrink: 0, marginTop: 2 }}>{statusIcon}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{fb.sesion?.titulo || 'Sesión'}</span>
                      {fb.sesion?.fecha && (
                        <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                          {format(parseISO(fb.sesion.fecha), 'd MMM', { locale: es })}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text2)' }}>
                      {d.rpe?.value   != null && <span>RPE <strong>{d.rpe.value}</strong>/10</span>}
                      {d.tqr?.value   != null && <span>TQR <strong>{d.tqr.value}</strong>/10</span>}
                      {d.sueno?.value != null && <span>Sueño <strong>{d.sueno.value}</strong>/5</span>}
                      {d.duration?.minutes    && <span><strong>{d.duration.minutes}</strong> min</span>}
                    </div>
                    {d.generalComments && (
                      <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.generalComments}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SeccionResumen>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB EVALUACIONES
// ══════════════════════════════════════════════════════════════════════════════

// ── Fila de resultado en el formulario ──────────────────────────────────────
function FilaResultado({ r, idx, onChange, onEliminar, mostrarEliminar }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <input
        placeholder="Nombre del valor *"
        value={r.nombre}
        onChange={e => onChange(idx, 'nombre', e.target.value)}
        style={{ flex: 2, fontSize: 12.5, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
      />
      <input
        placeholder="Valor *"
        value={r.valor}
        onChange={e => onChange(idx, 'valor', e.target.value)}
        style={{ flex: 1.2, fontSize: 12.5, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
      />
      <input
        placeholder="Unidad"
        value={r.unidad}
        onChange={e => onChange(idx, 'unidad', e.target.value)}
        style={{ flex: 0.8, fontSize: 12.5, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }}
      />
      {mostrarEliminar && (
        <button onClick={() => onEliminar(idx)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
      )}
    </div>
  )
}

function TabEvaluaciones({ controles, clienteId, onRecargar }) {
  const filaVacia = () => ({ nombre: '', valor: '', unidad: '' })
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState(null)  // control completo o null
  const [guardando, setGuardando] = useState(false)
  const [menuAbierto, setMenuAbierto] = useState(null)  // id del control con menú abierto
  const [formNombre, setFormNombre] = useState('')
  const [formTipo, setFormTipo] = useState('')
  const [formFecha, setFormFecha] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [formVisibilidad, setFormVisibilidad] = useState('entrenadora')
  const [formResultados, setFormResultados] = useState([filaVacia()])

  function abrirNuevo() {
    setEditando(null)
    setFormNombre('')
    setFormTipo('')
    setFormFecha(format(new Date(), 'yyyy-MM-dd'))
    setFormNotas('')
    setFormVisibilidad('entrenadora')
    setFormResultados([filaVacia()])
    setModal(true)
  }

  function abrirEditar(c) {
    setEditando(c)
    setFormNombre(c.nombre)
    // Mapea valor legacy HRV · Recuperación → Recuperación
    const tipoNorm = c.tipo === 'HRV · Recuperación' ? 'Recuperación' : (c.tipo || '')
    setFormTipo(tipoNorm)
    setFormFecha(c.fecha)
    setFormNotas(c.notas || '')
    setFormVisibilidad(c.visibilidad || 'entrenadora')
    const res = (c.controles_resultados || [])
      .slice()
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map(r => ({ nombre: r.nombre, valor: r.valor, unidad: r.unidad || '' }))
    setFormResultados(res.length > 0 ? res : [filaVacia()])
    setMenuAbierto(null)
    setModal(true)
  }

  function cerrarModal() { setModal(false); setEditando(null) }

  function cambiarResultado(idx, campo, val) {
    setFormResultados(prev => prev.map((r, i) => i === idx ? { ...r, [campo]: val } : r))
  }
  function agregarFila() { setFormResultados(prev => [...prev, filaVacia()]) }
  function eliminarFila(idx) { setFormResultados(prev => prev.filter((_, i) => i !== idx)) }

  async function guardar() {
    const nombre = formNombre.trim()
    const fecha = formFecha
    if (!nombre || !fecha) return
    const resultadosValidos = formResultados
      .filter(r => r.nombre.trim() && r.valor.trim())
      .map((r, i) => ({ nombre: r.nombre.trim(), valor: r.valor.trim(), unidad: r.unidad.trim() || null, orden: i }))
    if (resultadosValidos.length === 0) { alert('Añade al menos un resultado.'); return }

    setGuardando(true)
    try {
      const camposControl = { nombre, fecha, tipo: formTipo || null, notas: formNotas.trim() || null, visibilidad: formVisibilidad || 'entrenadora' }
      let controlId
      if (editando) {
        await supabase.from('controles').update(camposControl).eq('id', editando.id)
        await supabase.from('controles_resultados').delete().eq('control_id', editando.id)
        controlId = editando.id
      } else {
        const { data: nc } = await supabase.from('controles')
          .insert({ cliente_id: clienteId, ...camposControl })
          .select('id').single()
        controlId = nc.id
      }
      await supabase.from('controles_resultados').insert(
        resultadosValidos.map(r => ({ ...r, control_id: controlId }))
      )
      cerrarModal()
      await onRecargar()
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(c) {
    if (!window.confirm(`¿Eliminar «${c.nombre}»?\nSe eliminarán también sus resultados.`)) return
    await supabase.from('controles').delete().eq('id', c.id)
    await onRecargar()
  }

  const styCard = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', position: 'relative' }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Evaluaciones</span>
        <button className="btn btn-ghost btn-sm" onClick={abrirNuevo} style={{ fontSize: 12.5 }}>
          + Nueva evaluación
        </button>
      </div>

      {/* Lista */}
      {controles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontSize: 13.5 }}>
          <div style={{ marginBottom: 12 }}>Aún no hay evaluaciones registradas.</div>
          <button className="btn btn-ghost btn-sm" onClick={abrirNuevo}>+ Nueva evaluación</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {controles.map(c => {
            const resultados = (c.controles_resultados || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0))
            return (
              <div key={c.id} style={styCard}>
                {/* Menú ··· */}
                <div style={{ position: 'absolute', top: 10, right: 12 }}>
                  <button onClick={() => setMenuAbierto(menuAbierto === c.id ? null : c.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>···</button>
                  {menuAbierto === c.id && (
                    <div style={{ position: 'absolute', right: 0, top: 22, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, minWidth: 120 }}>
                      <button onClick={() => abrirEditar(c)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }}>
                        Editar
                      </button>
                      <button onClick={() => { setMenuAbierto(null); eliminar(c) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, cursor: 'pointer', color: '#e55' }}>
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>

                {/* Cabecera */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: resultados.length || c.notas ? 10 : 0, paddingRight: 28 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{c.nombre}</span>
                    {c.tipo && (
                      <span style={{ display: 'inline-block', marginLeft: 8, fontSize: 11, padding: '1px 7px', borderRadius: 10, background: 'var(--bg)', color: 'var(--text3)', border: '1px solid var(--border)', verticalAlign: 'middle' }}>
                        {c.tipo === 'HRV · Recuperación' ? 'Recuperación' : c.tipo}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                    {format(parseISO(c.fecha + 'T12:00:00'), 'd MMM yyyy', { locale: es })}
                  </span>
                </div>

                {/* Resultados */}
                {resultados.length > 0 && (
                  <div style={{ marginBottom: c.notas ? 8 : 0 }}>
                    {resultados.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text2)' }}>{r.nombre}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                          {r.valor}{r.unidad ? <span style={{ color: 'var(--text3)', marginLeft: 4, fontSize: 12 }}>{r.unidad}</span> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Observaciones */}
                {c.notas && (
                  <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginTop: 6, fontStyle: 'italic' }}>
                    {c.notas}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal crear/editar */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) cerrarModal() }}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>
              {editando ? 'Editar evaluación' : 'Nueva evaluación'}
            </div>

            {/* Nombre */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 4 }}>Nombre de la evaluación *</div>
              <input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="CMJ, Test 5 km..."
                style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>
            {/* Tipo y Fecha */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 4 }}>Tipo de evaluación</div>
                <select value={formTipo} onChange={e => setFormTipo(e.target.value)}
                  style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)' }}>
                  <option value="">Sin categoría</option>
                  <option value="Fuerza">Fuerza</option>
                  <option value="Resistencia">Resistencia</option>
                  <option value="Movilidad">Movilidad</option>
                  <option value="Composición corporal">Composición corporal</option>
                  <option value="Recuperación">Recuperación</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 4 }}>Fecha *</div>
                <input type="date" value={formFecha} onChange={e => setFormFecha(e.target.value)}
                  style={{ fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)' }} />
              </div>
            </div>

            {/* Resultados */}
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 8 }}>RESULTADOS *</div>
            {formResultados.map((r, i) => (
              <FilaResultado key={i} r={r} idx={i} onChange={cambiarResultado} onEliminar={eliminarFila} mostrarEliminar={formResultados.length > 1} />
            ))}
            <button onClick={agregarFila}
              style={{ fontSize: 12.5, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 14 }}>
              + Añadir otro valor
            </button>

            {/* Observaciones */}
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 4 }}>Observaciones</div>
            <textarea value={formNotas} onChange={e => setFormNotas(e.target.value)} placeholder="Observaciones opcionales..."
              rows={2}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 7, background: 'var(--bg)', color: 'var(--text)', resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }} />

            {/* Visibilidad */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Visible para:</span>
              {[['entrenadora', '🔒 Solo entrenadora'], ['cliente', '👁 Entrenadora + cliente']].map(([v, label]) => (
                <button key={v} type="button" onClick={() => setFormVisibilidad(v)}
                  style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${formVisibilidad === v ? 'var(--accent)' : 'var(--border)'}`, background: formVisibilidad === v ? 'var(--accent)' : 'transparent', color: formVisibilidad === v ? '#fff' : 'var(--text2)', cursor: 'pointer', fontWeight: formVisibilidad === v ? 600 : 400 }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={cerrarModal}>Cancelar</button>
              <button className="btn btn-sm" onClick={guardar} disabled={guardando}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', opacity: guardando ? 0.6 : 1 }}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Devuelve {bloque, semanaActual, totalSemanas} o null si no hay bloque activo */
function getBloqueInfo(planActivo) {
  if (!planActivo?.bloques?.length) return null
  const hoy = format(new Date(), 'yyyy-MM-dd')
  const bloques = [...planActivo.bloques].sort((a, b) => (a.orden || 0) - (b.orden || 0))
  for (const b of bloques) {
    if (!b.fecha_inicio) continue
    const totalSemanas = b.semanas || null
    const dias = (totalSemanas || 4) * 7
    const msInicio = new Date(b.fecha_inicio + 'T12:00:00').getTime()
    const msFin = msInicio + (dias - 1) * 86400000
    const fin = format(new Date(msFin), 'yyyy-MM-dd')
    if (b.fecha_inicio <= hoy && hoy <= fin) {
      const diasTranscurridos = Math.floor((new Date(hoy + 'T12:00:00').getTime() - msInicio) / 86400000)
      const semanaActual = Math.min(Math.floor(diasTranscurridos / 7) + 1, totalSemanas || 999)
      return { bloque: b, semanaActual, totalSemanas }
    }
  }
  return null
}
/** Compat: devuelve solo el bloque (usado en otros puntos si quedan) */
function getBloqueActual(planActivo) {
  return getBloqueInfo(planActivo)?.bloque || null
}

// ── Badges y chips ────────────────────────────────────────────────────────────

function EstadoBadge({ baja }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: baja ? 'var(--bg2)' : 'var(--accent-light)', color: baja ? 'var(--text3)' : 'var(--accent-text)' }}>
      {baja ? 'Inactivo' : 'Activo'}
    </span>
  )
}

function MiniChip({ label, value }) {
  return (
    <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
      {label} <strong style={{ color: 'var(--text)' }}>{value}</strong>
    </span>
  )
}

function FilaMini({ label, value }) {
  if (!value) return null
  return (
    <span style={{ fontSize: 13, color: 'var(--text)' }}>
      <span style={{ color: 'var(--text3)' }}>{label}:</span> {value}
    </span>
  )
}

// ── Secciones ─────────────────────────────────────────────────────────────────

function SeccionResumen({ titulo, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', marginBottom: 8 }}>{titulo}</div>
      {children}
    </div>
  )
}

function SeccionInfo({ titulo, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12 }}>{titulo}</div>
      {children}
    </div>
  )
}

function GrillaInfo({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
}

function FilaInfo({ label, value }) {
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) return null
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: 13 }}>
      <span style={{ color: 'var(--text3)', minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
    </div>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyInline({ texto, gris, accion, onAccion }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: gris ? 'var(--text3)' : 'var(--text2)', fontStyle: gris ? 'italic' : 'normal' }}>
      <span>{texto}</span>
      {accion && onAccion && (
        <button className="btn btn-ghost btn-sm" onClick={onAccion} style={{ fontSize: 12, color: 'var(--accent)', padding: '1px 6px' }}>
          {accion}
        </button>
      )}
    </div>
  )
}

function EmptyState({ mensaje }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 13.5, color: 'var(--text3)' }}>{mensaje}</p>
    </div>
  )
}

// ── Dropdown ──────────────────────────────────────────────────────────────────

function Dropdown({ children, align = 'left' }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', [align]: 0, zIndex: 200,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 210, padding: '5px 4px',
    }}>
      {children}
    </div>
  )
}

function DropItem({ label, onClick, disabled, danger }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '8px 12px', fontSize: 13.5, borderRadius: 7,
        background: 'none', border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? 'var(--text3)' : danger ? '#ef4444' : 'var(--text)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ titulo, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '24px', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{titulo}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 16, padding: '2px 8px' }}>✕</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
      </div>
    </div>
  )
}

function CampoEdit({ label, value, onChange, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{label}</label>
      <input type={type} value={value || ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, fontFamily: 'var(--font)' }} />
    </div>
  )
}

function CampoSelect({ label, value, onChange, options }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>{label}</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
