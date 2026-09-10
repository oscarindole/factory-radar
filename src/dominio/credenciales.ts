// ---------------------------------------------------------------------------
// Credenciales.
//
// scrypt del propio Node, por el mismo motivo que el HMAC del token: es lo que
// recomienda el RFC 9106 para quien no puede usar Argon2, viene en la
// biblioteca estandar y no añade una dependencia mas que auditar en una cadena
// de suministro industrial.
//
// El hash guarda sus propios parametros. Cuando dentro de dos años haga falta
// subir el coste, los hashes viejos se siguen verificando con los parametros
// con los que se crearon y se reescriben al vuelo en el siguiente acceso
// correcto; sin los parametros dentro, subir el coste invalidaria todas las
// contraseñas a la vez.
// ---------------------------------------------------------------------------
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as
  (clave: string | Buffer, sal: Buffer, largo: number, opciones: object) => Promise<Buffer>;

// N=2^15 tarda ~90 ms por verificacion en el servidor de destino. Es el punto
// donde probar contraseñas a ciegas deja de ser practico sin que un login
// legitimo se note lento.
const COSTE = { N: 32768, r: 8, p: 1 };
const LARGO_HASH = 32;
const LARGO_SAL = 16;

// scrypt reserva aproximadamente 128 * N * r bytes. Con N=32768 y r=8 son 32 MB
// por verificacion, y Node aborta por encima de su limite por defecto.
const MEMORIA = 64 * 1024 * 1024;

export const LARGO_MINIMO = 12;

/**
 * Las contraseñas mas usadas del mundo, y las que se le ocurren a cualquiera
 * delante de este producto en concreto. No es una lista de bloqueo seria —esa
 * son millones de entradas— pero cubre lo que de verdad se teclea cuando a
 * alguien le piden una contraseña en una pantalla de alta.
 */
const PROHIBIDAS = new Set([
  'contrasena123', 'contraseña123', 'password1234', 'passwordpassword',
  '123456789012', 'qwertyuiop12', 'administrador', 'administrator',
  'ractory12345', 'ractoryractory', 'fabrica12345', 'factory12345',
  'planta123456', 'produccion12', 'mantenimiento',
]);

export interface Veredicto { ok: boolean; motivo?: string }

/**
 * Politica al estilo del NIST SP 800-63B: manda el largo, no la composicion.
 *
 * Las reglas de "una mayuscula, un numero y un simbolo" producen `Verano2024!`
 * en todas las empresas del mundo, que es exactamente lo que primero prueba
 * quien ataca. Un minimo de doce y fuera lo evidente protege mas.
 */
export function politicaClave(clave: string): Veredicto {
  if (clave.length < LARGO_MINIMO) {
    return { ok: false, motivo: `La contraseña necesita al menos ${LARGO_MINIMO} caracteres.` };
  }
  // El limite alto no es capricho: scrypt trabaja sobre lo que se le da, y sin
  // tope una contraseña de 1 MB es una denegacion de servicio de una linea.
  if (clave.length > 200) {
    return { ok: false, motivo: 'La contraseña no puede pasar de 200 caracteres.' };
  }
  const plana = clave.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (PROHIBIDAS.has(plana)) {
    return { ok: false, motivo: 'Esa contraseña es demasiado previsible. Elige otra.' };
  }
  // Un solo caracter repetido llega al minimo de largo sin aportar nada.
  if (new Set(clave).size < 5) {
    return { ok: false, motivo: 'La contraseña repite demasiado los mismos caracteres.' };
  }
  return { ok: true };
}

/** `scrypt$N$r$p$sal$hash`, todo en base64url. */
export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(LARGO_SAL);
  const hash = await scryptAsync(clave, sal, LARGO_HASH, { ...COSTE, maxmem: MEMORIA });
  return ['scrypt', COSTE.N, COSTE.r, COSTE.p,
          sal.toString('base64url'), hash.toString('base64url')].join('$');
}

/**
 * Verifica sin filtrar por tiempo. Devuelve false ante cualquier hash mal
 * formado en vez de lanzar: un `clave_hash` corrupto en la base es un acceso
 * denegado, no un 500 que le cuenta al de fuera que ese usuario existe.
 */
export async function verificarClave(clave: string, almacenado: string | null): Promise<boolean> {
  if (!almacenado) return false;
  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const N = Number(partes[1]), r = Number(partes[2]), p = Number(partes[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Un N enorme leido de la base seria una denegacion de servicio escrita en
  // una fila: se acota a lo que nosotros mismos emitimos.
  if (N < 16384 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  let sal: Buffer, esperado: Buffer;
  try {
    sal = Buffer.from(partes[4]!, 'base64url');
    esperado = Buffer.from(partes[5]!, 'base64url');
  } catch { return false; }
  if (sal.length === 0 || esperado.length === 0) return false;

  let calculado: Buffer;
  try {
    calculado = await scryptAsync(clave, sal, esperado.length, { N, r, p, maxmem: MEMORIA });
  } catch { return false; }

  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** ¿Se creo con parametros mas debiles que los de hoy? */
export function convieneRehacer(almacenado: string | null): boolean {
  if (!almacenado) return false;
  const partes = almacenado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return true;
  return Number(partes[1]) < COSTE.N;
}

// ---------------------------------------------------------------------------
// Señuelo.
//
// Si ante un email desconocido contestamos al momento y ante uno conocido
// tardamos los 90 ms de scrypt, la diferencia de tiempo dice quien tiene cuenta
// en el sistema. En una plataforma industrial eso es una lista de empleados de
// la empresa cliente, y se saca sin acertar ni una contraseña.
//
// Se calcula una vez al arrancar contra una clave aleatoria que nadie conoce.
// ---------------------------------------------------------------------------
let señuelo: Promise<string> | null = null;

export function hashSeñuelo(): Promise<string> {
  return (señuelo ??= hashClave(randomBytes(32).toString('base64url')));
}

/** Consume el mismo tiempo que una verificacion real, y siempre falla. */
export async function gastarTiempoDeVerificacion(clave: string): Promise<false> {
  await verificarClave(clave, await hashSeñuelo());
  return false;
}
