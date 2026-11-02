// 打罐子的贴图：全部在 canvas 上现画（原创图案），开局时画一次缓存起来。
//   罐子：8 种汽水图案 + 爆炸罐 + 金罐、罐盖、弹孔
//   木头（木板、木马架、木箱、隔层木板）、树皮和年轮、油桶、草地、草丛、枪柄、粒子
import * as THREE from '../_shared/lib/three.module.min.js';
import { rng, CAN_R, CAN_H } from './levels.js';

/* ================================================================ 工具 */
export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function tex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixc = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** 可以无缝平铺的值噪声：x 方向每 px 格、y 方向每 py 格重复一次 */
function noise2(seed) {
  const s0 = Math.imul(seed + 1, 0x9e3779b1);
  const hash = (x, y) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + s0) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const n = (x, y, px = 4096, py = 4096) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    px = Math.max(1, Math.round(px)); py = Math.max(1, Math.round(py));
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = hash(x0, y0), b = hash(x1, y0), c = hash(x0, y1), d = hash(x1, y1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  n.fbm = (x, y, oct, px, py) => {
    let s = 0, amp = 0.5, tot = 0;
    for (let o = 0; o < oct; o++) {
      s += n(x, y, px, py) * amp; tot += amp;
      x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
    }
    return s / tot;
  };
  return n;
}

/** 按像素画：fn(u, v) 返回 [r, g, b] 或 [r, g, b, a]（0~255） */
function pixels(w, h, fn) {
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = fn(x / w, y / h, x, y);
      const i = (y * w + x) * 4;
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p.length > 3 ? p[3] : 255;
    }
  }
  g.putImageData(img, 0, 0);
  c._img = img;            // 留着原始像素，做凹凸图时不用再从画布读回来（读回很慢）
  return c;
}

const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';

/* ================================================================ 罐子的形状 */
// 罐身的轮廓（从底下中间往外、往上），自己做旋转体，贴图 v 按弧长算，图案不会被拉歪
const PROFILE = [
  [0, -0.552], [0.11, -0.561], [0.2, -0.58], [0.25, -0.6], [0.266, -0.61], [0.284, -0.607], [0.303, -0.596],
  [0.32, -0.572], [0.33, -0.535], [0.33, -0.3], [0.33, 0], [0.33, 0.3], [0.33, 0.47], [0.322, 0.502], [0.306, 0.534],
  [0.291, 0.562], [0.285, 0.583], [0.289, 0.597], [0.285, 0.61], [0.272, 0.607], [0.266, 0.592], [0.259, 0.583],
];
export const LID_Y = 0.583;
export const LID_R = 0.259;
const LABEL_FROM = 8, LABEL_TO = 12;   // 轮廓里第几个点到第几个点是印图案的直筒
const arc = [0];
for (let i = 1; i < PROFILE.length; i++) arc.push(arc[i - 1] + Math.hypot(PROFILE[i][0] - PROFILE[i - 1][0], PROFILE[i][1] - PROFILE[i - 1][1]));
const ARC = arc.map((a) => a / arc[arc.length - 1]);
export const CAN_V = { a: ARC[LABEL_FROM], b: ARC[LABEL_TO] };

export function canGeometry(seg = 40) {
  const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r * (CAN_R / 0.33), y * (CAN_H / 1.22)));
  const body = new THREE.LatheGeometry(pts, seg);
  const uv = body.attributes.uv;
  for (let i = 0; i <= seg; i++) for (let j = 0; j < pts.length; j++) uv.setY(i * pts.length + j, ARC[j]);
  // 罐盖：单独一片圆，贴拉环的图
  const lid = new THREE.CircleGeometry(LID_R * (CAN_R / 0.33), seg);
  lid.rotateX(-Math.PI / 2);
  lid.rotateY(Math.PI / 2);
  lid.translate(0, LID_Y * (CAN_H / 1.22), 0);
  const g = mergeGroups([body, lid]);
  body.dispose(); lid.dispose();
  return g;
}

/** 把几个几何体并成一个，每个算一组（对应材质数组） */
function mergeGroups(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  const out = new THREE.BufferGeometry();
  let vo = 0, io = 0;
  list.forEach((g, k) => {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const n = g.index ? g.index.count : g.attributes.position.count;
    for (let i = 0; i < n; i++) idx[io + i] = (g.index ? g.index.getX(i) : i) + vo;
    out.addGroup(io, n, k);
    vo += g.attributes.position.count;
    io += n;
  });
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ================================================================ 罐子图案 */
const LW = 512, LH = 512;
const labelY = () => ({ top: (1 - CAN_V.b) * LH, bot: (1 - CAN_V.a) * LH });

/** 铝罐没印图案的地方：亮银色、有一点竖着的拉丝 */
const silverCache = new Map();
function silver(g, w, h, tint = [222, 226, 232]) {
  const key = tint.join();
  if (silverCache.has(key)) { g.drawImage(silverCache.get(key), 0, 0, w, h); return; }
  const n = noise2(77);
  const c = pixels(w, h, (u, v) => {
    const s = n.fbm(u * 64, v * 2, 2, 64, 2) * 26 - 13;
    const band = Math.sin(v * Math.PI * 9) * 6;
    return [clamp(tint[0] + s + band, 0, 255), clamp(tint[1] + s + band, 0, 255), clamp(tint[2] + s + band, 0, 255)];
  });
  silverCache.set(key, c);
  g.drawImage(c, 0, 0);
}

/** 写字：带描边和一点阴影 */
function text(g, str, x, y, size, fill, { stroke = null, sw = 0, italic = false, weight = 900, shadow = null, spacing = 0 } = {}) {
  g.save();
  g.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  try { g.letterSpacing = `${spacing}px`; } catch {}
  if (shadow) { g.shadowColor = shadow; g.shadowBlur = size * 0.08; g.shadowOffsetY = size * 0.05; }
  if (stroke) { g.lineJoin = 'round'; g.lineWidth = sw; g.strokeStyle = stroke; g.strokeText(str, x, y); }
  g.shadowColor = 'transparent';
  g.fillStyle = fill;
  g.fillText(str, x, y);
  g.restore();
}

/** 两面各一个图标，转到哪边都看得到 */
const twice = (fn) => { fn(LW * 0.25); fn(LW * 0.75); };

const DESIGNS = [
  // 0 樱桃汽水：红底白点
  {
    tint: '#ff6b7d',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b); gr.addColorStop(0, '#e8303f'); gr.addColorStop(1, '#b7162a');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      g.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 16; i++) for (let j = 0; j < 9; j++) {
        const x = (i + (j % 2) * 0.5) * (LW / 16), y = t + 14 + j * ((h - 28) / 8);
        g.beginPath(); g.arc(x, y, 5.5, 0, 7); g.fill();
      }
      twice((x) => {
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, t + h * 0.5, 92, 70, 0, 0, 7); g.fill();
        g.lineWidth = 6; g.strokeStyle = '#ffd3d8'; g.stroke();
        text(g, 'POP', x, t + h * 0.47, 78, '#d81e34', { spacing: 2 });
        text(g, 'CHERRY SODA', x, t + h * 0.66, 15, '#d81e34', { weight: 800, spacing: 2 });
      });
    },
  },
  // 1 海浪：蓝底白色波浪
  {
    tint: '#9fd6ff',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b); gr.addColorStop(0, '#2d86e6'); gr.addColorStop(1, '#1550a8');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const y0 = t + h * (0.18 + k * 0.32);
        for (let x = 0; x <= LW; x += 4) g.lineTo(x, y0 + Math.sin((x / LW) * Math.PI * 6 + k) * 10);
        g.lineWidth = k === 1 ? 4 : 9; g.strokeStyle = k === 1 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.95)'; g.stroke();
      }
      twice((x) => {
        text(g, 'WAVE', x, t + h * 0.5, 72, '#fff', { italic: true, stroke: '#0d3a80', sw: 10 });
      });
    },
  },
  // 2 青柠：绿底黄锯齿
  {
    tint: '#c8ff8a',
    paint(g, t, b) {
      const h = b - t;
      g.fillStyle = '#4fb52c'; g.fillRect(0, t, LW, h);
      g.fillStyle = '#3c9a1e'; g.fillRect(0, t, LW, h * 0.16); g.fillRect(0, b - h * 0.16, LW, h * 0.16);
      g.beginPath();
      const y0 = t + h * 0.62;
      g.moveTo(0, y0);
      for (let i = 0; i <= 16; i++) g.lineTo((i / 16) * LW, y0 + (i % 2 ? -16 : 16));
      g.lineTo(LW, y0 + 60); g.lineTo(0, y0 + 60); g.closePath();
      g.fillStyle = '#ffe14a'; g.fill();
      twice((x) => {
        text(g, 'ZEST', x, t + h * 0.4, 76, '#fff', { stroke: '#2a6e12', sw: 9 });
        g.fillStyle = '#2a6e12';
        text(g, 'LIME · SPARKLING', x, t + h * 0.74, 15, '#2a6e12', { weight: 800, spacing: 1.5 });
      });
    },
  },
  // 3 阳光：橙底大太阳
  {
    tint: '#ffd08a',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b); gr.addColorStop(0, '#ffa12b'); gr.addColorStop(1, '#f2601a');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      twice((x) => {
        const cy = t + h * 0.46;
        g.save(); g.translate(x, cy);
        for (let i = 0; i < 14; i++) {
          g.rotate((Math.PI * 2) / 14);
          g.beginPath(); g.moveTo(-9, -58); g.lineTo(0, -98); g.lineTo(9, -58); g.closePath();
          g.fillStyle = 'rgba(255,224,90,.95)'; g.fill();
        }
        g.beginPath(); g.arc(0, 0, 56, 0, 7); g.fillStyle = '#ffe25a'; g.fill();
        g.restore();
        text(g, 'SUNNY', x, cy + 2, 46, '#fff', { stroke: '#e0561a', sw: 8 });
      });
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, b - h * 0.12, LW, 5);
    },
  },
  // 4 葡萄：紫底泡泡
  {
    tint: '#d8b4ff',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b); gr.addColorStop(0, '#8b4ad6'); gr.addColorStop(1, '#5a2a9e');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      const r = rng(41);
      for (let i = 0; i < 46; i++) {
        const x = r() * LW, y = t + r() * h, rr = 4 + r() * 16;
        for (const dx of [-LW, 0, LW]) { g.beginPath(); g.arc(x + dx, y, rr, 0, 7); g.lineWidth = 2.5; g.strokeStyle = 'rgba(230,205,255,.55)'; g.stroke(); }
      }
      twice((x) => {
        text(g, 'GRAPE', x, t + h * 0.48, 64, '#fff', { stroke: '#3d1478', sw: 10 });
        text(g, 'FIZZY', x, t + h * 0.7, 18, '#f0e0ff', { weight: 800, spacing: 4 });
      });
    },
  },
  // 5 薄荷：青绿竖条纹
  {
    tint: '#b9fff1',
    paint(g, t, b) {
      const h = b - t;
      g.fillStyle = '#10a596'; g.fillRect(0, t, LW, h);
      g.fillStyle = 'rgba(255,255,255,.22)';
      for (let i = 0; i < 32; i++) g.fillRect(i * (LW / 32), t, 5, h);
      g.fillStyle = '#fff'; g.fillRect(0, t + h * 0.33, LW, h * 0.34);
      twice((x) => {
        text(g, 'MINT', x, t + h * 0.5, 62, '#0b8277', { spacing: 3 });
        g.save(); g.translate(x - 104, t + h * 0.5); g.rotate(-0.6);
        g.beginPath(); g.ellipse(0, 0, 13, 24, 0, 0, 7); g.fillStyle = '#26b46a'; g.fill();
        g.restore();
      });
    },
  },
  // 6 蜜桃：粉色渐变
  {
    tint: '#ffd0b0',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b); gr.addColorStop(0, '#ff9db0'); gr.addColorStop(1, '#ffb877');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      twice((x) => {
        const cy = t + h * 0.36;
        g.beginPath(); g.arc(x - 12, cy, 34, 0, 7); g.arc(x + 12, cy, 34, 0, 7);
        const pg = g.createRadialGradient(x - 18, cy - 14, 6, x, cy, 48); pg.addColorStop(0, '#ffd2a0'); pg.addColorStop(1, '#ff6f7d');
        g.fillStyle = pg; g.fill();
        g.beginPath(); g.ellipse(x + 20, cy - 36, 16, 8, -0.5, 0, 7); g.fillStyle = '#3fae5a'; g.fill();
        text(g, 'PEACH', x, t + h * 0.72, 50, '#b8284e', { stroke: '#fff3ea', sw: 8 });
      });
    },
  },
  // 7 柠檬：黄底黑腰带
  {
    tint: '#fff3a0',
    paint(g, t, b) {
      const h = b - t;
      g.fillStyle = '#ffd22e'; g.fillRect(0, t, LW, h);
      g.fillStyle = '#1d1d22'; g.fillRect(0, t + h * 0.36, LW, h * 0.3);
      g.fillStyle = '#fff'; g.fillRect(0, t + h * 0.36 - 5, LW, 3); g.fillRect(0, t + h * 0.66 + 2, LW, 3);
      twice((x) => {
        text(g, 'LEMO', x, t + h * 0.51, 56, '#ffd22e', { spacing: 6 });
        for (const dx of [-70, 70]) {
          g.beginPath(); g.arc(x + dx, t + h * 0.18, 17, 0, 7); g.fillStyle = '#fff6c0'; g.fill();
          g.lineWidth = 3; g.strokeStyle = '#f2b705'; g.stroke();
          for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x + dx, t + h * 0.18); g.lineTo(x + dx + Math.cos(k) * 14, t + h * 0.18 + Math.sin(k) * 14); g.stroke(); }
        }
      });
    },
  },
];
export const LABEL_TINT = DESIGNS.map((d) => d.tint);

function hazard(g, y, hh) {
  g.save();
  g.beginPath(); g.rect(0, y, LW, hh); g.clip();
  g.fillStyle = '#ffcf1f'; g.fillRect(0, y, LW, hh);
  g.fillStyle = '#17171b';
  for (let i = -2; i < 22; i++) {
    const x = i * (LW / 16);
    g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x + 16, y + hh); g.lineTo(x + 16 + hh, y); g.lineTo(x + hh, y); g.closePath(); g.fill();
  }
  g.restore();
}

const SPECIAL = {
  // 爆炸罐：红底、上下黄黑警示条、火焰标志
  b: {
    tint: '#ffb04a',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b); gr.addColorStop(0, '#e3241b'); gr.addColorStop(1, '#a90f0c');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      hazard(g, t, h * 0.17);
      hazard(g, b - h * 0.17, h * 0.17);
      twice((x) => {
        const cy = t + h * 0.5;
        g.beginPath(); g.arc(x, cy, 58, 0, 7); g.fillStyle = '#fff'; g.fill();
        g.beginPath();
        g.moveTo(x, cy - 44);
        g.bezierCurveTo(x + 30, cy - 12, x + 32, cy + 16, x + 22, cy + 30);
        g.bezierCurveTo(x + 12, cy + 44, x - 12, cy + 44, x - 22, cy + 30);
        g.bezierCurveTo(x - 32, cy + 14, x - 24, cy - 6, x - 12, cy - 14);
        g.bezierCurveTo(x - 10, cy - 2, x - 4, cy + 4, x + 2, cy + 2);
        g.bezierCurveTo(x + 6, cy - 14, x + 2, cy - 30, x, cy - 44);
        g.fillStyle = '#ff6a12'; g.fill();
        g.beginPath(); g.ellipse(x, cy + 22, 12, 16, 0, 0, 7); g.fillStyle = '#ffd23a'; g.fill();
        text(g, 'BOOM', x + 128, cy, 40, '#fff', { stroke: '#5e0606', sw: 7 });
        text(g, 'BOOM', x - 128, cy, 40, '#fff', { stroke: '#5e0606', sw: 7 });
      });
    },
  },
  // 金罐：整罐都是金的，压着星星
  g: {
    tint: '#fff1a8',
    paint(g, t, b) {
      const h = b - t;
      const gr = g.createLinearGradient(0, t, 0, b);
      gr.addColorStop(0, '#fff0a0'); gr.addColorStop(0.35, '#f2c440'); gr.addColorStop(0.7, '#c98f17'); gr.addColorStop(1, '#f0c040');
      g.fillStyle = gr; g.fillRect(0, t, LW, h);
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 16; i++) star(g, i * (LW / 16) + 16, t + 18, 7, 7);
      for (let i = 0; i < 16; i++) star(g, i * (LW / 16), b - 18, 7, 7);
      twice((x) => {
        g.save(); g.shadowColor = 'rgba(120,70,0,.5)'; g.shadowBlur = 6; g.shadowOffsetY = 3;
        g.fillStyle = '#fff6cc'; star(g, x, t + h * 0.45, 56, 56);
        g.restore();
        g.fillStyle = '#e9a920'; star(g, x, t + h * 0.45, 40, 40);
        text(g, 'GOLD', x, t + h * 0.8, 26, '#8a5a00', { spacing: 6 });
      });
    },
  },
};
function star(g, x, y, R, _r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? R * 0.45 : R;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

function labelCanvas(design, gold = false) {
  const c = canvas(LW, LH);
  const g = c.getContext('2d');
  silver(g, LW, LH, gold ? [236, 196, 92] : [222, 226, 232]);
  const { top, bot } = labelY();
  g.save(); g.beginPath(); g.rect(0, top, LW, bot - top); g.clip();
  design.paint(g, top, bot);
  // 印刷的边上有一点光泽变化
  const sh = g.createLinearGradient(0, top, 0, bot);
  sh.addColorStop(0, 'rgba(255,255,255,.12)'); sh.addColorStop(0.08, 'rgba(255,255,255,0)'); sh.addColorStop(0.92, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.12)');
  g.fillStyle = sh; g.fillRect(0, top, LW, bot - top);
  g.restore();
  return c;
}

/** 金属度 / 粗糙度：印刷的地方没那么亮 */
function canMR(gold) {
  const c = canvas(4, LH);
  const g = c.getContext('2d');
  const { top, bot } = labelY();
  g.fillStyle = 'rgb(0,56,255)'; g.fillRect(0, 0, 4, LH);                            // 银色：粗糙 0.22、全金属
  g.fillStyle = gold ? 'rgb(0,66,255)' : 'rgb(0,74,36)'; g.fillRect(0, top, 4, bot - top);  // 印刷：粗糙 0.29、金属 0.14
  return c;
}

function lidCanvas() {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  const gr = g.createRadialGradient(m * 0.8, m * 0.7, 10, m, m, m);
  gr.addColorStop(0, '#f2f4f7'); gr.addColorStop(1, '#b9bfc8');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(80,88,100,.35)';
  for (const r of [0.96, 0.9, 0.84]) { g.lineWidth = 3; g.beginPath(); g.arc(m, m, m * r, 0, 7); g.stroke(); }
  // 开口的压线（水滴形）
  g.lineWidth = 3; g.strokeStyle = 'rgba(70,78,90,.5)';
  g.beginPath(); g.ellipse(m, m - 46, 30, 40, 0, 0, 7); g.stroke();
  // 拉环
  g.save(); g.translate(m, m + 14);
  const tg = g.createLinearGradient(-30, -60, 30, 60); tg.addColorStop(0, '#fbfcfe'); tg.addColorStop(1, '#a8b0bb');
  g.fillStyle = tg;
  g.beginPath(); g.roundRect(-30, -64, 60, 112, 28); g.fill();
  g.strokeStyle = 'rgba(60,68,80,.55)'; g.lineWidth = 3; g.stroke();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.roundRect(-17, 8, 34, 30, 14); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.beginPath(); g.roundRect(-17, 8, 34, 30, 14); g.strokeStyle = 'rgba(60,68,80,.6)'; g.stroke();
  g.beginPath(); g.arc(0, -36, 9, 0, 7); g.fillStyle = '#c6ccd4'; g.fill(); g.stroke();
  g.restore();
  return c;
}

function holeCanvas() {
  const S = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  const r = rng(5);
  // 往里翻的一圈碎边
  g.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const rr = m * (0.42 + r() * 0.28);
    g.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr);
  }
  g.closePath();
  const gr = g.createRadialGradient(m - 8, m - 8, 4, m, m, m * 0.7);
  gr.addColorStop(0, '#f6f8fb'); gr.addColorStop(1, '#8f97a3');
  g.fillStyle = gr; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(40,40,46,.6)'; g.stroke();
  g.beginPath();
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rr = m * (0.2 + r() * 0.1);
    g.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr);
  }
  g.closePath(); g.fillStyle = '#0d0d10'; g.fill();
  return c;
}

/* ================================================================ 木头 */
/** 木纹：沿着 x 方向的长条纹，x 方向无缝 */
function woodCanvas(w, h, { seed, base, dark, light, rings = 10, warp = 2.4, knots = 2, weather = 0 }) {
  const n = noise2(seed);
  const B = hex(base), Dk = hex(dark), L = hex(light);
  const r = rng(seed + 9);
  const ks = Array.from({ length: knots }, () => ({ x: r(), y: r(), s: 0.02 + r() * 0.025 }));
  return pixels(w, h, (u, v) => {
    let warpv = n.fbm(u * 4, v * 3, 4, 4, 64) * warp;
    for (const k of ks) {
      let dx = u - k.x; dx -= Math.round(dx);
      const dd = (dx * dx) / (k.s * k.s * 9) + ((v - k.y) * (v - k.y)) / (k.s * k.s * 0.6);
      warpv += Math.exp(-dd) * 1.6;
    }
    const gpos = v * rings + warpv;
    const s = 0.5 + 0.5 * Math.sin(gpos * Math.PI * 2);
    const line = Math.pow(s, 6);
    const fine = n(u * 220, v * 60, 220, 128) * 0.5 + n(u * 512, v * 12, 512, 128) * 0.5;
    let c = mixc(B, L, clamp(n.fbm(u * 2, v * 1.5, 3, 2, 64) * 1.2 - 0.3));
    c = mixc(c, Dk, line * 0.55 + (fine - 0.5) * 0.25);
    for (const k of ks) {
      let dx = u - k.x; dx -= Math.round(dx);
      const d = Math.hypot(dx / (k.s * 1.4), (v - k.y) / (k.s * 0.6));
      if (d < 1) c = mixc(c, Dk, (1 - d) * 0.85);
    }
    if (weather) {
      const gr = n.fbm(u * 30, v * 4, 3, 30, 64);
      c = mixc(c, [150, 148, 140], weather * clamp(gr * 1.4 - 0.3));
    }
    return c;
  });
}

/** 灰度高度图（凹凸用）：直接拿彩色图的亮度 */
function heightOf(c) {
  const w = c.width, h = c.height;
  const out = canvas(w, h);
  const src = c._img ? new ImageData(new Uint8ClampedArray(c._img.data), w, h) : c.getContext('2d').getImageData(0, 0, w, h);
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = clamp(((d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) - 128) * 1.4 + 128, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  out.getContext('2d').putImageData(src, 0, 0);
  return out;
}

function crateCanvas() {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const slat = woodCanvas(512, 96, { seed: 31, base: '#c49a62', dark: '#7b5532', light: '#e1bd85', rings: 3, knots: 1 });
  g.fillStyle = '#3a2716'; g.fillRect(0, 0, S, S);
  // 横着的板条，中间有缝
  for (let i = 0; i < 5; i++) {
    const y = 8 + i * 100;
    const off = (i * 97) % 300;
    g.drawImage(slat, off, 0, 512 - off, 96, 0, y, (512 - off) * (S / 512), 92);
    g.drawImage(slat, 0, 0, off, 96, (512 - off) * (S / 512), y, off * (S / 512), 92);
  }
  // 外框
  const frameV = woodCanvas(512, 64, { seed: 37, base: '#b88b55', dark: '#6e4a28', light: '#d6ad74', rings: 2, knots: 1 });
  g.save();
  const fw = 60;
  g.drawImage(frameV, 0, 0, 512, 64, 0, 0, S, fw);
  g.drawImage(frameV, 0, 0, 512, 64, 0, S - fw, S, fw);
  g.translate(fw, 0); g.rotate(Math.PI / 2);
  g.drawImage(frameV, 0, 0, 512, 64, 0, 0, S, fw);
  g.translate(0, -S + fw);
  g.drawImage(frameV, 0, 0, 512, 64, 0, 0, S, fw);
  g.restore();
  // 斜撑
  g.save(); g.translate(S / 2, S / 2); g.rotate(-Math.PI / 4);
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 10; g.shadowOffsetY = 6;
  g.drawImage(frameV, 0, 0, 512, 64, -S * 0.62, -28, S * 1.24, 56);
  g.restore();
  // 边框的阴影线、钉子
  g.strokeStyle = 'rgba(40,24,10,.6)'; g.lineWidth = 3;
  g.strokeRect(fw, fw, S - fw * 2, S - fw * 2);
  g.strokeRect(1.5, 1.5, S - 3, S - 3);
  for (const [x, y] of [[30, 30], [S - 30, 30], [30, S - 30], [S - 30, S - 30], [S / 2, 30], [S / 2, S - 30], [30, S / 2], [S - 30, S / 2]]) {
    g.beginPath(); g.arc(x, y, 5, 0, 7); g.fillStyle = '#4a4a4f'; g.fill();
    g.beginPath(); g.arc(x - 1.5, y - 1.5, 2, 0, 7); g.fillStyle = '#9a9aa2'; g.fill();
  }
  return c;
}

/* ================================================================ 树桩 */
function barkCanvas() {
  const n = noise2(53);
  return pixels(256, 512, (u, v) => {
    const warp = n.fbm(u * 6, v * 2, 4, 6, 2) * 1.6;
    const ridge = Math.abs(Math.sin((u * 14 + warp) * Math.PI));
    const crack = Math.pow(1 - ridge, 5);
    const fine = n(u * 90, v * 24, 90, 24);
    let c = mixc([118, 92, 70], [158, 132, 104], ridge * 0.8 + fine * 0.3);
    c = mixc(c, [42, 30, 22], crack * 0.9);
    const moss = clamp(n.fbm(u * 4, v * 3 + 7, 3, 4, 3) * 2.2 - 1.15) * clamp(1 - v * 1.3);
    c = mixc(c, [96, 116, 52], moss * 0.7);
    return c;
  });
}
function ringsCanvas() {
  const n = noise2(61);
  return pixels(256, 256, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const a = Math.atan2(dy, dx);
    if (d > 0.97) return [74, 54, 38];
    if (d > 0.88) return mixc([96, 70, 48], [60, 42, 30], n(a * 6 + 20, d * 30, 256, 256));
    const w = n.fbm(Math.cos(a) * 2 + 3, Math.sin(a) * 2 + 3, 3, 128, 128) * 0.12;
    const rr = (d + w) * 17;
    const s = Math.pow(0.5 + 0.5 * Math.sin(rr * Math.PI * 2), 4);
    let c = mixc([222, 184, 132], [196, 150, 98], d * 0.7);
    c = mixc(c, [150, 104, 62], s * 0.6);
    // 两道裂缝
    for (const ca of [0.7, 3.4]) {
      const da = Math.abs((((a - ca) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (da < 0.02 * (1 - d) + 0.004 && d > 0.25) c = mixc(c, [70, 48, 30], 0.85);
    }
    if (d < 0.05) c = mixc(c, [120, 80, 46], 0.7);
    // 晒白
    c = mixc(c, [214, 206, 190], clamp(n.fbm(u * 5, v * 5, 3, 5, 5) - 0.35) * 0.6);
    return c;
  });
}

/* ================================================================ 油桶 */
const DRUM_COLORS = [['#2f62b3', '#1d3f7a'], ['#c0392b', '#7d1f17'], ['#d8a92a', '#8f6a12']];
function drumCanvas(k) {
  const n = noise2(70 + k);
  const A = hex(DRUM_COLORS[k][0]), B = hex(DRUM_COLORS[k][1]);
  const rust = [126, 66, 34], rust2 = [70, 38, 22];
  const c = pixels(512, 256, (u, v) => {
    const streak = n.fbm(u * 40, v * 2, 3, 40, 2);
    let c = mixc(A, B, clamp(streak * 0.7 + v * 0.35));
    const r = n.fbm(u * 8, v * 4, 4, 8, 4);
    const ru = clamp((r - 0.56) * 6) + clamp((v - 0.84) * 6) * clamp(r * 1.8 - 0.4);
    c = mixc(c, mixc(rust, rust2, n(u * 60, v * 30, 60, 30)), clamp(ru) * 0.9);
    // 加强筋那里磨亮了
    for (const rv of [0.33, 0.66]) {
      const d = Math.abs(v - rv);
      if (d < 0.03) c = mixc(c, [186, 182, 176], (1 - d / 0.03) * 0.35 * n(u * 80, v * 9, 80, 9));
    }
    return c;
  });
  const g = c.getContext('2d');
  // 一个白色的喷漆字
  g.save(); g.globalAlpha = 0.85;
  for (const x of [128, 384]) {
    g.beginPath(); g.arc(x, 128, 36, 0, 7); g.lineWidth = 7; g.strokeStyle = '#f2efe6'; g.stroke();
    text(g, String(k * 3 + 4), x, 130, 40, '#f2efe6', { weight: 800 });
  }
  g.restore();
  return c;
}
function drumTopCanvas(k) {
  const S = 256;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  const m = S / 2;
  g.fillStyle = DRUM_COLORS[k][1]; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6; i++) {
    g.beginPath(); g.arc(m, m, m * (0.95 - i * 0.12), 0, 7);
    g.lineWidth = 6; g.strokeStyle = i % 2 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.18)'; g.stroke();
  }
  const r = rng(80 + k);
  for (let i = 0; i < 30; i++) {
    g.beginPath(); g.arc(r() * S, r() * S, 3 + r() * 14, 0, 7);
    g.fillStyle = `rgba(${110 + r() * 30},${55 + r() * 20},30,${0.25 + r() * 0.35})`; g.fill();
  }
  for (const [x, y, rr] of [[m * 0.55, m * 0.6, 16], [m * 1.5, m * 1.35, 11]]) {
    g.beginPath(); g.arc(x, y, rr, 0, 7); g.fillStyle = '#9da3ab'; g.fill();
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
  }
  return c;
}

/* ================================================================ 草地 */
function grassCanvas() {
  const S = 512;
  const n = noise2(91);
  const low = pixels(S / 2, S / 2, (u, v) => {
    const a = n.fbm(u * 4, v * 4, 4, 4, 4);
    const b = n.fbm(u * 16 + 3, v * 16, 3, 16, 16);
    let c = mixc([70, 98, 34], [118, 138, 48], a);
    c = mixc(c, [52, 74, 30], clamp(b * 1.5 - 0.6));
    const dirt = clamp(n.fbm(u * 3 + 5, v * 3 + 1, 4, 3, 3) * 3 - 1.9);
    c = mixc(c, [124, 100, 64], dirt * 0.7);
    return c;
  });
  const base = canvas(S, S);
  const g = base.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(low, 0, 0, S, S);
  const r = rng(92);
  g.lineCap = 'round';
  for (let i = 0; i < 5200; i++) {
    const x = r() * S, y = r() * S;
    const len = 4 + r() * 10, a = -Math.PI / 2 + (r() - 0.5) * 1.2;
    const lt = r();
    const col = lt < 0.5 ? `rgba(${150 + r() * 50},${160 + r() * 40},${60 + r() * 30},.55)` : `rgba(${30 + r() * 20},${54 + r() * 20},${20 + r() * 14},.45)`;
    g.strokeStyle = col; g.lineWidth = 1 + r() * 1.4;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      if (x + dx < -20 || x + dx > S + 20 || y + dy < -20 || y + dy > S + 20) continue;
      g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * len, y + dy + Math.sin(a) * len); g.stroke();
    }
  }
  return base;
}

/** 一丛草（透明底），竖着插在地上 */
function tuftCanvas() {
  const W = 256, H = 256;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const r = rng(101);
  for (let i = 0; i < 70; i++) {
    const x0 = W / 2 + (r() - 0.5) * W * 0.55;
    const hgt = H * (0.35 + r() * 0.6);
    const bend = (r() - 0.5) * W * 0.5;
    const w = 3 + r() * 5;
    const gr = g.createLinearGradient(0, H, 0, H - hgt);
    const lt = 0.6 + r() * 0.4;
    gr.addColorStop(0, `rgb(${40 * lt},${62 * lt},${22 * lt})`);
    gr.addColorStop(1, `rgb(${168 * lt},${176 * lt},${74 * lt})`);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - w, H);
    g.quadraticCurveTo(x0 - w * 0.5 + bend * 0.3, H - hgt * 0.55, x0 + bend, H - hgt);
    g.quadraticCurveTo(x0 + w * 0.5 + bend * 0.3, H - hgt * 0.55, x0 + w, H);
    g.closePath(); g.fill();
  }
  return c;
}

/* ================================================================ 枪 */
function walnutCanvas() {
  const c = woodCanvas(256, 256, { seed: 111, base: '#7a4626', dark: '#3a1d0e', light: '#9c5f35', rings: 7, warp: 3, knots: 0 });
  const g = c.getContext('2d');
  // 防滑菱形纹
  g.save();
  g.beginPath(); g.roundRect(40, 50, 176, 150, 30); g.clip();
  g.strokeStyle = 'rgba(30,14,6,.55)'; g.lineWidth = 2;
  for (let i = -30; i < 30; i++) {
    g.beginPath(); g.moveTo(i * 9, 0); g.lineTo(i * 9 + 256, 256); g.stroke();
    g.beginPath(); g.moveTo(i * 9, 256); g.lineTo(i * 9 + 256, 0); g.stroke();
  }
  g.restore();
  return c;
}

/* ================================================================ 粒子 */
// 2×2 的小图集：0 软圆点、1 一团烟、2 枪口火光、3 星星闪光
function particleAtlas() {
  const S = 256, T = 128;
  const c = canvas(S, S);
  const g = c.getContext('2d');
  // 0
  let gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, T, T);
  // 1 烟：几团软圆叠在一起，最后用一个圆形渐变把边缘抹干净（不会露出方块的边）
  const r = rng(7);
  {
    const tmp = canvas(T, T);
    const tg = tmp.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const x = 64 + (r() - 0.5) * 34, y = 64 + (r() - 0.5) * 34, rr = 16 + r() * 16;
      gr = tg.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      tg.fillStyle = gr; tg.beginPath(); tg.arc(x, y, rr, 0, 7); tg.fill();
    }
    tg.globalCompositeOperation = 'destination-in';
    gr = tg.createRadialGradient(64, 64, 20, 64, 64, 60);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    tg.fillStyle = gr; tg.fillRect(0, 0, T, T);
    g.drawImage(tmp, T, 0);
  }
  // 2 枪口火光：几道尖
  g.save(); g.translate(64, T + 64);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + (r() - 0.5) * 0.3);
    const L = 34 + r() * 26;
    gr = g.createLinearGradient(0, 0, L, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -9); g.lineTo(L, 0); g.lineTo(0, 9); g.closePath(); g.fill();
  }
  gr = g.createRadialGradient(0, 0, 0, 0, 0, 30);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
  g.restore();
  // 3 十字星
  g.save(); g.translate(T + 64, T + 64);
  for (const rot of [0, Math.PI / 2]) {
    g.save(); g.rotate(rot);
    gr = g.createLinearGradient(-60, 0, 60, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-60, -3, 120, 6);
    g.restore();
  }
  gr = g.createRadialGradient(0, 0, 0, 0, 0, 22);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  g.restore();
  return c;
}

/* ================================================================ 汇总 */
/** 一次性画好开局就要用的；油桶、木箱、树桩这些用到再画（或者空闲的时候慢慢画好） */
export function buildArt() {
  const t0 = performance.now();
  const A = { timing: {} };
  const lazy = (k, f) => Object.defineProperty(A, k, {
    configurable: true, enumerable: true,
    get() { const t = performance.now(); const v = f(); A.timing[k] = Math.round(performance.now() - t); Object.defineProperty(A, k, { value: v, enumerable: true }); return v; },
  });
  A.labels = DESIGNS.map((d) => tex(labelCanvas(d)));
  A.boom = tex(labelCanvas(SPECIAL.b));
  A.gold = tex(labelCanvas(SPECIAL.g, true));
  A.canMR = tex(canMR(false), { srgb: false });
  A.goldMR = tex(canMR(true), { srgb: false });
  A.lid = tex(lidCanvas());
  A.hole = tex(holeCanvas());
  A.boomTint = SPECIAL.b.tint;
  A.goldTint = SPECIAL.g.tint;
  A.particles = tex(particleAtlas(), { srgb: false });
  A.timing.cans = Math.round(performance.now() - t0);

  lazy('plankC', () => woodCanvas(512, 128, { seed: 11, base: '#b98d5c', dark: '#6f4b2b', light: '#d9b27f', rings: 6, knots: 2, weather: 0.35 }));
  lazy('plank', () => tex(A.plankC, { repeat: true }));
  lazy('plankBump', () => tex(heightOf(A.plankC), { srgb: false, repeat: true }));
  lazy('horse', () => tex(woodCanvas(512, 128, { seed: 17, base: '#8d7a62', dark: '#4f4236', light: '#a99579', rings: 4, knots: 2, weather: 0.6 }), { repeat: true }));
  lazy('board', () => tex(woodCanvas(512, 64, { seed: 23, base: '#d8b07a', dark: '#94673a', light: '#ecca96', rings: 3, knots: 1 }), { repeat: true }));
  lazy('post', () => tex(woodCanvas(512, 128, { seed: 29, base: '#7d6046', dark: '#3f2c1d', light: '#9a7a58', rings: 5, knots: 2, weather: 0.4 }), { repeat: true }));
  lazy('crate', () => tex(crateCanvas()));
  lazy('barkC', barkCanvas);
  lazy('bark', () => tex(A.barkC, { repeat: true }));
  lazy('barkBump', () => tex(heightOf(A.barkC), { srgb: false, repeat: true }));
  lazy('rings', () => tex(ringsCanvas()));
  for (const k of [0, 1, 2]) {
    lazy(`drum${k}`, () => tex(drumCanvas(k)));
    lazy(`drumTop${k}`, () => tex(drumTopCanvas(k)));
  }
  lazy('grass', () => tex(grassCanvas(), { repeat: true, aniso: 8 }));
  lazy('tuft', () => tex(tuftCanvas()));
  lazy('walnut', () => tex(walnutCanvas()));
  A.ms = Math.round(performance.now() - t0);
  return A;
}

/** 空闲的时候把剩下的贴图一张张画好，用到时就不会卡一下 */
export function warmArt(A, keys = ['plank', 'plankBump', 'horse', 'board', 'grass', 'tuft', 'walnut', 'bark', 'barkBump', 'rings', 'crate', 'post', 'drum0', 'drumTop0', 'drum1', 'drumTop1', 'drum2', 'drumTop2']) {
  const list = keys.slice();
  const next = () => {
    const k = list.shift();
    if (!k) return;
    void A[k];
    setTimeout(next, 30);
  };
  setTimeout(next, 200);
}
