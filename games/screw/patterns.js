// 钉子画的内置图案：全部用 6 种基础色，按画布大小现场算出来（不是贴图放大），所以多大的画布都清楚。
// 每个图案是一个函数 f(x, y, n)：x, y ∈ [0,1]（格子中心），n = 一边多少格；返回颜色 0–5，空白返回 -1。
const O = 0, B = 1, G = 2, P = 3, V = 4, M = 5;

const circ = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const ell = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
/** 线段（带粗细），w 至少半格，小画布也不会断 */
function seg(x, y, ax, ay, bx, by, w, n) {
  w = Math.max(w, 0.55 / n);
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t) <= w;
}
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const dot = (x, y, cx, cy, r, n) => circ(x, y, cx, cy, Math.max(r, 0.6 / n));
const starPts = (cx, cy, R, r, k = 5, a0 = -Math.PI / 2) => Array.from({ length: k * 2 }, (_, i) => {
  const a = a0 + (i * Math.PI) / k, rr = i % 2 ? r : R;
  return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
});

export const PATTERNS = [
  {
    id: 'heart', name: '爱心', size: 20,
    f(x, y) {
      const X = (x - 0.5) * 2.5, Y = (0.42 - y) * 2.5;
      if ((X * X + Y * Y - 1) ** 3 - X * X * Y ** 3 > 0) return -1;
      if (ell(x, y, 0.3, 0.3, 0.09, 0.06)) return P;
      return M;
    },
  },
  {
    id: 'star', name: '星星', size: 22,
    f(x, y, n) {
      const pts = starPts(0.5, 0.54, 0.48, 0.22);
      if (!inPoly(x, y, pts)) return -1;
      if (dot(x, y, 0.42, 0.55, 0.035, n) || dot(x, y, 0.58, 0.55, 0.035, n)) return B;
      if (ell(x, y, 0.35, 0.63, 0.05, 0.03) || ell(x, y, 0.65, 0.63, 0.05, 0.03)) return P;
      return O;
    },
  },
  {
    id: 'flower', name: '小花', size: 24,
    f(x, y, n) {
      const cx = 0.5, cy = 0.36;
      if (circ(x, y, cx, cy, 0.1)) return O;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        if (circ(x, y, cx + Math.cos(a) * 0.17, cy + Math.sin(a) * 0.17, 0.12)) return i % 2 ? P : M;
      }
      if (seg(x, y, 0.5, 0.5, 0.5, 0.96, 0.025, n)) return G;
      if (ell(x, y, 0.35, 0.76, 0.13, 0.06) && y > 0.7) return G;
      if (ell(x, y, 0.65, 0.68, 0.13, 0.06) && y < 0.74) return G;
      return -1;
    },
  },
  {
    id: 'rainbow', name: '彩虹', size: 24,
    f(x, y) {
      const d = Math.hypot(x - 0.5, y - 0.78);
      if (y > 0.78) return -1;
      const bands = [M, O, G, V, P];
      const k = Math.floor((0.48 - d) / 0.06);
      return d <= 0.48 && k >= 0 && k < bands.length ? bands[k] : -1;
    },
  },
  {
    id: 'cherry', name: '樱桃', size: 22,
    f(x, y, n) {
      if (circ(x, y, 0.32, 0.7, 0.17) || circ(x, y, 0.68, 0.74, 0.17)) {
        if (ell(x, y, 0.26, 0.63, 0.05, 0.035) || ell(x, y, 0.62, 0.67, 0.05, 0.035)) return P;
        return M;
      }
      if (seg(x, y, 0.33, 0.55, 0.55, 0.14, 0.022, n) || seg(x, y, 0.67, 0.58, 0.55, 0.14, 0.022, n)) return B;
      if (ell(x, y, 0.7, 0.16, 0.15, 0.065)) return G;
      return -1;
    },
  },
  {
    id: 'mushroom', name: '蘑菇', size: 22,
    f(x, y, n) {
      if (y < 0.58 && ell(x, y, 0.5, 0.58, 0.44, 0.42)) {
        if (dot(x, y, 0.32, 0.36, 0.07, n) || dot(x, y, 0.62, 0.28, 0.06, n) || dot(x, y, 0.72, 0.48, 0.05, n) || dot(x, y, 0.45, 0.5, 0.045, n)) return P;
        return V;
      }
      if (x > 0.36 && x < 0.64 && y >= 0.58 && y < 0.9) {
        if (dot(x, y, 0.44, 0.7, 0.025, n) || dot(x, y, 0.56, 0.7, 0.025, n)) return B;
        return P;
      }
      if (y >= 0.9 && y < 0.96 && x > 0.18 && x < 0.82) return G;
      return -1;
    },
  },
  {
    id: 'grape', name: '葡萄', size: 22,
    f(x, y, n) {
      const g = [[0.32, 0.38], [0.5, 0.38], [0.68, 0.38], [0.41, 0.54], [0.59, 0.54], [0.5, 0.7], [0.32, 0.54], [0.68, 0.54], [0.41, 0.84 - 0.14]];
      for (const [cx, cy] of g) if (circ(x, y, cx, cy, 0.1)) return ell(x, y, cx - 0.03, cy - 0.03, 0.025, 0.02) ? P : V;
      if (seg(x, y, 0.5, 0.28, 0.52, 0.08, 0.025, n)) return B;
      if (ell(x, y, 0.66, 0.18, 0.14, 0.07)) return G;
      return -1;
    },
  },
  {
    id: 'melon', name: '西瓜', size: 24,
    f(x, y, n) {
      const d = Math.hypot(x - 0.5, y - 0.3);
      if (y < 0.3 || d > 0.46) return -1;
      if (d > 0.4) return G;
      if (d > 0.37) return P;
      const seeds = [[0.36, 0.45], [0.5, 0.52], [0.64, 0.45], [0.43, 0.62], [0.57, 0.62], [0.28, 0.36], [0.72, 0.36]];
      for (const [cx, cy] of seeds) if (ell(x, y, cx, cy, Math.max(0.02, 0.5 / n), Math.max(0.03, 0.6 / n))) return B;
      return M;
    },
  },
  {
    id: 'donut', name: '甜甜圈', size: 22,
    f(x, y, n) {
      const d = Math.hypot(x - 0.5, y - 0.5);
      if (d > 0.44 || d < 0.15) return -1;
      const wave = 0.53 + Math.sin(x * 22) * 0.04;
      if (y < wave || d < 0.2) {
        const sp = [[0.3, 0.3, G], [0.5, 0.18, O], [0.68, 0.28, V], [0.75, 0.45, G], [0.25, 0.48, O], [0.38, 0.2, V], [0.62, 0.15, G]];
        for (const [cx, cy, c] of sp) if (seg(x, y, cx - 0.02, cy, cx + 0.02, cy + 0.02, 0.012, n)) return c;
        return P;
      }
      return O;
    },
  },
  {
    id: 'cat', name: '小猫', size: 24,
    f(x, y, n) {
      const head = ell(x, y, 0.5, 0.58, 0.38, 0.32);
      const earL = inPoly(x, y, [[0.16, 0.42], [0.2, 0.1], [0.42, 0.3]]);
      const earR = inPoly(x, y, [[0.84, 0.42], [0.8, 0.1], [0.58, 0.3]]);
      if (!head && !earL && !earR) return -1;
      if (inPoly(x, y, [[0.22, 0.36], [0.23, 0.18], [0.36, 0.3]]) || inPoly(x, y, [[0.78, 0.36], [0.77, 0.18], [0.64, 0.3]])) return P;
      if (ell(x, y, 0.36, 0.55, 0.045, 0.07) || ell(x, y, 0.64, 0.55, 0.045, 0.07)) return B;
      if (inPoly(x, y, [[0.46, 0.66], [0.54, 0.66], [0.5, 0.71]]) || dot(x, y, 0.5, 0.68, 0.03, n)) return M;
      if (seg(x, y, 0.5, 0.7, 0.44, 0.76, 0.012, n) || seg(x, y, 0.5, 0.7, 0.56, 0.76, 0.012, n)) return B;
      if (ell(x, y, 0.26, 0.68, 0.06, 0.035) || ell(x, y, 0.74, 0.68, 0.06, 0.035)) return P;
      return O;
    },
  },
  {
    id: 'leaf', name: '叶子', size: 22,
    f(x, y, n) {
      const a = (x - y) / Math.SQRT2, c = (x + y - 1) / Math.SQRT2;   // a：叶尖方向（左下 → 右上），c：横向
      if (seg(x, y, 0.1, 0.9, 0.24, 0.76, 0.025, n)) return B;
      if (!ell(a, c, 0.02, 0, 0.42, 0.17)) return -1;
      if (Math.abs(c) < Math.max(0.012, 0.45 / n) && a < 0.36) return B;
      return G;
    },
  },
  {
    id: 'icecream', name: '冰淇淋', size: 24,
    f(x, y, n) {
      if (inPoly(x, y, [[0.3, 0.55], [0.7, 0.55], [0.5, 0.97]])) {
        const a = (x + y) * n * 0.35, b = (x - y) * n * 0.35;
        return Math.abs(a - Math.round(a)) < 0.12 || Math.abs(b - Math.round(b)) < 0.12 ? B : O;
      }
      if (circ(x, y, 0.5, 0.44, 0.2) || ell(x, y, 0.5, 0.55, 0.24, 0.06)) return circ(x, y, 0.43, 0.38, 0.05) ? P : M;
      if (circ(x, y, 0.5, 0.22, 0.15)) return ell(x, y, 0.45, 0.17, 0.04, 0.03) ? P : V;
      if (dot(x, y, 0.53, 0.05, 0.04, n)) return M;
      return -1;
    },
  },
];

/** 把图案画成 w×h 的颜色编号（-1 = 空），图案放在中间的正方形里 */
export function patternCells(id, w, h) {
  const p = PATTERNS.find((q) => q.id === id);
  const out = new Int8Array(w * h).fill(-1);
  if (!p) return out;
  const n = Math.min(w, h);
  const x0 = (w - n) / 2, y0 = (h - n) / 2;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i - x0 + 0.5) / n, y = (j - y0 + 0.5) / n;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      out[j * w + i] = p.f(x, y, n);
    }
  }
  return out;
}
