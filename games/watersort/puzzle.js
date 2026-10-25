// 倒水谜题的规则、出题和求解（不碰界面，方便单独测试）
// 瓶子用数组表示，从瓶底到瓶口；颜色是 0..n-1 的数字。

/** 瓶口那一段连续同色有几格 */
export function topRun(b) {
  if (!b.length) return 0;
  const c = b[b.length - 1];
  let n = 0;
  for (let i = b.length - 1; i >= 0 && b[i] === c; i--) n++;
  return n;
}

export const isDone = (b, cap) => b.length === 0 || (b.length === cap && topRun(b) === cap);
export const solved = (bottles, cap) => bottles.every((b) => isDone(b, cap));

/** 能不能从 a 倒进 b，能的话返回倒几格 */
export function pourAmount(bottles, a, b, cap) {
  if (a === b) return 0;
  const src = bottles[a], dst = bottles[b];
  if (!src.length || dst.length >= cap) return 0;
  if (dst.length && dst[dst.length - 1] !== src[src.length - 1]) return 0;
  return Math.min(topRun(src), cap - dst.length);
}

/** 有没有"有意义"的一步（排除把已经倒好的瓶子挪来挪去） */
export function hasUsefulMove(bottles, cap) {
  for (let a = 0; a < bottles.length; a++) {
    const src = bottles[a];
    if (isDone(src, cap)) continue;
    for (let b = 0; b < bottles.length; b++) {
      if (!pourAmount(bottles, a, b, cap)) continue;
      if (!bottles[b].length && topRun(src) === src.length) continue; // 单色瓶倒进空瓶，没变化
      return true;
    }
  }
  return false;
}

const key = (bottles) => bottles.map((b) => b.join(',')).sort().join('|');

/** 深度优先找一个解；超过 limit 个状态就放弃（返回 null） */
export function solve(start, cap, limit = 150000) {
  const seen = new Set();
  let nodes = 0;
  const path = [];
  const dfs = (st) => {
    if (solved(st, cap)) return true;
    if (++nodes > limit) return false;
    const k = key(st);
    if (seen.has(k)) return false;
    seen.add(k);
    const moves = [];
    for (let a = 0; a < st.length; a++) {
      const src = st[a];
      if (!src.length || isDone(src, cap)) continue;
      const run = topRun(src);
      let emptyTried = false;
      for (let b = 0; b < st.length; b++) {
        const n = pourAmount(st, a, b, cap);
        if (!n) continue;
        const toEmpty = !st[b].length;
        if (toEmpty && (run === src.length || emptyTried)) continue; // 空瓶都一样，只试一个
        if (toEmpty) emptyTried = true;
        // 优先：能倒完整一段、倒进同色瓶
        const score = (toEmpty ? 0 : 2) + (n === run ? 1 : 0);
        moves.push({ a, b, n, score });
      }
    }
    moves.sort((x, y) => y.score - x.score);
    for (const m of moves) {
      const next = st.map((x) => x.slice());
      for (let i = 0; i < m.n; i++) next[m.b].push(next[m.a].pop());
      path.push([m.a, m.b]);
      if (dfs(next)) return true;
      path.pop();
      if (nodes > limit) return false;
    }
    return false;
  };
  return dfs(start.map((b) => b.slice())) ? path.slice() : null;
}

function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 出一道题：colors 种颜色、每瓶 cap 格、empty 个空瓶。
 * 随机打乱后用求解器确认有解；不太乱的（开局就有倒好的瓶子）重抽。
 */
export function generate(colors, cap, empty, rnd = Math.random) {
  let best = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const units = [];
    for (let c = 0; c < colors; c++) for (let i = 0; i < cap; i++) units.push(c);
    shuffle(units, rnd);
    const bottles = [];
    for (let i = 0; i < colors; i++) bottles.push(units.slice(i * cap, (i + 1) * cap));
    // 太简单的局面：有瓶子一开始就倒好了，或者瓶口一段占了大半瓶
    if (bottles.some((b) => topRun(b) >= Math.max(2, cap - 1))) continue;
    for (let i = 0; i < empty; i++) bottles.push([]);
    const sol = solve(bottles, cap);
    if (sol) return { bottles, steps: sol.length };
    best = best || bottles;
  }
  // 实在找不到确定有解的，就多给一个空瓶（几乎总是有解）
  const fallback = best || generate(colors, cap, empty + 1, rnd).bottles;
  if (best) fallback.push([]);
  return { bottles: fallback, steps: null };
}

/* ---------- 无限模式 ---------- */
const doneCount = (bottles, cap) => bottles.filter((b) => b.length === cap && topRun(b) === cap).length;

/** 从当前局面出发，能不能再倒好至少一瓶（全知视角搜索） */
export function canComplete(start, cap, limit = 40000) {
  const base = doneCount(start, cap);
  const seen = new Set();
  let nodes = 0;
  const stack = [start.map((b) => b.slice())];
  while (stack.length) {
    const st = stack.pop();
    if (doneCount(st, cap) > base) return true;
    if (++nodes > limit) return false;
    const k = key(st);
    if (seen.has(k)) continue;
    seen.add(k);
    for (let a = 0; a < st.length; a++) {
      const src = st[a];
      if (!src.length || isDone(src, cap)) continue;
      const run = topRun(src);
      let emptyTried = false;
      for (let b = 0; b < st.length; b++) {
        const n = pourAmount(st, a, b, cap);
        if (!n) continue;
        const toEmpty = !st[b].length;
        if (toEmpty && (run === src.length || emptyTried)) continue;
        if (toEmpty) emptyTried = true;
        const next = st.map((x) => x.slice());
        for (let i = 0; i < n; i++) next[b].push(next[a].pop());
        stack.push(next);
      }
    }
  }
  return false;
}

/** 按"凑整"的思路挑颜色：差几格就能凑满一瓶的颜色更容易来 */
function drawUnits(counts, cap, colors, n, rnd) {
  const c = counts.slice();
  const out = [];
  for (let k = 0; k < n; k++) {
    const w = [];
    let sum = 0;
    for (let i = 0; i < colors; i++) {
      const r = c[i] % cap;
      const wi = r ? 1 + (cap - r) : c[i] ? 0.35 : 0.7;
      w.push(wi); sum += wi;
    }
    let x = rnd() * sum, pick = 0;
    while (x > w[pick]) { x -= w[pick]; pick++; }
    out.push(pick); c[pick]++;
  }
  return out;
}

const countColors = (bottles, colors) => {
  const c = new Array(colors).fill(0);
  bottles.forEach((b) => b.forEach((x) => c[x]++));
  return c;
};

/** 无限模式开局：filled 瓶满的 + empty 个空瓶 */
export function infiniteStart(colors, cap, filled, empty, rnd = Math.random) {
  for (let attempt = 0; attempt < 40; attempt++) {
    // 先保证每种颜色都整瓶出现，多出来的瓶数随机重复
    const sets = [];
    for (let i = 0; i < filled; i++) sets.push(i < colors ? i : Math.floor(rnd() * colors));
    const units = [];
    sets.forEach((c) => { for (let i = 0; i < cap; i++) units.push(c); });
    shuffle(units, rnd);
    const bottles = [];
    for (let i = 0; i < filled; i++) bottles.push(units.slice(i * cap, (i + 1) * cap));
    if (bottles.some((b) => topRun(b) >= Math.max(2, cap - 1))) continue;
    for (let i = 0; i < empty; i++) bottles.push([]);
    shuffle(bottles, rnd);
    if (canComplete(bottles, cap)) return bottles;
  }
  return infiniteStart(colors, cap, filled, empty + 1, rnd);
}

/** 倒好的瓶子拿走以后，补一个新瓶子（放在 slot）；保证之后还能再倒好一瓶 */
export function infiniteNext(bottles, slot, colors, cap, rnd = Math.random) {
  const rest = bottles.map((b, i) => (i === slot ? [] : b));
  const counts = countColors(rest, colors);
  let last = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const nb = drawUnits(counts, cap, colors, cap, rnd);
    if (topRun(nb) >= Math.max(2, cap - 1)) continue;
    const next = rest.map((b) => b.slice());
    next[slot] = nb;
    last = nb;
    if (canComplete(next, cap, 25000)) return nb;
  }
  // 局面已经很乱、怎么补都救不回来：这次送一个空瓶，给玩家腾地方
  const withEmpty = rest.map((b) => b.slice());
  if (canComplete(withEmpty, cap, 25000)) return [];
  return last || drawUnits(counts, cap, colors, cap, rnd);
}
