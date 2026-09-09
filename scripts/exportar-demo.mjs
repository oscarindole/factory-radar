#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Congela la DEMO FACTORY en un JSON para el panel navegable.
//
// El panel de demo NO habla con la API: se lleva a una reunion en un portatil,
// funciona sin cobertura y tiene que verse igual el martes que el jueves. Esa
// es la unica razon por la que existe esta instantanea; el panel de produccion
// (panel/) lee la API de verdad.
//
// Se exporta AGREGADO, nunca la serie cruda: 342.000 medidas no caben en una
// pagina y no aportan nada que no diga el agregado diario.
// ---------------------------------------------------------------------------
import { writeFileSync } from 'node:fs';
import { conInquilinoJobs, cerrar } from '../src/db.ts';

const TENANT = 'dcdcdcdc-0000-0000-0000-00000000dec0';
const SITE   = 'dcdcdcdc-1111-0000-0000-00000000dec0';
const HOY    = '2026-09-09';

const d = await conInquilinoJobs(TENANT, async (db) => {
  const uno = async (sql, v = []) => (await db.query(sql, v)).rows[0] ?? null;
  const todo = async (sql, v = []) => (await db.query(sql, v)).rows;

  const planta = await uno(
    `select s.nombre, s.direccion, s.precio_kwh, c.nombre as empresa
       from site s join company c on c.id = s.tenant_id where s.id = $1`, [SITE]);

  // --- indicadores de la pantalla de los 30 segundos -----------------------
  const hoy = await uno(
    `select sum(pm.uds_ok) as uds_ok, sum(pm.uds_nok) as uds_nok,
            sum(pm.oee * pm.t_planificado) / nullif(sum(pm.t_planificado),0) as oee,
            sum(pm.disponibilidad * pm.t_planificado) / nullif(sum(pm.t_planificado),0) as disp,
            sum(pm.rendimiento * pm.t_planificado) / nullif(sum(pm.t_planificado),0) as rend,
            sum(pm.calidad * pm.t_planificado) / nullif(sum(pm.t_planificado),0) as cal
       from production_metric pm join asset_node an on an.id = pm.asset_node_id
      where an.site_id = $1 and pm.span = 'dia' and an.tipo = 'linea'
        and pm.bucket >= $2::date - 7 and pm.bucket < $2::date`, [SITE, HOY]);

  const previo = await uno(
    `select sum(pm.oee * pm.t_planificado) / nullif(sum(pm.t_planificado),0) as oee,
            sum(pm.calidad * pm.t_planificado) / nullif(sum(pm.t_planificado),0) as cal,
            sum(pm.uds_nok) / nullif(sum(pm.uds_ok + pm.uds_nok),0) as rechazo
       from production_metric pm join asset_node an on an.id = pm.asset_node_id
      where an.site_id = $1 and pm.span = 'dia' and an.tipo = 'linea'
        and pm.bucket >= $2::date - 37 and pm.bucket < $2::date - 7`, [SITE, HOY]);

  const energia = await uno(
    `select sum(er.kwh) as kwh, sum(er.coste_eur) as eur,
            sum(er.kwh) / nullif(sum(er.uds_producidas),0) as kwh_ud
       from energy_reading er join asset_node an on an.id = er.asset_node_id
      where an.site_id = $1 and er.bucket >= $2::date - 7 and er.bucket < $2::date`,
    [SITE, HOY]);
  const energiaPrev = await uno(
    `select sum(er.kwh) / nullif(sum(er.uds_producidas),0) as kwh_ud
       from energy_reading er join asset_node an on an.id = er.asset_node_id
      where an.site_id = $1 and er.bucket >= $2::date - 37 and er.bucket < $2::date - 7`,
    [SITE, HOY]);

  const causas = await uno(
    `select round(avg(pct_sin_causa),1) as pct from v_cobertura_causas where site_id = $1`,
    [SITE]);

  return {
    generado: new Date().toISOString(),
    hoy: HOY,
    planta,
    indicadores: { ...hoy, ...previo && { oee_prev: previo.oee, cal_prev: previo.cal,
      rechazo_prev: previo.rechazo }, kwh: energia?.kwh, coste_eur: energia?.eur,
      kwh_ud: energia?.kwh_ud, kwh_ud_prev: energiaPrev?.kwh_ud,
      pct_sin_causa: causas?.pct },

    alertas: await todo(
      `select a.id, a.modulo, a.severidad, a.confianza, a.titulo, a.que_cambio,
              a.por_que, a.impacto_eur_anual, a.impacto_base, a.evidencia,
              a.accion_recomendada, a.detectado_en,
              an.codigo as nodo_codigo, an.nombre as nodo_nombre
         from alert a left join asset_node an on an.id = a.asset_node_id
        where a.site_id = $1 and a.estado = 'abierta'
        order by case a.severidad when 'critica' then 1 when 'alta' then 2
                                  when 'media' then 3 else 4 end,
                 a.impacto_eur_anual desc nulls last`, [SITE]),

    activos: await todo(
      `select an.id, an.parent_id, an.tipo, an.codigo, an.nombre, an.fabricante,
              an.modelo, an.criticidad, an.coste_parada_hora,
              sc.score, sc.c_fiabilidad, sc.c_comportamiento, sc.c_mantenimiento,
              sc.c_criticidad, sc.pesos, sc.entradas,
              (select s2.score from asset_score s2
                where s2.asset_node_id = an.id and s2.fecha = $2::date - 30) as score_prev,
              (select count(*) from signal s where s.asset_node_id = an.id) as n_senales
         from asset_node an
         left join asset_score sc on sc.asset_node_id = an.id and sc.fecha = $2::date
        where an.site_id = $1
        order by array_length(an.ruta,1) nulls first, an.codigo`, [SITE, HOY]),

    // OEE diario por linea, 45 dias. Es la serie que sostiene las graficas.
    oeeLinea: await todo(
      `select an.codigo, pm.bucket::date as fecha,
              round(pm.oee::numeric,4) as oee,
              round(pm.disponibilidad::numeric,4) as disp,
              round(pm.rendimiento::numeric,4) as rend,
              round(pm.calidad::numeric,4) as cal,
              pm.uds_ok, pm.uds_nok
         from production_metric pm join asset_node an on an.id = pm.asset_node_id
        where an.site_id = $1 and an.tipo = 'linea' and pm.span = 'dia'
          and pm.bucket >= $2::date - 45
        order by an.codigo, pm.bucket`, [SITE, HOY]),

    // Rendimiento por turno del nodo de la alerta critica, con su linea base.
    rendP4: await todo(
      `select pm.bucket, sh.nombre as turno, p.codigo as producto,
              round(pm.rendimiento::numeric,4) as rend
         from production_metric pm
         join asset_node an on an.id = pm.asset_node_id
         join shift_instance si on si.id = pm.shift_instance_id
         join shift sh on sh.id = si.shift_id
         left join product p on p.id = pm.product_id
        where an.codigo = 'L3.P4' and pm.span = 'turno'
          and pm.bucket >= $1::date - 30
        order by pm.bucket`, [HOY]),

    baseP4: await todo(
      `select sh.nombre as turno, coalesce(p.codigo,'(genérica)') as producto,
              round(b.media::numeric,4) as media, b.n_muestras
         from baseline b join asset_node an on an.id = b.asset_node_id
         join shift sh on sh.id = b.shift_id
         left join product p on p.id = b.product_id
        where an.codigo = 'L3.P4' and b.metrica = 'rendimiento'`),

    energiaDia: await todo(
      `select an.codigo, er.bucket::date as fecha, round(er.kwh::numeric,1) as kwh,
              round(er.kwh_por_ud::numeric,5) as kwh_ud, er.fuera_horario
         from energy_reading er join asset_node an on an.id = er.asset_node_id
        where an.site_id = $1 and er.bucket >= $2::date - 45
        order by an.codigo, er.bucket`, [SITE, HOY]),

    paradas: await todo(
      `select coalesce(rc.nombre,'SIN CAUSA REGISTRADA') as causa,
              coalesce(rc.planificada,false) as planificada,
              count(*)::int as n, round((sum(e.duracion_s)/3600.0)::numeric,1) as horas
         from event e join asset_node an on an.id = e.asset_node_id
         left join reason_code rc on rc.id = e.reason_code_id
        where an.site_id = $1 and e.tipo in ('stop','microstop')
          and e.ts_start >= $2::date - 30
        group by 1,2 order by horas desc`, [SITE, HOY]),

    calidad: await todo(
      `select p.codigo as producto, s.nombre as proveedor, d.lote,
              sum(qi.cantidad)::int as uds, round(sum(qi.coste_eur)::numeric,2) as eur,
              count(*)::int as n
         from quality_incident qi
         left join delivery d on d.id = qi.delivery_id
         left join supplier s on s.id = d.supplier_id
         join product p on p.id = qi.product_id
        where qi.site_id = $1 and qi.detectado_en >= $2::date - 45
        group by 1,2,3 order by eur desc nulls last limit 20`, [SITE, HOY]),

    turnos: await todo(
      `select sh.nombre as turno, an.codigo,
              round(avg(pm.oee)::numeric,4) as oee,
              round(avg(pm.rendimiento)::numeric,4) as rend, count(*)::int as n
         from production_metric pm
         join asset_node an on an.id = pm.asset_node_id
         join shift_instance si on si.id = pm.shift_instance_id
         join shift sh on sh.id = si.shift_id
        where an.site_id = $1 and an.tipo = 'linea' and pm.span = 'turno'
          and pm.bucket >= $2::date - 30
        group by 1,2 order by 2,1`, [SITE, HOY]),
  };
});

await cerrar();
writeFileSync('var/demo.json', JSON.stringify(d));
const kb = (Buffer.byteLength(JSON.stringify(d)) / 1024).toFixed(0);
console.log(`var/demo.json · ${kb} KB · ${d.alertas.length} alertas · ${d.activos.length} activos`);
