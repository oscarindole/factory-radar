// ---------------------------------------------------------------------------
// OEE.
//
// Se devuelve SIEMPRE desglosado. Un OEE del 78% no dice nada; un 78% que es
// 95 x 86 x 96 dice que el problema es rendimiento y que hay que mirar tiempos
// de ciclo, no averias. Enseñar solo el numero compuesto es el error clasico
// del sector y aqui esta prohibido por firma: no existe una funcion que
// devuelva unicamente `oee`.
// ---------------------------------------------------------------------------

export interface EntradasOee {
  /** Segundos del intervalo que la planta tenia previsto producir. */
  tPlanificado: number;
  /** Segundos de parada NO planificada dentro de ese intervalo. */
  tParada: number;
  udsOk: number;
  udsNok: number;
  /** Segundos de ciclo nominal. Manda el del producto sobre el del nodo. */
  cicloNominalS: number;
  /** Fraccion del intervalo con dato utilizable (quality 0 o 3). */
  cobertura: number;
}

export interface Oee {
  disponibilidad: number | null;
  rendimiento: number | null;
  calidad: number | null;
  oee: number | null;
  tMarcha: number;
  cobertura: number;
  /** Se guarda en production_metric.entradas para poder abrir el numero. */
  entradas: EntradasOee & { calcVersion: number };
  /** Motivos por los que algun factor no se ha podido calcular. */
  avisos: string[];
}

export const CALC_VERSION_OEE = 1;

/** Cobertura por debajo de la cual el panel atenua el numero y lo explica. */
export const COBERTURA_MINIMA = 0.7;

export function calcularOee(e: EntradasOee): Oee {
  const avisos: string[] = [];
  const tMarcha = Math.max(0, e.tPlanificado - e.tParada);
  const udsTotal = e.udsOk + e.udsNok;

  // Disponibilidad: cuanto del tiempo previsto estuvo realmente en marcha.
  let disponibilidad: number | null = null;
  if (e.tPlanificado > 0) {
    disponibilidad = tMarcha / e.tPlanificado;
  } else {
    avisos.push('Sin tiempo planificado: no se puede calcular disponibilidad.');
  }

  // Rendimiento: lo producido frente a lo que daba el ciclo nominal en el
  // tiempo que estuvo en marcha.
  //
  // Se acota a 1. Un rendimiento del 118% no significa que la maquina supere su
  // fisica: significa que el ciclo nominal esta mal dado de alta. Se acota y se
  // avisa, porque un OEE del 112% en pantalla destruye la credibilidad de la
  // herramienta entera en la primera reunion.
  let rendimiento: number | null = null;
  if (tMarcha > 0 && e.cicloNominalS > 0) {
    const teorico = tMarcha / e.cicloNominalS;
    rendimiento = udsTotal / teorico;
    if (rendimiento > 1) {
      avisos.push(
        `Rendimiento calculado ${(rendimiento * 100).toFixed(1)}%: el ciclo nominal ` +
        `(${e.cicloNominalS} s) es mayor que el real. Revisar la ficha del producto.`,
      );
      rendimiento = 1;
    }
  } else if (!(e.cicloNominalS > 0)) {
    avisos.push('Sin ciclo nominal: no se puede calcular rendimiento.');
  }

  // Calidad: primera pasada.
  let calidad: number | null = null;
  if (udsTotal > 0) calidad = e.udsOk / udsTotal;
  else avisos.push('Sin unidades producidas en el intervalo.');

  const oee =
    disponibilidad !== null && rendimiento !== null && calidad !== null
      ? disponibilidad * rendimiento * calidad
      : null;

  if (e.cobertura < COBERTURA_MINIMA) {
    avisos.push(
      `Calculado sobre el ${(e.cobertura * 100).toFixed(0)}% del intervalo. ` +
      `Faltan datos.`,
    );
  }

  return {
    disponibilidad, rendimiento, calidad, oee, tMarcha,
    cobertura: e.cobertura,
    entradas: { ...e, calcVersion: CALC_VERSION_OEE },
    avisos,
  };
}

// ---------------------------------------------------------------------------
// OEE de un conjunto de nodos (una linea, una planta).
//
// Ponderado por tiempo planificado, NO media aritmetica. Una media simple deja
// que una maquina auxiliar parada dos horas pese lo mismo que la linea
// principal, y entonces el numero de planta no se parece a la realidad.
// ---------------------------------------------------------------------------
export function oeeAgregado(partes: Array<{ oee: number | null; tPlanificado: number }>): number | null {
  let num = 0, den = 0;
  for (const p of partes) {
    if (p.oee === null || !(p.tPlanificado > 0)) continue;
    num += p.oee * p.tPlanificado;
    den += p.tPlanificado;
  }
  return den > 0 ? num / den : null;
}
