// Modalidad del servicio que se presta al cliente
export const MODALIDADES_SERVICIO = [
  { value: 'online',     label: 'Online' },
  { value: 'hibrido',    label: 'Híbrido' },
  { value: 'presencial', label: 'Presencial' },
]

export function labelModalidad(m) {
  return MODALIDADES_SERVICIO.find(x => x.value === m)?.label || m || null
}
