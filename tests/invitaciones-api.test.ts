// Invitaciones, contra base real. Necesita el esquema migrado y la semilla de
// db/pruebas cargada:  npm run migrar && npm run pruebas-fugas
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/api/servidor.ts';
import { emitirToken } from '../src/api/contexto.ts';
import { getPoolJobs, cerrar } from '../src/db.ts';

const ALFA = 'aaaaaaaa-0000-0000-0000-000000000001';
const SITE_ALFA = 'aaaaaaaa-1111-0000-0000-000000000001';

let app: ReturnType<typeof crearServidor>;
const cab = (t: string) => ({ authorization: `Bearer ${t}` });
const sesion = (rol: any, sites: string[] = []) => emitirToken({
  userId: '00000000-0000-0000-0000-0000000000aa',
  tenantId: ALFA, rol, sites, superadmin: false });

const correo = () => `prueba-${Math.random().toString(36).slice(2, 9)}@planta.com`;

before(async () => { app = crearServidor(); await app.ready(); });
after(async () => { await app.close(); await cerrar(); });

async function invitar(rolSesion: any, cuerpo: any, sites: string[] = []) {
  return app.inject({ method: 'POST', url: '/v1/invitaciones',
    headers: cab(sesion(rolSesion, sites)), payload: cuerpo });
}

test('el jefe de planta invita y el rol queda fijado en la invitación', async () => {
  const email = correo();
  const r = await invitar('plant_manager', { email, rol: 'maintenance' });
  assert.equal(r.statusCode, 201);
  const inv = r.json();
  assert.equal(inv.rol, 'maintenance');
  assert.ok(inv.token && inv.token.length >= 40);
  assert.equal(inv.caduca_en_horas, 72, 'tres días');
});

test('la caducidad la impone la base: 72 h desde la creación', async () => {
  const r = await invitar('plant_manager', { email: correo(), rol: 'viewer' });
  const { creada_en, expira_en } = r.json();
  const horas = (new Date(expira_en).getTime() - new Date(creada_en).getTime()) / 3600_000;
  assert.ok(Math.abs(horas - 72) < 0.01, `duraba ${horas} h`);
});

test('un rol operativo no puede invitar a nadie', async () => {
  const r = await invitar('production', { email: correo(), rol: 'viewer' });
  assert.equal(r.statusCode, 403);
});

test('un jefe de planta no puede invitar a un administrador', async () => {
  const r = await invitar('plant_manager', { email: correo(), rol: 'company_admin' });
  assert.equal(r.statusCode, 403);
  assert.match(r.json().error, /igual o superior/);
});

test('no se puede conceder una planta fuera de tu alcance', async () => {
  const r = await invitar('plant_manager', { email: correo(), rol: 'viewer',
    sites: ['bbbbbbbb-1111-0000-0000-000000000002'] }, [SITE_ALFA]);
  assert.equal(r.statusCode, 403);
});

test('al canjear, el rol sale de la invitación y no del cuerpo', async () => {
  const email = correo();
  const inv = (await invitar('company_admin', { email, rol: 'quality' })).json();

  // Se intenta colar company_admin en el cuerpo del canje.
  const r = await app.inject({ method: 'POST', url: '/v1/invitaciones/canjear',
    payload: { token: inv.token, nombre: 'Ana', rol: 'company_admin' } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().rol, 'quality', 'el rol del cuerpo se ignora');

  const { rows } = await getPoolJobs().query(
    `select m.rol from membership m join app_user u on u.id = m.user_id
      where u.email = $1 and m.tenant_id = $2`, [email, ALFA]);
  assert.equal(rows[0].rol, 'quality', 'la membresía real es la invitada');
});

test('una invitación solo se canjea una vez', async () => {
  const inv = (await invitar('company_admin', { email: correo(), rol: 'viewer' })).json();
  const a = await app.inject({ method: 'POST', url: '/v1/invitaciones/canjear',
    payload: { token: inv.token, nombre: 'Uno' } });
  assert.equal(a.statusCode, 200);
  const b = await app.inject({ method: 'POST', url: '/v1/invitaciones/canjear',
    payload: { token: inv.token, nombre: 'Dos' } });
  assert.equal(b.statusCode, 404, 'el enlace reenviado no vale dos veces');
});

test('una invitación caducada no se canjea', async () => {
  const inv = (await invitar('company_admin', { email: correo(), rol: 'viewer' })).json();
  // Se envejece la fila respetando el CHECK de vigencia máxima.
  await getPoolJobs().query(
    `update invitation set creada_en = now() - interval '4 days',
            expira_en = now() - interval '1 day' where id = $1`, [inv.id]);
  const r = await app.inject({ method: 'POST', url: '/v1/invitaciones/canjear',
    payload: { token: inv.token, nombre: 'Tarde' } });
  assert.equal(r.statusCode, 404);
});

test('una invitación revocada no se canjea', async () => {
  const inv = (await invitar('company_admin', { email: correo(), rol: 'viewer' })).json();
  const rev = await app.inject({ method: 'POST',
    url: `/v1/invitaciones/${inv.id}/revocar`, headers: cab(sesion('company_admin')) });
  assert.equal(rev.statusCode, 200);
  const r = await app.inject({ method: 'POST', url: '/v1/invitaciones/canjear',
    payload: { token: inv.token, nombre: 'Nadie' } });
  assert.equal(r.statusCode, 404);
});

test('no circulan dos enlaces vivos para el mismo correo', async () => {
  const email = correo();
  assert.equal((await invitar('company_admin', { email, rol: 'viewer' })).statusCode, 201);
  const dos = await invitar('company_admin', { email, rol: 'company_admin' });
  assert.equal(dos.statusCode, 409, 'valdría el último canjeado, que nadie espera');
});

test('un token inventado responde igual que uno caducado', async () => {
  // No se le dice a quien prueba tokens si acertó con uno que existió.
  const r = await app.inject({ method: 'GET',
    url: '/v1/invitaciones/canjear/' + 'x'.repeat(43) });
  assert.equal(r.statusCode, 404);
  assert.match(r.json().error, /no es válida o ha caducado/);
});

test('consultar la invitación dice el rol y las horas antes de aceptar', async () => {
  const inv = (await invitar('company_admin', { email: correo(), rol: 'energy' })).json();
  const r = await app.inject({ method: 'GET',
    url: `/v1/invitaciones/canjear/${inv.token}` });
  assert.equal(r.statusCode, 200);
  const d = r.json();
  assert.equal(d.rol, 'energy');
  assert.ok(d.horas_restantes > 70 && d.horas_restantes <= 72);
  assert.ok(d.empresa);
});

test('el correo del canje no se puede cambiar desde el cuerpo', async () => {
  const email = correo();
  const inv = (await invitar('company_admin', { email, rol: 'viewer' })).json();
  await app.inject({ method: 'POST', url: '/v1/invitaciones/canjear',
    payload: { token: inv.token, nombre: 'X', email: 'otro@ajeno.com' } });
  const { rows } = await getPoolJobs().query(
    `select count(*)::int as n from app_user where email = 'otro@ajeno.com'`);
  assert.equal(rows[0].n, 0, 'la invitación va atada a su correo');
});
