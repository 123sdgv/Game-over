// 消灭星星的规则（不碰界面）。
// 棋盘按列存：cols[c] 是第 c 列从下往上的颜色数组；空列会被挤到最右边。
// 规则：
//   · 点一组相连（上下左右）的同色星星，至少 2 颗才能消。得分 = 颗数² × 5。
//   · 消掉以后上面的往下掉，空出来的列整列往左靠。
//   · 闯关：消不动了结算，剩下少于 10 颗有奖励 2000 − 20 × 剩余²；总分够目标进下一关（目标分是累计的）。
//   · 无尽：每走几步从底下升起一行新星星，堆过顶就结束。

export const scoreFor = (n) => n * n * 5;
export const bonusFor = (k) => Math.max(0, 2000 - 20 * k * k);

const at = (cols, c, r) => (cols[c] && r >= 0 && r < cols[c].length ? cols[c][r] : undefined);

/** 从 (c, r) 出发的同色连通块，按距离排好：[[c, r, 距离], ...] */
export function groupAt(cols, c, r) {
  const color = at(cols, c, r);
  if (color === undefined) return [];
  const seen = new Set([`${c},${r}`]);
  const out = [];
  const queue = [[c, r, 0]];
  while (queue.length) {
    const cur = queue.shift();
    out.push(cur);
    const [x, y, d] = cur;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
      if (seen.has(k) || at(cols, nx, ny) !== color) continue;
      seen.add(k);
      queue.push([nx, ny, d + 1]);
    }
  }
  return out;
}

export function hasMoves(cols) {
  for (let c = 0; c < cols.length; c++) {
    for (let r = 0; r < cols[c].length; r++) {
      const v = cols[c][r];
      if (at(cols, c, r + 1) === v || at(cols, c + 1, r) === v) return true;
    }
  }
  return false;
}

export const countCells = (cols) => cols.reduce((n, col) => n + col.length, 0);

/** 闯关的累计目标分（按 10×10 算，格子数不同时按比例缩放） */
export function targetFor(level, cells = 100) {
  let t = 1000;
  for (let i = 2; i <= level; i++) t += i === 2 ? 2000 : i === 3 ? 3000 : i <= 10 ? 2000 : i <= 20 ? 2500 : 3000;
  return Math.max(500, Math.round((t * cells) / 100 / 100) * 100);
}

function rand(rnd, n) { return Math.floor(rnd() * n); }

/** 一整盘：每列 rows 颗 */
export function makeBoard(C, R, colors, rnd = Math.random) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const cols = [];
    for (let c = 0; c < C; c++) {
      const col = [];
      for (let r = 0; r < R; r++) col.push(rand(rnd, colors));
      cols.push(col);
    }
    if (hasMoves(cols)) return cols;
  }
  return makeBoard(C, R, Math.max(2, colors - 1), rnd);
}

/** 无尽模式升起来的一行：稍微照顾一下，让它和上面那行有机会连上 */
export function makeRow(cols, C, colors, rnd = Math.random) {
  const row = [];
  for (let c = 0; c < C; c++) {
    const above = cols[c] && cols[c].length ? cols[c][0] : undefined;
    if (above !== undefined && rnd() < 0.3) row.push(above);
    else if (c > 0 && rnd() < 0.25) row.push(row[c - 1]);
    else row.push(rand(rnd, colors));
  }
  return row;
}

/** 无尽模式开局：底下 h 行 */
export function makeStart(C, h, colors, rnd = Math.random) {
  return makeBoard(C, h, colors, rnd);
}

/** 夸奖：一次消得多给点反馈 */
export function praiseFor(n) {
  if (n >= 20) return '不可思议！';
  if (n >= 15) return '完美！';
  if (n >= 10) return '太棒了！';
  if (n >= 7) return '很棒！';
  if (n >= 5) return '不错！';
  return '';
}
