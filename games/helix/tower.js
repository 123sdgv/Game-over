// 螺旋跳跃：塔的形状和关卡生成（只有规则，不画东西）。
//   一层平台分成 SLICES 片：0 = 缺口，1 = 普通，2 = 红色（碰到就输）。
//   角度从正前方（+z，朝镜头）开始，往右（+x）为正。
//   第 i 层平台的顶面在 y = -i * GAP_Y。
export const SLICES = 12;
export const SLICE = (Math.PI * 2) / SLICES;
export const TAU = Math.PI * 2;
export const PILLAR_R = 0.8;
export const R_IN = 0.84, R_OUT = 2.95;
export const BALL_R = 0.33;
export const BALL_DIST = 1.95;            // 小球离柱子中心多远
export const PLAT_H = 0.38;               // 平台厚度
export const GAP_Y = 3.7;                 // 上下两层平台的间距
export const GAP = 0, SAFE = 1, RED = 2;

export const topY = (i) => -i * GAP_Y;
export const wrap = (a) => ((a % TAU) + TAU) % TAU;

/** 可复现的随机数 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 闯关第 n 关一共几层（最后一层是终点） */
export const levelLength = (n) => 14 + Math.floor(Math.min(n, 30) * 1.2);

/** 难度 0 … 1 */
function difficulty(mode, level, i, total) {
  if (mode === 'level') {
    const base = Math.min(1, (level - 1) / 24);
    const ramp = total ? i / total : 0;                 // 一关里越往下越难一点
    return Math.min(1, base * 0.85 + ramp * (0.12 + base * 0.15));
  }
  return Math.min(1, i / 170);
}

export class Tower {
  /**
   * @param {{seed:number, mode:'level'|'endless', level:number}} o
   */
  constructor({ seed, mode, level }) {
    this.seed = seed; this.mode = mode; this.level = level;
    this.total = mode === 'level' ? levelLength(level) : Infinity;   // 终点那一层的序号
    this.plats = [];
  }

  /** 第 i 层，没生成过就现生成 */
  get(i) {
    while (this.plats.length <= i) this.plats.push(this.make(this.plats.length));
    return this.plats[i];
  }

  /** 第 i 层在 t 秒时自己转了多少（有的层会左右摆） */
  spinAt(p, t) {
    return p.spin ? p.spin.amp * Math.sin(t * p.spin.w + p.spin.ph) : 0;
  }

  /** 小球（在正前方）落在第 i 层时，对着哪一片 */
  sliceUnder(p, towerRot, t, off = 0) {
    const local = wrap(-towerRot - this.spinAt(p, t) - p.rot + off);
    return Math.floor(local / SLICE) % SLICES;
  }

  /** 小球中心对着的那片是什么；红色的边上宽容一点点 */
  kindUnder(p, towerRot, t) {
    if (p.finish) return SAFE;
    const k = p.slices[this.sliceUnder(p, towerRot, t)];
    if (k !== RED) return k;
    const tol = 0.07;   // 差不多 4°
    const a = p.slices[this.sliceUnder(p, towerRot, t, -tol)];
    const b = p.slices[this.sliceUnder(p, towerRot, t, tol)];
    return a === SAFE || b === SAFE ? SAFE : RED;
  }

  make(i) {
    const r = rng(this.seed * 7919 + i * 104729 + 17);
    const finish = i === this.total;
    const p = { i, slices: new Array(SLICES).fill(SAFE), rot: 0, spin: null, finish, theme: 0 };
    if (finish) return p;

    const d = difficulty(this.mode, this.level, i, this.total);
    p.rot = Math.floor(r() * SLICES) * SLICE;

    // 缺口：前面几层宽一点；难了以后只有 1 片宽，偶尔有两个缺口
    const gaps = r() < 0.32 - d * 0.18 ? 2 : 1;
    const used = new Set();
    const place = (start, len, kind) => { for (let k = 0; k < len; k++) { p.slices[(start + k) % SLICES] = kind; used.add((start + k) % SLICES); } };
    for (let g = 0; g < gaps; g++) {
      const len = r() < 0.75 - d * 0.6 ? 2 : 1;
      let s = Math.floor(r() * SLICES);
      for (let tries = 0; tries < 12 && (used.has(s) || used.has((s + len - 1) % SLICES)); tries++) s = (s + 3) % SLICES;
      place(s, len, GAP);
    }

    // 第一层：小球落下去的地方一定是普通平台，而且离缺口有点距离
    if (i === 0) {
      p.slices.fill(SAFE);
      p.rot = 0;
      place(4, 2, GAP);
      return p;
    }

    // 红色：数量随难度增加；第 1、2 层不放
    if (i >= 2) {
      const want = Math.round(d * 4.2 + r() * (1 + d * 1.6) - 0.4 + (d > 0.15 ? 0.6 : 0));
      const safeIdx = () => p.slices.map((k, n) => (k === SAFE ? n : -1)).filter((n) => n >= 0);
      let n = Math.max(0, Math.min(want, safeIdx().length - 3));
      // 难一点以后，经常在缺口旁边放红块（最经典的陷阱）
      if (n > 0 && d > 0.2 && r() < 0.35 + d * 0.4) {
        const gi = p.slices.indexOf(GAP);
        const side = r() < 0.5 ? -1 : 1;
        let j = gi;
        while (p.slices[(j + SLICES) % SLICES] === GAP) j += side;
        j = (j + SLICES) % SLICES;
        if (p.slices[j] === SAFE) { p.slices[j] = RED; n--; }
      }
      // 剩下的成串放（1～2 片一串）
      let guard = 0;
      while (n > 0 && guard++ < 40) {
        const cand = safeIdx();
        const s = cand[Math.floor(r() * cand.length)];
        const len = n >= 2 && r() < 0.45 ? 2 : 1;
        for (let k = 0; k < len; k++) if (p.slices[(s + k) % SLICES] === SAFE) { p.slices[(s + k) % SLICES] = RED; n--; }
      }
      // 至少留 3 片普通平台
      while (p.slices.filter((k) => k === SAFE).length < 3) {
        const reds = p.slices.map((k, n2) => (k === RED ? n2 : -1)).filter((n2) => n2 >= 0);
        p.slices[reds[Math.floor(r() * reds.length)]] = SAFE;
      }
    }

    // 上一层缺口正下方：简单的时候不放红色，免得一掉下来就输
    const prev = this.plats[i - 1];
    if (prev && !prev.finish && !prev.spin) {
      const easy = d < 0.45 || r() > d * 0.45;
      if (easy) {
        for (let k = 0; k < SLICES; k++) {
          if (prev.slices[k] !== GAP) continue;
          const a = wrap(k * SLICE + SLICE / 2 + prev.rot);      // 上一层缺口中间的「世界里的」角度（塔不转的话）
          for (const da of [-SLICE * 0.45, 0, SLICE * 0.45]) {
            const idx = Math.floor(wrap(a + da - p.rot) / SLICE) % SLICES;
            if (p.slices[idx] === RED) p.slices[idx] = SAFE;
          }
        }
      }
    }

    // 会自己左右摆的层
    if (i >= 4 && d > 0.22 && r() < 0.1 + d * 0.32) {
      p.spin = { amp: (0.35 + r() * 0.55) * (0.6 + d * 0.6), w: (Math.PI * 2) / (3.6 - d * 1.4 + r() * 1.2), ph: r() * TAU };
    }
    return p;
  }
}
