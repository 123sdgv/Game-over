// 星星消消乐的规则（不碰界面，Node 里也能跑，机器人试打就靠它）。
//
// 棋盘 grid 是一维数组，下标 idx = r * C + c，r 从上往下数。格子里是一颗星星或 null：
//   { id, c: 颜色（彩虹星是 -1）, k: 种类（K.*）, lock: 有没有锁链 }
// ice[idx] 是这一格的冰（0–2 层）。
//
// play(s, a, b) 一口气把这一步连同所有连锁算完，状态立刻是最终结果（马上就能存档），
// 同时返回一串事件，界面照着事件慢慢播放动画：
//   swap     换位置
//   clear    一轮消除：kills（哪颗什么时候消）、unlocks（砸开锁链）、spawns（生成特效星）、effects（直线 / 爆炸 / 彩虹）
//   fall     下落补位：moves（已有的星星走什么路径）、news（新星星）
//   shuffle  没得换了，洗牌
//   bonus    过关以后，剩余步数变成特效星
export const K = { NONE: 0, H: 1, V: 2, BOMB: 3, RAINBOW: 4 };

export const BOMB_R = 2;       // 爆炸星：曼哈顿距离 2 以内（13 格）
export const BIG_BOMB_R = 4;   // 两颗爆炸星合体
export const ENERGY_GAIN = 3;  // 无尽：攒满一条送几步
export const ENERGY_START = 30; // 无尽：第一条要消几颗
export const ENERGY_STEP = 4;   // 无尽：每攒满一条，下一条多要几颗

/* ---------- 随机数：种子存在状态里，读档以后接着算 ---------- */
export function rand(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (s, n) => Math.floor(rand(s) * n);
const pick = (s, arr) => arr[randInt(s, arr.length)];

const newPiece = (s, c = pick(s, s.colors), k = K.NONE, lock = 0) => ({ id: s.nid++, c, k, lock });

export const idxOf = (s, c, r) => r * s.C + c;
export const colOf = (s, i) => i % s.C;
export const rowOf = (s, i) => Math.floor(i / s.C);
export const adjacent = (s, a, b) => {
  const d = Math.abs(a - b);
  return d === s.C || (d === 1 && rowOf(s, a) === rowOf(s, b));
};
const movable = (p) => !!p && !p.lock;

/* ---------- 找连成一排的 ---------- */

/** 全盘找：每组 { c, cells, runs: [{ dir: 'h'|'v', cells }] }，共用格子的横竖连线算一组（L / T 形） */
export function findMatches(s) {
  const { C, R, grid } = s;
  const runs = [];
  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      const p = grid[r * C + c];
      if (!p || p.c < 0) { c++; continue; }
      let e = c + 1;
      while (e < C && grid[r * C + e] && grid[r * C + e].c === p.c) e++;
      if (e - c >= 3) {
        const cells = [];
        for (let i = c; i < e; i++) cells.push(r * C + i);
        runs.push({ dir: 'h', cells, c: p.c });
      }
      c = e;
    }
  }
  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      const p = grid[r * C + c];
      if (!p || p.c < 0) { r++; continue; }
      let e = r + 1;
      while (e < R && grid[e * C + c] && grid[e * C + c].c === p.c) e++;
      if (e - r >= 3) {
        const cells = [];
        for (let i = r; i < e; i++) cells.push(i * C + c);
        runs.push({ dir: 'v', cells, c: p.c });
      }
      r = e;
    }
  }
  if (!runs.length) return [];
  // 并查集：共用格子的连线并成一组
  const parent = runs.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const owner = new Map();
  runs.forEach((run, i) => run.cells.forEach((cell) => {
    if (owner.has(cell)) parent[find(i)] = find(owner.get(cell));
    else owner.set(cell, i);
  }));
  const groups = new Map();
  runs.forEach((run, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, { c: run.c, cells: new Set(), runs: [] });
    const g = groups.get(root);
    run.cells.forEach((cell) => g.cells.add(cell));
    g.runs.push(run);
  });
  return [...groups.values()].map((g) => ({ c: g.c, cells: [...g.cells], runs: g.runs }));
}

/** 这组连线该生成什么特效星、放在哪一格（swapCells 是刚换的两格，优先放那儿） */
export function planSpecial(s, g, swapCells) {
  const { grid } = s;
  const longest = Math.max(...g.runs.map((run) => run.cells.length));
  const hasH = g.runs.some((run) => run.dir === 'h');
  const hasV = g.runs.some((run) => run.dir === 'v');
  let k = K.NONE;
  if (longest >= 5) k = K.RAINBOW;
  else if (hasH && hasV) k = K.BOMB;
  else if (longest === 4) k = g.runs[0].dir === 'h' ? K.V : K.H; // 横着连 → 竖着炸；竖着连 → 横着炸
  if (!k) return null;

  const ok = (i) => { const p = grid[i]; return p && !p.lock && p.k === K.NONE; };
  let at = -1;
  if (swapCells) for (const i of swapCells) if (g.cells.includes(i) && ok(i)) { at = i; break; }
  if (at < 0 && k === K.BOMB) {
    // L / T 形的拐点
    const h = g.runs.find((run) => run.dir === 'h'), v = g.runs.find((run) => run.dir === 'v');
    const cross = h.cells.find((i) => v.cells.includes(i));
    if (cross !== undefined && ok(cross)) at = cross;
  }
  if (at < 0) {
    const main = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
    const mid = main.cells[Math.floor((main.cells.length - 1) / 2)];
    if (ok(mid)) at = mid;
  }
  if (at < 0) at = g.cells.find(ok) ?? -1;
  if (at < 0) return null;
  return { at, k, c: k === K.RAINBOW ? -1 : g.c };
}

/* ---------- 能不能换 ---------- */

/** 只看某一格有没有连成排（比全盘找快，查可走步用） */
function matchedAt(s, i) {
  const { C, R, grid } = s;
  const p = grid[i];
  if (!p || p.c < 0) return 0;
  const r = rowOf(s, i), c = colOf(s, i), col = p.c;
  let h = 1, v = 1;
  for (let x = c - 1; x >= 0; x--) { const q = grid[r * C + x]; if (q && q.c === col) h++; else break; }
  for (let x = c + 1; x < C; x++) { const q = grid[r * C + x]; if (q && q.c === col) h++; else break; }
  for (let y = r - 1; y >= 0; y--) { const q = grid[y * C + c]; if (q && q.c === col) v++; else break; }
  for (let y = r + 1; y < R; y++) { const q = grid[y * C + c]; if (q && q.c === col) v++; else break; }
  const hh = h >= 3 ? h : 0, vv = v >= 3 ? v : 0;
  return hh + vv - (hh && vv ? 1 : 0);
}

/** a、b 两格互换有没有用（不改棋盘）。返回 0 没用，否则一个粗略的「有多好」分数 */
export function swapValue(s, a, b) {
  const { grid } = s;
  const pa = grid[a], pb = grid[b];
  if (!movable(pa) || !movable(pb)) return 0;
  if (pa.k && pb.k) return 30 + pa.k + pb.k;
  if (pa.k === K.RAINBOW || pb.k === K.RAINBOW) return 20;
  grid[a] = pb; grid[b] = pa;
  const m1 = matchedAt(s, a), m2 = matchedAt(s, b);
  grid[a] = pa; grid[b] = pb;
  if (!m1 && !m2) return 0;
  const bonus = (m) => (m >= 5 ? 15 : m === 4 ? 6 : 0);
  const sp = (p, m) => (m && p.k ? 4 : 0);
  return m1 + m2 + bonus(m1) + bonus(m2) + sp(pb, m1) + sp(pa, m2);
}

/** 所有有用的互换 [{ a, b, v }] */
export function allMoves(s) {
  const { C, R } = s;
  const out = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = r * C + c;
    if (c < C - 1) { const v = swapValue(s, i, i + 1); if (v) out.push({ a: i, b: i + 1, v }); }
    if (r < R - 1) { const v = swapValue(s, i, i + C); if (v) out.push({ a: i, b: i + C, v }); }
  }
  return out;
}

export function hasMove(s) {
  const { C, R } = s;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const i = r * C + c;
    if (c < C - 1 && swapValue(s, i, i + 1)) return true;
    if (r < R - 1 && swapValue(s, i, i + C)) return true;
  }
  return false;
}

/** 发呆提示：挑最好的一步，分数一样就随便挑（不动种子） */
export function bestMove(s) {
  const moves = allMoves(s);
  if (!moves.length) return null;
  const top = Math.max(...moves.map((m) => m.v));
  const best = moves.filter((m) => m.v === top);
  return best[Math.floor(Math.random() * best.length)];
}

/* ---------- 开局 ---------- */

/**
 * spec: { C, R, colors: [颜色编号], moves, goals: [{ type: 'color', c, need } | { type: 'ice', need } | { type: 'lock', need }],
 *         ice?: [每格几层], lock?: [每格 0/1], endless?: true, seed }
 */
export function newGame(spec) {
  const n = spec.C * spec.R;
  const s = {
    C: spec.C, R: spec.R, colors: spec.colors.slice(),
    grid: new Array(n).fill(null),
    ice: spec.ice ? spec.ice.slice() : new Array(n).fill(0),
    moves: spec.moves,
    goals: (spec.goals || []).map((g) => ({ ...g, got: 0 })),
    score: 0, seed: spec.seed | 0, nid: 1, endless: !!spec.endless,
    energy: 0, energyNeed: spec.energyNeed || 0,
    totalKills: 0, totalSpecials: 0, bestCombo: 0, usedMoves: 0,
  };
  fillStart(s, spec.lock);
  return s;
}

function fillStart(s, lock) {
  const { C, R } = s;
  for (let tries = 0; tries < 300; tries++) {
    s.grid = new Array(C * R).fill(null);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      const banned = new Set();
      if (c >= 2 && s.grid[i - 1].c === s.grid[i - 2].c) banned.add(s.grid[i - 1].c);
      if (r >= 2 && s.grid[i - C].c === s.grid[i - 2 * C].c) banned.add(s.grid[i - C].c);
      const opts = s.colors.filter((x) => !banned.has(x));
      s.grid[i] = newPiece(s, pick(s, opts), K.NONE, lock && lock[i] ? 1 : 0);
    }
    if (hasMove(s)) return;
  }
}

/* ---------- 下落补位 ---------- */

/** 往下掉、掉不下去就斜着滑，顶上没东西挡着的列补新星星。返回 { moves, news }，路径单位是格子 [x, y] */
export function gravity(s) {
  const { C, R, grid } = s;
  const paths = new Map();
  const news = [];
  const spawned = new Array(C).fill(0);
  const pt = (i) => [colOf(s, i), rowOf(s, i)];
  const step = (p, from, to) => {
    grid[to] = p; grid[from] = null;
    let rec = paths.get(p.id);
    if (!rec) { rec = { id: p.id, pts: [pt(from)] }; paths.set(p.id, rec); }
    const q = pt(to), L = rec.pts;
    // 同一方向接着走就只留端点
    if (L.length >= 2) {
      const [ax, ay] = L[L.length - 2], [bx, by] = L[L.length - 1];
      if (bx - ax === q[0] - bx && by - ay === q[1] - by) { L[L.length - 1] = q; return; }
      if (bx === ax && q[0] === bx) { L[L.length - 1] = q; return; }
    }
    L.push(q);
  };

  let changed = true;
  while (changed) {
    changed = false;
    // 直着掉
    for (let c = 0; c < C; c++) {
      for (let r = R - 1; r >= 0; r--) {
        const i = r * C + c;
        if (grid[i]) continue;
        let rr = r - 1;
        while (rr >= 0 && !grid[rr * C + c]) rr--;
        if (rr >= 0) {
          const p = grid[rr * C + c];
          if (!p.lock) { step(p, rr * C + c, i); changed = true; }
          // 上面是锁住的星星：挡着了，等下面斜着补
        } else {
          const p = newPiece(s);
          const start = -1 - spawned[c]++;
          grid[i] = p;
          const rec = { id: p.id, pts: [[c, start], [c, r]], piece: p };
          paths.set(p.id, rec);
          news.push(rec);
          changed = true;
        }
      }
    }
    if (changed) continue;
    // 斜着滑：只有直着补不上的空格才这样
    outer: for (let r = R - 1; r >= 1; r--) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        if (grid[i]) continue;
        const opts = [];
        if (c > 0 && movable(grid[i - C - 1])) opts.push(i - C - 1);
        if (c < C - 1 && movable(grid[i - C + 1])) opts.push(i - C + 1);
        if (!opts.length) continue;
        const from = opts.length > 1 ? opts[randInt(s, 2)] : opts[0];
        step(grid[from], from, i);
        changed = true;
        break outer;
      }
    }
  }
  const newIds = new Set(news.map((n) => n.id));
  return {
    moves: [...paths.values()].filter((p) => !newIds.has(p.id)).map(({ id, pts }) => ({ id, pts })),
    news: news.map(({ piece, pts }) => ({ piece: { ...piece }, pts })),
  };
}

/* ---------- 一轮消除 ---------- */

const mostCommon = (s) => {
  const count = new Map();
  for (const p of s.grid) if (p && p.c >= 0 && !p.lock) count.set(p.c, (count.get(p.c) || 0) + 1);
  if (!count.size) return s.colors[0];
  let best = -1, val = -1;
  for (const [c, n] of count) if (n > best || (n === best && rand(s) < 0.5)) { best = n; val = c; }
  return val;
};

const STAGGER = 0.032;

function clearStep(s, groups, { seed = null, swapCells = null, combo = 1, fireAll = false } = {}) {
  const { C, R, grid } = s;
  const kills = new Map();
  const unlocks = new Map();
  const protect = new Set();
  const effects = [];
  const spawns = [];
  const chips = [];
  const floats = [];
  const trig = [];

  const kill = (i, delay, merge = null, opts = {}) => {
    const p = grid[i];
    if (!p || protect.has(i) || kills.has(i)) return;
    if (p.lock) { if (!unlocks.has(i)) unlocks.set(i, { idx: i, id: p.id, delay }); return; }
    const k = opts.morph ?? p.k;
    const rec = { idx: i, id: p.id, c: p.c, k, delay, merge };
    if (opts.morph) { rec.morph = opts.morph; rec.morphAt = opts.morphAt; }
    if (opts.quiet) rec.quiet = true;
    kills.set(i, rec);
    if (k && !opts.noFire) trig.push({ idx: i, k, c: p.c, delay: delay + 0.05, id: p.id, color: opts.color });
  };
  const ringOrder = (center, cells) => {
    const cr = rowOf(s, center), cc = colOf(s, center);
    return cells.map((i) => ({ i, d: Math.hypot(rowOf(s, i) - cr, colOf(s, i) - cc) })).sort((a, b) => a.d - b.d);
  };
  const lineCells = (center, dir) => {
    const out = [];
    const r = rowOf(s, center), c = colOf(s, center);
    if (dir === 'h') for (let x = 0; x < C; x++) out.push({ i: r * C + x, d: Math.abs(x - c) });
    else for (let y = 0; y < R; y++) out.push({ i: y * C + c, d: Math.abs(y - r) });
    return out;
  };
  const fireLine = (center, dir, delay, c) => {
    effects.push({ type: 'line', idx: center, dir, delay, c });
    for (const { i, d } of lineCells(center, dir)) kill(i, delay + d * STAGGER);
  };
  const fireBomb = (center, radius, delay, c) => {
    effects.push({ type: 'bomb', idx: center, radius, delay, c });
    const r0 = rowOf(s, center), c0 = colOf(s, center);
    for (let r = Math.max(0, r0 - radius); r <= Math.min(R - 1, r0 + radius); r++) {
      for (let c1 = Math.max(0, c0 - radius); c1 <= Math.min(C - 1, c0 + radius); c1++) {
        const d = Math.abs(r - r0) + Math.abs(c1 - c0);
        if (d <= radius) kill(r * C + c1, delay + d * 0.04);
      }
    }
  };
  const colorTargets = (color, center) => {
    const cells = [];
    grid.forEach((p, i) => { if (p && p.c === color && i !== center) cells.push(i); });
    return ringOrder(center, cells);
  };
  const fireRainbow = (center, delay, color) => {
    const col = color ?? mostCommon(s);
    const list = colorTargets(col, center);
    effects.push({ type: 'rainbow', idx: center, delay, c: col, targets: list.map(({ i }, n) => ({ idx: i, delay: delay + 0.12 + n * 0.035 })) });
    list.forEach(({ i }, n) => kill(i, delay + 0.12 + n * 0.035));
  };

  // 玩家换的两颗都是特效（或者彩虹星换普通星）
  if (seed) {
    const { a, b } = seed;
    const pa = grid[b], pb = grid[a]; // 已经换过位置：a 的星星现在在 b
    const center = b;
    const rb = pa.k === K.RAINBOW ? pa : pb.k === K.RAINBOW ? pb : null;
    const other = rb === pa ? pb : pa;
    const consume = (i) => kill(i, 0, null, { noFire: true });
    if (pa.k === K.RAINBOW && pb.k === K.RAINBOW) {
      consume(a); consume(b);
      const cells = [];
      grid.forEach((p, i) => { if (p) cells.push(i); });
      const list = ringOrder(center, cells);
      effects.push({ type: 'nova', idx: center, delay: 0 });
      for (const { i, d } of list) kill(i, 0.1 + d * 0.07);
    } else if (rb) {
      const rbAt = rb === pa ? b : a, otherAt = rb === pa ? a : b;
      if (other.k === K.NONE) {
        consume(rbAt);
        const list = colorTargets(other.c, rbAt);
        const all = [{ i: otherAt, d: 0 }, ...list.filter(({ i }) => i !== otherAt)];
        effects.push({ type: 'rainbow', idx: rbAt, delay: 0, c: other.c, targets: all.map(({ i }, n) => ({ idx: i, delay: 0.12 + n * 0.035 })) });
        all.forEach(({ i }, n) => kill(i, 0.12 + n * 0.035));
      } else {
        // 彩虹 + 直线 / 爆炸：把那个颜色全变成特效星，再一颗颗引爆
        consume(rbAt);
        consume(otherAt);
        const list = colorTargets(other.c, rbAt).filter(({ i }) => i !== otherAt);
        const fireAt = 0.28 + list.length * 0.035;
        effects.push({ type: 'rainbow', idx: rbAt, delay: 0, c: other.c, morph: true, targets: list.map(({ i }, n) => ({ idx: i, delay: 0.1 + n * 0.035 })) });
        list.forEach(({ i }, n) => {
          const p = grid[i];
          if (p.lock || p.k) { kill(i, fireAt + n * 0.1); return; }
          const morph = other.k === K.BOMB ? K.BOMB : rand(s) < 0.5 ? K.H : K.V;
          kill(i, fireAt + n * 0.1, null, { morph, morphAt: 0.1 + n * 0.035 });
        });
      }
    } else if (pa.k === K.BOMB && pb.k === K.BOMB) {
      consume(a); consume(b);
      fireBomb(center, BIG_BOMB_R, 0.05, pa.c);
    } else if (pa.k === K.BOMB || pb.k === K.BOMB) {
      // 直线 + 爆炸：三行三列
      consume(a); consume(b);
      const r0 = rowOf(s, center), c0 = colOf(s, center);
      const col = (pa.k === K.BOMB ? pb : pa).c;
      effects.push({ type: 'bomb', idx: center, radius: 1, delay: 0, c: col, grow: true });
      for (let d = -1; d <= 1; d++) {
        if (r0 + d >= 0 && r0 + d < R) fireLine((r0 + d) * C + c0, 'h', 0.08, col);
        if (c0 + d >= 0 && c0 + d < C) fireLine(r0 * C + c0 + d, 'v', 0.08, col);
      }
    } else {
      // 直线 + 直线：一行一列
      consume(a); consume(b);
      fireLine(center, 'h', 0.03, pa.c);
      fireLine(center, 'v', 0.03, pb.c);
    }
  }

  // 过关以后：把场上的特效星一颗一颗放掉
  if (fireAll) {
    let n = 0;
    grid.forEach((p, i) => { if (p && p.k) { kill(i, n * 0.14); n++; } });
  }

  // 连成排的
  for (const g of groups) {
    const sp = planSpecial(s, g, swapCells);
    if (sp) { protect.add(sp.at); spawns.push({ ...sp, id: grid[sp.at].id }); }
    g.spawn = sp;
  }
  for (const g of groups) {
    const sp = g.spawn;
    for (const i of g.cells) {
      if (sp && sp.at === i) { continue; }
      kill(i, 0, sp ? sp.at : null);
    }
    // 连得越多一颗越值钱
    const size = g.cells.length;
    const pts = (size <= 3 ? 30 : size === 4 ? 60 : size === 5 ? 100 : 100 + (size - 5) * 30) * Math.min(combo, 8);
    s.score += pts;
    const mid = g.runs[0].cells[Math.floor(g.runs[0].cells.length / 2)];
    floats.push({ idx: sp ? sp.at : mid, pts, c: g.c });
  }

  // 连锁：先发生的先算
  while (trig.length) {
    trig.sort((x, y) => x.delay - y.delay);
    const t = trig.shift();
    if (t.k === K.H) fireLine(t.idx, 'h', t.delay, t.c);
    else if (t.k === K.V) fireLine(t.idx, 'v', t.delay, t.c);
    else if (t.k === K.BOMB) fireBomb(t.idx, BOMB_R, t.delay, t.c);
    else if (t.k === K.RAINBOW) fireRainbow(t.idx, t.delay, t.color);
  }

  // 结算到棋盘上
  const goalFor = (type, c) => s.goals.findIndex((g) => g.type === type && (type !== 'color' || g.c === c) && g.got < g.need);
  const chipIce = (i, rec) => {
    if (s.ice[i] <= 0) return;
    s.ice[i]--;
    s.score += 50;
    rec.ice = s.ice[i];
    if (s.ice[i] === 0) {
      const gi = goalFor('ice');
      if (gi >= 0) { s.goals[gi].got++; rec.iceGoal = gi; }
    }
  };
  const killList = [...kills.values()].sort((x, y) => x.delay - y.delay);
  for (const rec of killList) {
    grid[rec.idx] = null;
    chipIce(rec.idx, rec);
    if (rec.c >= 0) {
      const gi = goalFor('color', rec.c);
      if (gi >= 0) { s.goals[gi].got++; rec.goal = gi; }
    }
    if (rec.merge === null) s.score += groups.length ? 10 : 20 * Math.min(combo, 8);
  }
  s.totalKills += killList.length;
  const unlockList = [...unlocks.values()];
  for (const rec of unlockList) {
    grid[rec.idx].lock = 0;
    s.score += 50;
    const gi = goalFor('lock');
    if (gi >= 0) { s.goals[gi].got++; rec.goal = gi; }
  }
  for (const sp of spawns) {
    const p = grid[sp.at];
    p.k = sp.k;
    if (sp.k === K.RAINBOW) p.c = -1;
    const rec = { idx: sp.at };
    chipIce(sp.at, rec);
    if (rec.ice !== undefined) chips.push(rec);
    s.score += sp.k === K.RAINBOW ? 300 : sp.k === K.BOMB ? 200 : 120;
    s.totalSpecials++;
  }

  // 无尽：攒能量送步数
  let bonusMoves = 0;
  if (s.endless) {
    s.energy += killList.length;
    while (s.energy >= s.energyNeed) {
      s.energy -= s.energyNeed;
      s.energyNeed += ENERGY_STEP;
      s.moves += ENERGY_GAIN;
      bonusMoves += ENERGY_GAIN;
    }
  }

  s.bestCombo = Math.max(s.bestCombo, combo);
  return {
    t: 'clear', combo, kills: killList, unlocks: unlockList, effects, chips, floats,
    spawns: spawns.map((sp) => ({ idx: sp.at, id: sp.id, k: sp.k, c: sp.c })),
    bonusMoves, score: s.score,
  };
}

/** 一直消到没得消为止；没得换了就洗牌 */
function resolve(s, events, first) {
  let combo = first.combo || 1;
  let ctx = first;
  let groups = ctx.seed || ctx.fireAll ? findMatches(s) : ctx.groups;
  if (ctx.seed) groups = []; // 特效互换这一轮只算特效，换完的连线下一轮再算
  while (ctx || groups.length) {
    const step = clearStep(s, groups, { seed: ctx && ctx.seed, swapCells: ctx && ctx.swapCells, combo, fireAll: ctx && ctx.fireAll });
    events.push(step);
    const fall = gravity(s);
    if (fall.moves.length || fall.news.length) events.push({ t: 'fall', ...fall });
    ctx = null;
    combo++;
    groups = findMatches(s);
  }
  if (!s.finale) ensurePlayable(s, events);
}

/** 没得换了就洗一次 */
export function ensurePlayable(s, events = []) {
  if (hasMove(s)) return events;
  const { C, R, grid } = s;
  const slots = [];
  grid.forEach((p, i) => { if (movable(p)) slots.push(i); });
  const pieces = slots.map((i) => grid[i]);
  const shuffleOnce = () => {
    for (let i = pieces.length - 1; i > 0; i--) { const j = randInt(s, i + 1); [pieces[i], pieces[j]] = [pieces[j], pieces[i]]; }
    slots.forEach((i, n) => { grid[i] = pieces[n]; });
  };
  let tries = 0;
  do { shuffleOnce(); tries++; } while (tries < 400 && (findMatches(s).length || !hasMove(s)));
  if (findMatches(s).length || !hasMove(s)) {
    // 极端情况（比如星星太少凑不出来）：换颜色硬凑
    for (let tries2 = 0; tries2 < 400; tries2++) {
      slots.forEach((i) => { if (!grid[i].k) grid[i].c = pick(s, s.colors); });
      if (!findMatches(s).length && hasMove(s)) break;
    }
  }
  const moves = [];
  grid.forEach((p, i) => { if (p && !p.lock) moves.push({ id: p.id, to: i, c: p.c }); });
  events.push({ t: 'shuffle', moves });
  void C; void R;
  return events;
}

/* ---------- 走一步 ---------- */

/** 玩家换 a、b 两格。{ ok: false } 表示换了没用（步数不扣，棋盘不变） */
export function play(s, a, b) {
  const { grid } = s;
  if (!adjacent(s, a, b)) return { ok: false, why: 'far' };
  const pa = grid[a], pb = grid[b];
  if (!pa || !pb) return { ok: false, why: 'empty' };
  if (pa.lock || pb.lock) return { ok: false, why: 'lock' };

  const special = (pa.k && pb.k) || pa.k === K.RAINBOW || pb.k === K.RAINBOW;
  grid[a] = pb; grid[b] = pa;
  const events = [{ t: 'swap', a, b, ida: pa.id, idb: pb.id, combo: !!special }];
  if (special) {
    s.moves--; s.usedMoves++;
    resolve(s, events, { seed: { a, b }, combo: 1 });
    return { ok: true, events };
  }
  const groups = findMatches(s);
  if (!groups.length) {
    grid[a] = pa; grid[b] = pb;
    return { ok: false, why: 'nomatch' };
  }
  s.moves--; s.usedMoves++;
  resolve(s, events, { groups, swapCells: [b, a], combo: 1 });
  return { ok: true, events };
}

/* ---------- 输赢 ---------- */

export const goalsDone = (s) => s.goals.length > 0 && s.goals.every((g) => g.got >= g.need);

/** 'win' | 'lose' | 'play' */
export function status(s) {
  if (!s.endless && goalsDone(s)) return 'win';
  if (s.moves <= 0) return 'lose';
  return 'play';
}

/** 过关：剩下的步数变成直线星，全部放掉。一步一星最多 15 颗，多的步数直接换分 */
export const FINALE_MAX = 15;
export function finale(s) {
  const events = [];
  s.finale = true;
  const left = s.moves;
  s.moves = 0;
  s.score += left * 200;
  const slots = [];
  s.grid.forEach((p, i) => { if (p && !p.lock && p.k === K.NONE) slots.push(i); });
  const items = [];
  const n = Math.min(left, FINALE_MAX, slots.length);
  for (let i = 0; i < n; i++) {
    const j = randInt(s, slots.length);
    const idx = slots.splice(j, 1)[0];
    const p = s.grid[idx];
    p.k = rand(s) < 0.5 ? K.H : K.V;
    items.push({ idx, id: p.id, k: p.k, c: p.c });
  }
  if (left) events.push({ t: 'bonus', items, left, score: s.score });
  // 一轮一轮放，直到场上没有特效星
  for (let round = 0; round < 5; round++) {
    if (!s.grid.some((p) => p && p.k)) break;
    resolve(s, events, { fireAll: true, combo: 1 });
  }
  s.finale = false;
  return events;
}

/* ---------- 机器人 / 存档用 ---------- */
export const clone = (s) => ({
  ...s,
  grid: s.grid.map((p) => (p ? { ...p } : null)),
  ice: s.ice.slice(),
  goals: s.goals.map((g) => ({ ...g })),
  colors: s.colors,
});
