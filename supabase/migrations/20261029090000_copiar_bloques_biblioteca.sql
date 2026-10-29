-- Biblioteca en el editor de sesión: bloques y sesiones guardadas
--
-- 1) copiar_bloques: copia bloques (con ejercicios, grupos y fases de
--    resistencia) de una sesión a otra.
--    p_bloques = null → todos los bloques de la sesión origen.
--    p_reemplazar = true → antes se borran los bloques de la sesión destino y
--    se le pasan los datos de prescripción de la origen (título, objetivo,
--    duración, material, indicaciones…): la sesión «se transforma» en la otra.
--    No toca fecha, cliente, estado ni datos de ejecución.
-- 2) bloques_biblioteca.payload: el bloque guardado completo (mismo formato que
--    el portapapeles de bloques), para que también sirva con resistencia.

alter table public.bloques_biblioteca add column if not exists payload jsonb;
alter table public.bloques_biblioteca add column if not exists biblioteca text;

create or replace function public.copiar_bloques(
  p_origen     uuid,
  p_destino    uuid,
  p_bloques    uuid[]  default null,
  p_reemplazar boolean default false
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cols_bloque text;
  v_cols_ej     text;
  v_cols_fase   text;
  v_bloque      record;
  v_nuevo_bloque uuid;
  v_grupo       record;
  v_nuevo_grupo uuid;
  v_mapa_grupos  jsonb := '{}'::jsonb;
  v_mapa_bloques jsonb := '{}'::jsonb;
  v_orden       integer;
  v_n           integer := 0;
begin
  if not exists (select 1 from sesiones where id = p_origen) then raise exception 'Sesión origen no encontrada'; end if;
  if not exists (select 1 from sesiones where id = p_destino) then raise exception 'Sesión destino no encontrada'; end if;
  if p_origen = p_destino then raise exception 'Origen y destino son la misma sesión'; end if;

  if p_reemplazar then
    delete from sesion_fases where sesion_id = p_destino;
    delete from sesion_fase_grupos where sesion_id = p_destino;
    delete from sesion_ejercicios where bloque_id in (select id from sesion_bloques where sesion_id = p_destino);
    delete from sesion_bloques where sesion_id = p_destino;
    update sesiones d set
      titulo = o.titulo, objetivo = o.objetivo, duracion_min = o.duracion_min,
      material = o.material, indicaciones = o.indicaciones, icono = o.icono,
      tipo_actividad = o.tipo_actividad, tipos_actividad = o.tipos_actividad,
      km_objetivo = o.km_objetivo, rpe_objetivo = o.rpe_objetivo,
      zona1_2_objetivo = o.zona1_2_objetivo, zona3_4_objetivo = o.zona3_4_objetivo, zona5_objetivo = o.zona5_objetivo,
      tipo_editor = o.tipo_editor, funcion_sesion = o.funcion_sesion, capacidades = o.capacidades,
      objetivos_sesion = o.objetivos_sesion, biblioteca = o.biblioteca
    from sesiones o
    where d.id = p_destino and o.id = p_origen;
  end if;

  select coalesce(max(orden) + 1, 0) into v_orden from sesion_bloques where sesion_id = p_destino;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols_bloque
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_bloques' and column_name not in ('id', 'sesion_id', 'orden');

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols_ej
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_ejercicios' and column_name not in ('id', 'bloque_id', 'valores_reales');

  for v_bloque in
    select id from sesion_bloques
    where sesion_id = p_origen and (p_bloques is null or id = any(p_bloques))
    order by orden
  loop
    execute format(
      'insert into sesion_bloques (%1$s, sesion_id, orden)
       select %1$s, $2, $3 from sesion_bloques where id = $1
       returning id', v_cols_bloque)
    into v_nuevo_bloque
    using v_bloque.id, p_destino, v_orden;
    v_orden := v_orden + 1; v_n := v_n + 1;
    v_mapa_bloques := v_mapa_bloques || jsonb_build_object(v_bloque.id::text, v_nuevo_bloque);

    execute format(
      'insert into sesion_ejercicios (%1$s, bloque_id)
       select %1$s, $2 from sesion_ejercicios where bloque_id = $1
       order by orden', v_cols_ej)
    using v_bloque.id, v_nuevo_bloque;
  end loop;

  for v_grupo in
    select id, repeticiones, orden, bloque_id from sesion_fase_grupos
    where sesion_id = p_origen and v_mapa_bloques ? bloque_id::text
    order by orden
  loop
    insert into sesion_fase_grupos (sesion_id, repeticiones, orden, bloque_id)
    values (p_destino, v_grupo.repeticiones, v_grupo.orden, (v_mapa_bloques ->> v_grupo.bloque_id::text)::uuid)
    returning id into v_nuevo_grupo;
    v_mapa_grupos := v_mapa_grupos || jsonb_build_object(v_grupo.id::text, v_nuevo_grupo);
  end loop;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols_fase
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_fases' and column_name not in ('id', 'sesion_id', 'grupo_id', 'bloque_id');

  execute format(
    'insert into sesion_fases (%1$s, sesion_id, grupo_id, bloque_id)
     select %1$s, $2, ($3 ->> grupo_id::text)::uuid, ($4 ->> bloque_id::text)::uuid
     from sesion_fases where sesion_id = $1 and $4 ? bloque_id::text
     order by orden', v_cols_fase)
  using p_origen, p_destino, v_mapa_grupos, v_mapa_bloques;

  return v_n;
end;
$$;

revoke all on function public.copiar_bloques(uuid, uuid, uuid[], boolean) from public, anon;
grant execute on function public.copiar_bloques(uuid, uuid, uuid[], boolean) to authenticated;
