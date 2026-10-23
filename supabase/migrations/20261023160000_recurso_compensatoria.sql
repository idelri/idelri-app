-- Nueva categoría de recurso: sesión compensatoria (sustituye el partido /
-- entreno de campo cuando no se puede ir). Aplicada el 2026-10-23.
alter table public.sesiones drop constraint if exists sesiones_recurso_check;
alter table public.sesiones add constraint sesiones_recurso_check
  check (recurso is null or recurso in ('activacion', 'movilidad', 'protocolo', 'compensatoria'));
