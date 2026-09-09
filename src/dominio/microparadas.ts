// ---------------------------------------------------------------------------
// Microparadas derivadas.
//
// Casi ninguna planta las tiene registradas: el SCADA anota la parada larga y
// la corta se pierde. Pero es donde vive la perdida invisible — entre 3 y 8
// puntos de OEE — y es lo que mas sorprende al cliente en la demo, porque sabe
// que existe y nunca ha podido medirla.
//
// Se deducen de que el contador no avanza mientras la maquina esta en marcha.
// Los eventos que salen de aqui llevan source='derivado' y confianza < 100: no
// se pueden mezclar con los declarados por el SCADA sin distinguirlos, porque
// entonces el numero no se puede defender cuando el cliente lo discuta.
// ---------------------------------------------------------------------------

export interface Muestra {
  ts: Date;
  /** Valor del contador acumulado. */
  valor: number;
  /** false si la maquina estaba parada por causa ya conocida. */
  enMarcha: boolean;
}

export interface Microparada {
  inicio: Date;
  fin: Date;
  duracionS: number;
  confianza: number;
}

export interface OpcionesMicroparada {
  /** Segundos sin avance a partir de los cuales cuenta como microparada. */
  umbralS: number;
  /** A partir de aqui ya es una parada normal y la registra el SCADA. */
  maximoS: number;
}

/**
 * Umbral por defecto. Cinco veces el ciclo nominal, con un suelo de 20 s.
 *
 * No es un numero fijo: en una linea de 4 s de ciclo, 30 s parada son siete
 * piezas perdidas; en una de 90 s de ciclo, 30 s es un ciclo normal que aun no
 * ha terminado. Un umbral fijo genera falsos positivos en las lineas lentas.
 */
export function umbralPorDefecto(cicloNominalS: number): number {
  return Math.max(20, Math.round(cicloNominalS * 5));
}

export function derivarMicroparadas(
  muestras: Muestra[],
  op: OpcionesMicroparada,
): Microparada[] {
  const salida: Microparada[] = [];
  if (muestras.length < 2) return salida;

  const m = [...muestras].sort((a, b) => a.ts.getTime() - b.ts.getTime());
  let inicioHueco: Date | null = null;

  for (let i = 1; i < m.length; i++) {
    const ant = m[i - 1]!;
    const act = m[i]!;

    // Un contador que RETROCEDE es un reinicio del PLC, no produccion negativa.
    // Se corta el hueco en curso y se sigue: intentar interpretarlo produce
    // microparadas fantasma de horas.
    const avanzo = act.valor > ant.valor;
    const reinicio = act.valor < ant.valor;

    if (reinicio) { inicioHueco = null; continue; }

    if (!act.enMarcha) { inicioHueco = null; continue; }

    if (!avanzo) {
      inicioHueco ??= ant.ts;
      continue;
    }

    if (inicioHueco) {
      const dur = (act.ts.getTime() - inicioHueco.getTime()) / 1000;
      if (dur >= op.umbralS && dur <= op.maximoS) {
        salida.push({
          inicio: inicioHueco,
          fin: act.ts,
          duracionS: Math.round(dur),
          // La confianza baja con la cadencia de muestreo: si se muestrea cada
          // 30 s no se puede afirmar el instante de inicio con precision.
          confianza: confianzaPorCadencia(m, i),
        });
      }
      inicioHueco = null;
    }
  }
  return salida;
}

function confianzaPorCadencia(m: Muestra[], i: number): number {
  const paso = (m[i]!.ts.getTime() - m[i - 1]!.ts.getTime()) / 1000;
  if (paso <= 5)  return 90;
  if (paso <= 15) return 75;
  if (paso <= 60) return 60;
  return 45;
}
