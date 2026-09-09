// ---------------------------------------------------------------------------
// Buffer local. Es lo que convierte un corte de internet en un retraso en vez
// de en un agujero en el historico.
//
// SQLite del propio Node (node:sqlite, estable desde Node 22.5): una
// dependencia menos que auditar en un equipo que vive dentro de la red de un
// cliente industrial, que es justo donde menos apetece tener superficie.
// ---------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite';

export interface Pendiente {
  batchId: string;
  cuerpo: string;
  intentos: number;
}

export class Buffer {
  private db: DatabaseSync;

  constructor(ruta: string, private diasRetencion = 7) {
    this.db = new DatabaseSync(ruta);
    this.db.exec(`
      create table if not exists lote (
        batch_id text primary key,
        cuerpo   text    not null,
        creado   integer not null,
        intentos integer not null default 0,
        enviado  integer
      );
      create index if not exists lote_pendiente on lote (creado) where enviado is null;
    `);
  }

  encolar(batchId: string, cuerpo: unknown): void {
    this.db.prepare(
      `insert or ignore into lote (batch_id, cuerpo, creado) values (?, ?, ?)`,
    ).run(batchId, JSON.stringify(cuerpo), Date.now());
  }

  /** En orden de creacion: el historico tiene que reconstruirse en secuencia. */
  pendientes(limite = 20): Pendiente[] {
    return this.db.prepare(
      `select batch_id as batchId, cuerpo, intentos from lote
        where enviado is null order by creado limit ?`,
    ).all(limite) as unknown as Pendiente[];
  }

  marcarEnviado(batchId: string): void {
    this.db.prepare(`update lote set enviado = ? where batch_id = ?`)
      .run(Date.now(), batchId);
  }

  // Un fallo NO borra el lote. Se cuenta el intento y se reintenta con espera
  // creciente: si el cloud esta caido, insistir cada segundo no lo levanta y si
  // llena el disco del conector, ademas se pierde el dato.
  marcarFallo(batchId: string): void {
    this.db.prepare(`update lote set intentos = intentos + 1 where batch_id = ?`)
      .run(batchId);
  }

  esperaMs(intentos: number): number {
    return Math.min(5 * 60_000, 2_000 * 2 ** Math.min(intentos, 8));
  }

  /** Solo se purga lo YA enviado. Lo pendiente se conserva aunque sea viejo. */
  purgar(): number {
    const limite = Date.now() - this.diasRetencion * 86_400_000;
    const r = this.db.prepare(
      `delete from lote where enviado is not null and creado < ?`).run(limite);
    return Number(r.changes);
  }
}
