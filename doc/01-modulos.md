# 01 · Los ocho módulos

Cada módulo pasa por la regla fundamental antes de existir. Si una ficha no
puede rellenar las cuatro casillas, el módulo se aplaza.

---

## PRODUCTION RADAR — producción y OEE

| | |
|---|---|
| **Problema** | La planta sabe cuánto produjo, no dónde perdió. La pérdida se descubre al cierre de mes, cuando ya no se puede recuperar |
| **Dinero** | Un punto de OEE en una línea de 3 M€/año son 30.000 €. Las microparadas se llevan entre 3 y 8 puntos y casi nunca se miden |
| **Usuario** | Responsable de producción (diario) · Director de planta (semanal) |
| **Decisión** | Dónde meto hoy al técnico y qué línea reviso antes de que acabe el turno |

**Qué calcula.** Producción real contra objetivo; OEE con sus tres factores por
separado (disponibilidad, rendimiento, calidad) y siempre desglosados, nunca
solo el número compuesto; tiempo de ciclo real contra nominal; microparadas
—paradas por debajo del umbral de registro, que es donde vive la pérdida
invisible—; paradas con causa; scrap y rechazo; comparación entre turnos, líneas,
productos y contra el propio histórico.

**Qué aporta la capa de inteligencia.** No "detecta anomalías". Contesta cuatro
preguntas concretas, en este orden y en esta forma:

```
QUÉ CAMBIÓ    el rendimiento de la Línea 3 cayó del 88% al 74%
CUÁNDO        desde el martes 2, turno de mañana
POR QUÉ       microparadas en la estación P4: 47 paradas de 40–90 s por turno,
              antes eran 6. Coincide con el cambio a producto REF-2210
IMPACTO       -1.240 unidades/semana ≈ 8.900 €/semana de margen
QUÉ REVISAR   ajuste del alimentador de P4 en el cambio de formato
```

**Decisión de diseño: el OEE se muestra desglosado o no se muestra.** Un OEE del
78% no dice nada. Un 78% que es 95% × 86% × 96% dice que el problema es
rendimiento y que hay que mirar tiempos de ciclo, no averías. Enseñar el número
compuesto solo es el error clásico de este tipo de producto.

**Requisito mínimo de dato.** Contador de piezas + señal de máquina en marcha.
Con eso hay disponibilidad y rendimiento. Sin causas de parada hay OEE pero no
diagnóstico, y la plataforma **lo dice en pantalla** en vez de disimularlo.

---

## MAINTENANCE RADAR — activos y salud

| | |
|---|---|
| **Problema** | Mantenimiento es correctivo con un plan preventivo que se cumple a medias. La avería llega sin aviso y para la línea |
| **Dinero** | Una hora de parada no planificada en una línea principal cuesta entre 1.500 y 12.000 €. Evitar dos al año paga la suscripción con holgura |
| **Usuario** | Responsable de mantenimiento (diario) · Técnicos (en máquina) |
| **Decisión** | Qué reviso esta semana con el poco tiempo que tengo |

**Qué integra.** Horas de máquina, ciclos, alarmas del PLC/SCADA, averías,
intervenciones, repuestos consumidos, coste, técnico, tiempos de reparación,
MTBF, MTTR, y el plan preventivo (venga del GMAO o de un Excel).

**ASSET HEALTH SCORE (0–100).** Un número por activo, con cuatro componentes que
**siempre se muestran abiertos**:

```
SALUD DEL ACTIVO  =  0,35 · Fiabilidad     (MTBF frente a su propio histórico)
                  +  0,25 · Comportamiento (desviación de consumo, ciclo, alarmas)
                  +  0,20 · Mantenimiento  (cumplimiento del plan preventivo)
                  +  0,20 · Criticidad     (impacto de su parada en la línea)
```

Con el detalle de por qué baja: *"Compresor 02 · 61/100 · −14 en 30 días · el
consumo específico sube un 18% y hay 3 alarmas de presión nuevas"*.

**Decisión de diseño: el predictivo de verdad no entra en el MVP.** Predecir
fallo con vibración exige acelerómetros, muestreo alto y meses de historial con
fallos etiquetados. Lo que sí entra desde el día 1 es la **detección de deriva**:
un activo cuyo consumo, tiempo de ciclo o tasa de alarmas se aleja de su propia
línea base. Eso no es machine learning avanzado y es el 70% del valor. Prometer
predictivo el primer mes es la forma más rápida de quemar un piloto.

---

## ENERGY RADAR — consumo y coste

| | |
|---|---|
| **Problema** | La factura eléctrica se mira a nivel de planta. Nadie sabe qué máquina se la come, ni cuánto se gasta con la planta parada |
| **Dinero** | El consumo fuera de horario productivo es entre el 8% y el 20% del total en plantas sin gestión. Es dinero que se recupera con un temporizador |
| **Usuario** | Responsable de energía o de mantenimiento · Dirección (para CSRD) |
| **Decisión** | Qué apago, qué reviso y qué justifico en el informe de sostenibilidad |

**La métrica que manda: consumo por unidad producida (kWh/ud).** El consumo
absoluto sube y baja con la producción y no dice nada. El consumo específico es
comparable entre turnos, entre meses y contra uno mismo, y es el que detecta la
máquina que se está degradando.

**Qué detecta la inteligencia.** Consumo con la planta parada (el hallazgo más
rentable y el más fácil); picos que rozan la potencia contratada; máquinas cuyo
kWh/ud se degrada; desviación por turno con el mismo producto —que casi siempre
es una diferencia de método, no de máquina.

**Todo se traduce a €/año** con el precio real del contrato del cliente, no con
un precio de mercado. Y se muestra la cuenta:

```
Compresor 02 · consumo fuera de horario
  38 kW × 62 h/semana × 48 semanas × 0,142 €/kWh  =  16.055 €/año
  Acción: programar parada automática. Coste estimado: 400 €
```

---

## QUALITY RADAR — defectos y correlaciones

| | |
|---|---|
| **Problema** | Calidad conoce el porcentaje de rechazo. No conoce su causa, porque la causa está en el cruce de lote, turno, máquina y proveedor, y ese cruce nadie lo hace |
| **Dinero** | Un punto de scrap en una planta de 20 M€ con 40% de coste de material son 80.000 €/año. Y la reclamación de cliente cuesta el triple que el rechazo interno |
| **Usuario** | Responsable de calidad · Producción |
| **Decisión** | Qué lote bloqueo, a qué proveedor llamo y qué turno necesita formación |

**El corazón del módulo es la correlación**, no el gráfico de Pareto que ya
tienen. Cruzar cada rechazo con: producto, lote, materia prima, proveedor,
máquina, línea, turno, operario y condiciones de proceso.

```
El 63% de los rechazos de PROD-X en las últimas tres semanas
corresponden al lote L-4471 del proveedor ZETA.
Confianza: alta (n=284, p<0,01) · Impacto: 11.400 €
Fuentes: partes de calidad 2026-08-14 a 2026-09-04, albarán ZETA-88213
```

**Decisión de diseño: la correlación se presenta como correlación.** Nunca
"causa". El sistema aporta la evidencia y la fuerza estadística; quien decide que
es causa es el responsable de calidad. Confundir las dos cosas destruye la
confianza en cuanto haya una coincidencia falsa, y la habrá.

**Guardarraíl obligatorio.** Con `n` pequeño no se afirma nada. Por debajo de un
mínimo de muestras la correlación se muestra como "señal débil, seguir
observando", no como hallazgo.

---

## SUPPLIER RADAR — proveedores y suministro

| | |
|---|---|
| **Problema** | El proveedor se evalúa por precio en la negociación anual. El coste real de su falta de calidad y de sus retrasos no se mide y no llega a la mesa |
| **Dinero** | El coste oculto de un mal proveedor (rechazo, reproceso, parada por falta de material, urgencias) suele ser de 3 a 8 veces el ahorro por el que se le eligió |
| **Usuario** | Compras · Calidad · Dirección |
| **Decisión** | Con quién renegocio, a quién audito y de quién tengo que dejar de depender |

**SUPPLIER SCORE (0–100)**, abierto en cinco componentes: calidad (% de rechazo
imputable), puntualidad (desviación sobre fecha comprometida), precio (evolución
contra la cesta y contra el IPC sectorial), respuesta (tiempo hasta resolver una
incidencia) y cumplimiento (documentación, certificados, no conformidades).

**Lo que de verdad se vende aquí es la tendencia, no el nivel.** Un proveedor con
82 puntos que hace seis meses tenía 91 es una llamada de teléfono esta semana. Un
proveedor con 74 estable es un hecho conocido, y probablemente ya
presupuestado. **La señal es la derivada, no el nivel.**

Detecta además **dependencia excesiva** —un material crítico con proveedor
único— que es un riesgo de continuidad que nadie mira hasta que llega el
desabastecimiento.

---

## FACTORY BRAIN — el conocimiento de la planta

| | |
|---|---|
| **Problema** | El saber de la planta está en la cabeza de tres personas y en 4.000 PDFs que nadie abre. Cuando uno se jubila o está de vacaciones, la avería tarda cuatro horas más |
| **Dinero** | Reducir el tiempo de diagnóstico de una avería frecuente de 45 a 10 minutos, veinte veces al mes, son 230 horas de técnico al año |
| **Usuario** | Técnico de mantenimiento (en máquina, con el móvil) · Operario · Jefe de turno |
| **Decisión** | Qué compruebo ahora mismo, delante de esta máquina parada |

**Qué ingiere.** Manuales de fabricante, esquemas eléctricos y neumáticos,
instrucciones de trabajo, procedimientos, partes históricos de intervención,
incidencias resueltas, fotografías, vídeos con transcripción, fichas técnicas.

**Cómo responde.** Primero con el conocimiento **de esta fábrica**; el manual del
fabricante es el segundo recurso, no el primero, porque el histórico de partes de
esta planta suele valer más que el manual genérico.

```
El error E42 en la EMBOTELLADORA 2 aparece 14 veces en el histórico.
En 11 de ellas la causa fue el sensor de nivel S3 sucio.

Qué comprobar, en orden:
1. Limpieza del sensor S3 (11 casos · 12 min de media)
2. Presión de la línea de aire, mínimo 5,5 bar (2 casos)
3. Tarjeta de entradas analógicas (1 caso · requiere electricista)

Fuentes: partes 2024-1187, 2025-0342, 2025-0871 y 8 más ·
Manual KRONES p. 212 · Procedimiento PR-MTO-14
```

**Las tres reglas innegociables del Factory Brain:**

1. **Siempre cita la fuente**, con documento y página o número de parte. Una
   respuesta sin fuente no se muestra.
2. **Si no sabe, lo dice.** *"No hay nada sobre el error E42 en esta máquina.
   Lo más parecido es el E41 en la línea 1."* La respuesta inventada sobre un
   procedimiento de seguridad no es un error de producto, es un accidente.
3. **Nunca da instrucciones de intervención sobre equipos energizados** sin
   remitir al procedimiento de consignación (LOTO) de la planta.

---

## BACK OFFICE AI — documentos y descuadres

| | |
|---|---|
| **Problema** | Administración teclea albaranes y factura contra pedido a ojo. Los descuadres pequeños pasan; los grandes se descubren tarde |
| **Dinero** | Entre el 1% y el 3% del gasto en compras se pierde en descuadres no detectados, más el tiempo de tecleo |
| **Usuario** | Administración · Compras |
| **Decisión** | Qué factura no apruebo y a quién reclamo |

Lee pedidos, albaranes, facturas, órdenes de compra, presupuestos y tarifas —PDF,
email o escaneo— extrae las líneas y las **casa a tres bandas: pedido, albarán,
factura**. Lo que no cuadra sube.

```
FACTURA ZETA-2026-4411
Pedido PC-8821 ......... 6.980,00 €
Factura ................ 7.340,00 €
DESCUADRE .............. +360,00 €

Línea 3: precio unitario 4,90 € facturado / 4,65 € pactado en tarifa vigente
No aprobar hasta aclarar.
```

**Decisión de alcance: no es un OCR genérico.** Solo cubre los seis tipos de
documento de arriba y solo para proveedores ya dados de alta. Un extractor
universal es un producto entero y no es este.

---

## OPERATIONS AGENT — acciones con autorización

| | |
|---|---|
| **Problema** | Detectar sin actuar deja el trabajo a medias. La alerta llega y alguien tiene que abrir otro sistema y teclearlo otra vez |
| **Dinero** | Cierra el bucle: sin acción, todo lo anterior es información. Es lo que convierte la herramienta en el sitio donde se trabaja |
| **Usuario** | Todos, según permisos |
| **Decisión** | Ninguna nueva: ejecuta la que ya se ha tomado, sin cambiar de aplicación |

**Qué puede hacer.** Crear una orden de mantenimiento (propia o en el GMAO del
cliente), avisar a un responsable, solicitar un repuesto, generar un parte, abrir
una incidencia de calidad, enviar un informe, crear una tarea, escalar, redactar
un correo, registrar un evento.

**El modelo de autorización, que es lo único importante de este módulo:**

| Nivel | Qué es | Cómo se ejecuta |
|---|---|---|
| **0 · Informativo** | Notificar, redactar borrador | Automático |
| **1 · Reversible interno** | Crear tarea, abrir incidencia, generar parte | Automático, con registro y deshacer |
| **2 · Sale de la empresa o cuesta dinero** | Correo a proveedor, pedido de repuesto, orden en el GMAO | **Confirmación humana explícita, siempre** |
| **3 · Toca planta** | Cualquier escritura en sistema OT | **No existe.** Fuera del alcance del producto |

Toda acción queda en el registro de auditoría con quién la propuso (persona o
IA), quién la autorizó, cuándo y sobre qué evidencia. Sin excepción y sin modo
"confía en mí": una IA que actúa sin traza es un problema legal antes que
técnico.

---

## Orden de construcción y por qué

```
MVP    PRODUCTION RADAR + alertas + Copilot + ingesta         el dolor más caro y más medible
FASE 2 MAINTENANCE RADAR · ENERGY RADAR · FACTORY BRAIN       usan el mismo dato ya ingerido
FASE 3 QUALITY RADAR · SUPPLIER RADAR                         necesitan dato de calidad y compras,
                                                              que casi nunca está limpio el día 1
FASE 4 BACK OFFICE AI · OPERATIONS AGENT                      cierran el bucle cuando ya hay confianza
```

**Production Radar va primero** porque es donde el dolor es más caro, el dato más
disponible y el resultado más fácil de defender delante del gerente en la reunión
de la semana 6. **Operations Agent va el último** a propósito: nadie deja actuar
a un sistema en el que todavía no confía, y la confianza se gana acertando en las
alertas durante unos meses.
