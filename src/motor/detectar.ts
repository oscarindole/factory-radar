// ---------------------------------------------------------------------------
// Detectores: de la metrica a la alerta.
//
// Todo esto es capa 1 y 2 —reglas y estadistica sobre el dato—. El LLM NO
// detecta nada aqui: cuando llega, la anomalia ya existe y solo la explica en
// castellano (decision 07).
//
// Ninguna alerta se inserta sin `impacto_base` y `evidencia`: es restriccion
// del esquema, no buena intencion de este fichero.
// ---------------------------------------------------------------------------
import type { Consulta } from '../db.ts';
import { impactoRendimiento, impactoConsumoOcioso } from '../dominio/impacto.ts';
import { calcularSeveridad, aplicarTope, TOPE_CRITICAS_SEMANA } from '../dominio/severidad.ts';

interface Candidata {
  asset_node_id: string | null;
  modulo: string;
  severidad: 'critica' | 'alta' | 'media' | 'baja';
  puntos: number;
  confianza: number;
  titulo: string;
  que_cambio: string;
  por_que: string | null;
  impacto_eur_anual: number | null;
  impacto_base: unknown;
  evidencia: unknown;
  accion: string | null;
}

// ---------------------------------------------------------------------------
// Caida de rendimiento contra la linea base propia del nodo, para ESE producto
// y ESE turno.
//
// La deteccion se hace por (nodo, producto, turno) porque es la unica forma de
// comparar contra algo comparable — pero la ALERTA se emite por nodo. La
// primera version emitia una por grupo y la bandeja mostraba la estacion P4
// tres veces, una por turno: el mismo problema repetido es peor que no
// avisarlo, porque enseña a ignorar la bandeja.
//
// MINIMO_TURNOS existe por el mismo motivo: sin el, un unico turno malo
// —justo despues de un cambio de formato, cuando aun no hay linea base del
// producto nuevo— generaba una critica de 180.000 €/año.
// ---------------------------------------------------------------------------
const MINIMO_TURNOS = 3;

async function rendimiento(
  db: Consulta, siteId: string, hasta: string, dias: number,
): Promise<Candidata[]> {
  const desde = new Date(new Date(hasta).getTime() - dias * 86400_000).toISOString();

  // Se agrupa primero y se busca la linea base despues, con LATERAL: asi se
  // puede PREFERIR la del producto y caer en la generica solo si no existe.
  // Con un JOIN normal, el grupo sin linea base propia desaparecia en silencio.
  const { rows } = await db.query(
    `with g as (
       select pm.asset_node_id, pm.product_id, si.shift_id,
              avg(pm.rendimiento) as actual,
              sum(pm.t_planificado) as t_plan,
              count(*)::int as turnos
         from production_metric pm
         join asset_node an on an.id = pm.asset_node_id
         join shift_instance si on si.id = pm.shift_instance_id
        where an.site_id = $1 and pm.span = 'turno'
          and pm.bucket >= $2 and pm.bucket < $3 and pm.rendimiento is not null
        group by pm.asset_node_id, pm.product_id, si.shift_id
       having count(*) >= $4
     )
     select an.id, an.codigo, an.nombre, an.criticidad,
            p.codigo as producto, p.margen_unitario,
            coalesce(p.ciclo_nominal_s, an.ciclo_nominal_s) as ciclo_nominal_s,
            sh.nombre as turno,
            g.actual, g.t_plan, g.turnos,
            b.media as base, b.desviacion, b.n_muestras,
            (b.product_id is null) as base_generica
       from g
       join asset_node an on an.id = g.asset_node_id
       join shift sh on sh.id = g.shift_id
       left join product p on p.id = g.product_id
       join lateral (
         select b.* from baseline b
          where b.asset_node_id = g.asset_node_id
            and b.metrica = 'rendimiento' and b.span = 'turno'
            and b.shift_id = g.shift_id and b.suficiente
            and (b.product_id = g.product_id or b.product_id is null)
          order by (b.product_id is not null) desc
          limit 1
       ) b on true
      where g.actual < b.media - greatest(2 * b.desviacion, 0.04)`,
    [siteId, desde, hasta, MINIMO_TURNOS]);

  // Nota: se usa un alias explicito en vez de `typeof rows`. El borrado de
  // tipos nativo de Node no traga el segundo, y falla con un mensaje que no
  // dice donde: "Expected ',', got 'ident'".
  type FilaRend = Record<string, any>;

  // Un candidato por NODO. Se queda el grupo con mas caida y los demas pasan a
  // ser evidencia: "afecta tambien a tarde y noche" dice mas que tres alertas.
  const porNodo = new Map<string, FilaRend[]>();
  for (const r of rows) {
    const g = porNodo.get(r.id) ?? [];
    g.push(r);
    porNodo.set(r.id, g);
  }

  const salida: Candidata[] = [];
  for (const [nodoId, grupos] of porNodo) {
    grupos.sort((a, b) =>
      (Number(b.base) - Number(b.actual)) - (Number(a.base) - Number(a.actual)));
    const r = grupos[0]!;
    const caida = Number(r.base) - Number(r.actual);

    // El impacto se suma sobre TODOS los grupos del nodo: si pierde en los tres
    // turnos, el dinero es el de los tres, no el del peor.
    let eurAnual = 0, eurVentana = 0, sinMargen = false;
    const detalleBase: Record<string, unknown>[] = [];
    for (const g of grupos) {
      const segSemana = (Number(g.t_plan) / dias) * 7;
      const capacidad = g.ciclo_nominal_s > 0 ? segSemana / Number(g.ciclo_nominal_s) : 0;
      const imp = impactoRendimiento({
        rendimientoBase: Number(g.base),
        rendimientoActual: Number(g.actual),
        capacidadSemanalUds: capacidad,
        margenUnitario: g.margen_unitario === null ? null : Number(g.margen_unitario),
      });
      if (imp.eurAnual === null) sinMargen = true;
      eurAnual += imp.eurAnual ?? 0;
      eurVentana += imp.eurVentana ?? 0;
      detalleBase.push({ turno: g.turno, producto: g.producto, ...imp.base });
    }

    const totalTurnos = grupos.reduce((a, g) => a + g.turnos, 0);
    // La base generica compara contra el mismo nodo fabricando OTRO producto.
    // Es un comparador legitimo —el rendimiento ya va normalizado al ciclo
    // nominal— pero peor, y la alerta tiene que decirlo en vez de disimularlo.
    const generica = grupos.every((g) => g.base_generica);
    const conf = Math.min(95, Math.round(
      50 + Math.min(25, r.n_muestras) + Math.min(15, (caida / 0.14) * 15)
      + Math.min(5, totalTurnos))) - (generica ? 12 : 0);

    const { rows: [micro] } = await db.query(
      `select count(*)::int as n, coalesce(avg(duracion_s),0)::int as media
         from event where asset_node_id = $1 and tipo = 'microstop'
          and ts_start >= $2 and ts_start < $3`, [nodoId, desde, hasta]);
    const { rows: [antes] } = await db.query(
      `select (count(*)::numeric / 30)::int as por_dia
         from event where asset_node_id = $1 and tipo = 'microstop'
          and ts_start >= $2 and ts_start < $3`,
      [nodoId, new Date(new Date(desde).getTime() - 30 * 86400_000).toISOString(), desde]);

    const porDia = dias > 0 ? Math.round(micro.n / dias) : 0;
    const porQue = micro.n > 0 && porDia > (antes.por_dia ?? 0) * 2
      ? `${micro.n} microparadas en ${dias} días (${porDia}/día frente a ` +
        `${antes.por_dia ?? 0} habituales), de ${micro.media} s de media.` +
        (r.producto ? ` Coincide con la fabricación de ${r.producto}.` : '')
      : null;

    const otrosTurnos = grupos.slice(1).map((g) => g.turno);
    const sev = calcularSeveridad({
      impactoEurAnual: sinMargen ? null : Math.round(eurAnual * 100) / 100,
      criticidad: r.criticidad, velocidadDeriva: caida,
      confianza: conf, irreversible: false,
    });

    salida.push({
      asset_node_id: nodoId, modulo: 'production',
      severidad: sev.severidad, puntos: sev.puntos, confianza: conf,
      titulo: `${r.nombre} · el rendimiento cayó del ` +
              `${(Number(r.base) * 100).toFixed(0)}% al ${(Number(r.actual) * 100).toFixed(0)}%`,
      que_cambio:
        `Turno de ${r.turno}: media de ${(Number(r.actual) * 100).toFixed(1)}% en ` +
        `${r.turnos} turnos de los últimos ${dias} días, frente a una línea base de ` +
        `${(Number(r.base) * 100).toFixed(1)}%.` +
        (otrosTurnos.length ? ` Afecta también a ${otrosTurnos.join(' y ')}.` : '') +
        (generica
          ? ` ${r.producto ?? 'Este formato'} es demasiado reciente para tener línea base ` +
            `propia: se compara con el comportamiento de la máquina en otros formatos.`
          : ''),
      por_que: porQue,
      impacto_eur_anual: sinMargen ? null : Math.round(eurAnual * 100) / 100,
      impacto_base: {
        formula: 'suma por turno de uds_perdidas_semana * margen_unitario * semanas_anio',
        eur_semana: Math.round(eurVentana * 100) / 100,
        turnos_afectados: grupos.length,
        detalle: detalleBase,
      },
      evidencia: [
        { tipo: 'nodo', codigo: r.codigo },
        { tipo: 'ventana', desde, hasta, turnos: totalTurnos },
        { tipo: 'linea_base', muestras: r.n_muestras, media: Number(r.base),
          minimo_turnos_exigido: MINIMO_TURNOS,
          comparador: generica ? 'genérico (nodo × turno)' : 'específico del producto' },
        ...(micro.n > 0 ? [{ tipo: 'eventos', microparadas: micro.n }] : []),
      ],
      accion: porQue
        ? `Revisar el ajuste de ${r.codigo}${r.producto ? ` para el formato ${r.producto}` : ''}.`
        : `Comparar tiempos de ciclo de ${r.codigo} con su histórico.`,
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Consumo con la planta parada. Es una resta, no un modelo, y por eso es el
// hallazgo mas facil de defender delante del cliente.
// ---------------------------------------------------------------------------
async function consumoOcioso(
  db: Consulta, siteId: string, hasta: string, dias: number,
): Promise<Candidata[]> {
  const desde = new Date(new Date(hasta).getTime() - dias * 86400_000).toISOString();

  const { rows } = await db.query(
    `select an.id, an.codigo, an.nombre, an.criticidad,
            avg(m.value) as kw,
            count(*) * 5.0 / 60 as horas_muestreadas,
            (select precio_kwh from site where id = $1) as precio
       from measurement m
       join signal s on s.id = m.signal_id
       join asset_node an on an.id = s.asset_node_id
      where an.site_id = $1 and s.clase = 'energia'
        and m.ts >= $2 and m.ts < $3 and m.quality in (0,3)
        and not exists (
          select 1 from shift_instance si
           where si.site_id = $1 and m.ts >= si.inicio_ts and m.ts < si.fin_ts)
      group by an.id, an.codigo, an.nombre, an.criticidad
      having avg(m.value) > 5`,
    [siteId, desde, hasta]);

  const salida: Candidata[] = [];
  for (const r of rows) {
    const horasSemana = (Number(r.horas_muestreadas) / dias) * 7;
    const imp = impactoConsumoOcioso({
      kwMedios: Math.round(Number(r.kw) * 10) / 10,
      horasSemana: Math.round(horasSemana),
      precioKwh: r.precio === null ? null : Number(r.precio),
    });
    const sev = calcularSeveridad({
      impactoEurAnual: imp.eurAnual, criticidad: r.criticidad,
      velocidadDeriva: 0, confianza: 92, irreversible: false,
    });

    salida.push({
      asset_node_id: r.id, modulo: 'energy',
      severidad: sev.severidad, puntos: sev.puntos, confianza: 92,
      titulo: `${r.nombre} · consume ${Number(r.kw).toFixed(0)} kW con la planta parada`,
      que_cambio: `Fuera del horario productivo mantiene ${Number(r.kw).toFixed(1)} kW ` +
                  `de media, unas ${Math.round(horasSemana)} h por semana.`,
      por_que: 'El equipo no se detiene al acabar el último turno.',
      impacto_eur_anual: imp.eurAnual,
      impacto_base: imp.base,
      evidencia: [
        { tipo: 'nodo', codigo: r.codigo },
        { tipo: 'ventana', desde, hasta },
        { tipo: 'criterio', regla: 'consumo fuera de toda instancia de turno' },
      ],
      accion: `Programar la parada automática de ${r.codigo} al cierre del último turno.`,
    });
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Correlacion defecto ↔ lote ↔ proveedor.
//
// Se presenta SIEMPRE como correlacion, nunca como causa: el sistema aporta la
// evidencia y la fuerza; quien decide que es causa es el responsable de
// calidad. Con muestra pequeña no se afirma nada: se marca señal debil y NO
// genera alerta.
// ---------------------------------------------------------------------------
const N_MINIMO_CORRELACION = 30;

async function correlacionCalidad(
  db: Consulta, siteId: string, hasta: string, dias: number,
): Promise<Candidata[]> {
  const desde = new Date(new Date(hasta).getTime() - dias * 86400_000).toISOString();

  // La ventana es LARGA a proposito (45 dias, no 21).
  //
  // Con una ventana ajustada al periodo del lote malo, el lote sale al 100% de
  // los rechazos... porque es el unico lote que hay dentro. Un 100% no es una
  // correlacion, es un artefacto de la ventana, y el responsable de calidad lo
  // huele enseguida. Con lotes anteriores dentro de la comparacion, el numero
  // que sale es del orden del 60% y ya significa algo.
  const { rows } = await db.query(
    `with total as (
       select product_id, sum(cantidad) as uds, count(*)::int as n
         from quality_incident
        where site_id = $1 and detectado_en >= $2 and detectado_en < $3
        group by product_id
     ),
     lotes as (
       select product_id, count(distinct d.lote)::int as n_lotes
         from quality_incident qi join delivery d on d.id = qi.delivery_id
        where qi.site_id = $1 and qi.detectado_en >= $2 and qi.detectado_en < $3
        group by product_id
     )
     select p.codigo as producto, p.nombre as producto_nombre,
            s.nombre as proveedor, s.codigo as prov_codigo, d.lote,
            sum(qi.cantidad) as uds, count(*)::int as n,
            sum(coalesce(qi.coste_eur, 0)) as eur,
            t.uds as uds_total, t.n as n_total, l.n_lotes,
            min(qi.detectado_en) as primero, max(qi.detectado_en) as ultimo
       from quality_incident qi
       join delivery d on d.id = qi.delivery_id
       join supplier s on s.id = d.supplier_id
       join product p on p.id = qi.product_id
       join total t on t.product_id = qi.product_id
       join lotes l on l.product_id = qi.product_id
      where qi.site_id = $1 and qi.detectado_en >= $2 and qi.detectado_en < $3
      group by p.codigo, p.nombre, s.nombre, s.codigo, d.lote, t.uds, t.n, l.n_lotes
      -- Con un solo lote en la ventana no hay nada contra lo que comparar.
      having l.n_lotes >= 2
         and sum(qi.cantidad) > 0.4 * t.uds
         and t.n >= $4`,
    [siteId, desde, hasta, N_MINIMO_CORRELACION]);

  return rows.map((r) => {
    const pct = Math.round((Number(r.uds) / Number(r.uds_total)) * 100);
    const eur = Math.round(Number(r.eur) * 100) / 100;
    const conf = Math.min(92, 55 + Math.round(r.n_total / 8) + (r.n_lotes >= 4 ? 8 : 0));

    // NO se anualiza. Un lote defectuoso se acaba cuando se acaba el lote;
    // multiplicarlo por 365/45 daba 686.000 €/año en la primera version, una
    // cifra que ningun director de planta se cree ni un segundo.
    const sev = calcularSeveridad({
      impactoEurAnual: null,
      impactoEurVentana: eur,
      criticidad: 4, velocidadDeriva: 0.2,
      confianza: conf, irreversible: false,
    });

    return {
      asset_node_id: null, modulo: 'quality',
      severidad: sev.severidad, puntos: sev.puntos, confianza: conf,
      titulo: `Proveedor ${r.proveedor} · ${pct}% de los rechazos de ${r.producto}`,
      que_cambio: `${pct}% de las unidades rechazadas de ${r.producto} en los últimos ` +
                  `${dias} días corresponden al lote ${r.lote}, de ${r.proveedor}. ` +
                  `En la ventana hay ${r.n_lotes} lotes distintos.`,
      // "asociados a", nunca "causados por". La diferencia importa el dia que
      // haya una coincidencia falsa, y la habra.
      por_que: `Correlación, no causa demostrada: n=${r.n_total} incidencias sobre ` +
               `${r.n_lotes} lotes. Confirmar con un ensayo del material.`,
      impacto_eur_anual: null,
      impacto_base: {
        formula: 'coste de los rechazos ya imputados al lote',
        nota: 'No se anualiza: el problema termina con el lote.',
        coste_incurrido_eur: eur,
        uds_rechazadas: Number(r.uds),
        pct_sobre_producto: pct,
        lotes_en_ventana: r.n_lotes,
        dias_ventana: dias,
      },
      evidencia: [
        { tipo: 'lote', codigo: r.lote, proveedor: r.prov_codigo },
        { tipo: 'producto', codigo: r.producto },
        { tipo: 'muestra', n: r.n_total, lotes: r.n_lotes,
          minimo_exigido: N_MINIMO_CORRELACION },
        { tipo: 'ventana', desde: r.primero, hasta: r.ultimo },
      ],
      accion: `Bloquear el lote ${r.lote} y abrir reclamación a ${r.proveedor}.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Salud del activo. Cuatro componentes, siempre abiertos, y los pesos se
// guardan CON la fila: un score historico calculado con otros pesos tiene que
// seguir siendo legible.
// ---------------------------------------------------------------------------
export const PESOS_SALUD = {
  fiabilidad: 0.35, comportamiento: 0.25, mantenimiento: 0.20, criticidad: 0.20,
};

export async function calcularSalud(
  db: Consulta, siteId: string, fecha: string,
): Promise<number> {
  const { rowCount } = await db.query(
    `with v as (
       select an.id, an.criticidad, an.tipo,
              -- SOLO averias no planificadas.
              --
              -- La primera version contaba todo evento 'stop', descansos de
              -- turno incluidos: ~50 al mes por maquina, que con la penalizacion
              -- dejaba la fiabilidad de TODA la planta en 0. Un componente que
              -- vale lo mismo para todos los activos no informa de nada.
              (select count(*) from event e
                left join reason_code rc on rc.id = e.reason_code_id
                where e.asset_node_id = an.id and e.tipo = 'stop'
                  and coalesce(rc.planificada, false) = false
                  and e.ts_start >= $2::date - 30 and e.ts_start < $2::date) as averias_30,
              (select count(*) / 2.0 from event e
                left join reason_code rc on rc.id = e.reason_code_id
                where e.asset_node_id = an.id and e.tipo = 'stop'
                  and coalesce(rc.planificada, false) = false
                  and e.ts_start >= $2::date - 90 and e.ts_start < $2::date - 30) as averias_prev,
              (select count(*) from event e
                where e.asset_node_id = an.id and e.tipo = 'alarm'
                  and e.ts_start >= $2::date - 30 and e.ts_start < $2::date) as alarmas_30,
              -- Consumo especifico para lo que produce; consumo absoluto para
              -- lo que no. Un compresor no fabrica unidades, asi que su kWh/ud
              -- es NULL y su deriva quedaba invisible: justo el activo del que
              -- va el caso de uso de mantenimiento predictivo.
              (select avg(coalesce(er.kwh_por_ud, er.kwh)) from energy_reading er
                where er.asset_node_id = an.id
                  and er.bucket >= $2::date - 14 and er.bucket < $2::date) as consumo_14,
              (select avg(coalesce(er.kwh_por_ud, er.kwh)) from energy_reading er
                where er.asset_node_id = an.id
                  and er.bucket >= $2::date - 90 and er.bucket < $2::date - 30) as consumo_base
         from asset_node an
        where an.site_id = $1 and an.tipo in ('maquina','auxiliar') and an.activo
     ),
     c as (
       select id, criticidad, averias_30, averias_prev, alarmas_30,
              consumo_14, consumo_base,
              -- Contra si mismo, no contra el sector: penaliza el nivel de
              -- averias y ademas el EMPEORAMIENTO respecto a su propia media.
              greatest(0, least(100, round(
                100 - least(60, averias_30 * 8)
                    - least(20, greatest(0, averias_30 - averias_prev) * 10)
              )))::int as fiabilidad,
              greatest(0, least(100, round(
                case when consumo_base > 0
                     then 100 - least(45, greatest(0,
                            (consumo_14 - consumo_base) / consumo_base) * 250)
                     -- Sin serie de consumo no se afirma que este bien: se parte
                     -- de 85 y se anota en la columna entradas que falta el dato.
                     else 85 end
                - least(30, alarmas_30 * 3)
              )))::int as comportamiento,
              85 as mantenimiento,
              (round((6 - criticidad) * 20))::int as c_criticidad
         from v
     )
     insert into asset_score
       (tenant_id, asset_node_id, fecha, score, c_fiabilidad, c_comportamiento,
        c_mantenimiento, c_criticidad, pesos, entradas)
     select fr_tenant(), c.id, $2::date,
            round(fiabilidad * 0.35 + comportamiento * 0.25
                  + mantenimiento * 0.20 + c_criticidad * 0.20),
            fiabilidad, comportamiento, mantenimiento, c_criticidad,
            $3::jsonb,
            jsonb_build_object(
              'averias_30d', averias_30,
              'averias_media_30d_previa', round(averias_prev::numeric, 1),
              'alarmas_30d', alarmas_30,
              'consumo_14d', round(consumo_14::numeric, 3),
              'consumo_base', round(consumo_base::numeric, 3),
              'deriva_consumo_pct', case when consumo_base > 0
                then round((((consumo_14 - consumo_base) / consumo_base) * 100)::numeric, 1)
                else null end,
              'sin_plan_preventivo', true)
       from c
     on conflict (tenant_id, asset_node_id, fecha)
     do update set score = excluded.score, c_fiabilidad = excluded.c_fiabilidad,
                   c_comportamiento = excluded.c_comportamiento,
                   c_criticidad = excluded.c_criticidad, entradas = excluded.entradas`,
    [siteId, fecha, JSON.stringify(PESOS_SALUD)]);
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Ciclo completo. Detecta, aplica el tope de criticas y escribe.
// ---------------------------------------------------------------------------
export async function detectar(
  db: Consulta, siteId: string, hasta: string,
): Promise<{ creadas: number; degradadas: number }> {
  let candidatas = [
    ...(await rendimiento(db, siteId, hasta, 7)),
    ...(await consumoOcioso(db, siteId, hasta, 14)),
    ...(await correlacionCalidad(db, siteId, hasta, 45)),
  ];

  // ---------------------------------------------------------------------------
  // Si una linea y una de sus maquinas avisan de lo mismo, se queda la maquina.
  //
  // La linea se mide en su cuello de botella, asi que la alerta de la Linea 3 y
  // la de la Estacion P4 SON el mismo problema: una lo nombra y la otra no. La
  // que sirve es la que dice donde poner el destornillador.
  // ---------------------------------------------------------------------------
  const conNodo = candidatas.filter((c) => c.asset_node_id);
  if (conNodo.length > 1) {
    const { rows: rutas } = await db.query(
      `select id, ruta from asset_node where id = any($1::uuid[])`,
      [conNodo.map((c) => c.asset_node_id)]);
    const ruta = new Map(rutas.map((r) => [r.id, r.ruta ?? []]));
    const descendientes = new Set<string>();
    for (const c of conNodo) {
      for (const ancestro of ruta.get(c.asset_node_id!) ?? []) {
        // marca al ancestro como redundante SOLO dentro del mismo modulo
        for (const otra of conNodo) {
          if (otra.asset_node_id === ancestro && otra.modulo === c.modulo) {
            descendientes.add(`${ancestro}|${c.modulo}`);
          }
        }
      }
    }
    candidatas = candidatas.filter(
      (c) => !descendientes.has(`${c.asset_node_id}|${c.modulo}`));
  }

  // El tope no esconde nada: lo que sobra baja a 'alta' y se cuenta. Si el
  // motor genera mas de cinco criticas por semana, el problema es de
  // calibracion y hay que verlo, no taparlo (decision 10).
  const criticas = candidatas.filter((c) => c.severidad === 'critica');
  const { degradadas } = aplicarTope(criticas);

  let creadas = 0;
  for (const c of candidatas) {
    const { rowCount } = await db.query(
      `insert into alert
         (tenant_id, site_id, asset_node_id, modulo, severidad, confianza,
          titulo, que_cambio, por_que, impacto_eur_anual, impacto_base,
          evidencia, accion_recomendada)
       select fr_tenant(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        where not exists (
          select 1 from alert a
           where a.titulo = $6 and a.estado = 'abierta'
             and a.detectado_en > now() - interval '7 days')`,
      [siteId, c.asset_node_id, c.modulo, c.severidad, c.confianza,
       c.titulo, c.que_cambio, c.por_que, c.impacto_eur_anual,
       JSON.stringify(c.impacto_base), JSON.stringify(c.evidencia), c.accion]);
    creadas += rowCount ?? 0;
  }
  return { creadas, degradadas };
}

export { TOPE_CRITICAS_SEMANA };
