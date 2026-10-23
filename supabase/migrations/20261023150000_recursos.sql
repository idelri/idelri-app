-- Recursos: sesiones sin fecha que el cliente tiene siempre a mano en su
-- portal (activaciones, movilidad, protocolos individuales...).
--
-- sesiones.recurso = categoría del recurso; null = sesión normal.

alter table public.sesiones
  add column if not exists recurso text
  check (recurso is null or recurso in ('activacion', 'movilidad', 'protocolo'));

create index if not exists sesiones_recurso_idx on public.sesiones (cliente_id) where recurso is not null;

-- Recursos visibles de un cliente, por su token de portal.
create or replace function public.get_recursos_por_token_cliente(p_token text)
returns table(id uuid, titulo text, icono text, recurso text, objetivo text, duracion_min integer, token_publico text, orden integer)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.titulo, s.icono, s.recurso, s.objetivo, s.duracion_min, s.token_publico, s.orden
  from public.sesiones s
  where s.cliente_id = (select c.id from public.clientes c where c.token_cliente = p_token limit 1)
    and s.recurso is not null
    and coalesce(s.publicada, true)
  order by s.orden, s.created_at
$$;

grant execute on function public.get_recursos_por_token_cliente(text) to anon, authenticated;
