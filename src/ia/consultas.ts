// ---------------------------------------------------------------------------
// Catalogo de consultas del Copilot.
//
// EL COPILOT NO ESCRIBE SQL (decision 08). Dejar que un LLM escriba SQL libre
// contra la base de un cliente industrial es inaceptable por tres motivos a la
// vez: inyeccion, fuga entre inquilinos, y consultas que tumban la base.
//
// El modelo elige una plantilla de esta lista y rellena sus parametros. Lo que
// no encaja en ninguna se responde con "no se contestar a eso todavia" y se
// registra: ese registro es el backlog del Copilot, escrito por los usuarios.
//
// Cada plantilla declara el permiso que exige. El rol de quien pregunta se
// aplica AQUI: la IA no es una puerta trasera a los permisos.
// ---------------------------------------------------------------------------

export interface Plantilla {
  id: string;
  descripcion: string;
  permiso: string;
  parametros: string[];
  sql: string;
}

export const CATALOGO: Plantilla[] = [
  {
    id: 'oee_por_linea',
    descripcion: 'OEE de cada linea en un rango de fechas',
    permiso: 'produccion.ver',
    parametros: ['siteId', 'desde', 'hasta'],
    sql: `select an.codigo, an.nombre,
                 sum(pm.oee * pm.t_planificado) / nullif(sum(pm.t_planificado), 0) as oee,
                 sum(pm.uds_ok) as uds_ok, sum(pm.uds_nok) as uds_nok,
                 min(pm.cobertura) as cobertura
            from production_metric pm
            join asset_node an on an.id = pm.asset_node_id
           where an.site_id = $1 and an.tipo = 'linea'
             and pm.bucket >= $2 and pm.bucket < $3
           group by an.codigo, an.nombre
           order by oee asc nulls last`,
  },
  {
    id: 'paradas_por_causa',
    descripcion: 'Paradas agrupadas por causa, con tiempo total',
    permiso: 'produccion.ver',
    parametros: ['siteId', 'desde', 'hasta'],
    sql: `select coalesce(rc.nombre, 'SIN CAUSA REGISTRADA') as causa,
                 count(*) as n, sum(e.duracion_s) / 3600.0 as horas
            from event e
            join asset_node an on an.id = e.asset_node_id
            left join reason_code rc on rc.id = e.reason_code_id
           where an.site_id = $1 and e.tipo in ('stop','microstop')
             and e.ts_start >= $2 and e.ts_start < $3
           group by causa order by horas desc nulls last limit 20`,
  },
  {
    id: 'maquina_mas_paradas',
    descripcion: 'Que maquina ha generado mas paradas',
    permiso: 'produccion.ver',
    parametros: ['siteId', 'desde', 'hasta'],
    sql: `select an.codigo, an.nombre, count(*) as paradas,
                 sum(e.duracion_s) / 3600.0 as horas,
                 sum(e.duracion_s) / 3600.0 * coalesce(an.coste_parada_hora, 0) as coste_eur
            from event e join asset_node an on an.id = e.asset_node_id
           where an.site_id = $1 and e.tipo = 'stop'
             and e.ts_start >= $2 and e.ts_start < $3
           group by an.codigo, an.nombre, an.coste_parada_hora
           order by horas desc limit 10`,
  },
  {
    id: 'coste_scrap',
    descripcion: 'Cuanto dinero se ha perdido por scrap',
    permiso: 'calidad.ver',
    parametros: ['siteId', 'desde', 'hasta'],
    sql: `select p.codigo, p.nombre, sum(qi.cantidad) as uds,
                 sum(coalesce(qi.coste_eur, qi.cantidad * p.margen_unitario)) as eur
            from quality_incident qi
            left join product p on p.id = qi.product_id
           where qi.site_id = $1 and qi.detectado_en >= $2 and qi.detectado_en < $3
           group by p.codigo, p.nombre order by eur desc nulls last limit 15`,
  },
  {
    id: 'consumo_por_linea',
    descripcion: 'Que linea consume mas, en absoluto y por unidad',
    permiso: 'energia.ver',
    parametros: ['siteId', 'desde', 'hasta'],
    sql: `select an.codigo, an.nombre, sum(er.kwh) as kwh,
                 sum(er.coste_eur) as eur,
                 sum(er.kwh) / nullif(sum(er.uds_producidas), 0) as kwh_por_ud
            from energy_reading er join asset_node an on an.id = er.asset_node_id
           where an.site_id = $1 and er.bucket >= $2 and er.bucket < $3
           group by an.codigo, an.nombre order by kwh desc limit 15`,
  },
  {
    id: 'proveedor_incidencias',
    descripcion: 'Que proveedor genera mas incidencias de calidad',
    permiso: 'proveedores.ver',
    parametros: ['siteId', 'desde', 'hasta'],
    sql: `select s.codigo, s.nombre, count(qi.id) as incidencias,
                 sum(qi.cantidad) as uds, sum(qi.coste_eur) as eur
            from quality_incident qi
            join delivery d on d.id = qi.delivery_id
            join supplier s on s.id = d.supplier_id
           where qi.site_id = $1 and qi.detectado_en >= $2 and qi.detectado_en < $3
           group by s.codigo, s.nombre order by eur desc nulls last limit 10`,
  },
  {
    id: 'activos_en_riesgo',
    descripcion: 'Que activos deberia revisar mantenimiento',
    permiso: 'mantenimiento.ver',
    parametros: ['siteId'],
    sql: `select an.codigo, an.nombre, sc.score, sc.c_comportamiento,
                 sc.mtbf_h, an.criticidad
            from asset_score sc join asset_node an on an.id = sc.asset_node_id
           where an.site_id = $1 and sc.fecha = current_date
           order by sc.score asc, an.criticidad desc limit 10`,
  },
  {
    id: 'cobertura_causas',
    descripcion: 'Que porcentaje de paradas no tiene causa registrada',
    permiso: 'produccion.ver',
    parametros: ['siteId'],
    sql: `select semana, paradas, sin_causa, pct_sin_causa
            from v_cobertura_causas where site_id = $1
           order by semana desc limit 8`,
  },
];

export function buscar(id: string): Plantilla | undefined {
  return CATALOGO.find((p) => p.id === id);
}

/** Lo que se le enseña al modelo para que elija. Nunca se le enseña el SQL. */
export function catalogoParaModelo(permisos: (p: string) => boolean): string {
  return CATALOGO
    .filter((p) => permisos(p.permiso))
    .map((p) => `${p.id}(${p.parametros.join(', ')}) — ${p.descripcion}`)
    .join('\n');
}
