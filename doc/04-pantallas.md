# 04 · Pantallas

## 1. La regla de los 30 segundos

El director de planta abre la aplicación a las 7:40, con el café en la mano y de
pie. Tiene que salir de ahí sabiendo tres cosas: **si hay problema, dónde, y
cuánto cuesta.** Todo lo demás de la aplicación existe para cuando alguien decide
profundizar, y ese alguien es minoría.

De ahí tres reglas de diseño que no se negocian pantalla a pantalla:

- **Un número que no se puede accionar no ocupa espacio destacado.**
- **Nunca más de cinco elementos en "Atención hoy".** Si hay quince problemas,
  el trabajo del producto es decidir cuáles son los cinco que importan. Una lista
  de quince es una lista que no se lee.
- **Todo número es pinchable hasta el dato crudo.** Sin excepción y sin
  callejones sin salida.

---

## 2. Sitemap

```
/                          ESTADO DE PLANTA        ← la pantalla de los 30 s
/alertas                   todas, con filtros e histórico
/alertas/:id               ficha: qué, por qué, cuánto, qué hacer
/copilot                   conversación a pantalla completa

/produccion                PRODUCTION RADAR
  /produccion/lineas       comparativa entre líneas
  /produccion/turnos       comparativa entre turnos
  /produccion/oee          OEE desglosado y sus pérdidas
  /produccion/paradas      análisis de paradas y microparadas

/mantenimiento             MAINTENANCE RADAR
  /mantenimiento/activos   listado con Asset Health Score
  /mantenimiento/ordenes   órdenes de trabajo
/energia                   ENERGY RADAR
/calidad                   QUALITY RADAR
/proveedores               SUPPLIER RADAR
/conocimiento              FACTORY BRAIN — buscar y preguntar

/activos/:id               FICHA DE ACTIVO — el hub de una máquina
/informes                  informes programados y descargas

/ajustes/planta            jerarquía, líneas, máquinas, señales
/ajustes/turnos            calendario y patrones
/ajustes/productos         productos, ciclos nominales, márgenes
/ajustes/causas            catálogo de causas de parada
/ajustes/conectores        estado de las fuentes de dato
/ajustes/alertas           umbrales, destinatarios, horarios, escalado
/ajustes/usuarios          usuarios, roles y permisos
/ajustes/integraciones     ERP, GMAO, Teams, correo

/admin                     SUPERADMIN (fuera del inquilino)
  /admin/clientes          altas, licencias, plantas
  /admin/conectores        salud de todos los conectores
  /admin/ia                consumo, coste y latencia por cliente
  /admin/errores           incidencias de la plataforma
```

---

## 3. La pantalla principal

```
┌──────────────────────────────────────────────────────────────────────────┐
│  RACTORY      Planta Torrelavega ▾        [Pregunta a tu fábrica]  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ESTADO DE PLANTA                        martes 9 · 07:41 · turno mañana │
│                                                                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  │PRODUCCIÓN││   OEE   ││ CALIDAD ││ RECHAZOS││ENERGÍA/UD││CRÍTICAS│ │
│  │  92%    ││  78%    ││ 96,2%   ││  3,8%   ││  +11%   ││   2    │ │
│  │ objetivo││   ▼ −4  ││  ▲ +0,3 ││  ▲ +0,9 ││   ▼     ││ máquinas│ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘ │
│                                                                          │
│  ATENCIÓN HOY                                            5 de 12  ver →  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ ● CRÍTICA   LÍNEA 3 · rendimiento −14%                            │   │
│  │             Microparadas recurrentes en la estación P4 desde el   │   │
│  │             martes. 47 por turno frente a 6 habituales.           │   │
│  │             ≈ 8.900 €/semana        Revisar alimentador de P4  →  │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ ● ALTA      COMPRESOR 02 · consumo +18% sobre media de 30 días    │   │
│  │             Consume 38 kW con la planta parada.                   │   │
│  │             ≈ 16.055 €/año          Programar parada nocturna  →  │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ ● ALTA      PROVEEDOR ZETA · 61% de los defectos de la semana     │   │
│  │             Concentrados en el lote L-4471.                       │   │
│  │             ≈ 11.400 €             Bloquear lote y reclamar    →  │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │ ● MEDIA     EMBOTELLADORA 2 · salud 61/100 (−14 en 30 días)       │   │
│  │ ● MEDIA     TURNO NOCHE · 8% menos de rendimiento en PROD-X       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  IMPACTO ACUMULADO DETECTADO ESTE MES              47.300 €     ver →    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Lo que hace que esta pantalla funcione:**

- **Seis indicadores, ni uno más.** Cada uno con su flecha de tendencia, porque
  el nivel sin tendencia no es accionable.
- **Cada alerta cabe en tres líneas** y termina en un euro y en un verbo.
- **"Impacto acumulado detectado este mes"** es el marcador de la renovación. Es
  el número que el director de planta le enseña a su gerente, y el que hace que
  no se cuestione la factura.
- **Sin gráficas.** Las gráficas están un clic más adentro. Una gráfica en la
  pantalla de los 30 segundos es una invitación a interpretar, y interpretar es
  justo el trabajo que le estamos quitando.

---

## 4. Ficha de alerta

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Atención hoy                                       ● CRÍTICA · abierta │
│                                                                          │
│  LÍNEA 3 · el rendimiento cayó del 88% al 74%                            │
│  Detectado el 9 sep 07:15 · confianza 87%                                │
│                                                                          │
│  QUÉ HA CAMBIADO                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  100% ┤                                                             │ │
│  │       │ ▁▂▃▂▃▂▃▂▃▂▃▂▃▂  línea base 88%                             │ │
│  │   75% ┤                ╲▁▁▂▁▁▂▁                                     │ │
│  │       └──────────────────┬─────────────────────                     │ │
│  │       26 ago          2 sep ▲ cambio a REF-2210        9 sep        │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  POR QUÉ (causa probable)                                                │
│  47 microparadas por turno en la estación P4, frente a 6 de media.       │
│  Duración de 40 a 90 s. Empiezan el 2 de septiembre, coincidiendo con    │
│  el cambio a REF-2210. La misma referencia no dio problema en la línea 1.│
│                                                                          │
│  CUÁNTO CUESTA                                    8.900 €/semana         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  1.240 uds/semana perdidas × 7,18 € de margen unitario = 8.903 €   │ │
│  │  Unidades perdidas = (88% − 74%) × 4.430 uds de capacidad semanal  │ │
│  │  Margen unitario: ficha de PROD-X · actualizado 1 sep         ver →│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  QUÉ HACER                                                               │
│  1. Revisar el ajuste del alimentador de P4 para el formato REF-2210     │
│  2. Comparar parámetros con la línea 1, que fabrica lo mismo sin fallo   │
│  3. Comprobar el parte 2025-0871, con un síntoma parecido en 2025        │
│                                                                          │
│  [ Crear orden de mantenimiento ]  [ Avisar a producción ]  [ Descartar ]│
│                                                                          │
│  FUENTES  contador L3-P4 · eventos 2–9 sep · ficha PROD-X · parte 2025-0871│
│  ¿Ha sido útil?   [ Sí ]  [ No era nada ]  [ Ya lo sabía ]               │
└──────────────────────────────────────────────────────────────────────────┘
```

Esta es la pantalla más importante del producto entero. **Es la que demuestra
que no somos un cuadro de mando**: qué cambió, por qué, cuánto cuesta con la
cuenta abierta, qué hacer, de dónde sale, y un botón que ejecuta.

Los tres botones de feedback del pie parecen un detalle y no lo son: son el único
mecanismo que tiene el sistema para dejar de equivocarse.

### Compartir la alerta

Debajo de las acciones va una fila de compartir, y **WhatsApp va el primero**.

No es una concesión a la moda: en una planta española el jefe de turno avisa al
de mantenimiento por WhatsApp, no por correo. Enterrar esa opción detrás de un
menú de tres puntos es no haber pisado una nave. El correo queda el segundo,
para lo que hay que dejar por escrito, y «copiar» el tercero, para pegarlo en el
parte o en el grupo que sea.

**Lo que se comparte es la alerta entera, no un enlace.** El mensaje lleva qué
ha cambiado, por qué, cuánto cuesta y qué hacer, y **luego** el enlace al
detalle. Compartir solo el titular obliga al que lo recibe a abrir el panel para
enterarse de algo, y en un turno de noche eso significa que no lo abre.

```
RACTORY · Planta de Torrelavega
■ CRÍTICA — Estación P4 · el rendimiento cayó del 87% al 75%

Qué ha cambiado: media de 75,0% en 4 turnos de los últimos 7 días…
Por qué: 642 microparadas en 7 días (92/día frente a 9 habituales)…
Impacto: 129.218 € al año
Qué hacer: Revisar el ajuste de L3.P4 para el formato REF-2210.

Detalle: …/alerta/4471
```

Se usa el enlace universal `wa.me`, que funciona en móvil y en escritorio sin
SDK, sin cookie y sin script de terceros. Para copiar se usa el portapapeles del
navegador con recurso al método antiguo si no hay permiso o no hay HTTPS.

> **Pendiente de una decisión de privacidad.** El mensaje incluye cifras de coste
> de la planta. Antes de que esto salga a un cliente hay que decidir si el rol
> sin permiso de `coste.ver` comparte el texto sin el euro, y si el enlace al
> detalle debe caducar. La ficha ya oculta el coste a ese rol; el compartir
> todavía no.

---

## 5. Ficha de activo

El hub de una máquina. Todo lo que la plataforma sabe de ella, en un sitio:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  EMBOTELLADORA 2          Línea 3 · KRONES · Contiform 3        ● en marcha│
│                                                                          │
│  SALUD 61/100  ▼ −14 en 30 días        [ Producción ][ Mantenimiento ]   │
│  ┌──────────────────────────────────┐  [ Energía ][ Alarmas ][ Docs ]    │
│  │ Fiabilidad     72  ▬▬▬▬▬▬▬░░░    │                                    │
│  │ Comportamiento 44  ▬▬▬▬░░░░░░    │  OEE 30 días        74%            │
│  │ Mantenimiento  81  ▬▬▬▬▬▬▬▬░░    │  MTBF               186 h  ▼       │
│  │ Criticidad     55  ▬▬▬▬▬░░░░░    │  MTTR               2,4 h          │
│  └──────────────────────────────────┘  Coste parada/h     3.200 €        │
│  Baja por comportamiento: el consumo específico sube un 18% y hay        │
│  3 alarmas de presión nuevas este mes.                        ¿cómo? →   │
└──────────────────────────────────────────────────────────────────────────┘
```

El enlace **"¿cómo?"** al lado de cada puntuación abre la fórmula con los valores
de esta máquina. Aparece siempre, en todas las puntuaciones de la plataforma.
*Nunca se muestra un score sin explicar cómo se calcula* — es regla de producto,
no una mejora futura.

---

## 6. AI Copilot

Presente en toda la aplicación como campo persistente arriba: **"Pregunta a tu
fábrica"**. Se abre en panel lateral sin perder el contexto de la pantalla, y esa
pantalla forma parte del contexto de la pregunta: preguntar "¿y la semana
pasada?" estando en la Línea 3 tiene que funcionar.

```
┌─────────────────────────────────────────────────┐
│  ¿Por qué ha bajado el OEE esta semana?         │
├─────────────────────────────────────────────────┤
│  El OEE de la planta bajó del 82% al 78%        │
│  (−4 puntos) entre el 2 y el 8 de septiembre.   │
│                                                 │
│  El 74% de la caída viene de la Línea 3:        │
│  microparadas en P4 desde el cambio a REF-2210. │
│  El resto se reparte entre una avería del       │
│  compresor el jueves (−0,7) y un arranque lento │
│  del turno de noche (−0,3).                     │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ OEE por línea · 2–8 sep                   │  │
│  │ L1 ▬▬▬▬▬▬▬▬▬ 84%                          │  │
│  │ L2 ▬▬▬▬▬▬▬▬  81%                          │  │
│  │ L3 ▬▬▬▬▬▬    74%  ▼                       │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Fuentes: métricas 2–8 sep · eventos L3 ·       │
│  alerta #4471                          ver →    │
│                                                 │
│  ¿Quieres que abra una orden para P4?           │
└─────────────────────────────────────────────────┘
```

**Las reglas del Copilot:**
- Consulta el dato real. **No estima nunca.** Si no puede consultarlo, lo dice.
- Cita siempre las fuentes internas, pinchables.
- Devuelve el gráfico junto al texto cuando ayuda, no en lugar del texto.
- Puede proponer una acción; ejecutarla exige confirmación explícita.
- Si la pregunta no se puede contestar con los datos que hay, **explica qué dato
  falta**. Esa respuesta es comercialmente valiosa: es la que justifica subir un
  peldaño en la escalera de ingesta.

---

## 7. Estados vacíos, de error y de dato insuficiente

Es la parte que casi siempre se deja para el final y la que decide la confianza
en las primeras dos semanas — que son justo las semanas en que el cliente decide
si esto va a funcionar.

| Situación | Qué se muestra |
|---|---|
| **Planta recién creada** | Asistente de 4 pasos: jerarquía → señales → turnos → productos. Con barra de progreso y datos de ejemplo hasta que llegue el real |
| **Sin dato todavía** | *"Aún no hay lecturas de esta máquina. El conector se dio de alta hace 2 h; la primera lectura suele tardar."* Con estado del conector, no un gráfico vacío |
| **Dato con huecos** | El gráfico dibuja el hueco **como hueco**, con una franja gris y "sin dato". Jamás se une la línea por encima de un vacío |
| **Cobertura insuficiente** | *"OEE calculado sobre el 62% del turno. Faltan datos de 06:00 a 09:10."* El número se muestra atenuado |
| **Sin causas de parada** | *"El 84% de las paradas no tienen causa registrada. Sin causa no podemos diagnosticar."* Con enlace a cómo empezar a registrarlas |
| **Muestra pequeña** | La correlación se marca como "señal débil" y no genera alerta |
| **Conector caído** | Aviso en la cabecera, no enterrado en ajustes. Con desde cuándo y qué se ve afectado |
| **La IA no sabe** | *"No tengo información suficiente para responder."* Nunca se rellena el hueco con verosimilitud |
| **Sin permiso** | Se explica qué rol hace falta y a quién pedirlo. No un 403 seco |

---

## 8. Sistema visual

**El contexto manda.** Esto se mira en una oficina de planta con luz de nave, a
veces en una tablet con guantes, a veces en una pantalla de 55" colgada en el
taller y vista a tres metros. Nada de gris claro sobre blanco.

```
FONDO         #070707  oscuro por defecto — pantalla de taller, turno de noche
              claro disponible, mismo contraste
TEXTO         #FFFFFF principal · #9E9E9E secundario

CRÍTICA       #E5484D    ALTA      #F5A524
MEDIA         #3E9EFF    BAJA      #7C8794
BIEN          #46C68A    NEUTRO    #9E9E9E

DATO          #FFFFFF sobre fondo oscuro, siempre el elemento de más contraste
LÍNEA BASE    #9E9E9E discontinua
HUECO         franja rayada, nunca interpolada
```

**Tipografía.** Una sola familia con buena caja de números. Los números tabulares
son obligatorios en tablas: si las cifras bailan al actualizarse, la tabla se
vuelve ilegible. Números grandes y con peso: la cifra es el contenido, la
etiqueta es el marco.

**Reglas de gráfica.** Máximo cuatro series por gráfica. La línea base siempre
presente, discontinua. El eje Y no empieza en cero solo cuando se está mirando
una desviación, y entonces se dice. Nada de gradientes, sombras ni 3D.

**Accesibilidad.** El color nunca es el único portador de significado: la
severidad lleva color, forma e icono. Contraste mínimo AA. Es un requisito real:
en industria hay bastantes daltónicos y el 8% de la población masculina es mucha
gente en una plantilla de planta.

**Responsive, con dos usos distintos.** El escritorio es para analizar. El móvil
es para el técnico delante de la máquina: en móvil manda "Atención hoy", la ficha
de activo y el Factory Brain, y las comparativas amplias se degradan a tabla.
