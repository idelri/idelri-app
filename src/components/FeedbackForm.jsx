import { useState } from 'react'

const T = {
  ink: '#15171C', ink2: '#5A6270', ink3: '#929BA8',
  paper: '#EEF0F3', card: '#FFFFFF', line: '#E4E6EB',
  accent: '#E0481F',
}

const RPE_LABELS = ['Nada de esfuerzo', 'Muy, muy suave', 'Muy suave', 'Suave', 'Moderada', 'Algo exigente', 'Exigente', 'Muy exigente', 'Muy dura', 'Extremadamente dura', 'Máximo esfuerzo']
const TQR_ANCHORS = { 0: 'Nada recuperado/a', 3: 'Poco recuperado/a', 5: 'Moderadamente recuperado/a', 7: 'Bastante recuperado/a', 10: 'Totalmente recuperado/a' }
const SUENO_LABELS = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien']

// ── Estructura canónica ────────────────────────────────────────────────────────
// pain.hasPain   null = no respondido | false = No | true = Sí
// pain.entries   [{ id: uuid|null, intensity: 0-10, details: string }]
//   id=null → entry heredada de formato antiguo (sin UUID asignado)
//   id=uuid → entry nueva creada en este formulario (crypto.randomUUID())
//
// Campos legados preservados para leer feedbacks históricos pero nunca escritos
// de nuevo por este formulario.

function emptyFeedback() {
  return {
    completion: { status: null, reasons: [], partialDetails: '' },
    sueno:      { value: null },
    tqr:        { value: null },
    rpe:        { value: null },
    duration:   { minutes: null },
    pain: {
      hasPain: null,    // null | false | true
      entries: [],      // [{ id, intensity, details }]
    },
    technical:  { hasDifficulty: false, mainTechnicalDetails: '', mainTechnicalRelatedToIncompleteSession: false, additionalTechnicalDifficulty: false, additionalTechnicalDetails: '' },
    equipment:  { missingEquipment: false, details: '' },
    understanding: { unclearExercise: false, details: '' },
    postSessionFeeling: null,
    generalComments: '',
    submittedAt: null,
  }
}

// Hidrata cualquier formato histórico al nuevo formato con entries
function hydratePain(raw) {
  const p = raw || {}

  // Formato nuevo multi-entry
  if (Array.isArray(p.entries) && p.entries.length > 0) {
    return {
      hasPain: p.hasPain ?? true,
      entries: p.entries.map(e => ({
        id:        e.id   ?? null,
        intensity: e.intensity ?? null,
        details:   e.details?.trim() ?? '',
      })),
      // Conservar legacy por si coexisten
      mainPainDetails:                    p.mainPainDetails ?? '',
      mainPainRelatedToIncompleteSession: p.mainPainRelatedToIncompleteSession ?? false,
      additionalPain:                     p.additionalPain ?? false,
      additionalPainLevel:                p.additionalPainLevel ?? null,
      additionalPainDetails:              p.additionalPainDetails ?? '',
    }
  }

  // Formato nuevo single (hasPain + intensity + details, sin entries)
  if (typeof p.hasPain === 'boolean') {
    const entries = p.hasPain ? [{
      id:        null,    // heredado del formato anterior — sin UUID
      intensity: p.intensity ?? null,
      details:   p.details?.trim() || p.mainPainDetails?.trim() || '',
    }] : []
    return {
      hasPain: p.hasPain,
      entries,
      mainPainDetails:                    p.mainPainDetails ?? '',
      mainPainRelatedToIncompleteSession: p.mainPainRelatedToIncompleteSession ?? false,
      additionalPain:                     p.additionalPain ?? false,
      additionalPainLevel:                p.additionalPainLevel ?? null,
      additionalPainDetails:              p.additionalPainDetails ?? '',
    }
  }

  // Formato legado A: mainPainDetails
  if (p.mainPainDetails?.trim()) {
    return {
      hasPain: true,
      entries: [{ id: null, intensity: null, details: p.mainPainDetails.trim() }],
      mainPainDetails: p.mainPainDetails,
      mainPainRelatedToIncompleteSession: p.mainPainRelatedToIncompleteSession ?? false,
      additionalPain: p.additionalPain ?? false,
      additionalPainLevel: p.additionalPainLevel ?? null,
      additionalPainDetails: p.additionalPainDetails ?? '',
    }
  }

  // Formato legado B: additionalPain
  if (p.additionalPain === true) {
    return {
      hasPain: true,
      entries: [{ id: null, intensity: null, details: p.additionalPainDetails?.trim() || '' }],
      mainPainDetails: p.mainPainDetails ?? '',
      mainPainRelatedToIncompleteSession: p.mainPainRelatedToIncompleteSession ?? false,
      additionalPain: true,
      additionalPainLevel: p.additionalPainLevel ?? null,
      additionalPainDetails: p.additionalPainDetails ?? '',
    }
  }

  // Sin dolor o sin respuesta
  return {
    hasPain: typeof p.hasPain === 'boolean' ? p.hasPain : null,
    entries: [],
    mainPainDetails: p.mainPainDetails ?? '',
    mainPainRelatedToIncompleteSession: p.mainPainRelatedToIncompleteSession ?? false,
    additionalPain: p.additionalPain ?? false,
    additionalPainLevel: p.additionalPainLevel ?? null,
    additionalPainDetails: p.additionalPainDetails ?? '',
  }
}

function newEntry() {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { id, intensity: null, details: '' }
}

// ── Átomos UI (compactos) ─────────────────────────────────────────────────────
function Section({ children }) { return <div style={{ marginTop: 16 }}>{children}</div> }
function Q({ children, hint }) {
  return (
    <>
      <p style={{ fontSize: 13.5, fontWeight: 600, color: T.ink, margin: '0 0 7px', lineHeight: 1.35 }}>{children}</p>
      {hint && <p style={{ fontSize: 11.5, color: T.ink3, margin: '-4px 0 7px' }}>{hint}</p>}
    </>
  )
}
// Botón tipo "pastilla": varias opciones en la misma fila
function Chip({ active, onClick, children, color = T.accent }) {
  return (
    <button onClick={onClick} type="button" style={{
      padding: '7px 12px', borderRadius: 99, border: `1.5px solid ${active ? color : T.line}`,
      background: active ? color + '16' : T.card, color: active ? color : T.ink2,
      fontWeight: active ? 650 : 500, fontSize: 12.5, cursor: 'pointer', lineHeight: 1.2, whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}
function Chips({ children }) { return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{children}</div> }
// Pregunta Sí/No en una sola fila
function FilaSiNo({ pregunta, value, onSi, onNo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <p style={{ flex: '1 1 200px', fontSize: 13.5, fontWeight: 600, color: T.ink, margin: 0, lineHeight: 1.35 }}>{pregunta}</p>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <Chip active={value === false} onClick={onNo}>No</Chip>
        <Chip active={value === true} onClick={onSi}>Sí</Chip>
      </div>
    </div>
  )
}
// Color de 0 a 10: verde → ámbar → rojo (o al revés)
function colorEscala(n, max = 10, invertir = false) {
  const t = (invertir ? max - n : n) / max
  const hue = Math.round(140 - 135 * t)
  return `hsl(${hue} 65% 42%)`
}
// Escala numérica en una fila; debajo, el texto del valor elegido
function Escala({ value, onChange, min = 0, max = 10, etiquetas, invertir = false, extremos }) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)
  const etiqueta = value != null ? (etiquetas?.[value] ?? '') : null
  return (
    <div>
      <div style={{ display: 'flex', gap: 3 }}>
        {nums.map(n => {
          const sel = value === n, c = colorEscala(n - min, max - min, invertir)
          return (
            <button key={n} type="button" onClick={() => onChange(sel ? null : n)}
              style={{ flex: 1, minWidth: 0, height: 34, borderRadius: 7, border: `1.5px solid ${sel ? c : T.line}`, background: sel ? c : T.card, color: sel ? '#fff' : T.ink2, fontSize: 13, fontWeight: sel ? 800 : 500, cursor: 'pointer', padding: 0 }}>
              {n}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, fontSize: 11, color: T.ink3, minHeight: 15 }}>
        {etiqueta != null
          ? <span style={{ flex: 1, textAlign: 'center', fontWeight: 650, color: colorEscala(value - min, max - min, invertir) }}>{value}{etiqueta ? ` · ${etiqueta}` : ''}</span>
          : extremos ? <><span>{extremos[0]}</span><span>{extremos[1]}</span></> : null}
      </div>
    </div>
  )
}
function TextArea({ value, onChange, placeholder }) {
  return (
    <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
      style={{ width: '100%', minHeight: 48, padding: '8px 11px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.4 }} />
  )
}
const SUENO_EMOJI = ['😫', '😕', '😐', '🙂', '😴']
const TQR_ETIQUETAS = TQR_ANCHORS
const RPE_ETIQUETAS = Object.fromEntries(RPE_LABELS.map((l, n) => [n, l]))

// ── Componente principal ──────────────────────────────────────────────────────
export default function FeedbackForm({ onSubmit, submitting, initial, tipoEditor, submitLabel }) {
  const [fb, setFb] = useState(() => {
    const base = initial ? { ...emptyFeedback(), ...initial } : emptyFeedback()
    return { ...base, pain: hydratePain(base.pain) }
  })

  const set = (path, value) => setFb(f => {
    const next = JSON.parse(JSON.stringify(f))
    let o = next; const keys = path.split('.')
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]]
    o[keys[keys.length - 1]] = value
    return next
  })

  const status   = fb.completion.status
  const reasons  = fb.completion.reasons
  const has      = r => reasons.includes(r)

  function toggleReason(r) {
    const teniamos = has(r)
    set('completion.reasons', teniamos ? reasons.filter(x => x !== r) : [...reasons, r])
    // Cuando seleccionan "Molestia o dolor" como motivo y el bloque de
    // molestia aún no tiene respuesta → pre-seleccionar Sí
    if (r === 'Molestia o dolor' && !teniamos && fb.pain.hasPain === null) {
      setFb(f => ({ ...f, pain: { ...f.pain, hasPain: true, entries: f.pain.entries.length > 0 ? f.pain.entries : [newEntry()] } }))
    }
  }

  const motivosBC = [
    'Falta de tiempo', 'Fatiga acumulada', 'Molestia o dolor',
    'Dificultad técnica con algún ejercicio', 'No tenía material disponible',
    'No entendí algún ejercicio',
    status === 'partial' ? 'Preferí reducir la sesión' : 'Preferí no hacerla',
    'Otro motivo',
  ]

  // Incoherencia: motivo=dolor pero hasPain=false (explícitamente No)
  const hayIncoherencia = has('Molestia o dolor') && fb.pain.hasPain === false

  function puedeEnviar() {
    if (!status) return false
    if (status === 'completed' || status === 'partial') {
      if (fb.rpe.value == null) return false
      if (!fb.duration.minutes) return false
    }
    if (hayIncoherencia) return false
    // Si marcó hasPain=true: debe haber al menos una entry, y cada entry necesita intensidad + detalle
    if (fb.pain.hasPain === true) {
      if (fb.pain.entries.length === 0) return false
      for (const e of fb.pain.entries) {
        if (e.intensity == null) return false
        if (!e.details?.trim()) return false
      }
    }
    return true
  }

  // Qué falta por responder (texto bajo el botón)
  function faltaParaEnviar() {
    if ((status === 'completed' || status === 'partial') && fb.rpe.value == null) return 'Falta: cómo de dura te ha parecido'
    if ((status === 'completed' || status === 'partial') && !fb.duration.minutes) return 'Falta: cuánto tiempo te llevó'
    if (hayIncoherencia) return 'Revisa la pregunta de molestias'
    if (fb.pain.hasPain === true && fb.pain.entries.some(e => e.intensity == null)) return 'Falta: intensidad de la molestia'
    if (fb.pain.hasPain === true && fb.pain.entries.some(e => !e.details?.trim())) return 'Falta: describir la molestia'
    return ''
  }

  function enviar() {
    if (!puedeEnviar()) return
    onSubmit({ ...fb, submittedAt: new Date().toISOString() })
  }

  const setPain = fn => setFb(f => ({ ...f, pain: fn(f.pain) }))

  return (
    <div>
      {/* ── Antes de empezar ── */}
      <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 12, padding: '12px 12px 10px', marginBottom: 4 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d9488', margin: '0 0 10px' }}>Antes de empezar</p>

        <Q>¿Cómo has dormido esta noche?</Q>
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {SUENO_LABELS.map((label, i) => {
            const n = i + 1; const sel = fb.sueno.value === n
            return (
              <button key={n} type="button" onClick={() => set('sueno.value', sel ? null : n)}
                style={{ flex: 1, minWidth: 0, padding: '5px 2px 4px', borderRadius: 9, border: `1.5px solid ${sel ? '#0d9488' : '#c7f0e8'}`, background: sel ? '#0d9488' : '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <span style={{ fontSize: 14, lineHeight: 1.1 }}>{SUENO_EMOJI[i]}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: sel ? '#fff' : '#0d9488', lineHeight: 1.1 }}>{n}</span>
                <span style={{ fontSize: 9.5, color: sel ? '#fff' : '#0d9488', lineHeight: 1.15, whiteSpace: 'nowrap' }}>{label}</span>
              </button>
            )
          })}
        </div>

        <Q>¿Cómo de recuperado/a te notabas antes de empezar?</Q>
        <Escala value={fb.tqr.value} onChange={v => set('tqr.value', v)} etiquetas={TQR_ETIQUETAS} invertir extremos={['0 · Nada', 'Totalmente · 10']} />
      </div>

      {/* ── 1. ¿Completada? ── */}
      <Section>
        <Q>¿Has completado la sesión?</Q>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['completed', 'Completa', '#16a34a'], ['partial', 'Parcialmente', '#d97706'], ['missed', 'No la hice', T.accent]].map(([k, l, c]) => (
            <button key={k} type="button" onClick={() => set('completion.status', k)}
              style={{ flex: 1, padding: '9px 6px', borderRadius: 10, border: `1.5px solid ${status === k ? c : T.line}`, background: status === k ? c + '16' : T.card, color: status === k ? c : T.ink2, fontWeight: status === k ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
              {l}
            </button>
          ))}
        </div>
      </Section>

      {/* ── 2. Motivo (partial / missed) ── */}
      {(status === 'partial' || status === 'missed') && (
        <Section>
          <Q hint="Puedes marcar varios">{status === 'partial' ? '¿Por qué no la completaste?' : '¿Por qué no la hiciste?'}</Q>
          <Chips>{motivosBC.map(m => <Chip key={m} active={has(m)} onClick={() => toggleReason(m)}>{m}</Chip>)}</Chips>
        </Section>
      )}

      {status === 'partial' && has('Dificultad técnica con algún ejercicio') && (
        <Section>
          <Q>¿Qué ejercicio te impidió completarla y qué problema técnico tuviste?</Q>
          <TextArea value={fb.technical.mainTechnicalDetails} onChange={v => { set('technical.hasDifficulty', true); set('technical.mainTechnicalRelatedToIncompleteSession', true); set('technical.mainTechnicalDetails', v) }}
            placeholder="Ej: no conseguí hacer bien el hip hinge…" />
        </Section>
      )}
      {status === 'missed' && (has('Dificultad técnica con algún ejercicio') || has('No entendí algún ejercicio')) && (
        <Section>
          <Q>¿Qué ejercicio o parte te generó dudas?</Q>
          <TextArea value={fb.technical.mainTechnicalDetails} onChange={v => { set('technical.hasDifficulty', true); set('technical.mainTechnicalDetails', v) }}
            placeholder="Cuéntame qué te generó dudas…" />
        </Section>
      )}
      {has('No tenía material disponible') && (
        <Section>
          <Q>¿Qué material no tenías?</Q>
          <TextArea value={fb.equipment.details} onChange={v => { set('equipment.missingEquipment', true); set('equipment.details', v) }}
            placeholder="Ej: banda elástica, mancuerna, banco…" />
        </Section>
      )}
      {status === 'partial' && has('No entendí algún ejercicio') && (
        <Section>
          <Q>¿Qué ejercicio no entendiste?</Q>
          <TextArea value={fb.understanding.details} onChange={v => { set('understanding.unclearExercise', true); set('understanding.details', v) }}
            placeholder="Ej: no sabía cómo colocarme en el Pallof press…" />
        </Section>
      )}
      {has('Otro motivo') && status === 'missed' && (
        <Section>
          <Q>Cuéntame brevemente el motivo</Q>
          <TextArea value={fb.completion.partialDetails} onChange={v => set('completion.partialDetails', v)} placeholder="Cuéntamelo brevemente…" />
        </Section>
      )}
      {status === 'partial' && (
        <Section>
          <Q>¿Qué parte no hiciste?{has('Otro motivo') ? ' Cuéntame también el motivo.' : ''}</Q>
          <TextArea value={fb.completion.partialDetails} onChange={v => set('completion.partialDetails', v)}
            placeholder="Ej: no hice el último bloque, quité una serie…" />
        </Section>
      )}

      {/* ── 3. RPE + Duración ── */}
      {(status === 'completed' || status === 'partial') && (
        <>
          <Section>
            <Q>¿Cómo de dura te ha parecido en global?</Q>
            <Escala value={fb.rpe.value} onChange={v => set('rpe.value', v)} etiquetas={RPE_ETIQUETAS} extremos={['0 · Nada', 'Máximo · 10']} />
          </Section>
          <Section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <p style={{ flex: '1 1 180px', fontSize: 13.5, fontWeight: 600, color: T.ink, margin: 0 }}>¿Cuánto tiempo te llevó?</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" inputMode="numeric" min="1" max="240" value={fb.duration.minutes || ''} onChange={e => set('duration.minutes', e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="45"
                  style={{ width: 72, padding: '7px 10px', borderRadius: 9, border: `1.5px solid ${T.line}`, fontSize: 14, textAlign: 'center' }} />
                <span style={{ fontSize: 13, color: T.ink2 }}>min</span>
              </div>
            </div>
            {fb.duration.minutes > 150 && <p style={{ fontSize: 11.5, color: T.accent, margin: '6px 0 0' }}>Es un tiempo bastante alto, ¿confirmas que es correcto?</p>}
          </Section>
        </>
      )}

      {/* ── 4. Molestias ── */}
      {status && (
        <Section>
          <FilaSiNo
            pregunta={status === 'missed' ? '¿Tuviste alguna molestia o dolor ese día?' : '¿Alguna molestia o dolor durante la sesión?'}
            value={fb.pain.hasPain}
            onNo={() => set('pain.hasPain', false)}
            onSi={() => setPain(p => ({ ...p, hasPain: true, entries: p.entries.length > 0 ? p.entries : [newEntry()] }))} />

          {has('Molestia o dolor') && fb.pain.hasPain !== false && (
            <p style={{ fontSize: 11.5, color: '#92400e', background: '#fef3c7', borderRadius: 8, padding: '6px 9px', margin: '8px 0 0' }}>
              Indicaste que la molestia afectó a la sesión: cuéntame aquí qué notaste.
            </p>
          )}
          {hayIncoherencia && (
            <p style={{ fontSize: 11.5, color: T.accent, margin: '6px 0 0' }}>
              Marcaste la molestia como motivo: selecciona "Sí" o quita ese motivo.
            </p>
          )}

          {fb.pain.hasPain === true && (
            <div style={{ marginTop: 8 }}>
              {fb.pain.entries.map((entry, idx) => {
                const upd = campos => setPain(p => ({ ...p, entries: p.entries.map((e, i) => i === idx ? { ...e, ...campos } : e) }))
                return (
                  <div key={entry.id ?? `legacy-${idx}`} style={{ background: T.paper, borderRadius: 10, padding: '9px 10px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 650, color: T.ink }}>
                        {fb.pain.entries.length > 1 ? `Molestia ${idx + 1} · ` : ''}Intensidad
                      </span>
                      {fb.pain.entries.length > 1 && (
                        <button type="button" onClick={() => setPain(p => ({ ...p, entries: p.entries.filter((_, i) => i !== idx) }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: T.ink3, lineHeight: 1, padding: '0 4px' }}>×</button>
                      )}
                    </div>
                    <Escala value={entry.intensity} onChange={v => upd({ intensity: v })} extremos={['0 · Mínima', 'Máxima · 10']} />
                    <div style={{ marginTop: 6 }}>
                      <TextArea value={entry.details} onChange={v => upd({ details: v })} placeholder="¿Qué notaste y dónde? Ej: Aquiles derecho al correr…" />
                    </div>
                  </div>
                )
              })}
              <button type="button" onClick={() => setPain(p => ({ ...p, entries: [...p.entries, newEntry()] }))}
                style={{ padding: '5px 10px', borderRadius: 8, border: `1px dashed ${T.line}`, background: 'transparent', color: T.ink2, fontSize: 12, cursor: 'pointer' }}>
                + Otra molestia
              </button>
            </div>
          )}
        </Section>
      )}

      {/* ── 5. Dificultad ── */}
      {(status === 'completed' || status === 'partial') && (tipoEditor === 'carrera' || (!has('Dificultad técnica con algún ejercicio') && !has('No entendí algún ejercicio'))) && (
        <Section>
          <FilaSiNo
            pregunta={tipoEditor === 'carrera' ? '¿Alguna parte te costó completar según lo previsto?' : '¿Algún ejercicio difícil de hacer o de entender?'}
            value={fb.technical._answered ? fb.technical.additionalTechnicalDifficulty : null}
            onNo={() => { set('technical.additionalTechnicalDifficulty', false); set('technical._answered', true) }}
            onSi={() => { set('technical.additionalTechnicalDifficulty', true); set('technical.hasDifficulty', true); set('technical._answered', true) }} />
          {fb.technical.additionalTechnicalDifficulty === true && (
            <div style={{ marginTop: 7 }}>
              <TextArea value={fb.technical.additionalTechnicalDetails} onChange={v => set('technical.additionalTechnicalDetails', v)}
                placeholder={tipoEditor === 'carrera' ? '¿Qué parte y qué notaste? Ritmo, zona de FC, recuperaciones, fatiga…' : '¿Qué ejercicio y qué problema tuviste?'} />
            </div>
          )}
        </Section>
      )}

      {/* ── 6. Observaciones ── */}
      {status && (
        <Section>
          <Q>Algo más que quieras contarme <span style={{ fontWeight: 400, color: T.ink3 }}>(opcional)</span></Q>
          <TextArea value={fb.generalComments} onChange={v => set('generalComments', v)} placeholder="Lo que te ha gustado, lo que no, dudas…" />
        </Section>
      )}

      {/* ── Enviar ── */}
      {status && (
        <div style={{ marginTop: 14 }}>
          <button type="button" disabled={!puedeEnviar() || submitting} onClick={enviar}
            style={{ width: '100%', padding: '11px', borderRadius: 11, border: 'none', background: puedeEnviar() ? T.accent : T.line, color: puedeEnviar() ? '#fff' : T.ink3, fontWeight: 700, fontSize: 14, cursor: puedeEnviar() ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Guardando…' : (submitLabel || 'Enviar feedback')}
          </button>
          {!puedeEnviar() && <p style={{ fontSize: 11, color: T.ink3, textAlign: 'center', margin: '5px 0 0' }}>{faltaParaEnviar()}</p>}
        </div>
      )}
    </div>
  )
}
