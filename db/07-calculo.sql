-- ---------------------------------------------------------------------------
-- FACTORY RADAR :: 07 · metricas calculadas
--
-- Regla que gobierna todas las tablas de este fichero: nada calculado se
-- guarda sin su explicacion. `calc_version` y `entradas` permiten abrir
-- cualquier numero hasta el dato crudo. El director de planta va a discutir un
-- numero en la semana 3, y un numero indefendible destruye la confianza en
-- toda la plataforma, no solo en ese numero.
-- ---------------------------------------------------------------------------

create table if not exists production_metric (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  asset_node_id uuid        not null references asset_node(id) on delete cascade,
  product_id    uuid        references product(id) on delete set null,
  shift_instance_id uuid    references shift_instance(id) on delete set null,

  span          text        not null,   -- 1h | turno | dia
  bucket        timestamptz not null,
  fin           timestamptz not null,

  -- Tiempos, en segundos.
  t_calendario  integer     not null,
  t_planificado integer     not null,   -- calendario menos paradas planificadas
  t_marcha      integer     not null,
  t_parada      integer     not null,
  t_microparada integer     not null default 0,

  uds_ok        numeric(14,3) not null default 0,
  uds_nok       numeric(14,3) not null default 0,

  -- OEE SIEMPRE desglosado. Un 78% no dice nada; un 78% que es 95 x 86 x 96
  -- dice que el problema es rendimiento y que hay que mirar tiempos de ciclo,
  -- no averias. El numero compuesto solo es el error clasico del sector.
  disponibilidad numeric(6,4),
  rendimiento    numeric(6,4),
  calidad        numeric(6,4),
  oee            numeric(6,4),

  -- Porcentaje del intervalo con dato utilizable. Por debajo de un umbral, el
  -- panel muestra el numero atenuado y dice sobre que parte se ha calculado.
  cobertura     numeric(6,4) not null default 1,

  calc_version  smallint    not null default 1,
  entradas      jsonb       not null default '{}',
  calculado_en  timestamptz not null default now(),

  unique (tenant_id, asset_node_id, span, bucket, product_id)
);
create index if not exists production_metric_ventana
  on production_metric (tenant_id, asset_node_id, span, bucket desc);

create table if not exists energy_reading (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  asset_node_id uuid        not null references asset_node(id) on delete cascade,
  span          text        not null,
  bucket        timestamptz not null,

  kwh           numeric(14,4) not null,
  kw_pico       numeric(12,3),

  -- La metrica que manda. El consumo absoluto sube y baja con la produccion y
  -- no dice nada; el especifico es comparable entre turnos y contra uno mismo.
  uds_producidas numeric(14,3),
  kwh_por_ud    numeric(14,6),

  -- Consumo con la planta parada: el hallazgo mas rentable y el mas facil.
  fuera_horario boolean     not null default false,

  coste_eur     numeric(12,2),
  cobertura     numeric(6,4) not null default 1,
  unique (tenant_id, asset_node_id, span, bucket)
);
create index if not exists energy_reading_ventana
  on energy_reading (tenant_id, asset_node_id, span, bucket desc);

create table if not exists quality_incident (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        not null references site(id) on delete cascade,
  asset_node_id uuid        references asset_node(id) on delete set null,
  product_id    uuid        references product(id) on delete set null,
  batch_id      uuid        references batch(id) on delete set null,
  delivery_id   uuid        references delivery(id) on delete set null,
  shift_instance_id uuid    references shift_instance(id) on delete set null,
  operator_id   uuid        references operator(id) on delete set null,

  tipo          text        not null default 'rechazo',  -- rechazo | reproceso | reclamacion
  defecto       text,
  cantidad      numeric(14,3) not null default 0,
  coste_eur     numeric(12,2),
  detectado_en  timestamptz not null default now()
);
create index if not exists quality_incident_ventana
  on quality_incident (tenant_id, detectado_en desc);
create index if not exists quality_incident_lote on quality_incident (tenant_id, batch_id);

create table if not exists maintenance_order (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  asset_node_id uuid        not null references asset_node(id) on delete cascade,
  codigo        text,
  clase         text        not null default 'correctiva',  -- preventiva | correctiva | predictiva
  estado        text        not null default 'abierta',
  descripcion   text,

  -- De donde nacio. Si la creo el sistema a partir de una alerta, se guarda:
  -- es la trazabilidad que demuestra el retorno de la plataforma cuando toca
  -- renovar el contrato.
  alert_id      uuid,
  origen        text        not null default 'manual',  -- manual | alerta | plan | gmao

  abierta_en    timestamptz not null default now(),
  cerrada_en    timestamptz,
  horas         numeric(8,2),
  coste_eur     numeric(12,2),
  tecnico       text,
  unique (tenant_id, codigo)
);
create index if not exists maintenance_order_nodo
  on maintenance_order (tenant_id, asset_node_id, abierta_en desc);

-- ---------------------------------------------------------------------------
-- Puntuaciones. Los componentes se guardan ABIERTOS, no solo el total: el
-- panel enseña un enlace "¿como?" al lado de cada puntuacion y tiene que poder
-- rellenarlo sin recalcular nada (decision 11).
-- ---------------------------------------------------------------------------
create table if not exists asset_score (
  tenant_id     uuid        not null references company(id) on delete cascade,
  asset_node_id uuid        not null references asset_node(id) on delete cascade,
  fecha         date        not null,

  score            smallint not null,
  c_fiabilidad     smallint,
  c_comportamiento smallint,
  c_mantenimiento  smallint,
  c_criticidad     smallint,

  mtbf_h        numeric(10,2),
  mttr_h        numeric(10,2),

  -- Los pesos se guardan CON la fila. Son configurables por cliente, y un
  -- score historico calculado con otros pesos tiene que seguir siendo legible.
  pesos         jsonb       not null default '{}',
  entradas      jsonb       not null default '{}',
  calc_version  smallint    not null default 1,

  primary key (tenant_id, asset_node_id, fecha),
  constraint asset_score_rango check (score between 0 and 100)
);

create table if not exists supplier_score (
  tenant_id     uuid        not null references company(id) on delete cascade,
  supplier_id   uuid        not null references supplier(id) on delete cascade,
  mes           date        not null,

  score         smallint    not null,
  c_calidad     smallint,
  c_puntualidad smallint,
  c_precio      smallint,
  c_respuesta   smallint,
  c_cumplimiento smallint,

  pesos         jsonb       not null default '{}',
  entradas      jsonb       not null default '{}',
  primary key (tenant_id, supplier_id, mes),
  constraint supplier_score_rango check (score between 0 and 100)
);
