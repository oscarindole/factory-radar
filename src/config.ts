// Configuracion. Se lee una vez y se congela: un valor de entorno que cambia a
// mitad de ejecucion es un fallo imposible de reproducir.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Carga .env sin dependencia externa. Solo pares CLAVE=valor y comentarios;
// si algun dia hace falta mas, es que el .env esta haciendo de mas.
function cargarEnv(): void {
  try {
    for (const linea of readFileSync(join(raiz, '.env'), 'utf8').split('\n')) {
      const t = linea.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const clave = t.slice(0, i).trim();
      if (process.env[clave] !== undefined) continue;   // el entorno real manda
      process.env[clave] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Sin .env se sigue: en produccion las variables vienen del entorno.
  }
}
cargarEnv();

export const env = Object.freeze({
  raiz,
  databaseUrl:     process.env.DATABASE_URL ?? '',
  databaseUrlJobs: process.env.DATABASE_URL_JOBS ?? '',
  puerto:          Number(process.env.PUERTO ?? 3001),
  entorno:         process.env.ENTORNO ?? 'desarrollo',
  jwtSecreto:      process.env.JWT_SECRETO ?? '',
  ia: {
    proveedor:     process.env.IA_PROVEEDOR ?? 'claude',
    modeloRazona:  process.env.IA_MODELO_RAZONA ?? 'claude-opus-5',
    modeloRapido:  process.env.IA_MODELO_RAPIDO ?? 'claude-haiku-4-5-20251001',
    apiKey:        process.env.ANTHROPIC_API_KEY ?? '',
    presupuestoEur: Number(process.env.IA_PRESUPUESTO_EUR ?? 30),
  },
});

export const esProduccion = env.entorno === 'produccion';
