-- ---------------------------------------------------------------------------
-- RADACTORY :: 04 · contexto productivo
--
-- Esta es la capa 3 de la arquitectura y es EL producto. Sin ella, un contador
-- es un numero sin significado y ninguna inteligencia posterior lo rescata.
-- ---------------------------------------------------------------------------

create table if not exists product (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  codigo        text        not null,   -- 'PROD-X', 'REF-2210'
  nombre        text        not null,
  unidad        text        not null default 'uds',

  -- Ciclo nominal en segundos para ESTE producto. Manda sobre el del nodo:
  -- la misma maquina va a distinta velocidad segun el formato, y no tenerlo en
  -- cuenta convierte cada cambio de formato en una falsa caida de rendimiento.
  ciclo_nominal_s numeric(10,3),

  -- Margen unitario. Es el numero que traduce unidades perdidas a euros. Si
  -- falta, la alerta se genera igual pero SIN impacto economico, y el panel
  -- dice que falta el dato en vez de inventarse una cifra.
  margen_unitario numeric(12,4),

  activo        boolean     not null default true,
  unique (tenant_id, codigo)
);

create table if not exists production_order (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        not null references site(id) on delete cascade,
  asset_node_id uuid        references asset_node(id) on delete set null,
  product_id    uuid        not null references product(id),
  codigo        text        not null,
  cantidad_obj  numeric(14,3),
  inicio_prev   timestamptz,
  fin_prev      timestamptz,
  inicio_real   timestamptz,
  fin_real      timestamptz,
  estado        text        not null default 'planificada',
  unique (tenant_id, codigo)
);
create index if not exists production_order_ventana
  on production_order (tenant_id, asset_node_id, inicio_real, fin_real);

create table if not exists batch (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  production_order_id uuid  references production_order(id) on delete set null,
  product_id    uuid        not null references product(id),
  codigo        text        not null,   -- 'L-4471'
  fabricado_en  timestamptz,
  cantidad      numeric(14,3),
  unique (tenant_id, codigo)
);

-- Patron de turno. `inicio` puede ser mayor que `fin` (turno de noche): el
-- calculo lo resuelve sumando un dia, no rechazando la fila.
create table if not exists shift (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        not null references site(id) on delete cascade,
  nombre        text        not null,   -- 'mañana' | 'tarde' | 'noche'
  inicio        time        not null,
  fin           time        not null,
  dias          smallint[]  not null default '{1,2,3,4,5}',  -- ISO: 1=lunes
  unique (tenant_id, site_id, nombre)
);

-- Un turno concreto en una fecha concreta, ya resuelto a timestamptz. Se
-- materializa a proposito: resolver el huso y el cambio de hora en cada
-- consulta del panel es caro y, sobre todo, es donde se cuelan los errores.
create table if not exists shift_instance (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        not null references site(id) on delete cascade,
  shift_id      uuid        not null references shift(id) on delete cascade,
  fecha         date        not null,
  inicio_ts     timestamptz not null,
  fin_ts        timestamptz not null,
  unique (tenant_id, shift_id, fecha)
);
create index if not exists shift_instance_ventana
  on shift_instance (tenant_id, site_id, inicio_ts, fin_ts);

-- ---------------------------------------------------------------------------
-- Operario.
--
-- RGPD: cruzar productividad con nombre y apellidos es tratamiento de datos
-- personales en contexto laboral. El identificador que viaja por el sistema es
-- `seudonimo`; `nombre` esta cifrado por columna y solo se descifra con un
-- permiso aparte, que deja rastro en audit_log.
-- ---------------------------------------------------------------------------
create table if not exists operator (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  seudonimo     text        not null,   -- 'OP-0142'
  nombre_cifrado bytea,
  activo        boolean     not null default true,
  unique (tenant_id, seudonimo)
);

create table if not exists supplier (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  codigo        text        not null,
  nombre        text        not null,
  cif           text,
  critico       boolean     not null default false,
  unique (tenant_id, codigo)
);

create table if not exists material (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  codigo        text        not null,
  nombre        text        not null,
  unidad        text        not null default 'kg',
  unique (tenant_id, codigo)
);

-- Entrega. Es el eslabon que permite la correlacion defecto -> lote ->
-- proveedor de QUALITY RADAR. Sin el, el modulo de calidad solo sabe hacer un
-- Pareto, que es lo que el cliente ya tiene en su Excel.
create table if not exists delivery (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  supplier_id   uuid        not null references supplier(id) on delete cascade,
  material_id   uuid        not null references material(id) on delete cascade,
  lote          text,
  albaran       text,
  fecha_prevista date,
  fecha_real    date,
  cantidad      numeric(14,3),
  precio_unit   numeric(12,4),
  incidencia    boolean     not null default false
);
create index if not exists delivery_proveedor on delivery (tenant_id, supplier_id, fecha_real desc);
create index if not exists delivery_lote on delivery (tenant_id, lote);
