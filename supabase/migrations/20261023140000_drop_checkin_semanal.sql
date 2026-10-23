-- Elimina el check-in semanal (ya no se usa en la app).
-- Ejecutar a mano en Supabase → SQL Editor DESPUÉS de publicar el código
-- que dejó de usarlo (PR "Portal: sesiones ocultas, permisos, calendario").

drop function if exists public.get_checkins_por_token_cliente(text);
drop function if exists public.get_estado_checkin_por_token_cliente(text, date);
drop function if exists public.insertar_checkin_por_token_cliente(text, date, integer, integer, text, text, jsonb, text, text, text, text, text);
drop table if exists public.checkin_semanal;
