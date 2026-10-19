-- Elimina todo lo relacionado con pagos/cobros (ya no se gestionan en la app)
-- y la etiqueta de tipo de cliente (Estándar / Familia-Gratis).
-- Ejecutar DESPUÉS de publicar el código que dejó de usarlo.
-- Las tarifas quedaron copiadas como texto en servicios.condiciones.

drop table if exists public.pagos;

alter table public.servicios
  drop column if exists tarifa_mensual,
  drop column if exists tarifa_sesion;

alter table public.clientes
  drop column if exists tipo_cliente;
