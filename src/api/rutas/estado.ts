import type { FastifyInstance } from 'fastify';
import { conInquilino } from '../../db.ts';
import { puede, resolverSite } from '../contexto.ts';

export default async function (app: FastifyInstance) {
  // La pantalla de los 30 segundos, en una sola peticion.
  //
  // Va en un unico endpoint a proposito: seis peticiones en paralelo para
  // pintar seis cifras es lo que hace que el panel tarde en abrir, y un panel
  // que tarda es un panel que no se abre mañana.
  app.get('/plantas/:siteId/estado', async (req: any, res) => {
    const { sesion } = req;
    const { siteId } = req.params;
    if (!puede(sesion, 'planta.ver')) return res.code(403).send({ error: 'Sin permiso.' });

    return conInquilino(sesion.tenantId, async (db) => {
      // Fuera de alcance, de otra empresa o inexistente: la misma respuesta.
      // Un 403 confirmaria que la planta existe, y eso ya es informacion que no
      // le corresponde.
      if (!(await resolverSite(db, sesion, siteId))) {
        return res.code(404).send({ error: 'No encontrada.' });
      }

      const { rows: [hoy] } = await db.query(
        `select * from v_estado_planta
          where site_id = $1 and fecha = current_date`, [siteId]);

      const { rows: atencion } = await db.query(
        `select id, nodo_codigo, nodo_nombre, modulo, severidad, confianza,
                titulo, que_cambio, impacto_eur_anual, accion_recomendada, detectado_en
           from v_atencion
          where site_id = $1
          order by orden_severidad, impacto_eur_anual desc nulls last
          limit 5`, [siteId]);

      const { rows: [pendientes] } = await db.query(
        `select count(*)::int as n from v_atencion where site_id = $1`, [siteId]);

      // El marcador de la renovacion: es el numero que el director de planta le
      // enseña a su gerente cuando toca justificar la factura.
      const { rows: [mes] } = await db.query(
        `select coalesce(sum(impacto_eur_anual / 12), 0)::numeric(12,2) as eur
           from alert
          where site_id = $1
            and detectado_en >= date_trunc('month', now())`, [siteId]);

      const { rows: [causas] } = await db.query(
        `select pct_sin_causa from v_cobertura_causas
          where site_id = $1 order by semana desc limit 1`, [siteId]);

      return {
        fecha: hoy?.fecha ?? null,
        indicadores: {
          oee: hoy?.oee ?? null,
          calidad: hoy?.calidad ?? null,
          udsOk: hoy?.uds_ok ?? null,
          udsNok: hoy?.uds_nok ?? null,
          cobertura: hoy?.cobertura_min ?? null,
        },
        atencion,
        pendientes: pendientes?.n ?? 0,
        impactoMesEur: mes?.eur ?? 0,
        // Se devuelve SIEMPRE, aunque sea malo. Es la cifra que explica por que
        // no hay diagnostico cuando no lo hay, y el cliente tiene que verla.
        paradasSinCausaPct: causas?.pct_sin_causa ?? null,
      };
    });
  });
}
