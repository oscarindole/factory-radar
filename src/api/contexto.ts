// ---------------------------------------------------------------------------
// Autenticacion, inquilino y permisos.
//
// El token se firma con HMAC del propio Node: una dependencia menos que
// auditar, y lo que necesitamos —firmar un identificador y una caducidad— no
// justifica una libreria de JWT completa.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { env } from '../config.ts';
import { conInquilino } from '../db.ts';

export type Rol =
  | 'company_admin' | 'plant_manager' | 'maintenance'
  | 'production' | 'quality' | 'energy' | 'viewer';

export interface Sesion {
  userId: string;
  tenantId: string;
  rol: Rol;
  sites: string[];        // vacio = todas las plantas de la empresa
  superadmin: boolean;
}

// ---------------------------------------------------------------------------
// Permisos por rol.
//
// El rol se aplica TAMBIEN a las consultas del Copilot: un operario no puede
// preguntarle a la IA algo que no veria en pantalla. La IA no es una puerta
// trasera a los permisos.
// ---------------------------------------------------------------------------
const PERMISOS: Record<Rol, string[]> = {
  company_admin: ['*'],
  plant_manager: [
    'planta.ver', 'produccion.ver', 'mantenimiento.ver', 'energia.ver',
    'calidad.ver', 'proveedores.ver', 'alerta.ver', 'alerta.cerrar',
    'coste.ver', 'orden.crear', 'copilot.usar', 'informe.ver',
  ],
  production: ['planta.ver', 'produccion.ver', 'alerta.ver', 'alerta.cerrar',
               'orden.crear', 'copilot.usar'],
  maintenance: ['planta.ver', 'mantenimiento.ver', 'produccion.ver', 'alerta.ver',
                'alerta.cerrar', 'orden.crear', 'orden.cerrar', 'copilot.usar',
                'conocimiento.usar'],
  quality:     ['planta.ver', 'calidad.ver', 'proveedores.ver', 'alerta.ver',
                'alerta.cerrar', 'copilot.usar'],
  energy:      ['planta.ver', 'energia.ver', 'coste.ver', 'alerta.ver', 'copilot.usar'],
  viewer:      ['planta.ver', 'produccion.ver', 'alerta.ver'],
};

// Permisos que NUNCA se conceden por rol, solo uno a uno y con rastro. La
// reidentificacion de un operario cruza productividad con una persona concreta
// y es tratamiento de datos personales en contexto laboral.
export const PERMISOS_NOMINALES = ['operario.reidentificar'];

export function puede(s: Sesion, permiso: string): boolean {
  if (s.superadmin) return true;
  if (PERMISOS_NOMINALES.includes(permiso)) return false;
  const p = PERMISOS[s.rol] ?? [];
  return p.includes('*') || p.includes(permiso);
}

/** Una sesion solo alcanza las plantas de su membresia. Vacio = todas. */
export function alcanzaSite(s: Sesion, siteId: string): boolean {
  return s.superadmin || s.sites.length === 0 || s.sites.includes(siteId);
}

/**
 * Resuelve una planta o devuelve null. Es la comprobacion que hay que hacer en
 * TODA ruta con :siteId, y `alcanzaSite()` sola no basta.
 *
 * El fallo que la trajo: con `sites: []` —el caso normal, "todas las plantas de
 * mi empresa"— `alcanzaSite()` decia que si a cualquier UUID. Las consultas
 * posteriores no filtraban nada porque la RLS ya devolvia cero filas, asi que
 * no habia fuga de datos... pero el endpoint contestaba 200 con todo a null
 * para la planta de otra empresa. Dos cosas mal a la vez: se distingue "no
 * existe" de "no es tuya" por el codigo de respuesta, y un 200 vacio se
 * confunde con "esta planta no ha producido hoy".
 *
 * Se consulta DENTRO del inquilino, asi que la RLS hace el trabajo: si la
 * planta es de otra empresa, aqui no llega.
 */
export async function resolverSite(
  db: { query<T = any>(t: string, v?: unknown[]): Promise<{ rows: T[] }> },
  s: Sesion,
  siteId: string,
): Promise<{ id: string; nombre: string; huso: string; precio_kwh: number | null } | null> {
  if (!alcanzaSite(s, siteId)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(siteId)) return null;   // un uuid mal formado no es un 500
  const { rows } = await db.query(
    `select id, nombre, huso, precio_kwh from site where id = $1`, [siteId]);
  return rows[0] ?? null;
}

// --- token -----------------------------------------------------------------

function firmar(payload: string): string {
  return createHmac('sha256', env.jwtSecreto).update(payload).digest('base64url');
}

export function emitirToken(s: Sesion, horas = 12): string {
  if (!env.jwtSecreto) throw new Error('Falta JWT_SECRETO');
  const cuerpo = Buffer.from(JSON.stringify({
    ...s, exp: Date.now() + horas * 3600_000, jti: randomUUID(),
  })).toString('base64url');
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function leerToken(token: string): Sesion | null {
  const [cuerpo, firma] = token.split('.');
  if (!cuerpo || !firma) return null;

  // Comparacion en tiempo constante: comparar firmas con === filtra el secreto
  // byte a byte a quien mida los tiempos de respuesta.
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length) return null;
  if (!timingSafeEqual(esperada, recibida)) return null;

  try {
    const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (typeof d.exp !== 'number' || d.exp < Date.now()) return null;
    return { userId: d.userId, tenantId: d.tenantId, rol: d.rol,
             sites: d.sites ?? [], superadmin: !!d.superadmin };
  } catch { return null; }
}

// --- auditoria -------------------------------------------------------------

export async function auditar(
  s: Sesion, accion: string,
  extra: { objeto?: string; objetoId?: string; detalle?: unknown; ip?: string } = {},
): Promise<void> {
  await conInquilino(s.tenantId, (db) =>
    db.query(
      `insert into audit_log (tenant_id, user_id, accion, objeto, objeto_id, detalle, ip)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [s.tenantId, s.userId, accion, extra.objeto ?? null,
       extra.objetoId ?? null, JSON.stringify(extra.detalle ?? {}), extra.ip ?? null],
    ));
}
