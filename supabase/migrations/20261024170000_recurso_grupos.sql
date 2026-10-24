-- Recursos con grupos propios por cliente (nombre e icono a elección de la
-- entrenadora) en lugar de las 4 categorías fijas para todos.
-- Aplicada el 2026-10-24.
create table if not exists public.recurso_grupos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  icono text,
  color text,
  descripcion text,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists recurso_grupos_cliente_idx on public.recurso_grupos (cliente_id, orden);
alter table public.recurso_grupos enable row level security;
drop policy if exists "Auth recurso_grupos" on public.recurso_grupos;
create policy "Auth recurso_grupos" on public.recurso_grupos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter table public.sesiones add column if not exists recurso_grupo_id uuid references public.recurso_grupos(id) on delete set null;

-- 'grupo' = recurso de un grupo propio (recurso_grupo_id)
alter table public.sesiones drop constraint if exists sesiones_recurso_check;
alter table public.sesiones add constraint sesiones_recurso_check
  check (recurso is null or recurso in ('activacion', 'movilidad', 'protocolo', 'compensatoria', 'grupo'));

-- Pasar los recursos que ya existen a grupos de su cliente (solo donde hay recursos)
with cats(key, nombre, icono, color, descripcion, orden) as (values
  ('activacion', 'Activaciones', '⚡', '#E29A2E', null, 0),
  ('movilidad', 'Movilidad', '🤸', '#2FAE76', null, 1),
  ('protocolo', 'Protocolos', '🩹', '#E24B4A', null, 2),
  ('compensatoria', 'Sesiones compensatorias', '🔄', '#7C5CD6', 'Para cuando no se pueda ir al partido o al entreno en el campo: sustituye esa sesión, salvando las distancias.', 3)
), usados as (
  select distinct s.cliente_id, s.recurso from public.sesiones s where s.recurso in (select key from cats) and s.recurso_grupo_id is null
), nuevos as (
  insert into public.recurso_grupos (cliente_id, nombre, icono, color, descripcion, orden)
  select u.cliente_id, c.nombre, c.icono, c.color, c.descripcion, c.orden from usados u join cats c on c.key = u.recurso
  returning id, cliente_id, nombre
)
update public.sesiones s set recurso_grupo_id = n.id
from nuevos n join cats c on c.nombre = n.nombre
where s.cliente_id = n.cliente_id and s.recurso = c.key and s.recurso_grupo_id is null;

-- Portal del cliente: grupos y recursos con su grupo (por token del cliente)
create or replace function public.get_recurso_grupos_por_token_cliente(p_token text)
returns table(id uuid, nombre text, icono text, color text, descripcion text, orden integer)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.nombre, g.icono, g.color, g.descripcion, g.orden
  from public.recurso_grupos g
  where g.cliente_id = (select c.id from public.clientes c where c.token_cliente = p_token limit 1)
  order by g.orden, g.created_at
$$;

create or replace function public.get_recursos_grupo_por_token_cliente(p_token text)
returns table(id uuid, recurso_grupo_id uuid)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.recurso_grupo_id
  from public.sesiones s
  where s.cliente_id = (select c.id from public.clientes c where c.token_cliente = p_token limit 1)
    and s.recurso is not null
    and coalesce(s.publicada, true)
$$;

grant execute on function public.get_recurso_grupos_por_token_cliente(text) to anon, authenticated;
grant execute on function public.get_recursos_grupo_por_token_cliente(text) to anon, authenticated;
