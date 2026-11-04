// 机器人试打：node games/starmatch/tools/bot.mjs [每关几局] [从第几关] [到第几关]
// 每一步把所有能走的都用「另一个随机种子」试一遍（看不到真正会掉什么），挑对目标最有用的。
// 输出每关要用多少步（中位数 / 80% / 90%）和现在定的步数下的过关率。
import { newGame, play, allMoves, clone, status, goalsDone, K } from '../logic.js';
import { levelSpec, LEVEL_COUNT, MOVES } from '../levels.js';

const RUNS = +(process.argv[2] || 24), FROM = +(process.argv[3] || 1), TO = +(process.argv[4] || LEVEL_COUNT);

export function evalState(a, b) {
  let v = 0;
  a.goals.forEach((g, i) => { v += (b.goals[i].got - g.got) * (g.type === 'color' ? 3 : 8); });
  v += (b.totalKills - a.totalKills) * 0.3;
  const specials = (s) => s.grid.reduce((n, p) => n + (p && p.k ? (p.k === K.RAINBOW ? 5 : p.k === K.BOMB ? 3 : 2) : 0), 0);
  v += (specials(b) - specials(a)) * 2.5;
  return v;
}

function botMove(s, salt) {
  const moves = allMoves(s);
  let best = null, bestV = -1e9;
  for (const m of moves) {
    const t = clone(s);
    t.seed = (salt * 7919 + m.a * 131 + m.b) | 0;
    const r = play(t, m.a, m.b);
    if (!r.ok) continue;
    const v = evalState(s, t) + Math.random() * 0.2;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

function runOnce(n, seed) {
  const spec = levelSpec(n);
  const s = newGame({ ...spec, moves: 1000, seed });
  let used = 0;
  while (!goalsDone(s) && used < 400) {
    const m = botMove(s, used + seed);
    if (!m) throw new Error('没有可走的步 第' + n + '关');
    const r = play(s, m.a, m.b);
    if (!r.ok) throw new Error('play 失败');
    used++;
  }
  return used;
}

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const table = [];
for (let n = FROM; n <= TO; n++) {
  const res = [];
  for (let i = 0; i < RUNS; i++) res.push(runOnce(n, 1000 * n + i * 17 + 3));
  res.sort((a, b) => a - b);
  const m = MOVES[n - 1];
  const pass = res.filter((x) => x <= m).length / RUNS;
  table.push({ n, med: pct(res, 0.5), p80: pct(res, 0.8), p90: pct(res, 0.9), max: res[res.length - 1] });
  console.log(`第${String(n).padStart(2)}关  中位 ${String(pct(res, 0.5)).padStart(3)}  80% ${String(pct(res, 0.8)).padStart(3)}  90% ${String(pct(res, 0.9)).padStart(3)}  最多 ${String(res[res.length - 1]).padStart(3)}  现定 ${String(m).padStart(3)}  过关率 ${(pass * 100).toFixed(0)}%`);
}
// 建议步数：人没机器人算得快，前面的关多留余地
const factor = (n) => (n <= 6 ? 1.7 : n <= 15 ? 1.5 : n <= 25 ? 1.35 : 1.25);
const round2 = (x) => Math.round(x / 2) * 2;
console.log('建议 MOVES:');
console.log(JSON.stringify(table.map((t) => Math.max(14, round2(t.p90 * factor(t.n))))));
