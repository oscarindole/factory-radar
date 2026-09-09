// ---------------------------------------------------------------------------
// Motor de calculo: del dato crudo a las metricas con contexto.
//
// Es la capa 3 de la arquitectura, la que convierte un contador en produccion
// de un producto en un turno. Corre por lotes, no en cada consulta: el panel
// lee lo ya calculado, y por eso abre en 200 ms en vez de en 9 s.
// ---------------------------------------------------------------------------
import type { Consulta } from '../db.ts';
import { calcularOee, CALC_VERSION_OEE } from '../dominio/oee.ts';

/** Minimo de muestras por combinacion antes de que una linea base valga. */
export const MUESTRAS_MINIMAS = 12;

// ---------------------------------------------------------------------------
// production_metric, turno a turno.
//
// El turno es la unidad natural: es como habla la planta ("el turno de noche va
// mal"), como se cierra el parte y como se compara. Calcular por hora y sumar
// despues pierde el contexto de producto, porque un cambio de formato ocurre a
// mitad de hora.
// ---------------------------------------------------------------------------
export async function calcularProduccion(
  db: Consulta, siteId: string, desde: string, hasta: string,
): Promise<number> {
  const { rows: turnos } = await db.query(
    `select si.id, si.inicio_ts, si.fin_ts, si.shift_id
       from shift_instance si
      where si.site_id = $1 and si.inicio_ts >= $2 and si.inicio_ts < $3
      order by si.inicio_ts`, [siteId, desde, hasta]);

  const { rows: nodos } = await db.query(
    `select an.id, an.codigo, an.ciclo_nominal_s,
            (select s.id from signal s
              where s.asset_node_id = an.id and s.clase = 'contador_acumulado'
              limit 1) as signal_id
       from asset_node an
      where an.site_id = $1 and an.tipo in ('maquina','linea') and an.activo`,
    [siteId]);

  let n = 0;
  for (const t of turnos) {
    for (const nodo of nodos) {
      if (!nodo.signal_id) continue;

      // Producto dominante del turno. Un turno puede tener dos si hubo cambio
      // de formato; se imputa al que mas tiempo estuvo, y el cambio queda como
      // evento aparte. Repartir el OEE entre dos productos por un cambio a
      // mitad de turno da dos numeros pequeños que no se parecen a nada.
      const { rows: [prod] } = await db.query(
        `select po.product_id, p.ciclo_nominal_s, p.margen_unitario
           from production_order po join product p on p.id = po.product_id
          where po.asset_node_id = $1
            and po.inicio_real < $3 and coalesce(po.fin_real, $3) > $2
          order by po.inicio_real limit 1`,
        [nodo.id, t.inicio_ts, t.fin_ts]);

      // Produccion: diferencia del contador acumulado en la ventana.
      const { rows: [c] } = await db.query(
        `select min(value) as ini, max(value) as fin, count(*)::int as n,
                count(*) filter (where quality in (0,3))::int as n_ok
           from measurement
          where signal_id = $1 and ts >= $2 and ts < $3`,
        [nodo.signal_id, t.inicio_ts, t.fin_ts]);

      if (!c || c.n === 0) continue;   // sin dato no se inventa una fila
      const uds = Math.max(0, Number(c.fin ?? 0) - Number(c.ini ?? 0));

      const { rows: [ev] } = await db.query(
        `select coalesce(sum(duracion_s) filter (where tipo = 'stop'), 0)::int as parada,
                coalesce(sum(duracion_s) filter (where tipo = 'microstop'), 0)::int as micro,
                coalesce(sum((payload->>'uds')::numeric) filter (where tipo = 'reject'), 0) as nok,
                coalesce(sum(duracion_s) filter (
                  where tipo = 'stop' and reason_code_id in
                    (select id from reason_code where planificada)), 0)::int as planif
           from event
          where asset_node_id = $1 and ts_start >= $2 and ts_start < $3`,
        [nodo.id, t.inicio_ts, t.fin_ts]);

      const tCalendario = Math.round(
        (new Date(t.fin_ts).getTime() - new Date(t.inicio_ts).getTime()) / 1000);
      const tPlanificado = tCalendario - ev.planif;
      const nok = Number(ev.nok ?? 0);

      // Las microparadas NO se restan del tiempo en marcha.
      //
      // En las seis grandes perdidas del OEE, las microparadas son perdida de
      // RENDIMIENTO, no de disponibilidad: la maquina figura en marcha y
      // produce menos. Restarlas del tiempo de marcha —que es lo que hacia la
      // primera version— las convertia en perdida de disponibilidad y el
      // rendimiento salia intacto. Consecuencia practica: la Estacion P4, con
      // 92 microparadas al dia, NO se detectaba. El sintoma mas caro de la
      // planta era invisible por un error de imputacion.
      const oee = calcularOee({
        tPlanificado,
        tParada: ev.parada - ev.planif,
        udsOk: Math.max(0, uds - nok),
        udsNok: nok,
        cicloNominalS: Number(prod?.ciclo_nominal_s ?? nodo.ciclo_nominal_s ?? 0),
        cobertura: c.n > 0 ? c.n_ok / c.n : 0,
      });

      await db.query(
        `insert into production_metric
           (tenant_id, asset_node_id, product_id, shift_instance_id, span, bucket, fin,
            t_calendario, t_planificado, t_marcha, t_parada, t_microparada,
            uds_ok, uds_nok, disponibilidad, rendimiento, calidad, oee,
            cobertura, calc_version, entradas)
         select fr_tenant(), $1, $2, $3, 'turno', $4, $5,
                $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
         on conflict (tenant_id, asset_node_id, span, bucket, product_id)
         do update set uds_ok = excluded.uds_ok, uds_nok = excluded.uds_nok,
                       disponibilidad = excluded.disponibilidad,
                       rendimiento = excluded.rendimiento, calidad = excluded.calidad,
                       oee = excluded.oee, cobertura = excluded.cobertura,
                       entradas = excluded.entradas, calculado_en = now()`,
        [nodo.id, prod?.product_id ?? null, t.id, t.inicio_ts, t.fin_ts,
         tCalendario, tPlanificado, oee.tMarcha, ev.parada + ev.micro, ev.micro,
         Math.max(0, uds - nok), nok,
         oee.disponibilidad, oee.rendimiento, oee.calidad, oee.oee,
         oee.cobertura, CALC_VERSION_OEE, JSON.stringify(oee.entradas)]);
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// La linea se mide EN SU CUELLO DE BOTELLA, no promediando sus maquinas.
//
// Una linea para cuando para cualquiera de sus estaciones, asi que su OEE es el
// de la peor, no la media de todas. Promediar da un numero optimista que no se
// parece a lo que sale por el final de la linea, y es de los errores que un
// jefe de produccion detecta en la primera reunion — el sabe perfectamente que
// su linea 3 no va al 84%.
//
// Sin esto, ademas, las lineas no tenian NINGUNA metrica: el calculo por nodo
// solo cubre los que tienen contador, y los contadores estan en las maquinas.
// La pantalla de estado de planta salia vacia.
// ---------------------------------------------------------------------------
export async function agregarLineas(
  db: Consulta, siteId: string, desde: string, hasta: string,
): Promise<number> {
  const { rowCount } = await db.query(
    `insert into production_metric
       (tenant_id, asset_node_id, product_id, shift_instance_id, span, bucket, fin,
        t_calendario, t_planificado, t_marcha, t_parada, t_microparada,
        uds_ok, uds_nok, disponibilidad, rendimiento, calidad, oee,
        cobertura, calc_version, entradas)
     select fr_tenant(), cuello.linea_id, cuello.product_id, cuello.shift_instance_id,
            'turno', cuello.bucket, cuello.fin,
            cuello.t_calendario, cuello.t_planificado, cuello.t_marcha,
            cuello.t_parada, cuello.t_microparada,
            cuello.uds_ok, cuello.uds_nok,
            cuello.disponibilidad, cuello.rendimiento, cuello.calidad, cuello.oee,
            cuello.cobertura, cuello.calc_version,
            jsonb_build_object('cuello_de_botella', cuello.codigo,
                               'maquinas_en_linea', cuello.n_maquinas,
                               'criterio', 'OEE de la estacion restrictiva')
       from (
         select distinct on (linea.id, pm.shift_instance_id)
                linea.id as linea_id, maq.codigo, pm.*,
                count(*) over (partition by linea.id, pm.shift_instance_id) as n_maquinas
           from production_metric pm
           join asset_node maq on maq.id = pm.asset_node_id
           join asset_node linea on linea.id = maq.parent_id and linea.tipo = 'linea'
          where linea.site_id = $1 and pm.span = 'turno' and maq.tipo = 'maquina'
            and pm.bucket >= $2 and pm.bucket < $3 and pm.oee is not null
          order by linea.id, pm.shift_instance_id, pm.oee asc
       ) cuello
     on conflict (tenant_id, asset_node_id, span, bucket, product_id)
     do update set uds_ok = excluded.uds_ok, uds_nok = excluded.uds_nok,
                   disponibilidad = excluded.disponibilidad,
                   rendimiento = excluded.rendimiento, calidad = excluded.calidad,
                   oee = excluded.oee, cobertura = excluded.cobertura,
                   entradas = excluded.entradas, calculado_en = now()`,
    [siteId, desde, hasta]);
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Agrega el turno a dia. El OEE de planta se pondera por tiempo planificado,
// no es una media aritmetica (ver oeeAgregado en dominio/oee.ts).
// ---------------------------------------------------------------------------
export async function agregarDias(
  db: Consulta, siteId: string, desde: string, hasta: string,
): Promise<number> {
  const { rowCount } = await db.query(
    `insert into production_metric
       (tenant_id, asset_node_id, product_id, span, bucket, fin,
        t_calendario, t_planificado, t_marcha, t_parada, t_microparada,
        uds_ok, uds_nok, disponibilidad, rendimiento, calidad, oee, cobertura, entradas)
     select fr_tenant(), pm.asset_node_id, null, 'dia',
            date_trunc('day', pm.bucket), date_trunc('day', pm.bucket) + interval '1 day',
            sum(pm.t_calendario), sum(pm.t_planificado), sum(pm.t_marcha),
            sum(pm.t_parada), sum(pm.t_microparada),
            sum(pm.uds_ok), sum(pm.uds_nok),
            sum(pm.disponibilidad * pm.t_planificado) / nullif(sum(pm.t_planificado),0),
            sum(pm.rendimiento    * pm.t_planificado) / nullif(sum(pm.t_planificado),0),
            sum(pm.calidad        * pm.t_planificado) / nullif(sum(pm.t_planificado),0),
            sum(pm.oee            * pm.t_planificado) / nullif(sum(pm.t_planificado),0),
            min(pm.cobertura),
            jsonb_build_object('turnos', count(*))
       from production_metric pm
       join asset_node an on an.id = pm.asset_node_id
      where an.site_id = $1 and pm.span = 'turno'
        and pm.bucket >= $2 and pm.bucket < $3
      group by pm.asset_node_id, date_trunc('day', pm.bucket)
     on conflict (tenant_id, asset_node_id, span, bucket, product_id)
     do update set uds_ok = excluded.uds_ok, uds_nok = excluded.uds_nok,
                   oee = excluded.oee, disponibilidad = excluded.disponibilidad,
                   rendimiento = excluded.rendimiento, calidad = excluded.calidad,
                   calculado_en = now()`,
    [siteId, desde, hasta]);
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Energia. La metrica que manda es kWh por unidad producida: el consumo
// absoluto sube y baja con la produccion y no dice nada.
// ---------------------------------------------------------------------------
export async function calcularEnergia(
  db: Consulta, siteId: string, desde: string, hasta: string,
): Promise<number> {
  const { rowCount } = await db.query(
    `with lecturas as (
       select s.asset_node_id,
              date_trunc('day', m.ts) as bucket,
              -- Los kW se muestrean cada 5 min: la energia es la media por el
              -- tiempo, no la suma de las muestras.
              avg(m.value) * 24 as kwh,
              max(m.value) as kw_pico,
              -- Fuera de horario productivo: el hallazgo mas rentable y el mas
              -- facil de defender, porque es una resta y no un modelo.
              avg(m.value) filter (
                where not exists (
                  select 1 from shift_instance si
                   where si.site_id = $1 and m.ts >= si.inicio_ts and m.ts < si.fin_ts
                )) as kw_ocioso
         from measurement m
         join signal s on s.id = m.signal_id
         join asset_node an on an.id = s.asset_node_id
        where an.site_id = $1 and s.clase = 'energia'
          and m.ts >= $2 and m.ts < $3 and m.quality in (0,3)
        group by s.asset_node_id, date_trunc('day', m.ts)
     ),
     produccion as (
       select asset_node_id, bucket, sum(uds_ok) as uds
         from production_metric where span = 'dia' group by asset_node_id, bucket
     )
     insert into energy_reading
       (tenant_id, asset_node_id, span, bucket, kwh, kw_pico,
        uds_producidas, kwh_por_ud, fuera_horario, coste_eur)
     select fr_tenant(), l.asset_node_id, 'dia', l.bucket,
            l.kwh, l.kw_pico, p.uds,
            l.kwh / nullif(p.uds, 0),
            coalesce(l.kw_ocioso, 0) > 1,
            l.kwh * (select precio_kwh from site where id = $1)
       from lecturas l
       left join produccion p
              on p.asset_node_id = l.asset_node_id and p.bucket = l.bucket
     on conflict (tenant_id, asset_node_id, span, bucket)
     do update set kwh = excluded.kwh, kw_pico = excluded.kw_pico,
                   uds_producidas = excluded.uds_producidas,
                   kwh_por_ud = excluded.kwh_por_ud,
                   fuera_horario = excluded.fuera_horario,
                   coste_eur = excluded.coste_eur`,
    [siteId, desde, hasta]);
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Linea base POR CONTEXTO (decision 09).
//
// La clave es (nodo, metrica, producto, turno). Una linea base global dispara
// falsos positivos en cada cambio de formato, y a las dos semanas nadie mira
// las alertas.
//
// Se calcula sobre una ventana que EXCLUYE los ultimos dias: si el periodo que
// vamos a evaluar entra en su propia referencia, el problema se diluye en ella
// y deja de detectarse. Es el fallo silencioso clasico de este calculo.
// ---------------------------------------------------------------------------
export async function calcularLineaBase(
  db: Consulta, siteId: string, hasta: string, diasVentana = 60, diasExcluidos = 10,
): Promise<number> {
  const fin = new Date(new Date(hasta).getTime() - diasExcluidos * 86400_000).toISOString();
  const ini = new Date(new Date(fin).getTime() - diasVentana * 86400_000).toISOString();

  const { rowCount: nEspecificas } = await db.query(
    `insert into baseline
       (tenant_id, asset_node_id, metrica, product_id, shift_id, span,
        media, desviacion, p05, p50, p95, n_muestras, suficiente, desde, hasta)
     select fr_tenant(), pm.asset_node_id, 'rendimiento', pm.product_id, si.shift_id, 'turno',
            avg(pm.rendimiento), coalesce(stddev_samp(pm.rendimiento), 0),
            percentile_cont(0.05) within group (order by pm.rendimiento),
            percentile_cont(0.50) within group (order by pm.rendimiento),
            percentile_cont(0.95) within group (order by pm.rendimiento),
            count(*)::int, count(*) >= $4, $2, $3
       from production_metric pm
       join asset_node an on an.id = pm.asset_node_id
       join shift_instance si on si.id = pm.shift_instance_id
      where an.site_id = $1 and pm.span = 'turno'
        and pm.bucket >= $2 and pm.bucket < $3 and pm.rendimiento is not null
      group by pm.asset_node_id, pm.product_id, si.shift_id
     on conflict on constraint baseline_clave
     do update set media = excluded.media, desviacion = excluded.desviacion,
                   p05 = excluded.p05, p50 = excluded.p50, p95 = excluded.p95,
                   n_muestras = excluded.n_muestras, suficiente = excluded.suficiente,
                   desde = excluded.desde, hasta = excluded.hasta, calculado_en = now()`,
    [siteId, ini, fin, MUESTRAS_MINIMAS]);

  // -------------------------------------------------------------------------
  // Linea base GENERICA, sin producto: (nodo, turno).
  //
  // El punto ciego que la trajo: un producto estrenado hace seis dias no tiene
  // linea base propia, asi que una caida de rendimiento justo despues de un
  // cambio de formato era INDETECTABLE. Y el cambio de formato es la causa mas
  // frecuente de una caida de rendimiento: el motor estaba ciego justo donde
  // mas falta hace que vea.
  //
  // Se puede comparar entre productos porque el rendimiento ya esta normalizado
  // contra el ciclo nominal: es una fraccion de lo que la maquina deberia dar
  // con ESE formato. Si la ficha del producto esta bien, una maquina que va al
  // 88% con un formato deberia ir al 88% con otro.
  //
  // Es un comparador peor que el especifico y se usa SOLO cuando no hay
  // especifico, bajando la confianza y diciendolo en la alerta.
  const { rowCount: nGenericas } = await db.query(
    `insert into baseline
       (tenant_id, asset_node_id, metrica, product_id, shift_id, span,
        media, desviacion, p05, p50, p95, n_muestras, suficiente, desde, hasta)
     select fr_tenant(), pm.asset_node_id, 'rendimiento', null, si.shift_id, 'turno',
            avg(pm.rendimiento), coalesce(stddev_samp(pm.rendimiento), 0),
            percentile_cont(0.05) within group (order by pm.rendimiento),
            percentile_cont(0.50) within group (order by pm.rendimiento),
            percentile_cont(0.95) within group (order by pm.rendimiento),
            count(*)::int, count(*) >= $4, $2, $3
       from production_metric pm
       join asset_node an on an.id = pm.asset_node_id
       join shift_instance si on si.id = pm.shift_instance_id
      where an.site_id = $1 and pm.span = 'turno'
        and pm.bucket >= $2 and pm.bucket < $3 and pm.rendimiento is not null
      group by pm.asset_node_id, si.shift_id
     on conflict on constraint baseline_clave
     do update set media = excluded.media, desviacion = excluded.desviacion,
                   p05 = excluded.p05, p50 = excluded.p50, p95 = excluded.p95,
                   n_muestras = excluded.n_muestras, suficiente = excluded.suficiente,
                   desde = excluded.desde, hasta = excluded.hasta, calculado_en = now()`,
    [siteId, ini, fin, MUESTRAS_MINIMAS]);

  return (nEspecificas ?? 0) + (nGenericas ?? 0);
}
