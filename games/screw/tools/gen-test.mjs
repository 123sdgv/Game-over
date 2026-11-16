// 生成速度和基本数据：node games/screw/tools/gen-test.mjs [最多到第几关]
import { makeLevel } from '../levels.js';
const upto = +process.argv[2] || 30;
for (const aspect of [0.78, 0.95]) {
  for (let n = 1; n <= upto; n++) {
    const t0 = performance.now();
    const L = makeLevel(n, { aspect });
    const dt = performance.now() - t0;
    const deep = (() => { const memo = {}; const d = (i) => memo[i] ?? (memo[i] = 1 + Math.max(0, ...L.plates[i].above.map(d))); return Math.max(...L.plates.map((_, i) => d(i))); })();
    const sp = L.screws.filter((s) => s.c === -1).length;
    if (n <= 16 || n % 5 === 0) console.log(`a=${aspect} n=${n} screws=${L.screws.length} sp=${sp} plates=${L.plates.length} chain=${deep} r=${L.r.toFixed(1)} H=${L.H} ${dt.toFixed(0)}ms`);
  }
}
