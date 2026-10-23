-- Biblioteca de ejercicios por sesión y por bloque.
--   sesiones.biblioteca       → carpeta de la biblioteca de toda la sesión
--   sesion_bloques.biblioteca → la de un bloque concreto (null = la de la sesión)
-- copiar_sesion copia todas las columnas, así que las copias la conservan.
-- Aplicada el 2026-10-23.
alter table public.sesiones
  add column if not exists biblioteca text not null default 'fuerza'
  check (biblioteca in ('fuerza', 'campo', 'resistencia'));
alter table public.sesion_bloques
  add column if not exists biblioteca text
  check (biblioteca is null or biblioteca in ('fuerza', 'campo', 'resistencia'));
