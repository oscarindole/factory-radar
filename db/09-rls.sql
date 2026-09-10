-- ---------------------------------------------------------------------------
-- RACTORY :: 09 · aislamiento multiempresa
--
-- Barrera 1 de 3 (las otras dos son el repositorio de la aplicacion y la
-- bateria de fugas en CI). Esta es la que sigue funcionando el dia que alguien
-- escriba una consulta sin el WHERE, que es el dia que de verdad importa.
--
-- Se aplica EN BUCLE sobre todas las tablas que tengan tenant_id, no a mano
-- tabla por tabla. El fallo real de este patron nunca es una politica mal
-- escrita: es una tabla nueva a la que se olvidaron de ponersela. El bucle no
-- se olvida, y ademas se puede volver a lanzar despues de cada migracion.
-- ---------------------------------------------------------------------------

do $$
declare
  t record;
begin
  for t in
    select c.relname as tabla
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id'
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not a.attisdropped
      -- `measurement` queda fuera a proposito: TimescaleDB no admite RLS y
      -- compresion a la vez, y ahi gana la compresion. El motivo completo y la
      -- comprobacion estan en 05-series.sql. Se llega a ella por
      -- fr_measurements(), que aplica el filtro de inquilino por su cuenta.
      and c.relname <> 'measurement'
    order by c.relname
  loop
    execute format('alter table public.%I enable row level security', t.tabla);
    -- FORCE es imprescindible: sin el, el PROPIETARIO de la tabla salta las
    -- politicas. Si algun script de mantenimiento se conecta como propietario
    -- —y alguno acabara haciendolo— el aislamiento desaparece en silencio.
    execute format('alter table public.%I force row level security', t.tabla);
    execute format('drop policy if exists inquilino on public.%I', t.tabla);
    execute format($p$
      create policy inquilino on public.%I
        using (tenant_id = fr_tenant() or fr_es_superadmin())
        with check (tenant_id = fr_tenant() or fr_es_superadmin())
    $p$, t.tabla);
  end loop;
end
$$;

-- `company` no tiene tenant_id porque su id ES el inquilino.
alter table company enable row level security;
alter table company force  row level security;
drop policy if exists inquilino on company;
create policy inquilino on company
  using (id = fr_tenant() or fr_es_superadmin())
  with check (id = fr_tenant() or fr_es_superadmin());

-- Una persona puede pertenecer a varias empresas, asi que `app_user` tampoco
-- lleva tenant_id: se ve a traves de la membresia. Consecuencia buscada: desde
-- la empresa A no se puede enumerar quien mas usa la plataforma.
alter table app_user enable row level security;
alter table app_user force  row level security;
drop policy if exists inquilino on app_user;
create policy inquilino on app_user
  using (
    fr_es_superadmin()
    or exists (
      select 1 from membership m
      where m.user_id = app_user.id and m.tenant_id = fr_tenant()
    )
  );

-- `audit_log` es append-only. La politica concede SELECT e INSERT y nada mas:
-- sin UPDATE ni DELETE no hay forma de borrar el rastro desde la aplicacion,
-- que es justo lo que hace que el rastro valga para algo.
-- Las tres se borran antes de crearse: los ficheros de db/ se relanzan enteros
-- en cada migracion, y un `create policy` a secas rompe la segunda pasada.
-- Costo una migracion a medias: 09 fallaba y las politicas de las tablas
-- posteriores se quedaban sin aplicar, sin que nada lo dijera.
drop policy if exists inquilino      on audit_log;
drop policy if exists audit_lectura  on audit_log;
drop policy if exists audit_escritura on audit_log;
create policy audit_lectura on audit_log for select
  using (tenant_id = fr_tenant() or fr_es_superadmin());
create policy audit_escritura on audit_log for insert
  with check (tenant_id = fr_tenant() or fr_es_superadmin());

-- ---------------------------------------------------------------------------
-- Permisos del rol de aplicacion. No es propietario y no tiene DDL: la API no
-- puede alterar el esquema aunque alguien consiga inyectar SQL.
-- ---------------------------------------------------------------------------
grant usage on schema public to fr_app;
grant select, insert, update, delete on all tables in schema public to fr_app;
grant usage, select on all sequences in schema public to fr_app;
grant execute on all functions in schema public to fr_app;

revoke update, delete on audit_log from fr_app;

-- Dato crudo: ni una sola operacion directa. La unica via es fr_measurements().
revoke all on measurement from fr_app;
-- fr_rollup() es trabajo de sistema y corre con su propia conexion (ver
-- DATABASE_URL_JOBS en .env.example). Si la API pudiera llamarla, tendria un
-- SECURITY DEFINER que lee todos los inquilinos al alcance de la mano.
revoke execute on function fr_rollup(text, timestamptz, timestamptz) from fr_app;
grant  execute on function fr_measurements(uuid, timestamptz, timestamptz) to fr_app;

-- El canje de invitaciones entra por estas dos y por ninguna otra via: la
-- tabla sigue bajo RLS y fr_app no la ve sin inquilino fijado.
grant  execute on function fr_invitacion_por_token(text) to fr_app;
grant  execute on function fr_canjear_invitacion(text, text) to fr_app;

alter default privileges in schema public
  grant select, insert, update, delete on tables to fr_app;
alter default privileges in schema public
  grant usage, select on sequences to fr_app;
