import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Search, Plus, X, Pencil, Trash2, ChevronDown, ChevronUp, LayoutGrid, List, Table2, Check, Play } from 'lucide-react'
import BibliotecaSesiones from './BibliotecaSesiones'

function ytId(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/|youtube\.com\/shorts\/|embed\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

const EMPTY = {
  nombre: '', descripcion: '', media_tipo: '', media_url: '', video_url: '', notas: '',
}

// ── BIBLIOTECA BLOQUES (sin cambios) ─────────────────────────────────────────
function BibliotecaBloques() {
  const [bloques, setBloques] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'nuevo' | bloque-obj
  const [form, setForm] = useState({ nombre: '', descripcion: '', foco: '', color: '#2d6a4f' })
  const [formEjs, setFormEjs] = useState([])
  const [saving, setSaving] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [confirmEliminar, setConfirmEliminar] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('bloques_biblioteca').select('*, bloques_biblioteca_ejercicios(*)').order('nombre')
    setBloques((data || []).map(b => ({ ...b, ejercicios: (b.bloques_biblioteca_ejercicios || []).sort((a, z) => a.orden - z.orden) })))
    setLoading(false)
  }

  function abrirNuevo() {
    setForm({ nombre: '', descripcion: '', foco: '', color: '#2d6a4f' })
    setFormEjs([{ nombre: '', series: '', reps: '', rpe: '', notas: '', _key: Date.now() }])
    setModal('nuevo')
  }

  function abrirEditar(b) {
    setForm({ nombre: b.nombre || '', descripcion: b.descripcion || '', foco: b.foco || '', color: b.color || '#2d6a4f' })
    setFormEjs(b.ejercicios.map(e => ({ ...e, _key: e.id })))
    setModal(b)
  }

  function addEjRow() {
    setFormEjs(ejs => [...ejs, { nombre: '', series: '', reps: '', rpe: '', notas: '', _key: Date.now() }])
  }

  function removeEjRow(key) {
    setFormEjs(ejs => ejs.filter(e => e._key !== key))
  }

  function updateEjRow(key, campo, valor) {
    setFormEjs(ejs => ejs.map(e => e._key === key ? { ...e, [campo]: valor } : e))
  }

  async function guardar() {
    if (!form.nombre.trim()) { alert('El nombre es obligatorio'); return }
    setSaving(true)
    if (modal === 'nuevo') {
      const { data: nb } = await supabase.from('bloques_biblioteca').insert({ nombre: form.nombre.trim(), descripcion: form.descripcion || null, foco: form.foco || null, color: form.color || '#2d6a4f' }).select().single()
      if (nb) {
        for (let i = 0; i < formEjs.length; i++) {
          const { _key, id, bloque_bib_id, ...p } = formEjs[i]
          if (p.nombre?.trim()) await supabase.from('bloques_biblioteca_ejercicios').insert({ ...p, bloque_bib_id: nb.id, orden: i })
        }
      }
    } else {
      await supabase.from('bloques_biblioteca').update({ nombre: form.nombre.trim(), descripcion: form.descripcion || null, foco: form.foco || null, color: form.color || '#2d6a4f' }).eq('id', modal.id)
      await supabase.from('bloques_biblioteca_ejercicios').delete().eq('bloque_bib_id', modal.id)
      for (let i = 0; i < formEjs.length; i++) {
        const { _key, id, bloque_bib_id, ...p } = formEjs[i]
        if (p.nombre?.trim()) await supabase.from('bloques_biblioteca_ejercicios').insert({ ...p, bloque_bib_id: modal.id, orden: i })
      }
    }
    setSaving(false); setModal(null); cargar()
  }

  async function eliminar(id) {
    await supabase.from('bloques_biblioteca').delete().eq('id', id)
    setConfirmEliminar(null); cargar()
  }

  const COLORES_BIB = ['#2d6a4f', '#4C82E8', '#E29A2E', '#8B6CE0', '#DD6F97', '#34AEB8']

  if (loading) return <p style={{ fontSize: 12, color: 'var(--text3)', padding: '20px 0' }}>Cargando...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>{bloques.length} bloques guardados</p>
        <button className="btn btn-primary" onClick={abrirNuevo}><Plus size={14} /> Nuevo bloque</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bloques.map(b => (
          <div key={b.id} className="card" style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${b.color || '#2d6a4f'}` }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setExpandido(expandido === b.id ? null : b.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{b.nombre}</div>
                {b.descripcion && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{b.descripcion}</div>}
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{b.ejercicios.length} ejercicios{b.foco ? ` · ${b.foco}` : ''}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); abrirEditar(b) }}><Pencil size={13} /></button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={e => { e.stopPropagation(); setConfirmEliminar(b) }}><Trash2 size={13} /></button>
              {expandido === b.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </div>
            {expandido === b.id && b.ejercicios.length > 0 && (
              <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {b.ejercicios.map((e, i) => (
                  <div key={e.id} style={{ background: 'var(--bg2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', minWidth: 18, marginTop: 1 }}>{i + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>{e.nombre || 'Sin nombre'}</div>
                      <div style={{ color: 'var(--text3)', marginTop: 2 }}>
                        {[e.series && `${e.series} series`, e.reps && `${e.reps} reps`, e.rpe && `RPE ${e.rpe}`].filter(Boolean).join(' · ')}
                        {e.notas && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>{e.notas}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {bloques.length === 0 && <p style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '32px 0' }}>No hay bloques guardados. Usa 🧱 en un bloque de sesión para guardarlo aquí.</p>}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'nuevo' ? 'Nuevo bloque' : 'Editar bloque'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={14} /></button>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre *</label>
              <input className="form-input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Activación glútea" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Descripción / foco</label>
              <input className="form-input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Activación de cadena posterior..." />
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {COLORES_BIB.map(c => (
                  <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{ width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer', border: form.color === c ? '3px solid var(--text)' : '2px solid transparent' }} />
                ))}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: 8 }}>Ejercicios</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {formEjs.map(e => (
                  <div key={e._key} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                    <input className="form-input" style={{ flex: 3, fontSize: 12 }} placeholder="Nombre del ejercicio" value={e.nombre} onChange={ev => updateEjRow(e._key, 'nombre', ev.target.value)} />
                    <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="Series" value={e.series} onChange={ev => updateEjRow(e._key, 'series', ev.target.value)} />
                    <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="Reps" value={e.reps} onChange={ev => updateEjRow(e._key, 'reps', ev.target.value)} />
                    <input className="form-input" style={{ flex: 1, fontSize: 12 }} placeholder="RPE" value={e.rpe} onChange={ev => updateEjRow(e._key, 'rpe', ev.target.value)} />
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', flexShrink: 0 }} onClick={() => removeEjRow(e._key)}><X size={13} /></button>
                  </div>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={addEjRow} style={{ alignSelf: 'flex-start' }}><Plus size={13} /> Ejercicio</button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmEliminar && (
        <div className="modal-backdrop" onClick={() => setConfirmEliminar(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Eliminar bloque</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmEliminar(null)}><X size={14} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>¿Eliminar <strong>{confirmEliminar.nombre}</strong> de la biblioteca? Esta acción no afecta las sesiones existentes.</p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setConfirmEliminar(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => eliminar(confirmEliminar.id)}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── BIBLIOTECA PRINCIPAL ──────────────────────────────────────────────────────
export default function Biblioteca({ setPage, setSesionesContext }) {
  const [tabPrincipal, setTabPrincipal] = useState('ejercicios')
  const [ejercicios, setEjercicios] = useState([])
  const [busquedaTexto, setBusquedaTexto] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [expandido, setExpandido] = useState(null)
  const [vista, setVista] = useState('cards')
  const [sortDir, setSortDir] = useState('asc')
  const [inlineEj, setInlineEj] = useState(null)
  const [inlineSaving, setInlineSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [videoConflicto, setVideoConflicto] = useState(null)

  useEffect(() => { cargar() }, [])

  async function cargar() {
    setLoading(true)
    const { data } = await supabase.from('ejercicios_biblioteca').select('*').order('nombre')
    setEjercicios(data || [])
    setLoading(false)
  }

  function mostrarToast(tipo) {
    setToast(tipo)
    setTimeout(() => setToast(null), 2200)
  }

  function extraerYtId(url) {
    if (!url) return null
    const m = url.match(/(?:[?&]v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : null
  }

  async function comprobarVideoConflicto(url, idActual) {
    setVideoConflicto(null)
    const id = extraerYtId(url)
    if (!id) return
    const { data } = await supabase.from('ejercicios_biblioteca').select('id, nombre, media_url').ilike('media_url', `%${id}%`)
    if (!data) return
    const conflicto = data.find(e => e.id !== idActual)
    setVideoConflicto(conflicto || null)
  }

  function abrirNuevo() { setForm(EMPTY); setModal('nuevo'); setVideoConflicto(null) }

  function abrirEditar(e) {
    setInlineEj(null)
    setVideoConflicto(null)
    setForm({
      nombre: e.nombre || '', descripcion: e.descripcion || '',
      media_tipo: e.media_tipo || '', media_url: e.media_url || '',
      video_url: e.video_url || '', notas: e.notas || '',
    })
    setModal(e)
  }

  function activarInline(e) {
    setInlineEj({ id: e.id, nombre: e.nombre || '' })
  }

  function cancelarInline() { setInlineEj(null) }

  function fd(campo, valor) {
    setForm(f => ({ ...f, [campo]: valor }))
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setSaving(true)
    const datos = {
      nombre: form.nombre.trim(), descripcion: form.descripcion || null,
      media_tipo: form.media_tipo || null, media_url: form.media_url || null,
      video_url: form.video_url || null, notas: form.notas || null,
    }
    const { error } = modal === 'nuevo'
      ? await supabase.from('ejercicios_biblioteca').insert(datos)
      : await supabase.from('ejercicios_biblioteca').update(datos).eq('id', modal.id)
    setSaving(false)
    if (error) { mostrarToast('error'); return }
    setModal(null)
    mostrarToast('ok')
    cargar()
  }

  async function guardarInline() {
    if (!inlineEj || !inlineEj.nombre.trim()) return
    setInlineSaving(true)
    const { error } = await supabase.from('ejercicios_biblioteca').update({
      nombre: inlineEj.nombre.trim(),
    }).eq('id', inlineEj.id)
    setInlineSaving(false)
    if (error) { mostrarToast('error'); return }
    setInlineEj(null)
    mostrarToast('ok')
    cargar()
  }

  async function eliminar(id) {
    if (!window.confirm('¿Eliminar este ejercicio de la biblioteca?')) return
    await supabase.from('ejercicios_biblioteca').delete().eq('id', id)
    if (inlineEj?.id === id) setInlineEj(null)
    cargar()
  }

  const textoBusqueda = busquedaTexto.toLowerCase()
  const filtrados = ejercicios.filter(e => {
    if (!textoBusqueda) return true
    return e.nombre.toLowerCase().includes(textoBusqueda) || (e.descripcion || '').toLowerCase().includes(textoBusqueda)
  }).sort((a, b) => {
    const va = (a.nombre || '').toLowerCase(); const vb = (b.nombre || '').toLowerCase()
    return sortDir === 'asc' ? va.localeCompare(vb, 'es') : vb.localeCompare(va, 'es')
  })

  function InlineActions() {
    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={guardarInline} disabled={inlineSaving || !inlineEj?.nombre?.trim()}>
          {inlineSaving ? 'Guardando...' : <><Check size={12} /> Guardar</>}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={cancelarInline}>Cancelar</button>
      </div>
    )
  }

  return (
    <div className="page">
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: toast === 'ok' ? '#166534' : '#991b1b', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s' }}>
          {toast === 'ok' ? <><Check size={15} /> Guardado</> : '✕ Error al guardar'}
        </div>
      )}

      <div className="page-header">
        <h2 className="page-title">Biblioteca</h2>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {[['ejercicios', '🏋️ Ejercicios'], ['bloques', '🧱 Bloques'], ['sesiones', '📋 Sesiones']].map(([id, label]) => (
          <button key={id} onClick={() => setTabPrincipal(id)}
            style={{ fontSize: 14, padding: '8px 22px', border: 'none', background: 'transparent', borderBottom: `2px solid ${tabPrincipal === id ? 'var(--accent)' : 'transparent'}`, color: tabPrincipal === id ? 'var(--accent)' : 'var(--text2)', fontWeight: tabPrincipal === id ? 600 : 400, cursor: 'pointer', marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {tabPrincipal === 'sesiones' && <BibliotecaSesiones setPage={setPage} setSesionesContext={setSesionesContext} />}
      {tabPrincipal === 'bloques' && <BibliotecaBloques />}

      {tabPrincipal === 'ejercicios' && (<>
        <div className="page-header" style={{ marginTop: 0, paddingTop: 0 }}>
          <p className="page-subtitle">{filtrados.length} de {ejercicios.length} ejercicios</p>
          <button className="btn btn-primary" onClick={abrirNuevo}><Plus size={14} /> Nuevo ejercicio</button>
        </div>

        {/* Búsqueda y vista */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)' }} />
              <input className="form-input" style={{ paddingLeft: 32 }} placeholder="Buscar ejercicio..." value={busquedaTexto} onChange={e => setBusquedaTexto(e.target.value)} />
              {busquedaTexto && <button onClick={() => setBusquedaTexto('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)' }}><X size={13} /></button>}
            </div>
            <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', background: 'var(--bg2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
              {[{ id: 'cards', icon: <LayoutGrid size={14} />, title: 'Cards' }, { id: 'lista', icon: <List size={14} />, title: 'Lista' }, { id: 'tabla', icon: <Table2 size={14} />, title: 'Tabla' }].map(({ id, icon, title }) => (
                <button key={id} title={title} onClick={() => setVista(id)}
                  style={{ padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: vista === id ? 'var(--bg)' : 'transparent', color: vista === id ? 'var(--accent)' : 'var(--text3)', boxShadow: vista === id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.1s', display: 'flex', alignItems: 'center' }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="empty"><p>Cargando...</p></div>
        ) : filtrados.length === 0 ? (
          <div className="empty"><p>No hay ejercicios{busquedaTexto ? ' con esa búsqueda' : ''}.</p></div>
        ) : vista === 'cards' ? (
          /* ── CARDS ── */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filtrados.map(e => {
              const ytid = e.media_tipo === 'youtube' ? ytId(e.media_url) : null
              const thumb = ytid ? `https://img.youtube.com/vi/${ytid}/hqdefault.jpg` : (e.media_url && e.media_tipo !== 'youtube' ? e.media_url : null)
              const abierto = expandido === e.id
              const editando = inlineEj?.id === e.id
              return (
                <div key={e.id} className="card" style={{ padding: 0, overflow: 'hidden', border: editando ? '2px solid var(--accent)' : undefined }}>
                  {thumb && !editando && (
                    <div style={{ position: 'relative', paddingBottom: '40%', background: '#000', cursor: ytid ? 'pointer' : 'default' }}
                      onClick={() => ytid && window.open(`https://www.youtube.com/watch?v=${ytid}`, '_blank')}>
                      <img src={thumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                      {ytid && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg viewBox="0 0 24 24" fill="white" width="16" height="16"><polygon points="5,3 19,12 5,21"/></svg>
                        </div>
                      </div>}
                    </div>
                  )}
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      {editando ? (
                        <input className="form-input" value={inlineEj.nombre} autoFocus
                          onChange={ev => setInlineEj(ie => ({ ...ie, nombre: ev.target.value }))}
                          style={{ flex: 1, fontWeight: 600, fontSize: 13, padding: '3px 8px' }} />
                      ) : (
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', flex: 1, cursor: 'text' }}
                          onDoubleClick={() => activarInline(e)} title="Doble clic para editar">
                          {e.nombre}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {!editando && <button className="btn btn-ghost btn-sm" onClick={() => activarInline(e)} style={{ padding: '2px 6px' }} title="Edición rápida"><Pencil size={11} /></button>}
                        <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(e)} style={{ padding: '2px 6px' }} title="Editar todo">⚙</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => eliminar(e.id)} style={{ padding: '2px 6px', color: 'var(--danger)' }}><Trash2 size={11} /></button>
                      </div>
                    </div>

                    {!editando && e.descripcion && (
                      <div style={{ marginTop: 5 }}>
                        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, overflow: abierto ? 'visible' : 'hidden', display: abierto ? 'block' : '-webkit-box', WebkitLineClamp: abierto ? undefined : 2, WebkitBoxOrient: 'vertical' }}>
                          {e.descripcion}
                        </div>
                        {e.descripcion.length > 80 && (
                          <button onClick={() => setExpandido(abierto ? null : e.id)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}>
                            {abierto ? 'Ver menos' : 'Ver más'}
                          </button>
                        )}
                      </div>
                    )}

                    {editando ? (
                      <InlineActions />
                    ) : (
                      e.video_url && <a href={e.video_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 11, color: 'var(--accent)' }}>▶ Ver vídeo</a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : vista === 'lista' ? (
          /* ── LISTA ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtrados.map(e => {
              const ytid = e.media_tipo === 'youtube' ? ytId(e.media_url) : null
              const thumb = ytid ? `https://img.youtube.com/vi/${ytid}/hqdefault.jpg` : (e.media_url && e.media_tipo !== 'youtube' ? e.media_url : null)
              const abierto = expandido === e.id
              const editando = inlineEj?.id === e.id
              return (
                <div key={e.id} className="card" style={{ padding: '10px 14px', border: editando ? '2px solid var(--accent)' : undefined }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {thumb && !editando && (
                      <div style={{ width: 56, height: 40, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: '#000', cursor: ytid ? 'pointer' : 'default', position: 'relative' }}
                        onClick={() => ytid && window.open(`https://www.youtube.com/watch?v=${ytid}`, '_blank')}>
                        <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                        {ytid && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg viewBox="0 0 24 24" fill="white" width="10" height="10"><polygon points="5,3 19,12 5,21"/></svg>
                        </div>}
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        {editando ? (
                          <input className="form-input" value={inlineEj.nombre} autoFocus
                            onChange={ev => setInlineEj(ie => ({ ...ie, nombre: ev.target.value }))}
                            style={{ flex: 1, fontWeight: 600, fontSize: 13, padding: '3px 8px' }} />
                        ) : (
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', cursor: 'text' }}
                            onDoubleClick={() => activarInline(e)} title="Doble clic para editar">
                            {e.nombre}
                          </span>
                        )}
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {!editando && <button className="btn btn-ghost btn-sm" onClick={() => activarInline(e)} style={{ padding: '2px 6px' }} title="Edición rápida"><Pencil size={11} /></button>}
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(e)} style={{ padding: '2px 6px' }} title="Editar todo">⚙</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => eliminar(e.id)} style={{ padding: '2px 6px', color: 'var(--danger)' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      {!editando && e.descripcion && (
                        <div style={{ marginTop: 3 }}>
                          <span style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4, overflow: abierto ? 'visible' : 'hidden', display: abierto ? 'inline' : '-webkit-box', WebkitLineClamp: abierto ? undefined : 1, WebkitBoxOrient: 'vertical' }}>
                            {e.descripcion}
                          </span>
                          {e.descripcion.length > 60 && (
                            <button onClick={() => setExpandido(abierto ? null : e.id)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>
                              {abierto ? 'menos' : 'más'}
                            </button>
                          )}
                        </div>
                      )}
                      {editando && <InlineActions />}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* ── TABLA ── */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    <span onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} style={{ cursor: 'pointer' }}>
                      Ejercicio <span style={{ fontSize: 10 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                    </span>
                  </th>
                  <th style={{ padding: '8px 10px', width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e, i) => {
                  const editando = inlineEj?.id === e.id
                  return (
                    <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: editando ? 'var(--accent-light)' : i % 2 === 0 ? 'transparent' : 'var(--bg2)', verticalAlign: 'top' }}>
                      <td style={{ padding: '8px 10px', minWidth: 180 }}>
                        {editando ? (
                          <input className="form-input" value={inlineEj.nombre} autoFocus
                            onChange={ev => setInlineEj(ie => ({ ...ie, nombre: ev.target.value }))}
                            style={{ fontWeight: 600, fontSize: 13, padding: '3px 8px', width: '100%' }} />
                        ) : (
                          <>
                            <span style={{ fontWeight: 600, color: 'var(--text)', cursor: 'text' }}
                              onDoubleClick={() => activarInline(e)} title="Doble clic para editar">
                              {e.nombre}
                            </span>
                            {e.descripcion && <div style={{ fontWeight: 400, fontSize: 11, color: 'var(--text3)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.descripcion}</div>}
                          </>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {editando ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-primary btn-sm" onClick={guardarInline} disabled={inlineSaving}><Check size={11} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={cancelarInline}><X size={11} /></button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => activarInline(e)} style={{ padding: '2px 6px' }} title="Edición rápida"><Pencil size={11} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => abrirEditar(e)} style={{ padding: '2px 6px' }} title="Editar todo">⚙</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => eliminar(e.id)} style={{ padding: '2px 6px', color: 'var(--danger)' }}><Trash2 size={11} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── MODAL NUEVO/EDITAR ── */}
        {modal && (
          <div className="modal-backdrop" onClick={() => setModal(null)}>
            <div className="modal" style={{ maxWidth: 'min(96vw, 760px)', width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">{modal === 'nuevo' ? 'Nuevo ejercicio' : 'Editar ejercicio'}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={14} /></button>
              </div>

              {/* ── Cuerpo en dos columnas ── */}
              <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Columna izquierda: nombre + descripción */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                  <div className="form-group">
                    <label className="form-label">Nombre *</label>
                    <input className="form-input" value={form.nombre} onChange={e => fd('nombre', e.target.value)} placeholder="Ej: Sentadilla búlgara" autoFocus />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Descripción</label>
                    <textarea className="form-input" value={form.descripcion} onChange={e => fd('descripcion', e.target.value)} placeholder="Explicación del ejercicio..." rows={8} style={{ resize: 'vertical' }} />
                  </div>
                </div>

                {/* Columna derecha: media + notas */}
                <div style={{ width: 264, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', overflowY: 'auto', padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 0 }}>

                  {/* ── Vista previa de media — siempre visible ── */}
                  <div style={{ marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: '#0f172a', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {(!form.media_url || !form.media_tipo) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: '#334155' }}>
                        <Play size={30} strokeWidth={1.5} />
                        <span style={{ fontSize: 11 }}>Vista previa</span>
                      </div>
                    ) : form.media_tipo === 'imagen' ? (
                      <img src={form.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : form.media_tipo === 'gif' ? (
                      <img src={form.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : form.media_tipo === 'video' ? (
                      <video src={form.media_url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : form.media_tipo === 'youtube' ? (() => {
                      const yId = form.media_url.match(/(?:v=|youtu\.be\/)([^&?]+)/)?.[1]
                      return yId
                        ? <iframe src={`https://www.youtube.com/embed/${yId}`} style={{ width: '100%', height: '100%', border: 'none' }} title="preview" allowFullScreen />
                        : <span style={{ fontSize: 11, color: '#475569', padding: 12, textAlign: 'center' }}>URL de YouTube no válida</span>
                    })() : null}
                  </div>

                  {/* Archivo */}
                  <div style={{ marginBottom: 10 }}>
                    <div className="form-label" style={{ marginBottom: 4 }}>Archivo</div>
                    <select className="form-select" value={form.media_tipo} onChange={e => fd('media_tipo', e.target.value)} style={{ marginBottom: 6 }}>
                      <option value="">Sin media</option>
                      <option value="youtube">YouTube</option>
                      <option value="imagen">Imagen</option>
                      <option value="video">Vídeo</option>
                      <option value="gif">GIF</option>
                    </select>
                    {form.media_tipo && (
                      <>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                          <input className="form-input" value={form.media_url}
                            onChange={e => {
                              fd('media_url', e.target.value)
                              if (form.media_tipo === 'youtube') comprobarVideoConflicto(e.target.value, modal?.id)
                            }}
                            placeholder={form.media_tipo === 'youtube' ? 'https://youtube.com/...' : 'https://...'}
                            style={{ flex: 1, fontSize: 12, borderColor: videoConflicto ? '#f59e0b' : undefined }} />
                          {form.media_tipo !== 'youtube' && (
                            <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                              <input type="file" accept="image/*,video/*,.gif" style={{ display: 'none' }}
                                onChange={async ev => {
                                  const file = ev.target.files?.[0]; if (!file) return
                                  const path = `biblioteca/${Date.now()}.${file.name.split('.').pop()}`
                                  const { error } = await supabase.storage.from('media-ejercicios').upload(path, file, { upsert: true })
                                  if (error) { alert('Error: ' + error.message); return }
                                  const { data: { publicUrl } } = supabase.storage.from('media-ejercicios').getPublicUrl(path)
                                  fd('media_url', publicUrl); ev.target.value = ''
                                }} />
                              <span className="btn btn-ghost btn-sm">📁</span>
                            </label>
                          )}
                        </div>
                        {videoConflicto && (
                          <div style={{ padding: '6px 8px', background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 6, fontSize: 11, color: '#92400e', marginBottom: 4 }}>
                            ⚠️ Ya en uso: <strong>{videoConflicto.nombre}</strong>
                          </div>
                        )}
                        {form.media_tipo !== 'youtube' && (
                          <input className="form-input" value={form.video_url} onChange={e => fd('video_url', e.target.value)} placeholder='Enlace "Ver vídeo" (opcional)' style={{ fontSize: 12 }} />
                        )}
                      </>
                    )}
                  </div>

                  {/* Notas internas */}
                  <div style={{ marginBottom: 12 }}>
                    <div className="form-label" style={{ marginBottom: 4 }}>Notas internas</div>
                    <textarea className="form-input" value={form.notas} onChange={e => fd('notas', e.target.value)} placeholder="Apuntes, cuidados, variantes..." rows={3} style={{ resize: 'vertical', fontSize: 12 }} />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
                <button className="btn btn-primary" disabled={saving || !form.nombre.trim()} onClick={guardar}>{saving ? 'Guardando...' : <><Check size={13} /> Guardar</>}</button>
              </div>
            </div>
          </div>
        )}
      </>)}
    </div>
  )
}
