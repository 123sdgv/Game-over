// 星星消消乐的全部美术：胖乎乎、有体积感的星星，全部现画，缓存成贴图。
import { K } from './logic.js';

export const COLORS = [
  { name: '粉', hi: '#FFC4D8', mid: '#FF5C93', lo: '#E22A6C', deep: '#A5134A', glow: '#FF8DB5' },
  { name: '橙', hi: '#FFD9A8', mid: '#FF8F2E', lo: '#EE6A0C', deep: '#AC4502', glow: '#FFAE66' },
  { name: '黄', hi: '#FFF4B0', mid: '#FFD02E', lo: '#F4A80C', deep: '#B97404', glow: '#FFE066' },
  { name: '绿', hi: '#C9F7B5', mid: '#46D66E', lo: '#17AE54', deep: '#0A7A3A', glow: '#7BEA97' },
  { name: '蓝', hi: '#BDE6FF', mid: '#35A9FF', lo: '#1079E6', deep: '#0A51AE', glow: '#74C4FF' },
  { name: '紫', hi: '#E5CCFF', mid: '#A662FF', lo: '#7D34E8', deep: '#5219AE', glow: '#C596FF' },
];
export const RAINBOW = ['#FF5C93', '#FF8F2E', '#FFD02E', '#46D66E', '#35A9FF', '#A662FF'];

/** 接着当前路径追加一颗圆角星（挖洞也用它） */
function addStar(x, cx, cy, R, { points = 5, k = 0.6, tip = 0.24, dent = 0.2, rot = -Math.PI / 2 } = {}) {
  const v = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i * Math.PI) / points, rr = i % 2 ? R * k : R;
    v.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, i % 2 ? dent * R : tip * R]);
  }
  const n = v.length;
  const mx = (v[n - 1][0] + v[0][0]) / 2, my = (v[n - 1][1] + v[0][1]) / 2;
  x.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const a = v[i], b = v[(i + 1) % n];
    x.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, a[2]);
  }
  x.closePath();
}
export function starPath(x, cx, cy, R, shape) { x.beginPath(); addStar(x, cx, cy, R, shape); }

/** 把形状外面涂满，影子落进形状里：内阴影 / 内亮边都这么做 */
function innerShadow(x, cx, cy, R, color, blur, ox, oy, dpr) {
  x.save();
  x.shadowColor = color;
  x.shadowBlur = blur * dpr;
  x.shadowOffsetX = ox * dpr;
  x.shadowOffsetY = oy * dpr;
  x.fillStyle = '#000';
  x.beginPath();
  x.rect(cx - R * 3, cy - R * 3, R * 6, R * 6);
  addStar(x, cx, cy, R);
  x.fill('evenodd');
  x.restore();
}

/** 一颗胖星星 */
export function drawStar(x, cx, cy, R, c, dpr = 2) {
  const depth = R * 0.14;
  x.save();
  x.fillStyle = c.deep;
  for (let i = 3; i >= 1; i--) { starPath(x, cx, cy + (depth * i) / 3, R); x.fill(); }

  starPath(x, cx, cy, R);
  const g = x.createRadialGradient(cx - R * 0.28, cy - R * 0.42, R * 0.05, cx, cy, R * 1.12);
  g.addColorStop(0, c.hi);
  g.addColorStop(0.36, c.mid);
  g.addColorStop(0.8, c.lo);
  g.addColorStop(1, c.deep);
  x.fillStyle = g;
  x.fill();

  x.save();
  starPath(x, cx, cy, R);
  x.clip();
  innerShadow(x, cx, cy, R, c.deep, R * 0.34, -R * 0.04, -R * 0.13, dpr);
  innerShadow(x, cx, cy, R, 'rgba(255,255,255,.85)', R * 0.12, 0, R * 0.07, dpr);
  // 底部透过来的光
  const b = x.createRadialGradient(cx + R * 0.1, cy + R * 0.62, 0, cx + R * 0.1, cy + R * 0.62, R * 0.55);
  b.addColorStop(0, 'rgba(255,255,255,.3)');
  b.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = b;
  x.fillRect(cx - R, cy, R * 2, R);
  // 大块光泽
  x.save();
  x.translate(cx - R * 0.2, cy - R * 0.42);
  x.rotate(-0.42);
  const gl = x.createLinearGradient(0, -R * 0.22, 0, R * 0.22);
  gl.addColorStop(0, 'rgba(255,255,255,.85)');
  gl.addColorStop(1, 'rgba(255,255,255,.08)');
  x.fillStyle = gl;
  x.beginPath();
  x.ellipse(0, 0, R * 0.36, R * 0.17, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
  x.restore();

  x.fillStyle = 'rgba(255,255,255,.95)';
  x.beginPath();
  x.arc(cx + R * 0.1, cy - R * 0.56, R * 0.055, 0, Math.PI * 2);
  x.fill();
  x.restore();
}

/** 彩虹星：六色转轮裁在星星里，中间一团白光 */
function drawRainbowStar(x, cx, cy, R, dpr) {
  x.save();
  const deep = '#4A2A8E';
  x.fillStyle = deep;
  for (let i = 3; i >= 1; i--) { starPath(x, cx, cy + (R * 0.14 * i) / 3, R); x.fill(); }
  x.save();
  starPath(x, cx, cy, R);
  x.clip();
  const n = RAINBOW.length, seg = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * seg - seg / 2, a1 = a0 + seg + 0.02;
    x.fillStyle = RAINBOW[i];
    x.beginPath();
    x.moveTo(cx, cy);
    x.arc(cx, cy, R * 1.5, a0, a1);
    x.closePath();
    x.fill();
  }
  const core = x.createRadialGradient(cx, cy, 0, cx, cy, R * 0.52);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.3, 'rgba(255,255,255,.9)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = core;
  x.fillRect(cx - R, cy - R, R * 2, R * 2);
  innerShadow(x, cx, cy, R, 'rgba(40,10,90,.75)', R * 0.28, -R * 0.03, -R * 0.1, dpr);
  innerShadow(x, cx, cy, R, 'rgba(255,255,255,.95)', R * 0.12, 0, R * 0.07, dpr);
  x.restore();
  x.restore();
}

/** 带点的四角闪光，贴在星星上或者当粒子 */
export function drawSparkle(x, cx, cy, r, color = '#fff') {
  x.save();
  x.fillStyle = color;
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2, rr = i % 2 ? r * 0.2 : r;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i) x.lineTo(px, py); else x.moveTo(px, py);
  }
  x.closePath();
  x.fill();
  x.restore();
}

function arrowShape(x, len, thick, head) {
  // 水平的双头箭头，中心在原点
  x.beginPath();
  x.moveTo(-len, 0);
  x.lineTo(-len + head, -head * 0.82);
  x.lineTo(-len + head, -thick / 2);
  x.lineTo(len - head, -thick / 2);
  x.lineTo(len - head, -head * 0.82);
  x.lineTo(len, 0);
  x.lineTo(len - head, head * 0.82);
  x.lineTo(len - head, thick / 2);
  x.lineTo(-len + head, thick / 2);
  x.lineTo(-len + head, head * 0.82);
  x.closePath();
}

function drawChain(x, x0, y0, x1, y1, links, w) {
  const dx = x1 - x0, dy = y1 - y0, ang = Math.atan2(dy, dx), L = Math.hypot(dx, dy) / links;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < links; i++) {
      const flat = i % 2 === 0;
      if ((pass === 0) === flat) continue;      // 先画侧面的，再画正面的，看起来互相穿过去
      const t = (i + 0.5) / links, px = x0 + dx * t, py = y0 + dy * t;
      x.save();
      x.translate(px, py);
      x.rotate(ang);
      const a = L * 0.68, b = flat ? w * 0.62 : w * 0.2;
      x.lineWidth = w * 0.72;
      x.strokeStyle = '#2E3550';
      x.beginPath(); x.ellipse(0, 0, a, b, 0, 0, Math.PI * 2); x.stroke();
      const g = x.createLinearGradient(0, -b - w * 0.3, 0, b + w * 0.3);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.5, '#C4CCDD'); g.addColorStop(1, '#7E89A3');
      x.lineWidth = w * 0.4;
      x.strokeStyle = g;
      x.beginPath(); x.ellipse(0, 0, a, b, 0, 0, Math.PI * 2); x.stroke();
      x.restore();
    }
  }
}

/* ======================================================================
   贴图缓存：按格子大小和屏幕倍率生成，换尺寸就清空
   ====================================================================== */
export class Art {
  constructor(cs, dpr) {
    this.cs = cs; this.dpr = dpr;
    this.cache = new Map();
    this.S = Math.ceil(cs * 1.5);   // 星星贴图的边长（留出厚度和发光）
    this.R = cs * 0.46;
  }

  sprite(key, size, paint) {
    let c = this.cache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * this.dpr);
    const x = c.getContext('2d');
    x.scale(this.dpr, this.dpr);
    paint(x, size / 2);
    this.cache.set(key, c);
    return c;
  }

  /** 棋子：c 颜色编号，k 种类 */
  piece(c, k = 0) {
    const { S, R, dpr } = this;
    return this.sprite(`p${c}|${k}`, S, (x, m) => {
      const cy = m - R * 0.05;
      if (k === K.RAINBOW) { drawRainbowStar(x, m, m, R * 1.02, dpr); return; }
      const col = COLORS[c];
      drawStar(x, m, cy, R, col, dpr);
      if (k === K.H || k === K.V) {
        // 条纹裁在星星里
        x.save();
        starPath(x, m, cy, R);
        x.clip();
        x.translate(m, cy);
        if (k === K.V) x.rotate(Math.PI / 2);
        x.fillStyle = 'rgba(255,255,255,.34)';
        for (const y of [-R * 0.42, R * 0.42]) { x.fillRect(-R * 1.2, y - R * 0.085, R * 2.4, R * 0.17); }
        x.restore();
      }
    });
  }

  /** 直线星上的白箭头（单独一张，好让它来回动） */
  arrow(c, k) {
    const { S, R } = this;
    return this.sprite(`a${c}|${k}`, S, (x, m) => {
      const col = COLORS[c];
      x.save();
      x.translate(m, m - R * 0.05);
      if (k === K.V) x.rotate(Math.PI / 2);
      x.lineJoin = 'round';
      arrowShape(x, R * 0.98, R * 0.22, R * 0.4);
      x.strokeStyle = col.deep; x.lineWidth = R * 0.14; x.stroke();
      const g = x.createLinearGradient(0, -R * 0.3, 0, R * 0.3);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(1, col.hi);
      x.fillStyle = g; x.fill();
      x.restore();
    });
  }

  /** 爆炸星背后转动的光芒 */
  halo(c) {
    const { S, R } = this;
    return this.sprite(`h${c}`, S, (x, m) => {
      const col = COLORS[c];
      const glow = x.createRadialGradient(m, m, R * 0.3, m, m, S / 2);
      glow.addColorStop(0, col.glow);
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = glow;
      x.beginPath(); x.arc(m, m, S / 2, 0, Math.PI * 2); x.fill();
      x.save();
      x.translate(m, m);
      for (let i = 0; i < 10; i++) {
        x.rotate((Math.PI * 2) / 10);
        x.fillStyle = i % 2 ? 'rgba(255,255,255,.9)' : col.hi;
        x.beginPath();
        x.moveTo(-R * 0.13, -R * 0.68);
        x.lineTo(0, -R * (i % 2 ? 1.2 : 1.36));
        x.lineTo(R * 0.13, -R * 0.68);
        x.closePath();
        x.fill();
      }
      x.restore();
    });
  }

  /** 爆炸星身上的标记：白圈 + 闪光 */
  bombMark(c) {
    const { S, R } = this;
    return this.sprite(`b${c}`, S, (x, m) => {
      const cy = m - R * 0.05, col = COLORS[c];
      x.lineWidth = R * 0.1;
      x.strokeStyle = col.deep;
      x.beginPath(); x.arc(m, cy, R * 0.34, 0, Math.PI * 2); x.stroke();
      const g = x.createRadialGradient(m, cy, 0, m, cy, R * 0.34);
      g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.6, 'rgba(255,255,255,.75)'); g.addColorStop(1, col.hi);
      x.fillStyle = g;
      x.beginPath(); x.arc(m, cy, R * 0.32, 0, Math.PI * 2); x.fill();
      drawSparkle(x, m, cy, R * 0.28, col.lo);
    });
  }

  /** 纯白剪影：消除前闪一下、特效生成时闪一下 */
  flash(k = 0) {
    const { S, R } = this;
    return this.sprite(`w${k}`, S, (x, m) => {
      const cy = k === K.RAINBOW ? m : m - R * 0.05;
      x.fillStyle = '#fff';
      starPath(x, m, cy, R * (k === K.RAINBOW ? 1.02 : 1));
      x.fill();
    });
  }

  /** 冰块：layer 层 */
  ice(layer) {
    const { cs, dpr } = this;
    return this.sprite(`i${layer}`, cs, (x) => {
      const m = cs * 0.03, s = cs - m * 2, rad = cs * 0.16;
      const thick = layer >= 2;
      x.save();
      x.beginPath(); x.roundRect(m, m, s, s, rad);
      const g = x.createLinearGradient(0, m, s * 0.6, m + s);
      if (thick) { g.addColorStop(0, 'rgba(240,250,255,.82)'); g.addColorStop(0.55, 'rgba(180,225,255,.68)'); g.addColorStop(1, 'rgba(130,190,250,.72)'); }
      else { g.addColorStop(0, 'rgba(195,235,255,.52)'); g.addColorStop(0.55, 'rgba(130,200,255,.32)'); g.addColorStop(1, 'rgba(100,170,250,.42)'); }
      x.fillStyle = g;
      x.fill();
      x.clip();
      // 斜着的反光
      x.fillStyle = `rgba(255,255,255,${thick ? 0.5 : 0.3})`;
      x.beginPath();
      x.moveTo(m + s * 0.08, m); x.lineTo(m + s * 0.4, m); x.lineTo(m, m + s * 0.4); x.lineTo(m, m + s * 0.08);
      x.closePath(); x.fill();
      x.beginPath();
      x.moveTo(m + s, m + s * 0.55); x.lineTo(m + s, m + s * 0.72); x.lineTo(m + s * 0.72, m + s); x.lineTo(m + s * 0.55, m + s);
      x.closePath(); x.fill();
      if (thick) {
        // 厚冰：细碎的霜
        x.fillStyle = 'rgba(255,255,255,.65)';
        for (const [a, b, r] of [[0.2, 0.68, 0.035], [0.32, 0.86, 0.025], [0.78, 0.2, 0.03], [0.86, 0.34, 0.022], [0.6, 0.1, 0.02], [0.1, 0.5, 0.02]]) {
          x.beginPath(); x.arc(m + s * a, m + s * b, s * r, 0, Math.PI * 2); x.fill();
        }
      } else {
        // 薄冰：一道裂纹
        x.strokeStyle = 'rgba(255,255,255,.5)';
        x.lineWidth = Math.max(0.7, cs * 0.018);
        x.lineJoin = 'round';
        x.beginPath();
        x.moveTo(m + s * 0.74, m + s * 0.06); x.lineTo(m + s * 0.64, m + s * 0.22); x.lineTo(m + s * 0.76, m + s * 0.33); x.lineTo(m + s * 0.88, m + s * 0.3);
        x.moveTo(m + s * 0.64, m + s * 0.22); x.lineTo(m + s * 0.52, m + s * 0.25);
        x.stroke();
      }
      x.restore();
      x.lineWidth = thick ? Math.max(1.4, cs * 0.04) : Math.max(1, cs * 0.026);
      x.strokeStyle = thick ? 'rgba(255,255,255,.92)' : 'rgba(225,245,255,.7)';
      x.beginPath(); x.roundRect(m + x.lineWidth / 2, m + x.lineWidth / 2, s - x.lineWidth, s - x.lineWidth, rad);
      x.stroke();
      void dpr;
    });
  }

  /** 锁链：交叉的两条 + 中间一把小锁 */
  lock() {
    const { S, cs } = this;
    return this.sprite('lock', S, (x, m) => {
      const a = cs * 0.43, w = cs * 0.095, n = 7;
      drawChain(x, m - a, m - a, m + a, m + a, n, w);
      drawChain(x, m + a, m - a, m - a, m + a, n, w);
      // 小锁
      const lw = cs * 0.28, lh = cs * 0.22, ly = m - lh * 0.28;
      x.lineCap = 'round';
      x.strokeStyle = '#3A3F55'; x.lineWidth = cs * 0.075;
      x.beginPath(); x.arc(m, ly, lw * 0.3, Math.PI, 0); x.stroke();
      x.strokeStyle = '#DDE3EE'; x.lineWidth = cs * 0.038;
      x.beginPath(); x.arc(m, ly, lw * 0.3, Math.PI, 0); x.stroke();
      x.fillStyle = '#7A4A00';
      x.beginPath(); x.roundRect(m - lw / 2 - cs * 0.016, ly - cs * 0.016, lw + cs * 0.032, lh + cs * 0.032, cs * 0.06); x.fill();
      const g = x.createLinearGradient(0, ly, 0, ly + lh);
      g.addColorStop(0, '#FFF0A8'); g.addColorStop(0.5, '#FFC531'); g.addColorStop(1, '#E08A07');
      x.fillStyle = g;
      x.beginPath(); x.roundRect(m - lw / 2, ly, lw, lh, cs * 0.05); x.fill();
      x.fillStyle = '#7A4A00';
      x.beginPath(); x.arc(m, ly + lh * 0.45, cs * 0.024, 0, Math.PI * 2); x.fill();
    });
  }

  /** 棋盘底板 */
  board(C, R) {
    const { cs, dpr } = this;
    const key = `board${C}x${R}`;
    let c = this.cache.get(key);
    if (c) return c;
    const pad = 10;
    c = document.createElement('canvas');
    c.width = Math.ceil((cs * C + pad * 2) * dpr);
    c.height = Math.ceil((cs * R + pad * 2) * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const w = cs * C, h = cs * R;
    // 外框
    x.save();
    x.shadowColor = 'rgba(0,0,20,.55)'; x.shadowBlur = 16 * dpr; x.shadowOffsetY = 6 * dpr;
    x.fillStyle = 'rgba(14,20,72,.92)';
    x.beginPath(); x.roundRect(pad - 5, pad - 5, w + 10, h + 10, 16); x.fill();
    x.restore();
    x.strokeStyle = 'rgba(160,175,255,.3)';
    x.lineWidth = 1.5;
    x.beginPath(); x.roundRect(pad - 5, pad - 5, w + 10, h + 10, 16); x.stroke();
    // 格子
    x.save();
    x.beginPath(); x.roundRect(pad, pad, w, h, 12); x.clip();
    x.fillStyle = 'rgba(6,10,44,.95)';
    x.fillRect(pad, pad, w, h);
    for (let r = 0; r < R; r++) for (let q = 0; q < C; q++) {
      if ((r + q) % 2) continue;
      x.fillStyle = 'rgba(120,140,255,.1)';
      x.fillRect(pad + q * cs, pad + r * cs, cs, cs);
    }
    x.restore();
    c.pad = pad;
    this.cache.set(key, c);
    return c;
  }

  /** 粒子：小碎星 */
  shard(c) {
    const size = Math.ceil(this.cs * 0.42);
    return this.sprite(`s${c}`, size, (x, m) => {
      const col = c >= 0 ? COLORS[c] : { mid: '#fff', hi: '#fff' };
      starPath(x, m, m, size * 0.46, { k: 0.48, tip: 0.1, dent: 0.08 });
      const g = x.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, col.hi); g.addColorStop(1, col.mid);
      x.fillStyle = g; x.fill();
    });
  }

  /** 粒子：闪光 */
  spark() {
    const size = Math.ceil(this.cs * 0.5);
    return this.sprite('spark', size, (x, m) => {
      const g = x.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, 'rgba(255,255,255,.9)');
      g.addColorStop(0.3, 'rgba(255,255,255,.3)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(m, m, m, 0, Math.PI * 2); x.fill();
      drawSparkle(x, m, m, m * 0.95);
    });
  }

  /** 粒子：冰碴 */
  iceBit() {
    const size = Math.ceil(this.cs * 0.3);
    return this.sprite('icebit', size, (x, m) => {
      x.beginPath();
      x.moveTo(m, size * 0.04); x.lineTo(size * 0.92, m * 0.9); x.lineTo(m * 0.9, size * 0.96); x.lineTo(size * 0.08, m);
      x.closePath();
      const g = x.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, 'rgba(255,255,255,.98)'); g.addColorStop(1, 'rgba(150,215,255,.8)');
      x.fillStyle = g; x.fill();
    });
  }

  /** 粒子：一节断掉的链子 */
  chainBit() {
    const size = Math.ceil(this.cs * 0.32);
    return this.sprite('chainbit', size, (x, m) => {
      x.lineWidth = size * 0.2; x.strokeStyle = '#2E3550';
      x.beginPath(); x.ellipse(m, m, size * 0.36, size * 0.2, 0, 0, Math.PI * 2); x.stroke();
      x.lineWidth = size * 0.1; x.strokeStyle = '#D5DCE9';
      x.beginPath(); x.ellipse(m, m, size * 0.36, size * 0.2, 0, 0, Math.PI * 2); x.stroke();
    });
  }
}

/** HUD 上目标的小图标（goal: { type, c }），画到一个小 canvas 上 */
export function goalIcon(goal, px, dpr) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(px * dpr);
  cv.style.width = cv.style.height = `${px}px`;
  const x = cv.getContext('2d');
  x.scale(dpr, dpr);
  const art = new Art(px / 1.14, dpr);
  const off = (px - art.cs) / 2;
  if (goal.type === 'color') {
    drawStar(x, px / 2, px / 2 - 1, px * 0.42, COLORS[goal.c], dpr);
  } else if (goal.type === 'ice') {
    x.drawImage(art.ice(1), off, off, art.cs, art.cs);
    x.drawImage(art.ice(2), off, off, art.cs, art.cs);
  } else {
    const r = px * 0.3;
    drawStar(x, px / 2, px / 2 - 1, r * 1.3, { hi: '#E8ECF5', mid: '#AAB4C8', lo: '#7E89A3', deep: '#58627A' }, dpr);
    const lock = art.lock();
    const S = art.S;
    x.drawImage(lock, (px - S) / 2, (px - S) / 2, S, S);
  }
  return cv;
}
