# 02 · Arquitectura

## 1. Arquitectura funcional: las seis capas

```
┌─────────────────────────────────────────────────────────────────────┐
│  6 · ACCIÓN          Operations Agent · órdenes · avisos · informes  │
├─────────────────────────────────────────────────────────────────────┤
│  5 · PRESENTACIÓN    Panel · Copilot · alertas · API pública         │
├─────────────────────────────────────────────────────────────────────┤
│  4 · INTELIGENCIA    Motor de eventos · scoring · RAG · LLM          │
├─────────────────────────────────────────────────────────────────────┤
│  3 · CONTEXTO        Modelo unificado de planta · jerarquía · cálculo│
├─────────────────────────────────────────────────────────────────────┤
│  2 · NORMALIZACIÓN   Mapeo · unidades · husos · calidad del dato     │
├─────────────────────────────────────────────────────────────────────┤
│  1 · INGESTA         Edge Connector · APIs · SQL · ficheros          │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │  RED OT — el dato solo sube. Nunca baja.
```

**La capa 3 es el producto.** Ingerir sabe hacerlo cualquiera y un LLM lo compra
cualquiera. Lo difícil y lo defendible es el modelo de contexto: saber que este
contador de piezas pertenece a esta máquina, que está en esta línea, que ahora
mismo fabrica este producto en este turno, y que su ciclo nominal es 4,2 s. Sin
ese contexto, un dato de producción es un número sin significado y ninguna
inteligencia posterior puede rescatarlo.

---

## 2. Arquitectura técnica

```
        PLANTA (red OT)                    │            CLOUD
                                           │
  PLC ──┐                                  │      ┌──────────────────────┐
  SCADA ─┤                                 │      │   INGRESS / WAF      │
  MES ───┼──► RADACTORY EDGE ──────┼─────►│   mTLS + token       │
  Sensor ┤    · lee (solo lectura)         │      └──────────┬───────────┘
  SQL ───┘    · normaliza                  │                 │
              · almacena 7 días (buffer)   │      ┌──────────▼───────────┐
              · comprime y firma           │      │   API  (Fastify/TS)  │
              · sale por 443, mTLS         │      │   multitenant, RBAC  │
              · NO abre puertos entrantes  │      └──────────┬───────────┘
                                           │                 │
  ERP ────────── API / SQL de solo lectura ┼────►  ┌──────────▼───────────┐
  Excel ──────── subida manual o SFTP ─────┼────►  │  COLA (pg-boss)      │
                                           │       │  normaliza · calcula │
                                           │       │  detecta · puntúa    │
                                           │       └──────────┬───────────┘
                                           │                  │
                                           │       ┌──────────▼───────────┐
                                           │       │  POSTGRESQL 16       │
                                           │       │  + TimescaleDB       │
                                           │       │  + pgvector          │
                                           │       └──────────┬───────────┘
                                           │                  │
                                           │       ┌──────────▼───────────┐
                                           │       │  CAPA IA (abstracta) │
                                           │       │  Claude · local · …  │
                                           │       └──────────────────────┘
```

---

## 3. El stack, con el porqué de cada elección

| Capa | Elección | Por qué esta y no otra |
|---|---|---|
| **Base de datos** | **PostgreSQL 16 + TimescaleDB + pgvector** | Una sola base cubre relacional, serie temporal y vectorial. La alternativa real era Postgres + InfluxDB + Pinecone: tres sistemas que respaldar, tres que asegurar y tres facturas, para un volumen que Timescale aguanta sobradamente. Se separa el día que un cliente pase de 50.000 señales/s, no antes |
| **Backend** | **Node 22 + TypeScript + Fastify** | Mismo lenguaje que el panel y que el conector: un solo equipo mantiene los tres, y una persona sola puede seguir la traza de una alerta desde la señal hasta la pantalla |
| **Acceso a datos** | **SQL a pelo con `pg`** | Sin ORM. Las consultas de este producto son agregaciones temporales pesadas; un ORM las escribe mal y luego hay que reescribirlas a mano igualmente. Convención ya asentada en la casa |
| **Colas y jobs** | **pg-boss** (sobre la misma Postgres) | Evita meter Redis y su respaldo hasta que haga falta de verdad. Transaccional con los datos, que es justo lo que quieres en un cálculo de OEE |
| **Panel** | **React + TypeScript + Vite** · SPA | El panel es una aplicación de estado, no un sitio de contenido. SSR aquí solo añade complejidad |
| **Gráficas** | **uPlot** para series, **visx/D3** para lo demás | uPlot dibuja 100.000 puntos sin despeinarse. Las librerías cómodas se ahogan justo en el caso industrial |
| **Estilos** | **CSS con variables de tema** | Sin framework de utilidades. El sistema visual es pequeño y propio, y tiene que verse en un panel de taller a 3 metros |
| **Web pública** | **CMS Vertary** | Ya es la herramienta de la casa para sitios. No se inventa nada nuevo |
| **Edge Connector** | **Node 22 empaquetado** · Docker o binario | Mismo lenguaje. Se despliega en un mini PC industrial o en una VM del cliente |
| **IA** | **Capa de abstracción propia** | Ver más abajo. Ningún proveedor entra en el código de negocio |
| **Infraestructura** | **Hetzner** (como radarindole.com) | Dato en la UE, coste predecible, ya hay operativa montada. Se revisará cuando entre el primer cliente que exija certificación |
| **Observabilidad** | **OpenTelemetry → Grafana/Loki** | Estándar abierto, sin quedarse atado a un proveedor de APM |

### Lo que deliberadamente NO se mete todavía

Kubernetes, microservicios, Kafka, data lake, feature store, MLOps. Todo eso
resuelve problemas de escala que aún no tenemos, y cada pieza añade una
superficie que hay que asegurar y explicar en la auditoría del cliente. **Un
monolito modular bien separado por dominios** llega tranquilamente a 50 plantas.
El día que no llegue, los módulos ya están separados por sus fronteras y el corte
es mecánico.

---

## 4. RADACTORY EDGE

El componente que decide si IT aprueba el proyecto. Todo su diseño obedece a una
sola frase: **el dato sube, nunca baja**.

### Principios

1. **Solo lectura.** No tiene código capaz de escribir en un PLC. No es una
   opción desactivada: no está implementado. Se puede enseñar el repositorio.
2. **Solo salida.** Abre él la conexión, TLS mutuo contra `ingest.<dominio>` por
   el 443. **No escucha en ningún puerto.** El cortafuegos del cliente no necesita
   ninguna regla de entrada.
3. **Aguanta sin línea.** Buffer local de 7 días en SQLite. Si cae internet sigue
   recogiendo y al volver reenvía en orden, sin duplicar y sin perder.
4. **No decide nada.** Lee, normaliza, comprime, firma y envía. Toda la lógica
   está en el cloud, así que actualizar el algoritmo no obliga a tocar la planta.
5. **Se ve desde dentro.** Estado, latencia y última lectura por señal, visibles
   tanto en el panel del cliente como en el panel de superadmin.
6. **Se cae solo hacia el lado seguro.** Si no puede leer una fuente, lo marca
   como hueco de dato. Nunca interpola en silencio.

### Protocolos, por orden de implantación

| Prioridad | Protocolo | Cuándo se usa | Fase |
|---|---|---|---|
| 1 | **SQL de solo lectura** | El historiador del SCADA o el ERP tienen base propia. Es el camino más rápido a dato real | MVP |
| 2 | **CSV / Excel** (carpeta, SFTP o subida) | Casi siempre es lo único que hay el primer día. No es un plan B, es el plan A de la semana 1 | MVP |
| 3 | **REST / API** | ERP moderno, GMAO en la nube, básculas y equipos con API | MVP |
| 4 | **MQTT** | Sensórica IoT nueva, la que instalemos nosotros | Fase 2 |
| 5 | **OPC UA** | El estándar del SCADA moderno. Es el destino natural, no el punto de partida | Fase 2 |
| 6 | **Modbus TCP** | Máquina antigua sin nada por encima. Último recurso: hay que declarar registros a mano | Fase 3 |

**Por qué OPC UA no está en el MVP, aunque sea "lo correcto".** Un servidor OPC UA
del cliente exige certificados, permisos, un espacio de nombres que alguien tiene
que mapear y, a menudo, una licencia del fabricante del SCADA. Son entre dos y
seis semanas de coordinación. Empezar por SQL y CSV da dato real en tres días y
permite enseñar valor mientras se tramita el OPC UA. **Ese orden es una decisión
comercial disfrazada de decisión técnica, y es a propósito.**

### La escalera de ingesta

Es la herramienta de venta más eficaz que tiene el producto, porque elimina la
excusa de "es que nosotros no tenemos datos":

```
NIVEL 0   Excel que ya rellenan a mano      →  valor en 3 días
NIVEL 1   Consulta SQL al historiador       →  valor en 1 semana
NIVEL 2   API del ERP / GMAO                →  valor en 2 semanas
NIVEL 3   OPC UA / MQTT en tiempo real      →  valor continuo
NIVEL 4   Sensórica añadida donde falta     →  proyecto aparte, se factura
```

Se empieza siempre por el nivel que la planta ya tiene, aunque sea el 0. Subir de
nivel es una conversación posterior, con el cliente ya convencido.

---

## 5. Capa de abstracción de IA

Ningún proveedor de LLM aparece en el código de negocio. Todo pasa por una
interfaz con cuatro operaciones —completar, completar estructurado, generar
embedding y clasificar— y una implementación por proveedor.

**Por qué es innegociable:**
- **Precio y modelos se mueven cada trimestre.** Quedarse atado sale caro.
- **Habrá clientes que exijan que el dato no salga de su infraestructura.** La
  misma interfaz debe poder apuntar a un modelo local, aunque rinda peor.
- **El coste hay que medirlo por inquilino.** Si el proveedor está incrustado en
  el código, no se puede repercutir ni limitar.

**Enrutado por tarea, no un modelo para todo:** un modelo capaz para el
diagnóstico y el Copilot, uno rápido y barato para clasificar y resumir, y
embeddings del proveedor que mejor funcione en español técnico. El modelo por
defecto para razonamiento es la familia Claude más capaz disponible; la elección
se revisa cada trimestre y vive en configuración, no en el código.

**Cada llamada se registra entera**: prompt, contexto recuperado, respuesta,
fuentes citadas, modelo, tokens, coste y latencia. Sin ese registro no se puede
depurar una respuesta mala, ni facturar el consumo, ni defenderse si un cliente
pregunta por qué la IA dijo lo que dijo.

---

## 6. Flujo del dato, de la señal a la acción

```
 1  El conector lee el contador de la Línea 3        cada 5 s
 2  Lo normaliza y lo firma                          en planta
 3  Lo envía por lotes, comprimido                   cada 30 s
 4  Ingesta valida, deduplica y escribe              hypertable de Timescale
 5  Agregación continua                              minuto → hora → turno → día
 6  Cálculo de OEE con contexto de producto y turno  al cerrar cada ventana
 7  El motor de eventos compara con la línea base    cada 15 min
 8  Encuentra desviación de rendimiento              severidad, confianza
 9  Estima impacto en euros                          con datos del propio cliente
10  Genera diagnóstico con el LLM                    sobre el dato, nunca sin él
11  Crea la alerta con su acción recomendada         y entra en "ATENCIÓN HOY"
12  Notifica según reglas del usuario                panel · email · Teams
13  El responsable acciona                           orden creada, alerta cerrada
14  El resultado realimenta                          si fue falso positivo, ajusta
```

El paso 14 es el que separa un producto vivo de una demo. Cada alerta cerrada
como "no era nada" ajusta el umbral de esa señal en esa planta. Sin él, a los tres
meses el usuario ignora las alertas y ya no vuelve.
