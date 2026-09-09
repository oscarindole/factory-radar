# 08 · MVP, priorización y roadmap

## 1. El MVP, recortado

El planteamiento inicial proponía nueve piezas. Como equipo, recortamos a **siete
y media**, y explicamos qué se cae y por qué. Un MVP que tarda ocho meses no es
un MVP: es un producto sin clientes.

### Qué entra

| # | Pieza | Por qué es imprescindible |
|---|---|---|
| 1 | **Empresa · planta · usuarios · roles** | Sin multiinquilino no hay segundo cliente, y meterlo después obliga a tocar todas las consultas |
| 2 | **Jerarquía de planta y señales** | Es la capa de contexto: sin ella el dato no significa nada |
| 3 | **Ingesta por CSV/Excel, SQL y API** | Las tres formas que cubren el 95% de las plantas el primer día |
| 4 | **PRODUCTION RADAR** | OEE desglosado, paradas, microparadas derivadas, comparativas |
| 5 | **Motor de eventos, capa 1** | Umbral, desviación sobre línea base, tendencia y repetición. Sin modelos todavía |
| 6 | **Alertas + "Atención hoy" + impacto en €** | Es el producto. Lo demás es el andamio |
| 7 | **AI Copilot con consultas parametrizadas** | Es lo que hace que la demo se recuerde, y lo que separa de un Grafana |
| ½ | **DEMO FACTORY** | No es una funcionalidad, es la herramienta de venta. Va primero (fase C) |

### Qué se cae del MVP propuesto, y por qué

| Se cae | Motivo | Vuelve en |
|---|---|---|
| **Detección de anomalías "avanzada"** | Los modelos de la capa 2 necesitan meses de historial que el cliente nuevo no tiene. Con la capa 1 sobre línea base propia se acierta lo suficiente para el piloto | Fase 2 |
| **Maintenance y Energy Radar** | Aportan mucho, pero cada uno duplica el alcance de ingesta. Production Radar valida el modelo entero con un solo dominio de dato | Fase 2 |
| **Factory Brain** | Es el módulo que más impresiona en demo y **el más peligroso de lanzar pronto**: una respuesta inventada sobre un procedimiento de seguridad quema la confianza para siempre. Necesita el RAG bien hecho | Fase 2 |
| **Notificaciones por WhatsApp y SMS** | Coste, alta y verificación de plantilla, sin valor diferencial. Correo y Teams cubren el MVP | Fase 2 |

**El criterio del recorte:** el MVP tiene que poder **defender un euro ahorrado
en la reunión de la semana 6 del piloto**. Todo lo que no contribuya a ese
momento, espera.

---

## 2. Matriz de priorización

Cada elemento del backlog puntúa de 1 a 5 en seis ejes:

```
PRIORIDAD = (Impacto × 2 + Valor económico × 2 + Facilidad)
            ─────────────────────────────────────────────
                    (Riesgo + Dependencias)
```

Impacto y valor económico pesan doble a propósito: en un producto joven, el error
caro es construir bien lo que no importa. El riesgo divide en lugar de restar
porque una funcionalidad muy arriesgada tiene que ser **mucho** mejor que las
demás para justificar el turno.

| Elemento | Imp | €€ | Fácil | Riesgo | Dep | **P** |
|---|---|---|---|---|---|---|
| Ingesta CSV/Excel | 5 | 4 | 5 | 1 | 1 | **11,5** |
| Alertas con impacto en € | 5 | 5 | 4 | 2 | 2 | **6,0** |
| OEE desglosado | 5 | 5 | 3 | 2 | 2 | **5,8** |
| Microparadas derivadas | 4 | 5 | 3 | 2 | 2 | **5,3** |
| Demo Factory | 4 | 5 | 4 | 1 | 1 | **11,0** |
| Copilot con plantillas | 4 | 3 | 3 | 3 | 3 | **2,8** |
| Ingesta SQL | 5 | 4 | 4 | 2 | 2 | **5,5** |
| Asset Health Score | 4 | 4 | 3 | 2 | 3 | **3,8** |
| Energy Radar | 4 | 5 | 3 | 2 | 3 | **4,2** |
| Factory Brain | 5 | 3 | 2 | 5 | 3 | **2,3** |
| OPC UA | 3 | 3 | 2 | 3 | 2 | **2,8** |
| Operations Agent | 3 | 4 | 2 | 5 | 5 | **1,6** |
| Predictivo por vibración | 5 | 5 | 1 | 5 | 5 | **2,1** |

El resultado confirma el orden: **ingesta sencilla y demo primero**, Factory Brain
y predictivo al final pese a puntuar altísimo en impacto, porque su riesgo y sus
dependencias los hacen malos candidatos para un equipo que aún no tiene clientes.

---

## 3. Fases de desarrollo

```
FASE A   Definición completa                          ← hecha (este repositorio)
FASE B   Estructura real: esquema, rutas, endpoints, componentes, semillas
FASE C   DEMO FACTORY navegable y convincente
FASE D   MVP funcional sobre dato real
FASE E   Primer piloto industrial (6 semanas)
FASE F   Producto SaaS: alta autónoma, facturación, superadmin completo
FASE G   Escalado: fase 2 de módulos, integraciones, certificaciones
```

**Ninguna fase avanza** hasta que la anterior tiene: coherencia funcional, datos,
estados vacíos, estados de error, permisos aplicados, responsive, seguridad
básica y su documentación. Es la regla que evita el producto de 40 pantallas a
medias, que es el estado natural al que tiende este tipo de proyecto.

---

## 4. DEMO FACTORY

Fábrica ficticia, coherente y con problemas plantados. **Es el activo comercial
más importante de los próximos tres meses**: sin clientes, la demo *es* el
producto.

```
DEMO FACTORY · Planta de Torrelavega
  3 líneas · 15 máquinas · 3 turnos · 5 productos · 90 días de histórico
```

Cuatro problemas plantados, que el usuario tiene que poder descubrir navegando:

| # | Problema | Dónde se ve | Qué demuestra |
|---|---|---|---|
| 1 | **Compresor 02** con vibración y consumo crecientes durante 6 semanas | Maintenance + Energy | Detección de deriva antes del fallo |
| 2 | **Línea 3** con microparadas en P4 desde un cambio de formato | Production | Pérdida invisible que el cliente sabe que tiene |
| 3 | **Proveedor ZETA**, lote L-4471, concentra el 63% de los defectos | Quality + Supplier | Correlación entre dominios |
| 4 | **Consumo nocturno** con la planta parada | Energy | El hallazgo fácil de 16.000 €/año |

**Los datos tienen que ser consistentes de verdad**, no aleatorios: si la Línea 3
pierde rendimiento, su producción baja, su consumo por unidad sube, el turno de
noche lo acusa más y las cuentas cuadran entre módulos. Un director de planta
detecta un dato falso en veinte segundos —lo lleva viendo veinte años— y una demo
incoherente destruye la credibilidad de toda la reunión.

**Modo demo público**, sin registro, desde la web comercial. Es la mejor máquina
de generar reuniones que puede tener este producto.

---

## 5. Roadmap

### 0–3 meses · que exista y se pueda enseñar
Fases B y C completas. Demo Factory navegable y pública. Web comercial en marcha.
Documento de arquitectura de seguridad listo para IT. **Objetivo: 10 reuniones
con plantas del perfil objetivo y 2 cartas de intención de piloto.**

### 3–6 meses · que funcione con dato real
MVP funcional. Conector Edge con SQL, CSV y API. **Primer piloto pagado de 6
semanas.** Cierre del bucle de feedback de alertas. Objetivo: 2 pilotos
terminados y **un ahorro que el propio cliente cuente a un tercero**.

### 6–12 meses · que se pueda vender repetido
Maintenance y Energy Radar. Factory Brain con RAG. OPC UA y MQTT. Notificaciones
completas. Superadmin y facturación. Alta guiada que no exija que estemos
delante. Objetivo: **8–12 clientes de pago y una implantación reproducible en dos
semanas.**

### 12–24 meses · que aguante el crecimiento
Quality y Supplier Radar. Back Office AI. Operations Agent con su modelo de
autorización. Predictivo real donde haya historial. ISO 27001. Canal de
integradores. Segundo mercado: **Portugal y sur de Francia**, mismo perfil de
planta, misma propuesta.

---

## 6. Los cuatro riesgos que pueden matar esto

Conviene tenerlos escritos, porque los tres primeros ya han matado productos
parecidos:

| Riesgo | Cómo se mitiga |
|---|---|
| **El dato del cliente es peor de lo que dijo** | La semana 1 del piloto es auditoría de datos, y el contrato lo contempla. Si no hay dato, se dice y se cobra igual el diagnóstico |
| **Falsos positivos y abandono** | Tope de 5 críticas por semana, línea base por contexto, botón de feedback y revisión de calibración en la semana 4 |
| **La venta industrial es lenta** | Piloto pagado y corto como producto de entrada, en vez de suscripción anual a puerta fría |
| **Dependencia de un LLM** | Capa de abstracción desde la primera línea, presupuesto por inquilino, y todo lo que detecta funciona sin LLM |

---

## 7. Descartes

Ideas evaluadas y rechazadas. Se apuntan para no volver a discutirlas cada tres
meses:

| Descartado | Motivo |
|---|---|
| Control o escritura sobre PLC | Otro producto, otra responsabilidad civil, otra certificación |
| App móvil nativa | La web responsive cubre el caso del técnico. Nativa cuando haya escaneo de QR y trabajo sin cobertura |
| Gemelo digital | Suena muy bien en un folleto y no responde a ninguna de las cuatro preguntas de la regla fundamental |
| Marketplace de modelos | Problema de un producto con 200 clientes, no de uno con 0 |
| Blockchain para trazabilidad | No resuelve ningún problema que el cliente tenga |
| Visión artificial para calidad | Proyecto entero, con hardware y ciclo de venta propios. Se integra como fuente, no se construye |
