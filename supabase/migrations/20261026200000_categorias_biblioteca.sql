-- Categorías de la biblioteca: grupos (selección única o múltiple) con sus etiquetas,
-- asignables a los ejercicios y usables como contenidos del Timeline.
create table if not exists public.categoria_grupos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  seleccion text not null default 'multiple' check (seleccion in ('unica', 'multiple')),
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.categoria_etiquetas (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.categoria_grupos(id) on delete cascade,
  nombre text not null,
  color text not null default '#6b7280',
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists categoria_etiquetas_grupo_idx on public.categoria_etiquetas (grupo_id, orden);
create table if not exists public.ejercicio_etiquetas (
  ejercicio_id uuid not null references public.ejercicios_biblioteca(id) on delete cascade,
  etiqueta_id uuid not null references public.categoria_etiquetas(id) on delete cascade,
  primary key (ejercicio_id, etiqueta_id)
);
create index if not exists ejercicio_etiquetas_etiqueta_idx on public.ejercicio_etiquetas (etiqueta_id);
alter table public.planificacion_contenidos add column if not exists etiqueta_id uuid references public.categoria_etiquetas(id) on delete set null;

alter table public.categoria_grupos enable row level security;
alter table public.categoria_etiquetas enable row level security;
alter table public.ejercicio_etiquetas enable row level security;
drop policy if exists "Auth categoria_grupos" on public.categoria_grupos;
create policy "Auth categoria_grupos" on public.categoria_grupos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Auth categoria_etiquetas" on public.categoria_etiquetas;
create policy "Auth categoria_etiquetas" on public.categoria_etiquetas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Auth ejercicio_etiquetas" on public.ejercicio_etiquetas;
create policy "Auth ejercicio_etiquetas" on public.ejercicio_etiquetas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Punto de partida (editable): los grupos "del preparador" de la app FCB
do $$
declare g uuid;
begin
  if not exists (select 1 from public.categoria_grupos) then
    insert into public.categoria_grupos (nombre, seleccion, orden) values ('Categoría', 'unica', 0) returning id into g;
    insert into public.categoria_etiquetas (grupo_id, nombre, color, orden) values
      (g,'Fuerza tren inferior','#2f6fdb',0),(g,'Fuerza tren superior','#3b82f6',1),(g,'Potencia y pliometría','#b4234a',2),(g,'Core','#a16207',3),
      (g,'Prevención','#0f766e',4),(g,'Propiocepción','#4d7c0f',5),(g,'Movilidad','#6d28d9',6),(g,'Recuperación','#64748b',7),
      (g,'Técnica individual','#2563eb',8),(g,'Táctica colectiva','#1e3a8a',9);
    insert into public.categoria_grupos (nombre, seleccion, orden) values ('Grupo muscular', 'multiple', 1) returning id into g;
    insert into public.categoria_etiquetas (grupo_id, nombre, color, orden) values
      (g,'Tren inferior','#64748b',0),(g,'Tren superior','#64748b',1),(g,'Core','#64748b',2),(g,'Cuerpo completo','#64748b',3),(g,'Cadera','#64748b',4),(g,'Tobillo y pie','#64748b',5);
    insert into public.categoria_grupos (nombre, seleccion, orden) values ('Objetivo', 'multiple', 2) returning id into g;
    insert into public.categoria_etiquetas (grupo_id, nombre, color, orden) values
      (g,'Fuerza máxima','#475569',0),(g,'Potencia','#475569',1),(g,'Hipertrofia','#475569',2),(g,'Prevención de lesiones','#475569',3),(g,'Estabilidad','#475569',4),
      (g,'Movilidad','#475569',5),(g,'Recuperación','#475569',6),(g,'Técnica','#475569',7),(g,'Táctica','#475569',8);
  end if;
end $$;
