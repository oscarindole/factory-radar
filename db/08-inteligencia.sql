-- ---------------------------------------------------------------------------
-- FACTORY RADAR :: 08 · linea base, alertas, IA y documentos
-- ---------------------------------------------------------------------------

-- LA LINEA BASE ES POR CONTEXTO, NO GLOBAL (decision 09).
--
-- El consumo de la Linea 3 fabricando PROD-X en el turno de mañana no es
-- comparable con esa misma linea fabricando PROD-Y de noche. Una linea base
-- global dispara falsos positivos en CADA cambio de formato, y a las dos
-- semanas nadie mira las alertas. Por eso la clave incluye producto y turno.
create table if not exists baseline (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  signal_id     uuid        references signal(id) on delete cascade,
  asset_node_id uuid        references asset_node(id) on delete cascade,
  metrica       text        not null,   -- 'rendimiento' | 'kwh_por_ud' | 'valor' | ...
  product_id    uuid        references product(id) on delete set null,
  shift_id      uuid        references shift(id) on delete set null,
  span          text        not null,

  media         double precision,
  desviacion    double precision,
  p05           double precision,
  p50           double precision,
  p95           double precision,

  -- Por debajo de este minimo NO se detecta nada sobre esta combinacion. Es lo
  -- que evita que una linea base construida con cuatro turnos genere alertas.
  n_muestras    integer     not null default 0,
  suficiente    boolean     not null default false,

  desde         timestamptz not null,
  hasta         timestamptz not null,
  calculado_en  timestamptz not null default now()
);

-- NULLS NOT DISTINCT es imprescindible aqui.
--
-- Existe la linea base generica, con product_id NULL, para el caso en que un
-- producto sea demasiado nuevo para tener la suya (ver mas abajo). Con el
-- comportamiento por defecto de Postgres —NULLS DISTINCT— dos filas con
-- product_id NULL no chocan, el ON CONFLICT no casa nunca y la tabla acumula
-- una linea base nueva en cada pasada del motor, para siempre.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'baseline_clave') then
    alter table baseline add constraint baseline_clave
      unique nulls not distinct
      (tenant_id, metrica, span, signal_id, asset_node_id, product_id, shift_id);
  end if;
end
$$;

-- Desviacion detectada, antes de decidir si merece molestar a nadie. Se separa
-- de `alert` porque la mayoria de anomalias NO deben generar alerta: el tope
-- son cinco criticas por planta y semana (decision 10).
create table if not exists anomaly (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  asset_node_id uuid        references asset_node(id) on delete cascade,
  baseline_id   uuid        references baseline(id) on delete set null,
  detector      text        not null,   -- umbral | desviacion | tendencia | cambio_regimen | correlacion | repeticion
  metrica       text        not null,
  ventana_ini   timestamptz not null,
  ventana_fin   timestamptz not null,
  valor         double precision,
  esperado      double precision,
  z             double precision,
  confianza     smallint    not null default 50,
  promovida     boolean     not null default false,
  detectado_en  timestamptz not null default now()
);
create index if not exists anomaly_pendiente
  on anomaly (tenant_id, detectado_en desc) where not promovida;

-- ---------------------------------------------------------------------------
-- ALERTA: el producto, en una tabla.
-- ---------------------------------------------------------------------------
create table if not exists alert (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid        not null references company(id) on delete cascade,
  site_id            uuid        not null references site(id) on delete cascade,
  asset_node_id      uuid        references asset_node(id) on delete set null,
  anomaly_id         uuid        references anomaly(id) on delete set null,

  modulo             text        not null,   -- production | maintenance | energy | quality | supplier
  severidad          text        not null,   -- critica | alta | media | baja
  confianza          smallint    not null,   -- 0-100, y SE MUESTRA

  titulo             text        not null,   -- una linea, sin jerga
  que_cambio         text        not null,
  por_que            text,                   -- causa probable; puede ser NULL y esta bien

  impacto_eur_anual  numeric(12,2),

  -- impact_basis y evidence son OBLIGATORIOS y no aceptan '{}'. Una alerta sin
  -- la cuenta abierta y sin sus fuentes NO SE INSERTA. Es restriccion de
  -- esquema, no buena intencion del equipo de frontend.
  impacto_base       jsonb       not null,
  evidencia          jsonb       not null,

  accion_recomendada text,

  estado             text        not null default 'abierta',  -- abierta | en_curso | resuelta | descartada
  -- Cierra el bucle de aprendizaje. Sin esta columna no hay forma de reducir
  -- los falsos positivos, y son la causa numero uno de abandono de este tipo
  -- de producto (decision 22).
  feedback           text,                   -- util | no_era_nada | ya_lo_sabia
  feedback_por       uuid        references app_user(id) on delete set null,

  detectado_en       timestamptz not null default now(),
  cerrado_en         timestamptz,

  constraint alert_severidad_valida check (severidad in ('critica','alta','media','baja')),
  constraint alert_confianza check (confianza between 0 and 100),
  constraint alert_feedback_valido check (feedback is null or feedback in
    ('util','no_era_nada','ya_lo_sabia')),
  constraint alert_cuenta_abierta check (impacto_base <> '{}'::jsonb),
  constraint alert_con_fuentes  check (evidencia   <> '{}'::jsonb)
);
create index if not exists alert_bandeja
  on alert (tenant_id, site_id, estado, severidad, detectado_en desc);

create table if not exists recommendation (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  alert_id      uuid        references alert(id) on delete cascade,
  texto         text        not null,
  ahorro_eur    numeric(12,2),
  coste_eur     numeric(12,2),
  esfuerzo      text,       -- bajo | medio | alto
  aceptada      boolean
);

-- Lo ejecutado por OPERATIONS AGENT. `nivel` es el modelo de autorizacion:
--   0 informativo · 1 reversible interno · 2 sale fuera o cuesta dinero
-- El nivel 3 (escribir en OT) NO EXISTE y no debe aparecer nunca aqui.
create table if not exists action (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  alert_id      uuid        references alert(id) on delete set null,
  tipo          text        not null,
  nivel         smallint    not null,
  propuesta_por text        not null,   -- 'ia' | user_id
  autorizada_por uuid       references app_user(id) on delete set null,
  ejecutada_en  timestamptz,
  resultado     text,
  payload       jsonb       not null default '{}',
  creada_en     timestamptz not null default now(),
  constraint action_nivel check (nivel between 0 and 2),
  -- El nivel 2 sale de la empresa o cuesta dinero: exige confirmacion humana
  -- explicita, SIEMPRE. La base lo impone; no se deja al criterio del codigo.
  constraint action_nivel2_autorizada check (
    nivel < 2 or autorizada_por is not null or ejecutada_en is null
  )
);

-- ---------------------------------------------------------------------------
-- Registro de cada llamada al LLM. Sin esto no se puede depurar una respuesta
-- mala, ni facturar el consumo, ni defenderse cuando un cliente pregunte por
-- que la IA dijo lo que dijo.
-- ---------------------------------------------------------------------------
create table if not exists ai_analysis (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  user_id       uuid        references app_user(id) on delete set null,
  tarea         text        not null,   -- diagnostico | copilot | clasificar | resumir | rag
  alert_id      uuid        references alert(id) on delete set null,

  prompt        text,
  contexto      jsonb       not null default '{}',
  respuesta     text,
  fuentes       jsonb       not null default '[]',

  proveedor     text,
  modelo        text,
  tokens_in     integer,
  tokens_out    integer,
  coste_eur     numeric(10,6),
  latencia_ms   integer,
  error         text,
  ts            timestamptz not null default now()
);
create index if not exists ai_analysis_coste on ai_analysis (tenant_id, ts desc);

-- ---------------------------------------------------------------------------
-- FACTORY BRAIN
-- ---------------------------------------------------------------------------
create table if not exists document (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        references site(id) on delete cascade,
  asset_node_id uuid        references asset_node(id) on delete set null,

  titulo        text        not null,
  tipo          text        not null,   -- manual | esquema | procedimiento | parte | ficha | foto | video
  fabricante    text,
  modelo        text,
  version       text,
  idioma        text        not null default 'es',

  -- La revision obsoleta se CONSERVA (hace falta para leer partes antiguos)
  -- pero se marca, y nunca se cita como vigente. Responder con el manual de
  -- 2011 en vez de con el vigente puede ser la diferencia entre una reparacion
  -- y un accidente.
  vigente       boolean     not null default true,
  vigente_desde date,
  vigente_hasta date,

  ruta_almacen  text        not null,
  sha256        text,
  paginas       integer,
  subido_en     timestamptz not null default now()
);
create index if not exists document_filtro
  on document (tenant_id, site_id, asset_node_id) where vigente;

create table if not exists doc_chunk (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  document_id   uuid        not null references document(id) on delete cascade,
  orden         integer     not null,
  pagina        integer,
  texto         text        not null,
  embedding     vector(1536),

  -- Busqueda lexica exacta ademas de la semantica. Hacen falta las dos: un
  -- embedding difumina los codigos ('E42', 'S3', 'REF-2210') que son justo lo
  -- que el tecnico teclea.
  tsv           tsvector generated always as
                  (to_tsvector('spanish', texto)) stored,

  unique (document_id, orden)
);
create index if not exists doc_chunk_tsv on doc_chunk using gin (tsv);
-- El filtro por inquilino va ANTES de la busqueda vectorial, nunca despues:
-- filtrar despues es una fuga esperando su turno.
create index if not exists doc_chunk_tenant on doc_chunk (tenant_id, document_id);
create index if not exists doc_chunk_vec on doc_chunk
  using hnsw (embedding vector_cosine_ops);
