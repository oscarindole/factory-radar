-- ---------------------------------------------------------------------------
-- FACTORY RADAR :: 02 · organizacion, acceso y auditoria
-- ---------------------------------------------------------------------------

-- La empresa cliente. Es la raiz del aislamiento: todo lo demas cuelga de aqui
-- y todas las tablas de negocio llevan su tenant_id, que ES este id.
create table if not exists company (
  id            uuid primary key default gen_random_uuid(),
  nombre        text        not null,
  cif           text,
  plan          text        not null default 'starter',  -- starter | pro | enterprise
  activo        boolean     not null default true,

  -- Presupuesto mensual de IA en euros. Sin esto no hay negocio: un cliente que
  -- usa el Copilot cien veces al dia puede costar mas de lo que paga.
  presupuesto_ia_eur numeric(10,2) not null default 30,

  creado_en     timestamptz not null default now()
);

-- Centro fisico. El huso y el calendario viven aqui porque un turno de noche
-- cruza la medianoche y el cambio de hora de octubre duplica una hora real de
-- produccion: calcular en UTC y presentar en local es la unica forma de que el
-- parte del turno cuadre con lo que vio el jefe de linea.
create table if not exists site (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  nombre        text        not null,
  direccion     text,
  huso          text        not null default 'Europe/Madrid',

  -- Precio real del contrato electrico del cliente, no un precio de mercado.
  -- Todo el ahorro de ENERGY RADAR se calcula con este numero y hay que poder
  -- enseñarlo cuando el cliente discuta la cifra.
  precio_kwh    numeric(8,5),
  moneda        text        not null default 'EUR',

  creado_en     timestamptz not null default now(),
  unique (tenant_id, nombre)
);

-- Persona. Puede pertenecer a varias empresas (un consultor, o nosotros
-- mismos), por eso el usuario no lleva tenant_id: lo lleva su membresia.
create table if not exists app_user (
  id            uuid primary key default gen_random_uuid(),
  email         text        not null unique,
  nombre        text        not null,
  clave_hash    text,
  mfa_secreto   text,
  mfa_activo    boolean     not null default false,
  superadmin    boolean     not null default false,
  ultimo_acceso timestamptz,
  creado_en     timestamptz not null default now()
);

create table if not exists membership (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  user_id       uuid        not null references app_user(id) on delete cascade,
  rol           text        not null,   -- ver CHECK abajo

  -- Permisos por planta. Vacio = todas las plantas de la empresa. Un jefe de
  -- linea de Torrelavega no tiene por que ver Reinosa.
  sites         uuid[]      not null default '{}',

  creado_en     timestamptz not null default now(),
  unique (tenant_id, user_id),
  constraint membership_rol_valido check (rol in (
    'company_admin', 'plant_manager', 'maintenance',
    'production', 'quality', 'energy', 'viewer'
  ))
);

-- Registro de auditoria. Append-only: no hay UPDATE ni DELETE sobre esta tabla
-- y la politica RLS de 09 no los concede. Una IA que actua sin traza es un
-- problema legal antes que tecnico.
create table if not exists audit_log (
  id            bigserial primary key,
  tenant_id     uuid,
  user_id       uuid,
  accion        text        not null,   -- login · alerta.descartada · operario.reidentificado · ...
  objeto        text,
  objeto_id     text,
  detalle       jsonb       not null default '{}',
  ip            inet,
  ts            timestamptz not null default now()
);
create index if not exists audit_log_tenant_ts on audit_log (tenant_id, ts desc);
