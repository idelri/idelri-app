-- Editor de tareas de campo: cada tarea es un ejercicio (sesion_ejercicios)
-- de un bloque de Campo con su dibujo en `diagrama` (fondo, elementos en
-- metros y prescripción extra). También en la biblioteca.
-- Aplicada el 2026-10-24.
alter table public.sesion_ejercicios add column if not exists diagrama jsonb;
alter table public.ejercicios_biblioteca add column if not exists diagrama jsonb;

-- Vista pública: dibujos de las tareas de una sesión (por token de la sesión)
create or replace function public.get_diagramas_por_token_sesion(p_token text)
returns table(id uuid, diagrama jsonb)
language sql stable security definer set search_path = ''
as $$
  select e.id, e.diagrama
  from public.sesion_ejercicios e
  join public.sesion_bloques b on b.id = e.bloque_id
  join public.sesiones s on s.id = b.sesion_id
  where s.token_publico = p_token
    and e.diagrama is not null
    and (coalesce(s.publicada, true) or auth.uid() is not null)
$$;

grant execute on function public.get_diagramas_por_token_sesion(text) to anon, authenticated;
