-- Subetiquetas (un solo nivel): una etiqueta puede colgar de otra del mismo grupo.
alter table public.categoria_etiquetas add column if not exists padre_id uuid references public.categoria_etiquetas(id) on delete cascade;
create index if not exists categoria_etiquetas_padre_idx on public.categoria_etiquetas (padre_id);
