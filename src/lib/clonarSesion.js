/**
 * clonarSesion — copia completa de una sesión hacia un cliente/fecha.
 *
 * Toda la copia (sesión + bloques + ejercicios + grupos + fases) la hace la
 * función SQL `copiar_sesion` en una sola llamada. Ver
 * supabase/migrations/20261019100000_copiar_sesion_rpc.sql para el detalle
 * de qué se copia y qué no.
 *
 * La copia nace pendiente y lista (circulito verde). Si la original estaba
 * oculta al cliente, la copia también.
 *
 * @param {object} supabase   — cliente Supabase ya inicializado
 * @param {string} sesionId   — UUID de la sesión origen
 * @param {object} opts
 * @param {string} opts.clienteDestino  — UUID del cliente destino
 * @param {string} opts.fecha           — fecha de destino (yyyy-MM-dd) o null
 * @param {string} [opts.titulo]        — si se pasa, sobreescribe el título
 * @param {string} [opts.packId]        — si se pasa, la copia queda dentro de ese pack
 * @returns {{ data: nuevaSesion, error }}
 */
export async function clonarSesion(supabase, sesionId, { clienteDestino, fecha, titulo, packId } = {}) {
  const { data, error } = await supabase.rpc('copiar_sesion', {
    p_sesion_id: sesionId,
    p_cliente_destino: clienteDestino,
    p_fecha: fecha ?? null,
    p_titulo: titulo ?? null,
    p_pack_id: packId ?? null,
  })
  if (error || !data) {
    return { data: null, error: error || new Error('Error copiando la sesión') }
  }
  return { data, error: null }
}
