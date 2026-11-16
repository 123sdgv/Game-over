// 关卡生成（不碰界面，Node 里也能跑）：
//   1. 一块一块往上叠玻璃板（每块 2–4 颗螺丝，新放的总在最上面），控制同一处最多叠几层
//   2. 用栅格算出谁压着谁（板块之间的拓扑顺序在这里就定死了）
//   3. 按一个合法的拆板顺序模拟着玩一遍，边玩边给螺丝上色 —— 所以每一关都至少有一种不用技能的解法
import { newState, tap, plateFree, NBOX } from './logic.js';

export const BOARD_W = 360;
export const TUNE = { stage: 1.5, depth: 5 };

/* ---------------- 随机数 ---------------- */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (...xs) => xs.reduce((h, x) => Math.imul(h ^ (x | 0), 0x9E3779B1) ^ (h >>> 15), 0x12345) >>> 0;

/* ---------------- 每关的数量 ---------------- */
export function screwTarget(n, cap = 120) {
  if (n <= 5) return [12, 20, 28, 38, 50][n - 1];
  if (n <= 15) return Math.round(50 + (n - 5) * 5);             // 第 15 关 100 颗
  return Math.min(cap, Math.round(100 + (n - 15) * 1.5));        // 无限关：慢慢涨，到上限封顶
}
export const colorsFor = (n) => (n === 1 ? 2 : n === 2 ? 3 : n === 3 ? 4 : n <= 5 ? 5 : 6);
const depthFor = (n) => (n <= 2 ? 2 : n <= 5 ? 3 : n <= 9 ? 5 : TUNE.depth);

/* ---------------- 板块形状（本地坐标，以中心为原点） ---------------- */
function roundPoly(verts, rad, seg = 6) {
  const out = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const p = verts[(i + n - 1) % n], c = verts[i], q = verts[(i + 1) % n];
    const ax = p[0] - c[0], ay = p[1] - c[1], bx = q[0] - c[0], by = q[1] - c[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const ang = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
    const d = Math.min(rad / Math.tan(ang / 2), la * 0.48, lb * 0.48);
    const r = d * Math.tan(ang / 2);
    const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
    const s0 = [c[0] + ux * d, c[1] + uy * d], s1 = [c[0] + vx * d, c[1] + vy * d];
    // 圆心在角平分线上
    const mx = ux + vx, my = uy + vy, ml = Math.hypot(mx, my) || 1;
    const h = Math.hypot(d, r);
    const ox = c[0] + (mx / ml) * h, oy = c[1] + (my / ml) * h;
    let a0 = Math.atan2(s0[1] - oy, s0[0] - ox), a1 = Math.atan2(s1[1] - oy, s1[0] - ox);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (da * k) / seg;
      out.push([ox + Math.cos(a) * r, oy + Math.sin(a) * r]);
    }
  }
  return out;
}
const polar = (fn, n = 56) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2, r = fn(a);
  return [Math.cos(a) * r, Math.sin(a) * r];
});
const ring = (k, R, a0 = -Math.PI / 2) => Array.from({ length: k }, (_, i) => [Math.cos(a0 + (i / k) * Math.PI * 2) * R, Math.sin(a0 + (i / k) * Math.PI * 2) * R]);
const pick = (arr, n) => arr.slice(0, n);
const shuffle = (arr, R) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

/** 形状：返回 { poly, holes(按螺丝数排好的候选位置) }。u = 螺丝半径 */
const SHAPES = {
  bar(p, u) {
    const w = p.w / 2, h = p.h / 2;
    return {
      poly: roundPoly([[-w, -h], [w, -h], [w, h], [-w, h]], h * 0.98, 8),
      holes: (n) => (n === 2 ? [[-w + h, 0], [w - h, 0]] : [[-w + h, 0], [0, 0], [w - h, 0]]),
      counts: p.w > u * 9.5 ? [2, 3] : [2],
    };
  },
  rect(p, u) {
    const w = p.w / 2, h = p.h / 2, i = u + 7;
    const c = [[-w + i, -h + i], [w - i, h - i], [w - i, -h + i], [-w + i, h - i]];
    return { poly: roundPoly([[-w, -h], [w, -h], [w, h], [-w, h]], u * 1.1), holes: (n) => pick(c, n), counts: [2, 3, 4] };
  },
  disc(p, u) {
    const R = p.R;
    return { poly: polar(() => R, 60), holes: (n) => ring(n, R - u - 6, n === 2 ? 0 : -Math.PI / 2), counts: [2, 3, 4] };
  },
  tri(p, u) {
    const R = p.R;
    const v = ring(3, R);
    const holes = ring(3, R - u * 2.1);
    return { poly: roundPoly(v, u * 1.2, 8), holes: (n) => pick(holes, n), counts: [3, 2] };
  },
  hex(p, u) {
    const R = p.R;
    const v = ring(6, R, 0);
    const h = ring(6, R - u - 8, 0);
    return { poly: roundPoly(v, u * 0.9), holes: (n) => (n === 2 ? [h[0], h[3]] : n === 3 ? [h[0], h[2], h[4]] : [h[0], h[1], h[3], h[4]]), counts: [3, 2, 4] };
  },
  cloud(p, u) {
    const R = p.R;
    const poly = polar((a) => R * (1 + 0.14 * Math.cos(a * 5))).map(([x, y]) => [x * 1.28, y * 0.92]);
    const h = ring(5, R - u - 4, -Math.PI / 2).map(([x, y]) => [x * 1.22, y * 0.86]);
    return { poly, holes: (n) => (n === 2 ? [h[1], h[4]] : n === 3 ? [h[0], h[2], h[3]] : [h[1], h[2], h[3], h[4]]), counts: [3, 2, 4] };
  },
  gear(p, u) {
    const R = p.R, teeth = 8;
    const poly = polar((a) => {
      const k = ((a / (Math.PI * 2)) * teeth) % 1;
      const t = k < 0.38 ? 1 : k < 0.5 ? 1 - (k - 0.38) / 0.12 : k < 0.88 ? 0 : (k - 0.88) / 0.12;
      return R - 9 + t * 9;
    }, 96);
    return { poly, holes: (n) => ring(n, R - u - 14, n === 2 ? 0 : -Math.PI / 2), counts: [3, 4, 2], hub: true };
  },
  plus(p, u) {
    const L = p.L / 2, a = p.a / 2;
    const v = [[-a, -L], [a, -L], [a, -a], [L, -a], [L, a], [a, a], [a, L], [-a, L], [-a, a], [-L, a], [-L, -a], [-a, -a]];
    const e = L - a;
    const h = [[0, -e], [0, e], [e, 0], [-e, 0]];
    return { poly: roundPoly(v, u * 0.8), holes: (n) => pick(n === 3 ? [h[0], h[2], h[3]] : h, n), counts: [4, 2, 3] };
  },
  ell(p, u) {
    const L = p.L, a = p.a;
    // L 形：角在左上
    const v = [[-L / 2, -L / 2], [-L / 2 + a, -L / 2], [-L / 2 + a, L / 2 - a], [L / 2, L / 2 - a], [L / 2, L / 2], [-L / 2, L / 2]];
    const e = a / 2;
    const h = [[-L / 2 + e, -L / 2 + e], [L / 2 - e, L / 2 - e], [-L / 2 + e, L / 2 - e]];
    return { poly: roundPoly(v, u * 0.9), holes: (n) => pick(n === 2 ? [h[0], h[1]] : h, n), counts: [3, 2] };
  },
};

/** 凸包（单调链） */
function hull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** 把几颗螺丝的凸包往外胀 d：得到一块圆润的异形板（2 颗就是长条） */
export function inflate(pts, d) {
  const h = hull(pts);
  if (h.length === 1) return polar(() => d, 40).map(([x, y]) => [x + h[0][0], y + h[0][1]]);
  const cx = h.reduce((a, p) => a + p[0], 0) / h.length, cy = h.reduce((a, p) => a + p[1], 0) / h.length;
  const nrm = (a, b) => {
    let nx = b[1] - a[1], ny = a[0] - b[0];
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    return nx * mx + ny * my < 0 ? [-nx, -ny] : [nx, ny];
  };
  const out = [];
  const n = h.length;
  for (let i = 0; i < n; i++) {
    const v = h[i];
    let a0, a1;
    if (n === 2) {
      const o = h[1 - i];
      const ang = Math.atan2(v[1] - o[1], v[0] - o[0]);
      a0 = ang - Math.PI / 2; a1 = ang + Math.PI / 2;
      if (i === 1) { a0 = ang - Math.PI / 2; a1 = ang + Math.PI / 2; }
    } else {
      const np = nrm(h[(i + n - 1) % n], v), nn = nrm(v, h[(i + 1) % n]);
      a0 = Math.atan2(np[1], np[0]); a1 = Math.atan2(nn[1], nn[0]);
    }
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (n === 2) da = Math.PI * Math.sign(da || 1);
    const seg = Math.max(2, Math.ceil(Math.abs(da) / 0.2));
    for (let k = 0; k <= seg; k++) { const a = a0 + (da * k) / seg; out.push([v[0] + Math.cos(a) * d, v[1] + Math.sin(a) * d]); }
  }
  return out;
}

/** 随机一块板的尺寸参数 */
function sizeOf(k, u, R) {
  const f = (a, b) => u * (a + R() * (b - a));
  switch (k) {
    case 'bar': return { w: f(7.5, 14), h: u * 3.3 };
    case 'rect': return { w: f(5.6, 8.6), h: f(5.6, 8.6) };
    case 'disc': return { R: f(3.2, 4.6) };
    case 'tri': return { R: f(4.4, 5.6) };
    case 'hex': return { R: f(3.8, 4.8) };
    case 'cloud': return { R: f(3.5, 4.2) };
    case 'gear': return { R: f(4.0, 5.0) };
    case 'plus': { const a = u * 3.1; return { L: f(8, 10), a }; }
    case 'ell': return { L: f(6.4, 8.2), a: u * 3.1 };
  }
}

/** 一块板在世界坐标里的轮廓、螺丝位置（存档里只存参数，读档时重新算） */
export function plateGeom(p, u, pts) {
  if (p.k === 'hull') return { poly: inflate(pts, p.pad), holes: () => pts, counts: [pts.length], hub: null };
  const sh = SHAPES[p.k](p, u);
  const co = Math.cos(p.rot), si = Math.sin(p.rot);
  const tf = ([x, y]) => [p.x + x * co - y * si, p.y + x * si + y * co];
  return { poly: sh.poly.map(tf), holes: (n) => sh.holes(n).map(tf), counts: sh.counts, hub: sh.hub ? tf([0, 0]) : null };
}

/* ---------------- 栅格：算覆盖和叠层 ---------------- */
const G = 4;
function raster(poly, cols, rows) {
  const cells = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of poly) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const r0 = Math.max(0, Math.floor(y0 / G)), r1 = Math.min(rows - 1, Math.floor(y1 / G));
  for (let r = r0; r <= r1; r++) {
    const yc = (r + 0.5) * G;
    const xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > yc) !== (yj > yc)) xs.push(xi + ((yc - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil(xs[k] / G - 0.5)), c1 = Math.min(cols - 1, Math.floor(xs[k + 1] / G - 0.5));
      for (let c = c0; c <= c1; c++) cells.push(r * cols + c);
    }
  }
  return cells;
}

/* ---------------- 生成 ---------------- */
const KINDS_EARLY = [['bar', 3], ['rect', 3], ['disc', 2], ['tri', 1.5]];
const KINDS_ALL = [['bar', 3], ['rect', 2.4], ['disc', 2], ['tri', 1.5], ['hex', 1.3], ['cloud', 1.2], ['gear', 1.2], ['plus', 1], ['ell', 1]];
const wpick = (list, R) => {
  let t = list.reduce((a, [, w]) => a + w, 0) * R();
  for (const [k, w] of list) { t -= w; if (t <= 0) return k; }
  return list[0][0];
};
export const TINTS = 6;

function layout(n, total, H, u, R) {
  const W = BOARD_W, cols = Math.ceil(W / G), rows = Math.ceil(H / G);
  const depth = new Uint8Array(cols * rows);
  const maxDepth = depthFor(n);
  const kinds = n <= 4 ? KINDS_EARLY : KINDS_ALL;
  const dmin = u * 2 + 3.5, m = 5;
  const spread = Math.min(1, 0.4 + total / 80);
  const grow = Math.max(1, Math.min(1.45, 1 + (40 - total) / 50));   // 螺丝少的关，板子大一点
  const plates = [], holes = [];
  let placed = 0, tries = 0;
  const okHole = (x, y, extra = []) => x > m + u + 6 && y > m + u + 6 && x < W - m - u - 6 && y < H - m - u - 6
    && !holes.some(([a, b]) => Math.hypot(a - x, b - y) < dmin) && !extra.some(([a, b]) => Math.hypot(a - x, b - y) < dmin);
  const accept = (p, poly, hs) => {
    if (poly.some(([x, y]) => x < m || y < m || x > W - m || y > H - m)) return false;
    const cells = raster(poly, cols, rows);
    let deep = 0;
    for (const c of cells) if (depth[c] > deep) deep = depth[c];
    if (deep + 1 > maxDepth) return false;
    for (const c of cells) depth[c]++;
    p.cells = cells; p.holes = hs;
    plates.push(p); holes.push(...hs);
    placed += hs.length;
    return true;
  };
  while (placed < total && tries < 9000) {
    tries++;
    // 前面用规整的形状；实在塞不下了，就用几颗螺丝胀出来的异形板把空隙填满
    if (tries > 1800 || (tries > 600 && R() < 0.5)) {
      const rest = total - placed;
      let cnt = 2 + Math.floor(R() * 3);
      cnt = Math.min(cnt, rest);
      if (rest - cnt === 1) cnt = cnt < 4 && cnt + 1 <= rest ? cnt + 1 : cnt - 1;
      if (cnt < 2 || rest - cnt === 1) continue;
      const cx = m + R() * (W - 2 * m), cy = m + R() * (H - 2 * m);
      const pts = [];
      if (!okHole(cx, cy)) continue;
      pts.push([cx, cy]);
      for (let k = 1, g = 0; k < cnt && g < 30; g++) {
        const a = R() * Math.PI * 2, d = u * (2.6 + R() * 4);
        const x = pts[0][0] + Math.cos(a) * d, y = pts[0][1] + Math.sin(a) * d;
        if (okHole(x, y, pts)) { pts.push([x, y]); k++; }
      }
      if (pts.length !== cnt) continue;
      const pad = u + 6 + R() * u * 0.8;
      accept({ k: 'hull', pad, rot: 0, x: cx, y: cy }, inflate(pts, pad), pts);
      continue;
    }
    const k = wpick(kinds, R);
    const p = { k, ...sizeOf(k, u * grow, R), rot: R() * Math.PI * 2 };
    if (k === 'bar' && R() < 0.4) p.rot = Math.round(p.rot / (Math.PI / 4)) * (Math.PI / 4);
    p.x = W / 2 + (R() - 0.5) * W * spread;
    p.y = H / 2 + (R() - 0.5) * H * spread;
    const g = plateGeom(p, u);
    if (g.poly.some(([x, y]) => x < m || y < m || x > W - m || y > H - m)) continue;
    const rest = total - placed;
    let cnt = Math.min(g.counts[Math.floor(R() * g.counts.length)], rest);
    if (rest - cnt === 1) cnt = g.counts.includes(cnt + 1) && cnt + 1 <= rest ? cnt + 1 : cnt - 1;
    if (cnt < 2 || !g.counts.includes(cnt) || rest - cnt === 1) continue;
    const hs = g.holes(cnt);
    if (hs.some(([x, y]) => holes.some(([a, b]) => Math.hypot(a - x, b - y) < dmin))) continue;
    accept(p, g.poly, hs);
  }
  return placed === total ? plates : null;
}

/** 谁压着谁：后放的（层更高）和先放的重叠超过几个格子，就算压住 */
function overlaps(plates) {
  const sets = plates.map((p) => new Set(p.cells));
  plates.forEach((p) => { p.above = []; });
  for (let i = 0; i < plates.length; i++) {
    for (let j = i + 1; j < plates.length; j++) {
      let shared = 0;
      const [a, b] = sets[i].size < sets[j].size ? [sets[i], sets[j]] : [sets[j], sets[i]];
      for (const c of a) if (b.has(c) && ++shared >= 5) break;
      if (shared >= 5) plates[i].above.push(j);
    }
  }
}

/**
 * 边玩边上色：按一个合法顺序拧，每拧一颗就挑一个颜色。
 * 优先挑能直接进已有工具箱的颜色，偶尔挑一个要开新箱子 / 要进暂存格的颜色（关卡越后越常见）。
 */
function paint(level, budget, stage0, R, n) {
  const s = newState(level, stage0);
  const left = budget.slice();
  const d = Math.max(0, Math.min(1, (n - 5) / 15));     // 难度 0（前 5 关）→ 1（第 20 关以后）
  const wStage = 0.03 + TUNE.stage * d;
  const wIdle = 0.4;
  for (let step = 0; step < s.screws.length; step++) {
    const free = s.screws.filter((sc) => !sc.out && plateFree(s, s.plates[sc.plate]));
    const sc = free[Math.floor(R() * free.length)];
    if (sc.c !== -1) {
      const opts = [];
      for (let c = 0; c < left.length; c++) {
        if (!left[c]) continue;
        const bi = s.boxes.findIndex((b) => b.c === c && b.n < s.cap);
        if (bi >= 0) { opts.push([c, 1 + s.boxes[bi].n / s.cap]); continue; }
        if (s.boxes.some((b) => b.c < 0)) { opts.push([c, wIdle * (0.6 + left[c] / s.cap * 0.1)]); continue; }
        if (s.stage.includes(null)) opts.push([c, wStage]);
      }
      if (!opts.length) return null;
      let t = opts.reduce((a, [, w]) => a + w, 0) * R();
      let c = opts[0][0];
      for (const [cc, w] of opts) { t -= w; if (t <= 0) { c = cc; break; } }
      sc.c = c;
      level.screws[sc.id].c = c;
      left[c]--;
    }
    const res = tap(s, sc.id);
    if (!res.ok) return null;
  }
  return left.every((x) => !x) ? level : null;
}

/**
 * 生成第 n 关。opts: { cap 工具箱容量, stage 开局暂存格, aspect 棋盘宽高比, endless 无限关上限 }
 * 同样的参数总是生成同一关。
 */
export function makeLevel(n, opts = {}) {
  const cap = opts.cap || 6, stage0 = opts.stage ?? 3;
  const aspect = Math.max(0.62, Math.min(1.15, opts.aspect || 0.78));
  const H = Math.round(BOARD_W / aspect);
  const target = screwTarget(n, opts.endless || 120);
  const k = colorsFor(n);
  const boxes = Math.max(k, Math.round(target / cap));
  const N = boxes * cap;
  for (let attempt = 0; attempt < 60; attempt++) {
    const R = rng(hash(n, attempt, cap, stage0, H));
    // 每种颜色几箱
    const per = Array(6).fill(0);
    const colors = shuffle([0, 1, 2, 3, 4, 5], R).slice(0, k);
    // 颜色少的时候别让粉色和品红同时出现（太像）
    if (k <= 4 && colors.includes(3) && colors.includes(5)) colors[colors.indexOf(3)] = [0, 1, 2, 4].find((c) => !colors.includes(c));
    for (let b = 0; b < boxes; b++) per[colors[b % k]]++;
    const budget = per.map((x) => x * cap);
    const p = n < 3 ? 0 : Math.min(0.025, 0.006 + n * 0.0005);
    const sp = n === 3 ? 1 : n < 3 ? 0 : Math.floor(N * p + R());
    const u = Math.max(9.6, Math.min(16, 0.29 * Math.sqrt((BOARD_W * H) / (N + sp)))) * (attempt > 40 ? 0.92 : attempt > 20 ? 0.96 : 1);
    const plates = layout(n, N + sp, H, u, R);
    if (!plates) continue;
    overlaps(plates);
    // 板块颜色：压在一起的尽量不同色
    plates.forEach((p, i) => {
      const near = new Set(plates.filter((q, j) => j < i && (q.above.includes(i))).map((q) => q.tint));
      const options = [0, 1, 2, 3, 4, 5].filter((t) => !near.has(t));
      p.tint = (options.length ? options : [0, 1, 2, 3, 4, 5])[Math.floor(R() * (options.length || 6))];
    });
    const screws = [];
    plates.forEach((p, pi) => {
      p.screws = [];
      for (const [x, y] of p.holes) { p.screws.push(screws.length); screws.push({ id: screws.length, x, y, c: null, plate: pi }); }
    });
    // 变色钉：随便挑几颗（显示成红 / 白 / 黑 / 灰）
    const ids = shuffle(screws.map((x) => x.id), R).slice(0, sp);
    for (const id of ids) { screws[id].c = -1; screws[id].sp = Math.floor(R() * 4); }
    const level = {
      n, W: BOARD_W, H, r: u, cap,
      plates: plates.map((p, i) => ({ id: i, k: p.k, x: p.x, y: p.y, rot: p.rot, w: p.w, h: p.h, R: p.R, L: p.L, a: p.a, pad: p.pad, tint: p.tint, above: p.above, screws: p.screws })),
      screws,
    };
    const ok = paint(level, budget, stage0, R, n);
    if (ok) return ok;
  }
  throw new Error('关卡生成失败：' + n);
}
