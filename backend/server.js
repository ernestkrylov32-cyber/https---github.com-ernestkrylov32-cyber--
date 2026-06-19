const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PathfindingCore = require('../core/algorithms');

const app = express();
const PORT = process.env.PORT || 3000;

const ROWS = 16;
const COLS = 24;
const DB_PATH = path.join(__dirname, 'leaderboard.json');

const mazes = new Map();

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));

function gridHash(grid) {
  return crypto.createHash('sha1').update(JSON.stringify(grid)).digest('hex').slice(0, 10);
}

function loadLeaderboard() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

function saveLeaderboard(entries) {
  fs.writeFileSync(DB_PATH, JSON.stringify(entries, null, 2));
}

function generateRandomGrid() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      const roll = Math.random();
      if (roll < 0.22) row.push(-1);
      else if (roll < 0.34) row.push(5); 
      else row.push(1);          
    }
    grid.push(row);
  }
  grid[0][0] = 1;
  grid[ROWS - 1][COLS - 1] = 1;
  return grid;
}

function registerMaze(grid, start, end) {
  const mazeId = gridHash(grid) + '-' + Date.now().toString(36);
  mazes.set(mazeId, { grid, start, end });
  return mazeId;
}

app.get('/api/maze/random', (req, res) => {
  const start = [0, 0];
  const end = [ROWS - 1, COLS - 1];
  let grid;
  let attempts = 0;
  do {
    grid = generateRandomGrid();
    attempts++;
  } while (!PathfindingCore.isSolvable(grid, start, end) && attempts < 50);

  const mazeId = registerMaze(grid, start, end);
  res.json({ mazeId, grid, start, end, rows: ROWS, cols: COLS });
});

app.post('/api/maze/custom', (req, res) => {
  const { grid } = req.body || {};
  if (!Array.isArray(grid) || grid.length !== ROWS || grid[0].length !== COLS) {
    return res.status(400).json({ error: `Сетка должна быть ${ROWS}x${COLS}.` });
  }
  const start = [0, 0];
  const end = [ROWS - 1, COLS - 1];
  if (!PathfindingCore.isSolvable(grid, start, end)) {
    return res.status(400).json({ error: 'Этот лабиринт непроходим — путь от старта до финиша не существует.' });
  }
  const mazeId = registerMaze(grid, start, end);
  res.json({ mazeId, grid, start, end, rows: ROWS, cols: COLS });
});

app.post('/api/run', (req, res) => {
  const { mazeId, algorithm } = req.body || {};
  const maze = mazes.get(mazeId);
  if (!maze) return res.status(404).json({ error: 'Лабиринт не найден, запросите новый.' });
  if (!['bfs', 'dijkstra', 'astar'].includes(algorithm)) {
    return res.status(400).json({ error: 'Неизвестный алгоритм.' });
  }
  const result = PathfindingCore.run(algorithm, maze.grid, maze.start, maze.end);
  res.json(result);
});

app.post('/api/leaderboard', (req, res) => {
  const { name, mazeId, algorithm } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Укажи имя.' });
  }
  const maze = mazes.get(mazeId);
  if (!maze) return res.status(404).json({ error: 'Лабиринт не найден, запросите новый.' });
  if (!['bfs', 'dijkstra', 'astar'].includes(algorithm)) {
    return res.status(400).json({ error: 'Неизвестный алгоритм.' });
  }

  const result = PathfindingCore.run(algorithm, maze.grid, maze.start, maze.end);
  if (!result.path) return res.status(400).json({ error: 'Путь не найден на этом лабиринте.' });

  const entries = loadLeaderboard();
  const entry = {
    name: name.trim().slice(0, 24),
    algorithm,
    mazeId,
    cost: result.cost,
    visited: result.visitedOrder.length,
    timestamp: Date.now()
  };
  entries.push(entry);
  entries.sort((a, b) => a.visited - b.visited || a.cost - b.cost);
  saveLeaderboard(entries.slice(0, 100));

  res.json({ ok: true, cost: result.cost, visited: result.visitedOrder.length });
});

app.get('/api/leaderboard', (req, res) => {
  res.json(loadLeaderboard().slice(0, 20));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Maze Pathfinder запущен`);
  console.log(`Локально: http://localhost:${PORT}`);
});
