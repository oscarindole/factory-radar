// ---------------------------------------------------------------------------
// Traduccion a euros.
//
// Es el eslabon donde el producto empieza a valer dinero. Dos reglas, y las
// dos son de esquema antes que de codigo (ver la restriccion
// alert_cuenta_abierta en db/08-inteligencia.sql):
//
//   1. Toda cifra en euros viaja con su cuenta abierta. `base` se guarda en
//      alert.impacto_base y el panel la pinta tal cual. Si el director de
//      planta no puede reproducir la multiplicacion con un boligrafo, el
//      numero no sirve.
//   2. Si falta un dato de entrada, NO se estima. Se devuelve null y se dice
//      que dato falta. Una cifra inventada que el cliente detecta —y la
//      detecta— cuesta mas que no dar cifra.
// ---------------------------------------------------------------------------

export interface Impacto {
  eurAnual: number | null;
  eurVentana: number | null;
  base: Record<string, unknown>;
  /** Que dato ha faltado para poder calcularlo. Vacio si se pudo. */
  falta: string[];
}

const SEMANAS_ANIO = 48;   // 52 menos paradas de fabrica y vacaciones

/** Perdida de produccion por caida de rendimiento. */
export function impactoRendimiento(p: {
  rendimientoBase: number;
  rendimientoActual: number;
  capacidadSemanalUds: number;
  margenUnitario: number | null;
}): Impacto {
  const falta: string[] = [];
  if (p.margenUnitario === null || !(p.margenUnitario > 0)) {
    falta.push('margen unitario del producto');
  }
  if (!(p.capacidadSemanalUds > 0)) falta.push('capacidad semanal del nodo');

  const caida = p.rendimientoBase - p.rendimientoActual;
  const udsSemana = caida * p.capacidadSemanalUds;

  if (falta.length > 0 || !(caida > 0)) {
    return {
      eurAnual: null, eurVentana: null, falta,
      base: {
        formula: 'uds_perdidas_semana * margen_unitario * semanas_anio',
        caida_rendimiento: redondear(caida, 4),
        uds_perdidas_semana: redondear(udsSemana, 1),
        capacidad_semanal_uds: p.capacidadSemanalUds,
        margen_unitario: p.margenUnitario,
        semanas_anio: SEMANAS_ANIO,
      },
    };
  }

  const eurSemana = udsSemana * p.margenUnitario!;
  return {
    eurVentana: redondear(eurSemana, 2),
    eurAnual: redondear(eurSemana * SEMANAS_ANIO, 2),
    falta: [],
    base: {
      formula: 'uds_perdidas_semana * margen_unitario * semanas_anio',
      caida_rendimiento: redondear(caida, 4),
      uds_perdidas_semana: redondear(udsSemana, 1),
      capacidad_semanal_uds: p.capacidadSemanalUds,
      margen_unitario: p.margenUnitario,
      eur_semana: redondear(eurSemana, 2),
      semanas_anio: SEMANAS_ANIO,
    },
  };
}

/**
 * Consumo fuera de horario productivo. El hallazgo mas rentable de ENERGY
 * RADAR y el mas facil de defender: es una resta, no un modelo.
 *
 * El precio del kWh sale del contrato REAL del cliente (site.precio_kwh), no
 * de un precio de mercado. Si no esta cargado, no hay cifra.
 */
export function impactoConsumoOcioso(p: {
  kwMedios: number;
  horasSemana: number;
  precioKwh: number | null;
}): Impacto {
  if (p.precioKwh === null || !(p.precioKwh > 0)) {
    return {
      eurAnual: null, eurVentana: null,
      falta: ['precio del kWh del contrato de la planta'],
      base: { kw: p.kwMedios, horas_semana: p.horasSemana },
    };
  }
  const kwhAnio = p.kwMedios * p.horasSemana * SEMANAS_ANIO;
  const eur = kwhAnio * p.precioKwh;
  return {
    eurAnual: redondear(eur, 2),
    eurVentana: redondear(p.kwMedios * p.horasSemana * p.precioKwh, 2),
    falta: [],
    base: {
      formula: 'kw * horas_semana * semanas_anio * precio_kwh',
      kw: p.kwMedios,
      horas_semana: p.horasSemana,
      semanas_anio: SEMANAS_ANIO,
      kwh_anio: redondear(kwhAnio, 1),
      precio_kwh: p.precioKwh,
    },
  };
}

/** Parada no planificada: horas por el coste/hora del nodo. */
export function impactoParada(p: {
  horas: number;
  costeParadaHora: number | null;
}): Impacto {
  if (p.costeParadaHora === null || !(p.costeParadaHora > 0)) {
    return {
      eurAnual: null, eurVentana: null,
      falta: ['coste de parada por hora del activo'],
      base: { horas: p.horas },
    };
  }
  const eur = p.horas * p.costeParadaHora;
  return {
    eurVentana: redondear(eur, 2),
    eurAnual: null,   // una parada concreta no se anualiza: seria inventar
    falta: [],
    base: {
      formula: 'horas * coste_parada_hora',
      horas: p.horas,
      coste_parada_hora: p.costeParadaHora,
    },
  };
}

function redondear(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
