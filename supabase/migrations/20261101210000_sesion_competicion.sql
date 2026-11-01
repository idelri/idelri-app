-- Partidos: una sesión puede estar vinculada a una competición (el partido).
-- Así el partido es una sola actividad: la competición marca el calendario y
-- la sesión es donde el deportista deja el feedback.
ALTER TABLE public.sesiones
  ADD COLUMN IF NOT EXISTS competicion_id uuid REFERENCES public.competiciones(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sesiones_competicion_id_idx ON public.sesiones (competicion_id);

-- Portal del cliente: indicar si la competición ya tiene una sesión publicada
-- vinculada (en ese caso el portal muestra solo la sesión).
DROP FUNCTION IF EXISTS public.get_competiciones_por_token_cliente(text);
CREATE FUNCTION public.get_competiciones_por_token_cliente(p_token text)
 RETURNS TABLE(id uuid, nombre text, fecha date, tipo text, objetivo text, resultado text, notas text, visibilidad text, tiene_sesion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_cliente_id uuid;
BEGIN
  SELECT c.id INTO v_cliente_id
  FROM public.clientes c
  WHERE c.token_cliente = p_token;

  IF v_cliente_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT comp.id, comp.nombre, comp.fecha, comp.tipo, comp.objetivo, comp.resultado, comp.notas, comp.visibilidad,
         EXISTS (SELECT 1 FROM public.sesiones s WHERE s.competicion_id = comp.id AND coalesce(s.publicada, true))
  FROM public.competiciones comp
  WHERE comp.cliente_id = v_cliente_id
  ORDER BY comp.fecha;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_competiciones_por_token_cliente(text) TO anon, authenticated, service_role;
