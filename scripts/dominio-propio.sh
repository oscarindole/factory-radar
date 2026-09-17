#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Pone el sitio en un dominio propio.
#
#   bash scripts/dominio-propio.sh ractory.indoletools.com
#
# EL ORDEN IMPORTA Y POR ESO ESTE GUION EXISTE.
#
# En cuanto GitHub Pages ve un fichero CNAME, deja de servir en
# oscarindole.github.io y empieza a redirigir al dominio propio. Si el registro
# DNS todavia no resuelve, el resultado no es "aun no funciona el dominio
# nuevo": es que se cae tambien la unica URL que funcionaba, y no hay nada que
# enseñar a nadie mientras se propaga.
#
# Asi que aqui se comprueba el DNS PRIMERO y solo despues se escribe el CNAME.
# Si no resuelve, el guion no toca nada.
# ---------------------------------------------------------------------------
set -euo pipefail

DOMINIO="${1:-}"
DESTINO="oscarindole.github.io"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "$DOMINIO" ]]; then
  echo "Uso: bash scripts/dominio-propio.sh <subdominio.dominio.com>" >&2
  exit 1
fi

echo "Comprobando $DOMINIO antes de tocar nada."

# --- 1. ¿existe el registro? -----------------------------------------------
CADENA="$(dig +short CNAME "$DOMINIO" | sed 's/\.$//')"
IPS="$(dig +short A "$DOMINIO" | sort)"

if [[ -z "$CADENA" && -z "$IPS" ]]; then
  cat >&2 <<AVISO

  $DOMINIO no resuelve todavia.

  Falta crear el registro en el panel de Arsys:

      Tipo:    CNAME
      Nombre:  ${DOMINIO%%.*}
      Valor:   ${DESTINO}.          <- con el punto final
      TTL:     el que venga por defecto

  No se ha tocado nada. La URL de ahora sigue funcionando.
  Cuando el registro este puesto, vuelve a lanzar este mismo guion.

AVISO
  exit 2
fi

# --- 2. ¿apunta a donde tiene que apuntar? ---------------------------------
# Se acepta el CNAME a github.io o las cuatro IP de Pages, porque algun panel
# resuelve la cadena y devuelve directamente las direcciones.
IPS_PAGES=$'185.199.108.153\n185.199.109.153\n185.199.110.153\n185.199.111.153'
CORRECTO=0
[[ "$CADENA" == "$DESTINO" ]] && CORRECTO=1
while read -r ip; do
  [[ -n "$ip" ]] && grep -qx "$ip" <<<"$IPS_PAGES" && CORRECTO=1
done <<<"$IPS"

if [[ "$CORRECTO" != "1" ]]; then
  cat >&2 <<AVISO

  $DOMINIO resuelve, pero NO a GitHub Pages.

      CNAME actual: ${CADENA:-ninguno}
      IP actuales:  $(echo "$IPS" | tr '\n' ' ')

  Apuntarlo asi serviria otra cosa en ese dominio, o nada. No se ha tocado nada.

AVISO
  exit 3
fi

echo "  DNS correcto: apunta a Pages."

# --- 3. ahora si ------------------------------------------------------------
echo "$DOMINIO" > "$RAIZ/web/CNAME"
echo "  web/CNAME escrito."

node "$RAIZ/scripts/construir-sitio.mjs"
bash "$RAIZ/scripts/publicar-sitio.sh"

cat <<FIN

  Publicado. Dos cosas que pasan ahora y conviene saber:

  - https://oscarindole.github.io/factory-radar/ pasa a redirigir a
    https://$DOMINIO. Deja de ser una URL independiente.

  - El certificado HTTPS lo emite GitHub solo, y tarda entre unos minutos y
    una hora. Hasta que este, el navegador avisa. Es normal y se arregla solo;
    si a la hora sigue igual, en Settings > Pages hay que quitar y volver a
    poner el dominio para forzar la emision.

FIN
