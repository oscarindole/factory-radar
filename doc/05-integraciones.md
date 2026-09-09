# 05 · Integraciones

## 1. El principio: nos adaptamos nosotros

La frase que abre la web pública —**"No cambies tu fábrica"**— es una promesa
técnica, no un eslogan. Significa que el coste de adaptación lo pagamos nosotros:
si el cliente lleva ocho años apuntando la producción en un Excel con una
estructura rara, leemos ese Excel con su estructura rara.

Corolario incómodo, y hay que asumirlo: **cada cliente trae entre 2 y 5 días de
trabajo de mapeo que no se automatiza.** Eso no es deuda técnica, es el servicio,
y por eso la implantación se factura aparte (ver `09-comercial.md`). Fingir que
la integración es "de un clic" es la mentira que hunde los pilotos industriales.

---

## 2. Qué se conecta y con qué prioridad

| Sistema | Qué aporta | Cómo se lee | Fase |
|---|---|---|---|
| **Excel / CSV** | Producción, partes, consumos, calidad. Lo único que hay el día 1 | Carpeta vigilada, SFTP o subida al panel | MVP |
| **Historiador / SCADA (SQL)** | Contadores, estados, alarmas, analógicas | Usuario de **solo lectura** sobre su base | MVP |
| **ERP** (SAP B1, Sage, Odoo, Navision, a medida) | Órdenes, productos, costes, compras, proveedores | API si la tiene; si no, vista SQL o exportación programada | MVP |
| **GMAO** (Prisma, Fracttal, Rosmiman, Excel) | Órdenes, preventivo, repuestos, horas | API o exportación | Fase 2 |
| **MES**, si existe | Producción con contexto y causas. La mejor fuente | API o base | Fase 2 |
| **Sensórica IoT** | Lo que no está medido: energía, vibración, temperatura | MQTT | Fase 2 |
| **PLC / OPC UA** | Tiempo real de verdad | OPC UA, suscripción de solo lectura | Fase 2 |
| **Analizadores de red** | Energía por cuadro y por máquina | Modbus TCP o MQTT | Fase 2 |
| **LIMS / calidad** | Ensayos y resultados | API o exportación | Fase 3 |
| **WMS / TMS** | Stock, expediciones, transporte | API | Fase 3 |
| **CRM** | Reclamaciones de cliente ligadas a lote | API | Fase 3 |
| **Correo del proveedor** | Albaranes y facturas en PDF | Buzón dedicado | Fase 4 |
| **PLC directo (Modbus)** | Máquina antigua sin nada encima | Modbus TCP, registros declarados a mano | Fase 3 |

**Modbus el último, a pesar de ser el más fácil de hablar.** Es fácil de leer y
difícil de interpretar: un registro es un número sin nombre ni unidad, y alguien
tiene que declarar a mano qué significa cada uno, máquina a máquina. Coste alto y
poco reutilizable entre clientes.

---

## 3. Cómo se mapea una fuente

Cuatro pasos, siempre los mismos, y los tres primeros los hace la plataforma:

```
1  DESCUBRIR    se lee una muestra y se propone la estructura detectada
2  MAPEAR       cada columna o tag → señal, unidad, activo, contexto
3  VALIDAR      contra dato conocido: "esto dice 1.240 uds, ¿tu parte también?"
4  VIGILAR      si la fuente cambia de forma, salta aviso; no se ingiere basura
```

El paso 3 es el que casi nadie hace y el que evita el desastre clásico: llevar
tres semanas ingiriendo un contador acumulativo tratándolo como incremental.
**Ningún mapeo se da por bueno sin cuadrar contra un dato que el cliente ya
conoce y da por cierto.**

El paso 4 tampoco es opcional. Las fuentes de una fábrica cambian sin avisar:
alguien añade una columna al Excel, el SCADA se actualiza y renombra un tag. Si
el sistema no lo detecta, sigue calculando con datos mal alineados y nadie se
entera hasta que el número es absurdo.

---

## 4. Contrato de ingesta

Toda fuente, venga de donde venga, entrega el mismo sobre:

```json
{
  "connector_id": "uuid",
  "sent_at": "2026-09-09T07:41:22Z",
  "batch_id": "uuid",
  "signature": "sha256...",
  "measurements": [
    { "signal": "L3.P4.contador", "ts": "...", "value": 14820, "q": 0 }
  ],
  "events": [
    { "asset": "L3.P4", "type": "stop", "ts_start": "...",
      "ts_end": "...", "reason": null, "source": "scada" }
  ]
}
```

- **Idempotente por `batch_id`.** El conector puede reenviar sin miedo tras un
  corte; el duplicado se descarta en el servidor, no en el conector.
- **`q` viaja siempre.** La calidad del dato es parte del dato.
- **`reason` puede ser nulo** y no invalida el evento. Es la realidad de la
  planta, no un error de formato.
- **Firmado.** Si no valida la firma, el lote se rechaza entero y se registra.

## 5. API pública

REST sobre HTTPS, autenticación por token de servicio con alcance por planta.
Sirve para tres cosas: que el cliente meta su dato sin conector (`POST
/v1/measurements`), que lo saque para su propio BI (`GET /v1/metrics`) y que un
sistema suyo reciba nuestras alertas (webhook firmado sobre `alert.created`).

Versionada desde el primer día en `/v1/`. Cambiar de forma una respuesta que un
cliente ya consume es una llamada de teléfono desagradable que se evita con un
prefijo de ruta.
