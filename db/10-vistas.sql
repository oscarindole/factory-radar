-- ---------------------------------------------------------------------------
-- RADACTORY :: 10 · vistas de consulta
--
-- Ninguna consulta del panel toca `measurement`. Siempre lee del agregado del
-- nivel adecuado. Es la diferencia entre un panel que abre en 200 ms y uno que
-- tarda 9 s, y esa diferencia decide si el usuario vuelve mañana.
-- ---------------------------------------------------------------------------

-- Las vistas heredan la RLS de las tablas de debajo. `security_invoker` es
-- imprescindible en PG15+: sin el, la vista se ejecuta con los permisos de su
-- propietario y se salta las politicas de quien consulta.

-- Estado de planta: las seis cifras de la pantalla de los 30 segundos.
create or replace view v_estado_planta
with (security_invoker = true) as
select
  pm.tenant_id,
  an.site_id,
  pm.bucket::date                                        as fecha,
  sum(pm.uds_ok)                                         as uds_ok,
  sum(pm.uds_nok)                                        as uds_nok,
  case when sum(pm.uds_ok + pm.uds_nok) > 0
       then sum(pm.uds_ok) / sum(pm.uds_ok + pm.uds_nok)
  end                                                    as calidad,
  -- OEE de planta ponderado por tiempo planificado, no media aritmetica: una
  -- media simple deja que una maquina auxiliar parada dos horas pese lo mismo
  -- que la linea principal.
  case when sum(pm.t_planificado) > 0
       then sum(pm.oee * pm.t_planificado) / sum(pm.t_planificado)
  end                                                    as oee,
  min(pm.cobertura)                                      as cobertura_min
from production_metric pm
join asset_node an on an.id = pm.asset_node_id
where pm.span = 'dia'
group by pm.tenant_id, an.site_id, pm.bucket::date;

-- Bandeja "Atencion hoy". El tope de cinco NO se aplica aqui: se aplica en el
-- motor, que es quien decide que merece ser critica. Si la bandeja trae mas de
-- cinco criticas, el problema es de calibracion y hay que verlo, no ocultarlo.
create or replace view v_atencion
with (security_invoker = true) as
select
  a.id, a.tenant_id, a.site_id, a.asset_node_id,
  an.codigo        as nodo_codigo,
  an.nombre        as nodo_nombre,
  a.modulo, a.severidad, a.confianza,
  a.titulo, a.que_cambio, a.por_que,
  a.impacto_eur_anual, a.accion_recomendada,
  a.detectado_en,
  case a.severidad
    when 'critica' then 1 when 'alta' then 2
    when 'media'   then 3 else 4
  end              as orden_severidad
from alert a
left join asset_node an on an.id = a.asset_node_id
where a.estado = 'abierta';

-- Cuantas paradas NO tienen causa. Es la primera metrica de la auditoria de la
-- semana 1 del piloto y la que justifica media conversacion comercial.
create or replace view v_cobertura_causas
with (security_invoker = true) as
select
  e.tenant_id,
  an.site_id,
  date_trunc('week', e.ts_start)                         as semana,
  count(*)                                               as paradas,
  count(*) filter (where e.reason_code_id is null)       as sin_causa,
  round(
    100.0 * count(*) filter (where e.reason_code_id is null)
    / nullif(count(*), 0)
  , 1)                                                   as pct_sin_causa
from event e
join asset_node an on an.id = e.asset_node_id
where e.tipo in ('stop', 'microstop')
group by e.tenant_id, an.site_id, date_trunc('week', e.ts_start);

-- Consumo de IA por empresa y mes, para el panel de superadmin. La
-- conversacion de precio con un cliente que usa mucho el Copilot se tiene con
-- este numero delante, no a ojo.
create or replace view v_consumo_ia
with (security_invoker = true) as
select
  tenant_id,
  date_trunc('month', ts)                                as mes,
  count(*)                                               as llamadas,
  sum(coste_eur)                                         as coste_eur,
  round(avg(latencia_ms))                                as latencia_media_ms,
  count(*) filter (where error is not null)              as errores
from ai_analysis
group by tenant_id, date_trunc('month', ts);
