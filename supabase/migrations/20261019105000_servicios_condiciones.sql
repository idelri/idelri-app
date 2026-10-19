-- Servicio y tarifa en texto libre (solo visible para la entrenadora).
-- Aplicada el 2026-10-19. Conserva como texto las tarifas que había.
alter table public.servicios add column if not exists condiciones text;

comment on column public.servicios.condiciones is
  'Descripción libre del servicio y lo que se cobra (solo visible para la entrenadora).';

update public.servicios
set condiciones = concat_ws(' · ',
  case when coalesce(tarifa_mensual, 0) > 0 then 'Tarifa mensual: ' || trim(to_char(tarifa_mensual, 'FM999999990.##')) || ' €' end,
  case when tarifa_sesion is not null and tarifa_sesion > 0 then 'Tarifa sesión: ' || trim(to_char(tarifa_sesion, 'FM999999990.##')) || ' €' end
)
where condiciones is null
  and (coalesce(tarifa_mensual, 0) > 0 or coalesce(tarifa_sesion, 0) > 0);
