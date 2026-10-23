-- Editor de sesiones unificado: la resistencia pasa a ser un tipo de bloque.
--
-- Antes: una sesión era "de fuerza" (bloques + ejercicios) o "de carrera"
-- (fases + grupos de repetición colgando de la sesión), según tipo_editor.
-- Ahora: cualquier sesión tiene bloques; un bloque de biblioteca
-- 'resistencia' contiene fases y grupos (sesion_fases / sesion_fase_grupos
-- con bloque_id).
--
-- Migración de datos:
--   · Las sesiones "de carrera" pasan a biblioteca 'resistencia'. Sus bloques
--     de ejercicios que ya existían se marcan como 'fuerza'.
--   · Toda sesión con fases sueltas recibe un bloque "Resistencia" (primero)
--     y sus fases y grupos pasan a ese bloque.
--   · tipo_editor se conserva (lo usa el cuestionario de feedback), pero el
--     editor ya no lo usa para decidir qué mostrar.

alter table public.sesion_fases
  add column if not exists bloque_id uuid references public.sesion_bloques(id) on delete cascade;
alter table public.sesion_fase_grupos
  add column if not exists bloque_id uuid references public.sesion_bloques(id) on delete cascade;
create index if not exists sesion_fases_bloque_idx on public.sesion_fases (bloque_id);
create index if not exists sesion_fase_grupos_bloque_idx on public.sesion_fase_grupos (bloque_id);

-- 1) Sesiones de carrera → biblioteca resistencia; sus bloques de ejercicios, fuerza
update public.sesion_bloques b set biblioteca = 'fuerza'
from public.sesiones s
where s.id = b.sesion_id and s.tipo_editor = 'carrera' and b.biblioteca is null;

update public.sesiones set biblioteca = 'resistencia' where tipo_editor = 'carrera';

-- 2) Fases sueltas → bloque "Resistencia"
do $$
declare
  s  record;
  nb uuid;
begin
  for s in
    select ses.id from public.sesiones ses
    where exists (select 1 from public.sesion_fases f where f.sesion_id = ses.id and f.bloque_id is null)
       or exists (select 1 from public.sesion_fase_grupos g where g.sesion_id = ses.id and g.bloque_id is null)
  loop
    update public.sesion_bloques set orden = coalesce(orden, 0) + 1 where sesion_id = s.id;
    insert into public.sesion_bloques (sesion_id, nombre, color, nota, orden, metodo, biblioteca)
    values (s.id, 'Resistencia', '#4C82E8', '', 0, 'individual', 'resistencia')
    returning id into nb;
    update public.sesion_fases       set bloque_id = nb where sesion_id = s.id and bloque_id is null;
    update public.sesion_fase_grupos set bloque_id = nb where sesion_id = s.id and bloque_id is null;
  end loop;
end $$;

-- 3) copiar_sesion: las fases y grupos van a su bloque copiado
create or replace function public.copiar_sesion(
  p_sesion_id       uuid,
  p_cliente_destino uuid,
  p_fecha           date default null,
  p_titulo          text default null,
  p_pack_id         uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cols_sesion text;
  v_cols_bloque text;
  v_cols_ej     text;
  v_cols_fase   text;
  v_nueva_id    uuid;
  v_bloque      record;
  v_nuevo_bloque uuid;
  v_grupo       record;
  v_nuevo_grupo uuid;
  v_mapa_grupos  jsonb := '{}'::jsonb;
  v_mapa_bloques jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from sesiones where id = p_sesion_id) then
    raise exception 'Sesión origen no encontrada';
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols_sesion
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesiones'
    and column_name not in (
      'id', 'token_publico', 'created_at', 'orden',
      'pack_id', 'sesion_original_id',
      'km_real', 'duracion_real', 'rpe_real',
      'zona1_2_real', 'zona3_4_real', 'zona5_real',
      'completada_el', 'estado_manual',
      'comentario_entrenadora', 'comentario_entrenadora_at', 'comentario_visto_at',
      'cliente_id', 'fecha', 'titulo', 'estado', 'lista'
    );

  execute format(
    'insert into sesiones (%1$s, cliente_id, fecha, titulo, estado, lista, pack_id)
     select %1$s, $2, $3, coalesce($4, titulo), ''pendiente'', true, $5
     from sesiones where id = $1
     returning id', v_cols_sesion)
  into v_nueva_id
  using p_sesion_id, p_cliente_destino, p_fecha, p_titulo, p_pack_id;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols_bloque
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_bloques'
    and column_name not in ('id', 'sesion_id');

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols_ej
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_ejercicios'
    and column_name not in ('id', 'bloque_id', 'valores_reales');

  for v_bloque in
    select id from sesion_bloques where sesion_id = p_sesion_id order by orden
  loop
    execute format(
      'insert into sesion_bloques (%1$s, sesion_id)
       select %1$s, $2 from sesion_bloques where id = $1
       returning id', v_cols_bloque)
    into v_nuevo_bloque
    using v_bloque.id, v_nueva_id;
    v_mapa_bloques := v_mapa_bloques || jsonb_build_object(v_bloque.id::text, v_nuevo_bloque);

    execute format(
      'insert into sesion_ejercicios (%1$s, bloque_id)
       select %1$s, $2 from sesion_ejercicios where bloque_id = $1
       order by orden', v_cols_ej)
    using v_bloque.id, v_nuevo_bloque;
  end loop;

  for v_grupo in
    select id, repeticiones, orden, bloque_id from sesion_fase_grupos
    where sesion_id = p_sesion_id order by orden
  loop
    insert into sesion_fase_grupos (sesion_id, repeticiones, orden, bloque_id)
    values (v_nueva_id, v_grupo.repeticiones, v_grupo.orden, (v_mapa_bloques ->> v_grupo.bloque_id::text)::uuid)
    returning id into v_nuevo_grupo;
    v_mapa_grupos := v_mapa_grupos || jsonb_build_object(v_grupo.id::text, v_nuevo_grupo);
  end loop;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols_fase
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_fases'
    and column_name not in ('id', 'sesion_id', 'grupo_id', 'bloque_id');

  execute format(
    'insert into sesion_fases (%1$s, sesion_id, grupo_id, bloque_id)
     select %1$s, $2, ($3 ->> grupo_id::text)::uuid, ($4 ->> bloque_id::text)::uuid
     from sesion_fases where sesion_id = $1
     order by orden', v_cols_fase)
  using p_sesion_id, v_nueva_id, v_mapa_grupos, v_mapa_bloques;

  return (select to_jsonb(s) from sesiones s where s.id = v_nueva_id);
end;
$$;

revoke all on function public.copiar_sesion(uuid, uuid, date, text, uuid) from public, anon;
grant execute on function public.copiar_sesion(uuid, uuid, date, text, uuid) to authenticated;

-- 4) Vista pública: fases y grupos con su bloque
create or replace function public.get_fases_bloque_por_token_sesion(p_token text)
returns table(id uuid, bloque_id uuid, grupo_id uuid, nombre text, descripcion text, orden integer, volumen_min integer, volumen_km numeric, fc_zona integer, ritmo_inicio text, ritmo_fin text, rpe integer, pendiente_cualitativa text, pendiente_pct_min numeric, pendiente_pct_max numeric)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.bloque_id, f.grupo_id, f.nombre, f.descripcion, f.orden, f.volumen_min, f.volumen_km,
         f.fc_zona, f.ritmo_inicio, f.ritmo_fin, f.rpe,
         f.pendiente_cualitativa, f.pendiente_pct_min, f.pendiente_pct_max
  from public.sesion_fases f
  join public.sesiones s on s.id = f.sesion_id
  where s.token_publico = p_token
    and (coalesce(s.publicada, true) or auth.uid() is not null)
  order by f.orden
$$;

create or replace function public.get_grupos_bloque_por_token_sesion(p_token text)
returns table(id uuid, bloque_id uuid, repeticiones integer, orden integer)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.bloque_id, g.repeticiones, g.orden
  from public.sesion_fase_grupos g
  join public.sesiones s on s.id = g.sesion_id
  where s.token_publico = p_token
    and (coalesce(s.publicada, true) or auth.uid() is not null)
  order by g.orden
$$;

grant execute on function public.get_fases_bloque_por_token_sesion(text) to anon, authenticated;
grant execute on function public.get_grupos_bloque_por_token_sesion(text) to anon, authenticated;
