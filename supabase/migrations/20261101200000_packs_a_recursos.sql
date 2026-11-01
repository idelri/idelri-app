-- Los «packs flexibles» desaparecen: cada pack pasa a ser un grupo de
-- recursos del mismo cliente (mismo nombre y descripción) y sus sesiones pasan
-- a ser recursos de ese grupo. Las sesiones sueltas sin fecha (sin pack ni
-- recurso, de un cliente: las plantillas sin cliente no se tocan) van a un grupo «Sesiones sin fecha».
-- La tabla packs_flexibles y la columna sesiones.pack_id se dejan de usar
-- pero no se borran aquí.

-- 1) Un grupo por pack
create temp table _pack_grupo on commit drop as
select p.id as pack_id, p.cliente_id, gen_random_uuid() as grupo_id, p.nombre, p.descripcion,
       coalesce((select max(g.orden) + 1 from public.recurso_grupos g where g.cliente_id = p.cliente_id), 0)
         + row_number() over (partition by p.cliente_id order by p.fecha_inicio, p.created_at) - 1 as orden
from public.packs_flexibles p
where exists (select 1 from public.sesiones s where s.pack_id = p.id and s.fecha is null);

insert into public.recurso_grupos (id, cliente_id, nombre, icono, color, descripcion, orden)
select grupo_id, cliente_id, nombre, '📦', '#4C82E8', descripcion, orden from _pack_grupo;

update public.sesiones s set
  recurso = 'grupo', recurso_grupo_id = pg.grupo_id, tipo_sesion = 'flexible', pack_id = null
from _pack_grupo pg
where s.pack_id = pg.pack_id and s.fecha is null;

-- 2) Sesiones sueltas sin fecha → grupo «Sesiones sin fecha»
create temp table _sueltas on commit drop as
select s.cliente_id, gen_random_uuid() as grupo_id,
       coalesce((select max(g.orden) + 1 from public.recurso_grupos g where g.cliente_id = s.cliente_id), 0) as orden
from public.sesiones s
where s.fecha is null and s.recurso is null and s.pack_id is null and s.cliente_id is not null
group by s.cliente_id;

insert into public.recurso_grupos (id, cliente_id, nombre, icono, color, orden)
select grupo_id, cliente_id, 'Sesiones sin fecha', '📋', '#6b7280', orden from _sueltas;

update public.sesiones s set recurso = 'grupo', recurso_grupo_id = x.grupo_id, tipo_sesion = 'flexible'
from _sueltas x
where s.cliente_id = x.cliente_id and s.fecha is null and s.recurso is null and s.pack_id is null;
