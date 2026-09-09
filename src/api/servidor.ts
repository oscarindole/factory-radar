// ---------------------------------------------------------------------------
// API. Monolito modular: cada dominio en su fichero de rutas, con las fronteras
// ya dibujadas por si algun dia hay que partirlo. Ese dia no es hoy (decision 03).
// ---------------------------------------------------------------------------
import Fastify from 'fastify';
import { env, esProduccion } from '../config.ts';
import { leerToken, type Sesion } from './contexto.ts';
import { cerrar } from '../db.ts';

import salud      from './rutas/salud.ts';
import estado     from './rutas/estado.ts';
import alertas    from './rutas/alertas.ts';
import activos    from './rutas/activos.ts';
import ingesta    from './rutas/ingesta.ts';
import copilot    from './rutas/copilot.ts';

declare module 'fastify' {
  interface FastifyRequest { sesion: Sesion }
}

export function crearServidor() {
  const app = Fastify({
    logger: { level: esProduccion ? 'info' : 'debug' },
    // El cuerpo de un lote de ingesta es grande a proposito: el conector manda
    // por lotes de 30 s para no hacer una peticion por muestra.
    bodyLimit: 8 * 1024 * 1024,
  });

  // Rutas publicas. Todo lo demas exige sesion.
  const ABIERTAS = new Set(['/salud', '/v1/auth/login']);

  app.addHook('onRequest', async (req, res) => {
    if (ABIERTAS.has(req.url.split('?')[0]!)) return;

    // La ingesta se autentica con el token del conector, no con sesion de
    // usuario: es una maquina en una nave, no una persona.
    if (req.url.startsWith('/v1/ingesta')) return;

    const cab = req.headers.authorization;
    const sesion = cab?.startsWith('Bearer ') ? leerToken(cab.slice(7)) : null;
    if (!sesion) {
      return res.code(401).send({ error: 'Sesion no valida o caducada.' });
    }
    req.sesion = sesion;
  });

  // Errores: nunca se devuelve la traza al cliente. En un producto industrial
  // la traza revela nombres de tabla y version de motor, y eso es reconocimiento
  // gratis para quien esta mirando.
  app.setErrorHandler((e, req, res) => {
    req.log.error(e);
    const codigo = (e as any).statusCode ?? 500;
    res.code(codigo).send({
      error: codigo >= 500 ? 'Error interno.' : e.message,
    });
  });

  app.register(salud);
  app.register(estado,  { prefix: '/v1' });
  app.register(alertas, { prefix: '/v1' });
  app.register(activos, { prefix: '/v1' });
  app.register(ingesta, { prefix: '/v1' });
  app.register(copilot, { prefix: '/v1' });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = crearServidor();
  await app.listen({ port: env.puerto, host: '0.0.0.0' });
  for (const s of ['SIGINT', 'SIGTERM']) {
    process.on(s, async () => { await app.close(); await cerrar(); process.exit(0); });
  }
}
