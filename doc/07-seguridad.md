# 07 · Seguridad

## 1. Por qué esto va antes que las funcionalidades

En un proyecto industrial, el responsable de IT no compra: **veta**. Y veta en la
segunda reunión, cuando aparece la palabra "nube" junto a la palabra "PLC". Si la
respuesta a "¿qué puertos hay que abrir?" no es *"ninguno"*, el proyecto muere
ahí, por bueno que sea el producto.

Además, desde la transposición de **NIS2**, buena parte de la industria
manufacturera de cierto tamaño —y toda la que suministra a sectores esenciales—
tiene obligaciones formales de gestión del riesgo de sus proveedores digitales.
Nuestro cliente tendrá que justificarnos ante su propio auditor. La seguridad no
es un coste: es lo que hace que nos puedan comprar.

---

## 2. La frontera OT/IT

**La regla, en una frase: el dato sube y nunca baja.**

```
   RED OT (planta)          │        DMZ            │       CLOUD
                            │                       │
   PLC · SCADA · sensores   │  EDGE CONNECTOR       │   INGESTA
                            │                       │
   ── lectura ─────────────►│                       │
                            │  ── TLS mutuo ───────►│   443 saliente
                            │                       │
   ◄── NADA ────────────────│◄── NADA ──────────────│
```

Lo que esto obliga en el diseño:

1. **El conector vive en la DMZ industrial**, no en la red OT plana, y **nunca**
   con doble tarjeta hacia OT y hacia internet a la vez sin cortafuegos entre
   medias. Si el cliente no tiene DMZ, forma parte del alcance de la implantación
   crear una: es una hora de trabajo en el cortafuegos y cambia la conversación
   con IT por completo.
2. **Cero puertos entrantes.** El conector inicia siempre él la conexión. No hay
   VPN entrante, ni túnel inverso permanente, ni escritorio remoto para
   soportarlo. El mantenimiento remoto se hace con una sesión que **abre el
   cliente**, con caducidad.
3. **Cuentas de solo lectura** en todo lo que se lee: SQL, OPC UA, API. Se pide
   así por escrito y se comprueba.
4. **El conector no tiene código de escritura.** Auditable en el repositorio.
5. **Se cae hacia el lado seguro.** Ante la duda, deja de leer; nunca reintenta
   de forma agresiva contra un equipo de planta, porque saturar un PLC antiguo
   con peticiones puede afectar al ciclo de scan. Cadencia de lectura conservadora
   y configurable a la baja.

---

## 3. Aislamiento multiinquilino

Tres barreras, porque la primera se olvida algún día:

| Barrera | Qué hace |
|---|---|
| **1 · RLS de Postgres** | Cada sesión fija su `tenant_id`. La base no devuelve filas de otro inquilino aunque la consulta esté mal escrita |
| **2 · Alcance en la aplicación** | Toda consulta pasa por un repositorio que exige contexto de inquilino. Sin él, no compila |
| **3 · Pruebas automáticas** | Batería de fugas en CI: cada endpoint se prueba con el token del inquilino A pidiendo un identificador del B. Debe devolver 404, nunca 403 — un 403 confirma que el recurso existe |

El almacenamiento de documentos va por prefijo de inquilino con URLs firmadas y
caducas. Los embeddings llevan `tenant_id` y **se filtra antes de la búsqueda
vectorial, no después**: filtrar después es una fuga esperando su turno.

**Enterprise puede exigir base dedicada.** Está previsto en el modelo de
despliegue, y se cobra.

---

## 4. Identidad, accesos y trazabilidad

- **MFA obligatorio** para `company_admin` y `superadmin`. Recomendado para el
  resto; exigible por política del cliente.
- **SSO (SAML / OIDC)** en el plan Enterprise. Es requisito de compra habitual a
  partir de cierto tamaño.
- **RBAC con ocho roles** (ver `04-pantallas.md`), con permisos por planta: un
  jefe de línea de Torrelavega no ve Reinosa.
- **Auditoría inmutable**: acceso, cambio de configuración, cambio de umbral,
  acción ejecutada, reidentificación de un operario, consulta al Copilot. Con
  quién, cuándo, desde dónde y sobre qué. En tabla append-only.
- **Cuentas de taller.** Realidad de planta: en el turno de noche hay un PC
  compartido. En vez de fingir que no pasa, se ofrece un modo quiosco de solo
  lectura sin datos de coste ni de personal, y las acciones exigen identificarse.

## 5. Cifrado, secretos y respaldo

Todo cifrado en tránsito (TLS 1.3, mTLS para el conector) y en reposo (disco
cifrado, y cifrado por columna en lo sensible: credenciales de fuentes de datos y
reidentificación de operarios). Los secretos nunca en el código ni en variables
de entorno del contenedor de aplicación: gestor de secretos, con rotación
trimestral y rotación inmediata ante sospecha.

Respaldo diario cifrado con **restauración probada mensualmente**. Un respaldo que
no se ha restaurado nunca no es un respaldo. Objetivos: RPO 24 h, RTO 4 h para el
panel; la ingesta aguanta sola 7 días gracias al buffer del conector, que es
justamente para lo que está.

---

## 6. Marcos normativos: qué se hace ahora y qué después

| Marco | Qué exige de nosotros | Cuándo |
|---|---|---|
| **RGPD / LOPDGDD** | Encargado del tratamiento, seudonimización de operarios, retención, derechos | **Desde el día 1.** No es opcional ni aplazable |
| **NIS2** | Nuestro cliente debe poder evaluarnos como proveedor: inventario, gestión de vulnerabilidades, notificación de incidentes | **Preparado desde el MVP**, formalizado antes del cliente 5 |
| **IEC 62443** | Segmentación, zonas y conductos, componente seguro por diseño | **Arquitectura conforme desde el día 1.** Certificación de componente (62443-4-2) cuando la pida un cliente y la pague |
| **ISO 27001** | SGSI, políticas, riesgos, auditoría | **Prácticas desde el principio**, certificación en el mes 12–18 |
| **CSRD / huella** | Que el dato energético sea auditable y trazable | Es una funcionalidad vendible de Energy Radar |

**La decisión.** Se diseña conforme desde el principio, porque reformar
arquitectura para certificar cuesta diez veces más que hacerla bien. Pero **no se
certifica antes de tener clientes**: una ISO 27001 sin producto vendido son
30.000 € y seis meses gastados en el orden equivocado. Se certifica cuando el
primer cliente grande lo ponga como condición — y para entonces ya lo paga él.

**Lo que sí se hace desde el mes 1** porque es barato y se pide siempre: política
de seguridad escrita, inventario de activos y proveedores, gestión de
vulnerabilidades de dependencias en CI, plan de respuesta a incidentes con
teléfonos, y un documento de dos páginas de arquitectura de seguridad para
entregar a IT en la segunda reunión. Ese documento cierra más ventas que
cualquier funcionalidad.
