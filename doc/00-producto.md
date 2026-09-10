# 00 · Producto

## 1. El problema real, dicho sin marketing

Una fábrica mediana española de 2026 no tiene un problema de falta de datos.
Tiene tres problemas distintos que se confunden entre sí:

**El dato existe pero está preso.** El SCADA sabe cuándo paró la línea. El ERP
sabe cuánto costó el material. El parte de mantenimiento sabe quién fue a
arreglarlo. Los tres datos existen y ninguno se habla con los otros, porque
juntarlos nunca ha sido responsabilidad de nadie. El director de planta hace la
unión a mano, en un Excel, los lunes por la mañana.

**El dato que falta es siempre el mismo: la causa.** Casi todas las plantas
registran *que* hubo una parada. Muy pocas registran *por qué*. El campo de
motivo de parada, si existe, tiene tres valores en la práctica: "avería", "otros"
y en blanco. Esto es el hecho más importante de todo el proyecto y volveremos a
él en el modelo de datos, en el MVP y en la metodología de piloto.

**Nadie tiene tiempo de mirar.** El responsable de producción no abre un cuadro
de mando de 50 gráficas. Lo abrió las tres primeras semanas después de la
implantación y luego dejó de hacerlo. Esto le ha pasado ya a casi todos nuestros
clientes potenciales, con un producto anterior, y explica por qué reciben con
frialdad la palabra "dashboard".

> **Consecuencia de producto.** No competimos por tener más gráficas. Competimos
> por ser lo único que el director de planta abre a las 7:40 de la mañana,
> porque en 30 segundos le dice si tiene un problema y cuánto le cuesta.

---

## 2. Qué es RACTORY

Una capa de inteligencia industrial, en la nube, que se conecta a lo que la
fábrica ya tiene y produce **una lista corta de decisiones**, no un repositorio
de métricas.

La cadena completa, y ningún eslabón es opcional:

```
DATO  →  CONTEXTO  →  ANOMALÍA  →  DIAGNÓSTICO  →  IMPACTO EN €  →  ACCIÓN
```

La mayoría de las plataformas del mercado llegan hasta `CONTEXTO` (te pintan la
serie) o hasta `ANOMALÍA` (te disparan una alarma). El producto empieza a valer
dinero en `IMPACTO EN €` y se vuelve difícil de sustituir en `ACCIÓN`, porque
para entonces la orden de trabajo ya nace dentro de la plataforma.

**La frase interna que decide los empates de diseño:**
*si la pantalla no termina en un euro o en una acción, sobra.*

---

## 3. A quién se lo vendemos — el cliente cabeza de playa

No somos horizontales. Un producto industrial horizontal es un producto que no
convence a nadie en la primera reunión.

### Perfil objetivo (ICP)

| | |
|---|---|
| **Tamaño** | 50–300 empleados · 10–80 M€ de facturación |
| **Activos** | 20–150 máquinas relevantes · 1–3 plantas |
| **Sistemas** | **Tiene ERP. No tiene MES.** SCADA parcial. Excel por todas partes |
| **Equipo IT** | 0,5 a 2 personas. No hay data scientist y no lo va a haber |
| **Sectores** | Transformación metálica, alimentación y bebidas, plástico y caucho, químico de segunda transformación |
| **Geografía inicial** | Cantabria, País Vasco, Navarra, La Rioja, Castilla y León — radio de coche desde Torrelavega |

### Por qué exactamente ese perfil

Es el hueco real del mercado. Por debajo, la fábrica de 20 personas se apaña con
Excel y no paga suscripción. Por encima, la planta de 800 personas ya tiene MES
y compra Siemens, AVEVA o PTC porque necesita que le firmen un SLA global.

El cliente de 50–300 empleados **está demasiado creciente para el Excel y
demasiado pequeño para el proyecto de 300.000 € a 18 meses**. Ese es el hueco, y
es grande: en España hay alrededor de 12.000 plantas en esa franja.

La geografía no es un capricho. En industria, la primera venta se cierra pisando
la planta. El radio de coche es una ventaja competitiva frente a un SaaS de
Múnich, y deja de serlo a partir del cliente 30 — para entonces el producto ya
se vende solo o no se venderá nunca.

### Quién firma y quién usa

| Rol | Qué le quita el sueño | Qué le damos |
|---|---|---|
| **Director de planta / Gerente** | El coste por unidad sube y no sabe por dónde | La pantalla de 30 segundos y el € |
| **Responsable de producción** | La línea 3 va mal y solo lo nota al cierre del mes | La alerta el mismo día, con la estación señalada |
| **Responsable de mantenimiento** | Apaga fuegos, no previene | El Asset Health Score y el aviso antes del fallo |
| **Responsable de calidad** | Sabe el porcentaje de rechazo, no la causa | La correlación lote–proveedor–turno |
| **Responsable de energía / RSC** | Le piden reportar y no tiene por máquina | Consumo por unidad producida y CSRD |
| **IT** | Que le abran un puerto a la red OT | Conector **solo salida**, sin puertos entrantes |

**Quien firma es el director de planta o el gerente.** IT tiene derecho de veto,
nunca derecho de compra. De ahí se deriva media arquitectura de seguridad: el
producto se diseña para que IT no pueda decir que no.

---

## 4. Contra quién competimos, en serio

Decirlo con precisión es lo que evita construir contra un rival imaginario.

| Competidor | Qué hace bien | Dónde le ganamos |
|---|---|---|
| **Excel + el lunes por la mañana** | Gratis, flexible, ya está | Es el rival de verdad. Le ganamos en tiempo, no en potencia |
| **Siemens Insights Hub, PTC ThingWorx, AVEVA** | Potentes, certificados, globales | Ciclo de venta de 9 meses y coste de implantación de seis cifras |
| **Ignition, Node-RED, Grafana** | Baratos y muy capaces | Son herramientas, no producto: alguien tiene que construirlo y mantenerlo |
| **MES clásico (a medida o de nicho)** | Control fino de planta | Exige cambiar cómo trabaja la planta. Nosotros no tocamos nada |
| **Augury, Samotics, Falkonry** | Predictivo de verdad sobre vibración | Resuelven un activo, no la fábrica. Convivimos: son una fuente más |
| **Integrador local** | Confianza y cercanía | Es socio, no rival. Le damos producto en vez de horas |

**El posicionamiento de una frase:**
*el 80% del valor de un MES, en seis semanas, sin tocar la planta y por
suscripción.*

Y la promesa que no hacemos: no prometemos sustituir al MES ni controlar la
máquina. Prometerlo hace que la primera reunión técnica se vuelva en contra.

---

## 5. La propuesta de valor, en el orden en que se cuenta

1. **No cambies tu fábrica.** Nos conectamos a lo que ya tienes. Si lo único que
   hay es un Excel, empezamos por el Excel.
2. **Sin obra en la red.** El conector sale hacia fuera; no abre ningún puerto.
   IT lo aprueba en una reunión, no en un comité.
3. **Cuatro semanas hasta la primera alerta útil.** No 18 meses.
4. **Te decimos el euro.** Cada anomalía trae su impacto estimado y cómo se ha
   calculado.
5. **Pregunta en castellano.** "¿Por qué bajó el OEE esta semana?" y la respuesta
   cita el dato del que sale.
6. **Empieza por una línea.** El piloto es una línea, no la planta entera.

---

## 6. Lo que no vamos a hacer (y hay que decirlo pronto)

Un producto se define tanto por sus fronteras como por sus funciones. Estas
fronteras son de diseño, no de falta de tiempo:

- **No escribimos en el PLC.** Ni en el MVP ni en la versión 3. Escribir en
  planta es otro producto, con otra certificación, otro seguro y otro nivel de
  responsabilidad civil. Se dice en la primera reunión y tranquiliza a IT.
- **No somos un sistema de seguridad funcional.** Nada de lo que hacemos puede
  estar en la cadena de un enclavamiento o de una parada de emergencia.
- **No sustituimos al GMAO** si el cliente tiene uno bueno. Lo leemos y le
  devolvemos órdenes.
- **No inventamos el dato que no existe.** Si no hay causas de parada, lo
  decimos, no lo estimamos con IA y lo pintamos como si fuera cierto.
- **No vendemos "IA".** Vendemos paradas evitadas y scrap reducido. La IA es
  cómo, no qué.

---

## 7. Nombre: hay una colisión que arreglar ahora

El planteamiento inicial llama **RACTORY** a la vez a la plataforma
completa y al primer módulo (el de producción). Eso rompe en cuanto se dibuja el
menú lateral: no puede haber un "Ractory" dentro de "Ractory".

**Decisión.** La plataforma es **RACTORY**. El módulo de producción pasa a
llamarse **PRODUCTION RADAR**. La familia queda:

```
RACTORY  (la plataforma)
├── PRODUCTION RADAR    producción y OEE
├── MAINTENANCE RADAR   activos y salud
├── ENERGY RADAR        consumo y coste energético
├── QUALITY RADAR       defectos y correlaciones
├── SUPPLIER RADAR      proveedores y suministro
├── FACTORY BRAIN       conocimiento de la planta (RAG)
├── BACK OFFICE AI      documentos y descuadres
└── OPERATIONS AGENT    acciones con autorización
```

El patrón es **un motor, muchos radares**: una sola capa de ingesta, contexto y
detección, y encima tantos radares como dominios tenga la planta. Añadir uno
nuevo no toca el motor.

> **Pendiente comercial, no técnico:** comprobar disponibilidad de marca y
> dominio antes de imprimir nada. `factoryradar.com` es probable que esté
> cogido; `factoryradar.io`, `factoryradar.es` y la marca mixta con Índole son
> las alternativas a verificar.

---

## 8. Cómo sabremos que el producto funciona

No por usuarios registrados. Por estas cinco:

| Métrica | Umbral de "esto funciona" |
|---|---|
| **Apertura matinal** | ≥ 60% de los usuarios de planta abren antes de las 9:00, tres meses después del alta |
| **Alertas accionadas** | ≥ 40% de las alertas críticas terminan en una acción registrada |
| **Falsos positivos** | ≤ 20% de alertas marcadas como "no era nada" |
| **Euros defendibles** | Cada cliente tiene al menos un ahorro que él mismo cuenta a un tercero |
| **Renovación a 12 meses** | ≥ 85% |

La segunda es la que de verdad importa. Una alerta que nadie acciona es una
gráfica más, y ya hemos dicho que de eso no vivimos.
