// ---------------------------------------------------------------------------
// Capa de abstraccion de IA.
//
// Ningun proveedor aparece en el codigo de negocio. Tres motivos, y el segundo
// es el que decide:
//   1. Precio y modelos se mueven cada trimestre.
//   2. Habra clientes que exijan que el dato NO salga de su infraestructura.
//      La misma interfaz tiene que poder apuntar a un modelo local, aunque
//      rinda peor.
//   3. El coste hay que medirlo por inquilino para poder repercutirlo y
//      limitarlo. Con el proveedor incrustado, eso no se puede hacer.
// ---------------------------------------------------------------------------
import { env } from '../config.ts';

export type Tarea = 'diagnostico' | 'copilot' | 'clasificar' | 'resumir' | 'rag';

export interface Peticion {
  tarea: Tarea;
  sistema: string;
  mensaje: string;
  /** Dato ya recuperado. El modelo NUNCA consulta la base por su cuenta. */
  contexto: unknown;
  maxTokens?: number;
}

export interface Respuesta {
  texto: string;
  modelo: string;
  tokensIn: number;
  tokensOut: number;
  costeEur: number;
  latenciaMs: number;
}

export interface Proveedor {
  nombre: string;
  completar(p: Peticion): Promise<Respuesta>;
  embedding(textos: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Enrutado por tarea, no un modelo para todo. Clasificar y resumir con el
// barato; diagnosticar y conversar con el capaz. Es la diferencia entre que la
// IA cueste 8 € al mes por cliente o 80.
// ---------------------------------------------------------------------------
export function modeloPara(t: Tarea): string {
  return t === 'clasificar' || t === 'resumir'
    ? env.ia.modeloRapido
    : env.ia.modeloRazona;
}

const registro = new Map<string, Proveedor>();
export function registrar(p: Proveedor): void { registro.set(p.nombre, p); }

export function proveedor(): Proveedor {
  const p = registro.get(env.ia.proveedor);
  if (!p) throw new Error(`Proveedor de IA no registrado: ${env.ia.proveedor}`);
  return p;
}

// ---------------------------------------------------------------------------
// Presupuesto por inquilino.
//
// Al 80% se avisa. Al 100% se DEGRADA a modelo barato, nunca corte seco: un
// Copilot que deja de contestar a mitad de mes es una baja, no un ahorro.
// ---------------------------------------------------------------------------
export type EstadoPresupuesto = 'ok' | 'aviso' | 'degradado';

export function estadoPresupuesto(gastadoEur: number, topeEur: number): EstadoPresupuesto {
  if (topeEur <= 0) return 'ok';
  const r = gastadoEur / topeEur;
  return r >= 1 ? 'degradado' : r >= 0.8 ? 'aviso' : 'ok';
}
