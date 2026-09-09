// ---------------------------------------------------------------------------
// Acceso a datos. Barrera 2 de 3 del aislamiento multiempresa.
//
// La barrera 1 es la RLS de Postgres (db/09-rls.sql) y la 3 es la bateria de
// fugas en CI (db/pruebas/fugas.sql). Esta de aqui es la que hace que escribir
// una consulta sin contexto de inquilino sea IMPOSIBLE, no solo desaconsejado:
// no se exporta ningun `query` suelto. Para tocar la base hay que pasar por
// `conInquilino()`, y esa funcion fija el contexto antes de dejarte entrar.
// ---------------------------------------------------------------------------
import pg from 'pg';
import { env } from './config.ts';

// numeric de Postgres llega como string para no perder precision. En este
// producto los numeric son euros y porcentajes de OEE que se pintan y se
// suman, no importes contables: convertirlos a number en el borde evita
// sumas de strings, que es un fallo que sale en produccion y no en las pruebas.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20,   (v) => (v === null ? null : Number(v)));  // int8

export type Fila = Record<string, any>;
export interface Consulta {
  query<T = Fila>(texto: string, valores?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

let pool: pg.Pool | null = null;
let poolJobs: pg.Pool | null = null;

function crear(url: string, max: number): pg.Pool {
  if (!url) throw new Error('Falta DATABASE_URL. Copia .env.example a .env.');
  const p = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
  // Un error en una conexion ociosa no puede tumbar el proceso entero: la API
  // atiende a varias fabricas y una base que se reinicia no es una caida.
  p.on('error', (e) => console.error('[db] error en conexion ociosa:', e.message));
  return p;
}

export function getPool(): pg.Pool {
  return (pool ??= crear(env.databaseUrl, 10));
}

/** Conexion de los trabajos de fondo. Ve `measurement`; la API no. */
export function getPoolJobs(): pg.Pool {
  return (poolJobs ??= crear(env.databaseUrlJobs || env.databaseUrl, 4));
}

export async function cerrar(): Promise<void> {
  await Promise.all([pool?.end(), poolJobs?.end()]);
  pool = poolJobs = null;
}

// ---------------------------------------------------------------------------
// Ejecuta `fn` dentro de una transaccion con el inquilino fijado.
//
// `fr_set_tenant` usa set_config(..., is_local => true), asi que el contexto
// muere con la transaccion. Es deliberado: una conexion devuelta al pool con
// el inquilino todavia puesto serviria datos de la empresa anterior a la
// siguiente peticion que la reutilizara. Ese es EL fallo de este patron, y es
// silencioso.
// ---------------------------------------------------------------------------
export async function conInquilino<T>(
  tenantId: string,
  fn: (db: Consulta) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error('conInquilino() sin tenantId');
  const c = await getPool().connect();
  try {
    await c.query('begin');
    await c.query('select fr_set_tenant($1)', [tenantId]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Modo superadmin: opera FUERA del inquilino. Es un interruptor aparte y con
// nombre incomodo a proposito, para que aparezca en cualquier revision de
// codigo. Toda llamada deja rastro en audit_log; el que llama es responsable
// de escribirlo.
// ---------------------------------------------------------------------------
export async function comoSuperadminSinAislamiento<T>(
  motivo: string,
  fn: (db: Consulta) => Promise<T>,
): Promise<T> {
  if (!motivo) throw new Error('comoSuperadminSinAislamiento() exige un motivo');
  const c = await getPool().connect();
  try {
    await c.query('begin');
    await c.query("select set_config('fr.superadmin', 'on', true)");
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Igual que conInquilino(), pero con la conexion de los trabajos de fondo.
//
// El motor de calculo necesita leer `measurement`, que fr_app no ve. Se fija el
// inquilino igualmente aunque el rol de los trabajos sea propietario y salte
// RLS: asi el mismo codigo funciona el dia que se despliegue con un rol que no
// la salte, y asi un bucle que se olvida de cambiar de inquilino se nota.
// ---------------------------------------------------------------------------
export async function conInquilinoJobs<T>(
  tenantId: string,
  fn: (db: Consulta) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error('conInquilinoJobs() sin tenantId');
  const c = await getPoolJobs().connect();
  try {
    await c.query('begin');
    await c.query('select fr_set_tenant($1)', [tenantId]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
