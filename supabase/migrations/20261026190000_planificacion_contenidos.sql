-- Contenidos de planificación por día (fila "Contenidos" del Timeline).
-- orientacion queda preparada para más adelante (p. ej. optimizador / coadyuvante); de momento null.
create table if not exists public.planificacion_contenidos (
  id uuid primary key default gen_random_uuid(),
  planificacion_id uuid not null references public.planificaciones(id) on delete cascade,
  fecha date not null,
  texto text not null,
  color text,
  orientacion text,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists planificacion_contenidos_plan_fecha_idx on public.planificacion_contenidos (planificacion_id, fecha);
alter table public.planificacion_contenidos enable row level security;
drop policy if exists "Auth planificacion_contenidos" on public.planificacion_contenidos;
create policy "Auth planificacion_contenidos" on public.planificacion_contenidos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
