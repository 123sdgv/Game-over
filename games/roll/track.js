// 轨道数据（不涉及画面）：
//   一行 = 1 米。每个块 { x: 横向位置(-3..3), y: 高度, z: 起点米数, w: 宽度, kind: 'block'|'coin'|'barrier' }
// 同一个种子出同一条路（存档靠它），无尽模式走绝对行数。

// 简单的可复现随机数（mulberry32）
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANES = [-1.6, 0, 1.6];
const BLOCK_D = 2;        // 一块多少米
const HOP_H = 0.9;        // 球能跳过高 barrier 的高度

/** 闯关第 n 关：长度随关卡变长，难度慢慢上去 */
export function levelTrack(level, seed) {
  const r = rng(seed);
  const len = 220 + level * 60;            // 总长度（米）
  const rows = Math.floor(len / BLOCK_D);
  const pieces = [];

  // 每隔 3~7 块换一次路，中间铺满安全区；难度 = 缺口/障碍概率
  const hard = Math.min(1, 0.18 + level * 0.05);
  let lane = 1; // 从中间开始
  let z = 8;    // 前面留 8 米空跑

  while (z < len) {
    const roll = r();
    if (roll < hard * 0.45) {
      // 缺口：这一格三个道都空（必须跳）
      z += BLOCK_D * (1 + Math.floor(r() * 2));
    } else if (roll < hard) {
      // 单道 barrier（可以跳过，也可以换道）
      const l = Math.floor(r() * 3);
      pieces.push({ x: LANES[l], y: 0, z, w: 1.4, kind: 'barrier' });
      z += BLOCK_D;
    } else {
      // 铺路：随机 1~3 条道有块，其他空（可以换道）
      const open = Math.max(1, 3 - Math.floor(r() * 3));
      const picks = [0, 1, 2].sort(() => r() - 0.5).slice(0, open);
      for (const p of picks) pieces.push({ x: LANES[p], y: 0, z, w: 1.4, kind: 'block' });
      // 金币摆在空出来的道上
      if (r() < 0.5) {
        const empty = [0, 1, 2].filter((l) => !picks.includes(l));
        if (empty.length) {
          const l = empty[Math.floor(r() * empty.length)];
          pieces.push({ x: LANES[l], y: 0.55, z: z + BLOCK_D / 2, w: 0.5, kind: 'coin' });
        }
      }
      // 偶尔换主路线
      if (r() < 0.25) lane = Math.max(0, Math.min(2, lane + (r() < 0.5 ? -1 : 1)));
      z += BLOCK_D;
    }
  }
  return { pieces, length: len, seed, level };
}

/** 无尽模式：从 from 米开始生成 to 米，靠 trackId 区分章节（每 400 米换一次种子） */
export function endlessTrack(trackId, fromM, toM) {
  const seed = (trackId * 2654435761) >>> 0;
  const r = rng(seed);
  const pieces = [];
  const start = Math.floor(fromM / BLOCK_D) * BLOCK_D;
  // 用行号做第二重随机，保证同一行无论何时生成都一样
  let z = start;
  while (z < toM) {
    const rowR = rng((seed ^ (z * 97)) >>> 0)();
    if (rowR < 0.14) {
      z += BLOCK_D; // 缺口
    } else if (rowR < 0.3) {
      const l = Math.floor(rowR * 10) % 3;
      pieces.push({ x: LANES[l], y: 0, z, w: 1.4, kind: 'barrier' });
      z += BLOCK_D;
    } else {
      const open = Math.max(1, 3 - Math.floor(rowR * 10) % 3);
      const picks = [0, 1, 2].sort((a, b) => ((rowR * 7919 * (a + 2)) % 1) - ((rowR * 7919 * (b + 2)) % 1)).slice(0, open);
      for (const p of picks) pieces.push({ x: LANES[p], y: 0, z, w: 1.4, kind: 'block' });
      if (rowR < 0.65) {
        const empty = [0, 1, 2].filter((l) => !picks.includes(l));
        if (empty.length) {
          const l = empty[Math.floor(rowR * 100) % empty.length];
          pieces.push({ x: LANES[l], y: 0.55, z: z + BLOCK_D / 2, w: 0.5, kind: 'coin' });
        }
      }
      z += BLOCK_D;
    }
  }
  return pieces;
}

export const trackConst = { LANES, BLOCK_D, HOP_H };
