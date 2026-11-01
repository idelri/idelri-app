-- Un recurso solo puede estar en un grupo de su mismo cliente. Al copiar una
-- sesión-recurso a otro cliente (copiar_sesion copia recurso_grupo_id), el
-- grupo del cliente original no le sirve: se deja sin grupo.
CREATE OR REPLACE FUNCTION public.sesion_recurso_grupo_mismo_cliente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.recurso_grupo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.recurso_grupos g
    WHERE g.id = NEW.recurso_grupo_id AND g.cliente_id IS NOT DISTINCT FROM NEW.cliente_id
  ) THEN
    NEW.recurso_grupo_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sesion_recurso_grupo_mismo_cliente ON public.sesiones;
CREATE TRIGGER trg_sesion_recurso_grupo_mismo_cliente
  BEFORE INSERT OR UPDATE OF recurso_grupo_id, cliente_id ON public.sesiones
  FOR EACH ROW EXECUTE FUNCTION public.sesion_recurso_grupo_mismo_cliente();
