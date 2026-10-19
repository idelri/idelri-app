/**
 * clonarSesion — copia completa de una sesión hacia un cliente/fecha.
 *
 * Toda la copia (sesión + bloques + ejercicios + grupos + fases) la hace la
 * función SQL `clonar_sesion` en una sola llamada. Ver
 * supabase/migrations/20261019100000_clonar_sesion_rpc.sql para el detalle
 * de qué se copia y qué no.
 *
 * La copia nace pendiente, lista (circulito verde) y visible para el cliente.
 *
 * @param {object} supabase   — cliente Supabase ya inicializado
 * @param {string} sesionId   — UUID de la sesión origen
 * @param {object} opts
 * @param {string} opts.clienteDestino  — UUID del cliente destino
 * @param {string} opts.fecha           — fecha de destino (yyyy-MM-dd) o null
 * @param {string} [opts.titulo]        — si se pasa, sobreescribe el título
 * @returns {{ data: nuevaSesion, error }}
 */
export async function clonarSesion(supabase, sesionId, { clienteDestino, fecha, titulo } = {}) {
  const { data, error } = await supabase.rpc('clonar_sesion', {
    p_sesion_id: sesionId,
    p_cliente_destino: clienteDestino,
    p_fecha: fecha ?? null,
    p_titulo: titulo ?? null,
  })
  if (error || !data) {
    return { data: null, error: error || new Error('Error copiando la sesión') }
  }
  return { data, error: null }
}
