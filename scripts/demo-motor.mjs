#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Pasa el motor completo sobre la DEMO FACTORY.
//
// Es tambien la prueba del motor: los cuatro problemas plantados NO estan
// marcados en la base. Si no salen solos por aqui, el motor esta mal.
// ---------------------------------------------------------------------------
import { conInquilinoJobs, cerrar } from '../src/db.ts';
import { calcularProduccion, agregarLineas, agregarDias, calcularEnergia, calcularLineaBase }
  from '../src/motor/calcular.ts';
import { detectar, calcularSalud } from '../src/motor/detectar.ts';

const TENANT = 'dcdcdcdc-0000-0000-0000-00000000dec0';
const SITE   = 'dcdcdcdc-1111-0000-0000-00000000dec0';
const HASTA  = '2026-09-09T00:00:00+02:00';
const DESDE  = new Date(new Date(HASTA).getTime() - 90 * 86400_000).toISOString();

const t0 = Date.now();
await conInquilinoJobs(TENANT, async (db) => {
  // Se recalcula desde cero: el motor tiene que ser idempotente, porque el
  // conector reenvia datos atrasados y hay que rehacer ventanas ya cerradas.
  await db.query(`delete from alert where site_id = $1`, [SITE]);

  const p = await calcularProduccion(db, SITE, DESDE, HASTA);
  console.log(`  production_metric .. ${p.toLocaleString('es-ES')} turnos`);

  const l = await agregarLineas(db, SITE, DESDE, HASTA);
  console.log(`  líneas (cuello) .... ${l.toLocaleString('es-ES')}`);

  const d = await agregarDias(db, SITE, DESDE, HASTA);
  console.log(`  agregado a día ..... ${d.toLocaleString('es-ES')}`);

  const e = await calcularEnergia(db, SITE, DESDE, HASTA);
  console.log(`  energy_reading ..... ${e.toLocaleString('es-ES')}`);

  const b = await calcularLineaBase(db, SITE, HASTA);
  console.log(`  líneas base ........ ${b.toLocaleString('es-ES')}`);

  const s = await calcularSalud(db, SITE, '2026-09-09');
  // La salud tambien de hace 30 dias, para poder mostrar la tendencia: un score
  // sin delta no es accionable.
  await calcularSalud(db, SITE, '2026-08-10');
  console.log(`  asset_score ........ ${s.toLocaleString('es-ES')}`);

  const { creadas, degradadas } = await detectar(db, SITE, HASTA);
  console.log(`  alertas ............ ${creadas}` +
              (degradadas ? ` (${degradadas} críticas degradadas por el tope)` : ''));
});

await cerrar();
console.log(`\nmotor completo en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
