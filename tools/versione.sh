#!/bin/sh
# Aggiorna il numero di versione di CSS e JS nelle pagine, così i browser scaricano i file nuovi
# invece di usare la copia in memoria (GitHub Pages la tiene fino a 10 minuti).
# Lancialo prima di ogni pubblicazione: sh tools/versione.sh
cd "$(dirname "$0")/.." || exit 1
V=$(date +%Y%m%d%H%M)
for f in index.html staff.html privacy.html; do
  sed -i '' -E "s#(href=\"css/style\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(src=\"js/[a-zA-Z/]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#" "$f"
done
echo "versione $V"
