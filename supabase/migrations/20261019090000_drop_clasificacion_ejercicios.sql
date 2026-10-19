-- Elimina la clasificación de ejercicios de la biblioteca (taxonomía).
-- Aplicada manualmente en Supabase el 2026-10-19, después de publicar el
-- código que dejó de usarla (PR #1).

alter table public.ejercicios_biblioteca
  drop column if exists complejo_articular,
  drop column if exists estructura_anatomica,
  drop column if exists familia,
  drop column if exists patron_movimiento,
  drop column if exists posicion_ejercicio,
  drop column if exists plano_movimiento,
  drop column if exists tipo_contraccion,
  drop column if exists material;
