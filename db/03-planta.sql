-- ---------------------------------------------------------------------------
-- FACTORY RADAR :: 03 · jerarquia de planta, señales y conectores
-- ---------------------------------------------------------------------------

-- ARBOL, no cinco niveles fijos (decision 05).
--
-- Ninguna fabrica encaja en Planta > Area > Linea > Maquina. Hay celdas, hay
-- naves, hay centros de trabajo y hay maquinas que sirven a dos lineas a la
-- vez. Forzar niveles obliga a reformar el esquema en el tercer cliente.
--
-- `ruta` es el camino materializado de ancestros (sin incluirse a si mismo).
-- Lo mantiene un trigger: consultar descendientes es `where id_padre = any(ruta)`
-- con indice GIN, en vez de un CTE recursivo en cada pantalla del panel.
create table if not exists asset_node (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        not null references site(id) on delete cascade,
  parent_id     uuid        references asset_node(id) on delete cascade,
  ruta          uuid[]      not null default '{}',

  tipo          text        not null,   -- area | linea | celda | maquina | auxiliar
  codigo        text        not null,   -- 'L3', 'L3.P4', 'COMP-02'
  nombre        text        not null,
  fabricante    text,
  modelo        text,
  numero_serie  text,

  -- Criticidad 1-5. Entra en el ASSET HEALTH SCORE y en el calculo de severidad:
  -- un 40% de desviacion en una maquina auxiliar parada importa menos que un 6%
  -- en la linea principal.
  criticidad    smallint    not null default 3,

  -- Coste de una hora de parada de este nodo, en euros. Es el numero que
  -- convierte una anomalia en un impacto defendible. Se rellena en la semana 3
  -- del piloto, con el cliente delante.
  coste_parada_hora numeric(10,2),

  -- Ciclo nominal por defecto, en segundos. El del producto manda si existe.
  ciclo_nominal_s numeric(10,3),

  activo        boolean     not null default true,
  creado_en     timestamptz not null default now(),

  unique (tenant_id, site_id, codigo),
  constraint asset_node_tipo_valido check (tipo in ('area','linea','celda','maquina','auxiliar')),
  constraint asset_node_criticidad check (criticidad between 1 and 5)
);
create index if not exists asset_node_ruta on asset_node using gin (ruta);
create index if not exists asset_node_site on asset_node (tenant_id, site_id);

-- Mantiene `ruta` al insertar y al mover un nodo de sitio. Se hace en la base y
-- no en la aplicacion porque un nodo movido desde un script suelto tambien
-- tiene que dejar el arbol coherente.
create or replace function fr_asset_node_ruta()
returns trigger
language plpgsql
as $$
declare
  v_ruta uuid[];
begin
  if new.parent_id is null then
    new.ruta := '{}';
  else
    select a.ruta || a.id into v_ruta from asset_node a where a.id = new.parent_id;
    if v_ruta is null then
      raise exception 'El padre % no existe', new.parent_id;
    end if;
    if new.id = any(v_ruta) then
      raise exception 'Ciclo en la jerarquia de activos';
    end if;
    new.ruta := v_ruta;
  end if;
  return new;
end
$$;

drop trigger if exists asset_node_ruta_tg on asset_node;
create trigger asset_node_ruta_tg
  before insert or update of parent_id on asset_node
  for each row execute function fr_asset_node_ruta();

-- ---------------------------------------------------------------------------
-- Una señal medible de un nodo.
--
-- `clase` decide como se agrega y como se lee: un contador acumulativo se lee
-- por diferencia entre el primer y el ultimo valor del intervalo, y una
-- temperatura por media. Confundir los dos es el fallo de mapeo clasico: tres
-- semanas ingiriendo un contador como si fuera incremental, con una produccion
-- absurda que nadie mira hasta que el cliente la discute.
-- ---------------------------------------------------------------------------
create table if not exists signal (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  asset_node_id uuid        not null references asset_node(id) on delete cascade,

  codigo        text        not null,   -- 'L3.P4.contador'
  nombre        text        not null,
  clase         text        not null,   -- contador | contador_acumulado | estado | analogica | energia
  unidad        text,                   -- 'uds' | 'kW' | 'kWh' | 'degC' | 'bar'
  agregacion    text        not null default 'avg',  -- avg | sum | last | delta | max

  -- Cadencia esperada en segundos. Sirve para detectar que una fuente se ha
  -- callado: si no llega nada en 5 veces su cadencia, el conector o la fuente
  -- estan caidos y eso se avisa en la cabecera, no enterrado en ajustes.
  cadencia_s    integer,

  -- Rango plausible. Un valor fuera se marca como `bad` y NO entra en ningun
  -- calculo. Nunca se corrige en silencio.
  min_valido    double precision,
  max_valido    double precision,

  activo        boolean     not null default true,
  creado_en     timestamptz not null default now(),

  unique (tenant_id, codigo),
  constraint signal_clase_valida check (clase in
    ('contador','contador_acumulado','estado','analogica','energia')),
  constraint signal_agregacion_valida check (agregacion in
    ('avg','sum','last','delta','max'))
);
create index if not exists signal_nodo on signal (tenant_id, asset_node_id);

-- ---------------------------------------------------------------------------
-- Fuentes de dato y su salud.
--
-- El estado de cada conector se ve en el panel del cliente Y en el de
-- superadmin. Un conector caido del que solo se entera el cliente es una
-- llamada de telefono; uno del que nos enteramos nosotros primero es soporte.
-- ---------------------------------------------------------------------------
create table if not exists connector (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid        not null references company(id) on delete cascade,
  site_id       uuid        not null references site(id) on delete cascade,

  nombre        text        not null,
  tipo          text        not null,   -- csv | sql | rest | mqtt | opcua | modbus
  nivel         smallint    not null default 0,   -- peldaño de la escalera de ingesta (0-4)

  -- Credenciales de la fuente del cliente. Cifradas por columna: es lo unico
  -- del esquema que, filtrado, da acceso a la red del cliente.
  config_cifrada bytea,

  -- Token de ingesta, guardado solo como hash. Si hay que reemitirlo, se emite
  -- uno nuevo; no se puede "recuperar" el anterior, y eso es lo correcto.
  token_hash    text,

  estado        text        not null default 'alta',  -- alta | ok | degradado | caido
  ultimo_lote_en timestamptz,
  ultimo_error  text,
  creado_en     timestamptz not null default now(),

  unique (tenant_id, site_id, nombre),
  constraint connector_tipo_valido check (tipo in
    ('csv','sql','rest','mqtt','opcua','modbus'))
);

-- Idempotencia de la ingesta. El conector puede reenviar sin miedo tras un
-- corte de linea: el duplicado se descarta AQUI, en el servidor, no en el
-- conector, porque el conector puede haberse reiniciado y perdido su memoria.
create table if not exists ingest_batch (
  batch_id      uuid primary key,
  tenant_id     uuid        not null references company(id) on delete cascade,
  connector_id  uuid        not null references connector(id) on delete cascade,
  recibido_en   timestamptz not null default now(),
  n_medidas     integer     not null default 0,
  n_eventos     integer     not null default 0
);
create index if not exists ingest_batch_conector on ingest_batch (connector_id, recibido_en desc);
