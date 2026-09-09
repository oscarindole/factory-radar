# 13 · Marca

## El nombre

**RADACTORY** — RADAR + FACTORY. Dice lo que hace sin tener que explicarlo, y
resuelve de paso la colisión que arrastrábamos: la plataforma ya no comparte
nombre con su primer módulo.

```
RADACTORY               la plataforma
├── PRODUCTION RADAR    producción y OEE
├── MAINTENANCE RADAR   activos y salud
├── ENERGY RADAR        consumo y coste
├── QUALITY RADAR       defectos y correlaciones
├── SUPPLIER RADAR      proveedores y suministro
├── FACTORY BRAIN       conocimiento de la planta
├── BACK OFFICE AI      documentos y descuadres
├── OPERATIONS AGENT    acciones con autorización
└── RADACTORY EDGE      el conector que va dentro de la planta
```

Los módulos conservan «RADAR» porque el patrón sigue siendo el mismo: **un
motor, muchos radares**. Bajo RADACTORY no hay ambigüedad posible.

## El símbolo va en monocromo

El logotipo se usa **sin color**: el cuadro toma la tinta del entorno y el
monograma se cala con el color del fondo.

```
sobre fondo claro    cuadro en tinta      monograma calado en claro
sobre fondo oscuro   cuadro en claro      monograma calado en oscuro
```

En el código es un único SVG, no dos versiones. El cuadro va en `currentColor`
y el monograma en `var(--mark-cut)`, que cada contexto define con su propio
fondo. Cambiar el logotipo de un sitio a otro es cambiar una variable.

**Por qué monocromo, más allá del gusto.** En el panel el color *es*
información —crítica, alta, media— y un logotipo con dos colores propios
compite con esa lectura justo donde no debe. Fuera del panel, un símbolo
monocromo aguanta el fax, el grabado, el bordado, la serigrafía a una tinta y
el sello de la caja. Un logotipo que solo existe a dos colores es un logotipo a
medias.

## Colores

Los de marca siguen existiendo, pero ya no están en el símbolo: se usan en la
interfaz.

| | | |
|---|---|---|
| **Rosa RADACTORY** | `#E0115F` | Acento de marca: botones, cifras grandes, marcadores |
| Rosa de texto | `#A80B47` | Para texto pequeño, donde el de marca no llega a 4,5:1 |
| **Naranja RADACTORY** | `#F59B00` | Secundario. Sobre fondo oscuro y en las ilustraciones |
| Tinta | `#151815` | Texto principal |
| Papel | `#F5F4EF` | Fondo claro |

> **Pendiente de confirmar.** Estos dos hexadecimales están sacados a ojo del
> logotipo en pantalla. Cuando haya el fichero vectorial original, se sustituyen
> aquí y se propagan solos: todo lo demás los lee de estos tokens.

## La regla que evita el desastre

**El color de marca NO se usa para estado.** El rosa está peligrosamente cerca
del rojo de «crítica», y un panel donde el color corporativo se confunde con una
alarma es un panel que se lee mal justo cuando importa.

```
MARCA        rosa · naranja        logotipo, enlaces, marcadores de sección
ESTADO       rojo · ámbar · azul   crítica · alta · media          RESERVADOS
SERIES       azul · verde · violeta  identidad de una línea en una gráfica
```

Tres escalas, tres trabajos, sin solaparse. En el panel, el rosa aparece **solo
en el logotipo**.

## El símbolo

Cuadro naranja con el monograma en rosa. En las páginas va como SVG en línea
—[`marca.svg`](marca.svg)— para que escale, cambie de tamaño sin
pixelarse y no dependa de ninguna descarga.

> **También pendiente.** El símbolo que hay en las páginas es un **redibujo
> aproximado** hecho a partir de la imagen. Hay que sustituirlo por el vectorial
> original antes de enseñárselo a un cliente.

## Tipografía

El logotipo usa una display ancha y geométrica, con los remates cortados en
diagonal. En web se aproxima con **Michroma** para el logotipo y titulares
cortos, y **Archivo** para el resto. Ninguna de las dos es la del logotipo: si
existe la original con licencia web, se cambia aquí.
