import type { FastifyInstance } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';
import { conInquilino, getPool } from '../../db.ts';

// ---------------------------------------------------------------------------
// Ingesta. Se autentica con el token del conector, no con sesion de usuario:
// al otro lado hay una maquina en una nave, no una persona.
//
// El contrato es el mismo venga de donde venga el dato (CSV, SQL, OPC UA): un
// unico sobre con medidas y eventos. Añadir un protocolo nuevo no toca esto.
// ---------------------------------------------------------------------------
interface Sobre {
  connector_id: string;
  batch_id: string;
  sent_at: string;
  measurements?: Array<{ signal: string; ts: string; value: number; q?: number }>;
  events?: Array<{ asset: string; type: string; ts_start: string; ts_end?: string;
                   reason?: string | null; source?: string }>;
}

export default async function (app: FastifyInstance) {
  app.post('/ingesta', async (req: any, res) => {
    const sobre = req.body as Sobre;
    const cab = req.headers.authorization;
    const token = cab?.startsWith('Bearer ') ? cab.slice(7) : null;
    if (!token || !sobre?.connector_id || !sobre?.batch_id) {
      return res.code(401).send({ error: 'Lote sin credencial o sin identificador.' });
    }

    // El token del conector se guarda solo como hash: si se filtra la base, no
    // se puede suplantar a ningun conector con lo que hay dentro.
    const { rows: [c] } = await getPool().query(
      `select id, tenant_id, site_id, token_hash from connector where id = $1`,
      [sobre.connector_id]);
    if (!c?.token_hash) return res.code(401).send({ error: 'Conector desconocido.' });

    const esperado = Buffer.from(c.token_hash);
    const recibido = Buffer.from(createHash('sha256').update(token).digest('hex'));
    if (esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) {
      return res.code(401).send({ error: 'Credencial no valida.' });
    }

    return conInquilino(c.tenant_id, async (db) => {
      // Idempotencia. El conector reenvia sin miedo tras un corte de linea, y
      // el duplicado se descarta AQUI: el conector puede haberse reiniciado y
      // haber perdido la memoria de lo que ya mando.
      const ya = await db.query(
        `insert into ingest_batch (batch_id, tenant_id, connector_id, n_medidas, n_eventos)
         values ($1, $2, $3, $4, $5) on conflict (batch_id) do nothing`,
        [sobre.batch_id, c.tenant_id, c.id,
         sobre.measurements?.length ?? 0, sobre.events?.length ?? 0]);
      if (ya.rowCount === 0) {
        return { ok: true, duplicado: true, medidas: 0, eventos: 0 };
      }

      let medidas = 0, eventos = 0, desconocidas: string[] = [];

      for (const m of sobre.measurements ?? []) {
        const { rows: [s] } = await db.query(
          `select id, min_valido, max_valido from signal where codigo = $1`, [m.signal]);
        if (!s) { desconocidas.push(m.signal); continue; }

        // Fuera de rango se marca como `bad` y NO entra en ningun calculo.
        // Nunca se corrige en silencio: la lectura mala se conserva, porque
        // suele ser el sintoma de un sensor que se esta yendo.
        let q = m.q ?? 0;
        if ((s.min_valido !== null && m.value < s.min_valido) ||
            (s.max_valido !== null && m.value > s.max_valido)) q = 2;

        await db.query(
          `insert into measurement (tenant_id, signal_id, ts, value, quality)
           values ($1, $2, $3, $4, $5)
           on conflict (tenant_id, signal_id, ts) do nothing`,
          [c.tenant_id, s.id, m.ts, m.value, q]);
        medidas++;
      }

      for (const e of sobre.events ?? []) {
        const { rows: [n] } = await db.query(
          `select id from asset_node where codigo = $1 and site_id = $2`,
          [e.asset, c.site_id]);
        if (!n) { desconocidas.push(e.asset); continue; }
        await db.query(
          `insert into event (tenant_id, asset_node_id, tipo, ts_start, ts_end, source)
           values ($1, $2, $3, $4, $5, $6)`,
          [c.tenant_id, n.id, e.type, e.ts_start, e.ts_end ?? null, e.source ?? 'scada']);
        eventos++;
      }

      await db.query(
        `update connector set estado = 'ok', ultimo_lote_en = now(),
                ultimo_error = case when $2 = 0 then null else ultimo_error end
          where id = $1`, [c.id, desconocidas.length]);

      // Las señales sin mapear se devuelven al conector Y se registran. Es la
      // señal de que la fuente ha cambiado de forma —alguien añadio una columna
      // al Excel, el SCADA renombro un tag— y hay que revisar el mapeo antes de
      // seguir calculando con datos mal alineados.
      return {
        ok: true, medidas, eventos,
        sinMapear: [...new Set(desconocidas)].slice(0, 20),
      };
    });
  });
}
