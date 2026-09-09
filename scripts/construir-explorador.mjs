#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Construye doc/explorador.html: el proyecto entero, navegable en una pagina.
//
// Se regenera cuando cambia el codigo. La plantilla es
// scripts/explorador.plantilla.html y aqui solo se inyectan los datos, para que
// tocar el diseño no obligue a tocar este fichero ni al reves.
//
// Lo que hace que esto sea un explorador y no un volcado de ficheros son las
// anotaciones de abajo: cada fichero dice PARA QUE sirve. Un arbol de 57
// ficheros sin eso no se lee, se hojea.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const SELLO = 'fases A · B · C · 9 sep 2026';

// Grupos en el orden en que tiene sentido leerlos, no en orden alfabetico.
const GRUPOS = [
  { nombre: 'Empezar por aquí', rutas: ['@resumen', 'README.md', 'CLAUDE.md'] },
  { nombre: 'Fase A · definición', dir: 'doc' },
  { nombre: 'Fase B · base de datos', dir: 'db' },
  { nombre: 'Fase B · backend', dir: 'src' },
  { nombre: 'Fase B · pruebas', dir: 'tests' },
  { nombre: 'Fase C · demo factory', rutas: [
      'doc/12-demo.md', 'scripts/demo-factory.mjs', 'scripts/demo-motor.mjs',
      'scripts/exportar-demo.mjs', 'scripts/construir-demo.mjs',
      'scripts/demo.plantilla.html'] },
  { nombre: 'Fase B · panel', dir: 'panel' },
  { nombre: 'Fase B · conector edge', dir: 'edge' },
  { nombre: 'Fase C · web comercial', dir: 'web' },
  { nombre: 'Herramientas', dir: 'scripts' },
  { nombre: 'Configuración', rutas: ['package.json', '.env.example', '.gitignore'] },
];

// Para qué sirve cada fichero. Sin esto el árbol no se lee.
const PARA = {
  'README.md': 'La puerta de entrada: qué es el producto, en qué fase está y cómo se levanta en local.',
  'CLAUDE.md': 'Las reglas de la casa. Lo que no se hace en este producto, y por qué.',
  'doc/00-producto.md': 'Qué vendemos, a quién, contra quién, y las fronteras que no cruzamos.',
  'doc/01-modulos.md': 'Los ocho radares. Cada uno con su problema, su dinero, su usuario y su decisión.',
  'doc/02-arquitectura.md': 'Las seis capas, el stack con el porqué de cada elección, y el Edge Connector.',
  'doc/03-modelo-datos.md': 'Entidades y relaciones, y las cuatro decisiones que gobiernan el esquema.',
  'doc/04-pantallas.md': 'Sitemap, wireframes, estados vacíos y el sistema visual del panel.',
  'doc/05-integraciones.md': 'La escalera de ingesta: del Excel al OPC UA, y cómo se mapea una fuente.',
  'doc/06-inteligencia.md': 'Motor de eventos, puntuaciones, Copilot y Factory Brain. Qué hace el LLM y qué no.',
  'doc/07-seguridad.md': 'La frontera OT/IT, el aislamiento multiempresa y los marcos normativos.',
  'doc/08-mvp-roadmap.md': 'El MVP recortado, la matriz de priorización, la Demo Factory y el roadmap.',
  'doc/09-comercial.md': 'Precios, el piloto de seis semanas, la web pública y cómo se llega al cliente.',
  'doc/10-decisiones.md': 'Las 29 decisiones tomadas, cada una con la alternativa descartada.',
  'doc/11-api.md': 'Contrato de la API: endpoints, autenticación e ingesta.',
  'db/01-extensiones.sql': 'TimescaleDB, pgvector y el rol de aplicación. Aquí vive fr_set_tenant().',
  'db/02-organizacion.sql': 'Empresa, planta, usuarios, membresías y el log de auditoría.',
  'db/03-planta.sql': 'El árbol de activos con su trigger de ruta, las señales y los conectores.',
  'db/04-contexto.sql': 'Productos, órdenes, lotes, turnos, operarios y proveedores. La capa que da significado al dato.',
  'db/05-series.sql': 'La hypertable de medidas, el rollup propio y la puerta controlada al dato crudo.',
  'db/06-eventos.sql': 'Paradas, alarmas y el catálogo de causas. La columna que más dice de una planta.',
  'db/07-calculo.sql': 'OEE, energía, calidad, mantenimiento y puntuaciones. Nada se guarda sin su explicación.',
  'db/08-inteligencia.sql': 'Línea base, anomalías, alertas, registro de IA y el índice vectorial.',
  'db/09-rls.sql': 'El aislamiento multiempresa, aplicado en bucle para que no se olvide ninguna tabla.',
  'db/10-vistas.sql': 'Las vistas que lee el panel. Ninguna consulta toca la tabla cruda.',
  'db/pruebas/semilla-fugas.sql': 'Planta dos empresas rivales, para después comprobar que no se ven.',
  'db/pruebas/fugas.sql': 'Once pruebas de fuga entre inquilinos. Corren como el rol de la API, no como superusuario.',
  'src/config.ts': 'Configuración congelada al arrancar, con lector de .env sin dependencias.',
  'src/db.ts': 'Barrera 2 de 3: no se exporta ningún query suelto. Todo pasa por conInquilino().',
  'src/api/servidor.ts': 'Fastify, registro de rutas y el gancho que exige sesión en todo lo que no es público.',
  'src/api/contexto.ts': 'Sesión, permisos por rol, auditoría y resolverSite() — el arreglo de la decisión 29.',
  'src/api/rutas/salud.ts': 'Comprueba que la base responde, no que el proceso sigue vivo.',
  'src/api/rutas/estado.ts': 'La pantalla de los 30 segundos, en una sola petición.',
  'src/api/rutas/alertas.ts': 'Bandeja, ficha con la cuenta abierta, y el feedback que cierra el bucle.',
  'src/api/rutas/activos.ts': 'El árbol de planta, la ficha de máquina y el acceso controlado al dato crudo.',
  'src/api/rutas/ingesta.ts': 'El sobre único de ingesta, idempotente por lote y con el token del conector.',
  'src/api/rutas/copilot.ts': '"Pregunta a tu fábrica": seis pasos, y el segundo es de seguridad.',
  'src/dominio/oee.ts': 'OEE siempre desglosado. No existe una función que devuelva solo el compuesto.',
  'src/dominio/microparadas.ts': 'Deriva la pérdida invisible del hueco en el contador. Con umbral adaptado al ciclo.',
  'src/dominio/impacto.ts': 'La traducción a euros, con la cuenta abierta. Si falta un dato, no se estima.',
  'src/dominio/severidad.ts': 'La severidad se decide por dinero y urgencia, no por desviación estadística.',
  'src/ia/proveedor.ts': 'La capa que impide que ningún proveedor de LLM entre en el código de negocio.',
  'src/motor/calcular.ts': 'Del dato crudo a las métricas con contexto: OEE por turno, línea en su cuello de botella, energía y líneas base.',
  'src/motor/detectar.ts': 'De la métrica a la alerta: detectores, impacto en euros, severidad y salud del activo.',
  'doc/12-demo.md': 'Qué simula la DEMO FACTORY, qué cuatro problemas planta y cómo se regenera.',
  'scripts/demo-factory.mjs': 'Genera 90 días de planta con semilla fija. Los cuatro problemas no van marcados en ninguna parte.',
  'scripts/demo-motor.mjs': 'Pasa el motor completo sobre la demo. Es también la prueba del motor.',
  'scripts/exportar-demo.mjs': 'Congela la demo en un JSON de 71 KB para el panel que se lleva a una reunión.',
  'scripts/construir-demo.mjs': 'Inyecta la instantánea en la plantilla del panel de demo.',
  'scripts/demo.plantilla.html': 'El panel navegable: nueve pantallas, gráficas con hover y la paleta validada.',
  'web/index.html': 'La web comercial: diez secciones, cifras reales de la demo y la sección de seguridad escrita para reenviar a IT.',
  'src/ia/consultas.ts': 'El catálogo de consultas del Copilot. El modelo elige plantilla; nunca escribe SQL.',
  'tests/dominio.test.ts': '17 pruebas de la lógica de producto. No necesitan base de datos.',
  'tests/api.test.ts': '11 pruebas contra base real. Comprueban el efecto, no la respuesta.',
  'panel/README.md': 'Estructura del panel y las reglas que no se negocian pantalla a pantalla.',
  'panel/src/estilo/tokens.css': 'El sistema visual entero. Oscuro por defecto: se mira en una nave.',
  'panel/src/componentes/ChipSeveridad.tsx': 'Color, forma e icono. El color nunca va solo.',
  'panel/src/componentes/Cifra.tsx': 'Un número con su tendencia y su cobertura. Sin dato no pinta un cero.',
  'panel/src/componentes/CuentaAbierta.tsx': 'La fórmula con los valores reales. Se renderiza siempre que hay un euro.',
  'edge/README.md': 'Las seis reglas que definen el conector. La primera desbloquea el proyecto con IT.',
  'edge/src/buffer.ts': 'Los siete días de buffer que convierten un corte de línea en un retraso.',
  'edge/src/fuentes/tipos.ts': 'El contrato de una fuente. Añadir OPC UA no toca nada más que ese directorio.',
  'scripts/migrar.mjs': 'Aplica db/*.sql en orden. Idempotente: se puede relanzar sobre una base montada.',
  'scripts/pruebas-fugas.mjs': 'Lanza la batería como fr_app, y se niega a correr si le das el rol equivocado.',
  'scripts/construir-explorador.mjs': 'Genera esta misma página. Se muerde la cola a propósito.',
  'scripts/explorador.plantilla.html': 'El diseño de esta página, separado de sus datos.',
  'package.json': 'Dos dependencias: fastify y pg. Nada más entra sin discutirlo.',
  '.env.example': 'Dos cadenas de conexión distintas, y el porqué de que sean dos.',
  '.gitignore': 'Lo que nunca sale de esta máquina.',
};

// Estado de verificación. Solo lo comprobado de verdad lleva chip.
const CHIPS = {
  'db/pruebas/fugas.sql': { chip: '11/11', tono: 'ok', estado: 'batería superada como fr_app' },
  'tests/dominio.test.ts': { chip: '17/17', tono: 'ok', estado: 'pasa sin base de datos' },
  'tests/api.test.ts': { chip: '11/11', tono: 'ok', estado: 'pasa contra PostgreSQL real' },
  'doc/10-decisiones.md': { chip: '38', tono: 'teal' },
  'scripts/demo-factory.mjs': { chip: '342k', tono: 'ok', estado: '342.528 medidas en 12 s' },
  'scripts/demo-motor.mjs': { chip: '8 alertas', tono: 'ok', estado: 'los 4 problemas salen solos' },
};
for (const f of ['01-extensiones','02-organizacion','03-planta','04-contexto','05-series',
                 '06-eventos','07-calculo','08-inteligencia','09-rls','10-vistas']) {
  CHIPS[`db/${f}.sql`] = { chip: 'aplica', tono: 'ok', estado: 'aplicado contra TimescaleDB pg16' };
}

const LENG = { '.sql':'sql', '.ts':'typescript', '.tsx':'typescript', '.mjs':'javascript',
               '.js':'javascript', '.css':'css', '.json':'json', '.html':'xml' };

const GENERADOS = new Set(['dossier.html', 'explorador.html', 'demo.html']);

function listar(dir) {
  const salida = [];
  for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
    const r = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...listar(r));
    // Las paginas generadas no se embeben a si mismas: doc/demo.html son 118 KB
    // de datos ya congelados y doblarian el peso de este explorador.
    else if (!e.name.startsWith('.') && !GENERADOS.has(e.name)) {
      salida.push(r);
    }
  }
  return salida.sort();
}

const ficheros = {};
const grupos = [];

for (const g of GRUPOS) {
  const rutas = g.rutas ?? listar(g.dir);
  const dentro = [];
  for (const r of rutas) {
    if (r === '@resumen') { dentro.push(r); continue; }
    let texto;
    try { texto = readFileSync(join(raiz, r), 'utf8'); } catch { continue; }
    const c = CHIPS[r] ?? {};
    ficheros[r] = {
      texto,
      bytes: Buffer.byteLength(texto),
      lineas: texto.split('\n').length,
      lenguaje: LENG[extname(r)] ?? null,
      para: PARA[r] ?? '',
      chip: c.chip ?? null,
      chipTono: c.tono ?? null,
      estado: c.estado ?? null,
    };
    dentro.push(r);
  }
  if (dentro.length) grupos.push({ nombre: g.nombre, ficheros: dentro });
}

const nFicheros = Object.keys(ficheros).length;
const nBytes = Object.values(ficheros).reduce((a, f) => a + (f.bytes ?? 0), 0);
const nLineas = Object.values(ficheros).reduce((a, f) => a + (f.lineas ?? 0), 0);

ficheros['@resumen'] = {
  texto: '', para: 'Todo lo que hay construido, y qué está comprobado de verdad.',
  bytes: 0, lineas: 0, chip: null, estado: null, lenguaje: null,
};

const resumen = `
<div class="resumen">
  <div class="md">
    <h1>Radactory, de un vistazo</h1>
    <p>Capa de inteligencia industrial sobre los sistemas que la fábrica ya tiene.
    Este explorador contiene el proyecto entero: la definición (fase A) y la
    estructura real (fase B), fichero a fichero.</p>
  </div>

  <div class="tarjetas">
    <div class="tj"><div class="k">Ficheros</div><div class="v">${nFicheros}</div><div class="d">sin dependencias</div></div>
    <div class="tj"><div class="k">Líneas</div><div class="v">${nLineas.toLocaleString('es-ES')}</div><div class="d">${(nBytes/1024).toFixed(0)} KB</div></div>
    <div class="tj"><div class="k">Esquema</div><div class="v ok">10/10</div><div class="d">aplican limpios</div></div>
    <div class="tj"><div class="k">Fugas</div><div class="v ok">11/11</div><div class="d">entre inquilinos</div></div>
    <div class="tj"><div class="k">Dominio</div><div class="v ok">17/17</div><div class="d">OEE, impacto…</div></div>
    <div class="tj"><div class="k">API</div><div class="v ok">11/11</div><div class="d">base real</div></div>
    <div class="tj"><div class="k">Demo</div><div class="v ok">4/4</div><div class="d">problemas detectados</div></div>
  </div>

  <div class="aviso">
    <b>Qué está comprobado y qué no</b>
    Lo que lleva chip verde se ha ejecutado: el esquema contra PostgreSQL 16 con
    TimescaleDB y pgvector, y las 39 pruebas contra esa misma base. El resto
    —panel, conector, rutas de energía y calidad— es estructura y contrato, todavía
    sin implementar. Está dicho fichero a fichero para que nadie confunda una cosa
    con la otra.
  </div>

  <div class="md">
    <h2>Por dónde entrar</h2>
    <ul>
      <li><strong>Si vienes a entender el producto</strong> — <code>doc/00-producto.md</code>,
      y luego <code>doc/01-modulos.md</code>.</li>
      <li><strong>Si vienes a discutir una decisión</strong> — <code>doc/10-decisiones.md</code>.
      Están las 29, cada una con la alternativa descartada.</li>
      <li><strong>Si vienes a mirar el código</strong> — <code>db/09-rls.sql</code> y
      <code>src/db.ts</code> primero: ahí está el aislamiento multiempresa, que es lo que
      condiciona todo lo demás.</li>
      <li><strong>Si vienes a vender</strong> — <code>doc/09-comercial.md</code>.</li>
    </ul>

    <h2>Lo que aún no existe</h2>
    <p>La <strong>web comercial</strong> está definida en <code>doc/09-comercial.md</code>
    pero no construida, y el <strong>panel</strong> tiene sistema visual y estructura pero
    no pantallas: se llenan en la fase C, junto con la Demo Factory, que es cuando habrá
    datos que enseñar.</p>
  </div>
</div>`.trim();

// Se escapan '<' y los separadores de linea Unicode: dentro de un <script>,
// un '</script>' en cualquier fichero del repositorio cerraria la etiqueta, y
// U+2028/U+2029 son saltos de linea validos para el parser de JavaScript.
const datos = 'window.__FR__=' + JSON.stringify({ sello: SELLO, grupos, ficheros, resumen })
  .replace(/</g, '\\u003c')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029') + ';';

const plantilla = readFileSync(join(raiz, 'scripts', 'explorador.plantilla.html'), 'utf8');
const salida = plantilla.replace('/*__DATOS__*/', () => datos);
writeFileSync(join(raiz, 'doc', 'explorador.html'), salida);

console.log(`doc/explorador.html · ${nFicheros} ficheros · ${(Buffer.byteLength(salida)/1024).toFixed(0)} KB`);
