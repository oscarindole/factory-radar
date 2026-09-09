#!/usr/bin/env node
// ---------------------------------------------------------------------------
// DEMO FACTORY · Planta de Torrelavega
//
// 3 lineas · 15 maquinas · 3 turnos · 5 productos · 90 dias de historico.
//
// Con CUATRO problemas plantados que el usuario tiene que poder descubrir
// navegando. No estan marcados en ningun sitio: si el motor de deteccion no los
// encuentra solo, el motor esta mal, y esta demo es tambien su prueba.
//
// DETERMINISTA a proposito. Una demo comercial que sale distinta cada vez no se
// puede ensayar, y no se puede depurar cuando alguien dice "ayer salia otro
// numero". La semilla del generador es fija.
//
// Y los datos tienen que CUADRAR ENTRE MODULOS: si la Linea 3 pierde
// rendimiento, su produccion baja, su consumo por unidad sube y el turno de
// noche lo acusa mas. Un director de planta detecta un dato falso en veinte
// segundos —lleva veinte años viendolos— y una demo incoherente destruye la
// credibilidad de toda la reunion.
// ---------------------------------------------------------------------------
import pg from 'pg';

const TENANT = 'dcdcdcdc-0000-0000-0000-00000000dec0';
const SITE   = 'dcdcdcdc-1111-0000-0000-00000000dec0';
const HASTA  = new Date('2026-09-09T00:00:00+02:00');
const DIAS   = 90;
const DESDE  = new Date(HASTA.getTime() - DIAS * 86400_000);
const PASO_S = 300;                      // muestreo de 5 min
const TZ     = '+02:00';                 // CEST: los 90 dias caen dentro

// mulberry32: generador con semilla. Reproducible entre maquinas y versiones.
function prng(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = prng(20260909);
const ruido = (s) => (R() - 0.5) * 2 * s;
const entre = (a, b) => a + R() * (b - a);

// --- estructura de la planta -----------------------------------------------

const AREAS = [
  { cod: 'NAVE-1', nom: 'Nave de producción' },
  { cod: 'SERV',   nom: 'Servicios auxiliares' },
];

const LINEAS = [
  { cod: 'L1', nom: 'Línea 1 · Mecanizado', area: 'NAVE-1', coste: 1450, turnos: ['manana','tarde'] },
  { cod: 'L2', nom: 'Línea 2 · Montaje',    area: 'NAVE-1', coste: 1900, turnos: ['manana','tarde'] },
  { cod: 'L3', nom: 'Línea 3 · Envasado',   area: 'NAVE-1', coste: 3200, turnos: ['manana','tarde','noche'] },
];

const MAQUINAS = [
  { cod:'L1.TORNO', nom:'Torno CNC 1',        linea:'L1', crit:4, ciclo:12.5, base:0.90 },
  { cod:'L1.FRESA', nom:'Fresadora 2',        linea:'L1', crit:3, ciclo:12.5, base:0.88 },
  { cod:'L1.LAVADO',nom:'Túnel de lavado',    linea:'L1', crit:2, ciclo:12.5, base:0.93 },
  { cod:'L1.CTRL',  nom:'Control dimensional',linea:'L1', crit:3, ciclo:12.5, base:0.91 },
  { cod:'L2.P1',    nom:'Puesto montaje 1',   linea:'L2', crit:3, ciclo:26.0, base:0.87 },
  { cod:'L2.P2',    nom:'Puesto montaje 2',   linea:'L2', crit:3, ciclo:26.0, base:0.86 },
  { cod:'L2.P3',    nom:'Puesto montaje 3',   linea:'L2', crit:3, ciclo:26.0, base:0.89 },
  { cod:'L2.PRENSA',nom:'Prensa de inserción',linea:'L2', crit:4, ciclo:26.0, base:0.88 },
  { cod:'L3.LLEN',  nom:'Llenadora',          linea:'L3', crit:5, ciclo:12.5, base:0.90 },
  { cod:'L3.P4',    nom:'Estación P4 · Alimentador', linea:'L3', crit:5, ciclo:12.5, base:0.88 },
  { cod:'L3.ETIQ',  nom:'Etiquetadora',       linea:'L3', crit:4, ciclo:12.5, base:0.91 },
  { cod:'L3.PALET', nom:'Paletizador',        linea:'L3', crit:3, ciclo:12.5, base:0.92 },
];

const AUXILIARES = [
  { cod:'COMP-01', nom:'Compresor 01', crit:4, kw:34 },
  { cod:'COMP-02', nom:'Compresor 02', crit:4, kw:36 },
  { cod:'CHILLER', nom:'Enfriadora',   crit:3, kw:22 },
];

// La economia tiene que ser PLAUSIBLE, no solo coherente.
//
// La primera version daba a un envase de 4,2 s de ciclo un margen de 7,18 €:
// 38 M€ de facturacion en una sola linea, para una planta que segun el perfil
// objetivo factura entre 10 y 80. La alerta de P4 salia a 2.095.337 €/año y un
// director de planta lo descarta de un vistazo — y con ella, la herramienta.
//
// Con estos numeros la planta suma unos 5 M€ de margen al año sobre tres
// lineas, que es lo que corresponde a una planta de 25-35 M€ de facturacion.
const PRODUCTOS = [
  { cod:'REF-1140', nom:'Brida DN50',            ciclo:12.5, margen:2.40, linea:'L1' },
  { cod:'REF-1180', nom:'Brida DN80',            ciclo:18.0, margen:3.60, linea:'L1' },
  { cod:'REF-3050', nom:'Conjunto montado A',    ciclo:26.0, margen:6.20, linea:'L2' },
  { cod:'REF-2200', nom:'Envase 1 L',            ciclo:12.5, margen:1.10, linea:'L3' },
  { cod:'REF-2210', nom:'Envase 1 L reforzado',  ciclo:13.0, margen:1.25, linea:'L3' },
];

const PROVEEDORES = [
  { cod:'ZETA',    nom:'Suministros ZETA' },
  { cod:'ALFAMET', nom:'Alfa Metal' },
  { cod:'NORTE',   nom:'Norte Componentes' },
  { cod:'IBERPACK',nom:'Iberpack' },
];

const MATERIALES = [
  { cod:'MP-ACERO', nom:'Chapa de acero S275', unidad:'kg', prov:'ALFAMET' },
  { cod:'MP-FUND',  nom:'Fundición bruta DN50', unidad:'ud', prov:'ZETA' },
  { cod:'MP-RESINA',nom:'Resina PET',           unidad:'kg', prov:'IBERPACK' },
  { cod:'MP-TAPON', nom:'Tapón rosca 28 mm',    unidad:'ud', prov:'NORTE' },
];

const CAUSAS = [
  { cod:'AV-MEC',  nom:'Avería mecánica',            cat:'averia' },
  { cod:'AV-ELE',  nom:'Avería eléctrica',           cat:'averia' },
  { cod:'AJ-FORM', nom:'Ajuste de formato',          cat:'ajuste' },
  { cod:'FALTA-MP',nom:'Falta de material',          cat:'falta_material' },
  { cod:'CAL-BLOQ',nom:'Bloqueo por calidad',        cat:'calidad' },
  { cod:'CAMBIO',  nom:'Cambio de referencia',       cat:'cambio', planif:true },
  { cod:'MANT-PRE',nom:'Mantenimiento preventivo',   cat:'organizativa', planif:true },
  { cod:'DESCANSO',nom:'Descanso de turno',          cat:'organizativa', planif:true },
];

const TURNOS = [
  { cod:'manana', nom:'mañana', ini:'06:00', fin:'14:00' },
  { cod:'tarde',  nom:'tarde',  ini:'14:00', fin:'22:00' },
  { cod:'noche',  nom:'noche',  ini:'22:00', fin:'06:00' },
];

// --- los cuatro problemas plantados ----------------------------------------
//
// 1 · COMP-02: consumo especifico creciente durante 6 semanas + alarmas.
// 2 · L3.P4:   microparadas desde el cambio a REF-2210, hace 7 dias.
// 3 · ZETA:    el lote L-4471 concentra los rechazos de REF-1140, 21 dias.
// 4 · Nocturno: COMP-02 y CHILLER no paran al acabar el ultimo turno.
const DIA_CAMBIO_REF2210 = 7;      // dias antes de HASTA
const DIAS_DERIVA_COMP02 = 42;
const DIAS_LOTE_ZETA     = 21;

const iso = (d) => d.toISOString();
const diaDe = (i) => new Date(DESDE.getTime() + i * 86400_000);
/** Dias que faltan desde el dia i hasta el final de la ventana. */
const atras = (i) => DIAS - i;

// ---------------------------------------------------------------------------

const url = process.env.DATABASE_URL_JOBS;
if (!url) { console.error('Falta DATABASE_URL_JOBS.'); process.exit(1); }
const db = new pg.Client({ connectionString: url });
await db.connect();

async function q(t, v) { return db.query(t, v); }

console.log('DEMO FACTORY · generando 90 días de planta\n');

// 1 · limpiar y crear el inquilino ------------------------------------------
await q(`delete from company where id = $1`, [TENANT]);
await q(`insert into company (id, nombre, plan, presupuesto_ia_eur)
         values ($1, 'DEMO FACTORY, S.L.', 'pro', 60)`, [TENANT]);
await q(`select fr_set_tenant($1)`, [TENANT]);
await q(`insert into site (id, tenant_id, nombre, direccion, huso, precio_kwh)
         values ($1, $2, 'Planta de Torrelavega',
                 'Pol. Ind. de Barros, Torrelavega (Cantabria)', 'Europe/Madrid', 0.14200)`,
        [SITE, TENANT]);

// 2 · arbol de activos -------------------------------------------------------
const id = {};
for (const a of AREAS) {
  const { rows:[r] } = await q(
    `insert into asset_node (tenant_id, site_id, tipo, codigo, nombre, criticidad)
     values ($1,$2,'area',$3,$4,3) returning id`, [TENANT, SITE, a.cod, a.nom]);
  id[a.cod] = r.id;
}
for (const l of LINEAS) {
  const { rows:[r] } = await q(
    `insert into asset_node (tenant_id, site_id, parent_id, tipo, codigo, nombre,
                             criticidad, coste_parada_hora)
     values ($1,$2,$3,'linea',$4,$5,5,$6) returning id`,
    [TENANT, SITE, id[l.area], l.cod, l.nom, l.coste]);
  id[l.cod] = r.id;
}
for (const m of MAQUINAS) {
  const linea = LINEAS.find((l) => l.cod === m.linea);
  const { rows:[r] } = await q(
    `insert into asset_node (tenant_id, site_id, parent_id, tipo, codigo, nombre,
                             fabricante, modelo, criticidad, coste_parada_hora, ciclo_nominal_s)
     values ($1,$2,$3,'maquina',$4,$5,$6,$7,$8,$9,$10) returning id`,
    [TENANT, SITE, id[m.linea], m.cod, m.nom,
     m.cod.startsWith('L3') ? 'KRONES' : 'DMG MORI',
     m.cod.startsWith('L3') ? 'Contiform 3' : 'NLX 2500',
     m.crit, linea.coste, m.ciclo]);
  id[m.cod] = r.id;
}
for (const a of AUXILIARES) {
  const { rows:[r] } = await q(
    `insert into asset_node (tenant_id, site_id, parent_id, tipo, codigo, nombre,
                             fabricante, criticidad, coste_parada_hora)
     values ($1,$2,$3,'auxiliar',$4,$5,'Atlas Copco',$6,900) returning id`,
    [TENANT, SITE, id['SERV'], a.cod, a.nom, a.crit]);
  id[a.cod] = r.id;
}
console.log(`  activos ............ ${AREAS.length + LINEAS.length + MAQUINAS.length + AUXILIARES.length}`);

// 3 · señales ----------------------------------------------------------------
const sig = {};
for (const m of MAQUINAS) {
  const { rows:[r] } = await q(
    `insert into signal (tenant_id, asset_node_id, codigo, nombre, clase, unidad,
                         agregacion, cadencia_s, min_valido)
     values ($1,$2,$3,$4,'contador_acumulado','uds','delta',$5,0) returning id`,
    [TENANT, id[m.cod], `${m.cod}.contador`, `Contador ${m.nom}`, PASO_S]);
  sig[`${m.cod}.contador`] = r.id;
}
for (const cod of ['L1','L2','L3','COMP-01','COMP-02','CHILLER']) {
  const { rows:[r] } = await q(
    `insert into signal (tenant_id, asset_node_id, codigo, nombre, clase, unidad,
                         agregacion, cadencia_s, min_valido, max_valido)
     values ($1,$2,$3,$4,'energia','kW','avg',$5,0,400) returning id`,
    [TENANT, id[cod], `${cod}.kw`, `Potencia ${cod}`, PASO_S]);
  sig[`${cod}.kw`] = r.id;
}
console.log(`  señales ............ ${Object.keys(sig).length}`);

// 4 · catalogos --------------------------------------------------------------
const pid = {}, provid = {}, matid = {}, causaid = {};
for (const p of PRODUCTOS) {
  const { rows:[r] } = await q(
    `insert into product (tenant_id, codigo, nombre, ciclo_nominal_s, margen_unitario)
     values ($1,$2,$3,$4,$5) returning id`, [TENANT, p.cod, p.nom, p.ciclo, p.margen]);
  pid[p.cod] = r.id;
}
for (const s of PROVEEDORES) {
  const { rows:[r] } = await q(
    `insert into supplier (tenant_id, codigo, nombre, critico) values ($1,$2,$3,$4) returning id`,
    [TENANT, s.cod, s.nom, s.cod === 'ZETA']);
  provid[s.cod] = r.id;
}
for (const m of MATERIALES) {
  const { rows:[r] } = await q(
    `insert into material (tenant_id, codigo, nombre, unidad) values ($1,$2,$3,$4) returning id`,
    [TENANT, m.cod, m.nom, m.unidad]);
  matid[m.cod] = r.id;
}
for (const c of CAUSAS) {
  const { rows:[r] } = await q(
    `insert into reason_code (tenant_id, codigo, nombre, categoria, planificada)
     values ($1,$2,$3,$4,$5) returning id`, [TENANT, c.cod, c.nom, c.cat, !!c.planif]);
  causaid[c.cod] = r.id;
}

// 5 · turnos y sus instancias ------------------------------------------------
const sid = {};
for (const t of TURNOS) {
  const { rows:[r] } = await q(
    `insert into shift (tenant_id, site_id, nombre, inicio, fin) values ($1,$2,$3,$4,$5) returning id`,
    [TENANT, SITE, t.nom, t.ini, t.fin]);
  sid[t.cod] = r.id;
}

const instancias = [];   // { turno, iniTs, finTs, dia }
for (let i = 0; i < DIAS; i++) {
  const d = diaDe(i);
  const dow = d.getUTCDay();               // 0 dom, 6 sab
  if (dow === 0) continue;                 // domingo, planta parada
  const fecha = d.toISOString().slice(0, 10);

  for (const t of TURNOS) {
    // Sabado solo turno de mañana. El resto del fin de semana la planta esta
    // parada: es lo que hace visible el consumo nocturno del problema 4.
    if (dow === 6 && t.cod !== 'manana') continue;
    const ini = new Date(`${fecha}T${t.ini}:00${TZ}`);
    let fin = new Date(`${fecha}T${t.fin}:00${TZ}`);
    if (fin <= ini) fin = new Date(fin.getTime() + 86400_000);   // turno de noche
    const { rows:[r] } = await q(
      `insert into shift_instance (tenant_id, site_id, shift_id, fecha, inicio_ts, fin_ts)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [TENANT, SITE, sid[t.cod], fecha, iso(ini), iso(fin)]);
    instancias.push({ id: r.id, turno: t.cod, ini, fin, dia: i });
  }
}
console.log(`  turnos ............. ${instancias.length} instancias`);

// 6 · ordenes de produccion --------------------------------------------------
// L3 cambia de REF-2200 a REF-2210 hace siete dias. Ese cambio es el origen del
// problema 2, y tiene que existir como orden para que el diagnostico pueda
// relacionarlo.
const ordenes = [];
let nOrden = 1000;
for (const l of LINEAS) {
  let i = 0;
  while (i < DIAS) {
    const largo = l.cod === 'L3' ? 14 : 10;
    const ini = diaDe(i), fin = diaDe(Math.min(DIAS, i + largo));
    let prod;
    if (l.cod === 'L3') {
      prod = atras(i) <= DIA_CAMBIO_REF2210 ? 'REF-2210' : 'REF-2200';
    } else if (l.cod === 'L1') {
      prod = (i / largo) % 2 < 1 ? 'REF-1140' : 'REF-1180';
    } else prod = 'REF-3050';

    const { rows:[r] } = await q(
      `insert into production_order (tenant_id, site_id, asset_node_id, product_id, codigo,
                                     inicio_real, fin_real, estado)
       values ($1,$2,$3,$4,$5,$6,$7,'cerrada') returning id`,
      [TENANT, SITE, id[l.cod], pid[prod], `OF-${++nOrden}`, iso(ini), iso(fin)]);
    ordenes.push({ id: r.id, linea: l.cod, prod, desde: i, hasta: i + largo });
    i += largo;
  }
}
// Cada maquina hereda la orden de su linea: el calculo busca por asset_node_id.
for (const m of MAQUINAS) {
  for (const o of ordenes.filter((x) => x.linea === m.linea)) {
    await q(
      `insert into production_order (tenant_id, site_id, asset_node_id, product_id, codigo,
                                     inicio_real, fin_real, estado)
       values ($1,$2,$3,$4,$5,$6,$7,'cerrada')`,
      [TENANT, SITE, id[m.cod], pid[o.prod], `OF-${++nOrden}`,
       iso(diaDe(o.desde)), iso(diaDe(Math.min(DIAS, o.hasta)))]);
  }
}
console.log(`  órdenes ............ ${nOrden - 1000}`);

// 7 · series y eventos -------------------------------------------------------
//
// Se simula turno a turno y se derivan de ahi TODAS las señales, para que los
// modulos cuadren entre si: si un turno pierde rendimiento, su contador sube
// menos y su consumo por unidad sube. Generar cada serie por separado con ruido
// independiente es lo que produce demos que no se sostienen.

const medidas = {};   // signal_id -> { ts: [], v: [], q: [] }
const eventos = [];
const rechazos = [];
for (const k of Object.keys(sig)) medidas[sig[k]] = { ts: [], v: [], q: [] };

/** Instancias en las que trabaja la linea de esta maquina. */
function turnosDe(codLinea) {
  const l = LINEAS.find((x) => x.cod === codLinea);
  return instancias.filter((t) => l.turnos.includes(t.turno));
}

function productoDe(codLinea, dia) {
  const o = ordenes.find((x) => x.linea === codLinea && dia >= x.desde && dia < x.hasta);
  return PRODUCTOS.find((p) => p.cod === (o?.prod ?? 'REF-2200'));
}

// --- produccion por maquina --------------------------------------------------
const contador = {};
for (const m of MAQUINAS) contador[m.cod] = Math.round(entre(10_000, 90_000));

// Se recorre en orden cronologico por maquina para que el contador acumulado
// sea monotono: un contador que baja es un reinicio del PLC, y aqui no lo hay.
for (const m of MAQUINAS) {
  const turnos = turnosDe(m.linea).sort((a, b) => a.ini - b.ini);
  const sId = sig[`${m.cod}.contador`];

  for (const t of turnos) {
    const prod = productoDe(m.linea, t.dia);
    const largoS = (t.fin - t.ini) / 1000;

    // Rendimiento del turno.
    let rend = m.base + ruido(0.025);
    if (t.turno === 'noche') rend -= 0.03;          // arranque mas lento, menos apoyo
    if (t.turno === 'tarde') rend -= 0.01;

    // PROBLEMA 2 · L3.P4: microparadas desde el cambio a REF-2210.
    const enProblemaP4 = m.cod === 'L3.P4' && atras(t.dia) <= DIA_CAMBIO_REF2210;
    let micro = [];
    if (enProblemaP4) {
      const n = Math.round(entre(40, 54));
      for (let k = 0; k < n; k++) {
        const ini = new Date(t.ini.getTime() + R() * (largoS - 120) * 1000);
        const dur = Math.round(entre(40, 90));
        micro.push({ ini, dur });
      }
    } else if (R() < 0.5) {
      const n = Math.round(entre(2, 8));
      for (let k = 0; k < n; k++) {
        const ini = new Date(t.ini.getTime() + R() * (largoS - 120) * 1000);
        micro.push({ ini, dur: Math.round(entre(25, 70)) });
      }
    }

    // Paradas declaradas. El 30% se queda SIN CAUSA a proposito: es la realidad
    // de una planta sin MES, y es la primera metrica que enseña la auditoria.
    const paradas = [];
    const descanso = { ini: new Date(t.ini.getTime() + largoS * 0.45 * 1000),
                       dur: 1200, causa: 'DESCANSO' };
    paradas.push(descanso);
    if (atras(t.dia) === DIA_CAMBIO_REF2210 && m.linea === 'L3') {
      paradas.push({ ini: new Date(t.ini.getTime() + 600_000), dur: 2700, causa: 'CAMBIO' });
    }
    // Una averia no planificada cada dos dias por maquina. La primera version
    // ponia 0,28 por turno: 43 averias al mes y maquina, que no es una planta
    // con un problema, es una planta en crisis. Nadie compra una herramienta
    // que le pinta su planta peor de lo que es.
    if (R() < 0.25) {
      paradas.push({
        ini: new Date(t.ini.getTime() + R() * largoS * 900),
        dur: Math.round(entre(900, 3600)),
        causa: R() < 0.6 ? 'AV-MEC' : (R() < 0.5 ? 'AV-ELE' : 'FALTA-MP'),
      });
    }
    // Dos de cada tres paradas no planificadas se quedan sin causa. Es lo que
    // se ve en una planta con ERP y sin MES, y es la cifra que abre la
    // conversacion comercial de la semana 1 del piloto.
    if (R() < 0.55) {
      // Sin causa registrada. No es un fallo del generador: es el dato que
      // falta en casi todas las plantas y del que vive media conversacion
      // comercial de la semana 1 del piloto.
      paradas.push({
        ini: new Date(t.ini.getTime() + R() * largoS * 900),
        dur: Math.round(entre(600, 2400)), causa: null,
      });
    }

    const sParada = paradas.reduce((a, p) => a + p.dur, 0);
    const sMicro  = micro.reduce((a, x) => a + x.dur, 0);
    const sMarcha = Math.max(0, largoS - sParada - sMicro);
    const uds = Math.max(0, Math.round((sMarcha / prod.ciclo) * rend));

    for (const p of paradas) {
      eventos.push([id[m.cod], p.causa === 'DESCANSO' || p.causa === 'CAMBIO' ? 'stop' : 'stop',
        iso(p.ini), iso(new Date(p.ini.getTime() + p.dur * 1000)),
        p.causa ? causaid[p.causa] : null, 'scada', 100, pid[prod.cod], t.id, null]);
    }
    for (const x of micro) {
      eventos.push([id[m.cod], 'microstop', iso(x.ini),
        iso(new Date(x.ini.getTime() + x.dur * 1000)), null, 'derivado', 75,
        pid[prod.cod], t.id, null]);
    }

    // Rechazos. Base 2-3%; el problema 3 los dispara en REF-1140.
    let tasa = entre(0.018, 0.032);
    const enProblemaZeta = prod.cod === 'REF-1140' && atras(t.dia) <= DIAS_LOTE_ZETA;
    if (enProblemaZeta) tasa += entre(0.055, 0.085);
    if (enProblemaP4) tasa += 0.006;
    const nok = Math.round(uds * tasa);
    if (nok > 0) {
      eventos.push([id[m.cod], 'reject', iso(t.ini), iso(t.fin), null, 'mes', 100,
        pid[prod.cod], t.id, JSON.stringify({ uds: nok })]);
      rechazos.push({ maquina: m.cod, prod: prod.cod, ts: t.fin, uds: nok,
                      turno: t.id, zeta: enProblemaZeta, margen: prod.margen });
    }

    // Reparto del contador entre los intervalos de 5 min del turno.
    //
    // La produccion se reparte SOLO entre los pasos en marcha. La primera
    // version dividia entre todos y luego se saltaba los parados, asi que el
    // contador acababa un 8-12% por debajo de lo simulado y la linea base
    // salia mas baja que el rendimiento real de la maquina.
    const pasos = Math.floor(largoS / PASO_S);
    const estaParado = (ts) => paradas.some((p) =>
      ts >= p.ini && ts < new Date(p.ini.getTime() + p.dur * 1000));
    let activos = 0;
    for (let k = 0; k < pasos; k++) {
      if (!estaParado(new Date(t.ini.getTime() + k * PASO_S * 1000))) activos++;
    }
    const porPaso = uds / Math.max(1, activos);
    for (let k = 0; k < pasos; k++) {
      const ts = new Date(t.ini.getTime() + k * PASO_S * 1000);
      const parado = estaParado(ts);
      if (!parado) contador[m.cod] += porPaso;
      medidas[sId].ts.push(iso(ts));
      medidas[sId].v.push(Math.round(contador[m.cod]));
      medidas[sId].q.push(0);
    }
  }
}

// --- alarmas del COMP-02 (problema 1) ---------------------------------------
for (let i = DIAS - DIAS_DERIVA_COMP02; i < DIAS; i++) {
  // Las alarmas de presion se van haciendo mas frecuentes segun avanza la
  // deriva. Es lo que hace caer el componente "comportamiento" de la salud.
  const avance = (i - (DIAS - DIAS_DERIVA_COMP02)) / DIAS_DERIVA_COMP02;
  if (R() < 0.05 + avance * 0.30) {
    const ts = new Date(diaDe(i).getTime() + entre(6, 22) * 3600_000);
    eventos.push([id['COMP-02'], 'alarm', iso(ts), iso(new Date(ts.getTime() + 180_000)),
      null, 'plc', 100, null, null,
      JSON.stringify({ codigo: 'E42', texto: 'Presión de descarga fuera de rango' })]);
  }
}

// --- energia ----------------------------------------------------------------
//
// El consumo se deriva de la produccion real, no se inventa. Asi, cuando la
// Linea 3 pierde rendimiento, su kWh/ud sube solo: es la coherencia entre
// modulos que un director de planta comprueba de un vistazo.
const pasosTot = Math.floor((HASTA - DESDE) / (PASO_S * 1000));
const enTurno = (ts) => instancias.some((t) => ts >= t.ini && ts < t.fin);

for (let k = 0; k < pasosTot; k++) {
  const ts = new Date(DESDE.getTime() + k * PASO_S * 1000);
  const dia = Math.floor((ts - DESDE) / 86400_000);
  const activo = enTurno(ts);

  for (const l of LINEAS) {
    const enMarcha = instancias.some(
      (t) => LINEAS.find((x) => x.cod === l.cod).turnos.includes(t.turno)
             && ts >= t.ini && ts < t.fin);
    // Con la linea parada queda la carga de espera: cuadros, control, luces.
    const base = { L1: 18, L2: 12, L3: 26 }[l.cod];
    const kw = enMarcha ? base + entre(38, 52) + ruido(4) : base * 0.28 + ruido(1.2);
    medidas[sig[`${l.cod}.kw`]].ts.push(iso(ts));
    medidas[sig[`${l.cod}.kw`]].v.push(Math.round(kw * 10) / 10);
    medidas[sig[`${l.cod}.kw`]].q.push(0);
  }

  // COMP-01 sí se para fuera de horario. Es el contraste que hace evidente que
  // el 02 no lo hace: sin un equipo que se comporte bien, el hallazgo no se ve.
  const kw01 = activo ? 34 + ruido(3) : 1.8 + ruido(0.6);
  medidas[sig['COMP-01.kw']].ts.push(iso(ts));
  medidas[sig['COMP-01.kw']].v.push(Math.round(kw01 * 10) / 10);
  medidas[sig['COMP-01.kw']].q.push(0);

  // PROBLEMA 1 · deriva de 6 semanas. PROBLEMA 4 · no para nunca.
  const deriva = dia > DIAS - DIAS_DERIVA_COMP02
    ? ((dia - (DIAS - DIAS_DERIVA_COMP02)) / DIAS_DERIVA_COMP02) * 0.18 : 0;
  const kw02 = (activo ? 36 : 38) * (1 + deriva) + ruido(2.5);
  medidas[sig['COMP-02.kw']].ts.push(iso(ts));
  medidas[sig['COMP-02.kw']].v.push(Math.round(kw02 * 10) / 10);
  medidas[sig['COMP-02.kw']].q.push(0);

  const kwCh = activo ? 22 + ruido(2) : 8.5 + ruido(1);
  medidas[sig['CHILLER.kw']].ts.push(iso(ts));
  medidas[sig['CHILLER.kw']].v.push(Math.round(kwCh * 10) / 10);
  medidas[sig['CHILLER.kw']].q.push(0);
}

// --- escritura por lotes ----------------------------------------------------
// unnest() en vez de una fila por INSERT: son ~460.000 medidas y de una en una
// tardaria minutos en vez de segundos.
let nMedidas = 0;
for (const [signalId, d] of Object.entries(medidas)) {
  for (let i = 0; i < d.ts.length; i += 5000) {
    const ts = d.ts.slice(i, i + 5000);
    await q(
      `insert into measurement (tenant_id, signal_id, ts, value, quality)
       select $1, $2, unnest($3::timestamptz[]), unnest($4::float8[]), unnest($5::int2[])
       on conflict do nothing`,
      [TENANT, signalId, ts, d.v.slice(i, i + 5000), d.q.slice(i, i + 5000)]);
    nMedidas += ts.length;
  }
}
console.log(`  medidas ............ ${nMedidas.toLocaleString('es-ES')}`);

for (let i = 0; i < eventos.length; i += 1000) {
  const lote = eventos.slice(i, i + 1000);
  await q(
    `insert into event (tenant_id, asset_node_id, tipo, ts_start, ts_end, reason_code_id,
                        source, confianza, product_id, shift_instance_id, payload)
     select $1, u.a::uuid, u.t, u.i::timestamptz, u.f::timestamptz, u.r::uuid,
            u.s, u.c::int2, u.p::uuid, u.si::uuid, coalesce(u.pl::jsonb, '{}'::jsonb)
       from unnest($2::text[],$3::text[],$4::text[],$5::text[],$6::text[],
                   $7::text[],$8::int[],$9::text[],$10::text[],$11::text[])
         as u(a,t,i,f,r,s,c,p,si,pl)`,
    [TENANT, ...[0,1,2,3,4,5,6,7,8,9].map((j) => lote.map((e) => e[j]))]);
}
console.log(`  eventos ............ ${eventos.length.toLocaleString('es-ES')}`);

// --- entregas y calidad (problema 3) ----------------------------------------
const entregas = {};
for (let i = 0; i < DIAS; i += 7) {
  for (const m of MATERIALES) {
    // El lote L-4471 de ZETA es el de las tres ultimas semanas. Todo lo demas
    // de ZETA es normal: si TODO su suministro fuera malo, la correlacion no
    // señalaria un lote, y el hallazgo dejaria de ser accionable.
    const esZeta = m.prov === 'ZETA';
    const lote = esZeta && atras(i) <= DIAS_LOTE_ZETA
      ? 'L-4471' : `L-${4000 + Math.round(entre(1, 900))}`;
    const prevista = diaDe(i);
    const retraso = m.prov === 'ZETA' ? Math.round(entre(0, 3)) : Math.round(entre(0, 1));
    const { rows:[r] } = await q(
      `insert into delivery (tenant_id, supplier_id, material_id, lote, albaran,
                             fecha_prevista, fecha_real, cantidad, precio_unit, incidencia)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [TENANT, provid[m.prov], matid[m.cod], lote,
       `${m.prov}-${26000 + i}`, prevista.toISOString().slice(0,10),
       new Date(prevista.getTime() + retraso * 86400_000).toISOString().slice(0,10),
       Math.round(entre(800, 4000)), Math.round(entre(2, 30) * 100) / 100,
       lote === 'L-4471' && R() < 0.4]);
    entregas[`${m.cod}:${i}`] = { id: r.id, lote };
  }
}

for (const r of rechazos) {
  // El rechazo se ata al lote de fundicion vigente esa semana. Es la cadena
  // defecto -> lote -> proveedor sin la que QUALITY RADAR solo sabe hacer un
  // Pareto, que es lo que el cliente ya tiene en su Excel.
  const semana = Math.floor(((new Date(r.ts) - DESDE) / 86400_000) / 7) * 7;
  // TODOS los rechazos se atan a la entrega del material que consume su
  // producto, no solo los del problema plantado. Si solo se ata el lote malo,
  // la correlacion sale al 100% por construccion y no demuestra nada.
  const mat = { 'REF-1140':'MP-FUND', 'REF-1180':'MP-FUND', 'REF-3050':'MP-ACERO',
                'REF-2200':'MP-RESINA', 'REF-2210':'MP-RESINA' }[r.prod];
  const ent = entregas[`${mat}:${semana}`];
  await q(
    `insert into quality_incident (tenant_id, site_id, asset_node_id, product_id,
                                   delivery_id, shift_instance_id, tipo, defecto,
                                   cantidad, coste_eur, detectado_en)
     values ($1,$2,$3,$4,$5,$6,'rechazo',$7,$8,$9,$10)`,
    [TENANT, SITE, id[r.maquina], pid[r.prod],
     ent?.id ?? null, r.turno,
     r.zeta ? 'Porosidad en la brida' : 'Fuera de tolerancia',
     r.uds, Math.round(r.uds * r.margen * 100) / 100, iso(r.ts)]);
}
console.log(`  entregas ........... ${Object.keys(entregas).length}`);
console.log(`  rechazos ........... ${rechazos.length}`);

// --- rollup de la serie -----------------------------------------------------
await q(`select fr_rollup('1h', $1, $2)`, [iso(DESDE), iso(HASTA)]);

await db.end();
console.log('\nDEMO FACTORY generada. Siguiente: npm run demo-motor');
