#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Bateria de fugas entre inquilinos. Barrera 3 de 3.
//
// Corre como fr_app A PROPOSITO. Ejecutarla con el usuario propietario o con un
// superusuario no prueba nada: los dos saltan RLS y todas las pruebas pasarian
// dando una falsa sensacion de seguridad.
//
// Si alguna falla, no se despliega. Sin excepciones y sin "ya lo miramos".
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'pruebas');

const urlDueno = process.env.DATABASE_URL_JOBS;
const urlApp   = process.env.DATABASE_URL;
if (!urlDueno || !urlApp) {
  console.error('Hacen falta DATABASE_URL y DATABASE_URL_JOBS.');
  process.exit(1);
}
if (urlApp === urlDueno) {
  console.error(
    'DATABASE_URL y DATABASE_URL_JOBS son la misma. La bateria no probaria nada:\n' +
    'el rol de los trabajos salta RLS. Usa fr_app en DATABASE_URL.');
  process.exit(1);
}

// La semilla se carga como dueño: planta dos empresas rivales saltandose RLS,
// que es justo lo que despues hay que comprobar que fr_app no puede hacer.
const dueno = new pg.Client({ connectionString: urlDueno });
await dueno.connect();
await dueno.query(readFileSync(join(dir, 'semilla-fugas.sql'), 'utf8'));
await dueno.query(
  "select fr_rollup('1h', '2026-09-09 00:00:00+02', '2026-09-10 00:00:00+02')");
await dueno.end();

const app = new pg.Client({ connectionString: urlApp });
await app.connect();
app.on('notice', (n) => console.log('  ' + n.message));
try {
  await app.query(readFileSync(join(dir, 'fugas.sql'), 'utf8')
    .replace(/^\\.*$/gm, ''));   // las meta-ordenes de psql no van por el driver
  console.log('\nBATERIA DE FUGAS SUPERADA');
} catch (e) {
  console.error(`\nFUGA DETECTADA: ${e.message}`);
  process.exitCode = 1;
} finally {
  await app.end();
}
