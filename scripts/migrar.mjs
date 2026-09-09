#!/usr/bin/env node
// Aplica db/*.sql en orden. Los ficheros son idempotentes (create if not
// exists, create or replace, drop policy if exists), asi que volver a lanzarlo
// sobre una base ya montada no rompe nada: es como se aplica una migracion.
//
// Se conecta con DATABASE_URL_JOBS porque crea extensiones, roles y politicas,
// y eso fr_app no puede hacerlo — ni debe.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir  = join(raiz, 'db');

const url = process.env.DATABASE_URL_JOBS || process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL_JOBS. Copia .env.example a .env.');
  process.exit(1);
}

const ficheros = readdirSync(dir).filter((f) => /^\d\d-.*\.sql$/.test(f)).sort();
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

for (const f of ficheros) {
  try {
    await cliente.query(readFileSync(join(dir, f), 'utf8'));
    console.log(`  ok    ${f}`);
  } catch (e) {
    console.error(`  FALLO ${f}\n        ${e.message}`);
    await cliente.end();
    process.exit(1);
  }
}
await cliente.end();
console.log(`\n${ficheros.length} ficheros aplicados.`);
