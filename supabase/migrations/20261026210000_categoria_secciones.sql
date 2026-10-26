-- Grupos generales de categorías (p. ej. Fuerza, Resistencia) que agrupan los grupos de categorías.
create table if not exists public.categoria_secciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  color text not null default '#2d6a4f',
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.categoria_grupos add column if not exists seccion_id uuid references public.categoria_secciones(id) on delete set null;
alter table public.categoria_grupos add column if not exists color text;
create index if not exists categoria_grupos_seccion_idx on public.categoria_grupos (seccion_id, orden);

alter table public.categoria_secciones enable row level security;
drop policy if exists "Auth categoria_secciones" on public.categoria_secciones;
create policy "Auth categoria_secciones" on public.categoria_secciones for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Punto de partida editable: Fuerza (con los grupos actuales) y Resistencia
do $$
declare s uuid;
begin
  if not exists (select 1 from public.categoria_secciones) then
    insert into public.categoria_secciones (nombre, color, orden) values ('Fuerza', '#2f6fdb', 0) returning id into s;
    update public.categoria_grupos set seccion_id = s where seccion_id is null;
    insert into public.categoria_secciones (nombre, color, orden) values ('Resistencia', '#c2410c', 1);
  end if;
end $$;
