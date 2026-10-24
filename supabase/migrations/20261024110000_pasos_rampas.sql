-- Rampas (aumento progresivo / reducción gradual) como tipo de paso.
-- objetivo_min = intensidad al empezar, objetivo_max = al terminar.
-- Aplicada el 2026-10-24.
alter table public.sesion_fases drop constraint if exists sesion_fases_tipo_paso_check;
alter table public.sesion_fases add constraint sesion_fases_tipo_paso_check
  check (tipo_paso is null or tipo_paso in ('calentamiento','activo','recuperacion','vuelta_calma','descanso','rampa_sube','rampa_baja'));
