// 轨道数据（不涉及画面）：
//   一行 = 1 米，横着 4 条轨道（4 格悬浮方块）。缺格子就是洞，块块（障碍）和金币挂在行上。
//   同一个种子生成出来的轨道一模一样 —— 存档只要记住种子和走到哪儿，就能原样恢复。
//   没有跳跃：所有块块和洞都留了能左右绕过去的路。
export const COLS = 4;                              // 4 条轨道，小球只停在某一条的正中间
export const BALL_R = 0.32;
export const colX = (c) => c - (COLS - 1) / 2;      // 第 c 条轨道中心的 x（-1.5 … 1.5）
export const colOf = (x) => Math.max(0, Math.min(COLS - 1, Math.floor(x + COLS / 2)));
const LANES = [...Array(COLS).keys()];

/** 块块此刻的横向位置：滑块在相邻的两三条轨道之间来回滑，到头停一下 */
export const obX = (o, t) => {
  if (o.kind !== 'slider') return o.x0;
  const k = Math.max(-1, Math.min(1, 1.7 * Math.sin((t * Math.PI * 2) / o.period + o.phase)));
  return o.x0 + o.amp * k;
};

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 闯关：第 n 关有多少行（米） */
export const levelRows = (n) => Math.min(760, 230 + n * 30);

const FULL = LANES.map(() => 1);
const NONE = LANES.map(() => 0);
const lerp = (a, b, t) => a + (b - a) * t;

export class Track {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {'level'|'endless'} o.mode
   * @param {number} o.level
   * @param {(row:number)=>number} o.speedAt  这一行时大概的速度（决定块块隔多远）
   */
  constructor({ seed, mode, level = 1, speedAt }) {
    this.rand = mulberry(seed);
    this.mode = mode;
    this.level = level;
    this.speedAt = speedAt;
    this.rows = [];
    this.safe = [];        // 安全的行（一段休息区的开头），读档时退回到这里
    this.nid = 1;
    this.last = '';
    this.finish = mode === 'level' ? levelRows(level) : Infinity;
    this.pend = [];
    this.add(14, FULL);
    this.safe.push(0);
  }

  r() { return this.rand(); }
  /** 按时间算间隔：速度越快，隔的行数越多，人的反应时间差不多 */
  rows4(sec) { return Math.max(3, Math.round(this.speedAt(this.rows.length) * sec)); }
  int(a, b) { return a + Math.floor(this.rand() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }

  /** 难度 0 … 1 */
  diff(row) {
    if (this.mode === 'level') return Math.min(1, 0.04 + (this.level - 1) * 0.075 + (row / this.finish) * 0.08);
    return Math.min(1, row / 1600);
  }

  has(row, col) {
    const r = this.rows[row];
    return !!(r && r.t[col]);
  }

  ensure(n) {
    while (this.rows.length < n) this.piece();
  }

  add(n, tiles) {
    const start = this.rows.length;
    for (let i = 0; i < n; i++) this.rows.push({ t: tiles.slice(), obs: [], coins: [] });
    return start;
  }

  ob(row, o) {
    o.id = this.nid++;
    o.s = row + (o.off || 0) + (1 - o.d) / 2;   // 在这一行里居中
    o.x0 = o.x;
    this.rows[row].obs.push(o);
    return o;
  }

  // 金币先记下来，这一段都生成完再放（后面的行可能还没加出来）
  coin(row, x, y = 0) {
    this.pend.push([row, x, y]);
  }

  line(from, to, col) {
    for (let r = from; r < to; r += 2) this.coin(r, colX(col));
  }

  /* ------------------------------------------------------------------ */

  piece() {
    const n = this.rows.length;
    if (n > this.finish - 34) {           // 快到终点：一路平坦冲过终点线
      this.add(Math.max(30, this.finish + 90 - n), FULL);
      return;
    }
    const d = this.diff(n);
    // 休息区
    const rest = this.rows4(lerp(0.62, 0.3, d)) + (this.r() < 0.3 ? 1 : 0);
    const s = this.add(rest, FULL);
    this.safe.push(s);
    if (this.r() < 0.45) this.line(s + 1, s + rest, this.int(0, COLS - 1));

    let table = [
      ['cubes', 3, 0],
      ['holes', 2.2, 0],
      ['walls', 2, 0.06],
      ['bridge', 2, 0.1],
      ['sliders', 1.6, 0.25],
      ['slalom', 1.6, 0.3],
    ].filter(([, , min]) => d >= min);
    if (table.length > 1) table = table.filter(([k]) => k !== this.last);   // 别连着两段一样
    let total = table.reduce((a, t) => a + t[1], 0);
    let x = this.r() * total, kind = table[0][0];
    for (const [k, w] of table) { if ((x -= w) <= 0) { kind = k; break; } }
    this.last = kind;
    this[kind](d);
    for (const [row, x, y] of this.pend) {
      const r = this.rows[row];
      if (r && r.t[colOf(x)]) r.coins.push({ x, y, taken: false });
    }
    this.pend = [];
  }

  /** 零散的方块：左右绕开 */
  cubes(d) {
    const len = this.rows4(1.6) + this.int(0, 5) + Math.round(d * 8);
    const s = this.add(len, FULL);
    const step = this.rows4(lerp(0.5, 0.3, d));
    let path = this.int(0, COLS - 1);
    for (let r = s + 2, count = 1; r < s + len - 1; r += step + this.int(0, 1) + (count > 1 ? 1 : 0)) {
      count = d > 0.75 && this.r() < 0.3 ? 3 : d > 0.35 && this.r() < 0.55 ? 2 : 1;
      const cols = LANES.slice().sort(() => this.r() - 0.5).slice(0, count);
      cols.forEach((c) => this.ob(r, { kind: 'cube', x: colX(c), w: 0.8, d: 0.8, h: 0.8, color: this.pick([0, 1, 2]) }));
      // 金币走没被挡住、离上一串最近的那一列
      const free = LANES.filter((c) => !cols.includes(c)).sort((a, b) => Math.abs(a - path) - Math.abs(b - path));
      path = free[0];
      this.coin(r - 1, colX(path)); this.coin(r, colX(path)); this.coin(r + 1, colX(path));
    }
  }

  /** 零散的洞：绕开 */
  holes(d) {
    const len = this.rows4(1.6) + this.int(0, 6) + Math.round(d * 6);
    const s = this.add(len, FULL);
    let path = this.int(0, COLS - 1);
    const hstep = this.rows4(lerp(0.4, 0.28, d));
    for (let r = s + 1; r < s + len - 3; r += hstep + this.int(0, 1)) {
      const n = d > 0.5 && this.r() < 0.5 ? 2 : 1;
      const deep = this.r() < 0.5 ? 2 : 1;
      const cols = LANES.slice().sort(() => this.r() - 0.5).slice(0, n);
      for (const c of cols) for (let k = 0; k < deep; k++) this.rows[r + k].t[c] = 0;
      const free = LANES.filter((c) => !cols.includes(c)).sort((a, b) => Math.abs(a - path) - Math.abs(b - path));
      path = free[0];
      for (let k = 0; k < deep; k++) this.coin(r + k, colX(path));
    }
  }

  /** 窄桥：只剩一两列，中间拐一下 */
  bridge(d) {
    const w = d < 0.4 ? 2 : this.r() < 0.5 ? 1 : 2;
    const segs = 1 + this.int(1, 2);
    let c = this.int(0, COLS - w);
    this.add(2, FULL);
    for (let i = 0; i < segs; i++) {
      const len = this.rows4(0.5) + this.int(0, 3);
      const t = NONE.slice();
      for (let k = 0; k < w; k++) t[c + k] = 1;
      const s = this.add(len, t);
      this.line(s, s + len, c + Math.floor(w / 2));
      if (i < segs - 1) {
        // 换到旁边：有 3 行两边都在，来得及挪过去
        let nc;
        do { nc = Math.max(0, Math.min(COLS - w, c + this.pick(d > 0.6 ? [-2, -1, 1, 2] : [-1, 1]))); } while (nc === c);
        const t2 = NONE.slice();
        for (let k = Math.min(c, nc); k < Math.max(c, nc) + w; k++) t2[k] = 1;
        this.add(this.rows4(0.28), t2);
        c = nc;
      }
    }
    this.add(2, FULL);
  }

  /** 墙上开个口子：钻过去 */
  walls(d) {
    const count = 2 + (this.r() < 0.5 ? 1 : 0);
    let oc = this.int(0, COLS - 1);
    for (let i = 0; i < count; i++) {
      this.add(i ? this.rows4(lerp(0.85, 0.55, d)) : 4, FULL);
      const ow = d < 0.5 ? 2 : this.r() < 0.5 ? 1 : 2;
      if (i) {
        let n;
        do { n = this.int(0, COLS - ow); } while (n === oc || Math.abs(n - oc) > 3);
        oc = n;
      } else oc = Math.min(oc, COLS - ow);
      const r = this.add(1, FULL);
      const H = 1.55;
      if (oc > 0) this.ob(r, { kind: 'wall', x: colX(0) - 0.5 + oc / 2, w: oc - 0.04, d: 0.5, h: H, color: 0 });
      const rightCols = COLS - oc - ow;
      if (rightCols > 0) this.ob(r, { kind: 'wall', x: colX(COLS - 1) + 0.5 - rightCols / 2, w: rightCols - 0.04, d: 0.5, h: H, color: 0 });
      const cx = colX(oc) + (ow - 1) / 2;
      this.coin(r - 2, cx); this.coin(r - 1, cx); this.coin(r, cx);
    }
    this.add(3, FULL);
  }

  /** 在两三条轨道之间来回滑的块块：别走它滑的那几条 */
  sliders(d) {
    const count = 2 + (d > 0.6 && this.r() < 0.5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      this.add(i ? this.rows4(lerp(0.85, 0.62, d)) : 4, FULL);
      const r = this.add(1, FULL);
      const span = d > 0.6 && this.r() < 0.5 ? 3 : 2;           // 滑过几条轨道
      const c = this.int(0, COLS - span);
      this.ob(r, { kind: 'slider', x: colX(c) + (span - 1) / 2, w: 0.8, d: 0.8, h: 0.9, color: 4, amp: (span - 1) / 2, period: lerp(2.4, 1.6, d), phase: this.r() * Math.PI * 2 });
      const free = LANES.filter((k) => k < c || k >= c + span);
      const fc = this.pick(free);
      this.coin(r - 1, colX(fc)); this.coin(r, colX(fc)); this.coin(r + 1, colX(fc));
    }
    this.add(4, FULL);
  }

  /** 高柱子左一排右一排：来回绕（难了以后一排挡 3 条，只剩最边上那条） */
  slalom(d) {
    const wide = d > 0.6;
    const count = 3 + this.int(0, 2);
    const step = this.rows4(lerp(0.68, 0.46, d));
    let left = this.r() < 0.5;
    this.add(3, FULL);
    for (let i = 0; i < count; i++) {
      const r = this.add(1, FULL);
      const cols = left ? (wide ? [0, 1, 2] : [0, 1]) : (wide ? [1, 2, 3] : [2, 3]);
      cols.forEach((c) => this.ob(r, { kind: 'pillar', x: colX(c), w: 0.8, d: 0.8, h: 2.3, color: 1 + (c % 2) }));
      const free = left ? COLS - 1 : 0;
      this.coin(r - 1, colX(free)); this.coin(r, colX(free)); this.coin(r + 1, colX(free));
      this.add(step - 1, FULL);
      left = !left;
    }
    this.add(2, FULL);
  }
}
