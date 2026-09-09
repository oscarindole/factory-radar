// Contrato que cumple toda fuente. Añadir OPC UA o Modbus en fase 2 no toca
// nada mas que este directorio: el resto del conector no sabe de protocolos.
export interface Lectura {
  signal: string;          // codigo de la señal, tal como esta dada de alta
  ts: string;              // ISO 8601 con huso. Nunca hora local sin huso
  value: number;
  q?: 0 | 1 | 2 | 3;       // good | uncertain | bad | sustituido
}

export interface EventoFuente {
  asset: string;
  type: string;
  ts_start: string;
  ts_end?: string;
  reason?: string | null;
  source: string;
}

export interface Fuente {
  nombre: string;
  tipo: 'sql' | 'csv' | 'rest' | 'mqtt' | 'opcua' | 'modbus';
  /**
   * Lee lo nuevo desde la ultima marca. Devuelve tambien la marca nueva, que el
   * conector persiste: si se reinicia, no repite ni se salta nada.
   *
   * Si no puede leer, LANZA. No devuelve vacio: un vacio silencioso se
   * confunde con "la planta no produjo", y eso es un diagnostico equivocado.
   */
  leer(desde: string | null): Promise<{
    lecturas: Lectura[];
    eventos: EventoFuente[];
    marca: string | null;
  }>;
}
