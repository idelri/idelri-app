-- Portal del cliente: sesiones ocultas y permisos por cliente.
--
-- 1) Las sesiones con publicada = false ya no llegan nunca al cliente
--    (portal, packs ni enlace de sesión). Irene, con sesión iniciada en la
--    app, sí puede abrir el enlace de una sesión oculta para previsualizarla.
--
-- 2) Dos permisos nuevos en clientes.portal_config:
--      registrar_manual  → el cliente puede registrar sesiones propias
--      feedback          → el cliente puede marcar sesiones como hechas y
--                          enviar feedback
--    Si la clave no existe vale true (los clientes actuales no cambian).
--    Se comprueban en el servidor, no solo en la pantalla.
--
-- Solo create or replace: mismas firmas y mismos tipos de retorno.

-- ── Helpers ────────────────────────────────────────────────────────────────

create or replace function public._portal_permite(p_cliente_id uuid, p_clave text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((c.portal_config ->> p_clave)::boolean, true)
  from public.clientes c
  where c.id = p_cliente_id
$$;

revoke all on function public._portal_permite(uuid, text) from public, anon, authenticated;

-- Para SesionPublica: qué puede hacer el cliente en esta sesión.
create or replace function public.get_permisos_por_token_sesion(p_token text)
returns table(feedback boolean, registrar_manual boolean)
language sql stable security definer set search_path = ''
as $$
  select coalesce((c.portal_config ->> 'feedback')::boolean, true),
         coalesce((c.portal_config ->> 'registrar_manual')::boolean, true)
  from public.sesiones s
  join public.clientes c on c.id = s.cliente_id
  where s.token_publico = p_token
    and (coalesce(s.publicada, true) or auth.uid() is not null)
  limit 1
$$;

grant execute on function public.get_permisos_por_token_sesion(text) to anon, authenticated;

-- ── Lecturas: ocultar sesiones no publicadas ───────────────────────────────

create or replace function public.get_sesiones_por_token_cliente(p_token text)
returns table(id uuid, fecha date, titulo text, tipo_sesion text, icono text, tipos_actividad text[], tipo_actividad text, estado text, estado_manual text, completada_el date, token_publico text, feedback_submitted_at timestamp with time zone, orden integer, comentario_entrenadora text, comentario_entrenadora_at timestamp with time zone, comentario_visto_at timestamp with time zone)
language sql security definer set search_path = public
as $$
  SELECT s.id, s.fecha, s.titulo, s.tipo_sesion, s.icono,
         s.tipos_actividad, s.tipo_actividad, s.estado, s.estado_manual,
         s.completada_el, s.token_publico,
         sf.submitted_at AS feedback_submitted_at,
         s.orden,
         s.comentario_entrenadora, s.comentario_entrenadora_at,
         s.comentario_visto_at
  FROM   public.sesiones s
  LEFT   JOIN public.sesion_feedback sf ON sf.sesion_id = s.id
  WHERE  s.cliente_id = (
    SELECT id FROM public.clientes WHERE token_cliente = p_token LIMIT 1
  )
    AND  s.fecha IS NOT NULL
    AND  coalesce(s.publicada, true)
  ORDER  BY s.fecha, s.orden;
$$;

create or replace function public.get_sesion_por_token(p_token text)
returns table(titulo text, fecha date, objetivo text, duracion_min integer, material text, indicaciones text, tipo_sesion text, tipo_editor text, con_feedback boolean, completada_el date, estado text, icono text, token_publico text, comentario_entrenadora text, comentario_entrenadora_at timestamp with time zone)
language sql security definer set search_path = public
as $$
  SELECT titulo, fecha, objetivo, duracion_min, material, indicaciones,
         tipo_sesion, tipo_editor, con_feedback, completada_el, estado,
         icono, token_publico,
         comentario_entrenadora, comentario_entrenadora_at
  FROM   public.sesiones
  WHERE  token_publico = p_token
    AND  (coalesce(publicada, true) OR auth.uid() IS NOT NULL)
  LIMIT  1;
$$;

create or replace function public.get_sesiones_packs_por_token_cliente(p_token text)
returns table(id uuid, titulo text, tipo_sesion text, icono text, tipos_actividad text[], tipo_actividad text, orden integer, pack_id uuid, token_publico text, objetivo text, duracion_min integer, completada_el date, estado text)
language sql stable security definer set search_path = ''
as $$
  SELECT s.id, s.titulo, s.tipo_sesion, s.icono,
         s.tipos_actividad, s.tipo_actividad, s.orden, s.pack_id,
         s.token_publico, s.objetivo, s.duracion_min,
         s.completada_el, s.estado
  FROM   public.sesiones s
  WHERE  s.pack_id IN (
    SELECT pk.id
    FROM   public.packs_flexibles pk
    WHERE  pk.cliente_id = (
      SELECT id FROM public.clientes WHERE token_cliente = p_token LIMIT 1
    )
  )
    AND  coalesce(s.publicada, true)
  ORDER  BY s.orden;
$$;

create or replace function public.get_sesiones_por_token_pack(p_token text)
returns table(id uuid, titulo text, icono text, tipos_actividad text[], tipo_actividad text, token_publico text, objetivo text, duracion_min integer, completada_el date, estado text)
language sql stable security definer set search_path = ''
as $$
  SELECT s.id, s.titulo, s.icono, s.tipos_actividad, s.tipo_actividad,
         s.token_publico, s.objetivo, s.duracion_min,
         s.completada_el, s.estado
  FROM   public.sesiones s
  WHERE  s.pack_id = (
    SELECT id FROM public.packs_flexibles WHERE token_publico = p_token LIMIT 1
  )
    AND  coalesce(s.publicada, true)
  ORDER  BY s.orden;
$$;

create or replace function public.get_bloques_por_token_sesion(p_token text)
returns table(id uuid, nombre text, color text, nota text, orden integer, metodo text, descripcion_metodo text, vueltas integer, descanso_seg integer, duracion_min integer, variables_default text[], descanso_ejercicios_seg integer)
language sql stable security definer set search_path = ''
as $$
  SELECT b.id, b.nombre, b.color, b.nota, b.orden,
         b.metodo, b.descripcion_metodo, b.vueltas,
         b.descanso_seg, b.duracion_min, b.variables_default,
         b.descanso_ejercicios_seg
  FROM   public.sesion_bloques b
  JOIN   public.sesiones       s ON s.id = b.sesion_id
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL)
  ORDER  BY b.orden;
$$;

create or replace function public.get_ejercicios_por_token_sesion(p_token text)
returns table(id uuid, bloque_id uuid, nombre text, series text, reps text, rpe text, notas text, media_tipo text, media_url text, video_url text, orden integer, peso text, duracion text, distancia text, altura text, descanso text, ejecucion_tipo text, ejecucion_texto text, variables_activas text[], peso_der text, peso_izq text, reps_por_lado boolean, valores_reales jsonb)
language sql stable security definer set search_path = ''
as $$
  SELECT e.id, e.bloque_id, e.nombre, e.series, e.reps, e.rpe, e.notas,
         e.media_tipo, e.media_url, e.video_url, e.orden,
         e.peso, e.duracion, e.distancia, e.altura, e.descanso,
         e.ejecucion_tipo, e.ejecucion_texto, e.variables_activas,
         e.peso_der, e.peso_izq, e.reps_por_lado, e.valores_reales
  FROM   public.sesion_ejercicios e
  JOIN   public.sesion_bloques    b ON b.id = e.bloque_id
  JOIN   public.sesiones          s ON s.id = b.sesion_id
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL)
  ORDER  BY e.orden;
$$;

create or replace function public.get_fases_por_token_sesion(p_token text)
returns table(id uuid, nombre text, descripcion text, orden integer, volumen_min integer, volumen_km numeric, fc_zona integer, ritmo_inicio text, ritmo_fin text, rpe integer, grupo_id uuid, pendiente_cualitativa text, pendiente_pct_min numeric, pendiente_pct_max numeric)
language sql stable security definer set search_path = ''
as $$
  SELECT f.id, f.nombre, f.descripcion, f.orden, f.volumen_min, f.volumen_km,
         f.fc_zona, f.ritmo_inicio, f.ritmo_fin, f.rpe, f.grupo_id,
         f.pendiente_cualitativa, f.pendiente_pct_min, f.pendiente_pct_max
  FROM   public.sesion_fases f
  JOIN   public.sesiones     s ON s.id = f.sesion_id
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL)
  ORDER  BY f.orden;
$$;

create or replace function public.get_grupos_fases_por_token_sesion(p_token text)
returns table(id uuid, repeticiones integer, orden integer)
language sql stable security definer set search_path = ''
as $$
  SELECT g.id, g.repeticiones, g.orden
  FROM   public.sesion_fase_grupos g
  JOIN   public.sesiones           s ON s.id = g.sesion_id
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL)
  ORDER  BY g.orden;
$$;

create or replace function public.get_feedback_por_token_sesion(p_token text)
returns table(id uuid, data jsonb, submitted_at timestamp with time zone, editado boolean)
language sql stable security definer set search_path = ''
as $$
  SELECT sf.id, sf.data, sf.submitted_at, sf.editado
  FROM   public.sesion_feedback sf
  JOIN   public.sesiones        s ON s.id = sf.sesion_id
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL)
  LIMIT  1;
$$;

create or replace function public.get_nombre_por_token_sesion(p_token text)
returns table(nombre text)
language sql stable security definer set search_path = public
as $$
  SELECT c.nombre
  FROM   public.sesiones  s
  JOIN   public.clientes  c ON c.id = s.cliente_id
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL)
  LIMIT  1;
$$;

create or replace function public.actualizar_nota_bloque(p_token text, p_bloque_id uuid, p_nota text)
returns void
language sql security definer set search_path = ''
as $$
  UPDATE public.sesion_bloques b
  SET    nota = p_nota
  FROM   public.sesiones s
  WHERE  b.id       = p_bloque_id
    AND  b.sesion_id = s.id
    AND  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL);
$$;

-- ── Escrituras: respetar sesiones ocultas y permisos ───────────────────────

create or replace function public.registrar_sesion_manual_cliente(p_token text, p_titulo text, p_fecha date, p_duracion_min integer, p_icono text, p_estado_manual text, p_descripcion text DEFAULT NULL, p_feedback_data jsonb DEFAULT NULL)
returns jsonb
language plpgsql security definer set search_path = public
as $$
DECLARE
  v_cliente_id uuid;
  v_sesion_id  uuid;
  v_estado_bd  text;
BEGIN
  SELECT id INTO v_cliente_id
  FROM clientes
  WHERE token_cliente = p_token
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    RETURN jsonb_build_object('error', 'token_invalido');
  END IF;

  IF NOT public._portal_permite(v_cliente_id, 'registrar_manual') THEN
    RETURN jsonb_build_object('error', 'no_permitido');
  END IF;

  v_estado_bd := CASE p_estado_manual
    WHEN 'completed' THEN 'completada'
    WHEN 'partial'   THEN 'parcial'
    WHEN 'missed'    THEN 'no_realizada'
    ELSE 'pendiente'
  END;

  INSERT INTO sesiones (
    cliente_id, titulo, fecha, duracion_min,
    icono, tipo_sesion, estado_manual, lista, estado, objetivo
  )
  VALUES (
    v_cliente_id,
    p_titulo,
    p_fecha,
    p_duracion_min,
    p_icono,
    'manual_cliente',
    CASE WHEN p_estado_manual IN ('completed','partial','missed') THEN p_estado_manual ELSE NULL END,
    false,
    v_estado_bd,
    p_descripcion
  )
  RETURNING id INTO v_sesion_id;

  IF p_feedback_data IS NOT NULL THEN
    INSERT INTO sesion_feedback (sesion_id, data, submitted_at)
    VALUES (v_sesion_id, p_feedback_data, now());
  END IF;

  RETURN jsonb_build_object('sesion_id', v_sesion_id);
END;
$$;

create or replace function public.insertar_feedback_por_token(p_token text, p_data jsonb)
returns table(id uuid, data jsonb, submitted_at timestamp with time zone, editado boolean)
language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_sesion_id   uuid;
  v_cliente_id  uuid;
  v_feedback_id uuid;
BEGIN
  SELECT s.id, s.cliente_id INTO v_sesion_id, v_cliente_id
  FROM   public.sesiones s
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL);

  IF v_sesion_id IS NULL THEN
    RAISE EXCEPTION 'Token de sesión no válido: %', p_token;
  END IF;

  IF auth.uid() IS NULL AND NOT public._portal_permite(v_cliente_id, 'feedback') THEN
    RAISE EXCEPTION 'El feedback no está activado para este cliente';
  END IF;

  INSERT INTO public.sesion_feedback (sesion_id, data)
  VALUES (v_sesion_id, p_data)
  RETURNING public.sesion_feedback.id INTO v_feedback_id;

  PERFORM public._sync_molestia_from_feedback(v_feedback_id, v_sesion_id, p_data);

  RETURN QUERY
  SELECT sf.id, sf.data, sf.submitted_at, sf.editado
  FROM   public.sesion_feedback sf
  WHERE  sf.id = v_feedback_id;
END;
$$;

create or replace function public.actualizar_feedback_por_token(p_token text, p_data jsonb)
returns table(id uuid, data jsonb, submitted_at timestamp with time zone, editado boolean)
language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_sesion_id  uuid;
  v_cliente_id uuid;
  v_id         uuid;
  v_data       jsonb;
  v_submitted  timestamptz;
  v_editado    boolean;
BEGIN
  SELECT s.id, s.cliente_id INTO v_sesion_id, v_cliente_id
  FROM   public.sesiones s
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL);

  IF v_sesion_id IS NULL THEN
    RAISE EXCEPTION 'Token de sesión no válido: %', p_token;
  END IF;

  IF auth.uid() IS NULL AND NOT public._portal_permite(v_cliente_id, 'feedback') THEN
    RAISE EXCEPTION 'El feedback no está activado para este cliente';
  END IF;

  UPDATE public.sesion_feedback sf
  SET    data    = p_data,
         editado = true
  WHERE  sf.sesion_id = v_sesion_id
  RETURNING sf.id, sf.data, sf.submitted_at, sf.editado
  INTO   v_id, v_data, v_submitted, v_editado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe feedback para la sesión del token proporcionado';
  END IF;

  PERFORM public._sync_molestia_from_feedback(v_id, v_sesion_id, p_data);

  RETURN QUERY SELECT v_id, v_data, v_submitted, v_editado;
END;
$$;

create or replace function public.completar_sesion_por_token(p_token text, p_fecha date DEFAULT NULL, p_estado text DEFAULT NULL, p_fecha_realizada date DEFAULT NULL)
returns void
language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_cliente_id uuid;
BEGIN
  SELECT s.cliente_id INTO v_cliente_id
  FROM   public.sesiones s
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL);

  IF v_cliente_id IS NULL THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL AND NOT public._portal_permite(v_cliente_id, 'feedback') THEN
    RAISE EXCEPTION 'Marcar sesiones no está activado para este cliente';
  END IF;

  UPDATE public.sesiones
  SET
    estado = COALESCE(p_estado, estado),
    completada_el = CASE
      WHEN fecha_editada_por_entrenadora = true THEN completada_el
      WHEN p_estado = 'no_realizada' THEN NULL
      WHEN p_estado IN ('completada', 'parcial', 'realizada') AND p_fecha_realizada IS NOT NULL
        THEN COALESCE(completada_el, p_fecha_realizada)
      ELSE completada_el
    END
  WHERE token_publico = p_token;
END;
$$;

create or replace function public.desmarcar_sesion_por_token(p_token text)
returns void
language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_sesion_id  uuid;
  v_cliente_id uuid;
  v_rows       integer;
BEGIN
  SELECT id, cliente_id INTO v_sesion_id, v_cliente_id
  FROM   public.sesiones
  WHERE  token_publico = p_token
    AND  (coalesce(publicada, true) OR auth.uid() IS NOT NULL);

  IF v_sesion_id IS NULL THEN
    RAISE EXCEPTION 'Token de sesión no válido: %', p_token;
  END IF;

  IF auth.uid() IS NULL AND NOT public._portal_permite(v_cliente_id, 'feedback') THEN
    RAISE EXCEPTION 'Marcar sesiones no está activado para este cliente';
  END IF;

  UPDATE public.sesiones
  SET    completada_el = NULL,
         estado        = 'pendiente'
  WHERE  id = v_sesion_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'No se pudo desmarcar la sesión identificada por el token: %', p_token;
  END IF;

  UPDATE public.sesion_ejercicios e
  SET    valores_reales = '{}'::jsonb
  FROM   public.sesion_bloques b
  WHERE  e.bloque_id = b.id
    AND  b.sesion_id = v_sesion_id;
END;
$$;

create or replace function public.clonar_sesion_flexible_por_token(p_token text, p_valores_reales jsonb DEFAULT '{}'::jsonb, p_feedback_data jsonb DEFAULT NULL, p_estado text DEFAULT 'realizada')
returns table(clon_id uuid, clon_token text, fecha date)
language plpgsql security definer set search_path = ''
as $$
DECLARE
  v_sesion          record;
  v_clon_id         uuid;
  v_clon_token      text;
  v_hoy             date;
  v_bloque          record;
  v_nuevo_bloque_id uuid;
  v_ej              record;
  v_feedback_id     uuid;
BEGIN
  IF p_estado NOT IN ('realizada', 'completada', 'parcial', 'no_realizada') THEN
    RAISE EXCEPTION 'Estado no válido: %. Los valores admitidos son: realizada, completada, parcial, no_realizada', p_estado;
  END IF;

  SELECT s.id, s.cliente_id, s.titulo, s.objetivo, s.duracion_min, s.material,
         s.indicaciones, s.icono, s.tipo_editor, s.con_feedback, s.fecha
  INTO   v_sesion
  FROM   public.sesiones s
  WHERE  s.token_publico = p_token
    AND  (coalesce(s.publicada, true) OR auth.uid() IS NOT NULL);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de sesión no válido: %', p_token;
  END IF;

  IF auth.uid() IS NULL AND NOT public._portal_permite(v_sesion.cliente_id, 'feedback') THEN
    RAISE EXCEPTION 'Marcar sesiones no está activado para este cliente';
  END IF;

  IF v_sesion.fecha IS NOT NULL THEN
    RAISE EXCEPTION 'La sesión no es flexible: tiene fecha asignada (%). Solo se pueden clonar sesiones sin fecha.', v_sesion.fecha;
  END IF;

  v_hoy        := CURRENT_DATE;
  v_clon_token := gen_random_uuid()::text;

  INSERT INTO public.sesiones (
    cliente_id, titulo, fecha, objetivo, duracion_min, material, indicaciones,
    icono, tipo_editor, con_feedback, token_publico, completada_el, tipo_sesion,
    estado, sesion_original_id
  ) VALUES (
    v_sesion.cliente_id, v_sesion.titulo, v_hoy, v_sesion.objetivo,
    v_sesion.duracion_min, v_sesion.material, v_sesion.indicaciones,
    v_sesion.icono, v_sesion.tipo_editor, v_sesion.con_feedback,
    v_clon_token, v_hoy, 'programada', NULL,
    v_sesion.id
  )
  RETURNING id INTO v_clon_id;

  FOR v_bloque IN
    SELECT id, nombre, color, nota, orden
    FROM   public.sesion_bloques
    WHERE  sesion_id = v_sesion.id
    ORDER  BY orden
  LOOP
    INSERT INTO public.sesion_bloques (sesion_id, nombre, color, nota, orden)
    VALUES (v_clon_id, v_bloque.nombre, v_bloque.color, v_bloque.nota, v_bloque.orden)
    RETURNING id INTO v_nuevo_bloque_id;

    FOR v_ej IN
      SELECT id, nombre, series, reps, rpe, notas, media_tipo, media_url,
             video_url, orden, peso, duracion, distancia, altura, descanso,
             ejecucion_tipo, ejecucion_texto, variables_activas,
             peso_der, peso_izq, reps_por_lado
      FROM   public.sesion_ejercicios
      WHERE  bloque_id = v_bloque.id
      ORDER  BY orden
    LOOP
      INSERT INTO public.sesion_ejercicios (
        bloque_id, nombre, series, reps, rpe, notas, media_tipo, media_url,
        video_url, orden, peso, duracion, distancia, altura, descanso,
        ejecucion_tipo, ejecucion_texto, variables_activas,
        peso_der, peso_izq, reps_por_lado, valores_reales
      ) VALUES (
        v_nuevo_bloque_id, v_ej.nombre, v_ej.series, v_ej.reps, v_ej.rpe,
        v_ej.notas, v_ej.media_tipo, v_ej.media_url, v_ej.video_url,
        v_ej.orden, v_ej.peso, v_ej.duracion, v_ej.distancia,
        v_ej.altura, v_ej.descanso, v_ej.ejecucion_tipo,
        v_ej.ejecucion_texto, v_ej.variables_activas,
        v_ej.peso_der, v_ej.peso_izq, v_ej.reps_por_lado,
        COALESCE(p_valores_reales -> (v_ej.id::text), '{}'::jsonb)
      );
    END LOOP;
  END LOOP;

  UPDATE public.sesiones
  SET    completada_el = v_hoy
  WHERE  id = v_sesion.id;

  IF p_feedback_data IS NOT NULL THEN
    INSERT INTO public.sesion_feedback (sesion_id, data)
    VALUES (v_clon_id, p_feedback_data)
    RETURNING id INTO v_feedback_id;

    PERFORM public._sync_molestia_from_feedback(v_feedback_id, v_clon_id, p_feedback_data);
  END IF;

  UPDATE public.sesiones
  SET    estado = p_estado
  WHERE  id = v_clon_id;

  RETURN QUERY SELECT v_clon_id, v_clon_token, v_hoy;
END;
$$;

-- ── GALENS: portal sin registro manual ni feedback ─────────────────────────

update public.clientes
set portal_config = coalesce(portal_config, '{}'::jsonb)
                    || '{"registrar_manual": false, "feedback": false, "strava": false}'::jsonb
where id = '900cd59b-7771-49fc-be7a-b5e91b5935e5';
