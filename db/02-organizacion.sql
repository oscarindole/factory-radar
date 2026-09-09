-- ---------------------------------------------------------------------------
-- RADACTORY :: 02 · organizacion, acceso y auditoria
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

-- ---------------------------------------------------------------------------
-- INVITACIONES
--
-- El rol se decide AL INVITAR, no al aceptar. Es la diferencia entre «te doy
-- acceso a esto» y «entra y ya veremos»: quien acepta no puede elegir con que
-- permisos entra, ni cambiarlos por el camino.
--
-- Tres dias de vigencia, y la caducidad se comprueba en la BASE, no solo en la
-- aplicacion. Un enlace de invitacion se reenvia por WhatsApp igual que
-- cualquier otro; la vigencia corta es lo que limita el daño de un reenvio.
-- ---------------------------------------------------------------------------
create table if not exists invitation (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,

  -- La invitacion va ATADA a un correo. Sin esto, quien recibiera el enlace
  -- reenviado entraria con el rol que fuera: el enlace deja de ser una
  -- invitacion y pasa a ser una llave suelta.
  email         text        not null,

  -- El rol y el alcance por planta, fijados aqui. No se negocian al aceptar.
  rol           text        not null,
  sites         uuid[]      not null default '{}',

  -- Solo el hash. Si se filtra la base, ninguna invitacion pendiente se puede
  -- canjear con lo que hay dentro. Mismo criterio que el token del conector.
  token_hash    text        not null unique,

  invitado_por  uuid        references app_user(id) on delete set null,
  creada_en     timestamptz not null default now(),
  expira_en     timestamptz not null default now() + interval '3 days',
  aceptada_en   timestamptz,
  aceptada_por  uuid        references app_user(id) on delete set null,
  revocada_en   timestamptz,
  revocada_por  uuid        references app_user(id) on delete set null,

  constraint invitation_rol_valido check (rol in (
    'company_admin', 'plant_manager', 'maintenance',
    'production', 'quality', 'energy', 'viewer'
  )),
  -- Tope duro de vigencia. Aunque alguien pase otra fecha desde el codigo, la
  -- base no admite una invitacion que dure mas de tres dias.
  constraint invitation_vigencia check (
    expira_en > creada_en and expira_en <= creada_en + interval '3 days'
  ),
  constraint invitation_un_final check (
    aceptada_en is null or revocada_en is null
  )
);

-- Una sola invitacion viva por correo y empresa: si se reinvita, primero se
-- revoca la anterior. Evita que circulen dos enlaces con roles distintos.
create unique index if not exists invitation_una_viva
  on invitation (tenant_id, lower(email))
  where aceptada_en is null and revocada_en is null;

create index if not exists invitation_pendientes
  on invitation (tenant_id, expira_en) where aceptada_en is null and revocada_en is null;

-- ---------------------------------------------------------------------------
-- Estado de una invitacion, calculado en un solo sitio.
--
-- Se resuelve en la base para que el panel, la API y cualquier script cuenten
-- lo mismo. Una invitacion caducada NO se borra: el rastro de quien invito a
-- quien, con que rol y cuando, es parte de la auditoria.
-- ---------------------------------------------------------------------------
create or replace function fr_estado_invitacion(inv invitation)
returns text
language sql
immutable
as $$
  select case
    when inv.revocada_en is not null then 'revocada'
    when inv.aceptada_en is not null then 'aceptada'
    when inv.expira_en <= now()      then 'caducada'
    else 'pendiente'
  end;
$$;

create or replace view v_invitaciones
with (security_invoker = true) as
select i.id, i.tenant_id, i.email, i.rol, i.sites,
       fr_estado_invitacion(i)                       as estado,
       i.creada_en, i.expira_en, i.aceptada_en, i.revocada_en,
       greatest(0, extract(epoch from (i.expira_en - now()))/3600)::int as horas_restantes,
       u.nombre                                      as invitado_por
  from invitation i
  left join app_user u on u.id = i.invitado_por;

-- ---------------------------------------------------------------------------
-- CANJE DE UNA INVITACION · la puerta controlada
--
-- El canje tiene un problema de huevo y gallina: la RLS esconde la invitacion
-- hasta que se fija el inquilino, y el inquilino no se sabe hasta leer la
-- invitacion. Quien canjea, ademas, todavia no tiene sesion ni cuenta.
--
-- La salida NO es darle a la API permiso para saltarse la RLS. Es meter la
-- operacion entera en la base, en dos funciones SECURITY DEFINER con la
-- entrada acotada: se entra por el hash de un token de 256 bits y no se puede
-- pedir nada mas. Mismo criterio que fr_measurements() con el dato crudo.
-- ---------------------------------------------------------------------------

-- Consulta previa: lo justo para pintar la pantalla de «te han invitado».
-- No devuelve el inquilino ni los ids: quien tiene el token todavia no es nadie.
create or replace function fr_invitacion_por_token(p_hash text)
returns table (empresa text, email text, rol text, expira_en timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.nombre, i.email, i.rol, i.expira_en
    from invitation i join company c on c.id = i.tenant_id
   where i.token_hash = p_hash
     and i.aceptada_en is null and i.revocada_en is null
     and i.expira_en > now();
$$;

-- El canje. Atomico, y con el rol saliendo SIEMPRE de la fila de invitacion:
-- no hay ningun parametro por el que quien acepta pueda influir en sus
-- permisos. Es la razon de ser de toda la pieza.
-- OJO con los nombres de las columnas de salida: en PL/pgSQL, cada columna de
-- un RETURNS TABLE es tambien una VARIABLE de la funcion. Si una se llama
-- `tenant_id`, el `on conflict (tenant_id, user_id)` de mas abajo deja de saber
-- si te refieres a la columna o a la variable y falla en tiempo de ejecucion:
--   ERROR: column reference "tenant_id" is ambiguous
-- Por eso las salidas llevan nombres que no existen como columna en ninguna de
-- las tablas que toca la funcion.
create or replace function fr_canjear_invitacion(p_hash text, p_nombre text)
returns table (ok boolean, rol_asignado text, empresa_id uuid, motivo text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv invitation;
  v_user uuid;
begin
  -- FOR UPDATE: dos canjes simultaneos del mismo enlace se serializan y el
  -- segundo encuentra la invitacion ya aceptada. Un enlace reenviado y abierto
  -- a la vez por dos personas creaba dos membresias.
  select * into inv from invitation where token_hash = p_hash for update;

  -- Un token inexistente, uno caducado y uno ya usado responden lo mismo: a
  -- quien prueba tokens no se le dice si acerto con uno que existio.
  if inv.id is null or inv.aceptada_en is not null or inv.revocada_en is not null
     or inv.expira_en <= now() then
    return query select false, null::text, null::uuid, 'no_valida'::text;
    return;
  end if;

  insert into app_user (email, nombre) values (inv.email, p_nombre)
  on conflict (email) do update set nombre = coalesce(app_user.nombre, excluded.nombre)
  returning id into v_user;

  insert into membership (tenant_id, user_id, rol, sites)
  values (inv.tenant_id, v_user, inv.rol, inv.sites)
  on conflict (tenant_id, user_id) do nothing;

  update invitation set aceptada_en = now(), aceptada_por = v_user where id = inv.id;

  insert into audit_log (tenant_id, user_id, accion, objeto, objeto_id, detalle)
  values (inv.tenant_id, v_user, 'invitacion.aceptada', 'invitation', inv.id::text,
          jsonb_build_object('email', inv.email, 'rol', inv.rol));

  return query select true, inv.rol, inv.tenant_id, 'ok'::text;
end
$$;
