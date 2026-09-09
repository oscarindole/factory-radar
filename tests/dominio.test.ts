import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOee, oeeAgregado } from '../src/dominio/oee.ts';
import { derivarMicroparadas, umbralPorDefecto } from '../src/dominio/microparadas.ts';
import { impactoRendimiento, impactoConsumoOcioso, impactoParada } from '../src/dominio/impacto.ts';
import { calcularSeveridad, aplicarTope } from '../src/dominio/severidad.ts';

// --- OEE -------------------------------------------------------------------

test('OEE devuelve los tres factores, nunca solo el compuesto', () => {
  const r = calcularOee({
    tPlanificado: 28800,   // turno de 8 h
    tParada: 1440,         // 24 min parado
    udsOk: 6200, udsNok: 250,
    cicloNominalS: 4.2,
    cobertura: 1,
  });
  assert.ok(r.disponibilidad! > 0.94 && r.disponibilidad! < 0.96);
  assert.ok(r.calidad! > 0.96 && r.calidad! < 0.97);
  assert.equal(r.oee, r.disponibilidad! * r.rendimiento! * r.calidad!);
});

test('un ciclo nominal mal dado de alta se acota y se avisa, no sale 112%', () => {
  const r = calcularOee({
    tPlanificado: 3600, tParada: 0,
    udsOk: 2000, udsNok: 0,
    cicloNominalS: 4,      // daria 2000/900 = 222%
    cobertura: 1,
  });
  assert.equal(r.rendimiento, 1);
  assert.ok(r.avisos.some((a) => a.includes('ciclo nominal')));
});

test('sin ciclo nominal hay disponibilidad y calidad, pero no OEE', () => {
  const r = calcularOee({
    tPlanificado: 3600, tParada: 600,
    udsOk: 100, udsNok: 5,
    cicloNominalS: 0, cobertura: 1,
  });
  assert.ok(r.disponibilidad !== null);
  assert.ok(r.calidad !== null);
  assert.equal(r.rendimiento, null);
  assert.equal(r.oee, null, 'no se puede inventar el factor que falta');
});

test('cobertura baja se avisa: el numero se calcula sobre parte del turno', () => {
  const r = calcularOee({
    tPlanificado: 28800, tParada: 0, udsOk: 100, udsNok: 0,
    cicloNominalS: 4.2, cobertura: 0.62,
  });
  assert.ok(r.avisos.some((a) => a.includes('62%')));
});

test('el OEE de planta pondera por tiempo planificado, no media aritmetica', () => {
  // Linea principal 8 h al 80%, auxiliar 1 h al 20%. La media aritmetica daria
  // 50%, que no se parece a lo que ha pasado en la planta.
  const r = oeeAgregado([
    { oee: 0.80, tPlanificado: 28800 },
    { oee: 0.20, tPlanificado: 3600 },
  ]);
  assert.ok(r! > 0.73 && r! < 0.74, `esperaba ~0,733 y dio ${r}`);
});

// --- MICROPARADAS ----------------------------------------------------------

const t = (s: number) => new Date(Date.UTC(2026, 8, 9, 6, 0, s));

test('detecta el hueco en el contador con la maquina en marcha', () => {
  const m = [
    { ts: t(0),  valor: 100, enMarcha: true },
    { ts: t(5),  valor: 101, enMarcha: true },
    { ts: t(10), valor: 101, enMarcha: true },   // se para aqui
    { ts: t(60), valor: 101, enMarcha: true },
    { ts: t(65), valor: 102, enMarcha: true },   // vuelve
  ];
  const r = derivarMicroparadas(m, { umbralS: 20, maximoS: 600 });
  assert.equal(r.length, 1);
  assert.equal(r[0]!.duracionS, 60);
  assert.ok(r[0]!.confianza < 100, 'lo derivado nunca va con confianza 100');
});

test('no cuenta como microparada si la maquina estaba parada por causa conocida', () => {
  const m = [
    { ts: t(0),  valor: 100, enMarcha: true },
    { ts: t(10), valor: 100, enMarcha: false },
    { ts: t(90), valor: 100, enMarcha: false },
    { ts: t(95), valor: 101, enMarcha: true },
  ];
  assert.equal(derivarMicroparadas(m, { umbralS: 20, maximoS: 600 }).length, 0);
});

test('un contador que retrocede es un reinicio del PLC, no una parada de horas', () => {
  const m = [
    { ts: t(0),  valor: 5000, enMarcha: true },
    { ts: t(5),  valor: 0,    enMarcha: true },   // reinicio
    { ts: t(10), valor: 1,    enMarcha: true },
  ];
  assert.equal(derivarMicroparadas(m, { umbralS: 20, maximoS: 600 }).length, 0);
});

test('el umbral se adapta al ciclo: una linea lenta no dispara falsos positivos', () => {
  assert.equal(umbralPorDefecto(4.2), 21);
  assert.equal(umbralPorDefecto(90), 450);
  assert.equal(umbralPorDefecto(1), 20, 'suelo de 20 s');
});

// --- IMPACTO ---------------------------------------------------------------

test('el impacto trae la cuenta abierta y reproducible', () => {
  const r = impactoRendimiento({
    rendimientoBase: 0.88, rendimientoActual: 0.74,
    capacidadSemanalUds: 4430, margenUnitario: 7.18,
  });
  assert.ok(r.eurVentana! > 4400 && r.eurVentana! < 4500);
  assert.equal(r.base.formula, 'uds_perdidas_semana * margen_unitario * semanas_anio');
  assert.equal(r.base.margen_unitario, 7.18);
  assert.equal(r.falta.length, 0);
});

test('sin margen unitario NO se estima: se dice que dato falta', () => {
  const r = impactoRendimiento({
    rendimientoBase: 0.88, rendimientoActual: 0.74,
    capacidadSemanalUds: 4430, margenUnitario: null,
  });
  assert.equal(r.eurAnual, null);
  assert.ok(r.falta[0]!.includes('margen unitario'));
});

test('consumo ocioso: el compresor de la demo da ~16.000 €/año', () => {
  const r = impactoConsumoOcioso({ kwMedios: 38, horasSemana: 62, precioKwh: 0.142 });
  assert.ok(r.eurAnual! > 16_000 && r.eurAnual! < 16_100, `dio ${r.eurAnual}`);
});

test('una parada concreta no se anualiza: seria inventar', () => {
  const r = impactoParada({ horas: 3.5, costeParadaHora: 3200 });
  assert.equal(r.eurVentana, 11_200);
  assert.equal(r.eurAnual, null);
});

// --- SEVERIDAD -------------------------------------------------------------

test('sin impacto economico calculable no se puede llegar a critica', () => {
  const r = calcularSeveridad({
    impactoEurAnual: null, criticidad: 5,
    velocidadDeriva: 0.4, confianza: 95, irreversible: true,
  });
  assert.notEqual(r.severidad, 'critica');
});

test('mucho dinero en la linea principal sube a critica', () => {
  const r = calcularSeveridad({
    impactoEurAnual: 462_000, criticidad: 5,
    velocidadDeriva: 0.14, confianza: 87, irreversible: false,
  });
  assert.equal(r.severidad, 'critica');
});

test('la misma desviacion en un activo auxiliar no es critica', () => {
  const r = calcularSeveridad({
    impactoEurAnual: 2_000, criticidad: 1,
    velocidadDeriva: 0.4, confianza: 90, irreversible: false,
  });
  assert.ok(r.severidad === 'media' || r.severidad === 'baja');
});

test('el tope degrada las criticas que sobran, no las esconde', () => {
  const criticas = Array.from({ length: 8 }, (_, i) => ({
    severidad: 'critica' as const, puntos: 90 - i,
  }));
  const { bandeja, degradadas } = aplicarTope(criticas);
  assert.equal(degradadas, 3);
  assert.equal(bandeja.length, 8, 'no se pierde ninguna');
  assert.equal(bandeja.filter((b) => b.severidad === 'critica').length, 5);
});
