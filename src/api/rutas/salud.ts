import type { FastifyInstance } from 'fastify';
import { getPool } from '../../db.ts';

export default async function (app: FastifyInstance) {
  // Comprueba el EFECTO, no la respuesta: que la base contesta, no que el
  // proceso sigue vivo. Un proceso vivo sin base no atiende a nadie.
  app.get('/salud', async (_req, res) => {
    try {
      const r = await getPool().query('select now() as ts, 1 as ok');
      return { ok: true, ts: r.rows[0].ts };
    } catch (e) {
      return res.code(503).send({ ok: false, error: 'base no disponible' });
    }
  });
}
