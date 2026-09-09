# 11 · API

Versionada desde el primer día en `/v1/`. Cambiar de forma una respuesta que un
cliente ya consume es una llamada de teléfono desagradable que se evita con un
prefijo de ruta.

## Reglas que se aplican a todos los endpoints

| Regla | Por qué |
|---|---|
| **Un recurso de otro inquilino devuelve 404, nunca 403** | Un 403 confirma que el recurso existe. Eso ya es información que no le corresponde |
| **Toda cifra en euros viaja con su cuenta abierta** | `impacto_base` es obligatorio en el esquema. El panel la pinta tal cual |
| **Toda puntuación viaja con sus componentes y sus pesos** | El panel enseña un «¿cómo?» al lado y tiene que rellenarlo sin recalcular |
| **Un hueco de dato se devuelve como hueco** | Nunca se interpola. Un dato inventado en industria es un diagnóstico equivocado |
| **Los errores 5xx no devuelven la traza** | Revela nombres de tabla y versión de motor: reconocimiento gratis |
| **Toda escritura relevante deja fila en `audit_log`** | Quién, cuándo, desde dónde y sobre qué evidencia |

## Autenticación

Dos credenciales distintas, a propósito:

- **Sesión de usuario** — `Authorization: Bearer <token>`, HMAC firmado, 12 h.
  Lleva `userId`, `tenantId`, `rol` y las plantas alcanzables.
- **Token de conector** — para `/v1/ingesta`. Al otro lado hay una máquina en
  una nave, no una persona. Se guarda solo como hash: si se filtra la base, no
  se puede suplantar a ningún conector con lo que hay dentro.

## Endpoints

### Estado

```
GET  /salud                                  → sin sesión; comprueba que la base responde
GET  /v1/plantas/:siteId/estado              → la pantalla de los 30 segundos, en una sola petición
```

Devuelve los seis indicadores, las cinco alertas de «Atención hoy», el impacto
acumulado del mes y —siempre, aunque sea malo— el porcentaje de paradas sin
causa registrada. Va en un único endpoint porque seis peticiones en paralelo
para pintar seis cifras es lo que hace que el panel tarde en abrir.

### Alertas

```
GET  /v1/alertas?siteId&estado&modulo&limite → bandeja, ordenada por severidad e impacto
GET  /v1/alertas/:id                         → ficha completa: cuenta abierta, fuentes, diagnóstico
POST /v1/alertas/:id/feedback                → { feedback: util | no_era_nada | ya_lo_sabia }
```

El diagnóstico se generó **una vez**, al crear la alerta, y se sirve desde
`ai_analysis`. No se vuelve a pedir al LLM cada vez que alguien abre la ficha:
eso multiplicaría el coste de IA por el número de curiosos.

`POST /feedback` es lo único que permite al sistema dejar de equivocarse. Un
`no_era_nada` cierra la alerta y ajusta el umbral de esa señal en esa planta.

### Planta y activos

```
GET  /v1/plantas/:siteId/activos             → el árbol plano, con `ruta` de ancestros
GET  /v1/activos/:id                         → ficha de activo: salud abierta, señales, alertas
GET  /v1/senales/:id/muestras?desde&hasta    → dato crudo, vía fr_measurements()
```

El árbol se devuelve plano y lo monta el panel: mandar un árbol anidado por JSON
obliga a rehacer la petición cada vez que cambia un filtro.

`/muestras` es la puerta controlada al dato crudo. `measurement` no lleva RLS
—TimescaleDB no admite RLS y compresión a la vez— así que el filtro de inquilino
lo aplica la función. Existe porque el producto lo exige: toda cifra es
pinchable hasta el fondo, sin callejones sin salida.

### Ingesta

```
POST /v1/ingesta                             → token de conector; un sobre con medidas y eventos
```

```json
{
  "connector_id": "uuid",
  "batch_id": "uuid",
  "sent_at": "2026-09-09T07:41:22Z",
  "measurements": [{ "signal": "L3.P4.contador", "ts": "…", "value": 14820, "q": 0 }],
  "events": [{ "asset": "L3.P4", "type": "stop", "ts_start": "…", "ts_end": "…", "reason": null }]
}
```

**Idempotente por `batch_id`.** El conector reenvía sin miedo tras un corte; el
duplicado se descarta en el servidor, no en el conector, porque el conector
puede haberse reiniciado y haber perdido la memoria de lo que ya mandó.

La respuesta devuelve `sinMapear`: las señales que llegaron y no están dadas de
alta. Es la alarma de que **la fuente ha cambiado de forma** —alguien añadió una
columna al Excel, el SCADA renombró un tag— y hay que revisar el mapeo antes de
seguir calculando con datos mal alineados.

### Copilot

```
POST /v1/copilot                             → { pregunta, siteId, desde?, hasta? }
```

Seis pasos, y el segundo es de seguridad: el modelo **elige una plantilla del
catálogo**, nunca escribe SQL. El catálogo que ve está ya filtrado por el rol de
quien pregunta — la IA no es una puerta trasera a los permisos.

Lo que no encaja en ninguna plantilla se responde con *«no sé contestar a eso
todavía»* y se registra en `ai_analysis` con `respuesta = null`. **Esa tabla es
el backlog del Copilot, escrito por los propios usuarios.**

### Pendientes de FASE D

```
POST /v1/auth/login · POST /v1/auth/mfa
GET  /v1/produccion/oee · /paradas · /turnos
GET  /v1/energia · /calidad · /proveedores
POST /v1/acciones                             → Operations Agent, con su nivel de autorización
GET  /v1/conocimiento/preguntar               → Factory Brain
GET  /admin/*                                 → superadmin, fuera del inquilino
```

## Webhook saliente

Un sistema del cliente puede recibir nuestras alertas: `alert.created` firmado
con HMAC compartido. Es lo que permite que la alerta entre en su GMAO sin que
tengamos que integrarnos con él.
