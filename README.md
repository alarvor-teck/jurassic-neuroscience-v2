# Jurassic Learning — Neurociencia

Juego educativo interactivo sobre neurociencia del aprendizaje, con backend SQLite para registro de jugadores, sesiones y tabla de líderes.

## Requisitos

- Node.js 18+ (recomendado 22+; usa SQLite integrado `node:sqlite`)
- Navegador web moderno (Chrome, Firefox, Edge)

## Instalación

```bash
npm install
```

## Iniciar servidor

```bash
node server.js
```

El servidor corre en http://localhost:3001

Abrir `jurassic-neuroscience.html` en el navegador (doble clic o arrastrar al navegador).

En Windows también puedes usar `start.bat`. En Mac/Linux: `chmod +x start.sh && ./start.sh`

## Estructura de archivos

| Archivo | Propósito |
|---------|-----------|
| `jurassic-neuroscience.html` | Juego principal (6 zonas, login, leaderboard) |
| `questions-final.js` | Banco de 40 preguntas para la prueba final (Zona 6) |
| `server.js` | API REST Express + SQLite (`node:sqlite`, archivo `jurassic.db`) |
| `package.json` | Dependencias Node.js |
| `jurassic.db` | Base de datos SQLite (se crea al iniciar el servidor) |
| `start.bat` | Script de inicio para Windows |
| `start.sh` | Script de inicio para Mac/Linux |
| `img/` | Imágenes de fondo, dinosaurios y mapa |
| `presentaciones/` | PDFs educativos por zona |

## API

- `GET /api/health` — estado del servidor
- `POST /api/player/login` — registro/login de jugador
- `POST /api/session/start` — nueva partida
- `PUT /api/session/zone` — resultado por zona
- `PUT /api/session/finish` — finalizar partida
- `GET /api/leaderboard` — top 10 jugadores
- `GET /api/player/:id/history` — historial de un jugador

## Modo sin conexión

Si el servidor no está disponible, el juego funciona igual: valida el login localmente y guarda puntajes en `sessionStorage` (`jp_offline_scores`).
