import { supabase } from './supabase'

function toCSV(data) {
  if (!data || data.length === 0) return ''
  const headers = Object.keys(data[0]).join(',')
  const rows = data.map(row =>
    Object.values(row).map(v => {
      if (v === null || v === undefined) return ''
      const str = String(v)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }).join(',')
  )
  return [headers, ...rows].join('\n')
}

function downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportarTodo() {
  const fecha = new Date().toISOString().slice(0, 10)

  const [{ data: clientes }, { data: servicios }, { data: tareas }] =
    await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('servicios').select('*'),
      supabase.from('tareas').select('*, clientes(nombre)').order('created_at', { ascending: false }),
    ])

  // Aplanar los joins para el CSV
  const tareasFlat = (tareas || []).map(t => ({ ...t, cliente_nombre: t.clientes?.nombre, clientes: undefined }))

  downloadCSV(toCSV(clientes || []), `clientes_${fecha}.csv`)
  setTimeout(() => downloadCSV(toCSV(servicios || []), `servicios_${fecha}.csv`), 300)
  setTimeout(() => downloadCSV(toCSV(tareasFlat), `tareas_${fecha}.csv`), 600)
}
