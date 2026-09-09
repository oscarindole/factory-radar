// La cuenta, abierta.
//
// Existe por la decision 11 y por la restriccion alert_cuenta_abierta del
// esquema: si el director de planta no puede reproducir la multiplicacion con
// un boligrafo, el numero no sirve. Este componente se renderiza SIEMPRE que
// se enseña un euro.
interface Props {
  base: Record<string, unknown>;
  /** Que dato falto, si no se pudo calcular. */
  falta?: string[];
}

const ETIQUETAS: Record<string, string> = {
  formula: 'Fórmula',
  uds_perdidas_semana: 'Unidades perdidas por semana',
  margen_unitario: 'Margen unitario (€)',
  capacidad_semanal_uds: 'Capacidad semanal (uds)',
  caida_rendimiento: 'Caída de rendimiento',
  semanas_anio: 'Semanas productivas al año',
  precio_kwh: 'Precio del kWh (contrato de la planta)',
  coste_parada_hora: 'Coste de parada por hora (€)',
};

export function CuentaAbierta({ base, falta = [] }: Props) {
  if (falta.length > 0) {
    return (
      <div className="cuenta cuenta--incompleta">
        <p>No podemos poner cifra a esto todavía. Falta:</p>
        <ul>{falta.map((f) => <li key={f}>{f}</li>)}</ul>
        {/* No se estima. Una cifra inventada que el cliente detecta —y la
            detecta— cuesta mas que no dar cifra. */}
      </div>
    );
  }
  return (
    <dl className="cuenta">
      {Object.entries(base).map(([k, v]) => (
        <div key={k} className="cuenta__fila">
          <dt>{ETIQUETAS[k] ?? k}</dt>
          <dd className="mono">
            {typeof v === 'number' ? v.toLocaleString('es-ES') : String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
