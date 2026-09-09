#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Arma docs/, que es lo que sirve GitHub Pages ("Deploy from a branch:
// main /docs"). Se llama docs/ porque es la convencion de Pages, y no hay que
// confundirlo con doc/, que es la documentacion del proyecto.
//
// Aqui no se escribe contenido: se copia lo ya generado y se le pone un
// indice. Si hay que cambiar algo, se cambia en su origen y se vuelve a armar.
// ---------------------------------------------------------------------------
import { mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const salida = join(raiz, 'docs');
mkdirSync(salida, { recursive: true });

const PAGINAS = [
  { de: 'web/index.html',       a: 'index.html',       t: 'Web comercial' },
  { de: 'doc/demo.html',        a: 'demo.html',        t: 'Demo Factory' },
  { de: 'doc/dossier.html',     a: 'dossier.html',     t: 'Dossier de producto' },
  { de: 'doc/explorador.html',  a: 'explorador.html',  t: 'Explorador del proyecto' },
];

const faltan = [];
for (const p of PAGINAS) {
  const origen = join(raiz, p.de);
  if (!existsSync(origen)) { faltan.push(p.de); continue; }
  copyFileSync(origen, join(salida, p.a));
}

// Pages sirve el fichero tal cual: las paginas se generaron para incrustarse en
// el visor de artifacts, que aporta el esqueleto html/head/body. Aqui hay que
// ponerselo, o el navegador las renderiza sin charset ni viewport.
import { readFileSync } from 'node:fs';
for (const p of PAGINAS) {
  const f = join(salida, p.a);
  if (!existsSync(f)) continue;
  const cuerpo = readFileSync(f, 'utf8');
  if (cuerpo.trimStart().toLowerCase().startsWith('<!doctype')) continue;
  const titulo = (cuerpo.match(/<title>([^<]*)<\/title>/i) || [, p.t])[1];
  writeFileSync(f, `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${titulo}</title>
<style>
  :root { color-scheme: light dark; }
  html, body { margin: 0; }
  body { font: 14px system-ui, sans-serif; background: #fff; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${cuerpo}
</body>
</html>
`);
}

// En Pages, la web enlaza a la demo del propio sitio, no al artifact privado.
// El origen guarda la URL del artifact porque es donde vive mientras no haya
// dominio; aqui se reescribe al publicar.
{
  const f = join(salida, 'index.html');
  if (existsSync(f)) {
    writeFileSync(f, readFileSync(f, 'utf8')
      .replace(/https:\/\/claude\.ai\/code\/artifact\/[0-9a-f-]+/g, 'demo.html'));
  }
}

// Sin .nojekyll, Pages pasa todo por Jekyll y se salta lo que empieza por _
writeFileSync(join(salida, '.nojekyll'), '');

console.log(`docs/ armado · ${PAGINAS.length - faltan.length} páginas`);
if (faltan.length) console.log(`  faltan (no generadas todavía): ${faltan.join(', ')}`);
console.log('  Pages: Settings → Pages → Deploy from a branch → main /docs');
