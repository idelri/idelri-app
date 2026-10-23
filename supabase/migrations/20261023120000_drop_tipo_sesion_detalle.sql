-- Quita el "tipo de sesión" (optimizadora / coadyuvante).
-- Ejecutar DESPUÉS de publicar el código que dejó de usarlo.
alter table public.sesiones drop column if exists tipo_sesion_detalle;
