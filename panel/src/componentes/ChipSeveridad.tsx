// El color NUNCA es el unico portador de significado: cada severidad lleva
// color, forma e icono. En una plantilla de planta el 8% de los hombres es
// daltonico, y eso es mucha gente.
type Severidad = 'critica' | 'alta' | 'media' | 'baja';

const FORMA: Record<Severidad, { icono: string; texto: string }> = {
  critica: { icono: '■', texto: 'Crítica' },
  alta:    { icono: '▲', texto: 'Alta' },
  media:   { icono: '●', texto: 'Media' },
  baja:    { icono: '–', texto: 'Baja' },
};

export function ChipSeveridad({ severidad }: { severidad: Severidad }) {
  const f = FORMA[severidad];
  return (
    <span className={`chip chip--${severidad}`} style={{ color: `var(--${severidad})` }}>
      <span aria-hidden="true">{f.icono}</span> {f.texto}
    </span>
  );
}
