# 12 · DEMO FACTORY

**Planta de Torrelavega** · 3 líneas · 15 máquinas · 3 turnos · 5 productos ·
90 días de histórico · 342.000 medidas · 10.000 eventos.

Sin clientes, la demo *es* el producto. Es el activo comercial de los próximos
tres meses y, a la vez, **la prueba del motor de detección**: los cuatro
problemas no están marcados en ninguna parte de la base. Si el motor no los
encuentra solo, el motor está mal.

## Cómo se regenera

```bash
npm run migrar        # esquema
npm run demo          # estructura, series y eventos      (~12 s)
npm run demo-motor    # métricas, líneas base y alertas   (~20 s)
npm run demo-exportar # instantánea a var/demo.json
npm run demo-panel    # panel navegable a doc/demo.html
```

**El generador es determinista.** La semilla es fija: una demo comercial que sale
distinta cada vez no se puede ensayar, y no se puede depurar cuando alguien dice
«ayer salía otro número».

## Los cuatro problemas plantados

| # | Qué se plantó | Cómo aparece | Dónde se ve |
|---|---|---|---|
| 1 | Deriva de consumo del **COMP-02** durante 6 semanas, con alarmas de presión crecientes | Salud **74**, era 82 hace 30 días · consumo específico +14,6% · 3 alarmas. Sin una sola avería: no aparecería en un GMAO | Mantenimiento |
| 2 | **Microparadas en la Estación P4** desde el cambio a REF-2210 hace 7 días | Alerta **crítica**: rendimiento del 87% al 75%, 92 microparadas/día frente a 9 · **129.218 €/año** | Estado · Producción |
| 3 | El **lote L-4471 de ZETA** concentra los rechazos de REF-1140 | **67% de los rechazos** sobre 4 lotes en la ventana · 23.695 € ya incurridos | Calidad |
| 4 | **COMP-02 y la enfriadora no paran** al acabar el último turno | 44 kW con la planta parada · **14.662 €/año**. COMP-01 sí para: es el contraste que lo hace evidente | Energía |

## Por qué los datos cuadran entre módulos

Todo se deriva del mismo turno simulado. Si la Línea 3 pierde rendimiento, su
contador sube menos, su consumo por unidad sube y el turno de noche lo acusa más.

Generar cada serie por separado con ruido independiente produce demos que no se
sostienen: **un director de planta detecta un dato falso en veinte segundos**
—lleva veinte años viéndolos— y una demo incoherente destruye la credibilidad de
toda la reunión.

Cifras de la planta simulada, todas comprobables en el panel:

```
OEE           71,0%  =  91% disponibilidad × 82% rendimiento × 95,3% calidad
Paradas sin causa registrada .... 72,9%
Margen anual de la planta ....... ~5 M€ sobre tres líneas
```

El **72,9% de paradas sin causa** no es un defecto del generador: es lo que se
encuentra en una planta con ERP y sin MES, y es la cifra que abre la
conversación comercial de la semana 1 del piloto.

## El panel de demo no es el panel de producción

`doc/demo.html` se lleva a una reunión en un portátil: funciona sin cobertura y
se ve igual el martes que el jueves. Por eso lee una instantánea congelada
(`var/demo.json`, 71 KB) en vez de hablar con la API.

El panel de producción vive en [`panel/`](../panel/) y lee la API de verdad. Son
dos cosas distintas a propósito.
