/**
 * ЯДРО проекта.
 * Чистая логика поиска пути на сетке. Ничего не знает про HTTP, DOM,
 * базы данных — только массивы чисел на входе, объект с результатом на выходе.
 * Поэтому этот файл одинаково честно работает и на сервере (через require),
 * и в браузере (через <script>), и в автотестах.
 *
 * Представление сетки: grid[r][c] — число:
 *   -1  — стена (пройти нельзя)
 *    1  — обычная клетка (стоимость входа 1)
 *    5  — "грязь" (стоимость входа 5, проходимо, но дорого)
 */
(function (global) {
  'use strict';

  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function key(r, c) { return r + ',' + c; }

  function inBounds(grid, r, c) {
    return r >= 0 && c >= 0 && r < grid.length && c < grid[0].length;
  }

  function isWall(grid, r, c) { return grid[r][c] === -1; }

  function enterCost(grid, r, c) {
    const v = grid[r][c];
    return v < 1 ? 1 : v;
  }

  function reconstructPath(cameFrom, start, end) {
    const sk = key(start[0], start[1]);
    const ek = key(end[0], end[1]);
    if (sk === ek) return [start];
    if (!cameFrom.has(ek)) return null;
    const path = [end];
    let curKey = ek;
    while (curKey !== sk) {
      const prev = cameFrom.get(curKey);
      if (!prev) return null;
      path.push(prev);
      curKey = key(prev[0], prev[1]);
    }
    path.reverse();
    return path;
  }

  function pathCost(grid, path) {
    let total = 0;
    for (let i = 1; i < path.length; i++) {
      total += enterCost(grid, path[i][0], path[i][1]);
    }
    return total;
  }

  // Минимальная бинарная куча-приоритет на массиве — без зависимостей.
  class PriorityQueue {
    constructor() { this.items = []; }
    push(item, priority) {
      this.items.push({ item, priority });
      this.items.sort((a, b) => a.priority - b.priority);
    }
    pop() { return this.items.shift().item; }
    get isEmpty() { return this.items.length === 0; }
  }

  // BFS: считает все рёбра весом 1, поэтому находит путь с минимумом ШАГОВ,
  // но может игнорировать "грязь" — это специально, чтобы на занятии было
  // что обсудить: "шорткаты по шагам" vs "оптимальная цена".
  function bfs(grid, start, end) {
    const visitedOrder = [];
    const visited = new Set([key(start[0], start[1])]);
    const cameFrom = new Map();
    const queue = [start];
    let qi = 0;
    while (qi < queue.length) {
      const [r, c] = queue[qi++];
      visitedOrder.push([r, c]);
      if (r === end[0] && c === end[1]) break;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(grid, nr, nc) || isWall(grid, nr, nc)) continue;
        const k = key(nr, nc);
        if (visited.has(k)) continue;
        visited.add(k);
        cameFrom.set(k, [r, c]);
        queue.push([nr, nc]);
      }
    }
    const path = reconstructPath(cameFrom, start, end);
    return { visitedOrder, path, cost: path ? pathCost(grid, path) : null };
  }

  // Dijkstra: честно учитывает стоимость клеток, находит самый ДЁШЕВЫЙ путь.
  function dijkstra(grid, start, end) {
    const visitedOrder = [];
    const dist = new Map([[key(start[0], start[1]), 0]]);
    const cameFrom = new Map();
    const done = new Set();
    const pq = new PriorityQueue();
    pq.push(start, 0);
    while (!pq.isEmpty) {
      const [r, c] = pq.pop();
      const k = key(r, c);
      if (done.has(k)) continue;
      done.add(k);
      visitedOrder.push([r, c]);
      if (r === end[0] && c === end[1]) break;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(grid, nr, nc) || isWall(grid, nr, nc)) continue;
        const nk = key(nr, nc);
        const newDist = dist.get(k) + enterCost(grid, nr, nc);
        if (!dist.has(nk) || newDist < dist.get(nk)) {
          dist.set(nk, newDist);
          cameFrom.set(nk, [r, c]);
          pq.push([nr, nc], newDist);
        }
      }
    }
    const path = reconstructPath(cameFrom, start, end);
    return { visitedOrder, path, cost: path ? pathCost(grid, path) : null };
  }

  function heuristic(a, b) {
    return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); // Манхэттен
  }

  // A*: то же самое, что Dijkstra, но с эвристикой — обычно осматривает
  // заметно меньше клеток (visitedOrder короче), путь при этом тот же оптимальный.
  function aStar(grid, start, end) {
    const visitedOrder = [];
    const gScore = new Map([[key(start[0], start[1]), 0]]);
    const cameFrom = new Map();
    const done = new Set();
    const pq = new PriorityQueue();
    pq.push(start, heuristic(start, end));
    while (!pq.isEmpty) {
      const [r, c] = pq.pop();
      const k = key(r, c);
      if (done.has(k)) continue;
      done.add(k);
      visitedOrder.push([r, c]);
      if (r === end[0] && c === end[1]) break;
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(grid, nr, nc) || isWall(grid, nr, nc)) continue;
        const nk = key(nr, nc);
        const newG = gScore.get(k) + enterCost(grid, nr, nc);
        if (!gScore.has(nk) || newG < gScore.get(nk)) {
          gScore.set(nk, newG);
          cameFrom.set(nk, [r, c]);
          pq.push([nr, nc], newG + heuristic([nr, nc], end));
        }
      }
    }
    const path = reconstructPath(cameFrom, start, end);
    return { visitedOrder, path, cost: path ? pathCost(grid, path) : null };
  }

  function run(algorithm, grid, start, end) {
    if (algorithm === 'bfs') return bfs(grid, start, end);
    if (algorithm === 'dijkstra') return dijkstra(grid, start, end);
    if (algorithm === 'astar') return aStar(grid, start, end);
    throw new Error('Неизвестный алгоритм: ' + algorithm);
  }

  // Используется backend'ом, чтобы проверять чужие лабиринты/правки сетки.
  function isSolvable(grid, start, end) {
    return bfs(grid, start, end).path !== null;
  }

  const PathfindingCore = { run, bfs, dijkstra, aStar, pathCost, isSolvable };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PathfindingCore;
  } else {
    global.PathfindingCore = PathfindingCore;
  }
})(typeof window !== 'undefined' ? window : globalThis);
