-- ---------------------------------------------------------------------------
-- FACTORY RADAR :: bateria de fugas entre inquilinos
--
-- Se ejecuta COMO fr_app, que es el rol con el que se conecta la API. Ejecutarla
-- como postgres no prueba nada: el superusuario salta RLS.
--
-- Cada prueba es un DO, y un DO es una sola transaccion: asi el
-- `fr_set_tenant()` local vive exactamente lo que dura la prueba, igual que
-- vive lo que dura una peticion HTTP en produccion.
--
-- Regla de la casa para el 404: pedir un recurso de otro inquilino devuelve
-- CERO FILAS, no un error de permisos. Un 403 confirmaria que el recurso
-- existe, y eso ya es informacion que no le corresponde.
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on

-- Nota: psql NO sustituye sus variables (\set) dentro de un bloque $$...$$,
-- asi que los identificadores van literales. Es feo y es lo correcto: la
-- alternativa era montar las pruebas por concatenacion, y una prueba de
-- seguridad tiene que poder leerse tal cual, sin desenrollarla mentalmente.

-- 1 · Con inquilino ALFA solo se ve la alerta de ALFA.
do $$
declare n int; t text;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  select count(*), min(titulo) into n, t from alert;
  if n <> 1 or t not like 'Linea 3%' then
    raise exception 'FUGA 1: ALFA ve % alertas (%), esperaba 1 propia', n, t;
  end if;
  raise notice 'OK 1 · ALFA ve solo lo suyo';
end $$;

-- 2 · Pedir por id una alerta de BETA devuelve cero filas, no un error.
do $$
declare n int;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  select count(*) into n from alert
   where id = 'bbbbbbbb-4444-0000-0000-000000000002';
  if n <> 0 then raise exception 'FUGA 2: ALFA lee la alerta de BETA por id'; end if;
  raise notice 'OK 2 · el id ajeno devuelve 0 filas';
end $$;

-- 3 · Escribir con el tenant_id de otro tiene que rebotar (WITH CHECK).
do $$
declare rebota boolean := false;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    insert into alert (tenant_id, site_id, modulo, severidad, confianza,
                       titulo, que_cambio, impacto_base, evidencia)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-1111-0000-0000-000000000002', 'production', 'baja', 10,
            'inyectada', 'x', '{"a":1}', '["b"]');
  exception when insufficient_privilege or check_violation then
    rebota := true;
  end;
  if not rebota then raise exception 'FUGA 3: ALFA ha escrito una fila en BETA'; end if;
  raise notice 'OK 3 · no se puede escribir en otro inquilino';
end $$;

-- 4 · Sin inquilino fijado no se ve NADA. Es el fallo seguro: una conexion que
--     se olvida de fijar contexto no debe devolver la base entera.
do $$
declare n int;
begin
  perform set_config('fr.tenant_id', '', true);
  select count(*) into n from alert;
  if n <> 0 then raise exception 'FUGA 4: sin contexto se ven % alertas', n; end if;
  raise notice 'OK 4 · sin contexto no se ve nada';
end $$;

-- 5 · El dato crudo no es accesible directamente por la API.
do $$
declare rebota boolean := false; n int;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    select count(*) into n from measurement;
  exception when insufficient_privilege then
    rebota := true;
  end;
  if not rebota then
    raise exception 'FUGA 5: fr_app lee measurement directamente (% filas)', n;
  end if;
  raise notice 'OK 5 · measurement no es legible por fr_app';
end $$;

-- 6 · ...pero la puerta controlada sí devuelve el dato propio.
do $$
declare n int;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  select count(*) into n from fr_measurements(
    'aaaaaaaa-3333-0000-0000-000000000001',
    '2026-09-09 00:00:00+02', '2026-09-10 00:00:00+02');
  if n <> 21 then raise exception 'FUGA 6: fr_measurements devuelve % filas, esperaba 21', n; end if;
  raise notice 'OK 6 · fr_measurements devuelve el dato propio';
end $$;

-- 7 · ...y cero para una señal ajena, sin decir si existe.
do $$
declare n int;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  select count(*) into n from fr_measurements(
    'bbbbbbbb-3333-0000-0000-000000000002',
    '2026-09-09 00:00:00+02', '2026-09-10 00:00:00+02');
  if n <> 0 then raise exception 'FUGA 7: fr_measurements devuelve dato de BETA'; end if;
  raise notice 'OK 7 · señal ajena devuelve 0 filas';
end $$;

-- 8 · Una alerta sin la cuenta abierta no entra. Es restriccion de esquema.
do $$
declare rebota boolean := false;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  begin
    insert into alert (tenant_id, site_id, modulo, severidad, confianza,
                       titulo, que_cambio, impacto_base, evidencia)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'production', 'baja', 10,
            'sin cuenta', 'x', '{}', '[]');
  exception when check_violation then
    rebota := true;
  end;
  if not rebota then raise exception 'FALLO 8: se ha colado una alerta sin impacto_base'; end if;
  raise notice 'OK 8 · sin cuenta abierta no se inserta';
end $$;

-- 9 · El trigger del arbol deja la ruta de ancestros bien montada.
do $$
declare r uuid[];
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  select ruta into r from asset_node where codigo = 'L3.P4';
  if r is null or not ('aaaaaaaa-2222-0000-0000-000000000001' = any(r)) then
    raise exception 'FALLO 9: la ruta de L3.P4 no contiene a L3 (%)', r;
  end if;
  raise notice 'OK 9 · el arbol materializa la ruta de ancestros';
end $$;

-- 10 · El log de auditoria es append-only tambien para la API.
do $$
declare rebota boolean := false;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  insert into audit_log (tenant_id, accion) values ('aaaaaaaa-0000-0000-0000-000000000001', 'prueba.fugas');
  begin
    delete from audit_log where accion = 'prueba.fugas';
  exception when insufficient_privilege then
    rebota := true;
  end;
  if not rebota then raise exception 'FALLO 10: fr_app puede borrar del log de auditoria'; end if;
  raise notice 'OK 10 · el log de auditoria no se puede borrar';
end $$;

-- 11 · El rollup agrega el contador acumulado por diferencia (last - first).
--      120 - 0 = 120 unidades en la ventana. Si esto sale mal, toda la
--      produccion del panel sale mal.
do $$
declare v numeric;
begin
  perform fr_set_tenant('aaaaaaaa-0000-0000-0000-000000000001');
  select v_last - v_first into v
    from measurement_rollup
   where signal_id = 'aaaaaaaa-3333-0000-0000-000000000001' and span = '1h';
  if v is distinct from 120 then
    raise exception 'FALLO 11: el rollup da % unidades, esperaba 120', v;
  end if;
  raise notice 'OK 11 · el contador acumulado se agrega por diferencia';
end $$;

select 'BATERIA DE FUGAS: 11/11 SUPERADAS' as resultado;
