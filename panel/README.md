# Panel

React + TypeScript + Vite. SPA: es una aplicación de estado, no un sitio de
contenido — SSR aquí solo añadiría complejidad.

## Estructura

```
src/
  main.tsx                 arranque y router
  datos/
    api.ts                 cliente HTTP; el único sitio que sabe de fetch
    sesion.ts              token, rol y permisos en el cliente
    permisos.ts            espejo de src/api/contexto.ts — el servidor manda
  estilo/
    tokens.css             el sistema visual entero
    base.css               reset y tipografía
  componentes/
    Cifra.tsx              un número grande con su tendencia y su cobertura
    ChipSeveridad.tsx      color + forma + icono, nunca solo color
    FilaAlerta.tsx         las tres líneas que terminan en un euro y un verbo
    CuentaAbierta.tsx      la fórmula con los valores reales
    Puntuacion.tsx         score con sus componentes y el enlace "¿cómo?"
    Serie.tsx              gráfica de serie sobre uPlot, con huecos como huecos
    Vacio.tsx              estados vacíos, de error y de dato insuficiente
  pantallas/
    EstadoPlanta.tsx       la pantalla de los 30 segundos
    Alertas.tsx            bandeja
    FichaAlerta.tsx        qué, por qué, cuánto, qué hacer, de dónde sale
    FichaActivo.tsx        el hub de una máquina
    Copilot.tsx            "Pregunta a tu fábrica"
    Ajustes*.tsx           planta, turnos, productos, causas, conectores…
```

## Reglas que no se negocian pantalla a pantalla

- **Un número que no se puede accionar no ocupa espacio destacado.**
- **Nunca más de cinco elementos en «Atención hoy».**
- **Todo número es pinchable hasta el dato crudo.** Sin callejones sin salida.
- **Ninguna puntuación sin su enlace «¿cómo?».**
- **Un hueco de dato se pinta como hueco.** `Serie.tsx` no une la línea por
  encima de un vacío, jamás.
- **El color nunca es el único portador de significado.** La severidad lleva
  color, forma e icono: en una plantilla de planta hay bastantes daltónicos.

## Dos usos distintos, no dos tamaños

El escritorio es para analizar. El móvil es para el técnico delante de la
máquina: manda «Atención hoy», la ficha de activo y el Factory Brain, y las
comparativas amplias se degradan a tabla.
