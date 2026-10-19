-- copiar_sesion — copia completa de una sesión en una sola llamada
--
-- Sustituye a la copia hecha desde el navegador (src/lib/clonarSesion.js),
-- que necesitaba 15-20 peticiones en serie por sesión.
--
-- Copia la PRESCRIPCIÓN: sesión + bloques + ejercicios + grupos + fases.
-- No copia datos de ejecución del cliente origen ni relaciones propias suyas.
--
-- La copia nace:
--   estado = 'pendiente', lista = true (circulito verde)
--   publicada = la de la sesión original (si estaba oculta, la copia también)
-- p_pack_id: si se pasa, la copia queda dentro de ese pack (copia de packs).
--
-- SECURITY INVOKER: se ejecuta con los permisos (RLS) de quien la llama.
-- Solo la pueden llamar usuarios autenticados.

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
  v_mapa_grupos jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from sesiones where id = p_sesion_id) then
    raise exception 'Sesión origen no encontrada';
  end if;

  -- Columnas a copiar tal cual (se excluyen ids, datos de ejecución,
  -- relaciones del cliente origen y las que se fijan abajo)
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

  -- Bloques de fuerza + ejercicios
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

    execute format(
      'insert into sesion_ejercicios (%1$s, bloque_id)
       select %1$s, $2 from sesion_ejercicios where bloque_id = $1
       order by orden', v_cols_ej)
    using v_bloque.id, v_nuevo_bloque;
  end loop;

  -- Grupos de carrera (mapa id viejo → id nuevo)
  for v_grupo in
    select id, repeticiones, orden from sesion_fase_grupos
    where sesion_id = p_sesion_id order by orden
  loop
    insert into sesion_fase_grupos (sesion_id, repeticiones, orden)
    values (v_nueva_id, v_grupo.repeticiones, v_grupo.orden)
    returning id into v_nuevo_grupo;
    v_mapa_grupos := v_mapa_grupos || jsonb_build_object(v_grupo.id::text, v_nuevo_grupo);
  end loop;

  -- Fases de carrera
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols_fase
  from information_schema.columns
  where table_schema = 'public' and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
    and table_name = 'sesion_fases'
    and column_name not in ('id', 'sesion_id', 'grupo_id');

  execute format(
    'insert into sesion_fases (%1$s, sesion_id, grupo_id)
     select %1$s, $2, ($3 ->> grupo_id::text)::uuid
     from sesion_fases where sesion_id = $1
     order by orden', v_cols_fase)
  using p_sesion_id, v_nueva_id, v_mapa_grupos;

  return (select to_jsonb(s) from sesiones s where s.id = v_nueva_id);
end;
$$;

revoke all on function public.copiar_sesion(uuid, uuid, date, text, uuid) from public, anon;
grant execute on function public.copiar_sesion(uuid, uuid, date, text, uuid) to authenticated;
