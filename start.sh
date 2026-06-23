#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Iniciando servidor Jurassic Learning..."
node server.js &
sleep 2
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "jurassic-neuroscience.html"
elif command -v open >/dev/null 2>&1; then
  open "jurassic-neuroscience.html"
else
  echo "Abre jurassic-neuroscience.html manualmente en tu navegador."
fi
echo "Servidor en http://localhost:3001"
