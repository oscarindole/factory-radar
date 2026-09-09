import type { FastifyInstance } from 'fastify';
import { conInquilino, getPool } from '../../db.ts';
import { puede, auditar, type Sesion, type Rol } from '../contexto.ts';
import {
  puedeInvitar, alcanceValido, nuevoToken, hashToken,
  normalizarEmail, horasRestantes, DIAS_VIGENCIA,
} from '../../dominio/invitaciones.ts';

// ---------------------------------------------------------------------------
// Invitaciones.
//
// El rol viaja EN LA INVITACION, no lo elige quien la acepta. Y el enlace vive
// tres dias: se reenvia por WhatsApp igual que cualquier otro, asi que la
// vigencia corta es lo unico que limita el daño de un reenvio.
// ---------------------------------------------------------------------------
export default async function (app: FastifyInstance) {

  // --- crear ---------------------------------------------------------------
  app.post('/invitaciones', async (req: any, res) => {
    const sesion: Sesion = req.sesion;
    if (!puede(sesion, 'usuario.invitar')) {
      return res.code(403).send({ error: 'Tu rol no puede invitar.' });
    }

    const email = normalizarEmail(String(req.body?.email ?? ''));
    const rol = req.body?.rol as Rol;
    const sites: string[] = Array.isArray(req.body?.sites) ? req.body.sites : [];

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.code(400).send({ error: 'Correo no válido.' });
    }

    // Nadie invita por encima de si mismo, ni concede plantas que no alcanza.
    // Las dos comprobaciones van ANTES de tocar la base: una invitacion mal
    // concedida ya no se puede retirar del buzon de nadie.
    const r = puedeInvitar(sesion.rol, rol);
    if (!r.puede) return res.code(403).send({ error: r.motivo });
    const a = alcanceValido(sesion.sites, sites);
    if (!a.puede) return res.code(403).send({ error: a.motivo });

    const { token, hash } = nuevoToken();

    try {
      const inv = await conInquilino(sesion.tenantId, async (db) => {
        const { rows: [fila] } = await db.query(
          `insert into invitation
             (tenant_id, email, rol, sites, token_hash, invitado_por, expira_en)
           -- La caducidad la calcula la BASE. Calculada en la aplicacion, los
           -- milisegundos que pasan hasta el insert la dejan por encima de
           -- creada_en + 3 dias y salta el CHECK de vigencia maxima.
           values (fr_tenant(), $1, $2, $3, $4, $5, now() + interval '3 days')
           returning id, email, rol, sites, creada_en, expira_en`,
          [email, rol, sites, hash, sesion.userId]);
        return fila;
      });

      await auditar(sesion, 'invitacion.creada', {
        objeto: 'invitation', objetoId: inv.id,
        detalle: { email, rol, sites, expira_en: inv.expira_en }, ip: req.ip });

      // El token entero se devuelve UNA sola vez y no se vuelve a poder leer:
      // en la base solo queda su hash. Si se pierde, se revoca y se reinvita.
      return res.code(201).send({
        ...inv,
        token,
        enlace: `${req.headers.origin ?? ''}/invitacion/${token}`,
        caduca_en_horas: DIAS_VIGENCIA * 24,
        aviso: 'Este token no se puede volver a consultar. Guárdalo o reenvía la invitación.',
      });
    } catch (e: any) {
      // El indice parcial impide dos invitaciones vivas para el mismo correo:
      // si circularan dos enlaces con roles distintos, valdria el ultimo que se
      // canjeara, que es justo lo que nadie espera.
      if (e?.code === '23505') {
        return res.code(409).send({
          error: 'Ya hay una invitación pendiente para ese correo. Revócala antes de crear otra.' });
      }
      throw e;
    }
  });

  // --- listar --------------------------------------------------------------
  app.get('/invitaciones', async (req: any, res) => {
    const sesion: Sesion = req.sesion;
    if (!puede(sesion, 'usuario.invitar')) {
      return res.code(403).send({ error: 'Sin permiso.' });
    }
    return conInquilino(sesion.tenantId, async (db) => {
      const { rows } = await db.query(
        `select id, email, rol, sites, estado, creada_en, expira_en,
                horas_restantes, invitado_por
           from v_invitaciones
          order by creada_en desc limit 200`);
      return { invitaciones: rows };
    });
  });

  // --- revocar -------------------------------------------------------------
  app.post('/invitaciones/:id/revocar', async (req: any, res) => {
    const sesion: Sesion = req.sesion;
    if (!puede(sesion, 'usuario.invitar')) {
      return res.code(403).send({ error: 'Sin permiso.' });
    }
    const n = await conInquilino(sesion.tenantId, async (db) => {
      const { rowCount } = await db.query(
        `update invitation set revocada_en = now(), revocada_por = $2
          where id = $1 and aceptada_en is null and revocada_en is null`,
        [req.params.id, sesion.userId]);
      return rowCount;
    });
    if (!n) return res.code(404).send({ error: 'No encontrada, o ya aceptada o revocada.' });
    await auditar(sesion, 'invitacion.revocada',
      { objeto: 'invitation', objetoId: req.params.id, ip: req.ip });
    return { ok: true };
  });

  // -------------------------------------------------------------------------
  // Consultar y canjear. SIN SESION: quien acepta todavia no tiene cuenta.
  // La credencial es el propio token, y por eso lleva 256 bits de entropia.
  // -------------------------------------------------------------------------
  app.get('/invitaciones/canjear/:token', async (req: any, res) => {
    // fr_invitacion_por_token es SECURITY DEFINER: la tabla sigue bajo RLS y
    // fr_app no la ve sin inquilino fijado, pero aqui todavia no hay inquilino
    // ni sesion. La funcion solo admite un hash y no devuelve identificadores.
    const { rows: [inv] } = await getPool().query(
      `select * from fr_invitacion_por_token($1)`, [hashToken(String(req.params.token))]);

    if (!inv) return res.code(404).send({ error: 'Esta invitación no es válida o ha caducado.' });
    return {
      empresa: inv.empresa, email: inv.email, rol: inv.rol,
      caduca_en: inv.expira_en, horas_restantes: horasRestantes(inv.expira_en),
    };
  });

  app.post('/invitaciones/canjear', async (req: any, res) => {
    const token = String(req.body?.token ?? '');
    const nombre = String(req.body?.nombre ?? '').trim();
    if (!token || !nombre) return res.code(400).send({ error: 'Faltan token y nombre.' });

    // Todo el canje ocurre dentro de la funcion: bloqueo, validacion, alta de
    // usuario, membresia, marcado y auditoria, en una sola transaccion.
    //
    // El rol sale de la fila de invitacion. No hay ningun parametro por el que
    // quien acepta pueda influir en sus permisos, y por eso `rol` o `email` en
    // el cuerpo de la peticion se ignoran sin mas.
    const { rows: [r] } = await getPool().query(
      `select * from fr_canjear_invitacion($1, $2)`, [hashToken(token), nombre]);

    if (!r?.ok) return res.code(404).send({ error: 'Esta invitación no es válida o ha caducado.' });
    return { ok: true, rol: r.rol_asignado, empresa_id: r.empresa_id };
  });
}
