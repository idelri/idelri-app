-- Perfil fisiológico y zonas de entrenamiento del cliente (solo entrenadora).
-- Estructura en src/lib/zonas.js. Aplicada el 2026-10-23.
alter table public.clientes add column if not exists perfil_zonas jsonb;
