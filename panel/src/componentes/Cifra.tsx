// Un numero grande con su tendencia y, si hace falta, su cobertura.
//
// Un nivel sin tendencia no es accionable: el 78% de OEE solo significa algo
// cuando se sabe que la semana pasada era 82%.
interface Props {
  etiqueta: string;
  valor: number | null;
  unidad?: string;
  decimales?: number;
  delta?: number | null;
  /** Fraccion del intervalo con dato utilizable. */
  cobertura?: number;
  /** true si subir es bueno (produccion) y false si es malo (rechazos). */
  subirEsBueno?: boolean;
}

export function Cifra({
  etiqueta, valor, unidad = '', decimales = 0,
  delta = null, cobertura = 1, subirEsBueno = true,
}: Props) {
  // Sin dato no se pinta un cero: un cero es un dato, y "no hay dato" no lo es.
  if (valor === null) {
    return (
      <div className="cifra cifra--vacia">
        <div className="cifra__etiqueta">{etiqueta}</div>
        <div className="cifra__valor cifra__valor--vacio">—</div>
        <div className="cifra__pie">sin dato</div>
      </div>
    );
  }

  const parcial = cobertura < 0.7;
  const color = delta == null ? 'var(--texto-2)'
    : (delta > 0) === subirEsBueno ? 'var(--bien)' : 'var(--critica)';

  return (
    <div className="cifra" data-parcial={parcial || undefined}>
      <div className="cifra__etiqueta">{etiqueta}</div>
      <div className="cifra__valor">
        {valor.toLocaleString('es-ES', {
          minimumFractionDigits: decimales, maximumFractionDigits: decimales,
        })}{unidad}
      </div>
      {delta != null && (
        <div className="cifra__pie" style={{ color }}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('es-ES', {
            maximumFractionDigits: 1 })}
        </div>
      )}
      {/* La cobertura se dice AL LADO del numero, no en un tooltip escondido:
          un OEE calculado sobre el 62% del turno es un dato distinto. */}
      {parcial && (
        <div className="cifra__aviso">
          calculado sobre el {Math.round(cobertura * 100)}% del periodo
        </div>
      )}
    </div>
  );
}
