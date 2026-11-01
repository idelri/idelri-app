-- Vista pública de sesión: devolver también tipo_actividad para que el
-- formulario de feedback se adapte (p. ej. entrenos de fútbol).
-- Se añade la columna al final; el resto de la función no cambia.
DROP FUNCTION IF EXISTS public.get_sesion_por_token(text);

CREATE FUNCTION public.get_sesion_por_token(p_token text)
 RETURNS TABLE(titulo text, fecha date, objetivo text, duracion_min integer, material text, indicaciones text, tipo_sesion text, tipo_editor text, con_feedback boolean, completada_el date, estado text, icono text, token_publico text, comentario_entrenadora text, comentario_entrenadora_at timestamp with time zone, tipo_actividad text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT titulo, fecha, objetivo, duracion_min, material, indicaciones,
         tipo_sesion, tipo_editor, con_feedback, completada_el, estado,
         icono, token_publico,
         comentario_entrenadora, comentario_entrenadora_at,
         tipo_actividad
  FROM   public.sesiones
  WHERE  token_publico = p_token
    AND  (coalesce(publicada, true) OR auth.uid() IS NOT NULL)
  LIMIT  1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sesion_por_token(text) TO anon, authenticated, service_role;
