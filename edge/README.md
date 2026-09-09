# RADACTORY EDGE

Se instala dentro de la red del cliente, en la **DMZ industrial** — nunca en la
red OT plana, y nunca con doble tarjeta hacia OT e internet a la vez sin
cortafuegos entre medias.

## Las seis reglas que definen este componente

1. **Solo lectura.** No hay código capaz de escribir en un PLC. No es una opción
   desactivada: no está implementado, y este repositorio se puede enseñar en la
   reunión con IT. Es la frase que desbloquea el proyecto.
2. **Solo salida.** Abre él la conexión, TLS mutuo por el 443 contra
   `ingest.<dominio>`. **No escucha en ningún puerto.** El cortafuegos del
   cliente no necesita ninguna regla de entrada.
3. **Aguanta sin línea.** Buffer local de 7 días en SQLite. Al volver reenvía en
   orden, sin duplicar y sin perder.
4. **No decide nada.** Lee, normaliza, comprime, firma y envía. Toda la lógica
   está en el cloud: cambiar el algoritmo no obliga a tocar la planta.
5. **Se ve desde dentro.** Estado, latencia y última lectura por señal, visibles
   en el panel del cliente y en el de superadmin.
6. **Se cae hacia el lado seguro.** Si no puede leer, marca hueco de dato. Nunca
   interpola en silencio, y **nunca reintenta de forma agresiva**: saturar un
   PLC antiguo con peticiones puede afectar a su ciclo de scan.

## Fuentes, por orden de implantación

| Fase | Fuente | Estado |
|---|---|---|
| MVP | `sql` — consulta de solo lectura al historiador o al ERP | esqueleto |
| MVP | `csv` — carpeta vigilada, SFTP o subida | esqueleto |
| MVP | `rest` — API del ERP, GMAO o equipos | esqueleto |
| Fase 2 | `mqtt` — sensórica IoT | pendiente |
| Fase 2 | `opcua` — el estándar del SCADA moderno | pendiente |
| Fase 3 | `modbus` — máquina antigua sin nada encima | pendiente |

**OPC UA no está en el MVP aunque sea «lo correcto»**: exige certificados,
permisos, un espacio de nombres que alguien tiene que mapear y a menudo una
licencia del fabricante del SCADA — entre dos y seis semanas de coordinación.
SQL y CSV dan dato real en tres días y permiten enseñar valor mientras se
tramita. Es una decisión comercial disfrazada de técnica, y es a propósito.

## Despliegue

Mini PC industrial o VM del cliente. Docker o binario empaquetado. Configuración
en `edge.yaml`; el token de ingesta se entrega aparte y **no se escribe en el
fichero de configuración**.

```yaml
conector:
  id: 00000000-0000-0000-0000-000000000000
  destino: https://ingest.radactory.example
  lote_s: 30            # cada cuanto se envia
  buffer_dias: 7

fuentes:
  - tipo: sql
    nombre: historiador
    dsn_env: FR_DSN_HISTORIADOR      # la credencial viene del entorno, no del yaml
    cadencia_s: 30
    consulta: |
      select tag, ts, valor from historico
       where ts > :ultimo order by ts limit 5000
    mapeo:
      tag: signal
      ts: ts
      valor: value

  - tipo: csv
    nombre: partes-produccion
    carpeta: /datos/partes
    patron: "parte_*.csv"
    cadencia_s: 300
```
