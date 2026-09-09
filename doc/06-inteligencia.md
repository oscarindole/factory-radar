# 06 · Inteligencia

## 1. Tres capas, y solo la tercera es un LLM

La confusión más cara de este mercado es llamar "IA" a todo. Aquí son tres cosas
distintas, con costes y fiabilidades distintas:

```
CAPA 1 · REGLAS Y ESTADÍSTICA     el 70% del valor. Barata, explicable, instantánea
CAPA 2 · MODELOS                  deriva, correlación, previsión. Cara en dato, no en cómputo
CAPA 3 · LENGUAJE (LLM)           explicar, redactar, conversar, leer documentos
```

**La capa 3 nunca detecta.** El LLM no decide que hay una anomalía: la anomalía la
encuentran las capas 1 y 2 sobre el dato, y el LLM la **explica en castellano**.
Al revés —pedirle a un modelo de lenguaje que vigile una serie temporal— es caro,
lento y produce alucinaciones sobre datos numéricos. Esta separación es la
decisión de arquitectura de IA más importante del producto.

---

## 2. Motor de eventos

Corre en ciclos de 15 minutos sobre las agregaciones ya calculadas. Seis
detectores, del más simple al más costoso:

| Detector | Qué busca | Capa |
|---|---|---|
| **Umbral** | Cruce de un límite absoluto configurado | 1 |
| **Desviación** | Alejamiento de la línea base propia, por contexto | 1 |
| **Tendencia** | Deriva sostenida (Mann-Kendall sobre ventana móvil) | 1 |
| **Cambio de régimen** | Un antes y un después (CUSUM / detección de punto de cambio) | 2 |
| **Correlación** | Coincidencia entre dimensiones: lote, turno, proveedor | 2 |
| **Repetición** | El mismo patrón que ya salió N veces | 1 |

**La línea base es por contexto, no global.** El consumo de la Línea 3 fabricando
PROD-X en el turno de mañana no es comparable con esa misma línea fabricando
PROD-Y de noche. Una línea base global genera falsos positivos en cada cambio de
formato, y a las dos semanas nadie mira las alertas. Por eso la clave de
`baseline` es `(señal, producto, turno, ventana)` y hace falta un mínimo de
muestras por combinación antes de detectar nada.

**Cada evento nace con seis campos obligatorios:**

```
source              de qué dato sale
timestamp           cuándo se detecta y qué ventana cubre
asset               qué nodo de la planta
severity            crítica · alta · media · baja
confidence          0-100, y se muestra al usuario
impact              euros, con la cuenta abierta en impact_basis
recommended_action  qué hacer, en imperativo
```

### Cómo se decide la severidad

No por lo grande que sea la desviación estadística, sino por dinero y por
urgencia. Un 40% de desviación en una máquina auxiliar parada es menos grave que
un 6% en la línea principal.

```
severidad = f(impacto en €, criticidad del activo, velocidad de la deriva,
              reversibilidad, confianza)
```

**Y hay tope duro de volumen: como máximo 5 críticas por planta y semana.** Si el
motor genera más, es que el umbral está mal calibrado, y el sistema lo señala
como problema de configuración en vez de inundar al usuario. Una bandeja con 40
alertas críticas es una bandeja cerrada.

---

## 3. Puntuaciones

Cinco puntuaciones, todas de 0 a 100, todas con la misma regla:
**nunca se muestra una sin poder abrir la fórmula con los valores reales.**

```
FACTORY HEALTH SCORE    0,30 producción + 0,25 calidad
                      + 0,20 activos    + 0,15 energía + 0,10 suministro
MACHINE HEALTH SCORE    0,35 fiabilidad + 0,25 comportamiento
                      + 0,20 mantenimiento + 0,20 criticidad
ENERGY EFFICIENCY       kWh/ud contra la mejor marca propia, no contra el sector
QUALITY SCORE           0,40 primera pasada + 0,30 scrap
                      + 0,20 reclamaciones + 0,10 tendencia
SUPPLIER SCORE          0,30 calidad + 0,25 puntualidad + 0,20 precio
                      + 0,15 respuesta + 0,10 cumplimiento
```

**Contra sí mismo, no contra el sector.** No tenemos una referencia sectorial
honesta y fabricar una sería mentir. El mejor comparador de una planta es su
propio mejor mes, y además es el que no admite discusión en la reunión.

**Los pesos son configurables por cliente** —una planta con un cuello de botella
energético querrá más peso en energía— pero se muestran siempre y el cambio queda
en auditoría. Un score que se puede ajustar en secreto no vale nada.

---

## 4. AI Copilot

Un patrón de recuperación sobre el dato estructurado, no un modelo suelto:

```
1  Se interpreta la pregunta            intención + entidades + ventana temporal
2  Se traduce a consultas               plantillas parametrizadas, NUNCA SQL libre
3  Se ejecutan sobre el inquilino       con el rol del usuario que pregunta
4  Se compone la respuesta              con los resultados reales en el contexto
5  Se citan las fuentes                 obligatorio, pinchable
6  Se registra todo                     en ai_analysis
```

**El paso 2 es de seguridad, no de comodidad.** Dejar que un LLM escriba SQL libre
contra la base de un cliente industrial es inaceptable: por inyección, por fugas
entre inquilinos y por consultas que tumban la base. Se usa un catálogo de
consultas parametrizadas —al arrancar, unas 40 plantillas cubren la práctica
totalidad de lo que se pregunta— y lo que no encaja en ninguna se responde con
*"no sé contestar a eso todavía"*, quedando registrado como hueco. Ese registro es
el backlog del Copilot, escrito por los propios usuarios.

**Y el rol del usuario se aplica en la consulta.** Un operario no puede
preguntarle al Copilot algo que no vería en pantalla. La IA no es una puerta
trasera a los permisos.

---

## 5. Factory Brain (RAG)

**Ingesta.** Documento → extracción (texto, tablas, OCR si es escaneo) →
troceado por secciones con solapamiento → embedding → `doc_chunk`. Los esquemas y
las fotos se describen con un modelo de visión y se indexa esa descripción junto
al original.

**Metadatos de filtrado**, que en industria importan más que la propia búsqueda
semántica:

```
site · asset_node · fabricante · modelo · tipo_documento · versión ·
idioma · vigente_desde · vigente_hasta
```

**Por qué la versión es crítica.** Si el manual tiene tres revisiones, responder
con la vigente y no con la de 2011 puede ser la diferencia entre una reparación y
un accidente. La revisión obsoleta se conserva —hace falta para leer partes
antiguos— pero se marca y **nunca se cita como vigente**.

**Recuperación híbrida**, y las dos mitades hacen falta: semántica con pgvector
para el lenguaje del técnico, y léxica exacta para los códigos —`E42`, `S3`,
`REF-2210`— que un embedding tiende a difuminar. Después se reordena y se filtra
por planta y activo.

**Prioridad de fuentes**, en este orden:

```
1  Partes históricos de ESTA máquina en ESTA planta      lo que ya funcionó aquí
2  Procedimientos propios de la planta                   cómo se hace aquí
3  Manual del fabricante de ESTE modelo                  la referencia
4  Partes de máquinas equivalentes en otras plantas del mismo cliente
5  Conocimiento general del modelo                       siempre marcado como tal
```

**Los tres guardarraíles.** Sin fuente no hay respuesta. Si no hay contexto
suficiente, se dice explícitamente y se ofrece lo más parecido. Y cualquier
instrucción que implique intervenir sobre un equipo remite al procedimiento de
consignación de la planta, sin excepción.

---

## 6. Coste y control de la IA

Cada llamada se registra con su coste. Sin esto no hay negocio: un cliente que
usa el Copilot cien veces al día puede costar más de lo que paga.

- **Presupuesto por inquilino y mes**, con aviso al 80% y degradación elegante
  —modelo más barato— antes que corte seco.
- **Caché de respuestas** para preguntas repetidas sobre la misma ventana de
  datos. En la práctica, media planta pregunta lo mismo cada lunes.
- **Enrutado por tarea**: clasificar y resumir con el modelo barato; diagnosticar
  y conversar con el capaz.
- **Los diagnósticos se generan una vez por alerta**, no cada vez que alguien la
  abre.
- **El panel de superadmin muestra coste por cliente**, para que la conversación
  de precio se tenga con datos.
