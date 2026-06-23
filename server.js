'use strict';

const express = require('express');
const cors = require('cors');
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const PORT = 3001;
const DB_PATH = path.join(__dirname, 'jurassic.db');

const NAME_RE = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{1,29}$/;

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(first_name, last_name)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    player_id INTEGER REFERENCES players(id),
    zone INTEGER NOT NULL,
    points INTEGER NOT NULL,
    attempts INTEGER NOT NULL,
    completed BOOLEAN NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, zone)
  );

  CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER REFERENCES players(id),
    total_points INTEGER DEFAULT 0,
    zones_completed INTEGER DEFAULT 0,
    final_quiz_score INTEGER DEFAULT 0,
    final_quiz_attempts INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
  );
`);

function validateName(value, label) {
  if (typeof value !== 'string') return `${label} inválido`;
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Mínimo 2 caracteres';
  if (trimmed.length > 30) return 'Máximo 30 caracteres';
  if (!NAME_RE.test(trimmed)) {
    if (/[0-9]/.test(trimmed)) return 'Solo se permiten letras';
    if (/^[a-záéíóúñ]/.test(trimmed)) return 'La primera letra debe ser mayúscula';
    return 'Formato: Primera letra mayúscula, resto minúsculas. Ej: Carlos';
  }
  return null;
}

function getPlayerStats(playerId) {
  const sessions = db.prepare(
    `SELECT id, total_points, zones_completed, final_quiz_score, final_quiz_attempts,
            started_at, finished_at
     FROM game_sessions WHERE player_id = ? ORDER BY started_at DESC`
  ).all(playerId);

  const totalGames = sessions.length;
  const finished = sessions.filter(s => s.finished_at);
  const bestTotal = finished.reduce((m, s) => Math.max(m, s.total_points || 0), 0);
  const lastSession = finished[0];
  const lastSessionScore = lastSession ? lastSession.total_points : 0;

  const zoneRows = db.prepare(
    `SELECT zone,
            MAX(points) AS best_score,
            SUM(attempts) AS total_attempts
     FROM scores WHERE player_id = ? GROUP BY zone ORDER BY zone`
  ).all(playerId);

  const zonesCompletedTotal = db.prepare(
    `SELECT COUNT(DISTINCT zone) AS n FROM scores
     WHERE player_id = ? AND completed = 1 AND zone BETWEEN 1 AND 6`
  ).get(playerId).n;

  return {
    total_games_played: totalGames,
    best_total_score: bestTotal,
    last_session_score: lastSessionScore,
    zones_completed_total: zonesCompletedTotal,
    zone_stats: zoneRows.map(r => ({
      zone: r.zone,
      best_score: r.best_score,
      total_attempts: r.total_attempts
    }))
  };
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/player/login', (req, res) => {
  try {
    const { first_name, last_name } = req.body || {};
    const err1 = validateName(first_name, 'Nombre');
    const err2 = validateName(last_name, 'Apellido');
    if (err1 || err2) {
      return res.status(400).json({ error: err1 || err2 });
    }
    const fn = first_name.trim();
    const ln = last_name.trim();

    let player = db.prepare(
      'SELECT id, first_name, last_name FROM players WHERE first_name = ? AND last_name = ?'
    ).get(fn, ln);

    let isNew = false;
    if (!player) {
      const info = db.prepare(
        'INSERT INTO players (first_name, last_name) VALUES (?, ?)'
      ).run(fn, ln);
      player = { id: info.lastInsertRowid, first_name: fn, last_name: ln };
      isNew = true;
    }

    const stats = getPlayerStats(player.id);
    res.json({
      player_id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      is_new: isNew,
      ...stats
    });
  } catch (e) {
    console.error('POST /api/player/login', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/session/start', (req, res) => {
  try {
    const { player_id } = req.body || {};
    if (!player_id) return res.status(400).json({ error: 'player_id requerido' });
    const player = db.prepare('SELECT id FROM players WHERE id = ?').get(player_id);
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    const info = db.prepare(
      'INSERT INTO game_sessions (player_id) VALUES (?)'
    ).run(player_id);

    res.json({ session_id: info.lastInsertRowid });
  } catch (e) {
    console.error('POST /api/session/start', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.put('/api/session/zone', (req, res) => {
  try {
    const { session_id, player_id, zone, points, attempts, completed } = req.body || {};
    if (!session_id || !player_id || zone == null) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    const z = parseInt(zone, 10);
    if (z < 1 || z > 6) return res.status(400).json({ error: 'Zona inválida' });

    db.prepare(
      `INSERT INTO scores (session_id, player_id, zone, points, attempts, completed)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, zone) DO UPDATE SET
         points = excluded.points,
         attempts = excluded.attempts,
         completed = excluded.completed,
         created_at = CURRENT_TIMESTAMP`
    ).run(
      session_id,
      player_id,
      z,
      parseInt(points, 10) || 0,
      parseInt(attempts, 10) || 0,
      completed ? 1 : 0
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/session/zone', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.put('/api/session/finish', (req, res) => {
  try {
    const {
      session_id,
      total_points,
      zones_completed,
      final_quiz_score,
      final_quiz_attempts
    } = req.body || {};

    if (!session_id) return res.status(400).json({ error: 'session_id requerido' });

    db.prepare(
      `UPDATE game_sessions SET
         total_points = ?,
         zones_completed = ?,
         final_quiz_score = ?,
         final_quiz_attempts = ?,
         finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      parseInt(total_points, 10) || 0,
      parseInt(zones_completed, 10) || 0,
      parseInt(final_quiz_score, 10) || 0,
      parseInt(final_quiz_attempts, 10) || 0,
      session_id
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/session/finish', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/leaderboard', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT
        p.first_name,
        p.last_name,
        p.id AS player_id,
        MAX(gs.total_points) AS best_score,
        COUNT(gs.id) AS total_games
      FROM players p
      JOIN game_sessions gs ON gs.player_id = p.id
      WHERE gs.finished_at IS NOT NULL
      GROUP BY p.id
      ORDER BY best_score DESC
      LIMIT 10
    `).all();

    res.json(rows.map((r, i) => ({
      rank: i + 1,
      player_id: r.player_id,
      first_name: r.first_name,
      last_name: r.last_name,
      best_score: r.best_score,
      total_games: r.total_games
    })));
  } catch (e) {
    console.error('GET /api/leaderboard', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/player/:id/history', (req, res) => {
  try {
    const playerId = parseInt(req.params.id, 10);
    const player = db.prepare(
      'SELECT id, first_name, last_name, created_at FROM players WHERE id = ?'
    ).get(playerId);
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    const sessions = db.prepare(
      `SELECT id, total_points, zones_completed, final_quiz_score, final_quiz_attempts,
              started_at, finished_at
       FROM game_sessions WHERE player_id = ? ORDER BY started_at DESC`
    ).all(playerId);

    const zoneStmt = db.prepare(
      `SELECT zone, points, attempts, completed FROM scores
       WHERE session_id = ? ORDER BY zone`
    );

    res.json({
      player,
      sessions: sessions.map(s => ({
        ...s,
        zones: zoneStmt.all(s.id)
      }))
    });
  } catch (e) {
    console.error('GET /api/player/:id/history', e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.listen(PORT, () => {
  console.log(`Jurassic Learning API en http://localhost:${PORT}`);
});
