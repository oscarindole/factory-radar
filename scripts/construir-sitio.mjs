#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Arma docs/, que es lo que sirve GitHub Pages ("Deploy from a branch:
// main /docs"). Se llama docs/ porque es la convencion de Pages, y no hay que
// confundirlo con doc/, que es la documentacion del proyecto.
//
// Aqui no se escribe contenido: se copia lo ya generado y se le pone un
// indice. Si hay que cambiar algo, se cambia en su origen y se vuelve a armar.
// ---------------------------------------------------------------------------
import { mkdirSync, copyFileSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
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

// URL publica del sitio, para las etiquetas que EXIGEN absoluta (Open Graph).
// Sale del CNAME si ya hay dominio propio; mientras no lo haya, de la direccion
// de Pages, que es donde esta vivo.
const cname = join(raiz, 'web', 'CNAME');
const BASE = existsSync(cname)
  ? `https://${readFileSync(cname, 'utf8').trim()}`
  : 'https://oscarindole.github.io/factory-radar';

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// Pages sirve el fichero tal cual: las paginas se generaron para incrustarse en
// el visor de artifacts, que aporta el esqueleto html/head/body. Aqui hay que
// ponerselo, o el navegador las renderiza sin charset ni viewport.
for (const p of PAGINAS) {
  const f = join(salida, p.a);
  if (!existsSync(f)) continue;
  const cuerpo = readFileSync(f, 'utf8');
  if (cuerpo.trimStart().toLowerCase().startsWith('<!doctype')) continue;
  const titulo = (cuerpo.match(/<title>([^<]*)<\/title>/i) || [, p.t])[1];
  // La descripcion sale del primer parrafo de entradilla de la propia pagina:
  // si se reescribe el texto, la tarjeta de WhatsApp se reescribe con el.
  const lead = (cuerpo.match(/<p class="lead[^"]*"[^>]*>([\s\S]*?)<\/p>/i) || [, ''])[1]
    .replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const descripcion = lead || p.t;
  writeFileSync(f, `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${titulo}</title>
<link rel="icon" type="image/png" href="favicon.png">
<meta name="description" content="${escapar(descripcion)}">

<!-- La tarjeta que se ve al pegar el enlace en WhatsApp, LinkedIn o X. La
     imagen la pinta scripts/construir-social.mjs. Va con URL ABSOLUTA a
     proposito: los rastreadores no resuelven rutas relativas, y con una
     relativa la vista previa sale sin imagen y nadie avisa. -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="RACTORY">
<meta property="og:title" content="${escapar(titulo)}">
<meta property="og:description" content="${escapar(descripcion)}">
<meta property="og:url" content="${BASE}/${p.a === 'index.html' ? '' : p.a}">
<meta property="og:image" content="${BASE}/social.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="RACTORY — Tu fábrica ya genera los datos. Nosotros te decimos qué significan.">
<meta name="twitter:card" content="summary_large_image">
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

// El icono de la pestana. Sin el, el navegador pide /favicon.ico en cada
// visita y se lleva un 404 — el unico error que quedaba en la consola.
{
  const icono = join(raiz, 'web', 'favicon.png');
  if (existsSync(icono)) copyFileSync(icono, join(salida, 'favicon.png'));
}

// La imagen social, al lado de las paginas: las etiquetas og:image la piden en
// la raiz del sitio. La cuadrada NO se publica — esa es para subirla a mano a
// un estado de WhatsApp o a Instagram, no para que la lea un rastreador.
{
  const social = join(raiz, 'web', 'social.jpg');
  if (existsSync(social)) {
    copyFileSync(social, join(salida, 'social.jpg'));
    console.log(`  social: social.jpg (${(readFileSync(social).length / 1024).toFixed(0)} KB)`);
  } else {
    console.log('  social: FALTA web/social.jpg — al compartir el enlace no saldra imagen');
  }
}

// Sin .nojekyll, Pages pasa todo por Jekyll y se salta lo que empieza por _
writeFileSync(join(salida, '.nojekyll'), '');

console.log(`docs/ armado · ${PAGINAS.length - faltan.length} páginas`);
if (faltan.length) console.log(`  faltan (no generadas todavía): ${faltan.join(', ')}`);
console.log('  Pages: Settings → Pages → Deploy from a branch → main /docs');
