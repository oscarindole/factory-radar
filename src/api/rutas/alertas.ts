import type { FastifyInstance } from 'fastify';
import { conInquilino } from '../../db.ts';
import { puede, alcanzaSite, auditar } from '../contexto.ts';

export default async function (app: FastifyInstance) {
  app.get('/alertas', async (req: any, res) => {
    const { sesion } = req;
    if (!puede(sesion, 'alerta.ver')) return res.code(403).send({ error: 'Sin permiso.' });
    const { siteId, estado = 'abierta', modulo, limite = 50 } = req.query;

    return conInquilino(sesion.tenantId, async (db) => {
      const { rows } = await db.query(
        `select a.id, a.site_id, a.modulo, a.severidad, a.confianza, a.titulo,
                a.que_cambio, a.por_que, a.impacto_eur_anual, a.accion_recomendada,
                a.estado, a.detectado_en, an.codigo as nodo_codigo, an.nombre as nodo_nombre
           from alert a
           left join asset_node an on an.id = a.asset_node_id
          where a.estado = $1
            and ($2::uuid is null or a.site_id = $2)
            and ($3::text is null or a.modulo = $3)
            -- El alcance por planta se aplica tambien en SQL, no solo en el
            -- codigo: es la unica forma de que un filtro olvidado en una ruta
            -- nueva no acabe enseñando la planta que no toca.
            and ($4::uuid[] = '{}' or a.site_id = any($4))
          order by case a.severidad when 'critica' then 1 when 'alta' then 2
                                    when 'media' then 3 else 4 end,
                   a.impacto_eur_anual desc nulls last, a.detectado_en desc
          limit $5`,
        [estado, siteId ?? null, modulo ?? null, sesion.sites, Math.min(Number(limite), 200)]);
      return { alertas: rows };
    });
  });

  // Ficha completa. Es la pantalla que demuestra que no somos un cuadro de
  // mando, asi que la cuenta abierta y las fuentes viajan SIEMPRE.
  app.get('/alertas/:id', async (req: any, res) => {
    const { sesion } = req;
    if (!puede(sesion, 'alerta.ver')) return res.code(403).send({ error: 'Sin permiso.' });

    return conInquilino(sesion.tenantId, async (db) => {
      const { rows: [a] } = await db.query(
        `select a.*, an.codigo as nodo_codigo, an.nombre as nodo_nombre
           from alert a left join asset_node an on an.id = a.asset_node_id
          where a.id = $1`, [req.params.id]);

      // Ni existe ni es de otro inquilino: la respuesta es la misma. La RLS ya
      // ha filtrado; aqui solo se evita distinguir los dos casos.
      if (!a || !alcanzaSite(sesion, a.site_id)) {
        return res.code(404).send({ error: 'No encontrada.' });
      }

      const { rows: recomendaciones } = await db.query(
        `select id, texto, ahorro_eur, coste_eur, esfuerzo, aceptada
           from recommendation where alert_id = $1`, [a.id]);

      // El diagnostico se genero una vez, al crear la alerta. No se vuelve a
      // pedir al LLM cada vez que alguien abre la ficha: eso multiplicaria el
      // coste de IA por el numero de curiosos.
      const { rows: [ia] } = await db.query(
        `select respuesta, fuentes, modelo, ts from ai_analysis
          where alert_id = $1 and tarea = 'diagnostico'
          order by ts desc limit 1`, [a.id]);

      const puedeVerCoste = puede(sesion, 'coste.ver');
      return {
        ...a,
        impacto_eur_anual: puedeVerCoste ? a.impacto_eur_anual : null,
        impacto_base:      puedeVerCoste ? a.impacto_base : { oculto: 'sin permiso de coste' },
        recomendaciones,
        diagnostico: ia ?? null,
      };
    });
  });

  // Feedback. Es lo unico que permite al sistema dejar de equivocarse: cada
  // 'no_era_nada' ajusta el umbral de esa señal en esa planta.
  app.post('/alertas/:id/feedback', async (req: any, res) => {
    const { sesion } = req;
    if (!puede(sesion, 'alerta.cerrar')) return res.code(403).send({ error: 'Sin permiso.' });
    const { feedback } = req.body ?? {};
    if (!['util', 'no_era_nada', 'ya_lo_sabia'].includes(feedback)) {
      return res.code(400).send({ error: 'feedback debe ser util, no_era_nada o ya_lo_sabia.' });
    }

    const r = await conInquilino(sesion.tenantId, async (db) => {
      const { rowCount } = await db.query(
        `update alert
            set feedback = $1, feedback_por = $2,
                estado = case when $1 = 'no_era_nada' then 'descartada' else estado end,
                cerrado_en = case when $1 = 'no_era_nada' then now() else cerrado_en end
          where id = $3`, [feedback, sesion.userId, req.params.id]);
      return rowCount;
    });
    if (!r) return res.code(404).send({ error: 'No encontrada.' });

    await auditar(sesion, 'alerta.feedback',
      { objeto: 'alert', objetoId: req.params.id, detalle: { feedback }, ip: req.ip });
    return { ok: true };
  });
}
