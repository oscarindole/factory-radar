-- ---------------------------------------------------------------------------
-- FACTORY RADAR :: 06 · eventos y causas
-- ---------------------------------------------------------------------------

-- Catalogo de causas POR CLIENTE, jerarquico.
--
-- Es el activo mas valioso que construye el piloto. No se puede traer hecho de
-- otra planta: "atasco en entrada" significa una cosa en una embotelladora y
-- otra en una prensa, y una lista generica no la rellena nadie.
create table if not exists reason_code (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  parent_id     uuid        references reason_code(id) on delete cascade,
  codigo        text        not null,
  nombre        text        not null,
  categoria     text        not null,   -- averia | ajuste | falta_material | calidad | cambio | organizativa | externa
  planificada   boolean     not null default false,
  unique (tenant_id, codigo)
);

-- ---------------------------------------------------------------------------
-- Evento: discreto y escaso. Separado de `measurement` a proposito (decision 3
-- del modelo de datos): meter serie densa y evento discreto en la misma tabla
-- arruina las consultas de las dos.
-- ---------------------------------------------------------------------------
create table if not exists event (
  id             bigserial   primary key,
  tenant_id      uuid        not null references company(id) on delete cascade,
  asset_node_id  uuid        not null references asset_node(id) on delete cascade,

  tipo           text        not null,
  ts_start       timestamptz not null,
  ts_end         timestamptz,
  duracion_s     integer generated always as
                   (extract(epoch from (ts_end - ts_start))::integer) stored,

  -- Casi siempre NULL al principio, y ESO ES INFORMACION, no un fallo. El
  -- porcentaje de paradas sin causa es la primera metrica de la auditoria de
  -- la semana 1 y suele estar entre el 60% y el 90%. Sin causa no hay
  -- diagnostico posible, ni con IA ni sin ella.
  reason_code_id uuid        references reason_code(id) on delete set null,

  -- 'derivado' marca lo que hemos calculado nosotros y no nos han dado. Las
  -- microparadas casi nunca vienen dadas: se deducen de que el contador no
  -- avanza con la maquina en marcha. Mezclarlas con las declaradas por el
  -- SCADA sin distinguirlas hace imposible defender el numero.
  source         text        not null,   -- plc | scada | mes | manual | derivado
  confianza      smallint    not null default 100,

  product_id     uuid        references product(id) on delete set null,
  shift_instance_id uuid     references shift_instance(id) on delete set null,
  operator_id    uuid        references operator(id) on delete set null,

  payload        jsonb       not null default '{}',
  creado_en      timestamptz not null default now(),

  constraint event_tipo_valido check (tipo in (
    'stop','microstop','alarm','changeover','reject',
    'setup','speed_loss','manual_note'
  )),
  constraint event_orden check (ts_end is null or ts_end >= ts_start)
);
create index if not exists event_nodo_ts on event (tenant_id, asset_node_id, ts_start desc);
create index if not exists event_tipo_ts on event (tenant_id, tipo, ts_start desc);
create index if not exists event_sin_causa on event (tenant_id, ts_start desc)
  where reason_code_id is null and tipo in ('stop','microstop');
