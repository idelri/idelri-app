-- Tests de evaluación de fuerza (Vitruve VBT, Tindeq isometría) dentro de una valoración (controles).
create table if not exists public.evaluacion_tests (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.controles(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  tipo text not null check (tipo in ('vbt', 'iso')),
  nombre text not null,
  ejercicio text,
  fecha date,
  archivo text,                 -- ruta del original en storage (bucket evaluaciones)
  datos jsonb not null,         -- series/reps (VBT) o intentos con curva (iso)
  ajustes jsonb not null default '{}'::jsonb,
  resultados jsonb,             -- resumen calculado para historial (1RM, pico, RFD, asimetría…)
  notas text,                   -- solo entrenadora
  informe jsonb not null default '{}'::jsonb,  -- lo que verá el deportista
  visible_cliente boolean not null default false,
  orden integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists evaluacion_tests_control_idx on public.evaluacion_tests (control_id, orden);
create index if not exists evaluacion_tests_cliente_idx on public.evaluacion_tests (cliente_id, fecha);
alter table public.evaluacion_tests enable row level security;
drop policy if exists "Auth evaluacion_tests" on public.evaluacion_tests;
create policy "Auth evaluacion_tests" on public.evaluacion_tests for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Archivos originales (privado)
insert into storage.buckets (id, name, public) values ('evaluaciones', 'evaluaciones', false) on conflict (id) do nothing;
drop policy if exists "Auth evaluaciones lectura" on storage.objects;
create policy "Auth evaluaciones lectura" on storage.objects for select using (bucket_id = 'evaluaciones' and auth.role() = 'authenticated');
drop policy if exists "Auth evaluaciones escritura" on storage.objects;
create policy "Auth evaluaciones escritura" on storage.objects for insert with check (bucket_id = 'evaluaciones' and auth.role() = 'authenticated');
drop policy if exists "Auth evaluaciones borrado" on storage.objects;
create policy "Auth evaluaciones borrado" on storage.objects for delete using (bucket_id = 'evaluaciones' and auth.role() = 'authenticated');
