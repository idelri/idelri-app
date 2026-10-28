/**
 * Visor de una valoración con sus tests de fuerza (Vitruve / Tindeq).
 * Se abre desde la ficha del cliente (Evaluaciones) y desde la valoración 🔬 del Timeline.
 */
import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import EvaluacionVBT from './EvaluacionVBT'
import EvaluacionIso from './EvaluacionIso'
import { parseVitruve, computeVBT, resumenVBT } from '../../lib/evaluaciones/vbt'
import { leerTindeq, montarIso, resumenIso } from '../../lib/evaluaciones/iso'

const idCorto = () => Math.random().toString(36).slice(2, 8)

/**
 * Procesa archivos de Vitruve (.xlsx) y Tindeq (.zip/.csv) y crea los tests.
 * Si no se indica controlId, los agrupa por fecha en una valoración «Evaluación de fuerza» de ese día (la crea si no existe).
 */
export async function subirArchivosEvaluacion({ clienteId, files, controlId }) {
  const xlsx = files.filter(f => /\.xlsx?$/i.test(f.name)), tindeq = files.filter(f => /\.(zip|csv)$/i.test(f.name))
  const nuevos = [], errores = []
  if (xlsx.length) {
    const XLSX = await import('xlsx')
    for (const f of xlsx) {
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        const t = parseVitruve(aoa, f.name, wb.SheetNames[0])
        if (!t.sets.length) throw new Error('sin series')
        nuevos.push({ tipo: 'vbt', nombre: t.name, ejercicio: t.exercise, fecha: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : format(new Date(), 'yyyy-MM-dd'), datos: t, archivos: [f], resultados: resumenVBT(computeVBT(t, {})) })
      } catch (e) { errores.push(f.name) }
    }
  }
  if (tindeq.length) {
    const grupos = await leerTindeq(tindeq)
    if (!grupos.length) errores.push(...tindeq.map(f => f.name))
    grupos.forEach(g => {
      const datos = { attempts: g.intentos.map(a => ({ ...a, id: idCorto() })) }
      nuevos.push({ tipo: 'iso', nombre: g.musculo, ejercicio: g.musculo, fecha: g.fecha, datos, archivos: tindeq, resultados: resumenIso(montarIso(datos, {})) })
    })
  }
  // valoraciones de destino
  const controlDe = {}
  for (const n of nuevos) {
    if (controlId) { n.control_id = controlId; continue }
    if (!controlDe[n.fecha]) {
      const { data: ex } = await supabase.from('controles').select('id').eq('cliente_id', clienteId).eq('fecha', n.fecha).eq('tipo', 'Fuerza').limit(1)
      if (ex?.length) controlDe[n.fecha] = ex[0].id
      else {
        const { data: nc, error } = await supabase.from('controles').insert({ cliente_id: clienteId, fecha: n.fecha, nombre: 'Evaluación de fuerza', tipo: 'Fuerza', visibilidad: 'entrenadora' }).select('id').single()
        if (error) throw error
        controlDe[n.fecha] = nc.id
      }
    }
    n.control_id = controlDe[n.fecha]
  }
  const subidos = new Map()
  const filas = []
  for (const [i, n] of nuevos.entries()) {
    const rutas = []
    for (const f of n.archivos) {
      if (!subidos.has(f)) {
        const ruta = `${clienteId}/${n.fecha}/${Date.now()}_${f.name.replace(/[^\w.-]+/g, '_')}`
        const { error } = await supabase.storage.from('evaluaciones').upload(ruta, f)
        subidos.set(f, error ? null : ruta)
      }
      if (subidos.get(f)) rutas.push(subidos.get(f))
    }
    filas.push({ control_id: n.control_id, cliente_id: clienteId, tipo: n.tipo, nombre: n.nombre, ejercicio: n.ejercicio, fecha: n.fecha, datos: n.datos, resultados: n.resultados, archivo: rutas.join('|') || null, orden: i })
  }
  let creados = []
  if (filas.length) {
    const { data, error } = await supabase.from('evaluacion_tests').insert(filas).select('id, control_id')
    if (error) throw error
    creados = data || []
  }
  return { creados, errores }
}

export function resumenCorto(t) {
  const r = t.resultados || {}
  if (t.tipo === 'vbt') return r.e1rm != null ? `1RM ≈ ${String(r.e1rm).replace('.', ',')} kg` : 'sin estimación'
  const pi = r.izquierda?.pico_kg, pd = r.derecha?.pico_kg
  return pi != null || pd != null ? `Izda ${pi != null ? Math.round(pi * 9.81) : '–'} N · Dcha ${pd != null ? Math.round(pd * 9.81) : '–'} N${r.asimetria_pico_pct != null ? ` · ${String(r.asimetria_pico_pct).replace('.', ',')} %` : ''}` : ''
}

export default function VisorEvaluacion({ clienteId, controlId, testId, onCerrar, onCambio }) {
  const [control, setControl] = useState(null)
  const [tests, setTests] = useState([])
  const [activo, setActivo] = useState(testId || null)
  const [subiendo, setSubiendo] = useState(false)

  const cargar = useCallback(async () => {
    const [c, t] = await Promise.all([
      supabase.from('controles').select('*').eq('id', controlId).single(),
      supabase.from('evaluacion_tests').select('*').eq('control_id', controlId).order('orden').order('created_at'),
    ])
    setControl(c.data || null); setTests(t.data || [])
    setActivo(a => a && (t.data || []).some(x => x.id === a) ? a : (t.data || [])[0]?.id || null)
  }, [controlId])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const f = e => { if (e.key === 'Escape') onCerrar() }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [onCerrar])

  async function subir(files) {
    if (!files.length) return
    setSubiendo(true)
    try {
      const { creados, errores } = await subirArchivosEvaluacion({ clienteId: clienteId || control?.cliente_id, files, controlId })
      if (errores.length) alert('No reconozco el formato de: ' + errores.join(', '))
      await cargar(); if (creados[0]) setActivo(creados[0].id)
      onCambio?.()
    } catch (e) { alert('No se pudo subir: ' + (e.message || e)) }
    setSubiendo(false)
  }
  async function borrar(t) {
    if (!window.confirm(`¿Eliminar el test «${t.nombre}»?`)) return
    await supabase.from('evaluacion_tests').delete().eq('id', t.id)
    if (t.archivo) await supabase.storage.from('evaluaciones').remove(t.archivo.split('|'))
    await cargar(); onCambio?.()
  }

  const test = tests.find(x => x.id === activo)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,20,18,.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: '24px 12px' }} onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div style={{ width: '100%', maxWidth: 1180, background: 'var(--bg)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,.25)', padding: '16px 18px 22px', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>🔬 Valoración · Vitruve · Tindeq</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{control?.nombre || 'Evaluación'}</div>
            {control?.fecha && <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>{format(parseISO(control.fecha), "EEEE d 'de' MMMM yyyy", { locale: es })}</div>}
          </div>
          <label className="btn btn-ghost btn-sm" style={{ cursor: subiendo ? 'wait' : 'pointer', border: '1.5px dashed var(--border)' }} title="Exportaciones de Vitruve (.xlsx) o Tindeq (.zip)">
            {subiendo ? 'Procesando…' : '⬆ Añadir test (Vitruve / Tindeq)'}
            <input type="file" accept=".xlsx,.xls,.zip,.csv" multiple style={{ display: 'none' }} disabled={subiendo} onChange={e => { subir([...e.target.files]); e.target.value = '' }} />
          </label>
          <button onClick={onCerrar} className="btn btn-ghost btn-sm" title="Cerrar (Esc)">✕</button>
        </div>
        {tests.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tests.map(t => (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 99, border: `1px solid ${t.id === activo ? 'var(--text)' : 'var(--border)'}`, background: t.id === activo ? 'var(--text)' : 'var(--surface)', color: t.id === activo ? 'var(--bg)' : 'var(--text2)' }}>
                <button onClick={() => setActivo(t.id)} style={{ border: 'none', background: 'transparent', color: 'inherit', font: 'inherit', fontSize: 13, padding: '5px 4px 5px 12px', cursor: 'pointer' }}>
                  {t.tipo === 'vbt' ? '📈' : '⚖️'} {t.nombre}<small style={{ opacity: .7, marginLeft: 6 }}>{t.tipo === 'vbt' ? 'Vitruve' : 'Tindeq'}{t.visible_cliente ? ' · 👁' : ''}</small>
                </button>
                <button onClick={() => borrar(t)} title="Eliminar test" style={{ border: 'none', background: 'transparent', color: 'inherit', opacity: .5, cursor: 'pointer', padding: '0 10px 0 4px' }}>×</button>
              </span>
            ))}
          </div>
        )}
        {!tests.length && <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text3)', fontSize: 13.5, border: '1.5px dashed var(--border)', borderRadius: 12 }}>Esta valoración aún no tiene tests. Sube una exportación de Vitruve (.xlsx) o de Tindeq (.zip).</div>}
        {test && (test.tipo === 'vbt'
          ? <EvaluacionVBT key={test.id} test={test} onCambio={t => { setTests(ts => ts.map(x => x.id === t.id ? t : x)); onCambio?.() }} />
          : <EvaluacionIso key={test.id} test={test} onCambio={t => { setTests(ts => ts.map(x => x.id === t.id ? t : x)); onCambio?.() }} />)}
      </div>
    </div>
  )
}
