import type { FastifyInstance } from 'fastify';
import { conInquilino } from '../../db.ts';
import { puede, alcanzaSite, resolverSite } from '../contexto.ts';

export default async function (app: FastifyInstance) {
  // El arbol de planta entero. Se devuelve plano con `ruta`, y lo monta el
  // panel: mandar un arbol anidado por JSON obliga a rehacer la peticion cada
  // vez que cambia un filtro.
  app.get('/plantas/:siteId/activos', async (req: any, res) => {
    const { sesion } = req;
    if (!puede(sesion, 'planta.ver')) return res.code(403).send({ error: 'Sin permiso.' });

    return conInquilino(sesion.tenantId, async (db) => {
      if (!(await resolverSite(db, sesion, req.params.siteId))) {
        return res.code(404).send({ error: 'No encontrada.' });
      }
      const { rows } = await db.query(
        `select id, parent_id, ruta, tipo, codigo, nombre, fabricante, modelo,
                criticidad, activo
           from asset_node
          where site_id = $1 and activo
          order by array_length(ruta, 1) nulls first, codigo`, [req.params.siteId]);
      return { activos: rows };
    });
  });

  // Ficha de activo: el hub de una maquina.
  app.get('/activos/:id', async (req: any, res) => {
    const { sesion } = req;
    if (!puede(sesion, 'planta.ver')) return res.code(403).send({ error: 'Sin permiso.' });

    return conInquilino(sesion.tenantId, async (db) => {
      const { rows: [n] } = await db.query(
        `select * from asset_node where id = $1`, [req.params.id]);
      if (!n || !alcanzaSite(sesion, n.site_id)) {
        return res.code(404).send({ error: 'No encontrado.' });
      }

      // La puntuacion viaja SIEMPRE con sus componentes abiertos y con los
      // pesos con que se calculo. El panel enseña un "¿como?" al lado y tiene
      // que poder rellenarlo sin recalcular (decision 11).
      const { rows: [score] } = await db.query(
        `select score, c_fiabilidad, c_comportamiento, c_mantenimiento,
                c_criticidad, mtbf_h, mttr_h, pesos, entradas, fecha
           from asset_score where asset_node_id = $1
          order by fecha desc limit 1`, [req.params.id]);

      const { rows: [hace30] } = await db.query(
        `select score from asset_score
          where asset_node_id = $1 and fecha <= current_date - 30
          order by fecha desc limit 1`, [req.params.id]);

      const { rows: senales } = await db.query(
        `select id, codigo, nombre, clase, unidad, cadencia_s
           from signal where asset_node_id = $1 and activo order by codigo`,
        [req.params.id]);

      const { rows: alertas } = await db.query(
        `select id, severidad, titulo, impacto_eur_anual, detectado_en
           from alert where asset_node_id = $1 and estado = 'abierta'
          order by detectado_en desc limit 10`, [req.params.id]);

      return {
        activo: n,
        salud: score ? {
          ...score,
          delta30: hace30 ? score.score - hace30.score : null,
        } : null,
        senales,
        alertas,
        // Sin senales no hay dato, y decirlo aqui evita que el panel pinte una
        // grafica vacia que el usuario interpreta como "la maquina esta parada".
        sinDato: senales.length === 0,
      };
    });
  });

  // El dato crudo, para poder abrir cualquier cifra hasta el fondo. Pasa por
  // fr_measurements(), que aplica el filtro de inquilino por su cuenta porque
  // `measurement` no lleva RLS (ver db/05-series.sql).
  app.get('/senales/:id/muestras', async (req: any, res) => {
    const { sesion } = req;
    if (!puede(sesion, 'planta.ver')) return res.code(403).send({ error: 'Sin permiso.' });
    const { desde, hasta } = req.query;
    if (!desde || !hasta) return res.code(400).send({ error: 'Faltan desde y hasta.' });

    return conInquilino(sesion.tenantId, async (db) => {
      const { rows } = await db.query(
        `select ts, value, quality from fr_measurements($1, $2, $3)`,
        [req.params.id, desde, hasta]);
      // Un hueco es un hueco: se devuelve tal cual, sin interpolar. El panel lo
      // pinta como franja gris. Unir la linea por encima de un vacio es
      // inventarse un dato, y un dato inventado en industria es un diagnostico
      // equivocado (decision 14).
      return { muestras: rows, huecos: true };
    });
  });
}
