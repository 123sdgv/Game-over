// 打罐子的关卡：台子（木马架上的木板、树桩、油桶、木箱、轨道上来回走的小车）+ 上面叠的罐子和木板。
// 单位是分米：一个罐子半径 0.33、高 1.22；地面 y = 0。
// 一关 = { supports: [...], items: [...], par }，par 是「三星发数」（用机器人试打出来的，见 CLAUDE.md）。
//   support: { kind: 'plank' | 'stump' | 'drum' | 'crate' | 'cart', x, z, top, ... }   top = 台面高度
//   item:    { k: 'can', x, y, z, t: 'n' 普通 | 'b' 爆炸 | 'g' 金, l: 罐子图案 }  /  { k: 'board', x, y, z, w, d }   y 是中心高度
export const CAN_R = 0.33;
export const CAN_H = 1.22;
export const BOARD_T = 0.16;
export const LABELS = 8;               // 普通罐子有几种图案（art.js 里画）
const D = CAN_R * 2 + 0.012;           // 并排两个罐子的中心距
const EPS = 0.004;                     // 摆的时候留一丝缝，开始不会互相弹开

/* ---------------------------------------------------------------- 随机数 */
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

/* ---------------------------------------------------------------- 台子 */
const plank = (s, o) => s.supports.push({ kind: 'plank', x: 0, z: 0, top: 8.2, w: 8, d: 1.5, ...o });
const stump = (s, o) => s.supports.push({ kind: 'stump', x: 0, z: 0, top: 6.2, r: 1.3, ...o });
const drum = (s, o) => s.supports.push({ kind: 'drum', x: 0, z: 0, top: 8.4, r: 1.95, color: 0, ...o });
/** 木箱：base 是它底下的高度（放地上 0，放木板上就是木板的 top） */
const crate = (s, o) => { const c = { kind: 'crate', x: 0, z: 0, base: 0, s: 2.6, ...o }; c.top = c.base + c.s; s.supports.push(c); return c; };
/** 小车：在一根架高的轨道上左右来回走；x 是中间位置，amp 是单边走多远，period 秒走一个来回 */
const cart = (s, o) => s.supports.push({ kind: 'cart', x: 0, z: 0, top: 8.6, w: 3.2, d: 1.5, amp: 2.4, period: 6, phase: 0, ...o });

/* ---------------------------------------------------------------- 摆罐子 */
function can(s, x, y, z, t = 'n') {
  s.items.push({ k: 'can', x, y, z, t, l: Math.floor(s.rand() * LABELS) });
}
function board(s, x, y, z, w, d = 0.92) {
  s.items.push({ k: 'board', x, y, z, w, d });
}
/**
 * 一层一层往上摆。layers 从下往上：数字 = 这一层并排几个罐子；'b' = 一块木板。
 * 相邻两层罐子个数差 1 时自动错开半个（金字塔那样卡在两个中间）。
 * special: { '2,1': 'b' } 第 2 层（从 0 数，只数罐子层）第 1 个换成爆炸罐 / 金罐。
 */
function stack(s, { x = 0, z = 0, top, layers, special = {} }) {
  let y = top;
  let row = 0;
  let prevN = 0;
  for (const L of layers) {
    if (L === 'b') {
      const w = Math.max(prevN, 1) * D + 0.34;
      board(s, x, y + BOARD_T / 2 + EPS, z, w);
      y += BOARD_T + EPS;
      continue;
    }
    for (let i = 0; i < L; i++) {
      const cx = x + (i - (L - 1) / 2) * D;
      can(s, cx, y + CAN_H / 2 + EPS, z, special[`${row},${i}`] || 'n');
    }
    y += CAN_H + EPS;
    prevN = L;
    row++;
  }
  return y;
}
const pyr = (rows) => Array.from({ length: rows }, (_, i) => rows - i);

/* ---------------------------------------------------------------- 手工关 */
// 前面这些一关一个新东西，后面的自动生成
const HAND = [
  // 1 热身：三层金字塔
  (s) => { plank(s, { w: 7 }); stack(s, { top: 8.2, layers: pyr(3) }); },
  // 2 四层
  (s) => { plank(s, { w: 8 }); stack(s, { top: 8.2, layers: pyr(4) }); },
  // 3 两堆
  (s) => { plank(s, { w: 9 }); stack(s, { x: -1.9, top: 8.2, layers: pyr(3) }); stack(s, { x: 1.9, top: 8.2, layers: pyr(3) }); },
  // 4 木板隔层
  (s) => { plank(s, { w: 8 }); stack(s, { top: 8.2, layers: [3, 'b', 3, 'b', 2, 'b', 1] }); },
  // 5 爆炸罐
  (s) => { plank(s, { w: 8 }); stack(s, { top: 8.2, layers: pyr(4), special: { '1,1': 'b' } }); },
  // 6 树桩 + 金罐
  (s) => {
    stump(s, { x: -1.8, top: 6.4, z: 0.6 });
    stump(s, { x: 1.9, top: 7.4, z: -1.4, r: 1.15 });
    stack(s, { x: -1.8, z: 0.6, top: 6.4, layers: pyr(3) });
    stack(s, { x: 1.9, z: -1.4, top: 7.4, layers: [1, 1, 1], special: { '2,0': 'g' } });
  },
  // 7 油桶
  (s) => { drum(s, { top: 8.4 }); stack(s, { top: 8.4, layers: pyr(4), special: { '3,0': 'g' } }); },
  // 8 会动的小车
  (s) => { cart(s, { top: 8.6, amp: 1.7 }); stack(s, { top: 8.6, layers: pyr(3) }); },
  // 9 高塔
  (s) => { plank(s, { w: 8 }); stack(s, { top: 8.2, layers: [4, 'b', 3, 'b', 2, 'b', 1], special: { '3,0': 'g' } }); },
  // 10 五层 + 爆炸罐
  (s) => { plank(s, { w: 9 }); stack(s, { top: 8.2, layers: pyr(5), special: { '1,1': 'b', '4,0': 'g' } }); },
  // 11 木箱
  (s) => {
    plank(s, { w: 9 });
    const c = crate(s, { base: 8.2, s: 2.2 });
    stack(s, { x: -2.85, top: 8.2, layers: pyr(2) });
    stack(s, { top: c.top, layers: pyr(3), special: { '2,0': 'g' } });
    stack(s, { x: 2.85, top: 8.2, layers: pyr(2) });
  },
  // 12 小车上的塔
  (s) => { cart(s, { top: 8.6, period: 5.5, amp: 1.6 }); stack(s, { top: 8.6, layers: [2, 'b', 2, 'b', 2, 'b', 1] }); },
  // 13 两个油桶，一个有炸药
  (s) => {
    drum(s, { x: -2.0, top: 8.4, color: 1, z: 0.8 });
    drum(s, { x: 2.0, top: 8.4, color: 2, z: -2.6 });
    stack(s, { x: -2.0, z: 0.8, top: 8.4, layers: pyr(3), special: { '0,1': 'b' } });
    stack(s, { x: 2.0, z: -2.6, top: 8.4, layers: pyr(3) });
  },
  // 14 六层大金字塔
  (s) => { plank(s, { w: 10 }); stack(s, { top: 8.2, layers: pyr(6), special: { '5,0': 'g' } }); },
  // 15 一前一后两块木板
  (s) => {
    plank(s, { x: -1.7, z: 2.2, top: 6.6, w: 6.2 });
    plank(s, { x: 1.7, z: -2.6, top: 10.2, w: 6.2 });
    stack(s, { x: -1.7, z: 2.2, top: 6.6, layers: pyr(3) });
    stack(s, { x: 1.7, z: -2.6, top: 10.2, layers: [3, 'b', 2, 'b', 1], special: { '2,0': 'g' } });
  },
  // 16 小车 + 树桩 + 炸药
  (s) => {
    stump(s, { x: -2.3, top: 5.8, z: 1.6 });
    stack(s, { x: -2.3, z: 1.6, top: 5.8, layers: [2, 'b', 2, 'b', 1], special: { '0,1': 'b' } });
    cart(s, { x: 1.2, z: -1.8, top: 9.4, amp: 1.3, period: 5 });
    stack(s, { x: 1.2, z: -1.8, top: 9.4, layers: pyr(3), special: { '2,0': 'g' } });
  },
];

/* ---------------------------------------------------------------- 自动生成 */
// 一关里放 1～3 个「台子 + 一堆罐子」，越往后罐子越多、花样越多。
// 先挑台子、按宽度排开（不会挤在一起），再按台面能并排放几个罐子往上叠。
const tri = (k) => (k * (k + 1)) / 2;
function structure(s, r, { x, z, top, cap, budget, lvl }) {
  const kind = r();
  const boom = lvl > 5 && r() < 0.45;
  let layers;
  if (kind < 0.45 || cap < 2) {
    let k = Math.min(cap, 6);
    while (k > 2 && tri(k) > budget) k--;
    layers = pyr(Math.max(1, k));
  } else if (kind < 0.75) {
    // 带木板的塔：每层少一个或者一样多
    let m = Math.min(cap, 2 + Math.floor(r() * 3));
    layers = [];
    let used = 0;
    while (m > 0 && used < budget && layers.length < 9) {
      layers.push(m, 'b');
      used += m;
      if (r() < 0.6) m--;
    }
    if (layers[layers.length - 1] === 'b') layers.pop();
  } else {
    const n = Math.min(cap, 2 + Math.floor(r() * 2));
    const h = Math.max(2, Math.min(4, Math.round(budget / n)));
    layers = Array(h).fill(n);
  }
  const rows = layers.filter((v) => v !== 'b');
  const special = {};
  if (boom) {
    const row = Math.floor(r() * Math.min(2, rows.length));
    special[`${row},${Math.floor(r() * rows[row])}`] = 'b';
  }
  stack(s, { x, z, top, layers, special });
}

const fit = (w) => Math.max(1, Math.floor((w - 0.04) / D));

function generated(s, lvl) {
  const r = s.rand;
  const k = lvl - HAND.length;
  const total = Math.min(20, 9 + Math.floor(k * 0.5));           // 这一关大概多少个罐子
  const groups = k < 4 ? 1 + Math.floor(r() * 2) : r() < 0.3 ? 3 : 2;
  const budget = Math.ceil(total / groups);
  // 竖屏横向放不下太多：两三堆就前后错开，不往两边铺
  const xs = groups === 1 ? [0] : groups === 2 ? [-1.9, 1.9] : [-2.3, 0, 2.3];
  const zs = groups === 1 ? [0] : groups === 2 ? (r() < 0.5 ? [1, -1.6] : [-1.6, 1]) : [1.4, -2.6, 1.4];
  const wide = groups === 1 ? 4.2 : 2.8;                         // 每堆最宽多少

  if (groups === 2 && r() < 0.35) {
    // 一块长木板放两堆
    const top = 7.6 + r() * 1.2;
    plank(s, { w: 8.4, top });
    xs.forEach((x, i) => structure(s, r, { x, z: 0, top, cap: fit(wide), budget, lvl: lvl + i }));
  } else {
    let moving = false;
    xs.forEach((x, i) => {
      const z = zs[i] + (r() - 0.5) * 0.6;
      const pick = r();
      let top, sx = x, cap;
      if (!moving && lvl >= 8 && pick < 0.3) {
        moving = true;
        top = 8.4 + r() * 1.2;
        const amp = groups === 1 ? 1.8 : 1.1;
        const phase = r() * 6.28;
        cart(s, { x, z, top, amp, period: 4.8 + r() * 2, phase });
        sx = x + amp * Math.sin(phase);                 // 小车一开始在哪，罐子就摆在哪
        cap = fit(Math.min(3.2, wide));
      } else if (pick < 0.52) {
        top = 5.6 + r() * 1.6 + (z < -1 ? 1.4 : 0);
        stump(s, { x, z, top });
        cap = fit(2.6);
      } else if (pick < 0.74) {
        top = 8.4;
        drum(s, { x, z, top, color: Math.floor(r() * 3), r: groups === 1 ? 1.95 : 1.5 });
        cap = fit(Math.min(wide, groups === 1 ? 3.9 : 3));
      } else {
        const sz = Math.min(wide, 2.5 + r() * 0.5);
        const c = crate(s, { x, z, base: 0, s: sz });
        top = c.top;
        if (r() < 0.5 || z < -1) top = crate(s, { x, z, base: c.top, s: sz - 0.35 }).top;
        cap = fit(sz - 0.35);
      }
      structure(s, r, { x: sx, z, top, cap, budget, lvl: lvl + i });
    });
  }
  // 金罐：挑一个高处的普通罐子换掉
  if (r() < 0.6) {
    const cans = s.items.filter((it) => it.k === 'can' && it.t === 'n').sort((a, b) => b.y - a.y);
    if (cans.length) cans[Math.floor(r() * Math.min(3, cans.length))].t = 'g';
  }
}

/* ---------------------------------------------------------------- 三星发数 */
// 机器人试打出来的（贪心：每一枪在剩下的罐子上试十几个瞄点、挑打下最多的；金罐子送回的子弹不算），
// 罐子 12 个以上的关再宽限 1 发。改了关卡就要重新跑（见 CLAUDE.md）。超出表格的关卡按罐子数估一个。
export const PAR = [
  2, 2, 4, 3, 2, 2, 1, 1, 1, 2, 5, 1, 4, 2, 3, 2, 1, 1, 2, 3,
  2, 2, 1, 2, 3, 3, 4, 3, 5, 3, 2, 4, 4, 3, 3, 4, 3, 2, 4, 3,
  5, 5, 3, 2, 3, 3, 3, 4, 2, 5, 3, 5, 5, 2, 4, 3, 1, 3, 2, 5,
];

function estimatePar(spec) {
  const cans = spec.items.filter((it) => it.k === 'can').length;
  const groups = spec.supports.length;
  return Math.max(1, Math.round(groups * 0.8 + cans / 7));
}

/** 第 n 关（从 1 开始） */
export function level(n) {
  const s = { supports: [], items: [], rand: rng(9001 + n * 7919) };
  if (n <= HAND.length) HAND[n - 1](s);
  else generated(s, n);
  const spec = { n, supports: s.supports, items: s.items };
  spec.par = PAR[n - 1] || estimatePar(spec);
  return spec;
}
export const HAND_COUNT = HAND.length;

/** 罐子掉到这个高度以下就算「打下去了」：所有台面里最低的那个再往下一点 */
export function downY(spec) {
  return Math.min(...spec.supports.map((p) => p.top)) - 0.55;
}

/** 这一关所有东西占的范围（摆相机用） */
export function bounds(spec) {
  let x0 = Infinity, x1 = -Infinity, y1 = -Infinity, y0 = Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of spec.supports) {
    const half = p.kind === 'plank' ? p.w / 2 : p.kind === 'cart' ? p.amp + p.w / 2 + 0.6 : p.kind === 'crate' ? p.s / 2 : p.r;
    x0 = Math.min(x0, p.x - half); x1 = Math.max(x1, p.x + half);
    y0 = Math.min(y0, p.top); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  for (const it of spec.items) {
    const half = it.k === 'board' ? it.w / 2 : CAN_R;
    x0 = Math.min(x0, it.x - half); x1 = Math.max(x1, it.x + half);
    y1 = Math.max(y1, it.y + (it.k === 'can' ? CAN_H / 2 : BOARD_T / 2));
  }
  return { x0, x1, y0, y1, z0, z1 };
}
