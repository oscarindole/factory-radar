// Acceso, contra base real. A diferencia del resto de pruebas de API, esta se
// siembra sola: solo necesita las tablas de db/02-organizacion.sql, asi que
// corre aunque el equipo no tenga TimescaleDB para migrar el esquema entero.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearServidor } from '../src/api/servidor.ts';
import { _reiniciarLimites } from '../src/api/rutas/auth.ts';
import { hashClave } from '../src/dominio/credenciales.ts';
import { getPoolJobs, cerrar } from '../src/db.ts';

const EMPRESA_A = 'aaaa1111-0000-4000-8000-000000000001';
const EMPRESA_B = 'bbbb2222-0000-4000-8000-000000000002';
const CLAVE = 'la prensa del taller de arriba';
const sufijo = Math.random().toString(36).slice(2, 8);
const unaEmpresa = `una-${sufijo}@planta.test`;
const dosEmpresas = `dos-${sufijo}@planta.test`;
const sinAcceso = `sin-${sufijo}@planta.test`;

let app: ReturnType<typeof crearServidor>;
const db = getPoolJobs();
const q = (t: string, v?: unknown[]) => db.query(t, v).then((r) => r.rows);

const entrar = (payload: object) =>
  app.inject({ method: 'POST', url: '/v1/auth/login', payload });

before(async () => {
  app = crearServidor();
  await app.ready();

  for (const [id, nombre] of [[EMPRESA_A, 'Envases Norte'], [EMPRESA_B, 'Envases Sur']]) {
    await q(`insert into company (id, nombre, cif, plan, activo)
             values ($1,$2,'B00000000','piloto',true) on conflict (id) do nothing`, [id, nombre]);
  }
  const hash = await hashClave(CLAVE);
  for (const [email, empresas] of [
    [unaEmpresa, [EMPRESA_A]], [dosEmpresas, [EMPRESA_A, EMPRESA_B]], [sinAcceso, []],
  ] as [string, string[]][]) {
    const [u] = await q(
      `insert into app_user (email, nombre, clave_hash) values ($1,$2,$3) returning id`,
      [email, 'Persona de prueba', hash]);
    for (const t of empresas) {
      await q(`insert into membership (tenant_id, user_id, rol, sites)
               values ($1,$2,'maintenance','{}')`, [t, u.id]);
    }
  }
});

after(async () => {
  for (const t of [EMPRESA_A, EMPRESA_B]) {
    await q(`delete from audit_log where tenant_id=$1`, [t]);
    await q(`delete from membership where tenant_id=$1`, [t]);
    await q(`delete from company where id=$1`, [t]);
  }
  await q(`delete from app_user where email = any($1)`,
          [[unaEmpresa, dosEmpresas, sinAcceso]]);
  await app.close();
  await cerrar();
});

// Los contadores viven en memoria del proceso, asi que una prueba que agota el
// limite dejaria bloqueadas a las siguientes.
beforeEach(() => _reiniciarLimites());

test('con la contraseña buena se entra y se recibe token', async () => {
  const r = await entrar({ email: unaEmpresa, clave: CLAVE });
  assert.equal(r.statusCode, 200);
  const cuerpo = r.json();
  assert.ok(cuerpo.token, 'devuelve token');
  assert.equal(cuerpo.usuario.rol, 'maintenance');
  assert.equal(cuerpo.usuario.empresa, 'Envases Norte');
});

test('el token que devuelve sirve de verdad para pedir algo', async () => {
  const { token } = (await entrar({ email: unaEmpresa, clave: CLAVE })).json();
  // Se elige una ruta que exige sesion. Basta con que NO conteste 401: lo que
  // se comprueba es que el token vale, no lo que devuelve la ruta.
  const r = await app.inject({ method: 'GET', url: '/v1/alertas',
    headers: { authorization: `Bearer ${token}` } });
  assert.notEqual(r.statusCode, 401, 'el token emitido en el login abre la sesión');
});

test('email desconocido y contraseña mala responden EXACTAMENTE lo mismo', async () => {
  // La prueba que sostiene todo el diseño de la ruta. Si estas dos respuestas se
  // distinguen en algo —codigo, mensaje o tiempo— se puede sacar la lista de
  // quien tiene cuenta sin acertar ni una contraseña.
  const desconocido = await entrar({ email: `nadie-${sufijo}@ninguna.parte`, clave: CLAVE });
  const malaClave  = await entrar({ email: unaEmpresa, clave: 'no es la contraseña buena' });

  assert.equal(desconocido.statusCode, 401);
  assert.equal(malaClave.statusCode, 401);
  assert.deepEqual(desconocido.json(), malaClave.json());
});

test('y tardan parecido: el señuelo hace el trabajo', async () => {
  const medir = async (payload: object) => {
    const t = performance.now(); await entrar(payload); return performance.now() - t;
  };
  const desconocido = await medir({ email: `otro-${sufijo}@ninguna.parte`, clave: CLAVE });
  const malaClave  = await medir({ email: unaEmpresa, clave: 'tampoco es esta' });

  const proporcion = Math.max(desconocido, malaClave) / Math.max(1, Math.min(desconocido, malaClave));
  assert.ok(proporcion < 4,
    `desconocido ${desconocido.toFixed(0)} ms · clave mala ${malaClave.toFixed(0)} ms`);
});

test('quien está en dos empresas elige; no se elige por él', async () => {
  const r = await entrar({ email: dosEmpresas, clave: CLAVE });
  assert.equal(r.statusCode, 300);
  const cuerpo = r.json();
  assert.equal(cuerpo.elige_empresa, true);
  assert.equal(cuerpo.empresas.length, 2);
  assert.equal(cuerpo.token, undefined, 'todavía no hay token');

  const r2 = await entrar({ email: dosEmpresas, clave: CLAVE, empresa_id: EMPRESA_B });
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.json().usuario.empresa, 'Envases Sur');
});

test('una empresa que no es suya no cuela, aunque exista', async () => {
  const r = await entrar({ email: unaEmpresa, clave: CLAVE, empresa_id: EMPRESA_B });
  // Solo tiene una membresia, asi que entra por ella y el parametro se ignora:
  // en ningun caso se le da acceso a la empresa que ha pedido.
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().usuario.empresa_id, EMPRESA_A);
});

test('sin membresía no se entra, aunque la contraseña sea correcta', async () => {
  const r = await entrar({ email: sinAcceso, clave: CLAVE });
  assert.equal(r.statusCode, 403);
  assert.match(r.json().error, /no tiene acceso/i);
});

test('el límite de intentos corta la fuerza bruta', async () => {
  const email = unaEmpresa;
  let ultimo = 0;
  for (let i = 0; i < 12; i++) {
    ultimo = (await entrar({ email, clave: `intento ${i}` })).statusCode;
  }
  assert.equal(ultimo, 429, 'a partir de cierto número de fallos deja de contestar 401');
});

test('el 429 dice cuándo volver', async () => {
  for (let i = 0; i < 12; i++) await entrar({ email: unaEmpresa, clave: 'no' });
  const r = await entrar({ email: unaEmpresa, clave: 'no' });
  assert.equal(r.statusCode, 429);
  assert.ok(Number(r.headers['retry-after']) > 0, 'trae Retry-After en segundos');
});

test('acertar limpia el contador: ocho erratas en un turno no bloquean a nadie', async () => {
  for (let i = 0; i < 5; i++) await entrar({ email: unaEmpresa, clave: 'errata' });
  assert.equal((await entrar({ email: unaEmpresa, clave: CLAVE })).statusCode, 200);
  for (let i = 0; i < 5; i++) await entrar({ email: unaEmpresa, clave: 'errata' });
  assert.equal((await entrar({ email: unaEmpresa, clave: CLAVE })).statusCode, 200,
    'sin el reinicio, aquí ya estaría bloqueado');
});

test('faltar el cuerpo es 400, no un 500', async () => {
  assert.equal((await entrar({})).statusCode, 400);
  assert.equal((await entrar({ email: unaEmpresa })).statusCode, 400);
  assert.equal((await entrar({ clave: CLAVE })).statusCode, 400);
});

test('el email no distingue mayúsculas ni espacios', async () => {
  const r = await entrar({ email: `  ${unaEmpresa.toUpperCase()}  `, clave: CLAVE });
  assert.equal(r.statusCode, 200);
});
