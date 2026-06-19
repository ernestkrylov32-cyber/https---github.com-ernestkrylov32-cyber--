/**
 * FRONTEND.
 * Никакой алгоритмической логики здесь нет — фронт только:
 *  - рисует сетку и позволяет редактировать стены/грязь;
 *  - запрашивает у backend'а лабиринт и результат прогона алгоритма;
 *  - анимирует уже готовый результат (visitedOrder, path);
 *  - отправляет результат в таблицу лидеров и показывает её.
 */

const state = {
  mazeId: null,
  grid: null,
  start: null,
  end: null,
  rows: 0,
  cols: 0,
  cells: [],       // DOM-ссылки [r][c]
  isDrawing: false,
  animating: false,
  lastResult: null
};

const els = {
  grid: document.getElementById('mazeGrid'),
  algoSelect: document.getElementById('algoSelect'),
  drawMode: document.getElementById('drawMode'),
  runBtn: document.getElementById('runBtn'),
  newMazeBtn: document.getElementById('newMazeBtn'),
  saveMazeBtn: document.getElementById('saveMazeBtn'),
  runInfo: document.getElementById('runInfo'),
  runStats: document.getElementById('runStats'),
  playerName: document.getElementById('playerName'),
  submitScoreBtn: document.getElementById('submitScoreBtn'),
  statusLine: document.getElementById('statusLine'),
  leaderboardList: document.getElementById('leaderboardList')
};

function setStatus(text) { els.statusLine.textContent = text || ''; }

function cellClassFor(value, r, c) {
  if (r === state.start[0] && c === state.start[1]) return 'start';
  if (r === state.end[0] && c === state.end[1]) return 'end';
  if (value === -1) return 'wall';
  if (value === 5) return 'mud';
  return 'empty';
}

function buildGridDOM() {
  els.grid.innerHTML = '';
  els.grid.style.gridTemplateColumns = `repeat(${state.cols}, 24px)`;
  state.cells = [];
  for (let r = 0; r < state.rows; r++) {
    const row = [];
    for (let c = 0; c < state.cols; c++) {
      const div = document.createElement('div');
      div.className = 'cell ' + cellClassFor(state.grid[r][c], r, c);
      div.dataset.r = r;
      div.dataset.c = c;
      div.addEventListener('mousedown', () => { state.isDrawing = true; paintCell(r, c); });
      div.addEventListener('mouseenter', () => { if (state.isDrawing) paintCell(r, c); });
      els.grid.appendChild(div);
      row.push(div);
    }
    state.cells.push(row);
  }
}

document.addEventListener('mouseup', () => { state.isDrawing = false; });

function isStartOrEnd(r, c) {
  return (r === state.start[0] && c === state.start[1]) ||
         (r === state.end[0] && c === state.end[1]);
}

function paintCell(r, c) {
  if (state.animating || isStartOrEnd(r, c)) return;
  const mode = els.drawMode.value;
  const value = mode === 'wall' ? -1 : mode === 'mud' ? 5 : 1;
  state.grid[r][c] = value;
  const div = state.cells[r][c];
  div.className = 'cell ' + cellClassFor(value, r, c);
}

function clearOverlay() {
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const div = state.cells[r][c];
      div.classList.remove('visited', 'path');
    }
  }
}

async function fetchRandomMaze() {
  setStatus('Генерирую лабиринт…');
  const res = await fetch('/api/maze/random');
  const data = await res.json();
  applyMaze(data);
  setStatus('Готово. Рисуй стены или сразу жми «Запустить».');
}

async function saveCustomMaze() {
  setStatus('Сохраняю карту…');
  const res = await fetch('/api/maze/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grid: state.grid })
  });
  const data = await res.json();
  if (!res.ok) { setStatus('Ошибка: ' + data.error); return; }
  applyMaze(data);
  setStatus('Карта сохранена как новый лабиринт под mazeId ' + data.mazeId);
}

function applyMaze(data) {
  state.mazeId = data.mazeId;
  state.grid = data.grid;
  state.start = data.start;
  state.end = data.end;
  state.rows = data.rows;
  state.cols = data.cols;
  state.lastResult = null;
  buildGridDOM();
  els.runInfo.hidden = true;
}

async function runAlgorithm() {
  if (state.animating) return;
  clearOverlay();
  els.runInfo.hidden = true;
  state.animating = true;
  toggleControls(false);
  setStatus('Алгоритм считает на сервере…');

  const algorithm = els.algoSelect.value;
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mazeId: state.mazeId, algorithm })
  });
  const result = await res.json();
  if (!res.ok) {
    setStatus('Ошибка: ' + result.error);
    state.animating = false;
    toggleControls(true);
    return;
  }
  state.lastResult = result;
  await animateResult(result);
  toggleControls(true);
  state.animating = false;
}

function animateResult(result) {
  return new Promise((resolve) => {
    const { visitedOrder, path, cost } = result;
    let i = 0;
    const stepDelay = Math.max(4, Math.floor(220 / Math.sqrt(visitedOrder.length + 1)));

    function stepVisited() {
      if (i >= visitedOrder.length) {
        drawPath(path, cost, visitedOrder.length);
        resolve();
        return;
      }
      const [r, c] = visitedOrder[i++];
      if (!isStartOrEnd(r, c)) state.cells[r][c].classList.add('visited');
      setTimeout(stepVisited, stepDelay);
    }
    stepVisited();
  });
}

function drawPath(path, cost, visitedCount) {
  if (!path) {
    setStatus('Путь не найден — слишком плотно застроено стенами.');
    return;
  }
  path.forEach(([r, c]) => state.cells[r][c].classList.add('path'));
  els.runStats.textContent =
    `Осмотрено клеток: ${visitedCount} · длина пути: ${path.length} · стоимость: ${cost}`;
  els.runInfo.hidden = false;
  setStatus('Готово.');
}

function toggleControls(enabled) {
  els.runBtn.disabled = !enabled;
  els.newMazeBtn.disabled = !enabled;
  els.saveMazeBtn.disabled = !enabled;
}

async function submitScore() {
  if (!state.lastResult) return;
  const name = els.playerName.value.trim();
  if (!name) { setStatus('Введи имя перед отправкой результата.'); return; }

  const algorithm = els.algoSelect.value;
  const res = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mazeId: state.mazeId, algorithm })
  });
  const data = await res.json();
  if (!res.ok) { setStatus('Ошибка: ' + data.error); return; }
  setStatus(`Записано! Осмотрено клеток: ${data.visited}, стоимость пути: ${data.cost}.`);
  els.playerName.value = '';
  loadLeaderboard();
}

async function loadLeaderboard() {
  const res = await fetch('/api/leaderboard');
  const entries = await res.json();
  els.leaderboardList.innerHTML = '';
  if (entries.length === 0) {
    els.leaderboardList.innerHTML = '<li class="meta">Пока пусто — будь первым.</li>';
    return;
  }
  entries.forEach((e, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="rank">#${idx + 1}</span>
      <span class="name">${escapeHtml(e.name)} <span class="meta">(${e.algorithm})</span></span>
      <span class="meta">${e.visited} кл · цена ${e.cost}</span>
    `;
    els.leaderboardList.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

els.runBtn.addEventListener('click', runAlgorithm);
els.newMazeBtn.addEventListener('click', fetchRandomMaze);
els.saveMazeBtn.addEventListener('click', saveCustomMaze);
els.submitScoreBtn.addEventListener('click', submitScore);

fetchRandomMaze();
loadLeaderboard();
