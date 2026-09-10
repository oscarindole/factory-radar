// ---------------------------------------------------------------------------
// Acceso.
//
// Cierra el bucle que faltaba: hasta ahora una invitacion aceptada creaba el
// usuario y la membresia, y ahi se acababa. No habia forma de entrar.
//
// Tres cosas mandan aqui, y las tres son la misma:
//
//   1. Un email desconocido y una contraseña equivocada responden LO MISMO.
//   2. Y tardan LO MISMO. Si el email desconocido contesta al momento y el
//      conocido tarda los 90 ms de scrypt, la diferencia de tiempo entrega la
//      lista de empleados de la empresa cliente sin acertar ni una contraseña.
//   3. Y cuentan LO MISMO para el limite de intentos.
//
// Quien prueba desde fuera no debe poder separar «no existe» de «existe pero
// fallaste». En un producto industrial esa lista es reconocimiento util: dice
// quien trabaja alli y en que puesto.
// ---------------------------------------------------------------------------
import type { FastifyInstance } from 'fastify';
import { getPool } from '../../db.ts';
import { emitirToken, auditar, type Sesion, type Rol } from '../contexto.ts';
import {
  verificarClave, convieneRehacer, hashClave, gastarTiempoDeVerificacion,
} from '../../dominio/credenciales.ts';
import { normalizarEmail } from '../../dominio/invitaciones.ts';

const HORAS_SESION = 12;

// --- limite de intentos ----------------------------------------------------
//
// En memoria del proceso. Es una decision consciente y tiene un limite que hay
// que decir en voz alta: con varias instancias detras de un balanceador, el
// contador va por instancia y el limite efectivo se multiplica por el numero de
// procesos. Para el piloto —una instancia— es suficiente; el dia que se escale,
// esto se muda a Redis o a una tabla, y este comentario es el recordatorio.
//
// No se guarda en Postgres a proposito: un intento fallido escribiendo en la
// base convierte la pantalla de login en un amplificador de escrituras, que es
// justo lo que busca quien la ataca.
const VENTANA_MS = 15 * 60 * 1000;
const MAX_POR_CUENTA = 8;    // intentos contra un mismo email desde una misma IP
const MAX_POR_ORIGEN = 30;   // intentos desde una misma IP contra cualquier email

interface Contador { n: number; hasta: number }
const porCuenta = new Map<string, Contador>();
const porOrigen = new Map<string, Contador>();

function pisar(mapa: Map<string, Contador>, clave: string, max: number): number {
  const ahora = Date.now();
  const c = mapa.get(clave);
  if (!c || c.hasta <= ahora) {
    mapa.set(clave, { n: 1, hasta: ahora + VENTANA_MS });
    return 0;
  }
  c.n++;
  return c.n > max ? Math.ceil((c.hasta - ahora) / 1000) : 0;
}

function limpiar(): void {
  const ahora = Date.now();
  for (const mapa of [porCuenta, porOrigen]) {
    for (const [k, c] of mapa) if (c.hasta <= ahora) mapa.delete(k);
  }
}
// Sin esto los dos mapas crecen con cada email distinto que alguien pruebe, que
// es una fuga de memoria a la que se llega escribiendo direcciones al azar.
const barrido = setInterval(limpiar, VENTANA_MS);
barrido.unref();

/** Solo para las pruebas: deja los contadores como recien arrancado. */
export function _reiniciarLimites(): void { porCuenta.clear(); porOrigen.clear(); }

// ---------------------------------------------------------------------------

interface FilaLogin {
  u_id: string; u_nombre: string; u_clave_hash: string | null; u_superadmin: boolean;
  m_tenant: string | null; m_empresa: string | null;
  m_rol: Rol | null; m_sites: string[] | null;
}

export default async function (app: FastifyInstance) {

  app.post('/auth/login', async (req: any, res) => {
    const email = normalizarEmail(String(req.body?.email ?? ''));
    const clave = String(req.body?.clave ?? '');
    const empresaPedida = req.body?.empresa_id ? String(req.body.empresa_id) : null;
    const origen = req.ip ?? 'desconocido';

    if (!email || !clave) {
      return res.code(400).send({ error: 'Faltan el email y la contraseña.' });
    }

    // El limite se mira ANTES de tocar la base: si no, un ataque de fuerza bruta
    // sigue costandonos una consulta y un scrypt por intento aunque lo
    // rechacemos despues.
    const esperaOrigen = pisar(porOrigen, origen, MAX_POR_ORIGEN);
    const esperaCuenta = pisar(porCuenta, `${origen}|${email}`, MAX_POR_CUENTA);
    const espera = Math.max(esperaOrigen, esperaCuenta);
    if (espera > 0) {
      res.header('Retry-After', String(espera));
      return res.code(429).send({
        error: 'Demasiados intentos. Prueba de nuevo dentro de un rato.',
      });
    }

    const { rows } = await getPool().query<FilaLogin>(
      `select * from fr_login($1)`, [email]);

    // Email desconocido: se gasta el mismo tiempo que una verificacion real
    // contra un hash señuelo, y se contesta lo mismo que si fallara la clave.
    if (rows.length === 0) {
      await gastarTiempoDeVerificacion(clave);
      return res.code(401).send({ error: 'Email o contraseña incorrectos.' });
    }

    const u = rows[0]!;
    const correcta = await verificarClave(clave, u.u_clave_hash);
    if (!correcta) {
      return res.code(401).send({ error: 'Email o contraseña incorrectos.' });
    }

    // A partir de aqui la persona ya esta autenticada, asi que los mensajes
    // pueden ser precisos: decirle «no tienes acceso» a quien acaba de acertar
    // su contraseña no le cuenta nada que no supiera.
    const membresias = rows.filter((r) => r.m_tenant && r.m_rol);
    if (membresias.length === 0) {
      // Cubre dos casos que desde fuera son el mismo: a quien le retiraron todos
      // los accesos, y al superadmin sin membresia. El superadmin no entra por
      // aqui a proposito: su via es la puerta auditada de soporte, no una
      // sesion normal sin empresa.
      return res.code(403).send({
        error: 'Esta cuenta no tiene acceso a ninguna empresa. Habla con tu administrador.',
      });
    }

    // Varias empresas: no se elige por ella. Se devuelven las suyas y vuelve a
    // llamar diciendo cual. Entrar en la primera de la lista es como acaba
    // alguien mirando datos de una planta que no era la que buscaba.
    let elegida = membresias[0]!;
    if (membresias.length > 1) {
      const m = empresaPedida ? membresias.find((x) => x.m_tenant === empresaPedida) : null;
      if (!m) {
        return res.code(300).send({
          elige_empresa: true,
          empresas: membresias.map((x) => ({
            id: x.m_tenant, nombre: x.m_empresa, rol: x.m_rol,
          })),
        });
      }
      elegida = m;
    }

    const sesion: Sesion = {
      userId: u.u_id,
      tenantId: elegida.m_tenant!,
      rol: elegida.m_rol!,
      sites: elegida.m_sites ?? [],
      superadmin: u.u_superadmin,
    };

    // Sella la fecha de acceso y, si el hash se creo con parametros mas debiles
    // que los de hoy, lo rehace. Este es el unico instante en que tenemos la
    // contraseña en claro para poder hacerlo.
    const rehecho = convieneRehacer(u.u_clave_hash) ? await hashClave(clave) : null;
    await getPool().query(`select fr_tras_acceso($1, $2)`, [u.u_id, rehecho]);

    await auditar(sesion, 'sesion.iniciada', {
      objeto: 'app_user', objetoId: u.u_id, ip: origen,
      detalle: { empresa: elegida.m_empresa, rol: elegida.m_rol },
    });

    // El acceso correcto limpia el contador: si no, ocho errores de tecleo a lo
    // largo de un turno acaban bloqueando a quien si sabe su contraseña.
    porCuenta.delete(`${origen}|${email}`);

    return {
      token: emitirToken(sesion, HORAS_SESION),
      expira_en: new Date(Date.now() + HORAS_SESION * 3600_000).toISOString(),
      usuario: {
        id: u.u_id, nombre: u.u_nombre, rol: elegida.m_rol,
        empresa: elegida.m_empresa, empresa_id: elegida.m_tenant,
      },
    };
  });
}
