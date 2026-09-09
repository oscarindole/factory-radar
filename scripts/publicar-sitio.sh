#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Publica docs/ en la rama gh-pages.
#
# Va en una rama aparte y no en main/docs porque GitHub activa Pages solo al ver
# aparecer gh-pages, sin tocar Settings ni necesitar un token de API. Un
# workflow de Actions haria lo mismo, pero necesita que el GITHUB_TOKEN del
# repositorio tenga permiso de escritura, y por defecto no lo tiene.
#
# Se construye en un arbol de trabajo aparte para no tocar el principal: cambiar
# de rama en el directorio de trabajo con cambios sin guardar es la forma
# clasica de perder una tarde.
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

node scripts/construir-sitio.mjs

TMP="$(mktemp -d)"
trap 'git worktree remove "$TMP" --force 2>/dev/null || true; rm -rf "$TMP"' EXIT

git worktree add -q --detach "$TMP"
(
  cd "$TMP"
  git checkout -q -B gh-pages
  git rm -rq --cached . 2>/dev/null || true
  find . -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} + 2>/dev/null || true
  cp -R "$OLDPWD/docs/." .
  git add -A
  if git diff --cached --quiet; then
    echo "el sitio no ha cambiado: nada que publicar"
  else
    git commit -q -m "Sitio publicado · $(date +%Y-%m-%d\ %H:%M)"
    git push -q --force origin gh-pages
    echo "publicado en gh-pages"
  fi
)
