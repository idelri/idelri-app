-- Comentarios del cliente añadidos a mano por la entrenadora (p. ej. lo que le cuenta por WhatsApp).
-- Los comentarios del feedback no se copian aquí: se leen de sesion_feedback.
-- Solo para la entrenadora (authenticated); no se exponen en rutas públicas.
create table if not exists public.comentarios_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null,
  texto text not null,
  etiqueta text not null default 'general' check (etiqueta in ('general', 'molestia', 'no_completada', 'parcial', 'tecnica', 'material', 'comprension')),
  created_at timestamptz not null default now()
);
create index if not exists comentarios_cliente_cliente_fecha on public.comentarios_cliente (cliente_id, fecha);
alter table public.comentarios_cliente enable row level security;
drop policy if exists "Auth comentarios_cliente" on public.comentarios_cliente;
create policy "Auth comentarios_cliente" on public.comentarios_cliente for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
