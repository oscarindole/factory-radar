# 09 · Comercial

## 1. Precio

Dos conceptos separados, y separarlos es lo que hace vendible el producto:
**implantación** (proyecto, se factura una vez) y **suscripción** (mensual).

Meterlo todo en la cuota mensual obliga a un compromiso de 24 meses que un
director de planta no firma en la primera compra. Cobrar la implantación aparte
permite empezar con un piloto pequeño, y además cubre los 2–5 días reales de
mapeo que cada cliente trae.

### Planes

| | **STARTER** | **PRO** | **ENTERPRISE** |
|---|---|---|---|
| Plantas | 1 | 1 | multi-planta |
| Activos | hasta 20 | hasta 100 | sin límite |
| Módulos | Production | + Maintenance, Energy | todos |
| Ingesta | CSV, Excel, API | + SQL, MQTT, OPC UA | + integración a medida |
| IA | Copilot básico | Copilot + diagnósticos | + Factory Brain, modelo propio |
| Usuarios | 5 | 20 | sin límite |
| Alertas | panel, correo | + Teams, Slack, WhatsApp | + webhook y escalado |
| SSO / SLA | — | — | SAML/OIDC · SLA 99,5% |
| Edge Connector | — | 1 | los que hagan falta |
| **Mensual** | **390 €** | **890 €** | **desde 2.400 €** |
| **Implantación** | **2.500 €** | **6.500 €** | **desde 15.000 €** |

**Cómo se defiende el precio.** No por funcionalidades: por retorno. Un PRO
cuesta 17.180 € el primer año. Una sola parada no planificada evitada en una
línea principal ronda los 10.000 €. **Si en el piloto no aparecen 30.000 € de
mejora identificada, el producto no vale para esa planta y hay que decírselo.**

**Añadidos que se facturan aparte:** planta adicional (+60% del plan), sensórica
instalada (proyecto), formación en planta, informes a medida, y consumo de IA por
encima del incluido —con el aviso al 80%, nunca una factura sorpresa.

### PILOTO — el producto de entrada

```
DIAGNÓSTICO DE PLANTA · 6 semanas · 4.900 €
Una línea. Auditoría de datos, conexión, panel, alertas y IA.
Entregable: informe de oportunidades cuantificadas en euros.
Si se contrata la plataforma, los 4.900 € se descuentan de la implantación.
```

Es el mejor instrumento comercial que tiene este producto. Convierte una decisión
de 17.000 € y 12 meses en una de 4.900 € y 6 semanas, que un director de planta
puede aprobar solo. Y cobrarlo filtra al curioso: un piloto gratis no lo mira
nadie.

---

## 2. Metodología del piloto

| Semana | Qué se hace | Entregable |
|---|---|---|
| **1** | **Auditoría de datos.** Qué hay, qué falta, qué calidad tiene | Mapa de fuentes y su nivel en la escalera de ingesta |
| **2** | **Conexión.** Conector, mapeo, validación contra dato conocido | Dato real entrando y cuadrado |
| **3** | **Contexto y panel.** Jerarquía, turnos, productos, ciclos, márgenes | Panel con la producción real de la línea |
| **4** | **Alertas.** Línea base aprendida, umbrales, destinatarios | Primeras alertas con impacto en euros |
| **5** | **IA y ajuste.** Copilot, calibración con el feedback de la semana 4 | Copilot contestando sobre sus datos |
| **6** | **Impacto.** Cuantificación y presentación a dirección | **Informe de oportunidades en euros** |

**La semana 1 es la más importante y la que más sorprende al cliente.** Casi
siempre descubre que su MES no registra causas de parada, o que el contador de
una máquina lleva meses mal. Ese hallazgo, por sí solo, ya justifica el piloto — y
conviene decírselo de antemano para que sea una victoria y no una decepción.

**La semana 6 se presenta a dirección, no al departamento.** Quien firma la
suscripción es quien ve el informe.

### KPIs del piloto

| KPI | Objetivo a 6 semanas |
|---|---|
| Cobertura de dato | ≥ 80% del tiempo productivo de la línea |
| Causas de parada registradas | del ~15% inicial al ≥ 50% |
| Alertas útiles | ≥ 70% marcadas como útiles |
| Oportunidades cuantificadas | ≥ 30.000 €/año identificados |
| Tiempo de análisis semanal | de 4 h a menos de 1 h |
| Uso | ≥ 3 usuarios entran ≥ 3 días por semana |

Los dos últimos son los que predicen la renovación. Los cuatro primeros son los
que la justifican en la reunión.

---

## 3. Web comercial

### Hero

```
        TU FÁBRICA YA GENERA LOS DATOS.
        NOSOTROS TE DECIMOS QUÉ SIGNIFICAN.

  RADACTORY conecta producción, mantenimiento, energía y calidad
  para detectar pérdidas, anomalías y riesgos antes de que se
  conviertan en problemas.

     [ SOLICITAR ANÁLISIS DE PLANTA ]    [ VER CÓMO FUNCIONA ]
```

### Secciones, en orden

**1 · ¿QUÉ NECESITAS SABER HOY?**
Alertas reales, con su euro. Sin explicar nada todavía: se enseña el producto
funcionando. Es la sección que hace bajar el dedo a la rueda del ratón.

**2 · NO CAMBIES TU FÁBRICA**
Los logos de lo que conectamos: ERP, MES, SCADA, PLC, sensores, bases de datos,
Excel. Va la segunda, no la sexta, porque es la primera objeción real de todo el
que entra.

**3 · DE DATOS A DECISIONES**
`Datos → Contexto → Alerta → Explicación → Acción`. La cadena, con un ejemplo
recorriéndola entera.

**4 · LOS RADARES**
Producción · Mantenimiento · Energía · Calidad · Proveedores · Conocimiento.
Cada uno con su pregunta de negocio, no con su lista de funcionalidades.

**5 · INDUSTRIAL AI COPILOT**

```
  Tú:  ¿Por qué ha bajado la producción?

  FR:  El 74% de la caída corresponde a microparadas
       de la Línea 2 entre las 06:00 y las 09:00.
       Fuentes: contador L2-P3, eventos 2–8 sep →
```

**6 · ROI**
Menos paradas · menos scrap · menos consumo · menos tiempo analizando · más
producción. Con cifras de rango honestas, no con un "hasta un 40%".

**7 · SEGURIDAD**
*"Ningún puerto abierto. Solo lectura. El dato sube, nunca baja."* Sección corta
y técnica, pensada para que el director se la reenvíe a IT. Convierte más de lo
que parece.

**8 · CÓMO EMPEZAMOS**
El piloto de 6 semanas, con su precio a la vista. El precio visible filtra y
acelera.

**9 · CTA final** + demo pública sin registro.

### Construida

Vive en [`web/index.html`](../web/index.html). Diez secciones en el orden de arriba, con
**las cifras reales de la DEMO FACTORY**, no ilustrativas: los 129.218 €/año de la Estación
P4, el 67% de rechazos del lote de ZETA y los 14.662 €/año del compresor salen del motor,
no de un folleto. Si un cliente pide la cuenta, se le puede abrir.

La decisión visual: **hormigón y ámbar de señalización**, con el producto apareciendo dentro
en oscuro. Esa tensión es el argumento — no cambiamos la fábrica, ponemos una capa encima.
Nada de fondo blanco con degradado azul, que es lo que hace que estas páginas se confundan
entre sí.

### Lo que NO va en la web

Nada de "transformamos la industria con IA", ni "Industria 4.0", ni "revolución
digital". Un director de planta lleva diez años oyendo eso y su efecto medible ya
es negativo. Tampoco fotos de archivo de robots azules brillantes: la planta de
nuestro cliente no se parece a eso y lo nota.

**El tono es el del producto:** frases cortas, cifras concretas, cero adjetivos.
Se habla de paradas, de scrap, de kilovatios y de euros.

---

## 4. Cómo se llega al cliente

Por orden de eficacia esperada para este perfil:

1. **Visita directa en un radio de 150 km.** Es industria: se cierra pisando la
   planta. La demo con la fábrica ficticia funciona en un portátil sobre una mesa
   de reuniones.
2. **Asociaciones y clústeres sectoriales.** En Cantabria y País Vasco tienen
   peso real y organizan jornadas donde está exactamente nuestro comprador.
3. **Integradores e ingenierías locales** como canal: llevan años entrando en
   estas plantas y venden horas. Les damos producto y margen recurrente.
4. **Contenido técnico corto y honesto**, del tipo *"cómo calcular tu OEE real
   cuando no registras causas de parada"*. Marketing industrial que sirve de algo
   se comparte entre responsables de planta.
5. **Ayudas públicas.** Kit Digital, Kit Consulting y los programas autonómicos de
   digitalización industrial cubren buena parte de la implantación. **Saber
   tramitarlo es en sí mismo un argumento de venta** y conviene tenerlo resuelto
   antes de la primera reunión.
