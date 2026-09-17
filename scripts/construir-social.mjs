#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pinta la imagen que sale al compartir el enlace (WhatsApp, LinkedIn,
// Facebook, X, Telegram) a partir de scripts/social.plantilla.html.
//
//   node scripts/construir-social.mjs
//
// POR QUE CON UN NAVEGADOR
//
// La tarjeta usa la tipografia de la marca (Newsreader, Archivo, IBM Plex
// Mono) y el mismo velo del heroe. Componerla a mano en un editor de imagen
// obliga a repetir esos valores y a que se desvien en cuanto cambie el
// sistema visual; asi se pinta del mismo HTML y CSS que la web.
//
// DOS PROPORCIONES, PORQUE NO SE COMPARTE IGUAL
//
//   social.jpg          1200x630 — la de Open Graph. Es la que leen WhatsApp,
//                       LinkedIn, Facebook y X, y la unica que da tarjeta
//                       grande: con una cuadrada sale una miniatura al lado
//                       del texto.
//   social-cuadrada.jpg 1080x1080 — para subirla a mano a un estado de
//                       WhatsApp o a Instagram, donde el 1,91:1 queda con dos
//                       franjas.
//
// El JPEG se mantiene por debajo de 600 KB: por encima, muchos rastreadores
// desisten y la vista previa se queda en blanco.
// ---------------------------------------------------------------------------
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Los recursos van EMPOTRADOS en el HTML como data:. El documento se carga con
// setContent, asi que su origen es about:blank y Chromium le prohibe leer
// file:// — la foto salia rota y las fuentes caian a las del sistema. Empotrar
// tambien hace la captura reproducible: no depende de rutas ni de permisos.
const dataUri = (rel, tipo) =>
  `data:${tipo};base64,${readFileSync(join(raiz, rel)).toString('base64')}`

const FUENTES = {
  '__F_NEWSREADER__': dataUri('web/fonts/Newsreader-200-latin.woff2', 'font/woff2'),
  '__F_ARCHIVO_500__': dataUri('web/fonts/Archivo-500-latin.woff2', 'font/woff2'),
  '__F_ARCHIVO_600__': dataUri('web/fonts/Archivo-600-latin.woff2', 'font/woff2'),
  '__F_MONO__': dataUri('web/fonts/IBMPlexMono-500-latin.woff2', 'font/woff2'),
}
const FOTO = dataUri('web/media/planta.jpg', 'image/jpeg')
const plantilla = readFileSync(join(raiz, 'scripts/social.plantilla.html'), 'utf8')

// playwright-core no esta en las dependencias de este repositorio: se toma
// prestado de donde ya este instalado, porque esto se ejecuta a mano una vez
// cada muchas semanas y no justifica 300 MB de navegador propio.
const PRESTADOS = [
  '../workspace-vertary/radar-one/node_modules/playwright-core/index.js',
  '../workspace-vertary/trend-radar/node_modules/playwright-core/index.js',
]
const require_ = createRequire(import.meta.url)
let chromium
for (const p of PRESTADOS) {
  try { ({ chromium } = require_(resolve(raiz, p))); break } catch { /* el siguiente */ }
}
if (!chromium) {
  console.error('No encuentro playwright-core. Instalalo o ajusta PRESTADOS.')
  process.exit(2)
}

const FORMATOS = [
  {
    salida: 'web/social.jpg',
    ancho: 1200, alto: 630, pad: 56,
    titular: 62, label: 15, dato: 15, marca: 30, marcaTxt: 21, texto: 880, h1top: 24,
  },
  {
    salida: 'web/social-cuadrada.jpg',
    ancho: 1080, alto: 1080, pad: 72,
    titular: 74, label: 17, dato: 16, marca: 36, marcaTxt: 25, texto: 820, h1top: 32,
  },
]

// El navegador descargado no tiene por que ser la build exacta que pide la
// version de playwright-core prestada (aqui: instalado el 1228, pedido el
// 1234), y entonces launch() falla pidiendo `npx playwright install`. Como la
// captura no usa nada de punta, sirve cualquiera de los dos que haya en la
// cache: se busca y se le pasa la ruta a mano.
function navegadorInstalado() {
  const cache = join(process.env.HOME ?? '', 'Library/Caches/ms-playwright')
  if (!existsSync(cache)) return undefined
  const candidatos = []
  for (const d of readdirSync(cache)) {
    const base = join(cache, d)
    if (d.startsWith('chromium_headless_shell-')) {
      for (const sub of readdirSync(base)) {
        candidatos.push(join(base, sub, 'chrome-headless-shell'))
      }
    } else if (d.startsWith('chromium-')) {
      for (const sub of readdirSync(base)) {
        candidatos.push(join(base, sub, 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
        candidatos.push(join(base, sub, 'Chromium.app/Contents/MacOS/Chromium'))
      }
    }
  }
  return candidatos.find((c) => existsSync(c))
}

const executablePath = navegadorInstalado()
const navegador = await chromium.launch(executablePath ? { executablePath } : {})
try {
  for (const f of FORMATOS) {
    const html = plantilla
      .replaceAll('__ANCHO__', f.ancho).replaceAll('__ALTO__', f.alto)
      .replaceAll('__PAD__', f.pad).replaceAll('__TITULAR__', f.titular)
      .replaceAll('__LABEL__', f.label).replaceAll('__DATO__', f.dato)
      .replaceAll('__MARCA__', f.marca).replaceAll('__MARCATXT__', f.marcaTxt)
      .replaceAll('__TEXTO__', f.texto).replaceAll('__H1TOP__', f.h1top)
      .replaceAll('__FOTO__', FOTO)
    const conFuentes = Object.entries(FUENTES)
      .reduce((acc, [clave, uri]) => acc.replaceAll(clave, uri), html)

    const pagina = await navegador.newPage({ viewport: { width: f.ancho, height: f.alto } })
    await pagina.setContent(conFuentes, { waitUntil: 'load' })
    // Sin esto la captura puede salir con la tipografia de respaldo: las
    // fuentes se cargan con font-display:block y el load no las espera.
    await pagina.evaluate(() => document.fonts.ready)
    const destino = join(raiz, f.salida)
    await pagina.screenshot({ path: destino, type: 'jpeg', quality: 88 })
    await pagina.close()

    const kb = Math.round(statSync(destino).size / 1024)
    console.log(`${f.salida.padEnd(26)} ${f.ancho}x${f.alto}  ${kb} KB` +
      (statSync(destino).size > 600 * 1024 ? '  ← PASA DE 600 KB, baja la calidad' : ''))
  }
} finally {
  await navegador.close()
}
