// Pruebas de la API contra una base real. Comprueban EL EFECTO, no la respuesta:
// que el aislamiento llega hasta el endpoint, no solo hasta la politica RLS.
//
// Necesitan la base migrada y la semilla de db/pruebas cargada:
//   npm run migrar && npm run pruebas-fugas
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/api/servidor.ts';
import { emitirToken } from '../src/api/contexto.ts';
import { cerrar } from '../src/db.ts';

const ALFA = 'aaaaaaaa-0000-0000-0000-000000000001';
const BETA = 'bbbbbbbb-0000-0000-0000-000000000002';
const SITE_ALFA = 'aaaaaaaa-1111-0000-0000-000000000001';
const ALERTA_BETA = 'bbbbbbbb-4444-0000-0000-000000000002';

let app: ReturnType<typeof crearServidor>;
const jefeDeAlfa = () => emitirToken({
  userId: '00000000-0000-0000-0000-0000000000aa',
  tenantId: ALFA, rol: 'plant_manager', sites: [], superadmin: false,
});

before(async () => { app = crearServidor(); await app.ready(); });
after(async () => { await app.close(); await cerrar(); });

test('/salud comprueba que la base responde, no que el proceso vive', async () => {
  const r = await app.inject({ method: 'GET', url: '/salud' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().ok, true);
});

test('sin token no se entra', async () => {
  const r = await app.inject({ method: 'GET', url: '/v1/alertas' });
  assert.equal(r.statusCode, 401);
});

test('un token manipulado no cuela', async () => {
  const t = jefeDeAlfa();
  const roto = t.slice(0, -3) + 'AAA';
  const r = await app.inject({
    method: 'GET', url: '/v1/alertas', headers: { authorization: `Bearer ${roto}` } });
  assert.equal(r.statusCode, 401, 'la firma HMAC tiene que rechazarlo');
});

test('ALFA ve su alerta y solo la suya', async () => {
  const r = await app.inject({
    method: 'GET', url: '/v1/alertas',
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  assert.equal(r.statusCode, 200);
  const { alertas } = r.json();
  assert.equal(alertas.length, 1);
  assert.match(alertas[0].titulo, /^Linea 3/);
});

test('pedir por id la alerta de BETA da 404, nunca 403', async () => {
  const r = await app.inject({
    method: 'GET', url: `/v1/alertas/${ALERTA_BETA}`,
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  // 403 confirmaria que existe. Es la diferencia entre "no la tienes" y
  // "existe pero no es tuya", y la segunda ya es informacion de la competencia.
  assert.equal(r.statusCode, 404);
});

test('la ficha de alerta trae SIEMPRE la cuenta abierta y las fuentes', async () => {
  const l = await app.inject({
    method: 'GET', url: '/v1/alertas',
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  const id = l.json().alertas[0].id;

  const r = await app.inject({
    method: 'GET', url: `/v1/alertas/${id}`,
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  const a = r.json();
  assert.equal(a.impacto_base.margen_unitario, 7.18);
  assert.ok(Array.isArray(a.evidencia) && a.evidencia.length > 0);
});

test('el estado de planta devuelve las paradas sin causa aunque sea mala noticia', async () => {
  const r = await app.inject({
    method: 'GET', url: `/v1/plantas/${SITE_ALFA}/estado`,
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  assert.equal(r.statusCode, 200);
  const e = r.json();
  assert.ok('paradasSinCausaPct' in e, 'la cifra incomoda se devuelve siempre');
  assert.ok('indicadores' in e && 'atencion' in e);
});

test('la planta de BETA da 404 para el jefe de ALFA', async () => {
  const r = await app.inject({
    method: 'GET', url: '/v1/plantas/bbbbbbbb-1111-0000-0000-000000000002/estado',
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  assert.equal(r.statusCode, 404);
});

test('un viewer no puede dar feedback: no cierra alertas', async () => {
  const viewer = emitirToken({
    userId: '00000000-0000-0000-0000-0000000000bb',
    tenantId: ALFA, rol: 'viewer', sites: [], superadmin: false });
  const l = await app.inject({
    method: 'GET', url: '/v1/alertas', headers: { authorization: `Bearer ${viewer}` } });
  const id = l.json().alertas[0].id;

  const r = await app.inject({
    method: 'POST', url: `/v1/alertas/${id}/feedback`,
    headers: { authorization: `Bearer ${viewer}` },
    payload: { feedback: 'no_era_nada' } });
  assert.equal(r.statusCode, 403);
});

test('el feedback valida el valor: no entra cualquier cosa', async () => {
  const l = await app.inject({
    method: 'GET', url: '/v1/alertas',
    headers: { authorization: `Bearer ${jefeDeAlfa()}` } });
  const id = l.json().alertas[0].id;

  const r = await app.inject({
    method: 'POST', url: `/v1/alertas/${id}/feedback`,
    headers: { authorization: `Bearer ${jefeDeAlfa()}` },
    payload: { feedback: 'me_da_igual' } });
  assert.equal(r.statusCode, 400);
});

test('la ingesta sin credencial de conector no entra', async () => {
  const r = await app.inject({
    method: 'POST', url: '/v1/ingesta',
    payload: { connector_id: 'x', batch_id: 'y', measurements: [] } });
  assert.equal(r.statusCode, 401);
});
