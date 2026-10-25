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
