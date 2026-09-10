#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Arma docs/, que es lo que sirve GitHub Pages ("Deploy from a branch:
// main /docs"). Se llama docs/ porque es la convencion de Pages, y no hay que
// confundirlo con doc/, que es la documentacion del proyecto.
//
// Aqui no se escribe contenido: se copia lo ya generado y se le pone un
// indice. Si hay que cambiar algo, se cambia en su origen y se vuelve a armar.
// ---------------------------------------------------------------------------
import { mkdirSync, copyFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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

// El video viaja INCRUSTADO en web/index.html porque el visor de artifacts
// bloquea todo medio externo y ahi no hay otra forma de que se reproduzca.
// Para Pages eso seria un desperdicio: 780 KB dentro del HTML que el navegador
// no puede cachear aparte ni servir por partes. Aqui se cambia por los
// ficheros de media/, que si se cachean y se pueden ir descargando.
{
  const f = join(salida, 'index.html');
  if (existsSync(f)) {
    const antes = readFileSync(f, 'utf8');
    const despues = antes.replace(
      /<source src="data:video\/webm;base64,[^"]*" type="video\/webm">/,
      '<source src="media/planta.webm" type="video/webm">\n' +
      '        <source src="media/planta.mp4" type="video/mp4">');
    if (despues !== antes) {
      writeFileSync(f, despues);
      console.log(`  video: incrustado -> media/ (${((antes.length - despues.length) / 1024).toFixed(0)} KB menos)`);
    }
  }
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

// ---------------------------------------------------------------------------
// Dominio propio.
//
// Si existe web/CNAME, se copia al sitio y GitHub Pages sirve el sitio en ese
// dominio. IMPORTA EL ORDEN: en cuanto Pages ve un CNAME, deja de servir en
// oscarindole.github.io y redirige al dominio propio. Si el DNS todavia no
// resuelve, el resultado es que se cae la unica URL que funcionaba.
//
// Asi que primero el registro DNS, se comprueba que resuelve, y despues este
// fichero. Nunca al reves.
// ---------------------------------------------------------------------------
{
  const cn = join(raiz, 'web', 'CNAME');
  if (existsSync(cn)) {
    copyFileSync(cn, join(salida, 'CNAME'));
    console.log(`  dominio propio: ${readFileSync(cn, 'utf8').trim()}`);
  }
}

// El video y su poster: viven en web/media y se copian tal cual. En el
// artifact no cargan —su visor bloquea el medio externo— pero en Pages si, y
// por eso el poster va ademas incrustado en la propia pagina.
{
  const origen = join(raiz, 'web', 'media');
  if (existsSync(origen)) {
    const destino = join(salida, 'media');
    mkdirSync(destino, { recursive: true });
    for (const f of readdirSync(origen)) copyFileSync(join(origen, f), join(destino, f));
    console.log(`  media: ${readdirSync(origen).length} ficheros`);
  }
}

// Sin .nojekyll, Pages pasa todo por Jekyll y se salta lo que empieza por _
writeFileSync(join(salida, '.nojekyll'), '');

console.log(`docs/ armado · ${PAGINAS.length - faltan.length} páginas`);
if (faltan.length) console.log(`  faltan (no generadas todavía): ${faltan.join(', ')}`);
console.log('  Pages: Settings → Pages → Deploy from a branch → main /docs');
