-- Elimina todo lo relacionado con pagos/cobros (ya no se gestionan en la app).
-- Ejecutar DESPUÉS de publicar el código que dejó de usarlo.

drop table if exists public.pagos;

alter table public.servicios
  drop column if exists tarifa_mensual,
  drop column if exists tarifa_sesion;
