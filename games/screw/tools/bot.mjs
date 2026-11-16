// 机器人试玩：不用技能，看不同水平的玩家能不能过。
//   node games/screw/tools/bot.mjs [到第几关] [每关几局]
// smart：优先放进已有工具箱（越满越先），其次变色钉，再开新箱子，最后才进暂存格；同级的随机挑
// random：能点的随便点
import { makeLevel } from '../levels.js';
import { newState, tap, freeScrews, placeFor, status } from '../logic.js';
const upto = +process.argv[2] || 20, runs = +process.argv[3] || 60;
let seed = 7;
const R = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
function play(level, smart) {
  const s = newState(level, 3);
  let stageUse = 0;
  while (status(s) === 'play') {
    const free = freeScrews(s).filter((sc) => placeFor(s, sc.c));
    let best = null, bs = -1e9;
    for (const sc of free) {
      const p = placeFor(s, sc.c);
      let sco = R();
      if (smart) {
        if (p.kind === 'box' && !p.bind) sco += 100 + s.boxes[p.i].n * 2;
        else if (p.kind === 'bank') sco += 80;
        else if (p.kind === 'box') sco += 50;
        else sco += 0;
      }
      if (sco > bs) { bs = sco; best = sc; }
    }
    if (placeFor(s, best.c).kind === 'stage') stageUse++;
    tap(s, best.id);
  }
  return [status(s) === 'win', stageUse];
}
for (const aspect of [0.78, 0.95]) {
  const line = [];
  for (let n = 1; n <= upto; n++) {
    const L = makeLevel(n, { aspect });
    let w1 = 0, w2 = 0, st = 0;
    for (let i = 0; i < runs; i++) { const [a, b] = play(L, true); w1 += a; st += b; w2 += play(L, false)[0]; }
    line.push(`${n}:${Math.round((w1 / runs) * 100)}%/${Math.round((w2 / runs) * 100)}%`);
  }
  console.log(`aspect ${aspect}  关:聪明/乱点 过关率`);
  console.log(line.join('  '));
}
