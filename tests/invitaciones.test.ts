import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeInvitar, alcanceValido, nuevoToken, hashToken, caducidad,
  estado, horasRestantes, normalizarEmail, DIAS_VIGENCIA,
} from '../src/dominio/invitaciones.ts';

test('la invitación vive tres días y ni uno más', () => {
  assert.equal(DIAS_VIGENCIA, 3);
  const ahora = new Date('2026-09-09T10:00:00Z');
  assert.equal(caducidad(ahora).toISOString(), '2026-09-12T10:00:00.000Z');
});

test('nadie invita por encima de su propio rango', () => {
  // El agujero clasico: un rol operativo invita a un administrador, acepta el
  // mismo con otro correo y se queda de administrador.
  assert.equal(puedeInvitar('production', 'company_admin').puede, false);
  assert.equal(puedeInvitar('maintenance', 'plant_manager').puede, false);
  assert.equal(puedeInvitar('viewer', 'viewer').puede, false);
});

test('tampoco de igual a igual: por ahí se multiplica un rol solo', () => {
  assert.equal(puedeInvitar('plant_manager', 'plant_manager').puede, false);
  assert.equal(puedeInvitar('quality', 'energy').puede, false);
});

test('el administrador sí puede invitar a otro administrador', () => {
  // Alguien tiene que poder dar continuidad a la cuenta.
  assert.equal(puedeInvitar('company_admin', 'company_admin').puede, true);
  assert.equal(puedeInvitar('company_admin', 'viewer').puede, true);
});

test('un jefe de planta invita hacia abajo', () => {
  for (const r of ['maintenance', 'production', 'quality', 'energy', 'viewer'] as const) {
    assert.equal(puedeInvitar('plant_manager', r).puede, true, r);
  }
});

test('el motivo explica por qué, no dice solo que no', () => {
  const v = puedeInvitar('production', 'company_admin');
  assert.match(v.motivo, /no puede invitar/);
});

test('no se puede conceder una planta que tú no alcanzas', () => {
  assert.equal(alcanceValido(['a', 'b'], ['a', 'c']).puede, false);
  assert.equal(alcanceValido(['a', 'b'], ['a']).puede, true);
});

test('quien solo alcanza algunas plantas no puede conceder todas', () => {
  // sites vacío significa «todas»: solo lo regala quien las tiene todas.
  assert.equal(alcanceValido(['a'], []).puede, false);
  assert.equal(alcanceValido([], []).puede, true);
});

test('el token tiene entropía suficiente y solo se guarda su hash', () => {
  const { token, hash } = nuevoToken();
  assert.ok(token.length >= 40, 'menos de 256 bits');
  assert.equal(hash.length, 64);
  assert.equal(hashToken(token), hash);
  assert.notEqual(token, hash, 'el token entero nunca es lo que se guarda');
  assert.notEqual(nuevoToken().token, nuevoToken().token);
});

test('el estado se resuelve en este orden: revocada, aceptada, caducada', () => {
  const futuro = new Date(Date.now() + 86400_000);
  const pasado = new Date(Date.now() - 1000);
  assert.equal(estado({ expira_en: futuro }), 'pendiente');
  assert.equal(estado({ expira_en: pasado }), 'caducada');
  assert.equal(estado({ expira_en: pasado, aceptada_en: new Date() }), 'aceptada');
  // Revocada gana incluso sobre aceptada: si se revocó, se revocó.
  assert.equal(estado({ expira_en: futuro, revocada_en: new Date() }), 'revocada');
});

test('las horas restantes nunca son negativas', () => {
  // Con `ahora` explícito: sin él la prueba depende de los milisegundos que
  // tarde en ejecutarse, y 3 h justas caen a 3 o a 2 según el día.
  const ahora = new Date('2026-09-09T10:00:00Z');
  const antes = new Date('2026-09-08T10:00:00Z');
  const luego = new Date('2026-09-09T12:30:00Z');
  assert.equal(horasRestantes(antes, ahora), 0, 'una invitación caducada no debe cifras negativas');
  assert.equal(horasRestantes(luego, ahora), 2, '2 h y media se muestran como 2');
  assert.equal(horasRestantes(new Date('2026-09-12T10:00:00Z'), ahora), 72, 'tres días justos');
});

test('el correo se normaliza antes de comparar', () => {
  // Sin esto, Jefe@Planta.com y jefe@planta.com son dos invitaciones vivas y
  // el índice de «una sola por correo» no sirve de nada.
  assert.equal(normalizarEmail('  Jefe@Planta.COM '), 'jefe@planta.com');
});
