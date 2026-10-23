/**
 * TabPerfilZonas — pestaña "Perfil y zonas" de la ficha del cliente.
 *
 * Datos del deportista (FC máx, reposo, umbral, ritmo umbral y ritmo
 * maratón) y sus zonas. La app calcula pulsaciones y ritmos; los
 * porcentajes de cada zona se pueden ajustar. Se guarda en
 * clientes.perfil_zonas (ver src/lib/zonas.js).
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  METODOS_FC, ZONAS_FC_DEFECTO, ZONAS_RITMO_DEFECTO, RITMOS_MARATON_DEFECTO,
  perfilConDefectos, pctAPulsaciones, pctARitmo, fmtRitmo, parseRitmo, fmtTiempoMaraton,
} from '../lib/zonas'

const COLORES_ZONA = ['#94a3b8', '#10b981', '#f59e0b', '#f97316', '#ef4444', '#7c3aed', '#7c3aed']

const lbl = { fontSize: 10.5, fontFamily: 'var(--mono)', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4, display: 'block' }
const numInput = { width: 58, padding: '4px 6px', fontSize: 12.5, textAlign: 'center', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--text)' }

function CampoRitmo({ valor, onChange, placeholder }) {
  const [txt, setTxt] = useState(valor ? fmtRitmo(valor) : '')
  useEffect(() => { setTxt(valor ? fmtRitmo(valor) : '') }, [valor])
  return (
    <input className="form-input" value={txt} placeholder={placeholder}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { const s = parseRitmo(txt); onChange(s); setTxt(s ? fmtRitmo(s) : '') }} />
  )
}

export default function TabPerfilZonas({ clienteId, cliente, setCliente }) {
  const [p, setP] = useState(() => perfilConDefectos(cliente?.perfil_zonas))
  const [guardando, setGuardando] = useState(false)
  const [cambios, setCambios] = useState(false)
  const [aviso, setAviso] = useState(null)

  useEffect(() => { setP(perfilConDefectos(cliente?.perfil_zonas)); setCambios(false) }, [clienteId]) // eslint-disable-line

  function set(campo, valor) { setP(x => ({ ...x, [campo]: valor })); setCambios(true); setAviso(null) }
  function setZona(lista, i, campo, valor) {
    setP(x => ({ ...x, [lista]: x[lista].map((z, j) => j === i ? { ...z, [campo]: valor } : z) }))
    setCambios(true); setAviso(null)
  }

  async function guardar() {
    setGuardando(true)
    const num = v => (v === '' || v == null ? null : Number(v))
    const datos = {
      ...p,
      fc_max: num(p.fc_max), fc_reposo: num(p.fc_reposo), fc_umbral: num(p.fc_umbral),
      zonas_fc: p.zonas_fc.map(z => ({ ...z, min: Number(z.min), max: Number(z.max) })),
      zonas_ritmo: p.zonas_ritmo.map(z => ({ ...z, min: Number(z.min), max: Number(z.max) })),
      ritmos_maraton: p.ritmos_maraton.map(Number).filter(n => n > 0),
    }
    const { error } = await supabase.from('clientes').update({ perfil_zonas: datos }).eq('id', clienteId)
    setGuardando(false)
    if (error) { setAviso('Error al guardar: ' + error.message); return }
    setCambios(false); setAviso('Guardado')
    if (setCliente) setCliente(c => c ? { ...c, perfil_zonas: datos } : c)
  }

  const faltaFc = p.metodo_fc === 'umbral' ? !p.fc_umbral : p.metodo_fc === 'reserva' ? !(p.fc_max && p.fc_reposo) : !p.fc_max

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 60 }}>

      {/* ── Datos del deportista ── */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Datos del deportista</div>
          {aviso && <span style={{ fontSize: 12, color: aviso.startsWith('Error') ? 'var(--danger)' : 'var(--accent)', marginRight: 10 }}>{aviso}</span>}
          <button className="btn btn-primary btn-sm" disabled={!cambios || guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <label><span style={lbl}>FC máx (ppm)</span><input className="form-input" type="number" value={p.fc_max} onChange={e => set('fc_max', e.target.value)} placeholder="190" /></label>
          <label><span style={lbl}>FC reposo (ppm)</span><input className="form-input" type="number" value={p.fc_reposo} onChange={e => set('fc_reposo', e.target.value)} placeholder="50" /></label>
          <label><span style={lbl}>FC umbral (ppm)</span><input className="form-input" type="number" value={p.fc_umbral} onChange={e => set('fc_umbral', e.target.value)} placeholder="172" /></label>
          <label><span style={lbl}>Ritmo umbral (/km)</span><CampoRitmo valor={p.ritmo_umbral_seg} onChange={v => set('ritmo_umbral_seg', v)} placeholder="4:10" /></label>
          <label>
            <span style={lbl}>Ritmo maratón (/km)</span>
            <CampoRitmo valor={p.ritmo_maraton_seg} onChange={v => set('ritmo_maraton_seg', v)} placeholder="4:30" />
            {p.ritmo_maraton_seg && <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3, display: 'block' }}>Maratón en {fmtTiempoMaraton(p.ritmo_maraton_seg)}</span>}
          </label>
        </div>
      </div>

      {/* ── Zonas de FC ── */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Zonas de frecuencia cardiaca</div>
          <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 8, padding: 2, gap: 2 }}>
            {METODOS_FC.map(m => (
              <button key={m.key} onClick={() => { set('metodo_fc', m.key); set('zonas_fc', ZONAS_FC_DEFECTO[m.key]) }}
                style={{ padding: '4px 10px', fontSize: 11.5, borderRadius: 6, border: 'none', cursor: 'pointer', background: p.metodo_fc === m.key ? 'var(--accent)' : 'transparent', color: p.metodo_fc === m.key ? '#fff' : 'var(--text2)', fontWeight: p.metodo_fc === m.key ? 600 : 400 }}>
                {m.label}
              </button>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => set('zonas_fc', ZONAS_FC_DEFECTO[p.metodo_fc])}>Restablecer</button>
        </div>
        {faltaFc && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Rellena {p.metodo_fc === 'umbral' ? 'la FC umbral' : p.metodo_fc === 'reserva' ? 'la FC máx y la de reposo' : 'la FC máx'} para ver las pulsaciones.</div>}
        <TablaZonas zonas={p.zonas_fc} onCambio={(i, c, v) => setZona('zonas_fc', i, c, v)}
          rango={z => {
            const a = pctAPulsaciones(Number(z.min), p), b = pctAPulsaciones(Number(z.max), p)
            return a && b ? `${a} – ${b} ppm` : '—'
          }} />
      </div>

      {/* ── Zonas de ritmo ── */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Zonas de ritmo · % del ritmo umbral</div>
          <button className="btn btn-ghost btn-sm" onClick={() => set('zonas_ritmo', ZONAS_RITMO_DEFECTO)}>Restablecer</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>Porcentaje de la velocidad de umbral: 100 % = ritmo umbral, más de 100 % = más rápido.</div>
        {!p.ritmo_umbral_seg && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Rellena el ritmo umbral para ver los ritmos.</div>}
        <TablaZonas zonas={p.zonas_ritmo} onCambio={(i, c, v) => setZona('zonas_ritmo', i, c, v)}
          rango={z => {
            const lento = pctARitmo(Number(z.min), p.ritmo_umbral_seg), rapido = pctARitmo(Number(z.max), p.ritmo_umbral_seg)
            return lento && rapido ? `${fmtRitmo(lento)} – ${fmtRitmo(rapido)} /km` : '—'
          }} />
      </div>

      {/* ── Ritmos respecto al ritmo maratón ── */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>Ritmos · % del ritmo maratón</div>
          <button className="btn btn-ghost btn-sm" onClick={() => set('ritmos_maraton', RITMOS_MARATON_DEFECTO)}>Restablecer</button>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>Porcentaje de la velocidad de ritmo maratón (105 % = un 5 % más rápido).</div>
        {!p.ritmo_maraton_seg && <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>Rellena el ritmo maratón para ver los ritmos.</div>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {p.ritmos_maraton.map((pct, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${Number(pct) === 100 ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '6px 8px', background: Number(pct) === 100 ? 'var(--accent-light)' : 'var(--bg)' }}>
              <input type="number" value={pct} style={{ ...numInput, width: 60 }}
                onChange={e => { const v = e.target.value; setP(x => ({ ...x, ritmos_maraton: x.ritmos_maraton.map((q, j) => j === i ? v : q) })); setCambios(true) }} />
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>%</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, minWidth: 40 }}>{fmtRitmo(pctARitmo(Number(pct), p.ritmo_maraton_seg))}</span>
              <button onClick={() => { setP(x => ({ ...x, ritmos_maraton: x.ritmos_maraton.filter((_, j) => j !== i) })); setCambios(true) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 13, padding: 0 }}>×</button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => { setP(x => ({ ...x, ritmos_maraton: [...x.ritmos_maraton, 100] })); setCambios(true) }}>+ Añadir</button>
        </div>
      </div>

      {cambios && (
        <div style={{ position: 'sticky', bottom: 12, alignSelf: 'flex-end' }}>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando} style={{ boxShadow: '0 4px 14px rgba(0,0,0,.15)' }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
        </div>
      )}
    </div>
  )
}

function TablaZonas({ zonas, onCambio, rango }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {zonas.map((z, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '6px minmax(120px, 1fr) auto minmax(110px, auto)', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, background: 'var(--bg2)' }}>
          <span style={{ width: 6, height: 22, borderRadius: 3, background: COLORES_ZONA[i] || '#888' }} />
          <input value={z.nombre} onChange={e => onCambio(i, 'nombre', e.target.value)}
            style={{ border: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--text)', minWidth: 0 }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text3)' }}>
            <input type="number" value={z.min} onChange={e => onCambio(i, 'min', e.target.value)} style={numInput} />
            –
            <input type="number" value={z.max} onChange={e => onCambio(i, 'max', e.target.value)} style={numInput} />
            %
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, textAlign: 'right', color: 'var(--text)' }}>{rango(z)}</span>
        </div>
      ))}
    </div>
  )
}
