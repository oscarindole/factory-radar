-- ---------------------------------------------------------------------------
-- RADACTORY :: 05 · serie temporal
-- ---------------------------------------------------------------------------

-- Serie densa. Append-only: nunca se corrige una lectura, se inserta la
-- sustitucion con quality=3 y se conserva la original.
--
-- `quality` NO es decorativo. Un valor bad o sustituido no puede entrar en un
-- calculo de OEE como si fuera bueno: se excluye, y el porcentaje de cobertura
-- se muestra AL LADO del numero. Un OEE calculado sobre el 62% del turno es un
-- dato distinto de un OEE calculado sobre el turno entero.
--   0 good · 1 uncertain · 2 bad · 3 sustituido
create table if not exists measurement (
  tenant_id   uuid        not null,
  signal_id   uuid        not null,
  ts          timestamptz not null,
  value       double precision,
  quality     smallint    not null default 0,
  primary key (tenant_id, signal_id, ts)
);

select create_hypertable('measurement', 'ts',
  chunk_time_interval => interval '1 day',
  if_not_exists => true);

-- Comprimir por (tenant, señal) mantiene juntas las filas que siempre se leen
-- juntas. A partir de 7 dias nadie consulta la muestra de 5 s: consulta el
-- agregado de minuto.
alter table measurement set (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'tenant_id, signal_id',
  timescaledb.compress_orderby   = 'ts desc'
);

-- ---------------------------------------------------------------------------
-- COMPROBADO CONTRA TIMESCALEDB, NO SUPUESTO:
--
--   alter table measurement enable row level security;
--   -> ERROR: operation not supported on hypertables that have columnstore enabled
--
-- Y al reves tambien:
--   alter table t set (timescaledb.compress ...);   -- con RLS ya activo
--   -> ERROR: columnstore cannot be used on table with row security
--
-- Son mutuamente excluyentes. Hay que elegir, y la eleccion es esta:
--
--   `measurement` (crudo, ~8,6 M filas/dia en una planta de 500 señales)
--        comprimida SIN RLS. Es donde esta el volumen: sin compresion son
--        unos 39 GB por planta y 90 dias, y con ella unos 4.
--
--   `measurement_rollup` (lo que LEE el panel, 12 veces mas pequeño)
--        con RLS y SIN comprimir.
--
-- El aislamiento del dato crudo no se pierde, se mueve: fr_app NO tiene
-- permiso sobre `measurement` (ver 09-rls.sql) y solo llega a el por las dos
-- funciones de abajo, que aplican el filtro de inquilino ellas mismas.
--
-- Esto NO deroga la decision 04: la deja como estaba en todo lo demas y
-- documenta la unica tabla donde el motor no permite cumplirla.
-- ---------------------------------------------------------------------------

select add_compression_policy('measurement', interval '7 days', if_not_exists => true);

-- La muestra de 5 s no la mira nadie a los tres meses; el agregado de minuto,
-- si. Guardarla tres años multiplica el coste de almacenamiento sin que nadie
-- la abra jamas.
select add_retention_policy('measurement', interval '90 days', if_not_exists => true);

-- ---------------------------------------------------------------------------
-- Agregados.
--
-- DECISION: rollup propio en vez de continuous aggregate de Timescale.
--
-- Un continuous aggregate es una vista materializada que Timescale refresca
-- sola, y seria lo natural aqui. No se usa por dos motivos, y el segundo es el
-- que decide:
--
--   1. La agregacion que necesitamos depende de `signal.clase`: un contador
--      acumulado se agrega por diferencia (last - first) y una analogica por
--      media. Un cagg tendria que guardar los cuatro estadisticos igual, asi
--      que no ahorra tanto como parece.
--   2. Los caggs viven fuera del control de RLS y refrescan con permisos del
--      trabajo de fondo. Mantener el aislamiento multiempresa (decision 04)
--      sobre una vista materializada que refresca sola es exactamente el tipo
--      de sitio por donde se escapa una fila de otro cliente.
--
-- El coste es un job de pg-boss cada minuto. Es barato y es auditable.
-- ---------------------------------------------------------------------------
create table if not exists measurement_rollup (
  tenant_id   uuid        not null,
  signal_id   uuid        not null,
  span        text        not null,   -- '1m' | '1h'
  bucket      timestamptz not null,

  n           integer     not null,   -- muestras recibidas
  n_good      integer     not null,   -- muestras utilizables (quality 0 o 3)

  v_avg       double precision,
  v_min       double precision,
  v_max       double precision,
  v_sum       double precision,

  -- first y last existen para los contadores acumulados: la produccion del
  -- intervalo es v_last - v_first. Sin ellos habria que volver a la tabla
  -- cruda, que es justo lo que este rollup evita.
  v_first     double precision,
  v_last      double precision,

  primary key (tenant_id, signal_id, span, bucket)
);

select create_hypertable('measurement_rollup', 'bucket',
  chunk_time_interval => interval '7 days',
  if_not_exists => true);

-- ---------------------------------------------------------------------------
-- Recalcula el rollup de una ventana. Idempotente: se puede volver a lanzar
-- sobre el mismo rango sin duplicar, que es imprescindible porque el conector
-- reenvia datos atrasados despues de un corte de linea y hay que rehacer los
-- intervalos que ya se habian cerrado.
-- ---------------------------------------------------------------------------
create or replace function fr_rollup(
  p_span   text,
  p_desde  timestamptz,
  p_hasta  timestamptz
)
returns integer
language plpgsql
-- SECURITY DEFINER porque `measurement` no es legible por fr_app. La funcion
-- no recibe ningun identificador de inquilino y agrega por tenant_id tal cual
-- viene del dato: es un trabajo de sistema, no una consulta de usuario, y por
-- eso 09-rls.sql NO se la concede a fr_app.
security definer
set search_path = public, pg_temp
as $$
declare
  v_ancho interval;
  v_filas integer;
begin
  v_ancho := case p_span
    when '1m' then interval '1 minute'
    when '1h' then interval '1 hour'
    else null
  end;
  if v_ancho is null then
    raise exception 'span no soportado: %', p_span;
  end if;

  insert into measurement_rollup
    (tenant_id, signal_id, span, bucket, n, n_good,
     v_avg, v_min, v_max, v_sum, v_first, v_last)
  select
    m.tenant_id,
    m.signal_id,
    p_span,
    time_bucket(v_ancho, m.ts)                            as bucket,
    count(*)                                              as n,
    count(*) filter (where m.quality in (0, 3))           as n_good,
    avg(m.value)    filter (where m.quality in (0, 3))    as v_avg,
    min(m.value)    filter (where m.quality in (0, 3))    as v_min,
    max(m.value)    filter (where m.quality in (0, 3))    as v_max,
    sum(m.value)    filter (where m.quality in (0, 3))    as v_sum,
    (array_agg(m.value order by m.ts asc)
       filter (where m.quality in (0, 3)))[1]             as v_first,
    (array_agg(m.value order by m.ts desc)
       filter (where m.quality in (0, 3)))[1]             as v_last
  from measurement m
  where m.ts >= p_desde and m.ts < p_hasta
  group by m.tenant_id, m.signal_id, bucket
  on conflict (tenant_id, signal_id, span, bucket) do update set
    n       = excluded.n,
    n_good  = excluded.n_good,
    v_avg   = excluded.v_avg,
    v_min   = excluded.v_min,
    v_max   = excluded.v_max,
    v_sum   = excluded.v_sum,
    v_first = excluded.v_first,
    v_last  = excluded.v_last;

  get diagnostics v_filas = row_count;
  return v_filas;
end
$$;


-- ---------------------------------------------------------------------------
-- La puerta controlada al dato crudo.
--
-- Existe porque el producto lo exige: toda cifra del panel es pinchable hasta
-- el dato crudo, sin callejones sin salida (la ficha de alerta abre la cuenta
-- entera). Como `measurement` no lleva RLS, el filtro de inquilino lo aplica
-- ESTA funcion, comparando contra la señal, y devuelve cero filas si la señal
-- es de otra empresa. Nunca lanza excepcion: una excepcion distinta de "no hay
-- datos" ya confirmaria que la señal existe.
-- ---------------------------------------------------------------------------
create or replace function fr_measurements(
  p_signal uuid,
  p_desde  timestamptz,
  p_hasta  timestamptz
)
returns table (ts timestamptz, value double precision, quality smallint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.ts, m.value, m.quality
  from measurement m
  where m.signal_id = p_signal
    and m.ts >= p_desde and m.ts < p_hasta
    and m.tenant_id = fr_tenant()
    and exists (
      select 1 from signal s
      where s.id = p_signal and s.tenant_id = fr_tenant()
    )
  order by m.ts;
$$;
