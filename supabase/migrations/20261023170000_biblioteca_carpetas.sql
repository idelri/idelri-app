-- Biblioteca de ejercicios: carpetas.
--   fuerza      → "Ejercicios fuerza" (todos los que ya existían)
--   campo       → "Ejercicios/Tareas de campo"
--   resistencia → "Ejercicios/Bloques de resistencia"
-- Aplicada el 2026-10-23.
alter table public.ejercicios_biblioteca
  add column if not exists carpeta text not null default 'fuerza'
  check (carpeta in ('fuerza', 'campo', 'resistencia'));
