-- ---------------------------------------------------------------------------
-- RADACTORY :: 01 · extensiones y rol de aplicacion
--
-- Una sola base cubre relacional, serie temporal y vectorial (decision 02).
-- Si algun dia hay que separar, el corte esta en las tablas de 05-series.sql.
-- ---------------------------------------------------------------------------

create extension if not exists timescaledb;
create extension if not exists vector;

-- gen_random_uuid() es nativo desde Postgres 13; no hace falta pgcrypto.

-- ---------------------------------------------------------------------------
-- El rol con el que se conecta la API.
--
-- IMPORTANTE: no es el propietario de las tablas, y no es superusuario. El
-- propietario SALTA las politicas RLS salvo que se declare FORCE ROW LEVEL
-- SECURITY, y un superusuario las salta siempre. Conectarse como propietario
-- es la forma mas silenciosa de anular todo el aislamiento multiempresa.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fr_app') then
    create role fr_app login password 'cambiame';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- El inquilino activo viaja en una variable de sesion, no en cada WHERE.
--
-- La API hace `select fr_set_tenant($1)` al principio de cada transaccion. Si
-- no se ha fijado, la funcion de lectura devuelve NULL y las politicas RLS no
-- casan con ninguna fila: sin contexto no se ve NADA, que es el fallo seguro.
-- ---------------------------------------------------------------------------
create or replace function fr_set_tenant(p_tenant uuid)
returns void
language sql
as $$
  select set_config('fr.tenant_id', p_tenant::text, true);
$$;

create or replace function fr_tenant()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('fr.tenant_id', true), '')::uuid;
$$;

-- El superadmin de la plataforma opera fuera del inquilino. Es un interruptor
-- aparte y a proposito: asi "ver todo" nunca es el estado por defecto de una
-- conexion, sino una decision explicita que queda en el log de auditoria.
create or replace function fr_es_superadmin()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('fr.superadmin', true) = 'on', false);
$$;
