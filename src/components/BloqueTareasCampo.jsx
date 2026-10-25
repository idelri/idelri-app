/**
 * BloqueTareasCampo — contenido de un bloque de tipo Campo en el editor de
 * sesiones: descripción arriba y una tarjeta por tarea (dibujo + prescripción).
 * Cada tarea es una fila de sesion_ejercicios con su dibujo en `diagrama`.
 */
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import EditorTareaCampo, { DiagramaCampo, metricasDiagrama, nuevoDiagrama } from './TareaCampo'

const inp = { padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box' }
const fmtM = m => (m >= 100 ? Math.round(m) : Math.round(m * 2) / 2).toLocaleString('es-ES') + ' m'

export default function BloqueTareasCampo({ bloque, tareas, setTareas, descripcion, onDescripcion, onAbrirBiblioteca, onDirty }) {
  const [editando, setEditando] = useState(null) // id de la tarea cuyo dibujo se edita
  const [desc, setDesc] = useState(descripcion || '')
  const [aviso, setAviso] = useState('')

  async function actualizar(id, campos) {
    setTareas(ts => ts.map(t => t.id === id ? { ...t, ...campos } : t))
    onDirty?.()
    await supabase.from('sesion_ejercicios').update(campos).eq('id', id)
  }
  async function nuevaTarea() {
    const { data } = await supabase.from('sesion_ejercicios').insert({
      bloque_id: bloque.id, nombre: `Tarea ${tareas.length + 1}`, orden: tareas.length,
      series: '', reps: '', diagrama: nuevoDiagrama(),
    }).select().single()
    if (data) { setTareas(ts => [...ts, data]); onDirty?.(); setEditando(data.id) }
  }
  async function duplicar(t) {
    const { id, ...resto } = t
    const { data } = await supabase.from('sesion_ejercicios').insert({ ...resto, nombre: `${t.nombre} (copia)`, orden: tareas.length, valores_reales: null }).select().single()
    if (data) { setTareas(ts => [...ts, data]); onDirty?.() }
  }
  async function eliminar(t) {
    if (!window.confirm(`¿Eliminar la tarea "${t.nombre}"?`)) return
    setTareas(ts => ts.filter(x => x.id !== t.id)); onDirty?.()
    await supabase.from('sesion_ejercicios').delete().eq('id', t.id)
  }
  async function mover(i, dir) {
    const j = i + dir; if (j < 0 || j >= tareas.length) return
    const n = [...tareas];[n[i], n[j]] = [n[j], n[i]]
    const renum = n.map((t, k) => ({ ...t, orden: k }))
    setTareas(renum); onDirty?.()
    await Promise.all([renum[i], renum[j]].map(t => supabase.from('sesion_ejercicios').update({ orden: t.orden }).eq('id', t.id)))
  }
  async function guardarEnBiblioteca(t) {
    const { data, error } = await supabase.from('ejercicios_biblioteca').insert({
      nombre: t.nombre, carpeta: 'campo', diagrama: t.diagrama || null,
      ...(t.notas ? { descripcion: t.notas } : {}),
    }).select('id').single()
    if (!error && data) { await actualizar(t.id, { biblioteca_id: data.id }); setAviso(`"${t.nombre}" guardada en la biblioteca de campo`); setTimeout(() => setAviso(''), 2500) }
  }
  const presc = (t, campo, valor) => actualizar(t.id, { diagrama: { ...(t.diagrama || nuevoDiagrama()), presc: { ...(t.diagrama?.presc || {}), [campo]: valor } } })

  const tareaEditando = tareas.find(t => t.id === editando)

  return (
    <div style={{ padding: '10px 10px 0' }}>
      <textarea value={desc} onChange={e => setDesc(e.target.value)} onBlur={() => desc !== (descripcion || '') && onDescripcion(desc)}
        placeholder="Descripción de la parte de campo (opcional)…" rows={2}
        style={{ ...inp, width: '100%', resize: 'vertical', fontSize: 12.5, lineHeight: 1.45, marginBottom: 8 }} />

      {tareas.map((t, i) => {
        const met = t.diagrama ? metricasDiagrama(t.diagrama) : null
        const series = parseInt(t.series) || 1, reps = parseInt(t.reps) || 1
        return (
          <div key={t.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
            {/* Dibujo */}
            <button onClick={() => setEditando(t.id)} title="Editar dibujo"
              style={{ width: 250, flexShrink: 0, padding: 0, border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg2)', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
              {t.diagrama ? <DiagramaCampo diagrama={t.diagrama} style={{ borderRadius: 0 }} />
                : t.media_url && /^(imagen|gif)$/.test(t.media_tipo || '') ? <img src={t.media_url} alt="" style={{ width: '100%', display: 'block' }} />
                  : <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 12 }}>＋ Dibujar la tarea</div>}
              <span style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 10.5, fontWeight: 600, background: 'rgba(255,255,255,.92)', color: '#111', borderRadius: 6, padding: '2px 7px', boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}>✎ Editar dibujo</span>
            </button>

            {/* Ficha */}
            <div style={{ flex: '1 1 280px', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input defaultValue={t.nombre} key={t.id + t.nombre} onBlur={e => e.target.value.trim() && e.target.value !== t.nombre && actualizar(t.id, { nombre: e.target.value.trim() })}
                  style={{ ...inp, flex: 1, fontWeight: 700, fontSize: 13.5, border: '1px solid transparent', padding: '3px 5px' }}
                  onFocus={e => (e.target.style.border = '1px solid var(--border)')} />
                <button className="btn btn-ghost btn-sm" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0} style={{ opacity: i === 0 ? .3 : .7 }}>↑</button>
                <button className="btn btn-ghost btn-sm" title="Bajar" onClick={() => mover(i, 1)} disabled={i === tareas.length - 1} style={{ opacity: i === tareas.length - 1 ? .3 : .7 }}>↓</button>
                <button className="btn btn-ghost btn-sm" title="Duplicar tarea" onClick={() => duplicar(t)} style={{ opacity: .7 }}>⧉</button>
                <button className="btn btn-ghost btn-sm" title="Guardar en la biblioteca de campo" onClick={() => guardarEnBiblioteca(t)} style={{ opacity: .7 }}>📚</button>
                <button className="btn btn-ghost btn-sm" title="Eliminar tarea" onClick={() => eliminar(t)} style={{ color: '#dc2626', opacity: .7 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '6px 10px', marginTop: 6 }}>
                {[
                  ['Series', t.series, v => actualizar(t.id, { series: v }), '2'],
                  ['Repeticiones', t.reps, v => actualizar(t.id, { reps: v }), '6'],
                  ['Recup. entre reps', t.descanso, v => actualizar(t.id, { descanso: v }), '30 s andando'],
                  ['Recup. entre series', t.diagrama?.presc?.recup_series, v => presc(t, 'recup_series', v), '3 min'],
                  ['Intensidad', t.diagrama?.presc?.intensidad, v => presc(t, 'intensidad', v), 'Máxima / 90 %'],
                  ['Tiempo objetivo', t.diagrama?.presc?.tiempo, v => presc(t, 'tiempo', v), '< 5,2 s'],
                ].map(([l, val, set, ph]) => (
                  <label key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{l}</span>
                    <input defaultValue={val || ''} key={t.id + l + (val || '')} placeholder={ph} onBlur={e => e.target.value !== (val || '') && set(e.target.value)} style={inp} />
                  </label>
                ))}
              </div>
              {met && met.metros > 0 && (
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 7, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', opacity: t.diagrama?.presc?.ocultarMetricas ? .5 : 1 }}>
                  <span>📏 <b style={{ color: '#1f2d8a' }}>{fmtM(met.metros)}</b> por repetición</span>
                  {met.cod > 0 && <span>↪ <b style={{ color: '#1f2d8a' }}>{met.cod}</b> cambios de dirección</span>}
                  <span>Total: <b style={{ color: '#1f2d8a' }}>{fmtM(met.metros * series * reps)}</b>{met.cod ? ` · ${met.cod * series * reps} COD` : ''}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto', opacity: 1 }} title="Si lo desmarcas, el cliente no ve los metros ni los cambios de dirección de esta tarea">
                    <input type="checkbox" checked={!t.diagrama?.presc?.ocultarMetricas} onChange={e => presc(t, 'ocultarMetricas', !e.target.checked)} />
                    Mostrar al cliente
                  </label>
                </div>
              )}
              <textarea defaultValue={t.notas || ''} key={t.id + 'notas' + (t.notas || '')} placeholder="Indicaciones de la tarea…" rows={2}
                onBlur={e => e.target.value !== (t.notas || '') && actualizar(t.id, { notas: e.target.value })}
                style={{ ...inp, width: '100%', marginTop: 7, resize: 'vertical', lineHeight: 1.4 }} />
            </div>
          </div>
        )
      })}

      {aviso && <div style={{ fontSize: 11.5, color: '#15803d', padding: '4px 0' }}>✓ {aviso}</div>}
      <div style={{ display: 'flex', borderTop: '0.5px solid var(--border)', margin: '6px -10px 0' }}>
        <button onClick={nuevaTarea} style={{ flex: 1, padding: '7px 0', border: 'none', borderRight: '0.5px solid var(--border)', background: 'transparent', color: 'var(--text2)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>＋ Tarea de campo</button>
        <button onClick={onAbrirBiblioteca} style={{ flex: 1, padding: '7px 0', border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: 11.5, cursor: 'pointer' }}>📚 Desde la biblioteca</button>
      </div>

      {tareaEditando && (
        <EditorTareaCampo
          titulo={tareaEditando.nombre}
          inicial={tareaEditando.diagrama}
          onCerrar={() => setEditando(null)}
          onGuardar={async d => {
            await actualizar(tareaEditando.id, { diagrama: { ...d, presc: tareaEditando.diagrama?.presc || {} } })
            setEditando(null)
          }} />
      )}
    </div>
  )
}
