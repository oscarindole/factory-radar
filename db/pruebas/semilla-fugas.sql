-- Semilla de la bateria de fugas. Se carga como PROPIETARIO (superusuario),
-- que salta RLS a proposito: aqui se trata de plantar dos empresas rivales
-- para despues comprobar, ya como fr_app, que no se ven entre ellas.
begin;

insert into company (id, nombre) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Metalurgica ALFA'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Metalurgica BETA')
on conflict do nothing;

insert into site (id, tenant_id, nombre, precio_kwh) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Torrelavega', 0.14200),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Reinosa',     0.13800)
on conflict do nothing;

-- Usuarios de prueba. Existen porque invitation.invitado_por y
-- alert.feedback_por son claves ajenas contra app_user: sin ellos la API
-- devuelve un 500 que parece un fallo del codigo y es un fallo de la semilla.
insert into app_user (id, email, nombre) values
  ('00000000-0000-0000-0000-0000000000aa', 'jefe@alfa.test',   'Jefe de planta ALFA'),
  ('00000000-0000-0000-0000-0000000000bb', 'viewer@alfa.test', 'Observador ALFA')
on conflict (id) do nothing;

insert into membership (tenant_id, user_id, rol) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000aa', 'plant_manager'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000bb', 'viewer')
on conflict (tenant_id, user_id) do nothing;

-- Arbol: linea 3 con la estacion P4 colgando. Sirve tambien para comprobar que
-- el trigger de `ruta` deja el camino de ancestros bien montado.
insert into asset_node (id, tenant_id, site_id, parent_id, tipo, codigo, nombre, coste_parada_hora) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000001', null, 'linea', 'L3', 'Linea 3', 3200),
  ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000001',
   'maquina', 'L3.P4', 'Estacion P4', 3200),
  ('bbbbbbbb-2222-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'bbbbbbbb-1111-0000-0000-000000000002', null, 'linea', 'L1', 'Linea 1', 1900)
on conflict do nothing;

insert into signal (id, tenant_id, asset_node_id, codigo, nombre, clase, unidad, agregacion) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000002', 'L3.P4.contador', 'Contador P4',
   'contador_acumulado', 'uds', 'delta'),
  ('bbbbbbbb-3333-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'bbbbbbbb-2222-0000-0000-000000000002', 'L1.contador', 'Contador L1',
   'contador_acumulado', 'uds', 'delta')
on conflict do nothing;

-- Contador acumulado de ALFA: 0 -> 120 en diez minutos.
insert into measurement (tenant_id, signal_id, ts, value, quality)
select 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001',
       timestamptz '2026-09-09 06:00:00+02' + (i * interval '30 seconds'),
       i * 6, 0
from generate_series(0, 20) i
on conflict do nothing;

insert into measurement (tenant_id, signal_id, ts, value, quality)
select 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-3333-0000-0000-000000000002',
       timestamptz '2026-09-09 06:00:00+02' + (i * interval '30 seconds'),
       i * 2, 0
from generate_series(0, 20) i
on conflict do nothing;

insert into alert (id, tenant_id, site_id, asset_node_id, modulo, severidad, confianza,
                   titulo, que_cambio, impacto_eur_anual, impacto_base, evidencia)
values
  ('aaaaaaaa-4444-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000002',
   'production', 'critica', 87,
   'Linea 3 - rendimiento -14%', 'El rendimiento cayo del 88% al 74%', 462956,
   '{"uds_semana": 1240, "margen_unitario": 7.18, "formula": "uds * margen * 52"}',
   '["signal:L3.P4.contador", "event:2026-09-02..2026-09-09"]'),
  ('bbbbbbbb-4444-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002',
   'bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-2222-0000-0000-000000000002',
   'energy', 'alta', 71,
   'SECRETO INDUSTRIAL DE BETA', 'Esto no lo puede ver ALFA jamas', 16055,
   '{"kw": 38, "horas": 62}', '["signal:L1.kw"]')
on conflict do nothing;

commit;
