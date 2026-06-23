@echo off
cd /d "%~dp0"
echo Iniciando servidor Jurassic Learning...
start "Jurassic API" cmd /k node server.js
timeout /t 2 /nobreak >nul
start "" "%~dp0jurassic-neuroscience.html"
echo Servidor en http://localhost:3001 — HTML abierto en el navegador.
