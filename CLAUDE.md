# FACTORY RADAR — instrucciones

Plataforma de inteligencia industrial. El repositorio contiene la **FASE A**
(definición, en `doc/`), la **FASE B** (estructura real: `db/`, `src/`, `edge/`,
`panel/`) y la **FASE C** (DEMO FACTORY navegable: `scripts/demo-*`, `doc/demo.html`).

## Antes de escribir nada

Lee [`doc/10-decisiones.md`](doc/10-decisiones.md). Son 38 decisiones ya tomadas
con su alternativa descartada — 22 de la fase A y 16 que salieron de construir.
Si vas a contradecir una, di cuál y por qué; no la deshagas de pasada.

## La regla que manda

Ninguna funcionalidad entra sin responder a las cuatro preguntas: qué problema
industrial resuelve, cuánto dinero o tiempo ahorra, quién la usa (con cargo, no
"el usuario") y qué decisión facilita. Lo que no las conteste va a la sección de
descartes de `doc/08-mvp-roadmap.md`, con el motivo.

## Cosas que no se hacen en este producto

- **No se escribe nunca en un sistema OT.** No es una opción desactivada: no se
  implementa. El conector no debe contener código capaz de escribir en un PLC.
- **No se interpola un hueco de dato.** El hueco se pinta como hueco. Un dato
  inventado en industria es un diagnóstico equivocado.
- **No se muestra una puntuación sin poder abrir su fórmula** con los valores
  reales de ese activo.
- **No se inserta una alerta sin `impact_basis` ni `evidence`.** Es restricción de
  esquema, no buena intención.
- **El LLM no detecta anomalías.** Detectan las reglas y la estadística sobre el
  dato; el LLM explica lo detectado.
- **El Copilot no escribe SQL.** Consultas parametrizadas de catálogo, siempre.
- **La IA no responde sin citar fuente.** Y si no sabe, lo dice.

## Dónde va cada cosa

| | |
|---|---|
| Qué vendemos y a quién | `doc/00-producto.md` |
| Qué hace cada módulo | `doc/01-modulos.md` |
| Stack y por qué ese | `doc/02-arquitectura.md` |
| Entidades y esquema | `doc/03-modelo-datos.md` |
| Pantallas y sistema visual | `doc/04-pantallas.md` |
| Decisiones ya tomadas | `doc/10-decisiones.md` — **léelo antes de cambiar arquitectura** |
| Contrato de la API | `doc/11-api.md` |
| Esquema, en orden | `db/01-…` a `db/10-…`, idempotentes |
| Aislamiento multiempresa | `db/09-rls.sql` + `db/pruebas/fugas.sql` |
| Lógica de producto | `src/dominio/` — OEE, microparadas, impacto, severidad |
| Cliente del panel | `panel/src/` (estructura; se llena en FASE D) |
| Motor de cálculo y detección | `src/motor/` |
| La demo y sus 4 problemas | `doc/12-demo.md` · `scripts/demo-factory.mjs` |

## Cómo se toca la base

**Nunca** se exporta un `query` suelto. Para leer o escribir hay que pasar por
`conInquilino(tenantId, fn)` de `src/db.ts`, que abre transacción y fija el
contexto. Es la barrera 2 de 3 del aislamiento: hace que escribir una consulta
sin inquilino sea imposible, no solo desaconsejado.

`comoSuperadminSinAislamiento()` existe, tiene ese nombre incómodo a propósito y
exige un motivo. Si aparece en un diff, hay que mirarlo.

Después de tocar el esquema, `npm run pruebas-fugas`. Once pruebas que corren
como `fr_app`. Si alguna falla, no se despliega.

## Estilo

Español. Los comentarios del código, **sin tildes**. Los comentarios explican
**por qué**, no qué: los que documentan un fallo real que costó una tarde no se
borran al refactorizar.

## Este repositorio va solo

FACTORY RADAR no depende de ningún otro proyecto ni lo menciona. Si algo de aquí
te recuerda a otro producto, no lo enlaces: no se comparten commits, ni código
sin revisar, ni números de un cliente a otro.
