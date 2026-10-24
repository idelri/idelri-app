-- Constructor de bloques de resistencia (estilo TrainingPeaks).
-- Cada paso (sesion_fases) tiene tipo, duración o distancia e intensidad
-- objetivo (rango en % FC máx / % FC umbral / % ritmo umbral / % ritmo
-- maratón / zona / RPE). Los campos antiguos se siguen leyendo.
-- Aplicada el 2026-10-24.
alter table public.sesion_fases
  add column if not exists tipo_paso text check (tipo_paso is null or tipo_paso in ('calentamiento','activo','recuperacion','vuelta_calma','descanso')),
  add column if not exists duracion_seg integer,
  add column if not exists distancia_m integer,
  add column if not exists objetivo_tipo text check (objetivo_tipo is null or objetivo_tipo in ('fcmax','fcumbral','ritmo_umbral','ritmo_maraton','zona_fc','zona_ritmo','rpe')),
  add column if not exists objetivo_min numeric,
  add column if not exists objetivo_max numeric;

-- Vista pública: pasos con todos sus campos
create or replace function public.get_pasos_por_token_sesion(p_token text)
returns table(id uuid, bloque_id uuid, grupo_id uuid, orden integer, nombre text, descripcion text,
  tipo_paso text, duracion_seg integer, distancia_m integer, objetivo_tipo text, objetivo_min numeric, objetivo_max numeric,
  volumen_min integer, volumen_km numeric, fc_zona integer, ritmo_inicio text, ritmo_fin text, rpe integer,
  pendiente_cualitativa text, pendiente_pct_min numeric, pendiente_pct_max numeric)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.bloque_id, f.grupo_id, f.orden, f.nombre, f.descripcion,
         f.tipo_paso, f.duracion_seg, f.distancia_m, f.objetivo_tipo, f.objetivo_min, f.objetivo_max,
         f.volumen_min, f.volumen_km, f.fc_zona, f.ritmo_inicio, f.ritmo_fin, f.rpe,
         f.pendiente_cualitativa, f.pendiente_pct_min, f.pendiente_pct_max
  from public.sesion_fases f
  join public.sesiones s on s.id = f.sesion_id
  where s.token_publico = p_token
    and (coalesce(s.publicada, true) or auth.uid() is not null)
  order by f.orden
$$;

-- Vista pública: solo los datos necesarios para calcular pulsaciones y ritmos
create or replace function public.get_perfil_zonas_por_token_sesion(p_token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'fc_max', c.perfil_zonas -> 'fc_max',
    'fc_reposo', c.perfil_zonas -> 'fc_reposo',
    'fc_umbral', c.perfil_zonas -> 'fc_umbral',
    'ritmo_umbral_seg', c.perfil_zonas -> 'ritmo_umbral_seg',
    'ritmo_maraton_seg', c.perfil_zonas -> 'ritmo_maraton_seg',
    'metodo_fc', c.perfil_zonas -> 'metodo_fc',
    'zonas_fc', c.perfil_zonas -> 'zonas_fc',
    'zonas_ritmo', c.perfil_zonas -> 'zonas_ritmo')
  from public.sesiones s
  join public.clientes c on c.id = s.cliente_id
  where s.token_publico = p_token
    and (coalesce(s.publicada, true) or auth.uid() is not null)
    and c.perfil_zonas is not null
  limit 1
$$;

grant execute on function public.get_pasos_por_token_sesion(text) to anon, authenticated;
grant execute on function public.get_perfil_zonas_por_token_sesion(text) to anon, authenticated;
