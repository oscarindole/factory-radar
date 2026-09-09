# FACTORY RADAR

**Tu fábrica ya genera los datos. Nosotros te decimos qué significan.**

Una capa de inteligencia que se conecta a los sistemas que la fábrica ya tiene
—ERP, MES, SCADA, PLC, sensores, bases de datos, Excel— y convierte el dato
disperso en una lista corta de cosas que hacer hoy, ordenadas por euros.

No es otro cuadro de mando. Un cuadro de mando te da 50 gráficas y te deja el
trabajo de interpretar. FACTORY RADAR te da cinco líneas y el dinero que hay
detrás de cada una.

---

## Qué se ha decidido y qué no

Este repositorio contiene, ahora mismo, la **FASE A: la definición del
producto**. No hay código de aplicación todavía, y es deliberado: en software
industrial, el 80% de los proyectos que fracasan lo hacen por un modelo de datos
y un alcance mal decididos, no por el framework.

| Fase | Qué es | Estado |
|---|---|---|
| **A** | Producto, arquitectura, modelo de datos, pantallas, MVP, comercial | **hecha** — `doc/` |
| **B** | Estructura real: esquema SQL, dominio, API, conector, panel | **hecha** — `db/` `src/` `edge/` `panel/` |
| **C** | DEMO FACTORY navegable y convincente | **hecha** — `scripts/demo-*.mjs`, `doc/demo.html` |
| **D** | MVP funcional sobre datos reales | pendiente |
| **E** | Primer piloto industrial (6 semanas) | pendiente |

---

## Cómo se lee esta carpeta

Por orden. Cada documento depende del anterior.

| | |
|---|---|
| [`doc/00-producto.md`](doc/00-producto.md) | Qué vendemos, a quién, contra quién, y por qué nos comprarían |
| [`doc/01-modulos.md`](doc/01-modulos.md) | Los ocho módulos, cada uno con su problema, su dinero y su usuario |
| [`doc/02-arquitectura.md`](doc/02-arquitectura.md) | Arquitectura funcional y técnica, stack, Edge Connector |
| [`doc/03-modelo-datos.md`](doc/03-modelo-datos.md) | Entidades, relaciones y las decisiones que las explican |
| [`doc/04-pantallas.md`](doc/04-pantallas.md) | Sitemap, flujos, wireframes, sistema visual |
| [`doc/05-integraciones.md`](doc/05-integraciones.md) | La escalera de ingesta: de Excel a OPC UA |
| [`doc/06-inteligencia.md`](doc/06-inteligencia.md) | Motor de eventos, scoring, Copilot, Factory Brain, RAG |
| [`doc/07-seguridad.md`](doc/07-seguridad.md) | Segmentación OT/IT, multitenant, IEC 62443 / ISO 27001 / NIS2 |
| [`doc/08-mvp-roadmap.md`](doc/08-mvp-roadmap.md) | MVP, priorización, backlog, roadmap 0–24 meses |
| [`doc/09-comercial.md`](doc/09-comercial.md) | Precio, web pública, metodología de piloto, KPIs |
| [`doc/10-decisiones.md`](doc/10-decisiones.md) | Registro de decisiones: qué se eligió, contra qué, y por qué |
| [`doc/11-api.md`](doc/11-api.md) | Contrato de la API: endpoints, autenticación, ingesta |
| [`doc/12-demo.md`](doc/12-demo.md) | La DEMO FACTORY: qué simula, qué problemas planta y cómo se regenera |
| [`web/index.html`](web/index.html) | La web comercial, con las cifras reales de la demo |

---

## La regla que manda sobre todas

Ninguna funcionalidad entra en el backlog sin responder a las cuatro preguntas:

1. **¿Qué problema industrial resuelve?**
2. **¿Cuánto dinero o tiempo ahorra?**
3. **¿Quién la utiliza?** (con nombre de cargo, no "el usuario")
4. **¿Qué decisión facilita?**

Si una funcionalidad no contesta a las cuatro, no se construye. Queda escrita en
[`doc/08-mvp-roadmap.md`](doc/08-mvp-roadmap.md), en la sección de descartes, con
el motivo. Los descartes también son producto.


---

## Cómo se levanta

```bash
cp .env.example .env          # y rellenar DATABASE_URL y DATABASE_URL_JOBS
npm install
npm run migrar                # aplica db/*.sql en orden; es idempotente
npm test                      # 17 pruebas de dominio, sin base
npm run api
```

Hace falta **PostgreSQL 16 con TimescaleDB y pgvector**. En local:

```bash
docker run -d --name fr -e POSTGRES_PASSWORD=fr -e POSTGRES_DB=factory_radar \
  -p 5432:5432 timescale/timescaledb-ha:pg16
```

### La batería de fugas

Es la barrera 3 del aislamiento multiempresa y corre **como `fr_app`**, no como
superusuario: ejecutarla como superusuario no prueba nada, porque el
superusuario salta RLS.

```bash
psql -U postgres -d factory_radar -f db/pruebas/semilla-fugas.sql
psql -U fr_app   -d factory_radar -f db/pruebas/fugas.sql
```

Planta dos empresas rivales y comprueba que no se ven entre ellas: por listado,
por id directo, por escritura cruzada, sin contexto de inquilino, y a través de
la puerta al dato crudo. **Once pruebas. Si alguna falla, no se despliega.**
