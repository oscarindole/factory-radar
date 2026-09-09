// ---------------------------------------------------------------------------
// Invitaciones.
//
// Dos reglas mandan sobre todo lo demas:
//
//   1. EL ROL SE DECIDE AL INVITAR. Quien acepta no elige con que permisos
//      entra. Si el rol se resolviera al aceptar, la invitacion dejaria de ser
//      una concesion de acceso y pasaria a ser un formulario de alta.
//
//   2. TRES DIAS Y SE ACABO. Un enlace de invitacion se reenvia por WhatsApp
//      igual que cualquier otro enlace; la vigencia corta es lo unico que
//      limita el daño de un reenvio. La caducidad se comprueba tambien en la
//      base (ver db/02-organizacion.sql), no solo aqui.
// ---------------------------------------------------------------------------
import { randomBytes, createHash } from 'node:crypto';
import type { Rol } from '../api/contexto.ts';

export const DIAS_VIGENCIA = 3;

/**
 * Rango de cada rol. Sirve para una sola cosa: impedir que alguien invite por
 * encima de si mismo.
 *
 * Sin esto, un `production` podria invitar a un `company_admin`, aceptar el
 * mismo la invitacion con otro correo y quedarse de administrador. Es la
 * escalada de privilegios clasica de todo sistema de invitaciones.
 */
const RANGO: Record<Rol, number> = {
  company_admin: 100,
  plant_manager:  70,
  maintenance:    40,
  production:     40,
  quality:        40,
  energy:         40,
  viewer:         10,
};

export interface Veredicto { puede: boolean; motivo: string }

/**
 * Quien puede invitar a quien.
 *
 * `company_admin` puede invitar a cualquiera, incluido otro administrador:
 * alguien tiene que poder dar continuidad a la cuenta. El resto solo puede
 * invitar ESTRICTAMENTE por debajo de su propio rango, nunca de igual a igual:
 * de igual a igual se construye una cadena por la que un rol acaba
 * multiplicandose sin que nadie lo haya autorizado.
 */
export function puedeInvitar(quien: Rol, aQue: Rol): Veredicto {
  if (!(aQue in RANGO)) return { puede: false, motivo: `Rol desconocido: ${aQue}.` };
  if (quien === 'company_admin') return { puede: true, motivo: 'Administrador de la empresa.' };
  if (RANGO[quien] < RANGO.plant_manager) {
    return { puede: false, motivo: 'Tu rol no puede invitar a nadie.' };
  }
  if (RANGO[aQue] >= RANGO[quien]) {
    return { puede: false,
             motivo: `Un ${quien} no puede invitar a un ${aQue}: es un rol igual o superior.` };
  }
  return { puede: true, motivo: 'Rol por debajo del tuyo.' };
}

/**
 * Alcance por planta. Nadie puede conceder acceso a una planta que el mismo no
 * alcanza. `sites` vacio significa «todas las de la empresa», asi que solo
 * quien las tiene todas puede regalar todas.
 */
export function alcanceValido(sitesDeQuien: string[], sitesInvitados: string[]): Veredicto {
  if (sitesDeQuien.length === 0) return { puede: true, motivo: 'Alcance completo.' };
  if (sitesInvitados.length === 0) {
    return { puede: false,
             motivo: 'No puedes conceder acceso a todas las plantas si tú solo alcanzas algunas.' };
  }
  const fuera = sitesInvitados.filter((s) => !sitesDeQuien.includes(s));
  return fuera.length
    ? { puede: false, motivo: `No alcanzas ${fuera.length} de las plantas que intentas conceder.` }
    : { puede: true, motivo: 'Dentro de tu alcance.' };
}

// --- el token --------------------------------------------------------------

/**
 * El token viaja en el enlace y NUNCA se guarda entero: en la base solo queda
 * su sha256. Si se filtra la base, ninguna invitacion pendiente se puede
 * canjear con lo que hay dentro.
 *
 * 32 bytes en base64url: 256 bits de entropia. No se puede adivinar por fuerza
 * bruta en tres dias, ni en tres millones de años.
 */
export function nuevoToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function caducidad(desde = new Date()): Date {
  return new Date(desde.getTime() + DIAS_VIGENCIA * 86_400_000);
}

export type EstadoInvitacion = 'pendiente' | 'aceptada' | 'caducada' | 'revocada';

export function estado(inv: {
  aceptada_en?: Date | string | null;
  revocada_en?: Date | string | null;
  expira_en: Date | string;
}, ahora = new Date()): EstadoInvitacion {
  if (inv.revocada_en) return 'revocada';
  if (inv.aceptada_en) return 'aceptada';
  return new Date(inv.expira_en) <= ahora ? 'caducada' : 'pendiente';
}

/** Horas que le quedan. Es lo que se enseña en el panel: «caduca en 62 h». */
export function horasRestantes(expira: Date | string, ahora = new Date()): number {
  return Math.max(0, Math.floor((new Date(expira).getTime() - ahora.getTime()) / 3_600_000));
}

/**
 * El correo se normaliza SIEMPRE antes de comparar. Sin esto,
 * `Jefe@Planta.com` y `jefe@planta.com` son dos invitaciones distintas y el
 * indice de «una sola viva por correo» no sirve de nada.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
