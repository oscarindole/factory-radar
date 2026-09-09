import type { FastifyInstance } from 'fastify';
import { conInquilino } from '../../db.ts';
import { puede, alcanzaSite, type Sesion } from '../contexto.ts';
import { buscar, catalogoParaModelo } from '../../ia/consultas.ts';
import { estadoPresupuesto } from '../../ia/proveedor.ts';

// ---------------------------------------------------------------------------
// "Pregunta a tu fabrica".
//
// El flujo es fijo y el paso 2 es de seguridad, no de comodidad:
//   1. Se interpreta la pregunta
//   2. Se elige una PLANTILLA del catalogo (nunca SQL libre)
//   3. Se ejecuta con el rol de quien pregunta
//   4. Se compone la respuesta con el dato real
//   5. Se citan las fuentes, siempre
//   6. Se registra todo en ai_analysis
// ---------------------------------------------------------------------------
export default async function (app: FastifyInstance) {
  app.post('/copilot', async (req: any, res) => {
    const sesion: Sesion = req.sesion;
    if (!puede(sesion, 'copilot.usar')) return res.code(403).send({ error: 'Sin permiso.' });

    const { pregunta, siteId, desde, hasta } = req.body ?? {};
    if (!pregunta || !siteId) return res.code(400).send({ error: 'Faltan pregunta y siteId.' });
    if (!alcanzaSite(sesion, siteId)) return res.code(404).send({ error: 'No encontrada.' });

    return conInquilino(sesion.tenantId, async (db) => {
      // Presupuesto ANTES de gastar. Degradar a modelo barato es preferible a
      // un corte seco, pero el usuario tiene que saber que esta degradado.
      const { rows: [g] } = await db.query(
        `select coalesce(sum(coste_eur), 0) as gastado,
                (select presupuesto_ia_eur from company where id = $1) as tope
           from ai_analysis
          where ts >= date_trunc('month', now())`, [sesion.tenantId]);
      const presupuesto = estadoPresupuesto(Number(g.gastado), Number(g.tope));

      // El catalogo que ve el modelo esta ya filtrado por el rol de quien
      // pregunta. Un operario no puede preguntarle a la IA algo que no veria
      // en pantalla: la IA no es una puerta trasera a los permisos.
      const catalogo = catalogoParaModelo((p) => puede(sesion, p));

      // --- paso 1 y 2: el modelo elige plantilla ---------------------------
      // (la llamada real vive en ia/proveedor.ts; aqui va el contrato)
      const eleccion = await elegirPlantilla(pregunta, catalogo);

      if (!eleccion) {
        // No se inventa una respuesta. Se dice que no se sabe, y se registra:
        // esa fila es el backlog del Copilot, escrito por el propio usuario.
        await db.query(
          `insert into ai_analysis (tenant_id, user_id, tarea, prompt, respuesta, contexto)
           values ($1, $2, 'copilot', $3, null, $4)`,
          [sesion.tenantId, sesion.userId, pregunta,
           JSON.stringify({ sin_plantilla: true, catalogo_visible: catalogo.split('\n').length })]);
        return {
          respuesta: 'No se contestar a eso todavia. Lo he anotado para poder hacerlo.',
          sinPlantilla: true, fuentes: [],
        };
      }

      const plantilla = buscar(eleccion.id);
      if (!plantilla || !puede(sesion, plantilla.permiso)) {
        return res.code(403).send({ error: 'Sin permiso para esa consulta.' });
      }

      // --- paso 3: ejecutar, ya dentro del inquilino y con RLS activa ------
      const valores = plantilla.parametros.map((p) =>
        p === 'siteId' ? siteId
        : p === 'desde' ? (desde ?? hace(7))
        : p === 'hasta' ? (hasta ?? new Date().toISOString())
        : eleccion.parametros[p] ?? null);
      const { rows } = await db.query(plantilla.sql, valores);

      // --- paso 4 y 5: componer sobre el dato real -------------------------
      const texto = await redactar(pregunta, rows, plantilla);
      const fuentes = [
        { tipo: 'consulta', id: plantilla.id, descripcion: plantilla.descripcion },
        { tipo: 'ventana', desde: valores[1], hasta: valores[2] },
      ];

      // --- paso 6: registrar ------------------------------------------------
      await db.query(
        `insert into ai_analysis
           (tenant_id, user_id, tarea, prompt, contexto, respuesta, fuentes,
            proveedor, modelo, tokens_in, tokens_out, coste_eur, latencia_ms)
         values ($1,$2,'copilot',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [sesion.tenantId, sesion.userId, pregunta,
         JSON.stringify({ plantilla: plantilla.id, filas: rows.length }),
         texto.texto, JSON.stringify(fuentes),
         texto.proveedor, texto.modelo, texto.tokensIn, texto.tokensOut,
         texto.costeEur, texto.latenciaMs]);

      return {
        respuesta: texto.texto,
        datos: rows,
        fuentes,
        presupuesto,
        // Si no hay dato suficiente se dice QUE dato falta. Esa respuesta es
        // comercialmente valiosa: justifica subir un peldaño en la escalera de
        // ingesta.
        sinDato: rows.length === 0,
      };
    });
  });
}

function hace(dias: number): string {
  return new Date(Date.now() - dias * 86400_000).toISOString();
}

// Contratos que implementa ia/proveedor.ts. Se dejan aqui declarados para que
// la ruta se lea entera sin saltar de fichero.
declare function elegirPlantilla(
  pregunta: string, catalogo: string,
): Promise<{ id: string; parametros: Record<string, unknown> } | null>;

declare function redactar(
  pregunta: string, filas: unknown[], plantilla: { id: string; descripcion: string },
): Promise<{ texto: string; proveedor: string; modelo: string;
             tokensIn: number; tokensOut: number; costeEur: number; latenciaMs: number }>;
