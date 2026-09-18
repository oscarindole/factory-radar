# ---------------------------------------------------------------------------
# Comprobacion compartida: ¿hay algo sirviendo YA en ese dominio?
#
# Los dos guiones de publicacion comprueban que el DNS apunte a Pages antes de
# escribir el CNAME. Eso evita quedarse sin URL, pero no el accidente contrario:
# apuntar a Pages un dominio que ESTABA SIRVIENDO OTRA COSA. El aviso de "no
# apunta a Pages" invita a arreglar el DNS, y si detras hay algo vivo, arreglarlo
# es tirarlo.
#
# Caso real, 17/09/2026: npages.indoletools.com parecia libre mirando solo la
# raiz, que contesta 404. Debajo hay un CMS multi-inquilino que enruta por ruta
# —/futbin/, /elvis-naka/, /sound-city/…— con sitios de clientes en produccion.
# Un CNAME a Pages los tumba todos a la vez.
#
# Por eso aqui no se mira si la raiz responde bonito: se mira QUIEN responde. Un
# servidor que no sea el de Pages es señal de que ese dominio tiene dueño.
# ---------------------------------------------------------------------------

# Devuelve por stdout el servidor que atiende el dominio, o vacio si no contesta
# nadie. No distingue paginas de errores: un 404 servido por nginx sigue siendo
# nginx sirviendo el dominio.
# Ojo con `set -euo pipefail` en quien nos llama: si el dominio no resuelve,
# curl sale con codigo != 0 y el pipeline entero tumbaria el guion ANTES de que
# pueda dar su propio aviso. Por eso la respuesta se recoge aparte y un fallo de
# curl se traduce en "no contesta nadie", que es justo lo que significa.
quien_sirve() {
  local dominio="$1" cabeceras
  cabeceras="$(curl -sS -I -m 8 "https://$dominio/" 2>/dev/null)" || return 0
  printf '%s' "$cabeceras" | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="server"{print $2; exit}'
}

# Corta la ejecucion si el dominio esta ocupado por algo que no sea Pages.
# Se salta con FORZAR_DOMINIO_OCUPADO=1, que hay que escribir a mano y a
# sabiendas: no existe ninguna opcion que lo haga por ti.
exigir_dominio_libre() {
  local dominio="$1"
  local servidor
  servidor="$(quien_sirve "$dominio" || true)"

  [[ -z "$servidor" ]] && return 0                 # no contesta nadie: via libre
  [[ "$servidor" == GitHub.com* ]] && return 0     # ya es Pages: es lo que queremos

  if [[ "${FORZAR_DOMINIO_OCUPADO:-0}" == "1" ]]; then
    echo "  AVISO: $dominio lo sirve \"$servidor\" y se continua porque" >&2
    echo "  FORZAR_DOMINIO_OCUPADO=1. Lo que hubiera ahi dejara de verse." >&2
    return 0
  fi

  cat >&2 <<AVISO

  ALTO. $dominio ya lo sirve otro servidor: "$servidor"

  Apuntar ese dominio a GitHub Pages deja sin servicio lo que haya detras, y
  desde fuera no se ve cuanto hay: un servidor puede enrutar por ruta y tener
  decenas de sitios colgando de el aunque su raiz conteste 404.

  Comprueba que hay antes de tocar el DNS:

      curl -sI https://$dominio/ | head -3
      # y prueba alguna ruta conocida, no solo la raiz

  No se ha tocado nada. Si de verdad ese dominio tiene que dejar de servir lo
  que sirve, vuelve con FORZAR_DOMINIO_OCUPADO=1.

AVISO
  exit 4
}
