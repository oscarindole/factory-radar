#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publica el sitio en el hub de paginas: npages.indoletools.com/<ruta>
#
#   bash scripts/publicar-npages.sh [ruta] [dominio]
#
#   El dominio es opcional y NO tiene valor por defecto: sin el, el hub se sirve
#   en oscarindole.github.io/<ruta>.
#
# POR QUE UN HUB Y NO EL DOMINIO A SECAS
#
# Con dominio propio, GitHub Pages sirve un repositorio de proyecto en la RAIZ
# del dominio. Es decir: apuntar npages.indoletools.com a este repositorio daria
# https://npages.indoletools.com/ y no https://npages.indoletools.com/radactory.
#
# Para servir por rutas hace falta el repositorio de paginas de USUARIO
# —oscarindole.github.io—, que es el unico que puede tener varios proyectos
# colgando de carpetas. Este guion mete el sitio construido en su carpeta y
# deja el resto del hub intacto: cada proyecto futuro es otra carpeta.
#
# EL ORDEN, OTRA VEZ
#
# El fichero CNAME solo se escribe cuando el DNS ya apunta a Pages. Mientras no
# apunte, el hub se publica igual y se ve en oscarindole.github.io/<ruta>; lo
# que no se hace es activar el dominio propio antes de tiempo, porque eso
# tumbaria la unica URL que funciona.
# ---------------------------------------------------------------------------
set -euo pipefail

RUTA="${1:-radactory}"
# El dominio se pasa A MANO y no tiene valor por defecto. Lo tuvo
# —npages.indoletools.com— hasta que se vio que ese subdominio es el CMS
# multi-inquilino de Vertary, con sitios de clientes colgando por ruta. Sin
# segundo argumento esto publica en oscarindole.github.io/<ruta>, que no le
# quita el sitio a nadie.
DOMINIO="${2:-}"
HUB="git@github.com:oscarindole/oscarindole.github.io.git"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$RAIZ/scripts/_dominio.sh"
TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT

# --- 0. el dominio, antes de construir ni clonar nada -----------------------
# Va lo primero a proposito: si el dominio esta ocupado, no hay nada que hablar,
# y enterarse despues de haber clonado el hub solo hace el fallo mas confuso.
[[ -n "$DOMINIO" ]] && exigir_dominio_libre "$DOMINIO"

# --- 1. el sitio, construido -----------------------------------------------
echo "Construyendo el sitio."
node "$RAIZ/scripts/construir-sitio.mjs" >/dev/null
[[ -f "$RAIZ/docs/index.html" ]] || { echo "No hay docs/index.html" >&2; exit 1; }

# --- 2. el hub ---------------------------------------------------------------
if ! git ls-remote --exit-code -h "$HUB" >/dev/null 2>&1; then
  cat >&2 <<AVISO

  Falta el repositorio del hub: oscarindole/oscarindole.github.io

  Es el repositorio de paginas de USUARIO, y es el unico que puede servir
  varios proyectos por ruta bajo un mismo dominio. Hay que crearlo en GitHub,
  publico, vacio y con ese nombre exacto:

      https://github.com/new
      Owner: oscarindole
      Name:  oscarindole.github.io
      Public · sin README, sin .gitignore, sin licencia

  Cuando exista, vuelve a lanzar este guion. No se ha tocado nada.

AVISO
  exit 2
fi

echo "Clonando el hub."
git clone -q --depth 1 "$HUB" "$TRABAJO/hub" 2>/dev/null || {
  # Repositorio recien creado y sin un solo commit: no hay nada que clonar.
  mkdir -p "$TRABAJO/hub" && git -C "$TRABAJO/hub" init -q
  git -C "$TRABAJO/hub" remote add origin "$HUB"
}

# --- 3. el sitio va en su carpeta, el resto del hub no se toca --------------
rm -rf "${TRABAJO:?}/hub/${RUTA:?}"
mkdir -p "$TRABAJO/hub/$RUTA"
cp -R "$RAIZ/docs/." "$TRABAJO/hub/$RUTA/"
# El CNAME del hub manda sobre todo el dominio; si el sitio trae el suyo dentro
# de la carpeta, Pages lo ignora y ademas confunde a quien lo lea.
rm -f "$TRABAJO/hub/$RUTA/CNAME"
echo "  $RUTA/ armado ($(find "$TRABAJO/hub/$RUTA" -type f | wc -l | tr -d ' ') ficheros)"

# --- 4. indice del hub -------------------------------------------------------
# Sin esto, la raiz del dominio da 404 y parece que no funciona nada.
if [[ ! -f "$TRABAJO/hub/index.html" ]]; then
  cat > "$TRABAJO/hub/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Páginas</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; background:#FFFFFF; color:#141414; font:16px/1.6
         "Helvetica Neue",Arial,sans-serif; display:grid; place-items:center;
         min-height:100vh; padding:24px; }
  main { width:100%; max-width:34rem; }
  h1 { font-size:.75rem; font-weight:600; letter-spacing:.14em;
       text-transform:uppercase; color:#5E5E5E; margin:0 0 20px; }
  ul { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
  a { display:block; padding:18px 20px; background:#D8D8D8; border:1px solid #BEBEBE;
      border-radius:16px; color:#141414; text-decoration:none; font-weight:600; }
  a:hover { background:#FFFFFF; }
  a span { display:block; font-weight:400; font-size:.88rem; color:#5E5E5E;
           margin-top:3px; }
</style>
<main>
  <h1>Páginas</h1>
  <ul>
    <li><a href="./radactory/">RACTORY
      <span>Plataforma de inteligencia industrial</span></a></li>
  </ul>
</main>
HTML
  echo "  índice del hub creado"
fi

# --- 5. el dominio propio, solo si el DNS ya apunta -------------------------
if [[ -z "$DOMINIO" ]]; then
  rm -f "$TRABAJO/hub/CNAME"
  echo "  Sin dominio propio (no se paso ninguno): se publica en Pages."
  FINAL="https://oscarindole.github.io/$RUTA/"
else
CADENA="$(dig +short CNAME "$DOMINIO" | sed 's/\.$//')"
IPS="$(dig +short A "$DOMINIO" | sort | tr '\n' ' ')"
IPS_PAGES="185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153"
APUNTA=0
[[ "$CADENA" == "oscarindole.github.io" ]] && APUNTA=1
for ip in $IPS; do [[ " $IPS_PAGES " == *" $ip "* ]] && APUNTA=1; done

if [[ "$APUNTA" == "1" ]]; then
  echo "$DOMINIO" > "$TRABAJO/hub/CNAME"
  echo "  DNS correcto: CNAME escrito, el dominio propio queda activo."
  FINAL="https://$DOMINIO/$RUTA/"
else
  rm -f "$TRABAJO/hub/CNAME"
  echo "  DNS todavia no apunta a Pages: se publica SIN dominio propio."
  echo "  (el registro que falta lo dice scripts/dominio-propio.sh)"
  FINAL="https://oscarindole.github.io/$RUTA/"
fi
fi

# --- 6. publicar -------------------------------------------------------------
cd "$TRABAJO/hub"
git add -A
if git diff --cached --quiet 2>/dev/null; then
  echo "Sin cambios que publicar."
else
  git -c user.name="$(git -C "$RAIZ" config user.name)" \
      -c user.email="$(git -C "$RAIZ" config user.email)" \
      commit -q -m "$RUTA: $(date +%Y-%m-%d\ %H:%M)"
  git push -q origin HEAD:main 2>/dev/null || git push -q -u origin HEAD:main
  echo "Publicado."
fi

echo
echo "  $FINAL"
