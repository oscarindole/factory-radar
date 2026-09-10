# 10 · Registro de decisiones

Las decisiones de la FASE A que no eran obvias, con la alternativa que se
descartó. Sirve para no volver a discutirlas y para que quien entre nuevo entienda
el porqué antes de proponer el cambio.

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 1 | La plataforma es RACTORY; el módulo 1 pasa a **PRODUCTION RADAR** | Que ambos se llamaran igual | Colisiona en el menú lateral. Se ve en cuanto se dibuja la pantalla |
| 2 | **Una sola Postgres** con TimescaleDB y pgvector | Postgres + InfluxDB + Pinecone | Tres sistemas que respaldar, asegurar y pagar para un volumen que Timescale aguanta de sobra |
| 3 | **Monolito modular**, sin Kubernetes | Microservicios desde el principio | Resuelve una escala que no tenemos y añade superficie que auditar. Los módulos ya están separados por dominio |
| 4 | **RLS de Postgres** para el aislamiento | Solo `WHERE tenant_id` en el código | Un `WHERE` olvidado es una fuga entre competidores del mismo sector |
| 5 | **Árbol de activos**, no cinco niveles fijos | `Planta → Área → Línea → Máquina` | Ninguna fábrica encaja. Se rompe en el tercer cliente y obliga a migrar |
| 6 | **CSV y SQL antes que OPC UA** | Empezar por el protocolo "correcto" | OPC UA son de 2 a 6 semanas de trámite. CSV da dato real en 3 días y valor que enseñar |
| 7 | El **LLM explica, no detecta** | Pasarle series temporales al modelo | Caro, lento y alucina con números. Las capas 1 y 2 detectan sobre el dato |
| 8 | **Consultas parametrizadas** en el Copilot, nunca SQL libre | Texto a SQL | Inyección, fuga entre inquilinos y consultas que tumban la base |
| 9 | **Línea base por contexto** (señal × producto × turno) | Línea base global por señal | Una global dispara falsos positivos en cada cambio de formato |
| 10 | **Tope de 5 alertas críticas** por planta y semana | Alertar de todo lo detectado | Una bandeja con 40 críticas es una bandeja cerrada |
| 11 | **Ningún score sin su fórmula abierta** | Mostrar el número y ya | Un número indefendible destruye la confianza en toda la plataforma |
| 12 | **Solo lectura, cero puertos entrantes** | VPN o túnel para mantenimiento cómodo | IT veta el proyecto en la segunda reunión. Es la decisión que permite vender |
| 13 | **Operarios seudonimizados** por defecto | Rendimiento con nombre y apellidos | Tratamiento de datos personales en contexto laboral. Riesgo legal y sindical real |
| 14 | **El hueco de dato se pinta como hueco** | Interpolar para que el gráfico quede bonito | Un dato inventado en industria es un diagnóstico equivocado |
| 15 | **Implantación y suscripción separadas** | Todo en la cuota mensual | Obliga a compromiso de 24 meses que no se firma en la primera compra |
| 16 | **Piloto pagado**, no gratuito | Piloto gratis para entrar | El piloto gratis no lo mira nadie. Cobrarlo filtra y compromete |
| 17 | **Factory Brain en fase 2**, pese a ser el que más impresiona | Meterlo en el MVP para la demo | Una respuesta inventada sobre un procedimiento de seguridad quema la confianza para siempre |
| 18 | **Predictivo por vibración fuera del MVP** | Prometer predictivo desde el día 1 | Exige sensórica, muestreo alto y fallos etiquetados. La deriva da el 70% del valor sin nada de eso |
| 19 | **Nunca se escribe en OT.** Ni ahora ni después | Dejar la puerta abierta "para más adelante" | Otro producto, otra certificación y otro seguro. Decirlo pronto tranquiliza a IT |
| 20 | **Cabeza de playa geográfica y sectorial** | Producto horizontal para toda la industria | Un producto industrial horizontal no convence a nadie en la primera reunión |
| 21 | **Conforme desde el día 1, certificado cuando lo pidan** | Certificar ISO 27001 antes de vender | 30.000 € y seis meses gastados en el orden equivocado |
| 22 | **Feedback de alerta en el esquema**, no en el backlog | Añadirlo cuando haya quejas | Sin él no bajan los falsos positivos, y son la causa nº 1 de abandono |

---

## Decisiones de la FASE B

Salieron de construir de verdad, no de diseñar. La 23 es de las que solo
aparecen cuando el esquema se ejecuta contra el motor real.

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 23 | **`measurement` va comprimida y SIN RLS; `measurement_rollup` va con RLS y sin comprimir** | Aplicar la decisión 04 también a la tabla cruda | **TimescaleDB no admite las dos cosas a la vez.** Comprobado en las dos direcciones (ver abajo). El volumen está en la cruda —unos 39 GB por planta y 90 días sin comprimir, unos 4 con compresión— y las lecturas están en el rollup. El aislamiento del dato crudo no se pierde: se mueve a `fr_measurements()`, y `fr_app` no tiene ningún permiso sobre la tabla |
| 24 | **Las políticas RLS se aplican en bucle sobre las tablas con `tenant_id`** | Escribirlas a mano, tabla por tabla | El fallo real de este patrón nunca es una política mal escrita: es una tabla nueva a la que se olvidaron de ponérsela |
| 25 | **`FORCE ROW LEVEL SECURITY` en todas** | Solo `ENABLE` | Sin `FORCE`, el propietario de la tabla salta las políticas. Algún script de mantenimiento acabará conectándose como propietario, y el aislamiento desaparecería en silencio |
| 26 | **Dos conexiones distintas: `fr_app` y la de trabajos** | Una sola cadena de conexión | La API no debe poder llamar a `fr_rollup()`, que es `SECURITY DEFINER` y lee todos los inquilinos. Separarlas es lo que evita que una inyección en la API alcance el dato crudo de todas las fábricas |
| 27 | **El rendimiento se acota a 1 y se avisa** | Dejar salir un 118% | Un OEE del 112% en pantalla destruye la credibilidad de la herramienta entera en la primera reunión. No es que la máquina supere su física: es que el ciclo nominal está mal dado de alta |
| 28 | **El umbral de microparada se deriva del ciclo, no es fijo** | Un umbral de 30 s para todo | En una línea de 4 s de ciclo, 30 s son siete piezas perdidas; en una de 90 s, es un ciclo que aún no ha terminado. Un umbral fijo inunda de falsos positivos las líneas lentas |
| 29 | **Toda ruta con `:siteId` resuelve la planta dentro del inquilino, no solo comprueba el alcance** | Fiarse de `alcanzaSite()` | Lo encontró una prueba, no una revisión. Con `sites: []` —el caso normal, «todas las plantas de mi empresa»— `alcanzaSite()` decía que sí a cualquier UUID. No había fuga, porque la RLS devolvía cero filas, pero el endpoint contestaba **200 con todo a `null`** para la planta de otra empresa: distinguía por código de respuesta lo que no debe distinguirse, y un 200 vacío se confunde con «esta planta no ha producido hoy» |

### El hallazgo del RLS, con la comprobación

No se dedujo del manual: se ejecutó.

```
alter table measurement enable row level security;
  ERROR: operation not supported on hypertables that have columnstore enabled

-- y al revés, con RLS ya activo:
alter table t set (timescaledb.compress, ...);
  ERROR: columnstore cannot be used on table with row security
```

Son mutuamente excluyentes. Es exactamente el tipo de restricción que no aparece
en una fase de diseño y que, descubierta seis meses después con datos de tres
clientes dentro, obliga a una migración de la tabla más grande del sistema.

**El aislamiento sigue probado**: `db/pruebas/fugas.sql` son once pruebas que
corren como `fr_app` —no como superusuario, que saltaría RLS— y comprueban entre
otras cosas que la tabla cruda no es legible por la API y que
`fr_measurements()` devuelve cero filas para una señal ajena.


### Por qué las pruebas están escritas así

Las once de `db/pruebas/fugas.sql` y las once de `tests/api.test.ts` comprueban
**el efecto, no la respuesta**. No preguntan si la función devolvió lo que dice
su firma: plantan dos empresas rivales y comprueban que una no alcanza a la
otra, ni por listado, ni por id, ni por escritura, ni por el hueco entre el
código de respuesta y los datos.

La decisión 29 salió de ahí. Una revisión de código no la habría visto: el
código *parecía* correcto, y de hecho no filtraba ni un dato.


---

## Decisiones de la FASE C

Todas salieron de que la DEMO FACTORY no funcionaba. Los cuatro problemas
plantados no estaban marcados en la base: si el motor no los encontraba solo,
el motor estaba mal. Las tres primeras son defectos de producto que ninguna
revisión de código habría visto.

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 30 | **Las microparadas son pérdida de RENDIMIENTO, no de disponibilidad** | Restarlas del tiempo de marcha | Es la imputación correcta en las seis grandes pérdidas del OEE: la máquina figura en marcha y produce menos. Restándolas, el rendimiento salía intacto y **la Estación P4, con 92 microparadas al día, era invisible** — el síntoma más caro de la planta, indetectable por un error de imputación |
| 31 | **Línea base genérica (nodo × turno) cuando el producto es demasiado nuevo** | Exigir siempre línea base del producto | Un formato estrenado hace seis días no tiene línea base propia, así que **una caída justo después de un cambio de formato era indetectable** — y el cambio de formato es la causa más frecuente de una caída. Se puede comparar entre productos porque el rendimiento ya va normalizado al ciclo nominal; se usa solo como respaldo, bajando la confianza y diciéndolo en la alerta |
| 32 | **La línea se mide en su cuello de botella** | Promediar sus máquinas | Una línea para cuando para cualquiera de sus estaciones. Promediar da un número optimista que no se parece a lo que sale por el final. Sin esto, además, **las líneas no tenían ninguna métrica** y la pantalla de estado salía vacía: el cálculo solo cubre nodos con contador, y los contadores están en las máquinas |
| 33 | **Si una línea y su máquina avisan de lo mismo, se queda la máquina** | Emitir las dos | Son el mismo problema: una lo nombra y la otra no. La que sirve es la que dice dónde poner el destornillador |
| 34 | **Un problema atado a un lote NO se anualiza** | Multiplicar por 365/ventana | Daba 686.000 €/año por tres semanas de un lote. Una cifra absurda destruye la credibilidad más rápido que no dar cifra. Se informa el coste ya incurrido, y por diseño **eso no puede llegar a crítica**: lo que interrumpe al director de planta es lo que sigue sangrando |
| 35 | **Mínimo de turnos también en la ventana de evaluación** | Exigir muestras solo en la línea base | Un único turno malo generaba una crítica de 180.000 €/año |
| 36 | **La ventana de correlación es más larga que el problema** | Ajustarla al periodo del lote sospechoso | Con la ventana ajustada, el lote sale al 100% de los rechazos… porque es el único lote dentro. Un 100% no es una correlación, es un artefacto, y el responsable de calidad lo huele enseguida. Con 45 días y cuatro lotes, sale 67% y ya significa algo |
| 37 | **La economía de la demo tiene que ser plausible, no solo coherente** | Números redondos elegidos por comodidad | Un envase de 4,2 s de ciclo con 7,18 € de margen implica 38 M€ en una sola línea, para una planta que factura entre 10 y 80. La alerta salía a 2.095.337 €/año y un director de planta la descarta de un vistazo — y con ella, la herramienta |
| 38 | **`09-rls.sql` tenía que ser idempotente y no lo era** | Confiar en que «los ficheros son idempotentes» | Un `create policy` sin su `drop policy if exists` rompía la segunda migración, y las políticas de las tablas posteriores se quedaban sin aplicar **sin que nada lo dijera**. La prueba de idempotencia es lanzar la migración dos veces seguidas, y ahora se hace |

### Dos lecciones de método

**No mandar la salida a `/dev/null` mientras se verifica.** El motor estuvo dos
ejecuciones fallando por un error de sintaxis y los números que se estaban
revisando eran los de la pasada anterior. Un fallo silencioso en el paso de
verificación es peor que no verificar, porque produce confianza injustificada.

**Un comentario SQL con acentos graves dentro de una plantilla de JavaScript la
cierra antes de tiempo.** El error que da Node —`Expected ',', got 'ident'`— no
señala la línea. Se localizó troceando el fichero por funciones y parseando cada
trozo por separado.


---

## Decisiones de las invitaciones

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 39 | **El rol se fija al invitar, no al aceptar** | Que quien acepta elija o negocie su rol | Es la diferencia entre «te doy acceso a esto» y «entra y ya veremos». `rol` en el cuerpo del canje se ignora |
| 40 | **Tres días de vigencia, impuestos por la base** | Calcular la caducidad en la aplicación | Calculada en el código, los milisegundos hasta el `insert` la dejaban por encima de `creada_en + 3 días` y saltaba el CHECK. Ahora la calcula `now() + interval '3 days'` en la propia sentencia |
| 41 | **El canje entra por dos funciones `SECURITY DEFINER`** | Dar a la API permiso para saltarse la RLS en esa ruta | Huevo y gallina: la RLS esconde la invitación hasta fijar el inquilino, y el inquilino no se sabe hasta leerla. La salida no es debilitar el aislamiento, es acotar la entrada — se entra por el hash de un token de 256 bits y no se puede pedir nada más |
| 42 | **Nadie invita de igual a igual** | Permitir invitar al mismo rango | De igual a igual se construye una cadena por la que un rol se multiplica sin que nadie lo haya autorizado. Solo `company_admin` puede invitar a otro `company_admin`, porque alguien tiene que poder dar continuidad a la cuenta |
| 43 | **Las columnas de salida de un `RETURNS TABLE` no se llaman como una columna real** | `returns table (ok, rol, tenant_id, motivo)` | En PL/pgSQL cada columna de salida es también una variable: `tenant_id` hacía ambiguo el `on conflict (tenant_id, user_id)` y la función fallaba en ejecución. El error no dice que la causa sea el nombre de la salida |

---

## Decisiones del sistema visual

| # | Decisión | Alternativa descartada | Por qué |
|---|---|---|---|
| 44 | **Una referencia visual se lee en su CSS, no en un resumen** | Pedir a un resumidor que describa la página | El resumen dijo tres veces «fondo blanco» y la web es casi negra (`--background: oklch(13% 0 0)`), y se inventó un acento teal a partir del nombre de una variable que era azul. Cuatro pasadas de diseño construidas sobre datos falsos. Se descarga la hoja de estilo y se leen los valores |
| 45 | **En Tailwind v4, el CSS compilado dice qué se usa de verdad** | Fiarse de las variables que declara el tema | El tema declara toda la escala; el compilador solo emite las utilidades presentes en el código. Que existan `.font-extralight` y `.text-7xl`, y que no exista ningún `.max-w-6xl`, es prueba de uso, no de intención |
| 46 | **El sistema se invierte manteniendo los saltos, no los colores** | Aclarar cada color uno a uno | Su escala oscura va 13 → 18 → 26 → 70 → 100 de luminosidad. Sobre blanco se recorre al revés: 100 → 97 → 91 → 45 → 20. Lo que hace reconocible un sistema es la distancia entre sus superficies, no el valor absoluto de cada una |
| 47 | **El acento sigue siendo el rosa de la marca** | Adoptar también su verde | El color de marca es identidad, y el encargo dice extraer el sistema, no la identidad. Además su verde da 2,4:1 sobre blanco: como texto es ilegible |
| 48 | **Los grises no llevan tono** | Conservar los nuestros, que tiraban a verde | Los suyos tienen croma 0. Un gris sesgado le da temperatura a la página entera, y esa temperatura no la había elegido nadie |
| 49 | **El panel oscuro usa sus valores dark tal cual** | Inventarle una paleta oscura propia | La referencia es oscura: para el panel no hay que invertir nada. Al bajar el fondo de `#0E1116` a `#070707` hubo que revalidar las series de las gráficas contra la superficie nueva —pasan las cinco comprobaciones— y subir `--texto-3` a `#7D7D7D`, porque a `#7A7A7A` se quedaba en 4,36:1 sobre la tarjeta |
