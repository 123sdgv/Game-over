// 方块的规则（不碰界面）。
// 棋盘：grid[r][c]，r = 0 是最底下一行；格子里是颜色编号，-1 是空。
// 规则：
//   · 方块落定后，每一格各自往下掉，直到碰到东西（所以不会有悬空的洞）。
//   · 一行填满并且全是同一种颜色才会消掉；混了颜色的满行会卡住。
//   · 消掉以后上面的格子再往下掉，可能又凑成同色行，形成连消。

/* ---------- 七种方块 ---------- */
// 坐标 y 向上；size 是旋转用的方框大小
const BASE = {
  I: { size: 4, cells: [[0, 2], [1, 2], [2, 2], [3, 2]] },
  O: { size: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { size: 3, cells: [[0, 1], [1, 1], [2, 1], [1, 2]] },
  S: { size: 3, cells: [[0, 1], [1, 1], [1, 2], [2, 2]] },
  Z: { size: 3, cells: [[0, 2], [1, 2], [1, 1], [2, 1]] },
  J: { size: 3, cells: [[0, 2], [0, 1], [1, 1], [2, 1]] },
  L: { size: 3, cells: [[2, 2], [0, 1], [1, 1], [2, 1]] },
};
export const KINDS = Object.keys(BASE);

/** 某个方块第 rot 次顺时针旋转后的格子 */
export function cellsOf(kind, rot) {
  const { size, cells } = BASE[kind];
  let out = cells;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) out = out.map(([x, y]) => [y, size - 1 - x]);
  return out;
}
export const sizeOf = (kind) => BASE[kind].size;

/* ---------- 棋盘 ---------- */
export const makeGrid = (rows, cols) => Array.from({ length: rows }, () => new Array(cols).fill(-1));
export const cloneGrid = (g) => g.map((r) => r.slice());

/** 方块放在 (px, py) 会不会撞：出界或者压到已有格子（顶上超出去不算撞） */
export function collides(grid, kind, rot, px, py) {
  const rows = grid.length, cols = grid[0].length;
  for (const [x, y] of cellsOf(kind, rot)) {
    const c = px + x, r = py + y;
    if (c < 0 || c >= cols || r < 0) return true;
    if (r < rows && grid[r][c] !== -1) return true;
  }
  return false;
}

/** 旋转：撞了就试着左右挪一挪（简单的踢墙） */
export function tryRotate(grid, p, dir = 1) {
  const rot = p.rot + dir;
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, 1], [-1, 1], [1, 1]]) {
    if (!collides(grid, p.kind, rot, p.x + dx, p.y + dy)) return { ...p, rot, x: p.x + dx, y: p.y + dy };
  }
  return null;
}

/** 直接落到底的位置 */
export function dropY(grid, p) {
  let y = p.y;
  while (!collides(grid, p.kind, p.rot, p.x, y - 1)) y--;
  return y;
}

/**
 * 把方块的格子放进棋盘，再让每一格往下掉。
 * 返回 { moves: [{c, from, to}], overflow }；overflow 表示有格子堆出了顶。
 */
export function place(grid, p) {
  const rows = grid.length;
  const extra = []; // 顶上超出去的格子
  for (const [x, y] of cellsOf(p.kind, p.rot)) {
    const c = p.x + x, r = p.y + y;
    if (r < rows) grid[r][c] = p.color; else extra.push({ c, r, color: p.color });
  }
  const moves = settle(grid);
  // 超出顶部的格子往下塞，塞不下就算堆满了
  let overflow = false;
  extra.sort((a, b) => a.r - b.r).forEach(({ c, r, color }) => {
    let h = 0;
    while (h < rows && grid[h][c] !== -1) h++;
    if (h >= rows) { overflow = true; return; }
    grid[h][c] = color;
    moves.push({ c, from: r, to: h });
  });
  return { moves, overflow };
}

/** 每一列往下压实，返回移动记录 [{c, from, to}] */
export function settle(grid) {
  const rows = grid.length, cols = grid[0].length;
  const moves = [];
  for (let c = 0; c < cols; c++) {
    let w = 0;
    for (let r = 0; r < rows; r++) {
      if (grid[r][c] === -1) continue;
      if (r !== w) { grid[w][c] = grid[r][c]; grid[r][c] = -1; moves.push({ c, from: r, to: w }); }
      w++;
    }
  }
  return moves;
}

/** 哪些行满了而且同色 */
export function clearableRows(grid) {
  const out = [];
  grid.forEach((row, r) => {
    if (row[0] !== -1 && row.every((x) => x === row[0])) out.push(r);
  });
  return out;
}

/** 满了但混色、卡住的行 */
export const stuckRows = (grid) => grid.reduce((n, row) => n + (row.every((x) => x !== -1) && !row.every((x) => x === row[0]) ? 1 : 0), 0);

export function removeRows(grid, rowsToClear) {
  for (const r of rowsToClear) grid[r].fill(-1);
}

export const heightOf = (grid, c) => { let h = 0; while (h < grid.length && grid[h][c] !== -1) h++; return h; };
export const maxHeight = (grid) => Math.max(...grid[0].map((_, c) => heightOf(grid, c)));
export const cellCount = (grid) => grid.reduce((n, row) => n + row.filter((x) => x !== -1).length, 0);

/* ---------- 出题 ---------- */
function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * 开局的彩色层：layers 行，每 2 行一种颜色（相邻两段颜色不同），
 * 有几列被挖出深浅不一的缺口（缺口一定从顶上露出来，能填进去）。
 */
export function layered(rows, cols, layers, colors, rnd = Math.random) {
  const grid = makeGrid(rows, cols);
  const order = shuffle([...Array(colors).keys()], rnd);
  const bandColor = [];
  for (let b = 0; b * 2 < layers; b++) {
    let c = order[b % colors];
    if (b > 0 && c === bandColor[b - 1]) c = order[(b + 1) % colors];
    bandColor.push(c);
  }
  // 每列的高度：大部分是满的，挖几个井
  const heights = new Array(cols).fill(layers);
  const wells = Math.max(1, Math.round(cols / 3.2));
  const picks = shuffle([...Array(cols).keys()], rnd).slice(0, wells);
  for (const c of picks) heights[c] = Math.max(0, layers - 1 - Math.floor(rnd() * Math.min(3, layers)));
  // 至少有一列缺口在最上面一行，免得开局就有整行能直接消
  for (let r = 0; r < layers; r++) {
    for (let c = 0; c < cols; c++) if (r < heights[c]) grid[r][c] = bandColor[Math.floor(r / 2)];
  }
  // 开局不能有已经同色满行的：把最矮的那列（已有的缺口）再往下挖到这一行
  for (const r of clearableRows(grid)) {
    let c = 0;
    for (let k = 1; k < cols; k++) if (heights[k] < heights[c] || (heights[k] === heights[c] && rnd() < 0.5)) c = k;
    heights[c] = Math.min(heights[c], r);
    for (let k = r; k < rows; k++) grid[k][c] = -1;
  }
  settle(grid);
  return grid;
}

/**
 * 下一个方块的颜色：参考最上面几行还没填满的行，缺什么颜色更容易来。
 */
export function pickColor(grid, colors, rnd = Math.random) {
  const w = new Array(colors).fill(1);
  const top = maxHeight(grid);
  for (let r = Math.max(0, top - 3); r < top; r++) {
    const row = grid[r];
    if (row.every((x) => x !== -1)) continue;
    row.forEach((x) => { if (x >= 0 && x < colors) w[x] += 1.2; });
  }
  let sum = w.reduce((a, b) => a + b, 0), x = rnd() * sum, i = 0;
  while (x > w[i]) { x -= w[i]; i++; }
  return Math.min(i, colors - 1);
}

/** 七个一包随机发，避免长时间不来某种形状 */
export function makeBag(rnd = Math.random) {
  let bag = [];
  return () => { if (!bag.length) bag = shuffle(KINDS.slice(), rnd); return bag.pop(); };
}

/* ---------- 闯关的难度 ---------- */
export function levelSpec(level, cfg) {
  const layers = Math.min(cfg.rows - 7, 3 + Math.floor((level - 1) / 2));
  const colors = Math.min(cfg.colors, 2 + Math.floor((level - 1) / 3));
  const speed = Math.min(10, cfg.speed + Math.floor((level - 1) / 4));
  return { layers, colors, speed, target: Math.max(2, Math.min(layers, 2 + Math.floor((level - 1) / 2))) };
}

/** 闯关给多少块：缺口要的格子数 / 4，再加余量；越往后余量越少 */
export function pieceBudget(grid, layers, target, level) {
  const cols = grid[0].length;
  let holes = 0;
  for (let r = 0; r < layers; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === -1) holes++;
  return Math.ceil(holes / 4) + target * Math.ceil(cols / 4) + Math.max(3, 9 - Math.floor(level / 3));
}
