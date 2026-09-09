// ---------------------------------------------------------------------------
// Severidad.
//
// NO se decide por lo grande que sea la desviacion estadistica. Un 40% de
// desviacion en una maquina auxiliar parada es menos grave que un 6% en la
// linea principal. Se decide por dinero y por urgencia.
// ---------------------------------------------------------------------------

export type Severidad = 'critica' | 'alta' | 'media' | 'baja';

export interface EntradasSeveridad {
  /** Impacto anual estimado en euros. null si no se ha podido calcular. */
  impactoEurAnual: number | null;
  /**
   * Coste ya incurrido en la ventana, para problemas que NO son recurrentes:
   * un lote defectuoso de un proveedor se acaba cuando se acaba el lote.
   *
   * Existe porque anualizar ese caso da cifras absurdas —686.000 €/año por tres
   * semanas de un lote— y una cifra absurda destruye la credibilidad de la
   * herramienta mas rapido que no dar cifra ninguna. Pesa menos que el impacto
   * anual, porque una perdida que se repite todo el año es peor que una que ya
   * ha pasado.
   */
  impactoEurVentana?: number | null;
  /** 1 a 5. Del activo afectado. */
  criticidad: number;
  /** Cuanto se ha movido en la ventana, en fraccion (0.14 = 14%). */
  velocidadDeriva: number;
  /** 0 a 100. */
  confianza: number;
  /** true si el problema se agrava solo si nadie actua. */
  irreversible: boolean;
}

/** Tope duro de criticas por planta y semana (decision 10). */
export const TOPE_CRITICAS_SEMANA = 5;

export function calcularSeveridad(e: EntradasSeveridad): {
  severidad: Severidad;
  puntos: number;
  motivo: string;
} {
  // Sin impacto economico no se puede subir a critica, por muy grande que sea
  // la desviacion: molestar al director de planta con algo que no sabemos
  // cuanto cuesta es exactamente como se pierde su atencion.
  const eur = e.impactoEurAnual ?? 0;
  const ventana = e.impactoEurVentana ?? 0;

  let p = 0;
  if (eur >= 50_000) p += 45;
  else if (eur >= 20_000) p += 32;
  else if (eur >= 5_000) p += 20;
  else if (eur > 0) p += 10;

  // El coste ya incurrido cuenta, pero a la mitad: no se va a repetir cada mes.
  if (eur === 0) {
    if (ventana >= 20_000) p += 22;
    else if (ventana >= 5_000) p += 16;
    else if (ventana >= 1_000) p += 10;
    else if (ventana > 0) p += 5;
  }

  p += (e.criticidad - 1) * 6;               // 0 a 24
  p += Math.min(15, e.velocidadDeriva * 60); // 0 a 15
  if (e.irreversible) p += 8;

  // La confianza escala el total en vez de sumar. Una señal muy cara pero poco
  // fiable no debe llegar a critica solo por el importe: primero se confirma.
  p = p * (e.confianza / 100);

  // Solo una perdida RECURRENTE llega a critica. Un coste ya incurrido, por
  // grande que sea, no justifica interrumpir al director de planta hoy: lo que
  // interrumpe es lo que sigue sangrando.
  let severidad: Severidad;
  if (p >= 55 && e.impactoEurAnual !== null) severidad = 'critica';
  else if (p >= 35) severidad = 'alta';
  else if (p >= 18) severidad = 'media';
  else severidad = 'baja';

  const motivo =
    e.impactoEurAnual === null && ventana === 0
      ? 'Sin impacto economico calculable: no puede subir a critica.'
      : e.impactoEurAnual === null
        ? `${Math.round(p)} puntos: ${ventana.toLocaleString('es-ES')} € ya incurridos ` +
          `(no recurrente, no puede subir a critica), confianza ${e.confianza}%.`
        : `${Math.round(p)} puntos: ${eur.toLocaleString('es-ES')} €/año, ` +
          `criticidad ${e.criticidad}/5, confianza ${e.confianza}%.`;

  return { severidad, puntos: Math.round(p), motivo };
}

/**
 * Recorta la bandeja al tope semanal.
 *
 * Lo que sobra NO se tira: baja a 'alta' y se marca. Si el motor genera mas de
 * cinco criticas por semana el problema es de calibracion, y hay que verlo en
 * el panel de superadmin, no esconderlo al usuario.
 */
export function aplicarTope<T extends { severidad: Severidad; puntos: number }>(
  criticas: T[],
): { bandeja: T[]; degradadas: number } {
  const orden = [...criticas].sort((a, b) => b.puntos - a.puntos);
  const dentro = orden.slice(0, TOPE_CRITICAS_SEMANA);
  const fuera  = orden.slice(TOPE_CRITICAS_SEMANA);
  for (const f of fuera) f.severidad = 'alta';
  return { bandeja: [...dentro, ...fuera], degradadas: fuera.length };
}
