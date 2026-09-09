# 03 · Modelo de datos

## 1. Las cuatro decisiones que gobiernan todo el esquema

**1 · `tenant_id` en todas las tablas de negocio, y aislamiento por RLS.**
**El dato de una fábrica no puede tocar el de otra jamás.** En otros productos
tiene sentido un pozo de datos común, para que un cliente nuevo herede el
histórico y sea útil desde el primer día. Aquí no: esto es dato de proceso, de
coste y de personal, y dos clientes pueden ser competidores directos. Es dato de proceso, de coste y de
personal. El aislamiento se hace con Row Level Security de Postgres, no
únicamente con un `WHERE` en el código: un `WHERE` olvidado en una consulta es una
fuga de datos entre competidores del mismo sector. Una base por cliente se
reserva para Enterprise, cuando el contrato lo exija.

**2 · La jerarquía de planta es un árbol, no cinco tablas rígidas.**
Ninguna fábrica encaja en `Planta → Área → Línea → Máquina`. Hay celdas, hay
naves, hay centros de trabajo, hay máquinas que son varias líneas a la vez. Se
modela como un árbol con tipo de nodo (`asset_node`, con `parent_id` y `path`
materializado). Forzar cinco niveles fijos obliga a reformar el esquema en el
tercer cliente — es de los errores más caros y más comunes del sector.

**3 · Las medidas se separan de los eventos, y las dos son inmutables.**
`measurement` es serie temporal densa (contadores, temperatura, kW): hypertable
de Timescale, append-only, comprimida a partir de 7 días. `event` es discreto y
escaso (parada, alarma, cambio de formato, rechazo): tabla normal con índices
distintos. Meter las dos cosas en una misma tabla es el error clásico y arruina
tanto las consultas de serie como las de evento.

**4 · Nada calculado se guarda sin su explicación.**
Toda fila de OEE, de score o de impacto en euros guarda **con qué entradas y con
qué versión de fórmula** se calculó. Cuando el director de planta discuta un
número —y lo hará, en la reunión de la semana 3— hay que poder abrirlo hasta el
dato crudo. Un número que no se puede defender destruye la confianza en toda la
plataforma, no solo en ese número.

---

## 2. Entidades

### Organización y acceso

```
company            el cliente. Raíz del aislamiento
 └─ site           centro / planta física (dirección, huso, calendario, tarifa)
     └─ asset_node árbol: área · línea · celda · máquina · activo auxiliar
         └─ signal  una señal medible de un nodo (contador, kW, temperatura…)

user               persona. Puede pertenecer a varias companies
membership         user × company × rol
role               superadmin · company_admin · plant_manager ·
                   maintenance · production · quality · energy · viewer
audit_log          quién hizo qué, cuándo, desde dónde. Inmutable
```

### Contexto productivo — la capa que da significado al dato

```
product            lo que se fabrica. Ciclo nominal, unidad, margen unitario
production_order   orden: producto × cantidad × fechas × destino
batch              lote fabricado. Enlaza con calidad y con trazabilidad
shift              definición del turno (patrón y calendario)
shift_instance     un turno concreto en una fecha, con su plantilla
operator           persona de planta. Seudonimizable (ver más abajo)
material           materia prima o componente
supplier           proveedor
delivery           entrega: proveedor × material × lote × fecha × cantidad
```

### Dato crudo

```
measurement        HYPERTABLE · (tenant_id, signal_id, ts, value, quality)
                   quality: good · uncertain · bad · substituted
                   Nunca se interpola en silencio: el hueco es un hueco

event              (tenant_id, asset_node_id, ts_start, ts_end, type,
                    reason_code, source, payload)
                   type: stop · microstop · alarm · changeover · reject ·
                         setup · speed_loss · manual_note

reason_code        catálogo de causas POR CLIENTE, jerárquico.
                   Es el activo más valioso que construye el piloto
```

### Cálculo y derivados

```
production_metric  ventana × nodo × producto: piezas ok, nok, tiempo,
                   disponibilidad, rendimiento, calidad, oee, calc_version
energy_reading     consumo por señal y ventana, con kWh/ud y coste
quality_incident   defecto: producto, lote, causa, cantidad, coste
maintenance_order   preventiva · correctiva · predictiva. Estado, coste, horas
asset_score        salud del activo por día, con sus cuatro componentes abiertos
supplier_score     score del proveedor por mes, con sus cinco componentes
```

### Inteligencia

```
baseline           comportamiento normal aprendido: señal × contexto × ventana
                   (media, desviación, p05, p95, muestras, calculado_en)
anomaly            desviación detectada, antes de convertirse en alerta
alert              lo que el usuario ve. Severidad, confianza, impacto,
                   acción recomendada, estado, feedback
recommendation     acción propuesta, con su ahorro estimado y su coste
ai_analysis        registro de cada llamada al LLM: prompt, contexto, fuentes,
                   modelo, tokens, coste, latencia, respuesta
document           PDF, manual, esquema, foto. Con su origen y su versión
doc_chunk          fragmento + embedding (pgvector) + metadatos de filtrado
action             lo ejecutado por Operations Agent: quién, qué, autorizado por
```

---

## 3. Relaciones que conviene ver dibujadas

```
company ──< site ──< asset_node ──< signal ──< measurement
                          │                      
                          ├──< event >── reason_code
                          ├──< production_metric >── product
                          ├──< asset_score
                          ├──< energy_reading
                          └──< maintenance_order

product ──< production_order ──< batch ──< quality_incident
                                    │
supplier ──< delivery ──< material ─┘        (la cadena que permite la
   └──< supplier_score                        correlación defecto ↔ lote
                                              ↔ proveedor de QUALITY RADAR)

baseline ──> anomaly ──> alert ──> recommendation ──> action
                            └──> ai_analysis (el diagnóstico y sus fuentes)

document ──< doc_chunk   filtrable por site, asset_node, fabricante, modelo
```

---

## 4. Las tres tablas que hay que hacer bien a la primera

### `measurement` — la hypertable

```sql
create table measurement (
  tenant_id   uuid        not null,
  signal_id   uuid        not null,
  ts          timestamptz not null,
  value       double precision,
  quality     smallint    not null default 0,  -- 0 good 1 uncertain 2 bad 3 sustituido
  primary key (tenant_id, signal_id, ts)
);
select create_hypertable('measurement', 'ts', chunk_time_interval => interval '1 day');
```

Con agregaciones continuas encadenadas a minuto, hora y turno. **Ninguna consulta
del panel toca la tabla cruda**: siempre lee del agregado del nivel adecuado. Es
la diferencia entre un panel que abre en 200 ms y uno que tarda 9 s, y esa
diferencia decide si el usuario vuelve mañana.

`quality` no es decorativo. Un valor `bad` o sustituido no puede entrar en un
cálculo de OEE como si fuera bueno; se excluye y **el porcentaje de cobertura del
dato se muestra al lado del número**.

### `event` — donde vive la verdad de la parada

```sql
create table event (
  id             bigserial primary key,
  tenant_id      uuid        not null,
  asset_node_id  uuid        not null,
  type           text        not null,
  ts_start       timestamptz not null,
  ts_end         timestamptz,
  duration_s     integer generated always as
                   (extract(epoch from (ts_end - ts_start))::int) stored,
  reason_code_id uuid,                    -- casi siempre NULL al principio
  source         text        not null,    -- plc · scada · mes · manual · derivado
  confidence     smallint    not null default 100,
  payload        jsonb       not null default '{}'
);
```

`reason_code_id` nace nulo en casi todas las plantas y **eso es información, no
un fallo**. El porcentaje de paradas sin causa es la primera métrica que enseña
la auditoría de datos de la semana 1, y suele estar entre el 60% y el 90%.
Bajarlo del 80% al 30% es, en sí mismo, un resultado vendible del piloto: sin
causa no hay diagnóstico posible, ni con IA ni sin ella.

**Las microparadas casi nunca vienen dadas.** Se derivan: si el contador de
piezas no avanza durante más de `N` segundos con la máquina en marcha, es una
microparada. `source = 'derivado'` y `confidence` por debajo de 100. Ese cálculo
derivado es una de las cosas que más sorprende al cliente en la demo, porque es
pérdida que él sabe que existe y nunca ha podido medir.

### `alert` — el producto, en una tabla

```sql
create table alert (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid        not null,
  site_id           uuid        not null,
  asset_node_id     uuid,
  module            text        not null,  -- production · maintenance · energy · …
  severity          text        not null,  -- critica · alta · media · baja
  confidence        smallint    not null,  -- 0-100, y se muestra
  title             text        not null,  -- una línea, sin jerga
  what_changed      text        not null,
  why               text,                  -- causa probable, puede ser NULL
  impact_eur_year   numeric(12,2),
  impact_basis      jsonb       not null,  -- la cuenta, abierta
  recommended_action text,
  evidence          jsonb       not null,  -- señales, ventanas, documentos
  status            text        not null default 'abierta',
  feedback          text,                  -- util · no_era_nada · ya_lo_sabia
  detected_at       timestamptz not null default now(),
  ...
);
```

`impact_basis` y `evidence` son obligatorios y no aceptan `{}`. **Una alerta sin
la cuenta abierta y sin sus fuentes no se inserta.** Es una restricción del
esquema, no una buena intención del equipo de frontend.

`feedback` es lo que cierra el bucle de aprendizaje del punto 14 del flujo de
datos. Sin esa columna no hay forma de reducir los falsos positivos, y los falsos
positivos son la causa número uno de abandono de este tipo de producto.

---

## 5. Dos asuntos legales que son decisiones de esquema

**Operarios y RGPD.** `operator` identifica a una persona trabajadora, y cruzar
productividad con nombre y apellidos es tratamiento de datos personales en
contexto laboral: en España entra en el ámbito del Estatuto de los Trabajadores y
exige informar a la representación legal. **Decisión:** el rendimiento por
operario se guarda seudonimizado por defecto, la reidentificación es un permiso
aparte y queda registrada en auditoría. Se ofrece un modo agregado —solo por
turno o por equipo— que es el que se activa de fábrica. Y el contrato incluye el
anexo de encargado del tratamiento.

**Retención.** El dato crudo de alta frecuencia se comprime a los 7 días y se
reduce a los 90 (se conservan agregados de minuto, no muestras de 5 s). Los
eventos, las alertas y las órdenes se guardan 5 años, porque son la trazabilidad
que el cliente puede necesitar en una auditoría o una reclamación. Guardar
muestras de 5 segundos durante tres años multiplica el coste de almacenamiento
sin que nadie las mire jamás.
