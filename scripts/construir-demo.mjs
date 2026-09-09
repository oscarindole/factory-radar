#!/usr/bin/env node
// Inyecta la instantanea en la plantilla del panel de demo.
// El diseño vive en scripts/demo.plantilla.html; aqui solo van los datos.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const datos = readFileSync(join(raiz, 'var', 'demo.json'), 'utf8');

// '<' escapado: un '</script>' dentro de cualquier texto de la instantanea
// cerraria la etiqueta. U+2028 y U+2029 son saltos de linea para el parser de JS.
const inyectable = 'window.__DEMO__=' + datos
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029') + ';';

const html = readFileSync(join(raiz, 'scripts', 'demo.plantilla.html'), 'utf8')
  .replace('/*__DATOS__*/', () => inyectable);

writeFileSync(join(raiz, 'doc', 'demo.html'), html);
console.log(`doc/demo.html · ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
