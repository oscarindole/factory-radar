import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashClave, verificarClave, politicaClave, convieneRehacer,
  gastarTiempoDeVerificacion, LARGO_MINIMO,
} from '../src/dominio/credenciales.ts';

test('una contraseña se verifica contra su propio hash y contra ninguno mas', async () => {
  const hash = await hashClave('turbina-norte-2026');
  assert.equal(await verificarClave('turbina-norte-2026', hash), true);
  assert.equal(await verificarClave('turbina-norte-2025', hash), false);
  assert.equal(await verificarClave('', hash), false);
});

test('dos veces la misma contraseña dan hashes distintos', async () => {
  // Sin sal, dos personas con la misma contraseña comparten hash y una tabla
  // arcoiris las abre a las dos de golpe.
  const a = await hashClave('extrusora-linea-3');
  const b = await hashClave('extrusora-linea-3');
  assert.notEqual(a, b);
  assert.equal(await verificarClave('extrusora-linea-3', a), true);
  assert.equal(await verificarClave('extrusora-linea-3', b), true);
});

test('el hash lleva dentro sus propios parametros', async () => {
  const hash = await hashClave('molino-de-bolas-77');
  const [algoritmo, N, r, p] = hash.split('$');
  assert.equal(algoritmo, 'scrypt');
  assert.equal(Number(N), 32768);
  assert.equal(Number(r), 8);
  assert.equal(Number(p), 1);
  // Sin los parametros dentro, subir el coste dentro de dos años invalidaria
  // todas las contraseñas existentes a la vez.
  assert.equal(convieneRehacer(hash), false);
  assert.equal(convieneRehacer('scrypt$16384$8$1$c2Fs$aGFzaA'), true);
});

test('un hash corrupto es acceso denegado, no una excepcion', async () => {
  // Un 500 aqui le cuenta a quien esta fuera que ese usuario existe y que su
  // fila esta rota. Un 401 no le cuenta nada.
  for (const malo of [
    null, '', 'noesunhash', 'scrypt$8$1$sal',
    'argon2$32768$8$1$c2Fs$aGFzaA',        // otro algoritmo
    'scrypt$abc$8$1$c2Fs$aGFzaA',          // N no numerico
    'scrypt$32768$8$1$$aGFzaA',            // sin sal
    'scrypt$32768$8$1$c2Fs$',              // sin hash
  ]) {
    assert.equal(await verificarClave('lo que sea', malo as any), false, `fallo con: ${malo}`);
  }
});

test('un N desmesurado en la base no tumba el proceso', async () => {
  // Quien consiga escribir en `clave_hash` no debe poder pedir 32 GB de memoria
  // por cada intento de acceso: seria una denegacion de servicio de una fila.
  assert.equal(await verificarClave('x', 'scrypt$1073741824$8$1$c2Fs$aGFzaA'), false);
});

test('la politica mide el largo, no la composicion', () => {
  assert.equal(politicaClave('corta').ok, false);
  assert.equal(politicaClave('a'.repeat(LARGO_MINIMO - 1)).ok, false);

  // Sin reglas de mayuscula/numero/simbolo: esas producen `Verano2026!` en
  // todas las empresas del mundo, que es lo primero que se prueba.
  assert.equal(politicaClave('la prensa del taller de arriba').ok, true);
  assert.equal(politicaClave('correasoldadurabrida').ok, true);
});

test('la politica rechaza lo previsible y lo repetitivo', () => {
  assert.equal(politicaClave('ractory12345').ok, false);
  assert.equal(politicaClave('administrador').ok, false);
  // Doce caracteres, pero tres distintos: llega al minimo sin aportar nada.
  assert.equal(politicaClave('ababababababab').ok, false);
  assert.equal(politicaClave('a'.repeat(300)).ok, false);
});

test('el motivo del rechazo se puede enseñar a una persona', () => {
  const v = politicaClave('corta');
  assert.equal(v.ok, false);
  assert.match(v.motivo!, /al menos 12 caracteres/);
});

test('el señuelo cuesta lo mismo que una verificacion real', async () => {
  // La prueba que importa de todo el fichero. Si el email desconocido contesta
  // al momento y el conocido tarda los 90 ms de scrypt, la diferencia de tiempo
  // entrega la lista de quien tiene cuenta sin acertar ni una contraseña.
  const hash = await hashClave('bomba-hidraulica-12');

  const t0 = performance.now();
  await verificarClave('bomba-hidraulica-99', hash);   // usuario que existe, clave mala
  const real = performance.now() - t0;

  const t1 = performance.now();
  await gastarTiempoDeVerificacion('bomba-hidraulica-99');  // usuario que no existe
  const señuelo = performance.now() - t1;

  // Margen ancho a proposito: esto corre en portatiles y en integracion
  // continua, y lo que se comprueba es que el camino del señuelo hace el
  // trabajo de verdad, no que los relojes coincidan.
  const proporcion = Math.max(real, señuelo) / Math.max(1, Math.min(real, señuelo));
  assert.ok(proporcion < 4,
    `el señuelo tarda ${señuelo.toFixed(0)} ms y la verificacion real ${real.toFixed(0)} ms`);
});

test('el señuelo siempre falla', async () => {
  assert.equal(await gastarTiempoDeVerificacion('cualquier cosa'), false);
});
